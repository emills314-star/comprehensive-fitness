
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

      const muscleGroups = ["Chest", "Back", "Quads", "Hamstrings", "Glutes", "Adductors", "Shoulders", "Biceps", "Triceps", "Forearms", "Calves", "Core", "Neck"];

      function readinessBaseline() {
        return cleanReadinessBaseline(data.settings.readinessBaseline || {});
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
              targetRpe: Number(completedSets[0]?.targetRpe ?? completedSets[0]?.targetRpeMax) || (completedSets.some((set) => Number(set.rpe) > 0) ? Math.round((completedSets.filter((set) => Number(set.rpe) > 0).reduce((sum, set) => sum + Number(set.rpe), 0) / completedSets.filter((set) => Number(set.rpe) > 0).length) * 2) / 2 : 8),
              increment: progressionProfileForExercise(exercise.name).increment,
              restSeconds: exercise.restSeconds || recommendedRestSeconds(exercise.name, { reps: representativeReps }),
              setTypes: templateSetTypesFromHistory(completedSets, exercise.restSeconds || recommendedRestSeconds(exercise.name, { reps: representativeReps })),
              warmups: exerciseSets.filter((set) => setTypeSemantics(set).isWarmup).map((set) => ({ reps: set.reps, targetRepMin: set.targetRepMin, targetRepMax: set.targetRepMax, targetRpe: set.targetRpe, targetRpeMin: set.targetRpeMin, targetRpeMax: set.targetRpeMax, targetRestSeconds: set.targetRestSeconds, weight: set.weight, weightUnit: set.weightUnit, resistanceType: set.resistanceType, isBodyweight: set.isBodyweight, addedLoad: set.addedLoad, assistanceLoad: set.assistanceLoad, rpe: set.rpe }))
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
          const target = stableTargetForTemplateExercise(exercise, {
            template,
            resistanceType: exercise.resistanceType || inferResistanceType(exercise.name, exercise)
          });
          return Number(target?.sets || 0) >= 1 && Number(target?.reps || 0) >= 1;
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
        const allowedTopLevelFields = new Set(["appDataVersion", "domainMigrationVersion", "sessions", "exercises", "sets", "templates", "recommendationHistory", "manualOverrides", "personalEvidencePackage", "rawImports", "migrationAudit", "dataRevision", "settings"]);
        const allowedSessionFields = new Set(["id", "externalId", "source", "date", "title", "isTravel", "notes", "submitted", "workoutStarted", "workoutState", "completedAt", "submittedAt", "startedAt", "createdAt", "updatedAt", "durationSeconds", "templateId", "recovery", "readinessMode", "readinessAdjustments", "usedOriginalTargets", "resolvedActions", "prs", "grade", "gradeVersion", "workoutAnalysis", "workoutPrescription", "adjustmentSummary", "exerciseQualityAnswers", "deletedAt", "trashed", "canceledAt"]);
        const allowedExerciseFields = new Set(["id", "externalId", "source", "sessionId", "name", "notes", "order", "primaryMuscle", "secondaryMuscle", "restSeconds", "resistanceType", "isBodyweight", "isDeload", "customExerciseProfile", "executionQualityAssessment", "recommendationSnapshot", "basePrescription", "finalPrescription", "coachRecommendation", "executionBlocked", "safetyRestriction", "manualOverrides", "adjusted", "adjustmentReason", "triggerLabels", "canonicalExerciseId", "performanceExerciseId", "researchExerciseId", "identitySource", "identityVersion", "originalPrescription", "prescription", "recommendationVersion", "personalDataVersion", "researchDatabaseVersion", "programTargetContext", "appliedTargetContext", "overrideLocked"]);
        const allowedSetFields = new Set(["id", "exerciseId", "setNumber", "sequenceIndex", "sequence", "setTypeIndex", "setType", "reps", "weight", "weightUnit", "resistanceType", "rpe", "completed", "skipped", "edited", "isWarmup", "countsTowardScore", "countsTowardVolume", "countsTowardProgression", "addedLoad", "assistanceLoad", "durationSeconds", "distance", "distanceUnit", "targetReps", "targetRepMin", "targetRepMax", "targetWeight", "targetRpe", "targetRpeMin", "targetRpeMax", "targetRpeTolerance", "targetRestSeconds", "setPrescription", "previousComparableSet", "prescriptionReason", "prescriptionMode", "prescriptionConfidence", "validationWarning", "classificationSource", "classificationConfidence", "classifierVersion", "manualOverride", "reviewRequired", "classifiedAt", "sourceSetOrder", "originalImportedValue"]);
        const allowedTemplateFields = new Set(["id", "name", "notes", "createdAt", "updatedAt", "exercises", "source"]);
        const allowedTemplateExerciseFields = new Set(["id", "name", "notes", "sets", "reps", "repMin", "repMax", "standardWorkloadOverride", "standardRoleWorkload", "targetRpe", "increment", "restSeconds", "resistanceType", "isBodyweight", "primaryMuscle", "secondaryMuscle", "customExerciseProfile", "warmups", "setTypes", "canonicalExerciseId", "performanceExerciseId", "researchExerciseId", "identitySource", "identityVersion", "recommendationSnapshot"]);
        const allowedSettingsFields = new Set(["weightUnit", "theme", "colorPackage", "timerSound", "workoutCompletionSound", "timerVibration", "interactionVibration", "timerNotifications", "inAppRestAlerts", "restCompleteSound", "restCompleteSoundVolume", "restCompleteAutoDismissMs", "restCompleteLockScreenNotifications", "restCompleteAutoReturnToWorkout", "defaultRestSeconds", "notificationMessageDetail", "autoStartRestTimer", "autoHighlightNextSet", "autoScrollNextSet", "installGuideDismissed", "setupSoundConfirmed", "cloudWorkoutSyncConsent", "workoutCloudSync", "workoutCloudSyncConsentVersion", "readinessBaseline"]);
        const allowedRecommendationFields = new Set(["recommendationId", "schemaVersion", "recommendationVersion", "engineVersion", "personalDataVersion", "researchDatabaseVersion", "exerciseId", "muscleGroupId", "exerciseScore", "muscleSpecificScore", "personalEvidenceWeight", "researchEvidenceWeight", "standardGuideline", "readinessAdjustment", "basePrescription", "finalPrescription", "explanation", "evidenceSummary", "confidence", "createdAt", "manualOverrides", "overrideLocked", "checksum", "request", "scores", "versions"]);
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
        const assertResolvedAction = (action, label) => {
          if (window.FitnessExceptionResolver?.validateResolvedAction) {
            const validation = window.FitnessExceptionResolver.validateResolvedAction(action);
            if (!validation?.valid) throw new Error(`${label} is invalid: ${validation?.reason || "resolved action contract violation"}.`);
            return;
          }
          const allowedCategories = new Set(["none", "pain_or_illness", "deload", "readiness", "fatigue", "plateau"]);
          const allowedHandling = new Set(["pending", "accepted", "modified", "ignored", "overridden"]);
          if (!action || typeof action !== "object" || Array.isArray(action)) throw new Error(`${label} must be an object.`);
          if (action.contractVersion !== "comprehensive-fitness-resolved-action/1.0.0") throw new Error(`${label} contractVersion is unsupported.`);
          assertId(action.decisionId, `${label} decision id`);
          if (!["no_action", "action"].includes(action.outcome)) throw new Error(`${label} outcome is invalid.`);
          if (!allowedCategories.has(action.category)) throw new Error(`${label} category is invalid.`);
          if (!action.scope || !["session", "exercise"].includes(action.scope.type)) throw new Error(`${label} scope is invalid.`);
          if (action.scope.type === "exercise") assertId(action.scope.exerciseVariantId, `${label} exercise variant`);
          if (!action.action || typeof action.action !== "object" || Array.isArray(action.action)) throw new Error(`${label} action must be an object.`);
          if (!Array.isArray(action.reasonCodes) || !Array.isArray(action.sourceReferences)) throw new Error(`${label} reason/source references must be arrays.`);
          if (action.handling != null && !allowedHandling.has(action.handling)) throw new Error(`${label} handling is invalid.`);
        };
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
        if (!Number.isInteger(appDataVersion) || ![1, 2, 3].includes(appDataVersion)) throw new Error("Unsupported or malformed appDataVersion; only versions 1, 2, and 3 are supported.");
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
          assertNumericDomain(record.durationSeconds, { min: 0, integer: true }, `Session ${index + 1} durationSeconds`);
          if (record.exerciseQualityAnswers != null) {
            if (!record.exerciseQualityAnswers || typeof record.exerciseQualityAnswers !== "object" || Array.isArray(record.exerciseQualityAnswers)) throw new Error(`Session ${index + 1} exerciseQualityAnswers must be an object.`);
            Object.entries(record.exerciseQualityAnswers).forEach(([exerciseId, answer]) => {
              assertId(exerciseId, `Session ${index + 1} execution-quality exercise`);
              if (!["controlled", "breakdown", "not_assessed"].includes(answer)) throw new Error(`Session ${index + 1} execution-quality answer is invalid.`);
            });
          }
          if (record.resolvedActions != null) {
            if (!Array.isArray(record.resolvedActions) || record.resolvedActions.length > 64) throw new Error(`Session ${index + 1} resolvedActions is invalid or exceeds its limit.`);
            record.resolvedActions.forEach((action, actionIndex) => assertResolvedAction(action, `Session ${index + 1} resolved action ${actionIndex + 1}`));
          }
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
            if (exercise.standardRoleWorkload != null) {
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
        const settings = imported.settings == null ? {} : imported.settings;
        assertAllowed(settings, allowedSettingsFields, "Settings");
        if (settings.weightUnit != null && !["lb", "kg"].includes(settings.weightUnit)) throw new Error("Settings weightUnit must be lb or kg.");
        if (settings.theme != null && !["light", "dark"].includes(settings.theme)) throw new Error("Settings theme is invalid.");
        if (settings.colorPackage != null && !["heritage-atlas", "signal-garden", "alpine-ledger", "training-hall", "harbor-pulse", "prairie-electric", "redwood-circuit", "mediterranean-set", "modern-primary", "night-stadium"].includes(settings.colorPackage)) throw new Error("Settings colorPackage is invalid.");
        const booleanSettingFields = ["timerSound", "workoutCompletionSound", "timerVibration", "interactionVibration", "timerNotifications", "inAppRestAlerts", "restCompleteLockScreenNotifications", "restCompleteAutoReturnToWorkout", "autoStartRestTimer", "autoHighlightNextSet", "autoScrollNextSet", "installGuideDismissed", "setupSoundConfirmed", "cloudWorkoutSyncConsent"];
        booleanSettingFields.forEach((field) => { if (settings[field] != null && typeof settings[field] !== "boolean") throw new Error(`Settings ${field} must be boolean.`); });
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

      async function personalEvidenceBundleForImport(personalData) {
        if (!prescriptionApi) throw new Error("The identity compatibility engine is unavailable; personal evidence was not imported.");
        const researchData = await loadImportValidationResearch();
        const bundle = prescriptionApi.normalizeEvidenceBundle({ personalData, researchData });
        const invalidIdentities = [...(bundle.personal.reconciledIdentityByExerciseId || new Map()).entries()].filter(([, identity]) => identity?.invalid);
        if (invalidIdentities.length) throw new Error(`Personal evidence identity reconciliation conflict for ${invalidIdentities.map(([exerciseId]) => exerciseId).join(", ")}.`);
        const expectedCounts = [personalData.exercisePrescriptions.length, personalData.exerciseScores.length, personalData.exerciseMuscleScores.length];
        const normalizedCounts = [bundle.personal.exercisePrescriptions.length, bundle.personal.exerciseScores.length, bundle.personal.exerciseMuscleScores.length];
        if (expectedCounts.some((count, index) => count !== normalizedCounts[index])) throw new Error("Personal evidence engine validation rejected one or more aggregate rows.");
        const engine = prescriptionApi.createPrescriptionEngine(bundle);
        if (!(engine?.evidence?.personal?.reconciledIdentityByExerciseId instanceof Map)) throw new Error("Personal evidence engine construction did not preserve canonical identity reconciliation.");
        const identityEngine = prescriptionApi.createPrescriptionEngine({ personalData: {}, researchData: { exerciseDatabase: researchData.exerciseDatabase } });
        return { bundle, engine, identityEngine, exerciseDatabase: researchData.exerciseDatabase };
      }

      async function researchOnlyBundleForImport() {
        if (!prescriptionApi) throw new Error("The identity compatibility engine is unavailable; the backup was not imported.");
        const researchData = await loadImportValidationResearch();
        const bundle = prescriptionApi.normalizeEvidenceBundle({ personalData: {}, researchData });
        const engine = prescriptionApi.createPrescriptionEngine(bundle);
        const identityEngine = prescriptionApi.createPrescriptionEngine({ personalData: {}, researchData: { exerciseDatabase: researchData.exerciseDatabase } });
        return { bundle, engine, identityEngine, exerciseDatabase: researchData.exerciseDatabase };
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
          const decodedEnvelope = window.FitnessBackupContract.decodeLegacyBackup(envelope);
          const { backupSchemaVersion: _validatedBackupSchemaVersion, ...imported } = decodedEnvelope;
          const validated = validateImportedAppData(imported, BACKUP_IMPORT_LIMITS);
          let preparedEvidence;
          if (validated.personalEvidencePackage) {
            const importedPackage = validated.personalEvidencePackage;
            validated.personalEvidencePackage = { ...validatePersonalEvidencePackage(importedPackage), importedAt: importedPackage.importedAt || isoNow() };
            preparedEvidence = await personalEvidenceBundleForImport(validated.personalEvidencePackage.personalData);
          } else {
            preparedEvidence = await researchOnlyBundleForImport();
          }
          const candidate = normalizeLoadedData(validated);
          candidate.dataRevision = nextMonotonicImportRevision();
          validateImportedExecutableRecommendationSnapshots(candidate, preparedEvidence.engine);
          await writeIndexedValue("app-data", candidate);
          try { localStorage.removeItem(STORAGE_KEY); } catch { /* The imported IndexedDB copy has the higher monotonic revision. */ }
          data = candidate;
          templateNumericDrafts.clear();
          installExerciseIdentityCompatibility(preparedEvidence.exerciseDatabase, preparedEvidence.identityEngine);
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
          const prepared = await personalEvidenceBundleForImport(validated.personalData);
          const canonicalPackage = { ...validated, importedAt: isoNow() };
          const candidateData = { ...data, personalEvidencePackage: canonicalPackage, dataRevision: Number(data.dataRevision || 0) + 1 };
          await writeIndexedValue("app-data", candidateData);
          data = candidateData;
          installExerciseIdentityCompatibility(prepared.exerciseDatabase, prepared.identityEngine);
          const personalRecords = prepared.bundle.personal.exercisePrescriptions.length + prepared.bundle.personal.exerciseScores.length + prepared.bundle.personal.exerciseMuscleScores.length;
          invalidateCompletedAnalysis();
          settingsMessage = `Private evidence imported: ${personalRecords} aggregate records, personal version ${validated.personalDataVersion}.`;
          render();
        } catch (error) {
          settingsMessage = error?.message || "The personal evidence package could not be imported.";
          render();
        }
      }
