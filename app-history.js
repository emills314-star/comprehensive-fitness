
      function workoutLetterGrade(score) {
        const value = Math.max(0, Math.min(100, Number(score || 0)));
        return WORKOUT_GRADE_THRESHOLDS.find((threshold) => value >= threshold.minimum)?.grade || "F";
      }

      function workoutGradeInterpretation(grade) {
        return ({
          "A+": "Exceptional session",
          "A": "Excellent session",
          "A-": "Very strong session",
          "B+": "Strong session",
          "B": "Good session",
          "B-": "Solid session with some improvement available",
          "C+": "Mixed but productive session",
          "C": "Acceptable session with clear limitations",
          "C-": "Below-plan execution",
          "D": "Poor session execution",
          "F": "Session failed to meet the minimum intended outcome"
        })[grade] || "Workout reviewed";
      }

      function workoutGradeScoreTone(score) {
        if (score >= 90) return "score-excellent";
        if (score >= 80) return "score-very-good";
        if (score >= 70) return "score-good";
        if (score >= 60) return "score-mixed";
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

      function canonicalGradeActionsForSession(session) {
        return (Array.isArray(session?.resolvedActions) ? session.resolvedActions : []).filter((action) =>
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
          pendingCount: actions.length - handledActions.length
        };
      }

      function canonicalGradeActionForExercise(actionContext, exercise) {
        return actionContext.actions.find((action) => canonicalGradeActionAppliesToExercise(action, exercise)) || null;
      }

      function canonicalGradeActionReason(actionContext) {
        if (!actionContext.actions.length) return "No canonical exception action was active for this workout.";
        const handlings = Object.entries(actionContext.handlingCounts).map(([handling, count]) => count + " " + handling).join(", ");
        if (actionContext.pendingCount) {
          return (handlings ? handlings + "; " : "") + actionContext.pendingCount + " canonical exception action" + (actionContext.pendingCount === 1 ? " remained" : "s remained") + " pending. Detector output was not graded directly.";
        }
        return "Canonical exception handling was recorded explicitly (" + handlings + "); actual work was graded independently of the initial plan.";
      }

      function workoutSetPerformanceValue(set, resistanceType) {
        const load = resistanceLoad(set, resistanceType);
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

      function priorComparableWorkoutSets(session, exercise, resistanceType) {
        const canonicalId = canonicalExerciseId(exercise.name);
        const priorSessionIds = new Set(activeHistorySessions({ throughDate: session.date }).filter((candidate) => candidate.id !== session.id && sessionComesBefore(candidate, session)).map((candidate) => candidate.id));
        const priorExerciseIds = new Set(data.exercises.filter((candidate) => priorSessionIds.has(candidate.sessionId) && !candidate.isDeload && canonicalExerciseId(candidate.name) === canonicalId && resistanceTypeFor(candidate) === resistanceType).map((candidate) => candidate.id));
        return data.sets.filter((set) => priorExerciseIds.has(set.exerciseId) && set.completed && isWorkingSet(set, "progression") && !set.skipped);
      }

      function compareWorkoutPerformance(currentSet, priorSet, resistanceType, repLow) {
        if (!currentSet) return { status: "incomplete", label: "No completed working set", change: "No completed working set was available for comparison." };
        if (!priorSet) return { status: "baseline", label: "Baseline established", change: "This is the first comparable submitted performance for this lift and resistance type." };
        const currentLoad = resistanceLoad(currentSet, resistanceType);
        const priorLoad = resistanceLoad(priorSet, resistanceType);
        const currentReps = Number(currentSet.reps || 0);
        const priorReps = Number(priorSet.reps || 0);
        const currentRpe = Number(currentSet.rpe || 0);
        const priorRpe = Number(priorSet.rpe || 0);
        const sameLoad = Math.abs(currentLoad - priorLoad) < 0.01;
        if (sameLoad && currentReps > priorReps) return { status: "progress", label: "Rep progression", change: "+" + (currentReps - priorReps) + " rep" + (currentReps - priorReps === 1 ? "" : "s") + " at the same resistance." };
        if (sameLoad && currentReps >= priorReps && currentRpe > 0 && priorRpe > 0 && currentRpe <= priorRpe - 0.5) return { status: "progress", label: "Improved efficiency", change: "Matched the prior load and reps at RPE " + currentRpe + " versus " + priorRpe + "." };
        if (resistanceType === "assisted_bodyweight" && currentLoad < priorLoad && currentReps >= repLow) return { status: "progress", label: "Assistance progression", change: formatLoadNumber(priorLoad - currentLoad) + " " + data.settings.weightUnit + " less assistance while staying in range." };
        if (!["bodyweight", "duration", "distance", "assisted_bodyweight"].includes(resistanceType) && currentLoad > priorLoad && currentReps >= repLow) return { status: "progress", label: "Load progression", change: "+" + formatLoadNumber(currentLoad - priorLoad) + " " + data.settings.weightUnit + " while remaining in the programmed rep range." };
        const currentValue = workoutSetPerformanceValue(currentSet, resistanceType);
        const priorValue = workoutSetPerformanceValue(priorSet, resistanceType);
        const changeRatio = priorValue > 0 ? (currentValue - priorValue) / priorValue : 0;
        if (changeRatio > 0.015) return { status: "progress", label: "Performance progression", change: "Estimated performance improved " + Math.round(changeRatio * 100) + "% versus the prior comparable best set." };
        if (changeRatio < -0.06) return { status: "regression", label: "Performance regression", change: "Estimated performance declined " + Math.abs(Math.round(changeRatio * 100)) + "% versus the prior comparable best set." };
        return { status: "stable", label: "Performance maintained", change: "Performance remained within 6% of the prior comparable best set." };
      }

      function workoutExerciseAnalysis(session, exercise, prs, actionContext) {
        const allWorkingSets = setsForExercise(exercise.id).filter((set) => isWorkingSet(set, "score"));
        const completedSets = allWorkingSets.filter((set) => set.completed && !set.skipped);
        const resistanceType = resistanceTypeFor(exercise, completedSets[0]);
        const prescription = exercise.prescription || {};
        const profile = progressionProfileForExercise(exercise.name);
        const resolvedAction = canonicalGradeActionForExercise(actionContext, exercise);
        const actionWasHandled = CANONICAL_GRADE_ACTION_HANDLINGS.has(resolvedAction?.handling);
        const repLow = Number(prescription.repLow || profile.lowerRep || 1);
        const repHigh = Number(prescription.repHigh || profile.upperRep || Math.max(repLow, 20));
        const plannedSets = allWorkingSets.length;
        const setRepBounds = (set) => {
          const low = Number(set.targetRepMin || 0);
          const high = Number(set.targetRepMax || 0);
          return low > 0 && high > 0 && high >= low ? { low, high } : { low: repLow, high: repHigh };
        };
        const rangeMatches = completedSets.filter((set) => set.deviationIntent === "one_off" || (Number(set.reps || 0) >= setRepBounds(set).low && Number(set.reps || 0) <= setRepBounds(set).high)).length;
        const targetRepSets = completedSets.filter((set) => Number(set.targetReps || 0) > 0);
        const targetRepMatches = targetRepSets.filter((set) => set.deviationIntent === "one_off" || (Number(set.reps || 0) >= Number(set.targetReps || 0) - 1 && Number(set.reps || 0) <= setRepBounds(set).high) || actionWasHandled).length;
        const loadTargetSets = completedSets.filter((set) => Number(set.targetWeight ?? 0) > 0 || resistanceType === "bodyweight");
        const loadMatches = loadTargetSets.filter((set) => {
          if (set.deviationIntent === "one_off" || resistanceType === "bodyweight" || actionWasHandled) return true;
          const actual = resistanceLoad(set, resistanceType);
          const target = Number(set.targetWeight ?? prescription.weight ?? 0);
          const tolerance = Math.max(Number(prescription.increment || profile.increment || 0), target * 0.1);
          return target <= 0 || Math.abs(actual - target) <= tolerance;
        }).length;
        const loggedRpeSets = completedSets.filter((set) => Number(set.rpe || 0) > 0);
        const rpeMatches = loggedRpeSets.filter((set) => {
          const target = Number(set.targetRpe || prescription.rpe || 0);
          return set.deviationIntent === "one_off" || target <= 0 || Math.abs(Number(set.rpe || 0) - target) <= 1 || actionWasHandled;
        }).length;
        const firstSet = completedSets[0] || null;
        const lastSet = completedSets[completedSets.length - 1] || null;
        const comparableSetLoads = firstSet && lastSet ? Math.abs(resistanceLoad(firstSet, resistanceType) - resistanceLoad(lastSet, resistanceType)) <= Math.max(0.01, resistanceLoad(firstSet, resistanceType) * 0.03) : false;
        const repDropRatio = comparableSetLoads && Number(firstSet.reps || 0) > 0 ? Math.max(0, (Number(firstSet.reps) - Number(lastSet.reps || 0)) / Number(firstSet.reps)) : 0;
        const rpeRise = firstSet && lastSet && Number(firstSet.rpe || 0) > 0 && Number(lastSet.rpe || 0) > 0 ? Number(lastSet.rpe) - Number(firstSet.rpe) : 0;
        const bestSet = bestWorkoutSet(completedSets, resistanceType);
        const priorBestSet = bestWorkoutSet(priorComparableWorkoutSets(session, exercise, resistanceType), resistanceType);
        const comparison = compareWorkoutPerformance(bestSet, priorBestSet, resistanceType, repLow);
        const planRatios = [
          completedSets.length ? rangeMatches / completedSets.length : 0,
          targetRepSets.length ? targetRepMatches / targetRepSets.length : 0.9,
          loadTargetSets.length ? loadMatches / loadTargetSets.length : 0.9
        ];
        const planExecutionRatio = actionWasHandled ? 1 : averageWorkoutMetric(planRatios, 0);
        const isReadinessAdjusted = resolvedAction?.category === "readiness";
        const isDeload = resolvedAction?.category === "deload";
        const intentional = isReadinessAdjusted || isDeload || ["light", "technique", "return", "return-from-deload"].includes(prescription.mode);
        const statusRatio = actionWasHandled ? 0.9 : intentional && planExecutionRatio >= 0.8 ? 0.95 : ({ progress: 1, stable: 0.9, baseline: 0.82, regression: 0.55, incomplete: 0.25 })[comparison.status] || 0.7;
        const exercisePrs = prs.filter((pr) => canonicalExerciseId(pr.exercise) === canonicalExerciseId(exercise.name));
        const averageRpe = averageWorkoutMetric(loggedRpeSets.map((set) => Number(set.rpe)), 0);
        const targetRpe = averageWorkoutMetric(completedSets.map((set) => Number(set.targetRpe || prescription.rpe || 0)).filter(Boolean), Number(prescription.rpe || 0));
        const fatigueWarning = repDropRatio > 0.3 && rpeRise >= 1
          ? "Reps fell " + Math.round(repDropRatio * 100) + "% while RPE rose " + formatLoadNumber(rpeRise) + " points across comparable working sets."
          : "";
        return {
          exerciseId: exercise.id,
          name: exercise.name,
          resistanceType,
          isDeload,
          isReadinessAdjusted,
          resolvedActionDecisionId: resolvedAction?.decisionId || "",
          resolvedActionHandling: resolvedAction?.handling || "",
          intent: isDeload ? "Planned deload" : isReadinessAdjusted ? "Readiness-adjusted target" : prescription.mode ? prescription.mode.replaceAll("-", " ") : "Programmed work",
          plannedSets,
          gradePlannedSets: actionWasHandled ? completedSets.length : plannedSets,
          completedSets: completedSets.length,
          skippedSets: allWorkingSets.filter((set) => set.skipped).length,
          oneOffCount: completedSets.filter((set) => set.deviationIntent === "one_off").length,
          repLow,
          repHigh,
          rangeCompliance: completedSets.length ? rangeMatches / completedSets.length : 0,
          targetRepCompliance: targetRepSets.length ? targetRepMatches / targetRepSets.length : 0.9,
          loadCompliance: loadTargetSets.length ? loadMatches / loadTargetSets.length : 0.9,
          rpeLoggedRatio: completedSets.length ? loggedRpeSets.length / completedSets.length : 0,
          rpeCompliance: loggedRpeSets.length ? rpeMatches / loggedRpeSets.length : 0,
          averageRpe,
          targetRpe,
          repDropRatio,
          rpeRise,
          fatigueWarning,
          planExecutionRatio,
          progressionRatio: statusRatio,
          comparison,
          bestSet: bestSet ? { id: bestSet.id, text: formatSetPerformance(bestSet, exercise), reps: Number(bestSet.reps || 0), load: resistanceLoad(bestSet, resistanceType), rpe: Number(bestSet.rpe || 0) } : null,
          priorBestSet: priorBestSet ? { text: formatSetPerformance(priorBestSet, exercise), reps: Number(priorBestSet.reps || 0), load: resistanceLoad(priorBestSet, resistanceType), rpe: Number(priorBestSet.rpe || 0) } : null,
          prs: exercisePrs,
          readinessAdjustment: isReadinessAdjusted ? { decisionId: resolvedAction.decisionId, handling: resolvedAction.handling || "pending" } : null
        };
      }

      function workoutSessionIntent(session, exerciseResults) {
        if (exerciseResults.length && exerciseResults.every((result) => result.isDeload)) return "Planned deload";
        if (exerciseResults.some((result) => result.isReadinessAdjusted)) return "Readiness-adjusted training";
        const template = data.templates.find((item) => item.id === session.templateId) || { name: session.title || "" };
        const type = sessionTypeForTemplate(template);
        return ({ heavy: "Heavy training", light: "Light training", technique: "Technique-focused training", deload: "Planned deload", normal: "Standard training" })[type] || "Standard training";
      }

      function scoreWorkoutGradeMetrics(metrics) {
        const {
          results, progressionRatio, programRatio, completedSets, plannedSets, loggedRpeCount,
          rpeComplianceWeighted, rpeLoggedRatio, completionRatio, stabilityRatio, actionContext
        } = metrics;
        const progressedCount = results.filter((result) => result.comparison.status === "progress").length;
        const regressedCount = results.filter((result) => result.comparison.status === "regression").length;
        const oneOffCount = results.reduce((sum, result) => sum + Number(result.oneOffCount || 0), 0);
        const oneOffReason = oneOffCount ? "; " + oneOffCount + " set" + (oneOffCount === 1 ? " was" : "s were") + " logged as a deliberate one-off and not scored against the original load, rep, or RPE target" : "";
        const categoryScores = [
          { key: "progression", label: "Progression quality", earned: Math.round(30 * clampWorkoutMetric(progressionRatio)), possible: 30, reason: progressedCount + " exercise" + (progressedCount === 1 ? "" : "s") + " progressed; " + regressedCount + " regressed versus prior comparable work." },
          { key: "execution", label: "Program execution", earned: Math.round(25 * clampWorkoutMetric(programRatio)), possible: 25, reason: Math.round(averageWorkoutMetric(results.map((result) => result.rangeCompliance), 0) * 100) + "% of completed working sets stayed inside their programmed rep ranges; prescribed load and rep targets were assessed separately" + oneOffReason + "." },
          { key: "rpe", label: "RPE management", earned: Math.round(20 * clampWorkoutMetric(rpeComplianceWeighted * rpeLoggedRatio + 0.65 * (1 - rpeLoggedRatio))), possible: 20, reason: loggedRpeCount + " of " + completedSets + " completed working sets included RPE; " + Math.round(rpeComplianceWeighted * 100) + "% of logged RPE values were within one point of target." },
          { key: "completion", label: "Set completion and consistency", earned: Math.round(15 * clampWorkoutMetric(completionRatio * 0.8 + stabilityRatio * 0.2)), possible: 15, reason: completedSets + " of " + plannedSets + " prescribed working sets were completed; set-to-set stability contributed only within this category." },
          { key: "fatigue", label: "Exception handling", earned: 10, possible: 10, reason: canonicalGradeActionReason(actionContext || { actions: [], handlingCounts: {}, pendingCount: 0 }) }
        ];
        const internalScore = Math.max(0, Math.min(100, categoryScores.reduce((sum, category) => sum + category.earned, 0)));
        return { categoryScores, internalScore, grade: workoutLetterGrade(internalScore) };
      }

      function calculateWorkoutAnalysis(session, options = {}) {
        const prs = options.prs || session.prs || [];
        const actionContext = canonicalGradeActionContext(session);
        const exercises = data.exercises.filter((exercise) => exercise.sessionId === session.id).sort((left, right) => left.order - right.order);
        const results = exercises.map((exercise) => workoutExerciseAnalysis(session, exercise, prs, actionContext));
        const plannedSets = results.reduce((sum, result) => sum + result.plannedSets, 0);
        const gradePlannedSets = results.reduce((sum, result) => sum + result.gradePlannedSets, 0);
        const completedSets = results.reduce((sum, result) => sum + result.completedSets, 0);
        if (!plannedSets && !completedSets) return null;
        const completionRatio = gradePlannedSets ? completedSets / gradePlannedSets : actionContext.handledActions.length ? 1 : 0;
        const progressionRatio = averageWorkoutMetric(results.map((result) => result.progressionRatio), 0);
        const programRatio = averageWorkoutMetric(results.map((result) => result.planExecutionRatio), 0);
        const loggedRpeCount = results.reduce((sum, result) => sum + Math.round(result.rpeLoggedRatio * result.completedSets), 0);
        const rpeComplianceWeighted = completedSets ? results.reduce((sum, result) => sum + result.rpeCompliance * Math.round(result.rpeLoggedRatio * result.completedSets), 0) / Math.max(1, loggedRpeCount) : 0;
        const rpeLoggedRatio = completedSets ? loggedRpeCount / completedSets : 0;
        const stabilityRatio = averageWorkoutMetric(results.map((result) => result.repDropRatio <= 0.15 ? 1 : result.repDropRatio <= 0.25 ? 0.8 : result.repDropRatio <= 0.4 ? 0.55 : 0.3), 1);
        const adjustedResults = results.filter((result) => result.resolvedActionDecisionId);
        const intentAdherence = actionContext.handledActions.length ? 1 : actionContext.actions.length ? 0.8 : 1;
        const scored = scoreWorkoutGradeMetrics({ results, progressionRatio, programRatio, completedSets, plannedSets: gradePlannedSets, loggedRpeCount, rpeComplianceWeighted, rpeLoggedRatio, completionRatio, stabilityRatio, actionContext });
        const { categoryScores, internalScore, grade } = scored;
        const progressResults = results.filter((result) => result.comparison.status === "progress");
        const regressionResults = results.filter((result) => result.comparison.status === "regression");
        const highlights = [];
        const highlightedExercises = new Set();
        results.forEach((result) => {
          const preferredPr = [...result.prs].sort((left, right) => /estimated/i.test(right.type) - /estimated/i.test(left.type) || /load/i.test(right.type) - /load/i.test(left.type))[0];
          if (preferredPr && !highlightedExercises.has(result.exerciseId)) {
            highlights.push({ type: "pr", exerciseId: result.exerciseId, title: result.name + " - " + preferredPr.type, detail: preferredPr.value + (result.priorBestSet ? ". Previous comparable best: " + result.priorBestSet.text + "." : ". First comparable submitted benchmark.") });
            highlightedExercises.add(result.exerciseId);
          } else if (result.comparison.status === "progress") {
            highlights.push({ type: "progress", exerciseId: result.exerciseId, title: result.name + " - " + result.comparison.label, detail: (result.bestSet?.text || "Completed work") + ". " + result.comparison.change });
            highlightedExercises.add(result.exerciseId);
          }
        });
        if (completionRatio === 1) highlights.push({ type: "execution", title: "Every prescribed working set completed", detail: completedSets + " of " + plannedSets + " working sets were completed; warm-up sets were excluded." });
        const averageRangeCompliance = averageWorkoutMetric(results.map((result) => result.rangeCompliance), 0);
        if (completedSets && averageRangeCompliance >= 0.98) highlights.push({ type: "execution", title: "Rep ranges executed cleanly", detail: "All completed working sets stayed inside their exercise-specific programmed ranges." });
        if (loggedRpeCount === completedSets && rpeComplianceWeighted >= 0.95) highlights.push({ type: "effort", title: "Effort stayed on target", detail: "All " + loggedRpeCount + " logged working-set RPE values stayed within one point of their prescribed targets." });
        if (adjustedResults.length && intentAdherence >= 0.9) highlights.push({ type: "readiness", title: "Readiness plan executed well", detail: adjustedResults.length + " adjusted exercise" + (adjustedResults.length === 1 ? " was" : "s were") + " completed against today's targets instead of being penalized against the original plan." });
        if (results.length && results.every((result) => result.isDeload) && intentAdherence >= 0.9) highlights.push({ type: "deload", title: "Deload intent protected", detail: "Reduced loading and effort were treated as successful recovery work, not performance regression." });
        // Completion cannot become an independent coaching source. M7 replaces the
        // legacy grade presentation; until then this bridge emits factual highlights
        // and the persisted canonical exception action only.
        const uniqueImprovements = [];
        const strengthParts = [];
        if (completionRatio >= 0.9) strengthParts.push("completed " + completedSets + " of " + plannedSets + " prescribed working sets");
        if (progressResults.length) strengthParts.push("improved on " + progressResults.length + " exercise" + (progressResults.length === 1 ? "" : "s"));
        if (averageRangeCompliance >= 0.85) strengthParts.push("kept " + Math.round(averageRangeCompliance * 100) + "% of completed sets in range");
        if (adjustedResults.length && intentAdherence >= 0.8) strengthParts.push("executed the readiness-adjusted plan as intended");
        const rationaleLead = strengthParts.length ? "You " + strengthParts.slice(0, 3).join(", ") + "." : "The session fell short of several prescribed execution targets.";
        const rationaleLimit = uniqueImprovements.length ? " The grade was limited most by " + uniqueImprovements[0].title.toLowerCase() + " (" + uniqueImprovements[0].metric + ")." : " No major execution issue was identified in the submitted data.";
        const confidence = completedSets >= 8 && rpeLoggedRatio >= 0.75 && results.filter((result) => result.priorBestSet).length >= Math.min(2, results.length) ? "high" : completedSets >= 3 ? "moderate" : "low";
        return {
          version: 1,
          algorithmVersion: "legacy-grade-canonical-action-bridge/1.0.0",
          calculatedAt: isoNow(),
          grade,
          internalScore,
          interpretation: workoutGradeInterpretation(grade),
          rationale: rationaleLead + rationaleLimit,
          intent: workoutSessionIntent(session, results),
          categoryScores,
          highlights: highlights.slice(0, 6),
          improvements: uniqueImprovements,
          exerciseResults: results,
          prs,
          readinessContext: { mode: actionContext.actions.length ? "canonical_exception" : "none", recovery: null, adjustments: results.filter((result) => result.isReadinessAdjusted).length, adherence: intentAdherence },
          deloadContext: { isDeload: results.length > 0 && results.every((result) => result.isDeload), deloadExercises: results.filter((result) => result.isDeload).map((result) => result.name) },
          confidence,
          resolvedActionDecisionIds: actionContext.decisionIds,
          resolvedActionHandling: actionContext.handlingCounts,
          metrics: { plannedSets, completedSets, completionRatio, averageRangeCompliance, rpeLoggedRatio, rpeCompliance: rpeComplianceWeighted, progressedExercises: progressResults.length, regressedExercises: regressionResults.length }
        };
      }

      function workoutAnalysisForSession(session) {
        return session?.workoutAnalysis && typeof session.workoutAnalysis.grade === "string"
          ? session.workoutAnalysis
          : calculateWorkoutAnalysis(session, { prs: session?.prs || [] });
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

      function submitWorkoutPrs(session) {
        const sessionExercises = data.exercises.filter((exercise) => exercise.sessionId === session.id);
        const priorSessionIds = new Set(activeHistorySessions({ throughDate: session.date }).filter((item) => item.id !== session.id).map((item) => item.id));
        const prs = [];
        sessionExercises.forEach((exercise) => {
          const resistanceType = resistanceTypeFor(exercise);
          const currentSets = setsForExercise(exercise.id).filter((set) => set.completed && isWorkingSet(set, "pr") && set.reps > 0);
          if (!currentSets.length) return;
          const priorSets = data.sets.filter((set) => {
            const priorExercise = data.exercises.find((item) => item.id === set.exerciseId);
            return set.completed && isWorkingSet(set, "pr") && priorExercise && priorSessionIds.has(priorExercise.sessionId) && exerciseMatches(priorExercise.name, exercise.name) && resistanceTypeFor(priorExercise, set) === resistanceType;
          });
          if (["external", "bodyweight_plus_load"].includes(resistanceType)) {
            const maxWeight = Math.max(...currentSets.map((set) => resistanceLoad(set, resistanceType)));
            const previousMaxWeight = Math.max(0, ...priorSets.map((set) => resistanceLoad(set, resistanceType)));
            if (maxWeight > previousMaxWeight && maxWeight > 0) prs.push({ exercise: exercise.name, type: resistanceType === "bodyweight_plus_load" ? "Heaviest added load" : "Heaviest load", value: formatResistance({ ...currentSets.find((set) => resistanceLoad(set, resistanceType) === maxWeight), resistanceType }, exercise) });
            currentSets.forEach((set) => {
              const load = resistanceLoad(set, resistanceType);
              const previousRepsAtLoad = Math.max(0, ...priorSets.filter((prior) => resistanceLoad(prior, resistanceType) === load).map((prior) => prior.reps));
              if (load > 0 && set.reps > previousRepsAtLoad) prs.push({ exercise: exercise.name, type: resistanceType === "bodyweight_plus_load" ? "Most reps at added load" : "Most reps at load", value: formatSetPerformance(set, exercise) });
            });
          } else if (resistanceType === "assisted_bodyweight") {
            const currentAssistance = Math.min(...currentSets.map((set) => resistanceLoad(set, resistanceType)).filter((value) => value > 0));
            const previousAssistance = Math.min(...priorSets.map((set) => resistanceLoad(set, resistanceType)).filter((value) => value > 0));
            if (Number.isFinite(currentAssistance) && (!Number.isFinite(previousAssistance) || currentAssistance < previousAssistance)) prs.push({ exercise: exercise.name, type: "Least assistance", value: "BW - " + currentAssistance + " " + data.settings.weightUnit + " assistance" });
          } else {
            const currentBest = Math.max(...currentSets.map((set) => resistanceType === "duration" ? set.durationSeconds : resistanceType === "distance" ? set.distance : set.reps));
            const previousBest = Math.max(0, ...priorSets.map((set) => resistanceType === "duration" ? set.durationSeconds : resistanceType === "distance" ? set.distance : set.reps));
            if (currentBest > previousBest) prs.push({ exercise: exercise.name, type: resistanceType === "duration" ? "Longest duration" : resistanceType === "distance" ? "Longest distance" : "Most reps", value: formatResistance(currentSets.find((set) => (resistanceType === "duration" ? set.durationSeconds : resistanceType === "distance" ? set.distance : set.reps) === currentBest), exercise) });
          }
          if (resistanceType === "external") {
            const currentE1rm = Math.max(...currentSets.map(estimatedOneRepMax));
            const previousE1rm = Math.max(0, ...priorSets.map(estimatedOneRepMax));
            if (currentE1rm > previousE1rm && currentE1rm > 0) prs.push({ exercise: exercise.name, type: "Best estimated performance", value: currentE1rm.toFixed(1) + " e1RM" });
          }
        });
        return prs.filter((pr, index, all) => all.findIndex((other) => other.exercise === pr.exercise && other.type === pr.type) === index);
      }

      function workoutSubmissionIsAccepted(sessionId) {
        const session = data.sessions.find((item) => item.id === sessionId);
        return Boolean(session && !session.submitted && !workoutSubmissionsInProgress.has(sessionId));
      }

      function submitWorkout(sessionId) {
        if (!workoutSubmissionIsAccepted(sessionId)) return;
        const session = data.sessions.find((item) => item.id === sessionId);
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
          playWorkoutCompletionSound(prs.length > 0 || ["A+", "A"].includes(workoutAnalysis?.grade));
          if (["A+", "A", "A-"].includes(workoutAnalysis?.grade) || prs.length > 1) performInteractionFeedback("success");
        } finally {
          workoutSubmissionsInProgress.delete(sessionId);
        }
      }

      function renderSubmitConfirmation(session) {
        const completed = data.sets.filter((set) => {
          const exercise = data.exercises.find((item) => item.id === set.exerciseId);
          return exercise?.sessionId === session.id && set.completed && isWorkingSet(set, "score");
        }).length;
        const qualityControls = data.exercises.filter((exercise) => exercise.sessionId === session.id && setsForExercise(exercise.id).some((set) => isWorkingSet(set, "progression"))).map((exercise) => {
          const value = executionQualityValues.has(exercise.executionQualityAssessment) ? exercise.executionQualityAssessment : "not_assessed";
          return '<label><span>' + escapeHtml(exercise.name) + '</span><select data-action="exercise-execution-quality" data-exercise-id="' + exercise.id + '"><option value="not_assessed" ' + (value === "not_assessed" ? "selected" : "") + '>Not assessed</option><option value="controlled" ' + (value === "controlled" ? "selected" : "") + '>Controlled</option><option value="breakdown" ' + (value === "breakdown" ? "selected" : "") + '>Breakdown</option></select></label>';
        }).join('');
        return '<section class="submit-confirmation"><strong>Log this workout as completed?</strong><span>' + completed + ' completed working sets will update history, the performance chart, and PRs.</span><div class="submit-quality"><b>Did execution stay controlled?</b><small>Submission is allowed without an assessment, but an unassessed exposure cannot confirm progression.</small>' + qualityControls + '</div><div class="row"><button class="primary-action" type="button" data-action="confirm-submit-workout">Log workout</button><button type="button" data-action="cancel-submit-workout">Keep editing</button></div></section>';
      }

      function renderWorkoutExerciseResult(result) {
        const prDetail = result.prs?.length ? '<div><span>Personal records</span><strong>' + result.prs.map((pr) => escapeHtml(pr.type + ': ' + pr.value)).join('<br>') + '</strong></div>' : '';
        const deltaClass = result.comparison?.status === "progress" ? "over" : result.comparison?.status === "regression" ? "out" : result.comparison?.status === "same" ? "on" : "none";
        const targetText = result.targetRpe ? result.plannedSets + ' sets @ RPE ' + formatLoadNumber(result.targetRpe) : result.plannedSets + ' working sets';
        const actualText = result.completedSets + ' sets' + (result.averageRpe ? ' @ RPE ' + formatLoadNumber(result.averageRpe) : '');
        return '<details class="workout-exercise-result summary-diff-result"><summary><span class="diff"><span class="drow"><span class="plan"><span class="lbl">' + escapeHtml(result.name) + '</span><span class="val">' + escapeHtml(targetText) + '</span></span><span class="act"><span class="lbl">Performed</span><span class="val">' + escapeHtml(actualText) + '</span></span><span class="dlt"><span class="d ' + deltaClass + '">' + escapeHtml(result.comparison.label) + '</span></span></span></span></summary><div class="workout-exercise-detail">'
          + '<div><span>Best set</span><strong>' + escapeHtml(result.bestSet?.text || 'No completed working set') + '</strong></div>'
          + '<div><span>Previous comparable best</span><strong>' + escapeHtml(result.priorBestSet?.text || 'No prior comparable submitted set') + '</strong></div>'
          + '<div><span>Change</span><p>' + escapeHtml(result.comparison.change) + '</p></div>'
          + '<div><span>Target versus actual RPE</span><strong>' + (result.targetRpe ? 'Target ' + formatLoadNumber(result.targetRpe) : 'No programmed target') + ' - ' + (result.averageRpe ? 'average actual ' + formatLoadNumber(result.averageRpe) : 'actual RPE not logged') + '</strong></div>'
          + prDetail
          + '</div></details>';
      }

      const workoutAchievementAssets = Object.freeze({
        personal_record: "/resources/achievements/badge-personal-record.png",
        e1rm_peak: "/resources/achievements/badge-e1rm-peak.png",
        volume_record: "/resources/achievements/badge-volume-record.png",
        plan_complete: "/resources/achievements/badge-plan-complete.png",
        target_precision: "/resources/achievements/badge-target-precision.png",
        smart_training: "/resources/achievements/badge-smart-training.png",
        progression: "/resources/achievements/badge-progression.png",
        controlled_execution: "/resources/achievements/badge-controlled-execution.png"
      });

      function workoutExerciseVolumeLoad(exercise) {
        return setsForExercise(exercise.id).reduce((total, set) => {
          if (!set.completed || set.skipped || !isWorkingSet(set, "volume")) return total;
          const resistanceType = resistanceTypeFor(exercise, set);
          if (resistanceType !== "external") return total;
          return total + Math.max(0, resistanceLoad(set, resistanceType)) * Math.max(0, Number(set.reps || 0));
        }, 0);
      }

      function workoutSessionVolumeLoad(session) {
        return data.exercises.filter((exercise) => exercise.sessionId === session.id).reduce((total, exercise) => total + workoutExerciseVolumeLoad(exercise), 0);
      }

      function priorExerciseVolumeHighWater(session, exercise) {
        const priorSessions = activeHistorySessions({ throughDate: session.date }).filter((candidate) => candidate.id !== session.id && sessionComesBefore(candidate, session));
        return Math.max(0, ...priorSessions.map((candidate) => data.exercises
          .filter((item) => item.sessionId === candidate.id && canonicalExerciseId(item.name) === canonicalExerciseId(exercise.name))
          .reduce((total, item) => total + workoutExerciseVolumeLoad(item), 0)));
      }

      function priorWorkoutPrSets(session, exercise, resistanceType) {
        const priorSessionIds = new Set(activeHistorySessions({ throughDate: session.date })
          .filter((candidate) => candidate.id !== session.id && sessionComesBefore(candidate, session))
          .map((candidate) => candidate.id));
        const priorExerciseIds = new Set(data.exercises
          .filter((candidate) => priorSessionIds.has(candidate.sessionId) && exerciseMatches(candidate.name, exercise.name) && resistanceTypeFor(candidate) === resistanceType)
          .map((candidate) => candidate.id));
        return data.sets.filter((set) => priorExerciseIds.has(set.exerciseId) && set.completed && !set.skipped && isWorkingSet(set, "pr"));
      }

      function workoutPrPreviousHighWater(session, exercise, pr) {
        if (!exercise) return "No prior submitted benchmark";
        const resistanceType = resistanceTypeFor(exercise);
        const priorSets = priorWorkoutPrSets(session, exercise, resistanceType);
        if (!priorSets.length) return "No prior submitted benchmark";
        if (/estimated/i.test(pr.type)) {
          const previousE1rm = Math.max(0, ...priorSets.map(estimatedOneRepMax));
          return previousE1rm > 0 ? previousE1rm.toFixed(1) + " e1RM" : "No prior submitted benchmark";
        }
        if (/heaviest/i.test(pr.type)) {
          const previousLoad = Math.max(0, ...priorSets.map((set) => resistanceLoad(set, resistanceType)));
          return previousLoad > 0 ? formatLoadNumber(previousLoad) + " " + data.settings.weightUnit : "No prior submitted benchmark";
        }
        if (/most reps at/i.test(pr.type)) {
          const currentSets = setsForExercise(exercise.id).filter((set) => set.completed && !set.skipped && isWorkingSet(set, "pr"));
          const matchingCurrent = currentSets.find((set) => formatSetPerformance(set, exercise) === pr.value) || bestWorkoutSet(currentSets, resistanceType);
          const currentLoad = matchingCurrent ? resistanceLoad(matchingCurrent, resistanceType) : 0;
          const previous = [...priorSets.filter((set) => Math.abs(resistanceLoad(set, resistanceType) - currentLoad) < 0.01)]
            .sort((left, right) => Number(right.reps || 0) - Number(left.reps || 0))[0];
          return previous ? formatSetPerformance(previous, exercise) : "No prior record at this load";
        }
        if (/least assistance/i.test(pr.type)) {
          const previousAssistance = Math.min(...priorSets.map((set) => resistanceLoad(set, resistanceType)).filter((value) => value > 0));
          return Number.isFinite(previousAssistance) ? "BW - " + formatLoadNumber(previousAssistance) + " " + data.settings.weightUnit + " assistance" : "No prior submitted benchmark";
        }
        const previous = bestWorkoutSet(priorSets, resistanceType);
        return previous ? formatSetPerformance(previous, exercise) : "No prior submitted benchmark";
      }

      function workoutAchievementBadges(session, analysis) {
        if (!analysis) return [];
        const achievements = [];
        const add = (key, title, detail, items = []) => achievements.push({ key, title, detail, items, asset: workoutAchievementAssets[key] });
        const prs = Array.isArray(session.prs) ? session.prs : Array.isArray(analysis.prs) ? analysis.prs : [];
        const results = Array.isArray(analysis.exerciseResults) ? analysis.exerciseResults : [];
        const sessionExercises = data.exercises.filter((exercise) => exercise.sessionId === session.id);
        const exerciseForName = (name) => sessionExercises.find((exercise) => canonicalExerciseId(exercise.name) === canonicalExerciseId(name));
        const resultForName = (name) => results.find((result) => canonicalExerciseId(result.name) === canonicalExerciseId(name));
        const performanceItem = (result, current = result?.bestSet?.text || "Completed work", metric = "Performance") => ({
          name: result?.name || "Exercise",
          metric,
          current,
          previous: result?.priorBestSet?.text || "No prior submitted benchmark"
        });
        const e1rmPrs = prs.filter((pr) => /estimated/i.test(pr.type));
        const otherPrs = prs.filter((pr) => !/estimated/i.test(pr.type));
        const uniquePrExercises = new Set(otherPrs.map((pr) => canonicalExerciseId(pr.exercise))).size;
        if (e1rmPrs.length) add(
          "e1rm_peak",
          "New e1RM Peak",
          e1rmPrs.length === 1 ? e1rmPrs[0].exercise + " reached " + e1rmPrs[0].value + "." : "New estimated strength peaks on " + e1rmPrs.length + " exercises.",
          e1rmPrs.map((pr) => {
            const exercise = exerciseForName(pr.exercise);
            return { name: pr.exercise, metric: pr.type, current: pr.value, previous: workoutPrPreviousHighWater(session, exercise, pr) };
          })
        );
        if (otherPrs.length) add(
          "personal_record",
          "Personal Record",
          otherPrs.length + " record" + (otherPrs.length === 1 ? "" : "s") + " earned across " + uniquePrExercises + " exercise" + (uniquePrExercises === 1 ? "" : "s") + ".",
          otherPrs.map((pr) => {
            const exercise = exerciseForName(pr.exercise);
            return { name: pr.exercise, metric: pr.type, current: pr.value, previous: workoutPrPreviousHighWater(session, exercise, pr) };
          })
        );

        const currentVolume = workoutSessionVolumeLoad(session);
        const priorVolume = Math.max(0, ...activeHistorySessions({ throughDate: session.date })
          .filter((candidate) => candidate.id !== session.id && sessionComesBefore(candidate, session))
          .map(workoutSessionVolumeLoad));
        if (currentVolume > 0 && priorVolume > 0 && currentVolume > priorVolume) {
          const gain = Math.round(((currentVolume - priorVolume) / priorVolume) * 100);
          const volumeItems = sessionExercises.map((exercise) => {
            const contribution = workoutExerciseVolumeLoad(exercise);
            const previous = priorExerciseVolumeHighWater(session, exercise);
            return {
              name: exercise.name,
              metric: "Load × reps contribution",
              current: Math.round(contribution).toLocaleString() + " " + data.settings.weightUnit,
              previous: previous > 0 ? Math.round(previous).toLocaleString() + " " + data.settings.weightUnit : "No prior submitted benchmark",
              contribution
            };
          }).filter((item) => item.contribution > 0);
          add("volume_record", "Volume Record", Math.round(currentVolume).toLocaleString() + " " + data.settings.weightUnit + " total load × reps—" + gain + "% above the previous session high of " + Math.round(priorVolume).toLocaleString() + " " + data.settings.weightUnit + ".", volumeItems);
        }

        if (Number(analysis.metrics?.progressedExercises || 0) > 0) {
          const count = Number(analysis.metrics.progressedExercises);
          add("progression", "Forward Progress", count + " exercise" + (count === 1 ? "" : "s") + " outperformed the previous comparable workout.", results.filter((result) => result.comparison?.status === "progress").map((result) => performanceItem(result, result.bestSet?.text, result.comparison?.label || "Performance progression")));
        }
        if (Number(analysis.metrics?.plannedSets || 0) > 0 && Number(analysis.metrics?.completionRatio || 0) === 1) {
          add("plan_complete", "Plan Complete", "Completed every prescribed working set.");
        }
        if (Number(analysis.metrics?.completedSets || 0) > 0
          && Number(analysis.metrics?.averageRangeCompliance || 0) >= 0.98
          && Number(analysis.metrics?.rpeLoggedRatio || 0) >= 0.99
          && Number(analysis.metrics?.rpeCompliance || 0) >= 0.95) {
          add("target_precision", "Dialed In", "All completed sets met both rep-range and logged RPE targets.", results.filter((result) => result.completedSets > 0).map((result) => performanceItem(
            result,
            Math.round(Number(result.rangeCompliance || 0) * 100) + "% rep-range · " + Math.round(Number(result.rpeCompliance || 0) * 100) + "% RPE target",
            "Target precision"
          )));
        }

        const assessedExercises = data.exercises.filter((exercise) =>
          exercise.sessionId === session.id
          && setsForExercise(exercise.id).some((set) => set.completed && !set.skipped && isWorkingSet(set, "progression"))
        );
        if (assessedExercises.length && assessedExercises.every((exercise) => exercise.executionQualityAssessment === "controlled")) {
          add("controlled_execution", "Controlled Execution", "Controlled execution was confirmed for every trained exercise.", assessedExercises.map((exercise) => {
            const result = resultForName(exercise.name);
            return performanceItem(result || { name: exercise.name }, result?.bestSet?.text ? "Controlled · " + result.bestSet.text : "Controlled", "Execution quality");
          }));
        }
        const readinessAdherence = Number(analysis.readinessContext?.adherence || 0);
        if ((Number(analysis.readinessContext?.adjustments || 0) > 0 || analysis.deloadContext?.isDeload) && readinessAdherence >= 0.9) {
          const adjustedResults = results.filter((result) => result.isReadinessAdjusted || result.isDeload);
          add("smart_training", analysis.deloadContext?.isDeload ? "Recovery Protected" : "Smart Adjustment", analysis.deloadContext?.isDeload ? "Completed the deload while preserving its recovery intent." : "Followed today’s adjusted targets with at least 90% adherence.", adjustedResults.map((result) => performanceItem(result, result.bestSet?.text, result.isDeload ? "Deload performance" : "Adjusted performance")));
        }
        return achievements;
      }

      function renderWorkoutAchievement(achievement) {
        const summary = '<img src="' + achievement.asset + '" alt="" width="256" height="256" loading="lazy" decoding="async" /><strong class="workout-achievement-title">' + escapeHtml(achievement.title) + '</strong><span class="workout-achievement-description">' + escapeHtml(achievement.detail) + '</span>';
        if (achievement.key === "plan_complete") return '<article class="workout-achievement static" role="listitem">' + summary + '</article>';
        const items = achievement.items?.length
          ? achievement.items.map((item) => '<article class="workout-achievement-evidence"><header><strong>' + escapeHtml(item.name) + '</strong><span>' + escapeHtml(item.metric || "Performance") + '</span></header><div><span>This workout</span><strong>' + escapeHtml(item.current || "Completed work") + '</strong></div><div><span>Previous high-water mark</span><strong>' + escapeHtml(item.previous || "No prior submitted benchmark") + '</strong></div></article>').join('')
          : '<div class="workout-achievement-evidence empty"><strong>Exercise detail is unavailable for this older saved workout.</strong><span>The badge remains valid from its submitted workout evidence.</span></div>';
        return '<details class="workout-achievement interactive" role="listitem" name="workout-achievement"><summary class="workout-achievement-summary" data-action="toggle-achievement-detail" data-achievement-key="' + achievement.key + '">' + summary + '<span class="workout-achievement-cue">View exercise details</span></summary><div class="workout-achievement-detail"><div><span class="section-kicker">Why you earned it</span><strong>' + escapeHtml(achievement.title) + '</strong><p>' + escapeHtml(achievement.detail) + '</p></div><div class="workout-achievement-evidence-list">' + items + '</div></div></details>';
      }

      function renderCompletedWorkoutSummary(session, options = {}) {
        const analysis = workoutAnalysisForSession(session);
        if (!analysis) return '<section class="completed-summary score-critical"><div class="section-kicker">Workout logged</div><div class="summary-muted">Not enough completed or prescribed working-set data was available to assign a defensible workout grade.</div>' + (options.history ? '' : '<button type="button" data-action="close-completed-summary">Return to Lift Home</button>') + '</section>';
        const tone = workoutGradeScoreTone(analysis.internalScore);
        const gradeSegments = Math.max(0, Math.min(10, Math.round(Number(analysis.internalScore || 0) / 10)));
        const achievements = workoutAchievementBadges(session, analysis);
        const achievementSection = achievements.length
          ? '<section class="workout-achievements" aria-labelledby="workout-achievements-title"><div class="workout-achievements-heading"><div><span class="section-kicker">Earned this workout</span><h3 id="workout-achievements-title">Achievement badges</h3></div><strong>' + achievements.length + ' earned</strong></div><div class="workout-achievement-grid" role="list">' + achievements.map(renderWorkoutAchievement).join('') + '</div></section>'
          : '';
        const highlights = analysis.highlights.length
          ? analysis.highlights.map((item) => '<div class="workout-highlight"><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.detail) + '</span></div>').join('')
          : '<div class="summary-muted">No distinct progression event was identified, but repeatable plan execution still contributes to the grade.</div>';
        const improvements = analysis.improvements.length
          ? '<div class="diff workout-improvement-diff"><div class="drow dhead"><span class="plan">Observed</span><span class="act">Target</span><span class="dlt">Review</span></div>' + analysis.improvements.map((item) => '<div class="drow"><span class="plan"><span class="lbl">' + escapeHtml(item.title) + '</span><span class="val">' + escapeHtml(item.metric) + '</span></span><span class="act"><span class="lbl">Expected</span><span class="val">' + escapeHtml(item.expected) + '</span></span><span class="dlt"><span class="d under">adjust</span></span><p>' + escapeHtml(item.detail) + '</p></div>').join('') + '</div>'
          : '<div class="summary-muted">No additional factual review item was identified.</div>';
        const facts = sessionWorkoutFacts(session);
        const plannedSets = Number(analysis.metrics.plannedSets || analysis.metrics.completedSets || 0);
        const completedSets = Number(analysis.metrics.completedSets || 0);
        const completionHeadline = plannedSets > 0
          ? completedSets + ' of ' + plannedSets + (completedSets === plannedSets && analysis.improvements.length === 0 ? ', inside the bands.' : ' prescribed sets completed.')
          : analysis.interpretation;
        const exerciseResults = '<section class="workout-summary-section primary-exercise-results"><div class="summary-section-label"><h3>The session, diffed</h3><span>Plan → actual</span></div><div class="workout-exercise-list">' + analysis.exerciseResults.map(renderWorkoutExerciseResult).join('') + '</div></section>';
        return '<section class="completed-summary ' + tone + '" aria-label="Post-workout grade and analysis">'
          + (options.history ? '' : '<div class="summary-toolbar"><span class="section-kicker">Session logged</span><button class="primary-action" type="button" data-action="close-completed-summary">Done</button></div>')
          + (options.history ? '' : renderResolvedAction(resolvedActionForScope(session, "session"), { session }))
          + '<div class="workout-grade-hero"><div class="workout-grade-copy"><div class="section-kicker">' + escapeHtml(session.title || (options.history ? 'Saved workout review' : 'Workout logged')) + (facts.durationMinutes ? ' · ' + facts.durationMinutes + ' min' : '') + '</div><h2>' + escapeHtml(completionHeadline) + '</h2><span class="workout-grade-intent">' + escapeHtml(analysis.intent) + '</span><p>' + escapeHtml(analysis.interpretation) + '. ' + escapeHtml(analysis.rationale) + '</p><span class="track" aria-label="Workout grade strength">' + Array.from({ length: 10 }, (_, index) => '<i class="seg ' + (index < gradeSegments ? 'filled' : '') + '"></i>').join('') + '</span></div><div class="workout-grade-mark" role="img" aria-label="Workout grade ' + escapeHtml(analysis.grade) + '">' + escapeHtml(analysis.grade) + '</div></div>'
          + exerciseResults
          + achievementSection
          + '<section class="workout-summary-section"><h3>Workout Highlights</h3><div class="workout-highlight-list">' + highlights + '</div></section>'
          + '<section class="workout-summary-section"><h3>Retrospective Session Review</h3><p class="settings-note">These observations describe the completed work and its recorded data quality.</p><div class="workout-improvement-list">' + improvements + '</div></section>'
          + '</section>';
      }
