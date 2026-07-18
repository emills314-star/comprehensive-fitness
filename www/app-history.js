
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

      function workoutExerciseAnalysis(session, exercise, prs) {
        const allWorkingSets = setsForExercise(exercise.id).filter((set) => isWorkingSet(set, "score"));
        const completedSets = allWorkingSets.filter((set) => set.completed && !set.skipped);
        const resistanceType = resistanceTypeFor(exercise, completedSets[0]);
        const prescription = exercise.prescription || {};
        const profile = progressionProfileForExercise(exercise.name);
        const repLow = Number(prescription.repLow || profile.lowerRep || 1);
        const repHigh = Number(prescription.repHigh || profile.upperRep || Math.max(repLow, 20));
        const plannedSets = allWorkingSets.length;
        const rangeMatches = completedSets.filter((set) => Number(set.reps || 0) >= repLow && Number(set.reps || 0) <= repHigh).length;
        const targetRepSets = completedSets.filter((set) => Number(set.targetReps || 0) > 0);
        const targetRepMatches = targetRepSets.filter((set) => Number(set.reps || 0) >= Number(set.targetReps || 0) - 1 && Number(set.reps || 0) <= repHigh).length;
        const loadTargetSets = completedSets.filter((set) => Number(set.targetWeight ?? 0) > 0 || resistanceType === "bodyweight");
        const loadMatches = loadTargetSets.filter((set) => {
          if (resistanceType === "bodyweight") return true;
          const actual = resistanceLoad(set, resistanceType);
          const target = Number(set.targetWeight ?? prescription.weight ?? 0);
          const tolerance = Math.max(Number(prescription.increment || profile.increment || 0), target * 0.1);
          return target <= 0 || Math.abs(actual - target) <= tolerance;
        }).length;
        const loggedRpeSets = completedSets.filter((set) => Number(set.rpe || 0) > 0);
        const rpeMatches = loggedRpeSets.filter((set) => {
          const target = Number(set.targetRpe || prescription.rpe || 0);
          return target <= 0 || Math.abs(Number(set.rpe || 0) - target) <= 1;
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
        const planExecutionRatio = averageWorkoutMetric(planRatios, 0);
        const adjustment = (session.readinessAdjustments || []).find((item) => item.exerciseId === exercise.id || canonicalExerciseId(item.name) === canonicalExerciseId(exercise.name));
        const isReadinessAdjusted = Boolean(adjustment?.changed || prescription.adjusted);
        const isDeload = Boolean(exercise.isDeload || prescription.isDeload || prescription.mode === "deload");
        const intentional = isReadinessAdjusted || isDeload || ["light", "technique", "return", "return-from-deload"].includes(prescription.mode);
        const statusRatio = intentional && planExecutionRatio >= 0.8 ? 0.95 : ({ progress: 1, stable: 0.9, baseline: 0.82, regression: 0.55, incomplete: 0.25 })[comparison.status] || 0.7;
        const exercisePrs = prs.filter((pr) => canonicalExerciseId(pr.exercise) === canonicalExerciseId(exercise.name));
        const readinessTarget = adjustment?.adjusted || prescription;
        const averageRpe = averageWorkoutMetric(loggedRpeSets.map((set) => Number(set.rpe)), 0);
        const targetRpe = averageWorkoutMetric(completedSets.map((set) => Number(set.targetRpe || readinessTarget?.rpe || 0)).filter(Boolean), Number(readinessTarget?.rpe || 0));
        const fatigueWarning = repDropRatio > 0.3 && rpeRise >= 1
          ? "Reps fell " + Math.round(repDropRatio * 100) + "% while RPE rose " + formatLoadNumber(rpeRise) + " points across comparable working sets."
          : "";
        return {
          exerciseId: exercise.id,
          name: exercise.name,
          resistanceType,
          isDeload,
          isReadinessAdjusted,
          intent: isDeload ? "Planned deload" : isReadinessAdjusted ? "Readiness-adjusted target" : prescription.mode ? prescription.mode.replaceAll("-", " ") : "Programmed work",
          plannedSets,
          completedSets: completedSets.length,
          skippedSets: allWorkingSets.filter((set) => set.skipped).length,
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
          readinessAdjustment: isReadinessAdjusted ? { original: adjustment?.original || exercise.originalPrescription || null, adjusted: adjustment?.adjusted || prescription, reason: adjustment?.reason || exercise.adjustmentReason || prescription.adjustmentReason || "Readiness-adjusted target was used.", triggers: adjustment?.triggers || prescription.triggerLabels || [] } : null
        };
      }

      function workoutSessionIntent(session, exerciseResults) {
        if (exerciseResults.length && exerciseResults.every((result) => result.isDeload)) return "Planned deload";
        if (exerciseResults.some((result) => result.isReadinessAdjusted)) return "Readiness-adjusted training";
        const template = data.templates.find((item) => item.id === session.templateId) || { name: session.title || "" };
        const type = sessionTypeForTemplate(template);
        return ({ heavy: "Heavy training", light: "Light training", technique: "Technique-focused training", deload: "Planned deload", normal: "Standard hypertrophy training" })[type] || "Standard hypertrophy training";
      }

      function scoreWorkoutGradeMetrics(metrics) {
        const {
          results, progressionRatio, programRatio, completedSets, plannedSets, loggedRpeCount,
          rpeComplianceWeighted, rpeLoggedRatio, completionRatio, stabilityRatio, adjustedResults,
          intentAdherence, severeFatigueSignals
        } = metrics;
        const progressedCount = results.filter((result) => result.comparison.status === "progress").length;
        const regressedCount = results.filter((result) => result.comparison.status === "regression").length;
        const categoryScores = [
          { key: "progression", label: "Progression quality", earned: Math.round(30 * clampWorkoutMetric(progressionRatio)), possible: 30, reason: progressedCount + " exercise" + (progressedCount === 1 ? "" : "s") + " progressed; " + regressedCount + " regressed versus prior comparable work." },
          { key: "execution", label: "Program execution", earned: Math.round(25 * clampWorkoutMetric(programRatio)), possible: 25, reason: Math.round(averageWorkoutMetric(results.map((result) => result.rangeCompliance), 0) * 100) + "% of completed working sets stayed inside their programmed rep ranges; prescribed load and rep targets were assessed separately." },
          { key: "rpe", label: "RPE management", earned: Math.round(20 * clampWorkoutMetric(rpeComplianceWeighted * rpeLoggedRatio + 0.65 * (1 - rpeLoggedRatio))), possible: 20, reason: loggedRpeCount + " of " + completedSets + " completed working sets included RPE; " + Math.round(rpeComplianceWeighted * 100) + "% of logged RPE values were within one point of target." },
          { key: "completion", label: "Set completion and consistency", earned: Math.round(15 * clampWorkoutMetric(completionRatio * 0.8 + stabilityRatio * 0.2)), possible: 15, reason: completedSets + " of " + plannedSets + " prescribed working sets were completed; set-to-set stability contributed only within this category." },
          { key: "fatigue", label: "Fatigue management", earned: Math.round(10 * clampWorkoutMetric(intentAdherence - severeFatigueSignals * 0.12)), possible: 10, reason: adjustedResults.length ? Math.round(intentAdherence * 100) + "% adherence to readiness or deload intent; " + severeFatigueSignals + " severe fatigue pattern" + (severeFatigueSignals === 1 ? "" : "s") + " detected." : severeFatigueSignals ? severeFatigueSignals + " severe rep-loss-plus-RPE-rise pattern" + (severeFatigueSignals === 1 ? " was" : "s were") + " detected." : "No readiness, deload, or severe within-session fatigue rule was violated." }
        ];
        const internalScore = Math.max(0, Math.min(100, categoryScores.reduce((sum, category) => sum + category.earned, 0)));
        return { categoryScores, internalScore, grade: workoutLetterGrade(internalScore) };
      }

      function calculateWorkoutAnalysis(session, options = {}) {
        const prs = options.prs || session.prs || [];
        const exercises = data.exercises.filter((exercise) => exercise.sessionId === session.id).sort((left, right) => left.order - right.order);
        const results = exercises.map((exercise) => workoutExerciseAnalysis(session, exercise, prs));
        const plannedSets = results.reduce((sum, result) => sum + result.plannedSets, 0);
        const completedSets = results.reduce((sum, result) => sum + result.completedSets, 0);
        if (!plannedSets && !completedSets) return null;
        const completionRatio = plannedSets ? completedSets / plannedSets : 0;
        const progressionRatio = averageWorkoutMetric(results.map((result) => result.progressionRatio), 0);
        const programRatio = averageWorkoutMetric(results.map((result) => result.planExecutionRatio), 0);
        const loggedRpeCount = results.reduce((sum, result) => sum + Math.round(result.rpeLoggedRatio * result.completedSets), 0);
        const rpeComplianceWeighted = completedSets ? results.reduce((sum, result) => sum + result.rpeCompliance * Math.round(result.rpeLoggedRatio * result.completedSets), 0) / Math.max(1, loggedRpeCount) : 0;
        const rpeLoggedRatio = completedSets ? loggedRpeCount / completedSets : 0;
        const stabilityRatio = averageWorkoutMetric(results.map((result) => result.repDropRatio <= 0.15 ? 1 : result.repDropRatio <= 0.25 ? 0.8 : result.repDropRatio <= 0.4 ? 0.55 : 0.3), 1);
        const adjustedResults = results.filter((result) => result.isReadinessAdjusted || result.isDeload);
        const intentAdherence = adjustedResults.length ? averageWorkoutMetric(adjustedResults.map((result) => {
          const rpeOk = !result.targetRpe || !result.averageRpe || result.averageRpe <= result.targetRpe + 1;
          return result.planExecutionRatio >= 0.8 && rpeOk ? 1 : result.planExecutionRatio >= 0.65 ? 0.7 : 0.35;
        }), 1) : 1;
        const severeFatigueSignals = results.filter((result) => result.fatigueWarning).length;
        const scored = scoreWorkoutGradeMetrics({ results, progressionRatio, programRatio, completedSets, plannedSets, loggedRpeCount, rpeComplianceWeighted, rpeLoggedRatio, completionRatio, stabilityRatio, adjustedResults, intentAdherence, severeFatigueSignals });
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
        const improvements = [];
        if (completionRatio < 0.9) improvements.push({ key: "completion", title: "Complete more of the prescribed work", metric: completedSets + " of " + plannedSets + " working sets completed", expected: "At least 90% completion", detail: "Skipped or unfinished work reduced the intended stimulus. Next time, reduce optional work first or adjust the plan before starting rather than leaving prescribed sets incomplete." });
        if (averageRangeCompliance < 0.85) improvements.push({ key: "rep-range", title: "Keep working sets inside their rep ranges", metric: Math.round(averageRangeCompliance * 100) + "% in range", expected: "At least 85% in range", detail: "Repeated misses make load progression less comparable. Use a load that keeps the majority of sets inside the programmed range." });
        if (rpeLoggedRatio < 0.5) improvements.push({ key: "rpe-logging", title: "Log enough RPE data to judge effort", metric: loggedRpeCount + " of " + completedSets + " working sets logged", expected: "RPE on at least half of working sets", detail: "Missing effort data lowers confidence. Log RPE on the first and final working set at minimum." });
        else if (rpeComplianceWeighted < 0.75) improvements.push({ key: "rpe", title: "Bring effort closer to target", metric: Math.round(rpeComplianceWeighted * 100) + "% of logged sets within target", expected: "At least 75% within one RPE point", detail: "Repeated overshooting adds fatigue, while undershooting may reduce stimulus. Adjust load or reps before the next set when effort moves outside the target band." });
        const worstDrop = [...results].sort((left, right) => right.repDropRatio - left.repDropRatio)[0];
        if (worstDrop?.repDropRatio > 0.25) improvements.push({ key: "consistency", exerciseId: worstDrop.exerciseId, title: "Reduce late-set rep loss on " + worstDrop.name, metric: Math.round(worstDrop.repDropRatio * 100) + "% rep drop across comparable sets", expected: "No more than 25% drop", detail: "A large decline can indicate insufficient rest or an overly aggressive first set. Add rest time or leave one more rep in reserve early." });
        regressionResults.slice(0, 2).forEach((result) => improvements.push({ key: "progression", exerciseId: result.exerciseId, title: "Review " + result.name + " regression evidence", metric: result.comparison.change, expected: "Maintain or improve comparable performance", detail: "This result is added to the next unified prescription calculation. Use that versioned prescription—not this retrospective grade—for the next load, reps, volume, deload, or rotation decision." }));
        if (adjustedResults.length && intentAdherence < 0.75) improvements.push({ key: "readiness", title: "Follow the readiness-adjusted target", metric: Math.round(intentAdherence * 100) + "% adjusted-plan adherence", expected: "At least 75% adherence", detail: "The reduced prescription was chosen from today's recorded recovery markers. Following the adjusted load, sets, and RPE protects training quality without grading the session against the original target." });
        const uniqueImprovements = improvements.filter((item, index, all) => all.findIndex((other) => other.key === item.key && other.exerciseId === item.exerciseId) === index).slice(0, 4);
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
          readinessContext: { mode: session.readinessMode || "usual", recovery: sessionRecovery(session), adjustments: results.filter((result) => result.isReadinessAdjusted).length, adherence: intentAdherence },
          deloadContext: { isDeload: results.length > 0 && results.every((result) => result.isDeload), deloadExercises: results.filter((result) => result.isDeload).map((result) => result.name) },
          confidence,
          metrics: { plannedSets, completedSets, completionRatio, averageRangeCompliance, rpeLoggedRatio, rpeCompliance: rpeComplianceWeighted, progressedExercises: progressResults.length, regressedExercises: regressionResults.length, severeFatigueSignals }
        };
      }

      function workoutAnalysisForSession(session) {
        return session?.workoutAnalysis?.version === 1 ? session.workoutAnalysis : calculateWorkoutAnalysis(session, { prs: session?.prs || [] });
      }
      // WORKOUT_GRADING_ENGINE_END

      async function requestRestNotificationPermission() {
        if (!("Notification" in window)) {
          notificationMessage = "Lock-screen notifications are not available in this browser.";
          render();
          return;
        }
        if (Notification.permission === "denied") {
          notificationMessage = "Notifications are blocked. On iPhone, open Settings > Notifications > Comprehensive Fitness and enable Allow Notifications, Sounds, and Lock Screen.";
          render();
          return;
        }
        if (Notification.permission === "granted") {
          notificationMessage = "Lock-screen rest alerts are enabled.";
          render();
          return;
        }
        try {
          const permission = await Notification.requestPermission();
          notificationMessage = permission === "granted"
            ? "Lock-screen rest alerts are enabled."
            : "Notifications were not enabled. The app will not ask again automatically; use iPhone Settings > Notifications > Comprehensive Fitness if you change your mind.";
        } catch {
          notificationMessage = "Notification permission could not be requested. Install the app to your iPhone Home Screen, then try again.";
        }
        render();
      }

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

      function evaluateWorkoutOverrideOutcomes(session, workoutAnalysis) {
        const results = workoutAnalysis?.exerciseResults || [];
        const evaluatedByRecommendation = new Map();
        const exercises = data.exercises.map((exercise) => {
          if (exercise.sessionId !== session.id || !exercise.recommendationSnapshot?.manualOverrides?.length || !prescriptionEngine) return exercise;
          const result = results.find((item) => item.exerciseId === exercise.id || canonicalExerciseId(item.name) === canonicalExerciseId(exercise.name));
          const outcome = {
            completed: Boolean(result && result.completedSets >= Math.max(1, result.plannedSets * 0.8)),
            adherence: Number(result?.planExecutionRatio || 0),
            progressed: result?.comparison?.status === "progress",
            progressionPercent: result?.comparison?.status === "progress" ? 2 : result?.comparison?.status === "regression" ? -2 : 0,
            recoveryCost: result?.fatigueWarning ? 75 : 30,
            pain: false,
            completedAt: isoNow()
          };
          try {
            const evaluated = prescriptionEngine.evaluateOverride(exercise.recommendationSnapshot, outcome);
            evaluatedByRecommendation.set(evaluated.recommendationId, evaluated);
            return { ...exercise, recommendationSnapshot: evaluated, finalPrescription: evaluated.finalPrescription, manualOverrides: evaluated.manualOverrides };
          } catch {
            return exercise;
          }
        });
        const recommendationHistory = data.recommendationHistory.map((snapshot) => evaluatedByRecommendation.get(snapshot.recommendationId) || snapshot);
        const manualOverrides = data.manualOverrides.map((entry) => {
          const evaluated = evaluatedByRecommendation.get(entry.recommendationId);
          const matching = evaluated?.manualOverrides?.find((item) => item.overrideId === entry.overrideId);
          if (matching?.outcomeEvaluation) return { ...entry, outcome: matching.outcome, outcomeEvaluation: matching.outcomeEvaluation };
          if (entry.sessionId === session.id && !entry.outcomeEvaluation) {
            const result = results.find((item) => item.exerciseId === entry.exerciseRuntimeId);
            return { ...entry, outcomeEvaluation: { result: result?.comparison?.status === "progress" ? "override_outperformed_or_supported" : result?.comparison?.status === "regression" ? "engine_recommendation_likely_preferred" : "inconclusive", evaluatedAt: isoNow(), explanation: "Evaluated from the completed workout; comparable confirmation is still required before this becomes strong personal evidence." } };
          }
          return entry;
        });
        return { exercises, recommendationHistory, manualOverrides, evaluatedByRecommendation };
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
          const overrideOutcomes = evaluateWorkoutOverrideOutcomes(completedSession, workoutAnalysis);
          if (completedSession.workoutPrescription?.recommendations?.length) completedSession.workoutPrescription = { ...completedSession.workoutPrescription, recommendations: completedSession.workoutPrescription.recommendations.map((snapshot) => overrideOutcomes.evaluatedByRecommendation.get(snapshot.recommendationId) || snapshot) };
          pendingSubmitSessionId = "";
          completedSummarySessionId = session.id;
          if (activeWorkoutId === session.id) {
            activeWorkoutId = "";
            clearActiveWorkoutDraft();
          }
          commit({ ...data, sessions: data.sessions.map((item) => item.id === session.id ? { ...completedSession, workoutAnalysis } : item), exercises: overrideOutcomes.exercises, recommendationHistory: overrideOutcomes.recommendationHistory, manualOverrides: overrideOutcomes.manualOverrides });
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
        return '<section class="submit-confirmation"><strong>Log this workout as completed?</strong><span>' + completed + ' completed working sets will update history, charts, volume, and PRs.</span><div class="row"><button class="primary-action" type="button" data-action="confirm-submit-workout">Log workout</button><button type="button" data-action="cancel-submit-workout">Keep editing</button></div></section>';
      }

      function renderWorkoutExerciseResult(result) {
        const readiness = result.readinessAdjustment;
        const readinessDetail = readiness
          ? '<div><span>Readiness adjustment</span><strong>Original: ' + escapeHtml(readablePrescriptionLine(readiness.original || {})) + '</strong><p>Today: ' + escapeHtml(readablePrescriptionLine(readiness.adjusted || {})) + '. ' + escapeHtml(readiness.reason) + '</p></div>'
          : '';
        const prDetail = result.prs?.length ? '<div><span>Personal records</span><strong>' + result.prs.map((pr) => escapeHtml(pr.type + ': ' + pr.value)).join('<br>') + '</strong></div>' : '';
        return '<details class="workout-exercise-result"><summary><strong>' + escapeHtml(result.name) + '</strong><span>' + result.completedSets + '/' + result.plannedSets + ' working sets - ' + escapeHtml(result.intent) + '</span><b>' + escapeHtml(result.comparison.label) + ' &rsaquo;</b></summary><div class="workout-exercise-detail">'
          + '<div><span>Best set</span><strong>' + escapeHtml(result.bestSet?.text || 'No completed working set') + '</strong></div>'
          + '<div><span>Previous comparable best</span><strong>' + escapeHtml(result.priorBestSet?.text || 'No prior comparable submitted set') + '</strong></div>'
          + '<div><span>Change</span><p>' + escapeHtml(result.comparison.change) + '</p></div>'
          + '<div><span>Target versus actual RPE</span><strong>' + (result.targetRpe ? 'Target ' + formatLoadNumber(result.targetRpe) : 'No programmed target') + ' - ' + (result.averageRpe ? 'average actual ' + formatLoadNumber(result.averageRpe) : 'actual RPE not logged') + '</strong></div>'
          + readinessDetail + prDetail
          + (result.fatigueWarning ? '<div><span>Fatigue warning</span><p>' + escapeHtml(result.fatigueWarning) + '</p></div>' : '')
          + '</div></details>';
      }

      function renderCompletedWorkoutSummary(session, options = {}) {
        const analysis = workoutAnalysisForSession(session);
        if (!analysis) return '<section class="completed-summary score-critical"><div class="section-kicker">Workout logged</div><div class="summary-muted">Not enough completed or prescribed working-set data was available to assign a defensible workout grade.</div>' + (options.history ? '' : '<button type="button" data-action="close-completed-summary">Return to Lift Home</button>') + '</section>';
        const tone = workoutGradeScoreTone(analysis.internalScore);
        const highlights = analysis.highlights.length
          ? analysis.highlights.map((item) => '<div class="workout-highlight"><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.detail) + '</span></div>').join('')
          : '<div class="summary-muted">No distinct progression event was identified, but repeatable plan execution still contributes to the grade.</div>';
        const improvements = analysis.improvements.length
          ? analysis.improvements.map((item) => '<div class="workout-improvement"><strong>' + escapeHtml(item.title) + '</strong><span><b>Observed:</b> ' + escapeHtml(item.metric) + '. <b>Target:</b> ' + escapeHtml(item.expected) + '.</span><span>' + escapeHtml(item.detail) + '</span></div>').join('')
          : '<div class="summary-muted">No major execution issues were identified. Continue the current progression plan.</div>';
        return '<section class="completed-summary ' + tone + '" aria-label="Post-workout grade and analysis">'
          + '<div class="workout-grade-hero"><div class="workout-grade-copy"><div class="section-kicker">' + (options.history ? 'Saved workout review' : 'Workout logged') + '</div><h2>Workout Grade: ' + escapeHtml(analysis.grade) + '</h2><span class="workout-grade-intent">' + escapeHtml(analysis.intent) + '</span><p>' + escapeHtml(analysis.interpretation) + '. ' + escapeHtml(analysis.rationale) + '</p></div><div class="workout-grade-mark" role="img" aria-label="Workout grade ' + escapeHtml(hypertrophyGradeLabel(analysis.grade)) + '">' + escapeHtml(analysis.grade) + '</div></div>'
          + '<section class="workout-summary-section"><h3>Category breakdown</h3><div class="workout-category-list">' + analysis.categoryScores.map((category) => '<div class="workout-category"><strong>' + escapeHtml(category.label) + '</strong><b>' + category.earned + ' / ' + category.possible + '</b><span>' + escapeHtml(category.reason) + '</span></div>').join('') + '</div></section>'
          + '<section class="workout-summary-section"><h3>Workout Highlights</h3><div class="workout-highlight-list">' + highlights + '</div></section>'
          + '<section class="workout-summary-section"><h3>Retrospective Session Review</h3><p class="settings-note">These observations explain execution and data quality. The unified prescription cards remain the sole source for the next training decision.</p><div class="workout-improvement-list">' + improvements + '</div></section>'
          + '<section class="workout-summary-section"><h3>Exercise results</h3><div class="workout-exercise-list">' + analysis.exerciseResults.map(renderWorkoutExerciseResult).join('') + '</div></section>'
          + '<div class="workout-confidence"><strong>' + escapeHtml(analysis.confidence.charAt(0).toUpperCase() + analysis.confidence.slice(1)) + ' confidence.</strong> Based on ' + analysis.metrics.completedSets + ' completed working sets, ' + Math.round(analysis.metrics.rpeLoggedRatio * 100) + '% RPE coverage, and available prior comparable sessions. Warm-ups were excluded.</div>'
          + (options.history ? '' : '<button class="primary-action" type="button" data-action="close-completed-summary">Done</button>')
          + '</section>';
      }
