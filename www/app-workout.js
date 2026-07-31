
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
        const sourceCount = Number(prescriptionEngine?.evidence?.research?.manifest?.tables?.research_library?.record_count || 0);
        const sessionCount = data.sessions.filter((session) => isSessionSubmitted(session) || data.exercises.some((exercise) => exercise.sessionId === session.id)).length;
        const personalEvidenceCount = data.personalEvidencePackage ? 1 : 0;
        return `
          <div class="scrim sheet-backdrop" data-action="cancel-clear-data" role="presentation">
            <section class="sheet-card bottom-sheet dialog-sheet destructive-sheet clear-data-sheet" role="dialog" aria-modal="true" aria-labelledby="clear-data-title" data-sheet-content>
              <div><div class="section-kicker destructive-kicker">This cannot be undone</div><h2 id="clear-data-title">Clear All Local App Data?</h2><p>The scope below distinguishes records this action erases from material outside local app storage.</p></div>
              <div class="diff clear-data-diff">
                <div class="drow dhead"><span class="plan">Erased</span><span class="act">Outside local storage</span><span class="dlt">Scope</span></div>
                <div class="drow"><span class="plan"><span class="lbl">Workout records</span><span class="val">${sessionCount} session${sessionCount === 1 ? '' : 's'}, exercises, sets, notes and active timers</span></span><span class="act"><span class="lbl">Downloaded exports</span><span class="val">Files already saved outside this app are not deleted</span></span><span class="dlt"><span class="d none">local</span></span></div>
                <div class="drow"><span class="plan"><span class="lbl">Routines</span><span class="val">${data.templates.length} routine${data.templates.length === 1 ? '' : 's'}</span></span><span class="act"><span class="lbl">Public research database</span><span class="val">${sourceCount ? sourceCount + ' source records reload with the app' : 'Reloads with the app'}</span></span><span class="dlt"><span class="d none">public</span></span></div>
                <div class="drow"><span class="plan"><span class="lbl">Personal setup</span><span class="val">Settings, readiness baseline, imports${personalEvidenceCount ? ' and imported personal evidence' : ''}</span></span><span class="act"><span class="lbl">Remote workout copies</span><span class="val">Deleted first; write-only and not recoverable here</span></span><span class="dlt"><span class="d out">erased</span></span></div>
              </div>
              ${blockedMessage ? '<div class="callout bad" role="status"><b>Local clearing is paused</b><span>' + escapeHtml(blockedMessage) + '</span></div>' : ''}
              ${risk ? '<div class="callout warn"><b>Unsynchronized workout changes detected</b><span>This device contains ' + unsynced.workoutCount + ' unsynchronized workout' + (unsynced.workoutCount === 1 ? '' : 's') + ' and ' + unsynced.setChanges + ' unsaved set change' + (unsynced.setChanges === 1 ? '' : 's') + '. This is a cloud-queue and draft count, not a measure of backup coverage.</span>' + (unsynced.canSync ? '<button type="button" data-action="sync-before-clear">Sync now</button>' : '') + '</div>' : ''}
              <div class="callout bad"><b>Only an exported file can restore local records</b><span>Cloud copy has no read or restore endpoint. The app does not record when you last exported, so it cannot claim how much training is covered by a backup.</span></div>
              <div class="clear-data-scope"><strong>Remote deletion boundary</strong><span>Retained workout and notification records are deleted before local authorization is removed. The app stops while offline or cleanup is unresolved rather than orphaning server data.</span></div>
              <label class="toggle-line destructive-ack"><input type="checkbox" data-action="clear-data-ack" ${clearDataFlow.acknowledged ? 'checked' : ''} />I understand that unsynchronized data may be permanently deleted</label>
              <div class="typed"><label class="t-hint">Type <strong>CLEAR</strong> to continue<input class="t-box" type="text" value="${escapeHtml(clearDataFlow.phrase)}" data-action="clear-data-phrase" autocomplete="off" autocapitalize="characters" aria-label="Type CLEAR to confirm local data deletion" /></label></div>
              <div class="sheet-actions stacked">
                <button class="primary-action" type="button" data-action="cancel-clear-data">Keep My Data</button>
                <button type="button" data-action="export-before-clear">Export first</button>
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
        const domains = {
          sleepHours: { min: 0, max: 14, step: 0.25 },
          sleepQuality: { min: 1, max: 5, integer: true },
          hrv: { min: 0, integer: true },
          restingHr: { min: 0, integer: true },
          soreness: { min: 1, max: 5, integer: true },
          band: { min: 3, max: 20, integer: true }
        };
        const boundedPatch = Object.fromEntries(Object.entries(patch).map(([field, value]) => {
          const domain = domains[field];
          if (!domain) return [field, value];
          let numeric = Number(value);
          if (!Number.isFinite(numeric)) numeric = domain.min;
          numeric = Math.max(domain.min, Math.min(domain.max ?? Number.MAX_SAFE_INTEGER, numeric));
          if (domain.step) numeric = Math.round(numeric / domain.step) * domain.step;
          if (domain.integer) numeric = Math.round(numeric);
          return [field, String(numeric)];
        }));
        commit({ ...data, settings: { ...data.settings, readinessBaseline: { ...readinessBaseline(), ...boundedPatch } } }, shouldRender);
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
        if (missing.length) return showAppToast(`Complete exercise details: ${missing.join(", ")}.`);
        const profiledExercise = {
          ...exercise,
          customExerciseProfile: profile,
          primaryMuscle: appMuscleFromPrescriptionGroup(profile.primaryMuscleGroupId),
          secondaryMuscle: profile.secondaryMuscleGroupId ? appMuscleFromPrescriptionGroup(profile.secondaryMuscleGroupId) : "",
          resistanceType: profile.resistanceType,
          isBodyweight: isBodyweightResistance(profile.resistanceType)
        };
        commit({
          ...data,
          exercises: data.exercises.map((item) => item.id === exerciseId ? profiledExercise : item),
          sets: data.sets.map((set) => set.exerciseId === exerciseId && !set.completed
            ? { ...set, resistanceType: profile.resistanceType }
            : set)
        }, true, { invalidateAnalysis: false, deferPersistence: true });
        showAppToast("Custom exercise details saved. Log the work you actually perform.");
      }

      function readExerciseDefaultPlan(exercise, form) {
        const read = (field) => form.querySelector(`[data-default-field="${field}"]`)?.value ?? "";
        const workingSetCount = Number(read("sets"));
        const repMin = Number(read("rep-min"));
        const repMax = Number(read("rep-max"));
        const targetRpeMin = Number(read("target-rpe-min"));
        const targetRpeMax = Number(read("target-rpe-max"));
        const workingRestSeconds = Number(read("working-rest"));
        const warmupRestSeconds = Number(read("warmup-rest"));
        if (!Number.isInteger(workingSetCount) || workingSetCount < 1 || workingSetCount > 20) throw new Error("Choose between 1 and 20 working sets.");
        if (!Number.isInteger(repMin) || !Number.isInteger(repMax) || repMin < 1 || repMax > 50 || repMin > repMax) throw new Error("Choose an ordered rep range from 1 to 50.");
        if (!Number.isFinite(targetRpeMin) || !Number.isFinite(targetRpeMax) || targetRpeMin < 1 || targetRpeMax > 10 || targetRpeMin > targetRpeMax || !Number.isInteger(targetRpeMin * 2) || !Number.isInteger(targetRpeMax * 2)) throw new Error("Choose an ordered target RPE range from 1 to 10 in 0.5 steps.");
        if (!Number.isInteger(workingRestSeconds) || workingRestSeconds < 15 || workingRestSeconds > 900) throw new Error("Choose working-set rest from 15 to 900 seconds.");
        if (!Number.isInteger(warmupRestSeconds) || warmupRestSeconds < 15 || warmupRestSeconds > 900) throw new Error("Choose warm-up rest from 15 to 900 seconds.");

        const individualized = form.querySelector("[data-individual-set-enabled]")?.value === "true";
        const existingSets = setsForExercise(exercise.id);
        const existingWarmups = existingSets.filter((set) => setTypeSemantics(set).isWarmup);
        const existingWorking = existingSets.filter((set) => isWorkingSet(set, "progression"));
        const existingFor = (scope, index) => (scope === "warmup" ? existingWarmups : existingWorking)[index] || null;
        const readRows = (scope, count) => {
          const rows = Array.from(form.querySelectorAll(`[data-set-default-row][data-set-scope="${scope}"]`)).slice(0, count);
          if (rows.length !== count) throw new Error("The individual set plan is incomplete. Close and reopen Exercise options, then try again.");
          return rows.map((row, index) => {
            const existing = existingFor(scope, index);
            const type = scope === "warmup" ? "warmup" : normalizeSetTypeCode(row.querySelector('[data-set-default-field="type"]')?.value || existing?.setType || "straight");
            const rowRepMin = Number(row.querySelector('[data-set-default-field="rep-min"]')?.value);
            const rowRepMax = Number(row.querySelector('[data-set-default-field="rep-max"]')?.value);
            const rowTargetRpeMin = Number(row.querySelector('[data-set-default-field="target-rpe-min"]')?.value);
            const rowTargetRpeMax = Number(row.querySelector('[data-set-default-field="target-rpe-max"]')?.value);
            const restSeconds = Number(row.querySelector('[data-set-default-field="rest"]')?.value);
            if (!Number.isInteger(rowRepMin) || !Number.isInteger(rowRepMax) || rowRepMin < 1 || rowRepMax > 50 || rowRepMin > rowRepMax) throw new Error(`${scope === "warmup" ? "Warm-up" : "Working"} set ${index + 1} needs an ordered rep range from 1 to 50.`);
            if (!Number.isFinite(rowTargetRpeMin) || !Number.isFinite(rowTargetRpeMax) || rowTargetRpeMin < 1 || rowTargetRpeMax > 10 || rowTargetRpeMin > rowTargetRpeMax || !Number.isInteger(rowTargetRpeMin * 2) || !Number.isInteger(rowTargetRpeMax * 2)) throw new Error(`${scope === "warmup" ? "Warm-up" : "Working"} set ${index + 1} needs an ordered target RPE range from 1 to 10 in 0.5 steps.`);
            if (!Number.isInteger(restSeconds) || restSeconds < 15 || restSeconds > 900) throw new Error(`${scope === "warmup" ? "Warm-up" : "Working"} set ${index + 1} needs rest from 15 to 900 seconds.`);
            return { type, repMin: rowRepMin, repMax: rowRepMax, targetRpe: rowTargetRpeMax, targetRpeMin: rowTargetRpeMin, targetRpeMax: rowTargetRpeMax, restSeconds, existing };
          });
        };
        const warmups = individualized
          ? readRows("warmup", existingWarmups.length)
          : existingWarmups.map((existing) => ({
              type: "warmup",
              repMin: Number(existing.targetRepMin || existing.targetReps || existing.reps || repMin),
              repMax: Number(existing.targetRepMax || existing.targetReps || existing.reps || repMax),
              targetRpe: Number(existing.targetRpeMax ?? existing.targetRpe ?? existing.rpe ?? Math.min(targetRpeMax, 6)),
              targetRpeMin: Number(existing.targetRpeMin ?? Math.max(1, Number(existing.targetRpeMax ?? existing.targetRpe ?? existing.rpe ?? Math.min(targetRpeMax, 6)) - 1)),
              targetRpeMax: Number(existing.targetRpeMax ?? existing.targetRpe ?? existing.rpe ?? Math.min(targetRpeMax, 6)),
              restSeconds: warmupRestSeconds,
              existing
            }));
        const working = individualized
          ? readRows("working", workingSetCount)
          : Array.from({ length: workingSetCount }, (_, index) => ({
              type: "straight",
              repMin,
              repMax,
              targetRpe: targetRpeMax,
              targetRpeMin,
              targetRpeMax,
              restSeconds: workingRestSeconds,
              existing: existingWorking[index] || null
            }));
        return {
          individualized,
          workingSetCount,
          repMin,
          repMax,
          targetRpe: targetRpeMax,
          targetRpeMin,
          targetRpeMax,
          workingRestSeconds,
          warmupRestSeconds,
          warmups,
          working: working.map((target, index) => ({
            ...target,
            sourceTargetId: `user-default-${exercise.id}-${index + 1}`
          }))
        };
      }

      function applyExerciseDefaultTargets(exerciseId, form, options = {}) {
        const exercise = exerciseById(exerciseId);
        const session = exercise ? sessionById(exercise.sessionId) : null;
        if (!exercise || !form || !session || exercise.sessionId !== activeWorkoutId || isSessionSubmitted(session)) return;
        let plan;
        try {
          plan = readExerciseDefaultPlan(exercise, form);
        } catch (error) {
          showAppToast(error?.message || "The exercise defaults could not be applied.");
          return;
        }

        const allSets = setsForExercise(exercise.id);
        const warmups = allSets.filter((set) => setTypeSemantics(set).isWarmup);
        const completedWorking = allSets.filter((set) => isWorkingSet(set, "progression") && set.completed);
        const incompleteWorking = allSets.filter((set) => isWorkingSet(set, "progression") && !set.completed);
        const updateTarget = (existing, target, sequenceIndex, setNumber, setTypeIndex) => {
          const midpoint = Math.round((target.repMin + target.repMax) / 2);
          const base = existing || createSet(exercise.id, setNumber, target.existing || {});
          return {
            ...base,
            setNumber,
            sequenceIndex,
            sequence: sequenceIndex,
            setTypeIndex,
            sourceTemplateSetId: target.sourceTargetId || base.sourceTemplateSetId,
            setType: target.type,
            isWarmup: target.type === "warmup",
            countsTowardScore: target.type !== "warmup",
            countsTowardVolume: target.type !== "warmup",
            countsTowardProgression: target.type !== "warmup",
            reps: midpoint,
            rpe: target.targetRpeMax,
            targetReps: midpoint,
            targetRepMin: target.repMin,
            targetRepMax: target.repMax,
            targetRpe: target.targetRpeMax,
            targetRpeMin: target.targetRpeMin,
            targetRpeMax: target.targetRpeMax,
            targetRestSeconds: target.restSeconds,
            manualOverride: true,
            edited: true,
            completed: false,
            skipped: false
          };
        };

        const nextWarmups = warmups.map((set, index) => set.completed
          ? set
          : updateTarget(set, plan.warmups[index], index, index + 1, index));
        const desiredIncompletePlan = plan.working.slice(Math.min(completedWorking.length, plan.working.length));
        const nextIncomplete = desiredIncompletePlan.map((target, index) => {
          const priorOfType = plan.working.slice(0, completedWorking.length + index).filter((item) => item.type === target.type).length;
          return updateTarget(
            incompleteWorking[index] || null,
            target,
            warmups.length + completedWorking.length + index,
            completedWorking.length + index + 1,
            priorOfType
          );
        });
        const replacedSetIds = new Set([...warmups.filter((set) => !set.completed), ...incompleteWorking].map((set) => set.id));
        const workingTypes = plan.working.map((target, index) => normalizeTargetSetType({
          id: target.sourceTargetId || `user-default-${exercise.id}-${index + 1}`,
          type: target.type,
          setCount: 1,
          repMin: target.repMin,
          repMax: target.repMax,
          rpeMin: target.targetRpeMin,
          rpeMax: target.targetRpeMax,
          restSeconds: target.restSeconds,
          loadReductionMin: target.type === "drop" ? 20 : target.type === "backoff" ? 8 : 0,
          loadReductionMax: target.type === "drop" ? 25 : target.type === "backoff" ? 15 : 0,
          countsTowardScore: true,
          countsTowardVolume: true
        }));
        const now = isoNow();
        const previousPlan = allSets.map((set) => ({
          type: normalizeSetTypeCode(set.setType, set.isWarmup),
          repMin: Number(set.targetRepMin || set.targetReps || set.reps || 0),
          repMax: Number(set.targetRepMax || set.targetReps || set.reps || 0),
          targetRpe: Number(set.targetRpeMax ?? set.targetRpe ?? set.rpe ?? 0),
          targetRpeMin: Number(set.targetRpeMin ?? Math.max(1, Number(set.targetRpeMax ?? set.targetRpe ?? set.rpe ?? 0) - 1)),
          targetRpeMax: Number(set.targetRpeMax ?? set.targetRpe ?? set.rpe ?? 0),
          restSeconds: Number(set.targetRestSeconds || exercise.restSeconds || 0)
        }));
        const nextPlan = [...plan.warmups, ...plan.working].map((target) => ({ type: target.type, repMin: target.repMin, repMax: target.repMax, targetRpe: target.targetRpeMax, targetRpeMin: target.targetRpeMin, targetRpeMax: target.targetRpeMax, restSeconds: target.restSeconds }));
        const overrideEntry = {
          overrideId: id(),
          sessionId: exercise.sessionId,
          workoutId: exercise.sessionId,
          exerciseRuntimeId: exercise.id,
          exerciseId: exercise.performanceExerciseId || exercise.researchExerciseId || canonicalExerciseId(exercise.name),
          field: "exerciseDefaults",
          from: previousPlan,
          to: nextPlan,
          createdAt: now,
          actor: "user",
          reason: "User-saved exercise defaults",
          lockedForWorkout: true,
          changes: { setPlan: { from: previousPlan, to: nextPlan } },
          action: "exercise_default_targets"
        };
        const aggregateRepMin = Math.min(...plan.working.map((target) => target.repMin));
        const aggregateRepMax = Math.max(...plan.working.map((target) => target.repMax));
        const nextExercise = {
          ...exercise,
          restSeconds: plan.workingRestSeconds,
          manualOverrides: [...(exercise.manualOverrides || []), overrideEntry],
          overrideLocked: true
        };

        const sourceTemplate = options.saveTemplateStandard && session?.templateId ? data.templates.find((item) => item.id === session.templateId) : null;
        const sourceTemplateExercise = sourceTemplate?.exercises?.find((item) => exerciseMatches(item.name, exercise.name)) || null;
        const templateWarmups = plan.warmups.map((target, index) => ({
          ...(sourceTemplateExercise?.warmups?.[index] || {}),
          reps: Math.round((target.repMin + target.repMax) / 2),
          targetRepMin: target.repMin,
          targetRepMax: target.repMax,
          targetRpe: target.targetRpeMax,
          targetRpeMin: target.targetRpeMin,
          targetRpeMax: target.targetRpeMax,
          targetRestSeconds: target.restSeconds
        }));
        const templates = sourceTemplateExercise
          ? data.templates.map((template) => template.id === sourceTemplate.id ? {
              ...template,
              updatedAt: now,
              exercises: template.exercises.map((item) => item.id === sourceTemplateExercise.id ? {
                ...item,
                sets: plan.working.length,
                reps: Math.round((aggregateRepMin + aggregateRepMax) / 2),
                repMin: aggregateRepMin,
                repMax: aggregateRepMax,
                targetRpe: plan.targetRpeMax,
                restSeconds: plan.workingRestSeconds,
                setTypes: workingTypes,
                warmups: templateWarmups
              } : item)
            } : template)
          : data.templates;
        commit({
          ...data,
          sessions: data.sessions.map((item) => item.id === session.id ? { ...item, updatedAt: now } : item),
          exercises: data.exercises.map((item) => item.id === exercise.id ? nextExercise : item),
          sets: [...data.sets.filter((set) => !replacedSetIds.has(set.id)), ...nextWarmups.filter((set) => !set.completed), ...nextIncomplete],
          templates,
          manualOverrides: [...data.manualOverrides, overrideEntry]
        }, true, { invalidateAnalysis: false, deferPersistence: true });
        showAppToast(sourceTemplateExercise ? "Exercise defaults applied and saved to the template." : "Exercise defaults applied to unfinished sets.");
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
        const identity = typeof exerciseIdentityFields === "function" ? exerciseIdentityFields({ name }) : {};
        if (!shouldRender) {
          patchTemplateExercise(templateId, exerciseId, { name, ...identity }, false);
          return;
        }
        const previousAutoRest = recommendedRestSeconds(exercise.name, { reps: exercise.reps });
        const restSeconds = !exercise.restSeconds || Number(exercise.restSeconds) === previousAutoRest
          ? recommendedRestSeconds(name, { reps: exercise.reps })
          : exercise.restSeconds;
        patchTemplateExercise(templateId, exerciseId, { name, restSeconds, ...identity }, shouldRender);
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
        showAppToast("Set type updated. Analysis and template history will use the correction.", { severity: "success", action: "undo-set-type-override", actionLabel: "Undo", setId });
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
          sessionId: exercise.sessionId,
          workoutId: exercise.sessionId,
          exerciseRuntimeId: exercise.id,
          exerciseId: exercise.performanceExerciseId || exercise.researchExerciseId || canonicalExerciseId(exercise.name),
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

      function completedSetReconcileState(set, exercise) {
        if (!set || !exercise || setTypeSemantics(set).isWarmup) return null;
        const remainingSets = setsForExercise(exercise.id).filter((item) =>
          item.id !== set.id && isWorkingSet(item, "score") && !item.completed && !item.skipped
        );
        if (!remainingSets.length) return null;
        const fields = [];
        const resistanceType = resistanceTypeFor(exercise, set);
        const targetWeight = Number(set.targetWeight ?? 0);
        const actualWeight = resistanceLoad(set, resistanceType);
        const increment = Number(exercise.prescription?.increment || progressionProfileForExercise(exercise.name).increment || 0);
        if (resistanceType !== "bodyweight" && targetWeight > 0 && Math.abs(actualWeight - targetWeight) > Math.max(increment, targetWeight * 0.03)) fields.push("load");
        const targetRepMin = Number(set.targetRepMin || set.targetReps || 0);
        const targetRepMax = Number(set.targetRepMax || set.targetReps || 0);
        if (targetRepMin > 0 && targetRepMax > 0 && (Number(set.reps || 0) < targetRepMin || Number(set.reps || 0) > targetRepMax)) fields.push("reps");
        const targetRpe = Number(set.targetRpe || set.targetRpeMax || set.targetRpeMin || 0);
        if (targetRpe > 0 && Number(set.rpe || 0) > 0 && Math.abs(Number(set.rpe) - targetRpe) > 1) fields.push("rpe");
        return fields.length ? { setId: set.id, fields, remainingSetCount: remainingSets.length } : null;
      }

      function reconcileCompletedSet(exerciseId, applyToRemaining) {
        const exercise = exerciseById(exerciseId);
        const pending = exercise?.pendingReconcile;
        const sourceSet = pending ? setById(pending.setId) : null;
        if (!exercise || !pending || !sourceSet) return;
        if (!applyToRemaining) {
          patchSet(sourceSet.id, { deviationIntent: "one_off" }, false);
          patchExercise(exercise.id, { pendingReconcile: null }, false);
          syncReconcilePromptDom(exercise.id);
          showAppToast("Logged as a deliberate one-off. Remaining targets were not changed.");
          return;
        }
        const fields = new Set(pending.fields || []);
        const resistanceType = resistanceTypeFor(exercise, sourceSet);
        const sourceSetPatch = { deviationIntent: "accepted" };
        const targetPatch = {};
        if (fields.has("load")) {
          const load = resistanceLoad(sourceSet, resistanceType);
          sourceSetPatch.targetWeight = load;
          targetPatch.targetWeight = load;
        }
        if (fields.has("reps")) {
          const reps = Number(sourceSet.reps || 0);
          sourceSetPatch.targetReps = reps;
          sourceSetPatch.targetRepMin = reps;
          sourceSetPatch.targetRepMax = reps;
          targetPatch.targetReps = reps;
          targetPatch.targetRepMin = reps;
          targetPatch.targetRepMax = reps;
        }
        if (fields.has("rpe")) {
          const rpe = Number(sourceSet.rpe || 0);
          sourceSetPatch.targetRpe = rpe;
          sourceSetPatch.targetRpeMin = rpe;
          sourceSetPatch.targetRpeMax = rpe;
          targetPatch.targetRpe = rpe;
          targetPatch.targetRpeMin = rpe;
          targetPatch.targetRpeMax = rpe;
        }
        const remainingSets = setsForExercise(exercise.id).filter((set) =>
          set.id !== sourceSet.id && isWorkingSet(set, "score") && !set.completed && !set.skipped
        );
        const beforeTargets = remainingSets.map((set) => ({
          setId: set.id,
          targetWeight: Number(set.targetWeight || 0),
          targetRepMin: Number(set.targetRepMin || set.targetReps || 0),
          targetRepMax: Number(set.targetRepMax || set.targetReps || 0),
          targetRpeMin: Number(set.targetRpeMin ?? set.targetRpe ?? 0),
          targetRpeMax: Number(set.targetRpeMax ?? set.targetRpe ?? 0)
        }));
        const afterTargets = remainingSets.map((set) => ({ setId: set.id, ...targetPatch }));
        logWorkoutOverride(exercise, "remainingSetTargets", beforeTargets, afterTargets, {
          setId: sourceSet.id,
          reason: "Apply completed set values to remaining targets"
        });
        const remainingIds = new Set(remainingSets.map((set) => set.id));
        const sets = data.sets.map((set) => {
          if (set.id === sourceSet.id) return { ...set, ...sourceSetPatch, manualOverride: true };
          if (!remainingIds.has(set.id)) return set;
          const inputPatch = {};
          if (!set.edited) {
            if (fields.has("load")) {
              const load = resistanceLoad(sourceSet, resistanceType);
              inputPatch.weight = load;
              if (resistanceType === "bodyweight_plus_load") inputPatch.addedLoad = load;
              if (resistanceType === "assisted_bodyweight") inputPatch.assistanceLoad = load;
            }
            if (fields.has("reps")) inputPatch.reps = Number(sourceSet.reps || 0);
            if (fields.has("rpe")) inputPatch.rpe = Number(sourceSet.rpe || 0);
          }
          return { ...set, ...targetPatch, ...inputPatch, manualOverride: true };
        });
        commit({
          ...data,
          exercises: data.exercises.map((item) => item.id === exercise.id ? { ...item, pendingReconcile: null } : item),
          sets
        }, true, { invalidateAnalysis: false, deferPersistence: true });
        showAppToast("Remaining set targets updated from the completed set.");
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
        const pendingReconcile = completedSetReconcileState(set, exercise);
        patchSet(set.id, { completed: true, skipped: false }, false);
        if (pendingReconcile) patchExercise(exercise.id, { pendingReconcile }, false);
        applyCompletedSetVisual(set.id);
        if (pendingReconcile) syncReconcilePromptDom(exercise.id);
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
        const repMins = workSets.map((set) => Number(set.targetRepMin || set.targetReps || set.reps || 0)).filter((value) => value > 0);
        const repMaxes = workSets.map((set) => Number(set.targetRepMax || set.targetReps || set.reps || 0)).filter((value) => value > 0);
        patchTemplateExercise(template.id, templateExercise.id, {
          sets: workSets.length,
          reps: representative.reps,
          repMin: repMins.length ? Math.min(...repMins) : representative.reps,
          repMax: repMaxes.length ? Math.max(...repMaxes) : representative.reps,
          targetRpe: Number(representative.targetRpe ?? representative.targetRpeMax) || Number(representative.rpe) || Number(templateExercise.targetRpe) || 8,
          restSeconds: exercise.restSeconds,
          setTypes: templateSetTypesFromHistory(workSets, exercise.restSeconds),
          warmups: setsForExercise(exercise.id).filter((set) => setTypeSemantics(set).isWarmup).map((set) => ({ reps: set.reps, targetRepMin: set.targetRepMin, targetRepMax: set.targetRepMax, targetRpe: set.targetRpe, targetRpeMin: set.targetRpeMin, targetRpeMax: set.targetRpeMax, targetRestSeconds: set.targetRestSeconds, weight: set.weight, weightUnit: set.weightUnit, resistanceType: set.resistanceType, isBodyweight: set.isBodyweight, addedLoad: set.addedLoad, assistanceLoad: set.assistanceLoad, rpe: set.rpe })),
          ...(exercise.customExerciseProfile ? { customExerciseProfile: normalizeCustomExerciseProfile(exercise.customExerciseProfile) } : {})
        });
        activeSetNotice = "Template updated from today’s targets";
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
        const exercise = {
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
        const initialSets = [createSet(exercise.id, 1, { resistanceType })];
        addExerciseDraft = "";
        addExercisePrimaryMuscle = "";
        addExerciseSecondaryMuscle = "";
        if (!historyCorrection) {
          activeWorkoutId = session.id;
          session.workoutStarted = true;
          session.workoutState = "active";
          if (!session.startedAt) session.startedAt = isoNow();
        }
        commit({ ...data, sessions: data.sessions.map((item) => item.id === session.id ? { ...session, updatedAt: isoNow() } : item), exercises: [...data.exercises, exercise], sets: [...data.sets, ...initialSets] }, true, { invalidateAnalysis: historyCorrection, deferPersistence: !historyCorrection });
      }

      function addTemplate() {
        const template = { id: id(), name: "New Template", notes: "", exercises: [normalizeStableTemplateExercise({ id: id(), name: "Exercise", sets: 3, reps: 8, repMin: 8, repMax: 8, targetRpe: 8, increment: progressionProfileForExercise("Exercise").increment, restSeconds: recommendedRestSeconds("Exercise"), resistanceType: "external", isBodyweight: false, warmups: [] })], createdAt: isoNow(), updatedAt: isoNow() };
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
            ? {
                ...template,
                exercises: template.exercises.map((exercise) => {
                  if (exercise.id !== exerciseId) return exercise;
                  const merged = { ...exercise, ...patch };
                  const stableFieldsChanged = ["sets", "repMin", "repMax", "targetRpe", "restSeconds"].some((field) => Object.prototype.hasOwnProperty.call(patch, field));
                  if (!stableFieldsChanged || Object.prototype.hasOwnProperty.call(patch, "setTypes")) return normalizeStableTemplateExercise(merged);
                  let setTypes = (Array.isArray(exercise.setTypes) && exercise.setTypes.length ? exercise.setTypes : normalizeStableTemplateExercise(exercise).setTypes)
                    .filter((type) => type.countsTowardScore !== false && !type.isWarmup)
                    .map((type) => ({ ...type }));
                  if (Object.prototype.hasOwnProperty.call(patch, "sets")) {
                    const desiredCount = Math.max(1, Number(patch.sets));
                    setTypes = setTypes.slice(0, desiredCount);
                    let remaining = desiredCount;
                    setTypes = setTypes.map((type, index) => {
                      const remainingRoles = setTypes.length - index - 1;
                      const setCount = index === setTypes.length - 1
                        ? remaining
                        : Math.max(1, Math.min(Number(type.setCount || 1), remaining - remainingRoles));
                      remaining -= setCount;
                      return { ...type, setCount };
                    });
                  }
                  setTypes = setTypes.map((type) => ({
                    ...type,
                    ...(Object.prototype.hasOwnProperty.call(patch, "repMin") ? { repMin: Number(patch.repMin) } : {}),
                    ...(Object.prototype.hasOwnProperty.call(patch, "repMax") ? { repMax: Number(patch.repMax) } : {}),
                    ...(Object.prototype.hasOwnProperty.call(patch, "targetRpe") ? { rpeMin: Math.max(1, Number(patch.targetRpe) - 1), rpeMax: Number(patch.targetRpe) } : {}),
                    ...(Object.prototype.hasOwnProperty.call(patch, "restSeconds") ? { restSeconds: Number(patch.restSeconds) } : {})
                  }));
                  return normalizeStableTemplateExercise({ ...merged, setTypes });
                }),
                updatedAt: isoNow()
              }
            : template)
        }, shouldRender);
      }

      function addTemplateExercise(templateId) {
        commit({
          ...data,
          templates: data.templates.map((template) => template.id === templateId
              ? { ...template, exercises: [...template.exercises, normalizeStableTemplateExercise({ id: id(), name: "Exercise", sets: 3, reps: 8, repMin: 8, repMax: 8, targetRpe: 8, increment: progressionProfileForExercise("Exercise").increment, restSeconds: recommendedRestSeconds("Exercise"), resistanceType: "external", isBodyweight: false, warmups: [] })], updatedAt: isoNow() }
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

      function stableSetTypesForWorkoutStart(templateExercise, target) {
        const sourceTypes = (templateExercise.setTypes || [])
          .filter((type) => type.countsTowardScore !== false && !type.isWarmup)
          .map((type) => ({ ...type, type: normalizeSetTypeCode(type.type || type.setType) }));
        const fallback = {
          id: `${templateExercise.id || "exercise"}-stable-1`,
          type: "straight",
          setCount: Math.max(1, Number(templateExercise.sets || 1)),
          repMin: Math.max(1, Number(templateExercise.repMin || templateExercise.reps || 1)),
          repMax: Math.max(1, Number(templateExercise.repMax || templateExercise.reps || 1)),
          rpeMin: Math.max(1, Number(templateExercise.targetRpe || 8) - 1),
          rpeMax: Math.max(1, Number(templateExercise.targetRpe || 8)),
          restSeconds: Math.max(0, Number(templateExercise.restSeconds || data.settings.defaultRestSeconds || 90)),
          countsTowardScore: true,
          countsTowardVolume: true
        };
        const stableTypes = sourceTypes.length ? sourceTypes : [fallback];
        const stableCount = stableTypes.reduce((sum, type) => sum + Math.max(1, Number(type.setCount || 1)), 0);
        const temporaryException = target.adjusted === true || target.isDeload === true || target.safetyAdjustment === true;
        let remaining = temporaryException
          ? Math.min(stableCount, Math.max(1, Number(target.sets || stableCount)))
          : stableCount;
        const rpeCeiling = temporaryException && Number(target.rpe || 0) > 0 ? Number(target.rpe) : 0;
        return stableTypes.map((type) => {
          const setCount = Math.min(remaining, Math.max(1, Number(type.setCount || 1)));
          remaining -= setCount;
          const stableRpeMax = Math.max(1, Number(type.rpeMax || templateExercise.targetRpe || 8));
          const stableRpeMin = Math.max(1, Number(type.rpeMin || stableRpeMax - 1));
          const rpeMax = rpeCeiling ? Math.min(stableRpeMax, rpeCeiling) : stableRpeMax;
          return {
            ...type,
            setCount,
            repMin: Math.max(1, Number(type.repMin || templateExercise.repMin || templateExercise.reps || 1)),
            repMax: Math.max(1, Number(type.repMax || templateExercise.repMax || templateExercise.reps || 1)),
            rpeMin: rpeCeiling ? Math.min(stableRpeMin, Math.max(1, rpeCeiling - 1)) : stableRpeMin,
            rpeMax,
            restSeconds: Math.max(0, Number(type.restSeconds || templateExercise.restSeconds || data.settings.defaultRestSeconds || 90)),
            countsTowardScore: true,
            countsTowardVolume: true
          };
        }).filter((type) => type.setCount > 0);
      }

      function factualSetPrefillForWorkoutStart(templateExercise, target, setType, setTypeIndex, sequenceIndex, previousSets) {
        const role = normalizeSetTypeCode(setType.type || setType.setType);
        const sameRole = (previousSets || []).filter((set) => normalizeSetTypeCode(set.setType, set.isWarmup) === role);
        const previousComparableSet = sameRole.find((set) => Number(set.setTypeIndex || 0) === Number(setTypeIndex || 0))
          || sameRole[Number(setTypeIndex || 0)]
          || null;
        const resistanceType = target.resistanceType || templateExercise.resistanceType || "external";
        const routineLoad = Number(setType.defaultLoad ?? setType.targetLoad ?? templateExercise.defaultLoad ?? templateExercise.targetLoad ?? templateExercise.weight ?? 0);
        const priorLoad = previousComparableSet ? resistanceLoad(previousComparableSet, resistanceType) : 0;
        const factualLoad = previousComparableSet ? priorLoad : routineLoad;
        const reductionPercent = target.adjusted ? Math.max(0, Math.min(100, Number(target.loadReductionPercent || 0))) : 0;
        const weight = factualLoad > 0 && reductionPercent > 0
          ? roundToIncrement(
              factualLoad * (resistanceType === "assisted_bodyweight" ? 1 + reductionPercent / 100 : 1 - reductionPercent / 100),
              Number(setType.increment || templateExercise.increment || 1)
            )
          : factualLoad;
        const routineReps = Number(setType.defaultReps ?? templateExercise.defaultReps ?? templateExercise.reps ?? 0);
        const reps = Number(previousComparableSet?.reps || 0) || routineReps || "";
        const stableRpeMax = Math.max(1, Number(setType.rpeMax || templateExercise.targetRpe || 8));
        const stableRpeMin = Math.max(1, Number(setType.rpeMin || stableRpeMax - 1));
        const priorRpe = Number(previousComparableSet?.rpe || 0);
        const routineRpe = Number(setType.defaultRpe ?? templateExercise.defaultRpe ?? templateExercise.targetRpe ?? 0);
        const factualRpe = priorRpe || routineRpe || "";
        const rpe = target.adjusted && Number(target.rpe || 0) > 0 && Number(factualRpe || 0) > 0
          ? Math.min(Number(factualRpe), Number(target.rpe))
          : factualRpe;
        return {
          sequenceIndex,
          setTypeIndex,
          setType: role,
          weight,
          reps,
          rpe,
          repMin: Math.max(1, Number(setType.repMin || templateExercise.repMin || templateExercise.reps || 1)),
          repMax: Math.max(1, Number(setType.repMax || templateExercise.repMax || templateExercise.reps || 1)),
          rpeMin: Math.max(1, Number(setType.rpeMin || stableRpeMin)),
          rpeMax: Math.max(1, Number(setType.rpeMax || stableRpeMax)),
          restSeconds: Math.max(0, Number(setType.restSeconds || templateExercise.restSeconds || data.settings.defaultRestSeconds || 90)),
          previousComparableSet
        };
      }

      function startTemplate(templateId, recovery = defaultRecovery(), readinessMode = "usual", options = {}) {
        const template = data.templates.find((item) => item.id === templateId);
        if (!template) return;
        if (!Array.isArray(template.exercises) || template.exercises.length === 0) {
          templateStartFlow = null;
          showAppToast("Add at least one exercise before starting this template.");
          render();
          return;
        }
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
        session.resolvedActions = measurePerformance("workoutStart:exceptionResolver", () => resolveWorkoutExceptions(session, recovery, {
          useOriginal: options.useOriginal === true,
          userContinuedWithAction: Boolean(recovery.illness || recovery.pain)
        }), { templateId: template.id, hasExplicitSafetyInput: Boolean(recovery.illness || recovery.pain) });
        const exercises = [];
        const sets = [];
        let adjustedLiftCount = 0;
        template.exercises.forEach((templateExercise, index) => {
          templateExercise = normalizeStableTemplateExercise(templateExercise);
          const templateResistanceType = templateExercise.resistanceType || inferResistanceType(templateExercise.name, templateExercise);
          const historyTarget = { ...stableTargetForTemplateExercise(templateExercise, { excludeSessionId: session.id, template, resistanceType: templateResistanceType, canonicalExerciseId: templateExercise.performanceExerciseId || canonicalExerciseId(templateExercise), workoutId: session.id }), resistanceType: templateResistanceType, isBodyweight: isBodyweightResistance(templateResistanceType) };
          if (!historyTarget.executionBlocked) {
            historyTarget.sets = Math.max(1, Number(historyTarget.sets || templateExercise.sets || 1));
            historyTarget.reps = Math.max(1, Number(historyTarget.reps || templateExercise.reps || 1));
            historyTarget.repLow = Math.max(1, Number(historyTarget.repLow || historyTarget.reps));
            historyTarget.repHigh = Math.max(historyTarget.repLow, Number(historyTarget.repHigh || historyTarget.reps));
          }
          historyTarget.restSeconds = Number(historyTarget.restSeconds || templateExercise.restSeconds || data.settings.defaultRestSeconds || 90);
          const exerciseVariantId = templateExercise.performanceExerciseId || canonicalExerciseId(templateExercise) || templateExercise.id;
          const resolvedAction = resolvedActionForVariant(session.resolvedActions, exerciseVariantId);
          const adjustedTarget = applyResolvedActionToStableTarget(historyTarget, resolvedAction);
          const target = { ...adjustedTarget, resistanceType: adjustedTarget.resistanceType || templateResistanceType, isBodyweight: isBodyweightResistance(adjustedTarget.resistanceType || templateResistanceType) };
          const resolvedResistanceType = target.resistanceType || templateResistanceType;
          if (target.adjusted) adjustedLiftCount += 1;
          const restSeconds = Number(templateExercise.restSeconds);
          const resolvedTypes = stableSetTypesForWorkoutStart(templateExercise, target);
          const exercise = { id: id(), sessionId: session.id, ...(template.source === "strong" ? { source: "strong-template" } : {}), name: templateExercise.name, ...(typeof exerciseIdentityFields === "function" ? exerciseIdentityFields(templateExercise) : {}), primaryMuscle: templateExercise.primaryMuscle || "", secondaryMuscle: templateExercise.secondaryMuscle || "", ...(templateExercise.customExerciseProfile ? { customExerciseProfile: normalizeCustomExerciseProfile(templateExercise.customExerciseProfile) } : {}), executionQualityAssessment: "not_assessed", notes: "", stableTargetSnapshot: { sets: historyTarget.sets, repLow: historyTarget.repLow, repHigh: historyTarget.repHigh, rpe: historyTarget.rpe, restSeconds: historyTarget.restSeconds }, resolvedActionId: resolvedAction?.decisionId || null, adjustmentReason: target.adjustmentReason || "", manualOverrides: [], order: index, restSeconds, resistanceType: target.resistanceType || templateResistanceType, isBodyweight: isBodyweightResistance(resolvedResistanceType), isDeload: Boolean(target.isDeload), executionBlocked: false, safetyRestriction: null };
          exercises.push(exercise);
          const configuredWarmups = target.executionBlocked ? [] : (templateExercise.warmups || []);
          configuredWarmups.forEach((warmup, warmupIndex) => {
            sets.push(createSet(exercise.id, warmupIndex + 1, { ...warmup, sequenceIndex: warmupIndex, sequence: warmupIndex, setTypeIndex: warmupIndex, sourceTemplateSetId: warmup.id || templateExercise.id + "-warmup-" + warmupIndex, resistanceType: target.resistanceType || templateResistanceType, completed: false, isWarmup: true, setType: "warmup", countsTowardScore: false, countsTowardVolume: false, countsTowardProgression: false }));
          });
          const previousRoleSets = getMostRecentWorkoutSets(templateExercise.name, {
            excludeSessionId: session.id,
            resistanceType: resolvedResistanceType,
            canonicalExerciseId: templateExercise.performanceExerciseId || canonicalExerciseId(templateExercise)
          });
          let setNumber = 0;
          const factualPrefills = [];
          resolvedTypes.forEach((setType) => {
            for (let typeSetIndex = 0; typeSetIndex < setType.setCount; typeSetIndex += 1) {
              setNumber += 1;
              factualPrefills.push(factualSetPrefillForWorkoutStart(templateExercise, target, setType, typeSetIndex, configuredWarmups.length + setNumber - 1, previousRoleSets));
            }
          });
          factualPrefills.forEach((prefill, prefillIndex) => {
            const setNumber = prefillIndex + 1;
            const setType = resolvedTypes.find((type) => normalizeSetTypeCode(type.type) === prefill.setType) || {};
            sets.push(createSet(exercise.id, setNumber, { sequenceIndex: prefill.sequenceIndex, sequence: prefill.sequenceIndex, setTypeIndex: prefill.setTypeIndex, sourceTemplateSetId: setType.id || templateExercise.id + "-" + prefill.setType + "-" + prefill.setTypeIndex, reps: prefill.reps, weight: prefill.weight, weightUnit: target.weightUnit, resistanceType: target.resistanceType || templateResistanceType, isBodyweight: isBodyweightResistance(resolvedResistanceType), addedLoad: target.resistanceType === "bodyweight_plus_load" ? prefill.weight : target.addedLoad, assistanceLoad: target.resistanceType === "assisted_bodyweight" ? prefill.weight : target.assistanceLoad, rpe: prefill.rpe, completed: false, isWarmup: false, setType: prefill.setType, countsTowardScore: setType.countsTowardScore !== false, countsTowardVolume: setType.countsTowardVolume !== false, targetReps: prefill.reps, targetRepMin: prefill.repMin, targetRepMax: prefill.repMax, targetWeight: prefill.weight, targetRpe: prefill.rpeMax, targetRpeMin: prefill.rpeMin, targetRpeMax: prefill.rpeMax, targetRpeTolerance: setType.rpeTolerance, targetRestSeconds: prefill.restSeconds, originalTargetReps: prefill.reps, originalTargetWeight: prefill.weight, originalTargetRpe: prefill.rpeMax, previousComparableSet: prefill.previousComparableSet }));
          });
        });
        session.adjustmentSummary = adjustedLiftCount ? adjustedLiftCount + " lift" + (adjustedLiftCount === 1 ? "" : "s") + " adjusted by the resolved exception action." : "";
        session.usedOriginalTargets = Boolean(options.useOriginal);
        delete session.readinessAdjustments;
        delete session.workoutPrescription;
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
            sets: [...data.sets.filter((set) => !oldExerciseIds.has(set.exerciseId)), ...sets]
          }, true, { invalidateAnalysis: false });
        } else {
          commit({ ...data, sessions: [session, ...data.sessions], exercises: [...data.exercises, ...exercises], sets: [...data.sets, ...sets] }, true, { invalidateAnalysis: false });
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
