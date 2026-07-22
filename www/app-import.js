
      function exportData() {
        const backup = window.FitnessBackupContract.createBackupExport(data);
        exportText = JSON.stringify(backup, null, 2);
        if (appDataPersistenceConflict) {
          settingsMessage = "Backup exported from the currently selected app-data copy only. The conflicting alternate local fallback copy remains preserved on this device and is not included in the download.";
        }
        const blob = new Blob([exportText], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "comprehensive-fitness-" + todayIso() + ".json";
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        window.setTimeout(() => {
          anchor.remove();
          URL.revokeObjectURL(url);
        }, 1000);
        render();
      }

      function parseCsv(text) {
        const rows = [];
        let row = [];
        let cell = "";
        let quoted = false;
        for (let index = 0; index < text.length; index += 1) {
          const char = text[index];
          const next = text[index + 1];
          if (char === '"' && quoted && next === '"') {
            cell += '"';
            index += 1;
          } else if (char === '"') {
            quoted = !quoted;
          } else if (char === "," && !quoted) {
            row.push(cell);
            cell = "";
          } else if ((char === "\n" || char === "\r") && !quoted) {
            if (char === "\r" && next === "\n") index += 1;
            row.push(cell);
            if (row.some((value) => value !== "")) rows.push(row);
            row = [];
            cell = "";
          } else {
            cell += char;
          }
        }
        row.push(cell);
        if (row.some((value) => value !== "")) rows.push(row);
        const headers = rows.shift()?.map((header) => header.trim()) || [];
        return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
      }

      function numberFrom(value, fallback = 0) {
        if (value === "" || value == null) return fallback;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      }

      const muscleTargets = {
        novice: { low: 8, high: 12 },
        intermediate: { low: 10, high: 18 },
        advanced: { low: 12, high: 22 }
      };

      const muscleGroups = ["Chest", "Back", "Quads", "Hamstrings", "Glutes", "Adductors", "Shoulders", "Biceps", "Triceps", "Forearms", "Calves", "Core", "Neck"];

      function targetRangeForMuscle(muscle) {
        if (prescriptionEngine?.evidence?.research?.muscleGroupRecommendations?.length) {
          const engineGroup = ({ Back: "upper_back", Shoulders: "front_delts", Core: "abdominals", Neck: "neck_flexors", Quads: "quadriceps" })[muscle] || normalizePrescriptionIdentity(muscle);
          const defaults = prescriptionApi.aggregateMuscleResearchDefaults(prescriptionEngine.evidence.research, engineGroup);
          if (defaults.recommendations?.length) return { low: Math.max(1, Math.round(defaults.weeklySets.min)), high: Math.max(Math.round(defaults.weeklySets.min), Math.round(defaults.weeklySets.max)) };
        }
        const base = muscleTargets[data.settings.experienceLevel] || muscleTargets.intermediate;
        if (muscle === "Neck") return { low: Math.max(2, Math.round(base.low * 0.35)), high: Math.max(6, Math.round(base.high * 0.45)) };
        if (muscle === "Adductors") return { low: Math.max(4, Math.round(base.low * 0.45)), high: Math.max(8, Math.round(base.high * 0.6)) };
        if (muscle === "Forearms" || muscle === "Calves") return { low: Math.max(4, Math.round(base.low * 0.55)), high: Math.max(10, Math.round(base.high * 0.7)) };
        return base;
      }

      const exerciseMuscleRules = [
        { match: /neck curl|neck flexion|neck extension|neck harness|neck lateral/, muscles: [["Neck", 1]] },
        { match: /side plank/, muscles: [["Core", 1], ["Glutes", 0.25]] },
        { match: /calf|soleus|gastroc|heel raise/, muscles: [["Calves", 1]] },
        { match: /hip adduction|adductor/, muscles: [["Adductors", 1]] },
        { match: /hip abduction|abductor|clamshell|lateral leg raise|side lying leg raise/, muscles: [["Glutes", 1]] },
        { match: /seated leg curl|lying leg curl|standing leg curl|nordic curl|hamstring curl|leg curl|glute ham raise|ghr/, muscles: [["Hamstrings", 1]] },
        { match: /leg extension|sissy squat/, muscles: [["Quads", 1]] },
        { match: /wrist curl|wrist extension|forearm curl|grip|gripper|farmer|carry/, muscles: [["Forearms", 1], ["Core", 0.25]] },
        { match: /reverse curl|hammer curl/, muscles: [["Biceps", 1], ["Forearms", 0.5]] },
        { match: /preacher curl|incline curl|cable curl|ez bar curl|barbell curl|dumbbell curl|db curl|bicep curl|biceps curl|\bcurl\b/, muscles: [["Biceps", 1]] },
        { match: /tricep|triceps|pushdown|skull crusher|skullcrusher|french press|overhead extension|close grip bench|close-grip bench/, muscles: [["Triceps", 1], ["Chest", 0.25]] },
        { match: /upright row|lateral raise|front raise/, muscles: [["Shoulders", 1]] },
        { match: /rear delt|reverse fly|face pull/, muscles: [["Shoulders", 1], ["Back", 0.25]] },
        { match: /overhead press|shoulder press|military press|arnold press/, muscles: [["Shoulders", 1], ["Triceps", 0.5]] },
        { match: /bench|chest press|push up|pushup|dip|chest fly|pec deck|cable fly|incline press|decline press/, muscles: [["Chest", 1], ["Triceps", 0.5], ["Shoulders", 0.25]] },
        { match: /pullover/, muscles: [["Back", 1], ["Chest", 0.5]] },
        { match: /pull up|pullup|chin up|chinup|pulldown|lat pulldown|row|t-bar|t bar|seated cable row|chest supported row/, muscles: [["Back", 1], ["Biceps", 0.5]] },
        { match: /shrug/, muscles: [["Back", 1], ["Shoulders", 0.25]] },
        { match: /hip thrust|glute bridge|glute kickback|cable kickback|abductor/, muscles: [["Glutes", 1], ["Hamstrings", 0.25]] },
        { match: /romanian|\brdl\b|stiff leg|good morning|deadlift|hinge|back extension|hyperextension/, muscles: [["Hamstrings", 1], ["Glutes", 0.5], ["Back", 0.25]] },
        { match: /squat|leg press|hack squat|pendulum squat|belt squat|lunge|split squat|step up|step-up|bulgarian/, muscles: [["Quads", 1], ["Glutes", 0.5]] },
        { match: /plank|crunch|sit up|sit-up|leg raise|hanging raise|knee raise|ab wheel|pallof|woodchop|core|dead bug|bird dog/, muscles: [["Core", 1]] }
      ];

      function normalizeMuscleMatches(matches) {
        const merged = new Map();
        matches.forEach(([muscle, weight]) => {
          if (!muscleGroups.includes(muscle) || weight <= 0) return;
          merged.set(muscle, Math.max(merged.get(muscle) || 0, weight));
        });
        return Array.from(merged.entries()).map(([muscle, weight]) => ({ muscle, weight }));
      }

      function automaticMusclesForName(name) {
        const key = exerciseKey(name);
        const rule = exerciseMuscleRules.find((item) => item.match.test(key));
        return rule ? normalizeMuscleMatches(rule.muscles) : [];
      }

      function displayMuscleForTaxonomyId(muscleId) {
        const family = programmingFamilyApi?.programmingFamilyId ? programmingFamilyApi.programmingFamilyId(muscleId) : prescriptionApi?.muscleFamily ? prescriptionApi.muscleFamily(muscleId) : normalizePrescriptionIdentity(muscleId);
        return ({ chest: "Chest", upper_back: "Back", lats: "Back", traps: "Back", spinal_erectors: "Back", quads: "Quads", quadriceps: "Quads", hamstrings: "Hamstrings", glutes: "Glutes", adductors: "Adductors", abductors: "Glutes", front_delts: "Shoulders", side_delts: "Shoulders", rear_delts: "Shoulders", biceps: "Biceps", triceps: "Triceps", forearms: "Forearms", calves: "Calves", abs: "Core", abdominals: "Core", obliques: "Core", neck: "Neck" })[family] || null;
      }

      function taxonomyMusclesForExercise(exercise) {
        const research = prescriptionEngine?.evidence?.research;
        if (!research?.muscleMapsByExercise || !research?.exerciseById) return [];
        const identity = resolvePrescriptionExerciseIdentity(exercise);
        const canonicalId = identity.status === "resolved" && research.exerciseById.has(identity.exerciseId) ? identity.exerciseId : "";
        if (!canonicalId) return [];
        const relationships = research.muscleMapsByExercise.get(canonicalId) || [];
        const versions = new Set(relationships.map((mapping) => String(mapping.taxonomy_version || mapping.taxonomyVersion || "").trim()).filter(Boolean));
        if (!relationships.length || versions.size !== 1 || relationships.some((mapping) => !String(mapping.taxonomy_version || mapping.taxonomyVersion || "").trim())) return [];
        const coalesced = programmingFamilyApi?.coalesceRelationshipsByProgrammingFamily
          ? programmingFamilyApi.coalesceRelationshipsByProgrammingFamily(relationships)
          : relationships.map((mapping) => ({ programmingFamilyId: mapping.programming_family_id || mapping.muscle_group_id, relationshipType: mapping.relationship_type, setContribution: Number(mapping.fractional_set_credit || 0) }));
        const displayed = new Map();
        coalesced.filter((mapping) => Number(mapping.setContribution || 0) > 0).forEach((mapping) => {
          const muscle = displayMuscleForTaxonomyId(mapping.programmingFamilyId);
          if (!muscle) return;
          const current = displayed.get(muscle);
          if (!current || mapping.setContribution > current.weight) displayed.set(muscle, {
            muscle,
            weight: Number(mapping.setContribution),
            programmingFamilyId: mapping.programmingFamilyId,
            relationshipType: mapping.relationshipType,
            canonicalExerciseId: canonicalId,
            taxonomyVersion: [...versions][0]
          });
        });
        return [...displayed.values()];
      }

      function musclesForExercise(exerciseOrName, options = {}) {
        const exercise = typeof exerciseOrName === "string" ? { name: exerciseOrName } : (exerciseOrName || {});
        const cacheKey = [exercise.name || "", exercise.primaryMuscle || "", exercise.secondaryMuscle || "", options.ignoreManual ? "automatic" : "resolved"].join("|");
        if (muscleAssignmentCache.has(cacheKey)) return muscleAssignmentCache.get(cacheKey);
        let result;
        const identityProfile = typeof resolveExerciseIdentityProfile === "function" ? resolveExerciseIdentityProfile(exercise) : { researchExerciseId: null };
        const canonicalId = canonicalExerciseId(exercise);
        const evidence = prescriptionEngine?.evidence;
        const normalizedName = normalizePrescriptionIdentity(exercise.name);
        const publicResearchId = evidence?.research?.exerciseIdByAlias?.get(normalizedName)
          || evidence?.research?.exerciseDatabase?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalizedName)?.exercise_id;
        const personalRecord = !publicResearchId && (typeof personalExerciseRecordForName === "function"
          ? personalExerciseRecordForName(exercise.name, evidence)
          : evidence?.personal?.exerciseScores?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalizedName)
            || evidence?.personal?.exercisePrescriptions?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalizedName)
            || evidence?.personal?.exerciseMuscleScores?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalizedName));
        const personalId = personalRecord?.exercise_id || personalRecord?.exerciseId || "";
        const invalidReconciledIdentity = Boolean(personalId && evidence?.personal?.reconciledIdentityByExerciseId?.get(personalId)?.invalid);
        const customOrUnmappedExercise = !canonicalId || !identityProfile.researchExerciseId;
        const taxonomy = taxonomyMusclesForExercise(exercise);
        if (invalidReconciledIdentity) {
          result = [];
        } else if (taxonomy.length) {
          result = taxonomy;
        } else if (!customOrUnmappedExercise) {
          result = [];
        } else if (!options.ignoreManual && exercise.primaryMuscle) {
          const manual = [[exercise.primaryMuscle, 1]];
          if (exercise.secondaryMuscle && exercise.secondaryMuscle !== exercise.primaryMuscle) manual.push([exercise.secondaryMuscle, 0.5]);
          result = normalizeMuscleMatches(manual);
        } else {
          // Regex inference is deliberately limited to explicit custom or otherwise unmapped exercises.
          const automatic = automaticMusclesForName(exercise.name);
          result = !options.ignoreManual && exercise.secondaryMuscle && !automatic.some((item) => item.muscle === exercise.secondaryMuscle)
            ? normalizeMuscleMatches([...automatic.map((item) => [item.muscle, item.weight]), [exercise.secondaryMuscle, 0.5]])
            : automatic;
        }
        muscleAssignmentCache.set(cacheKey, result);
        return result;
      }

      function completedWorkoutEntries() {
        if (completedEntriesCache?.revision === analysisRevision) return completedEntriesCache.entries;
        const index = completedAnalysisIndex();
        const entries = data.sets
          .map((set) => {
            const exercise = index.exerciseById.get(set.exerciseId);
            const session = exercise ? index.sessionById.get(exercise.sessionId) : null;
            return exercise && session ? { set, exercise, session } : null;
          })
          .filter((entry) => entry && entry.set.completed && isWorkingSet(entry.set, "volume") && (entry.set.reps > 0 || entry.set.durationSeconds > 0 || entry.set.distance > 0));
        completedEntriesCache = { revision: analysisRevision, entries };
        return entries;
      }

      function weeklyMuscleVolume(weekStart = startOfWeekIso(todayIso())) {
        const familyVersion = programmingFamilyApi?.PROGRAMMING_FAMILY_VERSION || "family_ledger_unavailable";
        const cacheKey = analysisRevision + "|" + familyVersion + "|" + weekStart;
        if (weeklyVolumeCache.has(cacheKey)) return weeklyVolumeCache.get(cacheKey);
        const activeSessionIds = activeHistorySessionIds();
        const buckets = new Map(muscleGroups.map((muscle) => [muscle, { muscle, sets: 0, directSets: 0, indirectSets: 0, highRpeSets: 0, failedSets: 0, exercises: new Set(), exerciseDetails: new Map(), sessionDetails: new Map(), submittedSessions: new Map(), excludedDeloadSessions: new Map() }]));
        const end = new Date(weekStart + "T00:00:00");
        end.setDate(end.getDate() + 7);
        const endIso = localDateIso(end);
        const familyProjectionRecords = [];
        completedWorkoutEntries().forEach((entry) => {
          if (!activeSessionIds.has(entry.session.id) || entry.session.date < weekStart || entry.session.date >= endIso) return;
          if (entry.exercise.isDeload) {
            musclesForExercise(entry.exercise).forEach(({ muscle }) => buckets.get(muscle)?.excludedDeloadSessions.set(entry.session.id, { id: entry.session.id, title: entry.session.title || "Workout", date: entry.session.date }));
            return;
          }
          const projectionIdentity = resolvePrescriptionExerciseIdentity(entry.exercise);
          if (projectionIdentity.status === "resolved" && prescriptionEngine?.evidence?.research?.exerciseById?.has(projectionIdentity.exerciseId)) {
            familyProjectionRecords.push({ exerciseId: entry.exercise.id, researchExerciseId: projectionIdentity.exerciseId, exerciseName: entry.exercise.name, workingSets: 1 });
          }
          musclesForExercise(entry.exercise).forEach(({ muscle, weight }) => {
            const bucket = buckets.get(muscle);
            if (!bucket) return;
            bucket.sets += weight;
            if (weight >= 1) bucket.directSets += weight;
            else bucket.indirectSets += weight;
            if (entry.set.rpe >= 9) bucket.highRpeSets += weight;
            bucket.exercises.add(entry.exercise.name);
            bucket.submittedSessions.set(entry.session.id, { id: entry.session.id, title: entry.session.title || "Workout", date: entry.session.date });
            const detail = bucket.exerciseDetails.get(entry.exercise.name) || { name: entry.exercise.name, sets: 0, directSets: 0, indirectSets: 0, volumeLoad: 0, sessions: new Map() };
            detail.sets += weight;
            if (weight >= 1) detail.directSets += weight;
            else detail.indirectSets += weight;
            if (resistanceTypeFor(entry.exercise, entry.set) === "external") detail.volumeLoad += Number(entry.set.weight || 0) * Number(entry.set.reps || 0) * weight;
            detail.sessions.set(entry.session.id, { id: entry.session.id, title: entry.session.title || "Workout", date: entry.session.date });
            bucket.exerciseDetails.set(entry.exercise.name, detail);
            const sessionDetail = bucket.sessionDetails.get(entry.session.id) || { id: entry.session.id, title: entry.session.title || "Workout", date: entry.session.date, sets: 0, directSets: 0, indirectSets: 0, exercises: new Map() };
            sessionDetail.sets += weight;
            if (weight >= 1) sessionDetail.directSets += weight;
            else sessionDetail.indirectSets += weight;
            const sessionExercise = sessionDetail.exercises.get(entry.exercise.id) || { id: entry.exercise.id, name: entry.exercise.name, sets: 0, directSets: 0, indirectSets: 0, volumeLoad: 0 };
            sessionExercise.sets += weight;
            if (weight >= 1) sessionExercise.directSets += weight;
            else sessionExercise.indirectSets += weight;
            if (resistanceTypeFor(entry.exercise, entry.set) === "external") sessionExercise.volumeLoad += Number(entry.set.weight || 0) * Number(entry.set.reps || 0) * weight;
            sessionDetail.exercises.set(entry.exercise.id, sessionExercise);
            bucket.sessionDetails.set(entry.session.id, sessionDetail);
          });
        });
        data.sets.filter((set) => !set.completed && !set.skipped && isWorkingSet(set, "volume")).forEach((set) => {
          const exercise = data.exercises.find((item) => item.id === set.exerciseId);
          const session = exercise ? data.sessions.find((item) => item.id === exercise.sessionId) : null;
          if (!exercise || !session || !activeSessionIds.has(session.id) || exercise.isDeload || session.date < weekStart || session.date >= endIso) return;
          musclesForExercise(exercise).forEach(({ muscle, weight }) => {
            const bucket = buckets.get(muscle);
            if (bucket) bucket.failedSets += weight;
          });
        });
        const familyProjection = prescriptionApi?.recalculateHistoricalMuscleVolume && prescriptionEngine?.evidence
          ? prescriptionApi.recalculateHistoricalMuscleVolume(prescriptionEngine.evidence, familyProjectionRecords)
          : { taxonomyVersion: "unknown", familyProjectionStatus: "blocked_unverifiable_taxonomy", ledgerVersion: null, programmingFamilyVersion: familyVersion, familyTotals: [], rollbackContract: null };
        const result = Array.from(buckets.values()).map((bucket) => {
          const target = targetRangeForMuscle(bucket.muscle);
          const status = bucket.sets < target.low ? "low" : bucket.sets > target.high ? "over" : "good";
          const details = Array.from(bucket.exerciseDetails.values()).map((detail) => ({
            name: detail.name,
            sets: detail.sets,
            directSets: detail.directSets,
            indirectSets: detail.indirectSets,
            volumeLoad: detail.volumeLoad,
            sessions: Array.from(detail.sessions.values()).sort((a, b) => a.date.localeCompare(b.date))
          })).sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
          const sessionGroups = Array.from(bucket.sessionDetails.values()).map((session) => ({ ...session, exercises: Array.from(session.exercises.values()).sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name)) })).sort((a, b) => a.date.localeCompare(b.date));
          return { ...bucket, taxonomyVersion: familyProjection.taxonomyVersion, familyProjectionStatus: familyProjection.familyProjectionStatus, ledgerVersion: familyProjection.ledgerVersion, programmingFamilyVersion: familyProjection.programmingFamilyVersion, familyTotals: familyProjection.familyTotals, rollbackContract: familyProjection.rollbackContract, details, sessionGroups, sessions: Array.from(bucket.submittedSessions.values()).sort((a, b) => a.date.localeCompare(b.date)), excludedDeloadSessions: Array.from(bucket.excludedDeloadSessions.values()).sort((a, b) => a.date.localeCompare(b.date)), exerciseCount: bucket.exercises.size, targetLow: target.low, targetHigh: target.high, status };
        });
        weeklyVolumeCache.set(cacheKey, result);
        return result;
      }

      function unifiedSnapshotForFatigueFlag(flag, weekStart) {
        if (!prescriptionEngine || !["Lift", "Muscle"].includes(flag.scope)) return null;
        const weekEnd = new Date(`${weekStart}T12:00:00`);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const throughDate = localDateIso(weekEnd) > todayIso() ? todayIso() : localDateIso(weekEnd);
        const names = flag.scope === "Lift"
          ? [flag.name]
          : getExerciseNames().filter((name) => musclesForExercise({ name }).some((item) => item.muscle === flag.name)).slice(0, 8);
        if (!names.length) return null;
        const template = { id: `fatigue-${flag.id}`, exercises: names.map((name) => ({ name })) };
        const priority = { full_program_deload: 9, muscle_group_deload: 8, exercise_deload: 7, rotate_exercise: 6, substitute: 6, reduce_volume: 5, light_session: 4, hold: 3, normal: 2, progress: 1 };
        const snapshots = names.map((name) => unifiedPrescriptionSnapshot({ name }, { throughDate, historical: true, template, mesocycle: null, fresh: true }));
        const engineFailure = snapshots.find((snapshot) => (snapshot?.type || snapshot?.kind) === "engine_failure");
        if (engineFailure) return engineFailure;
        return snapshots.filter((snapshot) => snapshot?.finalPrescription
          && snapshot.hardConstraint !== true
          && snapshot.type !== "hard_constraint_rejection"
          && snapshot.kind !== "hard_constraint_rejection")
          .sort((a, b) => Number(priority[b.finalPrescription.recommendationType] || 0) - Number(priority[a.finalPrescription.recommendationType] || 0))[0] || null;
      }

      function fatigueFlags(weekStart = startOfWeekIso(todayIso())) {
        const cacheKey = analysisRevision + "|" + weekStart;
        if (fatigueFlagCache.has(cacheKey)) return fatigueFlagCache.get(cacheKey);
        const flags = [];
        getExerciseNames().forEach((name) => {
          const weeks = summarizeExerciseByWeek(name);
          const current = weeks.find((week) => week.weekStart === weekStart);
          const previous = weeks.find((week) => week.weekStart < weekStart && !week.isLikelyDeload && !week.intentionalReduction);
          if (!current) return;
          const drop = previous && current.bestEstimatedOneRepMax > 0 && current.bestEstimatedOneRepMax < previous.bestEstimatedOneRepMax * 0.93;
          if (current.failedSets >= 2) flags.push({ id: "lift-" + exerciseKey(name) + "-misses", scope: "Lift", name, level: "over", concern: "high", triggeredAt: current.weekStart, reason: "Two or more planned sets were missed or left incomplete.", evidence: [current.failedSets + " missed sets this week", current.completedSets + " completed sets", current.averageRpe ? "Average completed-set RPE " + current.averageRpe.toFixed(1) : "No reliable RPE average"], rule: "The lift flag activates at 2 or more missed working sets in the selected week.", recommendation: "Hold load or reduce it 5-10%, complete the programmed reps with clean technique, and avoid adding sets this week.", resolution: "Complete a comparable session with fewer than 2 misses and without another performance decline." });
          else if (current.averageRpe >= 9.2 && current.completedSets >= 2) flags.push({ id: "lift-" + exerciseKey(name) + "-rpe", scope: "Lift", name, level: "caution", concern: "moderate", triggeredAt: current.weekStart, reason: "Target effort was exceeded repeatedly.", evidence: ["Average RPE " + current.averageRpe.toFixed(1), current.completedSets + " completed working sets", "Caution threshold: average RPE 9.2"], rule: "The lift flag activates when at least 2 completed sets average RPE 9.2 or higher.", recommendation: "Repeat the load and stop 1-2 reps earlier, or reduce the next load increment if the equipment jump is large.", resolution: "Log a comparable session averaging below RPE 9.2 with stable reps and no repeated misses." });
          else if (drop && !current.intentionalReduction) {
            const change = ((current.bestEstimatedOneRepMax / previous.bestEstimatedOneRepMax - 1) * 100).toFixed(1);
            flags.push({ id: "lift-" + exerciseKey(name) + "-performance", scope: "Lift", name, level: "caution", concern: "moderate", triggeredAt: current.weekStart, reason: "Estimated performance declined versus the prior comparable week.", evidence: ["Estimated 1RM change " + change + "%", "Current " + current.bestEstimatedOneRepMax.toFixed(1) + " vs prior " + previous.bestEstimatedOneRepMax.toFixed(1) + " " + data.settings.weightUnit, "Deload weeks are excluded from the comparison"], rule: "The lift flag activates after a greater than 7% estimated 1RM decline versus the prior non-deload week.", recommendation: "Hold the prior successful load, check technique and recovery, and use a smaller progression only after reps stabilize.", resolution: "Return within 7% of the prior comparable estimated performance without high-RPE or missed-set warnings." });
          }
        });
        weeklyMuscleVolume(weekStart).forEach((bucket) => {
          if (bucket.sets > bucket.targetHigh) flags.push({ id: "muscle-" + bucket.muscle.toLowerCase() + "-volume", scope: "Muscle", name: bucket.muscle, level: "over", concern: bucket.sets > bucket.targetHigh * 1.2 ? "high" : "moderate", triggeredAt: weekStart, reason: "Weekly volume exceeded the planned range.", evidence: [bucket.sets.toFixed(bucket.sets % 1 ? 1 : 0) + " weighted sets logged", "Target range " + bucket.targetLow + "-" + bucket.targetHigh + " sets", bucket.directSets.toFixed(bucket.directSets % 1 ? 1 : 0) + " direct and " + bucket.indirectSets.toFixed(bucket.indirectSets % 1 ? 1 : 0) + " indirect sets"], rule: "The flag uses the Monday-Sunday calendar week and activates when completed weighted sets exceed the configured upper target. Direct sets count as 1; mapped secondary work counts fractionally. Only submitted workouts are included, and explicitly marked deload exercises are excluded.", recommendation: "Do not add more volume this week. Keep remaining work easy or move it to the next training week.", resolution: "Return weekly volume to the target range and avoid a simultaneous decline in reps or recovery.", detailType: "weekly-volume", volumeDetail: { muscle: bucket.muscle, weekStart, targetLow: bucket.targetLow, targetHigh: bucket.targetHigh, actual: bucket.sets, exceededBy: bucket.sets - bucket.targetHigh, directSets: bucket.directSets, indirectSets: bucket.indirectSets, contributions: bucket.details, sessionGroups: bucket.sessionGroups, sessions: bucket.sessions, excludedDeloadSessions: bucket.excludedDeloadSessions } });
          else if (bucket.highRpeSets >= 4) flags.push({ id: "muscle-" + bucket.muscle.toLowerCase() + "-rpe", scope: "Muscle", name: bucket.muscle, level: "caution", concern: "moderate", triggeredAt: weekStart, reason: "Several sets for this muscle were performed at RPE 9 or higher.", evidence: [bucket.highRpeSets.toFixed(bucket.highRpeSets % 1 ? 1 : 0) + " high-RPE weighted sets", bucket.sets.toFixed(bucket.sets % 1 ? 1 : 0) + " total weighted sets", "Caution threshold: 4 high-RPE sets"], rule: "The muscle flag activates at 4 or more weighted sets logged at RPE 9+ in one week.", recommendation: "Keep the next exposure 1-2 reps in reserve and avoid increasing both load and volume.", resolution: "Complete the next week with fewer than 4 high-RPE sets and stable performance." });
          else if (bucket.failedSets >= 2) flags.push({ id: "muscle-" + bucket.muscle.toLowerCase() + "-misses", scope: "Muscle", name: bucket.muscle, level: "caution", concern: "moderate", triggeredAt: weekStart, reason: "Multiple planned sets for this muscle were not completed.", evidence: [bucket.failedSets.toFixed(bucket.failedSets % 1 ? 1 : 0) + " weighted missed sets", bucket.sets.toFixed(bucket.sets % 1 ? 1 : 0) + " completed weighted sets", "Caution threshold: 2 missed sets"], rule: "The muscle flag activates at 2 or more weighted missed sets in the selected week.", recommendation: "Hold or reduce volume for this muscle and repeat the last successful loading pattern.", resolution: "Complete the next exposure with fewer than 2 misses and no further rep decline." });
        });
        const recoveryAlerts = dashboardSessionsForWeek(weekStart).map((session) => ({ session, advice: recoveryRecommendationForSession(session) })).filter((item) => ["rest", "deload", "light_session"].includes(item.advice.decision));
        if (recoveryAlerts.length) {
          const highest = recoveryAlerts.find((item) => item.advice.decision === "rest") || recoveryAlerts[0];
          flags.push({ id: "recovery-" + weekStart, scope: "Recovery", name: "Readiness", level: highest.advice.decision === "rest" ? "over" : "caution", concern: highest.advice.decision === "rest" ? "high" : "moderate", triggeredAt: highest.session.date, reason: recoveryAlerts.length + " session" + (recoveryAlerts.length === 1 ? "" : "s") + " started outside the normal low-readiness band.", evidence: recoveryAlerts.slice(0, 4).map((item) => formatDate(item.session.date) + ": " + item.advice.label), rule: "Recovery flags use the personal readiness baseline and band; low out-of-band days that call for deload or rest are included.", recommendation: highest.advice.action, resolution: "Return inside the personal readiness band or record a clear note explaining a temporary outside-band result." });
        }
        const unifiedFlags = flags.map((flag) => {
          const snapshot = unifiedSnapshotForFatigueFlag(flag, weekStart);
          if (!snapshot) return flag;
          if ((snapshot.type || snapshot.kind) === "engine_failure") {
            const unavailableMessage = "Recommendation guidance is unavailable because the prescription engine could not generate a recommendation.";
            return {
              ...flag,
              recommendation: unavailableMessage,
              recommendationUnavailable: true,
              recommendationStatus: "unavailable",
              recommendationType: "engine_failure",
              recommendationId: null,
              engineFailure: { type: "engine_failure", code: snapshot.code || "PRESCRIPTION_ENGINE_FAILURE", status: "unavailable", message: unavailableMessage },
              evidence: [...flag.evidence, "Unified prescription guidance was unavailable for this retrospective flag."],
              rule: `${flag.rule} The retrospective flag remains visible, but no executable recommendation was generated.`
            };
          }
          const prescription = snapshot.finalPrescription;
          return {
            ...flag,
            recommendation: prescription.progressionRule,
            recommendationType: prescription.recommendationType,
            recommendationId: snapshot.recommendationId,
            prescriptionConfidence: prescription.confidence,
            evidence: [...flag.evidence, ...prescription.evidenceSummary.slice(0, 2)],
            rule: `${flag.rule} This flag is retrospective evidence; the action above comes from unified prescription ${snapshot.recommendationId}.`,
            resolution: prescription.holdRule
          };
        });
        fatigueFlagCache.set(cacheKey, unifiedFlags);
        return unifiedFlags;
      }

      function readinessBaseline() {
        return cleanReadinessBaseline(data.settings.readinessBaseline || {});
      }

      function recoveryRecommendationForSession(session) {
        const recovery = sessionRecovery(session);
        if (recovery.illness) {
          return { decision: "rest", label: "Rest recommended", action: "Current illness blocks the whole workout. Resume only after the acute restriction resolves; seek qualified guidance for severe, unexplained, or persistent symptoms.", score: 0, evidence: ["Current illness was explicitly reported."], evaluation: null };
        }
        if (recovery.pain) {
          const affected = recovery.affectedMuscle ? ` affecting ${recovery.affectedMuscle}` : " without a specified affected area";
          return { decision: "rest", label: "Stop affected work", action: "Do not test a painful movement at a lower load. Use only a distinct, explicitly confirmed pain-free alternative, or stop the affected work and seek qualified evaluation when pain is severe, unexplained, or persistent.", score: 0, evidence: [`Pain or injury was explicitly reported${affected}.`], evaluation: null };
        }
        if (prescriptionEngine) {
          const evaluation = prescriptionEngine.evaluateReadiness(prescriptionReadiness(recovery, []));
          const evidence = evaluation.signals.map((signal) => signal.explanation);
          if (!evaluation.signals.length) evidence.push("No independent adverse readiness domain was detected; use the base prescription.");
          if (evaluation.signalCount < 2) {
            if (evaluation.signalCount === 1) evidence.push("One isolated HRV, resting-heart-rate, sleep, soreness, or nutrition marker is monitored but cannot trigger a deload by itself.");
            return { decision: "hold", label: evaluation.signalCount ? "Monitor one readiness marker" : "Go as planned", action: "Use the base prescription. Adjust only if another independent marker, warm-up performance, pain, or comparable-set regression also worsens.", score: evaluation.severity, evidence, evaluation };
          }
          return { decision: "light_session", label: "Temporary readiness adjustment", action: "Use today's adjusted prescription with fewer sets and/or lower load and effort. This does not rewrite the mesocycle or count as an exercise deload.", score: evaluation.severity, evidence, evaluation };
        }
        return { decision: "hold", label: "Go as planned", action: "The readiness engine is unavailable, so keep the base prescription and use warm-ups, pain, and technique to decide whether to stop or modify work.", score: 0, evidence: ["Readiness engine unavailable; no automatic adjustment was applied."], evaluation: null };
      }

      function enteredReadinessTriggers(recoveryInput) {
        const recovery = cleanRecovery(recoveryInput);
        const baseline = readinessBaseline();
        const triggers = [];
        if (recovery.sleepHours !== "" && Number(recovery.sleepHours) <= Number(baseline.sleepHours) - 1) triggers.push({ key: "sleep", label: "Sleep " + recovery.sleepHours + "h vs " + baseline.sleepHours + "h baseline", systemic: true });
        if (recovery.sleepQuality !== "" && Number(recovery.sleepQuality) <= Number(baseline.sleepQuality) - 1) triggers.push({ key: "sleep-quality", label: "Sleep quality " + recovery.sleepQuality + "/5 vs " + baseline.sleepQuality + "/5 baseline", systemic: true });
        if (recovery.hrv !== "" && Number(baseline.hrv) > 0 && Number(recovery.hrv) < Number(baseline.hrv) * 0.85) triggers.push({ key: "hrv", label: "HRV " + recovery.hrv + " vs " + baseline.hrv + " baseline", systemic: true });
        if (recovery.restingHr !== "" && Number(baseline.restingHr) > 0 && Number(recovery.restingHr) >= Number(baseline.restingHr) + 5) triggers.push({ key: "resting-hr", label: "Resting HR " + recovery.restingHr + " vs " + baseline.restingHr + " baseline", systemic: true });
        if (recovery.soreness !== "" && Number(recovery.soreness) >= 4) triggers.push({ key: "soreness", label: "Soreness " + recovery.soreness + "/5" + (recovery.affectedMuscle ? " in " + recovery.affectedMuscle : " across the body"), systemic: !recovery.affectedMuscle, muscle: recovery.affectedMuscle });
        if (recovery.illness) triggers.push({ key: "illness", label: "Current illness", systemic: true });
        if (recovery.pain) triggers.push({ key: "pain", label: recovery.affectedMuscle ? "Pain or injury affecting " + recovery.affectedMuscle : "Pain or injury with no affected area specified", systemic: !recovery.affectedMuscle, muscle: recovery.affectedMuscle });
        return triggers;
      }

      function triggerAppliesToExercise(trigger, exerciseName) {
        if (trigger.systemic || !trigger.muscle) return true;
        return musclesForExercise(exerciseName).some((item) => normalizePrescriptionIdentity(item.muscle) === normalizePrescriptionIdentity(trigger.muscle));
      }

      function targetWasAdjusted(original, adjusted) {
        return ["sets", "reps", "weight", "rpe", "restSeconds"].some((key) => Number(original[key] || 0) !== Number(adjusted[key] || 0));
      }

      function describeReadinessTargetChanges(original, adjusted) {
        const changes = [];
        if (Number(original.weight || 0) !== Number(adjusted.weight || 0)) changes.push("resistance changed from " + formatResistance(original) + " to " + formatResistance(adjusted));
        if (Number(original.sets || 0) !== Number(adjusted.sets || 0)) changes.push("working sets changed from " + original.sets + " to " + adjusted.sets);
        if (Number(original.reps || 0) !== Number(adjusted.reps || 0)) changes.push("reps changed from " + original.reps + " to " + adjusted.reps);
        if (Number(original.rpe || 0) !== Number(adjusted.rpe || 0)) changes.push("target RPE changed from " + original.rpe + " to " + adjusted.rpe);
        if (Number(original.restSeconds || 0) !== Number(adjusted.restSeconds || 0)) changes.push("rest changed from " + original.restSeconds + "s to " + adjusted.restSeconds + "s");
        const description = changes.length ? changes.join(", ") : "the original target was preserved";
        return description.charAt(0).toUpperCase() + description.slice(1);
      }

      function explainReadinessAdjustmentChoice(original, adjusted, triggers) {
        const explanations = [];
        const systemic = triggers.some((trigger) => trigger.systemic && ["sleep", "sleep-quality", "hrv", "resting-hr", "illness", "pain"].includes(trigger.key));
        const local = triggers.some((trigger) => !trigger.systemic && ["soreness", "pain"].includes(trigger.key));
        if (Number(adjusted.weight || 0) < Number(original.weight || 0)) {
          explanations.push("Load was reduced before changing the rep target so the exercise can stay in its programmed hypertrophy range with less risk of overshooting effort or missing later reps.");
        } else if (!(original.weight > 0) && Number(adjusted.sets || 0) < Number(original.sets || 0)) {
          explanations.push("This movement has no adjustable external load, so the rule reduces total sets instead of inventing a lighter resistance target.");
        }
        if (Number(adjusted.reps || 0) < Number(original.reps || 0)) {
          explanations.push("Reps were lowered because preserving the original rep count at the adjusted effort would still create too much fatigue; the new target remains inside the programmed range.");
        } else if (Number(adjusted.reps || 0) === Number(original.reps || 0)) {
          explanations.push("Reps were preserved because they remain inside the intended range; recovery is managed through load, sets, effort, and rest instead of removing useful practice reps.");
        }
        if (Number(adjusted.sets || 0) < Number(original.sets || 0)) explanations.push("Working sets were reduced to lower total fatigue exposure while retaining enough quality work to practice the lift.");
        if (Number(adjusted.rpe || 0) < Number(original.rpe || 0)) explanations.push("Target RPE was lowered to leave more repetitions in reserve, matching the reduced recovery capacity indicated by today's markers.");
        if (Number(adjusted.restSeconds || 0) > Number(original.restSeconds || 0)) explanations.push("Rest was increased to protect performance quality between the remaining sets.");
        if (local) explanations.push("The soreness or pain marker is local, so this adjustment applies only to exercises that train the affected muscle group.");
        else if (systemic) explanations.push("Sleep, HRV, resting heart rate, illness, and pain without a specified area are systemic markers, so the rule can adjust all applicable exercises rather than one muscle group.");
        return explanations.join(" ");
      }

      function adjustTargetForRecovery(target, recoveryAdvice, context = {}) {
        const recovery = cleanRecovery(context.recovery || {});
        if (target?.recommendationSnapshot && typeof unifiedPrescriptionSnapshot === "function") {
          const sourceSnapshot = target.recommendationSnapshot;
          const adjustedSnapshot = unifiedPrescriptionSnapshot({ name: context.exerciseName || sourceSnapshot.exerciseId }, {
            exerciseId: sourceSnapshot.exerciseId,
            muscleGroupId: sourceSnapshot.muscleGroupId,
            throughDate: String(sourceSnapshot.createdAt || todayIso()).slice(0, 10),
            recovery,
            template: context.template,
            mesocycle: currentMesocycle(),
            createdAt: sourceSnapshot.createdAt
          });
          if (adjustedSnapshot) {
            const templateExercise = context.template?.exercises?.find((item) => exerciseMatches(item.name, context.exerciseName || sourceSnapshot.exerciseId)) || {};
            const executableSnapshot = prescriptionSnapshotWithTemplateStandard(adjustedSnapshot, templateExercise, { template: context.template, workoutId: context.workoutId });
            return legacyTargetFromSnapshot(executableSnapshot, { name: context.exerciseName || sourceSnapshot.exerciseId, resistanceType: target.resistanceType, increment: target.increment });
          }
        }
        const applicableTriggers = enteredReadinessTriggers(recovery).filter((trigger) => triggerAppliesToExercise(trigger, context.exerciseName || ""));
        const targetedConcern = applicableTriggers.some((trigger) => ["soreness", "pain"].includes(trigger.key));
        const severeConcern = applicableTriggers.some((trigger) => ["illness", "pain"].includes(trigger.key));
        const reducedWeight = (multiplier) => {
          if (!(target.weight > 0)) return 0;
          const increment = Number(target.increment || (data.settings.weightUnit === "kg" ? 2.5 : 5));
          if (target.resistanceType === "assisted_bodyweight") return roundToIncrement(target.weight * (2 - multiplier), increment);
          return Math.min(target.weight, roundToIncrement(target.weight * multiplier, increment));
        };
        if (!applicableTriggers.length || (!["rest", "deload"].includes(recoveryAdvice.decision) && !targetedConcern)) {
          if (recoveryAdvice.decision === "progress") {
            const reason = "High readiness did not add work beyond the conservative progression supported by your lift history.";
            return { ...target, reason, adjusted: false, adjustmentReason: "", triggerLabels: [], text: targetText(target, reason) };
          }
          return { ...target, adjusted: false, adjustmentReason: "", triggerLabels: [], text: target.text || targetText(target, "Inside your normal band: use the normal plan and planned progression.") };
        }
        const triggerText = applicableTriggers.map((trigger) => trigger.label).join("; ");
        if (severeConcern) {
          const illness = applicableTriggers.some((trigger) => trigger.key === "illness");
          const reason = (context.exerciseName ? context.exerciseName + " is blocked because " : "Blocked because ") + triggerText + ". " + (illness ? "This restriction applies to the whole workout." : "Do not test the affected movement at a lower load; use only a distinct, explicitly confirmed pain-free alternative or stop that work.");
          const blocked = {
            ...target,
            decision: illness ? "hold" : "substitute",
            mode: "stop-modify",
            interventionType: "stop_modify",
            executionBlocked: true,
            safetyAdjustment: true,
            sets: 0,
            reps: 0,
            repLow: 0,
            repHigh: 0,
            weight: 0,
            addedLoad: 0,
            assistanceLoad: 0,
            rpe: 0,
            restSeconds: 0,
            warmups: [],
            executableActions: [],
            safetyRestriction: {
              schemaVersion: "hard-safety/1.0.0",
              status: "blocked",
              scope: illness ? "workout" : "exercise",
              reason: illness ? "illness" : "pain",
              resumeCriteria: illness ? "Resume only after the acute illness restriction resolves." : "Resume the affected movement only when it is pain-free."
            },
            adjusted: true,
            adjustmentReason: reason,
            triggerLabels: applicableTriggers.map((trigger) => trigger.label)
          };
          return { ...blocked, reason, text: targetText(blocked, reason) };
        }
        if (recoveryAdvice.decision === "rest") {
          const weight = reducedWeight(0.85);
          const adjusted = { ...target, mode: "stop-modify", interventionType: "stop_modify", safetyAdjustment: true, baseInterventionType: target.coachRecommendation?.interventionType || target.mode || "normal", sets: Math.max(1, Math.ceil(target.sets * 0.5)), weight, addedLoad: target.resistanceType === "bodyweight_plus_load" ? weight : 0, assistanceLoad: target.resistanceType === "assisted_bodyweight" ? weight : 0, rpe: 6, restSeconds: Math.max(Number(target.restSeconds || 0), Number(target.restSeconds || 0) + 15), isDeload: Boolean(target.isDeload) };
          const reason = (context.exerciseName ? context.exerciseName + " was adjusted because " : "Adjusted because ") + triggerText + ". " + describeReadinessTargetChanges(target, adjusted) + ". Why these levers: " + explainReadinessAdjustmentChoice(target, adjusted, applicableTriggers);
          return { ...adjusted, reason, adjusted: targetWasAdjusted(target, adjusted), adjustmentReason: reason, triggerLabels: applicableTriggers.map((trigger) => trigger.label), text: targetText(adjusted, reason) };
        }
        if (recoveryAdvice.decision === "deload" || targetedConcern) {
          const weight = reducedWeight(0.9);
          const adjusted = { ...target, mode: targetedConcern ? "readiness-adjusted" : "deload", interventionType: target.isDeload ? "deload" : targetedConcern ? "readiness_adjusted" : "deload", baseInterventionType: target.coachRecommendation?.interventionType || target.mode || "normal", sets: Math.max(1, Math.ceil(target.sets * 0.65)), weight, addedLoad: target.resistanceType === "bodyweight_plus_load" ? weight : 0, assistanceLoad: target.resistanceType === "assisted_bodyweight" ? weight : 0, rpe: 6.5, restSeconds: Math.max(Number(target.restSeconds || 0), Number(target.restSeconds || 0) + 15), isDeload: Boolean(target.isDeload || (recoveryAdvice.decision === "deload" && !targetedConcern)) };
          const reason = (context.exerciseName ? context.exerciseName + " was adjusted because " : "Adjusted because ") + triggerText + ". " + describeReadinessTargetChanges(target, adjusted) + ". Why these levers: " + explainReadinessAdjustmentChoice(target, adjusted, applicableTriggers);
          return { ...adjusted, reason, adjusted: targetWasAdjusted(target, adjusted), adjustmentReason: reason, triggerLabels: applicableTriggers.map((trigger) => trigger.label), text: targetText(adjusted, reason) };
        }
        return { ...target, adjusted: false, adjustmentReason: "", triggerLabels: [], text: target.text || targetText(target, "Use the normal plan.") };
      }

      function templateReadinessPreview(template, recovery) {
        const advice = recoveryRecommendationForSession({ id: "readiness-preview", date: todayIso(), recovery });
        return template.exercises.map((templateExercise) => {
          const resistanceType = templateExercise.resistanceType || inferResistanceType(templateExercise.name, templateExercise);
          const original = { ...coachTargetForTemplateExercise(templateExercise, { template }), resistanceType, isBodyweight: isBodyweightResistance(resistanceType), restSeconds: Number(templateExercise.restSeconds || recommendedRestSeconds(templateExercise.name)) };
          const adjusted = adjustTargetForRecovery(original, advice, { recovery, exerciseName: templateExercise.name, template });
          return { name: templateExercise.name, original, adjusted, changed: Boolean(adjusted.adjusted), reason: adjusted.adjustmentReason || "No readiness change was required.", triggers: adjusted.triggerLabels || [] };
        });
      }

      function createTemplatesFromStrongSessions(importedSessions, importedExercises, importedSets) {
        const existingTemplateNames = new Set(data.templates.map((template) => template.name.trim().toLowerCase()));
        const activeImportedSessionIds = new Set(activeCompletedWorkoutHistory({ sessions: importedSessions }, { asOfDate: todayIso() }).map((session) => session.id));
        const exercisesBySession = new Map();
        const setsByExercise = new Map();
        importedExercises.forEach((exercise) => {
          if (!exercisesBySession.has(exercise.sessionId)) exercisesBySession.set(exercise.sessionId, []);
          exercisesBySession.get(exercise.sessionId).push(exercise);
        });
        importedSets.forEach((set) => {
          if (!setsByExercise.has(set.exerciseId)) setsByExercise.set(set.exerciseId, []);
          setsByExercise.get(set.exerciseId).push(set);
        });
        const sessionsByWorkoutName = new Map();
        importedSessions.forEach((session) => {
          if (!activeImportedSessionIds.has(session.id)) return;
          const name = (session.title || "Strong Workout").trim() || "Strong Workout";
          const current = sessionsByWorkoutName.get(name);
          if (!current || session.date > current.date) sessionsByWorkoutName.set(name, session);
        });
        return Array.from(sessionsByWorkoutName.entries()).map(([name, session]) => {
          if (existingTemplateNames.has(name.toLowerCase())) return null;
          existingTemplateNames.add(name.toLowerCase());
          const sessionExercises = (exercisesBySession.get(session.id) || []).slice().sort((a, b) => a.order - b.order);
          const templateExercises = sessionExercises.map((exercise) => {
            const exerciseSets = (setsByExercise.get(exercise.id) || []).slice().sort((a, b) => a.setNumber - b.setNumber);
            const completedSets = exerciseSets.filter((set) => set.completed && set.reps > 0 && isWorkingSet(set, "progression"));
            const resistanceType = inferResistanceType(exercise.name, exercise, completedSets);
            const representativeReps = completedSets.length
              ? Math.round(completedSets.reduce((sum, set) => sum + set.reps, 0) / completedSets.length)
              : 8;
            return {
              id: id(),
              name: exercise.name,
              ...(typeof exerciseIdentityFields === "function" ? exerciseIdentityFields(exercise) : {}),
              primaryMuscle: exercise.primaryMuscle || "",
              secondaryMuscle: exercise.secondaryMuscle || "",
              resistanceType,
              isBodyweight: isBodyweightResistance(resistanceType),
              sets: Math.max(completedSets.length, 1),
              reps: Math.max(representativeReps, 1),
              targetRpe: completedSets.some((set) => Number(set.rpe) > 0) ? Math.round((completedSets.filter((set) => Number(set.rpe) > 0).reduce((sum, set) => sum + Number(set.rpe), 0) / completedSets.filter((set) => Number(set.rpe) > 0).length) * 2) / 2 : "",
              increment: progressionProfileForExercise(exercise.name).increment,
              restSeconds: exercise.restSeconds || recommendedRestSeconds(exercise.name, { reps: representativeReps }),
              setTypes: templateSetTypesFromHistory(completedSets, exercise.restSeconds || recommendedRestSeconds(exercise.name, { reps: representativeReps })),
              warmups: exerciseSets.filter((set) => setTypeSemantics(set).isWarmup).map((set) => ({ reps: set.reps, weight: set.weight, weightUnit: set.weightUnit, resistanceType: set.resistanceType, isBodyweight: set.isBodyweight, addedLoad: set.addedLoad, assistanceLoad: set.assistanceLoad, rpe: set.rpe }))
            };
          });
          if (!templateExercises.length) return null;
          return { id: id(), name, notes: "Imported from Strong workout name.", source: "strong", exercises: templateExercises, createdAt: isoNow(), updatedAt: isoNow() };
        }).filter(Boolean);
      }

      function auditImportedTemplateHistory(templates) {
        const exercises = (templates || []).flatMap((template) => template.exercises || []);
        const withHistory = exercises.filter((exercise) => getMostRecentWorkoutPerformance(exercise.name, {
          canonicalExerciseId: exercise.canonicalExerciseId || canonicalExerciseId(exercise.name),
          resistanceType: exercise.resistanceType || inferResistanceType(exercise.name, exercise)
        })?.sets.length).length;
        const withUsableStructure = exercises.filter((exercise) => Number(exercise.sets || 0) >= 1
          && Number(exercise.reps || 0) >= 1
          && ((exercise.setTypes || []).length > 0 || Number(exercise.sets || 0) > 0)).length;
        const startable = (templates || []).flatMap((template) => (template.exercises || []).map((exercise) => ({ template, exercise }))).filter(({ template, exercise }) => {
          const target = coachTargetForTemplateExercise(exercise, {
            template,
            resistanceType: exercise.resistanceType || inferResistanceType(exercise.name, exercise)
          });
          return target?.executionBlocked !== true && Number(target?.sets || 0) >= 1 && Number(target?.reps || 0) >= 1;
        }).length;
        return { total: exercises.length, withHistory, withUsableStructure, startable };
      }

      function strongImportAuditMessage(audit) {
        if (!audit.total) return "";
        const verified = audit.withHistory === audit.total
          && audit.withUsableStructure === audit.total
          && audit.startable === audit.total;
        return verified
          ? " Verified dated prior workout history and startable set structure for all " + audit.total + " template exercises."
          : " Needs review: dated history was found for " + audit.withHistory + " of " + audit.total + ", usable structure for " + audit.withUsableStructure + ", and startable workout targets for " + audit.startable + ".";
      }

      function parseStrongDate(rawDate) {
        const trimmed = String(rawDate || "").trim();
        const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
        if (match) {
          const month = Number(match[1]) - 1;
          const day = Number(match[2]);
          const year = Number(match[3]);
          const hour = Number(match[4] || 0);
          const minute = Number(match[5] || 0);
          const parsed = new Date(year, month, day, hour, minute);
          if (!Number.isNaN(parsed.getTime())) {
            return { date: localDateIso(parsed), createdAt: parsed.toISOString() };
          }
        }
        const parsed = new Date(trimmed.replace(" ", "T"));
        if (!Number.isNaN(parsed.getTime())) return { date: localDateIso(parsed), createdAt: parsed.toISOString() };
        return { date: todayIso(), createdAt: isoNow() };
      }

      function isStrongWorkSet(row) {
        const setOrder = String(row["Set Order"] || "").trim().toLowerCase();
        if (!setOrder || setOrder.includes("rest")) return false;
        return numberFrom(row.Reps) > 0 || numberFrom(row.Weight) > 0 || numberFrom(row.Distance) > 0 || numberFrom(row.Seconds) > 0;
      }

      function normalizeStrongImportWeightUnit(value) {
        const unit = String(value || "").trim().toLowerCase();
        if (unit !== "lb" && unit !== "kg") throw new Error("Choose whether the Strong CSV Weight column uses pounds (lb) or kilograms (kg) before importing.");
        return unit;
      }

      function retainedStrongImportWeightUnit(rawImport) {
        if (rawImport?.weightUnit === "lb" || rawImport?.weightUnit === "kg") return rawImport.weightUnit;
        const sessionExternalIds = new Set(rawImport?.sessionExternalIds || []);
        if (!sessionExternalIds.size) return "";
        const sessionIds = new Set(data.sessions.filter((session) => sessionExternalIds.has(session.externalId)).map((session) => session.id));
        const exerciseIds = new Set(data.exercises.filter((exercise) => sessionIds.has(exercise.sessionId)).map((exercise) => exercise.id));
        const units = new Set(data.sets.filter((set) => exerciseIds.has(set.exerciseId) && (set.weightUnit === "lb" || set.weightUnit === "kg")).map((set) => set.weightUnit));
        return units.size === 1 ? [...units][0] : "";
      }

      function importStrongCsv(text, sourceWeightUnit) {
        const weightUnit = normalizeStrongImportWeightUnit(sourceWeightUnit);
        const retainedRawImport = (data.rawImports || []).find((item) => item.source === "strong" && item.originalText === text);
        if (retainedRawImport) {
          const retainedUnit = retainedStrongImportWeightUnit(retainedRawImport);
          if (!retainedUnit) throw new Error("This Strong CSV was already imported before its source weight unit was recorded. No data was changed; keep the retained raw source and review its existing sets before importing again.");
          if (retainedUnit !== weightUnit) throw new Error(`This Strong CSV was already imported as ${retainedUnit}. No data was changed; the same raw source cannot be reinterpreted as ${weightUnit}.`);
          settingsMessage = `Strong CSV already imported as ${weightUnit}. No data was changed; the raw source backup is already retained.`;
          render();
          return;
        }
        const rows = parseCsv(text).filter((row) => row.Date && row["Exercise Name"] && isStrongWorkSet(row));
        if (!rows.length) throw new Error("No Strong workout rows found.");
        const existingSessionIds = new Set(data.sessions.map((session) => session.externalId).filter(Boolean));
        const sessions = [];
        const exercises = [];
        const sets = [];
        const sessionMap = new Map();
        const exerciseMap = new Map();
        const setCountsByExercise = new Map();
        const exerciseCountsBySession = new Map();
        const importStamp = Date.now().toString(36);
        let importCounter = 0;
        const importedId = (prefix) => prefix + importStamp + (importCounter += 1).toString(36);

        rows.forEach((row) => {
          const rawDate = row.Date.trim();
          const workoutName = (row["Workout Name"] || "Strong Workout").trim() || "Strong Workout";
          const sessionExternalId = "strong:" + rawDate + "|" + workoutName;
          if (existingSessionIds.has(sessionExternalId)) return;
          let session = sessionMap.get(sessionExternalId);
          if (!session) {
            const parsedDate = parseStrongDate(rawDate);
            session = {
              id: importedId("s"),
              externalId: sessionExternalId,
              source: "strong",
              date: parsedDate.date,
              title: workoutName,
              isTravel: false,
              notes: row["Workout Notes"] || "",
              submitted: true,
              workoutState: "completed",
              completedAt: parsedDate.date,
              createdAt: parsedDate.createdAt,
              updatedAt: isoNow()
            };
            sessionMap.set(sessionExternalId, session);
            sessions.push(session);
            exerciseCountsBySession.set(session.id, 0);
          }
          const exerciseName = (row["Exercise Name"] || "Exercise").trim() || "Exercise";
          const exerciseExternalId = sessionExternalId + "|" + exerciseName;
          let exercise = exerciseMap.get(exerciseExternalId);
          if (!exercise) {
            const exerciseOrder = exerciseCountsBySession.get(session.id) || 0;
            const resistanceType = inferResistanceType(exerciseName);
            exercise = { id: importedId("e"), externalId: exerciseExternalId, source: "strong", sessionId: session.id, name: exerciseName, ...(typeof exerciseIdentityFields === "function" ? exerciseIdentityFields({ name: exerciseName }) : {}), primaryMuscle: "", secondaryMuscle: "", notes: row.Notes || "", order: exerciseOrder, restSeconds: recommendedRestSeconds(exerciseName), resistanceType, isBodyweight: isBodyweightResistance(resistanceType) };
            exerciseMap.set(exerciseExternalId, exercise);
            exercises.push(exercise);
            exerciseCountsBySession.set(session.id, exerciseOrder + 1);
            setCountsByExercise.set(exercise.id, 0);
          } else if (!exercise.notes && row.Notes) {
            exercise.notes = row.Notes;
          }
          const reps = numberFrom(row.Reps);
          const weight = numberFrom(row.Weight);
          const resistanceType = exercise.resistanceType === "assisted_bodyweight" ? "assisted_bodyweight" : isBodyweightExerciseName(exerciseName) ? (weight > 0 ? "bodyweight_plus_load" : "bodyweight") : exercise.resistanceType || "external";
          if (resistanceType === "bodyweight_plus_load") { exercise.resistanceType = resistanceType; exercise.isBodyweight = true; }
          const nextSetNumber = (setCountsByExercise.get(exercise.id) || 0) + 1;
          setCountsByExercise.set(exercise.id, nextSetNumber);
          sets.push({
            id: importedId("t"),
            exerciseId: exercise.id,
            setNumber: numberFrom(row["Set Order"], nextSetNumber),
            sequenceIndex: nextSetNumber - 1,
            sequence: nextSetNumber,
            sourceSetOrder: String(row["Set Order"] || ""),
            reps,
            weight,
            weightUnit,
            resistanceType,
            isBodyweight: isBodyweightResistance(resistanceType),
            addedLoad: resistanceType === "bodyweight_plus_load" ? weight : 0,
            assistanceLoad: resistanceType === "assisted_bodyweight" ? weight : 0,
            rpe: numberFrom(row.RPE),
            completed: true,
            originalImportedValue: { setOrder: String(row["Set Order"] || ""), weight: row.Weight, weightUnit, reps: row.Reps, rpe: row.RPE, distance: row.Distance, seconds: row.Seconds }
          });
        });

        if (!sessions.length) {
          const templates = createTemplatesFromStrongSessions(
            data.sessions.filter((session) => session.source === "strong"),
            data.exercises.filter((exercise) => exercise.source === "strong"),
            data.sets
          );
          commit({ ...data, templates: [...templates, ...data.templates], rawImports: [...(data.rawImports || []), { id: "strong-backup-" + importStamp, source: "strong", importedAt: isoNow(), originalText: text, weightUnit, sessionExternalIds: [] }] }, false);
          const audit = auditImportedTemplateHistory(templates);
          settingsMessage = `Strong workout rows already existed; retained this ${weightUnit} CSV source.` + (templates.length ? " Added " + templates.length + " templates from active workout names." : "") + strongImportAuditMessage(audit);
          render();
          return;
        }
        const setsByImportedExercise = new Map();
        sets.forEach((set) => {
          if (!setsByImportedExercise.has(set.exerciseId)) setsByImportedExercise.set(set.exerciseId, []);
          setsByImportedExercise.get(set.exerciseId).push(set);
        });
        setsByImportedExercise.forEach((exerciseSets, exerciseId) => {
          const exercise = exercises.find((item) => item.id === exerciseId);
          classifyImportedExerciseSets(exerciseSets, exercise?.resistanceType || "external").forEach((classification) => {
            const targetSet = sets.find((set) => set.id === classification.set.id);
            if (!targetSet) return;
            const semantics = setTypeSemantics({ ...targetSet, setType: classification.type, isWarmup: classification.type === "warmup" });
            Object.assign(targetSet, {
              sequenceIndex: classification.set.sequenceIndex ?? classification.set.sequence,
              sequence: classification.set.sequenceIndex ?? classification.set.sequence,
              setType: classification.type,
              isWarmup: semantics.isWarmup,
              countsTowardScore: semantics.countsTowardScore,
              countsTowardVolume: semantics.countsTowardVolume,
              countsTowardProgression: semantics.countsTowardProgression,
              classificationSource: classification.source,
              classificationConfidence: classification.confidence,
              classifierVersion: SET_CLASSIFIER_VERSION,
              manualOverride: false,
              reviewRequired: classification.reviewRequired,
              classifiedAt: isoNow()
            });
          });
        });
        const templates = createTemplatesFromStrongSessions(sessions, exercises, sets);
        commit({
          ...data,
          sessions: [...sessions, ...data.sessions],
          exercises: [...data.exercises, ...exercises],
          sets: [...data.sets, ...sets],
          templates: [...templates, ...data.templates],
          rawImports: [...(data.rawImports || []), { id: "strong-" + importStamp, source: "strong", importedAt: isoNow(), originalText: text, weightUnit, sessionExternalIds: sessions.map((session) => session.externalId) }]
        }, false);
        activeSessionId = sessions.sort((a, b) => b.date.localeCompare(a.date))[0]?.id || activeSessionId;
        const audit = auditImportedTemplateHistory(templates);
        settingsMessage = "Imported " + sessions.length + " Strong workouts, " + exercises.length + " exercises, " + sets.length + " sets, and " + templates.length + " templates with source weights in " + weightUnit + "." + strongImportAuditMessage(audit);
        render();
      }

      function validateBackupJsonShape(value, options = {}) {
        // The next gate, validateImportedAppData, applies VALID_ID_PATTERN checks,
        // MAX_SESSIONS / MAX_EXERCISES / MAX_SETS / MAX_TEMPLATES bounds,
        // seenIds duplicate rejection, and sessionIds/exerciseIds orphan reference checks.
        const maxDepth = Number(options.maxDepth ?? options.maxJsonDepth ?? BACKUP_IMPORT_LIMITS.maxJsonDepth);
        const maxObjectKeys = Number(options.maxObjectKeys ?? BACKUP_IMPORT_LIMITS.maxObjectKeys);
        const forbiddenEventKey = /^on/i;
        if (!Number.isInteger(maxDepth) || maxDepth < 1 || !Number.isInteger(maxObjectKeys) || maxObjectKeys < 1) throw new Error("Invalid JSON shape limits.");
        const stack = [{ value, depth: value && typeof value === "object" ? 1 : 0 }];
        while (stack.length) {
          const current = stack.pop();
          if (!current.value || typeof current.value !== "object") continue;
          if (current.depth > maxDepth) throw new Error(`JSON shape exceeds the maximum depth limit of ${maxDepth}.`);
          const keys = Object.keys(current.value);
          if (!Array.isArray(current.value) && keys.length > maxObjectKeys) throw new Error(`JSON object width exceeds the ${maxObjectKeys}-key limit.`);
          for (const key of keys) {
            if (key === "__proto__" || key === "prototype" || key === "constructor" || forbiddenEventKey.test(key)) throw new Error(`JSON contains a forbidden executable or prototype key: ${key}.`);
            const child = current.value[key];
            if (child && typeof child === "object") stack.push({ value: child, depth: current.depth + 1 });
          }
        }
        return true;
      }

      function validateImportedAppData(imported, limits = BACKUP_IMPORT_LIMITS) {
        validateBackupJsonShape(imported, { maxDepth: limits.maxJsonDepth, maxObjectKeys: limits.maxObjectKeys });
        if (!imported || typeof imported !== "object" || Array.isArray(imported)) throw new Error("Backup root must be a JSON object.");
        const templateNumericDomain = typeof templateNumericFields === "object" ? templateNumericFields : {
          "template-exercise-sets": { min: 1, max: 100, step: 1, integer: true },
          "template-exercise-reps": { min: 1, max: 1000, step: 1, integer: true },
          "template-exercise-rep-min": { min: 1, max: 100, step: 1, integer: true },
          "template-exercise-rep-max": { min: 1, max: 100, step: 1, integer: true },
          "template-exercise-rpe": { min: 5, max: 10, step: 0.5, integer: false },
          "template-exercise-increment": { min: 0.5, max: 10000, step: 0.5, integer: false },
          "template-exercise-rest": { min: 15, max: 3600, step: 15, integer: true }
        };
        if (Object.prototype.hasOwnProperty.call(imported, "dataRevision")
          && (!Number.isSafeInteger(imported.dataRevision) || imported.dataRevision < 0)) {
          throw new Error("Backup dataRevision must be omitted or a non-negative safe integer.");
        }
        const allowedTopLevelFields = new Set(["appDataVersion", "domainMigrationVersion", "sessions", "exercises", "sets", "templates", "mesocycles", "activeMesocycleId", "recommendationHistory", "manualOverrides", "personalEvidencePackage", "rawImports", "migrationAudit", "dataRevision", "settings"]);
        const allowedSessionFields = new Set(["id", "externalId", "source", "date", "title", "isTravel", "notes", "submitted", "workoutStarted", "workoutState", "completedAt", "submittedAt", "startedAt", "createdAt", "updatedAt", "templateId", "recovery", "prs", "workoutAnalysis", "workoutPrescription", "adjustmentSummary", "deletedAt", "trashed", "canceledAt"]);
        const allowedExerciseFields = new Set(["id", "externalId", "source", "sessionId", "name", "notes", "order", "primaryMuscle", "secondaryMuscle", "restSeconds", "resistanceType", "isBodyweight", "isDeload", "customExerciseProfile", "executionQualityAssessment", "recommendationSnapshot", "basePrescription", "finalPrescription", "coachRecommendation", "executionBlocked", "safetyRestriction", "manualOverrides", "adjusted", "adjustmentReason", "triggerLabels", "canonicalExerciseId", "performanceExerciseId", "researchExerciseId", "identitySource", "identityVersion", "originalPrescription", "prescription", "recommendationVersion", "personalDataVersion", "researchDatabaseVersion", "programTargetContext", "appliedTargetContext", "overrideLocked"]);
        const allowedSetFields = new Set(["id", "exerciseId", "setNumber", "sequenceIndex", "sequence", "setTypeIndex", "setType", "reps", "weight", "weightUnit", "resistanceType", "rpe", "completed", "skipped", "edited", "isWarmup", "countsTowardScore", "countsTowardVolume", "countsTowardProgression", "addedLoad", "assistanceLoad", "durationSeconds", "distance", "distanceUnit", "targetReps", "targetRepMin", "targetRepMax", "targetWeight", "targetRpe", "targetRpeMin", "targetRpeMax", "targetRpeTolerance", "targetRestSeconds", "setPrescription", "previousComparableSet", "prescriptionReason", "prescriptionMode", "prescriptionConfidence", "validationWarning", "classificationSource", "classificationConfidence", "classifierVersion", "manualOverride", "reviewRequired", "classifiedAt", "sourceSetOrder", "originalImportedValue"]);
        const allowedTemplateFields = new Set(["id", "name", "notes", "createdAt", "updatedAt", "exercises", "mesocycleId", "mesocycleRevision", "trainingDayId", "source"]);
        const allowedTemplateExerciseFields = new Set(["id", "name", "notes", "sets", "reps", "repMin", "repMax", "standardWorkloadOverride", "standardRoleWorkload", "targetRpe", "increment", "restSeconds", "resistanceType", "isBodyweight", "primaryMuscle", "secondaryMuscle", "customExerciseProfile", "warmups", "setTypes", "canonicalExerciseId", "performanceExerciseId", "researchExerciseId", "identitySource", "identityVersion", "mesocycleSlotId", "assignmentId", "recommendationSnapshot"]);
        const allowedSettingsFields = new Set(["weightUnit", "trainingGoal", "trainingGoalSource", "trainingGoalDisclosure", "nutritionPhase", "experienceLevel", "returningAfterGap", "trainingDaysPerWeek", "availableEquipment", "excludedExerciseIds", "theme", "colorPackage", "timerSound", "workoutCompletionSound", "timerVibration", "interactionVibration", "timerNotifications", "inAppRestAlerts", "restCompleteSound", "restCompleteSoundVolume", "restCompleteAutoDismissMs", "restCompleteLockScreenNotifications", "restCompleteAutoReturnToWorkout", "defaultRestSeconds", "notificationMessageDetail", "autoStartRestTimer", "autoHighlightNextSet", "autoScrollNextSet", "installGuideDismissed", "setupSoundConfirmed", "cloudWorkoutSyncConsent", "workoutCloudSync", "workoutCloudSyncConsentVersion", "readinessBaseline", "goal", "trainingStatus"]);
        const allowedMesocycleFields = new Set(["id", "schemaVersion", "builderMode", "rulesVersion", "type", "name", "status", "createdAt", "updatedAt", "durationWeeks", "durationBasis", "specializationMuscleGroups", "trainingDays", "split", "availableEquipment", "constraints", "exclusionResolution", "programmingContext", "planningStep", "availableMuscleGroupIds", "includedMuscleGroupIds", "equipmentUnavailableMuscleGroupIds", "omittedMuscleGroups", "scopeConfirmed", "currentProgramExerciseIds", "recentExerciseWindowDays", "pools", "activeExercises", "selectedPortfolio", "programSlots", "sessions", "programReview", "preservedProductiveExerciseIds", "versions", "lifecycle", "startedAt", "completedAt", "outcome", "reviewedAt", "review", "musclePriorities", "planningProgress", "guidedDays", "acceptedExceptions", "viabilityResult", "viabilityStale", "linkedTemplateIds", "creationResult", "revision"]);
        const allowedRecommendationFields = new Set(["recommendationId", "schemaVersion", "recommendationVersion", "engineVersion", "personalDataVersion", "researchDatabaseVersion", "mesocycleId", "exerciseId", "muscleGroupId", "exerciseScore", "muscleSpecificScore", "personalEvidenceWeight", "researchEvidenceWeight", "standardGuideline", "readinessAdjustment", "basePrescription", "finalPrescription", "explanation", "evidenceSummary", "confidence", "createdAt", "manualOverrides", "overrideLocked", "checksum", "request", "scores", "versions"]);
        const allowedCustomProfileFields = new Set(["schemaVersion", "status", "primaryMuscleGroupId", "secondaryMuscleGroupId", "resistanceType", "exerciseStyle", "progressionMetric", "smallestIncrement", "confirmedAt"]);
        const allowedOverrideFields = new Set(["overrideId", "recommendationId", "sessionId", "workoutId", "exerciseRuntimeId", "exerciseId", "setId", "field", "from", "to", "createdAt", "actor", "reason", "lockedForWorkout", "changes", "previousFinalPrescription", "outcome", "outcomeEvaluation", "action"]);
        const allowedRawImportFields = new Set(["id", "source", "importedAt", "originalText", "weightUnit", "sessionExternalIds"]);
        const allowedMigrationFields = new Set(["version", "startedAt", "completedAt", "inspected", "changed", "explicitRetained", "manualOverridesPreserved", "warmups", "topSets", "backoffSets", "dropSets", "ambiguous", "templatesReseeded", "changes"]);
        const allowedMigrationChangeFields = new Set(["setId", "exerciseId", "from", "to", "reason", "confidence"]);
        const VALID_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
        const MAX_SESSIONS = limits.maxSessions;
        const MAX_EXERCISES = limits.maxExercises;
        const MAX_SETS = limits.maxSets;
        const MAX_TEMPLATES = limits.maxTemplates;
        const assertAllowed = (record, allowedFields, label) => {
          if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`${label} must be an object.`);
          const unknown = Object.keys(record).find((key) => !allowedFields.has(key));
          if (unknown) throw new Error(`${label} contains an unknown field: ${unknown}.`);
        };
        const assertId = (value, label) => {
          if (typeof value !== "string" || !VALID_ID_PATTERN.test(value)) throw new Error(`${label} has an invalid id; identifiers must be 1-128 safe characters.`);
          return value;
        };
        const assertName = (value, label) => {
          if (value != null && (typeof value !== "string" || value.length > 256)) throw new Error(`${label} name exceeds the 256-character limit.`);
        };
        const assertText = (value, label) => {
          if (value != null && (typeof value !== "string" || value.length > 4096)) throw new Error(`${label} text exceeds the 4096-character limit.`);
        };
        const cloneJsonValue = (value) => {
          if (Array.isArray(value)) return value.map(cloneJsonValue);
          if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneJsonValue(child)]));
          return value;
        };
        const copyAllowed = (record, allowedFields) => Object.fromEntries(Object.entries(record).filter(([key]) => allowedFields.has(key)).map(([key, value]) => [key, cloneJsonValue(value)]));
        const assertTemplateNumericValue = (value, action, label) => {
          const config = templateNumericDomain[action];
          const numeric = Number(value);
          const steps = (numeric - config.min) / config.step;
          if (!Number.isFinite(numeric)
            || numeric < config.min
            || numeric > config.max
            || (config.integer && !Number.isInteger(numeric))
            || Math.abs(steps - Math.round(steps)) > 1e-9) {
            throw new Error(`${label} must be between ${config.min} and ${config.max} in ${config.step} increments.`);
          }
          return numeric;
        };
        const assertNumericDomain = (value, config, label) => {
          if (value == null || value === "") return;
          const numeric = Number(value);
          const steps = config.step == null ? 0 : (numeric - config.min) / config.step;
          if (!Number.isFinite(numeric)
            || numeric < config.min
            || (config.max != null && numeric > config.max)
            || (config.integer && !Number.isInteger(numeric))
            || (config.step != null && Math.abs(steps - Math.round(steps)) > 1e-9)) {
            const maximum = config.max == null ? "or greater" : `and ${config.max}`;
            const increment = config.step == null ? "" : ` in ${config.step} increments`;
            throw new Error(`${label} must be between ${config.min} ${maximum}${increment}.`);
          }
        };
        const assertCustomExerciseProfile = (profile, label) => {
          if (profile == null) return;
          assertAllowed(profile, allowedCustomProfileFields, label);
          if (profile.schemaVersion !== "custom-exercise-profile/1.0.0") throw new Error(`${label} schemaVersion is unsupported.`);
          if (!["complete", "incomplete"].includes(profile.status)) throw new Error(`${label} status is invalid.`);
          if (profile.primaryMuscleGroupId != null && (typeof profile.primaryMuscleGroupId !== "string" || profile.primaryMuscleGroupId.length > 128)) throw new Error(`${label} primary muscle is invalid.`);
          if (profile.secondaryMuscleGroupId != null && (typeof profile.secondaryMuscleGroupId !== "string" || profile.secondaryMuscleGroupId.length > 128)) throw new Error(`${label} secondary muscle is invalid.`);
          if (profile.resistanceType != null && !["", "external", "bodyweight", "bodyweight_plus_load", "assisted_bodyweight", "duration", "distance"].includes(profile.resistanceType)) throw new Error(`${label} resistance mode is invalid.`);
          if (profile.exerciseStyle != null && !["", "multi_joint", "single_joint", "isometric", "carry_locomotion"].includes(profile.exerciseStyle)) throw new Error(`${label} exercise style is invalid.`);
          if (profile.progressionMetric != null && !["", "load_and_reps", "reps_only", "assistance", "duration", "distance"].includes(profile.progressionMetric)) throw new Error(`${label} progression metric is invalid.`);
          if (profile.smallestIncrement != null && (!Number.isFinite(Number(profile.smallestIncrement)) || Number(profile.smallestIncrement) <= 0 || Number(profile.smallestIncrement) > 10000)) throw new Error(`${label} smallest increment is invalid.`);
          if (profile.confirmedAt != null && (typeof profile.confirmedAt !== "string" || profile.confirmedAt.length > 64)) throw new Error(`${label} confirmedAt is invalid.`);
        };

        const unknownTopLevel = Object.keys(imported).find((key) => !allowedTopLevelFields.has(key));
        if (unknownTopLevel) throw new Error(`Backup contains an unknown top-level field: ${unknownTopLevel}.`);
        const appDataVersion = imported.appDataVersion;
        if (!Number.isInteger(appDataVersion) || ![1, 2].includes(appDataVersion)) throw new Error("Unsupported or malformed appDataVersion; only version 1 legacy migration and version 2 are supported.");
        for (const collection of ["sessions", "exercises", "sets", "templates"]) if (!Array.isArray(imported[collection])) throw new Error(`Import must include a ${collection} array.`);
        if (imported.sessions.length > MAX_SESSIONS) throw new Error(`Session count exceeds the ${MAX_SESSIONS} limit.`);
        if (imported.exercises.length > MAX_EXERCISES) throw new Error(`Exercise count exceeds the ${MAX_EXERCISES} limit.`);
        if (imported.sets.length > MAX_SETS) throw new Error(`Set count exceeds the ${MAX_SETS} limit.`);
        if (imported.templates.length > MAX_TEMPLATES) throw new Error(`Template count exceeds the ${MAX_TEMPLATES} limit.`);
        const seenIds = (records, label) => {
          const ids = new Set();
          records.forEach((record, index) => {
            const recordId = assertId(record.id, `${label} ${index + 1}`);
            if (ids.has(recordId)) throw new Error(`Duplicate ${label} id: ${recordId}.`);
            ids.add(recordId);
          });
          return ids;
        };

        const sessions = imported.sessions.map((record, index) => {
          assertAllowed(record, allowedSessionFields, `Session ${index + 1}`);
          assertName(record.title, `Session ${index + 1}`);
          assertText(record.notes, `Session ${index + 1} notes`);
          for (const field of ["submitted", "workoutStarted", "isTravel", "trashed"]) if (record[field] != null && typeof record[field] !== "boolean") throw new Error(`Session ${index + 1} ${field} must be boolean.`);
          return copyAllowed(record, allowedSessionFields);
        });
        const exercises = imported.exercises.map((record, index) => {
          assertAllowed(record, allowedExerciseFields, `Exercise ${index + 1}`);
          assertName(record.name, `Exercise ${index + 1}`);
          assertText(record.notes, `Exercise ${index + 1} notes`);
          assertId(record.sessionId, `Exercise ${index + 1} session reference`);
          if (record.order != null && (!Number.isInteger(Number(record.order)) || Number(record.order) < 0)) throw new Error(`Exercise ${index + 1} order must be a non-negative integer.`);
          if (record.restSeconds != null && (!Number.isFinite(Number(record.restSeconds)) || Number(record.restSeconds) < 0 || Number(record.restSeconds) > 3600)) throw new Error(`Exercise ${index + 1} restSeconds is invalid.`);
          for (const field of ["isBodyweight", "isDeload", "executionBlocked", "adjusted", "overrideLocked"]) if (record[field] != null && typeof record[field] !== "boolean") throw new Error(`Exercise ${index + 1} ${field} must be boolean.`);
          if (record.executionQualityAssessment != null && !["controlled", "breakdown", "not_assessed"].includes(record.executionQualityAssessment)) throw new Error(`Exercise ${index + 1} execution quality is invalid.`);
          assertCustomExerciseProfile(record.customExerciseProfile, `Exercise ${index + 1} custom exercise profile`);
          return copyAllowed(record, allowedExerciseFields);
        });
        const sets = imported.sets.map((record, index) => {
          assertAllowed(record, allowedSetFields, `Set ${index + 1}`);
          assertId(record.exerciseId, `Set ${index + 1} exercise reference`);
          const setNumericDomains = {
            setNumber: { min: 0, integer: true }, sequenceIndex: { min: 0, integer: true }, sequence: { min: 0, integer: true }, setTypeIndex: { min: 0, integer: true },
            reps: { min: 0, integer: true }, weight: { min: 0 }, rpe: { min: 0, max: 10, step: 0.5 }, addedLoad: { min: 0 }, assistanceLoad: { min: 0 },
            durationSeconds: { min: 0, integer: true }, distance: { min: 0 }, targetReps: { min: 0, integer: true }, targetRepMin: { min: 0, integer: true }, targetRepMax: { min: 0, integer: true },
            targetWeight: { min: 0 }, targetRpe: { min: 0, max: 10, step: 0.5 }, targetRpeMin: { min: 0, max: 10, step: 0.5 }, targetRpeMax: { min: 0, max: 10, step: 0.5 },
            targetRpeTolerance: { min: 0, max: 10, step: 0.5 }, targetRestSeconds: { min: 0, max: 3600, integer: true }, classificationConfidence: { min: 0, max: 1 }, classifierVersion: { min: 1, integer: true }
          };
          Object.entries(setNumericDomains).forEach(([field, config]) => assertNumericDomain(record[field], config, `Set ${index + 1} ${field}`));
          if (record.targetRepMin != null && record.targetRepMax != null && Number(record.targetRepMin) > Number(record.targetRepMax)) throw new Error(`Set ${index + 1} target rep minimum must not exceed its maximum.`);
          if (record.targetRpeMin != null && record.targetRpeMax != null && Number(record.targetRpeMin) > Number(record.targetRpeMax)) throw new Error(`Set ${index + 1} target RPE minimum must not exceed its maximum.`);
          for (const field of ["completed", "skipped", "edited", "isWarmup", "countsTowardScore", "countsTowardVolume", "countsTowardProgression", "manualOverride", "reviewRequired"]) if (record[field] != null && typeof record[field] !== "boolean") throw new Error(`Set ${index + 1} ${field} must be boolean.`);
          return copyAllowed(record, allowedSetFields);
        });
        const templateExerciseIds = new Set();
        const templates = imported.templates.map((record, index) => {
          assertAllowed(record, allowedTemplateFields, `Template ${index + 1}`);
          assertName(record.name, `Template ${index + 1}`);
          assertText(record.notes, `Template ${index + 1} notes`);
          if (!Array.isArray(record.exercises)) throw new Error(`Template ${index + 1} must contain an exercises array.`);
          const template = copyAllowed(record, allowedTemplateFields);
          template.exercises = record.exercises.map((exercise, exerciseIndex) => {
            assertAllowed(exercise, allowedTemplateExerciseFields, `Template ${index + 1} exercise ${exerciseIndex + 1}`);
            const exerciseId = assertId(exercise.id, `Template ${index + 1} exercise ${exerciseIndex + 1}`);
            if (templateExerciseIds.has(exerciseId)) throw new Error(`Duplicate template exercise id: ${exerciseId}.`);
            templateExerciseIds.add(exerciseId);
            assertName(exercise.name, `Template ${index + 1} exercise ${exerciseIndex + 1}`);
            assertText(exercise.notes, `Template ${index + 1} exercise ${exerciseIndex + 1} notes`);
            const copiedExercise = copyAllowed(exercise, allowedTemplateExerciseFields);
            const numericActions = {
              sets: "template-exercise-sets",
              reps: "template-exercise-reps",
              repMin: "template-exercise-rep-min",
              repMax: "template-exercise-rep-max",
              targetRpe: "template-exercise-rpe",
              increment: "template-exercise-increment",
              restSeconds: "template-exercise-rest"
            };
            Object.entries(numericActions).forEach(([field, action]) => {
              if (exercise[field] == null) return;
              copiedExercise[field] = assertTemplateNumericValue(exercise[field], action, `Template ${index + 1} exercise ${exerciseIndex + 1} ${field}`);
            });
            if (exercise.standardWorkloadOverride != null && typeof exercise.standardWorkloadOverride !== "boolean") throw new Error(`Template ${index + 1} exercise ${exerciseIndex + 1} standard workload flag must be boolean.`);
            if (exercise.standardRoleWorkload != null) {
              if (exercise.standardWorkloadOverride !== true) throw new Error(`Template ${index + 1} exercise ${exerciseIndex + 1} role workload requires an enabled standard workload override.`);
              const label = `Template ${index + 1} exercise ${exerciseIndex + 1} standard role workload`;
              const roles = exercise.standardRoleWorkload;
              assertAllowed(roles, new Set(["setStructure", "topSet", "backoffSets"]), label);
              if (!["top_set_backoff", "multiple_top_sets"].includes(roles.setStructure)) throw new Error(`${label} has an invalid set structure.`);
              const validateRole = (role, roleLabel, maximum) => {
                if (!role || typeof role !== "object" || Array.isArray(role)) throw new Error(`${label} ${roleLabel} must be an object.`);
                assertAllowed(role, new Set(["count", "repRange"]), `${label} ${roleLabel}`);
                if (!Number.isInteger(role.count) || role.count < 1 || role.count > maximum) throw new Error(`${label} ${roleLabel} count must be an integer from 1 to ${maximum}.`);
                if (!role.repRange || typeof role.repRange !== "object" || Array.isArray(role.repRange)) throw new Error(`${label} ${roleLabel} rep range must be an object.`);
                assertAllowed(role.repRange, new Set(["min", "max"]), `${label} ${roleLabel} rep range`);
                if (!Number.isInteger(role.repRange.min) || !Number.isInteger(role.repRange.max) || role.repRange.min < 1 || role.repRange.max > 50 || role.repRange.min > role.repRange.max) throw new Error(`${label} ${roleLabel} rep range must be ordered from 1 to 50.`);
              };
              validateRole(roles.topSet, "top set", 10);
              if (roles.setStructure === "top_set_backoff") {
                validateRole(roles.backoffSets, "back-off sets", 19);
                if (roles.topSet.count + roles.backoffSets.count > 20) throw new Error(`${label} may contain at most 20 total working sets.`);
              }
              else if (roles.backoffSets !== undefined) throw new Error(`${label} cannot include back-off sets for multiple top sets.`);
            }
            assertCustomExerciseProfile(exercise.customExerciseProfile, `Template ${index + 1} exercise ${exerciseIndex + 1} custom exercise profile`);
            return copiedExercise;
          });
          return template;
        });
        const sessionIds = seenIds(sessions, "session");
        const exerciseIds = seenIds(exercises, "exercise");
        seenIds(sets, "set");
        const templateIds = seenIds(templates, "template");
        exercises.forEach((exercise) => { if (!sessionIds.has(exercise.sessionId)) throw new Error(`Orphan exercise reference: ${exercise.id} -> ${exercise.sessionId}.`); });
        sets.forEach((set) => { if (!exerciseIds.has(set.exerciseId)) throw new Error(`Orphan set reference: ${set.id} -> ${set.exerciseId}.`); });
        sessions.forEach((session) => { if (session.templateId && !templateIds.has(session.templateId)) throw new Error(`Orphan template reference: ${session.templateId}.`); });
        if (imported.mesocycles != null && !Array.isArray(imported.mesocycles)) throw new Error("Mesocycles must be an array.");
        const mesocycles = (imported.mesocycles || []).map((record, index) => {
          assertAllowed(record, allowedMesocycleFields, `Mesocycle ${index + 1}`);
          assertName(record.name, `Mesocycle ${index + 1}`);
          return copyAllowed(record, allowedMesocycleFields);
        });
        if (mesocycles.length > MAX_TEMPLATES) throw new Error(`Mesocycle count exceeds the ${MAX_TEMPLATES} limit.`);
        const mesocycleIds = seenIds(mesocycles, "mesocycle");
        const activeMesocycleId = imported.activeMesocycleId || "";
        if (activeMesocycleId) {
          assertId(activeMesocycleId, "Active mesocycle reference");
          if (!mesocycleIds.has(activeMesocycleId)) throw new Error(`Orphan active mesocycle reference: ${activeMesocycleId}.`);
        }
        const settings = imported.settings == null ? {} : imported.settings;
        assertAllowed(settings, allowedSettingsFields, "Settings");
        if (settings.weightUnit != null && !["lb", "kg"].includes(settings.weightUnit)) throw new Error("Settings weightUnit must be lb or kg.");
        if (settings.trainingGoal != null && !["", "strength", "hypertrophy", "muscular_endurance", "general_fitness"].includes(settings.trainingGoal)) throw new Error("Settings trainingGoal is invalid.");
        if (settings.nutritionPhase != null && !["", "deficit", "maintenance", "surplus", "recomposition"].includes(settings.nutritionPhase)) throw new Error("Settings nutritionPhase is invalid.");
        if (settings.experienceLevel != null && !["", "novice", "intermediate", "advanced"].includes(settings.experienceLevel)) throw new Error("Settings experienceLevel is invalid.");
        if (settings.theme != null && !["light", "dark"].includes(settings.theme)) throw new Error("Settings theme is invalid.");
        if (settings.colorPackage != null && !["heritage-atlas", "signal-garden", "alpine-ledger", "training-hall", "harbor-pulse", "prairie-electric", "redwood-circuit", "mediterranean-set", "modern-primary", "night-stadium"].includes(settings.colorPackage)) throw new Error("Settings colorPackage is invalid.");
        if (settings.trainingDaysPerWeek != null && (!Number.isInteger(Number(settings.trainingDaysPerWeek)) || Number(settings.trainingDaysPerWeek) < 1 || Number(settings.trainingDaysPerWeek) > 7)) throw new Error("Settings trainingDaysPerWeek must be between 1 and 7.");
        if (settings.availableEquipment != null && (!Array.isArray(settings.availableEquipment) || settings.availableEquipment.length > 128 || settings.availableEquipment.some((value) => typeof value !== "string" || !value || value.length > 128))) throw new Error("Settings availableEquipment is invalid or exceeds its limit.");
        if (settings.excludedExerciseIds != null && (!Array.isArray(settings.excludedExerciseIds) || settings.excludedExerciseIds.length > MAX_EXERCISES)) throw new Error("Settings excludedExerciseIds is invalid or exceeds its limit.");
        if (Array.isArray(settings.excludedExerciseIds)) settings.excludedExerciseIds.forEach((value, index) => assertId(value, `Excluded exercise ${index + 1}`));
        const booleanSettingFields = ["timerSound", "workoutCompletionSound", "timerVibration", "interactionVibration", "timerNotifications", "inAppRestAlerts", "restCompleteLockScreenNotifications", "restCompleteAutoReturnToWorkout", "autoStartRestTimer", "autoHighlightNextSet", "autoScrollNextSet", "installGuideDismissed", "setupSoundConfirmed", "cloudWorkoutSyncConsent"];
        booleanSettingFields.forEach((field) => { if (settings[field] != null && typeof settings[field] !== "boolean") throw new Error(`Settings ${field} must be boolean.`); });
        if (settings.returningAfterGap != null && typeof settings.returningAfterGap !== "boolean") throw new Error("Settings returningAfterGap must be boolean or null.");
        if (settings.restCompleteSoundVolume != null && (!Number.isFinite(Number(settings.restCompleteSoundVolume)) || Number(settings.restCompleteSoundVolume) < 0 || Number(settings.restCompleteSoundVolume) > 1)) throw new Error("Settings restCompleteSoundVolume must be between 0 and 1.");
        if (settings.restCompleteAutoDismissMs != null && (!Number.isFinite(Number(settings.restCompleteAutoDismissMs)) || Number(settings.restCompleteAutoDismissMs) < 1000 || Number(settings.restCompleteAutoDismissMs) > 60000)) throw new Error("Settings restCompleteAutoDismissMs must be between 1000 and 60000.");
        if (settings.defaultRestSeconds != null && (!Number.isFinite(Number(settings.defaultRestSeconds)) || Number(settings.defaultRestSeconds) < 15 || Number(settings.defaultRestSeconds) > 900)) throw new Error("Settings defaultRestSeconds must be between 15 and 900.");
        if (settings.readinessBaseline != null) {
          const allowedBaselineFields = new Set(["sleepHours", "sleepQuality", "hrv", "restingHr", "soreness", "band"]);
          assertAllowed(settings.readinessBaseline, allowedBaselineFields, "Settings readinessBaseline");
          const readinessBaselineDomains = {
            sleepHours: { min: 0, max: 14, step: 0.25 },
            sleepQuality: { min: 1, max: 5, integer: true },
            hrv: { min: 0, integer: true },
            restingHr: { min: 0, integer: true },
            soreness: { min: 1, max: 5, integer: true },
            band: { min: 3, max: 20, integer: true }
          };
          Object.entries(readinessBaselineDomains).forEach(([field, config]) => assertNumericDomain(settings.readinessBaseline[field], config, `Settings readinessBaseline ${field}`));
        }
        const boundedRecords = (value, label, maximum, allowedFields) => {
          if (value == null) return [];
          if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} collection exceeds the ${maximum}-record limit.`);
          return value.map((record, index) => {
            assertAllowed(record, allowedFields, `${label} ${index + 1}`);
            return copyAllowed(record, allowedFields);
          });
        };
        const recommendationHistory = boundedRecords(imported.recommendationHistory, "Recommendation history", MAX_SETS, allowedRecommendationFields);
        recommendationHistory.forEach((record, index) => assertId(record.recommendationId, `Recommendation history ${index + 1}`));
        const manualOverrides = boundedRecords(imported.manualOverrides, "Manual override", MAX_SETS, allowedOverrideFields);
        manualOverrides.forEach((record, index) => assertId(record.overrideId, `Manual override ${index + 1}`));
        const rawImports = boundedRecords(imported.rawImports, "Raw import", 128, allowedRawImportFields);
        rawImports.forEach((record, index) => {
          assertId(record.id, `Raw import ${index + 1}`);
          if (typeof record.source !== "string" || !record.source || record.source.length > 128) throw new Error(`Raw import ${index + 1} source is invalid.`);
          if (record.weightUnit != null && !["lb", "kg"].includes(record.weightUnit)) throw new Error(`Raw import ${index + 1} weightUnit must be lb or kg.`);
          if (typeof record.originalText !== "string" || new TextEncoder().encode(record.originalText).byteLength > limits.maxFileBytes) throw new Error(`Raw import ${index + 1} source text exceeds the file limit.`);
          if (!Array.isArray(record.sessionExternalIds) || record.sessionExternalIds.length > MAX_SESSIONS || record.sessionExternalIds.some((value) => typeof value !== "string" || value.length > 128)) throw new Error(`Raw import ${index + 1} session references are invalid.`);
        });
        const migrationAudit = boundedRecords(imported.migrationAudit, "Migration audit", 128, allowedMigrationFields);
        migrationAudit.forEach((record, index) => {
          const label = `Migration audit ${index + 1}`;
          if (!Number.isInteger(record.version) || record.version < 1 || record.version > 10000) throw new Error(`${label} version must be an integer between 1 and 10000.`);
          for (const field of ["startedAt", "completedAt"]) {
            if (record[field] != null && (typeof record[field] !== "string" || !record[field] || record[field].length > 64 || !Number.isFinite(Date.parse(record[field])))) throw new Error(`${label} ${field} must be a valid timestamp of at most 64 characters.`);
          }
          for (const field of ["inspected", "changed", "explicitRetained", "manualOverridesPreserved", "warmups", "topSets", "backoffSets", "dropSets", "ambiguous"]) {
            if (record[field] != null && (!Number.isInteger(record[field]) || record[field] < 0 || record[field] > MAX_SETS)) throw new Error(`${label} ${field} must be a non-negative integer within the set limit.`);
          }
          if (record.templatesReseeded != null && (!Number.isInteger(record.templatesReseeded) || record.templatesReseeded < 0 || record.templatesReseeded > MAX_TEMPLATES)) throw new Error(`${label} templatesReseeded must be a non-negative integer within the template limit.`);
          if (record.changes != null && (!Array.isArray(record.changes) || record.changes.length > MAX_SETS)) throw new Error(`${label} changes must be an array within the set limit.`);
          record.changes = (record.changes || []).map((change, changeIndex) => {
            const changeLabel = `${label} change ${changeIndex + 1}`;
            assertAllowed(change, allowedMigrationChangeFields, changeLabel);
            if (change.setId != null) assertId(change.setId, `${changeLabel} set`);
            if (change.exerciseId != null) assertId(change.exerciseId, `${changeLabel} exercise`);
            for (const field of ["from", "to"]) if (change[field] != null && (typeof change[field] !== "string" || change[field].length > 128)) throw new Error(`${changeLabel} ${field} must be a string of at most 128 characters.`);
            assertText(change.reason, `${changeLabel} reason`);
            if (change.confidence != null && (typeof change.confidence !== "number" || !Number.isFinite(change.confidence) || change.confidence < 0 || change.confidence > 1)) throw new Error(`${changeLabel} confidence must be a number between 0 and 1.`);
            return copyAllowed(change, allowedMigrationChangeFields);
          });
        });
        const result = {
          appDataVersion,
          sessions,
          exercises,
          sets,
          templates,
          mesocycles,
          activeMesocycleId,
          recommendationHistory,
          manualOverrides,
          personalEvidencePackage: imported.personalEvidencePackage == null ? null : cloneJsonValue(imported.personalEvidencePackage),
          rawImports,
          migrationAudit,
          // Imported ordering metadata is validated above for auditability but
          // never becomes the local dual-store ordering authority.
          dataRevision: 0,
          settings: copyAllowed(settings, allowedSettingsFields)
        };
        if (Number.isInteger(imported.domainMigrationVersion)) result.domainMigrationVersion = imported.domainMigrationVersion;
        return result;
      }

      function validatePersonalEvidenceJsonShape(value, options = {}) {
        return validateBackupJsonShape(value, {
          maxDepth: options.maxDepth ?? options.maxJsonDepth ?? PERSONAL_EVIDENCE_IMPORT_LIMITS.maxJsonDepth,
          maxObjectKeys: options.maxObjectKeys ?? PERSONAL_EVIDENCE_IMPORT_LIMITS.maxObjectKeys
        });
      }

      function validatePersonalEvidencePackage(parsed) {
        validatePersonalEvidenceJsonShape(parsed);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Personal evidence package must be a JSON object.");
        const allowedPackageFields = new Set(["schemaVersion", "createdAt", "personalDataVersion", "researchDatabaseVersion", "privacy", "personalData", "personal_data", "importedAt"]);
        const unknownPackageField = Object.keys(parsed).find((key) => !allowedPackageFields.has(key));
        if (unknownPackageField) throw new Error(`Personal evidence package contains an unknown field: ${unknownPackageField}.`);
        if (parsed.schemaVersion !== "personal-evidence-package/1.0.0") throw new Error(`Unsupported personal evidence package schema version: ${parsed.schemaVersion || "missing"}.`);
        if (parsed.privacy !== "private_local_only_do_not_deploy") throw new Error("Personal evidence package privacy classification is missing or invalid.");
        const personalData = parsed.personalData || parsed.personal_data;
        if (!personalData || typeof personalData !== "object" || Array.isArray(personalData)) throw new Error("Personal evidence package is missing personalData.");
        const allowedPersonalFields = new Set(["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores", "exerciseSessionMetrics", "weeklyMuscleVolumeResponse", "recoveryRules", "muscleGroupSweetSpots", "metadata", "exercise_prescriptions", "exercise_scores", "exercise_muscle_scores", "exercise_session_metrics", "weekly_muscle_volume_response", "recovery_rules", "muscle_group_sweet_spots"]);
        const unknownPersonalField = Object.keys(personalData).find((key) => !allowedPersonalFields.has(key));
        if (unknownPersonalField) throw new Error(`Personal evidence data contains an unknown collection or field: ${unknownPersonalField}.`);
        const canonical = {
          exercisePrescriptions: personalData.exercisePrescriptions || personalData.exercise_prescriptions,
          exerciseScores: personalData.exerciseScores || personalData.exercise_scores,
          exerciseMuscleScores: personalData.exerciseMuscleScores || personalData.exercise_muscle_scores,
          exerciseSessionMetrics: personalData.exerciseSessionMetrics || personalData.exercise_session_metrics || [],
          weeklyMuscleVolumeResponse: personalData.weeklyMuscleVolumeResponse || personalData.weekly_muscle_volume_response || [],
          recoveryRules: personalData.recoveryRules || personalData.recovery_rules || [],
          muscleGroupSweetSpots: personalData.muscleGroupSweetSpots || personalData.muscle_group_sweet_spots || [],
          metadata: personalData.metadata || {}
        };
        for (const collection of ["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores"]) {
          if (!Array.isArray(canonical[collection])) throw new Error(`Personal evidence package is missing the required ${collection} collection.`);
          if (!canonical[collection].length) throw new Error(`Personal evidence ${collection} collection must contain at least one record.`);
          if (canonical[collection].length > PERSONAL_EVIDENCE_IMPORT_LIMITS.maxCoreCollectionItems) throw new Error(`Personal evidence ${collection} collection exceeds the 1024-record limit.`);
        }
        for (const collection of ["exerciseSessionMetrics", "weeklyMuscleVolumeResponse", "recoveryRules", "muscleGroupSweetSpots"]) {
          if (!Array.isArray(canonical[collection])) throw new Error(`Personal evidence ${collection} must be an array.`);
          if (canonical[collection].length > PERSONAL_EVIDENCE_IMPORT_LIMITS.maxCoreCollectionItems) throw new Error(`Personal evidence ${collection} collection exceeds the 1024-record limit.`);
        }
        const numericFields = new Set(["sample_size", "session_count", "comparable_session_count", "overall_personal_exercise_score", "progression_score", "recovery_efficiency_score", "contribution_weight", "muscle_specific_effectiveness_score", "comparable_sessions", "source_row"]);
        const stack = [{ value: canonical, key: "personalData" }];
        while (stack.length) {
          const current = stack.pop();
          if (!current.value || typeof current.value !== "object") continue;
          for (const [key, value] of Object.entries(current.value)) {
            if (numericFields.has(key) && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`Personal evidence ${key} must be a finite number.`);
            if (typeof value === "string") {
              if (/(?:^|_)(?:id|ids)$|Id$/.test(key)) {
                if (!value || value.length > PERSONAL_EVIDENCE_IMPORT_LIMITS.maxStableIdChars || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) throw new Error(`Personal evidence identifier ${key} exceeds the 128-character safe ID limit.`);
              } else if (/name/i.test(key)) {
                if (value.length > PERSONAL_EVIDENCE_IMPORT_LIMITS.maxNameChars) throw new Error(`Personal evidence name ${key} exceeds the 256-character limit.`);
              } else if (value.length > PERSONAL_EVIDENCE_IMPORT_LIMITS.maxTextChars) {
                throw new Error(`Personal evidence text ${key} exceeds the 4096-character limit.`);
              }
            } else if (value && typeof value === "object") stack.push({ value, key });
          }
        }
        const canonicalPackage = {
          schemaVersion: parsed.schemaVersion,
          createdAt: parsed.createdAt,
          personalDataVersion: parsed.personalDataVersion,
          researchDatabaseVersion: parsed.researchDatabaseVersion,
          privacy: parsed.privacy,
          personalData: canonical
        };
        if (typeof canonicalPackage.createdAt !== "string" || !canonicalPackage.createdAt) throw new Error("Personal evidence package createdAt is required.");
        if (typeof canonicalPackage.personalDataVersion !== "string" || !canonicalPackage.personalDataVersion || canonicalPackage.personalDataVersion.length > 128) throw new Error("Personal evidence personalDataVersion is missing or invalid.");
        if (typeof canonicalPackage.researchDatabaseVersion !== "string" || !canonicalPackage.researchDatabaseVersion || canonicalPackage.researchDatabaseVersion.length > 128) throw new Error("Personal evidence researchDatabaseVersion is missing or invalid.");
        return canonicalPackage;
      }

      function personalEvidenceBundleForImport(personalData) {
        if (!prescriptionApi || !prescriptionEngine?.evidence?.research) throw new Error("The research engine is unavailable; personal evidence was not imported.");
        const bundle = prescriptionApi.normalizeEvidenceBundle({ personalData, research: prescriptionEngine.evidence.research });
        const invalidIdentities = [...(bundle.personal.reconciledIdentityByExerciseId || new Map()).entries()].filter(([, identity]) => identity?.invalid);
        if (invalidIdentities.length) throw new Error(`Personal evidence identity reconciliation conflict for ${invalidIdentities.map(([exerciseId]) => exerciseId).join(", ")}.`);
        const expectedCounts = [personalData.exercisePrescriptions.length, personalData.exerciseScores.length, personalData.exerciseMuscleScores.length];
        const normalizedCounts = [bundle.personal.exercisePrescriptions.length, bundle.personal.exerciseScores.length, bundle.personal.exerciseMuscleScores.length];
        if (expectedCounts.some((count, index) => count !== normalizedCounts[index])) throw new Error("Personal evidence engine validation rejected one or more aggregate rows.");
        const engine = prescriptionApi.createPrescriptionEngine(bundle);
        if (!(engine?.evidence?.personal?.reconciledIdentityByExerciseId instanceof Map)) throw new Error("Personal evidence engine construction did not preserve canonical identity reconciliation.");
        return { bundle, engine };
      }

      function researchOnlyBundleForImport() {
        if (!prescriptionApi || !prescriptionEngine?.evidence?.research) throw new Error("The research engine is unavailable; the backup was not imported.");
        const bundle = prescriptionApi.normalizeEvidenceBundle({ personalData: {}, research: prescriptionEngine.evidence.research });
        return { bundle, engine: prescriptionApi.createPrescriptionEngine(bundle) };
      }

      function installPreparedEvidence(prepared, sourceLabel) {
        prescriptionEngine = prepared.engine;
        const personalRecords = prepared.bundle.personal.exercisePrescriptions.length + prepared.bundle.personal.exerciseScores.length + prepared.bundle.personal.exerciseMuscleScores.length;
        prescriptionEvidenceStatus = {
          state: prepared.bundle.research.exerciseDatabase.length ? "ready" : "research_unavailable",
          source: sourceLabel,
          personalRecords,
          researchExercises: prepared.bundle.research.exerciseDatabase.length,
          personalVersion: prepared.bundle.versions.personal,
          researchVersion: prepared.bundle.versions.research,
          message: personalRecords
            ? `Unified engine loaded ${personalRecords} personal prescription/score records and ${prepared.bundle.research.exerciseDatabase.length} research exercises from ${sourceLabel}.`
            : `Unified engine loaded ${prepared.bundle.research.exerciseDatabase.length} research exercises. Import the private personal evidence package to add local aggregates.`
        };
        return personalRecords;
      }

      function validateExecutableRecommendationSnapshot(snapshot, engine, hostExercise, label) {
        if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error(`${label} must be a recommendation snapshot object.`);
        if (!prescriptionApi?.serializeRecommendationSnapshot) throw new Error("Recommendation snapshot validation is unavailable; the backup was not imported.");
        prescriptionApi.serializeRecommendationSnapshot(snapshot);
        const identity = engine.resolveExerciseIdentity(snapshot.exerciseId);
        const reconciledCustom = engine.evidence?.personal?.reconciledIdentityByExerciseId?.get(snapshot.exerciseId);
        const declaredProfile = hostExercise && typeof normalizeCustomExerciseProfile === "function" ? normalizeCustomExerciseProfile(hostExercise.customExerciseProfile) : null;
        const declaredCustom = hostExercise?.identitySource === "user_declared_custom"
          && declaredProfile?.status === "complete"
          && String(hostExercise.performanceExerciseId || "") === String(snapshot.exerciseId || "")
          && declaredProfile.primaryMuscleGroupId === String(snapshot.muscleGroupId || "");
        const trustedCustom = declaredCustom || (/^(?:custom|user)(?::|_)/.test(snapshot.exerciseId || "")
          && reconciledCustom && !reconciledCustom.invalid && !reconciledCustom.researchExerciseId);
        if (identity?.status !== "resolved" && !trustedCustom) throw new Error(identity?.reason || "unknown_exercise_identity");
        const canonicalExerciseId = identity?.status === "resolved" ? identity.exerciseId : snapshot.exerciseId;
        if (canonicalExerciseId !== snapshot.exerciseId) throw new Error("Snapshot exercise identity is not the canonical reconciled identity.");

        const snapshotMuscleGroupId = String(snapshot.muscleGroupId || "").trim();
        if (!snapshotMuscleGroupId) throw new Error("Snapshot muscle-group target is missing.");
        for (const prescription of [snapshot.basePrescription, snapshot.finalPrescription]) {
          if (prescription?.muscleGroupId && prescription.muscleGroupId !== snapshotMuscleGroupId) {
            throw new Error("Snapshot prescription target does not match its top-level muscle-group target.");
          }
        }
        if (identity?.status === "resolved") {
          const target = engine.resolveDefaultPrescriptionTarget(canonicalExerciseId);
          if (target?.status !== "resolved" || target.exerciseId !== canonicalExerciseId || target.muscleGroupId !== snapshotMuscleGroupId) {
            throw new Error(target?.reason || "Snapshot exercise and canonical direct target do not match.");
          }
        } else {
          const personalRows = [
            ...(engine.evidence?.personal?.prescriptionsFor?.(canonicalExerciseId) || []),
            ...(engine.evidence?.personal?.muscleScoresFor?.(canonicalExerciseId) || [])
          ];
          const trustedMuscleGroups = new Set(personalRows.map((record) => String(record?.muscle_group_id || record?.muscleGroupId || "").trim()).filter(Boolean));
          if (!trustedMuscleGroups.has(snapshotMuscleGroupId) && !declaredCustom) throw new Error("Trusted custom snapshot target is not supported by reconciled personal evidence or its bounded declared profile.");
        }

        if (hostExercise && typeof hostExercise === "object") {
          const hostIdentityInput = hostExercise.canonicalExerciseId || hostExercise.researchExerciseId || hostExercise.name || "";
          const hostIdentity = hostIdentityInput ? engine.resolveExerciseIdentity(hostIdentityInput) : null;
          if (hostIdentity?.status === "resolved" && hostIdentity.exerciseId !== canonicalExerciseId) {
            throw new Error("Host exercise identity does not match its executable recommendation snapshot.");
          }
          if (hostIdentity?.status !== "resolved") {
            const explicitHostId = String(hostExercise.canonicalExerciseId || hostExercise.researchExerciseId || "").trim();
            if (explicitHostId && explicitHostId !== canonicalExerciseId) throw new Error("Host exercise identity does not match its executable recommendation snapshot.");
            if (!trustedCustom) throw new Error(hostIdentity?.reason || "Host exercise identity could not be reconciled.");
          }
        }
        return true;
      }

      function validateImportedExecutableRecommendationSnapshot(snapshot, engine, label, hostExercise = null) {
        try {
          return validateExecutableRecommendationSnapshot(snapshot, engine, hostExercise, label);
        } catch (error) {
          throw new Error(`${label} failed schema, checksum, identity, or taxonomy validation: ${error?.message || error}.`);
        }
      }

      function validateImportedExecutableRecommendationSnapshots(candidate, engine) {
        const sessionById = new Map(candidate.sessions.map((session) => [session.id, session]));
        candidate.exercises.forEach((exercise, index) => {
          if (!exercise.recommendationSnapshot) return;
          const session = sessionById.get(exercise.sessionId);
          const historical = session?.submitted === true || session?.workoutState === "completed";
          if (!historical) validateImportedExecutableRecommendationSnapshot(exercise.recommendationSnapshot, engine, `Active exercise ${index + 1} recommendationSnapshot`, exercise);
        });
        candidate.sessions.forEach((session, sessionIndex) => {
          if (session.submitted === true || session.workoutState === "completed") return;
          const recommendations = session.workoutPrescription?.recommendations;
          if (recommendations == null) return;
          if (!Array.isArray(recommendations)) throw new Error(`Active session ${sessionIndex + 1} workoutPrescription recommendations must be an array.`);
          recommendations.forEach((snapshot, snapshotIndex) => {
            const hostExercise = candidate.exercises.find((exercise) => exercise.sessionId === session.id && exercise.recommendationSnapshot?.recommendationId === snapshot?.recommendationId) || null;
            const declaredCustomHost = hostExercise?.identitySource === "user_declared_custom" ? hostExercise : null;
            validateImportedExecutableRecommendationSnapshot(snapshot, engine, `Active session ${sessionIndex + 1} workout recommendation ${snapshotIndex + 1}`, declaredCustomHost);
          });
        });
        candidate.templates.forEach((template, templateIndex) => {
          template.exercises.forEach((exercise, exerciseIndex) => {
            if (exercise.recommendationSnapshot) validateImportedExecutableRecommendationSnapshot(exercise.recommendationSnapshot, engine, `Template ${templateIndex + 1} exercise ${exerciseIndex + 1} recommendationSnapshot`, exercise);
          });
        });
        return true;
      }

      function nextMonotonicImportRevision() {
        const current = Number(data?.dataRevision || 0);
        if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) throw new Error("Local data revision is exhausted or invalid; export the selected copy and clear local data before importing.");
        return current + 1;
      }

      async function importDataFile(file) {
        if (importInProgress) return;
        importInProgress = true;
        importAttempt += 1;
        importStatus = { state: "importing", message: `Importing ${file.name}...` };
        settingsMessage = importStatus.message;
        render();
        try {
          if (appDataPersistenceConflict) {
            throw new Error("Import is blocked because two valid saved app-data copies disagree and neither may be discarded automatically. Export downloads only the currently selected copy; the preserved alternate is excluded. Review the export, then use confirmed Clear All Local App Data before importing a replacement.");
          }
          if (Number(file.size || 0) > BACKUP_IMPORT_LIMITS.maxFileBytes) throw new Error("Backup file is too large; the maximum size is 50 MiB.");
          const text = await file.text();
          if (new TextEncoder().encode(text).byteLength > BACKUP_IMPORT_LIMITS.maxFileBytes) throw new Error("Backup file is too large; the maximum size is 50 MiB.");
          if (file.name.toLowerCase().endsWith(".csv") || text.startsWith("Date,Workout Name,Duration,Exercise Name")) {
            importStrongCsv(text, strongImportWeightUnit);
            importStatus = { state: "accepted", message: settingsMessage || "Strong import complete." };
            return;
          }
          let parsed;
          try { parsed = JSON.parse(text); }
          catch { throw new Error("Backup is not valid JSON."); }
          const envelope = window.FitnessBackupContract.validateAndSanitizeBackup(parsed, { byteLength: new TextEncoder().encode(text).byteLength });
          const { backupSchemaVersion: _validatedBackupSchemaVersion, ...imported } = envelope;
          const validated = validateImportedAppData(imported, BACKUP_IMPORT_LIMITS);
          let preparedEvidence;
          if (validated.personalEvidencePackage) {
            const importedPackage = validated.personalEvidencePackage;
            validated.personalEvidencePackage = { ...validatePersonalEvidencePackage(importedPackage), importedAt: importedPackage.importedAt || isoNow() };
            preparedEvidence = personalEvidenceBundleForImport(validated.personalEvidencePackage.personalData);
          } else {
            preparedEvidence = researchOnlyBundleForImport();
          }
          const candidate = normalizeLoadedData(validated);
          candidate.dataRevision = nextMonotonicImportRevision();
          validateImportedExecutableRecommendationSnapshots(candidate, preparedEvidence.engine);
          await writeIndexedValue("app-data", candidate);
          try { localStorage.removeItem(STORAGE_KEY); } catch { /* The imported IndexedDB copy has the higher monotonic revision. */ }
          data = candidate;
          templateNumericDrafts.clear();
          installPreparedEvidence(preparedEvidence, candidate.personalEvidencePackage ? "imported backup evidence" : "research defaults");
          entityStructureRevision += 1;
          entityIndexCache = null;
          invalidateCompletedAnalysis();
          activeSessionId = data.sessions[0]?.id || "";
          activeWorkoutId = data.sessions.find((session) => sessionHasStarted(session) && !isSessionSubmitted(session))?.id || "";
          settingsMessage = "Import complete.";
          importStatus = { state: "accepted", message: settingsMessage };
          saveRuntime();
        } catch (error) {
          settingsMessage = error instanceof Error ? error.message : "Import failed.";
          importStatus = { state: "rejected", message: settingsMessage };
        } finally {
          importInProgress = false;
          render();
        }
      }

      async function importPersonalEvidenceFile(file) {
        try {
          window.clearTimeout(saveTimer);
          if (idleSaveHandle && "cancelIdleCallback" in window) window.cancelIdleCallback(idleSaveHandle);
          idleSaveHandle = 0;
          if (Number(file?.size || 0) > PERSONAL_EVIDENCE_IMPORT_LIMITS.maxFileBytes) throw new Error("Personal evidence file is too large; the maximum size is 8 MiB.");
          let parsed;
          const text = await file.text();
          if (new TextEncoder().encode(text).byteLength > PERSONAL_EVIDENCE_IMPORT_LIMITS.maxFileBytes) throw new Error("Personal evidence file is too large; the maximum size is 8 MiB.");
          try { parsed = JSON.parse(text); }
          catch { throw new Error("Personal evidence file is not valid JSON."); }
          const validated = validatePersonalEvidencePackage(parsed);
          const prepared = personalEvidenceBundleForImport(validated.personalData);
          const canonicalPackage = { ...validated, importedAt: isoNow() };
          const candidateData = { ...data, personalEvidencePackage: canonicalPackage, dataRevision: Number(data.dataRevision || 0) + 1 };
          await writeIndexedValue("app-data", candidateData);
          data = candidateData;
          const personalRecords = installPreparedEvidence(prepared, "imported local evidence");
          invalidateCompletedAnalysis();
          settingsMessage = `Private evidence imported: ${personalRecords} aggregate records, personal version ${prescriptionEvidenceStatus.personalVersion}.`;
          render();
        } catch (error) {
          settingsMessage = error?.message || "The personal evidence package could not be imported.";
          render();
        }
      }
