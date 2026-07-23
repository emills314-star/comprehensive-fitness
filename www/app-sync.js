
      function isStandalonePwa() {
        return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
      }

      function isIosDevice() {
        return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      }

      function validPushIdentityCandidate(candidate) {
        return Boolean(candidate && typeof candidate === "object" && !Array.isArray(candidate) && typeof candidate.installationId === "string" && candidate.installationId.trim());
      }

      function pushIdentityMetadataTime(candidate) {
        if (!validPushIdentityCandidate(candidate)) return 0;
        const values = [candidate.updatedAt, candidate.registeredAt, candidate.testedAt, candidate.deletion?.updatedAt, candidate.deletion?.completedAt];
        return values.reduce((newest, value) => {
          const parsed = typeof value === "string" ? Date.parse(value) : NaN;
          return Number.isFinite(parsed) ? Math.max(newest, parsed) : newest;
        }, 0);
      }

      function pushIdentityDeletionIsPending(candidate) {
        if (!validPushIdentityCandidate(candidate) || typeof candidate.token !== "string" || !candidate.token) return false;
        const deletionStatus = candidate.deletion?.status || "";
        return candidate.status === "deleting" || deletionStatus === "deleting" || deletionStatus === "error" || candidate.deletion?.retryable === true;
      }

      function pushIdentityHasActiveCredential(candidate) {
        if (!validPushIdentityCandidate(candidate) || typeof candidate.token !== "string" || !candidate.token) return false;
        return candidate.status !== "deleted" && candidate.deletion?.status !== "deleted";
      }

      function pushIdentityDeletionIsTerminal(candidate) {
        return validPushIdentityCandidate(candidate) && (candidate.status === "deleted" || candidate.deletion?.status === "deleted");
      }

      function selectRestoredPushIdentity(indexedCandidate, fallbackCandidate) {
        const indexed = validPushIdentityCandidate(indexedCandidate) ? indexedCandidate : null;
        const fallback = validPushIdentityCandidate(fallbackCandidate) ? fallbackCandidate : null;
        if (!indexed) return fallback;
        if (!fallback) return indexed;

        const indexedTime = pushIdentityMetadataTime(indexed);
        const fallbackTime = pushIdentityMetadataTime(fallback);
        if (indexed.installationId === fallback.installationId) {
          const indexedTerminal = pushIdentityDeletionIsTerminal(indexed);
          const fallbackTerminal = pushIdentityDeletionIsTerminal(fallback);
          if (indexedTerminal !== fallbackTerminal) {
            const terminal = indexedTerminal ? indexed : fallback;
            const terminalTime = indexedTerminal ? indexedTime : fallbackTime;
            const competingTime = indexedTerminal ? fallbackTime : indexedTime;
            if (terminalTime > competingTime) return terminal;
          }
        }

        const indexedPending = pushIdentityDeletionIsPending(indexed);
        const fallbackPending = pushIdentityDeletionIsPending(fallback);
        if (indexedPending !== fallbackPending) return indexedPending ? indexed : fallback;

        const indexedCredential = pushIdentityHasActiveCredential(indexed);
        const fallbackCredential = pushIdentityHasActiveCredential(fallback);
        if (indexedCredential !== fallbackCredential) return indexedCredential ? indexed : fallback;

        if (indexedTime !== fallbackTime) return indexedTime > fallbackTime ? indexed : fallback;

        // IndexedDB is authoritative only after equivalent lifecycle strength and
        // metadata freshness have been established. A failed-write journal with a
        // pending bearer already wins above and can never be replaced by a new ID.
        return indexed;
      }

      async function restorePushIdentity() {
        let indexedIdentity = null;
        let fallbackIdentity = null;
        let fallbackPresent = false;
        try { indexedIdentity = await readIndexedValue("push-identity"); } catch { indexedIdentity = null; }
        try {
          const fallbackText = localStorage.getItem(IDENTITY_KEY);
          fallbackPresent = fallbackText != null;
          fallbackIdentity = fallbackText ? JSON.parse(fallbackText) : null;
        } catch { fallbackIdentity = null; }
        pushIdentity = selectRestoredPushIdentity(indexedIdentity, fallbackIdentity);
        if (!pushIdentity?.installationId) {
          pushIdentity = { installationId: id(), deviceId: id(), token: "", status: "disabled" };
          await persistPushIdentity();
        } else if (fallbackPresent) {
          // Reconcile the selected state into IndexedDB before the recovery journal
          // may be removed. persistPushIdentity retains it if the write still fails.
          await persistPushIdentity();
        }
        return pushIdentity;
      }

      async function persistPushIdentity() {
        try {
          await writeIndexedValue("push-identity", pushIdentity);
          localStorage.removeItem(IDENTITY_KEY);
        } catch {
          try { localStorage.setItem(IDENTITY_KEY, JSON.stringify(pushIdentity)); } catch { return false; }
        }
        return true;
      }

      async function deleteRemoteInstallationData(options = {}) {
        const identity = pushIdentity;
        if (!identity?.installationId || !identity?.token) {
          const unavailable = { status: "unavailable", retryable: false, message: "No authorized remote installation is available to delete." };
          settingsMessage = unavailable.message;
          render();
          return unavailable;
        }
        if (window.__cfRemoteDeletionInFlight) return { status: "deleting", retryable: true, inFlight: true };
        window.__cfRemoteDeletionInFlight = true;
        const finish = (result) => {
          window.__cfRemoteDeletionInFlight = false;
          return result;
        };
        const retainedToken = identity.token;
        const retainedInstallationId = identity.installationId;
        const retainedDeviceId = identity.deviceId;
        const scheduleRetry = (delayMs = 5000) => {
          if (options.scheduleRetry === false || typeof window?.setTimeout !== "function") return;
          if (window.__cfRemoteDeletionRetryTimer) window.clearTimeout(window.__cfRemoteDeletionRetryTimer);
          window.__cfRemoteDeletionRetryTimer = window.setTimeout(() => {
            window.__cfRemoteDeletionRetryTimer = 0;
            deleteRemoteInstallationData({ automatic: true });
          }, Math.max(1000, Math.min(300000, Number(delayMs || 5000))));
        };
        try {
          const result = await pushApi("/api/install/delete", { installationId: retainedInstallationId });
          if (result?.status === "deleted") {
            pushIdentity = {
              ...identity,
              installationId: retainedInstallationId,
              deviceId: retainedDeviceId,
              token: "",
              status: "deleted",
              deletion: { status: "deleted", retryable: false, completedAt: isoNow(), message: "Remote installation data was deleted. Local workout data remains on this device." }
            };
            await persistPushIdentity();
            await writeIndexedValue("sync-queue", []).catch(() => undefined);
            settingsMessage = pushIdentity.deletion.message;
            render();
            if (window.__cfRemoteDeletionRetryTimer) window.clearTimeout(window.__cfRemoteDeletionRetryTimer);
            window.__cfRemoteDeletionRetryTimer = 0;
            return finish({ status: "deleted", retryable: false });
          }
          const deleting = {
            status: "deleting",
            retryable: true,
            phase: result?.phase || "cleanup",
            updatedAt: isoNow(),
            message: "Remote deletion is in progress. Authorization is retained only to resume cleanup."
          };
          pushIdentity = { ...identity, installationId: retainedInstallationId, deviceId: retainedDeviceId, token: retainedToken, status: "deleting", deletion: deleting };
          await persistPushIdentity();
          settingsMessage = deleting.message;
          render();
          scheduleRetry(result?.retryAfterMs);
          return finish({ status: "deleting", retryable: true, phase: deleting.phase });
        } catch (error) {
          const statusCode = Number(error?.status || 0);
          const retryable = !statusCode || statusCode === 429 || statusCode >= 500;
          const failed = {
            status: "error",
            retryable,
            updatedAt: isoNow(),
            message: retryable
              ? "Remote deletion was interrupted and will retry while this installation remains authorized."
              : "Remote deletion could not continue. Retry from Settings; local data was not changed."
          };
          pushIdentity = { ...identity, installationId: retainedInstallationId, deviceId: retainedDeviceId, token: retainedToken, status: retryable ? "deleting" : identity.status, deletion: failed };
          await persistPushIdentity();
          settingsMessage = failed.message;
          render();
          if (retryable) scheduleRetry(error?.retryAfterMs);
          return finish({ status: "error", retryable });
        }
      }

      async function fetchPushConfig(force = false) {
        if (pushConfig && !force) return pushConfig;
        try {
          const response = await fetch("/api/push/config", { headers: { Accept: "application/json" } });
          pushConfig = response.ok ? await response.json() : { configured: false, publicKey: "" };
        } catch {
          pushConfig = { configured: false, publicKey: "", offline: true };
        }
        return pushConfig;
      }

      function urlBase64ToUint8Array(value) {
        const padding = "=".repeat((4 - value.length % 4) % 4);
        const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
        const raw = atob(base64);
        return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
      }

      function pushAuthorizationHeaders() {
        return pushIdentity?.token ? { Authorization: "Bearer " + pushIdentity.token } : {};
      }

      async function pushApi(path, body, options = {}) {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...pushAuthorizationHeaders() },
          body: JSON.stringify(body),
          signal: options.signal
        });
        const payload = await response.json().catch(() => ({}));
        const retryAfterValue = String(response.headers?.get?.("Retry-After") || "").trim();
        let retryAfterMs = 0;
        if (/^\d+(?:\.\d+)?$/.test(retryAfterValue)) retryAfterMs = Math.ceil(Number(retryAfterValue) * 1000);
        else if (retryAfterValue) retryAfterMs = Math.max(0, Date.parse(retryAfterValue) - Date.now());
        if (!response.ok) {
          const error = new Error(payload.error || "Notification service request failed.");
          error.status = response.status;
          error.retryAfterMs = retryAfterMs;
          throw error;
        }
        return retryAfterMs ? { ...payload, retryAfterMs } : payload;
      }

      async function registerPushSubscription(subscription, retryWithNewId = true) {
        const body = {
          installationId: pushIdentity.installationId,
          deviceId: pushIdentity.deviceId,
          userId: pushIdentity.installationId,
          subscription: subscription.toJSON()
        };
        try {
          const result = await pushApi("/api/push/register", body);
          pushIdentity = { ...pushIdentity, token: result.token || pushIdentity.token, status: "enabled", registeredAt: isoNow() };
          await persistPushIdentity();
          return true;
        } catch (error) {
          if (retryWithNewId && error.status === 401 && !pushIdentity.token) {
            pushIdentity = { installationId: id(), deviceId: id(), token: "", status: "disabled" };
            await persistPushIdentity();
            return registerPushSubscription(subscription, false);
          }
          throw error;
        }
      }

      async function enablePushNotifications() {
        if (data.settings.timerNotifications === false) commit({ ...data, settings: { ...data.settings, timerNotifications: true } }, false);
        if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
          notificationMessage = "System notifications are unsupported in this browser.";
          render();
          return;
        }
        if (isIosDevice() && !isStandalonePwa()) {
          notificationMessage = "Install this app from Safari using Add to Home Screen before enabling iPhone notifications.";
          render();
          return;
        }
        if (Notification.permission === "denied") {
          notificationMessage = "Permission denied. Open iPhone Settings > Notifications > Comprehensive Fitness to enable Lock Screen and Sounds.";
          pushIdentity = { ...pushIdentity, status: "denied" };
          persistPushIdentity();
          render();
          return;
        }
        const config = await fetchPushConfig(true);
        if (!config.configured || !config.publicKey) {
          notificationMessage = config.offline ? "Connect to the internet to finish notification setup." : "The secure notification service still needs its Vercel environment variables.";
          render();
          return;
        }
        try {
          const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
          if (permission !== "granted") {
            pushIdentity = { ...pushIdentity, status: permission === "denied" ? "denied" : "disabled" };
            await persistPushIdentity();
            notificationMessage = "Notifications were not enabled. The app will not ask again automatically.";
            render();
            return;
          }
          const registration = await navigator.serviceWorker.ready;
          const existing = await registration.pushManager.getSubscription();
          const subscription = existing || await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(config.publicKey)
          });
          await registerPushSubscription(subscription);
          notificationMessage = "Rest notifications are enabled and scheduled securely.";
        } catch (error) {
          notificationMessage = String(error?.message || "Notification setup failed. Try again while online.");
        }
        render();
      }

      function restTimerScheduleKey(timerId, timerVersion = 1) {
        const idValue = String(timerId || "").slice(0, 160);
        const versionValue = Math.max(1, Math.floor(Number(timerVersion || 1)));
        return idValue ? `${idValue}::v${versionValue}` : "";
      }

      async function disablePushNotifications(options = {}) {
        const renderNow = options.renderNow !== false;
        data = { ...data, settings: { ...data.settings, timerNotifications: false, restCompleteLockScreenNotifications: false } };
        try {
          const registration = await navigator.serviceWorker?.ready;
          const subscription = await registration?.pushManager?.getSubscription?.();
          if (subscription) await subscription.unsubscribe();
        } catch { /* Server revocation remains authoritative when available. */ }
        if (!pushIdentity?.token) {
          notificationMessage = "Lock-screen rest notifications are disabled.";
          saveData();
          if (renderNow) render();
          return true;
        }
        if (!navigator.onLine) {
          pushIdentity = { ...pushIdentity, pushRevocationPending: true };
          await persistPushIdentity();
          notificationMessage = "Notifications are disabled locally. Reconnect to finish revoking the server subscription.";
          saveData();
          if (renderNow) render();
          return false;
        }
        try {
          const revokeAll = data.settings.workoutCloudSync !== true;
          await pushApi(revokeAll ? "/api/installation/revoke" : "/api/push/revoke", { installationId: pushIdentity.installationId });
          pushIdentity = revokeAll
            ? { installationId: pushIdentity.installationId, deviceId: pushIdentity.deviceId, token: "", status: "disabled", pushRevocationPending: false, syncRevokedAt: isoNow() }
            : { ...pushIdentity, status: "disabled", pushRevocationPending: false, pushRevokedAt: isoNow() };
          await persistPushIdentity();
          notificationMessage = revokeAll
            ? "Notifications are disabled and the installation credential plus retained cloud data were revoked."
            : "Notifications are disabled and the push subscription was revoked. Optional workout cloud copy remains independently enabled.";
          saveData();
          if (renderNow) render();
          return true;
        } catch (error) {
          pushIdentity = { ...pushIdentity, pushRevocationPending: true };
          await persistPushIdentity();
          notificationMessage = String(error?.message || "Server notification revocation could not be confirmed. Reconnect and try again.");
          saveData();
          if (renderNow) render();
          return false;
        }
      }

      async function reconcilePushRevocation() {
        if (!pushIdentity?.pushRevocationPending || data.settings.timerNotifications === true) return true;
        return disablePushNotifications({ renderNow: false });
      }

      async function scheduleRestPush(timerSnapshot) {
        if (!data.settings.timerNotifications || !pushIdentity?.token || Notification.permission !== "granted" || !navigator.onLine) return false;
        const session = sessionById(timerSnapshot.workoutId) || activeWorkoutSession();
        const exercise = exerciseById(timerSnapshot.exerciseId);
        const upcoming = setById(timerSnapshot.pendingNextSetId);
        try {
          const result = await pushApi("/api/push/schedule", {
            installationId: pushIdentity.installationId,
            notificationId: timerSnapshot.id,
            workoutId: timerSnapshot.workoutId || session?.id,
            exerciseId: upcoming?.exerciseId || timerSnapshot.exerciseId,
            setId: timerSnapshot.setId,
            upcomingSetId: upcoming?.id || "",
            upcomingSetNumber: upcoming?.isWarmup ? "WU" : upcoming?.setNumber || "",
            upcomingSetLabel: upcoming ? setExecutionLabel(upcoming) : "",
            timerVersion: Number(timerSnapshot.version || 1),
            exerciseName: exerciseById(upcoming?.exerciseId)?.name || exercise?.name || "Workout",
            messageDetail: data.settings.notificationMessageDetail,
            restEndTime: timerSnapshot.endsAt
          });
          if (timer?.id === timerSnapshot.id) {
            timer.notificationStatus = result.status;
            timer.serverNotificationId = result.notificationId;
            saveRuntime();
            syncTimerDom();
          }
          return true;
        } catch (error) {
          if (timer?.id === timerSnapshot.id) {
            timer.notificationStatus = navigator.onLine ? "error" : "pending";
            saveRuntime();
            syncTimerDom();
          }
          return false;
        }
      }

      function rememberCanceledRestSchedule(timerId, timerVersion = 1, now = Date.now()) {
        const key = restTimerScheduleKey(timerId, timerVersion);
        if (!key) return "";
        for (const [storedKey, expiresAt] of canceledRestScheduleKeys) if (expiresAt <= now) canceledRestScheduleKeys.delete(storedKey);
        canceledRestScheduleKeys.set(key, now + 26 * 60 * 60 * 1000);
        while (canceledRestScheduleKeys.size > 256) canceledRestScheduleKeys.delete(canceledRestScheduleKeys.keys().next().value);
        return key;
      }

      function restScheduleWasCanceled(timerId, timerVersion = 1, now = Date.now()) {
        const key = restTimerScheduleKey(timerId, timerVersion);
        const expiresAt = canceledRestScheduleKeys.get(key) || 0;
        if (expiresAt <= now) {
          canceledRestScheduleKeys.delete(key);
          return false;
        }
        return true;
      }

      function notifyServiceWorkerOfRestCancellation(timerId, timerVersion) {
        if (!timerId) return;
        navigator.serviceWorker?.controller?.postMessage({ type: "CANCEL_REST_TIMER", timerId, timerVersion: Number(timerVersion || 1) });
      }

      function queueDurableRestCancellation(operation) {
        const write = pushOperationWriteChain.catch(() => undefined).then(async () => {
          let pending = [];
          try { pending = await readIndexedValue("push-operations") || []; } catch { return false; }
          pending = pending.filter((item) => item.notificationId !== operation.notificationId || Number(item.timerVersion || 1) !== Number(operation.timerVersion || 1));
          pending.push(operation);
          try { await writeIndexedValue("push-operations", pending); } catch { return false; }
          return true;
        });
        pushOperationWriteChain = write.catch(() => false);
        return write;
      }

      async function performRestCancellation(operation) {
        if (!operation?.notificationId) return true;
        if (!pushIdentity?.token) return true;
        if (!navigator.onLine) {
          await queueDurableRestCancellation(operation);
          return false;
        }
        try {
          await pushApi("/api/push/cancel", operation);
          return true;
        } catch (error) {
          const statusCode = Number(error?.status || 0);
          if ([409, 410].includes(statusCode)) return true;
          await queueDurableRestCancellation(operation);
          return false;
        }
      }

      function scheduleRestPush(timerSnapshot) {
        const timerVersion = Number(timerSnapshot?.version || timerSnapshot?.timerVersion || 1);
        const scheduleKey = restTimerScheduleKey(timerSnapshot?.id, timerVersion);
        if (!timerSnapshot?.id || restScheduleWasCanceled(timerSnapshot.id, timerVersion)) return Promise.resolve(false);
        if (!data.settings.timerNotifications || !pushIdentity?.token || Notification.permission !== "granted" || !navigator.onLine) return Promise.resolve(false);
        if (restSchedulePromises.has(scheduleKey)) return restSchedulePromises.get(scheduleKey).then((outcome) => outcome.scheduled === true);
        const session = sessionById(timerSnapshot.workoutId) || activeWorkoutSession();
        const exercise = exerciseById(timerSnapshot.exerciseId);
        const upcoming = setById(timerSnapshot.pendingNextSetId);
        const lifecycle = (async () => {
          try {
            const result = await pushApi("/api/push/schedule", {
              installationId: pushIdentity.installationId,
              notificationId: timerSnapshot.id,
              workoutId: timerSnapshot.workoutId || session?.id,
              exerciseId: upcoming?.exerciseId || timerSnapshot.exerciseId,
              setId: timerSnapshot.setId,
              upcomingSetId: upcoming?.id || "",
              upcomingSetNumber: upcoming?.isWarmup ? "WU" : upcoming?.setNumber || "",
              upcomingSetLabel: upcoming ? setExecutionLabel(upcoming) : "",
              timerVersion,
              exerciseName: exerciseById(upcoming?.exerciseId)?.name || exercise?.name || "Workout",
              messageDetail: data.settings.notificationMessageDetail,
              restEndTime: timerSnapshot.endsAt
            });
            const authoritativeNotificationId = result.notificationId || timerSnapshot.id;
            if (restScheduleWasCanceled(timerSnapshot.id, timerVersion)) {
              rememberCanceledRestSchedule(authoritativeNotificationId, timerVersion);
              notifyServiceWorkerOfRestCancellation(authoritativeNotificationId, timerVersion);
              const cancellationConfirmed = await performRestCancellation({
                installationId: pushIdentity?.installationId,
                workoutId: timerSnapshot.workoutId || activeWorkoutId,
                notificationId: authoritativeNotificationId,
                timerVersion,
                reason: "canceled-before-schedule-completed"
              });
              return { scheduled: false, canceled: true, cancellationConfirmed, notificationId: authoritativeNotificationId };
            }
            if (timer?.id === timerSnapshot.id && Number(timer.version || 1) === timerVersion) {
              timer.notificationStatus = result.status;
              timer.serverNotificationId = authoritativeNotificationId;
              saveRuntime();
              syncTimerDom();
            }
            return { scheduled: true, canceled: false, cancellationConfirmed: false, notificationId: authoritativeNotificationId };
          } catch (error) {
            const canceledWhileScheduling = restScheduleWasCanceled(timerSnapshot.id, timerVersion);
            if (canceledWhileScheduling) {
              notifyServiceWorkerOfRestCancellation(timerSnapshot.id, timerVersion);
              await queueDurableRestCancellation({
                installationId: pushIdentity?.installationId,
                workoutId: timerSnapshot.workoutId || activeWorkoutId,
                notificationId: timerSnapshot.id,
                timerVersion,
                reason: "canceled-with-ambiguous-schedule-result"
              });
              return { scheduled: false, canceled: true, cancellationConfirmed: false, notificationId: timerSnapshot.id };
            }
            if (timer?.id === timerSnapshot.id && Number(timer.version || 1) === timerVersion) {
              timer.notificationStatus = navigator.onLine ? "error" : "pending";
              saveRuntime();
              syncTimerDom();
            }
            return { scheduled: false, canceled: false, cancellationConfirmed: false, notificationId: timerSnapshot.id };
          }
        })();
        restSchedulePromises.set(scheduleKey, lifecycle);
        lifecycle.finally(() => { if (restSchedulePromises.get(scheduleKey) === lifecycle) restSchedulePromises.delete(scheduleKey); }).catch(() => undefined);
        return lifecycle.then((outcome) => outcome.scheduled === true);
      }

      async function cancelRestPush(timerSnapshot, reason = "canceled") {
        if (!timerSnapshot?.id) return false;
        const timerVersion = Number(timerSnapshot.version || timerSnapshot.timerVersion || 1);
        const scheduleKey = typeof restTimerScheduleKey === "function" ? restTimerScheduleKey(timerSnapshot.id, timerVersion) : `${timerSnapshot.id}::v${timerVersion}`;
        if (typeof rememberCanceledRestSchedule === "function") rememberCanceledRestSchedule(timerSnapshot.id, timerVersion);
        navigator.serviceWorker?.controller?.postMessage({ type: "CANCEL_REST_TIMER", timerId: timerSnapshot.id, timerVersion });
        if (timerSnapshot.serverNotificationId && timerSnapshot.serverNotificationId !== timerSnapshot.id) navigator.serviceWorker?.controller?.postMessage({ type: "CANCEL_REST_TIMER", timerId: timerSnapshot.serverNotificationId, timerVersion });
        const sendCancellation = typeof performRestCancellation === "function" ? performRestCancellation : async (operation) => {
          if (!pushIdentity?.token) return true;
          if (!navigator.onLine) {
            let pending = [];
            try { pending = await readIndexedValue("push-operations") || []; } catch { return false; }
            pending = pending.filter((item) => item.notificationId !== operation.notificationId || Number(item.timerVersion || 1) !== operation.timerVersion);
            pending.push(operation);
            await writeIndexedValue("push-operations", pending).catch(() => undefined);
            return false;
          }
          try { await pushApi("/api/push/cancel", operation); return true; }
          catch (error) {
            const statusCode = Number(error?.status || 0);
            if ([409, 410].includes(statusCode)) return true;
            let pending = [];
            try { pending = await readIndexedValue("push-operations") || []; } catch { return false; }
            pending = pending.filter((item) => item.notificationId !== operation.notificationId || Number(item.timerVersion || 1) !== operation.timerVersion);
            pending.push(operation);
            await writeIndexedValue("push-operations", pending).catch(() => undefined);
            return false;
          }
        };
        const inFlightSchedule = typeof restSchedulePromises !== "undefined" ? restSchedulePromises.get(scheduleKey) : null;
        if (inFlightSchedule) {
          const outcome = await inFlightSchedule;
          if (outcome.canceled) return outcome.cancellationConfirmed;
          if (!outcome.scheduled) return true;
          const authoritativeNotificationId = outcome.notificationId || timerSnapshot.serverNotificationId || timerSnapshot.id;
          if (typeof rememberCanceledRestSchedule === "function") rememberCanceledRestSchedule(authoritativeNotificationId, timerVersion);
          navigator.serviceWorker?.controller?.postMessage({ type: "CANCEL_REST_TIMER", timerId: authoritativeNotificationId, timerVersion });
          return sendCancellation({ installationId: pushIdentity?.installationId, workoutId: timerSnapshot.workoutId || activeWorkoutId, notificationId: authoritativeNotificationId, timerVersion, reason });
        }
        return sendCancellation({
          installationId: pushIdentity?.installationId,
          workoutId: timerSnapshot.workoutId || activeWorkoutId,
          notificationId: timerSnapshot.serverNotificationId || timerSnapshot.id,
          timerVersion,
          reason
        });
      }

      async function flushPendingPushOperations() {
        if (!navigator.onLine || !pushIdentity?.token) return;
        let pending = [];
        try { pending = await readIndexedValue("push-operations") || []; } catch { return; }
        const remaining = [];
        for (const operation of pending) {
          try { await pushApi("/api/push/cancel", operation); }
          catch (error) {
            const statusCode = Number(error?.status || 0);
            if (!statusCode || statusCode === 429 || statusCode >= 500) remaining.push(operation);
          }
        }
        await writeIndexedValue("push-operations", remaining).catch(() => undefined);
      }

      async function sendTestPushNotification() {
        if (!pushIdentity?.token || Notification.permission !== "granted") {
          notificationMessage = "Enable rest notifications before sending a test.";
          render();
          return;
        }
        try {
          await pushApi("/api/push/test", { installationId: pushIdentity.installationId });
          pushIdentity = { ...pushIdentity, testedAt: isoNow() };
          await persistPushIdentity();
          notificationMessage = "Test sent. Lock the phone or switch apps to confirm delivery.";
        } catch (error) {
          notificationMessage = String(error?.message || "Test notification failed.");
        }
        render();
      }

      async function clearWorkoutSyncQueue() {
        await writeIndexedValue("sync-queue", []).catch(() => undefined);
        window.clearTimeout(syncFlushTimer);
        syncFlushTimer = 0;
      }

      async function ensureInstallationAuthorization() {
        if (pushIdentity?.token) return true;
        const result = await pushApi("/api/sync/authorize", {
          installationId: pushIdentity.installationId,
          deviceId: pushIdentity.deviceId
        });
        pushIdentity = { ...pushIdentity, token: result.token || "" };
        await persistPushIdentity();
        return Boolean(pushIdentity.token);
      }

      async function reconcileWorkoutSyncConsent() {
        if (data.settings.cloudWorkoutSyncConsent === true) return true;
        if (["deleting", "deleted"].includes(String(pushIdentity?.status || "")) || ["deleting", "deleted"].includes(String(pushIdentity?.deletion?.status || ""))) return true;
        if (!pushIdentity?.token || (pushIdentity.syncRevokedAt && !pushIdentity.syncRevocationPending)) return true;
        return setCloudWorkoutSyncConsent(false, { renderNow: false, reconcile: true });
      }

      function workoutSyncConsentIsCurrent(epoch = syncConsentEpoch) {
        return data.settings.cloudWorkoutSyncConsent === true && Number(epoch) === Number(syncConsentEpoch);
      }

      function trackWorkoutSyncOperation(operation) {
        activeWorkoutSyncOperations.add(operation);
        operation.finally(() => activeWorkoutSyncOperations.delete(operation)).catch(() => undefined);
        return operation;
      }

      function queueActiveWorkoutSync(expectedEpoch) {
        const epoch = Number(expectedEpoch ?? (typeof syncConsentEpoch === "number" ? syncConsentEpoch : 0));
        const consentIsCurrent = () => data.settings.cloudWorkoutSyncConsent === true && (typeof syncConsentEpoch !== "number" || Number(epoch) === Number(syncConsentEpoch));
        if (!consentIsCurrent()) return Promise.resolve(false);
        const operation = (async () => {
          if (!consentIsCurrent()) return false;
          const session = activeWorkoutSession() || (completedSummarySessionId ? data.sessions.find((item) => item.id === completedSummarySessionId) : null);
          if (!session || !consentIsCurrent()) return false;
          const index = dataEntityIndex();
          const exercises = (index.exerciseIndicesBySession.get(session.id) || []).map((exerciseIndex) => data.exercises[exerciseIndex]);
          const payload = {
            session,
            exercises,
            sets: exercises.flatMap((exercise) => (index.setIndicesByExercise.get(exercise.id) || []).map((setIndex) => data.sets[setIndex]))
          };
          if (!consentIsCurrent()) return false;
          let queue = [];
          try { queue = await readIndexedValue("sync-queue") || []; } catch { return false; }
          if (!consentIsCurrent()) return false;
          queue = queue.filter((item) => item.sessionId !== session.id);
          queue.push({ mutationId: id(), sessionId: session.id, revision: isoNow(), payload });
          if (!consentIsCurrent()) return false;
          try { await writeIndexedValue("sync-queue", queue); } catch { return false; }
          if (!consentIsCurrent()) return false;
          window.clearTimeout(syncFlushTimer);
          if (!consentIsCurrent()) return false;
          syncFlushTimer = window.setTimeout(() => {
            syncFlushTimer = 0;
            if (consentIsCurrent()) flushWorkoutSyncQueue(epoch);
          }, 900);
          if (!consentIsCurrent()) {
            window.clearTimeout(syncFlushTimer);
            syncFlushTimer = 0;
            return false;
          }
          return true;
        })();
        return typeof trackWorkoutSyncOperation === "function" ? trackWorkoutSyncOperation(operation) : operation;
      }

      function flushWorkoutSyncQueue(expectedEpoch) {
        const epoch = Number(expectedEpoch ?? (typeof syncConsentEpoch === "number" ? syncConsentEpoch : 0));
        const consentIsCurrent = () => data.settings.cloudWorkoutSyncConsent === true && (typeof syncConsentEpoch !== "number" || Number(epoch) === Number(syncConsentEpoch));
        if (!consentIsCurrent() || !navigator.onLine || !pushIdentity?.token) return Promise.resolve(false);
        const operation = (async () => {
          if (!consentIsCurrent()) return false;
          let queue = [];
          try { queue = await readIndexedValue("sync-queue") || []; } catch { return false; }
          if (!consentIsCurrent()) return false;
          const remaining = [];
          for (const mutation of queue) {
            if (!consentIsCurrent()) return false;
            const controller = typeof AbortController === "function" ? new AbortController() : null;
            if (controller && typeof activeWorkoutSyncAbortControllers !== "undefined") activeWorkoutSyncAbortControllers.add(controller);
            try {
              if (!consentIsCurrent()) {
                controller?.abort();
                return false;
              }
              await pushApi("/api/sync/workout", { installationId: pushIdentity.installationId, ...mutation }, { signal: controller?.signal });
              if (!consentIsCurrent()) return false;
            } catch (error) {
              if (!consentIsCurrent() || error?.name === "AbortError") return false;
              remaining.push(mutation);
            } finally {
              if (controller && typeof activeWorkoutSyncAbortControllers !== "undefined") activeWorkoutSyncAbortControllers.delete(controller);
            }
          }
          if (!consentIsCurrent()) return false;
          try { await writeIndexedValue("sync-queue", remaining); } catch { return false; }
          if (!consentIsCurrent()) return false;
          return true;
        })();
        return typeof trackWorkoutSyncOperation === "function" ? trackWorkoutSyncOperation(operation) : operation;
      }

      function setCloudWorkoutSyncConsent(consent, options = {}) {
        const requestedConsent = consent === true;
        syncConsentEpoch += 1;
        const epoch = syncConsentEpoch;
        window.clearTimeout(syncFlushTimer);
        syncFlushTimer = 0;
        activeWorkoutSyncAbortControllers.forEach((controller) => controller.abort());
        const commitConsent = (enabled, shouldRender = options.renderNow !== false) => commit({
          ...data,
          settings: {
            ...data.settings,
            cloudWorkoutSyncConsent: enabled,
            workoutCloudSync: enabled,
            workoutCloudSyncConsentVersion: enabled ? 1 : 0
          }
        }, shouldRender);
        if (!requestedConsent) commitConsent(false);
        const priorOperations = [...activeWorkoutSyncOperations];
        const transition = syncConsentTransition.catch(() => undefined).then(async () => {
          if (priorOperations.length) await Promise.allSettled(priorOperations);
          if (!requestedConsent) {
            try { await writeIndexedValue("app-data", data); }
            catch {
              settingsMessage = "Workout cloud copy is off in memory, but that choice could not be saved durably. Export a backup and retry before reloading.";
              if (options.renderNow !== false) render();
              return false;
            }
            try { await clearWorkoutSyncQueue(); }
            catch {
              settingsMessage = "Workout upload is off, but the pending upload queue could not be cleared. Keep the app open and try again before clearing local data.";
              if (options.renderNow !== false) render();
              return false;
            }
            if (!pushIdentity?.token) return true;
            if (!navigator.onLine) {
              pushIdentity = { ...pushIdentity, syncRevocationPending: true };
              await persistPushIdentity();
              settingsMessage = "Workout cloud copy is off on this device. Reconnect to finish deleting any retained server copy.";
              if (options.renderNow !== false) render();
              return false;
            }
            try {
              await pushApi("/api/sync/consent", { installationId: pushIdentity.installationId, enabled: false });
              pushIdentity = { ...pushIdentity, syncRevokedAt: isoNow(), syncRevocationPending: false };
              await persistPushIdentity();
              if (!options.reconcile) settingsMessage = "Workout cloud copy is off and retained workout copies were deleted.";
              if (options.renderNow !== false) render();
            } catch {
              pushIdentity = { ...pushIdentity, syncRevocationPending: true };
              await persistPushIdentity();
              settingsMessage = "Workout cloud copy is off locally, but server deletion is still pending. Reconnect and retry before clearing local data.";
              if (options.renderNow !== false) render();
              return false;
            }
            return true;
          }
          if (Number(epoch) !== Number(syncConsentEpoch)) return false;
          if (!navigator.onLine) {
            settingsMessage = "Connect to the internet to enable workout cloud copy.";
            if (options.renderNow !== false) render();
            return false;
          }
          try {
            await ensureInstallationAuthorization();
            if (Number(epoch) !== Number(syncConsentEpoch)) return false;
            await pushApi("/api/sync/consent", { installationId: pushIdentity.installationId, enabled: true });
          } catch (error) {
            commitConsent(false);
            settingsMessage = String(error?.message || "Workout cloud copy could not be enabled.");
            if (options.renderNow !== false) render();
            return false;
          }
          if (Number(epoch) !== Number(syncConsentEpoch)) return false;
          pushIdentity = { ...pushIdentity, syncRevokedAt: "", syncRevocationPending: false };
          await persistPushIdentity();
          commitConsent(true, false);
          try { await writeIndexedValue("app-data", data); }
          catch {
            commitConsent(false);
            settingsMessage = "Workout cloud copy consent could not be saved durably, so uploads remain off.";
            if (options.renderNow !== false) render();
            return false;
          }
          if (options.renderNow !== false) render();
          const queued = await queueActiveWorkoutSync(epoch);
          if (!workoutSyncConsentIsCurrent(epoch)) return false;
          settingsMessage = "Workout cloud copy is on. Active workout changes may now be uploaded.";
          if (options.renderNow !== false) render();
          return queued;
        });
        syncConsentTransition = transition.catch(() => false);
        return transition;
      }

      function restNavigationPayload(timerSnapshot, nextOverride = null) {
        const next = nextOverride || data.sets.find((set) => set.id === timerSnapshot?.pendingNextSetId) || null;
        return {
          navigationVersion: 1,
          timerId: timerSnapshot?.id || "",
          notificationId: timerSnapshot?.serverNotificationId || timerSnapshot?.id || "",
          timerVersion: Number(timerSnapshot?.version || 1),
          workoutId: timerSnapshot?.workoutId || activeWorkoutId || "",
          exerciseId: next?.exerciseId || timerSnapshot?.exerciseId || "",
          completedSetId: timerSnapshot?.setId || "",
          nextSetId: next?.id || "",
          endsAt: Number(timerSnapshot?.endsAt || 0)
        };
      }

      function restCompletionUrl(payload = {}) {
        const params = new URLSearchParams({
          rest: "complete",
          workoutId: payload.workoutId || "",
          exerciseId: payload.exerciseId || "",
          completedSetId: payload.completedSetId || "",
          nextSetId: payload.nextSetId || "",
          timerId: payload.timerId || "",
          notificationId: payload.notificationId || payload.timerId || "",
          timerVersion: String(payload.timerVersion || 1)
        });
        return "/?" + params.toString() + "#lift";
      }

      function setRestNavigationState(timerSnapshot, status, nextOverride = null) {
        restNavigationState = { ...restNavigationPayload(timerSnapshot, nextOverride), status, updatedAt: isoNow() };
        return restNavigationState;
      }

      function nextSetForRestPayload(payload) {
        const requested = data.sets.find((set) => set.id === payload?.nextSetId);
        const requestedExercise = requested && data.exercises.find((exercise) => exercise.id === requested.exerciseId);
        if (requested && requestedExercise?.sessionId === payload.workoutId && !requested.completed && !requested.skipped) return requested;
        const completed = data.sets.find((set) => set.id === payload?.completedSetId);
        if (completed) return nextIncompleteSet(completed.id);
        return orderedActiveSets().find((set) => !set.completed && !set.skipped) || null;
      }

      async function navigateToRestCompletion(payload = {}, options = {}) {
        const workout = data.sessions.find((session) => session.id === payload.workoutId);
        const stateMatches = restNavigationState && restNavigationState.timerId === payload.timerId && Number(restNavigationState.timerVersion || 1) === Number(payload.timerVersion || 1);
        if (!workout || isSessionSubmitted(workout) || workout.id !== activeWorkoutId || !sessionHasStarted(workout) || !stateMatches || restNavigationState.status === "canceled") {
          restCompletionController?.dismiss("stale_workout");
          timerCompleteNotice = null;
          saveRuntime();
          showAppToast("This workout is no longer active.");
          return false;
        }
        if (timer && timer.id === payload.timerId && Number(timer.version || 1) === Number(payload.timerVersion || 1) && Number(timer.endsAt || 0) <= Date.now()) {
          timer.remainingSeconds = 0;
          completeTimer({ suppressSystemAlert: true, suppressScroll: true });
        }
        const next = nextSetForRestPayload(payload);
        activeSessionId = workout.id;
        viewingHistorySessionId = "";
        pendingNextSetId = "";
        restCompletionController?.dismiss("navigated");
        timerCompleteNotice = null;
        if (next) setActiveSet(next.id, setExecutionLabel(next) + " is ready", false);
        else {
          activeSetId = "";
          activeSetNotice = "Workout sets complete";
          pendingSubmitSessionId = workout.id;
        }
        setActiveTab("today", { replace: true, renderNow: false });
        saveRuntime();
        render();
        if (!options.silent) showAppToast(next ? setExecutionLabel(next) + " is ready." : "All sets are complete.");
        return true;
      }

      function startTimer(exerciseId, setId, options = {}) {
        const authorization = guardWorkoutMutation("start-timer", { exerciseId, setId });
        if (!authorization.allowed) return false;
        const exercise = authorization.target.exercise;
        const set = authorization.target.set;
        const requestedNext = options.pendingNextSetId ? setById(options.pendingNextSetId) : null;
        const requestedNextExercise = requestedNext ? exerciseById(requestedNext.exerciseId) : null;
        if (options.pendingNextSetId && (!requestedNext || requestedNextExercise?.sessionId !== authorization.target.session.id)) return false;
        const previousTimer = timer ? { ...timer } : null;
        window.clearInterval(timerInterval);
        releaseTimerWakeLock();
        if (previousTimer) cancelRestPush(previousTimer, "replaced");
        const seconds = Number(options.seconds || set?.targetRestSeconds || exercise?.restSeconds || data.settings.defaultRestSeconds || 90);
        const next = requestedNext || (set?.completed || set?.skipped ? nextIncompleteSet(set.id) : set);
        restCompletionController?.dismiss("replaced_by_new_timer");
        timerCompleteNotice = null;
        measurePerformance("timer:primeAlerts", () => primeTimerAlerts());
        measurePerformance("timer:requestWakeLock", () => requestTimerWakeLock());
        pendingNextSetId = next?.id || "";
        if (pendingNextSetId) activeSetId = "";
        timer = {
          id: id(),
          version: Number(previousTimer?.version || 0) + 1,
          workoutId: activeWorkoutId || exercise?.sessionId || "",
          exerciseId: exercise.id,
          setId: set.id,
          pendingNextSetId,
          durationSeconds: seconds,
          remainingSeconds: seconds,
          endsAt: Date.now() + seconds * 1000,
          isActive: true,
          isPaused: false,
          notificationStatus: data.settings.timerNotifications ? "pending" : "disabled"
        };
        setRestNavigationState(timer, "active", next);
        startTimerInterval();
        measurePerformance("timer:saveRuntime", () => saveRuntime());
        if (options.deferRender) {
          measurePerformance("timer:updateDom", () => {
            const block = document.getElementById("set-" + setId);
            block?.classList.add("resting-set");
            if (block && !block.querySelector(".timer-bar")) block.insertAdjacentHTML("beforeend", renderTimer(setId));
            updateWorkoutStatusDom();
          });
        } else render();
        measurePerformance("timer:schedulePush", () => scheduleRestPush({ ...timer }));
      }

      function startTimerInterval() {
        window.clearInterval(timerInterval);
        timerInterval = window.setInterval(() => {
          if (!timer || timer.isPaused || !timer.isActive) return;
          timer.remainingSeconds = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
          if (timer.remainingSeconds === 0) {
            completeTimer();
            return;
          }
          updateTimerDisplay();
        }, 1000);
      }

      function updateTimerDisplay() {
        if (!timer) return;
        const selector = '.timer-bar[data-timer-id="' + CSS.escape(timer.id) + '"]';
        const bar = document.querySelector(selector);
        if (!bar) return;
        const countdown = bar.querySelector("[data-timer-countdown]");
        const progressLabel = bar.querySelector("[data-timer-progress-label]");
        const progress = bar.querySelector(".timer-progress");
        const elapsed = Math.max(0, timer.durationSeconds - timer.remainingSeconds);
        const percent = timer.durationSeconds > 0 ? Math.min(100, Math.round((elapsed / timer.durationSeconds) * 100)) : 100;
        if (countdown) countdown.textContent = formatTimer(timer.remainingSeconds);
        if (progressLabel) progressLabel.textContent = formatTimer(timer.remainingSeconds) + " remaining";
        if (progress) {
          progress.setAttribute("aria-valuenow", String(percent));
          progress.style.setProperty("--timer-progress", percent + "%");
        }
      }

      function toggleTimer() {
        if (!timer || timer.remainingSeconds === 0) return;
        timer.isPaused = !timer.isPaused;
        if (timer.isPaused) {
          timer.remainingSeconds = Math.max(1, Math.ceil((timer.endsAt - Date.now()) / 1000));
          cancelRestPush({ ...timer }, "paused");
          timer.notificationStatus = "paused";
          setRestNavigationState(timer, "paused");
          releaseTimerWakeLock();
        } else {
          primeTimerAlerts();
          requestTimerWakeLock();
          timer.id = id();
          timer.version = Number(timer.version || 1) + 1;
          timer.endsAt = Date.now() + timer.remainingSeconds * 1000;
          timer.notificationStatus = data.settings.timerNotifications ? "pending" : "disabled";
          startTimerInterval();
          scheduleRestPush({ ...timer });
          setRestNavigationState(timer, "active");
        }
        saveRuntime();
        syncTimerDom();
      }

      function adjustTimer(secondsDelta) {
        const interactionStartedAt = performanceNow();
        if (!timer || timer.isPaused) return;
        const previous = { ...timer };
        const remaining = Math.max(5, Math.ceil((timer.endsAt - Date.now()) / 1000) + Number(secondsDelta));
        cancelRestPush(previous, "adjusted");
        timer.id = id();
        timer.version = Number(timer.version || 1) + 1;
        timer.remainingSeconds = remaining;
        timer.durationSeconds = Math.max(timer.durationSeconds + Number(secondsDelta), remaining);
        timer.endsAt = Date.now() + remaining * 1000;
        timer.notificationStatus = data.settings.timerNotifications ? "pending" : "disabled";
        setRestNavigationState(timer, "active");
        saveRuntime();
        syncTimerDom();
        scheduleRestPush({ ...timer });
        recordPerformance("interaction:adjustTimer", interactionStartedAt, { secondsDelta });
      }

      function cancelTimer(reason = "canceled", advance = true) {
        if (!timer) return;
        const previous = { ...timer };
        window.clearInterval(timerInterval);
        timerInterval = 0;
        releaseTimerWakeLock();
        cancelRestPush(previous, reason);
        const next = setById(previous.pendingNextSetId);
        setRestNavigationState(previous, "canceled", next);
        timer = null;
        pendingNextSetId = "";
        if (advance && next && data.settings.autoHighlightNextSet !== false) {
          setActiveSet(next.id, reason === "skipped" ? "Rest skipped - " + setExecutionLabel(next) + " is ready" : setExecutionLabel(next) + " is ready", false);
        } else {
          ensureActiveSet();
        }
        saveRuntime();
        removeTimerDom(previous);
        if (activeSetId) applyCurrentSetVisual(activeSetId, activeSetNotice || "Current set");
        else updateWorkoutStatusDom();
      }

      function completeTimer(options = {}) {
        if (!timer || timer.remainingSeconds > 0 || !timer.isActive) return;
        const completedTimer = { ...timer };
        window.clearInterval(timerInterval);
        timerInterval = 0;
        releaseTimerWakeLock();
        const exercise = data.exercises.find((item) => item.id === completedTimer.exerciseId);
        const next = data.sets.find((set) => set.id === completedTimer.pendingNextSetId) || nextIncompleteSet(completedTimer.setId);
        const nextExercise = next ? data.exercises.find((item) => item.id === next.exerciseId) : null;
        const readyText = next ? setExecutionLabel(next) + " is ready" : "Workout sets complete";
        pendingNextSetId = "";
        if (data.settings.autoHighlightNextSet !== false) setActiveSet(next?.id || "", readyText, false);
        else setActiveSet("", readyText, true);
        const navigation = setRestNavigationState(completedTimer, "completed", next);
        timer = null;
        const completionNotice = { title: "Rest complete", exerciseName: nextExercise?.name || exercise?.name || "Workout", setNumber: next?.setNumber || "", setLabel: next ? setExecutionLabel(next) : "", message: next ? readyText : "Time to finish the workout", payload: navigation };
        const systemSignalAlreadyDelivered = Boolean(options.systemSignalAlreadyDelivered || (completedTimer.backgroundedAt && completedTimer.endsAt <= Date.now() && completedTimer.notificationStatus === "scheduled"));
        if (restCompletionController) {
          restCompletionState = restCompletionController.complete(completedTimer, completionNotice, data.settings, {
            source: completedTimer.backgroundedAt ? "background" : "foreground",
            allowForegroundEffects: document.visibilityState === "visible" && !systemSignalAlreadyDelivered,
            requestSystemNotification: !options.suppressSystemAlert && completedTimer.notificationStatus !== "scheduled",
            systemSignalAlreadyDelivered
          });
          timerCompleteNotice = restCompletionState?.notice?.visible ? restCompletionState.notice : null;
        } else {
          timerCompleteNotice = data.settings.inAppRestAlerts !== false ? completionNotice : null;
          playTimerCompletionSound();
          if (data.settings.timerVibration && navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 450]);
          if (!options.suppressSystemAlert && completedTimer.notificationStatus !== "scheduled") sendRestTimerNotification(completionNotice, next?.id || "", nextExercise?.id || exercise?.id || "");
        }
        if (completedTimer.notificationStatus === "scheduled") cancelRestPush(completedTimer, "foreground-completed");
        saveRuntime();
        render();
      }

      function scheduleActiveSetScroll(setId) {
        window.setTimeout(() => {
          const activeElement = document.activeElement;
          if (activeElement && /INPUT|TEXTAREA|SELECT/.test(activeElement.tagName)) return;
          const block = document.getElementById("set-" + setId);
          if (!block) return;
          block.scrollIntoView({ behavior: preferredScrollBehavior(), block: "center" });
        }, 80);
      }

      function primeTimerAlerts(force = false) {
        if (!force && !data.settings.timerSound) return;
        restAudioSignal?.prime();
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (!AudioContextClass) return;
          if (!timerAudioContext) timerAudioContext = new AudioContextClass();
          if (timerAudioContext.state === "suspended") timerAudioContext.resume();
        } catch {
          timerAudioContext = null;
        }
      }

      function playTimerCompletionSound() {
        if (!data.settings.timerSound) return;
        if (restAudioSignal) {
          restAudioSignal.play({ settings: data.settings });
          return;
        }
        primeTimerAlerts(true);
        if (!timerAudioContext) return;
        try {
          const now = timerAudioContext.currentTime;
          [0, 0.22, 0.44].forEach((delay, index) => {
            const oscillator = timerAudioContext.createOscillator();
            const gain = timerAudioContext.createGain();
            oscillator.type = "sine";
            oscillator.frequency.value = index === 2 ? 1046 : 784;
            gain.gain.setValueAtTime(0.0001, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.24, now + delay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.17);
            oscillator.connect(gain);
            gain.connect(timerAudioContext.destination);
            oscillator.start(now + delay);
            oscillator.stop(now + delay + 0.18);
          });
        } catch {
          return;
        }
      }

      function playWorkoutCompletionSound(hasPr = false) {
        if (data.settings.workoutCompletionSound === false) return;
        primeTimerAlerts(true);
        if (!timerAudioContext) return;
        try {
          const now = timerAudioContext.currentTime;
          const notes = hasPr ? [523, 659, 784, 1046] : [523, 659, 784];
          notes.forEach((frequency, index) => {
            const delay = index * 0.13;
            const oscillator = timerAudioContext.createOscillator();
            const gain = timerAudioContext.createGain();
            oscillator.type = "sine";
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.16, now + delay + 0.018);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.16);
            oscillator.connect(gain);
            gain.connect(timerAudioContext.destination);
            oscillator.start(now + delay);
            oscillator.stop(now + delay + 0.17);
          });
        } catch {
          return;
        }
      }

      // WORKOUT_GRADING_ENGINE_START
      const WORKOUT_GRADE_THRESHOLDS = [
        { minimum: 97, grade: "A+" },
        { minimum: 93, grade: "A" },
        { minimum: 90, grade: "A-" },
        { minimum: 87, grade: "B+" },
        { minimum: 83, grade: "B" },
        { minimum: 80, grade: "B-" },
        { minimum: 77, grade: "C+" },
        { minimum: 73, grade: "C" },
        { minimum: 70, grade: "C-" },
        { minimum: 60, grade: "D" },
        { minimum: 0, grade: "F" }
      ];
