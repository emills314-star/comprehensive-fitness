
      // WORKOUT_GRADING_ENGINE_START
      const ACTUAL_WORK_GRADE_VERSION = "comprehensive-fitness-workout-grade/2.0.0";
      const ACTUAL_WORK_GRADE_THRESHOLDS = Object.freeze([
        { minimum: 90, grade: "A" },
        { minimum: 80, grade: "B" },
        { minimum: 70, grade: "C" },
        { minimum: 60, grade: "D" },
        { minimum: 0, grade: "F" }
      ]);

      function workoutLetterGrade(score) {
        const value = Math.max(0, Math.min(100, Number(score || 0)));
        return ACTUAL_WORK_GRADE_THRESHOLDS.find((threshold) => value >= threshold.minimum)?.grade || "F";
      }

      function workoutGradeInterpretation(grade) {
        const band = String(grade || "").trim().charAt(0);
        return ({
          "A": "Strong, well-recorded work",
          "B": "Productive work with a small record gap",
          "C": "Useful work with incomplete evidence",
          "D": "Limited valid work was recorded",
          "F": "Not enough valid work was recorded"
        })[band] || "Workout reviewed";
      }

      function workoutGradeScoreTone(grade) {
        const band = String(grade || "").trim().charAt(0);
        if (band === "A") return "score-excellent";
        if (band === "B") return "score-very-good";
        if (band === "C") return "score-good";
        if (band === "D") return "score-mixed";
        return "score-critical";
      }

      function clampWorkoutMetric(value, minimum = 0, maximum = 1) {
        return Math.max(minimum, Math.min(maximum, Number(value || 0)));
      }

      function averageWorkoutMetric(values, fallback = 0) {
        const clean = values.filter((value) => Number.isFinite(Number(value))).map(Number);
        return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : fallback;
      }

      const CANONICAL_GRADE_ACTION_CONTRACT = "comprehensive-fitness-resolved-action/1.0.0";
      const CANONICAL_GRADE_ACTION_HANDLINGS = new Set(["accepted", "modified", "ignored", "overridden"]);
      const COHERENT_GRADE_ACTION_HANDLINGS = new Set(["accepted", "modified"]);

      function canonicalGradeActionsForSession(session) {
        const decisions = Array.isArray(session?.resolvedActions) ? session.resolvedActions : [];
        if (decisions[0]?.outcome === "no_action") return [];
        return decisions.filter((action) =>
          action?.contractVersion === CANONICAL_GRADE_ACTION_CONTRACT
          && action.outcome === "action"
          && typeof action.decisionId === "string"
          && action.decisionId
          && ["pain_or_illness", "deload", "readiness", "fatigue", "plateau"].includes(action.category)
          && ["session", "exercise"].includes(action.scope?.type)
        );
      }

      function canonicalGradeActionAppliesToExercise(action, exercise) {
        if (action?.scope?.type === "session") return true;
        if (action?.scope?.type !== "exercise") return false;
        const performanceExerciseId = exercise?.performanceExerciseId || canonicalExerciseId(exercise) || exercise?.id || "";
        return Boolean(performanceExerciseId && action.scope.exerciseVariantId === performanceExerciseId);
      }

      function canonicalGradeActionContext(session) {
        const actions = canonicalGradeActionsForSession(session);
        const handledActions = actions.filter((action) => CANONICAL_GRADE_ACTION_HANDLINGS.has(action.handling));
        const handlingCounts = handledActions.reduce((counts, action) => {
          counts[action.handling] = Number(counts[action.handling] || 0) + 1;
          return counts;
        }, {});
        return {
          actions,
          handledActions,
          decisionIds: actions.map((action) => action.decisionId),
          handlingCounts,
          incoherentCount: handledActions.filter((action) => !COHERENT_GRADE_ACTION_HANDLINGS.has(action.handling)).length,
          pendingCount: actions.length - handledActions.length
        };
      }

      function canonicalGradeActionForExercise(actionContext, exercise) {
        return actionContext.actions.find((action) =>
          action.scope?.type === "exercise"
          && canonicalGradeActionAppliesToExercise(action, exercise)
        ) || actionContext.actions.find((action) => action.scope?.type === "session") || null;
      }

      function workoutSetPerformanceValue(set, resistanceType) {
        const load = resistanceLoadInUnit(set, resistanceType);
        if (["external", "bodyweight_plus_load"].includes(resistanceType)) return load > 0 ? load * (1 + Number(set.reps || 0) / 30) : Number(set.reps || 0);
        if (resistanceType === "assisted_bodyweight") return 10000 - load * 10 + Number(set.reps || 0);
        if (resistanceType === "duration") return Number(set.durationSeconds || set.reps || 0);
        if (resistanceType === "distance") return Number(set.distance || set.reps || 0);
        return Number(set.reps || 0);
      }

      function bestWorkoutSet(sets, resistanceType) {
        return [...sets].sort((left, right) => workoutSetPerformanceValue(right, resistanceType) - workoutSetPerformanceValue(left, resistanceType) || Number(left.rpe || 99) - Number(right.rpe || 99))[0] || null;
      }

      function sessionComesBefore(candidate, session) {
        if (String(candidate.date || "") !== String(session.date || "")) return String(candidate.date || "") < String(session.date || "");
        const candidateStamp = String(candidate.submittedAt || candidate.updatedAt || candidate.createdAt || "");
        const sessionStamp = String(session.submittedAt || session.updatedAt || session.createdAt || "");
        return candidateStamp < sessionStamp;
      }

      function priorComparableWorkoutSets(session, exercise, resistanceType, referenceSet = null) {
        const priorSessions = new Map(activeHistorySessions({ throughDate: session.date }).filter((candidate) => candidate.id !== session.id && sessionComesBefore(candidate, session)).map((candidate) => [candidate.id, candidate]));
        const priorExerciseIds = new Set(data.exercises.filter((candidate) => priorSessions.has(candidate.sessionId) && !isDeloadExposure(priorSessions.get(candidate.sessionId), candidate, setsForExercise(candidate.id)) && samePerformanceExercise(candidate, exercise) && resistanceTypeFor(candidate) === resistanceType).map((candidate) => candidate.id));
        const comparableRole = referenceSet ? normalizeSetTypeCode(referenceSet.setType, referenceSet.isWarmup) : "";
        return data.sets.filter((set) =>
          priorExerciseIds.has(set.exerciseId)
          && set.completed
          && isWorkingSet(set, "progression")
          && !set.skipped
          && (!comparableRole || normalizeSetTypeCode(set.setType, set.isWarmup) === comparableRole)
        );
      }

      function compareWorkoutPerformance(currentSet, priorSet, resistanceType) {
        if (!currentSet) return { status: "incomplete", label: "No completed working set", change: "No completed working set was available for comparison." };
        if (!priorSet) return { status: "baseline", label: "Baseline established", change: "This is the first comparable submitted performance for this lift and resistance type." };
        const currentLoad = resistanceLoadInUnit(currentSet, resistanceType);
        const priorLoad = resistanceLoadInUnit(priorSet, resistanceType);
        const currentReps = Number(currentSet.reps || 0);
        const priorReps = Number(priorSet.reps || 0);
        const currentRpe = Number(currentSet.rpe || 0);
        const priorRpe = Number(priorSet.rpe || 0);
        const sameLoad = Math.abs(currentLoad - priorLoad) < 0.01;
        if (sameLoad && currentReps > priorReps) return { status: "progress", label: "Rep progression", change: "+" + (currentReps - priorReps) + " rep" + (currentReps - priorReps === 1 ? "" : "s") + " at the same resistance." };
        if (sameLoad && currentReps >= priorReps && currentRpe > 0 && priorRpe > 0 && currentRpe <= priorRpe - 0.5) return { status: "progress", label: "Improved efficiency", change: "Matched the prior load and reps at RPE " + currentRpe + " versus " + priorRpe + "." };
        if (resistanceType === "assisted_bodyweight" && currentLoad < priorLoad && currentReps >= priorReps) return { status: "progress", label: "Assistance progression", change: formatLoadNumber(priorLoad - currentLoad) + " " + data.settings.weightUnit + " less assistance while matching or exceeding the prior repetitions." };
        if (["external", "bodyweight_plus_load"].includes(resistanceType) && (currentReps > 12 || priorReps > 12)) {
          return { status: "baseline", label: "Different repetition demand", change: "The repetition demand was outside the supported estimated-performance range, so no derived comparison was applied." };
        }
        if (!["bodyweight", "duration", "distance", "assisted_bodyweight"].includes(resistanceType) && currentLoad > priorLoad && currentReps >= priorReps) return { status: "progress", label: "Load progression", change: "+" + formatLoadNumber(currentLoad - priorLoad) + " " + data.settings.weightUnit + " while matching or exceeding the prior repetitions." };
        const currentValue = workoutSetPerformanceValue(currentSet, resistanceType);
        const priorValue = workoutSetPerformanceValue(priorSet, resistanceType);
        const changeRatio = priorValue > 0 ? (currentValue - priorValue) / priorValue : 0;
        if (changeRatio > 0.015) return { status: "progress", label: "Performance progression", change: "Estimated performance improved " + Math.round(changeRatio * 100) + "% versus the prior comparable best set." };
        if (changeRatio < -0.06) return { status: "regression", label: "Performance regression", change: "Estimated performance declined " + Math.abs(Math.round(changeRatio * 100)) + "% versus the prior comparable best set." };
        return { status: "stable", label: "Performance maintained", change: "Performance remained within 6% of the prior comparable best set." };
      }

      function actualWorkSetWasAttempted(set) {
        // Pending sets carry factual prefills, so populated values alone are not
        // evidence that the user attempted them. Completion or an explicit edit is.
        return Boolean(set?.completed || set?.edited || set?.manualOverride);
      }

      function setIsActualWorkingObservation(set) {
        const semantics = setTypeSemantics(set);
        return !semantics.isWarmup && semantics.type !== "unknown";
      }

      function actualWorkSetIsValid(set, exercise) {
        if (!set?.completed || set.skipped || !setIsActualWorkingObservation(set)) return false;
        const resistanceType = resistanceTypeFor(exercise, set);
        const rpe = Number(set.rpe || 0);
        const validRpe = rpe === 0 || (rpe >= 1 && rpe <= 10 && Math.round(rpe * 2) === rpe * 2);
        if (!validRpe) return false;
        if (resistanceType === "duration") return Number(set.durationSeconds || 0) > 0;
        if (resistanceType === "distance") return Number(set.distance || 0) > 0;
        const load = resistanceLoadInUnit(set, resistanceType);
        return Number(set.reps || 0) > 0 && Number.isFinite(load) && load >= 0;
      }

      function actualWorkExerciseAnalysis(session, exercise, prs, actionContext) {
        const workingSets = setsForExercise(exercise.id).filter((set) => setIsActualWorkingObservation(set) && !set.skipped);
        const completedSets = workingSets.filter((set) => set.completed);
        const attemptedSets = workingSets.filter(actualWorkSetWasAttempted);
        const validSets = completedSets.filter((set) => actualWorkSetIsValid(set, exercise));
        const loggedRpeSets = validSets.filter((set) => Number(set.rpe || 0) > 0);
        const resistanceType = resistanceTypeFor(exercise, validSets[0] || completedSets[0]);
        const bestSet = bestWorkoutSet(validSets, resistanceType);
        const resolvedAction = canonicalGradeActionForExercise(actionContext, exercise);
        const actionWasCoherentlyHandled = COHERENT_GRADE_ACTION_HANDLINGS.has(resolvedAction?.handling);
        const deloadExposure = isDeloadExposure(session, exercise, setsForExercise(exercise.id));
        const adaptedWork = Boolean(deloadExposure || actionWasCoherentlyHandled);
        const priorBestSet = adaptedWork ? null : bestWorkoutSet(priorComparableWorkoutSets(session, exercise, resistanceType, bestSet), resistanceType);
        const comparison = adaptedWork && bestSet
          ? { status: "baseline", label: "Adapted work recorded", change: "This deload or adapted exercise is not compared with prior normal work." }
          : compareWorkoutPerformance(bestSet, priorBestSet, resistanceType);
        const performanceExerciseId = canonicalExerciseId(exercise);
        return {
          exerciseId: exercise.id,
          performanceExerciseId,
          name: exercise.name,
          resistanceType,
          completedSets: completedSets.length,
          attemptedSets: attemptedSets.length,
          validSets: validSets.length,
          rpeLoggedSets: loggedRpeSets.length,
          rpeCoherence: validSets.length ? loggedRpeSets.length / validSets.length : 0,
          comparison,
          comparisonGradeFactor: ({ progress: 1, stable: 0.9, baseline: 0.9, regression: 0.8, incomplete: 0.4 })[comparison.status] || 0.7,
          bestSet: bestSet ? { id: bestSet.id, text: formatSetPerformance(bestSet, exercise), reps: Number(bestSet.reps || 0), load: resistanceLoadInUnit(bestSet, resistanceType), rpe: Number(bestSet.rpe || 0) } : null,
          priorBestSet: priorBestSet ? { text: formatSetPerformance(priorBestSet, exercise), reps: Number(priorBestSet.reps || 0), load: resistanceLoadInUnit(priorBestSet, resistanceType), rpe: Number(priorBestSet.rpe || 0) } : null,
          prs: deloadExposure ? [] : prs.filter((pr) => (pr.performanceExerciseId || canonicalExerciseId(pr.exercise)) === performanceExerciseId),
          resolvedActionDecisionId: resolvedAction?.decisionId || "",
          resolvedActionHandling: resolvedAction?.handling || ""
        };
      }

      function actualWorkGradeReasons(results, metrics, actionContext) {
        const reasons = [
          {
            code: "actual_work",
            text: metrics.validCompletedSets + " valid working set" + (metrics.validCompletedSets === 1 ? "" : "s")
              + " recorded across " + metrics.exercisesWithValidWork + " exercise" + (metrics.exercisesWithValidWork === 1 ? "" : "s") + "."
          }
        ];
        reasons.push({
          code: "logging_validity",
          text: metrics.rpeLoggedSets === metrics.completedSets
            ? "Load, repetitions, and RPE are complete for every recorded working set."
            : metrics.rpeLoggedSets + " of " + metrics.completedSets + " completed working sets include RPE."
        });
        if (actionContext.actions.length) {
          reasons.push({
            code: "exception_handling",
            text: actionContext.pendingCount
              ? "A canonical exception remained unhandled at submission; actual work was still preserved."
              : actionContext.incoherentCount
                ? "A canonical exception was explicitly ignored or overridden; actual work was preserved and evaluated as recorded."
                : "The canonical exception was handled coherently; the grade did not compare actual work with the original plan."
          });
        } else {
          const progressed = results.filter((result) => result.comparison.status === "progress").length;
          const comparable = results.filter((result) => ["progress", "stable", "regression"].includes(result.comparison.status)).length;
          reasons.push({
            code: "comparable_performance",
            text: progressed
              ? progressed + " exercise" + (progressed === 1 ? "" : "s") + " improved versus comparable submitted work."
              : comparable
                ? "Comparable performance was recorded without requiring adherence to the original prescription."
                : "This workout establishes factual baseline performance for later comparison."
          });
        }
        return reasons.slice(0, 3);
      }

      function actualWorkHighlights(results) {
        const highlights = [];
        const highlightedExercises = new Set();
        results.forEach((result) => {
          const preferredPr = [...result.prs].sort((left, right) =>
            /estimated/i.test(right.type) - /estimated/i.test(left.type)
            || /load|assistance/i.test(right.type) - /load|assistance/i.test(left.type)
          )[0];
          if (!preferredPr || highlightedExercises.has(result.performanceExerciseId)) return;
          highlights.push({
            type: "pr",
            exerciseId: result.performanceExerciseId,
            resistanceType: result.resistanceType,
            title: result.name + " — " + preferredPr.type,
            detail: preferredPr.value + (result.priorBestSet ? ". Previous comparable best: " + result.priorBestSet.text + "." : ". First comparable submitted benchmark.")
          });
          highlightedExercises.add(result.performanceExerciseId);
        });
        results.forEach((result) => {
          if (highlights.length >= 3 || highlightedExercises.has(result.performanceExerciseId) || result.comparison.status !== "progress") return;
          highlights.push({
            type: "progress",
            exerciseId: result.performanceExerciseId,
            resistanceType: result.resistanceType,
            title: result.name + " — " + result.comparison.label,
            detail: (result.bestSet?.text || "Completed work") + ". " + result.comparison.change
          });
          highlightedExercises.add(result.performanceExerciseId);
        });
        return highlights.slice(0, 3);
      }

      function calculateWorkoutAnalysis(session, options = {}) {
        const prs = options.prs || session.prs || [];
        const actionContext = canonicalGradeActionContext(session);
        const exercises = data.exercises.filter((exercise) => exercise.sessionId === session.id).sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
        const results = exercises.map((exercise) => actualWorkExerciseAnalysis(session, exercise, prs, actionContext));
        const completedSets = results.reduce((sum, result) => sum + result.completedSets, 0);
        const attemptedSets = results.reduce((sum, result) => sum + result.attemptedSets, 0);
        const validCompletedSets = results.reduce((sum, result) => sum + result.validSets, 0);
        const rpeLoggedSets = results.reduce((sum, result) => sum + result.rpeLoggedSets, 0);
        const validRatio = completedSets ? validCompletedSets / completedSets : 0;
        const rpeLoggedRatio = completedSets ? rpeLoggedSets / completedSets : 0;
        const attemptedCompletionRatio = attemptedSets ? completedSets / attemptedSets : 0;
        const effortCoherence = validCompletedSets ? rpeLoggedSets / validCompletedSets : 0;
        const comparisonFactor = averageWorkoutMetric(results.filter((result) => result.validSets).map((result) => result.comparisonGradeFactor), 0.7);
        const exceptionHandlingFactor = actionContext.actions.length
          ? actionContext.pendingCount
            ? 0.6
            : actionContext.incoherentCount
              ? 0.8
              : 1
          : 1;
        const meaningfulWorkFactor = validCompletedSets ? 0.7 + 0.3 * attemptedCompletionRatio : 0;
        const gradeScore = Math.round(
          30 * clampWorkoutMetric(validRatio * 0.65 + rpeLoggedRatio * 0.35)
          + 25 * clampWorkoutMetric(meaningfulWorkFactor)
          + 20 * clampWorkoutMetric(effortCoherence)
          + 20 * clampWorkoutMetric(comparisonFactor)
          + 5 * clampWorkoutMetric(exceptionHandlingFactor)
        );
        const grade = workoutLetterGrade(gradeScore);
        const metrics = {
          attemptedSets,
          completedSets,
          validCompletedSets,
          rpeLoggedSets,
          exercisesWithValidWork: results.filter((result) => result.validSets > 0).length,
          progressedExercises: results.filter((result) => result.comparison.status === "progress").length
        };
        return {
          contractVersion: ACTUAL_WORK_GRADE_VERSION,
          algorithmVersion: "actual-work-rubric/1.1.0",
          letter: grade,
          reasons: actualWorkGradeReasons(results, metrics, actionContext),
          sourceSessionId: session.id,
          resolvedActionDecisionIds: actionContext.decisionIds,
          createdAt: isoNow()
        };
      }

      function storedWorkoutGradeProjection(session) {
        const stored = session?.workoutAnalysis;
        if (stored?.contractVersion === ACTUAL_WORK_GRADE_VERSION && ["A", "B", "C", "D", "F"].includes(stored.letter) && Array.isArray(stored.reasons)) {
          return {
            grade: stored.letter,
            gradeVersion: stored.algorithmVersion,
            gradeReasons: stored.reasons.map((reason) => String(reason?.text || "")).filter(Boolean).slice(0, 3),
            currentContract: true
          };
        }
        if (stored && typeof stored.grade === "string") {
          const legacyReason = String(stored.rationale || stored.interpretation || "").trim();
          return {
            grade: stored.grade,
            gradeVersion: String(stored.algorithmVersion || stored.version || "historical-grade/unknown"),
            gradeReasons: [legacyReason || "Stored historical grade preserved from the submitted workout."],
            currentContract: false
          };
        }
        if (typeof session?.grade === "string") {
          return {
            grade: session.grade,
            gradeVersion: String(session.gradeVersion || "historical-grade/unknown"),
            gradeReasons: ["Stored historical grade preserved from the submitted workout."],
            currentContract: false
          };
        }
        return null;
      }

      function workoutAnalysisForSession(session) {
        const stored = storedWorkoutGradeProjection(session);
        if (stored || isSessionSubmitted(session)) return stored;
        const prospective = calculateWorkoutAnalysis(session, { prs: session?.prs || [] });
        return {
          grade: prospective.letter,
          gradeVersion: prospective.algorithmVersion,
          gradeReasons: prospective.reasons.map((reason) => reason.text),
          currentContract: true
        };
      }

      // Preserve submitted PRs as facts, but do not present a PR whose exposure
      // has since been marked as a deload. Older PRs may lack sourceSetId.
      function visibleStoredSessionPrs(session) {
        const prs = Array.isArray(session?.prs) ? session.prs : [];
        if (isDeloadExposure(session, null, [])) return [];
        const exercises = data.exercises.filter((exercise) => exercise.sessionId === session.id);
        return prs.filter((pr) => {
          const source = pr.sourceSetId ? data.sets.find((set) => set.id === pr.sourceSetId) : null;
          const sourceExercise = source ? exercises.find((exercise) => exercise.id === source.exerciseId) : null;
          const matches = sourceExercise ? [sourceExercise] : exercises.filter((exercise) =>
            pr.performanceExerciseId ? canonicalExerciseId(exercise) === pr.performanceExerciseId : exercise.name === pr.exercise
          );
          return !matches.some((exercise) => isDeloadExposure(session, exercise, setsForExercise(exercise.id)));
        });
      }

      function workoutCompletionHighlights(session) {
        const prs = visibleStoredSessionPrs(session);
        const actionContext = canonicalGradeActionContext(session);
        const results = data.exercises
          .filter((exercise) => exercise.sessionId === session.id)
          .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
          .map((exercise) => actualWorkExerciseAnalysis(session, exercise, prs, actionContext));
        return actualWorkHighlights(results);
      }
      // WORKOUT_GRADING_ENGINE_END

      async function sendRestTimerNotification(notice, setId, exerciseId) {
        if (!data.settings.timerNotifications || !("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
        try {
          const registration = await navigator.serviceWorker.ready;
          const payload = notice.payload || restNavigationState || {};
          const url = restCompletionUrl(payload);
          await registration.showNotification("Rest complete", {
            body: data.settings.notificationMessageDetail === "private" ? "Your next set is ready." : notice.exerciseName + (notice.setLabel ? " - " + notice.setLabel : notice.setNumber ? " - Set " + notice.setNumber : "") + " is ready.",
            tag: "comprehensive-fitness-rest-timer",
            renotify: true,
            requireInteraction: true,
            icon: "/resources/icon-192.png",
            badge: "/resources/icon-192.png",
            data: { ...payload, url },
            vibrate: data.settings.timerVibration ? [250, 120, 250, 120, 450] : []
          });
        } catch {
          notificationMessage = "The in-app timer alert fired, but the operating system notification could not be delivered.";
        }
      }

      async function requestTimerWakeLock() {
        if (!navigator.wakeLock?.request || document.visibilityState !== "visible") return;
        try {
          if (!timerWakeLock || timerWakeLock.released) timerWakeLock = await navigator.wakeLock.request("screen");
        } catch {
          timerWakeLock = null;
        }
      }

      function releaseTimerWakeLock() {
        if (!timerWakeLock) return;
        timerWakeLock.release().catch(() => undefined);
        timerWakeLock = null;
      }

      function formatTimer(seconds) {
        const minutes = Math.floor(seconds / 60);
        return minutes + ":" + String(seconds % 60).padStart(2, "0");
      }

      function formatOvertime(seconds) {
        const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
        const minutes = Math.floor(safeSeconds / 60);
        return String(minutes).padStart(2, "0") + ":" + String(safeSeconds % 60).padStart(2, "0");
      }

      function submitWorkoutPrs(session) {
        const sessionExercises = data.exercises.filter((exercise) => exercise.sessionId === session.id);
        const priorSessions = new Map(data.sessions.filter((item) => item.id !== session.id && isSessionSubmitted(item) && sessionComesBefore(item, session)).map((item) => [item.id, item]));
        const priorExercises = new Map(data.exercises.filter((item) => priorSessions.has(item.sessionId) && !isDeloadExposure(priorSessions.get(item.sessionId), item, setsForExercise(item.id))).map((item) => [item.id, item]));
        const prs = [];
        sessionExercises.forEach((exercise) => {
          if (isDeloadExposure(session, exercise, setsForExercise(exercise.id))) return;
          const prStart = prs.length;
          const performanceExerciseId = canonicalExerciseId(exercise);
          const resistanceType = resistanceTypeFor(exercise);
          const currentSets = setsForExercise(exercise.id).filter((set) => set.completed && !set.skipped && isWorkingSet(set, "pr") && actualWorkSetIsValid(set, exercise));
          if (!currentSets.length) return;
          const priorSets = data.sets.filter((set) => {
            const priorExercise = priorExercises.get(set.exerciseId);
            return set.completed && !set.skipped && isWorkingSet(set, "pr") && priorExercise && actualWorkSetIsValid(set, priorExercise) && samePerformanceExercise(priorExercise, exercise) && resistanceTypeFor(priorExercise, set) === resistanceType;
          });
          const roleFor = (set) => normalizeSetTypeCode(set.setType, set.isWarmup);
          const priorForRole = (set) => priorSets.filter((prior) => roleFor(prior) === roleFor(set));
          if (["external", "bodyweight_plus_load"].includes(resistanceType)) {
            const maxWeight = Math.max(...currentSets.map((set) => resistanceLoadInUnit(set, resistanceType)));
            const maxWeightSet = currentSets.find((set) => resistanceLoadInUnit(set, resistanceType) === maxWeight);
            const comparableWeightSets = priorForRole(maxWeightSet);
            const previousMaxWeight = Math.max(0, ...comparableWeightSets.map((set) => resistanceLoadInUnit(set, resistanceType)));
            if (comparableWeightSets.length && maxWeight > previousMaxWeight && maxWeight > 0) prs.push({ exercise: exercise.name, type: resistanceType === "bodyweight_plus_load" ? "Heaviest added load" : "Heaviest load", value: formatResistance({ ...maxWeightSet, resistanceType }, exercise), setRole: roleFor(maxWeightSet), sourceSetId: maxWeightSet.id });
            currentSets.forEach((set) => {
              const load = resistanceLoadInUnit(set, resistanceType);
              const comparableLoadSets = priorForRole(set).filter((prior) => resistanceLoadInUnit(prior, resistanceType) === load);
              const previousRepsAtLoad = Math.max(0, ...comparableLoadSets.map((prior) => prior.reps));
              if (comparableLoadSets.length && load > 0 && set.reps > previousRepsAtLoad) prs.push({ exercise: exercise.name, type: resistanceType === "bodyweight_plus_load" ? "Most reps at added load" : "Most reps at load", value: formatSetPerformance(set, exercise), setRole: roleFor(set), sourceSetId: set.id });
            });
          } else if (resistanceType === "assisted_bodyweight") {
            const currentSet = [...currentSets].sort((left, right) => resistanceLoadInUnit(left, resistanceType) - resistanceLoadInUnit(right, resistanceType))[0];
            const currentAssistance = resistanceLoadInUnit(currentSet, resistanceType);
            const comparableAssistanceSets = priorForRole(currentSet).filter((set) => resistanceLoadInUnit(set, resistanceType) > 0);
            const previousAssistance = Math.min(...comparableAssistanceSets.map((set) => resistanceLoadInUnit(set, resistanceType)));
            if (comparableAssistanceSets.length && Number.isFinite(currentAssistance) && currentAssistance < previousAssistance) prs.push({ exercise: exercise.name, type: "Least assistance", value: "BW - " + currentAssistance + " " + data.settings.weightUnit + " assistance", setRole: roleFor(currentSet), sourceSetId: currentSet.id });
          } else {
            const metric = (set) => resistanceType === "duration" ? Number(set.durationSeconds || 0) : resistanceType === "distance" ? Number(set.distance || 0) : Number(set.reps || 0);
            const currentBest = Math.max(...currentSets.map(metric));
            const currentSet = currentSets.find((set) => metric(set) === currentBest);
            const comparableBestSets = priorForRole(currentSet);
            const previousBest = Math.max(0, ...comparableBestSets.map(metric));
            if (comparableBestSets.length && currentBest > previousBest) prs.push({ exercise: exercise.name, type: resistanceType === "duration" ? "Longest duration" : resistanceType === "distance" ? "Longest distance" : "Most reps", value: formatResistance(currentSet, exercise), setRole: roleFor(currentSet), sourceSetId: currentSet.id });
          }
          if (resistanceType === "external") {
            const currentE1rm = Math.max(...currentSets.map(estimatedOneRepMax));
            const currentSet = currentSets.find((set) => estimatedOneRepMax(set) === currentE1rm);
            const comparableE1rmSets = priorForRole(currentSet);
            const previousE1rm = Math.max(0, ...comparableE1rmSets.map(estimatedOneRepMax));
            if (comparableE1rmSets.length && currentE1rm > previousE1rm && currentE1rm > 0) prs.push({ exercise: exercise.name, type: "Best estimated performance", value: currentE1rm.toFixed(1) + " e1RM", setRole: roleFor(currentSet), sourceSetId: currentSet.id });
          }
          for (let index = prStart; index < prs.length; index += 1) prs[index].performanceExerciseId = performanceExerciseId;
        });
        return prs.filter((pr, index, all) => all.findIndex((other) => other.performanceExerciseId === pr.performanceExerciseId && other.type === pr.type) === index);
      }

      function workoutSubmissionIsAccepted(sessionId) {
        const session = data.sessions.find((item) => item.id === sessionId);
        return Boolean(session && !session.submitted && !workoutSubmissionsInProgress.has(sessionId));
      }

      function submitWorkout(sessionId) {
        if (!workoutSubmissionIsAccepted(sessionId)) return;
        const sourceSession = data.sessions.find((item) => item.id === sessionId);
        const session = finalizeWorkoutDurationSession(startWorkoutDuration(sourceSession));
        workoutSubmissionsInProgress.add(sessionId);
        try {
          if (timer) cancelTimer("workout-ended", false);
          timerCompleteNotice = null;
          if (restNavigationState?.workoutId === sessionId) restNavigationState = { ...restNavigationState, status: "submitted", updatedAt: isoNow() };
          const prs = submitWorkoutPrs(session);
          const submittedAt = isoNow();
          const completedSession = { ...session, submitted: true, workoutStarted: false, workoutState: "completed", completedAt: session.date, submittedAt, prs, updatedAt: submittedAt };
          const workoutAnalysis = calculateWorkoutAnalysis(completedSession, { prs });
          pendingSubmitSessionId = "";
          completedSummarySessionId = session.id;
          if (activeWorkoutId === session.id) {
            activeWorkoutId = "";
            clearActiveWorkoutDraft();
          }
          commit({ ...data, sessions: data.sessions.map((item) => item.id === session.id ? { ...completedSession, workoutAnalysis } : item) });
        } finally {
          workoutSubmissionsInProgress.delete(sessionId);
        }
      }

      function renderSubmitConfirmation(session) {
        const completed = data.sets.filter((set) => {
          const exercise = data.exercises.find((item) => item.id === set.exerciseId);
          return exercise?.sessionId === session.id && set.completed && !set.skipped && setIsActualWorkingObservation(set);
        }).length;
        return '<section class="submit-confirmation"><strong>Log this workout as completed?</strong><span>' + completed + ' completed working sets will update history, the performance chart, and PRs.</span><div class="row"><button class="primary-action" type="button" data-action="confirm-submit-workout">Log workout</button><button type="button" data-action="cancel-submit-workout">Keep editing</button></div></section>';
      }

      function renderCompletedWorkoutSummary(session, options = {}) {
        const analysis = workoutAnalysisForSession(session);
        if (!analysis) {
          return '<section class="completed-summary score-critical" aria-label="Saved workout without a stored grade"><div class="section-kicker">Saved workout</div><h2>Grade unavailable</h2><p class="summary-muted">This historical workout has no stored grade. It was not silently graded by a newer algorithm.</p></section>';
        }
        const tone = workoutGradeScoreTone(analysis.grade);
        const currentHighlights = analysis.currentContract
          ? workoutCompletionHighlights(session)
          : visibleStoredSessionPrs(session).slice(0, 3).map((pr) => ({
              type: "pr",
              exerciseId: pr.performanceExerciseId || "",
              resistanceType: pr.resistanceType || "",
              title: pr.exercise + " — " + pr.type,
              detail: pr.value
            }));
        const highlights = currentHighlights.slice(0, 3);
        const highlightSection = highlights.length
          ? '<section class="workout-summary-section completion-highlights" aria-labelledby="completion-highlights-title"><h3 id="completion-highlights-title">Progress highlights</h3><div class="workout-highlight-list">' + highlights.map((item) => '<article class="workout-highlight"><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.detail) + '</span></article>').join('') + '</div></section>'
          : '';
        const reasons = [...analysis.gradeReasons].filter(Boolean);
        if (!analysis.currentContract && reasons.length < 2) reasons.push("Stored as " + analysis.gradeVersion + "; newer grade rules were not applied.");
        const preferredHighlight = highlights.find((item) => item.exerciseId) || null;
        const highlightedExercise = preferredHighlight ? data.exercises.find((exercise) =>
          exercise.sessionId === session.id
          && canonicalExerciseId(exercise) === preferredHighlight.exerciseId
          && (!preferredHighlight.resistanceType || resistanceTypeFor(exercise) === preferredHighlight.resistanceType)
        ) : null;
        const progressExercise = highlightedExercise || data.exercises.find((exercise) =>
          exercise.sessionId === session.id
          && setsForExercise(exercise.id).some((set) => set.completed && !set.skipped && setIsActualWorkingObservation(set))
        ) || null;
        const progressExerciseId = progressExercise ? canonicalExerciseId(progressExercise) : preferredHighlight?.exerciseId || "";
        const progressResistanceType = progressExercise ? resistanceTypeFor(progressExercise) : preferredHighlight?.resistanceType || "";
        const facts = sessionWorkoutFacts(session);
        const gradeHeadingTag = options.history ? "h2" : "h1";
        const actions = options.history
          ? ''
          : '<div class="completion-actions"><button class="primary-action" type="button" data-action="close-completed-summary">Done</button><button type="button" data-action="open-completion-progress" data-exercise-id="' + escapeHtml(progressExerciseId) + '" data-resistance-type="' + escapeHtml(progressResistanceType) + '">Progress</button></div>';
        return '<section class="completed-summary concise-completion ' + tone + '" aria-label="Workout completion">'
          + (options.history ? '' : '<div class="summary-toolbar"><span class="section-kicker">Session logged</span>' + actions + '</div>')
          + (options.history ? '' : renderResolvedAction(resolvedActionForScope(session, "session"), { session }))
          + '<div class="workout-grade-hero"><div class="workout-grade-copy"><div class="section-kicker">' + escapeHtml(session.title || (options.history ? 'Saved workout' : 'Workout logged')) + (facts.durationMinutes ? ' · ' + facts.durationMinutes + ' min' : '') + '</div><' + gradeHeadingTag + '>' + escapeHtml(workoutGradeInterpretation(analysis.grade)) + '</' + gradeHeadingTag + '><span class="workout-grade-version">Grade version ' + escapeHtml(analysis.gradeVersion) + '</span></div><div class="workout-grade-mark" role="img" aria-label="Workout grade ' + escapeHtml(analysis.grade) + '">' + escapeHtml(analysis.grade) + '</div></div>'
          + '<section class="workout-summary-section grade-reasons" aria-labelledby="grade-reasons-title"><h3 id="grade-reasons-title">Why this grade</h3><ul>' + reasons.slice(0, 3).map((reason) => '<li>' + escapeHtml(reason) + '</li>').join('') + '</ul></section>'
          + highlightSection
          + '</section>';
      }
