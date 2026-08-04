      const STRONG_IMPORT_CONTRACT_VERSION = "strong-csv-import/1.0.0";
      let pendingImport = null;

      function cloneImportSnapshot(value) {
        return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
      }

      function collectionCounts(value) {
        return {
          sessions: Array.isArray(value?.sessions) ? value.sessions.length : 0,
          exercises: Array.isArray(value?.exercises) ? value.exercises.length : 0,
          sets: Array.isArray(value?.sets) ? value.sets.length : 0,
          templates: Array.isArray(value?.templates) ? value.templates.length : 0
        };
      }

      async function exportData() {
        const activeWorkoutDraft = activeWorkoutDraftSnapshot({ incrementSequence: false });
        exportText = window.FitnessBackupContract.serializeBackupExport(data, { activeWorkoutDraft });
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

      function validateStrongImportCandidate(candidate) {
        const candidateRevision = candidate.dataRevision;
        const validated = validateImportedAppData(candidate, BACKUP_IMPORT_LIMITS);
        validated.dataRevision = candidateRevision;
        assertCandidateHasRecoverableExport(validated);
        return validated;
      }

      function prepareStrongCsvImport(text, sourceWeightUnit, fileName = "Strong CSV") {
        const weightUnit = normalizeStrongImportWeightUnit(sourceWeightUnit);
        const sourceBytes = new TextEncoder().encode(text).byteLength;
        if (sourceBytes > BACKUP_IMPORT_LIMITS.maxRawImportBytes) {
          throw new Error("Strong CSV is too large to retain in a round-trip-safe backup; the maximum size is 10 MiB.");
        }
        const retainedRawImport = (data.rawImports || []).find((item) => item.source === "strong" && item.originalText === text);
        if (retainedRawImport) {
          const retainedUnit = retainedStrongImportWeightUnit(retainedRawImport);
          if (!retainedUnit) throw new Error("This Strong CSV was already imported before its source weight unit was recorded. No data was changed; keep the retained raw source and review its existing sets before importing again.");
          if (retainedUnit !== weightUnit) throw new Error(`This Strong CSV was already imported as ${retainedUnit}. No data was changed; the same raw source cannot be reinterpreted as ${weightUnit}.`);
          return {
            kind: "strong",
            fileName,
            baseDataRevision: Number(data.dataRevision || 0),
            candidate: null,
            noChanges: true,
            preview: {
              title: "Strong CSV already imported",
              mode: "No changes",
              version: retainedRawImport.importVersion || STRONG_IMPORT_CONTRACT_VERSION,
              sourceBytes,
              sourceUnit: weightUnit,
              counts: { sessions: 0, exercises: 0, sets: 0, templates: 0 },
              reviewRequired: 0,
              facts: ["The exact raw source and its weight unit are already retained.", "Apply will perform no write."]
            },
            completionMessage: `Strong CSV already imported as ${weightUnit}. No data was changed; the raw source backup is already retained.`
          };
        }
        const parsedRows = parseCsv(text);
        const rows = parsedRows.filter((row) => row.Date && row["Exercise Name"] && isStrongWorkSet(row));
        if (!rows.length) throw new Error("No Strong workout rows found.");
        const existingSessionIds = new Set(data.sessions.map((session) => session.externalId).filter(Boolean));
        const duplicateSessionIds = new Set();
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
          if (existingSessionIds.has(sessionExternalId)) {
            duplicateSessionIds.add(sessionExternalId);
            return;
          }
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
          const candidate = validateStrongImportCandidate({
            ...data,
            templates: [...templates, ...data.templates],
            rawImports: [...(data.rawImports || []), {
              id: "strong-backup-" + importStamp,
              source: "strong",
              importVersion: STRONG_IMPORT_CONTRACT_VERSION,
              importedAt: isoNow(),
              originalText: text,
              weightUnit,
              sessionExternalIds: []
            }],
            dataRevision: nextMonotonicImportRevision()
          });
          return {
            kind: "strong",
            fileName,
            baseDataRevision: Number(data.dataRevision || 0),
            candidate,
            noChanges: false,
            newestSessionId: "",
            templateIds: templates.map((template) => template.id),
            preview: {
              title: "Strong CSV ready to apply",
              mode: "Merge history",
              version: STRONG_IMPORT_CONTRACT_VERSION,
              sourceBytes: new TextEncoder().encode(text).byteLength,
              sourceUnit: weightUnit,
              counts: { sessions: 0, exercises: 0, sets: 0, templates: templates.length },
              reviewRequired: 0,
              facts: [
                `${duplicateSessionIds.size} workout${duplicateSessionIds.size === 1 ? "" : "s"} already exist and will not be duplicated.`,
                "The raw CSV and selected source unit will be retained."
              ]
            },
            completionMessage: `Strong workout rows already existed; retained this ${weightUnit} CSV source.` + (templates.length ? " Added " + templates.length + " templates from active workout names." : "")
          };
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
        const candidate = validateStrongImportCandidate({
          ...data,
          sessions: [...sessions, ...data.sessions],
          exercises: [...data.exercises, ...exercises],
          sets: [...data.sets, ...sets],
          templates: [...templates, ...data.templates],
          rawImports: [...(data.rawImports || []), {
            id: "strong-" + importStamp,
            source: "strong",
            importVersion: STRONG_IMPORT_CONTRACT_VERSION,
            importedAt: isoNow(),
            originalText: text,
            weightUnit,
            sessionExternalIds: sessions.map((session) => session.externalId)
          }],
          dataRevision: nextMonotonicImportRevision()
        });
        const reviewRequired = sets.filter((set) => set.reviewRequired).length;
        const customIdentityCount = exercises.filter((exercise) => !exercise.researchExerciseId).length;
        const ignoredRows = Math.max(0, parsedRows.length - rows.length);
        const facts = [
          `${reviewRequired} set classification${reviewRequired === 1 ? "" : "s"} need${reviewRequired === 1 ? "s" : ""} review.`,
          `${customIdentityCount} exercise entr${customIdentityCount === 1 ? "y" : "ies"} will retain a distinct non-research performance identity.`,
          "The raw CSV, original values, selected source unit, and import version will be retained."
        ];
        if (duplicateSessionIds.size) facts.unshift(`${duplicateSessionIds.size} existing workout${duplicateSessionIds.size === 1 ? "" : "s"} will be skipped without duplication.`);
        if (ignoredRows) facts.push(`${ignoredRows} non-work-set or incomplete row${ignoredRows === 1 ? "" : "s"} will be ignored.`);
        return {
          kind: "strong",
          fileName,
          baseDataRevision: Number(data.dataRevision || 0),
          candidate,
          noChanges: false,
          newestSessionId: sessions.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.id || "",
          templateIds: templates.map((template) => template.id),
          preview: {
            title: "Strong CSV ready to apply",
            mode: "Merge history",
            version: STRONG_IMPORT_CONTRACT_VERSION,
            sourceBytes,
            sourceUnit: weightUnit,
            counts: { sessions: sessions.length, exercises: exercises.length, sets: sets.length, templates: templates.length },
            reviewRequired,
            facts: facts.slice(0, 5)
          },
          completionMessage: "Imported " + sessions.length + " Strong workouts, " + exercises.length + " exercises, " + sets.length + " sets, and " + templates.length + " templates with source weights in " + weightUnit + "."
        };
      }

      function importStrongCsv(text, sourceWeightUnit, options = {}) {
        pendingImport = prepareStrongCsvImport(text, sourceWeightUnit, options.fileName || "Strong CSV");
        settingsMessage = pendingImport.noChanges
          ? pendingImport.completionMessage
          : "Preview ready. Review the validated counts and facts, then choose Apply import.";
        importStatus = { state: "preview", message: settingsMessage };
        if (options.render !== false) render();
        return pendingImport.preview;
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
        const templateNumericDomain = {
          "template-exercise-sets": { min: 1, max: 100, step: 1, integer: true },
          "template-exercise-reps": { min: 1, max: 1000, step: 1, integer: true },
          "template-exercise-rep-min": { min: 1, max: 100, step: 1, integer: true },
          "template-exercise-rep-max": { min: 1, max: 100, step: 1, integer: true },
          "template-exercise-rpe": { min: 5, max: 10, step: 0.5, integer: false },
          "template-exercise-increment": { min: 0.5, max: 10000, step: 0.5, integer: false },
          "template-exercise-rest": { min: 15, max: 3600, step: 15, integer: true },
          ...(typeof templateNumericFields === "object" ? templateNumericFields : {})
        };
        if (Object.prototype.hasOwnProperty.call(imported, "dataRevision")
          && (!Number.isSafeInteger(imported.dataRevision) || imported.dataRevision < 0)) {
          throw new Error("Backup dataRevision must be omitted or a non-negative safe integer.");
        }
        const allowedTopLevelFields = new Set(["appDataVersion", "domainMigrationVersion", "sessions", "exercises", "sets", "templates", "recommendationHistory", "manualOverrides", "personalEvidencePackage", "rawImports", "migrationAudit", "dataRevision", "settings"]);
        const allowedSessionFields = new Set(["id", "externalId", "source", "date", "title", "isTravel", "notes", "submitted", "workoutStarted", "workoutState", "completedAt", "submittedAt", "startedAt", "createdAt", "updatedAt", "durationSeconds", "durationSemanticsVersion", "activeDurationMs", "activeDurationStartedAt", "workoutPausedAt", "templateId", "recovery", "readinessMode", "readinessAdjustments", "usedOriginalTargets", "resolvedActions", "prs", "grade", "gradeVersion", "workoutAnalysis", "workoutPrescription", "adjustmentSummary", "exerciseQualityAnswers", "deletedAt", "trashed", "canceledAt"]);
        const allowedExerciseFields = new Set(["id", "externalId", "source", "sessionId", "name", "notes", "order", "primaryMuscle", "secondaryMuscle", "restSeconds", "resistanceType", "isBodyweight", "isDeload", "customExerciseProfile", "executionQualityAssessment", "recommendationSnapshot", "basePrescription", "finalPrescription", "coachRecommendation", "executionBlocked", "safetyRestriction", "manualOverrides", "adjusted", "adjustmentReason", "triggerLabels", "canonicalExerciseId", "performanceExerciseId", "researchExerciseId", "identitySource", "identityVersion", "originalPrescription", "prescription", "recommendationVersion", "personalDataVersion", "researchDatabaseVersion", "programTargetContext", "appliedTargetContext", "overrideLocked", "stableTargetSnapshot", "resolvedActionId", "pendingReconcile"]);
        const allowedSetFields = new Set(["id", "exerciseId", "setNumber", "sequenceIndex", "sequence", "setTypeIndex", "setType", "sourceTemplateSetId", "reps", "weight", "weightUnit", "resistanceType", "isBodyweight", "rpe", "completed", "skipped", "edited", "isWarmup", "countsTowardScore", "countsTowardVolume", "countsTowardProgression", "addedLoad", "assistanceLoad", "durationSeconds", "distance", "distanceUnit", "targetReps", "targetRepMin", "targetRepMax", "targetWeight", "targetRpe", "targetRpeMin", "targetRpeMax", "targetRpeTolerance", "targetRestSeconds", "originalTargetReps", "originalTargetWeight", "originalTargetRpe", "setPrescription", "previousComparableSet", "prescriptionReason", "prescriptionMode", "prescriptionConfidence", "validationWarning", "classificationSource", "classificationConfidence", "classifierVersion", "manualOverride", "reviewRequired", "classifiedAt", "classificationUndo", "sourceSetOrder", "originalImportedValue"]);
        const allowedClassificationUndoFields = new Set(["setType", "isWarmup", "countsTowardScore", "countsTowardVolume", "countsTowardProgression", "classificationSource", "classificationConfidence", "manualOverride", "reviewRequired"]);
        const allowedTemplateFields = new Set(["id", "name", "notes", "createdAt", "updatedAt", "exercises", "source"]);
        const allowedTemplateExerciseFields = new Set(["id", "name", "notes", "sets", "reps", "repMin", "repMax", "standardWorkloadOverride", "standardRoleWorkload", "targetRpe", "increment", "restSeconds", "resistanceType", "isBodyweight", "primaryMuscle", "secondaryMuscle", "customExerciseProfile", "warmups", "setTypes", "canonicalExerciseId", "performanceExerciseId", "researchExerciseId", "identitySource", "identityVersion", "recommendationSnapshot"]);
        const allowedSettingsFields = new Set(["weightUnit", "timerSound", "timerVibration", "timerNotifications", "inAppRestAlerts", "restCompleteSound", "restCompleteSoundVolume", "restCompleteAutoDismissMs", "restCompleteAutoReturnToWorkout", "defaultRestSeconds", "notificationMessageDetail", "autoStartRestTimer", "autoHighlightNextSet", "installGuideDismissed", "setupSoundConfirmed", "expectedTemplateId", "readinessBaseline"]);
        const obsoleteSettingsFields = new Set(["theme", "colorPackage", "workoutCompletionSound", "interactionVibration", "restCompleteLockScreenNotifications", "autoScrollNextSet", "cloudWorkoutSyncConsent", "workoutCloudSync", "workoutCloudSyncConsentVersion"]);
        const acceptedSettingsFields = new Set([...allowedSettingsFields, ...obsoleteSettingsFields]);
        const allowedCustomProfileFields = new Set(["schemaVersion", "status", "primaryMuscleGroupId", "secondaryMuscleGroupId", "resistanceType", "exerciseStyle", "progressionMetric", "smallestIncrement", "confirmedAt"]);
        const allowedRawImportFields = new Set(["id", "source", "importVersion", "importedAt", "originalText", "weightUnit", "sessionExternalIds"]);
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
        const assertCurrentWorkoutGrade = (grade, label) => {
          if (grade == null || grade?.contractVersion !== "comprehensive-fitness-workout-grade/2.0.0") return;
          const gradeFields = new Set(["contractVersion", "algorithmVersion", "letter", "reasons", "sourceSessionId", "resolvedActionDecisionIds", "createdAt"]);
          const reasonFields = new Set(["code", "text"]);
          assertAllowed(grade, gradeFields, label);
          if (typeof grade.algorithmVersion !== "string" || !grade.algorithmVersion || grade.algorithmVersion.length > 128) throw new Error(`${label} algorithmVersion is invalid.`);
          if (!["A", "B", "C", "D", "F"].includes(grade.letter)) throw new Error(`${label} letter is invalid.`);
          assertId(grade.sourceSessionId, `${label} source session`);
          if (!Array.isArray(grade.reasons) || grade.reasons.length < 2 || grade.reasons.length > 3) throw new Error(`${label} must contain two or three reasons.`);
          grade.reasons.forEach((reason, reasonIndex) => {
            assertAllowed(reason, reasonFields, `${label} reason ${reasonIndex + 1}`);
            if (typeof reason.code !== "string" || !reason.code || reason.code.length > 64) throw new Error(`${label} reason ${reasonIndex + 1} code is invalid.`);
            if (typeof reason.text !== "string" || !reason.text || reason.text.length > 280) throw new Error(`${label} reason ${reasonIndex + 1} text is invalid.`);
          });
          if (grade.resolvedActionDecisionIds != null) {
            if (!Array.isArray(grade.resolvedActionDecisionIds) || grade.resolvedActionDecisionIds.length > 64) throw new Error(`${label} resolved action references are invalid.`);
            grade.resolvedActionDecisionIds.forEach((decisionId) => assertId(decisionId, `${label} resolved action`));
          }
          if (typeof grade.createdAt !== "string" || !Number.isFinite(Date.parse(grade.createdAt))) throw new Error(`${label} createdAt is invalid.`);
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
        const assertStableTargetSnapshot = (snapshot, label) => {
          if (snapshot == null) return;
          const fields = new Set(["sets", "repLow", "repHigh", "rpe", "restSeconds"]);
          assertAllowed(snapshot, fields, label);
          assertNumericDomain(snapshot.sets, { min: 0, max: 100, integer: true }, `${label} sets`);
          assertNumericDomain(snapshot.repLow, { min: 0, max: 1000, integer: true }, `${label} repLow`);
          assertNumericDomain(snapshot.repHigh, { min: 0, max: 1000, integer: true }, `${label} repHigh`);
          assertNumericDomain(snapshot.rpe, { min: 0, max: 10, step: 0.5 }, `${label} rpe`);
          assertNumericDomain(snapshot.restSeconds, { min: 0, max: 3600, integer: true }, `${label} restSeconds`);
          if (snapshot.repLow != null && snapshot.repHigh != null && Number(snapshot.repLow) > Number(snapshot.repHigh)) throw new Error(`${label} repLow must not exceed repHigh.`);
        };
        const assertPendingReconcile = (pending, label) => {
          if (pending == null) return;
          assertAllowed(pending, new Set(["setId", "fields", "remainingSetCount"]), label);
          assertId(pending.setId, `${label} set reference`);
          if (!Array.isArray(pending.fields) || pending.fields.length > 3 || pending.fields.some((field) => !["load", "reps", "rpe"].includes(field))) throw new Error(`${label} fields are invalid.`);
          assertNumericDomain(pending.remainingSetCount, { min: 0, max: 100, integer: true }, `${label} remainingSetCount`);
        };
        const validateTemplateWarmups = (warmups, label) => {
          if (warmups == null) return [];
          if (!Array.isArray(warmups) || warmups.length > 100) throw new Error(`${label} must contain at most 100 warm-up sets.`);
          const allowedFields = new Set(["id", "reps", "targetRepMin", "targetRepMax", "targetRpe", "targetRpeMin", "targetRpeMax", "targetRestSeconds", "weight", "weightUnit", "resistanceType", "isBodyweight", "addedLoad", "assistanceLoad", "rpe"]);
          const numericDomains = {
            reps: { min: 0, max: 1000, integer: true },
            targetRepMin: { min: 0, max: 1000, integer: true },
            targetRepMax: { min: 0, max: 1000, integer: true },
            targetRpe: { min: 0, max: 10, step: 0.5 },
            targetRpeMin: { min: 0, max: 10, step: 0.5 },
            targetRpeMax: { min: 0, max: 10, step: 0.5 },
            targetRestSeconds: { min: 0, max: 3600, integer: true },
            weight: { min: 0 },
            addedLoad: { min: 0 },
            assistanceLoad: { min: 0 },
            rpe: { min: 0, max: 10, step: 0.5 }
          };
          return warmups.map((warmup, index) => {
            const itemLabel = `${label} ${index + 1}`;
            assertAllowed(warmup, allowedFields, itemLabel);
            if (warmup.id != null && warmup.id !== "") assertId(warmup.id, `${itemLabel} id`);
            Object.entries(numericDomains).forEach(([field, config]) => assertNumericDomain(warmup[field], config, `${itemLabel} ${field}`));
            if (warmup.targetRepMin != null && warmup.targetRepMax != null && Number(warmup.targetRepMin) > Number(warmup.targetRepMax)) throw new Error(`${itemLabel} target rep minimum must not exceed its maximum.`);
            if (warmup.targetRpeMin != null && warmup.targetRpeMax != null && Number(warmup.targetRpeMin) > Number(warmup.targetRpeMax)) throw new Error(`${itemLabel} target RPE minimum must not exceed its maximum.`);
            if (warmup.weightUnit != null && !["lb", "kg"].includes(warmup.weightUnit)) throw new Error(`${itemLabel} weightUnit is invalid.`);
            if (warmup.resistanceType != null && !["external", "bodyweight", "bodyweight_plus_load", "assisted_bodyweight", "duration", "distance"].includes(warmup.resistanceType)) throw new Error(`${itemLabel} resistanceType is invalid.`);
            if (warmup.isBodyweight != null && typeof warmup.isBodyweight !== "boolean") throw new Error(`${itemLabel} isBodyweight must be boolean.`);
            return copyAllowed(warmup, allowedFields);
          });
        };
        const validateTemplateSetTypes = (setTypes, label) => {
          if (setTypes == null) return [];
          if (!Array.isArray(setTypes) || setTypes.length > 100) throw new Error(`${label} must contain at most 100 set-role records.`);
          const allowedFields = new Set(["id", "type", "setType", "label", "setCount", "count", "sets", "repMin", "repMax", "exactReps", "rangeSource", "rangeAdjusted", "rpeMin", "rpeMax", "targetRpe", "rpe", "rpeTolerance", "loadRule", "progressionRule", "increment", "loadReductionMin", "loadReductionMax", "dropPercentMin", "dropPercentMax", "restSeconds", "countsTowardVolume", "countsTowardScore", "countsTowardProgression", "isWarmup", "historySampleSize"]);
          const validTypes = new Set(["straight", "top", "backoff", "drop", "failure", "amrap", "technique", "deload", "unknown"]);
          const numericDomains = {
            setCount: { min: 0, max: 100, integer: true },
            count: { min: 0, max: 100, integer: true },
            sets: { min: 0, max: 100, integer: true },
            repMin: { min: 0, max: 1000, integer: true },
            repMax: { min: 0, max: 1000, integer: true },
            rpeMin: { min: 0, max: 10, step: 0.5 },
            rpeMax: { min: 0, max: 10, step: 0.5 },
            targetRpe: { min: 0, max: 10, step: 0.5 },
            rpe: { min: 0, max: 10, step: 0.5 },
            rpeTolerance: { min: 0, max: 10, step: 0.5 },
            increment: { min: 0, max: 10000 },
            loadReductionMin: { min: 0, max: 100 },
            loadReductionMax: { min: 0, max: 100 },
            dropPercentMin: { min: 0, max: 100 },
            dropPercentMax: { min: 0, max: 100 },
            restSeconds: { min: 0, max: 3600, integer: true },
            historySampleSize: { min: 0, max: 100000, integer: true }
          };
          let totalSetCount = 0;
          const validated = setTypes.map((setType, index) => {
            const itemLabel = `${label} ${index + 1}`;
            assertAllowed(setType, allowedFields, itemLabel);
            if (setType.id != null && setType.id !== "") assertId(setType.id, `${itemLabel} id`);
            Object.entries(numericDomains).forEach(([field, config]) => assertNumericDomain(setType[field], config, `${itemLabel} ${field}`));
            const rawType = String(setType.type || setType.setType || "straight");
            const normalizedType = rawType === "working" ? "straight" : rawType;
            if (!validTypes.has(normalizedType)) throw new Error(`${itemLabel} type is invalid.`);
            if (setType.repMin != null && setType.repMax != null && Number(setType.repMin) > Number(setType.repMax)) throw new Error(`${itemLabel} rep minimum must not exceed its maximum.`);
            if (setType.rpeMin != null && setType.rpeMax != null && Number(setType.rpeMin) > Number(setType.rpeMax)) throw new Error(`${itemLabel} RPE minimum must not exceed its maximum.`);
            if (setType.loadReductionMin != null && setType.loadReductionMax != null && Number(setType.loadReductionMin) > Number(setType.loadReductionMax)) throw new Error(`${itemLabel} load reduction minimum must not exceed its maximum.`);
            for (const field of ["exactReps", "rangeAdjusted", "countsTowardVolume", "countsTowardScore", "countsTowardProgression", "isWarmup"]) {
              if (setType[field] != null && typeof setType[field] !== "boolean") throw new Error(`${itemLabel} ${field} must be boolean.`);
            }
            for (const field of ["label", "rangeSource", "loadRule", "progressionRule"]) assertText(setType[field], `${itemLabel} ${field}`);
            const count = Number(setType.setCount ?? setType.count ?? setType.sets ?? 0);
            totalSetCount += count;
            const copied = copyAllowed(setType, allowedFields);
            delete copied.count;
            delete copied.sets;
            if (copied.setCount == null && count > 0) copied.setCount = count;
            if (copied.type != null) copied.type = normalizedType;
            if (copied.setType != null) copied.setType = normalizedType;
            return copied;
          });
          if (totalSetCount > 100) throw new Error(`${label} may describe at most 100 total sets.`);
          return validated;
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
          if (record.durationSemanticsVersion != null) {
            if (record.durationSemanticsVersion !== WORKOUT_DURATION_SEMANTICS_VERSION) throw new Error(`Session ${index + 1} durationSemanticsVersion is unsupported.`);
            if (!Number.isSafeInteger(record.activeDurationMs) || record.activeDurationMs < 0) throw new Error(`Session ${index + 1} activeDurationMs must be a non-negative safe integer.`);
            for (const field of ["activeDurationStartedAt", "workoutPausedAt"]) {
              if (record[field] != null && record[field] !== "" && (typeof record[field] !== "string" || !Number.isFinite(Date.parse(record[field])))) throw new Error(`Session ${index + 1} ${field} must be blank or a valid timestamp.`);
            }
            if (record.activeDurationStartedAt && record.workoutPausedAt) throw new Error(`Session ${index + 1} cannot be active and paused at the same time.`);
          } else if (record.activeDurationMs != null || record.activeDurationStartedAt != null || record.workoutPausedAt != null) {
            throw new Error(`Session ${index + 1} duration fields require durationSemanticsVersion.`);
          }
          if (record.recovery != null) {
            const allowedRecoveryFields = new Set(["readinessDeviation", "sleepHours", "sleepQuality", "hrv", "restingHr", "soreness", "nutritionStatus", "proteinStatus", "outsideBandNote", "illness", "pain", "affectedMuscle"]);
            assertAllowed(record.recovery, allowedRecoveryFields, `Session ${index + 1} recovery`);
            if (record.recovery.readinessDeviation != null && !["", "usual", "unusually_good", "meaningfully_poor"].includes(record.recovery.readinessDeviation)) throw new Error(`Session ${index + 1} readinessDeviation is invalid.`);
            for (const field of ["illness", "pain"]) if (record.recovery[field] != null && typeof record.recovery[field] !== "boolean") throw new Error(`Session ${index + 1} recovery ${field} must be boolean.`);
            for (const field of ["outsideBandNote", "affectedMuscle"]) assertText(record.recovery[field], `Session ${index + 1} recovery ${field}`);
            assertNumericDomain(record.recovery.sleepHours, { min: 0, max: 14, step: 0.25 }, `Session ${index + 1} recovery sleepHours`);
            assertNumericDomain(record.recovery.sleepQuality, { min: 1, max: 5, integer: true }, `Session ${index + 1} recovery sleepQuality`);
            assertNumericDomain(record.recovery.hrv, { min: 0, integer: true }, `Session ${index + 1} recovery hrv`);
            assertNumericDomain(record.recovery.restingHr, { min: 0, integer: true }, `Session ${index + 1} recovery restingHr`);
            assertNumericDomain(record.recovery.soreness, { min: 1, max: 5, integer: true }, `Session ${index + 1} recovery soreness`);
          }
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
          assertCurrentWorkoutGrade(record.workoutAnalysis, `Session ${index + 1} workout grade`);
          if (record.workoutAnalysis?.contractVersion === "comprehensive-fitness-workout-grade/2.0.0" && record.workoutAnalysis.sourceSessionId !== record.id) throw new Error(`Session ${index + 1} workout grade sourceSessionId must match its session.`);
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
          if (record.resolvedActionId != null) assertId(record.resolvedActionId, `Exercise ${index + 1} resolved action`);
          assertStableTargetSnapshot(record.stableTargetSnapshot, `Exercise ${index + 1} stable target snapshot`);
          assertPendingReconcile(record.pendingReconcile, `Exercise ${index + 1} pending reconcile`);
          assertCustomExerciseProfile(record.customExerciseProfile, `Exercise ${index + 1} custom exercise profile`);
          return copyAllowed(record, allowedExerciseFields);
        });
        const sets = imported.sets.map((sourceRecord, index) => {
          const record = { ...sourceRecord, setType: sourceRecord.setType === "working" ? "straight" : sourceRecord.setType };
          assertAllowed(record, allowedSetFields, `Set ${index + 1}`);
          assertId(record.exerciseId, `Set ${index + 1} exercise reference`);
          const setNumericDomains = {
            setNumber: { min: 0, integer: true }, sequenceIndex: { min: 0, integer: true }, sequence: { min: 0, integer: true }, setTypeIndex: { min: 0, integer: true },
            reps: { min: 0, integer: true }, weight: { min: 0 }, rpe: { min: 0, max: 10, step: 0.5 }, addedLoad: { min: 0 }, assistanceLoad: { min: 0 },
            durationSeconds: { min: 0, integer: true }, distance: { min: 0 }, targetReps: { min: 0, integer: true }, targetRepMin: { min: 0, integer: true }, targetRepMax: { min: 0, integer: true },
            targetWeight: { min: 0 }, targetRpe: { min: 0, max: 10, step: 0.5 }, targetRpeMin: { min: 0, max: 10, step: 0.5 }, targetRpeMax: { min: 0, max: 10, step: 0.5 },
            originalTargetReps: { min: 0, integer: true }, originalTargetWeight: { min: 0 }, originalTargetRpe: { min: 0, max: 10, step: 0.5 },
            targetRpeTolerance: { min: 0, max: 10, step: 0.5 }, targetRestSeconds: { min: 0, max: 3600, integer: true }, classificationConfidence: { min: 0, max: 1 }, classifierVersion: { min: 1, integer: true }
          };
          Object.entries(setNumericDomains).forEach(([field, config]) => assertNumericDomain(record[field], config, `Set ${index + 1} ${field}`));
          const validSetTypes = new Set(["warmup", "straight", "top", "backoff", "drop", "failure", "amrap", "technique", "deload", "unknown"]);
          const validClassificationSources = new Set(["manual", "app-explicit", "strong-explicit", "inferred", "recorded"]);
          if (record.setType != null && !validSetTypes.has(record.setType)) throw new Error(`Set ${index + 1} setType is invalid.`);
          if (record.classificationSource != null && !validClassificationSources.has(record.classificationSource)) throw new Error(`Set ${index + 1} classificationSource is invalid.`);
          if (record.targetRepMin != null && record.targetRepMax != null && Number(record.targetRepMin) > Number(record.targetRepMax)) throw new Error(`Set ${index + 1} target rep minimum must not exceed its maximum.`);
          if (record.targetRpeMin != null && record.targetRpeMax != null && Number(record.targetRpeMin) > Number(record.targetRpeMax)) throw new Error(`Set ${index + 1} target RPE minimum must not exceed its maximum.`);
          if (record.sourceTemplateSetId != null && record.sourceTemplateSetId !== "") assertId(record.sourceTemplateSetId, `Set ${index + 1} source template set`);
          for (const field of ["completed", "skipped", "edited", "isWarmup", "isBodyweight", "countsTowardScore", "countsTowardVolume", "countsTowardProgression", "manualOverride", "reviewRequired"]) if (record[field] != null && typeof record[field] !== "boolean") throw new Error(`Set ${index + 1} ${field} must be boolean.`);
          if (record.classificationUndo != null) {
            assertAllowed(record.classificationUndo, allowedClassificationUndoFields, `Set ${index + 1} classificationUndo`);
            for (const field of ["isWarmup", "countsTowardScore", "countsTowardVolume", "countsTowardProgression", "manualOverride", "reviewRequired"]) {
              if (record.classificationUndo[field] != null && typeof record.classificationUndo[field] !== "boolean") throw new Error(`Set ${index + 1} classificationUndo ${field} must be boolean.`);
            }
            if (record.classificationUndo.setType === "working") record.classificationUndo = { ...record.classificationUndo, setType: "straight" };
            if (record.classificationUndo.setType != null && !validSetTypes.has(record.classificationUndo.setType)) throw new Error(`Set ${index + 1} classificationUndo setType is invalid.`);
            if (record.classificationUndo.classificationSource != null && !validClassificationSources.has(record.classificationUndo.classificationSource)) throw new Error(`Set ${index + 1} classificationUndo classificationSource is invalid.`);
            assertNumericDomain(record.classificationUndo.classificationConfidence, { min: 0, max: 1 }, `Set ${index + 1} classificationUndo classificationConfidence`);
          }
          return copyAllowed(record, allowedSetFields);
        });
        const templateExerciseIds = new Set();
        let templateExerciseCount = 0;
        const templates = imported.templates.map((record, index) => {
          assertAllowed(record, allowedTemplateFields, `Template ${index + 1}`);
          assertName(record.name, `Template ${index + 1}`);
          assertText(record.notes, `Template ${index + 1} notes`);
          if (!Array.isArray(record.exercises)) throw new Error(`Template ${index + 1} must contain an exercises array.`);
          templateExerciseCount += record.exercises.length;
          if (templateExerciseCount > MAX_EXERCISES) throw new Error(`Template exercise count exceeds the ${MAX_EXERCISES} limit.`);
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
            copiedExercise.warmups = validateTemplateWarmups(exercise.warmups, `Template ${index + 1} exercise ${exerciseIndex + 1} warm-up`);
            copiedExercise.setTypes = validateTemplateSetTypes(exercise.setTypes, `Template ${index + 1} exercise ${exerciseIndex + 1} set role`);
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
        const setIds = seenIds(sets, "set");
        const templateIds = seenIds(templates, "template");
        exercises.forEach((exercise) => { if (!sessionIds.has(exercise.sessionId)) throw new Error(`Orphan exercise reference: ${exercise.id} -> ${exercise.sessionId}.`); });
        sets.forEach((set) => { if (!exerciseIds.has(set.exerciseId)) throw new Error(`Orphan set reference: ${set.id} -> ${set.exerciseId}.`); });
        exercises.forEach((exercise) => {
          if (!exercise.pendingReconcile) return;
          if (!setIds.has(exercise.pendingReconcile.setId)) throw new Error(`Orphan pending reconcile set reference: ${exercise.id} -> ${exercise.pendingReconcile.setId}.`);
          const referencedSet = sets.find((set) => set.id === exercise.pendingReconcile.setId);
          if (referencedSet?.exerciseId !== exercise.id) throw new Error(`Pending reconcile set belongs to another exercise: ${exercise.id} -> ${exercise.pendingReconcile.setId}.`);
        });
        sessions.forEach((session) => { if (session.templateId && !templateIds.has(session.templateId)) throw new Error(`Orphan template reference: ${session.templateId}.`); });
        const settings = imported.settings == null ? {} : imported.settings;
        assertAllowed(settings, acceptedSettingsFields, "Settings");
        if (settings.weightUnit != null && !["lb", "kg"].includes(settings.weightUnit)) throw new Error("Settings weightUnit must be lb or kg.");
        if (settings.expectedTemplateId != null && settings.expectedTemplateId !== "") assertId(settings.expectedTemplateId, "Settings expected template");
        const booleanSettingFields = ["timerSound", "timerVibration", "timerNotifications", "inAppRestAlerts", "restCompleteAutoReturnToWorkout", "autoStartRestTimer", "autoHighlightNextSet", "installGuideDismissed", "setupSoundConfirmed"];
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
        const rawImports = boundedRecords(imported.rawImports, "Raw import", 128, allowedRawImportFields);
        rawImports.forEach((record, index) => {
          assertId(record.id, `Raw import ${index + 1}`);
          if (typeof record.source !== "string" || !record.source || record.source.length > 128) throw new Error(`Raw import ${index + 1} source is invalid.`);
          if (record.importVersion != null && (typeof record.importVersion !== "string" || !record.importVersion || record.importVersion.length > 128)) throw new Error(`Raw import ${index + 1} importVersion is invalid.`);
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

      async function researchOnlyBundleForImport() {
        if (!prescriptionApi) throw new Error("The identity compatibility engine is unavailable; the backup was not imported.");
        const researchData = await loadImportValidationResearch();
        const bundle = prescriptionApi.normalizeEvidenceBundle({ personalData: {}, researchData });
        const engine = prescriptionApi.createPrescriptionEngine(bundle);
        const identityEngine = prescriptionApi.createPrescriptionEngine({ personalData: {}, researchData: { exerciseDatabase: researchData.exerciseDatabase } });
        return { bundle, engine, identityEngine, exerciseDatabase: researchData.exerciseDatabase };
      }

      function validateExecutableRecommendationSnapshot(snapshot, engine, hostExercise, label) {
        const exactDirectTarget = (exerciseId) => {
          const relationships = engine?.evidence?.research?.muscleMapsByExercise?.get(exerciseId) || [];
          const directTargets = relationships.filter((relationship) => {
            const relationshipType = normalizePrescriptionIdentity(relationship?.relationship_type || relationship?.relationshipType);
            const loadingRole = normalizePrescriptionIdentity(relationship?.loading_role || relationship?.loadingRole);
            const fractionalSetCredit = Number(relationship?.fractional_set_credit ?? relationship?.fractionalSetCredit ?? 0);
            return relationshipType === "direct load"
              && ["dynamic", "mixed"].includes(loadingRole)
              && Number.isFinite(fractionalSetCredit)
              && fractionalSetCredit > 0;
          });
          if (directTargets.length !== 1) return {
            status: "ineligible",
            exerciseId,
            reason: directTargets.length ? "ambiguous_dynamic_direct_target" : "no_dynamic_direct_target"
          };
          const relationship = directTargets[0];
          const muscleGroupId = relationship.muscle_group_id || relationship.muscleGroupId;
          const taxonomyVersion = relationship.taxonomy_version || relationship.taxonomyVersion;
          if (typeof muscleGroupId !== "string"
            || !/^mg_[a-z0-9_]+$/.test(muscleGroupId)
            || typeof taxonomyVersion !== "string"
            || !taxonomyVersion.trim()) {
            return { status: "ineligible", exerciseId, reason: "ambiguous_dynamic_direct_target" };
          }
          return { status: "resolved", exerciseId, muscleGroupId, taxonomyVersion: taxonomyVersion.trim() };
        };
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
          const target = exactDirectTarget(canonicalExerciseId);
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

      function assertCandidateHasRecoverableExport(candidate, activeWorkoutDraft = null) {
        if (!window.FitnessBackupContract?.createBackupExport) throw new Error("The backup export contract is unavailable.");
        window.FitnessBackupContract.createBackupExport(candidate, { activeWorkoutDraft });
        return true;
      }

      async function importDataFile(file) {
        if (importInProgress) return;
        importInProgress = true;
        pendingImport = null;
        importAttempt += 1;
        importStatus = { state: "importing", message: `Validating ${file.name}...` };
        settingsMessage = importStatus.message;
        render();
        try {
          if (appDataPersistenceConflict) {
            throw new Error("Import is blocked because two valid saved app-data copies disagree and neither may be discarded automatically. Export downloads only the currently selected copy; the preserved alternate is excluded. Review the export, then use confirmed Clear All Local App Data before importing a replacement.");
          }
          if (Number(file.size || 0) > BACKUP_IMPORT_LIMITS.maxFileBytes) throw new Error("Backup file is too large; the maximum size is 50 MiB.");
          const text = await file.text();
          const byteLength = new TextEncoder().encode(text).byteLength;
          if (byteLength > BACKUP_IMPORT_LIMITS.maxFileBytes) throw new Error("Backup file is too large; the maximum size is 50 MiB.");
          if (file.name.toLowerCase().endsWith(".csv") || text.startsWith("Date,Workout Name,Duration,Exercise Name")) {
            if (byteLength > BACKUP_IMPORT_LIMITS.maxRawImportBytes) throw new Error("Strong CSV is too large to retain in a round-trip-safe backup; the maximum size is 10 MiB.");
            importStrongCsv(text, strongImportWeightUnit, { fileName: file.name, render: false });
            return;
          }
          let parsed;
          try { parsed = JSON.parse(text); }
          catch { throw new Error("Backup is not valid JSON."); }
          const envelope = window.FitnessBackupContract.validateAndSanitizeBackup(parsed, { byteLength });
          const decodedEnvelope = window.FitnessBackupContract.decodeLegacyBackup(envelope);
          const {
            backupSchemaVersion: validatedBackupSchemaVersion,
            activeWorkoutDraft: sourceActiveWorkoutDraft = null,
            ...imported
          } = decodedEnvelope;
          const validated = validateImportedAppData(imported, BACKUP_IMPORT_LIMITS);
          const preparedEvidence = await researchOnlyBundleForImport();
          const candidate = normalizeLoadedData(validated);
          candidate.dataRevision = nextMonotonicImportRevision();
          validateImportedExecutableRecommendationSnapshots(candidate, preparedEvidence.engine);
          let activeWorkoutDraft = null;
          if (sourceActiveWorkoutDraft) {
            const validatedDraft = validateActiveWorkoutDraftEnvelope(sourceActiveWorkoutDraft, candidate, {
              allowLegacyV1: false,
              ignoreSourceRevision: true
            });
            if (!validatedDraft) throw new Error("Backup activeWorkoutDraft failed validation; no data was changed.");
            activeWorkoutDraft = {
              ...sourceActiveWorkoutDraft,
              dataRevision: candidate.dataRevision,
              session: validatedDraft.session,
              exercises: validatedDraft.exercises,
              sets: validatedDraft.sets,
              timer: validatedDraft.timer
            };
          }
          assertCandidateHasRecoverableExport(candidate, activeWorkoutDraft);
          const counts = collectionCounts(candidate);
          const reviewRequired = candidate.sets.filter((set) => set.reviewRequired).length;
          pendingImport = {
            kind: "backup",
            fileName: file.name,
            baseDataRevision: Number(data.dataRevision || 0),
            candidate,
            activeWorkoutDraft,
            replaceActiveWorkoutDraft: true,
            preparedEvidence,
            noChanges: false,
            preview: {
              title: "Backup ready to apply",
              mode: "Replace app data",
              version: validatedBackupSchemaVersion,
              sourceBytes: byteLength,
              sourceUnit: "",
              counts,
              reviewRequired,
              facts: [
                `Validated app data v${candidate.appDataVersion} will replace the selected local copy.`,
                activeWorkoutDraft
                  ? `One active workout draft with ${activeWorkoutDraft.exercises.length} exercises and ${activeWorkoutDraft.sets.length} sets will be restored with its timer context.`
                  : "This backup has no active-workout draft; any existing independent draft will be cleared so it cannot resurrect after replacement.",
                `${reviewRequired} set classification${reviewRequired === 1 ? "" : "s"} need${reviewRequired === 1 ? "s" : ""} review.`,
                "Legacy planner, equipment-constraint, recommendation-ledger, and confidence state will not be reactivated."
              ]
            },
            completionMessage: activeWorkoutDraft ? "Import complete. The active workout draft and timer context were restored." : "Import complete."
          };
          settingsMessage = "Preview ready. Review the validated counts and recovery facts, then choose Apply import.";
          importStatus = { state: "preview", message: settingsMessage };
        } catch (error) {
          pendingImport = null;
          settingsMessage = error instanceof Error ? error.message : "Import failed.";
          importStatus = { state: "rejected", message: settingsMessage };
        } finally {
          importInProgress = false;
          render();
        }
      }

      function discardPendingImport() {
        if (importInProgress || !pendingImport) return false;
        pendingImport = null;
        settingsMessage = "Import preview canceled. No data was changed.";
        importStatus = { state: "canceled", message: settingsMessage };
        render();
        return true;
      }

      async function applyPendingImport() {
        if (importInProgress || !pendingImport) return false;
        const operation = pendingImport;
        if (appDataPersistenceConflict) {
          pendingImport = null;
          settingsMessage = "Import is blocked because the saved app-data copies now disagree. No data was changed.";
          importStatus = { state: "rejected", message: settingsMessage };
          render();
          return false;
        }
        if (Number(data.dataRevision || 0) !== operation.baseDataRevision) {
          pendingImport = null;
          settingsMessage = "Local data changed after this preview. Select the file again to validate a current import.";
          importStatus = { state: "rejected", message: settingsMessage };
          render();
          return false;
        }
        importInProgress = true;
        importStatus = { state: "applying", message: `Applying ${operation.fileName}...` };
        settingsMessage = importStatus.message;
        render();
        if (operation.noChanges) {
          pendingImport = null;
          importInProgress = false;
          settingsMessage = operation.completionMessage;
          importStatus = { state: "accepted", message: settingsMessage };
          render();
          return true;
        }
        cancelPendingDataSave();
        window.clearTimeout(draftSaveTimer);
        const rollbackData = cloneImportSnapshot(data);
        const rollbackState = {
          prescriptionEngine,
          activeSessionId,
          activeWorkoutId,
          timer,
          activeDraftSequence
        };
        let rollbackDraft = null;
        let rollbackDraftLocal = null;
        let rollbackDraftLocalCaptured = false;
        let durableReplacementWritten = false;
        let rollbackConfirmed = false;
        let replacementTimerCanceled = false;
        try {
          if (operation.replaceActiveWorkoutDraft) {
            rollbackDraft = await readIndexedValue("active-workout-draft");
            try {
              rollbackDraftLocal = localStorage.getItem(ACTIVE_DRAFT_KEY);
              rollbackDraftLocalCaptured = true;
            } catch {
              throw new Error("The existing active-workout recovery copy could not be read for safe replacement.");
            }
            try {
              localStorage.removeItem(ACTIVE_DRAFT_KEY);
            } catch {
              throw new Error("The existing active-workout recovery copy could not be prepared for safe replacement.");
            }
          }
          if (operation.kind === "backup" && rollbackState.timer) {
            const cancellationConfirmed = await cancelRestPush({ ...rollbackState.timer }, "backup-import-replacement");
            if (!cancellationConfirmed) {
              throw new Error("The active rest notification could not be canceled, so the backup was not applied.");
            }
            replacementTimerCanceled = true;
          }
          const writes = [{ key: "app-data", value: operation.candidate }];
          if (operation.replaceActiveWorkoutDraft) writes.push({ key: "active-workout-draft", value: operation.activeWorkoutDraft || null });
          await writeIndexedValuesAtomically(writes);
          durableReplacementWritten = true;
          data = operation.candidate;
          if (operation.kind === "backup") {
            window.clearInterval(timerInterval);
            timerInterval = 0;
            releaseTimerWakeLock();
            timer = null;
            templateNumericDrafts.clear();
            if (!installExerciseIdentityCompatibility(operation.preparedEvidence.exerciseDatabase, operation.preparedEvidence.identityEngine)) {
              throw new Error("The identity compatibility engine could not be installed.");
            }
            activeSessionId = data.sessions[0]?.id || "";
            activeWorkoutId = data.sessions.find((session) => sessionHasStarted(session) && !isSessionSubmitted(session))?.id || "";
            if (operation.replaceActiveWorkoutDraft) {
              if (operation.activeWorkoutDraft) localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(operation.activeWorkoutDraft));
              else localStorage.removeItem(ACTIVE_DRAFT_KEY);
            }
            if (operation.activeWorkoutDraft) {
              if (!await restoreActiveWorkoutDraft()) throw new Error("The imported active workout draft could not be restored.");
            }
          } else {
            activeSessionId = operation.newestSessionId || activeSessionId;
          }
          entityStructureRevision += 1;
          entityIndexCache = null;
          invalidateCompletedAnalysis();
          try { localStorage.removeItem(STORAGE_KEY); } catch { /* The accepted IndexedDB copy remains authoritative. */ }
          if (operation.kind === "strong") {
            const templates = data.templates.filter((template) => operation.templateIds.includes(template.id));
            operation.completionMessage += strongImportAuditMessage(auditImportedTemplateHistory(templates));
          }
          pendingImport = null;
          settingsMessage = operation.completionMessage;
          importStatus = { state: "accepted", message: settingsMessage };
          saveRuntime();
          return true;
        } catch (error) {
          let indexedRollbackConfirmed = !durableReplacementWritten;
          if (durableReplacementWritten) {
            try {
              const rollbackWrites = [{ key: "app-data", value: rollbackData }];
              if (operation.replaceActiveWorkoutDraft) rollbackWrites.push({ key: "active-workout-draft", value: rollbackDraft });
              await writeIndexedValuesAtomically(rollbackWrites);
              indexedRollbackConfirmed = true;
            } catch { indexedRollbackConfirmed = false; }
          }
          let localDraftRollbackConfirmed = !operation.replaceActiveWorkoutDraft || !rollbackDraftLocalCaptured;
          if (operation.replaceActiveWorkoutDraft && rollbackDraftLocalCaptured) {
            try {
              if (rollbackDraftLocal == null) localStorage.removeItem(ACTIVE_DRAFT_KEY);
              else localStorage.setItem(ACTIVE_DRAFT_KEY, rollbackDraftLocal);
              localDraftRollbackConfirmed = true;
            } catch { localDraftRollbackConfirmed = false; }
          }
          rollbackConfirmed = indexedRollbackConfirmed && localDraftRollbackConfirmed;
          window.clearTimeout(draftSaveTimer);
          cancelPendingDataSave();
          data = rollbackData;
          prescriptionEngine = rollbackState.prescriptionEngine;
          activeSessionId = rollbackState.activeSessionId;
          activeWorkoutId = rollbackState.activeWorkoutId;
          timer = rollbackState.timer;
          activeDraftSequence = rollbackState.activeDraftSequence;
          entityStructureRevision += 1;
          entityIndexCache = null;
          invalidateCompletedAnalysis();
          if (replacementTimerCanceled && timer?.isActive && !timer.isPaused && !timer.isOvertime && timer.endsAt > Date.now()) {
            await scheduleRestPush({ ...timer }).catch(() => undefined);
          }
          const reason = error instanceof Error ? error.message : "Import finalization failed.";
          settingsMessage = durableReplacementWritten
            ? rollbackConfirmed
              ? `${reason} The original app data${operation.replaceActiveWorkoutDraft ? " and active draft" : ""} were restored.`
              : `${reason} Durable rollback could not be confirmed; the original data remains in memory. Export it before reloading.`
            : rollbackConfirmed
              ? `${reason} No data was changed.`
              : `${reason} IndexedDB was not replaced, but the active-draft fallback rollback could not be confirmed. Export the current data before reloading.`;
          importStatus = { state: "rejected", message: settingsMessage };
          if (!rollbackConfirmed) pendingImport = null;
          return false;
        } finally {
          importInProgress = false;
          render();
        }
      }

      root.addEventListener("click", (event) => {
        const target = event.target.closest?.("[data-action]");
        if (!target) return;
        if (target.dataset.action === "apply-pending-import") {
          event.preventDefault();
          applyPendingImport();
        }
        if (target.dataset.action === "cancel-pending-import") {
          event.preventDefault();
          discardPendingImport();
        }
      });
