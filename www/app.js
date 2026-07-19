
      function isNumericEditAction(action) {
        return ["set-reps", "set-weight", "set-rpe", "set-duration", "set-distance", "template-exercise-sets", "template-exercise-reps", "template-exercise-rpe", "template-exercise-increment", "template-exercise-rest", "exercise-rest-seconds", "recovery-sleep-hours", "recovery-hrv", "recovery-resting-hr", "template-readiness-sleep-hours", "template-readiness-hrv", "template-readiness-resting-hr", "baseline-sleep-hours", "baseline-sleep-quality", "baseline-hrv", "baseline-resting-hr", "baseline-soreness", "baseline-band"].includes(action);
      }

      let lastInteractionFeedbackAt = 0;

      function feedbackLevelForAction(action, target) {
        if (!action) return "none";
        if (["confirm-submit-workout", "confirm-save-history-edits"].includes(action)) return "success";
        if (["confirm-delete-template", "confirm-clear-data", "confirm-cancel-workout", "confirm-cancel-history-edits", "delete-exercise", "delete-set", "delete-template-exercise"].includes(action)) return "warning";
        if (action === "toggle-set") {
          const set = data.sets.find((item) => item.id === target?.dataset?.setId);
          if (!set || set.completed) return "light";
          const remainingInExercise = data.sets.filter((item) => item.exerciseId === set.exerciseId && !item.isWarmup && !item.completed && !item.skipped && item.id !== set.id).length;
          return remainingInExercise === 0 ? "success" : "medium";
        }
        if (["start-timer", "skip-timer", "start-template", "start-template-with-metrics", "use-usual-readiness", "request-submit-workout", "request-save-history-edits", "begin-history-edit", "save-template", "update-template-exercise", "add-set", "add-warmup-set", "duplicate-set"].includes(action)) return "medium";
        if (["request-delete-template", "request-cancel-workout", "request-cancel-workout-from-template", "request-cancel-history-edits", "clear-data", "toggle-skip-set"].includes(action)) return "warning";
        if (["set-tab", "adjust-timer", "select-chart-exercise", "show-chart-point", "toggle-prescription-rationale", "open-fatigue-flag", "open-plan-volume-warning", "exercise-deload", "exercise-resistance-type", "exercise-bodyweight", "set-warmup", "timer-sound", "timer-vibration", "workout-completion-sound", "interaction-vibration", "timer-notifications", "in-app-rest-alerts", "toggle-rest-notifications", "preview-rest-complete-sound", "rest-complete-auto-return"].includes(action)) return "light";
        return "none";
      }

      function isHistoryWorkoutMutation(action) {
        return [
          "add-exercise", "move-exercise", "delete-exercise", "add-set", "add-warmup-set", "duplicate-set", "delete-set", "toggle-set", "toggle-skip-set", "start-timer",
          "session-title", "session-date", "session-travel", "session-notes",
          "exercise-name", "exercise-notes", "exercise-primary-muscle", "exercise-secondary-muscle", "exercise-deload", "exercise-resistance-type", "exercise-bodyweight", "exercise-rest-seconds",
          "set-reps", "set-weight", "set-rpe", "set-duration", "set-distance", "set-warmup",
          "recovery-sleep-hours", "recovery-sleep-quality", "recovery-hrv", "recovery-resting-hr", "recovery-soreness", "recovery-nutrition", "recovery-protein", "recovery-illness", "recovery-pain", "recovery-affected-muscle", "recovery-outside-note"
        ].includes(action);
      }

      function historyMutationIsLocked(action) {
        return isSessionSubmitted(activeSession()) && !isEditingHistorySession() && isHistoryWorkoutMutation(action);
      }

      function performInteractionFeedback(level) {
        if (!level || level === "none" || data.settings.interactionVibration === false || typeof navigator.vibrate !== "function") return;
        const now = Date.now();
        if (now - lastInteractionFeedbackAt < 90) return;
        lastInteractionFeedbackAt = now;
        const pattern = ({ light: 10, medium: 22, success: [24, 28, 42], warning: [28, 32, 28], error: [45, 35, 70] })[level];
        if (pattern) {
          try { navigator.vibrate(pattern); } catch { /* Visual feedback remains the fallback. */ }
        }
      }

      root.addEventListener("pointerdown", (event) => {
        const target = event.target.closest("button, select, summary[data-action], label.toggle-line, .alert-setting-card, .volume-card");
        if (!target || target.hasAttribute("disabled")) return;
        const actionTarget = event.target.closest("[data-action]") || target.querySelector?.("[data-action]");
        const level = feedbackLevelForAction(actionTarget?.dataset?.action || target.dataset.action, actionTarget || target);
        target.classList.add("is-pressing", "feedback-" + level);
        window.setTimeout(() => target.isConnected && target.classList.remove("is-pressing", "feedback-" + level), 180);
      });

      root.addEventListener("click", async (event) => {
        const target = event.target.closest("[data-action]");
        if (!target) return;
        const action = target.dataset.action;
        const executableWorkoutMutationActions = ["add-exercise", "add-set", "add-warmup-set", "duplicate-set", "toggle-set", "toggle-skip-set", "start-timer"];
        if (executableWorkoutMutationActions.includes(action) && !guardWorkoutMutation(action, { exerciseId: target.dataset.exerciseId, setId: target.dataset.setId }).allowed) {
          event.preventDefault();
          return;
        }
        if (historyMutationIsLocked(action)) {
          showAppToast("Choose Edit History before changing a logged workout.");
          render();
          return;
        }
        const interactionAccepted = action !== "confirm-submit-workout" || workoutSubmissionIsAccepted(activeSessionId);
        if (interactionAccepted) performInteractionFeedback(feedbackLevelForAction(action, target));
        if (action === "skip-content") {
          event.preventDefault();
          const mainContent = document.getElementById("main-content");
          if (mainContent) mainContent.focus({ preventScroll: false });
          return;
        }
        if (target.classList.contains("sheet-backdrop") && event.target !== target) return;
        if (target.tagName === "INPUT" && isNumericEditAction(action)) {
          target.dataset.replaceOnNextInput = "true";
          target.dataset.previousValue = target.value;
          target.select();
        }
        if (action === "set-tab") {
          if (target.dataset.tab === "lift" && viewingHistorySessionId && !historyEditFlow) {
            returnToLiftHome();
            return;
          }
          if (target.dataset.tab === "lift" && hasActiveWorkout()) activeSessionId = activeWorkoutId;
          if (historyEditFlow && target.dataset.tab !== "lift") {
            dialogFocusOrigins.history = focusDescriptorForElement(target) || { kind: "main" };
          }
          setActiveTab(target.dataset.tab);
        }
        if (action === "open-templates") setActiveTab("plan");
        if (action === "open-progress") setProgressView(target.dataset.progressView || "overview");
        if (action === "set-progress-view") setProgressView(target.dataset.progressView || "overview");
        if (action === "retry-view-render") { viewRenderError = null; render(); }
        if (action === "focus-workout-exercise") { workoutFocusExerciseId = target.dataset.exerciseId || ""; render(); }
        if (action === "open-history") setProgressView("history");
        if (action === "toggle-theme") commit({ ...data, settings: { ...data.settings, theme: data.settings.theme === "light" ? "dark" : "light" } });
        if (action === "toggle-unit") commit(convertAppWeightUnit(data, data.settings.weightUnit === "lb" ? "kg" : "lb"));
        if (action === "request-notifications") enablePushNotifications();
        if (action === "toggle-rest-notifications") {
          const alerts = restAlertState();
          if (alerts.lockScreenReady) {
            await disablePushNotifications();
          } else {
            commit({ ...data, settings: { ...data.settings, timerNotifications: true, restCompleteLockScreenNotifications: true } }, false);
            await enablePushNotifications();
          }
        }
        if (action === "test-notification") sendTestPushNotification();
        if (action === "test-timer-sound") { primeTimerAlerts(); playTimerCompletionSound(); notificationMessage = "Foreground completion sound confirmed. Silent Mode and browser restrictions still apply."; commit({ ...data, settings: { ...data.settings, timerSound: true, setupSoundConfirmed: true } }); }
        if (action === "preview-rest-complete-sound") {
          restAudioSignal?.prime();
          restAudioSignal?.preview({ settings: { ...data.settings, timerSound: true, restCompleteSoundEnabled: true } });
          notificationMessage = "Played the selected foreground rest-complete sound once.";
          render();
        }
        if (action === "dismiss-install-guide") commit({ ...data, settings: { ...data.settings, installGuideDismissed: true } });
        if (action === "apply-update") applyPwaUpdate();
        if (action === "select-chart-exercise") selectChartExercise(target.dataset.exerciseId);
        if (action === "clear-chart-exercise-search") {
          chartExerciseDraft = "";
          chartExerciseSearchError = "";
          chartExerciseSearchOpen = true;
          chartExerciseHighlight = 0;
          const input = root.querySelector('[data-action="review-exercise-input"]');
          if (input) { input.value = ""; input.focus(); }
          updateExerciseSuggestionList();
        }
        if (action === "show-chart-point") {
          const activationKey = String(target.dataset.chartPointKey || "");
          const activation = /^cp_\d+_\d+$/.test(activationKey) ? chartPointActivations.get(activationKey) : null;
          const stillCurrent = activation
            && activation.exerciseId === selectedExerciseId
            && Number(activation.windowOffset || 0) === Number(hypertrophyWindowOffset || 0);
          chartDetailPoint = stillCurrent ? {
            ...activation.point,
            chartKey: activation.chartKey,
            exerciseId: activation.exerciseId,
            windowOffset: activation.windowOffset,
            throughDate: activation.throughDate,
            qualifyingWeekIds: activation.qualifyingWeekIds,
            resistanceType: activation.resistanceType,
            date: activation.point.date || activation.point.label
          } : null;
          render();
        }
        if (action === "close-chart-point") { chartDetailPoint = null; render(); }
        if (action === "toggle-hypertrophy-score") { hypertrophyScoreExpanded = !hypertrophyScoreExpanded; render(); }
        if (action === "select-chart-period") {
          hypertrophyWindowOffset = Math.max(0, Number(target.dataset.periodOffset || 0));
          hypertrophyScoreExpanded = false;
          chartDetailPoint = null;
          hypertrophyScoreLoading = true;
          render();
          window.setTimeout(() => { hypertrophyScoreLoading = false; render(); }, 80);
        }
        if (action === "new-session") addSession();
        if (action === "new-template") addTemplate();
        if (action === "begin-guided-mesocycle") beginGuidedMesocycle();
        if (action === "guided-step") setGuidedStep(target.dataset.step);
        if (action === "close-guided-mesocycle") { guidedMesocycleView = "closed"; guidedExerciseBrowserDayId = ""; guidedWeeklySummaryOpen = false; render(); }
        if (action === "open-guided-guidelines" || action === "guided-back-guidelines") { guidedMesocycleView = "guidelines"; guidedExerciseBrowserDayId = ""; guidedWeeklySummaryOpen = false; render(); }
        if (action === "open-guided-setup") setGuidedStep("setup");
        if (action === "create-guided-draft") createGuidedMesocycleDraft();
        if (action === "toggle-guided-day") { guidedSelectedDayId = target.dataset.dayId; render(); }
        if (action === "open-guided-exercise-browser") { guidedExerciseBrowserDayId = target.dataset.dayId; guidedExerciseSearch = ""; guidedPendingAssignment = null; render(); }
        if (action === "close-guided-exercise-browser") { guidedExerciseBrowserDayId = ""; guidedPendingAssignment = null; render(); }
        if (action === "choose-guided-muscle") { guidedExerciseMuscleFilter = target.dataset.muscleGroupId; if (!guidedExerciseBrowserDayId) guidedExerciseBrowserDayId = guidedSelectedDayId || guidedDraft()?.guidedDays?.[0]?.id || ""; guidedPendingAssignment = null; render(); }
        if (action === "select-guided-exercise") selectGuidedExercise(target.dataset.dayId, target.dataset.exerciseId, target.dataset.muscleGroupId);
        if (action === "guided-pending-set-change") { if (guidedPendingAssignment) { guidedPendingAssignment = { ...guidedPendingAssignment, workingSets: Math.max(1, Math.min(10, Number(guidedPendingAssignment.workingSets) + Number(target.dataset.delta))) }; render(); } }
        if (action === "cancel-guided-pending") { guidedPendingAssignment = null; render(); }
        if (action === "confirm-guided-exercise") confirmGuidedExercise();
        if (action === "guided-set-change") { const draft = guidedDraft(); const day = draft?.guidedDays.find((item) => item.id === target.dataset.dayId); const assignment = day?.assignments.find((item) => item.id === target.dataset.assignmentId); if (draft && assignment) updateGuidedDraft(guidedMesocycleApi.patchAssignment(draft, day.id, assignment.id, { workingSets: Math.max(1, Math.min(10, Number(assignment.workingSets) + Number(target.dataset.delta))) })); }
        if (action === "remove-guided-exercise") { const draft = guidedDraft(); if (draft) updateGuidedDraft(guidedMesocycleApi.removeAssignment(draft, target.dataset.dayId, target.dataset.assignmentId)); }
        if (action === "open-guided-weekly") { guidedWeeklySummaryOpen = true; render(); }
        if (action === "close-guided-weekly") { guidedWeeklySummaryOpen = false; render(); }
        if (action === "check-guided-viability") { guidedWeeklySummaryOpen = false; checkGuidedViability(); }
        if (action === "return-guided-builder") { guidedMesocycleView = "builder"; render(); }
        if (action === "accept-guided-finding") { const draft = guidedDraft(); if (draft) { const acceptedExceptions = Array.from(new Set([...(draft.acceptedExceptions || []), target.dataset.findingId])); const viabilityResult = { ...draft.viabilityResult, findings: draft.viabilityResult.findings.map((item) => item.id === target.dataset.findingId ? { ...item, accepted: true } : item) }; viabilityResult.blockingCount = viabilityResult.findings.filter((item) => !item.accepted && item.severity === 'blocking').length; updateGuidedDraft({ ...draft, acceptedExceptions, viabilityResult, viabilityStale: false, updatedAt: isoNow() }); } }
        if (action === "edit-guided-finding") { guidedSelectedDayId = target.dataset.dayId; guidedMesocycleView = "builder"; guidedGenerationReviewOpen = false; render(); }
        if (action === "open-guided-generation-review") { if (guidedStepUnlocked(guidedDraft(), "create")) { guidedGenerationReviewOpen = true; render(); } }
        if (action === "close-guided-generation-review") { guidedGenerationReviewOpen = false; render(); }
        if (action === "create-guided-templates") createGuidedTemplates();
        if (action === "edit-guided-day-from-review") { guidedSelectedDayId = target.dataset.dayId; guidedGenerationReviewOpen = false; guidedMesocycleView = "builder"; render(); }
        if (action === "view-created-templates") { guidedMesocycleView = "closed"; setActiveTab("plan"); }
        if (action === "view-completed-mesocycle") { guidedMesocycleView = "completion"; render(); }
        if (action === "start-first-mesocycle-template") { const draft = guidedDraft(); const templateId = draft?.creationResult?.templateIds?.[0] || draft?.linkedTemplateIds?.[0]; if (templateId) openTemplateStart(templateId); }
        if (action === "toggle-template-editor") {
          const templateId = target.dataset.templateId;
          if (expandedTemplateEditorIds.has(templateId)) expandedTemplateEditorIds.delete(templateId); else expandedTemplateEditorIds.add(templateId);
          render();
        }
        if (action === "preview-mesocycle") previewMesocyclePlan();
        if (action === "regenerate-mesocycle") regenerateMesocycleWithPracticalLimits(target.dataset.mesocycleId);
        if (action === "mesocycle-type-option") { mesocycleDraftType = target.dataset.value; render(); }
        if (action === "toggle-mesocycle-equipment") {
          const value = target.dataset.value;
          const current = new Set(mesocycleEquipmentSelection());
          if (value === "all") {
            current.clear();
            current.add("all");
          } else {
            current.delete("all");
            if (current.has(value)) current.delete(value); else current.add(value);
            if (!current.size) current.add("all");
          }
          commit({ ...data, settings: { ...data.settings, availableEquipment: Array.from(current) } });
        }
        if (action === "jump-mesocycle-slot") { selectedPrescriptionPoolMuscle = target.dataset.muscleGroupId; render(); }
        if (action === "toggle-mesocycle-alternates") {
          const slotId = target.dataset.slotId;
          if (expandedMesocycleAlternateSlots.has(slotId)) expandedMesocycleAlternateSlots.delete(slotId); else expandedMesocycleAlternateSlots.add(slotId);
          render();
        }
        if (action === "toggle-mesocycle-planner-review") { mesocyclePlannerExpanded = !mesocyclePlannerExpanded; render(); }
        if (action === "mesocycle-transition") transitionMesocyclePlan(target.dataset.mesocycleId, target.dataset.mesocycleAction);
        if (action === "confirm-mesocycle-scope") confirmMesocycleScope(target.dataset.mesocycleId);
        if (action === "add-mesocycle-muscle") addOmittedMuscleAndRebuild(target.dataset.mesocycleId, target.dataset.muscleGroupId);
        if (action === "select-mesocycle-candidate") selectMesocycleCandidate(target.dataset.mesocycleId, target.dataset.slotId, target.dataset.exerciseId);
        if (action === "compare-mesocycle-candidate") {
          const exerciseId = target.dataset.exerciseId;
          mesocycleComparisonIds = mesocycleComparisonIds.includes(exerciseId) ? mesocycleComparisonIds.filter((id) => id !== exerciseId) : [...mesocycleComparisonIds, exerciseId].slice(-3);
          render();
        }
        if (action === "request-delete-mesocycle") { pendingDeleteMesocycleId = target.dataset.mesocycleId; render(); }
        if (action === "cancel-delete-mesocycle") { pendingDeleteMesocycleId = ""; render(); }
        if (action === "confirm-delete-mesocycle") deleteMesocycleDraft(target.dataset.mesocycleId);
        if (action === "apply-prescription-override") applyPrescriptionOverride(target.dataset.exerciseId, target.closest("[data-override-form]"));
        if (action === "save-template") saveActiveSessionAsTemplate();
        if (action === "start-template") openTemplateStart(target.dataset.templateId);
        if (action === "return-active-workout") { templateStartFlow = null; activeSessionId = activeWorkoutId; setActiveTab("lift"); }
        if (action === "request-cancel-workout") requestCancelWorkout("workout", target.dataset.sessionId || "");
        if (action === "request-cancel-workout-from-template") requestCancelWorkout("template", activeWorkoutId);
        if (action === "keep-workout") closeCancelWorkout();
        if (action === "confirm-cancel-workout") discardActiveWorkout();
        if (action === "cancel-template-start") closeTemplateStart();
        if (action === "continue-template-start" && templateStartFlow) { templateStartFlow = { ...templateStartFlow, step: "readiness" }; render(); }
        if (action === "use-usual-readiness" && templateStartFlow) startTemplate(templateStartFlow.templateId, defaultRecovery(), "usual");
        if (action === "log-today-readiness" && templateStartFlow) { templateStartFlow = { ...templateStartFlow, step: "metrics" }; render(); }
        if (action === "review-template-readiness" && templateStartFlow) { templateStartFlow = { ...templateStartFlow, step: "review" }; render(); }
        if (action === "edit-readiness-metrics" && templateStartFlow) { templateStartFlow = { ...templateStartFlow, step: "metrics" }; render(); }
        if (action === "start-adjusted-workout" && templateStartFlow) startTemplate(templateStartFlow.templateId, templateStartFlow.draft, "daily");
        if (action === "start-original-workout" && templateStartFlow) startTemplate(templateStartFlow.templateId, templateStartFlow.draft, "daily-original", { useOriginal: true });
        if (action === "add-template-exercise") addTemplateExercise(target.dataset.templateId);
        if (action === "toggle-volume-muscle") {
          expandedVolumeMuscle = expandedVolumeMuscle === target.dataset.muscle ? "" : target.dataset.muscle;
          render();
        }
        if (action === "dashboard-week") {
          const date = new Date(dashboardWeekStart + "T00:00:00");
          date.setDate(date.getDate() + Number(target.dataset.direction || 0) * 7);
          dashboardWeekStart = localDateIso(date) > startOfWeekIso(todayIso()) ? startOfWeekIso(todayIso()) : localDateIso(date);
          dashboardDetail = null;
          dashboardFocusStack.length = 0;
          expandedVolumeMuscle = "";
          render();
        }
        if (action === "open-dashboard-detail") {
          openDashboardDetailView({ type: target.dataset.detail }, target);
        }
        if (action === "close-dashboard-detail") closeDashboardDetailView();
        if (action === "open-dashboard-session") openDashboardDetailView({ type: "session", id: target.dataset.sessionId }, target);
        if (action === "open-volume-session") openDashboardDetailView({ type: "session", id: target.dataset.sessionId, parent: "volume" }, target);
        if (action === "open-volume-exercise") {
          const exerciseId = canonicalExerciseId(target.dataset.exerciseName);
          if (exerciseCatalog().some((item) => item.id === exerciseId)) selectChartExercise(exerciseId);
          setProgressView("lifts");
        }
        if (action === "open-fatigue-flag") openDashboardDetailView({ type: "fatigue-flag", id: target.dataset.flagId }, target);
        if (action === "open-plan-volume-warning") { planVolumeDetailId = target.dataset.flagId; render(); window.scrollTo({ top: 0, behavior: preferredScrollBehavior() }); }
        if (action === "close-plan-volume-detail") { planVolumeDetailId = ""; render(); window.scrollTo({ top: 0, behavior: preferredScrollBehavior() }); }
        if (action === "dashboard-detail-parent") {
          closeDashboardDetailView();
        }
        if (action === "request-delete-template") {
          pendingDeleteTemplateId = target.dataset.templateId;
          render();
        }
        if (action === "cancel-delete-template") {
          pendingDeleteTemplateId = "";
          render();
        }
        if (action === "confirm-delete-template") {
          const templateId = target.dataset.templateId;
          pendingDeleteTemplateId = "";
          clearTemplateNumericDrafts(templateId);
          commit({ ...data, templates: data.templates.filter((template) => template.id !== templateId) });
        }
        if (action === "delete-template-exercise") {
          clearTemplateNumericDrafts(target.dataset.templateId, target.dataset.templateExerciseId);
          commit({
            ...data,
            templates: data.templates.map((template) => template.id === target.dataset.templateId
              ? { ...template, exercises: template.exercises.filter((exercise) => exercise.id !== target.dataset.templateExerciseId), updatedAt: isoNow() }
              : template)
          });
        }
        if (action === "add-exercise") addExercise();
        if (action === "move-exercise") moveExercise(target.dataset.exerciseId, target.dataset.direction);
        if (action === "delete-exercise") {
          if (timer?.exerciseId === target.dataset.exerciseId) cancelTimer("exercise-deleted", false);
          commit({ ...data, exercises: data.exercises.filter((exercise) => exercise.id !== target.dataset.exerciseId), sets: data.sets.filter((set) => set.exerciseId !== target.dataset.exerciseId) }, true, { invalidateAnalysis: false, deferPersistence: true });
          ensureActiveSet();
        }
        if (action === "add-set") addSet(target.dataset.exerciseId, false);
        if (action === "add-warmup-set") addWarmupSet(target.dataset.exerciseId);
        if (action === "duplicate-set") addSet(target.dataset.exerciseId, true);
        if (action === "delete-set") {
          if (timer?.setId === target.dataset.setId || timer?.pendingNextSetId === target.dataset.setId) cancelTimer("set-deleted", false);
          const removedSet = setById(target.dataset.setId);
          if (removedSet && isWorkingSet(removedSet, "score")) {
            const exercise = exerciseById(removedSet.exerciseId);
            const count = setsForExercise(removedSet.exerciseId).filter((set) => isWorkingSet(set, "score")).length;
            logWorkoutOverride(exercise, "setCount", count, Math.max(0, count - 1), { action: "delete_set", setId: removedSet.id });
          }
          commit({ ...data, sets: data.sets.filter((set) => set.id !== target.dataset.setId) }, true, { invalidateAnalysis: false, deferPersistence: true });
          ensureActiveSet();
        }
        if (action === "undo-set-type-override") undoManualSetType(target.dataset.setId);
        if (action === "toggle-set") toggleSetCompletion(target.dataset.setId);
        if (action === "toggle-skip-set") toggleSetSkipped(target.dataset.setId);
        if (action === "update-template-exercise") updateTemplateFromExercise(target.dataset.exerciseId);
        if (action === "request-submit-workout") { pendingSubmitSessionId = activeSessionId; render(); }
        if (action === "cancel-submit-workout") { pendingSubmitSessionId = ""; render(); }
        if (action === "confirm-submit-workout") submitWorkout(activeSessionId);
        if (action === "close-completed-summary") returnToLiftHome("Workout saved.");
        if (action === "begin-history-edit") await beginHistoryEdit();
        if (action === "request-save-history-edits") requestHistoryEditConfirmation("save");
        if (action === "request-cancel-history-edits") requestHistoryEditConfirmation("cancel");
        if (action === "keep-history-editing") closeHistoryEditConfirmation();
        if (action === "confirm-save-history-edits") saveHistoryEdits();
        if (action === "confirm-cancel-history-edits") cancelHistoryEdits();
        if (action === "return-lift-home") returnToLiftHome();
        if (action === "add-template-warmup") {
          const template = data.templates.find((item) => item.id === target.dataset.templateId);
          const exercise = template?.exercises.find((item) => item.id === target.dataset.templateExerciseId);
          const resistanceType = exercise?.resistanceType || inferResistanceType(exercise?.name || "", exercise || {});
          const warmups = [...(exercise?.warmups || []), { reps: 10, weight: 0, weightUnit: data.settings.weightUnit, resistanceType, isBodyweight: isBodyweightResistance(resistanceType), addedLoad: 0, assistanceLoad: 0, rpe: 5 }];
          patchTemplateExercise(target.dataset.templateId, target.dataset.templateExerciseId, { warmups });
        }
        if (action === "remove-template-warmup") {
          const template = data.templates.find((item) => item.id === target.dataset.templateId);
          const exercise = template?.exercises.find((item) => item.id === target.dataset.templateExerciseId);
          const warmups = (exercise?.warmups || []).filter((_, index) => index !== Number(target.dataset.warmupIndex));
          patchTemplateExercise(target.dataset.templateId, target.dataset.templateExerciseId, { warmups });
        }
        if (action === "start-timer") startTimer(target.dataset.exerciseId, target.dataset.setId);
        if (action === "toggle-timer") toggleTimer();
        if (action === "adjust-timer") adjustTimer(Number(target.dataset.seconds || 0));
        if (action === "skip-timer") cancelTimer("skipped", true);
        if (action === "clear-timer") cancelTimer("canceled", true);
        if (action === "return-to-rest-workout") {
          if (!restCompletionController?.returnToWorkout()) await navigateToRestCompletion(timerCompleteNotice?.payload || restNavigationState || {});
        }
        if (action === "dismiss-timer-notice") {
          if (!restCompletionController?.dismiss("manual")) { timerCompleteNotice = null; saveRuntime(); render(); }
        }
        if (action === "open-session") {
          const requestedSession = data.sessions.find((session) => session.id === target.dataset.sessionId);
          if (!requestedSession || (!isSessionSubmitted(requestedSession) && requestedSession.id !== activeWorkoutId)) {
            showAppToast("That draft is not the active workout.");
            return;
          }
          if (historyEditFlow && requestedSession.id !== historyEditFlow.sessionId) {
            historyEditConfirm = "cancel";
            render();
            return;
          }
          historyEditFlow = null;
          historyEditConfirm = "";
          activeSessionId = requestedSession.id;
          viewingHistorySessionId = isSessionSubmitted(requestedSession) ? requestedSession.id : "";
          planVolumeDetailId = "";
          setActiveTab("lift");
        }
        if (action === "export-data") exportData();
        if (action === "delete-remote-installation") await deleteRemoteInstallationData();
        if (action === "clear-data") await requestClearLocalData();
        if (action === "cancel-clear-data") closeClearDataFlow();
        if (action === "sync-before-clear") { await flushWorkoutSyncQueue(); clearDataFlow = { ...clearDataFlow, unsynced: await inspectUnsynchronizedData() }; render(); }
        if (action === "confirm-clear-data") await permanentlyClearLocalData();
      });

      root.addEventListener("change", async (event) => {
        const target = event.target.closest("[data-action]");
        if (!target) return;
        const action = target.dataset.action;
        if (historyMutationIsLocked(action)) return;
        if (templateNumericFields[action]) {
          handleTemplateNumericEdit(target);
          return;
        }
        if (action === "change-session") {
          const requestedSession = data.sessions.find((session) => session.id === target.value);
          if (!requestedSession || (!isSessionSubmitted(requestedSession) && requestedSession.id !== activeWorkoutId)) {
            activeSessionId = activeWorkoutId || activeSessionId;
            showAppToast("Only the active workout can be resumed. Finish or cancel it before starting another.");
            render();
            return;
          }
          activeSessionId = requestedSession.id;
          viewingHistorySessionId = isSessionSubmitted(requestedSession) ? requestedSession.id : "";
          render();
        }
        if (action === "session-date") patchSession({ date: target.value });
        if (action === "session-travel") patchSession({ isTravel: target.checked });
        if (action === "add-exercise-primary") addExercisePrimaryMuscle = target.value;
        if (action === "add-exercise-secondary") addExerciseSecondaryMuscle = target.value;
        if (action === "exercise-primary-muscle") patchExercise(target.dataset.exerciseId, { primaryMuscle: target.value });
        if (action === "exercise-secondary-muscle") patchExercise(target.dataset.exerciseId, { secondaryMuscle: target.value });
        if (action === "exercise-deload") {
          const exercise = exerciseById(target.dataset.exerciseId);
          const form = root.querySelector(`[data-override-form="${CSS.escape(target.dataset.exerciseId)}"]`);
          if (exercise?.recommendationSnapshot && form && exercise.sessionId === activeWorkoutId) {
            const deloadSelect = form.querySelector('[data-override-field="deload"]');
            const reasonInput = form.querySelector('[data-override-field="reason"]');
            if (deloadSelect) deloadSelect.value = target.checked ? "exercise_deload" : "normal";
            if (reasonInput) reasonInput.value = target.checked ? "Manual exercise-specific deload" : "Manual decision to resume normal exercise loading";
            applyPrescriptionOverride(exercise.id, form);
          } else patchExercise(target.dataset.exerciseId, { isDeload: target.checked });
        }
        if (action === "exercise-resistance-type") {
          const resistanceType = resistanceTypeValues.includes(target.value) ? target.value : "external";
          commit({
            ...data,
            exercises: data.exercises.map((exercise) => {
              if (exercise.id !== target.dataset.exerciseId) return exercise;
              const prescriptionWeight = ["bodyweight", "duration", "distance"].includes(resistanceType) ? 0 : Number(exercise.prescription?.weight || 0);
              const prescription = exercise.prescription ? { ...exercise.prescription, resistanceType, isBodyweight: isBodyweightResistance(resistanceType), weight: prescriptionWeight, addedLoad: resistanceType === "bodyweight_plus_load" ? prescriptionWeight : 0, assistanceLoad: resistanceType === "assisted_bodyweight" ? prescriptionWeight : 0 } : exercise.prescription;
              return { ...exercise, resistanceType, isBodyweight: isBodyweightResistance(resistanceType), prescription };
            }),
            sets: data.sets.map((set) => set.exerciseId === target.dataset.exerciseId ? normalizeResistanceSet({ ...set, weight: ["bodyweight", "duration", "distance"].includes(resistanceType) ? 0 : set.weight }, resistanceType) : set)
          });
        }
        if (action === "exercise-bodyweight") {
          const resistanceType = target.checked ? "bodyweight" : "external";
          commit({ ...data, exercises: data.exercises.map((exercise) => exercise.id === target.dataset.exerciseId ? { ...exercise, resistanceType, isBodyweight: target.checked } : exercise), sets: data.sets.map((set) => set.exerciseId === target.dataset.exerciseId ? normalizeResistanceSet(set, resistanceType) : set) });
        }
        if (action === "set-warmup") setManualType(target.dataset.setId, target.checked ? "warmup" : "straight");
        if (action === "set-type-override") setManualType(target.dataset.setId, target.value);
        if (action === "set-reps") patchSetValue(target.dataset.setId, "reps", target.value);
        if (action === "set-weight") patchSetValue(target.dataset.setId, "weight", target.value);
        if (action === "set-rpe") patchSetValue(target.dataset.setId, "rpe", target.value);
        if (action === "set-duration") patchSetValue(target.dataset.setId, "durationSeconds", target.value);
        if (action === "set-distance") patchSetValue(target.dataset.setId, "distance", target.value);
        if (action === "exercise-rest-seconds") patchExercise(target.dataset.exerciseId, { restSeconds: Number(target.value) });
        if (action === "template-exercise-resistance") { const resistanceType = resistanceTypeValues.includes(target.value) ? target.value : "external"; patchTemplateExercise(target.dataset.templateId, target.dataset.templateExerciseId, { resistanceType, isBodyweight: isBodyweightResistance(resistanceType) }); }
        if (action === "hypertrophy-window") {
          hypertrophyWindowOffset = Math.max(0, Number(target.value || 0));
          hypertrophyScoreExpanded = false;
          chartDetailPoint = null;
          hypertrophyScoreLoading = true;
          render();
          window.setTimeout(() => { hypertrophyScoreLoading = false; render(); }, 60);
        }
        if (action === "weight-unit") commit(convertAppWeightUnit(data, target.value));
        if (action === "theme-mode") commit({ ...data, settings: { ...data.settings, theme: target.value } });
        if (action === "training-goal") commit({ ...data, settings: { ...data.settings, trainingGoal: target.value } });
        if (action === "nutrition-phase") commit({ ...data, settings: { ...data.settings, nutritionPhase: target.value } });
        if (action === "experience-level") commit({ ...data, settings: { ...data.settings, experienceLevel: target.value } });
        if (action === "returning-after-gap") commit({ ...data, settings: { ...data.settings, returningAfterGap: target.value === "" ? null : target.value === "true" } });
        if (action === "cloud-workout-sync-consent") {
          const requestedConsent = target.checked === true;
          target.checked = data.settings.cloudWorkoutSyncConsent === true;
          target.disabled = true;
          target.setAttribute("aria-busy", "true");
          await setCloudWorkoutSyncConsent(requestedConsent);
        }
        if (action === "mesocycle-type") { mesocycleDraftType = target.value; render(); }
        if (action === "mesocycle-specialization") { mesocycleSpecializationMuscle = target.value; render(); }
        if (action === "guided-exercise-muscle") { guidedExerciseMuscleFilter = target.value; guidedPendingAssignment = null; render(); }
        if (action === "guided-exercise-search") { guidedExerciseSearch = target.value; render(); }
        if (action === "move-guided-exercise") { const draft = guidedDraft(); if (draft) { const updated = guidedMesocycleApi.moveAssignment(draft, target.dataset.dayId, target.value, target.dataset.assignmentId); if (updated.assignmentError) { target.value = target.dataset.dayId; showAppToast("That exercise is already assigned to the selected day. Merge sets with the existing assignment instead."); } else updateGuidedDraft(updated); } }
        if (action === "mesocycle-muscle-scope") {
          const available = prescriptionEngine ? Array.from(new Set(prescriptionApi.representedMuscleGroups(prescriptionEngine.evidence).map(prescriptionApi.muscleFamily))) : [];
          if (!mesocycleScopeDraft) mesocycleScopeDraft = new Set(available);
          if (target.checked) mesocycleScopeDraft.add(target.value); else mesocycleScopeDraft.delete(target.value);
        }
        if (action === "mesocycle-pool-muscle") { selectedPrescriptionPoolMuscle = target.value; render(); }
        if (action === "mesocycle-training-days") commit({ ...data, settings: { ...data.settings, trainingDaysPerWeek: Math.max(1, Math.min(7, Number(target.value || 4))) } });
        if (action === "mesocycle-equipment") commit({ ...data, settings: { ...data.settings, availableEquipment: String(target.value || "").split(",").map((item) => item.trim()).filter(Boolean) } });
        if (action === "timer-sound") commit({ ...data, settings: { ...data.settings, timerSound: target.checked, setupSoundConfirmed: target.checked ? data.settings.setupSoundConfirmed : false } });
        if (action === "rest-complete-sound") commit({ ...data, settings: { ...data.settings, restCompleteSound: target.value } });
        if (action === "rest-complete-volume") commit({ ...data, settings: { ...data.settings, restCompleteSoundVolume: Math.max(0, Math.min(1, Number(target.value ?? 0.85))) } });
        if (action === "rest-complete-dismiss-seconds") commit({ ...data, settings: { ...data.settings, restCompleteAutoDismissMs: Math.max(1000, Math.min(60000, Math.round(Number(target.value || 5) * 1000))) } });
        if (action === "rest-complete-auto-return") commit({ ...data, settings: { ...data.settings, restCompleteAutoReturnToWorkout: target.checked } });
        if (action === "workout-completion-sound") commit({ ...data, settings: { ...data.settings, workoutCompletionSound: target.checked } });
        if (action === "timer-vibration") commit({ ...data, settings: { ...data.settings, timerVibration: target.checked } });
        if (action === "interaction-vibration") commit({ ...data, settings: { ...data.settings, interactionVibration: target.checked } });
        if (action === "timer-notifications") {
          if (target.checked) {
            commit({ ...data, settings: { ...data.settings, timerNotifications: true, restCompleteLockScreenNotifications: true } }, false);
            enablePushNotifications();
          } else {
            await disablePushNotifications();
          }
        }
        if (action === "in-app-rest-alerts") commit({ ...data, settings: { ...data.settings, inAppRestAlerts: target.checked } });
        if (action === "default-rest-seconds") commit({ ...data, settings: { ...data.settings, defaultRestSeconds: Math.max(15, Number(target.value || 90)) } });
        if (action === "notification-detail") commit({ ...data, settings: { ...data.settings, notificationMessageDetail: target.value } });
        if (action === "auto-start-rest") commit({ ...data, settings: { ...data.settings, autoStartRestTimer: target.checked } });
        if (action === "auto-highlight-next") commit({ ...data, settings: { ...data.settings, autoHighlightNextSet: target.checked } });
        if (action === "auto-scroll-next") commit({ ...data, settings: { ...data.settings, autoScrollNextSet: target.checked } });
        if (action === "recovery-sleep-quality") patchRecovery({ sleepQuality: target.value });
        if (action === "recovery-soreness") patchRecovery({ soreness: target.value });
        if (action === "recovery-nutrition") patchRecovery({ nutritionStatus: target.value });
        if (action === "recovery-protein") patchRecovery({ proteinStatus: target.value });
        if (action === "recovery-illness") patchRecovery({ illness: target.checked });
        if (action === "recovery-pain") patchRecovery({ pain: target.checked });
        if (action === "recovery-affected-muscle") patchRecovery({ affectedMuscle: target.value });
        if (action === "recovery-outside-note") patchRecovery({ outsideBandNote: target.value });
        if (action === "recovery-sleep-hours") patchRecovery({ sleepHours: target.value });
        if (action === "recovery-hrv") patchRecovery({ hrv: target.value });
        if (action === "recovery-resting-hr") patchRecovery({ restingHr: target.value });
        if (action === "baseline-sleep-hours") patchReadinessBaseline({ sleepHours: target.value });
        if (action === "baseline-sleep-quality") patchReadinessBaseline({ sleepQuality: target.value });
        if (action === "baseline-hrv") patchReadinessBaseline({ hrv: target.value });
        if (action === "baseline-resting-hr") patchReadinessBaseline({ restingHr: target.value });
        if (action === "baseline-soreness") patchReadinessBaseline({ soreness: target.value });
        if (action === "baseline-band") patchReadinessBaseline({ band: target.value });
        if (action === "template-readiness-sleep-quality") patchTemplateStartDraft({ sleepQuality: target.value }, false);
        if (action === "template-readiness-soreness") patchTemplateStartDraft({ soreness: target.value }, false);
        if (action === "template-readiness-nutrition") patchTemplateStartDraft({ nutritionStatus: target.value }, false);
        if (action === "template-readiness-protein") patchTemplateStartDraft({ proteinStatus: target.value }, false);
        if (action === "template-readiness-illness") patchTemplateStartDraft({ illness: target.checked }, false);
        if (action === "template-readiness-pain") patchTemplateStartDraft({ pain: target.checked }, false);
        if (action === "template-readiness-affected-muscle") patchTemplateStartDraft({ affectedMuscle: target.value }, false);
        if (action === "template-readiness-sleep-hours") patchTemplateStartDraft({ sleepHours: target.value }, false);
        if (action === "template-readiness-hrv") patchTemplateStartDraft({ hrv: target.value }, false);
        if (action === "template-readiness-resting-hr") patchTemplateStartDraft({ restingHr: target.value }, false);
        if (action === "clear-data-ack" && clearDataFlow) { clearDataFlow = { ...clearDataFlow, acknowledged: target.checked }; render(); }
        if (action === "import-data" && target.files[0]) importDataFile(target.files[0]);
        if (action === "import-personal-evidence" && target.files[0]) importPersonalEvidenceFile(target.files[0]);
      });

      root.addEventListener("focusin", (event) => {
        const target = event.target.closest("[data-action]");
        if (!target || target.tagName !== "INPUT") return;
        if (target.dataset.action === "review-exercise-input") {
          chartExerciseDraft = target.value;
          chartExerciseSearchError = "";
          chartExerciseSearchOpen = true;
          chartExerciseHighlight = 0;
          target.select();
          target.setAttribute("aria-expanded", "true");
          updateExerciseSuggestionList();
          return;
        }
        if (isNumericEditAction(target.dataset.action)) {
          target.dataset.replaceOnNextInput = "true";
          target.dataset.previousValue = target.value;
          target.select();
        }
      });

      root.addEventListener("focusout", (event) => {
        const target = event.target.closest("[data-action]");
        if (target?.dataset.action === "review-exercise-input") {
          if (event.relatedTarget?.closest?.('[data-action="select-chart-exercise"]')) return;
          window.setTimeout(() => {
            chartExerciseSearchOpen = false;
            const input = root.querySelector('[data-action="review-exercise-input"]');
            if (input) {
              input.value = selectedExerciseName();
              input.setAttribute("aria-expanded", "false");
            }
            updateExerciseSuggestionList();
          }, 0);
          return;
        }
        if (!target || target.tagName !== "INPUT" || !isNumericEditAction(target.dataset.action)) return;
        if (templateNumericFields[target.dataset.action]) {
          handleTemplateNumericEdit(target);
          return;
        }
        const nextTarget = event.relatedTarget?.closest?.("[data-action]");
        if (nextTarget && isNumericEditAction(nextTarget.dataset.action)) return;
        const action = target.dataset.action;
        if (action === "set-reps") patchSetValue(target.dataset.setId, "reps", target.value);
        if (action === "set-weight") patchSetValue(target.dataset.setId, "weight", target.value);
        if (action === "set-rpe") patchSetValue(target.dataset.setId, "rpe", target.value);
        if (action === "set-duration") patchSetValue(target.dataset.setId, "durationSeconds", target.value);
        if (action === "set-distance") patchSetValue(target.dataset.setId, "distance", target.value);
        if (action === "recovery-sleep-hours") patchRecovery({ sleepHours: target.value });
        if (action === "recovery-hrv") patchRecovery({ hrv: target.value });
        if (action === "recovery-resting-hr") patchRecovery({ restingHr: target.value });
        if (action === "baseline-sleep-hours") patchReadinessBaseline({ sleepHours: target.value });
        if (action === "baseline-sleep-quality") patchReadinessBaseline({ sleepQuality: target.value });
        if (action === "baseline-hrv") patchReadinessBaseline({ hrv: target.value });
        if (action === "baseline-resting-hr") patchReadinessBaseline({ restingHr: target.value });
        if (action === "baseline-soreness") patchReadinessBaseline({ soreness: target.value });
        if (action === "baseline-band") patchReadinessBaseline({ band: target.value });
        if (action === "template-readiness-sleep-hours") patchTemplateStartDraft({ sleepHours: target.value });
        if (action === "template-readiness-hrv") patchTemplateStartDraft({ hrv: target.value });
        if (action === "template-readiness-resting-hr") patchTemplateStartDraft({ restingHr: target.value });
      });

      root.addEventListener("beforeinput", (event) => {
        const target = event.target.closest("[data-action]");
        if (!target || target.tagName !== "INPUT" || !isNumericEditAction(target.dataset.action)) return;
        if (target.dataset.replaceOnNextInput === "true" && event.inputType && event.inputType.startsWith("insert")) {
          event.preventDefault();
          target.value = event.data || "";
          target.dataset.replaceOnNextInput = "false";
          target.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          target.dataset.replaceOnNextInput = "false";
        }
      });

      root.addEventListener("keydown", (event) => {
        const target = event.target.closest("[data-action]");
        if (target?.dataset.action === "return-to-rest-workout" && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          navigateToRestCompletion(timerCompleteNotice?.payload || restNavigationState || {});
          return;
        }
        if (event.key === "Escape" && (templateStartFlow || cancelWorkoutFlow || historyEditConfirm || clearDataFlow?.open)) {
          event.preventDefault();
          if (templateStartFlow) closeTemplateStart();
          else if (cancelWorkoutFlow) closeCancelWorkout();
          else if (historyEditConfirm) closeHistoryEditConfirmation();
          else closeClearDataFlow();
          return;
        }
        if (event.key === "Tab" && (templateStartFlow || cancelWorkoutFlow || historyEditConfirm || clearDataFlow?.open)) {
          const activeDialog = root.querySelector('[role="dialog"][aria-modal="true"]');
          const focusable = visibleEnabledFocusableElements(activeDialog);
          if (focusable.length) {
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!activeDialog.contains(document.activeElement)) { event.preventDefault(); focusVisibleEnabledElement(first); return; }
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); focusVisibleEnabledElement(last); return; }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); focusVisibleEnabledElement(first); return; }
          }
        }
        if (target?.dataset.action === "review-exercise-input") {
          const matches = matchingChartExercises(chartExerciseDraft);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            chartExerciseSearchOpen = true;
            chartExerciseHighlight = matches.length ? (chartExerciseHighlight + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length : 0;
            updateExerciseSuggestionList();
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            if (confirmChartExerciseDraft()) return;
            chartExerciseDraft = selectedExerciseName();
            chartExerciseSearchOpen = false;
            chartExerciseSearchError = "No logged exercise matched. The previous lift remains selected.";
            performInteractionFeedback("error");
            target.value = chartExerciseDraft;
            target.setAttribute("aria-expanded", "false");
            updateExerciseSuggestionList();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            chartExerciseDraft = selectedExerciseName();
            chartExerciseSearchOpen = false;
            target.value = chartExerciseDraft;
            target.setAttribute("aria-expanded", "false");
            updateExerciseSuggestionList();
            target.blur();
            return;
          }
        }
        if (target?.dataset.action === "show-chart-point" && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); target.dispatchEvent(new MouseEvent("click", { bubbles: true })); return; }
        if (!target || target.tagName !== "INPUT" || !isNumericEditAction(target.dataset.action)) return;
        if (target.dataset.replaceOnNextInput !== "true") return;
        if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 || !/[\d.]/.test(event.key)) {
          target.dataset.replaceOnNextInput = "false";
          return;
        }
        event.preventDefault();
        target.value = event.key;
        target.dataset.replaceOnNextInput = "false";
        target.dispatchEvent(new Event("input", { bubbles: true }));
      });

      root.addEventListener("input", (event) => {
        const inputStartedAt = performanceNow();
        const target = event.target.closest("[data-action]");
        if (!target) return;
        const action = target.dataset.action;
        if (historyMutationIsLocked(action)) return;
        if (target.tagName === "INPUT" && isNumericEditAction(action) && target.dataset.replaceOnNextInput === "true") {
          const previousValue = target.dataset.previousValue || "";
          let replacement = target.value;
          const inserted = typeof event.data === "string" ? event.data : "";
          if (previousValue && inserted.length === 1 && replacement === previousValue + inserted) replacement = inserted;
          target.value = replacement;
          target.dataset.replaceOnNextInput = "false";
        }
        if (templateNumericFields[action]) {
          handleTemplateNumericEdit(target);
          return;
        }
        if (action === "add-exercise-draft") {
          addExerciseDraft = target.value;
          const addButton = root.querySelector('[data-action="add-exercise"]');
          const safety = guardWorkoutMutation("add-exercise", {}, false);
          if (addButton) {
            addButton.disabled = !safety.allowed;
            addButton.setAttribute("aria-disabled", safety.allowed ? "false" : "true");
            if (safety.allowed) addButton.removeAttribute("data-safety-reason");
            else addButton.dataset.safetyReason = safety.message || "Blocked by the current workout safety restriction";
          }
        }
        if (action === "mesocycle-duration") mesocycleDurationDraft = target.value;
        if (action === "review-exercise-input") {
          chartExerciseDraft = target.value;
          chartExerciseSearchOpen = true;
          chartExerciseHighlight = 0;
          chartExerciseSearchError = "";
          target.setAttribute("aria-expanded", "true");
          updateExerciseSuggestionList();
          return;
        }
        if (action === "session-title") patchSession({ title: target.value }, false);
        if (action === "session-notes") patchSession({ notes: target.value }, false);
        if (action === "exercise-name") { target.style.height = "auto"; target.style.height = Math.max(38, target.scrollHeight) + "px"; patchExerciseName(target.dataset.exerciseId, target.value, false); }
        if (action === "exercise-notes") patchExercise(target.dataset.exerciseId, { notes: target.value }, false);
        if (action === "set-reps") patchSetValue(target.dataset.setId, "reps", target.value, false);
        if (action === "set-weight") patchSetValue(target.dataset.setId, "weight", target.value, false);
        if (action === "set-rpe") patchSetValue(target.dataset.setId, "rpe", target.value, false);
        if (action === "set-duration") patchSetValue(target.dataset.setId, "durationSeconds", target.value, false);
        if (action === "set-distance") patchSetValue(target.dataset.setId, "distance", target.value, false);
        if (action === "exercise-rest-seconds") patchExercise(target.dataset.exerciseId, { restSeconds: Number(target.value) }, false);
        if (action === "template-name") patchTemplate(target.dataset.templateId, { name: target.value }, false);
        if (action === "template-exercise-name") patchTemplateExerciseName(target.dataset.templateId, target.dataset.templateExerciseId, target.value, false);
        if (action === "recovery-sleep-hours") patchRecovery({ sleepHours: target.value }, false);
        if (action === "recovery-hrv") patchRecovery({ hrv: target.value }, false);
        if (action === "recovery-resting-hr") patchRecovery({ restingHr: target.value }, false);
        if (action === "recovery-outside-note") patchRecovery({ outsideBandNote: target.value }, false);
        if (action === "baseline-sleep-hours") patchReadinessBaseline({ sleepHours: target.value }, false);
        if (action === "baseline-sleep-quality") patchReadinessBaseline({ sleepQuality: target.value }, false);
        if (action === "baseline-hrv") patchReadinessBaseline({ hrv: target.value }, false);
        if (action === "baseline-resting-hr") patchReadinessBaseline({ restingHr: target.value }, false);
        if (action === "baseline-soreness") patchReadinessBaseline({ soreness: target.value }, false);
        if (action === "baseline-band") patchReadinessBaseline({ band: target.value }, false);
        if (action === "template-readiness-sleep-hours") patchTemplateStartDraft({ sleepHours: target.value }, false);
        if (action === "template-readiness-hrv") patchTemplateStartDraft({ hrv: target.value }, false);
        if (action === "template-readiness-resting-hr") patchTemplateStartDraft({ restingHr: target.value }, false);
        if (action === "template-readiness-note") patchTemplateStartDraft({ outsideBandNote: target.value }, false);
        if (action === "clear-data-phrase" && clearDataFlow) {
          clearDataFlow.phrase = target.value;
          const finalButton = root.querySelector('[data-action="confirm-clear-data"]');
          if (finalButton) finalButton.disabled = !(clearDataFlow.acknowledged && clearDataFlow.phrase === "CLEAR");
        }
        if (action.startsWith("set-") || action === "exercise-notes" || action === "session-notes") {
          recordPerformance("input:" + action, inputStartedAt, { setId: target.dataset.setId || "", exerciseId: target.dataset.exerciseId || "" });
        }
      });

      async function applyWorkoutDeepLink() {
        const params = new URLSearchParams(window.location.search);
        if (params.get("view") === "settings") {
          setActiveTab("more", { replace: true, renderNow: false });
          return;
        }
        if (params.get("rest") === "complete") {
          await navigateToRestCompletion({
            navigationVersion: 1,
            workoutId: params.get("workoutId") || "",
            exerciseId: params.get("exerciseId") || "",
            completedSetId: params.get("completedSetId") || "",
            nextSetId: params.get("nextSetId") || "",
            timerId: params.get("timerId") || "",
            notificationId: params.get("notificationId") || "",
            timerVersion: Number(params.get("timerVersion") || 1)
          }, { silent: true });
          window.history.replaceState({ ...(window.history.state || {}), tab: "today" }, "", tabUrl("today"));
          return;
        }
        if (params.get("workout") !== "active") return;
        const setId = params.get("set") || "";
        const exerciseId = params.get("exercise") || "";
        const exercise = data.exercises.find((item) => item.id === exerciseId);
        if (exercise && data.sessions.some((session) => session.id === exercise.sessionId)) {
          const session = data.sessions.find((item) => item.id === exercise.sessionId);
          if (session && ((!isSessionSubmitted(session) && session.id === activeWorkoutId) || isSessionSubmitted(session))) activeSessionId = exercise.sessionId;
        } else if (activeWorkoutId) activeSessionId = activeWorkoutId;
        if (data.sets.some((set) => set.id === setId)) setActiveSet(setId, "Set is ready", false);
        setActiveTab("today", { replace: true, renderNow: false });
        window.setTimeout(() => scheduleActiveSetScroll(setId), 120);
      }

      async function registerPwaServiceWorker() {
        if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
        try {
          const registration = await navigator.serviceWorker.register("/sw.js");
          updateRegistration = registration;
          if (registration.waiting) {
            updateAvailable = true;
            render();
          }
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                updateAvailable = true;
                render();
              }
            });
          });
          navigator.serviceWorker.addEventListener("message", (event) => {
            if (event.data?.type === "REST_NOTIFICATION_CLICK") {
              navigateToRestCompletion(event.data.payload || {});
              return;
            }
            if (event.data?.type === "REST_PUSH_RECEIVED" && timer && timer.endsAt <= Date.now()) {
              timer.remainingSeconds = 0;
              completeTimer();
            }
          });
          let refreshing = false;
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshing) return;
            if (historyEditFlow || historyEditStartPending) {
              pendingControllerReload = true;
              updateAvailable = true;
              render();
              return;
            }
            refreshing = true;
            window.location.reload();
          });
        } catch {
          settingsMessage = "Offline support could not be initialized. Reopen the app while online and try again.";
        }
      }

      async function applyPwaUpdate() {
        if (historyEditFlow || historyEditStartPending) {
          if (historyEditFlow) requestHistoryEditConfirmation("cancel");
          updateAvailable = true;
          return false;
        }
        const stableData = cloneAppData(data);
        const persisted = await persistStableAppDataSnapshot(stableData);
        if (!persisted) {
          updateAvailable = true;
          showAppToast("The update was not applied because the current app state could not be saved.");
          render();
          return false;
        }
        saveRuntime();
        if (historyEditFlow || historyEditStartPending) {
          updateAvailable = true;
          return false;
        }
        if (pendingControllerReload) {
          pendingControllerReload = false;
          updateAvailable = false;
          window.location.reload();
          return true;
        }
        const registration = updateRegistration || await navigator.serviceWorker?.getRegistration?.();
        registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
        return true;
      }

      async function boot() {
        await loadData();
        await initializePrescriptionEvidence();
        installDevelopmentPerformanceFixture();
        await applyWorkoutDeepLink();
        if (!["today", "plan", "more", "progress-overview", "progress-lifts", "progress-history"].includes(window.location.hash.replace(/^#/, ""))) window.history.replaceState({ ...(window.history.state || {}), tab: activeTab }, "", tabUrl(activeTab));
        render();
        scheduleSave();
        registerPwaServiceWorker();
        fetchPushConfig();
        reconcileWorkoutSyncConsent();
        reconcilePushRevocation();
        flushWorkoutSyncQueue();
        flushPendingPushOperations();
        if (pushIdentity?.token && (pushIdentity.status === "deleting" || pushIdentity.deletion?.retryable === true) && navigator.onLine) deleteRemoteInstallationData({ automatic: true });
      }

      boot();

      function persistBeforeSuspend() {
        if (historyEditFlow) {
          cancelPendingDataSave();
          saveRuntime();
          return;
        }
        if (hasActiveWorkout()) persistActiveWorkoutDraft();
        else saveData();
        saveRuntime();
      }

      window.addEventListener("pagehide", persistBeforeSuspend);
      window.addEventListener("beforeunload", persistBeforeSuspend);
      window.addEventListener("popstate", () => {
        const nextTab = tabFromLocation();
        progressView = progressViewFromLocation();
        if (historyEditFlow && nextTab !== "today") {
          activeTab = "today";
          window.history.pushState({ ...(window.history.state || {}), tab: "today" }, "", tabUrl("today"));
          requestHistoryEditConfirmation("cancel", { preserveOrigin: true });
          return;
        }
        if (nextTab === activeTab) return;
        tabScrollPositions.set(activeTab, window.scrollY);
        activeTab = nextTab;
        queuePostRenderFocus({ kind: "main" });
        render();
        window.setTimeout(() => window.scrollTo({ top: tabScrollPositions.get(activeTab) || 0, behavior: "auto" }), 0);
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && hasActiveWorkout()) persistActiveWorkoutDraft();
        if (document.visibilityState === "visible") restCompletionController?.sync();
        if (!timer || timer.isPaused || !timer.isActive) return;
        if (document.visibilityState === "hidden") timer.backgroundedAt = Date.now();
        timer.remainingSeconds = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
        if (timer.remainingSeconds === 0) completeTimer();
        else if (document.visibilityState === "visible") {
          timer.backgroundedAt = 0;
          requestTimerWakeLock();
          render();
        }
      });
      window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPromptEvent = event; });
      window.addEventListener("online", () => {
        reconcileWorkoutSyncConsent();
        reconcilePushRevocation();
        flushWorkoutSyncQueue();
        flushPendingPushOperations();
        if (pushIdentity?.token && (pushIdentity.status === "deleting" || pushIdentity.deletion?.retryable === true)) deleteRemoteInstallationData({ automatic: true });
        if (timer?.isActive && !timer.isPaused && timer.endsAt > Date.now() && timer.notificationStatus !== "scheduled") scheduleRestPush({ ...timer });
      });
