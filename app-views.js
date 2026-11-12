
      let loadedBarSheet = null;
      const loadedBarExpandedWarmups = new Set();
      const loadedBarPrompts = new Map();
      let todayWorkoutChoice = null;
      let todayWorseThanUsual = null;
      let todayPreview = null;

      // Ownership validation and engine access remain in app-coach.js.
      function coachingTargetsForSession(session, model = data) {
        if (!exceptionResolverApi?.resolvePrescriptionChannel) return { visible: false, reason: "channel_unavailable" };
        const exerciseIds = new Set(model.exercises.filter((exercise) => exercise.sessionId === session?.id).map((exercise) => exercise.id));
        return exceptionResolverApi.resolvePrescriptionChannel({
          prescription: session?.coachingPrescription,
          effectiveMode: effectiveCoachMode(model.settings),
          exceptionDecisions: session?.resolvedActions,
          suspensions: session?.coachingSuspensions,
          revisionEnabled: model.settings.coachBetweenSetRevisions,
          actualSetIds: model.sets.filter((set) => exerciseIds.has(set.exerciseId)).map((set) => set.id)
        }, (prescription) => validateSessionCoachingPrescription(session, prescription, model));
      }

      function loadedBarNumber(value) {
        return value == null || String(value).trim() === "" || !Number.isFinite(Number(value)) ? "" : Number(value);
      }

      // The same projection drives placeholders and acceptance. Shadow/off use
      // local targets; Show never substitutes them for a suppressed coach row.
      function loadedBarTargetsForSet(set, exercise, channel = null) {
        const projection = channel || coachingTargetsForSession(sessionById(exercise.sessionId));
        const coached = projection.visible ? projection.exercises.find((item) => item.exerciseId === exercise.id)?.sets.find((row) => row.setId === set.id) : null;
        const target = coached?.target;
        const unit = set.weightUnit || data.settings.weightUnit;
        const rawLoad = loadedBarNumber(target?.load);
        const coachLoad = rawLoad !== "" && ["external", "bodyweight_plus_load"].includes(resistanceTypeFor(exercise, set));
        const coachReps = loadedBarNumber(target?.reps) !== "";
        const localTargets = effectiveCoachMode() !== "show";
        // V1 coaches assisted work's reps only. A visible eligible row can still
        // accept its factual assistance; a suppressed row cannot offer it.
        const factualAssistance = Boolean(coached) && resistanceTypeFor(exercise, set) === "assisted_bodyweight";
        const weight = coachLoad && target.unit && target.unit !== unit
          ? rawLoad * (target.unit === "lb" ? 1 / 2.2046226218 : 2.2046226218) : coachLoad ? rawLoad : localTargets || factualAssistance ? loadedBarNumber(set.targetWeight) : "";
        const reps = coachReps ? Number(target.reps) : localTargets ? loadedBarNumber(set.targetReps ?? (Number(set.targetRepMin) > 0 ? set.targetRepMin : "")) : "";
        return { weight, reps, durationSeconds: reps, distance: reps, coach: Boolean(coached), coachLoad, coachReps, suppressed: !localTargets && !coached, row: coached };
      }

      function promptLoadedBarField(set, field, prompt) {
        loadedBarPrompts.set(set.id, { field, prompt });
        render();
        const action = ({ weight: "set-weight", reps: "set-reps", durationSeconds: "set-duration", distance: "set-distance" })[field];
        const input = Array.from(root.querySelectorAll(`[data-action="${action}"]`)).find((item) => item.dataset.setId === set.id);
        input?.focus();
      }

      function clearLoadedBarPrompt(setId, field = "") {
        const prompt = loadedBarPrompts.get(setId);
        if (!prompt || (field && prompt.field !== field)) return;
        loadedBarPrompts.delete(setId);
        document.getElementById("set-prompt-" + setId)?.remove();
        const row = document.getElementById("set-" + setId);
        row?.querySelectorAll('[aria-invalid="true"]').forEach((input) => {
          input.removeAttribute("aria-invalid");
          input.removeAttribute("aria-describedby");
        });
      }

      function render() {
        const renderStartedAt = performanceNow();
        document.documentElement.classList.toggle("large-text-reflow", usesLargeTextReflow());
        const session = activeSession();
        if (!session) {
          root.innerHTML = '<section class="state loading-state" role="status" aria-live="polite"><div class="state-skeleton" aria-hidden="true"><span class="skeleton skeleton-kicker"></span><span class="skeleton skeleton-title"></span><span class="skeleton skeleton-panel"></span></div><span class="visually-hidden">Loading your training log...</span></section>';
          return;
        }
        if (activeTab === "workout" && !hasActiveWorkout() && !viewingHistorySessionId && !completedSummarySessionId) {
          activeTab = "today";
          window.history.replaceState({ ...(window.history.state || {}), tab: "today" }, "", tabUrl("today"));
        }
        if (templateStartFlow && !data.templates.some((template) => template.id === templateStartFlow.templateId)) templateStartFlow = null;
        if (optionalReadinessFlow?.templateId && !data.templates.some((template) => template.id === optionalReadinessFlow.templateId)) optionalReadinessFlow = null;
        if (optionalReadinessFlow?.sessionId && !data.sessions.some((item) => item.id === optionalReadinessFlow.sessionId)) optionalReadinessFlow = null;
        if (cancelWorkoutFlow && !sessionCanBeDiscarded(data.sessions.find((item) => item.id === cancelWorkoutFlow.sessionId))) cancelWorkoutFlow = null;
        if (historyEditConfirm && !isEditingHistorySession()) historyEditConfirm = "";
        if (loadedBarSheet && (activeTab !== "workout" || !guardWorkoutMutation(loadedBarSheet.mode === "exercise" ? "exercise-menu" : loadedBarSheet.mode === "rpe" ? "rpe-pad" : "set-type-sheet", loadedBarSheet.mode === "exercise" ? { exerciseId: loadedBarSheet.exerciseId } : { setId: loadedBarSheet.setId }, false).allowed)) loadedBarSheet = null;
        const modalOpen = Boolean(templateStartFlow || optionalReadinessFlow || cancelWorkoutFlow || historyEditConfirm || clearDataFlow?.open || loadedBarSheet);
        const dialogKey = activeDialogKey();
        const sameDialogFocus = dialogKey && dialogKey === renderedDialogKey ? focusDescriptorForElement(document.activeElement) : null;
        document.body.classList.toggle("modal-open", modalOpen);
        const viewHtml = measurePerformance("renderView:" + activeTab, renderViewSafely, { tab: activeTab, sessions: data.sessions.length, exercises: data.exercises.length, sets: data.sets.length });
        const shellWorkoutVisible = activeTab === "workout" && hasActiveWorkout() && activeWorkoutId === session.id && !viewingHistorySessionId && !completedSummarySessionId;
        const shellWorkoutDockVisible = shellWorkoutVisible;
        const shellTitle = ({ today: "Today", progress: "Progress", routines: "Routines", settings: "Settings", workout: "Workout" })[activeTab] || "Today";
        const shellActions = activeTab === "routines" || activeTab === "settings"
          ? '<button class="shell-context-action" type="button" data-action="close-secondary-context">Back to Today</button>'
          : activeTab === "workout"
            ? '<button class="shell-context-action" type="button" data-action="close-workout-context">Back to Today</button>'
            : '<div class="shell-context-actions"><button type="button" data-action="open-routines">Routines</button><button type="button" data-action="open-settings">Settings</button></div>';
        const shellContext = shellWorkoutDockVisible
          ? renderActiveSessionHeader(session)
          : '<div class="shell-context"><strong>' + escapeHtml(shellTitle) + '</strong></div>' + shellActions;
        const domStartedAt = performanceNow();
        root.innerHTML = `
          <div class="app-shell">
            <a class="skip-link" href="#main-content" data-action="skip-content" ${modalOpen ? 'tabindex="-1" aria-hidden="true"' : ""}>Skip to main content</a>
            <header class="brand-bar ${shellWorkoutDockVisible ? "active-session-bar" : ""}" ${modalOpen ? 'inert aria-hidden="true"' : ""}>
              ${shellContext}
            </header>
            ${renderOfflineBanner()}
            ${renderUpdateBanner()}
            ${appToast ? '<div class="app-toast" data-severity="' + escapeHtml(appToast.severity) + '" role="status" aria-live="polite"><span class="app-toast-icon" aria-hidden="true">' + ({ success: icon.done, warn: icon.warning, error: icon.delete, info: icon.info }[appToast.severity] || icon.info) + '</span><span>' + escapeHtml(appToast.message) + '</span>' + (appToast.action ? '<button type="button" data-action="' + escapeHtml(appToast.action) + '"' + (appToast.setId ? ' data-set-id="' + escapeHtml(appToast.setId) + '"' : '') + '>' + escapeHtml(appToast.actionLabel || "Undo") + '</button>' : '') + '</div>' : ''}
            <main class="app-main" id="main-content" tabindex="-1" ${modalOpen ? 'inert aria-hidden="true"' : ""}>${ComprehensiveFitnessLoadedBar.renderDefs()}${viewHtml}</main>
            ${activeTab === "workout" ? "" : `<nav class="bottom-nav" aria-label="Main navigation" ${modalOpen ? 'inert aria-hidden="true"' : ""}>
              ${navButton("today", "Today", "workout")}
              ${navButton("progress", "Progress", "review")}
            </nav>`}
            ${renderTemplateStartSheet()}
            ${renderOptionalReadinessSheet()}
            ${renderCancelWorkoutSheet()}
            ${renderHistoryEditConfirmSheet()}
            ${renderClearDataSheet()}
            ${renderLoadedBarSetSheet()}
            ${renderTimerCompleteNotice()}
          </div>
        `;
        window.clearInterval(workoutDurationInterval);
        workoutDurationInterval = shellWorkoutVisible
          ? window.setInterval(updateWorkoutStatusDom, 1000)
          : 0;
        root.querySelectorAll("details[data-disclosure-id]").forEach((details) => {
          const disclosureId = details.dataset.disclosureId;
          if (knownDisclosureIds.has(disclosureId)) details.open = openDisclosureIds.has(disclosureId);
        });
        const chartLiftLabel = root.querySelector('label[for="chart-exercise-search"]');
        if (chartLiftLabel) chartLiftLabel.textContent = "Change lift";
        adaptOverflowingTitleFields();
        fitBrandSubtitle();
        resizeExerciseNameFields();
        if (dialogKey && dialogKey !== renderedDialogKey && !pendingFocusDescriptor) queuePostRenderFocus(activeDialogInitialFocusDescriptor());
        else if (sameDialogFocus && !pendingFocusDescriptor) queuePostRenderFocus(sameDialogFocus);
        renderedDialogKey = dialogKey;
        applyPendingFocus();
        recordPerformance("renderDom:" + activeTab, domStartedAt, { tab: activeTab });
        recordPerformance("renderTotal:" + activeTab, renderStartedAt, { tab: activeTab });
      }

      function resizeExerciseNameFields() {
        root.querySelectorAll(".exercise-name-field, .autosize-title-field").forEach((field) => {
          field.style.height = "auto";
          field.style.height = Math.max(38, field.scrollHeight + 2) + "px";
        });
      }

      function adaptOverflowingTitleFields() {
        if (window.innerWidth > 380) return;
        root.querySelectorAll('input[data-action="session-title"], input[data-action="template-name"]').forEach((input) => {
          if (input.clientWidth <= 0 || input.scrollWidth <= input.clientWidth + 1) return;
          const textarea = document.createElement("textarea");
          for (const attribute of input.attributes) {
            if (attribute.name !== "value") textarea.setAttribute(attribute.name, attribute.value);
          }
          textarea.classList.add("autosize-title-field");
          textarea.rows = 1;
          textarea.value = input.value;
          input.replaceWith(textarea);
        });
      }

      function fitBrandSubtitle() {
        if (usesLargeTextReflow() || window.innerWidth > 380) return;
        const subtitle = root.querySelector(".brand-title small");
        if (!subtitle || subtitle.clientWidth <= 0 || subtitle.scrollWidth <= subtitle.clientWidth + 1) return;
        const fullLabel = subtitle.textContent || "";
        subtitle.setAttribute("aria-label", fullLabel);
        subtitle.title = fullLabel;
        let low = 0;
        let high = fullLabel.length;
        while (low < high) {
          const midpoint = Math.ceil((low + high) / 2);
          subtitle.textContent = fullLabel.slice(0, midpoint).trimEnd() + "…";
          if (subtitle.scrollWidth <= subtitle.clientWidth + 1) low = midpoint;
          else high = midpoint - 1;
        }
        subtitle.textContent = fullLabel.slice(0, low).trimEnd() + "…";
      }

      function renderAfterInteractionFrame() {
        if (interactionRenderFrame) window.cancelAnimationFrame(interactionRenderFrame);
        interactionRenderFrame = window.requestAnimationFrame(() => {
          interactionRenderFrame = 0;
          window.setTimeout(render, 0);
        });
      }

      function updateWorkoutStatusDom() {
        const progress = workoutProgress();
        const dockCompleted = root.querySelector("[data-session-dock-progress]");
        const dockElapsed = root.querySelector("[data-session-dock-elapsed]");
        const currentFocusDescription = root.querySelector("[data-current-focus-description]");
        const currentFocusRemaining = root.querySelector("[data-current-focus-remaining]");
        if (dockCompleted) dockCompleted.textContent = progress.completed + " of " + progress.total + " sets";
        if (dockElapsed) dockElapsed.textContent = loadedBarElapsedLabel(activeWorkoutSession());
        if (currentFocusDescription) currentFocusDescription.textContent = progress.current;
        if (currentFocusRemaining) currentFocusRemaining.textContent = progress.remaining
          ? progress.remaining + " working set" + (progress.remaining === 1 ? " remains" : "s remain")
          : "Review the session, then submit when it is complete";
        root.querySelectorAll("[data-session-dock-track] .seg").forEach((segment, index) => segment.classList.toggle("filled", index < Math.round((progress.completed / Math.max(1, progress.total)) * 10)));
      }

      function renderSetContext(exercise) {
        const exerciseSets = setsForExercise(exercise.id);
        const restSeconds = Number(exercise.restSeconds ?? data.settings.defaultRestSeconds ?? 90);
        return {
          restSeconds,
          coachChannel: coachingTargetsForSession(sessionById(exercise.sessionId)),
          previousSets: exerciseSets.length
            ? measurePerformance("lift:previousPerformance", () => getMostRecentWorkoutSets(exercise.name, {
                excludeSessionId: exercise.sessionId,
                resistanceType: resistanceTypeFor(exercise),
                canonicalExerciseId: exercise.performanceExerciseId || canonicalExerciseId(exercise),
                includeWarmups: true
              }), { exerciseId: exercise.id })
            : [],
          warmupIds: exerciseSets.filter((set) => setTypeSemantics(set).isWarmup).map((set) => set.id),
          workingSetIds: exerciseSets.filter((set) => isWorkingSet(set, "progression")).map((set) => set.id)
        };
      }

      function replaceSetBlockDom(setId, notice = "") {
        const currentBlock = document.getElementById("set-" + setId);
        const set = setById(setId);
        const exercise = set ? exerciseById(set.exerciseId) : null;
        if (!currentBlock || !set || !exercise) return null;
        const focusDescriptor = focusDescriptorForElement(document.activeElement);
        const template = document.createElement("template");
        template.innerHTML = renderSet(set, exercise, renderSetContext(exercise)).trim();
        const replacement = template.content.firstElementChild;
        if (!replacement) return null;
        currentBlock.replaceWith(replacement);
        if (notice) {
          const label = replacement.querySelector(".next-set-banner span:last-child");
          if (label) label.textContent = notice;
        }
        const focusTarget = resolveFocusDescriptor(focusDescriptor);
        if (focusTarget) focusVisibleEnabledElement(focusTarget, { sequential: false });
        return replacement;
      }

      function applyCompletedSetVisual(setId) {
        replaceSetBlockDom(setId);
        updateWorkoutStatusDom();
      }

      function applyCurrentSetVisual(setId, notice = "Current set") {
        replaceSetBlockDom(setId, notice);
        updateWorkoutStatusDom();
      }

      function syncReconcilePromptDom(exerciseId) {
        const slot = root.querySelector('[data-reconcile-slot="' + CSS.escape(exerciseId) + '"]');
        const exercise = exerciseById(exerciseId);
        if (slot && exercise) slot.innerHTML = renderReconcilePrompt(exercise);
      }

      function syncTimerDom() {
        if (!timer) return;
        const bar = root.querySelector('.timer-bar[data-timer-id="' + CSS.escape(timer.id) + '"]') || root.querySelector(".loaded-bar-rest-clamp, .active-session-timer-status > .timer-bar");
        if (!bar) return;
        bar.dataset.timerId = timer.id;
        const stateLabel = bar.querySelector(".timer-rest-copy > span");
        const nextLabel = bar.querySelector(".timer-rest-copy > small");
        const context = bar.querySelector(".timer-context");
        const pause = bar.querySelector('[data-action="toggle-timer"]') || root.querySelector('.active-session-timer-controls [data-action="toggle-timer"]');
        if (stateLabel) stateLabel.textContent = timer.isPaused ? "Paused" : "Rest";
        if (nextLabel) nextLabel.textContent = timerNextContextLabel(timer);
        bar.toggleAttribute("data-paused", timer.isPaused);
        if (context) context.textContent = timerNextContextLabel(timer) + " · " + timerNotificationStatusLabel(timer);
        if (pause) {
          pause.innerHTML = pause.closest(".loaded-bar-rest-clamp, .active-session-timer-controls") ? (timer.isPaused ? "Resume" : "Pause") : (timer.isPaused ? icon.play : icon.pause);
          pause.setAttribute("title", timer.isPaused ? "Resume timer" : "Pause timer");
          pause.setAttribute("aria-label", timer.isPaused ? "Resume timer" : "Pause timer");
        }
        updateTimerDisplay();
      }

      function removeTimerDom(timerSnapshot) {
        const block = document.getElementById("set-" + (timerSnapshot?.setId || ""));
        const bar = root.querySelector('.timer-bar[data-timer-id="' + CSS.escape(timerSnapshot?.id || "") + '"]') || root.querySelector(".active-session-timer-status > .timer-bar");
        bar?.remove();
        block?.classList.remove("resting-set");
      }

      function renderUpdateBanner() {
        if (!updateAvailable && !pendingControllerReload) return "";
        const historyEditing = Boolean(historyEditFlow || historyEditStartPending);
        const workoutActive = hasActiveWorkout();
        const renderRecovery = Boolean(viewRenderError && workoutActive && !historyEditing);
        const message = historyEditing
          ? 'A new app version is ready. Save or discard history edits before updating.'
          : renderRecovery
            ? 'A new app version is ready. Your open workout will be saved before updating.'
            : workoutActive
            ? 'Update available. It will wait while an active workout remains open.'
            : 'A new app version is ready.';
        return '<div class="banner update update-banner" role="status"><span class="b-copy"><b>Update available</b><span>' + message + '</span></span>' + (historyEditing || (workoutActive && !renderRecovery) ? '' : '<button class="b-act" type="button" data-action="apply-update">Update now</button>') + '</div>';
      }

      function renderOfflineBanner() {
        if (navigator.onLine !== false) return "";
        return '<div class="banner offline offline-banner" role="status"><span class="b-copy"><b>Offline</b><span>Workout logging and local changes continue. Background notifications wait for a connection.</span></span><span class="b-act" aria-hidden="true">Local mode</span></div>';
      }

      function navButton(tab, label, iconKey) {
        const active = activeTab === tab;
        return '<button class="nav-button ' + (active ? "active" : "") + '" data-action="set-tab" data-tab="' + tab + '" type="button"' + (active ? ' aria-current="page"' : '') + ' aria-label="' + escapeHtml(label) + '"><span class="nav-icon" aria-hidden="true">' + icon[iconKey] + '</span><span>' + label + '</span></button>';
      }

      function renderView() {
        if (activeTab === "progress") return renderProgress();
        if (activeTab === "routines") return renderTemplates();
        if (activeTab === "settings") return renderS4bSettings();
        if (activeTab === "today") return renderLiftHome();
        return renderWorkout();
      }

      function equipmentCorrectionDisplayName(identity) {
        const candidates = [...data.exercises, ...data.templates.flatMap((routine) => routine.exercises || [])];
        const exercise = candidates.find((item) => coachVariantIdentity(item) === identity);
        return exercise?.name || identity.split("|")[0];
      }

      function renderCoachAndEquipmentSettings() {
        const settings = data.settings;
        const mode = effectiveCoachMode();
        const coach = '<label class="s4b-setting-field"><span>Coach mode</span><select data-action="coach-mode" aria-describedby="coach-activation-help">'
          + '<option value="shadow"' + (mode === 'shadow' ? ' selected' : '') + '>Shadow (learning, targets hidden)</option>'
          + '<option value="off"' + (mode === 'off' ? ' selected' : '') + '>Off</option>'
          + '<option value="show"' + (mode === 'show' ? ' selected' : '') + (COACH_ACTIVATION_APPROVED ? '' : ' disabled') + '>Show coach targets (experimental)</option></select></label>'
          + '<p class="settings-note" id="coach-activation-help">' + (COACH_ACTIVATION_APPROVED ? 'Coach targets are experimental.' : 'Available after the coach is calibrated on your history.') + '</p>'
          + '<label class="s4b-setting-switch toggle-line"><span><b>Between-set changes</b><small>Adjust untouched targets as you log sets when coach targets are shown.</small></span><span class="toggle"><input type="checkbox" role="switch" data-action="coach-between-set-revisions"' + (settings.coachBetweenSetRevisions ? ' checked' : '') + ' /><i></i></span></label>'
          + '<label class="s4b-setting-field"><span>Routine increments are in</span><select data-action="routine-increment-unit" aria-describedby="routine-increment-help">'
          + [['lb', 'lb'], ['kg', 'kg'], ['', 'Not set']].map(([value, label]) => '<option value="' + value + '"' + ((settings.routineIncrementUnit || '') === value ? ' selected' : '') + '>' + label + '</option>').join('')
          + "</select></label><p class=\"settings-note\" id=\"routine-increment-help\">Used for load steps in routines that don't say their unit.</p>";
        const units = ['lb', 'kg'].map((unit) => '<fieldset class="s4b-equipment-unit"><legend>' + unit.toUpperCase() + '</legend>'
          + '<label class="s4b-setting-field"><span>Bar weight (' + unit + ')</span><input type="number" min="0" step="any" inputmode="decimal" value="' + escapeHtml(settings.barWeight[unit]) + '" data-action="equipment-bar-weight" data-unit="' + unit + '" /></label>'
          + '<div class="s4b-plates-label" id="plates-label-' + unit + '">Plates you have (' + unit + ')</div><div class="s4b-plate-chips" role="group" aria-labelledby="plates-label-' + unit + '">'
          + defaultSettings.plateInventory[unit].map((plate) => '<button type="button" data-action="equipment-plate" data-unit="' + unit + '" data-plate="' + plate + '" aria-label="' + plate + ' ' + unit + ' plates" aria-pressed="' + settings.plateInventory[unit].includes(plate) + '">' + plate + '</button>').join('')
          + '</div><button type="button" class="s4b-reset-plates" data-action="equipment-reset-plates" data-unit="' + unit + '" aria-label="Reset ' + unit + ' plates to standard">Reset to standard</button></fieldset>').join('');
        const classLabel = (value) => ({ barbell: 'Barbell', dumbbell: 'Dumbbell', stack: 'Stack', plate_loaded: 'Plate loaded', bodyweight: 'Bodyweight', generic: 'Generic' })[value] || value;
        const corrections = settings.equipmentCorrections.length ? '<ul class="s4b-equipment-corrections">' + settings.equipmentCorrections.map((entry) => {
          const name = equipmentCorrectionDisplayName(entry.exerciseIdentity);
          const identity = escapeHtml(entry.exerciseIdentity);
          return '<li><div class="s4b-correction-name"><b>' + escapeHtml(name) + '</b><span>' + classLabel(entry.equipmentClass) + '</span></div><div class="s4b-correction-actions"><details><summary>Change</summary><label>Equipment for ' + escapeHtml(name) + '<select data-action="equipment-correction-change" data-exercise-identity="' + identity + '">'
            + ComprehensiveFitnessLoadedBar.EQUIPMENT_CLASSES.map((value) => '<option value="' + value + '"' + (entry.equipmentClass === value ? ' selected' : '') + '>' + classLabel(value) + '</option>').join('')
            + '</select></label></details><button type="button" data-action="equipment-correction-reset" data-exercise-identity="' + identity + '" aria-label="Reset equipment for ' + escapeHtml(name) + '">Reset</button></div></li>';
        }).join('') + '</ul>' : "<p class=\"settings-note\">Pick equipment from an exercise's menu during a workout.</p>";
        return renderSettingsGroup('Coach', mode === 'show' ? 'Experimental targets' : mode === 'off' ? 'Off' : 'Shadow · targets hidden', coach, { open: true, id: 's4b-coach-settings', className: 's4b-settings' })
          + renderSettingsGroup('Equipment', 'Bars, plates and corrections', units + '<h3>Equipment corrections</h3>' + corrections, { open: true, id: 's4b-equipment-settings', className: 's4b-settings' });
      }

      function renderS4bSettings() {
        // The base Settings renderer is owned by app-analysis.js. Compose the new
        // sections at its first settings group without changing that module.
        return renderSettings().replace(/<details class="group settings-group/, (group) => renderCoachAndEquipmentSettings() + group);
      }

      function renderViewSafely() {
        try {
          const html = renderView();
          viewRenderError = null;
          return html;
        } catch (firstError) {
          entityIndexCache = null;
          invalidateCompletedAnalysis();
          try {
            const html = renderView();
            viewRenderError = null;
            console.warn("Destination render recovered", { destination: activeTab, code: String(firstError?.name || "RenderError") });
            return html;
          } catch (error) {
            viewRenderError = { destination: activeTab, code: String(error?.name || "RenderError") };
            console.error("Destination render failed", { destination: activeTab, code: viewRenderError.code });
            const updateAction = updateAvailable && !historyEditFlow && !historyEditStartPending
              ? '<button class="secondary-action" type="button" data-action="apply-update">Update app</button>'
              : '';
            return `<section class="view state destination-error" role="alert"><span class="glyph bad destination-error-mark" aria-hidden="true">${icon.warning}</span><div><div class="section-kicker">${escapeHtml(activeTab)}</div><h1>This area could not be opened.</h1><p>Your stored workout data is intact. This is a display fault; Retry rebuilds this view's derived indexes without changing those records. If an app update is ready, save this workout and apply it here.</p><div class="destination-error-actions"><button class="primary-action" type="button" data-action="retry-view-render">Retry</button>${updateAction}</div></div></section>`;
          }
        }
      }

      function renderSessionDock(session, progress, { inert = false } = {}) {
        const durationPaused = Boolean(session.workoutPausedAt);
        return `<aside class="session-dock" aria-label="Workout session controls" ${inert ? 'inert aria-hidden="true"' : ""}>
          <span class="session-dock-progress"><strong data-session-dock-progress>${progress.completed} of ${progress.total} sets</strong><span class="track" data-session-dock-track aria-label="${progress.completed} of ${progress.total} sets completed">${Array.from({ length: 10 }, (_, index) => '<i class="seg ' + (index < Math.round((progress.completed / Math.max(1, progress.total)) * 10) ? 'filled' : '') + '"></i>').join("")}</span><small data-session-dock-elapsed>${escapeHtml(progress.elapsed)}</small><i class="session-dock-elapsed-rule" aria-hidden="true"></i></span>
          <button class="secondary-action session-dock-pause" type="button" data-action="toggle-workout-pause" aria-pressed="${durationPaused ? "true" : "false"}">${durationPaused ? "Resume time" : "Pause time"}</button>
          <button class="primary-action session-dock-finish" type="button" data-action="request-submit-workout">Finish</button>
        </aside>`;
      }

      function renderProgress() {
        return renderLiftProgress();
      }

      function loadedBarElapsedLabel(session) {
        const duration = workoutActiveDurationMs(session);
        return duration === null ? workoutProgress().elapsed : formatTimer(Math.floor(duration / 1000));
      }

      function renderActiveSessionHeader(session) {
        const safety = guardWorkoutMutation("session-deload", { sessionId: session.id }, false);
        return '<div class="active-session-header loaded-bar-session">'
          + '<div class="loaded-bar-session-title"><h1 title="' + escapeHtml(session.title || 'Workout') + '">' + escapeHtml(session.title || 'Workout') + '</h1><span aria-label="Elapsed time" data-session-dock-elapsed>' + escapeHtml(loadedBarElapsedLabel(session)) + '</span></div>'
          + '<label class="loaded-bar-session-deload"><input type="checkbox" role="switch" aria-label="Session deload" data-action="session-deload" data-session-id="' + session.id + '"' + (session.isDeload ? ' checked' : '') + workoutSafetyDisabledAttributes(safety) + ' /><span>Session deload</span></label>'
          + '<button class="secondary-action loaded-bar-finish" type="button" data-action="request-submit-workout">Finish</button>'
          + '<details class="session-overflow active-session-menu"><summary class="icon-button" data-action="session-menu" aria-label="Workout menu">' + icon.more + '</summary><div class="session-overflow-menu"><button type="button" data-action="close-workout-context">' + icon.left + '<span>Back to Today</span></button><button type="button" data-action="log-workout-readiness">' + icon.info + '<span>Log readiness</span></button><button type="button" data-action="toggle-workout-pause" aria-pressed="' + Boolean(session.workoutPausedAt) + '">' + (session.workoutPausedAt ? 'Resume time' : 'Pause time') + '</button><button type="button" data-action="save-template">' + icon.templates + '<span>Save as routine</span></button>' + (sessionCanBeDiscarded(session) ? '<button class="danger" type="button" data-action="request-cancel-workout" data-session-id="' + session.id + '">' + icon.delete + '<span>Cancel workout</span></button>' : '') + '</div></details></div>';
      }

      function liftHomeIsVisible() {
        return activeTab === "today";
      }

      function renderSharedRestStarter(session) {
        if (!session || session.id !== activeWorkoutId || isSessionSubmitted(session)) return "";
        const exerciseIds = new Set(data.exercises.filter((exercise) => exercise.sessionId === session.id).map((exercise) => exercise.id));
        const sessionSets = data.sets.filter((set) => exerciseIds.has(set.exerciseId));
        const completed = sessionSets
          .filter((set) => set.completed && !set.skipped)
          .sort((a, b) => String(a.completedAt || "").localeCompare(String(b.completedAt || "")) || canonicalSetSequence(a) - canonicalSetSequence(b));
        const sourceSet = completed.at(-1);
        const exercise = sourceSet ? exerciseById(sourceSet.exerciseId) : null;
        if (!sourceSet || !exercise) return "";
        const safety = guardWorkoutMutation("start-timer", { exercise, set: sourceSet }, false);
        const seconds = Number(sourceSet.targetRestSeconds || exercise.restSeconds || data.settings.defaultRestSeconds || 90);
        return `<button class="workout-rest-starter secondary-action" type="button" data-action="start-timer" data-exercise-id="${exercise.id}" data-set-id="${sourceSet.id}"${workoutSafetyDisabledAttributes(safety)}>${icon.clock}<span>Start rest</span><strong>${formatTimer(seconds)}</strong></button>`;
      }

      function renderWorkout() {
        const session = activeSession();
        if (!session) return renderLiftHome();
        if (liftHomeIsVisible()) return renderLiftHome();
        if (completedSummarySessionId === session.id) {
          return `
            <section class="view workout-view completed-workout-view">
              ${renderCompletedWorkoutSummary(session)}
            </section>
          `;
        }
        const editingHistory = isEditingHistorySession(session.id);
        const historyReadOnly = isSessionSubmitted(session) && !editingHistory;
        const activeExecution = session.id === activeWorkoutId && hasActiveWorkout() && !isSessionSubmitted(session);
        const addExerciseSafety = guardWorkoutMutation("add-exercise", {}, false);
        if (activeWorkoutId === session.id) ensureActiveSet();
        const progress = workoutProgress();
        const workoutExercises = activeExercises();
        const canReturnToActiveSession = historyReadOnly && hasActiveWorkout() && activeWorkoutId && activeWorkoutId !== session.id;
        const focusExercise = workoutExercises.find((exercise) => exercise.id === workoutFocusExerciseId)
          || workoutExercises.find((exercise) => exercise.id === setById(activeSetId)?.exerciseId) || workoutExercises[0];
        const exerciseHtml = activeExecution && focusExercise ? renderLoadedBarFocus(focusExercise, session)
          : workoutExercises.length ? measurePerformance("lift:exerciseList", () => workoutExercises.map((exercise) => renderExercise(exercise)).join(""), { count: workoutExercises.length }) : "";
        return `
          <section class="view workout-view ${historyReadOnly ? "history-readonly" : ""} ${editingHistory ? "history-editing" : ""} ${activeExecution ? "loaded-bar-workout" : ""}">
            ${activeExecution ? "" : '<section class="active-workout-hero"><div class="workout-heading"><div><div class="section-kicker">Today</div><h1>' + escapeHtml(session.title || "Workout") + '</h1></div><span class="status-pill ' + (isSessionSubmitted(session) ? 'good' : 'neutral') + '">' + (isSessionSubmitted(session) ? 'Logged' : 'Ready') + '</span></div></section>'}
            ${renderResolvedAction(resolvedActionForScope(session, "session"), { session })}
            ${activeExecution ? "" : '<div class="workout-timer-slot" aria-live="polite">' + (timer?.workoutId === session.id ? '' : renderSharedRestStarter(session)) + '</div>'}
            <div class="workout-layout compact-workout-layout">
              <div class="workout-focus-column">
                ${exerciseHtml}
                ${activeExecution ? renderLoadedBarUpNext(workoutExercises, focusExercise?.id) : ""}
                ${renderNotificationPrompt()}
            ${historyReadOnly ? "" : `<details class="compact-disclosure add-exercise-panel">
              <summary>Add exercise <span>${icon.add}</span></summary>
              <div class="disclosure-body">
                <div class="row">
                  <input value="${escapeHtml(addExerciseDraft)}" data-action="add-exercise-draft" placeholder="Exercise name" aria-label="New exercise name" maxlength="256" />
                  <button class="icon-button" type="button" data-action="add-exercise" title="Add exercise"${workoutSafetyDisabledAttributes(addExerciseSafety)}>${icon.add}</button>
                </div>
                <div class="grid two add-exercise-targets" aria-label="Stable targets for new exercise">
                  <label>Working sets<input type="number" min="1" max="20" step="1" value="${addExerciseSetCount}" data-action="add-exercise-set-count" aria-label="Working sets for new exercise" /></label>
                  <label>Target RPE<input type="number" min="1" max="10" step="0.5" value="${addExerciseTargetRpe}" data-action="add-exercise-target-rpe" aria-label="Target RPE for new exercise" /></label>
                  <label>Rep minimum<input type="number" min="1" max="100" step="1" value="${addExerciseRepMin}" data-action="add-exercise-rep-min" aria-label="Minimum repetitions for new exercise" /></label>
                  <label>Rep maximum<input type="number" min="1" max="100" step="1" value="${addExerciseRepMax}" data-action="add-exercise-rep-max" aria-label="Maximum repetitions for new exercise" /></label>
                  <label>Rest seconds<input type="number" min="0" max="3600" step="1" value="${addExerciseRestSeconds || data.settings.defaultRestSeconds || 90}" data-action="add-exercise-rest-seconds" aria-label="Rest seconds for new exercise" /></label>
                </div>
                <div class="muscle-select-grid">
                  <label>Primary muscle<select data-action="add-exercise-primary" aria-label="Primary muscle for new exercise">${muscleOptions(addExercisePrimaryMuscle, true, "Auto classify")}</select></label>
                  <label>Secondary muscle<select data-action="add-exercise-secondary" aria-label="Secondary muscle for new exercise">${muscleOptions(addExerciseSecondaryMuscle, true, "None")}</select></label>
                </div>
              </div>
            </details>`}
            <details class="compact-disclosure">
              <summary>Workout details <span>Edit</span></summary>
              <div class="disclosure-body session-header">
              <div class="row split">
                <select data-action="change-session" aria-label="Workout session">
                  ${workoutSessionOptions(session).map((item) => '<option value="' + item.id + '" ' + (item.id === session.id ? "selected" : "") + '>' + escapeHtml(item.title) + " - " + formatDate(item.date) + '</option>').join("")}
                </select>
              </div>
              <div class="grid two">
                ${usesLargeTextReflow()
                  ? '<textarea class="autosize-title-field" rows="1" maxlength="256" data-action="session-title" aria-label="Workout title">' + escapeHtml(session.title) + '</textarea>'
                  : '<input value="' + escapeHtml(session.title) + '" maxlength="256" data-action="session-title" aria-label="Workout title" />'}
                <input type="date" value="${session.date}" data-action="session-date" aria-label="Workout date" />
              </div>
              <label class="toggle-line"><input type="checkbox" data-action="session-travel" ${session.isTravel ? "checked" : ""} />Travel session</label>
              <textarea data-action="session-notes" maxlength="4096" placeholder="Session notes" aria-label="Session notes">${escapeHtml(session.notes)}</textarea>
              </div>
            </details>
            ${activeExecution ? renderQuickStartTemplates(session.templateId || "") : ""}
            ${editingHistory ? '<section class="history-edit-bar"><div><strong>Editing logged workout</strong><span>Changes remain temporary until you confirm Save Edits. The stored historical grade and algorithm version remain unchanged.</span></div><div class="history-edit-actions"><button class="primary-action" type="button" data-action="request-save-history-edits">Save Edits</button><button class="secondary-action" type="button" data-action="request-cancel-history-edits">Cancel Edits</button></div></section>' : ''}
            ${historyReadOnly && completedSummarySessionId !== session.id ? renderCompletedWorkoutSummary(session, { history: true }) : ''}
            ${historyReadOnly ? '<div class="history-view-actions"><button class="primary-action" type="button" data-action="begin-history-edit">Edit History</button><button class="secondary-action" type="button" data-action="return-to-today">Return to Today</button></div>' : ''}
              </div>
            </div>
            ${pendingSubmitSessionId === session.id ? renderSubmitConfirmation(session) : ""}
            ${canReturnToActiveSession ? '<button class="return-active-session-fab" type="button" data-action="return-to-active-session">Return to active session</button>' : ''}
          </section>
        `;
      }

      function resolvedActionForScope(session, scopeType, exercise = null) {
        const currentDecisions = Array.isArray(session?.resolvedActions) ? session.resolvedActions : [];
        if (currentDecisions[0]?.outcome === "no_action") return null;
        const decisions = currentDecisions.filter((item) => item?.scope?.type === scopeType);
        if (scopeType !== "exercise" || !exercise) return decisions[0]?.outcome === "action" ? decisions[0] : null;
        const identities = new Set([
          exercise.id,
          exercise.performanceExerciseId,
          exercise.researchExerciseId,
          canonicalExerciseId(exercise)
        ].map((value) => String(value || "")).filter(Boolean));
        const latest = decisions.find((item) => identities.has(String(item.scope.exerciseVariantId || ""))) || null;
        return latest?.outcome === "action" ? latest : null;
      }

      function renderResolvedAction(resolvedAction, { session = null, exercise = null } = {}) {
        if (!resolvedAction || resolvedAction.outcome !== "action") return "";
        const code = String(resolvedAction.action?.code || "").trim().toLowerCase().replace(/-/g, "_");
        const category = String(resolvedAction.category || "").trim().toLowerCase();
        const titles = {
          stop: "Stop this workout",
          stop_session: "Stop this workout",
          stop_or_skip_work: "Stop or skip this workout",
          skip: "Skip this workout",
          skip_session: "Skip this workout",
          stop_exercise: "Stop this exercise",
          skip_exercise: "Skip this exercise",
          use_lighter_session: "Use a lighter workout today",
          light_session: "Use a lighter workout today",
          use_lighter_exercise: "Use a lighter approach for this exercise",
          light_exercise: "Use a lighter approach for this exercise",
          reduce_load: "Reduce the load",
          reduce_sets: "Reduce the working sets",
          cap_rpe: "Keep effort below the usual ceiling",
          cap_effort: "Keep effort below the usual ceiling",
          deload: "Use the planned deload",
          time_bounded_deload: "Use the planned deload",
          address_plateau: "Change one variable for this exercise"
        };
        const categoryFallbacks = {
          pain_or_illness: resolvedAction.scope?.type === "exercise" ? "Stop or modify this exercise" : "Stop or modify today’s workout",
          deload: "Use the planned deload",
          readiness: "Use a lighter approach today",
          fatigue: "Use a lighter approach today",
          plateau: "Change one variable for this exercise"
        };
        const reasonCopy = {
          pain: "You recorded pain.",
          explicit_pain: "You recorded pain.",
          explicit_pain_or_injury: "You recorded pain or an injury concern.",
          illness: "You recorded illness.",
          explicit_illness: "You recorded illness.",
          pain_or_illness: "You recorded pain or illness.",
          deload_due: "A time-bounded deload is due.",
          readiness_below_usual: "Today’s readiness is materially below your usual level.",
          poor_readiness: "Today’s readiness is materially below your usual level.",
          meaningfully_poor_readiness: "You marked today’s readiness as meaningfully poor.",
          material_fatigue: "Comparable recent work shows material fatigue.",
          fatigue: "Comparable recent work shows material fatigue.",
          plateau: "Comparable recent work shows a persistent plateau.",
          persistent_plateau: "Comparable recent work shows a persistent plateau."
        };
        const reasons = Array.isArray(resolvedAction.reasonCodes) ? resolvedAction.reasonCodes : [];
        const reason = reasons
          .map((item) => reasonCopy[String(item || "").trim().toLowerCase().replace(/-/g, "_")])
          .find(Boolean)
          || {
            pain_or_illness: "You recorded a safety concern.",
            deload: "A material deload condition applies.",
            readiness: "Today’s recorded readiness warrants a change.",
            fatigue: "Comparable recent work warrants a temporary change.",
            plateau: "Comparable recent work warrants one focused change."
          }[category]
          || "A material exception warrants this change.";
        const scope = resolvedAction.scope?.type === "exercise"
          ? exercise?.name || "One exercise"
          : session?.title || "This workout";
        const pending = resolvedAction.handling === "pending";
        const safetyCopy = category === "pain_or_illness"
          ? '<p class="resolved-action-caution">This is not a diagnosis, and the app cannot determine whether continuing is safe.</p>'
          : "";
        const choices = pending && category === "pain_or_illness"
          ? '<div class="resolved-action-choices" aria-label="Choose how to handle this warning"><button class="danger-button" type="button" data-action="handle-resolved-action" data-decision-id="' + escapeHtml(resolvedAction.decisionId) + '" data-choice="stop">Stop</button><button class="secondary-action" type="button" data-action="handle-resolved-action" data-decision-id="' + escapeHtml(resolvedAction.decisionId) + '" data-choice="modify">Modify workout</button><button type="button" data-action="handle-resolved-action" data-decision-id="' + escapeHtml(resolvedAction.decisionId) + '" data-choice="continue">Continue</button></div>'
          : pending && category === "readiness"
            ? '<div class="resolved-action-choices" aria-label="Choose how to handle this readiness change"><button class="secondary-action" type="button" data-action="handle-resolved-action" data-decision-id="' + escapeHtml(resolvedAction.decisionId) + '" data-choice="lighter">Use lighter work</button><button type="button" data-action="handle-resolved-action" data-decision-id="' + escapeHtml(resolvedAction.decisionId) + '" data-choice="continue">Continue as planned</button></div>'
            : resolvedAction.handling !== "pending"
              ? '<small class="resolved-action-handling">' + escapeHtml(category === "pain_or_illness"
                  ? ({ accepted: "Stop recorded.", modified: "Workout modification recorded.", overridden: "Decision to continue recorded." })[resolvedAction.handling] || "Response recorded."
                  : ({ accepted: "Lighter work recorded.", overridden: "Decision to continue as planned recorded." })[resolvedAction.handling] || "Response recorded.") + '</small>'
              : "";
        return '<article class="recommendation resolved-action-card ' + escapeHtml(category || "change") + '" role="status"><span>' + escapeHtml(scope) + '</span><h2>' + escapeHtml(titles[code] || categoryFallbacks[category] || "Adjust today’s workout") + '</h2><p>' + escapeHtml(reason) + '</p>' + safetyCopy + choices + '</article>';
      }

      function recoveryForWorkoutStart(templateId, recovery = defaultRecovery()) {
        const worse = todayWorseThanUsual?.date === todayIso() && todayWorseThanUsual.routineId === templateId;
        return cleanRecovery({ ...recovery, ...(worse ? { readinessDeviation: "meaningfully_poor" } : {}) });
      }

      function chooseTodayWorkout(routineId) {
        if (historyEditFlow || hasActiveWorkout() || !data.templates.some((routine) => routine.id === routineId)) return false;
        todayWorkoutChoice = { routineId, date: todayIso() };
        todayPreview = null;
        render();
        return true;
      }

      function setTodayWorseThanUsual(routineId, checked) {
        if (typeof checked !== "boolean" || historyEditFlow || hasActiveWorkout() || !data.templates.some((routine) => routine.id === routineId)) return false;
        todayWorseThanUsual = checked ? { routineId, date: todayIso() } : null;
        render();
        return true;
      }

      // D7: inert until Google Health supplies validated observations and their contract.
      // Do not infer wearable data from manual recovery or introduce a stored shape here.
      function renderTodayLastNight() { return ""; }

      function plannedWorkoutPreview(template, recovery = defaultRecovery()) {
        const current = activeSession();
        const replaceCurrent = current && current.date === todayIso() && current.source !== "strong" && !isSessionSubmitted(current);
        const session = { ...(replaceCurrent ? current : createSession(template.name, { started: true })),
          title: template.name, templateId: template.id, submitted: false, submittedAt: "", workoutStarted: true, workoutState: "active",
          recovery: recoveryForWorkoutStart(template.id, recovery) };
        session.resolvedActions = resolveWorkoutExceptions(session, session.recovery);
        const plan = buildWorkoutStartPlan(template, session);
        const replacedExerciseIds = new Set(data.exercises.filter((exercise) => exercise.sessionId === session.id).map((exercise) => exercise.id));
        let model = { ...data, sessions: [...data.sessions.filter((item) => item.id !== session.id), session],
          exercises: [...data.exercises.filter((exercise) => exercise.sessionId !== session.id), ...plan.exercises],
          sets: [...data.sets.filter((row) => !replacedExerciseIds.has(row.exerciseId)), ...plan.sets] };
        // No evaluation at all while hidden. The adapter returns a temporary model;
        // it is never assigned to data, committed, saved, or made an active draft.
        if (effectiveCoachMode() === "show") model = prescribeSessionCoaching(model, session.id, template, { preview: true });
        const projectedSession = model.sessions.find((item) => item.id === session.id);
        return { session: projectedSession, exercises: plan.exercises,
          sets: model.sets.filter((row) => plan.exercises.some((exercise) => exercise.id === row.exerciseId)),
          channel: coachingTargetsForSession(projectedSession, model) };
      }

      function openPlannedWorkoutPreview(routineId, date = todayIso()) {
        if (historyEditFlow || hasActiveWorkout() || !data.templates.some((routine) => routine.id === routineId)) return false;
        const next = nextScheduledWorkoutOccurrence(data, new Date(todayIso() + "T12:00:00"));
        if (date !== todayIso() && !(next?.date === date && next.routines.some((routine) => routine.id === routineId))) return false;
        todayPreview = { routineId, date };
        queuePostRenderFocus(actionFocusDescriptor("close-planned-preview"));
        render();
        return true;
      }

      function plannedRowsForExercise(preview, exercise) {
        return preview.sets.filter((row) => row.exerciseId === exercise.id && !setTypeSemantics(row).isWarmup)
          .sort((left, right) => canonicalSetSequence(left) - canonicalSetSequence(right));
      }

      function plannedStartSummary(preview, exercise) {
        const rows = plannedRowsForExercise(preview, exercise);
        const targets = rows.map((row) => loadedBarTargetsForSet(row, exercise, preview.channel));
        const type = resistanceTypeFor(exercise);
        const reps = targets.map((target) => target.reps === "" ? "—" : formatLoadNumber(target.reps)).join(" · ");
        const unit = rows[0]?.weightUnit || data.settings.weightUnit;
        const load = targets[0]?.weight;
        if (["duration", "distance"].includes(type)) return reps + (type === "duration" ? " sec" : " m");
        if (type === "bodyweight") return reps + " reps";
        if (targets.some((target) => target.weight !== load)) return targets.map((target) =>
          (target.weight === "" ? "—" : formatLoadNumber(target.weight) + " " + unit) + " × " + (target.reps === "" ? "—" : target.reps)).join(" · ");
        return reps + " reps" + (load == null || load === "" ? "" : " at " + formatLoadNumber(load) + " " + unit);
      }

      function renderTodayReadiness(template) {
        const checked = todayWorseThanUsual?.routineId === template.id && todayWorseThanUsual.date === todayIso();
        return '<label class="s4b-worse toggle-line"><span><strong>Worse than usual</strong><small>'
          + (effectiveCoachMode() === "show" ? 'No increases, and one set fewer per lift.' : 'Saved with this workout.')
          + '</small></span><span class="toggle ' + (checked ? 'on' : '') + '"><input type="checkbox" role="switch" data-action="today-worse-than-usual" data-routine-id="' + escapeHtml(template.id) + '" ' + (checked ? 'checked' : '') + ' /><i></i></span></label>';
      }

      function renderPlannedWorkoutCard(template) {
        const preview = plannedWorkoutPreview(template);
        const date = new Date(todayIso() + "T12:00:00");
        const kicker = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short" }).format(date);
        const skipped = (data.skippedSessions || []).some((skip) => skip.routineId === template.id && skip.date === todayIso());
        return '<section class="s4b-planned" aria-labelledby="s4b-routine-title"><div class="section-kicker">' + escapeHtml(kicker) + ' · Planned</div>'
          + '<h1 id="s4b-routine-title">' + escapeHtml(template.name) + '</h1>'
          + (template.subtitle || template.notes ? '<p class="s4b-subtitle">' + escapeHtml(template.subtitle || template.notes) + '</p>' : '')
          + renderTodayLastNight()
          + '<button class="s4b-exercise-list loaded-bar-up-next" type="button" data-action="preview-planned-workout" data-routine-id="' + escapeHtml(template.id) + '" data-date="' + todayIso() + '" aria-label="Preview ' + escapeHtml(template.name) + '">'
          + preview.exercises.map((exercise) => {
            const rows = plannedRowsForExercise(preview, exercise);
            const equipment = loadedBarEquipmentForSet(exercise, rows[0], preview.channel);
            return '<span class="s4b-planned-row">' + ComprehensiveFitnessLoadedBar.renderEquipment({ ...equipment, size: "row" })
              + '<span class="s4b-planned-copy"><strong>' + escapeHtml(exercise.name) + '</strong><small>' + escapeHtml(plannedStartSummary(preview, exercise))
              + '</small></span><span class="s4b-set-count">' + rows.length + '<small>sets</small></span></span>';
          }).join('') + '<span class="s4b-preview-label">Preview workout ›</span></button>'
          + renderTodayReadiness(template)
          + '<div class="s4b-start-actions"><button class="primary-action today-primary-action" type="button" data-action="start-template" data-template-id="' + escapeHtml(template.id) + '">Start</button>'
          + (skipped ? '' : '<button class="s4b-injury-skip" type="button" data-action="record-injury-skip" data-routine-id="' + escapeHtml(template.id) + '" data-date="' + todayIso() + '">Injured — skip</button>') + '</div>'
          + '<p class="s4b-skip-footnote">Skipping for injury is not a failure and not a missed session.</p>'
          + '<button class="s4b-readiness-link" type="button" data-action="log-template-readiness" data-template-id="' + escapeHtml(template.id) + '">Log readiness (optional)</button></section>';
      }

      function renderTodaySkipStatus(skips) {
        if (!skips.length) return '';
        return '<div class="s4b-skips" role="status">' + skips.map((skip) => '<p>' + escapeHtml(skip.routineName || data.templates.find((template) => template.id === skip.routineId)?.name || 'Workout')
          + ' skipped · injured <button type="button" data-action="undo-injury-skip" data-skip-id="' + escapeHtml(skip.id) + '">Undo</button></p>').join('') + '</div>';
      }

      function renderTodayWorkoutChooser(templates = data.templates) {
        return '<section class="today-workout-chooser" aria-labelledby="choose-workout-heading"><div><h2 id="choose-workout-heading">Choose your workout</h2><p>Select a workout to load today’s session.</p></div>'
          + (templates.length ? '<div class="today-workout-list">' + templates.map((template) => '<div class="s4b-chooser-option"><button class="today-workout-option" type="button" data-action="start-template" data-template-id="' + escapeHtml(template.id) + '"><span><strong>'
            + escapeHtml(template.name) + '</strong><small>' + template.exercises.length + ' lifts · ' + templateExerciseCount(template) + ' working sets</small></span><b>Start ›</b></button><button class="s4b-plan-choice" type="button" data-action="plan-today-workout" data-routine-id="'
            + escapeHtml(template.id) + '">Preview / injury skip</button></div>').join('') + '</div>' : '<button class="primary-action today-primary-action" type="button" data-action="open-routines">Create a workout routine</button>') + '</section>';
      }

      function renderPlannedWorkoutPreview() {
        const template = data.templates.find((routine) => routine.id === todayPreview?.routineId);
        if (!template) { todayPreview = null; return ''; }
        const preview = plannedWorkoutPreview(template);
        const date = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short" }).format(new Date(todayPreview.date + "T12:00:00"));
        const api = ComprehensiveFitnessLoadedBar;
        return '<section class="view s4b-preview"><button type="button" data-action="close-planned-preview">Back to Today</button><div class="section-kicker">Planned · ' + escapeHtml(date) + ' · ' + escapeHtml(template.name) + '</div>'
          + preview.exercises.map((exercise) => {
            const rows = plannedRowsForExercise(preview, exercise);
            const equipment = loadedBarEquipmentForSet(exercise, rows[0], preview.channel);
            const reason = preview.channel.visible ? preview.channel.exercises.find((item) => item.exerciseId === exercise.id)?.reasonText : null;
            return '<article class="s4b-preview-exercise"><h2>' + escapeHtml(exercise.name) + '</h2><section class="loaded-bar-equipment' + (equipment.load ? ' has-plates' : '') + (equipment.tooHeavyToDraw ? ' undrawable-load' : '') + '">'
              + api.renderEquipment({ ...equipment, size: 'hero', collar: reason ? 'flag' : 'steel' })
              + (equipment.target === null ? '' : '<div class="loaded-bar-total">' + escapeHtml(api.formatLoad(equipment.target)) + '<small>' + equipment.unit.toUpperCase() + '</small></div>')
              + (equipment.load ? '<div class="loaded-bar-per-side"><span>Each side</span><strong>' + escapeHtml(api.perSideText(equipment.load.perSide) || 'No plates') + '</strong></div>' : '') + '</section>'
              + (equipment.load?.note || equipment.note ? '<p class="loaded-bar-load-note">' + escapeHtml(equipment.load?.note || equipment.note) + '</p>' : '')
              + (reason ? '<p class="loaded-bar-collar-tag">' + escapeHtml(reason) + '</p>' : '')
              + '<div class="s4b-preview-table" role="table" aria-label="Planned sets for ' + escapeHtml(exercise.name) + '"><div role="row"><span role="columnheader">Set</span><span role="columnheader">Previous</span><span role="columnheader">' + equipment.unit.toUpperCase() + '</span><span role="columnheader">Reps</span><span role="columnheader">RPE</span></div>'
              + rows.map((row, index) => {
                const target = loadedBarTargetsForSet(row, exercise, preview.channel);
                const previous = row.previousComparableSet;
                const type = resistanceTypeFor(exercise, row);
                const previousRpe = loadedBarNumber(previous?.rpe);
                const noLoad = ['duration', 'distance', 'bodyweight'].includes(type);
                const previousText = previous ? (noLoad ? '' : formatLoadNumber(resistanceLoad(previous, type, equipment.unit)) + ' × ')
                  + (type === 'duration' ? previous.durationSeconds ?? previous.reps : type === 'distance' ? previous.distance ?? previous.reps : previous.reps)
                  + (previousRpe === '' ? '' : ' @ ' + previousRpe) : '—';
                return '<div role="row"><span role="cell">' + (index + 1) + '</span><span role="cell" class="s4b-preview-previous">' + escapeHtml(previousText) + '</span><span role="cell">'
                  + (noLoad || target.weight === '' ? '—' : escapeHtml(formatLoadNumber(target.weight))) + '</span><span role="cell">' + (target.reps === '' ? '—' : escapeHtml(formatLoadNumber(target.reps)))
                  + '</span><span role="cell" aria-label="RPE left empty"></span></div>';
              }).join('') + '</div></article>';
          }).join('') + '<p class="s4b-preview-note">Targets are computed when you press Start.</p><button class="primary-action today-primary-action" type="button" data-action="start-template" data-template-id="'
          + escapeHtml(template.id) + '">Start</button></section>';
      }

      function renderLiftHome() {
        const nextTemplate = expectedWorkoutTemplate(data, new Date(todayIso() + "T12:00:00"));
        const running = activeWorkoutSession();
        if (running) {
          const exerciseIds = new Set(data.exercises.filter((exercise) => exercise.sessionId === running.id).map((exercise) => exercise.id));
          const workSets = data.sets.filter((set) => exerciseIds.has(set.exerciseId) && isWorkingSet(set));
          const completed = workSets.filter((set) => set.completed && !set.skipped).length;
          return `
            <section class="view lift-home-view">
              <div class="workout-heading today-heading"><div><div class="section-kicker">${escapeHtml(new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(todayIso() + "T12:00:00")))}</div><h1>Today</h1></div><span class="status-pill inside">In progress</span></div>
              ${renderResolvedAction(resolvedActionForScope(running, "session"), { session: running })}
              <section class="coach-lead today-coach">
                <div class="section-kicker">Workout in progress</div>
                <h2>${escapeHtml(running.title || "Current workout")}</h2>
                <p>${completed} of ${workSets.length} working sets logged. Your draft is saved on this device.</p>
                <div class="module-action-row"><button class="primary-action today-primary-action" type="button" data-action="resume-active-workout">Resume</button></div>
              </section>
              ${renderQuickStartTemplates(running.templateId || "")}
            </section>`;
        }
        if (todayPreview) return renderPlannedWorkoutPreview();
        const skips = (data.skippedSessions || []).filter((skip) => skip.date === todayIso());
        const chosen = todayWorkoutChoice?.date === todayIso() ? data.templates.find((routine) => routine.id === todayWorkoutChoice.routineId) : null;
        const planned = skips.length ? null : chosen || nextTemplate;
        const next = skips.length ? nextScheduledWorkoutOccurrence(data, new Date(todayIso() + "T12:00:00")) : null;
        return `
          <section class="view lift-home-view s4b-today">
            ${renderTodaySkipStatus(skips)}
            ${planned ? renderPlannedWorkoutCard(planned) : '<div class="workout-heading today-heading"><h1>Today</h1></div>'}
            ${next ? '<section class="s4b-next" aria-label="Next scheduled workout">' + next.routines.map((routine) => '<button type="button" data-action="preview-planned-workout" data-routine-id="' + escapeHtml(routine.id) + '" data-date="' + next.date + '">Next: ' + escapeHtml(routine.name) + ' · ' + escapeHtml(new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(next.date + 'T12:00:00'))) + '</button>').join('') + '</section>' : ''}
            ${planned || next ? renderQuickStartTemplates(planned?.id || '') : renderTodayWorkoutChooser()}
            ${renderRollingHypertrophyCard(rollingHypertrophySummary())}
          </section>`;
      }

      function renderRollingHypertrophyCard(summary) {
        const score = summary.score == null ? "—" : summary.score;
        const countLabel = summary.sessionCount === 10 ? "Across your last 10 completed sessions" : "Across your " + summary.sessionCount + " available completed session" + (summary.sessionCount === 1 ? "" : "s");
        const aria = summary.score == null
          ? "Rolling hypertrophy score unavailable. Open exercise progress."
          : "Rolling hypertrophy score " + summary.score + " out of 100 across " + summary.sessionCount + " completed sessions. Open exercise progress.";
        return '<button class="rolling-hypertrophy-card" type="button" data-action="open-rolling-hypertrophy" aria-label="' + escapeHtml(aria) + '"><span class="section-kicker">Rolling hypertrophy</span><strong class="rolling-score">' + score + '<small>/100</small></strong><span class="rolling-window">' + escapeHtml(countLabel) + '</span><span class="rolling-info" aria-hidden="true">i</span></button><p class="rolling-helper">Each distinct lift with a valid canonical score counts once. Incomplete sessions and missing scores are excluded.</p>';
      }

      function workoutProgress() {
        const session = activeSession();
        const exercises = activeExercises();
        const running = Boolean(session && session.id === activeWorkoutId && hasActiveWorkout());
        const visibleTimer = timer?.workoutId === session?.id ? timer : null;
        const workSets = exercises.flatMap((exercise) => setsForExercise(exercise.id).filter((set) => isWorkingSet(set)));
        const activeSet = data.sets.find((set) => set.id === activeSetId);
        const activeExercise = activeSet ? exercises.find((exercise) => exercise.id === activeSet.exerciseId) : null;
        const waitingSet = visibleTimer ? data.sets.find((set) => set.id === visibleTimer.pendingNextSetId) : null;
        const waitingExercise = waitingSet ? exercises.find((exercise) => exercise.id === waitingSet.exerciseId) : null;
        const activeDurationMs = workoutActiveDurationMs(session);
        const elapsedMinutes = activeDurationMs == null ? null : Math.max(0, Math.floor(activeDurationMs / 60000));
        const remaining = workSets.filter((set) => !set.completed && !set.skipped).length;
        const currentLabel = visibleTimer && waitingSet
          ? "Rest - " + (waitingExercise?.name || "Next set") + " · Set " + (waitingSet.isWarmup ? "WU" : waitingSet.setNumber)
          : activeExercise && activeSet
            ? activeExercise.name + " · Set " + (activeSet.isWarmup ? "WU" : activeSet.setNumber)
            : workSets.length > 0 && remaining === 0 ? "Workout ready to submit" : "Plan ready";
        return {
          current: currentLabel,
          completed: workSets.filter((set) => set.completed).length,
          total: workSets.length,
          remaining,
          elapsed: running
            ? elapsedMinutes == null
              ? "Duration starts when resumed"
              : (elapsedMinutes < 60 ? elapsedMinutes + "m " + (session.workoutPausedAt ? "paused" : "active") : Math.floor(elapsedMinutes / 60) + "h " + (elapsedMinutes % 60) + "m " + (session.workoutPausedAt ? "paused" : "active"))
            : isSessionSubmitted(session) ? "Workout logged" : "Not started"
        };
      }

      function renderNotificationPrompt() {
        if (!isStandalonePwa() && !data.settings.installGuideDismissed) {
          return '<div class="notification-prompt install-prompt"><div><strong>Install on iPhone</strong><span>In Safari, tap Share, choose Add to Home Screen, enable Open as Web App when shown, then tap Add.</span></div><button type="button" data-action="dismiss-install-guide">Got it</button></div>';
        }
        const alerts = restAlertState();
        const denied = alerts.permissionStatus === "denied";
        const detail = alerts.lockScreenReady
          ? "Lock-screen rest alerts are active for this installed app."
          : denied
            ? "Permission is denied in iPhone or browser settings. Foreground alerts remain available."
            : "Enable alerts so the app can tell you when rest ends while your iPhone is locked or another app is open.";
        return '<div class="notification-prompt rest-alert-control ' + (alerts.lockScreenReady ? 'selected' : '') + ' ' + (denied ? 'denied' : '') + '"><div><strong>Rest notifications</strong><span>' + escapeHtml(detail) + '</span></div><button class="alert-toggle-button ' + (alerts.lockScreenReady ? 'selected-control' : '') + '" type="button" data-action="toggle-rest-notifications" ' + (denied ? 'aria-label="Rest notification permission denied"' : '') + '>' + (alerts.lockScreenReady ? '&#10003; Enabled' : denied ? 'Permission denied' : alerts.notificationsEnabled ? 'Finish setup' : 'Enable') + '</button></div>';
      }

      function sessionWorkoutFacts(session) {
        const exercises = data.exercises.filter((exercise) => exercise.sessionId === session.id).sort((a, b) => a.order - b.order);
        const exerciseIds = new Set(exercises.map((exercise) => exercise.id));
        const sets = data.sets.filter((set) => exerciseIds.has(set.exerciseId));
        const completed = sets.filter((set) => set.completed && !set.skipped);
        const recordedDurationSeconds = Number(session.durationSeconds);
        const durationMinutes = Number.isFinite(recordedDurationSeconds) && recordedDurationSeconds > 0
          ? Math.max(1, Math.round(recordedDurationSeconds / 60))
          : null;
        return { exercises, sets, completed, durationMinutes, prs: session.prs || [] };
      }

      function renderQuickStartTemplates(expectedTemplateId = "") {
        const templates = data.templates.filter((template) => template.id !== expectedTemplateId);
        if (!templates.length) return "";
        const running = activeWorkoutSession();
        return `
          <details class="quick-template-strip today-template-strip">
            <summary class="secondary-action choose-workout-action">Choose another workout</summary>
            <div class="quick-template-list">
              ${templates.map((template) => {
                const isActiveTemplate = running?.templateId === template.id;
                return `
                  <button class="quick-template-card today-template-card ${isActiveTemplate ? "active-template" : ""}" type="button" data-action="${isActiveTemplate ? "resume-active-workout" : "start-template"}" data-template-id="${template.id}">
                    <strong>${escapeHtml(template.name)}</strong>
                    <small>${template.exercises.length} lift${template.exercises.length === 1 ? "" : "s"} · ${templateExerciseCount(template)} working sets</small>
                    <span>${isActiveTemplate ? "Resume workout" : "Start workout"}</span>
                  </button>
                  ${running ? '' : '<button class="s4b-plan-choice" type="button" data-action="plan-today-workout" data-routine-id="' + escapeHtml(template.id) + '">Preview / injury skip</button>'}
                `;
              }).join("")}
            </div>
          </details>
        `;
      }

      function openOptionalReadiness(templateId = "", sessionId = "") {
        const template = data.templates.find((item) => item.id === templateId);
        const session = data.sessions.find((item) => item.id === sessionId);
        if (!template && !session) return;
        if (template && (!Array.isArray(template.exercises) || template.exercises.length === 0)) {
          optionalReadinessFlow = null;
          showAppToast("Add at least one exercise before starting this template.");
          render();
          return;
        }
        captureDialogFocusOrigin("readiness");
        optionalReadinessFlow = {
          templateId: template?.id || "",
          sessionId: session?.id || "",
          draft: session ? cleanRecovery(sessionRecovery(session)) : recoveryForWorkoutStart(template.id)
        };
        render();
      }

      function closeOptionalReadiness() {
        optionalReadinessFlow = null;
        restoreFocusAfterDialog("readiness");
        render();
      }

      function patchTemplateStartDraft(patch, shouldRender = true) {
        if (!optionalReadinessFlow) return;
        optionalReadinessFlow = { ...optionalReadinessFlow, draft: cleanRecovery({ ...optionalReadinessFlow.draft, ...patch }) };
        if (shouldRender) render();
      }

      function rangeBar({ low, high, actual, tone = "none" }) {
        const targetLow = Number(low);
        const targetHigh = Number(high);
        const actualValue = Number(actual);
        if (![targetLow, targetHigh, actualValue].every(Number.isFinite) || targetHigh <= 0 || targetLow < 0 || targetHigh < targetLow) return "";
        const scaleMax = targetHigh * 1.5;
        const percent = (value) => Math.max(0, Math.min(100, value / scaleMax * 100));
        const label = actualValue + " against a target of " + targetLow + " to " + targetHigh;
        return '<span class="range-bar" data-tone="' + escapeHtml(tone) + '" role="img" aria-label="' + escapeHtml(label) + '" style="--band-start:' + percent(targetLow).toFixed(2) + '%;--band-end:' + percent(targetHigh).toFixed(2) + '%;--actual:' + percent(actualValue).toFixed(2) + '%"><i class="rb-band"></i><i class="rb-mark"></i></span>';
      }

      function noData(label = "No recorded data") {
        return '<span class="no-data" title="' + escapeHtml(label) + '" aria-label="' + escapeHtml(label) + '">—</span>';
      }

      function readinessSegmentedField({ field, label, action, value, options }) {
        return '<fieldset class="field readiness-field"><legend class="f-name">' + escapeHtml(label) + '</legend><div class="segmented" role="radiogroup" aria-label="' + escapeHtml(label) + '">' + options.map(([optionValue, optionLabel]) => '<label><input type="radio" name="template-readiness-' + field + '" value="' + escapeHtml(optionValue) + '" data-action="' + action + '" ' + (String(value) === String(optionValue) ? 'checked' : '') + ' /><span>' + escapeHtml(optionLabel) + '</span></label>').join('') + '</div></fieldset>';
      }

      function renderTemplateStartSheet() {
        if (!templateStartFlow) return "";
        const template = data.templates.find((item) => item.id === templateStartFlow.templateId);
        if (!template) return "";
        if (templateStartFlow.step === "active-conflict") {
          const active = activeWorkoutSession();
          return `
            <div class="scrim sheet-backdrop" role="presentation">
              <section class="sheet-card bottom-sheet dialog-sheet start-flow-sheet" role="dialog" aria-modal="true" aria-labelledby="active-workout-title" data-sheet-content>
                <div><div class="section-kicker">Workout in progress</div><h2 id="active-workout-title">${escapeHtml(active?.title || "Current workout")}</h2><p>Finish or discard this draft before starting ${escapeHtml(template.name)}.</p></div>
                <div class="sheet-actions stacked">
                  <button class="primary-action sheet-btn" type="button" data-action="resume-active-workout">Resume</button>
                  <button class="sheet-btn" type="button" data-action="finish-active-workout">Finish</button>
                  <button class="sheet-btn danger-button" type="button" data-action="discard-active-workout">Discard</button>
                </div>
              </section>
            </div>`;
        }
        return "";
      }

      function renderOptionalReadinessSheet() {
        if (!optionalReadinessFlow) return "";
        const recovery = optionalReadinessFlow.draft;
        const editingWorkout = Boolean(optionalReadinessFlow.sessionId);
          return `
            <div class="scrim sheet-backdrop" data-action="cancel-template-start" role="presentation">
              <section class="sheet-card bottom-sheet dialog-sheet readiness-log-sheet" role="dialog" aria-modal="true" aria-labelledby="daily-readiness-title" data-sheet-content>
                <button class="sheet-close" type="button" data-action="cancel-template-start" aria-label="Close daily readiness">&times;</button>
                <div><div class="section-kicker">Optional readiness</div><h2 id="daily-readiness-title">What is different today?</h2><p>Choose only what you know. Skipping this stays silent and never limits workout logging.</p></div>
                <div class="readiness-draft">
                  ${readinessSegmentedField({ field: "deviation", label: "Readiness today", action: "template-readiness-deviation", value: recovery.readinessDeviation, options: [["", "Not entered"], ["meaningfully_poor", "Worse than usual"], ["usual", "About usual"]] })}
                  ${readinessSegmentedField({ field: "soreness", label: "Soreness today", action: "template-readiness-soreness", value: recovery.soreness, options: [["", "Not recorded"], ["1", "Usual"], ["3", "Unusual"], ["5", "Very unusual"]] })}
                  <fieldset class="field readiness-field"><legend class="f-name">${editingWorkout ? 'Illness or pain' : 'Illness'}</legend><div class="readiness-toggle-grid"><label class="toggle-line"><span>Current illness</span><span class="toggle ${recovery.illness ? "on" : ""}"><input type="checkbox" data-action="template-readiness-illness" ${recovery.illness ? "checked" : ""} /><i></i></span></label>${editingWorkout ? '<label class="toggle-line"><span>Pain or injury</span><span class="toggle ' + (recovery.pain ? 'on' : '') + '"><input type="checkbox" data-action="template-readiness-pain" ' + (recovery.pain ? 'checked' : '') + ' /><i></i></span></label>' : ''}</div></fieldset>
                  <div class="field readiness-field"><label class="f-name" for="template-readiness-area">Affected area</label><select id="template-readiness-area" data-action="template-readiness-affected-muscle"><option value="">Not specified</option>${muscleGroups.map((muscle) => '<option value="' + muscle + '" ' + (recovery.affectedMuscle === muscle ? 'selected' : '') + '>' + muscle + '</option>').join('')}</select></div>
                  <div class="field readiness-field"><label class="f-name" for="template-readiness-note">Optional context</label><textarea id="template-readiness-note" data-action="template-readiness-note" placeholder="Anything outside your normal band">${escapeHtml(recovery.outsideBandNote)}</textarea></div>
                </div>
                <div class="sheet-actions stacked"><button class="primary-action sheet-btn" type="button" data-action="${editingWorkout ? "save-workout-readiness" : "start-workout-with-readiness"}">${editingWorkout ? "Save readiness" : "Start workout"}</button></div>
              </section>
            </div>
          `;
      }

      function requestCancelWorkout(source = "workout", requestedSessionId = "") {
        const requestedSession = data.sessions.find((item) => item.id === requestedSessionId);
        const session = sessionCanBeDiscarded(requestedSession)
          ? requestedSession
          : source === "template"
            ? activeWorkoutSession()
            : sessionCanBeDiscarded(activeSession()) ? activeSession() : activeWorkoutSession();
        if (!sessionCanBeDiscarded(session)) return;
        dialogFocusOrigins.cancel = source === "template"
          ? dialogFocusOrigins.template || focusDescriptorForElement(document.activeElement) || { kind: "main" }
          : focusDescriptorForElement(root.querySelector('[data-action="session-menu"]')) || focusDescriptorForElement(document.activeElement) || { kind: "main" };
        if (source === "template") dialogFocusOrigins.template = null;
        const replacementTemplateId = source === "template" ? String(templateStartFlow?.templateId || "") : "";
        cancelWorkoutFlow = { sessionId: session.id, source, replacementTemplateId };
        templateStartFlow = null;
        render();
      }

      function renderCancelWorkoutSheet() {
        if (!cancelWorkoutFlow) return "";
        const session = data.sessions.find((item) => item.id === cancelWorkoutFlow.sessionId);
        if (!session || isSessionSubmitted(session)) return "";
        const exerciseIds = new Set(data.exercises.filter((item) => item.sessionId === session.id).map((item) => item.id));
        const draftSets = data.sets.filter((item) => exerciseIds.has(item.exerciseId));
        const completedSets = draftSets.filter((item) => item.completed && !item.skipped).length;
        const replacement = data.templates.find((template) => template.id === cancelWorkoutFlow.replacementTemplateId);
        const replacementCopy = replacement
          ? ' Replace it with ' + escapeHtml(replacement.name) + '.'
          : '';
        return `
          <div class="scrim sheet-backdrop" data-action="keep-workout" role="presentation">
            <section class="sheet-card bottom-sheet dialog-sheet destructive-sheet" role="dialog" aria-modal="true" aria-label="${replacement ? "Replace this workout?" : "Cancel this workout?"}" data-sheet-content>
              <div><div class="section-kicker destructive-kicker">${replacement ? "Replace workout?" : "Discard workout?"}</div><h2 id="cancel-workout-title">${escapeHtml(session.title || "Current workout")}</h2><p>${completedSets ? completedSets + " logged set" + (completedSets === 1 ? "" : "s") + " and " : "The "}unsubmitted session will be permanently removed.${replacementCopy} Submitted history and routines stay intact.</p></div>
              <div class="sheet-actions cancel-sheet-actions">
                <button class="primary-action" type="button" data-action="keep-workout">Keep workout</button>
                <button class="discard-workout-button" type="button" data-action="confirm-cancel-workout">${replacement ? "Replace workout" : "Discard workout"}</button>
              </div>
            </section>
          </div>`;
      }

      function closeCancelWorkout() {
        cancelWorkoutFlow = null;
        restoreFocusAfterDialog("cancel");
        render();
      }

      async function beginHistoryEdit() {
        if (historyEditStartPending || historyEditFlow) return false;
        const session = activeSession();
        if (!isSessionSubmitted(session)) return false;
        const editStartContext = {
          dataRevision: Number(data.dataRevision || 0),
          activeTab,
          activeSessionId,
          viewingHistorySessionId,
          sessionId: session.id
        };
        historyEditStartPending = true;
        let shouldRender = false;
        try {
          cancelPendingDataSave();
          const stableData = cloneAppData(data);
          const persisted = await persistStableAppDataSnapshot(stableData);
          const editContextChanged = Number(data.dataRevision || 0) !== editStartContext.dataRevision
            || activeTab !== editStartContext.activeTab
            || activeSessionId !== editStartContext.activeSessionId
            || viewingHistorySessionId !== editStartContext.viewingHistorySessionId
            || activeSession()?.id !== editStartContext.sessionId;
          if (editContextChanged) {
            const currentStableData = cloneAppData(data);
            const currentRevision = Number(data.dataRevision || 0);
            const currentPersisted = await persistStableAppDataSnapshot(currentStableData);
            const currentSnapshotStillCurrent = Number(data.dataRevision || 0) === currentRevision;
            if (currentPersisted && currentSnapshotStillCurrent) {
              showAppToast("The app changed while history editing was opening. Your current changes were saved; choose Edit History to try again.");
            } else {
              settingsMessage = "Current changes are not durable. Export a backup and retry saving before reloading.";
              showAppToast("History editing stayed closed because your current changes are not durable. Export a backup and retry saving before reloading.");
            }
            shouldRender = true;
            return false;
          }
          if (!persisted) {
            showAppToast("History editing could not start because the current app state could not be saved.");
            shouldRender = true;
            return false;
          }
          if (!isSessionSubmitted(activeSession())) return false;
          historyEditFlow = { sessionId: session.id, originalData: stableData, dirty: false };
          historyEditConfirm = "";
          shouldRender = true;
          return true;
        } catch {
          settingsMessage = "Current changes are not durable. Export a backup and retry saving before reloading.";
          showAppToast("History editing stayed closed because the current app state is not durable. Export a backup and retry saving before reloading.");
          shouldRender = true;
          return false;
        } finally {
          historyEditStartPending = false;
          if (shouldRender) render();
        }
      }

      function requestHistoryEditConfirmation(type, options = {}) {
        if (!isEditingHistorySession()) return;
        if (!options.preserveOrigin || !dialogFocusOrigins.history) captureDialogFocusOrigin("history");
        historyEditConfirm = type === "save" ? "save" : "cancel";
        render();
      }

      function renderHistoryEditConfirmSheet() {
        if (!historyEditConfirm || !isEditingHistorySession()) return "";
        const saving = historyEditConfirm === "save";
        return `
          <div class="sheet-backdrop" data-action="keep-history-editing" role="presentation">
            <section class="bottom-sheet dialog-sheet ${saving ? "" : "destructive-sheet"}" role="dialog" aria-modal="true" aria-labelledby="history-edit-confirm-title" data-sheet-content>
              <button class="sheet-close" type="button" data-action="keep-history-editing" aria-label="Close edit confirmation">&times;</button>
              <div class="cancel-hero ${saving ? "save" : ""}"><span class="cancel-visual" aria-hidden="true">${saving ? "&#10003;" : "!"}</span><div><div class="section-kicker">Logged workout</div><h2 id="history-edit-confirm-title">${saving ? "Save these history edits?" : "Cancel these edits?"}</h2><p>${saving ? "The revised workout will replace the saved version. Its stored historical grade and algorithm version remain unchanged." : "The original logged workout will be restored. None of the temporary changes will be saved."}</p></div></div>
              <div class="sheet-actions stacked">
                <button class="primary-action" type="button" data-action="keep-history-editing">Keep Editing</button>
                <button class="${saving ? "secondary-action" : "danger-button"}" type="button" data-action="${saving ? "confirm-save-history-edits" : "confirm-cancel-history-edits"}">${saving ? "Save Edits" : "Discard Edits"}</button>
              </div>
            </section>
          </div>`;
      }

      function closeHistoryEditConfirmation() {
        historyEditConfirm = "";
        restoreFocusAfterDialog("history");
        render();
      }

      function liftHomeSession() {
        const running = activeWorkoutSession();
        if (running) return running;
        const emptyDraft = data.sessions.find((session) => !isSessionSubmitted(session) && !session.workoutStarted && !session.templateId && !session.startedAt && !data.exercises.some((exercise) => exercise.sessionId === session.id));
        if (emptyDraft) return emptyDraft;
        const session = createSession();
        data = { ...data, sessions: [session, ...data.sessions] };
        return session;
      }

      function returnToToday(message = "") {
        const home = liftHomeSession();
        activeSessionId = home.id;
        viewingHistorySessionId = "";
        pendingSubmitSessionId = "";
        completedSummarySessionId = "";
        historyEditConfirm = "";
        setActiveTab("today", { replace: true, renderNow: false });
        saveData();
        if (message) showAppToast(message);
        render();
      }

      function saveHistoryEdits() {
        if (!isEditingHistorySession()) return;
        const sessionId = historyEditFlow.sessionId;
        const session = data.sessions.find((item) => item.id === sessionId);
        const prs = session ? submitWorkoutPrs(session) : [];
        const updatedSession = session ? { ...session, completedAt: session.date, prs, updatedAt: isoNow() } : null;
        data = { ...data, sessions: data.sessions.map((item) => item.id === sessionId ? updatedSession : item) };
        invalidateCompletedAnalysis();
        historyEditFlow = null;
        returnToToday("History edits saved. The stored historical grade was preserved.");
      }

      function cancelHistoryEdits() {
        if (!isEditingHistorySession()) return;
        data = historyEditFlow.originalData;
        entityStructureRevision += 1;
        entityIndexCache = null;
        invalidateCompletedAnalysis();
        historyEditFlow = null;
        applyTheme();
        returnToToday("History edits canceled.");
      }

      function showAppToast(message, options = {}) {
        const toast = { message: String(message), severity: options.severity || "info", action: options.action || "", actionLabel: options.actionLabel || "", setId: options.setId || "", duration: Number(options.duration || 2800) };
        if (appToast) {
          appToastQueue.push(toast);
          return;
        }
        const present = (next) => {
          appToast = next;
          render();
          window.clearTimeout(appToastTimer);
          appToastTimer = window.setTimeout(() => {
            appToast = null;
            const queued = appToastQueue.shift();
            if (queued) present(queued); else render();
          }, next.duration);
        };
        present(toast);
      }

      async function discardActiveWorkout() {
        const session = data.sessions.find((item) => item.id === cancelWorkoutFlow?.sessionId);
        if (!sessionCanBeDiscarded(session)) return;
        const replacementTemplateId = String(cancelWorkoutFlow?.replacementTemplateId || "");
        window.clearTimeout(saveTimer);
        const exerciseIds = new Set(data.exercises.filter((exercise) => exercise.sessionId === session.id).map((exercise) => exercise.id));
        if (timer && (timer.workoutId === session.id || exerciseIds.has(timer.exerciseId))) {
          const previousTimer = { ...timer };
          window.clearInterval(timerInterval);
          timerInterval = 0;
          releaseTimerWakeLock();
          timer = null;
          cancelRestPush(previousTimer, "workout-canceled");
        }
        const discardedActiveWorkout = activeWorkoutId === session.id;
        if (discardedActiveWorkout) {
          activeWorkoutId = "";
          activeSetId = "";
          pendingNextSetId = "";
          activeSetAcknowledged = false;
          activeSetNotice = "";
          timerCompleteNotice = null;
          if (restNavigationState?.workoutId === session.id) restNavigationState = { ...restNavigationState, status: "canceled", updatedAt: isoNow() };
          clearActiveWorkoutDraft();
        }
        addExerciseDraft = "";
        addExercisePrimaryMuscle = "";
        addExerciseSecondaryMuscle = "";
        addExerciseSetCount = 1;
        addExerciseRepMin = 8;
        addExerciseRepMax = 12;
        addExerciseTargetRpe = 8;
        addExerciseRestSeconds = 0;
        pendingSubmitSessionId = "";
        completedSummarySessionId = "";
        cancelWorkoutFlow = null;
        const remainingSessions = data.sessions.filter((item) => item.id !== session.id);
        let nextSession = remainingSessions.find((item) => item.id === activeWorkoutId)
          || remainingSessions.filter((item) => !isSessionSubmitted(item) && !data.exercises.some((exercise) => exercise.sessionId === item.id)).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0]
          || activeHistorySessions().filter((item) => item.id !== session.id).sort((a, b) => sessionCompletionDate(b).localeCompare(sessionCompletionDate(a)))[0];
        if (!nextSession) {
          nextSession = createSession();
          remainingSessions.unshift(nextSession);
        }
        activeSessionId = nextSession.id;
        setActiveTab("today", { replace: true, renderNow: false });
        showAppToast(replacementTemplateId ? "Workout replaced." : "Workout canceled.");
        commit({ ...data, sessions: remainingSessions, exercises: data.exercises.filter((exercise) => exercise.sessionId !== session.id), sets: data.sets.filter((set) => !exerciseIds.has(set.exerciseId)) });
        if (replacementTemplateId) window.setTimeout(() => startTemplate(replacementTemplateId), 0);
      }

      function renderStandardWorkloadControls(exercise) {
        const owningSession = sessionById(exercise.sessionId);
        if (exercise.sessionId !== activeWorkoutId || !owningSession || isSessionSubmitted(owningSession)) return "";
        const session = sessionById(exercise.sessionId);
        const template = session?.templateId ? data.templates.find((item) => item.id === session.templateId) : null;
        const templateExercise = template?.exercises?.find((item) => exerciseMatches(item.name, exercise.name));
        const exerciseSets = setsForExercise(exercise.id);
        const warmups = exerciseSets.filter((set) => setTypeSemantics(set).isWarmup);
        const working = exerciseSets.filter((set) => isWorkingSet(set, "progression"));
        const workingCount = Math.max(1, working.length || Number(templateExercise?.sets || 1));
        const repMins = working.map((set) => Number(set.targetRepMin || set.targetReps || set.reps || 0)).filter((value) => value > 0);
        const repMaxes = working.map((set) => Number(set.targetRepMax || set.targetReps || set.reps || 0)).filter((value) => value > 0);
        const repMin = repMins.length ? Math.min(...repMins) : Number(templateExercise?.repMin || templateExercise?.reps || 8);
        const repMax = repMaxes.length ? Math.max(...repMaxes) : Number(templateExercise?.repMax || templateExercise?.reps || repMin);
        const workingRpeMaxes = working.map((set) => Number(set.targetRpeMax ?? set.targetRpe ?? set.rpe ?? 0)).filter((value) => value > 0);
        const targetRpeMax = workingRpeMaxes[0] || Number(templateExercise?.targetRpe || 8);
        const workingRpeMins = working.map((set) => Number(set.targetRpeMin ?? Math.max(1, Number(set.targetRpeMax ?? set.targetRpe ?? set.rpe ?? targetRpeMax) - 1))).filter((value) => value > 0);
        const targetRpeMin = workingRpeMins[0] || Math.max(1, targetRpeMax - 1);
        const workingRests = working.map((set) => Number(set.targetRestSeconds || 0)).filter((value) => value > 0);
        const workingRest = workingRests[0] || Number(exercise.restSeconds || data.settings.defaultRestSeconds || 90);
        const warmupRest = Number(warmups.find((set) => Number(set.targetRestSeconds) > 0)?.targetRestSeconds || Math.min(workingRest, 90));
        const signatures = working.map((set) => [
          normalizeSetTypeCode(set.setType, set.isWarmup),
          Number(set.targetRepMin || set.targetReps || set.reps || repMin),
          Number(set.targetRepMax || set.targetReps || set.reps || repMax),
          Number(set.targetRpeMin ?? targetRpeMin),
          Number(set.targetRpeMax ?? set.targetRpe ?? set.rpe ?? targetRpeMax),
          Number(set.targetRestSeconds || workingRest)
        ].join("|"));
        const individualized = new Set(signatures).size > 1 || working.some((set) => normalizeSetTypeCode(set.setType, set.isWarmup) !== "straight");
        const comparison = "Fully editable";
        const savedLabel = templateExercise
          ? `${templateExercise.sets} sets · ${templateExercise.repMin || templateExercise.reps}-${templateExercise.repMax || templateExercise.reps} reps`
          : "Today only";
        const roleOptions = (selected) => [
          ["straight", "Standard set"],
          ["top", "Top set"],
          ["backoff", "Back-off set"],
          ["drop", "Drop set"]
        ].map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
        const numericStepper = ({ field, value, min, max, step, label, setField = false, action = "" }) => `
          <span class="numeric-stepper" data-numeric-stepper>
            <button type="button" data-action="adjust-exercise-default" data-delta="-${step}" aria-label="Decrease ${escapeHtml(label)}">${icon.down}</button>
            <input type="number" min="${min}" max="${max}" step="${step}" value="${value}" ${setField ? "data-set-default-field" : "data-default-field"}="${field}" ${action ? `data-action="${action}"` : ""} aria-label="${escapeHtml(label)}" />
            <button type="button" data-action="adjust-exercise-default" data-delta="${step}" aria-label="Increase ${escapeHtml(label)}">${icon.up}</button>
          </span>`;
        const setRow = (scope, index, set, fallback) => {
          const type = scope === "warmup" ? "warmup" : normalizeSetTypeCode(set?.setType, set?.isWarmup);
          const rowRepMin = Number(set?.targetRepMin || set?.targetReps || set?.reps || fallback.repMin);
          const rowRepMax = Number(set?.targetRepMax || set?.targetReps || set?.reps || fallback.repMax);
          const rowTargetRpeMax = Number(set?.targetRpeMax ?? set?.targetRpe ?? set?.rpe ?? fallback.targetRpeMax);
          const rowTargetRpeMin = Number(set?.targetRpeMin ?? fallback.targetRpeMin ?? Math.max(1, rowTargetRpeMax - 1));
          const rest = Number(set?.targetRestSeconds || fallback.rest);
          const scopeLabel = scope === "warmup" ? "Warm-up" : "Working";
          return `
            <div class="individual-set-row" data-set-default-row data-set-scope="${scope}" data-set-index="${index}" ${scope === "working" && index >= workingCount ? "hidden" : ""}>
              <span class="individual-set-index">${scope === "warmup" ? `WU${index + 1}` : index + 1}</span>
              <div class="individual-set-fields">
                ${scope === "warmup" ? '<span class="individual-set-type">Warm-up</span>' : `<label><span>Type</span><select data-set-default-field="type" aria-label="Working set ${index + 1} type">${roleOptions(type || "straight")}</select></label>`}
                <label><span>Reps</span><span class="range-steppers"><span class="range-bound"><small>Min</small>${numericStepper({ field: "rep-min", value: rowRepMin, min: 1, max: 50, step: 1, label: `${scopeLabel} set ${index + 1} minimum reps`, setField: true })}</span><span class="range-bound"><small>Max</small>${numericStepper({ field: "rep-max", value: rowRepMax, min: 1, max: 50, step: 1, label: `${scopeLabel} set ${index + 1} maximum reps`, setField: true })}</span></span></label>
                <label class="individual-set-rpe"><span>Target RPE range</span><span class="range-steppers"><span class="range-bound"><small>Min</small>${numericStepper({ field: "target-rpe-min", value: rowTargetRpeMin, min: 1, max: 10, step: 0.5, label: `${scopeLabel} set ${index + 1} minimum target RPE`, setField: true })}</span><span class="range-bound"><small>Max</small>${numericStepper({ field: "target-rpe-max", value: rowTargetRpeMax, min: 1, max: 10, step: 0.5, label: `${scopeLabel} set ${index + 1} maximum target RPE`, setField: true })}</span></span></label>
                <label class="individual-set-rest"><span>Rest <small>seconds</small></span>${numericStepper({ field: "rest", value: rest, min: 15, max: 900, step: 15, label: `${scopeLabel} set ${index + 1} rest seconds`, setField: true })}</label>
              </div>
            </div>`;
        };
        const warmupRows = warmups.map((set, index) => setRow("warmup", index, set, { repMin, repMax, targetRpeMin: Math.min(targetRpeMin, 5), targetRpeMax: Math.min(targetRpeMax, 6), rest: warmupRest })).join("");
        const workingRows = Array.from({ length: 20 }, (_, index) => setRow("working", index, working[index], { repMin, repMax, targetRpeMin, targetRpeMax, rest: workingRest })).join("");
        return `
          <section class="standard-workload-card" data-standard-workload-form="${exercise.id}" data-override-form="${exercise.id}">
            <div class="standard-workload-heading"><div><span>Exercise defaults</span><strong>Sets, reps, RPE & rest</strong></div><span class="standard-workload-badge ${comparison.toLowerCase().replaceAll(" ", "-")}">${comparison}</span></div>
            <div class="guideline-context-row" aria-label="Saved exercise default"><div><span>Saved target</span><strong>${escapeHtml(savedLabel)}</strong></div></div>
            <div class="default-target-grid">
              <label><span>Working sets</span>${numericStepper({ field: "sets", value: workingCount, min: 1, max: 20, step: 1, label: "Default working set count", action: "default-working-set-count" })}</label>
              <label><span>Rep range</span><span class="range-steppers"><span class="range-bound"><small>Min</small>${numericStepper({ field: "rep-min", value: repMin, min: 1, max: 50, step: 1, label: "Default minimum repetitions" })}</span><span class="range-bound"><small>Max</small>${numericStepper({ field: "rep-max", value: repMax, min: 1, max: 50, step: 1, label: "Default maximum repetitions" })}</span></span></label>
              <label><span>Target RPE range</span><span class="range-steppers"><span class="range-bound"><small>Min</small>${numericStepper({ field: "target-rpe-min", value: targetRpeMin, min: 1, max: 10, step: 0.5, label: "Default minimum target RPE" })}</span><span class="range-bound"><small>Max</small>${numericStepper({ field: "target-rpe-max", value: targetRpeMax, min: 1, max: 10, step: 0.5, label: "Default maximum target RPE" })}</span></span></label>
              <label><span>Working rest <small>seconds</small></span>${numericStepper({ field: "working-rest", value: workingRest, min: 15, max: 900, step: 15, label: "Default working-set rest seconds" })}</label>
              <label><span>Warm-up rest <small>seconds</small></span>${numericStepper({ field: "warmup-rest", value: warmupRest, min: 15, max: 900, step: 15, label: "Default warm-up rest seconds" })}</label>
            </div>
            <details class="individual-set-disclosure" data-individual-set-disclosure ${individualized ? "open" : ""}>
              <summary><span><strong>Individual set targets</strong><small>Drop sets, different reps, RPE or rest</small></span><b>${individualized ? "Customized" : "Optional"}</b></summary>
              <input type="hidden" value="${individualized ? "true" : "false"}" data-individual-set-enabled />
              <div class="individual-set-editor">
                <p>Opening this section enables separate targets. Set type can mark top, back-off, or drop sets; each row owns its rep range, target RPE range, and rest target.</p>
                ${warmupRows ? `<div class="individual-set-group"><h4>Warm-up sets</h4>${warmupRows}</div>` : ""}
                <div class="individual-set-group"><h4>Working sets</h4>${workingRows}</div>
                <button class="text-action" type="button" data-action="use-shared-set-targets">Use one target for every set</button>
              </div>
            </details>
            <p class="standard-workload-note">These changes apply only to unfinished sets in this workout. Saving them to the routine is a separate action.</p>
            <button class="primary-action standard-workload-apply" type="button" data-action="apply-standard-workload" data-exercise-id="${exercise.id}">Apply to this workout</button>
          </section>
        `;
      }

      function renderReconcilePrompt(exercise) {
        if (coachingTargetsForSession(sessionById(exercise.sessionId)).visible) return "";
        const pending = exercise.pendingReconcile;
        const set = pending ? setById(pending.setId) : null;
        if (!pending || !set) return "";
        const fields = new Set(pending.fields || []);
        const resistanceType = resistanceTypeFor(exercise, set);
        const loggedParts = [];
        const deltaParts = [];
        let tone = "over";
        if (fields.has("load")) {
          const actual = resistanceLoad(set, resistanceType);
          const target = Number(set.targetWeight || 0);
          loggedParts.push(formatResistance(set, exercise));
          deltaParts.push(formatLoadNumber(Math.abs(actual - target)) + " " + (set.weightUnit || data.settings.weightUnit) + (actual > target ? " above" : " below") + " target");
          if (actual < target) tone = "under";
        }
        if (fields.has("reps")) {
          const low = Number(set.targetRepMin || set.targetReps || 0);
          const high = Number(set.targetRepMax || set.targetReps || 0);
          loggedParts.push(Number(set.reps || 0) + " reps");
          deltaParts.push(Number(set.reps || 0) < low ? (low - Number(set.reps || 0)) + " reps below target" : (Number(set.reps || 0) - high) + " reps above target");
          if (Number(set.reps || 0) < low) tone = "under";
        }
        if (fields.has("rpe")) {
          const target = Number(set.targetRpe || set.targetRpeMax || set.targetRpeMin || 0);
          loggedParts.push("RPE " + formatLoadNumber(set.rpe));
          deltaParts.push(formatLoadNumber(Math.abs(Number(set.rpe) - target)) + " RPE " + (Number(set.rpe) > target ? "above" : "below") + " target");
          tone = Number(set.rpe) > target ? "out" : "under";
        }
        const remaining = Number(pending.remainingSetCount || 0);
        return '<div class="reconcile-strip" role="status" data-tone="' + tone + '"><span class="reconcile-copy"><strong>' + escapeHtml(loggedParts.join(" × ")) + ' logged</strong><small>' + escapeHtml(deltaParts.join(" · ")) + ' · ' + remaining + (remaining === 1 ? ' set remains' : ' sets remain') + '</small></span><span class="reconcile-actions"><button class="primary-action" type="button" data-action="reconcile-apply" data-exercise-id="' + exercise.id + '">Apply to remaining</button><button class="mini-button" type="button" data-action="reconcile-dismiss" data-exercise-id="' + exercise.id + '">Just this set</button></span></div>';
      }

      function renderExercise(exercise) {
        const exerciseSets = setsForExercise(exercise.id);
        const isActiveExercise = exerciseSets.some((set) => set.id === activeSetId || timer?.setId === set.id);
        const firstWorkSet = exerciseSets.find((set) => isWorkingSet(set)) || exerciseSets[0];
        const renderContext = renderSetContext(exercise);
        const setHtml = measurePerformance("lift:setRows", () => renderLoadedBarTable(exercise, renderContext), { exerciseId: exercise.id, count: exerciseSets.length });
        const chipSet = exerciseSets.find((set) => isWorkingSet(set) && !set.completed && !set.skipped) || firstWorkSet;
        const plannedWorkingSets = exerciseSets.filter((set) => isWorkingSet(set)).length;
        const completedWorkingSets = exerciseSets.filter((set) => isWorkingSet(set) && set.completed && !set.skipped).length;
        const exerciseComplete = plannedWorkingSets > 0 && completedWorkingSets === plannedWorkingSets;
        const chipRestSeconds = Number(chipSet?.targetRestSeconds ?? exercise.restSeconds ?? data.settings.defaultRestSeconds ?? 90);
        const chipTarget = chipSet
          ? plannedWorkingSets + " set" + (plannedWorkingSets === 1 ? "" : "s")
            + " · " + targetRangeText(chipSet.targetRepMin, chipSet.targetRepMax || chipSet.targetReps) + " reps"
            + " · RPE " + targetRangeText(chipSet.targetRpeMin, chipSet.targetRpeMax || chipSet.targetRpe)
            + " · " + formatTimer(chipRestSeconds) + " rest"
          : "";
        const targetChip = chipTarget
          ? '<span class="exercise-target chip" aria-label="' + escapeHtml("Stable target: " + chipTarget) + '">' + escapeHtml(chipTarget) + '</span>'
          : "";
        const owningSession = sessionById(exercise.sessionId);
        return `
          <article id="exercise-${exercise.id}" class="exercise-card ${isActiveExercise ? "active-exercise" : ""} ${exerciseComplete ? "exercise-complete" : ""} ${workoutFocusExerciseId === exercise.id ? "context-exercise" : ""}" tabindex="-1" aria-label="Exercise: ${escapeHtml(exercise.name)}">
            <div class="exercise-header">
              <span class="exercise-grip" aria-hidden="true">${icon.grip}</span>
              <h2 class="exercise-name exercise-name-full" title="${escapeHtml(exercise.name)}"><a href="#progress" class="exercise-history-link" data-action="open-exercise-history" data-exercise-id="${escapeHtml(exercise.id)}" data-performance-exercise-id="${escapeHtml(exercise.performanceExerciseId || canonicalExerciseId(exercise))}">${escapeHtml(exercise.name)}</a></h2>
              ${isDeloadExposure(owningSession, exercise, exerciseSets) ? '<span class="s4a-deload-tag">Deload</span>' : ""}${targetChip}<span class="exercise-set-progress">${completedWorkingSets} / ${plannedWorkingSets} logged</span>
              <details class="exercise-overflow"><summary class="icon-button" aria-label="Exercise menu">${icon.more}</summary><div class="exercise-overflow-menu">
                <button type="button" data-action="move-exercise" data-direction="-1" data-exercise-id="${exercise.id}" aria-label="Move ${escapeHtml(exercise.name)} up">${icon.up}<span>Move up</span></button>
                <button type="button" data-action="move-exercise" data-direction="1" data-exercise-id="${exercise.id}" aria-label="Move ${escapeHtml(exercise.name)} down">${icon.down}<span>Move down</span></button>
                <button class="danger" type="button" data-action="delete-exercise" data-exercise-id="${exercise.id}" aria-label="Delete exercise ${escapeHtml(exercise.name)}">${icon.delete}<span>Remove exercise</span></button>
              </div></details>
            </div>
            ${renderResolvedAction(resolvedActionForScope(owningSession, "exercise", exercise), { session: owningSession, exercise })}
            ${setHtml}
            <div data-reconcile-slot="${exercise.id}">${renderReconcilePrompt(exercise)}</div>
            ${renderLoadedBarExerciseOptions(exercise)}
          </article>
        `;
      }

      function renderLoadedBarExerciseOptions(exercise, expanded = false) {
        const addSetSafety = guardWorkoutMutation("add-set", { exercise }, false);
        const addWarmupSafety = guardWorkoutMutation("add-warmup-set", { exercise }, false);
        const duplicateSetSafety = guardWorkoutMutation("duplicate-set", { exercise }, false);
        const optionsHtml = renderStandardWorkloadControls(exercise) + renderMuscleSelectors(exercise);
        return `            <details class="exercise-details"${expanded ? ' open' : ''}>
              <summary>Exercise details</summary>
              <div class="disclosure-body">
                <div class="exercise-quick-settings">
                  <label class="resistance-type-control"><span>Resistance type</span><select data-action="exercise-resistance-type" data-exercise-id="${exercise.id}" aria-label="Resistance type for ${escapeHtml(exercise.name)}">${resistanceTypeOptions(resistanceTypeFor(exercise))}</select></label>
                  <label class="deload-toggle ${exercise.isDeload ? "active" : ""}"><input type="checkbox" data-action="exercise-deload" data-exercise-id="${exercise.id}" ${exercise.isDeload ? "checked" : ""} /><span>${exercise.isDeload ? "Deload" : "Normal load"}</span></label>
                </div>
                <div class="exercise-substitution-control">
                  <label><span>Substitute or name a variant</span><input value="${escapeHtml(exercise.name)}" data-action="exercise-substitute-name" data-exercise-id="${exercise.id}" aria-label="Substitute or variant name for ${escapeHtml(exercise.name)}" maxlength="256" /></label>
                  <button type="button" data-action="apply-exercise-substitution" data-exercise-id="${exercise.id}">Use for this workout</button>
                  <small>The routine stays unchanged. Full names such as Heavy or Light keep separate history.</small>
                </div>
                <div class="exercise-management-actions" aria-label="Set actions for ${escapeHtml(exercise.name)}">
                  <button type="button" data-action="add-set" data-exercise-id="${exercise.id}" aria-label="Add working set to ${escapeHtml(exercise.name)}"${workoutSafetyDisabledAttributes(addSetSafety)}>Add set</button>
                  <button type="button" data-action="add-warmup-set" data-exercise-id="${exercise.id}" aria-label="Add warm-up set to ${escapeHtml(exercise.name)}"${workoutSafetyDisabledAttributes(addWarmupSafety)}>Add warm-up</button>
                  <button type="button" data-action="duplicate-set" data-exercise-id="${exercise.id}" aria-label="Copy the last set for ${escapeHtml(exercise.name)}"${workoutSafetyDisabledAttributes(duplicateSetSafety)}>Copy last set</button>
                </div>
                ${optionsHtml}
                ${activeSession()?.templateId ? '<button type="button" data-action="update-template-exercise" data-exercise-id="' + exercise.id + '">Save today’s targets to routine</button><p class="settings-note">This is the only action here that changes the routine. The completed workout remains the historical record.</p>' : ""}
                <textarea data-action="exercise-notes" data-exercise-id="${exercise.id}" maxlength="4096" placeholder="Exercise notes" aria-label="Exercise notes">${escapeHtml(exercise.notes)}</textarea>
              </div>
            </details>`;
      }

      // UI-only derivation. Targets always use the same resolver projection as the table.
      function loadedBarEquipmentForSet(exercise, set, channel = coachingTargetsForSession(sessionById(exercise.sessionId))) {
        const api = ComprehensiveFitnessLoadedBar;
        const identity = coachVariantIdentity(exercise);
        const savedClass = data.settings.equipmentCorrections?.find((entry) => entry.exerciseIdentity === identity)?.equipmentClass;
        const researchId = resolveExerciseIdentityProfile(exercise).researchExerciseId;
        const record = researchId ? prescriptionEngine?.evidence?.research?.exerciseDatabase?.find((entry) => (entry.exercise_id || entry.exerciseId) === researchId) : null;
        const automatic = api.deriveEquipmentClass({ exerciseName: exercise.name, catalogEquipment: record?.equipment ?? null });
        const derived = api.deriveEquipmentClass({ savedClass, exerciseName: exercise.name, catalogEquipment: record?.equipment ?? null });
        const targets = set ? loadedBarTargetsForSet(set, exercise, channel) : null;
        const type = resistanceTypeFor(exercise, set);
        const unit = set?.weightUnit || data.settings.weightUnit;
        const weight = ["duration", "distance", "bodyweight"].includes(type) ? "" : loadedBarNumber(targets?.weight);
        const equipmentClass = ["duration", "distance"].includes(type) || (weight === "" && type !== "bodyweight") ? "generic" : derived.equipmentClass;
        const input = { equipmentClass, target: weight === "" ? null : weight, unit, barWeight: data.settings.barWeight?.[unit], plates: data.settings.plateInventory?.[unit] };
        const load = ["barbell", "plate_loaded"].includes(equipmentClass) ? api.loadBarbell(input) : null;
        return { ...input, identity, automaticClass: automatic.equipmentClass, derivedClass: derived.equipmentClass, targets,
          equipmentClass: load?.tooHeavyToDraw ? "generic" : equipmentClass, load: load?.tooHeavyToDraw ? null : load,
          tooHeavyToDraw: Boolean(load?.tooHeavyToDraw), note: load?.tooHeavyToDraw ? load.note : null };
      }

      function renderLoadedBarRepPips(set, target) {
        const count = Number.isSafeInteger(target) && target > 0 && target <= 30 ? target : 0;
        if (!count) return "";
        const entered = loadedBarNumber(set.reps);
        return '<div class="loaded-bar-pips" data-rep-pips="' + set.id + '" aria-hidden="true">' + Array.from({ length: count }, (_, index) => '<i class="' + (entered !== "" && index < entered ? 'filled' : '') + '">' + (index + 1) + '</i>').join('') + '</div>';
      }

      function syncLoadedBarRepPips(setId, value) {
        const pips = root.querySelector('[data-rep-pips="' + CSS.escape(setId) + '"]');
        const entered = loadedBarNumber(value);
        pips?.querySelectorAll('i').forEach((pip, index) => pip.classList.toggle('filled', entered !== "" && index < entered));
      }

      function renderLoadedBarPlateChange(change, unit, coached) {
        if (!change?.text) return "";
        const round = (plate) => {
          const equivalent = unit === 'kg' ? plate * 45 / 25 : plate;
          const band = equivalent >= 40 ? 'p45' : equivalent >= 30 ? 'p35' : equivalent >= 15 ? 'p25' : equivalent >= 7.5 ? 'p10' : equivalent >= 4 ? 'p5' : 'p2';
          return '<span class="loaded-bar-round ' + band + '">' + escapeHtml(ComprehensiveFitnessLoadedBar.formatLoad(plate)) + '</span>';
        };
        return '<section class="loaded-bar-plate-change' + (coached ? ' coach-change' : '') + '" aria-label="Plate change"><div class="loaded-bar-swap-rounds" aria-hidden="true">'
          + change.remove.map(round).join('<span>+</span>') + (change.kind === 'swap' ? '<b>→</b>' : '<b>' + (change.kind === 'add' ? '+' : '−') + '</b>')
          + change.add.map(round).join('<span>+</span>') + '<small>Each side</small></div><p>' + escapeHtml(change.text) + '</p></section>';
      }

      function renderLoadedBarFocus(exercise, session) {
        const api = ComprehensiveFitnessLoadedBar;
        const rows = setsForExercise(exercise.id);
        const row = rows.find((set) => set.id === activeSetId && !set.completed && !set.skipped)
          || rows.find((set) => !set.completed && !set.skipped) || rows.at(-1);
        const context = renderSetContext(exercise);
        context.focusSetId = row && !row.completed && !row.skipped ? row.id : '';
        context.renderRestClamp = true;
        const equipment = loadedBarEquipmentForSet(exercise, row, context.coachChannel);
        const projected = context.coachChannel.visible ? context.coachChannel.exercises.find((item) => item.exerciseId === exercise.id) : null;
        const reason = data.settings.coachBetweenSetRevisions === false ? null : projected?.reasonText;
        const revision = equipment.targets?.row?.revision;
        const fromRevision = row && !row.completed && !row.skipped && revision && !revision.locked ? loadedBarNumber(revision.from?.load) : '';
        const previous = rows.filter((set) => set.id !== row?.id && set.completed && !set.skipped && isWorkingSet(set))
          .sort((left, right) => Number(left.completionOrder || 0) - Number(right.completionOrder || 0) || String(left.completedAt || '').localeCompare(String(right.completedAt || '')) || canonicalSetSequence(left) - canonicalSetSequence(right)).at(-1);
        const previousValue = previous ? loadedBarNumber(resistanceTypeFor(exercise, previous) === 'bodyweight_plus_load' ? previous.addedLoad ?? previous.weight : previous.weight) : '';
        const from = fromRevision !== '' ? fromRevision : previousValue;
        const fromUnit = fromRevision !== '' ? revision.from.unit || equipment.unit : previous?.weightUnit || equipment.unit;
        const fromLoad = from === '' ? null : fromUnit === equipment.unit ? from : from * (fromUnit === 'lb' ? 1 / 2.2046226218 : 2.2046226218);
        const previousBar = equipment.load && fromLoad !== null && Math.abs(fromLoad - equipment.target) > 0.000001
          ? api.loadBarbell({ ...equipment, target: fromLoad }) : null;
        const change = previousBar && !previousBar.tooHeavyToDraw ? api.plateChange(previousBar.perSide, equipment.load.perSide) : null;
        const coachChange = Boolean(change?.text && fromRevision !== '');
        return '<article id="exercise-' + exercise.id + '" class="loaded-bar-focus" tabindex="-1" aria-label="Exercise: ' + escapeHtml(exercise.name) + '">'
          + '<header class="loaded-bar-exercise-heading"><h2><a href="#progress" data-action="open-exercise-history" data-exercise-id="' + exercise.id + '" data-performance-exercise-id="' + escapeHtml(exercise.performanceExerciseId || canonicalExerciseId(exercise)) + '">' + escapeHtml(exercise.name) + '</a></h2>'
          + (isDeloadExposure(session, exercise, rows) ? '<span class="s4a-deload-tag">Deload</span>' : '')
          + '<button class="icon-button" type="button" data-action="exercise-menu" data-exercise-id="' + exercise.id + '" aria-label="Exercise menu for ' + escapeHtml(exercise.name) + '">' + icon.more + '</button></header>'
          + '<section class="loaded-bar-equipment' + (equipment.load ? ' has-plates' : '') + (equipment.tooHeavyToDraw ? ' undrawable-load' : '') + (coachChange ? ' coach-change' : '') + '" aria-label="Target equipment">'
          + api.renderEquipment({ ...equipment, size: 'hero', collar: reason ? 'flag' : 'steel', ...(change?.text ? { previousPerSide: previousBar.perSide } : {}) })
          + (equipment.target === null ? '' : '<div class="loaded-bar-total">' + escapeHtml(equipment.equipmentClass === 'dumbbell' ? api.dumbbellLabel(equipment.target) || api.formatLoad(equipment.target) : api.formatLoad(equipment.target)) + '<small>' + equipment.unit.toUpperCase() + '</small></div>')
          + (equipment.load ? '<div class="loaded-bar-per-side"><span>Each side</span><strong>' + escapeHtml(api.perSideText(equipment.load.perSide) || 'No plates') + '</strong></div>' : '') + '</section>'
          + (reason ? '<p class="loaded-bar-collar-tag" title="' + escapeHtml(reason) + '">' + escapeHtml(reason) + '</p>' : '')
          + '<div class="coach-bounds-slot" data-coach-bounds-slot hidden></div>'
          + (equipment.load?.note || equipment.note ? '<p class="loaded-bar-load-note">' + escapeHtml(equipment.load?.note || equipment.note) + '</p>' : '')
          + renderLoadedBarPlateChange(change, equipment.unit, coachChange)
          + renderResolvedAction(resolvedActionForScope(session, 'exercise', exercise), { session, exercise })
          + renderLoadedBarTable(exercise, context)
          + '<div data-reconcile-slot="' + exercise.id + '">' + renderReconcilePrompt(exercise) + '</div></article>';
      }

      function renderLoadedBarUpNext(exercises, focusedId) {
        const api = ComprehensiveFitnessLoadedBar;
        const complete = (exercise) => {
          const rows = setsForExercise(exercise.id);
          return rows.length > 0 && rows.every((set) => set.completed || set.skipped);
        };
        const remaining = exercises.filter((exercise) => exercise.id !== focusedId && !complete(exercise));
        const done = exercises.filter((exercise) => exercise.id !== focusedId && complete(exercise));
        if (!remaining.length && !done.length) return '';
        const channel = coachingTargetsForSession(sessionById(exercises[0]?.sessionId));
        const renderRow = (exercise, isDone) => {
          const rows = setsForExercise(exercise.id).filter((set) => isWorkingSet(set));
          const first = rows[0] || setsForExercise(exercise.id)[0];
          const equipment = loadedBarEquipmentForSet(exercise, first, channel);
          const type = resistanceTypeFor(exercise, first);
          const summary = rows.map((set) => loadedBarTargetsForSet(set, exercise, channel).reps).filter((value) => value !== '').join(' · ');
          const label = equipment.target === null ? '' : equipment.equipmentClass === 'dumbbell' ? api.dumbbellLabel(equipment.target) || api.formatLoad(equipment.target) : api.formatLoad(equipment.target) + '<small>' + equipment.unit.toUpperCase() + '</small>';
          return '<button class="loaded-bar-next-row' + (isDone ? ' done' : '') + '" type="button" data-action="focus-workout-exercise" data-exercise-id="' + exercise.id + '" aria-label="' + (isDone ? 'Reopen ' : 'Focus ') + escapeHtml(exercise.name) + '">'
            + (isDone ? '<span class="loaded-bar-done-mark" aria-hidden="true">✓</span>' : api.renderEquipment({ ...equipment, size: 'row' }))
            + '<span class="loaded-bar-next-copy"><strong>' + escapeHtml(exercise.name) + '</strong><span>' + (isDone ? 'Done' : escapeHtml(summary + (summary ? type === 'duration' ? ' sec' : type === 'distance' ? ' m' : ' reps' : 'Previous available'))) + '</span></span><em' + (equipment.tooHeavyToDraw ? ' class="undrawable-load"' : '') + '>' + label + '</em></button>';
        };
        return '<section class="loaded-bar-up-next" aria-label="Up next"><header><h3>Up next</h3>' + (remaining.length > 3 ? '<span>Then ' + (remaining.length - 3) + ' more lifts</span>' : '') + '</header>'
          + remaining.map((exercise) => renderRow(exercise, false)).join('') + done.map((exercise) => renderRow(exercise, true)).join('') + '</section>';
      }

      function renderLoadedBarExerciseSheet(exercise, set) {
        const derived = loadedBarEquipmentForSet(exercise, set);
        const correction = data.settings.equipmentCorrections?.find((entry) => entry.exerciseIdentity === derived.identity);
        return '<div class="sheet-backdrop loaded-bar-backdrop" data-action="close-set-sheet" role="presentation"><section class="loaded-bar-sheet loaded-bar-exercise-sheet" role="dialog" aria-modal="true" aria-labelledby="loaded-bar-sheet-title"><h2 id="loaded-bar-sheet-title">' + escapeHtml(exercise.name) + '</h2>'
          + (set ? renderLoadedBarSetTypePicker(set, exercise) : '')
          + '<label class="loaded-bar-deload"><span><b>This was a deload</b><small>Left out of progression, records and trends.</small></span><input type="checkbox" role="switch" aria-label="This exercise was a deload" data-action="exercise-deload" data-exercise-id="' + exercise.id + '"' + (exercise.isDeload ? ' checked' : '') + ' /></label>'
          + '<label class="loaded-bar-equipment-picker">Equipment<select data-action="exercise-equipment" data-exercise-id="' + exercise.id + '"><option value="">Automatic (' + escapeHtml(derived.automaticClass.replace('_', '-')) + ')</option>'
          + ComprehensiveFitnessLoadedBar.EQUIPMENT_CLASSES.map((value) => '<option value="' + value + '"' + (correction?.equipmentClass === value ? ' selected' : '') + '>' + escapeHtml(value.replace('_', '-')) + '</option>').join('') + '</select></label>'
          + '<details class="loaded-bar-exercise-more compact-disclosure"><summary>More exercise options</summary><div class="loaded-bar-exercise-actions"><button type="button" data-action="move-exercise" data-direction="-1" data-exercise-id="' + exercise.id + '" aria-label="Move ' + escapeHtml(exercise.name) + ' up">Move up</button><button type="button" data-action="move-exercise" data-direction="1" data-exercise-id="' + exercise.id + '" aria-label="Move ' + escapeHtml(exercise.name) + ' down">Move down</button><button class="danger" type="button" data-action="delete-exercise" data-exercise-id="' + exercise.id + '" aria-label="Remove exercise ' + escapeHtml(exercise.name) + '">Remove exercise</button></div>'
          + (set ? '<button type="button" data-action="set-type-sheet" data-set-id="' + set.id + '">More set options · set ' + set.setNumber + '</button>' : '')
          + renderLoadedBarExerciseOptions(exercise, true) + '</details><button class="secondary-action" type="button" data-action="close-set-sheet">Done</button></section></div>';
      }

      function renderLoadedBarRestClamp(session, columns = 6) {
        const activeTimer = timer?.workoutId === session?.id ? timer : null;
        if (!activeTimer) {
          const starter = renderSharedRestStarter(session);
          return starter ? '<div role="row" class="loaded-bar-rest-starter"><div role="cell" aria-colspan="' + columns + '">' + starter + '</div></div>' : '';
        }
        const overtime = activeTimer.isOvertime ? Math.max(0, Math.floor((Date.now() - Number(activeTimer.endsAt || Date.now())) / 1000)) : 0;
        const elapsed = activeTimer.isOvertime ? activeTimer.durationSeconds + overtime : Math.max(0, activeTimer.durationSeconds - activeTimer.remainingSeconds);
        const percent = activeTimer.durationSeconds > 0 ? Math.min(100, Math.round(elapsed / activeTimer.durationSeconds * 100)) : 100;
        return '<div class="timer-bar loaded-bar-rest-clamp" role="row" data-timer-id="' + escapeHtml(activeTimer.id) + '" data-phase="' + (activeTimer.isOvertime ? 'overtime' : activeTimer.remainingSeconds <= 10 ? 'final' : 'resting') + '"' + (activeTimer.isPaused ? ' data-paused="true"' : '') + '><div role="cell" aria-colspan="' + columns + '">'
          + '<div class="timer-summary" aria-label="' + escapeHtml(activeTimer.isOvertime ? 'Rest target passed by ' + formatOvertime(overtime) : (activeTimer.isPaused ? 'Paused rest timer' : 'Rest timer') + ', ' + formatTimer(activeTimer.remainingSeconds) + ' remaining') + '"><div class="timer-rest-copy"><span>' + (activeTimer.isPaused ? 'Paused' : 'Rest') + '</span><strong data-timer-progress-label>' + (activeTimer.isOvertime ? '+' + formatOvertime(overtime) : formatTimer(activeTimer.remainingSeconds)) + '</strong></div>'
          + '<div class="loaded-bar-rest-track"><span class="timer-progress" role="progressbar" aria-label="Rest elapsed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '" style="--timer-progress:' + percent + '%"><span></span></span><small data-timer-duration>of ' + formatTimer(activeTimer.durationSeconds) + '</small></div></div>'
          + '<div class="loaded-bar-rest-actions"><button type="button" data-action="adjust-timer" data-seconds="-15" aria-label="Reduce rest by 15 seconds"' + (activeTimer.isPaused || activeTimer.isOvertime ? ' disabled' : '') + '>−15</button><button type="button" data-action="adjust-timer" data-seconds="15" aria-label="Add 15 seconds"' + (activeTimer.isPaused || activeTimer.isOvertime ? ' disabled' : '') + '>+15</button><button type="button" data-action="skip-timer">Skip</button></div>'
          + '<details class="loaded-bar-rest-options"><summary aria-label="More rest timer controls">Timer options</summary><span class="timer-context">' + escapeHtml(timerNextContextLabel(activeTimer) + ' · ' + timerNotificationStatusLabel(activeTimer)) + '</span><button type="button" data-action="toggle-timer"' + (activeTimer.isOvertime ? ' disabled' : '') + ' aria-label="' + (activeTimer.isPaused ? 'Resume timer' : 'Pause timer') + '">' + (activeTimer.isPaused ? 'Resume' : 'Pause') + '</button><button type="button" data-action="clear-timer">Finish rest</button></details></div></div>';
      }

      function setCompletionClock(set) {
        const completedAt = new Date(set?.completedAt || "");
        if (!Number.isFinite(completedAt.getTime())) return "Actual";
        return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(completedAt);
      }

      function loadedBarFlag(set, context) {
        const type = normalizeSetTypeCode(set.setType, set.isWarmup);
        return ({ warmup: "W", drop: "D", failure: "F", top: "T", backoff: "B" })[type]
          || String(Math.max(0, (context.workingSetIds || []).indexOf(set.id)) + 1);
      }

      function renderLoadedBarTable(exercise, context = renderSetContext(exercise)) {
        const rows = setsForExercise(exercise.id);
        const warmups = rows.filter((set) => setTypeSemantics(set).isWarmup);
        const collapsed = warmups.length > 0 && warmups.every((set) => set.completed && !set.skipped) && !loadedBarExpandedWarmups.has(exercise.id);
        const type = resistanceTypeFor(exercise, rows[0]);
        const noLoad = ["duration", "distance"].includes(type);
        const unit = rows.find((set) => set.id === activeSetId)?.weightUnit || rows[0]?.weightUnit || data.settings.weightUnit;
        context.headerUnit = unit;
        const loadTitle = type === "bodyweight" ? "BW" : (type === "bodyweight_plus_load" ? "+" : type === "assisted_bodyweight" ? "−" : "") + unit.toUpperCase();
        const header = '<div class="loaded-bar-head" role="row"><span role="columnheader">Set</span><span role="columnheader">Previous</span>'
          + (noLoad ? '' : '<span role="columnheader">' + loadTitle + '</span>')
          + '<span role="columnheader">' + (type === "duration" ? "SEC" : type === "distance" ? "M" : "Reps") + '</span><span role="columnheader">RPE</span><span role="columnheader" aria-label="Complete">✓</span></div>';
        let summaryShown = false;
        let clampShown = false;
        const body = rows.map((set) => {
          if (collapsed && setTypeSemantics(set).isWarmup) {
            if (summaryShown) return '';
            summaryShown = true;
            const loads = warmups.map((row) => {
              const resistance = resistanceTypeFor(exercise, row);
              const load = loadedBarNumber(resistance === 'bodyweight_plus_load' ? row.addedLoad : resistance === 'assisted_bodyweight' ? row.assistanceLoad : row.weight);
              return (load === '' ? '—' : formatLoadNumber(load)) + (row.weightUnit && row.weightUnit !== unit ? ' ' + row.weightUnit : '');
            });
            return '<div class="loaded-bar-warmup-summary" role="row"><div role="cell" aria-colspan="' + (noLoad ? 5 : 6) + '"><button type="button" data-action="toggle-warmups" data-exercise-id="' + exercise.id + '" aria-expanded="false"><b>W</b><span>' + warmups.length + ' warm-ups · ' + escapeHtml(loads.join(' · ')) + '</span><span aria-label="Completed">✓</span></button></div></div>';
          }
          const clamp = context.renderRestClamp && set.id === context.focusSetId ? renderLoadedBarRestClamp(sessionById(exercise.sessionId), noLoad ? 5 : 6) : '';
          if (clamp) clampShown = true;
          return clamp + renderSet(set, exercise, context);
        }).join('');
        return '<div class="loaded-bar-table' + (noLoad ? ' no-load' : '') + '" role="table" aria-label="Sets for ' + escapeHtml(exercise.name) + '">' + header + body + (context.renderRestClamp && !clampShown ? renderLoadedBarRestClamp(sessionById(exercise.sessionId), noLoad ? 5 : 6) : '') + '</div>';
      }

      function renderSet(set, exercise, context = {}) {
        const session = sessionById(exercise.sessionId);
        const readOnly = isSessionSubmitted(session) && !isEditingHistorySession(session.id);
        const type = resistanceTypeFor(exercise, set);
        const noLoad = ["duration", "distance"].includes(type);
        const unit = set.weightUnit || data.settings.weightUnit;
        const state = context.focusSetId && !set.completed && !set.skipped ? (context.focusSetId === set.id ? "current" : "future") : setVisualState(set);
        const targets = loadedBarTargetsForSet(set, exercise, context.coachChannel);
        const revision = targets.row?.revision;
        const revised = Boolean(revision && !revision.locked && !set.completed && !set.skipped);
        const role = normalizeSetTypeCode(set.setType, set.isWarmup);
        const previous = set.previousComparableSet || previousComparableSetForRole(context.previousSets || [], role, set.setTypeIndex, Math.max(0, (context.workingSetIds || []).indexOf(set.id)));
        const previousEffort = loadedBarNumber(previous?.rpe);
        const previousText = !previous ? '—' : noLoad
          ? formatLoadNumber(type === 'duration' ? previous.durationSeconds ?? previous.reps : previous.distance ?? previous.reps) + (type === 'duration' ? ' sec' : ' ' + (previous.distanceUnit || 'm')) + (previousEffort === '' ? '' : ' @ ' + previousEffort)
          : (type === 'bodyweight' ? 'BW' : (type === 'bodyweight_plus_load' ? '+' : type === 'assisted_bodyweight' ? '−' : '') + formatLoadNumber(resistanceLoad(previous, type, unit))) + ' × ' + (previous.reps ?? '—') + (previousEffort === '' ? '' : ' @ ' + previousEffort);
        const previousField = previous?.priorSessionId
          ? '<a class="set-previous-link" href="#progress" data-action="open-session" data-session-id="' + escapeHtml(previous.priorSessionId) + '" data-exercise-id="' + escapeHtml(previous.priorExerciseId || '') + '" data-return-exercise-id="' + escapeHtml(exercise.id) + '" title="Open previous workout' + (previous.priorSessionDate ? ' · ' + escapeHtml(formatDate(previous.priorSessionDate)) : '') + '">' + escapeHtml(previousText) + '</a>'
          : '<span title="' + (previous ? 'Previous session' : 'No previous workout found') + '">' + escapeHtml(previousText) + '</span>';
        const actualLoad = loadedBarNumber(type === 'bodyweight_plus_load' ? set.addedLoad ?? set.weight : type === 'assisted_bodyweight' ? set.assistanceLoad ?? set.weight : set.weight);
        const metric = type === 'duration' ? 'durationSeconds' : type === 'distance' ? 'distance' : 'reps';
        const action = type === 'duration' ? 'set-duration' : type === 'distance' ? 'set-distance' : 'set-reps';
        const prompt = loadedBarPrompts.get(set.id);
        const cell = (field, editAction, value, placeholder, label, was = '') => {
          const changed = revised && loadedBarNumber(was) !== '' && loadedBarNumber(was) !== loadedBarNumber(placeholder);
          const input = readOnly ? '<strong>' + escapeHtml(loadedBarNumber(value) === '' ? '—' : value) + '</strong>'
            : '<input type="number" min="0"' + (field === 'rpe' ? ' max="10" step="0.5"' : field === 'weight' || field === 'distance' ? ' step="any"' : ' step="1"')
              + ' value="' + escapeHtml(value ?? '') + '"' + (field === 'rpe' || targets.suppressed ? '' : ' placeholder="' + escapeHtml(placeholder) + '"')
              + ' data-action="' + editAction + '" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' ' + escapeHtml(label) + '"'
              + (prompt?.field === field ? ' aria-invalid="true" aria-describedby="set-prompt-' + set.id + '"' : '') + ' />';
          return '<div' + (field === 'rpe' ? '' : ' role="cell"') + ' class="loaded-bar-cell' + (changed ? ' revised-cell' : '') + '">' + input
            + (field === 'weight' && context.headerUnit && unit !== context.headerUnit ? '<small class="loaded-bar-unit">' + unit.toUpperCase() + '</small>' : '')
            + (changed ? '<del class="loaded-bar-was" aria-label="Was ' + escapeHtml(was) + '">' + escapeHtml(was) + '</del>' : '') + '</div>';
        };
        const fromLoad = loadedBarNumber(revision?.from?.load);
        const wasLoad = fromLoad === '' ? '' : revision.from.unit && revision.from.unit !== unit ? fromLoad * (revision.from.unit === 'lb' ? 1 / 2.2046226218 : 2.2046226218) : fromLoad;
        const band = [set.targetRpeMin, set.targetRpeMax ?? set.targetRpe];
        const rpeHint = band?.every((value) => loadedBarNumber(value) !== '') ? band.join('–') : '';
        const safety = guardWorkoutMutation('toggle-set', { exercise, set }, false);
        const attributes = ' data-set-id="' + set.id + '"';
        const flag = loadedBarFlag(set, context);
        const typeField = readOnly ? '<strong>' + flag + '</strong>' : '<button type="button" data-action="set-type-sheet"' + attributes + ' aria-label="Set ' + set.setNumber + ' type: ' + escapeHtml(setTypeLabels[role] || role) + '">' + flag + '</button>';
        const status = readOnly ? '<span aria-label="' + (set.skipped ? 'Skipped' : set.completed ? 'Completed' : 'Incomplete') + '">' + (set.skipped ? '—' : set.completed ? '✓' : '○') + '</span>'
          : '<button class="check-button ' + (set.completed ? 'checked' : '') + '" type="button" data-action="toggle-set"' + attributes + ' aria-label="' + (set.completed ? 'Reopen' : 'Complete') + ' set ' + set.setNumber + '" aria-pressed="' + Boolean(set.completed) + '"' + workoutSafetyDisabledAttributes(safety) + '>' + icon.done + '</button>';
        return '<div id="set-' + set.id + '" role="row" data-set-state="' + state + '" data-set-mode="' + (readOnly ? 'readonly' : set.completed ? 'logged' : state === 'current' ? 'current' : 'pending') + '" class="set-block loaded-bar-row ' + (state === 'current' ? 'next-set' : '') + (set.completed ? ' completed' : '') + (set.skipped ? ' skipped-set' : '') + (revised ? ' revised-row' : '') + '">'
          + '<div role="cell" class="loaded-bar-type">' + typeField + '</div><div role="cell" class="loaded-bar-previous">' + previousField + '</div>'
          + (noLoad ? '' : type === 'bodyweight' ? '<div role="cell" class="loaded-bar-cell">BW</div>' : cell('weight', 'set-weight', actualLoad, targets.weight, 'load ' + unit, wasLoad))
          + cell(metric, action, set[metric], targets[metric], type === 'duration' ? 'seconds' : type === 'distance' ? 'distance metres' : 'reps', revision?.from?.reps)
          + '<div role="cell" class="loaded-bar-rpe">' + cell('rpe', 'set-rpe', loadedBarNumber(set.rpe), '', 'RPE') + (readOnly || targets.suppressed || !rpeHint || state !== 'current' ? '' : '<small class="loaded-bar-rpe-hint">' + rpeHint + '</small>') + '</div>'
          + '<div role="cell" class="loaded-bar-status">' + status + '</div>'
          + (targets.row?.optional ? '<small class="loaded-bar-optional">optional</small>' : '')
          + (revised ? '<div class="loaded-bar-revision" role="cell" aria-colspan="' + (noLoad ? 5 : 6) + '"><span>Target changed</span>' + (readOnly ? '' : '<button type="button" data-action="undo-coach-revision" data-session-id="' + session.id + '"' + attributes + '>↶ Undo</button>') + '</div>' : '')
          + (state === 'current' && !readOnly && !noLoad ? renderLoadedBarRepPips(set, targets.reps) : '')
          + (prompt ? '<span class="loaded-bar-prompt" id="set-prompt-' + set.id + '" role="status">' + escapeHtml(prompt.prompt) + '</span>' : '') + '</div>';
      }

      function renderLoadedBarSetTypePicker(set, exercise) {
        const type = normalizeSetTypeCode(set.setType, set.isWarmup);
        const choices = ['warmup', 'straight', 'drop', 'failure', ...(['top', 'backoff'].includes(type) ? ['top', 'backoff'] : [])];
        const context = { workingSetIds: setsForExercise(exercise.id).filter((row) => isWorkingSet(row)).map((row) => row.id) };
        return '<p>Set type · set ' + set.setNumber + '</p><div class="loaded-bar-type-choices" role="group" aria-label="Set type">' + choices.map((choice) => '<button type="button" data-action="choose-set-type" data-set-id="' + set.id + '" data-set-type="' + choice + '" aria-pressed="' + (choice === type) + '"><b>' + loadedBarFlag({ ...set, setType: choice, isWarmup: choice === 'warmup' }, context) + '</b><span>' + (choice === 'straight' ? 'Working' : escapeHtml(setTypeLabels[choice])) + '</span></button>').join('') + '</div>'
;
      }

      function renderLoadedBarSetSheet() {
        const set = loadedBarSheet ? setById(loadedBarSheet.setId) : null;
        const exercise = loadedBarSheet?.exerciseId ? exerciseById(loadedBarSheet.exerciseId) : set ? exerciseById(set.exerciseId) : null;
        if (!exercise) return '';
        if (loadedBarSheet.mode === 'exercise') return renderLoadedBarExerciseSheet(exercise, set);
        if (!set) return '';
        const type = normalizeSetTypeCode(set.setType, set.isWarmup);
        const types = renderLoadedBarSetTypePicker(set, exercise)
          + '<label class="loaded-bar-other-type">Other set types<select data-action="set-type-override" data-set-id="' + set.id + '">' + Object.keys(setTypeLabels).map((choice) => '<option value="' + choice + '"' + (choice === type ? ' selected' : '') + '>' + escapeHtml(setTypeLabels[choice]) + '</option>').join('') + '</select></label>'
          + (set.classificationUndo ? '<button type="button" data-action="undo-set-type-override" data-set-id="' + set.id + '">Undo type change</button>' : '')
          + '<label class="loaded-bar-deload"><span><b>This was a deload</b><small>Left out of progression, records and trends.</small></span><input type="checkbox" data-action="exercise-deload" data-exercise-id="' + exercise.id + '"' + (exercise.isDeload ? ' checked' : '') + ' /></label>'
          + '<details class="set-tools-disclosure loaded-bar-tools"><summary>More set options</summary><div class="set-actions">'
          + '<label>Rest seconds<input type="number" min="0" max="3600" step="1" value="' + (set.targetRestSeconds ?? exercise.restSeconds ?? data.settings.defaultRestSeconds ?? 90) + '" data-action="set-rest-seconds" data-set-id="' + set.id + '" aria-label="Rest seconds after set ' + set.setNumber + '"' + (set.completed ? ' disabled' : '') + ' /></label>'
          + '<button type="button" data-action="add-warmup-set" data-exercise-id="' + exercise.id + '" data-before-set-id="' + set.id + '">Insert warm-up above</button>'
          + '<button type="button" data-action="toggle-skip-set" data-set-id="' + set.id + '">' + (set.skipped ? 'Unskip' : 'Skip') + '</button>'
          + '<button class="danger" type="button" data-action="delete-set" data-set-id="' + set.id + '">Remove</button></div></details>';
        const rpe = '<p>RPE · set ' + set.setNumber + '</p><div class="loaded-bar-rpe-choices">' + Array.from({ length: 9 }, (_, index) => 6 + index * 0.5).map((value) => '<button type="button" data-action="choose-set-rpe" data-set-id="' + set.id + '" data-value="' + value + '">' + value + '</button>').join('') + '<button type="button" data-action="choose-set-rpe" data-set-id="' + set.id + '" data-value="">Clear</button></div><label>RPE<input type="number" min="0" max="10" step="0.5" value="' + loadedBarNumber(set.rpe) + '" data-action="set-rpe" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' RPE" /></label>';
        return '<div class="sheet-backdrop loaded-bar-backdrop" data-action="close-set-sheet" role="presentation"><section class="loaded-bar-sheet" role="dialog" aria-modal="true" aria-labelledby="loaded-bar-sheet-title"><h2 id="loaded-bar-sheet-title">' + escapeHtml(exercise.name) + '</h2>' + (loadedBarSheet.mode === 'rpe' ? rpe : types) + '<button class="secondary-action" type="button" data-action="close-set-sheet">Done</button></section></div>';
      }

      function timerNotificationStatusLabel(timerSnapshot) {
        return timerSnapshot?.isOvertime
          ? "Target reached"
          : timerSnapshot?.notificationStatus === "scheduled"
          ? "Lock-screen alert scheduled"
          : timerSnapshot?.notificationStatus === "error"
            ? "Foreground alert only"
            : timerSnapshot?.notificationStatus === "paused"
              ? "Notification paused"
              : "Scheduling alert";
      }

      function timerNextContextLabel(timerSnapshot) {
        const sourceExercise = exerciseById(timerSnapshot?.exerciseId);
        const nextSet = setById(timerSnapshot?.pendingNextSetId);
        const nextExercise = nextSet ? exerciseById(nextSet.exerciseId) : null;
        return nextSet
          ? "Next: " + (nextExercise?.name || sourceExercise?.name || "Exercise") + " · Set " + Number(nextSet.setNumber || 1)
          : "Final set";
      }

      function renderTimerCompleteNotice() {
        const visibleNotice = restCompletionController?.getVisibleNotice() || timerCompleteNotice;
        if (!visibleNotice) return "";
        return `
          <div class="timer-complete-toast" role="alertdialog" aria-live="assertive" aria-label="Rest complete, ${escapeHtml(visibleNotice.setLabel || "next set")} ready">
            <span class="timer-complete-icon">&#10003;</span>
            <div><strong>Rest Complete</strong><span>${escapeHtml(visibleNotice.exerciseName)}${visibleNotice.setLabel ? " &#8226; " + escapeHtml(visibleNotice.setLabel) : ""}</span></div>
            <div class="timer-complete-actions"><button type="button" data-action="return-to-rest-workout">Return to Workout</button><button class="mini-button" type="button" data-action="dismiss-timer-notice" aria-label="Dismiss rest complete alert">Dismiss</button></div>
          </div>
        `;
      }
