
      function render() {
        const renderStartedAt = performanceNow();
        document.documentElement.classList.toggle("large-text-reflow", usesLargeTextReflow());
        const session = activeSession();
        if (!session) {
          root.innerHTML = '<div class="loading">Loading your training log...</div>';
          return;
        }
        if (templateStartFlow && !data.templates.some((template) => template.id === templateStartFlow.templateId)) templateStartFlow = null;
        if (cancelWorkoutFlow && !sessionCanBeDiscarded(data.sessions.find((item) => item.id === cancelWorkoutFlow.sessionId))) cancelWorkoutFlow = null;
        if (historyEditConfirm && !isEditingHistorySession()) historyEditConfirm = "";
        const modalOpen = Boolean(templateStartFlow || cancelWorkoutFlow || historyEditConfirm || clearDataFlow?.open);
        const dialogKey = activeDialogKey();
        const sameDialogFocus = dialogKey && dialogKey === renderedDialogKey ? focusDescriptorForElement(document.activeElement) : null;
        document.body.classList.toggle("modal-open", modalOpen);
        const viewHtml = measurePerformance("renderView:" + activeTab, renderViewSafely, { tab: activeTab, sessions: data.sessions.length, exercises: data.exercises.length, sets: data.sets.length });
        const domStartedAt = performanceNow();
        root.innerHTML = `
          <div class="app-shell">
            <a class="skip-link" href="#main-content" data-action="skip-content" ${modalOpen ? 'tabindex="-1" aria-hidden="true"' : ""}>Skip to main content</a>
            <header class="brand-bar" ${modalOpen ? 'inert aria-hidden="true"' : ""}>
              <div class="brand-mark" aria-label="Comprehensive Fitness">CF</div>
              <div class="brand-title">Comprehensive <span>Fitness</span><small>${escapeHtml(liftHomeIsVisible() ? "Program overview" : activeSession()?.title || "Training")}</small></div>
              <button class="brand-action" type="button" data-action="toggle-unit" title="Switch pounds and kilograms">${data.settings.weightUnit.toUpperCase()}</button>
              <button class="theme-toggle" type="button" data-action="toggle-theme" title="Toggle light and dark theme">${themeLabel()}</button>
            </header>
            ${renderUpdateBanner()}
            ${appToast ? '<div class="app-toast" role="status" aria-live="polite">' + escapeHtml(appToast) + '</div>' : ''}
            <main class="app-main" id="main-content" tabindex="-1" ${modalOpen ? 'inert aria-hidden="true"' : ""}>${viewHtml}</main>
            <nav class="bottom-nav" aria-label="Main navigation" ${modalOpen ? 'inert aria-hidden="true"' : ""}>
              ${navButton("today", "Today", "workout")}
              ${navButton("plan", "Plan", "templates")}
              ${navButton("progress", "Progress", "review")}
              ${navButton("more", "More", "settings")}
            </nav>
            ${renderTemplateStartSheet()}
            ${renderCancelWorkoutSheet()}
            ${renderHistoryEditConfirmSheet()}
            ${renderClearDataSheet()}
            ${renderTimerCompleteNotice()}
          </div>
        `;
        const readinessReviewTitle = root.querySelector("#readiness-review-title");
        if (readinessReviewTitle) readinessReviewTitle.textContent = "Today's Readiness Adjustments";
        const dailyReadinessTitle = root.querySelector("#daily-readiness-title");
        if (dailyReadinessTitle) dailyReadinessTitle.textContent = "Today's readiness";
        root.querySelectorAll(".readiness-comparison > .today > span").forEach((label) => { label.textContent = "Today's readiness"; });
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
        const status = root.querySelector(".workout-status-strip");
        if (!status) return;
        const values = status.querySelectorAll(":scope > span");
        const progress = workoutProgress();
        if (values[0]) values[0].textContent = progress.current;
        if (values[1]) values[1].textContent = progress.completed + "/" + progress.total + " sets";
        if (values[2]) values[2].textContent = progress.elapsed;
      }

      function applyCompletedSetVisual(setId) {
        const block = document.getElementById("set-" + setId);
        if (!block) return;
        block.dataset.setState = "completed";
        block.classList.remove("next-set", "edited-set", "skipped-set", "acknowledged");
        block.classList.add("completed");
        const row = block.querySelector(".set-row");
        row?.classList.remove("pending");
        row?.classList.add("completed");
        const button = block.querySelector('[data-action="toggle-set"]');
        if (button) {
          button.classList.add("checked");
          button.setAttribute("aria-pressed", "true");
          button.setAttribute("aria-label", "Set completed");
          button.setAttribute("title", "Completed");
        }
        block.querySelector(".next-set-banner")?.remove();
        updateWorkoutStatusDom();
      }

      function applyCurrentSetVisual(setId, notice = "Current set") {
        const block = document.getElementById("set-" + setId);
        if (!block) return;
        block.dataset.setState = "current";
        block.classList.remove("completed", "edited-set", "skipped-set", "acknowledged");
        block.classList.add("next-set");
        const row = block.querySelector(".set-row");
        row?.classList.remove("completed");
        row?.classList.add("pending");
        let banner = block.querySelector(".next-set-banner");
        if (!banner && row) {
          row.insertAdjacentHTML("afterend", '<div class="next-set-banner"><span aria-hidden="true">&#10148;</span><span></span></div>');
          banner = block.querySelector(".next-set-banner");
        }
        const label = banner?.querySelector("span:last-child");
        if (label) label.textContent = notice;
        updateWorkoutStatusDom();
      }

      function syncTimerDom() {
        if (!timer) return;
        const bar = document.querySelector(".timer-bar");
        if (!bar) return;
        bar.dataset.timerId = timer.id;
        const stateLabel = bar.querySelector(".timer-heading-copy > span");
        const status = bar.querySelector(".timer-heading-copy small");
        const pause = bar.querySelector('[data-action="toggle-timer"]');
        if (stateLabel) stateLabel.textContent = timer.isPaused ? "Paused" : "Rest";
        if (status) status.textContent = timer.isPaused ? "Notification paused" : timer.notificationStatus === "scheduled" ? "Lock-screen alert scheduled" : timer.notificationStatus === "error" ? "Foreground alert only" : "Scheduling alert";
        if (pause) {
          pause.innerHTML = timer.isPaused ? icon.play : icon.pause;
          pause.setAttribute("title", timer.isPaused ? "Resume timer" : "Pause timer");
          pause.setAttribute("aria-label", timer.isPaused ? "Resume timer" : "Pause timer");
        }
        updateTimerDisplay();
      }

      function removeTimerDom(timerSnapshot) {
        const block = document.getElementById("set-" + (timerSnapshot?.setId || ""));
        block?.querySelector(".timer-bar")?.remove();
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
            ? 'Update available. It will wait until this workout is logged.'
            : 'A new app version is ready.';
        return '<div class="update-banner" role="status"><span>' + message + '</span>' + (historyEditing || (workoutActive && !renderRecovery) ? '' : '<button type="button" data-action="apply-update">Update now</button>') + '</div>';
      }

      function navButton(tab, label, iconKey) {
        const active = activeTab === tab;
        return '<button class="nav-button ' + (active ? "active" : "") + '" data-action="set-tab" data-tab="' + tab + '" type="button"' + (active ? ' aria-current="page"' : '') + ' aria-label="' + escapeHtml(label) + '"><span class="nav-icon" aria-hidden="true">' + icon[iconKey] + '</span><span>' + label + '</span></button>';
      }

      function renderView() {
        if (activeTab === "progress") return renderProgress();
        if (activeTab === "plan") return renderTemplates();
        if (activeTab === "more") return renderSettings();
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
            return `<section class="view destination-error" role="alert"><div class="destination-error-mark" aria-hidden="true">!</div><div><div class="section-kicker">${escapeHtml(activeTab)}</div><h1>This area could not be opened.</h1><p>Your workout data has not been changed. Retry rebuilds this view's derived indexes. If an app update is ready, save this workout and apply it here.</p><div class="destination-error-actions"><button class="primary-action" type="button" data-action="retry-view-render">Retry</button>${updateAction}</div></div></section>`;
          }
        }
      }

      function renderProgress() {
        const content = progressView === "lifts" ? renderLiftProgress() : progressView === "history" ? renderHistory(false) : renderProgressOverview();
        return `<section class="progress-workspace"><header class="progress-workspace-header"><div><div class="section-kicker">Progress</div><h1>Training signals, in context.</h1><p>Volume, lift trends, and submitted sessions share one workspace.</p></div><nav class="progress-switcher" aria-label="Progress views">${[
          ["overview", "Overview"], ["lifts", "Lifts"], ["history", "History"]
        ].map(([value, label]) => `<button type="button" data-action="set-progress-view" data-progress-view="${value}" ${progressView === value ? 'aria-current="page"' : ""}>${label}</button>`).join("")}</nav></header>${content}</section>`;
      }

      function liftHomeIsVisible() {
        return activeTab === "today" && !hasActiveWorkout() && !viewingHistorySessionId && !completedSummarySessionId;
      }

      function renderWorkout() {
        const session = activeSession();
        if (!session) return renderLiftHome();
        if (liftHomeIsVisible()) return renderLiftHome();
        const editingHistory = isEditingHistorySession(session.id);
        const historyReadOnly = isSessionSubmitted(session) && !editingHistory;
        const addExerciseSafety = guardWorkoutMutation("add-exercise", {}, false);
        if (activeWorkoutId === session.id) ensureActiveSet();
        const progress = workoutProgress();
        const workoutExercises = activeExercises();
        const canReturnToActiveSession = historyReadOnly && hasActiveWorkout() && activeWorkoutId && activeWorkoutId !== session.id;
        const exerciseHtml = workoutExercises.length ? measurePerformance("lift:exerciseList", () => workoutExercises.map((exercise) => renderExercise(exercise)).join(""), { count: workoutExercises.length }) : "";
        return `
          <section class="view workout-view ${historyReadOnly ? "history-readonly" : ""} ${editingHistory ? "history-editing" : ""}">
            <section class="active-workout-hero">
              <div class="workout-heading">
                <div><div class="section-kicker">Today</div><h1>${escapeHtml(session.title || "Workout")}</h1></div>
                <span class="status-pill ${isSessionSubmitted(session) ? "good" : session.id === activeWorkoutId && hasActiveWorkout() ? "inside" : "neutral"}">${isSessionSubmitted(session) ? "Logged" : session.id === activeWorkoutId && hasActiveWorkout() ? "In progress" : "Ready"}</span>
              </div>
              <div class="coach-focus"><span>Current focus</span><strong>${escapeHtml(progress.current)}</strong><small>${progress.remaining ? progress.remaining + " working set" + (progress.remaining === 1 ? "" : "s") + " remain. Stay with the next useful action." : "Review the session, then submit when it is complete."}</small></div>
              <div class="workout-status-strip">
                <span>${escapeHtml(progress.current)}</span><span>${progress.completed}/${progress.total} sets</span><span>${progress.elapsed}</span>
                <button class="icon-button" type="button" data-action="new-session" title="${hasActiveWorkout() ? "Finish or cancel the active workout before starting another" : "New workout"}" aria-label="${hasActiveWorkout() ? "New workout unavailable while a workout is active" : "New workout"}" ${hasActiveWorkout() ? "disabled" : ""}>${icon.add}</button>
              </div>
            </section>
            ${renderNotificationPrompt()}
            <div class="workout-layout compact-workout-layout">
              <div class="workout-focus-column">
                ${exerciseHtml}
            ${historyReadOnly ? "" : `<details class="compact-disclosure add-exercise-panel">
              <summary>Add exercise <span>${icon.add}</span></summary>
              <div class="disclosure-body">
                <div class="row">
                  <input value="${escapeHtml(addExerciseDraft)}" data-action="add-exercise-draft" placeholder="Exercise name" aria-label="New exercise name" />
                  <button class="icon-button" type="button" data-action="add-exercise" title="Add exercise"${workoutSafetyDisabledAttributes(addExerciseSafety)}>${icon.add}</button>
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
                  ? '<textarea class="autosize-title-field" rows="1" data-action="session-title" aria-label="Workout title">' + escapeHtml(session.title) + '</textarea>'
                  : '<input value="' + escapeHtml(session.title) + '" data-action="session-title" aria-label="Workout title" />'}
                <input type="date" value="${session.date}" data-action="session-date" aria-label="Workout date" />
              </div>
              <label class="toggle-line"><input type="checkbox" data-action="session-travel" ${session.isTravel ? "checked" : ""} />Travel session</label>
              <textarea data-action="session-notes" placeholder="Session notes" aria-label="Session notes">${escapeHtml(session.notes)}</textarea>
              </div>
            </details>
            <div class="workout-footer-actions"><button class="secondary-action compact-template-action" type="button" data-action="save-template">Save template</button>
            ${isSessionSubmitted(session)
              ? '<div class="session-submitted">Workout logged' + (session.submittedAt ? ' ' + formatDate(session.date) : '') + '</div>'
              : '<button class="primary-action submit-workout" type="button" data-action="request-submit-workout">Submit workout</button>'}
            </div>
            ${editingHistory ? '<section class="history-edit-bar"><div><strong>Editing logged workout</strong><span>Changes remain temporary until you confirm Save Edits. The workout grade will be recalculated from the revised sets.</span></div><div class="history-edit-actions"><button class="primary-action" type="button" data-action="request-save-history-edits">Save Edits</button><button class="secondary-action" type="button" data-action="request-cancel-history-edits">Cancel Edits</button></div></section>' : ''}
            ${historyReadOnly && completedSummarySessionId !== session.id ? renderCompletedWorkoutSummary(session, { history: true }) : ''}
            ${historyReadOnly ? '<div class="history-view-actions"><button class="primary-action" type="button" data-action="begin-history-edit">Edit History</button><button class="secondary-action" type="button" data-action="return-lift-home">Return to Lift Home</button></div>' : ''}
            ${sessionCanBeDiscarded(session) ? '<div class="session-controls"><button class="text-danger-action" type="button" data-action="request-cancel-workout" data-session-id="' + session.id + '">Cancel Workout</button><span>Discards only this open session.</span></div>' : ''}
              </div>
            </div>
            ${pendingSubmitSessionId === session.id ? renderSubmitConfirmation(session) : ""}
            ${completedSummarySessionId === session.id ? renderCompletedWorkoutSummary(session) : ""}
            ${canReturnToActiveSession ? '<button class="return-active-session-fab" type="button" data-action="return-to-active-session">Return to active session</button>' : ''}
          </section>
        `;
      }

      function renderLiftHome() {
        const analysis = hypertrophyAnalysis(0, "overall", "");
        const nextTemplate = data.templates[0] || null;
        const nextAction = nextTemplate
          ? '<button class="primary-action" type="button" data-action="open-templates">Choose today\'s workout</button>'
          : '<button class="primary-action" type="button" data-action="open-templates">Create a workout template</button>';
        return `
          <section class="view lift-home-view">
            <div class="workout-heading"><div><div class="section-kicker">Workout</div><h1>Today</h1></div><span class="status-pill inside">Ready</span></div>
            <section class="coach-lead">
              <div class="section-kicker">Quiet coach</div>
              <h2>${nextTemplate ? escapeHtml(nextTemplate.name) + " is ready when you are." : "Build the plan before chasing the outcome."}</h2>
              <p>${nextTemplate ? "Review today's readiness, then follow the next prescribed set. Supporting evidence stays available without competing for attention." : "Create a reusable template, then the app can keep today's decision simple and your progression transparent."}</p>
              <div class="module-action-row">${nextAction}<button class="secondary-action" type="button" data-action="open-progress" data-progress-view="overview">Review this week</button></div>
            </section>
            ${renderQuickStartTemplates()}
            <section class="lift-home-score insight-module"><div class="section-heading"><div><h2>Program pulse</h2><p>Overall hypertrophy score &middot; ${escapeHtml(hypertrophyWindowLabel(analysis))}</p></div></div>${renderHypertrophyScore(analysis)}<details class="module-disclosure"><summary>How the score is graded <span>View ranges</span></summary><div class="score-scale" aria-label="Hypertrophy score ranges"><span class="score-excellent">90-100 Excellent</span><span class="score-very-good">80-89 Very good</span><span class="score-good">70-79 Good</span><span class="score-mixed">60-69 Mixed</span><span class="score-limiting">40-59 Limited</span><span class="score-critical">Below 40 Attention</span></div></details></section>
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

      function renderProgressOverview() {
        if (dashboardDetail) return renderDashboardDetail();
        const volumes = measurePerformance("dashboard:weeklyMuscleVolume", () => weeklyMuscleVolume(dashboardWeekStart), { weekStart: dashboardWeekStart });
        const flags = measurePerformance("dashboard:fatigueFlags", () => fatigueFlags(dashboardWeekStart), { weekStart: dashboardWeekStart });
        const trained = volumes.filter((bucket) => bucket.sets > 0);
        const untrained = volumes.filter((bucket) => bucket.sets === 0);
        const completedSessions = dashboardSessionsForWeek(dashboardWeekStart);
        const highConcernCount = flags.filter((flag) => flag.concern === "high").length;
        const moderateConcernCount = flags.filter((flag) => flag.concern === "moderate").length;
        const primaryFlag = flags.find((flag) => flag.concern === "high") || flags.find((flag) => flag.concern === "moderate") || flags[0] || null;
        const coachTitle = primaryFlag ? primaryFlag.reason : completedSessions.length ? "Your week is moving without a major fatigue flag." : "Start with one clear training signal.";
        const coachAction = primaryFlag ? primaryFlag.recommendation : completedSessions.length ? "Use the volume modules below to check balance before adding work." : "Log a submitted working set and this dashboard will build from real training history.";
        const currentWeek = startOfWeekIso(todayIso());
        const renderBucket = (bucket, quiet = false) => {
          const max = Math.max(bucket.targetHigh, bucket.sets, 1);
          const meter = Math.min(100, Math.round((bucket.sets / max) * 100));
          const label = bucket.status === "low" ? "below target" : bucket.status === "over" ? "above target" : "in range";
          const expanded = expandedVolumeMuscle === bucket.muscle;
          return `
            <article class="volume-card ${quiet ? "quiet-volume" : ""} ${expanded ? "expanded" : ""}">
              <button class="volume-card-toggle" type="button" data-action="toggle-volume-muscle" data-muscle="${escapeHtml(bucket.muscle)}" aria-expanded="${expanded ? "true" : "false"}">
                <header><strong>${bucket.muscle}</strong><span class="status-pill ${bucket.status}">${label}</span></header>
                <div class="meter" style="--meter:${meter}%"><span></span></div>
                <small>${bucket.sets.toFixed(bucket.sets % 1 ? 1 : 0)} sets. Target ${bucket.targetLow}-${bucket.targetHigh}. ${bucket.exerciseCount || 0} lifts.</small>
              </button>
              ${expanded ? renderVolumeDetails(bucket) : ""}
            </article>
          `;
        };
        return `
          <section class="view dashboard-view">
            <div class="screen-heading">
              <div><div class="section-kicker">Dashboard</div><h1>Volume and fatigue</h1></div>
              <div class="dashboard-period" aria-label="Dashboard week">
                <button type="button" data-action="dashboard-week" data-direction="-1" aria-label="Previous dashboard week">‹</button>
                <strong>${formatDate(dashboardWeekStart)}</strong>
                <button type="button" data-action="dashboard-week" data-direction="1" aria-label="Next dashboard week" ${dashboardWeekStart >= currentWeek ? "disabled" : ""}>›</button>
              </div>
            </div>
            <article class="coach-lead dashboard-coach ${primaryFlag ? "coach-" + primaryFlag.concern : "coach-neutral"}">
              <div class="section-kicker">This week's coach</div>
              <h2>${escapeHtml(coachTitle)}</h2>
              <p>${escapeHtml(coachAction)}</p>
              ${primaryFlag ? '<button class="secondary-action" type="button" data-action="open-dashboard-detail" data-detail="fatigue">Review the evidence</button>' : ''}
            </article>
            <div class="dashboard-summary-row" aria-label="Weekly overview">
              <button type="button" data-action="open-dashboard-detail" data-detail="sessions" aria-label="Open logged sessions for ${formatWeek(dashboardWeekStart)}"><strong>${completedSessions.length}</strong><span>logged sessions</span></button>
              <button type="button" data-action="open-dashboard-detail" data-detail="muscles" aria-label="Open trained muscles for ${formatWeek(dashboardWeekStart)}"><strong>${trained.length}</strong><span>trained muscles</span></button>
              <button type="button" data-action="open-dashboard-detail" data-detail="fatigue" aria-label="Open fatigue flags for ${formatWeek(dashboardWeekStart)}"><strong>${flags.length}</strong><span class="fatigue-summary-text">${highConcernCount ? '<span class="high">' + highConcernCount + ' high</span>' : ''}${moderateConcernCount ? '<span class="moderate">' + moderateConcernCount + ' moderate</span>' : ''}${!flags.length ? 'fatigue flags' : ''}</span></button>
            </div>
            <section class="screen-section">
              <div class="section-heading"><div><h2>Weekly muscle volume</h2><p>Tap a muscle to see the contributing lifts.</p></div><span>${formatWeek(dashboardWeekStart).replace("Week of ", "")}</span></div>
              <div class="dashboard-grid">
                ${trained.length ? trained.map((bucket) => renderBucket(bucket)).join("") : '<div class="empty-state">Log a working set to start your weekly volume dashboard.</div>'}
              </div>
              ${untrained.length ? '<details class="compact-disclosure"><summary>All muscles <span>' + untrained.length + ' untouched</span></summary><div class="disclosure-body"><div class="dashboard-grid">' + untrained.map((bucket) => renderBucket(bucket, true)).join("") + '</div></div></details>' : ""}
            </section>
            <section class="screen-section">
              <div class="section-heading"><div><h2>Fatigue flags</h2><p>Lift and muscle signals remain separate from today’s recovery score.</p></div></div>
              ${flags.length ? '<div class="drilldown-list">' + flags.map((flag) => renderFatigueFlagRow(flag)).join("") + '</div>' : '<div class="empty-state">No fatigue flags for this week. This can be true even when a single day’s recovery is low; lift and muscle flags use training-history rules.</div>'}
            </section>
            <section class="screen-section">
              <div class="section-heading"><div><h2>Recent history</h2><p>Your latest completed sessions.</p></div><button class="text-button" type="button" data-action="open-history">View all</button></div>
              ${renderRecentSessions()}
            </section>
          </section>
        `;
      }

      function dashboardWeekEnd(weekStart) {
        const end = new Date(weekStart + "T00:00:00");
        end.setDate(end.getDate() + 7);
        return localDateIso(end);
      }

      function dashboardSessionsForWeek(weekStart) {
        const end = dashboardWeekEnd(weekStart);
        return activeHistorySessions()
          .filter((session) => session.date >= weekStart && session.date < end)
          .sort((a, b) => b.date.localeCompare(a.date) || String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
      }

      function sessionWorkoutFacts(session) {
        const exercises = data.exercises.filter((exercise) => exercise.sessionId === session.id).sort((a, b) => a.order - b.order);
        const exerciseIds = new Set(exercises.map((exercise) => exercise.id));
        const sets = data.sets.filter((set) => exerciseIds.has(set.exerciseId));
        const completed = sets.filter((set) => set.completed && isWorkingSet(set, "score"));
        const started = new Date(session.startedAt || session.createdAt || "").getTime();
        const ended = new Date(session.submittedAt || session.updatedAt || "").getTime();
        const measured = Number.isFinite(started) && Number.isFinite(ended) && ended > started ? Math.round((ended - started) / 60000) : 0;
        const durationMinutes = measured > 0 && measured < 720 ? measured : Math.max(1, Math.round(completed.length * 2.5));
        return { exercises, sets, completed, durationMinutes, estimatedDuration: !(measured > 0 && measured < 720), prs: session.prs || [] };
      }

      function renderFatigueFlagRow(flag) {
        const concern = flag.concern || "low";
        return '<button class="drilldown-item fatigue-' + concern + '" type="button" data-action="open-fatigue-flag" data-flag-id="' + escapeHtml(flag.id) + '" aria-label="Open ' + escapeHtml(flag.scope + ' ' + flag.name + ' fatigue flag') + '"><strong>' + escapeHtml(flag.scope + ': ' + flag.name) + '</strong><span class="fatigue-severity ' + concern + '">' + escapeHtml(concern.charAt(0).toUpperCase() + concern.slice(1) + ' concern') + '</span><span>' + escapeHtml(flag.reason) + '</span><small>' + escapeHtml(formatDate(flag.triggeredAt)) + '</small><span class="drilldown-chevron" aria-hidden="true">›</span></button>';
      }

      function renderDashboardDetailHeader(title, subtitle, nested = false, backAction = "") {
        return '<div class="dashboard-detail-header"><button type="button" data-action="' + (backAction || (nested ? 'dashboard-detail-parent' : 'close-dashboard-detail')) + '" aria-label="Back">‹</button><div><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(subtitle) + '</p></div></div>';
      }

      function renderWeeklyVolumeWarningDetail(flag, options = {}) {
        const detail = flag.volumeDetail;
        const formatSets = (value) => Number(value || 0).toFixed(Number(value || 0) % 1 ? 1 : 0);
        const sessionAction = options.sessionAction || "open-volume-session";
        return `<section class="view dashboard-detail-view">${renderDashboardDetailHeader(detail.muscle + " weekly volume", formatWeek(detail.weekStart), true, options.backAction || "")}
          <article class="volume-warning-detail ${flag.concern}">
            <div class="volume-warning-hero"><div><span class="fatigue-severity ${flag.concern}">${escapeHtml(flag.concern.charAt(0).toUpperCase() + flag.concern.slice(1))} concern</span><h2>${formatSets(detail.actual)} weighted sets</h2><p>${formatSets(detail.exceededBy)} above the planned ${detail.targetLow}-${detail.targetHigh} set range.</p></div></div>
            <div class="volume-warning-numbers"><div><span>Planned</span><strong>${detail.targetLow}-${detail.targetHigh}</strong></div><div><span>Weighted Stimulus</span><strong>${formatSets(detail.actual)}</strong></div><div><span>Direct Sets</span><strong>${formatSets(detail.directSets)}</strong></div><div><span>Fractional Contribution</span><strong>${formatSets(detail.indirectSets)}</strong></div></div>
            <p class="settings-note">Calculated with exercise–muscle taxonomy ${escapeHtml(prescriptionEvidenceStatus.researchVersion)}. Fractional contributions use exercise-specific weights. Isometric stabilization and incidental involvement affect fatigue where relevant but receive no hypertrophy-set credit.</p>
            <section><h3>What contributed</h3><div class="volume-session-groups">${(detail.sessionGroups || []).map((session) => '<section class="volume-session-group"><button class="volume-session-heading" type="button" data-action="' + sessionAction + '" data-session-id="' + session.id + '"><span><strong>' + escapeHtml(session.title) + '</strong><small>' + formatDate(session.date) + '</small></span><span>' + formatSets(session.sets) + ' sets &rsaquo;</span></button><div class="volume-exercise-rows">' + session.exercises.map((exercise) => '<div class="volume-exercise-row"><span><strong>' + escapeHtml(exercise.name) + '</strong><small>' + (exercise.volumeLoad > 0 ? Math.round(exercise.volumeLoad) + ' ' + data.settings.weightUnit + ' volume load' : 'Rep and effort contribution') + '</small></span><span class="volume-set-breakdown"><b>' + formatSets(exercise.sets) + ' sets</b><small>' + (exercise.directSets ? formatSets(exercise.directSets) + ' direct' : '') + (exercise.directSets && exercise.indirectSets ? ' · ' : '') + (exercise.indirectSets ? formatSets(exercise.indirectSets) + ' indirect' : '') + '</small></span></div>').join('') + '</div></section>').join('') || '<div class="empty-state">No submitted contributions found.</div>'}</div></section>
            <section><h3>Submitted workouts included</h3><div class="drilldown-list">${detail.sessions.map((session) => '<button class="drilldown-item compact" type="button" data-action="' + sessionAction + '" data-session-id="' + escapeHtml(session.id) + '"><strong>' + escapeHtml(session.title) + '</strong><span>' + formatDate(session.date) + '</span><span class="drilldown-chevron" aria-hidden="true">›</span></button>').join('') || '<div class="empty-state">No submitted workouts contributed.</div>'}</div></section>
            <section><h3>Deload handling</h3><p>${detail.excludedDeloadSessions.length ? detail.excludedDeloadSessions.length + ' explicitly marked deload workout' + (detail.excludedDeloadSessions.length === 1 ? ' was' : 's were') + ' excluded: ' + escapeHtml(detail.excludedDeloadSessions.map((session) => session.title + ' (' + formatDate(session.date) + ')').join(', ')) + '.' : 'No explicitly marked deload exercises were present in this week.'}</p></section>
            <section><h3>Rule used</h3><p>${escapeHtml(flag.rule)}</p></section>
            <section><h3>Recommended next step</h3><p>${escapeHtml(flag.recommendation)}</p></section>
          </article>
        </section>`;
      }

      function renderDashboardDetail() {
        const volumes = weeklyMuscleVolume(dashboardWeekStart);
        const flags = fatigueFlags(dashboardWeekStart);
        const sessions = dashboardSessionsForWeek(dashboardWeekStart);
        const period = formatWeek(dashboardWeekStart);
        if (dashboardDetail.type === "history") return renderHistory(true);
        if (dashboardDetail.type === "session") {
          const session = data.sessions.find((item) => item.id === dashboardDetail.id);
          if (!session) { dashboardDetail = { type: "sessions" }; return renderDashboardDetail(); }
          const facts = sessionWorkoutFacts(session);
          return `<section class="view dashboard-detail-view">${renderDashboardDetailHeader(session.title || "Workout", formatDate(session.date), true)}
            <div class="dashboard-summary-row"><div><strong>${facts.durationMinutes}m</strong><span>${facts.estimatedDuration ? "estimated duration" : "duration"}</span></div><div><strong>${facts.exercises.length}</strong><span>exercises</span></div><div><strong>${facts.completed.length}</strong><span>completed sets</span></div></div>
            ${renderCompletedWorkoutSummary(session, { history: true })}
            ${session.notes ? '<div class="inline-panel"><strong>Session notes</strong><p class="settings-note">' + escapeHtml(session.notes) + '</p></div>' : ''}
          </section>`;
        }
        if (dashboardDetail.type === "sessions") {
          return `<section class="view dashboard-detail-view">${renderDashboardDetailHeader("Logged sessions", period)}<div class="drilldown-list">${sessions.length ? sessions.map((session) => { const facts = sessionWorkoutFacts(session); return '<button class="drilldown-item" type="button" data-action="open-dashboard-session" data-session-id="' + session.id + '"><strong>' + escapeHtml(session.title || 'Workout') + '</strong><span>' + formatDate(session.date) + ' · ' + facts.durationMinutes + ' min' + (facts.estimatedDuration ? ' est.' : '') + ' · ' + facts.exercises.length + ' exercises</span><small>' + facts.completed.length + ' completed sets' + (facts.prs.length ? ' · ' + facts.prs.length + ' PR' + (facts.prs.length === 1 ? '' : 's') : '') + '</small><span class="drilldown-chevron" aria-hidden="true">›</span></button>'; }).join('') : '<div class="empty-state">No submitted workouts in this period.</div>'}</div></section>`;
        }
        if (dashboardDetail.type === "muscles") {
          const trained = volumes.filter((bucket) => bucket.sets > 0);
          return `<section class="view dashboard-detail-view">${renderDashboardDetailHeader("Trained muscles", period)}<div class="detail-facts">${trained.length ? trained.map((bucket) => { const sessionsCount = new Set(bucket.details.flatMap((detail) => detail.sessions.map((session) => session.title + session.date))).size; return '<div class="detail-fact"><strong>' + escapeHtml(bucket.muscle) + ' · ' + bucket.sets.toFixed(bucket.sets % 1 ? 1 : 0) + ' sets</strong><span>' + sessionsCount + ' session' + (sessionsCount === 1 ? '' : 's') + ' · ' + bucket.directSets.toFixed(bucket.directSets % 1 ? 1 : 0) + ' direct sets · ' + bucket.indirectSets.toFixed(bucket.indirectSets % 1 ? 1 : 0) + ' fractional secondary sets</span><span>' + escapeHtml(bucket.details.map((detail) => detail.name + ' (' + detail.sets.toFixed(detail.sets % 1 ? 1 : 0) + ')').join(', ')) + '</span></div>'; }).join('') : '<div class="empty-state">No muscle volume was logged in this period.</div>'}</div></section>`;
        }
        if (dashboardDetail.type === "fatigue-flag") {
          const flag = flags.find((item) => item.id === dashboardDetail.id);
          if (!flag) { dashboardDetail = { type: "fatigue" }; return renderDashboardDetail(); }
          if (flag.detailType === "weekly-volume" && flag.volumeDetail) return renderWeeklyVolumeWarningDetail(flag);
          return `<section class="view dashboard-detail-view">${renderDashboardDetailHeader(flag.scope + ": " + flag.name, formatDate(flag.triggeredAt), true)}<article class="fatigue-explanation ${flag.concern}"><span class="fatigue-severity ${flag.concern}">${escapeHtml(flag.concern.charAt(0).toUpperCase() + flag.concern.slice(1))} concern</span><h2>${escapeHtml(flag.reason)}</h2><div><strong>Data that triggered it</strong><ul>${flag.evidence.map((item) => '<li>' + escapeHtml(item) + '</li>').join('')}</ul></div><div><strong>Rule crossed</strong><p>${escapeHtml(flag.rule)}</p></div><div><strong>Recommended next step</strong><p>${escapeHtml(flag.recommendation)}</p></div><div><strong>What clears the flag</strong><p>${escapeHtml(flag.resolution)}</p></div></article></section>`;
        }
        return `<section class="view dashboard-detail-view">${renderDashboardDetailHeader("Fatigue flags", period)}<div class="drilldown-list">${flags.length ? flags.map(renderFatigueFlagRow).join('') : '<div class="empty-state">No fatigue flags were triggered in this period.</div>'}</div></section>`;
      }

      function renderVolumeDetails(bucket) {
        if (!bucket.details.length) return '<div class="volume-detail empty">No completed sets mapped to this muscle this week.</div>';
        const formatSets = (value) => Number(value || 0).toFixed(Number(value || 0) % 1 ? 1 : 0);
        const statusText = bucket.status === "over" ? formatSets(bucket.sets - bucket.targetHigh) + " sets above target" : bucket.status === "low" ? formatSets(bucket.targetLow - bucket.sets) + " sets below target" : "Inside target range";
        return `
          <div class="volume-detail">
            <div class="volume-detail-hero ${bucket.status}"><div><span>${escapeHtml(bucket.muscle)}</span><strong>${formatSets(bucket.sets)} hard sets</strong></div><div><span>Weekly target</span><strong>${bucket.targetLow}-${bucket.targetHigh}</strong></div><div><span>Status</span><strong>${statusText}</strong></div></div>
            <p class="volume-period-note">Monday-Sunday calendar week beginning ${formatDate(dashboardWeekStart)}. Submitted workouts only; explicitly marked deload work is excluded.</p>
            <div class="volume-session-groups">${bucket.sessionGroups.map((session) => `
              <section class="volume-session-group">
                <button class="volume-session-heading" type="button" data-action="open-volume-session" data-session-id="${session.id}"><span><strong>${escapeHtml(session.title)}</strong><small>${formatDate(session.date)}</small></span><span>${formatSets(session.sets)} sets &rsaquo;</span></button>
                <div class="volume-exercise-rows">${session.exercises.map((exercise) => '<button class="volume-exercise-row" type="button" data-action="open-volume-exercise" data-exercise-name="' + escapeHtml(exercise.name) + '"><span><strong>' + escapeHtml(exercise.name) + '</strong><small>' + (exercise.volumeLoad > 0 ? Math.round(exercise.volumeLoad) + ' ' + data.settings.weightUnit + ' volume load' : 'Rep and effort contribution') + '</small></span><span class="volume-set-breakdown"><b>' + formatSets(exercise.sets) + ' sets</b><small>' + (exercise.directSets ? formatSets(exercise.directSets) + ' direct' : '') + (exercise.directSets && exercise.indirectSets ? ' · ' : '') + (exercise.indirectSets ? formatSets(exercise.indirectSets) + ' indirect' : '') + '</small></span></button>').join('')}</div>
              </section>`).join('')}</div>
          </div>
        `;
      }

      function recentHistoryCardModel(session) {
        const workoutName = String(session?.title || "").trim() || "Workout";
        const rawCompletedDate = sessionCompletionDate(session);
        const parsedCompletedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawCompletedDate) ? new Date(rawCompletedDate + "T00:00:00") : null;
        const hasValidDate = Boolean(parsedCompletedDate && !Number.isNaN(parsedCompletedDate.getTime()));
        if (!hasValidDate && performanceDebugEnabled && !recentHistoryDataIssueIds.has(session?.id || "unknown")) {
          recentHistoryDataIssueIds.add(session?.id || "unknown");
          console.warn("[CF data] Recent History session has no valid completion date.", { sessionId: session?.id || "unknown" });
        }
        const analysis = session?.workoutAnalysis?.version === 1 ? session.workoutAnalysis : null;
        const supportedGrades = new Set(WORKOUT_GRADE_THRESHOLDS.map((threshold) => threshold.grade));
        const workoutGrade = supportedGrades.has(analysis?.grade) ? analysis.grade : "";
        const fallbackScore = WORKOUT_GRADE_THRESHOLDS.find((threshold) => threshold.grade === workoutGrade)?.minimum;
        const hasStoredScore = analysis?.internalScore != null && analysis.internalScore !== "" && Number.isFinite(Number(analysis.internalScore));
        const gradeScore = hasStoredScore ? Number(analysis.internalScore) : fallbackScore;
        return {
          workoutName,
          completedDate: hasValidDate ? rawCompletedDate : "",
          completedDateLabel: hasValidDate ? formatDate(rawCompletedDate) : "Date unavailable",
          workoutGrade,
          gradeTone: workoutGrade && Number.isFinite(gradeScore) ? workoutGradeScoreTone(gradeScore) : "score-unavailable"
        };
      }
      if (performanceDebugEnabled) window.__CF_TEST__ = { ...(window.__CF_TEST__ || {}), recentHistoryCardModel };

      function renderRecentSessions() {
        const sessions = activeHistorySessions().slice().sort((a, b) => sessionCompletionDate(b).localeCompare(sessionCompletionDate(a))).slice(0, 5);
        if (!sessions.length) return '<div class="empty-state">No saved workouts yet.</div>';
        return '<div class="recent-history-list">' + sessions.map((session) => {
          const record = recentHistoryCardModel(session);
          const dateMarkup = record.completedDate
            ? '<time class="recent-history-date" datetime="' + escapeHtml(record.completedDate) + '">' + escapeHtml(record.completedDateLabel) + '</time>'
            : '<span class="recent-history-date">' + escapeHtml(record.completedDateLabel) + '</span>';
          const gradeLabel = record.workoutGrade ? "workout grade " + record.workoutGrade : "workout grade unavailable";
          const gradeMarkup = record.workoutGrade ? escapeHtml(record.workoutGrade) : "&mdash;";
          const accessibleLabel = "Open " + record.workoutName + ", " + record.completedDateLabel + ", " + gradeLabel;
          return '<button class="recent-history-card" type="button" data-action="open-session" data-session-id="' + escapeHtml(session.id) + '" aria-label="' + escapeHtml(accessibleLabel) + '"><span class="recent-history-title">' + escapeHtml(record.workoutName) + '</span><span class="recent-history-meta">' + dateMarkup + '<span class="recent-history-grade grade-tone ' + record.gradeTone + '" aria-hidden="true">' + gradeMarkup + '</span></span></button>';
        }).join("") + '</div>';
      }

      function renderQuickStartTemplates() {
        if (!data.templates.length) return "";
        const templates = data.templates;
        const running = activeWorkoutSession();
        const readinessContext = running || { id: "lift-home", date: todayIso(), recovery: defaultRecovery() };
        const recoveryAdvice = recoveryRecommendationForSession(readinessContext);
        return `
          <div class="quick-template-strip">
            <div class="section-kicker">Start from template</div>
            <div class="quick-template-list">
              ${templates.map((template) => {
                const isActiveTemplate = running?.templateId === template.id;
                const locked = Boolean(running && !isActiveTemplate);
                const advice = running ? null : cachedTemplateAdvice(template, recoveryAdvice, { recovery: sessionRecovery(readinessContext) });
                return `
                  <button class="quick-template-card ${isActiveTemplate ? "active-template" : locked ? "locked-template" : ""}" type="button" data-action="${isActiveTemplate ? "return-active-workout" : "start-template"}" data-template-id="${template.id}" ${locked ? 'disabled title="Finish or cancel your active workout first"' : ''}>
                    <strong>${escapeHtml(template.name)}</strong>
                    <small>${template.exercises.length} lifts · ${advice?.totalSets ?? templateExerciseCount(template)} prescribed sets</small>
                    <span>${isActiveTemplate ? "Resume workout" : locked ? "Start unavailable" : escapeHtml(advice.label)}</span>
                  </button>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }

      function openTemplateStart(templateId) {
        const template = data.templates.find((item) => item.id === templateId);
        if (!template) return;
        if (!Array.isArray(template.exercises) || template.exercises.length === 0) {
          templateStartFlow = null;
          showAppToast("Add at least one exercise before starting this template.");
          render();
          return;
        }
        captureDialogFocusOrigin("template");
        if (hasActiveWorkout()) {
          templateStartFlow = { templateId, step: "active-conflict", draft: defaultRecovery() };
          render();
          return;
        }
        templateStartFlow = { templateId, step: "confirm", draft: defaultRecovery() };
        render();
      }

      function closeTemplateStart() {
        templateStartFlow = null;
        restoreFocusAfterDialog("template");
        render();
      }

      function patchTemplateStartDraft(patch, shouldRender = true) {
        if (!templateStartFlow) return;
        templateStartFlow = { ...templateStartFlow, draft: cleanRecovery({ ...templateStartFlow.draft, ...patch }) };
        if (shouldRender) render();
      }

      function renderTemplateStartSheet() {
        if (!templateStartFlow) return "";
        const template = data.templates.find((item) => item.id === templateStartFlow.templateId);
        if (!template) return "";
        if (templateStartFlow.step === "active-conflict") {
          const active = activeWorkoutSession();
          return `
            <div class="sheet-backdrop" data-action="cancel-template-start" role="presentation">
              <section class="bottom-sheet dialog-sheet" role="dialog" aria-modal="true" aria-labelledby="active-workout-title" data-sheet-content>
                <button class="sheet-close" type="button" data-action="cancel-template-start" aria-label="Close workout dialog">&times;</button>
                <div><div class="section-kicker">Workout in progress</div><h2 id="active-workout-title">You already have an active workout.</h2><p>${escapeHtml(active?.title || "Your current workout")} must be submitted or explicitly canceled before another template can begin.</p></div>
                <div class="sheet-actions stacked">
                  <button class="primary-action" type="button" data-action="return-active-workout">Return to Active Workout</button>
                  <button class="danger-button" type="button" data-action="request-cancel-workout-from-template">Cancel Current Workout</button>
                  <button class="mini-button" type="button" data-action="cancel-template-start">Keep browsing templates</button>
                </div>
              </section>
            </div>`;
        }
        if (templateStartFlow.step === "confirm") {
          return `
            <div class="sheet-backdrop" data-action="cancel-template-start" role="presentation">
              <section class="bottom-sheet dialog-sheet" role="dialog" aria-modal="true" aria-labelledby="template-start-title" data-sheet-content>
                <button class="sheet-close" type="button" data-action="cancel-template-start" aria-label="Close template setup">&times;</button>
                <h2 id="template-start-title">Start ${escapeHtml(template.name)}?</h2>
                <p>This will prepare today’s targets from your workout history. Your current workout will not change until you continue through readiness.</p>
                <div class="sheet-actions">
                  <button type="button" data-action="cancel-template-start">Cancel</button>
                  <button class="primary-action" type="button" data-action="continue-template-start">Continue</button>
                </div>
              </section>
            </div>
          `;
        }
        if (templateStartFlow.step === "readiness") {
          return `
            <div class="sheet-backdrop" data-action="cancel-template-start" role="presentation">
              <section class="bottom-sheet dialog-sheet" role="dialog" aria-modal="true" aria-labelledby="readiness-choice-title" data-sheet-content>
                <button class="sheet-close" type="button" data-action="cancel-template-start" aria-label="Close readiness setup">&times;</button>
                <h2 id="readiness-choice-title">Use your usual readiness?</h2>
                <p>Your saved baseline will be used unless you enter today’s objective or observable metrics.</p>
                <div class="sheet-actions stacked">
                  <button class="primary-action" type="button" data-action="use-usual-readiness">Use usual readiness</button>
                  <button type="button" data-action="log-today-readiness">Log today’s metrics</button>
                  <button class="mini-button" type="button" data-action="cancel-template-start">Cancel</button>
                </div>
              </section>
            </div>
          `;
        }
        const recovery = templateStartFlow.draft;
        const preview = recoveryRecommendationForSession({ id: "readiness-preview", date: todayIso(), recovery });
        if (templateStartFlow.step === "review") {
          const changes = templateReadinessPreview(template, recovery);
          const changed = changes.filter((item) => item.changed);
          const unchanged = changes.filter((item) => !item.changed);
          return `
            <div class="sheet-backdrop" data-action="cancel-template-start" role="presentation">
              <section class="bottom-sheet dialog-sheet readiness-review-sheet" role="dialog" aria-modal="true" aria-labelledby="readiness-review-title" data-sheet-content>
                <button class="sheet-close" type="button" data-action="cancel-template-start" aria-label="Close readiness review">&times;</button>
                <div><div class="section-kicker">Before training</div><h2 id="readiness-review-title">Todayâ€™s Readiness Adjustments</h2><p>${escapeHtml(preview.label)}. Every change below is tied only to a marker you entered.</p></div>
                <div class="readiness-change-list">${changed.length ? changed.map(renderReadableReadinessChange).join("") : '<div class="readiness-unchanged"><strong>No target changes</strong><span>Your entered markers remain within the normal band for this plan.</span></div>'}</div>
                ${unchanged.length ? '<details class="compact-disclosure"><summary>Exercises unchanged <span>' + unchanged.length + '</span></summary><div class="disclosure-body readiness-unchanged-list">' + unchanged.map((item) => '<div><strong>' + escapeHtml(item.name) + '</strong><span>' + escapeHtml(prescriptionLine(item.original)) + '</span></div>').join('') + '</div></details>' : ''}
                <div class="sheet-actions stacked">
                  <button class="primary-action" type="button" data-action="start-adjusted-workout">Start Adjusted Workout</button>
                  ${changed.length && !recovery.illness && !recovery.pain ? '<button type="button" data-action="start-original-workout">Use Original Targets</button>' : ''}
                  <button class="mini-button" type="button" data-action="edit-readiness-metrics">Review Changes</button>
                  <button class="mini-button" type="button" data-action="cancel-template-start">Cancel</button>
                </div>
              </section>
            </div>`;
        }
        return `
          <div class="sheet-backdrop" data-action="cancel-template-start" role="presentation">
            <section class="bottom-sheet dialog-sheet" role="dialog" aria-modal="true" aria-labelledby="daily-readiness-title" data-sheet-content>
              <button class="sheet-close" type="button" data-action="cancel-template-start" aria-label="Close daily readiness">&times;</button>
              <div><h2 id="daily-readiness-title">Today’s readiness</h2><p>${formatDate(todayIso())} · ${escapeHtml(preview.label)}. ${escapeHtml(preview.action)}</p></div>
              <div class="readiness-draft">
                <div class="recovery-inputs">
                  <label>Sleep hours<input type="number" min="0" max="14" step="0.25" value="${escapeHtml(recovery.sleepHours)}" data-action="template-readiness-sleep-hours" /></label>
                  <label>Sleep quality<select data-action="template-readiness-sleep-quality"><option value="">-</option>${[1,2,3,4,5].map((value) => '<option value="' + value + '" ' + (String(recovery.sleepQuality) === String(value) ? "selected" : "") + '>' + value + '/5</option>').join("")}</select></label>
                  <label>HRV<input type="number" min="0" step="1" value="${escapeHtml(recovery.hrv)}" data-action="template-readiness-hrv" /></label>
                  <label>Resting heart rate<input type="number" min="0" step="1" value="${escapeHtml(recovery.restingHr)}" data-action="template-readiness-resting-hr" /></label>
                  <label>Soreness<select data-action="template-readiness-soreness"><option value="">-</option>${[1,2,3,4,5].map((value) => '<option value="' + value + '" ' + (String(recovery.soreness) === String(value) ? "selected" : "") + '>' + value + '/5</option>').join("")}</select></label>
                  <label>Nutrition today<select data-action="template-readiness-nutrition"><option value="" ${recovery.nutritionStatus === '' ? 'selected' : ''}>Not entered</option><option value="on_plan" ${recovery.nutritionStatus === 'on_plan' ? 'selected' : ''}>On plan</option><option value="below_plan" ${recovery.nutritionStatus === 'below_plan' ? 'selected' : ''}>Below planned intake</option><option value="low_energy" ${recovery.nutritionStatus === 'low_energy' ? 'selected' : ''}>Possible low energy availability</option></select></label>
                  <label>Protein target<select data-action="template-readiness-protein"><option value="" ${recovery.proteinStatus === '' ? 'selected' : ''}>Not entered</option><option value="adequate" ${recovery.proteinStatus === 'adequate' ? 'selected' : ''}>Met</option><option value="below_target" ${recovery.proteinStatus === 'below_target' ? 'selected' : ''}>Below target</option></select></label>
                  <label class="toggle-line"><input type="checkbox" data-action="template-readiness-illness" ${recovery.illness ? "checked" : ""} />Current illness</label>
                  <label class="toggle-line"><input type="checkbox" data-action="template-readiness-pain" ${recovery.pain ? "checked" : ""} />Pain or injury affecting training</label>
                  <label>Affected area<select data-action="template-readiness-affected-muscle"><option value="">Not specified</option>${muscleGroups.map((muscle) => '<option value="' + muscle + '" ' + (recovery.affectedMuscle === muscle ? 'selected' : '') + '>' + muscle + '</option>').join('')}</select></label>
                </div>
                <textarea data-action="template-readiness-note" placeholder="Optional note if something is outside your normal band" aria-label="Optional outside-normal-band note">${escapeHtml(recovery.outsideBandNote)}</textarea>
              </div>
              <div class="sheet-actions">
                <button type="button" data-action="cancel-template-start">Cancel</button>
                <button class="primary-action" type="button" data-action="review-template-readiness">Review changes</button>
              </div>
            </section>
          </div>
        `;
      }

      function prescriptionLine(target) {
        return target.sets + " set" + (Number(target.sets) === 1 ? "" : "s") + " · " + formatResistance(target) + " × " + target.reps + " reps @ RPE " + target.rpe + (target.restSeconds ? " · " + target.restSeconds + "s rest" : "");
      }

      function renderReadableReadinessChange(item) {
        return '<article class="readiness-change-card"><h3>' + escapeHtml(item.name) + '</h3><div class="readiness-comparison"><div><span>Original recommendation</span><strong>' + escapeHtml(readablePrescriptionLine(item.original)) + '</strong></div><div class="today"><span>Today\'s readiness</span><strong>' + escapeHtml(readablePrescriptionLine(item.adjusted)) + '</strong></div></div><div class="readiness-why"><strong>Why this changed</strong><span>' + escapeHtml(item.reason) + '</span><small>Triggered by: ' + escapeHtml(item.triggers.join('; ')) + '</small></div></article>';
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
          : focusDescriptorForElement(document.activeElement) || { kind: "main" };
        if (source === "template") dialogFocusOrigins.template = null;
        cancelWorkoutFlow = { sessionId: session.id, source };
        templateStartFlow = null;
        render();
      }

      function renderCancelWorkoutSheet() {
        if (!cancelWorkoutFlow) return "";
        const session = data.sessions.find((item) => item.id === cancelWorkoutFlow.sessionId);
        if (!session || isSessionSubmitted(session)) return "";
        return `
          <div class="sheet-backdrop" data-action="keep-workout" role="presentation">
            <section class="bottom-sheet dialog-sheet destructive-sheet" role="dialog" aria-modal="true" aria-labelledby="cancel-workout-title" data-sheet-content>
              <div class="cancel-hero"><span class="cancel-visual" aria-hidden="true">!</span><div><div class="section-kicker">Active session</div><h2 id="cancel-workout-title">Cancel this workout?</h2><p>Your unsaved sets, notes, timer state, and session progress will be discarded. This workout will not be added to your completed history.</p></div></div>
              <div class="cancel-impact"><div><b aria-hidden="true">-</b><div><strong>Only this draft is removed</strong><span>The workout timer, rest timer, scheduled alert, notes, and unsaved set entries will be cleared.</span></div></div><div><b aria-hidden="true">&#10003;</b><div><strong>Your history remains intact</strong><span>Submitted workouts, templates, personal records, charts, and settings stay unchanged.</span></div></div></div>
              <div class="sheet-actions cancel-sheet-actions">
                <button class="primary-action" type="button" data-action="keep-workout">Keep Workout</button>
                <button class="discard-workout-button" type="button" data-action="confirm-cancel-workout">Discard Workout</button>
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
              <div class="cancel-hero ${saving ? "save" : ""}"><span class="cancel-visual" aria-hidden="true">${saving ? "&#10003;" : "!"}</span><div><div class="section-kicker">Logged workout</div><h2 id="history-edit-confirm-title">${saving ? "Save these history edits?" : "Cancel these edits?"}</h2><p>${saving ? "The revised workout will replace the saved version and recalculate charts, volume, fatigue, and coaching history." : "The original logged workout will be restored. None of the temporary changes will be saved."}</p></div></div>
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
        hypertrophyScoreExpanded = false;
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
        const workoutAnalysis = updatedSession ? calculateWorkoutAnalysis(updatedSession, { prs }) : null;
        data = { ...data, sessions: data.sessions.map((item) => item.id === sessionId ? { ...updatedSession, workoutAnalysis } : item) };
        invalidateCompletedAnalysis();
        historyEditFlow = null;
        returnToLiftHome("History edits saved and workout grade recalculated.");
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

      function showAppToast(message) {
        appToast = message;
        window.setTimeout(() => {
          if (appToast !== message) return;
          appToast = "";
          render();
        }, 2800);
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

      function safetySubstituteContext(snapshot, options = {}) {
        const research = prescriptionEngine?.evidence?.research;
        const prescription = snapshot?.finalPrescription;
        const restriction = prescription?.safetyRestriction || null;
        const empty = (reason = "missing_safety_context", message = "The safety-substitute context is incomplete.") => ({
          allowedSafetySubstituteIds: [],
          exerciseCatalog: [],
          availableEquipment: [],
          excludedExerciseIds: [],
          preferred: null,
          resolvedValidation: { valid: false, reason, message }
        });
        if (!research?.substitutionsByExercise || !research?.exerciseById || !prescription || !restriction) return empty();

        const exercise = options.exercise || null;
        const session = options.session || (exercise?.sessionId ? sessionById(exercise.sessionId) : null);
        const referencedMesocycleId = session?.mesocycleId || snapshot.mesocycleId || "";
        const mesocycle = referencedMesocycleId ? data.mesocycles.find((item) => item.id === referencedMesocycleId) || null : null;
        const mesocycleReferenceValid = !referencedMesocycleId || Boolean(mesocycle);
        const constraints = mesocycle?.constraints || {};
        const mesocycleEquipmentSource = Object.prototype.hasOwnProperty.call(mesocycle || {}, "availableEquipment")
          ? mesocycle.availableEquipment
          : Object.prototype.hasOwnProperty.call(constraints, "availableEquipment")
            ? constraints.availableEquipment
            : undefined;
        const normalizeEquipment = (source) => Array.isArray(source)
          ? Array.from(new Set(source.map((item) => String(item || "").trim()).filter(Boolean)))
          : [];
        const currentEquipmentSource = data.settings.availableEquipment;
        const currentEquipment = Array.isArray(currentEquipmentSource) && currentEquipmentSource.length === 0
          ? ["all"]
          : normalizeEquipment(currentEquipmentSource);
        const mesocycleEquipment = mesocycleEquipmentSource === undefined ? null : normalizeEquipment(mesocycleEquipmentSource);
        const configuredEquipment = mesocycleEquipment === null
          ? currentEquipment
          : currentEquipment.includes("all")
            ? mesocycleEquipment
            : mesocycleEquipment.includes("all")
              ? currentEquipment
              : currentEquipment.filter((item) => mesocycleEquipment.includes(item));
        const equipmentInputValid = configuredEquipment.length > 0;
        const excludedExerciseIds = new Set([
          ...(Array.isArray(data.settings.excludedExerciseIds) ? data.settings.excludedExerciseIds : []),
          ...(Array.isArray(mesocycle?.excludedExerciseIds) ? mesocycle.excludedExerciseIds : []),
          ...(Array.isArray(constraints.excludedExerciseIds) ? constraints.excludedExerciseIds : [])
        ].map((item) => String(item || "").trim()).filter(Boolean));
        const scopedMuscleIds = Object.prototype.hasOwnProperty.call(mesocycle || {}, "includedMuscleGroupIds")
          ? mesocycle.includedMuscleGroupIds
          : Object.prototype.hasOwnProperty.call(constraints, "includedMuscleGroupIds") ? constraints.includedMuscleGroupIds : undefined;
        const muscleGroupId = normalizePrescriptionIdentity(snapshot.muscleGroupId || prescription.muscleGroupId || "");
        const scopeValid = scopedMuscleIds === undefined || (Array.isArray(scopedMuscleIds)
          && scopedMuscleIds.length > 0
          && scopedMuscleIds.some((item) => normalizePrescriptionIdentity(item) === muscleGroupId));

        const originalExerciseId = restriction.originalExerciseId
          || restriction.auditBaseTargets?.exerciseId
          || snapshot.basePrescription?.exerciseId
          || prescription.exerciseId;
        const originalResearchExerciseId = restriction.auditBaseTargets?.researchExerciseId
          || snapshot.basePrescription?.researchExerciseId
          || (research.exerciseById.has(originalExerciseId) ? originalExerciseId : "")
          || originalExerciseId;
        const substitutionRows = research.substitutionsByExercise.get(originalResearchExerciseId) || [];
        const mappedIds = Array.from(new Set(substitutionRows.map((item) => item.substitute_exercise_id || item.substituteExerciseId).filter(Boolean)));
        const originalIds = new Set([originalExerciseId, originalResearchExerciseId, restriction.auditBaseTargets?.exerciseId, restriction.auditBaseTargets?.researchExerciseId, snapshot.basePrescription?.exerciseId, snapshot.basePrescription?.researchExerciseId].filter(Boolean));
        const equipmentCompatibleById = new Map();
        if (mesocycleReferenceValid && equipmentInputValid && scopeValid && muscleGroupId) {
          mappedIds.forEach((exerciseId) => {
            const record = research.exerciseById.get(exerciseId);
            try {
              equipmentCompatibleById.set(exerciseId, Boolean(record && prescriptionApi.equipmentCompatible(record, configuredEquipment).eligible));
            } catch {
              equipmentCompatibleById.set(exerciseId, false);
            }
          });
        }
        const resolvedSubstituteId = restriction.substituteResearchExerciseId || restriction.substituteExerciseId || "";
        const resolved = restriction.status === "resolved_by_confirmed_substitute" && restriction.painFreeConfirmed === true;
        const eligibleSafetySubstituteIds = mappedIds.filter((exerciseId) => (
          research.exerciseById.has(exerciseId)
          && !originalIds.has(exerciseId)
          && !excludedExerciseIds.has(exerciseId)
          && equipmentCompatibleById.get(exerciseId) === true
        ));
        const allowedSafetySubstituteIds = resolved
          ? eligibleSafetySubstituteIds.filter((exerciseId) => exerciseId !== resolvedSubstituteId)
          : eligibleSafetySubstituteIds;
        const exerciseCatalog = allowedSafetySubstituteIds.map((exerciseId) => research.exerciseById.get(exerciseId)).filter(Boolean);
        const preferredId = allowedSafetySubstituteIds.includes(prescription.preferredReplacementExerciseId)
          ? prescription.preferredReplacementExerciseId
          : allowedSafetySubstituteIds[0] || "";
        const preferredRecord = preferredId ? research.exerciseById.get(preferredId) : null;

        const observedExerciseId = exercise?.name
          ? exactResearchCatalogIdentity(exercise.name, research.exerciseDatabase) || ""
          : "";
        const declaredResolvedIds = [
          restriction.substituteExerciseId,
          restriction.substituteResearchExerciseId,
          prescription.exerciseId,
          prescription.researchExerciseId
        ].filter(Boolean).map((exerciseId) => {
          if (research.exerciseById.has(exerciseId)) return exerciseId;
          const reconciled = prescriptionEngine?.evidence?.personal?.reconciledIdentityByExerciseId?.get(exerciseId);
          return reconciled?.invalid ? "" : reconciled?.researchExerciseId || exerciseId;
        });
        const observedIdentityCoherent = !exercise
          || (Boolean(observedExerciseId) && observedExerciseId === resolvedSubstituteId);
        const identityCoherent = Boolean(resolvedSubstituteId)
          && declaredResolvedIds.length > 0
          && declaredResolvedIds.every((exerciseId) => exerciseId === resolvedSubstituteId)
          && observedIdentityCoherent
          && research.exerciseById.has(resolvedSubstituteId)
          && !originalIds.has(resolvedSubstituteId);
        let resolvedValidation = { valid: false, reason: "unresolved_safety_restriction", message: "The painful original exercise remains blocked until a distinct pain-free substitute is confirmed." };
        if (resolved) {
          if (!mesocycleReferenceValid) resolvedValidation = { valid: false, reason: "missing_mesocycle_context", message: "The saved substitute cannot be revalidated because its workout mesocycle no longer exists." };
          else if (!identityCoherent) resolvedValidation = { valid: false, reason: "substitute_identity_drift", message: "The confirmed substitute no longer retains one coherent current catalog identity." };
          else if (excludedExerciseIds.has(resolvedSubstituteId)) resolvedValidation = { valid: false, reason: "substitute_excluded", message: "The confirmed substitute is now excluded from this workout." };
          else if (!equipmentInputValid || equipmentCompatibleById.get(resolvedSubstituteId) !== true) resolvedValidation = { valid: false, reason: "unavailable_equipment", message: "The confirmed substitute is not compatible with the currently available equipment." };
          else if (!scopeValid) resolvedValidation = { valid: false, reason: "substitute_out_of_scope", message: "The confirmed substitute no longer satisfies the current mesocycle muscle scope." };
          else if (!mappedIds.includes(resolvedSubstituteId) || !eligibleSafetySubstituteIds.includes(resolvedSubstituteId)) resolvedValidation = { valid: false, reason: "substitute_not_allowed", message: "The confirmed substitute is no longer a valid evidence-linked alternative for the painful original exercise." };
          else resolvedValidation = { valid: true, reason: "confirmed_pain_free_substitute", message: "The confirmed substitute still satisfies current identity, equipment, exclusion, and program constraints." };
        }
        return {
          originalExerciseId,
          originalResearchExerciseId,
          allowedSafetySubstituteIds,
          exerciseCatalog,
          availableEquipment: configuredEquipment,
          excludedExerciseIds: Array.from(excludedExerciseIds),
          preferred: preferredRecord ? { exerciseId: preferredId, researchExerciseId: preferredId, exerciseName: preferredRecord.exercise_name } : null,
          resolvedValidation
        };
      }

      function renderPrescriptionOverrideControls(exercise, precomputedSafetyContext = null) {
        const rawSnapshot = exercise.recommendationSnapshot;
        const snapshot = recommendationSnapshotForDisplay(rawSnapshot);
        if (!snapshot || exercise.sessionId !== activeWorkoutId || isSessionSubmitted(activeSession())) return "";
        const prescription = snapshot.finalPrescription;
        const standard = snapshot.standardGuideline || snapshot.basePrescription;
        const restriction = prescription.safetyRestriction || null;
        const hasSafetyRestriction = restriction?.status === "blocked" || restriction?.status === "resolved_by_confirmed_substitute";
        const currentSafetyContext = hasSafetyRestriction
          ? precomputedSafetyContext || safetySubstituteContext(rawSnapshot, { exercise, session: sessionById(exercise.sessionId) })
          : null;
        const safetyLocked = prescription.executionBlocked === true
          || restriction?.status === "blocked"
          || (restriction?.status === "resolved_by_confirmed_substitute" && currentSafetyContext?.resolvedValidation?.valid !== true);
        const safetyContext = safetyLocked ? currentSafetyContext : null;
        const safetyListId = `safety-substitutes-${exercise.id}`;
        const safetyOptions = safetyContext?.exerciseCatalog.map((item) => `<option value="${escapeHtml(item.exercise_name)}"></option>`).join("") || "";
        const safetyNote = restriction?.status === "resolved_by_confirmed_substitute"
          ? "The previously confirmed substitute no longer satisfies current identity, equipment, exclusion, or program constraints. Choose a different current catalog-backed substitute and confirm it is pain-free before continuing."
          : "The original exercise remains blocked. Only a distinct, catalog-backed substitute allowed by the current equipment and exclusion settings can become executable after you explicitly confirm it is pain-free.";
        return `
          <details class="compact-disclosure prescription-override" data-override-form="${exercise.id}">
            <summary>${safetyLocked ? "Choose a pain-free substitute" : "Override this prescription"} <span>${safetyLocked ? 'Confirmation required' : snapshot.overrideLocked ? 'Locked for workout' : 'Optional'}</span></summary>
            <div class="disclosure-body">
              <p class="settings-note">${safetyLocked ? safetyNote : "Overrides are saved with the original recommendation and will not be undone during this workout. Later outcomes are used to evaluate the choice."}</p>
              <div class="override-grid">
                <label>Replacement exercise<input data-override-field="exercise" ${safetyLocked ? `list="${safetyListId}"` : ""} placeholder="${safetyLocked && safetyContext?.preferred ? escapeHtml(safetyContext.preferred.exerciseName) : `Keep ${escapeHtml(exercise.name)}`}" /></label>
                ${safetyLocked ? `<datalist id="${safetyListId}">${safetyOptions}</datalist><label class="toggle-line override-reason"><input type="checkbox" data-override-field="pain-free-confirmed" />I explicitly confirm this substitute is pain-free for today</label>` : ""}
                <label>Working sets<input type="number" min="1" max="12" value="${prescription.workingSets.target}" data-override-field="sets" /></label>
                <label>Rep minimum<input type="number" min="1" max="50" value="${prescription.repRange.min}" data-override-field="rep-min" /></label>
                <label>Rep maximum<input type="number" min="1" max="50" value="${prescription.repRange.max}" data-override-field="rep-max" /></label>
                <label>Load${prescription.prescribedLoad?.target ? '<input type="number" min="0" step="0.5" value="' + Number(prescription.prescribedLoad.target) + '" data-override-field="load" />' : '<input type="number" min="0" step="0.5" placeholder="No load target" data-override-field="load" />'}</label>
                <label>Set structure<select data-override-field="structure">${prescriptionApi.SET_STRUCTURES.map((structure) => '<option value="' + structure + '" ' + (structure === prescription.setStructure ? 'selected' : '') + '>' + structure.replaceAll('_', ' ') + '</option>').join('')}</select></label>
                <label>Deload decision<select data-override-field="deload"><option value="engine">Use engine decision</option><option value="normal">Override: no deload</option><option value="exercise_deload">Exercise deload</option><option value="muscle_group_deload">Muscle-group deload</option><option value="full_program_deload">Full-program deload</option></select></label>
                <label>Rotation decision<select data-override-field="rotation"><option value="engine">Use engine decision</option><option value="hold">Keep exercise</option><option value="rotate_exercise">Rotate next block</option><option value="substitute">Substitute now</option></select></label>
                <label>Mesocycle<select data-override-field="mesocycle"><option value="">Keep current</option>${data.mesocycles.map((mesocycle) => '<option value="' + mesocycle.id + '" ' + (snapshot.mesocycleId === mesocycle.id ? 'selected' : '') + '>' + escapeHtml(mesocycle.name + ' · ' + mesocycle.status) + '</option>').join('')}</select></label>
                <label class="override-reason">Reason<input data-override-field="reason" placeholder="Why are you changing it?" /></label>
              </div>
              <button class="primary-action" type="button" data-action="apply-prescription-override" data-exercise-id="${exercise.id}">Apply and log override</button>
            </div>
          </details>
        `;
      }

      function renderStandardWorkloadControls(exercise) {
        const snapshot = recommendationSnapshotForDisplay(exercise.recommendationSnapshot);
        if (exercise.sessionId !== activeWorkoutId || isSessionSubmitted(activeSession())) return "";
        const prescription = snapshot?.finalPrescription || exercise.finalPrescription || null;
        const standard = snapshot?.standardGuideline || snapshot?.basePrescription || null;
        const session = sessionById(exercise.sessionId);
        const template = session?.templateId ? data.templates.find((item) => item.id === session.templateId) : null;
        const templateExercise = template?.exercises?.find((item) => exerciseMatches(item.name, exercise.name));
        const savedStandard = templateExercise?.standardWorkloadOverride === true;
        const exerciseSets = setsForExercise(exercise.id);
        const warmups = exerciseSets.filter((set) => setTypeSemantics(set).isWarmup);
        const working = exerciseSets.filter((set) => isWorkingSet(set, "progression"));
        const workingCount = Math.max(1, working.length || Number(prescription?.workingSets?.target || exercise.prescription?.sets || 1));
        const repMins = working.map((set) => Number(set.targetRepMin || set.targetReps || set.reps || 0)).filter((value) => value > 0);
        const repMaxes = working.map((set) => Number(set.targetRepMax || set.targetReps || set.reps || 0)).filter((value) => value > 0);
        const repMin = repMins.length ? Math.min(...repMins) : Number(prescription?.repRange?.min || exercise.prescription?.repLow || exercise.prescription?.reps || 8);
        const repMax = repMaxes.length ? Math.max(...repMaxes) : Number(prescription?.repRange?.max || exercise.prescription?.repHigh || exercise.prescription?.reps || repMin);
        const workingRests = working.map((set) => Number(set.targetRestSeconds || 0)).filter((value) => value > 0);
        const workingRest = workingRests[0] || Number(exercise.restSeconds || prescription?.restSeconds?.target || data.settings.defaultRestSeconds || 90);
        const warmupRest = Number(warmups.find((set) => Number(set.targetRestSeconds) > 0)?.targetRestSeconds || Math.min(workingRest, 90));
        const signatures = working.map((set) => [
          normalizeSetTypeCode(set.setType, set.isWarmup),
          Number(set.targetRepMin || set.targetReps || set.reps || repMin),
          Number(set.targetRepMax || set.targetReps || set.reps || repMax),
          Number(set.targetRestSeconds || workingRest)
        ].join("|"));
        const individualized = new Set(signatures).size > 1 || working.some((set) => normalizeSetTypeCode(set.setType, set.isWarmup) !== "straight");
        const currentSets = working.length || workingCount;
        const setsAbove = standard ? currentSets > Number(standard.workingSets.max) : false;
        const repsAbove = standard ? repMax > Number(standard.repRange.max) : false;
        const setsBelow = standard ? currentSets < Number(standard.workingSets.min) : false;
        const repsBelow = standard ? repMin < Number(standard.repRange.min) : false;
        const comparison = !standard ? "Fully editable" : setsAbove || repsAbove ? "Above standard" : setsBelow || repsBelow ? "Below standard" : "Within standard";
        const savedLabel = savedStandard
          ? `${templateExercise.sets} sets · ${templateExercise.repMin || templateExercise.reps}-${templateExercise.repMax || templateExercise.reps} reps`
          : templateExercise ? "Template uses generated targets" : "Today only";
        const roleOptions = (selected) => [
          ["straight", "Standard set"],
          ["top", "Top set"],
          ["backoff", "Back-off set"],
          ["drop", "Drop set"]
        ].map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
        const setRow = (scope, index, set, fallback) => {
          const type = scope === "warmup" ? "warmup" : normalizeSetTypeCode(set?.setType, set?.isWarmup);
          const rowRepMin = Number(set?.targetRepMin || set?.targetReps || set?.reps || fallback.repMin);
          const rowRepMax = Number(set?.targetRepMax || set?.targetReps || set?.reps || fallback.repMax);
          const rest = Number(set?.targetRestSeconds || fallback.rest);
          return `
            <div class="individual-set-row" data-set-default-row data-set-scope="${scope}" data-set-index="${index}" ${scope === "working" && index >= workingCount ? "hidden" : ""}>
              <span class="individual-set-index">${scope === "warmup" ? `WU${index + 1}` : index + 1}</span>
              ${scope === "warmup" ? '<span class="individual-set-type">Warm-up</span>' : `<label><span>Type</span><select data-set-default-field="type" aria-label="Working set ${index + 1} type">${roleOptions(type || "straight")}</select></label>`}
              <label><span>Reps</span><span class="range-inputs"><input type="number" min="1" max="50" value="${rowRepMin}" data-set-default-field="rep-min" aria-label="${scope === "warmup" ? "Warm-up" : "Working"} set ${index + 1} minimum reps" /><span>–</span><input type="number" min="1" max="50" value="${rowRepMax}" data-set-default-field="rep-max" aria-label="${scope === "warmup" ? "Warm-up" : "Working"} set ${index + 1} maximum reps" /></span></label>
              <label><span>Rest</span><span class="unit-input"><input type="number" min="15" max="900" step="15" value="${rest}" data-set-default-field="rest" aria-label="${scope === "warmup" ? "Warm-up" : "Working"} set ${index + 1} rest seconds" /><small>sec</small></span></label>
            </div>`;
        };
        const warmupRows = warmups.map((set, index) => setRow("warmup", index, set, { repMin, repMax, rest: warmupRest })).join("");
        const workingRows = Array.from({ length: 20 }, (_, index) => setRow("working", index, working[index], { repMin, repMax, rest: workingRest })).join("");
        return `
          <section class="standard-workload-card" data-standard-workload-form="${exercise.id}" data-override-form="${exercise.id}">
            <div class="standard-workload-heading"><div><span>Exercise defaults</span><strong>Sets, reps & rest</strong></div><span class="standard-workload-badge ${comparison.toLowerCase().replaceAll(" ", "-")}">${comparison}</span></div>
            <div class="guideline-context-row" aria-label="Exercise default context">
              <div><span>Research</span><strong>${standard ? `${standard.workingSets.min}-${standard.workingSets.max} sets · ${standard.repRange.min}-${standard.repRange.max} reps` : "No exercise-specific range"}</strong></div>
              <div><span>Saved</span><strong>${escapeHtml(savedLabel)}</strong></div>
            </div>
            <div class="default-target-grid">
              <label><span>Working sets</span><input type="number" min="1" max="20" step="1" value="${workingCount}" data-default-field="sets" data-action="default-working-set-count" aria-label="Default working set count" /></label>
              <label><span>Rep range</span><span class="range-inputs"><input type="number" min="1" max="50" value="${repMin}" data-default-field="rep-min" aria-label="Default minimum repetitions" /><span>–</span><input type="number" min="1" max="50" value="${repMax}" data-default-field="rep-max" aria-label="Default maximum repetitions" /></span></label>
              <label><span>Working rest</span><span class="unit-input"><input type="number" min="15" max="900" step="15" value="${workingRest}" data-default-field="working-rest" aria-label="Default working-set rest seconds" /><small>sec</small></span></label>
              <label><span>Warm-up rest</span><span class="unit-input"><input type="number" min="15" max="900" step="15" value="${warmupRest}" data-default-field="warmup-rest" aria-label="Default warm-up rest seconds" /><small>sec</small></span></label>
            </div>
            <details class="individual-set-disclosure" data-individual-set-disclosure ${individualized ? "open" : ""}>
              <summary><span><strong>Individual set targets</strong><small>Drop sets, different reps or different rest</small></span><b>${individualized ? "Customized" : "Optional"}</b></summary>
              <input type="hidden" value="${individualized ? "true" : "false"}" data-individual-set-enabled />
              <div class="individual-set-editor">
                <p>Opening this section enables separate targets. Set type can mark top, back-off, or drop sets; rest starts after that specific set.</p>
                ${warmupRows ? `<div class="individual-set-group"><h4>Warm-up sets</h4>${warmupRows}</div>` : ""}
                <div class="individual-set-group"><h4>Working sets</h4>${workingRows}</div>
                <button class="text-action" type="button" data-action="use-shared-set-targets">Use one target for every set</button>
              </div>
            </details>
            ${templateExercise ? '<label class="standard-workload-save"><input type="checkbox" data-standard-save-template /> Use these as the default next time this template starts</label>' : '<p class="standard-workload-note">These defaults stay with today’s exercise and carry into a template if you save this workout.</p>'}
            <button class="primary-action standard-workload-apply" type="button" data-action="apply-standard-workload" data-exercise-id="${exercise.id}">Apply exercise defaults</button>
          </section>
        `;
      }

      function renderCustomExerciseSetup(exercise) {
        if (exercise.identitySource !== "user_declared_custom" || exercise.sessionId !== activeWorkoutId || isSessionSubmitted(activeSession())) return "";
        const profile = normalizeCustomExerciseProfile(exercise.customExerciseProfile) || {};
        const missing = missingCustomExerciseMetrics(profile);
        const resistance = profile.resistanceType || exercise.resistanceType || "external";
        return `
          <section class="custom-exercise-setup ${missing.length ? "incomplete" : "complete"}" data-custom-exercise-form="${exercise.id}">
            <div class="standard-workload-heading"><div><span>${missing.length ? "Recommendation setup incomplete" : "Bounded custom guidance"}</span><strong>${missing.length ? "Complete the required metrics" : "Profile confirmed"}</strong></div></div>
            ${missing.length ? `<p>No recommendation is shown yet. Missing: <strong>${escapeHtml(missing.join(", "))}</strong>.</p>` : "<p>Guidance uses this declared profile, muscle-level research, your goal, and exact history. Canonical ranking, biomechanics, substitution, and equivalence claims remain unavailable.</p>"}
            <div class="custom-profile-grid">
              <label>Primary muscle group<select data-custom-profile-field="primary-muscle"><option value="">Choose…</option>${muscleOptions(appMuscleFromPrescriptionGroup(profile.primaryMuscleGroupId) || exercise.primaryMuscle || "")}</select></label>
              <label>Secondary muscle (optional)<select data-custom-profile-field="secondary-muscle">${muscleOptions(appMuscleFromPrescriptionGroup(profile.secondaryMuscleGroupId) || exercise.secondaryMuscle || "", true, "None")}</select></label>
              <label>Resistance mode<select data-custom-profile-field="resistance-type">${resistanceTypeOptions(resistance)}</select></label>
              <label>Exercise style<select data-custom-profile-field="exercise-style"><option value="">Choose…</option>${[["multi_joint","Multi-joint"],["single_joint","Single-joint"],["isometric","Isometric"],["carry_locomotion","Carry / locomotion"]].map(([value,label]) => `<option value="${value}" ${profile.exerciseStyle === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
              <label>Progression metric<select data-custom-profile-field="progression-metric"><option value="">Choose…</option>${[["load_and_reps","Load and reps"],["reps_only","Reps only"],["assistance","Assistance"],["duration","Duration"],["distance","Distance"]].map(([value,label]) => `<option value="${value}" ${profile.progressionMetric === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
              <label>Smallest available increment<input type="number" min="0.01" step="0.01" value="${profile.smallestIncrement || ""}" data-custom-profile-field="smallest-increment" placeholder="Required for load / assistance" /></label>
            </div>
            <button class="secondary-action" type="button" data-action="complete-custom-exercise-setup" data-exercise-id="${exercise.id}">${missing.length ? "Complete setup and generate guidance" : "Update profile and regenerate unfinished work"}</button>
          </section>
        `;
      }

      function renderExecutionQualityAssessment(exercise) {
        const value = executionQualityValues.has(exercise.executionQualityAssessment) ? exercise.executionQualityAssessment : "not_assessed";
        return `<label class="execution-quality-control">Did execution stay controlled?<select data-action="exercise-execution-quality" data-exercise-id="${exercise.id}"><option value="not_assessed" ${value === "not_assessed" ? "selected" : ""}>Not assessed</option><option value="controlled" ${value === "controlled" ? "selected" : ""}>Controlled</option><option value="breakdown" ${value === "breakdown" ? "selected" : ""}>Breakdown</option></select><small>Only a controlled, complete, pain-free exposure inside target effort can confirm progression.</small></label>`;
      }

      function renderExercise(exercise) {
        const exerciseSets = setsForExercise(exercise.id);
        const isActiveExercise = exerciseSets.some((set) => set.id === activeSetId || timer?.setId === set.id);
        const restriction = exercise.safetyRestriction || exercise.finalPrescription?.safetyRestriction || exercise.recommendationSnapshot?.finalPrescription?.safetyRestriction || null;
        const resolvedSafetyContext = restriction?.status === "resolved_by_confirmed_substitute" && exercise.recommendationSnapshot
          ? safetySubstituteContext(exercise.recommendationSnapshot, { exercise, session: sessionById(exercise.sessionId) })
          : null;
        const substituteValidation = resolvedSafetyContext?.resolvedValidation;
        const addSetSafety = guardWorkoutMutation("add-set", { exercise, substituteValidation }, false);
        const addWarmupSafety = guardWorkoutMutation("add-warmup-set", { exercise, substituteValidation }, false);
        const duplicateSetSafety = guardWorkoutMutation("duplicate-set", { exercise, substituteValidation }, false);
        const substituteRecoveryHtml = restriction?.status === "resolved_by_confirmed_substitute" && substituteValidation?.valid !== true
          ? `<div class="program-warning blocking" data-safety-substitute-recovery="${exercise.id}" role="alert"><strong>Choose a pain-free substitute</strong><span>${escapeHtml(substituteValidation?.message || "The confirmed substitute no longer satisfies the current workout constraints.")}</span><small>Open Exercise options, choose a current catalog-backed replacement, and explicitly confirm it is pain-free before continuing.</small></div>`
          : "";
        const firstWorkSet = exerciseSets.find((set) => isWorkingSet(set, "score")) || exerciseSets[0];
        const restSeconds = Number(exercise.restSeconds || data.settings.defaultRestSeconds || 90);
        const setRestValues = Array.from(new Set(exerciseSets.map((set) => Number(set.targetRestSeconds || restSeconds)).filter((value) => value > 0)));
        const restSummary = setRestValues.length > 1 ? "Per-set rest" : `${setRestValues[0] || restSeconds}s rest`;
        const previousSets = exerciseSets.some((set) => isWorkingSet(set, "progression")) ? measurePerformance("lift:previousPerformance", () => getMostRecentWorkoutSets(exercise.name, { excludeSessionId: exercise.sessionId, resistanceType: resistanceTypeFor(exercise) }), { exerciseId: exercise.id }) : [];
        const warmupIds = exerciseSets.filter((set) => setTypeSemantics(set).isWarmup).map((set) => set.id);
        const workingSetIds = exerciseSets.filter((set) => isWorkingSet(set, "progression")).map((set) => set.id);
        const renderContext = { restSeconds, previousSets, warmupIds, workingSetIds, substituteValidation };
        const setHtml = measurePerformance("lift:setRows", () => exerciseSets.map((set) => renderSet(set, exercise, renderContext)).join(""), { exerciseId: exercise.id, count: exerciseSets.length });
        const customGuidanceIncomplete = exercise.identitySource === "user_declared_custom" && missingCustomExerciseMetrics(normalizeCustomExerciseProfile(exercise.customExerciseProfile)).length > 0;
        const optionsHtml = measurePerformance("lift:exerciseOptions", () => renderCustomExerciseSetup(exercise) + renderStandardWorkloadControls(exercise) + renderExecutionQualityAssessment(exercise) + renderPlateCalculator(exercise, firstWorkSet) + renderMuscleSelectors(exercise) + (customGuidanceIncomplete ? "" : renderExerciseGuidance(exercise)) + renderPrescriptionOverrideControls(exercise, resolvedSafetyContext), { exerciseId: exercise.id });
        return `
          <article id="exercise-${exercise.id}" class="exercise-card ${isActiveExercise ? "active-exercise" : ""}">
            <div class="exercise-header">
              <textarea class="exercise-name exercise-name-field" rows="1" data-action="exercise-name" data-exercise-id="${exercise.id}" aria-label="Exercise name: ${escapeHtml(exercise.name)}" title="${escapeHtml(exercise.name)}">${escapeHtml(exercise.name)}</textarea>
              <div class="exercise-actions">
                <button class="icon-button exercise-order" type="button" data-action="move-exercise" data-direction="-1" data-exercise-id="${exercise.id}" title="Move exercise up" aria-label="Move ${escapeHtml(exercise.name)} up">Up</button>
                <button class="icon-button exercise-order" type="button" data-action="move-exercise" data-direction="1" data-exercise-id="${exercise.id}" title="Move exercise down" aria-label="Move ${escapeHtml(exercise.name)} down">Dn</button>
                <button class="icon-button danger" type="button" data-action="delete-exercise" data-exercise-id="${exercise.id}" title="Delete exercise" aria-label="Delete exercise ${escapeHtml(exercise.name)}">${icon.delete}</button>
              </div>
            </div>
            <div class="exercise-level-controls">
              <label class="deload-toggle ${exercise.isDeload ? "active" : ""}"><input type="checkbox" data-action="exercise-deload" data-exercise-id="${exercise.id}" ${exercise.isDeload ? "checked" : ""} />Deload this exercise <span>${exercise.isDeload ? "Marked" : ""}</span></label>
              <details class="resistance-type-disclosure">
                <summary><strong>Resistance</strong><span>${escapeHtml(resistanceTypeLabel(resistanceTypeFor(exercise)))}</span></summary>
                <div class="resistance-type-popover"><label class="resistance-type-control"><span>Resistance type</span><select data-action="exercise-resistance-type" data-exercise-id="${exercise.id}" aria-label="Resistance type for ${escapeHtml(exercise.name)}">${resistanceTypeOptions(resistanceTypeFor(exercise))}</select></label></div>
              </details>
            </div>
            ${renderPrescriptionDetails(exercise)}
            ${substituteRecoveryHtml}
            ${setHtml}
            <div class="exercise-set-actions" aria-label="Set actions for ${escapeHtml(exercise.name)}">
              <button type="button" data-action="add-set" data-exercise-id="${exercise.id}" aria-label="Add working set to ${escapeHtml(exercise.name)}"${workoutSafetyDisabledAttributes(addSetSafety)}><span aria-hidden="true">+</span> Set</button>
              <button type="button" data-action="add-warmup-set" data-exercise-id="${exercise.id}" aria-label="Add warm-up set to ${escapeHtml(exercise.name)}"${workoutSafetyDisabledAttributes(addWarmupSafety)}><span aria-hidden="true">+</span> Warm-up</button>
              <button type="button" data-action="duplicate-set" data-exercise-id="${exercise.id}" aria-label="Copy the last set for ${escapeHtml(exercise.name)}"${workoutSafetyDisabledAttributes(duplicateSetSafety)}><span aria-hidden="true">&#10697;</span> Copy set</button>
            </div>
            <details class="exercise-options">
              <summary>Exercise options <span>${restSummary}</span></summary>
              <div class="disclosure-body">
                ${optionsHtml}
                ${activeSession()?.templateId ? '<button type="button" data-action="update-template-exercise" data-exercise-id="' + exercise.id + '">Update template from today</button><p class="settings-note">Edits stay in today’s workout unless you choose this button. Completed results—not the original target—drive future recommendations.</p>' : ""}
                <textarea data-action="exercise-notes" data-exercise-id="${exercise.id}" placeholder="Exercise notes" aria-label="Exercise notes">${escapeHtml(exercise.notes)}</textarea>
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

      function renderSet(set, exercise, context = {}) {
        const restSeconds = Number(set.targetRestSeconds || context.restSeconds || exercise.restSeconds || data.settings.defaultRestSeconds || 90);
        const completionSafety = guardWorkoutMutation("toggle-set", { exercise, set, substituteValidation: context.substituteValidation }, false);
        const skipSafety = guardWorkoutMutation("toggle-skip-set", { exercise, set, substituteValidation: context.substituteValidation }, false);
        const timerSafety = guardWorkoutMutation("start-timer", { exercise, set, substituteValidation: context.substituteValidation }, false);
        const resistanceType = resistanceTypeFor(exercise, set);
        const visualState = setVisualState(set);
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
          ? '<div class="set-field set-previous"><span>Previous</span><strong>—</strong><small>Warm-up</small></div>'
          : previous?.priorSessionId
            ? '<a class="set-field set-previous set-previous-link" href="#progress-history" data-action="open-session" data-session-id="' + escapeHtml(previous.priorSessionId) + '" title="Open the ' + escapeHtml(previousDateLabel) + ' workout"><span>Previous</span><strong>' + escapeHtml(previousSummaryText) + '</strong><small>' + escapeHtml(previousDateLabel) + '</small></a>'
            : '<div class="set-field set-previous" title="No previous workout found"><span>Previous</span><strong>—</strong><small>No history</small></div>';
        const targetLoad = Number(set.targetWeight ?? set.weight ?? 0);
        const targetLoadText = formatResistance({ ...set, weight: targetLoad, addedLoad: resistanceType === "bodyweight_plus_load" ? targetLoad : set.addedLoad, assistanceLoad: resistanceType === "assisted_bodyweight" ? targetLoad : set.assistanceLoad, resistanceType });
        const targetRepText = targetRangeText(set.targetRepMin, set.targetRepMax || set.targetReps, " reps");
        const targetRpeText = targetRangeText(set.targetRpeMin, set.targetRpeMax || set.targetRpe, " RPE");
        const progressionReady = set.setPrescription?.progressionReady !== false;
        const nextIncrementText = set.setPrescription?.nextLoad != null
          ? progressionReady
            ? formatResistance({ ...set, weight: set.setPrescription.nextLoad, addedLoad: resistanceType === "bodyweight_plus_load" ? set.setPrescription.nextLoad : set.addedLoad, assistanceLoad: resistanceType === "assisted_bodyweight" ? set.setPrescription.nextLoad : set.assistanceLoad, resistanceType })
            : "Hold current " + targetLoadText
          : "Not configured";
        const progressionRule = set.setPrescription?.progressionRule || "Progress after reaching the top of the programmed range within the RPE target.";
        const performanceField = resistanceType === "duration"
          ? '<label class="set-field"><span>Seconds</span><input type="number" min="0" value="' + Number(set.durationSeconds || 0) + '" data-action="set-duration" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' seconds" /></label>'
          : resistanceType === "distance"
            ? '<label class="set-field"><span>Distance</span><input type="number" min="0" step="0.1" value="' + Number(set.distance || 0) + '" data-action="set-distance" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' distance" /></label>'
            : '<label class="set-field"><span>Reps</span><input type="number" min="0" value="' + set.reps + '" data-action="set-reps" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' reps" /></label>';
        const loadField = resistanceType === "bodyweight"
          ? '<div class="set-field"><span>Load</span><div class="resistance-readout">BW</div></div>'
          : resistanceType === "duration" || resistanceType === "distance"
            ? '<div class="set-field"><span>Load</span><div class="resistance-readout">—</div></div>'
            : '<label class="set-field"><span>' + (resistanceType === 'bodyweight_plus_load' ? 'Added' : resistanceType === 'assisted_bodyweight' ? 'Assist' : 'Load') + '</span><input type="number" min="0" step="' + (data.settings.weightUnit === 'lb' ? '0.5' : '0.001') + '" value="' + displayLoadNumber(resistanceLoad(set, resistanceType), set.weightUnit || data.settings.weightUnit) + '" data-action="set-weight" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' ' + (resistanceType === 'bodyweight_plus_load' ? 'added load' : resistanceType === 'assisted_bodyweight' ? 'assistance load' : 'load') + '" /></label>';
        return `
          <div id="set-${set.id}" data-set-state="${visualState}" class="set-block ${visualState === "completed" ? "completed" : ""} ${isNext ? "next-set" : ""} ${isNext && activeSetAcknowledged ? "acknowledged" : ""} ${visualState === "edited" ? "edited-set" : ""} ${visualState === "skipped" ? "skipped-set" : ""} ${isResting ? "resting-set" : ""}">
            <div class="set-heading">
              <span class="set-type-badge type-${escapeHtml(role)}">${escapeHtml(executionLabel.toUpperCase())}${set.manualOverride ? " · CORRECTED" : ""}</span>
              ${set.validationWarning ? '<span class="set-validation-warning">Review prescription</span>' : ""}
            </div>
            <div class="set-row ${visualState === "completed" ? "completed" : "pending"} ${set.isWarmup ? "warmup" : ""}">
              <div class="set-field set-index"><span>Set</span><strong>${warmupIndex >= 0 ? "WU" + (warmupIndex + 1) : set.setNumber}</strong></div>
              ${previousField}
              ${loadField}
              ${performanceField}
              <label class="set-field"><span>RPE</span><input type="number" min="0" max="10" step="0.5" value="${set.rpe}" data-action="set-rpe" data-set-id="${set.id}" aria-label="Set ${set.setNumber} RPE" /></label>
              <div class="set-field set-status"><span>Status</span><button class="check-button ${set.completed ? "checked" : ""}" type="button" data-action="toggle-set" data-set-id="${set.id}" title="${set.completed ? "Completed" : "Mark set complete"}" aria-label="${set.completed ? "Set completed" : "Mark set complete"}" aria-pressed="${set.completed ? "true" : "false"}"${workoutSafetyDisabledAttributes(completionSafety)}>${icon.done}</button></div>
            </div>
            ${isNext ? '<div class="next-set-banner"><span aria-hidden="true">&#10148;</span><span>' + escapeHtml(activeSetAcknowledged ? "Current set" : activeSetNotice || "Current set") + '</span></div>' : ""}
            <details class="set-tools-disclosure" ${isResting || visualState === "edited" || isEditingHistorySession() ? "open" : ""}>
              <summary aria-label="Set options"><span aria-hidden="true">•••</span></summary>
              <div class="set-tools-panel">
                ${!setTypeSemantics(set).isWarmup ? '<details class="set-progress-disclosure"><summary><span>Progress when</span><b>Next ' + escapeHtml(nextIncrementText) + '</b></summary><div><strong>' + escapeHtml(progressionRule) + '</strong><small>Today: ' + escapeHtml(targetLoadText + ' · ' + targetRepText + ' · ' + targetRpeText) + ' · ' + escapeHtml(String(set.setPrescription?.confidence || set.prescriptionConfidence || 'low') + ' confidence') + '</small></div></details>' : ""}
                <div class="set-actions">
                  <button class="mini-button set-rest-button" type="button" data-action="start-timer" data-exercise-id="${exercise.id}" data-set-id="${set.id}"${workoutSafetyDisabledAttributes(timerSafety)}>${icon.clock} ${formatTimer(restSeconds)}</button>
                  ${isEditingHistorySession() ? '<label class="set-type-editor"><span>Set type</span><select data-action="set-type-override" data-set-id="' + set.id + '">' + ['warmup','straight','top','backoff','drop'].map((type) => '<option value="' + type + '" ' + (normalizeSetTypeCode(set.setType, set.isWarmup) === type ? 'selected' : '') + '>' + escapeHtml(setTypeLabels[type]) + '</option>').join('') + '</select></label>' : ''}
                  ${set.manualOverride && isEditingHistorySession() && set.classificationUndo ? '<button class="mini-button" type="button" data-action="undo-set-type-override" data-set-id="' + set.id + '">Undo type change</button>' : ''}
                  <button class="mini-button set-skip-button ${set.skipped ? "active" : ""}" type="button" data-action="toggle-skip-set" data-set-id="${set.id}"${workoutSafetyDisabledAttributes(skipSafety)}>${set.skipped ? "Skipped" : "Skip"}</button>
                  <button class="mini-button" type="button" data-action="delete-set" data-set-id="${set.id}">Remove</button>
                  ${visualState === "edited" ? '<span class="edited-indicator">Edited, not completed</span>' : ""}
                </div>
              </div>
            </details>
            ${renderTimer(set.id)}
          </div>
        `;
      }

      function readablePrescriptionLine(target) {
        return target.sets + " set" + (Number(target.sets) === 1 ? "" : "s") + " | " + formatResistance(target) + " x " + target.reps + " reps @ RPE " + target.rpe + (target.restSeconds ? " | " + target.restSeconds + "s rest" : "");
      }

      function renderRolePrescriptionDetails(exercise) {
        const byRole = new Map();
        setsForExercise(exercise.id).filter((set) => isWorkingSet(set, "score")).forEach((set) => {
          const role = normalizeSetTypeCode(set.setType, set.isWarmup);
          if (!byRole.has(role)) byRole.set(role, set);
        });
        if (!byRole.size) return "";
        return '<div class="role-prescription-list">' + Array.from(byRole.entries()).map(([role, set]) => {
          const load = formatResistance({ ...set, weight: Number(set.targetWeight ?? set.weight ?? 0), addedLoad: set.resistanceType === "bodyweight_plus_load" ? Number(set.targetWeight ?? set.addedLoad ?? 0) : set.addedLoad, assistanceLoad: set.resistanceType === "assisted_bodyweight" ? Number(set.targetWeight ?? set.assistanceLoad ?? 0) : set.assistanceLoad });
          const reps = targetRangeText(set.targetRepMin, set.targetRepMax || set.targetReps, " reps");
          const targetReps = Number(set.targetReps || set.reps || set.targetRepMin || 0);
          const rpe = targetRangeText(set.targetRpeMin, set.targetRpeMax || set.targetRpe, " RPE");
          const previous = formatPreviousSetPerformance(set.previousComparableSet, exercise);
          const nextIncrement = set.setPrescription?.nextLoad != null
            ? formatResistance({ ...set, weight: set.setPrescription.nextLoad, addedLoad: set.resistanceType === "bodyweight_plus_load" ? set.setPrescription.nextLoad : set.addedLoad, assistanceLoad: set.resistanceType === "assisted_bodyweight" ? set.setPrescription.nextLoad : set.assistanceLoad })
            : "Not configured";
          const confidence = String(set.setPrescription?.confidence || set.prescriptionConfidence || "low");
          const progressionRule = set.setPrescription?.progressionRule || "Reach the top of the programmed range without exceeding the RPE target.";
          const reason = recommendationExplanationForDisplay(set.setPrescription?.reason || set.prescriptionReason, "This set follows its programmed role and comparable history.");
          return '<div class="role-prescription"><span>' + escapeHtml(setTypeLabels[role] || "Working set") + '</span><div class="role-performance-grid"><div><small>Last time</small><strong>' + escapeHtml(previous) + '</strong></div><div><small>Today</small><strong>' + escapeHtml(load + ' × ' + targetReps + ' reps') + '</strong><b>' + escapeHtml(reps + ' range · ' + rpe) + '</b></div></div><div class="role-progression-facts"><div><small>Confidence</small><strong>' + escapeHtml(confidence.charAt(0).toUpperCase() + confidence.slice(1)) + '</strong></div><div><small>Target reps</small><strong>' + escapeHtml(String(targetReps)) + '</strong></div><div><small>Next increment</small><strong>' + escapeHtml(nextIncrement) + '</strong></div></div><div class="role-progress-rule"><small>Progress when</small><strong>' + escapeHtml(progressionRule) + '</strong></div><p>' + escapeHtml(reason) + '</p></div>';
        }).join('') + '</div>';
      }

      function roleSessionPrescriptionLine(exercise, fallback = "") {
        const groups = new Map();
        setsForExercise(exercise.id).filter((set) => isWorkingSet(set, "score")).forEach((set) => {
          const role = normalizeSetTypeCode(set.setType, set.isWarmup);
          const group = groups.get(role) || { set, count: 0 };
          group.count += 1;
          groups.set(role, group);
        });
        if (!groups.size) return fallback;
        return Array.from(groups.entries()).map(([role, group]) => {
          const set = group.set;
          const load = formatResistance({ ...set, weight: Number(set.targetWeight ?? set.weight ?? 0), addedLoad: set.resistanceType === "bodyweight_plus_load" ? Number(set.targetWeight ?? set.addedLoad ?? 0) : set.addedLoad, assistanceLoad: set.resistanceType === "assisted_bodyweight" ? Number(set.targetWeight ?? set.assistanceLoad ?? 0) : set.assistanceLoad });
          const reps = targetRangeText(set.targetRepMin, set.targetRepMax || set.targetReps, " reps");
          const targetReps = Number(set.targetReps || set.reps || set.targetRepMin || 0);
          const rpe = targetRangeText(set.targetRpeMin, set.targetRpeMax || set.targetRpe, " RPE");
          return `${group.count}x ${setTypeLabels[role] || "working"}: ${load} x ${targetReps} reps (${reps} range) @ ${rpe}`;
        }).join(" | ");
      }

      function prescriptionMetric(value, suffix = "") {
        if (!value || typeof value !== "object") return "—";
        const finite = (candidate) => candidate === null || candidate === undefined || !Number.isFinite(Number(candidate)) ? null : Number(candidate);
        const min = finite(value.min);
        const max = finite(value.max);
        const target = finite(value.target) ?? (min !== null && min === max ? min : null);
        if (min === null && max === null && target === null) return "—";
        const range = min !== null && max !== null && min !== max ? ` (${min}-${max})` : "";
        return `${target ?? min ?? max}${range}${suffix}`;
      }

      function renderUnifiedEvidence(snapshot) {
        const displaySnapshot = recommendationSnapshotForDisplay(snapshot);
        if (!displaySnapshot) return "";
        const prescription = displaySnapshot.finalPrescription;
        const base = displaySnapshot.basePrescription;
        const sourceUnit = prescription.prescribedLoad?.unit || data.settings.weightUnit;
        const previousLoad = Number(convertWeightValue(prescription.prescribedLoad?.previous || base.prescribedLoad?.previous || 0, sourceUnit, data.settings.weightUnit));
        const targetLoad = Number(convertWeightValue(prescription.prescribedLoad?.target || 0, sourceUnit, data.settings.weightUnit));
        const changes = [];
        if (base.workingSets.target !== prescription.workingSets.target) changes.push('Sets ' + base.workingSets.target + ' → ' + prescription.workingSets.target);
        if (base.repRange.target !== prescription.repRange.target) changes.push('Rep target ' + (base.repRange.target ?? base.repRange.min + '–' + base.repRange.max) + ' → ' + (prescription.repRange.target ?? prescription.repRange.min + '–' + prescription.repRange.max));
        if (previousLoad && targetLoad && previousLoad !== targetLoad) changes.push('Load ' + displayLoadNumber(previousLoad) + ' → ' + displayLoadNumber(targetLoad) + ' ' + data.settings.weightUnit);
        if (base.targetRpe.min !== prescription.targetRpe.min || base.targetRpe.max !== prescription.targetRpe.max) changes.push('RPE ' + base.targetRpe.min + '–' + base.targetRpe.max + ' → ' + prescription.targetRpe.min + '–' + prescription.targetRpe.max);
        const scores = [
          ["Personal evidence", Number.isFinite(Number(prescription.personalEvidenceWeight)) ? Math.round(prescription.personalEvidenceWeight * 100) + "%" : "Unavailable"],
          ["Research evidence", Number.isFinite(Number(prescription.researchEvidenceWeight)) ? Math.round(prescription.researchEvidenceWeight * 100) + "%" : "Unavailable"],
          ["Exercise score", Number.isFinite(Number(prescription.exerciseScore)) ? Math.round(prescription.exerciseScore) + "/100" : "Unavailable"],
          ["Staleness", prescription.staleness?.label || "Insufficient evidence"],
          ["Deload scope", recommendationLabel(prescription.deloadStatus?.state || "normal")],
          ["Versions", `Rx ${displaySnapshot.recommendationVersion} · personal ${displaySnapshot.personalDataVersion} · research ${displaySnapshot.researchDatabaseVersion}`]
        ];
        return '<div class="recommendation-rationale"><h4>Why This Recommendation</h4><p class="rationale-reason">' + escapeHtml(prescription.userExplanation) + '</p>' + (prescription.prescribedLoad?.reason ? '<p class="settings-note"><strong>History and high watermark:</strong> ' + escapeHtml(prescription.prescribedLoad.reason) + '</p>' : '') + (changes.length ? '<div class="prescription-change-list"><strong>What changed</strong><span>' + escapeHtml(changes.join(' · ')) + '</span></div>' : '') + '<div class="rationale-facts">' + scores.map(([label, value]) => '<div><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>').join('') + '</div><h4>Evidence</h4><ul>' + (prescription.evidenceSummary || []).map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul><p class="settings-note"><strong>What would change this:</strong> ' + escapeHtml(prescription.substitutionRule || prescription.regressionRule) + '</p></div>';
      }

      function renderUnifiedPrescriptionDetails(exercise, snapshot) {
        const displaySnapshot = recommendationSnapshotForDisplay(snapshot);
        if (!displaySnapshot) return '<div class="program-warning blocking" role="alert"><strong>Recommendation unavailable</strong><span>This exercise cannot be used until its saved recommendation is rebuilt.</span></div>';
        const base = displaySnapshot.basePrescription;
        const final = displaySnapshot.finalPrescription;
        const changed = Boolean(final.readinessAdjustment?.changed);
        const sourceUnit = final.prescribedLoad?.unit || data.settings.weightUnit;
        const finalLoad = Number(convertWeightValue(final.prescribedLoad?.target || 0, sourceUnit, data.settings.weightUnit));
        const loadText = finalLoad > 0 ? displayLoadNumber(finalLoad) + " " + data.settings.weightUnit + " × " : "";
        const structureText = final.setStructure === "top_set_backoff" ? "top + back-off" : final.setStructure.replaceAll('_', ' ');
        const baseLine = `${prescriptionMetric(base.workingSets, " sets")} · ${prescriptionMetric(base.repRange, " reps")} · RPE ${prescriptionMetric(base.targetRpe)}`;
        const fallbackFinalLine = `${prescriptionMetric(final.workingSets, " sets")} · ${loadText}${prescriptionMetric(final.repRange, " reps")} · RPE ${prescriptionMetric(final.targetRpe)}`;
        const finalLine = roleSessionPrescriptionLine(exercise, fallbackFinalLine);
        const summary = changed
          ? '<span class="prescription-tier"><span>Base prescription</span><strong>' + escapeHtml(baseLine) + '</strong></span><span class="prescription-tier readiness-tier"><span>Today only</span><strong>' + escapeHtml(finalLine) + '</strong></span><span class="why-link">Why this changed</span>'
          : '<span class="prescription-tier"><span>' + escapeHtml(recommendationActionLabel(final)) + '</span><strong>' + escapeHtml(finalLine + ' · ' + structureText) + '</strong></span><span class="why-link">Why This Recommendation</span>';
        return '<details class="prescription-brief unified-prescription ' + (final.recommendationType.includes('deload') ? 'deload' : '') + ' ' + (changed ? 'readiness-adjusted' : '') + '"><summary data-action="toggle-prescription-rationale" aria-label="Why this recommendation?">' + summary + '</summary><div class="prescription-fact-grid"><div><span>Rest</span><strong>' + escapeHtml(prescriptionMetric(final.restSeconds, ' sec')) + '</strong></div><div><span>Frequency</span><strong>' + escapeHtml(prescriptionMetric(final.frequencyPerWeek, '/week')) + '</strong></div><div><span>Role</span><strong>' + escapeHtml(final.role.replaceAll('_', ' ')) + '</strong></div><div><span>Confidence</span><strong>' + escapeHtml(final.confidence) + '</strong></div></div><p class="prescription-action"><strong>Next action:</strong> ' + escapeHtml(final.progressionRule) + '</p>' + (changed ? '<p class="readiness-temporary"><strong>Temporary:</strong> ' + escapeHtml(final.readinessAdjustment.explanation + ' ' + final.readinessAdjustment.resumeRule) + '</p>' : '') + renderRolePrescriptionDetails(exercise) + renderUnifiedEvidence(displaySnapshot) + '</details>';
      }

      function renderPrescriptionDetails(exercise) {
        if (exercise.recommendationSnapshot) return renderUnifiedPrescriptionDetails(exercise, exercise.recommendationSnapshot);
        const target = exercise.prescription;
        if (!target) return "";
        if (target.executionBlocked === true && target.executable === false) {
          const message = recommendationExplanationForDisplay(target.message || target.reason, "The saved recommendation is not executable.");
          return '<div class="program-warning blocking" role="alert"><strong>Exercise unavailable</strong><span>This exercise cannot be used with the current workout constraints.</span><small>' + escapeHtml(message) + '</small></div>';
        }
        const label = target.isDeload ? "Deload prescription" : target.mode === "technique" ? "Technique prescription" : "Recommended";
        const original = exercise.originalPrescription;
        const changed = Boolean(target.adjusted && original);
        const summary = changed
          ? '<span class="prescription-tier"><span>Recommended</span><strong>' + escapeHtml(readablePrescriptionLine(original)) + '</strong></span><span class="prescription-tier readiness-tier"><span>Today\'s readiness</span><strong>' + escapeHtml(readablePrescriptionLine(target)) + '</strong></span><span class="why-link">Why this changed</span>'
          : '<span class="prescription-tier"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(readablePrescriptionLine(target)) + '</strong></span><span class="why-link">Why This Recommendation</span>';
        const reason = recommendationExplanationForDisplay(target.adjustmentReason || target.reason, "This target follows the most comparable submitted performance and the programmed rep range.");
        const reasonParts = reason.split("Why these levers:");
        const reasonMarkup = reasonParts.length > 1
          ? '<div class="rationale-copy"><div><span>What triggered it</span><p class="rationale-reason">' + escapeHtml(reasonParts[0].trim()) + '</p></div><div><span>Why these changes</span><p class="rationale-reason">' + escapeHtml(reasonParts.slice(1).join("Why these levers:").trim()) + '</p></div></div>'
          : '<p class="rationale-reason">' + escapeHtml(reason) + '</p>';
        const rationale = '<div class="recommendation-rationale"><div class="rationale-heading"><span class="rationale-icon" aria-hidden="true">i</span><div><strong>' + (changed ? 'Why today\'s target changed' : 'Why this recommendation') + '</strong><span>Based on submitted history and programming rules</span></div></div>' + reasonMarkup + renderRolePrescriptionDetails(exercise) + '</div>';
        return '<details class="prescription-brief ' + (target.isDeload ? 'deload' : '') + ' ' + (changed ? 'readiness-adjusted' : '') + '"><summary data-action="toggle-prescription-rationale" aria-label="' + (changed ? 'Why this changed' : 'Why this recommendation?') + '">' + summary + '</summary>' + rationale + '</details>';
      }

      function renderPlateCalculator(exercise, set) {
        if (!set || resistanceTypeFor(exercise, set) !== "external" || !isBarbellExercise(exercise.name)) return "";
        const total = Number(set.weight || 0);
        const unit = set.weightUnit || data.settings.weightUnit;
        const bar = unit === "kg" ? 20 : 45;
        if (total <= 0) return '<div class="plate-calculator"><strong>Plate calculator</strong><span>Enter the total bar weight to see plates per side.</span></div>';
        if (total < bar) return '<div class="plate-calculator"><strong>Plate calculator</strong><span>Total load is below the standard ' + bar + ' ' + unit + ' bar.</span></div>';
        const available = unit === "kg" ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
        let remaining = Math.max(0, (total - bar) / 2);
        const plates = [];
        available.forEach((plate) => {
          const count = Math.floor((remaining + 0.001) / plate);
          if (count > 0) {
            plates.push(count + " × " + plate);
            remaining = Math.round((remaining - count * plate) * 100) / 100;
          }
        });
        const plateText = plates.length ? plates.join(" + ") : "empty bar";
        const remainder = remaining > 0.01 ? " · " + remaining + " " + unit + " per side cannot be made with standard plates" : "";
        return '<div class="plate-calculator"><strong>Plate calculator · ' + total + ' ' + unit + '</strong><span>Each side: ' + plateText + remainder + '</span></div>';
      }

      function isBarbellExercise(name) {
        const value = String(name || "").toLowerCase();
        return /barbell|bench press|back squat|front squat|deadlift|good morning|hip thrust/.test(value) && !/dumbbell|machine|cable|smith/.test(value);
      }

      function renderTimer(setId) {
        if (!timer || timer.setId !== setId) return "";
        const elapsed = Math.max(0, timer.durationSeconds - timer.remainingSeconds);
        const progress = timer.durationSeconds > 0 ? Math.min(100, Math.round((elapsed / timer.durationSeconds) * 100)) : 100;
        const notificationStatus = timer.notificationStatus === "scheduled" ? "Lock-screen alert scheduled" : timer.notificationStatus === "error" ? "Foreground alert only" : timer.notificationStatus === "paused" ? "Notification paused" : "Scheduling alert";
        const sourceExercise = exerciseById(timer.exerciseId);
        const nextSet = setById(timer.pendingNextSetId);
        const nextExercise = nextSet ? exerciseById(nextSet.exerciseId) : null;
        return `
          <details class="timer-bar" data-timer-id="${timer.id}">
            <summary class="timer-summary" aria-label="${timer.isPaused ? "Paused rest timer" : "Rest timer"}, ${formatTimer(timer.remainingSeconds)} remaining. Open timer controls.">
              <div class="timer-progress" role="progressbar" aria-label="Rest elapsed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" style="--timer-progress:${progress}%"><span></span><b data-timer-progress-label>${formatTimer(timer.remainingSeconds)}</b></div>
              <span class="timer-summary-hint">Adjust</span>
            </summary>
            <div class="timer-controls-panel">
              <div class="timer-heading"><span class="timer-icon" aria-hidden="true">&#9201;</span><div class="timer-heading-copy"><span>${timer.isPaused ? "Paused" : "Rest"}</span><strong data-timer-countdown>${formatTimer(timer.remainingSeconds)}</strong><small>${escapeHtml(notificationStatus)}</small></div></div>
              <div class="timer-secondary-controls"><button class="timer-control timer-pause" type="button" data-action="toggle-timer" title="${timer.isPaused ? "Resume timer" : "Pause timer"}" aria-label="${timer.isPaused ? "Resume timer" : "Pause timer"}">${timer.isPaused ? icon.play : icon.pause}</button><button class="timer-control timer-cancel" type="button" data-action="clear-timer" title="Cancel timer" aria-label="Cancel timer">${icon.delete}</button></div>
              <div class="timer-primary-controls" aria-label="Rest timer adjustments">
                <button class="timer-adjust" type="button" data-action="adjust-timer" data-seconds="-15" title="Reduce rest by 15 seconds" aria-label="Reduce rest by 15 seconds">− 15 sec</button>
                <button class="timer-adjust" type="button" data-action="adjust-timer" data-seconds="15" title="Add 15 seconds" aria-label="Add 15 seconds">+ 15 sec</button>
                <button class="timer-skip" type="button" data-action="skip-timer" title="Skip remaining rest">Skip rest</button>
              </div>
              <div class="timer-context">After ${escapeHtml(sourceExercise?.name || "this set")} ${nextSet ? "&#8226; Next: " + escapeHtml(nextExercise?.name || sourceExercise?.name || "Exercise") + " &#8226; " + escapeHtml(setExecutionLabel(nextSet)) : "&#8226; Final set"}</div>
            </div>
          </details>
        `;
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

      function mesocycleTypeLabel(type) {
        return ({
          primary_progression: "Primary progression",
          alternative_exercise: "Alternative exercises",
          lower_fatigue_resensitization: "Lower fatigue / resensitization",
          specialization: "Specialization"
        })[type] || type.replaceAll("_", " ");
      }

      const mesocycleEquipmentTaxonomy = Object.freeze([
        ["all", "All Equipment / Standard Gym"], ["bodyweight", "Bodyweight"], ["bands", "Bands"],
        ["dumbbell", "Dumbbells"], ["barbell", "Barbell"], ["rack", "Rack"], ["cable_station", "Cable Station"]
      ]);

      function mesocycleEquipmentSelection() {
        const selected = data.settings.availableEquipment || [];
        return !selected.length || selected.includes("all") ? ["all"] : selected;
      }

      function presentationLabel(value) {
        const key = String(value || "").trim().toLowerCase().replace(/^mg[_-]/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        if (!key) return "Not Available";
        const mapped = typeof presentationLabels !== "undefined" ? presentationLabels[key] : "";
        return mapped || key.split("_").filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
      }

      function guidedDraft() {
        return data.mesocycles.find((item) => item.id === guidedMesocycleDraftId && item.builderMode === "guided") || data.mesocycles.find((item) => item.builderMode === "guided" && ["draft", "planned"].includes(item.status)) || null;
      }

      function guidedAvailableMuscles() {
        if (!prescriptionEngine || !prescriptionApi) return [];
        return Array.from(new Set(prescriptionApi.representedMuscleGroups(prescriptionEngine.evidence).map(prescriptionApi.muscleFamily))).filter(Boolean).sort();
      }

      function guidedTargetFor(muscleGroupId, draft = guidedDraft()) {
        const defaults = prescriptionApi?.aggregateMuscleResearchDefaults?.(prescriptionEngine?.evidence?.research, muscleGroupId);
        let result = defaults?.weeklySets ? { min: Number(defaults.weeklySets.min), target: Number(defaults.weeklySets.target), max: Number(defaults.weeklySets.max) } : { min: 6, target: 10, max: 14 };
        const priority = draft?.musclePriorities?.[muscleGroupId];
        if (priority === "maintenance") result = { min: Math.max(2, Math.round(result.min * .5)), target: Math.max(3, Math.round(result.target * .55)), max: Math.max(5, Math.round(result.max * .65)) };
        if (priority === "specialization") result = { min: result.min, target: Math.min(result.max, result.target + 2), max: result.max + 2 };
        return result;
      }

      function guidedMuscleStatuses(draft = guidedDraft()) {
        return draft ? guidedMesocycleApi.muscleTargetStatuses(draft, guidedLedger(draft), (muscle) => guidedTargetFor(muscle, draft)) : [];
      }

      function guidedStepIndex(step) { return guidedMesocycleApi.STEPS.indexOf(step); }
      function guidedStepUnlocked(draft, step) { return guidedStepIndex(step) <= guidedStepIndex(draft?.planningProgress?.highestUnlockedStep || (draft?.guidedDays?.length ? "build" : "guide")); }

      function setGuidedStep(step) {
        const draft = guidedDraft();
        if (step === "guide") { guidedMesocycleView = "guidelines"; render(); return; }
        if (step === "setup" && (!draft || guidedStepUnlocked(draft, "setup"))) {
          if (draft) {
            mesocycleDraftType = draft.type;
            mesocycleDurationDraft = String(draft.durationWeeks);
            mesocycleScopeDraft = new Set(draft.includedMuscleGroupIds || []);
            mesocycleSpecializationMuscle = draft.specializationMuscleGroups?.[0] || "";
          }
          guidedMesocycleView = "setup";
          render();
          requestAnimationFrame(() => {
            const objectiveSelect = document.querySelector('[data-action="mesocycle-type"]');
            if (objectiveSelect) objectiveSelect.value = mesocycleDraftType;
          });
          return;
        }
        if (!draft || !guidedStepUnlocked(draft, step)) return;
        guidedMesocycleView = step === "check" ? "viability" : "builder";
        guidedWeeklySummaryOpen = false;
        guidedGenerationReviewOpen = step === "create";
        render();
      }

      function guidedRelationships(assignment) {
        if (assignment.muscleRelationships?.length) return assignment.muscleRelationships.map((item) => ({ muscleGroupId: prescriptionApi.muscleFamily(item.muscle_group_id || item.muscleGroupId), relationshipType: item.relationship_type || item.relationshipType, setContribution: Number(item.fractional_set_credit ?? item.setContribution ?? (item.relationship_type === "direct_load" ? 1 : 0)) }));
        return prescriptionApi.calculateExerciseMuscleContributions(prescriptionEngine.evidence.research, assignment.researchExerciseId || assignment.exerciseId, 1).map((item) => ({ muscleGroupId: prescriptionApi.muscleFamily(item.muscleGroupId), relationshipType: item.relationshipType, setContribution: item.weightedHypertrophySets }));
      }

      function guidedLedger(draft = guidedDraft()) {
        return draft && guidedMesocycleApi ? guidedMesocycleApi.volumeLedger(draft, guidedRelationships) : { dayTotals: [], muscleTotals: [] };
      }

      function updateGuidedDraft(updated, options = {}) {
        guidedMesocycleDraftId = updated.id;
        commit({ ...data, mesocycles: data.mesocycles.map((item) => item.id === updated.id ? updated : item) }, options.render !== false);
      }

      function beginGuidedMesocycle() {
        guidedGenerationReviewOpen = false;
        const existing = guidedDraft();
        if (existing) {
          guidedMesocycleDraftId = existing.id;
          guidedSelectedDayId = existing.guidedDays?.[0]?.id || "";
          guidedMesocycleView = existing.creationResult ? "completion" : "builder";
        } else guidedMesocycleView = "guidelines";
        render();
      }

      function createGuidedMesocycleDraft() {
        const muscles = mesocycleScopeDraft ? Array.from(mesocycleScopeDraft) : guidedAvailableMuscles();
        const existing = guidedDraft();
        const trainingDays = Number(data.settings.trainingDaysPerWeek || 4);
        const baseOptions = { type: mesocycleDraftType, durationWeeks: Number(mesocycleDurationDraft || 6), trainingDays, availableEquipment: mesocycleEquipmentSelection(), includedMuscleGroupIds: muscles, specializationMuscleGroups: mesocycleSpecializationMuscle ? [mesocycleSpecializationMuscle] : [], musclePriorities: Object.fromEntries(muscles.map((muscle) => [muscle, existing?.musclePriorities?.[muscle] || (mesocycleSpecializationMuscle === muscle ? "specialization" : "normal")])) };
        let draft;
        if (existing) {
          const removedDays = existing.guidedDays.slice(trainingDays);
          if (removedDays.some((day) => day.assignments.length)) return showAppToast("Move or remove exercises from training days that would be removed before reducing the schedule.");
          const generated = guidedMesocycleApi.createDraft(baseOptions);
          const guidedDays = Array.from({ length: trainingDays }, (_, index) => existing.guidedDays[index] || generated.guidedDays[index]);
          draft = { ...existing, ...baseOptions, guidedDays, viabilityResult: null, viabilityStale: true, revision: Number(existing.revision || 0) + 1, planningProgress: { ...existing.planningProgress, highestUnlockedStep: "check", completedSteps: (existing.planningProgress?.completedSteps || []).filter((step) => !["check", "create"].includes(step)), setupRevision: Number(existing.planningProgress?.setupRevision || 0) + 1, viabilityRevision: null, createReadyRevision: null }, updatedAt: isoNow() };
        } else draft = guidedMesocycleApi.createDraft(baseOptions);
        draft = guidedMesocycleApi.unlockStep(draft, "build", "guide");
        draft = guidedMesocycleApi.unlockStep(draft, "build", "setup");
        guidedMesocycleDraftId = draft.id;
        guidedSelectedDayId = draft.guidedDays[0]?.id || "";
        guidedMesocycleView = "builder";
        commit({ ...data, mesocycles: existing ? data.mesocycles.map((item) => item.id === draft.id ? draft : item) : [draft, ...data.mesocycles] });
      }

      function guidedCandidatePool(muscleGroupId) {
        if (!prescriptionEngine || !muscleGroupId) return [];
        try { return prescriptionEngine.rankExercisePool(muscleGroupId, { maxCandidates: 20, availableEquipment: mesocycleEquipmentSelection(), mesocycleType: guidedDraft()?.type }).candidates || []; }
        catch { return []; }
      }

      function selectGuidedExercise(dayId, exerciseId, muscleGroupId) {
        const draft = guidedDraft();
        const candidate = guidedCandidatePool(muscleGroupId).find((item) => item.exerciseId === exerciseId);
        if (!draft || !candidate) return;
        const recommendation = candidate.recommendedSetRange ? null : unifiedPrescriptionSnapshot({ name: candidate.exerciseName }, { exerciseId: candidate.exerciseId, muscleGroupId, mesocycle: draft, fresh: true });
        const prescription = recommendation?.basePrescription;
        const assignment = {
          exerciseId: candidate.exerciseId, researchExerciseId: candidate.researchExerciseId, name: candidate.exerciseName, muscleGroupId,
          canonicalExerciseId: candidate.researchExerciseId || candidate.exerciseId, targetMuscleEffectiveness: Number(candidate.scores?.targetMuscleEffectiveness ?? candidate.scores?.muscleSpecificity ?? 0), confidence: candidate.personalDataConfidence || candidate.scores?.confidence || "research_default",
          primaryMuscles: candidate.primaryMuscles || [muscleGroupId], secondaryMuscles: candidate.secondaryMuscles || [], muscleRelationships: candidate.muscleRelationships || [],
          role: candidate.intendedRole || "secondary_hypertrophy_lift", movementPattern: candidate.movementPattern || candidate.jointActions?.join(" + ") || "",
          jointActions: candidate.jointActions || [], systemicFatigue: Number(candidate.scores?.systemicFatigue || candidate.scores?.fatigueCost || 0), localFatigue: Number(candidate.scores?.localFatigue || candidate.scores?.fatigueCost || 0), spinalLoad: Number(candidate.scores?.spinalLoad || 0), gripDemand: Number(candidate.scores?.gripDemand || 0), jointStress: Number(candidate.scores?.jointStress || 0), stabilityDemand: candidate.diversitySignature?.stability || "", stimulusToFatigue: Number(candidate.scores?.recoveryEfficiency || 0),
          equipmentRequirements: candidate.equipmentRequirements || [], workingSets: Number(candidate.recommendedSetRange?.target || prescription?.workingSets?.target || 3),
          repRange: candidate.recommendedRepRange || prescription?.repRange || { min: 8, target: 10, max: 12 }, targetRpe: candidate.recommendedRpe || prescription?.targetRpe || { min: 7, max: 8 }, targetRir: candidate.recommendedRir || prescription?.targetRir,
          setStructure: candidate.recommendedSetStructure || prescription?.setStructure || "straight_sets", restSeconds: Number(prescription?.restSeconds?.target || 120),
          progressionRule: candidate.progressionInstruction || prescription?.progressionRule || "Use double progression within the recommended rep range.", recommendationSnapshot: recommendation
        };
        guidedPendingAssignment = assignment;
        render();
        window.requestAnimationFrame(() => {
          const target = document.querySelector('[data-guided-configuration]');
          if (!target) return;
          target.scrollIntoView({ block: "center", behavior: preferredScrollBehavior() });
          target.focus({ preventScroll: true });
        });
      }

      function confirmGuidedExercise() {
        const draft = guidedDraft();
        const pending = guidedPendingAssignment;
        if (!draft || !pending || !guidedExerciseBrowserDayId) return;
        const updated = guidedMesocycleApi.addExercise(draft, guidedExerciseBrowserDayId, pending);
        if (updated.assignmentError) return showAppToast(updated.assignmentError.reason === "already_added_to_day" ? "This exercise is already assigned to this training day." : "The exercise could not be added.");
        guidedPendingAssignment = null;
        guidedReturnFocusToPicker = true;
        updateGuidedDraft(updated);
        window.requestAnimationFrame(() => {
          const picker = document.querySelector('[data-guided-exercise-picker]');
          picker?.scrollIntoView({ block: "start", behavior: preferredScrollBehavior() });
          picker?.focus({ preventScroll: true });
          guidedReturnFocusToPicker = false;
        });
      }

      function checkGuidedViability() {
        const draft = guidedDraft();
        if (!draft) return;
        const result = guidedMesocycleApi.viability(draft, { ledger: guidedLedger(draft), targetFor: (muscle) => guidedTargetFor(muscle, draft) });
        let updated = { ...draft, viabilityResult: result, viabilityStale: false, updatedAt: isoNow(), planningProgress: { ...draft.planningProgress, viabilityRevision: draft.planningProgress?.buildRevision || 0 } };
        updated = guidedMesocycleApi.unlockStep(updated, "check", "build");
        if (!result.blockingCount) {
          updated = guidedMesocycleApi.unlockStep(updated, "create", "check");
          updated.planningProgress = { ...updated.planningProgress, createReadyRevision: updated.planningProgress.buildRevision };
        }
        guidedMesocycleView = "viability";
        updateGuidedDraft(updated);
      }

      function guidedTemplatesForMesocycle(mesocycle) {
        return (mesocycle.guidedDays || []).filter((day) => day.assignments.length).map((day) => ({
          id: `guided-template-${mesocycle.id}-${day.id}`, planSessionId: day.id, name: `${mesocycle.name} · ${day.name}`, baseSessionIntent: "Mesocycle training day", notes: `Linked to guided mesocycle ${mesocycle.id}, revision ${mesocycle.revision}. Readiness may adjust today's prescription without changing the planned structure.`, createdAt: isoNow(), updatedAt: isoNow(), mesocycleId: mesocycle.id, mesocycleRevision: mesocycle.revision, linkedToMesocycle: true,
          exercises: day.assignments.map((assignment) => ({ id: id(), name: assignment.name, primaryMuscle: appMuscleFromPrescriptionGroup(assignment.muscleGroupId), secondaryMuscle: "", resistanceType: inferResistanceType(assignment.name, {}), isBodyweight: isBodyweightExerciseName(assignment.name), sets: assignment.workingSets, reps: Number(assignment.repRange?.target || assignment.repRange?.min || 10), repMin: Number(assignment.repRange?.min || 8), repMax: Number(assignment.repRange?.max || 12), targetRpe: Number(assignment.targetRpe?.max || 8), increment: progressionProfileForExercise(assignment.name).increment, restSeconds: Number(assignment.restSeconds || 120), role: assignment.role, setStructure: assignment.setStructure, setTypes: [], warmups: [], recommendationSnapshot: assignment.recommendationSnapshot || null, mesocycleAssignmentId: assignment.id }))
        }));
      }

      function createGuidedTemplates() {
        const draft = guidedDraft();
        if (guidedCreationPending) return;
        const finalResult = draft ? guidedMesocycleApi.viability(draft, { ledger: guidedLedger(draft), targetFor: (muscle) => guidedTargetFor(muscle, draft) }) : null;
        if (!draft?.viabilityResult || draft.viabilityStale || finalResult?.blockingCount) {
          const first = finalResult?.findings?.find((item) => !item.accepted && item.severity === 'blocking');
          guidedGenerationReviewOpen = false;
          guidedMesocycleView = 'builder';
          if (first?.dayId) guidedSelectedDayId = first.dayId;
          showAppToast(first ? `${first.title}. ${first.actions?.[0] || 'Correct this issue before creating templates.'}` : "Run Check Viability and resolve blocking issues first.");
          render();
          return;
        }
        guidedCreationPending = true;
        const templates = guidedTemplatesForMesocycle(draft);
        const existingIds = new Set(data.templates.filter((template) => template.mesocycleId === draft.id).map((template) => template.id));
        const createdCount = templates.filter((template) => !existingIds.has(template.id)).length;
        const updatedCount = templates.length - createdCount;
        const completedAt = isoNow();
        const creationResult = { operationId: `create-${draft.id}-${draft.revision}`, completedAt, createdCount, updatedCount, templateCount: templates.length, templateIds: templates.map((item) => item.id), acceptedWarningIds: draft.acceptedExceptions || [] };
        const updated = { ...draft, status: "planned", plannedAt: completedAt, linkedTemplateIds: templates.map((item) => item.id), viabilityResult: { ...finalResult }, creationResult, updatedAt: completedAt, planningProgress: { ...draft.planningProgress, highestUnlockedStep: 'create', completedSteps: Array.from(new Set([...(draft.planningProgress?.completedSteps || []), 'check', 'create'])) } };
        guidedMesocycleView = "completion";
        guidedGenerationReviewOpen = false;
        commit({ ...data, templates: [...templates, ...data.templates.filter((template) => template.mesocycleId !== draft.id)], mesocycles: data.mesocycles.map((item) => item.id === draft.id ? updated : item) });
        guidedCreationPending = false;
        showAppToast(`${templates.length} linked mesocycle templates ${updatedCount ? 'created or updated' : 'created'}.`);
      }

      function renderGuidedTemplateReview(draft, template) {
        const day = draft.guidedDays.find((item) => item.id === template.planSessionId);
        const dayTotal = guidedLedger(draft).dayTotals.find((item) => item.dayId === template.planSessionId) || { workingSets: 0, muscles: [] };
        const estimatedMinutes = Math.round((template.exercises.reduce((sum, item) => sum + Number(item.sets || 0) * (Number(item.restSeconds || 90) + 45), 0) + template.exercises.length * 90) / 60);
        return '<details class="guided-day guided-review-day"><summary><span><strong>' + escapeHtml(template.name) + '</strong><small>' + dayTotal.workingSets + ' working sets · ~' + estimatedMinutes + ' min</small></span><span>Review Day</span></summary><div class="guided-day-body"><ol class="guided-review-exercises">' + template.exercises.map((exercise, index) => { const assignment = day?.assignments[index] || {}; const relationships = guidedRelationships(assignment).filter((item) => item.setContribution > 0); return '<li><div><strong>' + escapeHtml(exercise.name) + '</strong><small>' + escapeHtml(presentationLabel(exercise.role)) + ' · ' + exercise.sets + ' sets · ' + exercise.repMin + '–' + exercise.repMax + ' reps · RPE ' + exercise.targetRpe + ' · ' + exercise.restSeconds + 's rest</small></div><small>' + escapeHtml(relationships.map((item) => presentationLabel(item.muscleGroupId) + ' +' + Number((exercise.sets * item.setContribution).toFixed(2))).join(' · ') || 'Muscle contribution unavailable') + '</small></li>'; }).join('') + '</ol><div class="guided-day-volume">' + dayTotal.muscles.filter((item) => item.direct + item.fractional > 0).map((item) => '<span>' + escapeHtml(presentationLabel(item.muscleGroupId)) + ': ' + Number((item.direct + item.fractional).toFixed(2)) + ' effective (' + item.direct + ' direct + ' + item.fractional + ' fractional)</span>').join('') + '</div><button type="button" data-action="edit-guided-day-from-review" data-day-id="' + escapeHtml(template.planSessionId) + '">Edit ' + escapeHtml(day?.name || 'Day') + '</button></div></details>';
      }

      function renderGuidedCompletion(draft, headerHtml) {
        const result = draft.creationResult || {};
        const action = result.createdCount && result.updatedCount ? 'created and updated' : result.updatedCount ? 'updated' : 'created';
        return '<section class="guided-builder guided-completion" role="status" aria-live="polite">' + headerHtml + '<div class="completion-mark" aria-hidden="true">✓</div><div class="section-heading"><div><div class="section-kicker">Mesocycle Completed</div><h2>Your workout templates were ' + action + ' successfully.</h2><p>' + Number(result.templateCount || 0) + ' workout template' + (Number(result.templateCount || 0) === 1 ? '' : 's') + ' for ' + draft.durationWeeks + ' weeks · ' + draft.trainingDays + ' training days per week.</p></div></div><div class="candidate-detail-grid"><div><span>Mesocycle</span><strong>' + escapeHtml(draft.name) + '</strong></div><div><span>Created</span><strong>' + Number(result.createdCount || 0) + '</strong></div><div><span>Updated</span><strong>' + Number(result.updatedCount || 0) + '</strong></div><div><span>Accepted Warnings</span><strong>' + Number(result.acceptedWarningIds?.length || 0) + '</strong></div></div><div class="row wrap"><button class="primary-action" type="button" data-action="view-created-templates">View Templates</button><button type="button" data-action="view-completed-mesocycle">View Mesocycle</button><button type="button" data-action="start-first-mesocycle-template">Start First Workout</button></div></section>';
      }

      function renderGuidedViabilityFindings(result) {
        const active = result.findings.filter((item) => !item.accepted);
        const groups = [
          ['Blocking Issues', active.filter((item) => item.severity === 'blocking')],
          ['Warnings', active.filter((item) => ['warning', 'strong_warning'].includes(item.severity))],
          ['Information', active.filter((item) => ['information', 'advisory'].includes(item.severity))]
        ];
        return groups.filter(([, findings]) => findings.length).map(([label, findings]) => '<section class="viability-group"><h3>' + label + ' · ' + findings.length + '</h3><div class="guideline-grid">' + findings.map((finding) => '<article class="finding ' + (finding.severity === 'blocking' ? 'blocking' : '') + '"><strong>' + escapeHtml(presentationLabel(finding.title)) + '</strong><p>' + escapeHtml(finding.why) + '</p><span>Recommended: ' + escapeHtml((finding.actions || []).join(' · ')) + '</span><div class="row wrap">' + (finding.dayId ? '<button type="button" data-action="edit-guided-finding" data-day-id="' + escapeHtml(finding.dayId) + '">Edit Affected Day</button>' : '') + (finding.severity !== 'blocking' ? '<button type="button" data-action="accept-guided-finding" data-finding-id="' + finding.id + '">Accept Exception</button>' : '') + '</div></article>').join('') + '</div></section>').join('') || '<div class="empty-state">No unresolved viability issues.</div>';
      }

      function appMuscleFromPrescriptionGroup(group) {
        const key = normalizePrescriptionIdentity(group);
        if (/chest/.test(key)) return "Chest";
        if (/lat|back|trap|spinal erector/.test(key)) return "Back";
        if (/quad/.test(key)) return "Quads";
        if (/hamstring/.test(key)) return "Hamstrings";
        if (/glute|abductor/.test(key)) return "Glutes";
        if (/adductor/.test(key)) return "Adductors";
        if (/delt|shoulder/.test(key)) return "Shoulders";
        if (/bicep/.test(key)) return "Biceps";
        if (/tricep/.test(key)) return "Triceps";
        if (/forearm/.test(key)) return "Forearms";
        if (/calf|soleus|gastroc/.test(key)) return "Calves";
        if (/abdominal|oblique|core/.test(key)) return "Core";
        if (/neck/.test(key)) return "Neck";
        return "";
      }

      function templatesForMesocycle(mesocycle) {
        if (mesocycle?.builderMode === "guided") return guidedTemplatesForMesocycle(mesocycle);
        const plannedSessions = mesocycle.sessions || [];
        if (!plannedSessions.length) return [];
        const days = plannedSessions.map((planned) => ({ id: id(), planSessionId: planned.id, name: `${mesocycle.name} · ${planned.name}`, baseSessionIntent: planned.baseSessionIntent, notes: `Generated from full-program mesocycle ${mesocycle.id}. Base Session Intent: ${planned.baseSessionIntent}. Today's readiness may modify load, sets, RPE, rest, or exercise selection before the workout begins.`, exercises: [], createdAt: isoNow(), updatedAt: isoNow(), mesocycleId: mesocycle.id }));
        plannedSessions.forEach((planned, sessionIndex) => planned.exercises.forEach((candidate) => {
          const targetDay = days[sessionIndex];
          const snapshot = unifiedPrescriptionSnapshot({ name: candidate.exerciseName }, { exerciseId: candidate.exerciseId, muscleGroupId: candidate.muscleGroupId, mesocycle, fresh: true, createdAt: isoNow() });
          const prescription = snapshot?.basePrescription;
          const target = snapshot ? legacyTargetFromSnapshot(snapshot, { name: candidate.exerciseName }) : null;
          const context = target ? unifiedTargetContext(target, targetDay, { name: candidate.exerciseName }) : null;
          targetDay.exercises.push({
            id: id(),
            name: candidate.exerciseName,
            primaryMuscle: appMuscleFromPrescriptionGroup(candidate.muscleGroupId),
            secondaryMuscle: "",
            resistanceType: inferResistanceType(candidate.exerciseName, {}),
            isBodyweight: isBodyweightExerciseName(candidate.exerciseName),
            sets: Number(candidate.plannedSets || prescription?.workingSets?.target || candidate.recommendedSetRange?.target || 3),
            reps: Number(prescription?.repRange?.target || candidate.recommendedRepRange?.target || 10),
            repMin: Number(prescription?.repRange?.min || candidate.recommendedRepRange?.min || 8),
            repMax: Number(prescription?.repRange?.max || candidate.recommendedRepRange?.max || 12),
            targetRpe: prescription?.targetRpe ? Number(((prescription.targetRpe.min + prescription.targetRpe.max) / 2).toFixed(1)) : 8,
            increment: progressionProfileForExercise(candidate.exerciseName).increment,
            restSeconds: Number(prescription?.restSeconds?.target || 120),
            role: candidate.intendedRole,
            setStructure: prescription?.setStructure || candidate.recommendedSetStructure,
            setTypes: context?.setTypes || [],
            warmups: [],
            recommendationSnapshot: snapshot
          });
        }));
        return days.filter((day) => day.exercises.length);
      }

      function transitionMesocyclePlan(mesocycleId, action) {
        const selected = data.mesocycles.find((mesocycle) => mesocycle.id === mesocycleId);
        if (!selected || !prescriptionEngine) return;
        if (action === "start" && data.activeMesocycleId && data.activeMesocycleId !== mesocycleId) {
          showAppToast("Complete the active mesocycle before starting another.");
          return;
        }
        try {
          if (action === "start" && Number(selected.programReview?.seriousWarningCount || 0) > 0) return showAppToast("Resolve the serious full-program warnings before activation.");
          const transitioned = prescriptionEngine.transitionMesocycle(selected, action, action === "complete" ? { outcome: { completedFromApp: true } } : action === "review" ? { review: { recommendationHistoryCount: data.recommendationHistory.filter((snapshot) => snapshot.mesocycleId === mesocycleId).length } } : {});
          const activeMesocycleId = transitioned.status === "active" ? transitioned.id : data.activeMesocycleId === transitioned.id && transitioned.status !== "active" ? "" : data.activeMesocycleId;
          const generatedTemplates = action === "start" ? templatesForMesocycle(transitioned) : [];
          const templates = generatedTemplates.length ? [...generatedTemplates, ...data.templates.filter((template) => template.mesocycleId !== transitioned.id)] : data.templates;
          commit({ ...data, activeMesocycleId, templates, mesocycles: data.mesocycles.map((mesocycle) => mesocycle.id === transitioned.id ? transitioned : mesocycle) });
        } catch (error) {
          showAppToast(error?.message || "Mesocycle status could not be changed.");
        }
      }

      function deleteMesocycleDraft(mesocycleId) {
        const mesocycle = data.mesocycles.find((item) => item.id === mesocycleId);
        if (!mesocycle || !prescriptionEngine?.canDeleteMesocycle(mesocycle)) return showAppToast("Completed or previously activated mesocycles are protected. Archive them instead.");
        commit({ ...data, mesocycles: data.mesocycles.filter((item) => item.id !== mesocycleId) });
        pendingDeleteMesocycleId = "";
      }

      function renderGuidedMusclePrioritySummary(draft, compact = false) {
        const statuses = guidedMuscleStatuses(draft);
        const unresolved = statuses.filter((item) => item.overallStatus !== 'within');
        const completed = statuses.filter((item) => item.overallStatus === 'within');
        const visible = compact ? unresolved.slice(0, 6) : unresolved;
        const labelFor = (item, index) => item.overallStatus === 'above' ? 'Above Target' : item.overallStatus === 'needs_frequency' ? 'Needs Frequency' : item.overallStatus === 'needs_distribution' ? 'Needs Distribution' : (index === 0 ? 'Recommended · ' : '') + 'Below Target';
        const classFor = (item) => item.overallStatus === 'above' ? 'deload' : item.overallStatus === 'within' ? 'good' : 'rest';
        const rows = visible.length ? visible.map((item, index) => '<button type="button" data-action="choose-guided-muscle" data-muscle-group-id="' + escapeHtml(item.muscleGroupId) + '" class="guided-priority-row ' + item.overallStatus + '"><span><strong>' + escapeHtml(presentationLabel(item.muscleGroupId)) + '</strong><small>' + item.totalEffectiveSets + ' total effective sets · ' + item.directSets + ' direct + ' + item.fractionalSets + ' fractional · target ' + item.targetRange.min + '–' + item.targetRange.max + '</small></span><span><b>' + item.setsRemaining + '</b><small>effective sets to minimum</small></span><span class="status-pill ' + classFor(item) + '">' + labelFor(item, index) + '</span><small>Frequency ' + (item.frequencyTarget - item.frequencyRemaining) + ' of ' + item.frequencyTarget + '</small></button>').join('') : '<div class="empty-state">No unresolved muscle-group requirements.</div>';
        const completedPanel = completed.length ? '<details class="guided-completed-summary"><summary>Completed · ' + completed.length + ' muscle group' + (completed.length === 1 ? '' : 's') + '</summary><div class="guided-priority-list">' + completed.map((item) => '<button type="button" data-action="choose-guided-muscle" data-muscle-group-id="' + escapeHtml(item.muscleGroupId) + '" class="guided-priority-row within"><span><strong>' + escapeHtml(presentationLabel(item.muscleGroupId)) + '</strong><small>' + item.totalEffectiveSets + ' total effective sets · target ' + item.targetRange.min + '–' + item.targetRange.max + '</small></span><span class="status-pill good">Within Target</span><small>Frequency ' + item.frequencyTarget + ' of ' + item.frequencyTarget + '</small></button>').join('') + '</div></details>' : '';
        return '<section class="guided-priority-summary"><div class="row split"><div><div class="section-kicker">Volume Remaining</div><strong>Needs Attention</strong></div>' + (compact ? '<button type="button" data-action="open-guided-weekly">View All</button>' : '') + '</div><div class="guided-priority-list">' + rows + '</div>' + completedPanel + '</section>';
      }

      function renderGuidedExerciseWorkspace(draft, headerHtml) {
        const muscles = draft.includedMuscleGroupIds || [];
        const statuses = guidedMuscleStatuses(draft);
        guidedExerciseMuscleFilter = muscles.includes(guidedExerciseMuscleFilter) ? guidedExerciseMuscleFilter : statuses[0]?.muscleGroupId || muscles[0];
        const day = draft.guidedDays.find((item) => item.id === guidedExerciseBrowserDayId);
        const query = normalizePrescriptionIdentity(guidedExerciseSearch);
        const pool = guidedCandidatePool(guidedExerciseMuscleFilter).filter((item) => !query || normalizePrescriptionIdentity(item.exerciseName).includes(query));
        const targetStatus = statuses.find((item) => item.muscleGroupId === guidedExerciseMuscleFilter);
        const pending = guidedPendingAssignment;
        const dayLedger = guidedLedger(draft).dayTotals.find((item) => item.dayId === guidedExerciseBrowserDayId) || { workingSets: 0, muscles: [] };
        const sameMuscleExercises = day?.assignments.filter((item) => (item.primaryMuscles || [item.muscleGroupId]).map(prescriptionApi.muscleFamily).includes(prescriptionApi.muscleFamily(guidedExerciseMuscleFilter))).length || 0;
        const pendingWarnings = pending ? [
          dayLedger.workingSets + pending.workingSets > guidedMesocycleApi.PLANNING_RULES.maxWorkingSetsPerDay ? 'This addition would put the day above 18 working sets.' : '',
          sameMuscleExercises >= guidedMesocycleApi.PLANNING_RULES.maxExercisesPerMusclePerDay ? 'This day already has two exercises directly targeting this muscle.' : '',
          targetStatus && targetStatus.totalEffectiveSets + pending.workingSets > targetStatus.targetRange.max ? 'This addition would move the muscle above its total effective-set target range.' : '',
          targetStatus?.frequencyRemaining > targetStatus?.remainingTrainingDays ? 'Too few unprogrammed days remain to reach the default frequency without revising the schedule.' : ''
        ].filter(Boolean) : [];
        const pendingCard = pending ? '<section class="guided-active-config" data-guided-configuration tabindex="-1" aria-labelledby="guided-config-title"><div class="section-kicker">Configuring Now</div><h2 id="guided-config-title">' + escapeHtml(pending.name) + '</h2><div class="metadata-tags"><span class="metadata-tag">Target: ' + escapeHtml(presentationLabel(pending.muscleGroupId)) + '</span><span class="metadata-tag">' + Math.round(pending.targetMuscleEffectiveness || 0) + '/100 ' + escapeHtml(presentationLabel(pending.muscleGroupId)) + ' Effectiveness</span><span class="metadata-tag">' + escapeHtml(presentationLabel(pending.setStructure)) + '</span></div><div class="set-stepper"><button type="button" data-action="guided-pending-set-change" data-delta="-1" aria-label="Remove one planned working set">−</button><output>' + pending.workingSets + ' planned sets</output><button type="button" data-action="guided-pending-set-change" data-delta="1" aria-label="Add one planned working set">+</button></div><div class="candidate-detail-grid"><div><span>Rep Range</span><strong>' + pending.repRange.min + '–' + pending.repRange.max + '</strong></div><div><span>Effort</span><strong>' + (pending.targetRir ? 'RIR ' + pending.targetRir.min + '–' + pending.targetRir.max : 'RPE ' + pending.targetRpe.min + '–' + pending.targetRpe.max) + '</strong></div><div><span>Rest</span><strong>' + pending.restSeconds + ' sec</strong></div></div>' + pendingWarnings.map((warning) => '<div class="finding"><strong>Programming warning</strong><p>' + escapeHtml(warning) + '</p></div>').join('') + '<div class="row wrap"><button type="button" data-action="cancel-guided-pending">Cancel</button><button class="primary-action" type="button" data-action="confirm-guided-exercise">Add to ' + escapeHtml(day?.name || 'Training Day') + '</button></div></section>' : '';
        return '<section class="guided-builder">' + headerHtml + '<div data-guided-exercise-picker tabindex="-1">' + renderGuidedMusclePrioritySummary(draft, true) + '<div class="section-heading"><div><div class="section-kicker">Exercise Selection</div><h2>Add Exercise to ' + escapeHtml(day?.name || 'Training Day') + '</h2><p>Choose a muscle, then review the target-specific prescription before adding it.</p></div></div><label>Search<input type="search" data-action="guided-exercise-search" value="' + escapeHtml(guidedExerciseSearch) + '"></label><label>Target Muscle<select data-action="guided-exercise-muscle">' + statuses.map((item) => '<option value="' + item.muscleGroupId + '" ' + (item.muscleGroupId === guidedExerciseMuscleFilter ? 'selected' : '') + '>' + escapeHtml(presentationLabel(item.muscleGroupId)) + ' · ' + item.setsRemaining + ' sets remaining</option>').join('') + '</select></label></div>' + pendingCard + '<div class="exercise-browser-results">' + pool.map((candidate) => {
          const validation = guidedMesocycleApi.canAssignExercise(draft, guidedExerciseBrowserDayId, candidate);
          const score = Math.round(candidate.scores?.targetMuscleEffectiveness ?? candidate.scores?.muscleSpecificity ?? 0);
          return '<article class="exercise-browser-card"><div class="section-kicker">' + escapeHtml(presentationLabel(candidate.intendedRole)) + '</div><h3>' + escapeHtml(candidate.exerciseName) + '</h3><strong>' + escapeHtml(presentationLabel(guidedExerciseMuscleFilter)) + ' Effectiveness: ' + score + ' / 100</strong><span>Confidence: ' + escapeHtml(presentationLabel(candidate.personalDataConfidence || candidate.scores?.confidence || 'research_default')) + '</span><span>' + (candidate.recommendedSetRange?.target || 3) + ' sets · ' + (candidate.recommendedRepRange?.min || 8) + '–' + (candidate.recommendedRepRange?.max || 12) + ' reps</span><details><summary>Why for ' + escapeHtml(presentationLabel(guidedExerciseMuscleFilter)) + '?</summary><p>' + escapeHtml(candidate.reasonForMesocycle || 'Canonical target relationship, objective fit, evidence, fatigue, and available equipment inform this estimate.') + '</p></details><button type="button" class="primary-action" data-action="select-guided-exercise" data-day-id="' + guidedExerciseBrowserDayId + '" data-exercise-id="' + escapeHtml(candidate.exerciseId) + '" data-muscle-group-id="' + guidedExerciseMuscleFilter + '" ' + (!validation.allowed ? 'disabled' : '') + '>' + (validation.allowed ? 'Configure Exercise' : 'Already Added to ' + escapeHtml(day?.name || 'This Day')) + '</button></article>';
        }).join('') + '</div><div class="sr-only" aria-live="polite">' + (pending ? 'Configuring ' + escapeHtml(pending.name) : guidedReturnFocusToPicker ? 'Exercise added. Choose the next muscle or exercise.' : '') + '</div></section>';
      }

      function renderGuidedMesocycle() {
        const draft = guidedDraft();
        const progress = (activeIndex) => {
          const progressState = draft?.planningProgress;
          const transientUnlocked = draft ? guidedStepIndex(progressState?.highestUnlockedStep || (draft.guidedDays?.length ? 'build' : 'guide')) : Math.max(activeIndex, activeIndex === 1 ? 1 : 0);
          return '<nav class="guided-progress" aria-label="Mesocycle builder steps">' + guidedMesocycleApi.STEPS.map((step, index) => {
            const label = step.charAt(0).toUpperCase() + step.slice(1);
            const unlocked = index <= transientUnlocked;
            const completed = (progressState?.completedSteps || []).includes(step) || (!draft && index < activeIndex);
            return '<button type="button" class="' + (index === activeIndex ? 'current' : completed ? 'completed' : unlocked ? 'unlocked' : 'locked') + '" data-action="guided-step" data-step="' + step + '" ' + (!unlocked ? 'disabled' : '') + ' aria-current="' + (index === activeIndex ? 'step' : 'false') + '">' + (completed ? '<span aria-hidden="true">✓</span> ' : '') + label + '</button>';
          }).join('') + '</nav>';
        };
        const header = (step, backAction) => '<div class="guided-builder-header"><div class="row split"><button type="button" data-action="' + backAction + '">Back</button><button type="button" data-action="open-guided-guidelines">Programming Guide</button></div>' + progress(step) + '</div>';
        if (guidedMesocycleView === 'guidelines') return '<section class="guided-builder">' + header(0, 'close-guided-mesocycle') + '<div class="section-heading"><div><div class="section-kicker">Before You Build</div><h2>Plan with clear guardrails</h2><p>These practical defaults power the live feedback while you remain in control.</p></div></div><div class="guideline-grid">' + guidedMesocycleApi.PLANNING_RULES.guidelines.map((rule) => '<details class="guideline-card"><summary><strong>' + escapeHtml(rule.title) + '</strong><span>' + escapeHtml(rule.summary) + '</span></summary><p>' + escapeHtml(rule.detail) + '</p></details>').join('') + '</div><button class="primary-action" type="button" data-action="open-guided-setup">Start Planning</button></section>';
        if (guidedMesocycleView === 'setup') {
          const muscles = guidedAvailableMuscles();
          if (!mesocycleScopeDraft) mesocycleScopeDraft = new Set(muscles);
          return '<section class="guided-builder">' + header(1, 'guided-back-guidelines') + '<div class="section-heading"><div><div class="section-kicker">Setup</div><h2>Objective, Schedule, and Constraints</h2><p>These choices create empty training days and evidence-adjusted targets—not an automatic program.</p></div></div><div class="guided-setup-grid"><label>Objective<select data-action="mesocycle-type"><option value="primary_progression">Primary Progression</option><option value="alternative_exercise">Alternative Exercises</option><option value="lower_fatigue_resensitization">Lower Fatigue</option><option value="specialization">Specialization</option></select></label><label>Duration (weeks)<input type="number" min="2" max="12" value="' + escapeHtml(mesocycleDurationDraft || 6) + '" data-action="mesocycle-duration"></label><label>Training Days per Week<input type="number" min="1" max="7" value="' + Number(data.settings.trainingDaysPerWeek || 4) + '" data-action="mesocycle-training-days"></label></div><section class="equipment-picker" role="group" aria-label="Available Equipment"><strong>Available Equipment</strong><div class="equipment-chips">' + mesocycleEquipmentTaxonomy.map(([value,label]) => '<button class="equipment-chip choice-chip" type="button" data-action="toggle-mesocycle-equipment" data-value="' + value + '" aria-pressed="' + mesocycleEquipmentSelection().includes(value) + '">' + label + '</button>').join('') + '</div></section><section class="muscle-scope-panel" role="group" aria-label="Muscle Group Scope"><strong>Muscle Groups and Scope</strong><div class="muscle-scope-options">' + muscles.map((muscle) => '<label class="muscle-scope-option choice-tile"><input type="checkbox" data-action="mesocycle-muscle-scope" value="' + muscle + '" ' + (mesocycleScopeDraft.has(muscle) ? 'checked' : '') + '><span>' + escapeHtml(presentationLabel(muscle)) + '</span></label>').join('') + '</div></section><button class="primary-action" type="button" data-action="create-guided-draft">Create Empty Training Days</button></section>';
        }
        if (!draft) return '';
        if (guidedExerciseBrowserDayId) return renderGuidedExerciseWorkspace(draft, header(2, 'close-guided-exercise-browser'));
        const ledger = guidedLedger(draft);
        if (guidedMesocycleView === 'completion' && draft.creationResult) return renderGuidedCompletion(draft, header(4, 'close-guided-mesocycle'));
        if (guidedWeeklySummaryOpen) return '<section class="guided-builder">' + header(2, 'close-guided-weekly') + '<div class="section-heading"><div><div class="section-kicker">Weekly Review</div><h2>Weekly Muscle Volume</h2><p>Direct sets remain separate from fractional contribution; targets represent one normal training week.</p></div></div>' + renderGuidedMusclePrioritySummary(draft, false) + '<button class="primary-action" type="button" data-action="check-guided-viability">Check Viability</button></section>';
        if (guidedGenerationReviewOpen) { const templates = guidedTemplatesForMesocycle(draft); return '<section class="guided-builder">' + header(4, 'close-guided-generation-review') + '<div class="section-heading"><div><div class="section-kicker">Review Template Creation</div><h2>Review Every Training Day</h2><p>' + templates.length + ' linked templates will preserve exercise order, sets, research targets, and overrides. Expand each day before creating them.</p></div></div>' + templates.map((template) => renderGuidedTemplateReview(draft, template)).join('') + '<button class="primary-action" type="button" data-action="create-guided-templates" ' + (guidedCreationPending ? 'disabled' : '') + '>' + (guidedCreationPending ? 'Creating Templates…' : 'Create Mesocycle Templates') + '</button></section>'; }
        if (guidedMesocycleView === 'viability' && draft.viabilityResult) { const result = draft.viabilityResult; return '<section class="guided-builder">' + header(3, 'return-guided-builder') + '<div class="row split"><div><div class="section-kicker">Viability Check</div><h2>' + escapeHtml(result.grade) + '</h2><p>' + result.blockingCount + ' blocking · ' + result.warningCount + ' warnings · ' + Number(result.informationCount || 0) + ' information</p></div><div class="viability-score"><strong>' + result.score + '</strong><span>/ 100</span></div></div>' + renderGuidedViabilityFindings(result) + '<button class="primary-action" type="button" data-action="open-guided-generation-review" ' + (result.blockingCount ? 'disabled' : '') + '>Review Template Creation</button></section>'; }
        if (!guidedSelectedDayId) guidedSelectedDayId = draft.guidedDays[0]?.id || '';
        return '<section class="guided-builder">' + header(2, 'close-guided-mesocycle') + '<div><div class="section-kicker">Guided Mesocycle Builder</div><h2>' + escapeHtml(draft.name) + '</h2><p>' + draft.durationWeeks + ' weeks · ' + draft.trainingDays + ' training days</p></div>' + renderGuidedMusclePrioritySummary(draft, true) + '<div class="guided-day-list">' + draft.guidedDays.map((day) => { const total = ledger.dayTotals.find((item) => item.dayId === day.id) || {workingSets:0,exerciseCount:0}; const open = guidedSelectedDayId === day.id; return '<article class="guided-day"><div class="guided-day-header"><button type="button" data-action="toggle-guided-day" data-day-id="' + day.id + '"><strong>' + escapeHtml(day.name) + '</strong><span>' + total.workingSets + ' working sets · ' + total.exerciseCount + ' exercises</span></button></div>' + (open ? '<div class="guided-day-body">' + day.assignments.map((assignment) => '<article class="guided-exercise"><strong>' + escapeHtml(assignment.name) + '</strong><span>' + escapeHtml(presentationLabel(assignment.role)) + ' · ' + assignment.repRange.min + '–' + assignment.repRange.max + ' reps</span><div class="set-stepper"><button type="button" data-action="guided-set-change" data-day-id="' + day.id + '" data-assignment-id="' + assignment.id + '" data-delta="-1">−</button><output>' + assignment.workingSets + ' sets</output><button type="button" data-action="guided-set-change" data-day-id="' + day.id + '" data-assignment-id="' + assignment.id + '" data-delta="1">+</button></div><label>Move to day<select data-action="move-guided-exercise" data-day-id="' + day.id + '" data-assignment-id="' + assignment.id + '">' + draft.guidedDays.map((option) => '<option value="' + option.id + '" ' + (option.id === day.id ? 'selected' : '') + '>' + escapeHtml(option.name) + '</option>').join('') + '</select></label><button type="button" data-action="remove-guided-exercise" data-day-id="' + day.id + '" data-assignment-id="' + assignment.id + '">Remove</button></article>').join('') + '<button class="primary-action" type="button" data-action="open-guided-exercise-browser" data-day-id="' + day.id + '">Add Exercise</button></div>' : '') + '</article>'; }).join('') + '</div><button class="guided-summary-button primary-action" type="button" data-action="open-guided-weekly">Weekly Volume & Frequency</button><button type="button" data-action="check-guided-viability">Check Viability</button></section>';
      }

      function renderMesocyclePlanner() {
        if (guidedMesocycleView !== "closed") return renderGuidedMesocycle();
        return `<section class="mesocycle-planner screen-section"><article class="guided-entry"><div><div class="section-kicker">Mesocycle Planning</div><h2>Plan Your Mesocycle</h2><p>Build a structured training block with research-informed volume, frequency, exercise-selection, and recovery guardrails.</p></div><button class="primary-action" type="button" data-action="begin-guided-mesocycle">${guidedDraft() ? "Continue Planning" : "Plan Your Mesocycle"}</button></article></section>`;
      }


      function renderHistoricalMesocycles() {
        const current = data.mesocycles.find((mesocycle) => ["draft", "planned", "active"].includes(mesocycle.status));
        const historical = data.mesocycles.filter((mesocycle) => mesocycle.id !== current?.id);
        const historyActions = (mesocycle) => {
          const actions = [];
          if (["completed", "abandoned"].includes(mesocycle.status)) actions.push('<button type="button" data-action="mesocycle-transition" data-mesocycle-action="archive" data-mesocycle-id="' + mesocycle.id + '">Archive</button>');
          if (["completed", "archived"].includes(mesocycle.status)) actions.push('<button type="button" data-action="mesocycle-transition" data-mesocycle-action="review" data-mesocycle-id="' + mesocycle.id + '">Review outcomes</button>');
          if (prescriptionEngine?.canDeleteMesocycle(mesocycle)) actions.push(pendingDeleteMesocycleId === mesocycle.id ? '<span><button class="danger" type="button" data-action="confirm-delete-mesocycle" data-mesocycle-id="' + mesocycle.id + '">Confirm delete</button><button type="button" data-action="cancel-delete-mesocycle">Cancel</button></span>' : '<button class="danger" type="button" data-action="request-delete-mesocycle" data-mesocycle-id="' + mesocycle.id + '">Delete unused draft</button>');
          return actions.length ? '<div class="row wrap">' + actions.join('') + '</div>' : '';
        };
        return `<section class="screen-section mesocycle-history"><div class="section-heading"><div><div class="section-kicker">Template Management</div><h2>Historical Mesocycles</h2><p>Review completed, archived, abandoned, and earlier blocks.</p></div></div>${historical.length ? historical.map((mesocycle) => '<article class="mesocycle-card mesocycle-history-summary"><div class="row split"><div><strong>' + escapeHtml(mesocycle.name) + '</strong><small>' + escapeHtml(mesocycleTypeLabel(mesocycle.type)) + '</small></div><span class="status-pill neutral">' + escapeHtml(presentationLabel(mesocycle.status)) + '</span></div><div class="mesocycle-history-meta"><span>Created ' + formatDate(mesocycle.createdAt) + '</span><span>' + (mesocycle.startedAt ? 'Started ' + formatDate(mesocycle.startedAt) : 'Never activated') + '</span><span>' + (mesocycle.completedAt ? 'Completed ' + formatDate(mesocycle.completedAt) : mesocycle.abandonedAt ? 'Abandoned ' + formatDate(mesocycle.abandonedAt) : 'Not completed') + '</span><span>' + (mesocycle.selectedPortfolio?.length || 0) + ' exercises</span></div>' + historyActions(mesocycle) + '</article>').join('') : '<div class="empty-state">Completed and previous mesocycles will appear here.</div>'}</section>`;
      }
