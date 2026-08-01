
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
        const modalOpen = Boolean(templateStartFlow || optionalReadinessFlow || cancelWorkoutFlow || historyEditConfirm || clearDataFlow?.open);
        const dialogKey = activeDialogKey();
        const sameDialogFocus = dialogKey && dialogKey === renderedDialogKey ? focusDescriptorForElement(document.activeElement) : null;
        document.body.classList.toggle("modal-open", modalOpen);
        const viewHtml = measurePerformance("renderView:" + activeTab, renderViewSafely, { tab: activeTab, sessions: data.sessions.length, exercises: data.exercises.length, sets: data.sets.length });
        const shellWorkoutVisible = activeTab === "workout" && hasActiveWorkout() && activeWorkoutId === session.id && !viewingHistorySessionId && !completedSummarySessionId;
        const shellWorkoutDockVisible = shellWorkoutVisible;
        const shellTitle = ({ today: "Today", progress: "Progress", routines: "Routines", settings: "Settings", workout: "Workout" })[activeTab] || "Today";
        const shellCurrentContext = shellWorkoutDockVisible ? workoutProgress().current : "";
        const shellActions = activeTab === "routines" || activeTab === "settings"
          ? '<button class="shell-context-action" type="button" data-action="close-secondary-context">Back to Today</button>'
          : activeTab === "workout"
            ? '<button class="shell-context-action" type="button" data-action="close-workout-context">Back to Today</button>'
            : '<div class="shell-context-actions"><button type="button" data-action="open-routines">Routines</button><button type="button" data-action="open-settings">Settings</button></div>';
        const shellContext = shellWorkoutDockVisible
          ? '<div class="shell-context"><h1>' + escapeHtml(session.title || "Workout") + '</h1><span class="shell-session-state">In progress</span><small>' + escapeHtml(shellCurrentContext) + '</small></div>' + shellActions
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
            <main class="app-main" id="main-content" tabindex="-1" ${modalOpen ? 'inert aria-hidden="true"' : ""}>${viewHtml}</main>
            ${shellWorkoutDockVisible ? renderSessionDock(session, workoutProgress(), { inert: modalOpen }) : activeTab === "workout" ? "" : `<nav class="bottom-nav" aria-label="Main navigation" ${modalOpen ? 'inert aria-hidden="true"' : ""}>
              ${navButton("today", "Today", "workout")}
              ${navButton("progress", "Progress", "review")}
            </nav>`}
            ${renderTemplateStartSheet()}
            ${renderOptionalReadinessSheet()}
            ${renderCancelWorkoutSheet()}
            ${renderHistoryEditConfirmSheet()}
            ${renderClearDataSheet()}
            ${renderTimerCompleteNotice()}
          </div>
        `;
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
        if (dockCompleted) dockCompleted.textContent = progress.completed + " of " + progress.total + " sets";
        if (dockElapsed) dockElapsed.textContent = progress.elapsed;
        root.querySelectorAll("[data-session-dock-track] .seg").forEach((segment, index) => segment.classList.toggle("filled", index < Math.round((progress.completed / Math.max(1, progress.total)) * 10)));
      }

      function renderSetContext(exercise) {
        const exerciseSets = setsForExercise(exercise.id);
        const restSeconds = Number(exercise.restSeconds || data.settings.defaultRestSeconds || 90);
        return {
          restSeconds,
          previousSets: exerciseSets.some((set) => isWorkingSet(set, "progression"))
            ? measurePerformance("lift:previousPerformance", () => getMostRecentWorkoutSets(exercise.name, {
                excludeSessionId: exercise.sessionId,
                resistanceType: resistanceTypeFor(exercise),
                canonicalExerciseId: exercise.performanceExerciseId || canonicalExerciseId(exercise)
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
        const bar = root.querySelector('.timer-bar[data-timer-id="' + CSS.escape(timer.id) + '"]') || root.querySelector(".workout-timer-slot > .timer-bar");
        if (!bar) return;
        bar.dataset.timerId = timer.id;
        const stateLabel = bar.querySelector(".timer-rest-copy > span");
        const nextLabel = bar.querySelector(".timer-rest-copy > small");
        const context = bar.querySelector(".timer-context");
        const pause = bar.querySelector('[data-action="toggle-timer"]');
        if (stateLabel) stateLabel.textContent = timer.isPaused ? "Paused" : "Rest";
        if (nextLabel) nextLabel.textContent = timerNextContextLabel(timer);
        bar.toggleAttribute("data-paused", timer.isPaused);
        if (context) context.textContent = timerNextContextLabel(timer) + " · " + timerNotificationStatusLabel(timer);
        if (pause) {
          pause.innerHTML = timer.isPaused ? icon.play : icon.pause;
          pause.setAttribute("title", timer.isPaused ? "Resume timer" : "Pause timer");
          pause.setAttribute("aria-label", timer.isPaused ? "Resume timer" : "Pause timer");
        }
        updateTimerDisplay();
      }

      function removeTimerDom(timerSnapshot) {
        const block = document.getElementById("set-" + (timerSnapshot?.setId || ""));
        const bar = root.querySelector('.timer-bar[data-timer-id="' + CSS.escape(timerSnapshot?.id || "") + '"]') || root.querySelector(".workout-timer-slot > .timer-bar");
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
        return '<div class="banner offline offline-banner" role="status"><span class="b-copy"><b>Offline</b><span>Workout logging and local changes continue. Notifications and cloud-copy operations wait for a connection.</span></span><span class="b-act" aria-hidden="true">Local mode</span></div>';
      }

      function navButton(tab, label, iconKey) {
        const active = activeTab === tab;
        return '<button class="nav-button ' + (active ? "active" : "") + '" data-action="set-tab" data-tab="' + tab + '" type="button"' + (active ? ' aria-current="page"' : '') + ' aria-label="' + escapeHtml(label) + '"><span class="nav-icon" aria-hidden="true">' + icon[iconKey] + '</span><span>' + label + '</span></button>';
      }

      function renderView() {
        if (activeTab === "progress") return renderProgress();
        if (activeTab === "routines") return renderTemplates();
        if (activeTab === "settings") return renderSettings();
        if (activeTab === "today") return renderLiftHome();
        return renderWorkout();
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
        return `<aside class="session-dock" aria-label="Workout session controls" ${inert ? 'inert aria-hidden="true"' : ""}>
          <span class="session-dock-progress"><strong data-session-dock-progress>${progress.completed} of ${progress.total} sets</strong><span class="track" data-session-dock-track aria-label="${progress.completed} of ${progress.total} sets completed">${Array.from({ length: 10 }, (_, index) => '<i class="seg ' + (index < Math.round((progress.completed / Math.max(1, progress.total)) * 10) ? 'filled' : '') + '"></i>').join("")}</span><small data-session-dock-elapsed>${escapeHtml(progress.elapsed)}</small><i class="session-dock-elapsed-rule" aria-hidden="true"></i></span>
          <button class="primary-action session-dock-finish" type="button" data-action="request-submit-workout">Finish</button>
          <details class="session-overflow session-dock-overflow"><summary class="icon-button" data-action="session-menu" aria-label="Workout menu">${icon.more}</summary><div class="session-overflow-menu">
            <button type="button" data-action="log-workout-readiness">${icon.info}<span>Log readiness</span></button>
            <button type="button" data-action="save-template">${icon.templates}<span>Save as template</span></button>
            ${sessionCanBeDiscarded(session) ? '<button class="danger" type="button" data-action="request-cancel-workout" data-session-id="' + session.id + '">' + icon.delete + '<span>Cancel workout</span></button>' : ''}
          </div></details>
        </aside>`;
      }

      function renderProgress() {
        return renderLiftProgress();
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
        const activeExecution = session.id === activeWorkoutId && hasActiveWorkout() && !historyReadOnly;
        const addExerciseSafety = guardWorkoutMutation("add-exercise", {}, false);
        if (activeWorkoutId === session.id) ensureActiveSet();
        const progress = workoutProgress();
        const workoutExercises = activeExercises();
        const canReturnToActiveSession = historyReadOnly && hasActiveWorkout() && activeWorkoutId && activeWorkoutId !== session.id;
        const exerciseHtml = workoutExercises.length ? measurePerformance("lift:exerciseList", () => workoutExercises.map((exercise) => renderExercise(exercise)).join(""), { count: workoutExercises.length }) : "";
        return `
          <section class="view workout-view ${historyReadOnly ? "history-readonly" : ""} ${editingHistory ? "history-editing" : ""}">
            <section class="active-workout-hero ${activeExecution ? "execution-hero" : ""}">
              ${activeExecution
                ? '<div class="current-workout-heading"><div class="section-kicker">Current focus</div><strong>' + escapeHtml(progress.current) + '</strong><small>' + (progress.remaining ? progress.remaining + ' working set' + (progress.remaining === 1 ? '' : 's') + ' remain' : 'Review the session, then submit when it is complete') + '</small></div>'
                : '<div class="workout-heading"><div><div class="section-kicker">Today</div><h1>' + escapeHtml(session.title || "Workout") + '</h1></div><span class="status-pill ' + (isSessionSubmitted(session) ? 'good' : 'neutral') + '">' + (isSessionSubmitted(session) ? 'Logged' : 'Ready') + '</span></div>'}
            </section>
            ${renderResolvedAction(resolvedActionForScope(session, "session"), { session })}
            <div class="workout-timer-slot" aria-live="polite">${timer?.workoutId === session.id ? renderTimer(timer.setId) : renderSharedRestStarter(session)}</div>
            ${renderNotificationPrompt()}
            <div class="workout-layout compact-workout-layout">
              <div class="workout-focus-column">
                ${exerciseHtml}
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
            ${editingHistory ? '<section class="history-edit-bar"><div><strong>Editing logged workout</strong><span>Changes remain temporary until you confirm Save Edits. The stored historical grade and algorithm version remain unchanged.</span></div><div class="history-edit-actions"><button class="primary-action" type="button" data-action="request-save-history-edits">Save Edits</button><button class="secondary-action" type="button" data-action="request-cancel-history-edits">Cancel Edits</button></div></section>' : ''}
            ${historyReadOnly && completedSummarySessionId !== session.id ? renderCompletedWorkoutSummary(session, { history: true }) : ''}
            ${historyReadOnly ? '<div class="history-view-actions"><button class="primary-action" type="button" data-action="begin-history-edit">Edit History</button><button class="secondary-action" type="button" data-action="return-lift-home">Return to Lift Home</button></div>' : ''}
              </div>
            </div>
            ${pendingSubmitSessionId === session.id ? renderSubmitConfirmation(session) : ""}
            ${canReturnToActiveSession ? '<button class="return-active-session-fab" type="button" data-action="return-to-active-session">Return to active session</button>' : ''}
          </section>
        `;
      }

      function resolvedActionForScope(session, scopeType, exercise = null) {
        const actions = Array.isArray(session?.resolvedActions)
          ? session.resolvedActions.filter((item) => item?.outcome === "action" && item.scope?.type === scopeType)
          : [];
        if (scopeType !== "exercise" || !exercise) return actions[0] || null;
        const identities = new Set([
          exercise.id,
          exercise.performanceExerciseId,
          exercise.researchExerciseId,
          canonicalExerciseId(exercise)
        ].map((value) => String(value || "")).filter(Boolean));
        return actions.find((item) => identities.has(String(item.scope.exerciseVariantId || ""))) || null;
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
        return '<article class="recommendation resolved-action-card ' + escapeHtml(category || "change") + '" role="status"><span>' + escapeHtml(scope) + '</span><h2>' + escapeHtml(titles[code] || categoryFallbacks[category] || "Adjust today’s workout") + '</h2><p>' + escapeHtml(reason) + '</p></article>';
      }

      function renderLiftHome() {
        const nextTemplate = data.templates[0] || null;
        const running = activeWorkoutSession();
        if (running) {
          const exerciseIds = new Set(data.exercises.filter((exercise) => exercise.sessionId === running.id).map((exercise) => exercise.id));
          const workSets = data.sets.filter((set) => exerciseIds.has(set.exerciseId) && isWorkingSet(set, "score"));
          const completed = workSets.filter((set) => set.completed && !set.skipped).length;
          return `
            <section class="view lift-home-view">
              <div class="workout-heading today-heading"><div><div class="section-kicker">${escapeHtml(new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(todayIso() + "T12:00:00")))}</div><h1>Today</h1></div><span class="status-pill inside">In progress</span></div>
              <section class="coach-lead today-coach">
                <div class="section-kicker">Workout in progress</div>
                <h2>${escapeHtml(running.title || "Current workout")}</h2>
                <p>${completed} of ${workSets.length} working sets logged. Your draft is saved on this device.</p>
                <div class="module-action-row"><button class="primary-action today-primary-action" type="button" data-action="resume-active-workout">Resume</button></div>
              </section>
              ${renderQuickStartTemplates(running.templateId || "")}
            </section>`;
        }
        const previewNames = nextTemplate?.exercises?.map((exercise) => String(exercise.name || "").trim()).filter(Boolean) || [];
        const previewText = previewNames.length
          ? previewNames.slice(0, 4).join(" · ") + (previewNames.length > 4 ? " · +" + (previewNames.length - 4) + " more" : "")
          : "No exercises have been added yet.";
        return `
          <section class="view lift-home-view">
            <div class="workout-heading today-heading"><div><div class="section-kicker">${escapeHtml(new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(todayIso() + "T12:00:00")))}${nextTemplate ? " · " + escapeHtml(nextTemplate.name) : ""}</div><h1>Today</h1></div><span class="status-pill inside">${nextTemplate ? "Ready" : "Plan needed"}</span></div>
            ${renderResolvedAction(resolvedActionForScope(running, "session"), { session: running })}
            <section class="coach-lead today-coach">
              <div class="section-kicker">${nextTemplate ? "Expected workout" : "Next action"}</div>
              <h2>${nextTemplate ? escapeHtml(nextTemplate.name) : "Create your first reusable workout"}</h2>
              <p>${nextTemplate ? escapeHtml(previewText) : "Once a template exists, Today will identify the expected workout."}</p>
              <div class="module-action-row">${nextTemplate
                ? '<button class="primary-action today-primary-action" type="button" data-action="start-next-template" data-template-id="' + escapeHtml(nextTemplate.id) + '">Start</button><button class="secondary-action" type="button" data-action="log-template-readiness" data-template-id="' + escapeHtml(nextTemplate.id) + '">Log readiness</button>'
                : '<button class="primary-action today-primary-action" type="button" data-action="open-routines">Create a workout routine</button>'}</div>
            </section>
            ${renderQuickStartTemplates(nextTemplate?.id || "")}
          </section>`;
      }

      function workoutProgress() {
        const session = activeSession();
        const exercises = activeExercises();
        const running = Boolean(session && session.id === activeWorkoutId && hasActiveWorkout());
        const visibleTimer = timer?.workoutId === session?.id ? timer : null;
        const workSets = exercises.flatMap((exercise) => setsForExercise(exercise.id).filter((set) => isWorkingSet(set, "score")));
        const activeSet = data.sets.find((set) => set.id === activeSetId);
        const activeExercise = activeSet ? exercises.find((exercise) => exercise.id === activeSet.exerciseId) : null;
        const waitingSet = visibleTimer ? data.sets.find((set) => set.id === visibleTimer.pendingNextSetId) : null;
        const waitingExercise = waitingSet ? exercises.find((exercise) => exercise.id === waitingSet.exerciseId) : null;
        const startedAt = new Date(session?.startedAt || Date.now()).getTime();
        const elapsedMinutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
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
            ? (elapsedMinutes < 60 ? elapsedMinutes + "m elapsed" : Math.floor(elapsedMinutes / 60) + "h " + (elapsedMinutes % 60) + "m elapsed")
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
        const started = new Date(session.startedAt || session.createdAt || "").getTime();
        const ended = new Date(session.submittedAt || session.updatedAt || "").getTime();
        const measured = Number.isFinite(started) && Number.isFinite(ended) && ended > started ? Math.round((ended - started) / 60000) : 0;
        const durationMinutes = measured > 0 && measured < 720 ? measured : null;
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
                    <small>${template.exercises.length} lifts · ${templateExerciseCount(template)} working sets</small>
                    <span>${isActiveTemplate ? "Resume workout" : "Start workout"}</span>
                  </button>
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
          draft: session ? cleanRecovery(sessionRecovery(session)) : defaultRecovery()
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
        else syncTemplateReadinessDeltas();
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

      function pips(completed, total, label = "") {
        const maximum = Math.max(0, Math.floor(Number(total) || 0));
        const current = Math.max(0, Math.min(maximum, Math.floor(Number(completed) || 0)));
        if (!maximum) return "";
        return '<span class="pips" role="img" aria-label="' + escapeHtml(label || current + " of " + maximum) + '">' + Array.from({ length: maximum }, (_, index) => '<i' + (index < current ? ' class="on"' : '') + '></i>').join("") + '</span>';
      }

      function sparkline(values, { width = 64, height = 18, tone = "none", label = "Trend" } = {}) {
        const points = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
        if (points.length < 2) return "";
        const min = Math.min(...points);
        const max = Math.max(...points);
        const span = max - min || 1;
        const coordinates = points.map((value, index) => {
          const x = index / (points.length - 1) * width;
          const y = height - ((value - min) / span * (height - 2) + 1);
          return x.toFixed(2) + "," + y.toFixed(2);
        }).join(" ");
        return '<span class="sparkline d ' + escapeHtml(tone) + '"><svg role="img" aria-label="' + escapeHtml(label) + '" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '"><polyline points="' + coordinates + '" /></svg></span>';
      }

      function noData(label = "No recorded data") {
        return '<span class="no-data" title="' + escapeHtml(label) + '" aria-label="' + escapeHtml(label) + '">—</span>';
      }

      function readinessMetricDelta(field, value, baseline = readinessBaseline()) {
        const numeric = value === "" || value == null ? null : Number(value);
        const baselineValue = Number(baseline[field]);
        const unit = field === "sleepHours" ? " h" : field === "hrv" ? " ms" : field === "restingHr" ? " bpm" : field === "sleepQuality" || field === "soreness" ? "/5" : "";
        if (numeric === null || !Number.isFinite(numeric)) return { text: "Enter today’s value", tone: "none" };
        if (!Number.isFinite(baselineValue) || ((field === "hrv" || field === "restingHr") && baseline[field] === "")) return { text: "No stored baseline", tone: "none" };
        const delta = Number((numeric - baselineValue).toFixed(field === "sleepHours" ? 2 : 0));
        if (delta === 0) return { text: "at usual", tone: "none" };
        return { text: (delta > 0 ? "+" : "−") + Math.abs(delta) + unit + " vs usual", tone: "none" };
      }

      function readinessMetricField({ field, label, action, value, min, max, step, unit }) {
        const baseline = readinessBaseline();
        const delta = readinessMetricDelta(field, value, baseline);
        const baselineValue = baseline[field] === "" ? "not set" : baseline[field] + unit;
        return '<div class="field readiness-field"><div class="f-top"><label class="f-name" for="template-readiness-' + field + '">' + escapeHtml(label) + '</label><span class="f-help">usual ' + escapeHtml(baselineValue) + '</span></div><div class="stepper"><button class="sb" type="button" data-action="adjust-template-readiness" data-field="' + field + '" data-step="' + (-step) + '" aria-label="Decrease ' + escapeHtml(label) + '">−</button><input class="sv" id="template-readiness-' + field + '" type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' + escapeHtml(value) + '" data-action="' + action + '" aria-label="' + escapeHtml(label) + '" /><button class="sb" type="button" data-action="adjust-template-readiness" data-field="' + field + '" data-step="' + step + '" aria-label="Increase ' + escapeHtml(label) + '">+</button><span class="d ' + delta.tone + '" data-readiness-delta="' + field + '">' + escapeHtml(delta.text) + '</span></div></div>';
      }

      function readinessSegmentedField({ field, label, action, value, options }) {
        return '<fieldset class="field readiness-field"><legend class="f-name">' + escapeHtml(label) + '</legend><div class="segmented" role="radiogroup" aria-label="' + escapeHtml(label) + '">' + options.map(([optionValue, optionLabel]) => '<label><input type="radio" name="template-readiness-' + field + '" value="' + escapeHtml(optionValue) + '" data-action="' + action + '" ' + (String(value) === String(optionValue) ? 'checked' : '') + ' /><span>' + escapeHtml(optionLabel) + '</span></label>').join('') + '</div></fieldset>';
      }

      function syncTemplateReadinessDeltas() {
        if (!optionalReadinessFlow) return;
        const baseline = readinessBaseline();
        ["sleepHours", "sleepQuality", "hrv", "restingHr", "soreness"].forEach((field) => {
          const node = root.querySelector('[data-readiness-delta="' + field + '"]');
          if (!node) return;
          const delta = readinessMetricDelta(field, optionalReadinessFlow.draft[field], baseline);
          node.className = "d " + delta.tone;
          node.textContent = delta.text;
        });
      }

      function adjustTemplateReadinessMetric(field, step) {
        if (!optionalReadinessFlow) return;
        const domains = { sleepHours: { min: 0, max: 14 }, hrv: { min: 0, max: 400 }, restingHr: { min: 0, max: 240 } };
        const domain = domains[field];
        if (!domain) return;
        const current = Number(optionalReadinessFlow.draft[field] === "" ? readinessBaseline()[field] || domain.min : optionalReadinessFlow.draft[field]);
        const next = Math.max(domain.min, Math.min(domain.max, Number((current + Number(step || 0)).toFixed(field === "sleepHours" ? 2 : 0))));
        patchTemplateStartDraft({ [field]: String(next) }, false);
        const action = field === "sleepHours" ? "template-readiness-sleep-hours" : field === "restingHr" ? "template-readiness-resting-hr" : "template-readiness-hrv";
        const input = root.querySelector('[data-action="' + action + '"]');
        if (input) input.value = String(next);
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
          const sleepQualityDelta = readinessMetricDelta("sleepQuality", recovery.sleepQuality);
          const sorenessDelta = readinessMetricDelta("soreness", recovery.soreness);
          return `
            <div class="scrim sheet-backdrop" data-action="cancel-template-start" role="presentation">
              <section class="sheet-card bottom-sheet dialog-sheet readiness-log-sheet" role="dialog" aria-modal="true" aria-labelledby="daily-readiness-title" data-sheet-content>
                <button class="sheet-close" type="button" data-action="cancel-template-start" aria-label="Close daily readiness">&times;</button>
                <div><div class="section-kicker">Optional readiness</div><h2 id="daily-readiness-title">What is different today?</h2><p>Enter only what matters. Blank values remain missing and the saved routine stays unchanged.</p></div>
                <div class="readiness-draft">
                  ${readinessMetricField({ field: "sleepHours", label: "Sleep", action: "template-readiness-sleep-hours", value: recovery.sleepHours, min: 0, max: 14, step: 0.25, unit: " h" })}
                  ${readinessSegmentedField({ field: "sleepQuality", label: "Sleep quality", action: "template-readiness-sleep-quality", value: recovery.sleepQuality, options: [["", "Not entered"], [1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]] })}<span class="d ${sleepQualityDelta.tone}" data-readiness-delta="sleepQuality">${escapeHtml(sleepQualityDelta.text)}</span>
                  ${readinessSegmentedField({ field: "soreness", label: "Soreness", action: "template-readiness-soreness", value: recovery.soreness, options: [["", "Not entered"], [1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]] })}<span class="d ${sorenessDelta.tone}" data-readiness-delta="soreness">${escapeHtml(sorenessDelta.text)}</span>
                  ${readinessMetricField({ field: "hrv", label: "HRV", action: "template-readiness-hrv", value: recovery.hrv, min: 0, max: 400, step: 1, unit: " ms" })}
                  ${readinessMetricField({ field: "restingHr", label: "Resting heart rate", action: "template-readiness-resting-hr", value: recovery.restingHr, min: 0, max: 240, step: 1, unit: " bpm" })}
                  ${readinessSegmentedField({ field: "nutritionStatus", label: "Nutrition today", action: "template-readiness-nutrition", value: recovery.nutritionStatus, options: [["", "Not entered"], ["on_plan", "On plan"], ["below_plan", "Below plan"], ["low_energy", "Low energy"]] })}
                  ${readinessSegmentedField({ field: "proteinStatus", label: "Protein target", action: "template-readiness-protein", value: recovery.proteinStatus, options: [["", "Not entered"], ["adequate", "Met"], ["below_target", "Below target"]] })}
                  <fieldset class="field readiness-field"><legend class="f-name">Illness or pain</legend><div class="readiness-toggle-grid"><label class="toggle-line"><span>Current illness</span><span class="toggle ${recovery.illness ? "on" : ""}"><input type="checkbox" data-action="template-readiness-illness" ${recovery.illness ? "checked" : ""} /><i></i></span></label><label class="toggle-line"><span>Pain or injury</span><span class="toggle ${recovery.pain ? "on" : ""}"><input type="checkbox" data-action="template-readiness-pain" ${recovery.pain ? "checked" : ""} /><i></i></span></label></div></fieldset>
                  <div class="field readiness-field"><label class="f-name" for="template-readiness-area">Affected area</label><select id="template-readiness-area" data-action="template-readiness-affected-muscle"><option value="">Not specified</option>${muscleGroups.map((muscle) => '<option value="' + muscle + '" ' + (recovery.affectedMuscle === muscle ? 'selected' : '') + '>' + muscle + '</option>').join('')}</select></div>
                  <div class="field readiness-field"><label class="f-name" for="template-readiness-note">Optional context</label><textarea id="template-readiness-note" data-action="template-readiness-note" placeholder="Anything outside your normal band">${escapeHtml(recovery.outsideBandNote)}</textarea></div>
                </div>
                <div class="sheet-actions stacked"><button class="primary-action sheet-btn" type="button" data-action="${editingWorkout ? "save-workout-readiness" : "start-workout-with-readiness"}">${editingWorkout ? "Save readiness" : "Start workout"}</button></div>
              </section>
            </div>
          `;
      }

      function prescriptionLine(target) {
        return target.sets + " set" + (Number(target.sets) === 1 ? "" : "s") + " · " + formatResistance(target) + " × " + target.reps + " reps @ RPE " + target.rpe + (target.restSeconds ? " · " + target.restSeconds + "s rest" : "");
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
        cancelWorkoutFlow = { sessionId: session.id, source };
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
        return `
          <div class="scrim sheet-backdrop" data-action="keep-workout" role="presentation">
            <section class="sheet-card bottom-sheet dialog-sheet destructive-sheet" role="dialog" aria-modal="true" aria-label="Cancel this workout?" data-sheet-content>
              <div><div class="section-kicker destructive-kicker">Discard workout?</div><h2 id="cancel-workout-title">${escapeHtml(session.title || "Current workout")}</h2><p>${completedSets ? completedSets + " logged set" + (completedSets === 1 ? "" : "s") + " and " : "The "}unsubmitted draft will be permanently removed. Submitted history and routines stay intact.</p></div>
              <div class="sheet-actions cancel-sheet-actions">
                <button class="primary-action" type="button" data-action="keep-workout">Keep workout</button>
                <button class="discard-workout-button" type="button" data-action="confirm-cancel-workout">Discard workout</button>
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
              <div class="cancel-hero ${saving ? "save" : ""}"><span class="cancel-visual" aria-hidden="true">${saving ? "&#10003;" : "!"}</span><div><div class="section-kicker">Logged workout</div><h2 id="history-edit-confirm-title">${saving ? "Save these history edits?" : "Cancel these edits?"}</h2><p>${saving ? "The revised workout will replace the saved version and update its grade and performance history." : "The original logged workout will be restored. None of the temporary changes will be saved."}</p></div></div>
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

      function returnToLiftHome(message = "") {
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
        returnToLiftHome("History edits saved. The stored historical grade was preserved.");
      }

      function cancelHistoryEdits() {
        if (!isEditingHistorySession()) return;
        data = historyEditFlow.originalData;
        entityStructureRevision += 1;
        entityIndexCache = null;
        invalidateCompletedAnalysis();
        historyEditFlow = null;
        applyTheme();
        returnToLiftHome("History edits canceled.");
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

      async function removeWorkoutFromSyncQueue(sessionId) {
        try {
          const queue = await readIndexedValue("sync-queue") || [];
          await writeIndexedValue("sync-queue", queue.filter((item) => item.sessionId !== sessionId));
        } catch {
          return;
        }
      }

      async function discardActiveWorkout() {
        const session = data.sessions.find((item) => item.id === cancelWorkoutFlow?.sessionId);
        if (!sessionCanBeDiscarded(session)) return;
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
        await removeWorkoutFromSyncQueue(session.id);
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
        showAppToast("Workout canceled.");
        commit({ ...data, sessions: remainingSessions, exercises: data.exercises.filter((exercise) => exercise.sessionId !== session.id), sets: data.sets.filter((set) => !exerciseIds.has(set.exerciseId)) });
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
        const workingCount = Math.max(1, working.length || Number(exercise.prescription?.sets || 1));
        const repMins = working.map((set) => Number(set.targetRepMin || set.targetReps || set.reps || 0)).filter((value) => value > 0);
        const repMaxes = working.map((set) => Number(set.targetRepMax || set.targetReps || set.reps || 0)).filter((value) => value > 0);
        const repMin = repMins.length ? Math.min(...repMins) : Number(exercise.prescription?.repLow || exercise.prescription?.reps || 8);
        const repMax = repMaxes.length ? Math.max(...repMaxes) : Number(exercise.prescription?.repHigh || exercise.prescription?.reps || repMin);
        const workingRpeMaxes = working.map((set) => Number(set.targetRpeMax ?? set.targetRpe ?? set.setPrescription?.rpeMax ?? set.rpe ?? 0)).filter((value) => value > 0);
        const targetRpeMax = workingRpeMaxes[0] || Number(templateExercise?.targetRpe || exercise.prescription?.targetRpeMax || exercise.prescription?.targetRpe || exercise.prescription?.rpe || 8);
        const workingRpeMins = working.map((set) => Number(set.targetRpeMin ?? set.setPrescription?.rpeMin ?? Math.max(1, Number(set.targetRpeMax ?? set.targetRpe ?? set.rpe ?? targetRpeMax) - 1))).filter((value) => value > 0);
        const targetRpeMin = workingRpeMins[0] || Number(exercise.prescription?.targetRpeMin || Math.max(1, targetRpeMax - 1));
        const workingRests = working.map((set) => Number(set.targetRestSeconds || 0)).filter((value) => value > 0);
        const workingRest = workingRests[0] || Number(exercise.restSeconds || data.settings.defaultRestSeconds || 90);
        const warmupRest = Number(warmups.find((set) => Number(set.targetRestSeconds) > 0)?.targetRestSeconds || Math.min(workingRest, 90));
        const signatures = working.map((set) => [
          normalizeSetTypeCode(set.setType, set.isWarmup),
          Number(set.targetRepMin || set.targetReps || set.reps || repMin),
          Number(set.targetRepMax || set.targetReps || set.reps || repMax),
          Number(set.targetRpeMin ?? set.setPrescription?.rpeMin ?? targetRpeMin),
          Number(set.targetRpeMax ?? set.targetRpe ?? set.setPrescription?.rpeMax ?? set.rpe ?? targetRpeMax),
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
          const rowTargetRpeMax = Number(set?.targetRpeMax ?? set?.targetRpe ?? set?.setPrescription?.rpeMax ?? set?.rpe ?? fallback.targetRpeMax);
          const rowTargetRpeMin = Number(set?.targetRpeMin ?? set?.setPrescription?.rpeMin ?? fallback.targetRpeMin ?? Math.max(1, rowTargetRpeMax - 1));
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
        const addSetSafety = guardWorkoutMutation("add-set", { exercise }, false);
        const addWarmupSafety = guardWorkoutMutation("add-warmup-set", { exercise }, false);
        const duplicateSetSafety = guardWorkoutMutation("duplicate-set", { exercise }, false);
        const firstWorkSet = exerciseSets.find((set) => isWorkingSet(set, "score")) || exerciseSets[0];
        const renderContext = renderSetContext(exercise);
        const setHtml = measurePerformance("lift:setRows", () => exerciseSets.map((set) => renderSet(set, exercise, renderContext)).join(""), { exerciseId: exercise.id, count: exerciseSets.length });
        const optionsHtml = measurePerformance("lift:exerciseOptions", () => renderStandardWorkloadControls(exercise) + renderMuscleSelectors(exercise), { exerciseId: exercise.id });
        const chipSet = exerciseSets.find((set) => isWorkingSet(set, "score") && !set.completed && !set.skipped) || firstWorkSet;
        const plannedWorkingSets = exerciseSets.filter((set) => isWorkingSet(set, "score")).length;
        const chipRestSeconds = Number(chipSet?.targetRestSeconds || exercise.restSeconds || data.settings.defaultRestSeconds || 90);
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
          <article id="exercise-${exercise.id}" class="exercise-card ${isActiveExercise ? "active-exercise" : ""} ${workoutFocusExerciseId === exercise.id ? "context-exercise" : ""}" tabindex="-1" aria-label="Exercise: ${escapeHtml(exercise.name)}">
            <div class="exercise-header">
              <span class="exercise-grip" aria-hidden="true">${icon.grip}</span>
              <h2 class="exercise-name exercise-name-full" title="${escapeHtml(exercise.name)}">${escapeHtml(exercise.name)}</h2>
              ${targetChip}
              <details class="exercise-overflow"><summary class="icon-button" aria-label="Exercise menu">${icon.more}</summary><div class="exercise-overflow-menu">
                <button type="button" data-action="move-exercise" data-direction="-1" data-exercise-id="${exercise.id}" aria-label="Move ${escapeHtml(exercise.name)} up">${icon.up}<span>Move up</span></button>
                <button type="button" data-action="move-exercise" data-direction="1" data-exercise-id="${exercise.id}" aria-label="Move ${escapeHtml(exercise.name)} down">${icon.down}<span>Move down</span></button>
                <button class="danger" type="button" data-action="delete-exercise" data-exercise-id="${exercise.id}" aria-label="Delete exercise ${escapeHtml(exercise.name)}">${icon.delete}<span>Remove exercise</span></button>
              </div></details>
            </div>
            ${renderResolvedAction(resolvedActionForScope(owningSession, "exercise", exercise), { session: owningSession, exercise })}
            ${setHtml}
            <div data-reconcile-slot="${exercise.id}">${renderReconcilePrompt(exercise)}</div>
            <details class="exercise-details">
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
            </details>
          </article>
        `;
      }

      function formatPreviousSetPerformance(set, exercise) {
        if (!set) return "No prior working set found";
        const date = set.priorSessionDate ? " · " + formatDate(set.priorSessionDate) : "";
        return formatSetPerformance(set, exercise) + date;
      }

      function setCompletionClock(set) {
        const completedAt = new Date(set?.completedAt || "");
        if (!Number.isFinite(completedAt.getTime())) return "Actual";
        return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(completedAt);
      }

      function renderSet(set, exercise, context = {}) {
        const restSeconds = Number(set.targetRestSeconds || context.restSeconds || exercise.restSeconds || data.settings.defaultRestSeconds || 90);
        const completionSafety = guardWorkoutMutation("toggle-set", { exercise, set }, false);
        const skipSafety = guardWorkoutMutation("toggle-skip-set", { exercise, set }, false);
        const addWarmupSafety = guardWorkoutMutation("add-warmup-set", { exercise, set }, false);
        const resistanceType = resistanceTypeFor(exercise, set);
        const visualState = setVisualState(set);
        const isLoggedMode = visualState === "completed" && !isEditingHistorySession();
        const isNext = visualState === "current";
        const isResting = Boolean(timer?.isActive && timer.setId === set.id);
        const executionLabel = setExecutionLabel(set);
        const warmupIndex = setTypeSemantics(set).isWarmup ? (context.warmupIds || []).indexOf(set.id) : -1;
        const previousSets = !isWorkingSet(set, "progression") ? [] : (context.previousSets || []);
        const role = normalizeSetTypeCode(set.setType, set.isWarmup);
        const workingSetIndex = Math.max(0, (context.workingSetIds || []).indexOf(set.id));
        const previous = set.previousComparableSet || previousComparableSetForRole(previousSets, role, set.setTypeIndex, workingSetIndex);
        const previousDateLabel = previous?.priorSessionDate ? formatDate(previous.priorSessionDate) : "No history";
        const previousPerformanceText = !previous
          ? "—"
          : resistanceType === "duration"
            ? formatLoadNumber(previous.durationSeconds || previous.reps || 0) + " sec"
            : resistanceType === "distance"
              ? formatLoadNumber(previous.distance || previous.reps || 0) + " " + (previous.distanceUnit || "m")
              : String(Number(previous.reps || 0));
        const previousLoadText = !previous || resistanceType === "duration" || resistanceType === "distance" ? "—" : formatResistance({ ...previous, resistanceType }, exercise);
        const previousRpeText = previous && Number(previous.rpe || 0) > 0 ? String(previous.rpe) : "—";
        const previousSummaryText = !previous
          ? "—"
          : resistanceType === "duration" || resistanceType === "distance"
            ? previousPerformanceText + (previousRpeText !== "—" ? " @ " + previousRpeText : "")
            : previousLoadText + " × " + previousPerformanceText + (previousRpeText !== "—" ? " @ " + previousRpeText : "");
        const previousField = setTypeSemantics(set).isWarmup
          ? '<div class="set-field set-previous"><span>Previous</span><strong>' + noData("No comparable warm-up") + '</strong><small>Warm-up</small></div>'
          : previous?.priorSessionId
            ? '<a class="set-field set-previous set-previous-link" href="#progress-history" data-action="open-session" data-session-id="' + escapeHtml(previous.priorSessionId) + '" data-exercise-id="' + escapeHtml(previous.priorExerciseId || "") + '" data-return-exercise-id="' + escapeHtml(exercise.id) + '" title="Open ' + escapeHtml(previous.priorExerciseName || exercise.name) + ' in the ' + escapeHtml(previousDateLabel) + ' workout"><span>Previous</span><strong>' + escapeHtml(previousSummaryText) + '</strong><small>' + escapeHtml(previousDateLabel) + '</small></a>'
            : '<div class="set-field set-previous"><span>Previous</span><strong>' + noData("No previous workout found") + '</strong><small>No history</small></div>';
        const targetLoad = Number(set.targetWeight ?? set.weight ?? 0);
        const targetLoadText = formatResistance({ ...set, weight: targetLoad, addedLoad: resistanceType === "bodyweight_plus_load" ? targetLoad : set.addedLoad, assistanceLoad: resistanceType === "assisted_bodyweight" ? targetLoad : set.assistanceLoad, resistanceType });
        const targetRepText = targetRangeText(set.targetRepMin, set.targetRepMax || set.targetReps, " reps");
        const targetRpeText = targetRangeText(set.targetRpeMin, set.targetRpeMax || set.targetRpe, " RPE");
        const performanceField = resistanceType === "duration"
          ? '<label class="set-field"><span>Seconds</span><input type="number" min="0" value="' + Number(set.durationSeconds || 0) + '" data-action="set-duration" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' seconds" /></label>'
          : resistanceType === "distance"
            ? '<label class="set-field"><span>Distance</span><input type="number" min="0" step="0.1" value="' + Number(set.distance || 0) + '" data-action="set-distance" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' distance" /></label>'
            : '<label class="set-field"><span>Reps</span><input type="number" min="0" value="' + set.reps + '" data-action="set-reps" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' reps" /></label>';
        const setLabel = warmupIndex >= 0 ? "WU" + (warmupIndex + 1) : "Set " + set.setNumber;
        const compactTargetSummary = targetLoadText + " × " + targetRangeText(set.targetRepMin, set.targetRepMax || set.targetReps) + " @ " + targetRangeText(set.targetRpeMin, set.targetRpeMax || set.targetRpe);
        const targetSummary = resistanceType === "duration" || resistanceType === "distance"
          ? [targetLoadText, targetRepText, targetRpeText].join(" | ")
          : compactTargetSummary;
        const actualLoadText = formatResistance(set, exercise);
        const actualPerformanceText = resistanceType === "duration"
          ? formatLoadNumber(set.durationSeconds || 0) + " sec"
          : resistanceType === "distance"
            ? formatLoadNumber(set.distance || 0) + " " + (set.distanceUnit || "m")
            : String(Number(set.reps || 0)) + " reps";
        const actualSummary = resistanceType === "duration" || resistanceType === "distance"
          ? actualPerformanceText + (Number(set.rpe || 0) > 0 ? " @ RPE " + set.rpe : "")
          : actualLoadText + " × " + Number(set.reps || 0) + (Number(set.rpe || 0) > 0 ? " @ " + Number(set.rpe).toFixed(1) : "");
        const targetRpe = Number(set.targetRpe || set.targetRpeMax || set.targetRpeMin || 0);
        const rpeDelta = Number(set.rpe || 0) - targetRpe;
        const isOnTarget = Boolean(targetRpe && Number(set.rpe || 0) && Math.abs(rpeDelta) < 0.05);
        const rpeDeltaText = isOnTarget
          ? "on"
          : !targetRpe || !Number(set.rpe || 0)
            ? "Logged"
            : (rpeDelta > 0 ? "+" : "") + formatLoadNumber(rpeDelta);
        const rpeDeltaClass = !targetRpe || !Number(set.rpe || 0) ? "none" : rpeDelta > 0 ? "out" : rpeDelta < 0 ? "under" : "on";
        const repTone = Number(set.reps || 0) < Number(set.targetRepMin || set.targetReps || 0) ? "under" : Number(set.reps || 0) > Number(set.targetRepMax || set.targetReps || 0) ? "over" : "on";
        const repRangeSignal = rangeBar({ low: Number(set.targetRepMin || set.targetReps || 0), high: Number(set.targetRepMax || set.targetReps || 0), actual: isLoggedMode ? Number(set.reps || 0) : Number(set.targetReps || set.targetRepMin || 0), tone: isLoggedMode ? repTone : "none" });
        const statusButton = '<button class="check-button ' + (set.completed ? "checked" : "") + '" type="button" data-action="toggle-set" data-set-id="' + set.id + '" title="' + (set.completed ? "Completed" : "Mark set complete") + '" aria-label="' + (set.completed ? "Set completed" : "Mark set complete") + '" aria-pressed="' + (set.completed ? "true" : "false") + '"' + workoutSafetyDisabledAttributes(completionSafety) + '>' + icon.done + '</button>';
        const loadField = resistanceType === "bodyweight"
          ? '<div class="set-field"><span>Load</span><div class="resistance-readout">BW</div></div>'
          : resistanceType === "duration" || resistanceType === "distance"
            ? '<div class="set-field"><span>Load</span><div class="resistance-readout">' + noData("External load does not apply") + '</div></div>'
            : '<label class="set-field"><span>' + (resistanceType === 'bodyweight_plus_load' ? 'Added' : resistanceType === 'assisted_bodyweight' ? 'Assist' : 'Load') + '</span><input type="number" min="0" step="' + (data.settings.weightUnit === 'lb' ? '0.5' : '0.001') + '" value="' + roundLoadForUnit(resistanceLoad(set, resistanceType), set.weightUnit || data.settings.weightUnit) + '" data-action="set-weight" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' ' + (resistanceType === 'bodyweight_plus_load' ? 'added load' : resistanceType === 'assisted_bodyweight' ? 'assistance load' : 'load') + '" /></label>';
        const setBody = isLoggedMode
          ? '<div class="set-logged diff" data-set-mode="logged"><div class="drow"><span class="plan"><span class="lbl">' + escapeHtml(setLabel + ' · ' + executionLabel) + '</span><strong>' + escapeHtml(targetSummary) + '</strong>' + repRangeSignal + '</span><span class="act"><span class="lbl">' + escapeHtml(setCompletionClock(set)) + '</span><strong>' + escapeHtml(actualSummary) + '</strong></span><span class="dlt"><span class="lbl">RPE</span><strong class="d ' + rpeDeltaClass + '">' + escapeHtml(rpeDeltaText) + '</strong></span>' + statusButton + '</div></div>'
          : isNext || isEditingHistorySession()
            ? '<div class="set-current-editor claim-card" data-set-mode="current"><div class="set-current-heading"><div><span class="eyebrow">' + escapeHtml(setLabel + ' · now') + '</span><strong>' + escapeHtml(resistanceType === "duration" || resistanceType === "distance" ? targetSummary : targetLoadText + " × " + targetRangeText(set.targetRepMin, set.targetRepMax || set.targetReps) + " @ RPE " + targetRangeText(set.targetRpeMin, set.targetRpeMax || set.targetRpe)) + '</strong></div><span class="current-set-count">' + (context.workingSetIds || []).length + ' sets planned</span>' + statusButton + '</div><div class="current-set-inputs">' + previousField + loadField + performanceField + '<label class="set-field"><span>RPE</span><input type="number" min="0" max="10" step="0.5" value="' + (Number(set.rpe || 0) > 0 ? set.rpe : "") + '" placeholder="—" data-action="set-rpe" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' RPE" /></label></div></div>'
            : '<div class="set-pending-line" data-set-mode="pending"><span class="pending-set-label">' + escapeHtml(setLabel) + '</span><span class="pending-exercise-name">' + escapeHtml(exercise.name) + '</span><strong>' + escapeHtml(targetSummary) + '</strong>' + repRangeSignal + '</div>';
        return `
          <div id="set-${set.id}" data-set-state="${visualState}" class="set-block ${visualState === "completed" ? "completed" : ""} ${isNext ? "next-set" : ""} ${isNext && activeSetAcknowledged ? "acknowledged" : ""} ${visualState === "edited" ? "edited-set" : ""} ${visualState === "skipped" ? "skipped-set" : ""} ${isResting ? "resting-set" : ""}">
            ${isLoggedMode ? "" : `<div class="set-heading">
              <span class="set-type-badge type-${escapeHtml(role)}">${escapeHtml(executionLabel.toUpperCase())}${set.manualOverride ? " · CORRECTED" : ""}</span>
              ${set.validationWarning ? '<span class="set-validation-warning">Review prescription</span>' : ""}
            </div>`}
            ${setBody}
            ${isNext ? '<div class="next-set-banner"><span aria-hidden="true">&#10148;</span><span>' + escapeHtml(activeSetAcknowledged ? "Current set" : activeSetNotice || "Current set") + '</span></div>' : ""}
            ${isLoggedMode ? "" : `<details class="set-tools-disclosure" ${isResting || visualState === "edited" || isEditingHistorySession() ? "open" : ""}>
              <summary aria-label="Set options"><span aria-hidden="true">•••</span></summary>
              <div class="set-tools-panel">
                <div class="set-actions">
                  <label class="set-type-editor"><span>Set type</span><select data-action="set-type-override" data-set-id="${set.id}">${['warmup','straight','top','backoff','drop','failure','amrap','technique','deload','unknown'].map((type) => '<option value="' + type + '" ' + (normalizeSetTypeCode(set.setType, set.isWarmup) === type ? 'selected' : '') + '>' + escapeHtml(setTypeLabels[type]) + '</option>').join('')}</select></label>
                  ${set.manualOverride && set.classificationUndo ? '<button class="mini-button" type="button" data-action="undo-set-type-override" data-set-id="' + set.id + '">Undo type change</button>' : ''}
                  <button class="mini-button" type="button" data-action="add-warmup-set" data-exercise-id="${exercise.id}" aria-label="Insert warm-up above ${escapeHtml(exercise.name)} set ${set.setNumber}"${workoutSafetyDisabledAttributes(addWarmupSafety)}>Insert warm-up above</button>
                  <button class="mini-button set-skip-button ${set.skipped ? "active" : ""}" type="button" data-action="toggle-skip-set" data-set-id="${set.id}"${workoutSafetyDisabledAttributes(skipSafety)}>${set.skipped ? "Skipped" : "Skip"}</button>
                  <button class="mini-button" type="button" data-action="delete-set" data-set-id="${set.id}">Remove</button>
                  ${visualState === "edited" ? '<span class="edited-indicator">Edited, not completed</span>' : ""}
                </div>
              </div>
            </details>`}
          </div>
        `;
      }

      function renderTimer(setId) {
        if (!timer || timer.setId !== setId) return "";
        const overtimeSeconds = timer.isOvertime
          ? Math.max(0, Number(timer.overtimeSeconds || Math.floor((Date.now() - Number(timer.endsAt || Date.now())) / 1000)))
          : 0;
        const elapsed = timer.isOvertime
          ? Number(timer.durationSeconds || 0) + overtimeSeconds
          : Math.max(0, timer.durationSeconds - timer.remainingSeconds);
        const progress = timer.durationSeconds > 0 ? Math.min(100, Math.round((elapsed / timer.durationSeconds) * 100)) : 100;
        const nextContext = timerNextContextLabel(timer);
        const notificationStatus = timerNotificationStatusLabel(timer);
        const timerLabel = timer.isOvertime ? "+" + formatOvertime(overtimeSeconds) : formatTimer(timer.remainingSeconds);
        const ariaState = timer.isOvertime
          ? "Rest target passed by " + formatOvertime(overtimeSeconds)
          : (timer.isPaused ? "Paused rest timer" : "Rest timer") + ", " + formatTimer(timer.remainingSeconds) + " remaining";
        return `
          <details class="timer-bar" data-timer-id="${timer.id}" data-disclosure-id="rest-timer" data-phase="${timer.isOvertime ? "overtime" : timer.remainingSeconds <= 10 ? "final" : "resting"}" ${timer.isPaused ? 'data-paused="true"' : ""} ${timer.isOvertime ? "open" : ""}>
            <summary class="timer-summary" aria-label="${ariaState}. Open timer controls.">
              <span class="timer-progress" role="progressbar" aria-label="Rest elapsed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" style="--timer-progress:${progress}%"><span></span></span>
              <span class="timer-rest-copy"><span>${timer.isOvertime ? "Rest complete" : timer.isPaused ? "Paused" : "Rest"}</span><small>${escapeHtml(nextContext)}</small></span>
              <strong data-timer-progress-label>${timerLabel}</strong>
            </summary>
            <div class="timer-controls-panel">
              ${timer.isOvertime
                ? '<button class="timer-skip" type="button" data-action="clear-timer">Finish rest</button>'
                : `<div class="timer-primary-controls" aria-label="Rest timer adjustments">
                    <button class="timer-adjust" type="button" data-action="adjust-timer" data-seconds="-15" title="Reduce rest by 15 seconds" aria-label="Reduce rest by 15 seconds">− 15 sec</button>
                    <button class="timer-adjust" type="button" data-action="adjust-timer" data-seconds="15" title="Add 15 seconds" aria-label="Add 15 seconds">+ 15 sec</button>
                    <button class="timer-skip" type="button" data-action="skip-timer" title="Skip remaining rest">Skip rest</button>
                  </div>
                  <div class="timer-secondary-controls"><button class="timer-control timer-pause" type="button" data-action="toggle-timer" title="${timer.isPaused ? "Resume timer" : "Pause timer"}" aria-label="${timer.isPaused ? "Resume timer" : "Pause timer"}">${timer.isPaused ? icon.play : icon.pause}</button><button class="timer-control timer-cancel" type="button" data-action="clear-timer" title="Cancel timer" aria-label="Cancel timer">${icon.delete}</button></div>`}
              <div class="timer-context">${escapeHtml(nextContext + " · " + notificationStatus)}</div>
            </div>
          </details>
        `;
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

      function presentationLabel(value) {
        const key = String(value || "").trim().toLowerCase().replace(/^mg[_-]/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        if (!key) return "Not Available";
        const mapped = typeof presentationLabels !== "undefined" ? presentationLabels[key] : "";
        return mapped || key.split("_").filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
      }
