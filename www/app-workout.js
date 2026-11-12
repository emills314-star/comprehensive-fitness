
      async function inspectUnsynchronizedData() {
        const draftSessions = data.sessions.filter((session) => !isSessionSubmitted(session) && data.exercises.some((exercise) => exercise.sessionId === session.id));
        const draftIds = new Set(draftSessions.map((session) => session.id));
        const draftExerciseIds = new Set(data.exercises.filter((exercise) => draftIds.has(exercise.sessionId)).map((exercise) => exercise.id));
        const unsavedSetChanges = data.sets.filter((set) => draftExerciseIds.has(set.exerciseId) && (set.edited || set.completed || Number(set.reps || 0) > 0 || Number(set.weight || 0) > 0)).length;
        return { workoutCount: draftSessions.length, setChanges: unsavedSetChanges };
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
        if (clearDataFlow?.pending) return false;
        clearDataFlow = null;
        restoreFocusAfterDialog("clear");
        render();
        return true;
      }

      function renderClearDataSheet() {
        if (!clearDataFlow?.open) return "";
        const unsynced = clearDataFlow.unsynced || { workoutCount: 0, setChanges: 0 };
        const pending = clearDataFlow.pending === true;
        const pendingMessage = pending ? clearDataFlow.pendingMessage || "Keep this tab open while local app data is cleared." : "";
        const remoteBlock = pending ? "" : localClearBlockReason();
        const blockedMessage = remoteBlock || clearDataFlow.blockedMessage || "";
        const unlocked = clearDataFlow.acknowledged && clearDataFlow.phrase === "CLEAR" && !blockedMessage && !pending;
        const risk = unsynced.workoutCount || unsynced.setChanges;
        const sessionCount = data.sessions.filter((session) => isSessionSubmitted(session) || data.exercises.some((exercise) => exercise.sessionId === session.id)).length;
        return `
          <div class="scrim sheet-backdrop" data-action="cancel-clear-data" role="presentation">
            <section class="sheet-card bottom-sheet dialog-sheet destructive-sheet clear-data-sheet" role="dialog" aria-modal="true" aria-labelledby="clear-data-title" data-sheet-content>
              <div><div class="section-kicker destructive-kicker">This cannot be undone</div><h2 id="clear-data-title">Clear All Local App Data?</h2><p>The scope below distinguishes records this action erases from material outside local app storage.</p></div>
              <div class="diff clear-data-diff">
                <div class="drow dhead"><span class="plan">Erased</span><span class="act">Outside local storage</span><span class="dlt">Scope</span></div>
                <div class="drow"><span class="plan"><span class="lbl">Workout records</span><span class="val">${sessionCount} session${sessionCount === 1 ? '' : 's'}, exercises, sets, notes and active timers</span></span><span class="act"><span class="lbl">Downloaded exports</span><span class="val">Files already saved outside this app are not deleted</span></span><span class="dlt"><span class="d none">local</span></span></div>
                <div class="drow"><span class="plan"><span class="lbl">Routines and setup</span><span class="val">${data.templates.length} routine${data.templates.length === 1 ? '' : 's'}, settings, readiness entries and imports</span></span><span class="act"><span class="lbl">Remote installation data</span><span class="val">Notification records and any legacy workout copies are deleted first</span></span><span class="dlt"><span class="d out">erased</span></span></div>
              </div>
              ${pendingMessage ? '<div class="callout warn" role="status"><b>Local clearing is still running</b><span>' + escapeHtml(pendingMessage) + '</span></div>' : ''}
              ${blockedMessage ? '<div class="callout bad" role="status"><b>Local clearing is paused</b><span>' + escapeHtml(blockedMessage) + '</span></div>' : ''}
              ${risk ? '<div class="callout warn"><b>Unexported workout changes detected</b><span>This device contains ' + unsynced.workoutCount + ' draft workout' + (unsynced.workoutCount === 1 ? '' : 's') + ' and ' + unsynced.setChanges + ' entered set change' + (unsynced.setChanges === 1 ? '' : 's') + '. Export before clearing if you need a recoverable copy.</span></div>' : ''}
              <div class="callout bad"><b>Only an exported file can restore local records</b><span>The app does not upload workout history and does not record when you last exported, so it cannot claim how much training is covered by a backup.</span></div>
              <div class="clear-data-scope"><strong>Remote deletion boundary</strong><span>Retained notification records and any legacy workout copies are deleted before local authorization is removed. The app stops while offline or cleanup is unresolved rather than orphaning server data.</span></div>
              <label class="toggle-line destructive-ack"><input type="checkbox" data-action="clear-data-ack" ${clearDataFlow.acknowledged ? 'checked' : ''} ${pending ? 'disabled' : ''} />I understand that unsynchronized data may be permanently deleted</label>
              <div class="typed"><label class="t-hint">Type <strong>CLEAR</strong> to continue<input class="t-box" type="text" value="${escapeHtml(clearDataFlow.phrase)}" data-action="clear-data-phrase" autocomplete="off" autocapitalize="characters" aria-label="Type CLEAR to confirm local data deletion" ${pending ? 'disabled' : ''} /></label></div>
              <div class="sheet-actions stacked">
                <button class="primary-action" type="button" data-action="cancel-clear-data" ${pending ? 'disabled' : ''}>Keep My Data</button>
                <button type="button" data-action="export-before-clear" ${pending ? 'disabled' : ''}>Export first</button>
                <button class="danger-button" type="button" data-action="confirm-clear-data" ${unlocked ? '' : 'disabled'}>Permanently Clear Local Data</button>
              </div>
            </section>
          </div>`;
      }

      function deleteFitnessDatabase({ onBlocked } = {}) {
        return new Promise((resolve, reject) => {
          try {
            const request = indexedDB.deleteDatabase(DB_NAME);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error || new Error("IndexedDB deletion failed."));
            // `blocked` is progress, not a terminal result. The same request
            // remains queued and can succeed after another tab closes its
            // connection, so keep this promise pending until success/error.
            request.onblocked = () => {
              try { onBlocked?.(); } catch { /* Status rendering must not settle the delete request. */ }
            };
          } catch (error) {
            reject(error);
          }
        });
      }

      function localClearBlockReason() {
        if (!pushIdentity?.token) return "";
        const deletionStatus = pushIdentity.deletion?.status || "";
        if (window.__cfRemoteDeletionInFlight || pushIdentity.status === "deleting" || deletionStatus === "deleting" || deletionStatus === "error" || pushIdentity.deletion?.retryable === true) return "Remote installation deletion is still in progress. Reconnect or reopen the app and wait for deletion to finish before clearing local data, so the cleanup authorization is not lost.";
        return "";
      }

      async function permanentlyClearLocalData() {
        if (!clearDataFlow?.acknowledged || clearDataFlow.phrase !== "CLEAR" || clearDataFlow.pending) return false;
        const remoteBlock = localClearBlockReason();
        if (remoteBlock) {
          clearDataFlow = { ...clearDataFlow, blockedMessage: remoteBlock };
          settingsMessage = remoteBlock;
          render();
          return false;
        }
        clearDataFlow = {
          ...clearDataFlow,
          pending: true,
          pendingMessage: "Keep this tab open while the app prepares the confirmed clear.",
          blockedMessage: ""
        };
        settingsMessage = "";
        render();
        const stopClear = (blockedMessage) => {
          clearDataFlow = {
            ...clearDataFlow,
            pending: false,
            pendingMessage: "",
            blockedMessage
          };
          settingsMessage = blockedMessage;
          render();
          return false;
        };
        if (pushIdentity?.token) {
          if (!navigator.onLine) {
            const blockedMessage = "Connect to the internet before clearing local data so retained server installation data can be deleted first.";
            return stopClear(blockedMessage);
          }
          let remoteDeletion = null;
          try {
            remoteDeletion = await deleteRemoteInstallationData({ scheduleRetry: false, automatic: true });
          } catch { /* The terminal status below keeps local authorization intact. */ }
          if (remoteDeletion?.status !== "deleted") {
            const blockedMessage = "Remote installation deletion is not confirmed yet. Keep the app open and retry before clearing local authorization.";
            return stopClear(blockedMessage);
          }
        }
        if (timer) {
          const previous = { ...timer };
          const cancellationConfirmed = await cancelRestPush(previous, "local-data-cleared");
          if (!cancellationConfirmed) {
            const blockedMessage = "The active rest notification could not be canceled yet. Reconnect and retry local clearing; its durable cancellation record and installation authorization were preserved.";
            return stopClear(blockedMessage);
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
        clearDataFlow = { ...clearDataFlow, pendingMessage: "Removing app-owned browser records." };
        render();
        const localStorageRemovals = [
          { key: STORAGE_KEY, remove: () => localStorage.removeItem(STORAGE_KEY) },
          { key: RUNTIME_KEY, remove: () => localStorage.removeItem(RUNTIME_KEY) },
          { key: ACTIVE_DRAFT_KEY, remove: () => localStorage.removeItem(ACTIVE_DRAFT_KEY) },
          { key: IDENTITY_KEY, remove: () => localStorage.removeItem(IDENTITY_KEY) }
        ];
        const confirmedRemovedLocalKeys = [];
        const remainingOrUnverifiedLocalKeys = [];
        for (const entry of localStorageRemovals) {
          let wasPresent = false;
          try { wasPresent = localStorage.getItem(entry.key) !== null; } catch { /* Verification below fails closed. */ }
          try { entry.remove(); } catch { /* Continue so every app-owned key gets an independent attempt. */ }
          let absent = false;
          try { absent = localStorage.getItem(entry.key) === null; } catch { /* An unreadable key is not verified absent. */ }
          if (!absent) remainingOrUnverifiedLocalKeys.push(entry.key);
          else if (wasPresent) confirmedRemovedLocalKeys.push(entry.key);
        }
        if (remainingOrUnverifiedLocalKeys.length) {
          const blockedMessage = confirmedRemovedLocalKeys.length
            ? `Local clearing is incomplete. ${confirmedRemovedLocalKeys.length} app-owned browser record${confirmedRemovedLocalKeys.length === 1 ? " was" : "s were"} removed, but ${remainingOrUnverifiedLocalKeys.length} could not be removed or verified. The workout database was kept so its records remain recoverable; keep this tab open and retry.`
            : `Local clearing could not safely continue because ${remainingOrUnverifiedLocalKeys.length} app-owned browser record${remainingOrUnverifiedLocalKeys.length === 1 ? " was" : "s were"} not removed or verified. The workout database was kept so its records remain recoverable; keep this tab open and retry.`;
          return stopClear(blockedMessage);
        }
        clearDataFlow = { ...clearDataFlow, pendingMessage: "Removing the local workout database." };
        render();
        try {
          await deleteFitnessDatabase({
            onBlocked: () => {
              if (!clearDataFlow?.pending) return;
              const pendingMessage = "Another Comprehensive Fitness tab still has the workout database open. Close the other tab and keep this one open; this confirmed clear remains queued and will continue automatically.";
              clearDataFlow = { ...clearDataFlow, pendingMessage };
              settingsMessage = pendingMessage;
              render();
            }
          });
        } catch {
          const localMutation = confirmedRemovedLocalKeys.length
            ? `${confirmedRemovedLocalKeys.length} app-owned browser record${confirmedRemovedLocalKeys.length === 1 ? " was" : "s were"} removed, but`
            : "No app-owned browser records remain, but";
          const blockedMessage = `Local clearing is incomplete. ${localMutation} the workout database could not be deleted because of a terminal storage error. Its workout records remain recoverable; close other Comprehensive Fitness tabs, then retry.`;
          return stopClear(blockedMessage);
        }
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
        if (Object.prototype.hasOwnProperty.call(patch, "title")
          && (typeof patch.title !== "string" || patch.title.length > 256)) {
          showAppToast("Workout titles must be 256 characters or fewer.");
          return false;
        }
        if (Object.prototype.hasOwnProperty.call(patch, "notes")
          && (typeof patch.notes !== "string" || patch.notes.length > 4096)) {
          showAppToast("Workout notes must be 4,096 characters or fewer.");
          return false;
        }
        const draftMutation = session.id === activeWorkoutId && !isSessionSubmitted(session) && !isEditingHistorySession();
        if (shouldRender || (draftMutation && session.coachingPrescription)) {
          commit({ ...data, sessions: data.sessions.map((item) => item.id === session.id ? { ...item, ...patch, updatedAt: isoNow() } : item) }, shouldRender, { invalidateAnalysis: !draftMutation, deferPersistence: draftMutation });
          return true;
        }
        const index = dataEntityIndex().sessionIndexById.get(session.id) ?? -1;
        if (index >= 0) {
          data.sessions[index] = { ...data.sessions[index], ...patch, updatedAt: isoNow() };
          if (isEditingHistorySession()) historyEditFlow.dirty = true;
          else scheduleSave({ ordinaryMutation: true });
        }
        return index >= 0;
      }

      function setSessionDeload(sessionId, isDeload) {
        if (typeof isDeload !== "boolean") return false;
        const authorization = guardWorkoutMutation("session-deload", { sessionId });
        if (!authorization.allowed) return false;
        const session = authorization.target.session;
        if (Boolean(session.isDeload) === isDeload) return true;
        commit({
          ...data,
          sessions: data.sessions.map((item) => item.id === session.id ? { ...item, isDeload, updatedAt: isoNow() } : item)
        }, true, { invalidateAnalysis: true, deferPersistence: authorization.target.authorizationMode !== "history_edit" });
        return true;
      }

      function setExerciseDeload(exerciseId, isDeload) {
        if (typeof isDeload !== "boolean") return false;
        const authorization = guardWorkoutMutation("exercise-deload", { exerciseId });
        if (!authorization.allowed) return false;
        const exercise = authorization.target.exercise;
        if (Boolean(exercise.isDeload) === isDeload) return true;
        patchExercise(exercise.id, { isDeload });
        return true;
      }

      function nextScheduledWorkoutOccurrence(model, afterDate = new Date()) {
        const date = new Date(afterDate.getFullYear(), afterDate.getMonth(), afterDate.getDate());
        if (!Number.isFinite(date.getTime())) return null;
        for (let offset = 1; offset <= 7; offset += 1) {
          date.setDate(date.getDate() + 1);
          const scheduled = scheduledTemplatesForToday(model, date);
          if (!scheduled.length) continue;
          return { date: localDateIso(date), routines: scheduled };
        }
        return null;
      }

      function guardInjurySkipMutation(action, identifiers = {}, notify = true) {
        const blocked = (reason, message) => {
          if (notify) showAppToast(message);
          return { allowed: false, reason, message };
        };
        if (historyEditFlow) return blocked("history_edit_in_progress", "Finish editing workout history before changing an injury skip.");
        const records = data.skippedSessions || [];
        if (action === "record-injury-skip") {
          if (records.length >= 100000) return blocked("skip_limit", "The injury skip record limit has been reached.");
          if (identifiers.date !== todayIso()) return blocked("not_today", "An injury skip can be recorded only for today.");
          const routine = data.templates.find((template) => template.id === identifiers.routineId);
          if (!routine) return blocked("unknown_routine", "The requested routine no longer exists.");
          if (typeof routine.name !== "string" || !routine.name.trim() || routine.name.length > 256) {
            return blocked("invalid_routine_name", "The routine needs a name of 1 to 256 characters before recording a skip.");
          }
          if (records.some((record) => record.routineId === routine.id && record.date === identifiers.date)) {
            return blocked("duplicate_occurrence", "This routine is already marked skipped for today.");
          }
          return { allowed: true, routine, date: identifiers.date };
        }
        if (action === "undo-injury-skip") {
          const record = records.find((item) => item.id === identifiers.id);
          if (!record) return blocked("unknown_skip", "The requested injury skip no longer exists.");
          if (record.date !== todayIso()) return blocked("not_today", "An injury skip can be undone only on the day it was recorded.");
          return { allowed: true, record };
        }
        return blocked("unknown_action", "The requested injury skip action is invalid.");
      }

      function recordInjurySkip(routineId, date) {
        const authorization = guardInjurySkipMutation("record-injury-skip", { routineId, date });
        if (!authorization.allowed) return false;
        const localDate = new Date(date + "T12:00:00");
        const scheduled = scheduledTemplatesForToday(data, localDate).some((routine) => routine.id === routineId);
        const record = { id: id(), date, routineId, routineName: authorization.routine.name, dayId: scheduled ? localWeekdayKey(localDate) : "unscheduled", reason: "injury", createdAt: isoNow() };
        commit({ ...data, skippedSessions: [...(data.skippedSessions || []), record] }, true, { invalidateAnalysis: false });
        return record;
      }

      function undoInjurySkip(skipId) {
        const authorization = guardInjurySkipMutation("undo-injury-skip", { id: skipId });
        if (!authorization.allowed) return false;
        commit({ ...data, skippedSessions: data.skippedSessions.filter((record) => record.id !== authorization.record.id) }, true, { invalidateAnalysis: false });
        return true;
      }

      function patchRecovery(patch, shouldRender = true) {
        const session = activeSession();
        if (!session) return;
        const recovery = cleanRecovery({ ...sessionRecovery(session), ...patch });
        const activeDraft = session.id === activeWorkoutId && !isSessionSubmitted(session);
        const nextSession = {
          ...session,
          recovery,
          ...(activeDraft ? {
            resolvedActions: mergeResolvedDecisionHistory(
              session.resolvedActions,
              measurePerformance("workoutUpdate:exceptionResolver", () => resolveWorkoutExceptions({ ...session, recovery }, recovery), { workoutId: session.id, hasExplicitSafetyInput: Boolean(recovery.illness || recovery.pain) })
            )
          } : {}),
          updatedAt: isoNow()
        };
        if (shouldRender || (activeDraft && session.coachingPrescription)) {
          commit({ ...data, sessions: data.sessions.map((item) => item.id === session.id ? nextSession : item) }, shouldRender, { invalidateAnalysis: !activeDraft, deferPersistence: activeDraft });
          return;
        }
        const index = dataEntityIndex().sessionIndexById.get(session.id) ?? -1;
        if (index < 0) return;
        data.sessions[index] = nextSession;
        if (isEditingHistorySession()) historyEditFlow.dirty = true;
        else scheduleSave({ ordinaryMutation: true });
      }

      function setExpectedTemplate(templateId) {
        if (!data.templates.some((template) => template.id === templateId)) return false;
        commit({ ...data, settings: { ...data.settings, expectedTemplateId: templateId } });
        showAppToast("Expected workout updated.", { severity: "success" });
        return true;
      }

      function toggleWorkoutDurationPause(sessionId = activeWorkoutId) {
        const session = data.sessions.find((item) => item.id === sessionId);
        if (!session || isSessionSubmitted(session) || session.id !== activeWorkoutId) return false;
        const nextSession = session.workoutPausedAt
          ? startWorkoutDuration(session)
          : pauseWorkoutDuration(startWorkoutDuration(session));
        commit({
          ...data,
          sessions: data.sessions.map((item) => item.id === session.id ? { ...nextSession, updatedAt: isoNow() } : item)
        }, true, { invalidateAnalysis: false, deferPersistence: true });
        return true;
      }

      function finalizeWorkoutDuration(sessionId = activeWorkoutId) {
        const session = data.sessions.find((item) => item.id === sessionId);
        if (!session || isSessionSubmitted(session)) return false;
        const nextSession = finalizeWorkoutDurationSession(startWorkoutDuration(session));
        commit({
          ...data,
          sessions: data.sessions.map((item) => item.id === session.id ? { ...nextSession, updatedAt: isoNow() } : item)
        }, false, { invalidateAnalysis: false, deferPersistence: true });
        return true;
      }

      function handleResolvedActionChoice(decisionId, choice) {
        const session = activeWorkoutSession();
        const action = session?.resolvedActions?.find((item) => item.decisionId === decisionId && item.outcome === "action");
        if (!session || !action || action.handling !== "pending") return false;
        const allowedChoices = action.category === "pain_or_illness"
          ? { stop: "accepted", modify: "modified", continue: "overridden" }
          : action.category === "readiness"
            ? { lighter: "accepted", continue: "overridden" }
            : {};
        const handling = allowedChoices[choice];
        if (!handling) return false;
        const handled = exceptionResolverApi.applyDecisionHandling(action, handling);
        commit({
          ...data,
          sessions: data.sessions.map((item) => item.id === session.id
            ? { ...item, resolvedActions: item.resolvedActions.map((decision) => decision.decisionId === decisionId ? handled : decision), updatedAt: isoNow() }
            : item)
        }, false, { invalidateAnalysis: false, deferPersistence: true });
        return { category: action.category, choice, handling };
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

      function applyExerciseDefaultTargets(exerciseId, form) {
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
          const updated = {
            ...base,
            setNumber,
            sequenceIndex,
            sequence: sequenceIndex,
            setTypeIndex,
            sourceTemplateSetId: target.sourceTargetId || base.sourceTemplateSetId,
            setType: target.type,
            isWarmup: target.type === "warmup",
            countsTowardProgression: target.type !== "warmup",
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
          return updated;
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
        const nextExercise = {
          ...exercise,
          restSeconds: plan.workingRestSeconds,
          manualOverrides: [...(exercise.manualOverrides || []), overrideEntry],
          overrideLocked: true
        };

        const applied = commit({
          ...data,
          sessions: data.sessions.map((item) => item.id === session.id ? { ...item, updatedAt: now } : item),
          exercises: data.exercises.map((item) => item.id === exercise.id ? nextExercise : item),
          sets: [...data.sets.filter((set) => !replacedSetIds.has(set.id)), ...nextWarmups.filter((set) => !set.completed), ...nextIncomplete]
        }, true, { invalidateAnalysis: false, deferPersistence: true });
        if (applied === false) return false;
        showAppToast("Exercise targets applied to unfinished sets in this workout.");
      }

      function patchExercise(exerciseId, patch, shouldRender = true) {
        if (Object.prototype.hasOwnProperty.call(patch, "notes")
          && (typeof patch.notes !== "string" || patch.notes.length > 4096)) {
          showAppToast("Exercise notes must be 4,096 characters or fewer.");
          return false;
        }
        const exercise = exerciseById(exerciseId);
        const draftMutation = exercise?.sessionId === activeWorkoutId && !isEditingHistorySession();
        const coachedDraft = draftMutation && data.sessions.some((session) => session.id === exercise.sessionId && session.coachingPrescription && !isSessionSubmitted(session));
        if (shouldRender || coachedDraft) {
          commit({ ...data, exercises: data.exercises.map((item) => item.id === exerciseId ? { ...item, ...patch } : item) }, shouldRender, { invalidateAnalysis: !draftMutation, deferPersistence: draftMutation });
          return true;
        }
        const index = dataEntityIndex().exerciseIndexById.get(exerciseId) ?? -1;
        if (index >= 0) {
          data.exercises[index] = { ...data.exercises[index], ...patch };
          if (isEditingHistorySession()) historyEditFlow.dirty = true;
          else scheduleSave({ ordinaryMutation: true });
        }
        return index >= 0;
      }

      function userSelectedExerciseIdentity(name) {
        const resolved = resolvePrescriptionExerciseIdentity({ name });
        if (resolved.status === "resolved" && !resolved.custom) {
          return exerciseIdentityFields({ name, researchExerciseId: resolved.exerciseId });
        }
        const exactVariantKey = String(name || "").normalize("NFKC").trim().toLowerCase();
        const existingCustom = [
          ...data.exercises,
          ...data.templates.flatMap((template) => template.exercises || [])
        ].find((exercise) => exercise.identitySource === "user_declared_custom"
          && String(exercise.name || "").normalize("NFKC").trim().toLowerCase() === exactVariantKey
          && String(exercise.performanceExerciseId || "").trim());
        if (existingCustom) return {
          performanceExerciseId: existingCustom.performanceExerciseId,
          researchExerciseId: "",
          identitySource: "user_declared_custom",
          identityVersion: existingCustom.identityVersion || "exercise-identity/2.1.0"
        };
        const performanceExerciseId = stableCustomPerformanceExerciseId(name);
        return {
          performanceExerciseId,
          researchExerciseId: "",
          identitySource: "user_declared_custom",
          identityVersion: "exercise-identity/2.1.0"
        };
      }

      function applyExerciseSubstitution(exerciseId, requestedName) {
        const exercise = exerciseById(exerciseId);
        const session = exercise ? sessionById(exercise.sessionId) : null;
        const name = String(requestedName || "").trim();
        if (!exercise || !session || exercise.sessionId !== activeWorkoutId || isSessionSubmitted(session)) return;
        if (!name) {
          showAppToast("Enter the substitute or variant name.");
          return;
        }
        if (name.length > 256) {
          showAppToast("Exercise names must be 256 characters or fewer.");
          return;
        }
        if (name === exercise.name) {
          showAppToast("This exercise is already selected.");
          return;
        }

        const identity = userSelectedExerciseIdentity(name);
        const resistanceType = inferResistanceType(name);
        const now = isoNow();
        const overrideEntry = {
          overrideId: `runtime_override_${id()}`,
          sessionId: session.id,
          workoutId: session.id,
          exerciseRuntimeId: exercise.id,
          exerciseId: exercise.performanceExerciseId || exercise.researchExerciseId || canonicalExerciseId(exercise.name),
          field: "exerciseVariant",
          from: {
            name: exercise.name,
            performanceExerciseId: exercise.performanceExerciseId || "",
            researchExerciseId: exercise.researchExerciseId || "",
            identitySource: exercise.identitySource || ""
          },
          to: {
            name,
            performanceExerciseId: identity.performanceExerciseId || "",
            researchExerciseId: identity.researchExerciseId || "",
            identitySource: identity.identitySource || ""
          },
          createdAt: now,
          actor: "user",
          action: "substitute_exercise",
          reason: "Current-workout exercise substitution or named variant",
          lockedForWorkout: true
        };
        const exerciseSets = setsForExercise(exercise.id);
        const hasRecordedWork = exerciseSets.some((set) => set.completed && !set.skipped);
        const incompleteIds = new Set(exerciseSets.filter((set) => !set.completed && !set.skipped).map((set) => set.id));
        const stableSource = exerciseSets.find((set) => isWorkingSet(set, "progression") && !set.completed)
          || exerciseSets.find((set) => isWorkingSet(set, "progression"));
        const baseReplacement = {
          ...exercise,
          name,
          ...identity,
          resistanceType,
          isBodyweight: isBodyweightResistance(resistanceType),
          customExerciseProfile: undefined,
          pendingReconcile: null,
          stableTargetSnapshot: stableSource ? {
            sets: exerciseSets.filter((set) => isWorkingSet(set, "progression") && !set.skipped).length,
            repLow: Number(stableSource.targetRepMin || stableSource.targetReps || 0),
            repHigh: Number(stableSource.targetRepMax || stableSource.targetReps || 0),
            rpe: Number(stableSource.targetRpeMax ?? stableSource.targetRpe ?? 0),
            restSeconds: Number(stableSource.targetRestSeconds || exercise.restSeconds || data.settings.defaultRestSeconds || 90)
          } : exercise.stableTargetSnapshot,
          manualOverrides: [...(exercise.manualOverrides || []), overrideEntry],
          overrideLocked: true
        };

        let exercises;
        let sets;
        const reparentedSetIds = new Map();
        if (!hasRecordedWork) {
          exercises = data.exercises.map((item) => item.id === exercise.id ? baseReplacement : item);
          sets = data.sets.map((set) => {
            if (set.exerciseId !== exercise.id) return set;
            const { previousComparableSet, ...current } = set;
            return { ...current, resistanceType, isBodyweight: isBodyweightResistance(resistanceType) };
          });
        } else {
          const replacementId = id();
          overrideEntry.replacementExerciseRuntimeId = replacementId;
          const replacement = { ...baseReplacement, id: replacementId, notes: "", order: Number(exercise.order || 0) + 0.5 };
          const sessionExercises = [...data.exercises.filter((item) => item.sessionId === session.id), replacement]
            .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
          const orderById = new Map(sessionExercises.map((item, index) => [item.id, index]));
          exercises = [
            ...data.exercises.filter((item) => item.sessionId !== session.id),
            ...sessionExercises.map((item) => ({ ...item, order: orderById.get(item.id) }))
          ];
          sets = data.sets.map((set) => {
            if (!incompleteIds.has(set.id)) return set;
            const { previousComparableSet, ...current } = set;
            // A frozen plan keeps its original ownership. Referenced rows moved
            // to another exercise get fresh IDs; the old IDs become deletions.
            const prescribed = session.coachingPrescription?.sets?.some((row) => row.setId === set.id);
            const setId = prescribed ? id() : set.id;
            if (setId !== set.id) reparentedSetIds.set(set.id, setId);
            return { ...current, id: setId, exerciseId: replacementId, resistanceType, isBodyweight: isBodyweightResistance(resistanceType) };
          });
          if (!incompleteIds.size) {
            const stable = exercise.stableTargetSnapshot || {};
            const source = stableSource || {
              setType: "straight",
              targetRepMin: stable.repLow,
              targetRepMax: stable.repHigh,
              targetReps: stable.repLow,
              targetRpe: stable.rpe,
              targetRpeMin: stable.rpe,
              targetRpeMax: stable.rpe,
              targetRestSeconds: stable.restSeconds || exercise.restSeconds
            };
            sets = [...sets, createSet(replacementId, 1, {
              setNumber: 1,
              sequenceIndex: 0,
              sequence: 0,
              setTypeIndex: 0,
              setType: normalizeSetTypeCode(source.setType, false) === "warmup" ? "straight" : normalizeSetTypeCode(source.setType, false),
              isWarmup: false,
              countsTowardProgression: true,
              targetReps: source.targetReps,
              targetRepMin: source.targetRepMin,
              targetRepMax: source.targetRepMax,
              targetWeight: source.targetWeight,
              targetRpe: source.targetRpe,
              targetRpeMin: source.targetRpeMin,
              targetRpeMax: source.targetRpeMax,
              targetRpeTolerance: source.targetRpeTolerance,
              targetRestSeconds: source.targetRestSeconds ?? exercise.restSeconds,
              originalTargetReps: source.originalTargetReps ?? source.targetReps,
              originalTargetWeight: source.originalTargetWeight ?? source.targetWeight,
              originalTargetRpe: source.originalTargetRpe ?? source.targetRpe,
              completed: false,
              skipped: false,
              edited: false,
              resistanceType,
              isBodyweight: isBodyweightResistance(resistanceType)
            })];
          }
        }

        activeSetId = reparentedSetIds.get(activeSetId) || activeSetId;
        pendingNextSetId = reparentedSetIds.get(pendingNextSetId) || pendingNextSetId;
        if (timer && reparentedSetIds.has(timer.pendingNextSetId)) timer = { ...timer, pendingNextSetId: reparentedSetIds.get(timer.pendingNextSetId) };
        const applied = commit({
          ...data,
          sessions: data.sessions.map((item) => item.id === session.id ? { ...item, updatedAt: now } : item),
          exercises,
          sets
        }, true, { invalidateAnalysis: false, deferPersistence: true });
        if (applied === false) return false;
        showAppToast(hasRecordedWork
          ? `${name} added next; completed work remains under ${exercise.name}.`
          : `${name} will be logged for this workout. The routine is unchanged.`);
      }

      function patchTemplateExerciseName(templateId, exerciseId, name, shouldRender = true) {
        const template = data.templates.find((item) => item.id === templateId);
        const exercise = template?.exercises.find((item) => item.id === exerciseId);
        if (!exercise) return;
        const normalizedName = String(name || "").trim();
        if (!normalizedName || normalizedName.length > 256) {
          if (shouldRender) showAppToast("Exercise names must be between 1 and 256 characters.");
          return;
        }
        const identity = exercise.identitySource === "user_declared_custom" && String(exercise.performanceExerciseId || "").trim()
          ? exerciseIdentityFields({ ...exercise, name: normalizedName })
          : userSelectedExerciseIdentity(normalizedName);
        if (!shouldRender) {
          patchTemplateExercise(templateId, exerciseId, { name: normalizedName, ...identity }, false);
          return;
        }
        patchTemplateExercise(templateId, exerciseId, { name: normalizedName, ...identity }, shouldRender);
      }

      function patchSet(setId, patch, shouldRender = true) {
        const applyPatch = (set) => {
          const updated = { ...set, ...patch };
          for (const field of ["loadSource", "repsSource", "rpeSource"]) {
            if (Object.prototype.hasOwnProperty.call(patch, field) && patch[field] == null) delete updated[field];
          }
          if (set.completionOrder !== undefined) updated.completionOrder = set.completionOrder;
          if (!Object.prototype.hasOwnProperty.call(patch, "setType")) return updated;
          delete updated.countsTowardScore;
          delete updated.countsTowardVolume;
          return updated;
        };
        const set = setById(setId);
        const exercise = set ? exerciseById(set.exerciseId) : null;
        const draftMutation = exercise?.sessionId === activeWorkoutId && !isEditingHistorySession();
        const coachedDraft = draftMutation && data.sessions.some((session) => session.id === exercise.sessionId && session.coachingPrescription && !isSessionSubmitted(session));
        if (shouldRender || coachedDraft) {
          commit({ ...data, sets: data.sets.map((item) => item.id === setId ? applyPatch(item) : item) }, shouldRender, { invalidateAnalysis: !draftMutation, deferPersistence: draftMutation });
          return;
        }
        const index = dataEntityIndex().setIndexById.get(setId) ?? -1;
        if (index >= 0) {
          const updatedSet = applyPatch(data.sets[index]);
          if (isEditingHistorySession()) {
            const sets = data.sets.slice();
            sets[index] = updatedSet;
            data = { ...data, sets, dataRevision: Number(data.dataRevision || 0) + 1 };
            historyEditFlow.dirty = true;
            invalidateCompletedAnalysis();
          } else {
            data.sets[index] = updatedSet;
            scheduleSave({ ordinaryMutation: true });
          }
        }
      }

      function setManualType(setId, requestedType) {
        const current = data.sets.find((set) => set.id === setId);
        if (!current) return;
        const setType = normalizeSetTypeCode(requestedType);
        logWorkoutOverride(exerciseById(current.exerciseId), "setStructure", normalizeSetTypeCode(current.setType, current.isWarmup), setType, { setId });
        const isWarmup = setType === "warmup";
        patchSet(setId, {
          setType,
          isWarmup,
          countsTowardProgression: !isWarmup,
          classificationSource: "manual",
          classificationConfidence: 1,
          classifierVersion: SET_CLASSIFIER_VERSION,
          manualOverride: true,
          reviewRequired: false,
          classifiedAt: isoNow(),
          classificationUndo: current.classificationUndo || { setType: current.setType, isWarmup: current.isWarmup, countsTowardProgression: current.countsTowardProgression, classificationSource: current.classificationSource, classificationConfidence: current.classificationConfidence, manualOverride: current.manualOverride, reviewRequired: current.reviewRequired }
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
        const exerciseIndex = dataEntityIndex().exerciseIndexById.get(exercise.id);
        if (exerciseIndex != null) data.exercises[exerciseIndex] = { ...data.exercises[exerciseIndex], manualOverrides: [...(data.exercises[exerciseIndex].manualOverrides || []), entry], overrideLocked: true };
        return entry;
      }

      function patchSetValue(setId, field, value, shouldRender = true) {
        const editingHistory = isEditingHistorySession();
        const set = setById(setId);
        const exercise = set ? exerciseById(set.exerciseId) : null;
        if (!set || !exercise) return false;
        const resistanceType = resistanceTypeFor(exercise, set);
        const blank = value == null || (typeof value === "string" && value.trim() === "");
        const numeric = blank ? "" : Number(value);
        const domains = {
          reps: { min: 0, integer: true, label: "Reps" },
          weight: { min: 0, label: "Load" },
          rpe: { min: 0, max: 10, step: 0.5, label: "RPE" },
          durationSeconds: { min: 0, integer: true, label: "Duration" },
          distance: { min: 0, label: "Distance" }
        };
        const domain = domains[field];
        const steps = domain?.step == null ? 0 : (numeric - domain.min) / domain.step;
        const invalid = !domain
          || (!blank && (!Number.isFinite(numeric)
            || numeric < domain.min
            || (domain.max != null && numeric > domain.max)
            || (domain.integer && !Number.isInteger(numeric))
            || (domain.step != null && Math.abs(steps - Math.round(steps)) > 1e-9)));
        if (invalid) {
          const range = domain?.max == null ? `${domain?.min ?? 0} or greater` : `${domain.min} to ${domain.max}`;
          const increment = domain?.step == null ? "" : ` in ${domain.step} increments`;
          showAppToast(`${domain?.label || "Set value"} must be ${range}${increment}.`);
          return false;
        }
        if (!editingHistory) acknowledgeActiveSet(setId);
        const repObservation = ["reps", "durationSeconds", "distance"].includes(field);
        const sourceField = field === "weight" ? "loadSource" : repObservation ? "repsSource" : field === "rpe" ? "rpeSource" : "";
        const touchedField = field === "weight" ? "loadTouched" : repObservation ? "repsTouched" : field === "rpe" ? "rpeTouched" : "";
        const source = blank ? undefined : field === "rpe" ? "typed" : "entered";
        if (editingHistory && set[field] === numeric && (!sourceField || (set[sourceField] === source && set[touchedField] === true))) return true;
        if (editingHistory) shouldRender = false;
        if (shouldRender) logWorkoutOverride(exercise, field === "weight" ? "load" : field, set?.[`target${field.charAt(0).toUpperCase() + field.slice(1)}`] ?? set?.[field], numeric, { setId });
        const patch = { [field]: numeric, edited: true };
        if (sourceField) patch[sourceField] = source ?? null;
        if (touchedField) patch[touchedField] = true;
        if (field === "weight") patch.weightUnit = ["lb", "kg"].includes(set.weightUnit) ? set.weightUnit : data.settings.weightUnit;
        if (field === "weight" && resistanceType === "bodyweight_plus_load") patch.addedLoad = numeric;
        if (field === "weight" && resistanceType === "assisted_bodyweight") patch.assistanceLoad = numeric;
        patchSet(setId, patch, shouldRender);
        if (!blank) clearLoadedBarPrompt(setId, field);
        return true;
      }

      function completedSetReconcileState(set, exercise) {
        if (!set || !exercise || !set.completed || set.skipped || setTypeSemantics(set).isWarmup) return null;
        if (coachingTargetsForSession(sessionById(exercise.sessionId)).visible) return null;
        const remainingSets = setsForExercise(exercise.id).filter((item) =>
          item.id !== set.id && isWorkingSet(item) && !item.completed && !item.skipped && !item.edited
            && !item.loadTouched && !item.repsTouched && !item.rpeTouched
            && ![item.loadSource, item.repsSource].includes("entered")
        );
        if (!remainingSets.length) return null;
        const fields = [];
        const resistanceType = resistanceTypeFor(exercise, set);
        const storedUnit = set.weightUnit === "kg" || set.weightUnit === "lb" ? set.weightUnit : data.settings.weightUnit;
        const targetWeight = Number(convertWeightValue(set.targetWeight ?? 0, storedUnit, data.settings.weightUnit));
        const actualWeight = resistanceLoad(set, resistanceType);
        const increment = Number(progressionProfileForExercise(exercise.name).increment || 0);
        if (resistanceType !== "bodyweight" && targetWeight > 0 && Math.abs(actualWeight - targetWeight) > Math.max(increment, targetWeight * 0.03)) fields.push("load");
        const targetRepMin = Number(set.targetRepMin || set.targetReps || 0);
        const targetRepMax = Number(set.targetRepMax || set.targetReps || 0);
        if (targetRepMin > 0 && targetRepMax > 0 && (Number(set.reps || 0) < targetRepMin || Number(set.reps || 0) > targetRepMax)) fields.push("reps");
        return fields.length ? { setId: set.id, fields, remainingSetCount: remainingSets.length } : null;
      }

      function reconcileCompletedSet(exerciseId, applyToRemaining) {
        const exercise = exerciseById(exerciseId);
        const pending = exercise?.pendingReconcile;
        const sourceSet = pending ? setById(pending.setId) : null;
        if (!exercise || !pending || !sourceSet || !sourceSet.completed || sourceSet.skipped) return;
        if (!guardWorkoutMutation(applyToRemaining ? "reconcile-apply" : "reconcile-dismiss", { exerciseId }).allowed
          || coachingTargetsForSession(sessionById(exercise.sessionId)).visible) return;
        if (!applyToRemaining) {
          patchSet(sourceSet.id, { deviationIntent: "one_off" }, false);
          patchExercise(exercise.id, { pendingReconcile: null }, false);
          syncReconcilePromptDom(exercise.id);
          showAppToast("Logged as a deliberate one-off. Remaining targets were not changed.");
          return;
        }
        const fields = new Set(pending.fields || []);
        const resistanceType = resistanceTypeFor(exercise, sourceSet);
        const targetPatch = {};
        if (fields.has("load")) {
          targetPatch.targetWeight = storedResistanceLoad(sourceSet, resistanceType);
        }
        if (fields.has("reps")) {
          const reps = Number(sourceSet.reps || 0);
          targetPatch.targetReps = reps;
          targetPatch.targetRepMin = reps;
          targetPatch.targetRepMax = reps;
        }
        const remainingSets = setsForExercise(exercise.id).filter((set) =>
          set.id !== sourceSet.id && isWorkingSet(set) && !set.completed && !set.skipped && !set.edited
            && !set.loadTouched && !set.repsTouched && !set.rpeTouched
            && ![set.loadSource, set.repsSource].includes("entered")
        );
        const beforeTargets = remainingSets.map((set) => ({
          setId: set.id,
          targetWeight: Number(set.targetWeight || 0),
          targetRepMin: Number(set.targetRepMin || set.targetReps || 0),
          targetRepMax: Number(set.targetRepMax || set.targetReps || 0),
          targetRpeMin: Number(set.targetRpeMin ?? set.targetRpe ?? 0),
          targetRpeMax: Number(set.targetRpeMax ?? set.targetRpe ?? 0)
        }));
        const patchForRow = (set) => ({ ...targetPatch, ...(Object.prototype.hasOwnProperty.call(targetPatch, "targetWeight")
          ? { targetWeight: Number(convertWeightValue(targetPatch.targetWeight, sourceSet.weightUnit || data.settings.weightUnit, set.weightUnit || data.settings.weightUnit)) } : {}) });
        const afterTargets = remainingSets.map((set) => ({ setId: set.id, ...patchForRow(set) }));
        logWorkoutOverride(exercise, "remainingSetTargets", beforeTargets, afterTargets, {
          setId: sourceSet.id,
          reason: "Apply completed set values to remaining targets"
        });
        const remainingIds = new Set(remainingSets.map((set) => set.id));
        const sets = data.sets.map((set) => {
          if (set.id === sourceSet.id) return { ...set, deviationIntent: "accepted", manualOverride: true };
          if (!remainingIds.has(set.id)) return set;
          return { ...set, ...patchForRow(set) };
        });
        commit({
          ...data,
          exercises: data.exercises.map((item) => item.id === exercise.id ? { ...item, pendingReconcile: null } : item),
          sets
        }, true, { invalidateAnalysis: false, deferPersistence: true });
        showAppToast("Remaining set targets updated from the completed set.");
      }

      function firstSetCompletionPatch(set, sessionId) {
        const patch = {};
        if (set.completionOrder === undefined) {
          const exerciseIds = new Set(data.exercises.filter((exercise) => exercise.sessionId === sessionId).map((exercise) => exercise.id));
          const maximum = data.sets.reduce((current, row) => exerciseIds.has(row.exerciseId) && Number.isSafeInteger(row.completionOrder)
            ? Math.max(current, row.completionOrder) : current, 0);
          patch.completionOrder = maximum + 1;
        }
        return patch;
      }

      function acceptedSetObservationPatch(set, exercise) {
        const type = resistanceTypeFor(exercise, set);
        const targets = loadedBarTargetsForSet(set, exercise);
        const blank = (value) => value == null || (typeof value === "string" && value.trim() === "");
        const patch = {};
        const accept = (field, actual, target, sourceField, coach, prompt, required = true) => {
          if (!blank(actual)) return true;
          const validTarget = !blank(target) && Number.isFinite(Number(target)) && Number(target) >= 0
            && (!["reps", "durationSeconds"].includes(field) || Number.isInteger(Number(target)));
          if (!validTarget) {
            if (!required) return true;
            promptLoadedBarField(set, field, prompt);
            return false;
          }
          patch[field] = Number(target);
          if (sourceField) patch[sourceField] = coach ? "accepted_target" : "prefill_previous";
          return true;
        };
        if (type === "duration") {
          if (!accept("durationSeconds", set.durationSeconds, targets.durationSeconds, "repsSource", false, "Enter duration")) return null;
        } else if (type === "distance") {
          if (!accept("distance", set.distance, targets.distance, "repsSource", false, "Enter distance")) return null;
        } else {
          const actualLoad = type === "bodyweight_plus_load" ? set.addedLoad ?? set.weight
            : type === "assisted_bodyweight" ? set.assistanceLoad ?? set.weight : set.weight;
          if (type !== "bodyweight") {
            if (!accept("weight", actualLoad, targets.weight, "loadSource", targets.coachLoad === true, "Enter load", type !== "assisted_bodyweight")) return null;
            if (Object.prototype.hasOwnProperty.call(patch, "weight")) {
              if (type === "bodyweight_plus_load") patch.addedLoad = patch.weight;
              if (type === "assisted_bodyweight") patch.assistanceLoad = patch.weight;
            }
          }
          if (!accept("reps", set.reps, targets.reps, "repsSource", targets.coachReps === true, "Enter reps")) return null;
        }
        // RPE is an observation supplied by the owner, never part of acceptance.
        clearLoadedBarPrompt(set.id);
        return patch;
      }

      function toggleSetCompletion(setId) {
        if (completingSetIds.has(setId)) return;
        const interactionStartedAt = performanceNow();
        const authorization = guardWorkoutMutation("toggle-set", { setId });
        if (!authorization.allowed) return;
        const set = authorization.target.set;
        const completing = !set.completed;
        const exercise = authorization.target.exercise || exerciseById(set.exerciseId);
        const observations = completing ? acceptedSetObservationPatch(set, exercise) : {};
        if (observations === null) return false;
        if (authorization.target.authorizationMode === "history_edit") {
          patchSet(set.id, { ...observations, ...(completing ? firstSetCompletionPatch(set, authorization.target.session.id) : {}), completed: completing, skipped: false, edited: true });
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

        completingSetIds.add(setId);
        try {
          const next = nextIncompleteSet(set.id);
          const pendingReconcile = completedSetReconcileState({ ...set, ...observations, completed: true, skipped: false }, exercise);
          const completedAt = isoNow();
          const completionPatch = firstSetCompletionPatch(set, exercise.sessionId);
          commit({
            ...data,
            sets: data.sets.map((item) => item.id === set.id ? { ...item, ...observations, ...completionPatch, completed: true, skipped: false, completedAt } : item),
            exercises: pendingReconcile ? data.exercises.map((item) => item.id === exercise.id ? { ...item, pendingReconcile } : item) : data.exercises
          }, false, { invalidateAnalysis: false, deferPersistence: true });
          workoutFocusExerciseId = next?.exerciseId || exercise.id;
          applyCompletedSetVisual(set.id);
          if (pendingReconcile) syncReconcilePromptDom(exercise.id);
          if (data.settings.autoStartRestTimer !== false) {
            startTimer(exercise?.id || set.exerciseId, set.id, { pendingNextSetId: next?.id || "", deferRender: true });
            persistActiveWorkoutDraft();
            renderAfterInteractionFrame();
            recordPerformance("interaction:completeSet", interactionStartedAt, { setId, timerStarted: true });
            return;
          }
          setActiveSet(next?.id || "", next ? "Set " + (next.isWarmup ? "WU" : next.setNumber) + " is current" : "Workout sets complete", false);
          persistActiveWorkoutDraft();
          renderAfterInteractionFrame();
          recordPerformance("interaction:completeSet", interactionStartedAt, { setId, timerStarted: false });
        } finally {
          window.setTimeout(() => completingSetIds.delete(setId), 300);
        }
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
        const substitutions = (exercise.manualOverrides || []).filter((entry) => entry.field === "exerciseVariant" && entry.action === "substitute_exercise");
        const routineSourceSubstitution = substitutions[0];
        const sourceName = routineSourceSubstitution?.from?.name || "";
        const sourcePerformanceId = routineSourceSubstitution?.from?.performanceExerciseId || routineSourceSubstitution?.from?.researchExerciseId || "";
        const templateExercise = sourcePerformanceId
          ? template.exercises.find((item) => (item.performanceExerciseId || item.researchExerciseId || canonicalExerciseId(item)) === sourcePerformanceId)
            || (sourceName ? template.exercises.find((item) => exerciseMatches(item.name, sourceName)) : null)
          : template.exercises.find((item) => (item.performanceExerciseId || canonicalExerciseId(item)) === (exercise.performanceExerciseId || canonicalExerciseId(exercise)))
            || template.exercises.find((item) => exerciseMatches(item.name, exercise.name));
        if (!templateExercise) {
          showAppToast("The matching routine exercise could not be found; the workout remains unchanged.");
          return;
        }
        const structureExerciseIds = new Set([
          exercise.id,
          ...substitutions.map((entry) => entry.exerciseRuntimeId || "")
        ].filter(Boolean));
        const structureSets = data.sets
          .filter((set) => structureExerciseIds.has(set.exerciseId))
          .sort((left, right) => Number(left.sequenceIndex ?? left.sequence ?? left.setNumber ?? 0) - Number(right.sequenceIndex ?? right.sequence ?? right.setNumber ?? 0));
        const workSets = structureSets.filter((set) => isWorkingSet(set, "progression"));
        const warmupSets = structureSets.filter((set) => setTypeSemantics(set).isWarmup);
        const representative = workSets[0];
        if (!representative) return;
        const repMins = workSets.map((set) => Number(set.targetRepMin || set.targetReps || set.reps || 0)).filter((value) => value > 0);
        const repMaxes = workSets.map((set) => Number(set.targetRepMax || set.targetReps || set.reps || 0)).filter((value) => value > 0);
        const repMin = repMins.length ? Math.min(...repMins) : Number(representative.targetRepMin || representative.targetReps || representative.reps || 1);
        const repMax = repMaxes.length ? Math.max(...repMaxes) : Number(representative.targetRepMax || representative.targetReps || representative.reps || repMin);
        const roleMetadataFields = ["increment", "incrementUnit", "defaultLoad", "targetLoad", "defaultReps", "weight", "weightUnit", "reps"];
        const existingRoles = templateExercise.setTypes || [];
        const setTypes = templateSetTypesFromHistory(workSets, exercise.restSeconds).map((role) => {
          const sameIdentity = existingRoles.filter((existing) => existing.id && existing.id === role.id
            && normalizeSetTypeCode(existing.type || existing.setType) === normalizeSetTypeCode(role.type));
          const sameType = existingRoles.filter((existing) => normalizeSetTypeCode(existing.type || existing.setType) === normalizeSetTypeCode(role.type));
          const matches = sameIdentity.length ? sameIdentity : sameType;
          if (matches.length !== 1) return role;
          const metadata = Object.fromEntries(roleMetadataFields.filter((field) => Object.prototype.hasOwnProperty.call(matches[0], field))
            .map((field) => [field, matches[0][field]]));
          return { ...role, ...metadata };
        });
        patchTemplateExercise(template.id, templateExercise.id, {
          name: exercise.name,
          ...exerciseIdentityFields(exercise),
          sets: workSets.length,
          reps: Math.round((repMin + repMax) / 2),
          repMin,
          repMax,
          targetRpe: Number(representative.targetRpe ?? representative.targetRpeMax) || Number(representative.rpe) || Number(templateExercise.targetRpe) || 8,
          restSeconds: exercise.restSeconds,
          setTypes,
          warmups: warmupSets.map((set) => ({ reps: set.reps, targetRepMin: set.targetRepMin, targetRepMax: set.targetRepMax, targetRpe: set.targetRpe, targetRpeMin: set.targetRpeMin, targetRpeMax: set.targetRpeMax, targetRestSeconds: set.targetRestSeconds, weight: set.weight, weightUnit: set.weightUnit, resistanceType: set.resistanceType, isBodyweight: set.isBodyweight, addedLoad: set.addedLoad, assistanceLoad: set.assistanceLoad, rpe: set.rpe })),
          customExerciseProfile: exercise.customExerciseProfile ? normalizeCustomExerciseProfile(exercise.customExerciseProfile) : undefined
        });
        activeSetNotice = "Routine updated from today’s exercise targets";
      }

      function addSession() {
        if (hasActiveWorkout()) {
          activeSessionId = activeWorkoutId;
          setActiveTab("workout", { replace: true, renderNow: false });
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
        setActiveTab("workout", { replace: true, renderNow: false });
        commit({ ...data, sessions: [session, ...data.sessions] });
      }

      function addExercise() {
        const name = String(addExerciseDraft || "").trim();
        if (!name) return;
        if (name.length > 256) {
          showAppToast("Exercise names must be 256 characters or fewer.");
          return;
        }
        const setCount = Number(addExerciseSetCount);
        const repMin = Number(addExerciseRepMin);
        const repMax = Number(addExerciseRepMax);
        const targetRpe = Number(addExerciseTargetRpe);
        const restSeconds = Number(addExerciseRestSeconds || data.settings.defaultRestSeconds || 90);
        if (!Number.isInteger(setCount) || setCount < 1 || setCount > 20
          || !Number.isInteger(repMin) || !Number.isInteger(repMax) || repMin < 1 || repMax > 100 || repMin > repMax
          || !Number.isFinite(targetRpe) || targetRpe < 1 || targetRpe > 10 || Math.abs(targetRpe * 2 - Math.round(targetRpe * 2)) > 1e-9
          || !Number.isInteger(restSeconds) || restSeconds < 0 || restSeconds > 3600) {
          showAppToast("Choose 1–20 sets, an ordered 1–100 rep range, RPE in 0.5 steps, and 0–3600 rest seconds.");
          return;
        }
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
          setActiveTab("workout", { replace: true, renderNow: false });
          showAppToast("You already have an active workout. Resume or cancel it before adding another.");
          render();
          return;
        }
        const resistanceType = inferResistanceType(name);
        const runtimeExerciseId = id();
        const identityFields = userSelectedExerciseIdentity(name);
        const exercise = {
          id: runtimeExerciseId,
          sessionId: session.id,
          name,
          ...identityFields,
          primaryMuscle: addExercisePrimaryMuscle,
          secondaryMuscle: addExerciseSecondaryMuscle,
          notes: "",
          order: data.exercises.filter((item) => item.sessionId === session.id).length,
          stableTargetSnapshot: { sets: setCount, repLow: repMin, repHigh: repMax, rpe: targetRpe, restSeconds },
          restSeconds,
          resistanceType,
          isBodyweight: isBodyweightResistance(resistanceType),
          isDeload: false
        };
        const initialSets = Array.from({ length: setCount }, (_, index) => createSet(exercise.id, index + 1, {
          sequenceIndex: index,
          sequence: index,
          setTypeIndex: index,
          setType: "straight",
          reps: "",
          rpe: "",
          resistanceType,
          targetReps: Math.round((repMin + repMax) / 2),
          targetRepMin: repMin,
          targetRepMax: repMax,
          targetRpe,
          targetRpeMin: targetRpe,
          targetRpeMax: targetRpe,
          targetRestSeconds: restSeconds,
          completed: false,
          skipped: false
        }));
        addExerciseDraft = "";
        addExercisePrimaryMuscle = "";
        addExerciseSecondaryMuscle = "";
        addExerciseSetCount = 1;
        addExerciseRepMin = 8;
        addExerciseRepMax = 12;
        addExerciseTargetRpe = 8;
        addExerciseRestSeconds = 0;
        if (!historyCorrection) {
          activeWorkoutId = session.id;
          session.workoutStarted = true;
          session.workoutState = "active";
          if (!session.startedAt) session.startedAt = isoNow();
          Object.assign(session, startWorkoutDuration(session));
        }
        commit({ ...data, sessions: data.sessions.map((item) => item.id === session.id ? { ...session, updatedAt: isoNow() } : item), exercises: [...data.exercises, exercise], sets: [...data.sets, ...initialSets] }, true, { invalidateAnalysis: historyCorrection, deferPersistence: !historyCorrection });
      }

      function addTemplate() {
        const template = { id: id(), name: "New Template", notes: "", exercises: [normalizeStableTemplateExercise({ id: id(), name: "Exercise", sets: 3, reps: 8, repMin: 8, repMax: 8, targetRpe: 8, increment: progressionProfileForExercise("Exercise").increment, restSeconds: recommendedRestSeconds("Exercise"), resistanceType: "external", isBodyweight: false, warmups: [] })], createdAt: isoNow(), updatedAt: isoNow() };
        setActiveTab("routines", { renderNow: false });
        commit({
          ...data,
          templates: [template, ...data.templates],
          settings: { ...data.settings, expectedTemplateId: data.settings.expectedTemplateId || template.id }
        });
      }

      function patchTemplate(templateId, patch, shouldRender = true) {
        if (Object.prototype.hasOwnProperty.call(patch, "name")
          && (typeof patch.name !== "string" || patch.name.length > 256)) {
          showAppToast("Routine names must be 256 characters or fewer.");
          return false;
        }
        if (Object.prototype.hasOwnProperty.call(patch, "notes")
          && (typeof patch.notes !== "string" || patch.notes.length > 4096)) {
          showAppToast("Routine notes must be 4,096 characters or fewer.");
          return false;
        }
        commit({ ...data, templates: data.templates.map((template) => template.id === templateId ? { ...template, ...patch, updatedAt: isoNow() } : template) }, shouldRender);
        return true;
      }

      function duplicateTemplate(templateId) {
        const source = data.templates.find((template) => template.id === templateId);
        if (!source) return false;
        const now = isoNow();
        const copy = {
          ...source,
          id: id(),
          name: `${source.name || "Routine"} Copy`,
          createdAt: now,
          updatedAt: now,
          exercises: (source.exercises || []).map((exercise) => ({
            ...exercise,
            id: id(),
            warmups: (exercise.warmups || []).map((warmup) => ({ ...warmup, id: id() })),
            setTypes: (exercise.setTypes || []).map((setType) => ({ ...setType, id: id() }))
          }))
        };
        const sourceIndex = data.templates.findIndex((template) => template.id === templateId);
        const templates = data.templates.slice();
        templates.splice(sourceIndex + 1, 0, copy);
        expandedTemplateEditorIds.add(copy.id);
        commit({ ...data, templates });
        return true;
      }

      function moveTemplateExercise(templateId, exerciseId, direction) {
        const step = direction === "up" ? -1 : direction === "down" ? 1 : 0;
        if (!step) return false;
        const template = data.templates.find((item) => item.id === templateId);
        const sourceIndex = template?.exercises.findIndex((exercise) => exercise.id === exerciseId) ?? -1;
        const destinationIndex = sourceIndex + step;
        if (!template || sourceIndex < 0 || destinationIndex < 0 || destinationIndex >= template.exercises.length) return false;
        const exercises = template.exercises.slice();
        const [moved] = exercises.splice(sourceIndex, 1);
        exercises.splice(destinationIndex, 0, moved);
        commit({
          ...data,
          templates: data.templates.map((item) => item.id === templateId
            ? { ...item, exercises, updatedAt: isoNow() }
            : item)
        });
        return true;
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
        const currentExercise = data.templates.find((template) => template.id === templateId)?.exercises.find((exercise) => exercise.id === exerciseId);
        if (!currentExercise) return false;
        const nextRepMin = Number(Object.prototype.hasOwnProperty.call(patch, "repMin") ? patch.repMin : currentExercise.repMin || currentExercise.reps);
        const nextRepMax = Number(Object.prototype.hasOwnProperty.call(patch, "repMax") ? patch.repMax : currentExercise.repMax || currentExercise.reps);
        if (Number.isFinite(nextRepMin) && Number.isFinite(nextRepMax) && nextRepMin > nextRepMax) {
          throw new RangeError("Template minimum repetitions cannot exceed maximum repetitions.");
        }
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
                    .filter((type) => type.countsTowardProgression !== false && !type.isWarmup)
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
                    ...((Object.prototype.hasOwnProperty.call(patch, "repMin") || Object.prototype.hasOwnProperty.call(patch, "repMax"))
                      ? {
                          exactReps: Number(Object.prototype.hasOwnProperty.call(patch, "repMin") ? patch.repMin : type.repMin) === Number(Object.prototype.hasOwnProperty.call(patch, "repMax") ? patch.repMax : type.repMax),
                          rangeSource: Number(Object.prototype.hasOwnProperty.call(patch, "repMin") ? patch.repMin : type.repMin) === Number(Object.prototype.hasOwnProperty.call(patch, "repMax") ? patch.repMax : type.repMax)
                            ? "routine-exact"
                            : "routine-range"
                        }
                      : {}),
                    ...(Object.prototype.hasOwnProperty.call(patch, "targetRpe") ? { rpeMin: Math.max(1, Number(patch.targetRpe) - 1), rpeMax: Number(patch.targetRpe) } : {}),
                    ...(Object.prototype.hasOwnProperty.call(patch, "restSeconds") ? { restSeconds: Number(patch.restSeconds) } : {})
                  }));
                  return normalizeStableTemplateExercise({ ...merged, setTypes });
                }),
                updatedAt: isoNow()
              }
            : template)
        }, shouldRender);
        return true;
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
          setActiveTab("routines", { renderNow: false });
          addTemplate();
          return;
        }
        setActiveTab("routines", { renderNow: false });
        commit({
          ...data,
          templates: [template, ...data.templates],
          settings: { ...data.settings, expectedTemplateId: data.settings.expectedTemplateId || template.id }
        });
      }

      function stableSetTypesForWorkoutStart(templateExercise, target, settings = data.settings) {
        const sourceTypes = (templateExercise.setTypes || [])
          .filter((type) => type.countsTowardProgression !== false && !type.isWarmup)
          .map((type) => ({ ...type, type: normalizeSetTypeCode(type.type || type.setType) }));
        const fallback = {
          id: `${templateExercise.id || "exercise"}-stable-1`,
          type: "straight",
          setCount: Math.max(1, Number(templateExercise.sets || 1)),
          repMin: Math.max(1, Number(templateExercise.repMin || templateExercise.reps || 1)),
          repMax: Math.max(1, Number(templateExercise.repMax || templateExercise.reps || 1)),
          rpeMin: Math.max(1, Number(templateExercise.targetRpe || 8) - 1),
          rpeMax: Math.max(1, Number(templateExercise.targetRpe || 8)),
          restSeconds: Math.max(0, Number(templateExercise.restSeconds || settings.defaultRestSeconds || 90)),
          countsTowardProgression: true
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
            restSeconds: Math.max(0, Number(type.restSeconds ?? templateExercise.restSeconds ?? settings.defaultRestSeconds ?? 90)),
            countsTowardProgression: type.countsTowardProgression !== false
          };
        }).filter((type) => type.setCount > 0);
      }

      function factualSetPrefillForWorkoutStart(templateExercise, target, setType, setTypeIndex, sequenceIndex, previousSets, settings = data.settings) {
        const role = normalizeSetTypeCode(setType.type || setType.setType);
        const sameRole = (previousSets || []).filter((set) => normalizeSetTypeCode(set.setType, set.isWarmup) === role);
        const previousComparableSet = sameRole.find((set) => Number(set.setTypeIndex || 0) === Number(setTypeIndex || 0))
          || sameRole[Number(setTypeIndex || 0)]
          || null;
        const resistanceType = target.resistanceType || templateExercise.resistanceType || "external";
        const available = (value) => value != null && value !== "" && Number.isFinite(Number(value));
        const configuredLoad = setType.targetLoad ?? templateExercise.defaultLoad ?? templateExercise.targetLoad ?? templateExercise.weight;
        const routineLoad = setType.defaultLoad != null
          ? Number(convertWeightValue(setType.defaultLoad.value, setType.defaultLoad.unit, settings.weightUnit))
          : available(configuredLoad) ? Number(configuredLoad) : "";
        const priorLoad = previousComparableSet ? Number(convertWeightValue(storedResistanceLoad(previousComparableSet, resistanceType), previousComparableSet.weightUnit || settings.weightUnit, settings.weightUnit)) : 0;
        const factualLoad = previousComparableSet ? priorLoad : routineLoad;
        const reductionPercent = target.adjusted ? Math.max(0, Math.min(100, Number(target.loadReductionPercent || 0))) : 0;
        const weight = factualLoad > 0 && reductionPercent > 0
          ? roundToIncrement(
              factualLoad * (resistanceType === "assisted_bodyweight" ? 1 + reductionPercent / 100 : 1 - reductionPercent / 100),
              Number(setType.increment || templateExercise.increment || 1)
            )
          : factualLoad;
        const routineReps = setType.defaultReps ?? templateExercise.defaultReps ?? templateExercise.reps;
        const previousReps = resistanceType === "duration" ? previousComparableSet?.durationSeconds ?? previousComparableSet?.reps
          : resistanceType === "distance" ? previousComparableSet?.distance ?? previousComparableSet?.reps : previousComparableSet?.reps;
        const reps = available(previousReps) ? Number(previousReps) : available(routineReps) ? Number(routineReps) : "";
        const stableRpeMax = Math.max(1, Number(setType.rpeMax || templateExercise.targetRpe || 8));
        const stableRpeMin = Math.max(1, Number(setType.rpeMin || stableRpeMax - 1));
        return {
          sequenceIndex,
          setTypeIndex,
          setType: role,
          weight,
          reps,
          rpe: "",
          repMin: Math.max(1, Number(setType.repMin || templateExercise.repMin || templateExercise.reps || 1)),
          repMax: Math.max(1, Number(setType.repMax || templateExercise.repMax || templateExercise.reps || 1)),
          rpeMin: Math.max(1, Number(setType.rpeMin || stableRpeMin)),
          rpeMax: Math.max(1, Number(setType.rpeMax || stableRpeMax)),
          restSeconds: Math.max(0, Number(setType.restSeconds ?? templateExercise.restSeconds ?? settings.defaultRestSeconds ?? 90)),
          previousComparableSet
        };
      }

      function activeWorkoutHasLoggedProgress(session) {
        if (!session) return false;
        const exerciseIds = new Set(data.exercises.filter((exercise) => exercise.sessionId === session.id).map((exercise) => exercise.id));
        const sessionSets = data.sets.filter((set) => exerciseIds.has(set.exerciseId));
        const recovery = cleanRecovery(session.recovery || {});
        return sessionSets.some((set) => set.completed || set.skipped || set.edited)
          || data.exercises.some((exercise) => exerciseIds.has(exercise.id) && String(exercise.notes || "").trim())
          || Boolean(String(session.notes || "").trim() || recovery.illness || recovery.pain || recovery.readinessDeviation || recovery.soreness || recovery.affectedMuscle || recovery.outsideBandNote);
      }

      function removeEmptyActiveWorkoutForReplacement(session) {
        const exerciseIds = new Set(data.exercises.filter((exercise) => exercise.sessionId === session.id).map((exercise) => exercise.id));
        data = {
          ...data,
          sessions: data.sessions.filter((item) => item.id !== session.id),
          exercises: data.exercises.filter((exercise) => exercise.sessionId !== session.id),
          sets: data.sets.filter((set) => !exerciseIds.has(set.exerciseId))
        };
        activeSessionId = "";
        activeWorkoutId = "";
        activeSetId = "";
        pendingNextSetId = "";
        clearActiveWorkoutDraft();
        invalidateCompletedAnalysis();
      }

      // Pure row-target projection: explicit inputs only; no IDs, engine, storage or observations written.
      // Both the real start and Today/preview construction consume this result.
      function workoutStartRowPreviews(templateExercise, target, previousRoleSets, settings) {
        const resolvedTypes = stableSetTypesForWorkoutStart(templateExercise, target, settings);
        const configuredWarmups = templateExercise.warmups || [];
        const previousWarmups = previousRoleSets.filter((set) => normalizeSetTypeCode(set.setType, set.isWarmup) === "warmup");
        const warmups = configuredWarmups.map((warmup, warmupIndex) => ({ ...warmup,
          sequenceIndex: warmupIndex, sequence: warmupIndex, setTypeIndex: warmupIndex,
          sourceTemplateSetId: warmup.id || templateExercise.id + "-warmup-" + warmupIndex,
          resistanceType: target.resistanceType || templateExercise.resistanceType,
          completed: false, isWarmup: true, setType: "warmup", countsTowardProgression: false,
          previousComparableSet: previousWarmups.find((set) => Number(set.setTypeIndex || 0) === warmupIndex) || previousWarmups[warmupIndex] || null
        }));
        const factualPrefills = [];
        resolvedTypes.forEach((setType) => {
          for (let typeSetIndex = 0; typeSetIndex < setType.setCount; typeSetIndex += 1) {
            factualPrefills.push(factualSetPrefillForWorkoutStart(templateExercise, target, setType, typeSetIndex,
              configuredWarmups.length + factualPrefills.length, previousRoleSets, settings));
          }
        });
        return { warmups, factualPrefills };
      }

      // Prepares unpersisted rows. Start and the read-only preview use the same construction.
      function buildWorkoutStartPlan(template, session) {
        const exercises = [];
        const sets = [];
        let adjustedLiftCount = 0;
        template.exercises.forEach((templateExercise, index) => {
          templateExercise = normalizeStableTemplateExercise(templateExercise);
          const templateResistanceType = templateExercise.resistanceType || inferResistanceType(templateExercise.name, templateExercise);
          const historyTarget = { ...stableTargetForTemplateExercise(templateExercise, { excludeSessionId: session.id, template, resistanceType: templateResistanceType, canonicalExerciseId: templateExercise.performanceExerciseId || canonicalExerciseId(templateExercise), workoutId: session.id }), resistanceType: templateResistanceType, isBodyweight: isBodyweightResistance(templateResistanceType) };
          historyTarget.sets = Math.max(1, Number(historyTarget.sets || templateExercise.sets || 1));
          historyTarget.reps = Math.max(1, Number(historyTarget.reps || templateExercise.reps || 1));
          historyTarget.repLow = Math.max(1, Number(historyTarget.repLow || historyTarget.reps));
          historyTarget.repHigh = Math.max(historyTarget.repLow, Number(historyTarget.repHigh || historyTarget.reps));
          historyTarget.restSeconds = Number(historyTarget.restSeconds || templateExercise.restSeconds || data.settings.defaultRestSeconds || 90);
          const exerciseVariantId = templateExercise.performanceExerciseId || canonicalExerciseId(templateExercise) || templateExercise.id;
          const resolvedAction = resolvedActionForVariant(session.resolvedActions, exerciseVariantId);
          const adjustedTarget = applyResolvedActionToStableTarget(historyTarget, resolvedAction);
          const target = { ...adjustedTarget, resistanceType: adjustedTarget.resistanceType || templateResistanceType, isBodyweight: isBodyweightResistance(adjustedTarget.resistanceType || templateResistanceType) };
          const resolvedResistanceType = target.resistanceType || templateResistanceType;
          if (target.adjusted) adjustedLiftCount += 1;
          const restSeconds = Number(templateExercise.restSeconds);
          const resolvedTypes = stableSetTypesForWorkoutStart(templateExercise, target);
          const exercise = { id: id(), sessionId: session.id, ...(template.source === "strong" ? { source: "strong-template" } : {}), name: templateExercise.name, ...(typeof exerciseIdentityFields === "function" ? exerciseIdentityFields(templateExercise) : {}), primaryMuscle: templateExercise.primaryMuscle || "", secondaryMuscle: templateExercise.secondaryMuscle || "", ...(templateExercise.customExerciseProfile ? { customExerciseProfile: normalizeCustomExerciseProfile(templateExercise.customExerciseProfile) } : {}), notes: "", stableTargetSnapshot: { sets: historyTarget.sets, repLow: historyTarget.repLow, repHigh: historyTarget.repHigh, rpe: historyTarget.rpe, restSeconds: historyTarget.restSeconds }, resolvedActionId: resolvedAction?.decisionId || null, adjustmentReason: target.adjustmentReason || "", manualOverrides: [], order: index, restSeconds, resistanceType: target.resistanceType || templateResistanceType, isBodyweight: isBodyweightResistance(resolvedResistanceType), isDeload: Boolean(target.isDeload) };
          exercises.push(exercise);
          const previousRoleSets = getMostRecentWorkoutSets(templateExercise.name, {
            excludeSessionId: session.id,
            resistanceType: resolvedResistanceType,
            canonicalExerciseId: templateExercise.performanceExerciseId || canonicalExerciseId(templateExercise),
            includeWarmups: true
          });
          const configuredWarmups = templateExercise.warmups || [];
          const { warmups, factualPrefills } = workoutStartRowPreviews(templateExercise, target, previousRoleSets, data.settings);
          warmups.forEach((warmup, warmupIndex) => sets.push(createSet(exercise.id, warmupIndex + 1, warmup)));
          factualPrefills.forEach((prefill, prefillIndex) => {
            const setNumber = prefillIndex + 1;
            const setType = resolvedTypes.find((type) => normalizeSetTypeCode(type.type) === prefill.setType) || {};
            sets.push(createSet(exercise.id, setNumber, { sequenceIndex: prefill.sequenceIndex, sequence: prefill.sequenceIndex, setTypeIndex: prefill.setTypeIndex, sourceTemplateSetId: setType.id || templateExercise.id + "-" + prefill.setType + "-" + prefill.setTypeIndex, reps: prefill.reps, weight: prefill.weight, weightUnit: target.weightUnit, resistanceType: target.resistanceType || templateResistanceType, isBodyweight: isBodyweightResistance(resolvedResistanceType), addedLoad: target.resistanceType === "bodyweight_plus_load" ? prefill.weight : target.addedLoad, assistanceLoad: target.resistanceType === "assisted_bodyweight" ? prefill.weight : target.assistanceLoad, completed: false, isWarmup: false, setType: prefill.setType, countsTowardProgression: setType.countsTowardProgression !== false, targetReps: prefill.reps, targetRepMin: prefill.repMin, targetRepMax: prefill.repMax, targetWeight: prefill.weight, targetRpe: prefill.rpeMax, targetRpeMin: prefill.rpeMin, targetRpeMax: prefill.rpeMax, targetRpeTolerance: setType.rpeTolerance, targetRestSeconds: prefill.restSeconds, originalTargetReps: prefill.reps, originalTargetWeight: prefill.weight, originalTargetRpe: prefill.rpeMax, previousComparableSet: prefill.previousComparableSet }));
          });
        });
        return { exercises, sets, adjustedLiftCount };
      }

      function startTemplate(templateId, recovery = defaultRecovery(), readinessMode = "usual", options = {}) {
        const template = data.templates.find((item) => item.id === templateId);
        if (!template) return;
        if (!Array.isArray(template.exercises) || template.exercises.length === 0) {
          templateStartFlow = null;
          optionalReadinessFlow = null;
          showAppToast("Add at least one exercise before starting this template.");
          render();
          return;
        }
        if (hasActiveWorkout()) {
          const running = activeWorkoutSession();
          if (running?.templateId !== templateId && !activeWorkoutHasLoggedProgress(running)) {
            removeEmptyActiveWorkoutForReplacement(running);
          } else {
          captureDialogFocusOrigin("template");
          templateStartFlow = { templateId, step: "active-conflict", draft: cleanRecovery(recovery) };
          render();
          return;
          }
        }
        recovery = readinessMode === "daily" ? cleanRecovery(recovery) : recoveryForWorkoutStart(templateId, recovery);
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
        session.resolvedActions = measurePerformance("workoutStart:exceptionResolver", () => resolveWorkoutExceptions(session, recovery), { templateId: template.id, hasExplicitSafetyInput: Boolean(recovery.illness || recovery.pain) });
        const { exercises, sets, adjustedLiftCount } = buildWorkoutStartPlan(template, session);
        session.adjustmentSummary = adjustedLiftCount ? adjustedLiftCount + " lift" + (adjustedLiftCount === 1 ? "" : "s") + " adjusted by the resolved exception action." : "";
        session.usedOriginalTargets = Boolean(options.useOriginal);
        delete session.readinessAdjustments;
        delete session.workoutPrescription;
        session.startedAt = isoNow();
        Object.assign(session, startWorkoutDuration(session, session.startedAt));
        activeSessionId = session.id;
        activeWorkoutId = session.id;
        viewingHistorySessionId = "";
        setActiveTab("workout", { renderNow: false });
        templateStartFlow = null;
        optionalReadinessFlow = null;
        todayWorkoutChoice = null;
        todayWorseThanUsual = null;
        todayPreview = null;
        let nextData;
        if (replaceCurrent) {
          const oldExerciseIds = new Set(data.exercises.filter((exercise) => exercise.sessionId === session.id).map((exercise) => exercise.id));
          nextData = {
            ...data,
            sessions: data.sessions.map((item) => item.id === session.id ? session : item),
            exercises: [...data.exercises.filter((exercise) => exercise.sessionId !== session.id), ...exercises],
            sets: [...data.sets.filter((set) => !oldExerciseIds.has(set.exerciseId)), ...sets]
          };
        } else {
          nextData = { ...data, sessions: [session, ...data.sessions], exercises: [...data.exercises, ...exercises], sets: [...data.sets, ...sets] };
        }
        // Runtime identities now exist. Shadow stores only the prescription;
        // gated show mode may reconcile its planned working-row count here.
        nextData = prescribeSessionCoaching(nextData, session.id, template);
        const startedExerciseIds = new Set(exercises.map((exercise) => exercise.id));
        activeSetId = nextData.sets.filter((set) => startedExerciseIds.has(set.exerciseId))
          .sort((a, b) => canonicalSetSequence(a) - canonicalSetSequence(b)).find((set) => !set.completed && !set.skipped)?.id || "";
        activeSetAcknowledged = false;
        activeSetNotice = activeSetId ? "First set is ready" : "";
        commit(nextData, true, { invalidateAnalysis: false });
      }

      function addSet(exerciseId, duplicate) {
        const action = duplicate ? "duplicate-set" : "add-set";
        const authorization = guardWorkoutMutation(action, { exerciseId });
        if (!authorization.allowed) return;
        const exercise = authorization.target.exercise;
        const targetExerciseId = exercise.id;
        const sets = setsForExercise(targetExerciseId);
        const workingSetCount = sets.filter((set) => isWorkingSet(set)).length;
        if (workingSetCount >= 100) {
          showAppToast("An exercise can contain at most 100 working sets.");
          return;
        }
        logWorkoutOverride(exercise, "setCount", workingSetCount, workingSetCount + 1, { action: duplicate ? "duplicate_set" : "add_set" });
        const sequenceIndex = sets.length ? Math.max(...sets.map(canonicalSetSequence)) + 1 : 0;
        const previous = duplicate ? sets[sets.length - 1] : sets.filter((set) => !setTypeSemantics(set).isWarmup).at(-1);
        commit({ ...data, sets: [...data.sets, createSet(targetExerciseId, sets.filter((set) => !setTypeSemantics(set).isWarmup).length + 1, { ...(previous || {}), sequenceIndex, sequence: sequenceIndex, completed: false, skipped: false, edited: false })] }, true, { invalidateAnalysis: authorization.target.authorizationMode === "history_edit", deferPersistence: authorization.target.authorizationMode !== "history_edit" });
      }

      function addWarmupSet(exerciseId, beforeSetId = "") {
        const authorization = guardWorkoutMutation("add-warmup-set", { exerciseId, ...(beforeSetId ? { setId: beforeSetId } : {}) });
        if (!authorization.allowed) return;
        const targetExerciseId = authorization.target.exercise.id;
        const sets = setsForExercise(targetExerciseId);
        const warmups = sets.filter((set) => setTypeSemantics(set).isWarmup);
        if (warmups.length >= 100) {
          showAppToast("An exercise can contain at most 100 warm-up sets.");
          return;
        }
        const beforeSet = beforeSetId ? setById(beforeSetId) : null;
        const sequenceIndex = beforeSet ? canonicalSetSequence(beforeSet) : warmups.length;
        const priorWarmup = warmups.at(-1);
        const shifted = data.sets.map((set) => set.exerciseId === targetExerciseId && canonicalSetSequence(set) >= sequenceIndex ? { ...set, sequenceIndex: canonicalSetSequence(set) + 1, sequence: canonicalSetSequence(set) + 1 } : set);
        const warmupSet = createSet(targetExerciseId, warmups.length + 1, { ...(priorWarmup || {}), sequenceIndex, sequence: sequenceIndex, setTypeIndex: warmups.length, completed: false, skipped: false, edited: false, isWarmup: true, setType: "warmup", countsTowardProgression: false });
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
