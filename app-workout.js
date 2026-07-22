
      async function inspectUnsynchronizedData() {
        let queue = [];
        const epoch = syncConsentEpoch;
        const syncConsented = workoutSyncConsentIsCurrent(epoch);
        if (syncConsented && workoutSyncConsentIsCurrent(epoch)) {
          try { queue = await readIndexedValue("sync-queue") || []; } catch { queue = []; }
          if (!workoutSyncConsentIsCurrent(epoch)) queue = [];
        }
        const draftSessions = data.sessions.filter((session) => !isSessionSubmitted(session) && data.exercises.some((exercise) => exercise.sessionId === session.id));
        const draftIds = new Set(draftSessions.map((session) => session.id));
        const draftExerciseIds = new Set(data.exercises.filter((exercise) => draftIds.has(exercise.sessionId)).map((exercise) => exercise.id));
        const unsavedSetChanges = data.sets.filter((set) => draftExerciseIds.has(set.exerciseId) && (set.edited || set.completed || Number(set.reps || 0) > 0 || Number(set.weight || 0) > 0)).length;
        const workoutIds = new Set([...queue.map((item) => item.sessionId), ...draftSessions.map((session) => session.id)]);
        return { queueCount: queue.length, workoutCount: workoutIds.size, setChanges: unsavedSetChanges, canSync: Boolean(workoutSyncConsentIsCurrent(epoch) && navigator.onLine && pushIdentity?.token && queue.length) };
      }

      async function requestClearLocalData() {
        const focusOrigin = focusDescriptorForElement(document.activeElement) || { kind: "main" };
        const remoteBlock = localClearBlockReason();
        if (remoteBlock) {
          settingsMessage = remoteBlock;
          render();
          return false;
        }
        const unsynced = await inspectUnsynchronizedData();
        dialogFocusOrigins.clear = focusOrigin;
        clearDataFlow = { open: true, acknowledged: false, phrase: "", unsynced };
        render();
        return true;
      }

      function closeClearDataFlow() {
        clearDataFlow = null;
        restoreFocusAfterDialog("clear");
        render();
      }

      function renderClearDataSheet() {
        if (!clearDataFlow?.open) return "";
        const unsynced = clearDataFlow.unsynced || { workoutCount: 0, setChanges: 0, queueCount: 0, canSync: false };
        const remoteBlock = localClearBlockReason();
        const blockedMessage = remoteBlock || clearDataFlow.blockedMessage || "";
        const unlocked = clearDataFlow.acknowledged && clearDataFlow.phrase === "CLEAR" && !blockedMessage;
        const risk = unsynced.workoutCount || unsynced.setChanges || unsynced.queueCount;
        return `
          <div class="sheet-backdrop" data-action="cancel-clear-data" role="presentation">
            <section class="bottom-sheet dialog-sheet destructive-sheet clear-data-sheet" role="dialog" aria-modal="true" aria-labelledby="clear-data-title" data-sheet-content>
              <div><div class="section-kicker">Danger Zone</div><h2 id="clear-data-title">Clear All Local App Data?</h2><p>This removes the active workout, unsaved sets, offline and cached workout data, cached templates and history, local preferences, app notification settings, IndexedDB records, local storage, service-worker caches, and pending sync operations from this device.</p></div>
              ${blockedMessage ? '<div class="destructive-warning" role="status"><strong>Local clearing is paused</strong><span>' + escapeHtml(blockedMessage) + '</span></div>' : ''}
              ${risk ? '<div class="destructive-warning"><strong>Unsynchronized data detected</strong><span>This device contains ' + unsynced.workoutCount + ' unsynchronized workout' + (unsynced.workoutCount === 1 ? '' : 's') + ' and ' + unsynced.setChanges + ' unsaved set change' + (unsynced.setChanges === 1 ? '' : 's') + '. Clearing now may permanently delete them.</span>' + (unsynced.canSync ? '<button type="button" data-action="sync-before-clear">Sync Now</button>' : '<small>Sync is unavailable or not configured. Export a backup before clearing if this data matters.</small>') + '</div>' : '<div class="inline-panel"><strong>No pending local workout changes were detected.</strong></div>'}
              <div class="clear-data-scope"><strong>Cloud deletion boundary</strong><span>Retained workout copies are deleted before local authorization is removed. The app stops here while offline rather than orphaning server data. Any data that exists only on this device will still be lost.</span></div>
              <label class="toggle-line destructive-ack"><input type="checkbox" data-action="clear-data-ack" ${clearDataFlow.acknowledged ? 'checked' : ''} />I understand that unsynchronized data may be permanently deleted</label>
              <label class="typed-confirmation">Type <strong>CLEAR</strong> to continue<input type="text" value="${escapeHtml(clearDataFlow.phrase)}" data-action="clear-data-phrase" autocomplete="off" autocapitalize="characters" aria-label="Type CLEAR to confirm local data deletion" /></label>
              <div class="sheet-actions stacked">
                <button class="primary-action" type="button" data-action="cancel-clear-data">Keep My Data</button>
                <button class="danger-button" type="button" data-action="confirm-clear-data" ${unlocked ? '' : 'disabled'}>Permanently Clear Local Data</button>
              </div>
            </section>
          </div>`;
      }

      function deleteFitnessDatabase() {
        return new Promise((resolve) => {
          try {
            const request = indexedDB.deleteDatabase(DB_NAME);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          } catch { resolve(); }
        });
      }

      function localClearBlockReason() {
        if (!pushIdentity?.token) return "";
        const deletionStatus = pushIdentity.deletion?.status || "";
        if (window.__cfRemoteDeletionInFlight || pushIdentity.status === "deleting" || deletionStatus === "deleting" || deletionStatus === "error" || pushIdentity.deletion?.retryable === true) return "Remote installation deletion is still in progress. Reconnect or reopen the app and wait for deletion to finish before clearing local data, so the cleanup authorization is not lost.";
        return "";
      }

      async function permanentlyClearLocalData() {
        if (!clearDataFlow?.acknowledged || clearDataFlow.phrase !== "CLEAR") return;
        const remoteBlock = localClearBlockReason();
        if (remoteBlock) {
          clearDataFlow = { ...clearDataFlow, blockedMessage: remoteBlock };
          settingsMessage = remoteBlock;
          render();
          return false;
        }
        if (data.settings.cloudWorkoutSyncConsent === true || pushIdentity?.syncRevocationPending) {
          const revoked = await setCloudWorkoutSyncConsent(false, { renderNow: false });
          if (!revoked) {
            const blockedMessage = "Server workout deletion is not confirmed yet. Reconnect and retry local clearing so cleanup authorization is preserved.";
            clearDataFlow = { ...clearDataFlow, blockedMessage };
            settingsMessage = blockedMessage;
            render();
            return false;
          }
        }
        if (pushIdentity?.token) {
          if (!navigator.onLine) {
            const blockedMessage = "Connect to the internet before clearing local data so retained server installation data can be deleted first.";
            clearDataFlow = { ...clearDataFlow, blockedMessage };
            settingsMessage = blockedMessage;
            render();
            return false;
          }
          const remoteDeletion = await deleteRemoteInstallationData({ scheduleRetry: false, automatic: true });
          if (remoteDeletion?.status !== "deleted") {
            const blockedMessage = "Remote installation deletion is not confirmed yet. Keep the app open and retry before clearing local authorization.";
            clearDataFlow = { ...clearDataFlow, blockedMessage };
            settingsMessage = blockedMessage;
            render();
            return false;
          }
        }
        if (timer) {
          const previous = { ...timer };
          const cancellationConfirmed = await cancelRestPush(previous, "local-data-cleared");
          if (!cancellationConfirmed) {
            const blockedMessage = "The active rest notification could not be canceled yet. Reconnect and retry local clearing; its durable cancellation record and installation authorization were preserved.";
            clearDataFlow = { ...clearDataFlow, blockedMessage };
            settingsMessage = blockedMessage;
            render();
            return false;
          }
          window.clearInterval(timerInterval);
          timerInterval = 0;
          releaseTimerWakeLock();
          timer = null;
        }
        cancelPendingDataSave();
        window.clearTimeout(draftSaveTimer);
        draftSaveTimer = 0;
        // `serviceWorker.ready` can remain pending forever when this tab has no
        // active registration. A destructive local clear must not be held
        // hostage by that unrelated lifecycle. Inspect only an already-known
        // registration and continue when none exists.
        try {
          const registration = await navigator.serviceWorker?.getRegistration?.();
          const subscription = await registration?.pushManager?.getSubscription?.();
          await subscription?.unsubscribe?.();
        } catch { /* Local cleanup continues. */ }
        try { for (const key of await caches.keys()) if (key.startsWith("comprehensive-fitness")) await caches.delete(key); } catch { /* Cache API is optional. */ }
        try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(RUNTIME_KEY); localStorage.removeItem(ACTIVE_DRAFT_KEY); localStorage.removeItem(IDENTITY_KEY); } catch { /* IndexedDB cleanup remains primary. */ }
        await deleteFitnessDatabase();
        appDataPersistenceConflict = null;
        data = emptyData();
        const session = createSession();
        data.sessions = [session];
        activeSessionId = session.id;
        activeWorkoutId = "";
        activeSetId = "";
        pendingNextSetId = "";
        activeSetNotice = "";
        activeSetAcknowledged = false;
        pushIdentity = null;
        clearDataFlow = null;
        cancelWorkoutFlow = null;
        templateStartFlow = null;
        templateNumericDrafts.clear();
        exportText = "";
        settingsMessage = "";
        applyTheme();
        try {
          await writeIndexedValue("app-data", data);
          persistenceReady = true;
          // Remove the conflict-preserved alternate again after the fresh
          // durable write so no concurrent/fallback path can resurrect it.
          try { localStorage.removeItem(STORAGE_KEY); } catch { /* Fresh IndexedDB defaults remain durable. */ }
        } catch {
          persistenceReady = false;
          settingsMessage = "Local workout data was removed, but fresh defaults could not be saved. Keep this tab open and retry Clear All Local App Data before relying on a reload.";
          setActiveTab("today", { replace: true, renderNow: false });
          render();
          return false;
        }
        saveRuntime();
        setActiveTab("today", { replace: true, renderNow: false });
        showAppToast("Local app data cleared.");
        render();
        return true;
      }

      function patchSession(patch, shouldRender = true) {
        const session = activeSession();
        if (shouldRender) {
          const draftMutation = session.id === activeWorkoutId && !isSessionSubmitted(session) && !isEditingHistorySession();
          commit({ ...data, sessions: data.sessions.map((item) => item.id === session.id ? { ...item, ...patch, updatedAt: isoNow() } : item) }, true, { invalidateAnalysis: !draftMutation, deferPersistence: draftMutation });
          return;
        }
        const index = dataEntityIndex().sessionIndexById.get(session.id) ?? -1;
        if (index >= 0) {
          data.sessions[index] = { ...data.sessions[index], ...patch, updatedAt: isoNow() };
          if (isEditingHistorySession()) historyEditFlow.dirty = true;
          else scheduleSave();
        }
      }

      function patchRecovery(patch, shouldRender = true) {
        const session = activeSession();
        patchSession({ recovery: { ...sessionRecovery(session), ...patch } }, shouldRender);
      }

      function patchReadinessBaseline(patch, shouldRender = true) {
        commit({ ...data, settings: { ...data.settings, readinessBaseline: { ...readinessBaseline(), ...patch } } }, shouldRender);
      }

      function exerciseNameForPrescriptionId(exerciseId, fallback) {
        const personal = prescriptionEngine?.evidence.personal;
        const research = prescriptionEngine?.evidence.research;
        const personalRecord = personal?.exerciseScores.find((item) => (item.exercise_id || item.exerciseId) === exerciseId)
          || personal?.exercisePrescriptions.find((item) => (item.exercise_id || item.exerciseId) === exerciseId)
          || personal?.exerciseMuscleScores.find((item) => (item.exercise_id || item.exerciseId) === exerciseId);
        const researchId = personal?.crosswalkByPersonalId.get(exerciseId) || exerciseId;
        return personalRecord?.exercise_name || personalRecord?.exerciseName || research?.exerciseById.get(researchId)?.exercise_name || fallback;
      }

      function expandedOverrideSetTypes(prescription, requestedRepRange = null, requestedSetCount = null) {
        const repRange = requestedRepRange || prescription.repRange;
        const workingSetCount = Number(requestedSetCount || prescription.workingSets.target || 1);
        const topSetCount = Math.min(workingSetCount, Number(prescription.topSet?.count || 1));
        const backoffSetCount = Math.max(0, workingSetCount - topSetCount);
        if (prescription.setStructure === "top_set_backoff") return [
          ...Array.from({ length: topSetCount }, () => ({ type: "top", repRange: requestedRepRange || prescription.topSet?.repRange || repRange, rpe: prescription.topSet?.targetRpe || prescription.targetRpe.max, reduction: 0 })),
          ...Array.from({ length: backoffSetCount }, () => ({ type: "backoff", repRange: requestedRepRange || prescription.backoffSets?.repRange || repRange, rpe: prescription.backoffSets?.targetRpe || prescription.targetRpe.max, reduction: Number(prescription.backoffSets?.loadReductionPercent?.target || 12) }))
        ];
        if (prescription.setStructure === "multiple_top_sets") return Array.from({ length: workingSetCount }, () => ({ type: "top", repRange: requestedRepRange || prescription.topSet?.repRange || repRange, rpe: prescription.topSet?.targetRpe || prescription.targetRpe.max, reduction: 0 }));
        const type = prescription.recommendationType.includes("deload") ? "deload" : "straight";
        return Array.from({ length: workingSetCount }, () => ({ type, repRange, rpe: prescription.targetRpe.max, reduction: 0 }));
      }

      function completeCustomExerciseSetup(exerciseId, form) {
        const exercise = exerciseById(exerciseId);
        const session = exercise ? sessionById(exercise.sessionId) : null;
        if (!exercise || !session || !form || exercise.identitySource !== "user_declared_custom") return;
        const value = (field) => form.querySelector(`[data-custom-profile-field="${field}"]`)?.value ?? "";
        const profile = normalizeCustomExerciseProfile({
          primaryMuscleGroupId: value("primary-muscle"),
          secondaryMuscleGroupId: value("secondary-muscle"),
          resistanceType: value("resistance-type"),
          exerciseStyle: value("exercise-style"),
          progressionMetric: value("progression-metric"),
          smallestIncrement: value("smallest-increment"),
          confirmedAt: isoNow()
        });
        const missing = missingCustomExerciseMetrics(profile);
        if (missing.length) return showAppToast(`Complete recommendation setup: ${missing.join(", ")}.`);
        const profiledExercise = {
          ...exercise,
          customExerciseProfile: profile,
          primaryMuscle: appMuscleFromPrescriptionGroup(profile.primaryMuscleGroupId),
          secondaryMuscle: profile.secondaryMuscleGroupId ? appMuscleFromPrescriptionGroup(profile.secondaryMuscleGroupId) : "",
          resistanceType: profile.resistanceType,
          isBodyweight: isBodyweightResistance(profile.resistanceType)
        };
        let snapshot;
        try {
          snapshot = boundedCustomPrescriptionSnapshot(profiledExercise, profile, { fresh: true, throughDate: session.date, excludeSessionId: session.id, recovery: session.recovery || {} });
        } catch (error) {
          return showAppToast(error?.message || "Custom guidance could not be generated.");
        }
        if (!snapshot?.finalPrescription) return showAppToast("Custom guidance could not be generated.");
        const prescription = snapshot.finalPrescription;
        const target = legacyTargetFromSnapshot(snapshot, { name: exercise.name, resistanceType: profile.resistanceType, increment: profile.smallestIncrement });
        const allSets = setsForExercise(exerciseId);
        const completedWorking = allSets.filter((set) => isWorkingSet(set, "progression") && set.completed);
        const incompleteWorking = allSets.filter((set) => isWorkingSet(set, "progression") && !set.completed);
        const warmups = allSets.filter((set) => setTypeSemantics(set).isWarmup);
        const desiredTypes = expandedOverrideSetTypes(prescription);
        const desiredIncomplete = desiredTypes.slice(Math.min(completedWorking.length, desiredTypes.length));
        const baseLoad = Number(prescription.prescribedLoad?.target || target.weight || 0);
        const rebuiltIncomplete = desiredIncomplete.map((role, index) => {
          const existing = incompleteWorking[index] || createSet(exerciseId, completedWorking.length + index + 1, { resistanceType: profile.resistanceType });
          return {
            ...existing,
            setNumber: completedWorking.length + index + 1,
            sequenceIndex: warmups.length + completedWorking.length + index,
            sequence: warmups.length + completedWorking.length + index,
            setTypeIndex: desiredTypes.slice(0, completedWorking.length + index).filter((item) => item.type === role.type).length,
            setType: role.type,
            resistanceType: profile.resistanceType,
            reps: Math.round((Number(role.repRange.min) + Number(role.repRange.max)) / 2),
            weight: baseLoad,
            rpe: Number(role.rpe),
            targetReps: Math.round((Number(role.repRange.min) + Number(role.repRange.max)) / 2),
            targetRepMin: Number(role.repRange.min),
            targetRepMax: Number(role.repRange.max),
            targetWeight: baseLoad,
            targetRpe: Number(role.rpe),
            targetRpeMin: Math.max(5, Number(role.rpe) - 1),
            targetRpeMax: Number(role.rpe),
            targetRestSeconds: prescription.restSeconds.target,
            prescriptionReason: "Bounded custom guidance generated after metadata confirmation.",
            prescriptionMode: target.mode,
            prescriptionConfidence: prescription.confidence,
            manualOverride: false,
            completed: false,
            skipped: false
          };
        });
        const replacedSetIds = new Set(incompleteWorking.map((set) => set.id));
        const nextExercise = { ...profiledExercise, recommendationSnapshot: snapshot, basePrescription: snapshot.basePrescription, finalPrescription: prescription, prescription: target, restSeconds: prescription.restSeconds.target, executionBlocked: Boolean(prescription.executionBlocked), safetyRestriction: prescription.safetyRestriction || null };
        commit({
          ...data,
          exercises: data.exercises.map((item) => item.id === exerciseId ? nextExercise : item),
          sets: [...data.sets.filter((set) => !replacedSetIds.has(set.id)), ...rebuiltIncomplete],
          recommendationHistory: [...data.recommendationHistory.filter((item) => item.recommendationId !== snapshot.recommendationId), snapshot]
        }, true, { invalidateAnalysis: false, deferPersistence: true });
        showAppToast("Custom profile complete. Bounded guidance was applied to unfinished work only.");
      }

      function applyPrescriptionOverride(exerciseId, form, options = {}) {
        const exercise = exerciseById(exerciseId);
        if (!exercise?.recommendationSnapshot || !prescriptionEngine || !form) return;
        const current = exercise.recommendationSnapshot.finalPrescription;
        const restriction = current.safetyRestriction || null;
        const currentSafetyContext = restriction
          ? safetySubstituteContext(exercise.recommendationSnapshot, { exercise, session: sessionById(exercise.sessionId) })
          : null;
        const safetyLocked = current.executionBlocked === true
          || restriction?.status === "blocked"
          || (restriction?.status === "resolved_by_confirmed_substitute" && currentSafetyContext?.resolvedValidation?.valid !== true);
        const safetyContext = safetyLocked ? currentSafetyContext : null;
        const read = (field) => form.querySelector(`[data-override-field="${field}"]`)?.value ?? "";
        const override = {};
        const roleStandard = options.standardWorkload && ["top_set_backoff", "multiple_top_sets"].includes(current.setStructure);
        const roleValue = (prefix) => ({
          count: Number(read(`${prefix}-sets`)),
          repMin: Number(read(`${prefix}-rep-min`)),
          repMax: Number(read(`${prefix}-rep-max`))
        });
        const validRoleValue = (value, maximum) => Number.isInteger(value.count) && value.count >= 1 && value.count <= maximum
          && Number.isInteger(value.repMin) && Number.isInteger(value.repMax) && value.repMin >= 1 && value.repMax <= 50 && value.repMin <= value.repMax;
        if (options.standardWorkload) {
          if (roleStandard) {
            const top = roleValue("top");
            const backoff = current.setStructure === "top_set_backoff" ? roleValue("backoff") : null;
            if (!validRoleValue(top, 10)) return showAppToast("Choose 1 to 10 top sets and a valid rep range from 1 to 50.");
            if (backoff && !validRoleValue(backoff, 19)) return showAppToast("Choose 1 to 19 back-off sets and a valid rep range from 1 to 50.");
            if (top.count + Number(backoff?.count || 0) > 20) return showAppToast("Choose no more than 20 total working sets.");
          } else {
            const standardSets = Number(read("sets"));
            const standardRepMin = Number(read("rep-min"));
            const standardRepMax = Number(read("rep-max"));
            if (!Number.isInteger(standardSets) || standardSets < 1 || standardSets > 12) return showAppToast("Choose between 1 and 12 working sets.");
            if (!Number.isInteger(standardRepMin) || !Number.isInteger(standardRepMax) || standardRepMin < 1 || standardRepMax > 50 || standardRepMin > standardRepMax) return showAppToast("Choose a valid rep range from 1 to 50.");
          }
        }
        const replacementName = String(read("exercise")).trim();
        let replacementId = "";
        if (replacementName) {
          replacementId = safetyLocked
            ? exactResearchCatalogIdentity(replacementName, safetyContext.exerciseCatalog) || ""
            : prescriptionExerciseIdentity(replacementName) || "";
          if (!replacementId) return showAppToast("That replacement is not in the personal or research exercise database.");
          if (safetyLocked) {
            if (!safetyContext.allowedSafetySubstituteIds.includes(replacementId)) return showAppToast("That exercise is not an engine-confirmed substitute under the current equipment and exclusion settings.");
            const catalogRecord = safetyContext.exerciseCatalog.find((item) => item.exercise_id === replacementId);
            if (!catalogRecord) return showAppToast("That substitute does not retain a coherent public catalog identity.");
            override.exerciseId = replacementId;
            override.researchExerciseId = catalogRecord.exercise_id;
            override.painFreeConfirmed = form.querySelector('[data-override-field="pain-free-confirmed"]')?.checked === true;
          } else if (replacementId !== current.exerciseId) override.exerciseId = replacementId;
        }
        if (safetyLocked && !replacementName) return showAppToast("Choose a distinct engine-confirmed substitute before resolving this safety restriction.");
        if (!safetyLocked) {
          if (roleStandard) {
            const top = roleValue("top");
            const currentTopRange = current.topSet?.repRange || current.repRange;
            if (top.count !== Number(current.topSet?.count || 0) || top.repMin !== Number(currentTopRange.min) || top.repMax !== Number(currentTopRange.max)) override.topSet = { count: top.count, repRange: { min: top.repMin, max: top.repMax } };
            if (current.setStructure === "top_set_backoff") {
              const backoff = roleValue("backoff");
              const currentBackoffRange = current.backoffSets?.repRange || current.repRange;
              if (backoff.count !== Number(current.backoffSets?.count || 0) || backoff.repMin !== Number(currentBackoffRange.min) || backoff.repMax !== Number(currentBackoffRange.max)) override.backoffSets = { count: backoff.count, repRange: { min: backoff.repMin, max: backoff.repMax } };
            }
          } else {
            const sets = Number(read("sets"));
            if (sets && sets !== Number(current.workingSets.target)) override.setCount = sets;
            const repMin = Number(read("rep-min"));
            const repMax = Number(read("rep-max"));
            if (repMin && repMax && (repMin !== Number(current.repRange.min) || repMax !== Number(current.repRange.max))) override.repRange = { min: Math.min(repMin, repMax), max: Math.max(repMin, repMax) };
          }
          const load = read("load") === "" ? null : Number(read("load"));
          if (load !== null && load !== Number(current.prescribedLoad?.target ?? 0)) override.load = load;
          const structure = read("structure");
          if (structure && structure !== current.setStructure) override.setStructure = structure;
          const deload = read("deload");
          if (deload && deload !== "engine") override.deloadRecommendation = deload;
          const rotation = read("rotation");
          if (rotation && rotation !== "engine") override.exerciseRotation = rotation;
          const mesocycleId = read("mesocycle");
          if (mesocycleId && mesocycleId !== exercise.recommendationSnapshot.mesocycleId) override.mesocycleId = mesocycleId;
        }
        const reason = String(read("reason")).trim() || (options.standardWorkload ? "Standard workload preference" : "Intentional workout prescription override");
        if (override.deloadRecommendation && override.deloadRecommendation !== "normal" && !current.recommendationType.includes("deload")) {
          if (override.setCount === undefined) override.setCount = Math.max(1, Math.ceil(current.workingSets.target * 0.5));
          if (override.load === undefined && Number(current.prescribedLoad?.target || 0) > 0) override.load = Number((current.prescribedLoad.target * (override.deloadRecommendation === "full_program_deload" ? 0.85 : 0.9)).toFixed(2));
          override.setStructure = "straight_sets";
        }
        const session = sessionById(exercise.sessionId);
        const sourceTemplate = options.saveTemplateStandard && session?.templateId ? data.templates.find((item) => item.id === session.templateId) : null;
        const sourceTemplateExercise = sourceTemplate?.exercises?.find((item) => exerciseMatches(item.name, exercise.name)) || null;
        const savedTop = roleStandard ? roleValue("top") : null;
        const savedBackoff = roleStandard && current.setStructure === "top_set_backoff" ? roleValue("backoff") : null;
        const savedRanges = roleStandard ? [savedTop, savedBackoff].filter(Boolean) : [];
        const savedSetCount = roleStandard ? savedRanges.reduce((sum, role) => sum + role.count, 0) : Number(read("sets"));
        const savedRepMin = roleStandard ? Math.min(...savedRanges.map((role) => role.repMin)) : Number(read("rep-min"));
        const savedRepMax = roleStandard ? Math.max(...savedRanges.map((role) => role.repMax)) : Number(read("rep-max"));
        const standardTemplateValues = options.saveTemplateStandard && sourceTemplateExercise ? {
          sets: savedSetCount,
          reps: Math.round((savedRepMin + savedRepMax) / 2),
          repMin: savedRepMin,
          repMax: savedRepMax,
          ...(roleStandard ? { standardRoleWorkload: {
            setStructure: current.setStructure,
            topSet: { count: savedTop.count, repRange: { min: savedTop.repMin, max: savedTop.repMax } },
            ...(savedBackoff ? { backoffSets: { count: savedBackoff.count, repRange: { min: savedBackoff.repMin, max: savedBackoff.repMax } } } : {})
          } } : { standardRoleWorkload: null }),
          standardWorkloadOverride: true
        } : null;
        const templatesWithStandard = () => standardTemplateValues
          ? data.templates.map((template) => template.id === sourceTemplate.id ? {
              ...template,
              updatedAt: isoNow(),
              exercises: template.exercises.map((item) => item.id === sourceTemplateExercise.id ? { ...item, ...standardTemplateValues } : item)
            } : template)
          : data.templates;
        if (!Object.keys(override).length) {
          if (!standardTemplateValues) return showAppToast(options.standardWorkload ? "The evidence-based workload is already active." : "No prescription field changed.");
          commit({ ...data, templates: templatesWithStandard() }, true, { invalidateAnalysis: false, deferPersistence: true });
          showAppToast("Standard workload saved for future sessions.");
          return;
        }
        let snapshot;
        try {
          snapshot = prescriptionEngine.applyManualOverride(exercise.recommendationSnapshot, override, {
            workoutId: exercise.sessionId,
            reason,
            createdAt: isoNow(),
            allowedSafetySubstituteIds: safetyContext?.allowedSafetySubstituteIds,
            exerciseCatalog: safetyContext?.exerciseCatalog,
            availableEquipment: safetyContext?.availableEquipment
          });
        } catch (error) {
          showAppToast(error?.message || "The override could not be applied.");
          return;
        }
        const prescription = snapshot.finalPrescription;
        const target = legacyTargetFromSnapshot(snapshot, { name: replacementName || exercise.name, resistanceType: exercise.resistanceType, increment: exercise.prescription?.increment });
        const completedWorking = setsForExercise(exerciseId).filter((set) => isWorkingSet(set, "score") && set.completed);
        const incompleteWorking = setsForExercise(exerciseId).filter((set) => isWorkingSet(set, "score") && !set.completed);
        const warmups = setsForExercise(exerciseId).filter((set) => setTypeSemantics(set).isWarmup);
        const desiredTypes = expandedOverrideSetTypes(prescription, override.topSet || override.backoffSets ? null : override.repRange || null, override.topSet || override.backoffSets ? null : override.setCount || null);
        const desiredIncomplete = desiredTypes.slice(Math.min(completedWorking.length, desiredTypes.length));
        const baseLoad = Number(prescription.prescribedLoad?.target || target.weight || 0);
        const rebuiltIncomplete = desiredIncomplete.map((role, index) => {
          const existing = incompleteWorking[index] || createSet(exerciseId, completedWorking.length + index + 1, {});
          const targetLoad = role.reduction && baseLoad > 0 ? roundEquipmentLoad(baseLoad * (1 - role.reduction / 100), Number(target.increment || 1), target.resistanceType) : baseLoad;
          return {
            ...existing,
            setNumber: completedWorking.length + index + 1,
            sequenceIndex: warmups.length + completedWorking.length + index,
            sequence: warmups.length + completedWorking.length + index,
            setTypeIndex: desiredTypes.slice(0, completedWorking.length + index).filter((item) => item.type === role.type).length,
            setType: role.type,
            isWarmup: false,
            reps: Math.round((Number(role.repRange.min) + Number(role.repRange.max)) / 2),
            weight: targetLoad,
            rpe: Number(role.rpe),
            targetReps: Math.round((Number(role.repRange.min) + Number(role.repRange.max)) / 2),
            targetRepMin: Number(role.repRange.min),
            targetRepMax: Number(role.repRange.max),
            targetWeight: targetLoad,
            targetRpe: Number(role.rpe),
            targetRpeMin: Math.max(5, Number(role.rpe) - 1),
            targetRpeMax: Number(role.rpe),
            targetRestSeconds: prescription.restSeconds.target,
            prescriptionReason: reason,
            prescriptionMode: target.mode,
            prescriptionConfidence: prescription.confidence,
            manualOverride: true,
            overrideId: snapshot.manualOverrides.at(-1)?.overrideId,
            edited: true,
            completed: false,
            skipped: false
          };
        });
        const replacedSetIds = new Set(incompleteWorking.map((set) => set.id));
        const nextName = replacementId ? exerciseNameForPrescriptionId(replacementId, replacementName) : exercise.name;
        const overrideEntry = { ...snapshot.manualOverrides.at(-1), recommendationId: snapshot.recommendationId, exerciseRuntimeId: exercise.id, sessionId: exercise.sessionId };
        const nextExercise = { ...exercise, name: nextName, recommendationSnapshot: snapshot, basePrescription: snapshot.basePrescription, finalPrescription: prescription, prescription: target, adjustmentReason: target.adjustmentReason || "", isDeload: prescription.recommendationType.includes("deload"), executionBlocked: Boolean(prescription.executionBlocked), safetyRestriction: prescription.safetyRestriction || null, manualOverrides: [...(exercise.manualOverrides || []), overrideEntry], overrideLocked: true, restSeconds: prescription.restSeconds.target };
        const workoutRecommendations = session?.workoutPrescription?.recommendations || [];
        const workoutPrescription = session?.workoutPrescription ? {
          ...session.workoutPrescription,
          mesocycleId: snapshot.mesocycleId,
          recommendations: workoutRecommendations.some((item) => item.recommendationId === snapshot.recommendationId)
            ? workoutRecommendations.map((item) => item.recommendationId === snapshot.recommendationId ? snapshot : item)
            : [...workoutRecommendations, snapshot]
        } : session?.workoutPrescription;
        const recommendationHistory = data.recommendationHistory.some((item) => item.recommendationId === snapshot.recommendationId)
          ? data.recommendationHistory.map((item) => item.recommendationId === snapshot.recommendationId ? snapshot : item)
          : [...data.recommendationHistory, snapshot];
        commit({
          ...data,
          sessions: data.sessions.map((item) => item.id === exercise.sessionId ? { ...item, mesocycleId: snapshot.mesocycleId || item.mesocycleId, workoutPrescription } : item),
          exercises: data.exercises.map((item) => item.id === exercise.id ? nextExercise : item),
          sets: [...data.sets.filter((set) => !replacedSetIds.has(set.id)), ...rebuiltIncomplete],
          templates: templatesWithStandard(),
          recommendationHistory,
          manualOverrides: [...data.manualOverrides, overrideEntry]
        }, true, { invalidateAnalysis: false, deferPersistence: true });
        showAppToast(options.standardWorkload ? (standardTemplateValues ? "Standard workload applied and saved for future sessions." : "Standard workload applied to this session.") : "Prescription override saved and locked for this workout.");
      }

      function patchExercise(exerciseId, patch, shouldRender = true) {
        if (shouldRender) {
          const exercise = exerciseById(exerciseId);
          const draftMutation = exercise?.sessionId === activeWorkoutId && !isEditingHistorySession();
          commit({ ...data, exercises: data.exercises.map((item) => item.id === exerciseId ? { ...item, ...patch } : item) }, true, { invalidateAnalysis: !draftMutation, deferPersistence: draftMutation });
          return;
        }
        const index = dataEntityIndex().exerciseIndexById.get(exerciseId) ?? -1;
        if (index >= 0) {
          data.exercises[index] = { ...data.exercises[index], ...patch };
          if (isEditingHistorySession()) historyEditFlow.dirty = true;
          else scheduleSave();
        }
      }

      function patchExerciseName(exerciseId, name, shouldRender = true) {
        const exercise = exerciseById(exerciseId);
        if (!exercise) return;
        if (!shouldRender) {
          patchExercise(exerciseId, { name }, false);
          return;
        }
        const firstSet = setsForExercise(exerciseId).find((set) => isWorkingSet(set, "score"));
        const previousAutoRest = recommendedRestSeconds(exercise.name, { reps: firstSet?.reps, rpe: firstSet?.rpe, excludeSessionId: exercise.sessionId });
        const restSeconds = !exercise.restSeconds || Number(exercise.restSeconds) === previousAutoRest
          ? recommendedRestSeconds(name, { reps: firstSet?.reps, rpe: firstSet?.rpe, excludeSessionId: exercise.sessionId })
          : exercise.restSeconds;
        patchExercise(exerciseId, { name, restSeconds }, shouldRender);
      }

      function patchTemplateExerciseName(templateId, exerciseId, name, shouldRender = true) {
        const template = data.templates.find((item) => item.id === templateId);
        const exercise = template?.exercises.find((item) => item.id === exerciseId);
        if (!exercise) return;
        if (!shouldRender) {
          patchTemplateExercise(templateId, exerciseId, { name }, false);
          return;
        }
        const previousAutoRest = recommendedRestSeconds(exercise.name, { reps: exercise.reps });
        const restSeconds = !exercise.restSeconds || Number(exercise.restSeconds) === previousAutoRest
          ? recommendedRestSeconds(name, { reps: exercise.reps })
          : exercise.restSeconds;
        patchTemplateExercise(templateId, exerciseId, { name, restSeconds }, shouldRender);
      }

      function patchSet(setId, patch, shouldRender = true) {
        if (shouldRender) {
          const set = setById(setId);
          const exercise = set ? exerciseById(set.exerciseId) : null;
          const draftMutation = exercise?.sessionId === activeWorkoutId && !isEditingHistorySession();
          commit({ ...data, sets: data.sets.map((item) => item.id === setId ? { ...item, ...patch } : item) }, true, { invalidateAnalysis: !draftMutation, deferPersistence: draftMutation });
          return;
        }
        const index = dataEntityIndex().setIndexById.get(setId) ?? -1;
        if (index >= 0) {
          const updatedSet = { ...data.sets[index], ...patch };
          if (isEditingHistorySession()) {
            const sets = data.sets.slice();
            sets[index] = updatedSet;
            data = { ...data, sets, dataRevision: Number(data.dataRevision || 0) + 1 };
            historyEditFlow.dirty = true;
            invalidateCompletedAnalysis();
          } else {
            data.sets[index] = updatedSet;
            scheduleSave();
          }
          updatePlanPreview(updatedSet.exerciseId);
        }
      }

      function setManualType(setId, requestedType) {
        const current = data.sets.find((set) => set.id === setId);
        if (!current) return;
        const setType = normalizeSetTypeCode(requestedType);
        logWorkoutOverride(exerciseById(current.exerciseId), "setStructure", normalizeSetTypeCode(current.setType, current.isWarmup), setType, { setId });
        const isWarmup = setType === "warmup";
        const semantics = setTypeSemantics({ ...current, setType, isWarmup, countsTowardScore: !isWarmup, countsTowardVolume: !isWarmup, countsTowardProgression: !isWarmup });
        patchSet(setId, {
          setType,
          isWarmup,
          countsTowardScore: semantics.countsTowardScore,
          countsTowardVolume: semantics.countsTowardVolume,
          countsTowardProgression: semantics.countsTowardProgression,
          classificationSource: "manual",
          classificationConfidence: 1,
          classifierVersion: SET_CLASSIFIER_VERSION,
          manualOverride: true,
          reviewRequired: false,
          classifiedAt: isoNow(),
          classificationUndo: current.classificationUndo || { setType: current.setType, isWarmup: current.isWarmup, countsTowardScore: current.countsTowardScore, countsTowardVolume: current.countsTowardVolume, countsTowardProgression: current.countsTowardProgression, classificationSource: current.classificationSource, classificationConfidence: current.classificationConfidence, manualOverride: current.manualOverride, reviewRequired: current.reviewRequired }
        });
        showAppToast("Set type updated. Analysis and template history will use the correction.");
      }

      function undoManualSetType(setId) {
        const current = data.sets.find((set) => set.id === setId);
        if (!current?.classificationUndo) return;
        patchSet(setId, { ...current.classificationUndo, classificationUndo: null, classifiedAt: isoNow() });
        showAppToast("Set type correction undone.");
      }

      function logWorkoutOverride(exercise, field, from, to, details = {}) {
        if (!exercise || exercise.sessionId !== activeWorkoutId || from === to) return null;
        const entry = {
          overrideId: `runtime_override_${id()}`,
          recommendationId: exercise.recommendationSnapshot?.recommendationId || null,
          sessionId: exercise.sessionId,
          exerciseRuntimeId: exercise.id,
          exerciseId: exercise.recommendationSnapshot?.exerciseId || prescriptionExerciseIdentity(exercise.name),
          field,
          from,
          to,
          createdAt: isoNow(),
          actor: "user",
          lockedForWorkout: true,
          ...details
        };
        data.manualOverrides = [...data.manualOverrides, entry];
        const exerciseIndex = dataEntityIndex().exerciseIndexById.get(exercise.id);
        if (exerciseIndex != null) data.exercises[exerciseIndex] = { ...data.exercises[exerciseIndex], manualOverrides: [...(data.exercises[exerciseIndex].manualOverrides || []), entry], overrideLocked: true };
        return entry;
      }

      function patchSetValue(setId, field, value, shouldRender = true) {
        const editingHistory = isEditingHistorySession();
        if (!editingHistory) acknowledgeActiveSet(setId);
        const set = setById(setId);
        const exercise = set ? exerciseById(set.exerciseId) : null;
        const resistanceType = resistanceTypeFor(exercise, set);
        const numeric = Number(value);
        if (editingHistory && Number(set?.[field]) === numeric) return;
        if (editingHistory) shouldRender = false;
        if (shouldRender) logWorkoutOverride(exercise, field === "weight" ? "load" : field, set?.[`target${field.charAt(0).toUpperCase() + field.slice(1)}`] ?? set?.[field], numeric, { setId });
        const patch = { [field]: numeric, edited: true };
        if (field === "weight" && resistanceType === "bodyweight_plus_load") patch.addedLoad = numeric;
        if (field === "weight" && resistanceType === "assisted_bodyweight") patch.assistanceLoad = numeric;
        patchSet(setId, patch, shouldRender);
      }

      function toggleSetCompletion(setId) {
        const interactionStartedAt = performanceNow();
        const authorization = guardWorkoutMutation("toggle-set", { setId });
        if (!authorization.allowed) return;
        const set = authorization.target.set;
        const completing = !set.completed;
        if (authorization.target.authorizationMode === "history_edit") {
          patchSet(set.id, { completed: completing, skipped: false, edited: true });
          return;
        }
        if (!completing) {
          if (timer?.setId === set.id) cancelTimer("set-reopened", false);
          setActiveSet(set.id, "Set " + (set.isWarmup ? "WU" : set.setNumber) + " is current", false);
          patchSet(set.id, { completed: false, skipped: false }, false);
          render();
          recordPerformance("interaction:reopenSet", interactionStartedAt, { setId });
          return;
        }

        const next = nextIncompleteSet(set.id);
        const exercise = exerciseById(set.exerciseId);
        patchSet(set.id, { completed: true, skipped: false }, false);
        applyCompletedSetVisual(set.id);
        if (next && data.settings.autoStartRestTimer !== false) {
          startTimer(exercise?.id || set.exerciseId, set.id, { pendingNextSetId: next.id, deferRender: true });
          recordPerformance("interaction:completeSet", interactionStartedAt, { setId, timerStarted: true });
          return;
        }
        setActiveSet(next?.id || "", next ? "Set " + (next.isWarmup ? "WU" : next.setNumber) + " is current" : "Workout sets complete", false);
        renderAfterInteractionFrame();
        recordPerformance("interaction:completeSet", interactionStartedAt, { setId, timerStarted: false });
      }

      function toggleSetSkipped(setId) {
        const authorization = guardWorkoutMutation("toggle-skip-set", { setId });
        if (!authorization.allowed) return;
        const set = authorization.target.set;
        const skipped = !set.skipped;
        if (authorization.target.authorizationMode === "history_edit") {
          patchSet(set.id, { skipped, completed: false, edited: true });
          return;
        }
        if (timer?.setId === set.id || timer?.pendingNextSetId === set.id) cancelTimer("set-skipped", false);
        const next = skipped ? nextIncompleteSet(set.id) : set;
        setActiveSet(next?.id || "", next ? "Set " + (next.isWarmup ? "WU" : next.setNumber) + " is current" : "Workout sets complete", false);
        patchSet(set.id, { skipped, completed: false }, false);
        render();
      }

      function updateTemplateFromExercise(exerciseId) {
        const session = activeSession();
        const exercise = data.exercises.find((item) => item.id === exerciseId);
        const template = data.templates.find((item) => item.id === session?.templateId);
        if (!session || !exercise || !template) return;
        const templateExercise = template.exercises.find((item) => exerciseMatches(item.name, exercise.name));
        if (!templateExercise) return;
        const workSets = setsForExercise(exercise.id).filter((set) => isWorkingSet(set, "progression") && !set.skipped);
        const representative = workSets[0];
        if (!representative) return;
        const snapshot = exercise.recommendationSnapshot || null;
        const prescription = snapshot?.finalPrescription || null;
        patchTemplateExercise(template.id, templateExercise.id, {
          sets: workSets.length,
          reps: representative.reps,
          repMin: prescription?.repRange?.min || representative.targetRepMin || representative.reps,
          repMax: prescription?.repRange?.max || representative.targetRepMax || representative.reps,
          targetRpe: representative.rpe,
          restSeconds: exercise.restSeconds,
          setStructure: prescription?.setStructure || exercise.appliedTargetContext?.setTypes?.map((item) => item.type).join("+") || templateExercise.setStructure,
          setTypes: exercise.appliedTargetContext?.setTypes || templateExercise.setTypes || [],
          recommendationSnapshot: snapshot,
          recommendationId: snapshot?.recommendationId || null,
          recommendationVersion: snapshot?.recommendationVersion || null,
          personalDataVersion: snapshot?.personalDataVersion || null,
          researchDatabaseVersion: snapshot?.researchDatabaseVersion || null,
          mesocycleId: snapshot?.mesocycleId || session.mesocycleId || null,
          manualOverrides: snapshot?.manualOverrides || [],
          ...(exercise.customExerciseProfile ? { customExerciseProfile: normalizeCustomExerciseProfile(exercise.customExerciseProfile) } : {})
        });
        activeSetNotice = "Template updated from today’s targets";
      }

      function updatePlanPreview(exerciseId) {
        const exercise = data.exercises.find((item) => item.id === exerciseId);
        if (!exercise) return;
        const sets = setsForExercise(exerciseId);
        const first = sets[0] || createSet(exerciseId, 1);
        const loadText = first.weight > 0 ? first.weight + " " + (first.weightUnit || data.settings.weightUnit) : "BW/control";
        const count = document.querySelector('[data-plan-count="' + exerciseId + '"]');
        const reps = document.querySelector('[data-plan-reps="' + exerciseId + '"]');
        const load = document.querySelector('[data-plan-load="' + exerciseId + '"]');
        const rest = document.querySelector('[data-plan-rest="' + exerciseId + '"]');
        const meta = document.querySelector('[data-plan-meta="' + exerciseId + '"]');
        if (count) count.textContent = sets.length + " sets";
        if (reps) reps.textContent = (sets.length || 1) + " x " + (first.reps || 0);
        if (load) load.textContent = loadText;
        if (rest) rest.textContent = (exercise.restSeconds || data.settings.defaultRestSeconds || 90) + "s rest";
        if (meta) meta.textContent = "Aim RPE " + (first.rpe || 8) + ". " + (exercise.notes || "Use clean reps and stop when positions break.");
      }

      function addSession() {
        if (hasActiveWorkout()) {
          activeSessionId = activeWorkoutId;
          setActiveTab("today", { replace: true, renderNow: false });
          showAppToast("You already have an active workout. Resume or cancel it before starting another.");
          render();
          return;
        }
        const session = createSession(undefined, { started: true });
        activeSessionId = session.id;
        activeWorkoutId = session.id;
        viewingHistorySessionId = "";
        activeSetId = "";
        activeSetAcknowledged = false;
        activeSetNotice = "";
        window.clearInterval(timerInterval);
        timer = null;
        setActiveTab("today", { replace: true, renderNow: false });
        commit({ ...data, sessions: [session, ...data.sessions] });
      }

      function addExercise() {
        const name = addExerciseDraft;
        if (!name || !name.trim()) return;
        const authorization = guardWorkoutMutation("add-exercise");
        if (!authorization.allowed) return;
        const session = authorization.target.session;
        const historyCorrection = authorization.target.authorizationMode === "history_edit";
        if (isSessionSubmitted(session) && !historyCorrection) {
          showAppToast("Logged workouts cannot become active again. Start a new workout first.");
          return;
        }
        if (!historyCorrection && hasActiveWorkout() && session.id !== activeWorkoutId) {
          activeSessionId = activeWorkoutId;
          setActiveTab("today", { replace: true, renderNow: false });
          showAppToast("You already have an active workout. Resume or cancel it before adding another.");
          render();
          return;
        }
        const resistanceType = inferResistanceType(name.trim());
        const runtimeExerciseId = id();
        const resolvedIdentity = resolvePrescriptionExerciseIdentity({ name: name.trim() });
        const recognized = resolvedIdentity.status === "resolved" && !resolvedIdentity.custom;
        const identityFields = recognized
          ? exerciseIdentityFields({ name: name.trim(), researchExerciseId: resolvedIdentity.exerciseId })
          : { performanceExerciseId: `user_custom_${String(runtimeExerciseId).replace(/[^a-zA-Z0-9]+/g, "_")}`, researchExerciseId: "", identitySource: "user_declared_custom", identityVersion: "exercise-identity/2.1.0" };
        let exercise = {
          id: runtimeExerciseId,
          sessionId: session.id,
          name: name.trim(),
          ...identityFields,
          primaryMuscle: addExercisePrimaryMuscle,
          secondaryMuscle: addExerciseSecondaryMuscle,
          notes: "",
          order: data.exercises.filter((item) => item.sessionId === session.id).length,
          restSeconds: recommendedRestSeconds(name.trim()),
          resistanceType,
          isBodyweight: isBodyweightResistance(resistanceType),
          isDeload: false,
          executionQualityAssessment: "not_assessed",
          ...(!recognized ? { customExerciseProfile: normalizeCustomExerciseProfile({ primaryMuscleGroupId: addExercisePrimaryMuscle, secondaryMuscleGroupId: addExerciseSecondaryMuscle }) } : {})
        };
        let initialSets = [createSet(exercise.id, 1, { resistanceType })];
        if (recognized) {
          const snapshot = unifiedPrescriptionSnapshot(exercise, { fresh: true, throughDate: session.date, excludeSessionId: session.id, recovery: session.recovery || {} });
          if (snapshot?.finalPrescription && !snapshot.executionBlocked && !snapshot.hardConstraint) {
            const prescription = snapshot.finalPrescription;
            const target = legacyTargetFromSnapshot(snapshot, { name: exercise.name, resistanceType });
            const desiredTypes = expandedOverrideSetTypes(prescription);
            initialSets = desiredTypes.map((role, index) => createSet(exercise.id, index + 1, {
              resistanceType,
              sequenceIndex: index,
              sequence: index,
              setTypeIndex: desiredTypes.slice(0, index).filter((item) => item.type === role.type).length,
              setType: role.type,
              reps: Math.round((Number(role.repRange.min) + Number(role.repRange.max)) / 2),
              weight: Number(prescription.prescribedLoad?.target || target.weight || 0),
              rpe: Number(role.rpe),
              targetReps: Math.round((Number(role.repRange.min) + Number(role.repRange.max)) / 2),
              targetRepMin: Number(role.repRange.min),
              targetRepMax: Number(role.repRange.max),
              targetRpe: Number(role.rpe),
              targetRpeMin: Math.max(5, Number(role.rpe) - 1),
              targetRpeMax: Number(role.rpe),
              targetRestSeconds: Number(prescription.restSeconds.target),
              prescriptionReason: prescription.progressionRule,
              prescriptionMode: target.mode,
              prescriptionConfidence: prescription.confidence
            }));
            exercise = { ...exercise, recommendationSnapshot: snapshot, basePrescription: snapshot.basePrescription, finalPrescription: prescription, prescription: target, restSeconds: prescription.restSeconds.target };
          }
        }
        addExerciseDraft = "";
        addExercisePrimaryMuscle = "";
        addExerciseSecondaryMuscle = "";
        if (!historyCorrection) {
          activeWorkoutId = session.id;
          session.workoutStarted = true;
          session.workoutState = "active";
          if (!session.startedAt) session.startedAt = isoNow();
        }
        commit({ ...data, sessions: data.sessions.map((item) => item.id === session.id ? { ...session, updatedAt: isoNow() } : item), exercises: [...data.exercises, exercise], sets: [...data.sets, ...initialSets], recommendationHistory: exercise.recommendationSnapshot ? [...data.recommendationHistory, exercise.recommendationSnapshot] : data.recommendationHistory }, true, { invalidateAnalysis: historyCorrection, deferPersistence: !historyCorrection });
      }

      function addTemplate() {
        const template = { id: id(), name: "New Template", notes: "", exercises: [{ id: id(), name: "Exercise", sets: 3, reps: 8, targetRpe: 8, increment: progressionProfileForExercise("Exercise").increment, restSeconds: recommendedRestSeconds("Exercise"), resistanceType: "external", isBodyweight: false, warmups: [] }], createdAt: isoNow(), updatedAt: isoNow() };
        setActiveTab("plan", { renderNow: false });
        commit({ ...data, templates: [template, ...data.templates] });
      }

      function patchTemplate(templateId, patch, shouldRender = true) {
        commit({ ...data, templates: data.templates.map((template) => template.id === templateId ? { ...template, ...patch, updatedAt: isoNow() } : template) }, shouldRender);
      }

      function assertTemplateExerciseNumericDomain(patch) {
        Object.values(templateNumericFields).forEach((config) => {
          if (!Object.prototype.hasOwnProperty.call(patch, config.field)) return;
          const value = patch[config.field];
          const numeric = Number(value);
          const steps = (numeric - config.min) / config.step;
          if (!Number.isFinite(numeric)
            || numeric < config.min
            || numeric > config.max
            || (config.integer && !Number.isInteger(numeric))
            || Math.abs(steps - Math.round(steps)) > 1e-9) {
            throw new RangeError(`Template ${config.label} must be between ${config.min} and ${config.max} in ${config.step} increments.`);
          }
        });
      }

      function patchTemplateExercise(templateId, exerciseId, patch, shouldRender = true) {
        assertTemplateExerciseNumericDomain(patch);
        commit({
          ...data,
          templates: data.templates.map((template) => template.id === templateId
            ? { ...template, exercises: template.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, ...patch } : exercise), updatedAt: isoNow() }
            : template)
        }, shouldRender);
      }

      function addTemplateExercise(templateId) {
        commit({
          ...data,
          templates: data.templates.map((template) => template.id === templateId
              ? { ...template, exercises: [...template.exercises, { id: id(), name: "Exercise", sets: 3, reps: 8, targetRpe: 8, increment: progressionProfileForExercise("Exercise").increment, restSeconds: recommendedRestSeconds("Exercise"), resistanceType: "external", isBodyweight: false, warmups: [] }], updatedAt: isoNow() }
            : template)
        });
      }

      function saveActiveSessionAsTemplate() {
        const template = createTemplateFromSession(activeSessionId);
        if (!template || template.exercises.length === 0) {
          setActiveTab("plan", { renderNow: false });
          addTemplate();
          return;
        }
        setActiveTab("plan", { renderNow: false });
        commit({ ...data, templates: [template, ...data.templates] });
      }

      function startTemplate(templateId, recovery = defaultRecovery(), readinessMode = "usual", options = {}) {
        const template = data.templates.find((item) => item.id === templateId);
        if (!template) return;
        if (hasActiveWorkout()) {
          templateStartFlow = { templateId, step: "active-conflict", draft: cleanRecovery(recovery) };
          render();
          return;
        }
        const currentSession = activeSession();
        const replaceCurrent = currentSession && currentSession.date === todayIso() && currentSession.source !== "strong" && !isSessionSubmitted(currentSession);
        const session = replaceCurrent
          ? { ...currentSession, title: template.name, templateId: template.id, recovery: cleanRecovery(recovery), readinessMode, submitted: false, submittedAt: "", workoutStarted: true, workoutState: "active", prs: [], updatedAt: isoNow() }
          : createSession(template.name, { started: true });
        session.templateId = template.id;
        session.workoutStarted = true;
        session.workoutState = "active";
        session.recovery = cleanRecovery(recovery);
        session.readinessMode = readinessMode;
        const recoveryAdvice = recoveryRecommendationForSession(session);
        const exercises = [];
        const sets = [];
        const readinessAdjustments = [];
        const recommendationSnapshots = [];
        let adjustedLiftCount = 0;
        template.exercises.forEach((templateExercise, index) => {
          const templateResistanceType = templateExercise.resistanceType || inferResistanceType(templateExercise.name, templateExercise);
          const historyTarget = { ...coachTargetForTemplateExercise(templateExercise, { excludeSessionId: session.id, template, resistanceType: templateResistanceType, workoutId: session.id }), resistanceType: templateResistanceType, isBodyweight: isBodyweightResistance(templateResistanceType) };
          if (!historyTarget.executionBlocked) {
            historyTarget.sets = Math.max(1, Number(historyTarget.sets || templateExercise.sets || 1));
            historyTarget.reps = Math.max(1, Number(historyTarget.reps || templateExercise.reps || 1));
            historyTarget.repLow = Math.max(1, Number(historyTarget.repLow || historyTarget.reps));
            historyTarget.repHigh = Math.max(historyTarget.repLow, Number(historyTarget.repHigh || historyTarget.reps));
          }
          historyTarget.restSeconds = Number(historyTarget.restSeconds || templateExercise.restSeconds || recommendedRestSeconds(templateExercise.name, { reps: historyTarget.reps, rpe: historyTarget.rpe, excludeSessionId: session.id }));
          const safetyRestricted = Boolean(recovery.illness || recovery.pain);
          const adjustedTarget = options.useOriginal && !safetyRestricted ? { ...historyTarget, adjusted: false, adjustmentReason: "", triggerLabels: [] } : adjustTargetForRecovery(historyTarget, recoveryAdvice, { recovery, exerciseName: templateExercise.name, template, workoutId: session.id });
          const target = { ...adjustedTarget, resistanceType: adjustedTarget.resistanceType || templateResistanceType, isBodyweight: isBodyweightResistance(adjustedTarget.resistanceType || templateResistanceType) };
          const resolvedResistanceType = target.resistanceType || templateResistanceType;
          if (target.adjusted) adjustedLiftCount += 1;
          const restSeconds = Number(target.restSeconds || historyTarget.restSeconds);
          const programTargetContext = unifiedTargetContext(historyTarget, template, templateExercise) || exerciseTargetContext(template, templateExercise, { source: "Current workout template", effectiveStartDate: session.date });
          let appliedTargetContext = unifiedTargetContext(target, template, templateExercise) || exerciseTargetContext(template, { ...templateExercise, sets: target.sets }, { sets: target.sets, rpe: target.rpe, restSeconds, source: target.adjusted ? "Readiness-adjusted target" : target.isDeload ? "Deload prescription" : "Saved workout prescription", effectiveStartDate: session.date, effectiveEndDate: session.date, confidence: target.confidence });
          const baseTargetContext = appliedTargetContext || programTargetContext;
          const rpeShift = Number(target.rpe || 0) && Number(historyTarget.rpe || 0) ? Number(target.rpe) - Number(historyTarget.rpe) : 0;
          const effectiveRpeShift = ["deload", "light", "technique"].includes(target.mode) ? 0 : rpeShift;
          const resolvedTypes = resolvedSetTypesForPrescription(baseTargetContext, target, templateExercise).map((type) => ({
            ...type,
            rpeMin: type.rpeMin ? Math.max(1, type.rpeMin + effectiveRpeShift) : Math.max(1, Number(target.rpe || 0) - 1),
            rpeMax: type.rpeMax ? Math.max(1, type.rpeMax + effectiveRpeShift) : Number(target.rpe || 0),
            restSeconds: Number(target.restSeconds || type.restSeconds || restSeconds)
          }));
          appliedTargetContext = { ...appliedTargetContext, setTypes: [...(appliedTargetContext?.setTypes || []).filter((type) => type.isWarmup), ...resolvedTypes] };
          const exercise = { id: id(), sessionId: session.id, ...(template.source === "strong" ? { source: "strong-template" } : {}), name: templateExercise.name, ...(typeof exerciseIdentityFields === "function" ? exerciseIdentityFields(templateExercise) : {}), primaryMuscle: templateExercise.primaryMuscle || "", secondaryMuscle: templateExercise.secondaryMuscle || "", ...(templateExercise.customExerciseProfile ? { customExerciseProfile: normalizeCustomExerciseProfile(templateExercise.customExerciseProfile) } : {}), executionQualityAssessment: "not_assessed", notes: "", originalPrescription: historyTarget, prescription: target, recommendationSnapshot: target.recommendationSnapshot || historyTarget.recommendationSnapshot || null, basePrescription: target.basePrescription || historyTarget.basePrescription || null, finalPrescription: target.finalPrescription || target.recommendationSnapshot?.finalPrescription || null, recommendationVersion: target.recommendationSnapshot?.recommendationVersion || null, personalDataVersion: target.recommendationSnapshot?.personalDataVersion || null, researchDatabaseVersion: target.recommendationSnapshot?.researchDatabaseVersion || null, programTargetContext, appliedTargetContext, adjustmentReason: target.adjustmentReason || "", manualOverrides: [], order: index, restSeconds, resistanceType: target.resistanceType || templateResistanceType, isBodyweight: isBodyweightResistance(resolvedResistanceType), isDeload: Boolean(target.isDeload), executionBlocked: Boolean(target.executionBlocked), safetyRestriction: target.safetyRestriction || null };
          exercises.push(exercise);
          if (exercise.recommendationSnapshot) recommendationSnapshots.push(exercise.recommendationSnapshot);
          readinessAdjustments.push({ exerciseId: exercise.id, name: exercise.name, original: historyTarget, adjusted: target, changed: Boolean(target.adjusted), reason: target.adjustmentReason || "No readiness change was required.", triggers: target.triggerLabels || [] });
          const configuredWarmups = target.executionBlocked ? [] : (templateExercise.warmups || []);
          configuredWarmups.forEach((warmup, warmupIndex) => {
            sets.push(createSet(exercise.id, warmupIndex + 1, { ...warmup, sequenceIndex: warmupIndex, sequence: warmupIndex, setTypeIndex: warmupIndex, sourceTemplateSetId: warmup.id || templateExercise.id + "-warmup-" + warmupIndex, resistanceType: target.resistanceType || templateResistanceType, completed: false, isWarmup: true, setType: "warmup", countsTowardScore: false, countsTowardVolume: false, countsTowardProgression: false }));
          });
          const previousRoleSets = getMostRecentWorkoutSets(templateExercise.name, { excludeSessionId: session.id, resistanceType: resolvedResistanceType });
          let setNumber = 0;
          let rolePrescriptions = [];
          resolvedTypes.forEach((setType) => {
            for (let typeSetIndex = 0; typeSetIndex < setType.setCount; typeSetIndex += 1) {
              setNumber += 1;
              rolePrescriptions.push(setPrescriptionForRole({ templateExercise, target, setType, setTypeIndex: typeSetIndex, sequenceIndex: configuredWarmups.length + setNumber - 1, workingSetIndex: setNumber - 1, previousSets: previousRoleSets }));
            }
          });
          rolePrescriptions = validateGeneratedSetPrescriptions(rolePrescriptions, resolvedResistanceType);
          const generatedRoleTypes = Array.from(new Set(rolePrescriptions.map((prescription) => prescription.setType))).map((role) => {
            const sourceType = resolvedTypes.find((type) => normalizeSetTypeCode(type.type) === role)
              || (role === "straight" ? resolvedTypes.find((type) => normalizeSetTypeCode(type.type) === "backoff") : null)
              || {};
            return { ...sourceType, type: role, label: setTypeLabels[role] || "Working set", setCount: rolePrescriptions.filter((prescription) => prescription.setType === role).length };
          });
          appliedTargetContext = { ...appliedTargetContext, setTypes: [...(appliedTargetContext?.setTypes || []).filter((type) => type.isWarmup), ...generatedRoleTypes] };
          exercise.appliedTargetContext = appliedTargetContext;
          rolePrescriptions.forEach((prescription, prescriptionIndex) => {
            const setNumber = prescriptionIndex + 1;
            const setType = resolvedTypes.find((type) => normalizeSetTypeCode(type.type) === prescription.setType) || resolvedTypes.find((type) => normalizeSetTypeCode(type.type) === "backoff" && prescription.setType === "straight") || {};
            const setWeight = prescription.targetLoad;
            const setRpe = prescription.rpeMax;
            sets.push(createSet(exercise.id, setNumber, { sequenceIndex: prescription.sequenceIndex, sequence: prescription.sequenceIndex, setTypeIndex: prescription.setTypeIndex, sourceTemplateSetId: setType.id || templateExercise.id + "-" + prescription.setType + "-" + prescription.setTypeIndex, reps: prescription.targetReps, weight: setWeight, weightUnit: target.weightUnit, resistanceType: target.resistanceType || templateResistanceType, isBodyweight: isBodyweightResistance(resolvedResistanceType), addedLoad: target.resistanceType === "bodyweight_plus_load" ? setWeight : target.addedLoad, assistanceLoad: target.resistanceType === "assisted_bodyweight" ? setWeight : target.assistanceLoad, rpe: setRpe, completed: false, isWarmup: false, setType: prescription.setType, countsTowardScore: setType.countsTowardScore !== false, countsTowardVolume: setType.countsTowardVolume !== false, targetReps: prescription.targetReps, targetRepMin: prescription.repMin, targetRepMax: prescription.repMax, targetWeight: setWeight, targetRpe: setRpe, targetRpeMin: prescription.rpeMin, targetRpeMax: prescription.rpeMax, targetRpeTolerance: setType.rpeTolerance, targetRestSeconds: prescription.restSeconds, originalTargetReps: historyTarget.reps, originalTargetWeight: historyTarget.weight, originalTargetRpe: historyTarget.rpe, setPrescription: prescription, previousComparableSet: prescription.previousComparableSet, prescriptionReason: prescription.reason + " " + (target.adjustmentReason || target.reason || ""), prescriptionMode: target.mode, prescriptionConfidence: target.confidence, validationWarning: prescription.validationWarning || "" }));
          });
        });
        session.adjustmentSummary = adjustedLiftCount ? adjustedLiftCount + " lift" + (adjustedLiftCount === 1 ? "" : "s") + " adjusted for recovery." : "No recovery adjustments — normal plan and history-based progression.";
        session.readinessAdjustments = readinessAdjustments;
        session.usedOriginalTargets = Boolean(options.useOriginal);
        session.mesocycleId = currentMesocycle()?.id || "";
        session.workoutPrescription = {
          schemaVersion: "workout-prescription/1.0.0",
          workoutPrescriptionId: `workout_rx_${session.id}`,
          createdAt: isoNow(),
          mesocycleId: session.mesocycleId || null,
          recommendationVersion: recommendationSnapshots[0]?.recommendationVersion || prescriptionApi?.PRESCRIPTION_SCHEMA_VERSION || "unknown",
          personalDataVersion: recommendationSnapshots[0]?.personalDataVersion || prescriptionEvidenceStatus.personalVersion,
          researchDatabaseVersion: recommendationSnapshots[0]?.researchDatabaseVersion || prescriptionEvidenceStatus.researchVersion,
          recommendations: recommendationSnapshots
        };
        session.startedAt = isoNow();
        activeSessionId = session.id;
        activeWorkoutId = session.id;
        viewingHistorySessionId = "";
        setActiveTab("today", { renderNow: false });
        templateStartFlow = null;
        activeSetId = [...sets].sort((a, b) => canonicalSetSequence(a) - canonicalSetSequence(b)).find((set) => !set.completed && !set.skipped)?.id || "";
        activeSetAcknowledged = false;
        activeSetNotice = activeSetId ? "First set is ready" : "";
        if (replaceCurrent) {
          const oldExerciseIds = new Set(data.exercises.filter((exercise) => exercise.sessionId === session.id).map((exercise) => exercise.id));
          commit({
            ...data,
            sessions: data.sessions.map((item) => item.id === session.id ? session : item),
            exercises: [...data.exercises.filter((exercise) => exercise.sessionId !== session.id), ...exercises],
            sets: [...data.sets.filter((set) => !oldExerciseIds.has(set.exerciseId)), ...sets],
            recommendationHistory: [...data.recommendationHistory.filter((snapshot) => !recommendationSnapshots.some((candidate) => candidate.recommendationId === snapshot.recommendationId)), ...recommendationSnapshots]
          }, true, { invalidateAnalysis: false });
        } else {
          commit({ ...data, sessions: [session, ...data.sessions], exercises: [...data.exercises, ...exercises], sets: [...data.sets, ...sets], recommendationHistory: [...data.recommendationHistory, ...recommendationSnapshots.filter((snapshot) => !data.recommendationHistory.some((existing) => existing.recommendationId === snapshot.recommendationId))] }, true, { invalidateAnalysis: false });
        }
      }

      function addSet(exerciseId, duplicate) {
        const action = duplicate ? "duplicate-set" : "add-set";
        const authorization = guardWorkoutMutation(action, { exerciseId });
        if (!authorization.allowed) return;
        const exercise = authorization.target.exercise;
        const targetExerciseId = exercise.id;
        const sets = setsForExercise(targetExerciseId);
        logWorkoutOverride(exercise, "setCount", sets.filter((set) => isWorkingSet(set, "score")).length, sets.filter((set) => isWorkingSet(set, "score")).length + 1, { action: duplicate ? "duplicate_set" : "add_set" });
        const sequenceIndex = sets.length ? Math.max(...sets.map(canonicalSetSequence)) + 1 : 0;
        const previous = duplicate ? sets[sets.length - 1] : undefined;
        commit({ ...data, sets: [...data.sets, createSet(targetExerciseId, sets.filter((set) => !setTypeSemantics(set).isWarmup).length + 1, { ...(previous || {}), sequenceIndex, sequence: sequenceIndex, completed: false, skipped: false, edited: false })] }, true, { invalidateAnalysis: authorization.target.authorizationMode === "history_edit", deferPersistence: authorization.target.authorizationMode !== "history_edit" });
      }

      function addWarmupSet(exerciseId) {
        const authorization = guardWorkoutMutation("add-warmup-set", { exerciseId });
        if (!authorization.allowed) return;
        const targetExerciseId = authorization.target.exercise.id;
        const sets = setsForExercise(targetExerciseId);
        const warmups = sets.filter((set) => setTypeSemantics(set).isWarmup);
        const sequenceIndex = warmups.length;
        const priorWarmup = warmups.at(-1);
        const shifted = data.sets.map((set) => set.exerciseId === targetExerciseId && canonicalSetSequence(set) >= sequenceIndex ? { ...set, sequenceIndex: canonicalSetSequence(set) + 1, sequence: canonicalSetSequence(set) + 1 } : set);
        const warmupSet = createSet(targetExerciseId, warmups.length + 1, { ...(priorWarmup || {}), sequenceIndex, sequence: sequenceIndex, setTypeIndex: warmups.length, completed: false, skipped: false, edited: false, isWarmup: true, setType: "warmup", countsTowardScore: false, countsTowardVolume: false, countsTowardProgression: false, rpe: 5 });
        const current = data.sets.find((set) => set.id === activeSetId);
        const nextWarmup = warmups.find((set) => !set.completed && !set.skipped) || warmupSet;
        const nextWarmupIndex = nextWarmup.id === warmupSet.id ? warmups.length : warmups.findIndex((set) => set.id === nextWarmup.id);
        const shouldActivateWarmup = !sets.some((set) => set.completed || set.skipped) && (!current || !setTypeSemantics(current).isWarmup);
        if (shouldActivateWarmup) setActiveSet(nextWarmup.id, "Warm-Up " + (nextWarmupIndex + 1) + " of " + (warmups.length + 1) + " is ready", false);
        commit({ ...data, sets: [...shifted, warmupSet] }, true, { invalidateAnalysis: authorization.target.authorizationMode === "history_edit", deferPersistence: authorization.target.authorizationMode !== "history_edit" });
      }

      function moveExercise(exerciseId, direction) {
        const session = activeSession();
        const exercises = activeExercises();
        const index = exercises.findIndex((exercise) => exercise.id === exerciseId);
        const nextIndex = index + Number(direction);
        if (!session || index < 0 || nextIndex < 0 || nextIndex >= exercises.length) return;
        const reordered = [...exercises];
        const [moved] = reordered.splice(index, 1);
        reordered.splice(nextIndex, 0, moved);
        const orderMap = new Map(reordered.map((exercise, order) => [exercise.id, order]));
        entityStructureRevision += 1;
        entityIndexCache = null;
        commit({ ...data, exercises: data.exercises.map((exercise) => exercise.sessionId === session.id ? { ...exercise, order: orderMap.get(exercise.id) ?? exercise.order } : exercise) }, true, { invalidateAnalysis: false, deferPersistence: true });
      }
