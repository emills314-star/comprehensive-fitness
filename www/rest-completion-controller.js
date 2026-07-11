(function attachRestCompletionController(globalScope, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (globalScope) globalScope.RestCompletion = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRestCompletionApi() {
  "use strict";

  const REST_COMPLETION_SCHEMA_VERSION = 1;
  const DEFAULT_AUTO_DISMISS_MS = 5000;
  const STRONG_HAPTIC_PATTERN = Object.freeze([260, 100, 260, 100, 480]);
  const DEFAULT_REST_COMPLETION_SETTINGS = Object.freeze({
    overlayEnabled: true,
    soundEnabled: true,
    hapticsEnabled: true,
    soundId: "sharp_two_tone",
    soundVolume: 0.85,
    autoDismissMs: DEFAULT_AUTO_DISMISS_MS,
    lockScreenNotifications: true,
    autoReturnToWorkout: false
  });

  const SOUND_PATTERNS = Object.freeze({
    sharp_two_tone: Object.freeze([
      Object.freeze({ delay: 0, duration: 0.17, frequency: 880, gain: 0.34, type: "triangle" }),
      Object.freeze({ delay: 0.16, duration: 0.24, frequency: 1318.51, gain: 0.38, type: "triangle" })
    ]),
    clear_bell: Object.freeze([
      Object.freeze({ delay: 0, duration: 0.42, frequency: 1174.66, gain: 0.33, type: "sine" }),
      Object.freeze({ delay: 0.03, duration: 0.5, frequency: 2349.32, gain: 0.16, type: "sine" })
    ]),
    whistle: Object.freeze([
      Object.freeze({ delay: 0, duration: 0.18, frequency: 1396.91, gain: 0.31, type: "square" }),
      Object.freeze({ delay: 0.2, duration: 0.2, frequency: 1760, gain: 0.34, type: "square" })
    ])
  });

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function clone(value) {
    if (value == null) return value;
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch { /* JSON-safe runtime state is cloned below. */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function firstDefined(source, keys, fallback) {
    for (const key of keys) {
      if (source[key] !== undefined) return source[key];
    }
    return fallback;
  }

  function normalizeRestCompletionSettings(settings) {
    const source = settings && typeof settings === "object" ? settings : {};
    const requestedSound = String(firstDefined(source, ["restCompleteSound", "restCompleteSoundId", "timerSoundSelection", "soundId"], DEFAULT_REST_COMPLETION_SETTINGS.soundId));
    const soundId = SOUND_PATTERNS[requestedSound] ? requestedSound : DEFAULT_REST_COMPLETION_SETTINGS.soundId;
    const soundEnabled = Boolean(firstDefined(source, ["restCompleteSoundEnabled", "timerSound", "soundEnabled"], DEFAULT_REST_COMPLETION_SETTINGS.soundEnabled));
    return {
      overlayEnabled: Boolean(firstDefined(source, ["inAppRestAlerts", "restCompleteOverlayEnabled", "overlayEnabled"], DEFAULT_REST_COMPLETION_SETTINGS.overlayEnabled)),
      soundEnabled: requestedSound !== "silent" && soundEnabled,
      hapticsEnabled: Boolean(firstDefined(source, ["restCompleteHapticsEnabled", "timerVibration", "hapticsEnabled"], DEFAULT_REST_COMPLETION_SETTINGS.hapticsEnabled)),
      soundId,
      soundVolume: clamp(finiteNumber(firstDefined(source, ["restCompleteSoundVolume", "timerSoundVolume", "soundVolume"], DEFAULT_REST_COMPLETION_SETTINGS.soundVolume), DEFAULT_REST_COMPLETION_SETTINGS.soundVolume), 0, 1),
      autoDismissMs: clamp(Math.round(finiteNumber(firstDefined(source, ["restCompleteAutoDismissMs", "timerAlertAutoDismissMs", "autoDismissMs"], DEFAULT_AUTO_DISMISS_MS), DEFAULT_AUTO_DISMISS_MS)), 1000, 60000),
      lockScreenNotifications: Boolean(firstDefined(source, ["restCompleteLockScreenNotifications", "timerNotifications", "lockScreenNotifications"], DEFAULT_REST_COMPLETION_SETTINGS.lockScreenNotifications)),
      autoReturnToWorkout: Boolean(firstDefined(source, ["restCompleteAutoReturnToWorkout", "automaticReturnToWorkout", "autoReturnToWorkout"], DEFAULT_REST_COMPLETION_SETTINGS.autoReturnToWorkout))
    };
  }

  function timerCompletionKey(timer) {
    const id = String(timer?.id || timer?.timerId || timer?.notificationId || "").trim();
    if (!id) throw new TypeError("A rest completion requires a stable timer id.");
    const version = Math.max(1, Math.round(finiteNumber(timer?.version ?? timer?.timerVersion, 1)));
    return id + ":" + version;
  }

  function makeClock(clock) {
    const source = clock || {};
    return {
      now: typeof source.now === "function" ? source.now.bind(source) : Date.now,
      setTimeout: typeof source.setTimeout === "function" ? source.setTimeout.bind(source) : setTimeout,
      clearTimeout: typeof source.clearTimeout === "function" ? source.clearTimeout.bind(source) : clearTimeout
    };
  }

  function callSafely(callback, payload) {
    if (typeof callback !== "function") return;
    try {
      const result = callback(payload);
      if (result && typeof result.catch === "function") result.catch(() => undefined);
    } catch {
      // A platform effect must never corrupt timer or workout state.
    }
  }

  class RestCompletionController {
    constructor(options) {
      const source = options || {};
      this.clock = makeClock(source.clock);
      this.effects = source.effects || {};
      this.settings = normalizeRestCompletionSettings(source.settings);
      this.record = null;
      this.dismissHandle = null;
      this.scheduleGeneration = 0;
      this.effectLedger = new Set();
      this.returnLedger = new Set();
    }

    updateSettings(settings) {
      this.settings = normalizeRestCompletionSettings(settings);
      return { ...this.settings };
    }

    complete(timerSnapshot, notice, settings, metadata) {
      const timerInput = clone(timerSnapshot || {});
      const key = timerCompletionKey(timerInput);
      if (settings) this.updateSettings(settings);
      if (this.record?.completionKey === key) return this.getState();

      this._cancelDismissSchedule();
      const meta = metadata || {};
      const now = this.clock.now();
      const suppliedCompletedAt = finiteNumber(meta.completedAt, NaN);
      const endedAt = finiteNumber(timerInput.endsAt, NaN);
      const completedAt = Number.isFinite(suppliedCompletedAt)
        ? suppliedCompletedAt
        : Number.isFinite(endedAt) && endedAt <= now ? endedAt : now;
      const autoDismissAt = completedAt + this.settings.autoDismissMs;
      const overlayVisible = this.settings.overlayEnabled && autoDismissAt > now;
      const id = String(timerInput.id || timerInput.timerId || timerInput.notificationId);
      const version = Math.max(1, Math.round(finiteNumber(timerInput.version ?? timerInput.timerVersion, 1)));

      this.record = {
        schemaVersion: REST_COMPLETION_SCHEMA_VERSION,
        completionKey: key,
        timer: {
          ...timerInput,
          id,
          version,
          remainingSeconds: 0,
          isActive: false,
          isPaused: false,
          status: "completed",
          completedAt
        },
        notice: {
          ...(clone(notice || {})),
          visible: overlayVisible,
          shownAt: overlayVisible ? now : null,
          autoDismissAt,
          dismissedAt: overlayVisible ? null : autoDismissAt,
          dismissReason: overlayVisible ? "" : this.settings.overlayEnabled ? "expired" : "disabled"
        },
        source: String(meta.source || "foreground"),
        settings: { ...this.settings },
        signals: {
          soundAttemptedAt: null,
          hapticAttemptedAt: null,
          notificationAttemptedAt: null,
          systemSignalAlreadyDelivered: Boolean(meta.systemSignalAlreadyDelivered)
        },
        returnedToWorkoutAt: null,
        createdAt: now,
        updatedAt: now
      };

      callSafely(this.effects.onComplete, this.getState());
      this._persist();
      this._deliverSignals(meta);
      if (this.record.notice.visible) {
        callSafely(this.effects.onShow, this.getState());
        this._scheduleAutoDismiss();
      }
      return this.getState();
    }

    reconcile(timerSnapshot, notice, settings, metadata) {
      const timerInput = clone(timerSnapshot || {});
      if (settings) this.updateSettings(settings);
      const now = this.clock.now();
      const endsAt = finiteNumber(timerInput.endsAt, NaN);
      const isRunning = timerInput.isActive !== false && timerInput.isPaused !== true;
      if (isRunning && Number.isFinite(endsAt) && endsAt <= now) {
        return {
          completed: true,
          state: this.complete(timerInput, notice, this.settings, {
            ...(metadata || {}),
            completedAt: finiteNumber(metadata?.completedAt, endsAt),
            source: metadata?.source || "background"
          })
        };
      }
      const remainingSeconds = isRunning && Number.isFinite(endsAt)
        ? Math.max(0, Math.ceil((endsAt - now) / 1000))
        : Math.max(0, Math.round(finiteNumber(timerInput.remainingSeconds, 0)));
      return { completed: false, timer: { ...timerInput, remainingSeconds } };
    }

    completeFromBackground(payload, settings, metadata) {
      const source = payload || {};
      const timer = {
        id: source.timerId || source.notificationId,
        version: source.timerVersion || 1,
        workoutId: source.workoutId || "",
        exerciseId: source.exerciseId || "",
        setId: source.completedSetId || source.setId || "",
        pendingNextSetId: source.nextSetId || source.upcomingSetId || "",
        endsAt: finiteNumber(source.endsAt, this.clock.now()),
        remainingSeconds: 0,
        isActive: true,
        isPaused: false
      };
      const notice = {
        title: source.title || "Rest complete",
        message: source.body || source.message || "Your next set is ready.",
        payload: clone(source)
      };
      return this.complete(timer, notice, settings, {
        requestSystemNotification: true,
        allowForegroundEffects: false,
        ...(metadata || {}),
        source: "background",
        completedAt: finiteNumber(metadata?.completedAt, timer.endsAt)
      });
    }

    restore(snapshot, settings) {
      if (!snapshot || typeof snapshot !== "object") return null;
      if (settings) this.updateSettings(settings);
      const restored = clone(snapshot);
      const key = timerCompletionKey(restored.timer || restored);
      if (this.record?.completionKey === key) return this.getState();

      this._cancelDismissSchedule();
      restored.schemaVersion = REST_COMPLETION_SCHEMA_VERSION;
      restored.completionKey = key;
      restored.settings = normalizeRestCompletionSettings(restored.settings || this.settings);
      restored.signals = {
        soundAttemptedAt: null,
        hapticAttemptedAt: null,
        notificationAttemptedAt: null,
        systemSignalAlreadyDelivered: false,
        ...(restored.signals || {})
      };
      restored.notice = {
        visible: false,
        shownAt: null,
        autoDismissAt: finiteNumber(restored.timer?.completedAt, this.clock.now()) + restored.settings.autoDismissMs,
        dismissedAt: null,
        dismissReason: "",
        ...(restored.notice || {})
      };
      this.record = restored;
      this.settings = { ...restored.settings };
      ["sound", "haptic", "notification"].forEach((signal) => {
        if (restored.signals[signal + "AttemptedAt"] != null) this.effectLedger.add(key + ":" + signal);
      });
      if (restored.returnedToWorkoutAt != null) this.returnLedger.add(key);

      if (this.record.notice.visible) {
        if (this.clock.now() >= this.record.notice.autoDismissAt) this.dismiss("auto", { dismissedAt: this.record.notice.autoDismissAt });
        else {
          callSafely(this.effects.onShow, this.getState());
          this._scheduleAutoDismiss();
        }
      }
      return this.getState();
    }

    sync() {
      if (!this.record?.notice?.visible) return this.getState();
      if (this.clock.now() >= this.record.notice.autoDismissAt) {
        this.dismiss("auto", { dismissedAt: this.record.notice.autoDismissAt });
      } else {
        this._scheduleAutoDismiss();
      }
      return this.getState();
    }

    dismiss(reason, options) {
      if (!this.record?.notice?.visible) return false;
      const dismissReason = String(reason || "manual");
      const details = options || {};
      this._cancelDismissSchedule();
      this.record.notice.visible = false;
      this.record.notice.dismissedAt = finiteNumber(details.dismissedAt, this.clock.now());
      this.record.notice.dismissReason = dismissReason;
      this.record.updatedAt = this.clock.now();
      this._persist();
      callSafely(this.effects.onDismiss, { reason: dismissReason, state: this.getState() });
      if (dismissReason === "auto" && this.record.settings.autoReturnToWorkout) this._returnToWorkout("automatic");
      return true;
    }

    returnToWorkout() {
      if (!this.record) return false;
      this.dismiss("return_to_workout");
      return this._returnToWorkout("button");
    }

    getState() {
      return clone(this.record);
    }

    getVisibleNotice() {
      return this.record?.notice?.visible ? clone(this.record.notice) : null;
    }

    destroy() {
      this._cancelDismissSchedule();
    }

    _deliverSignals(metadata) {
      if (!this.record) return;
      const meta = metadata || {};
      if (meta.systemSignalAlreadyDelivered) return;
      const sourceIsBackground = this.record.source === "background";
      const allowForegroundEffects = meta.allowForegroundEffects !== undefined
        ? Boolean(meta.allowForegroundEffects)
        : !sourceIsBackground;
      if (allowForegroundEffects) {
        if (this.record.settings.soundEnabled) this._attemptSignal("sound", this.effects.playSound);
        if (this.record.settings.hapticsEnabled) this._attemptSignal("haptic", this.effects.playHaptic);
      }
      const shouldNotify = this.record.settings.lockScreenNotifications && (Boolean(meta.requestSystemNotification) || (sourceIsBackground && !allowForegroundEffects));
      if (shouldNotify) this._attemptSignal("notification", this.effects.showSystemNotification);
    }

    _attemptSignal(signal, callback) {
      if (!this.record || typeof callback !== "function") return false;
      const ledgerKey = this.record.completionKey + ":" + signal;
      if (this.effectLedger.has(ledgerKey)) return false;
      this.effectLedger.add(ledgerKey);
      this.record.signals[signal + "AttemptedAt"] = this.clock.now();
      this.record.updatedAt = this.clock.now();
      this._persist();
      callSafely(callback, {
        completionKey: this.record.completionKey,
        record: this.getState(),
        settings: { ...this.record.settings },
        soundId: this.record.settings.soundId,
        soundVolume: this.record.settings.soundVolume,
        hapticPattern: [...STRONG_HAPTIC_PATTERN]
      });
      return true;
    }

    _returnToWorkout(trigger) {
      const key = this.record?.completionKey;
      if (!key || this.returnLedger.has(key)) return false;
      this.returnLedger.add(key);
      this.record.returnedToWorkoutAt = this.clock.now();
      this.record.updatedAt = this.clock.now();
      this._persist();
      callSafely(this.effects.onReturnToWorkout, { trigger, state: this.getState() });
      return true;
    }

    _scheduleAutoDismiss() {
      if (!this.record?.notice?.visible) return;
      this._cancelDismissSchedule();
      const delay = Math.max(0, this.record.notice.autoDismissAt - this.clock.now());
      const generation = ++this.scheduleGeneration;
      this.dismissHandle = this.clock.setTimeout(() => {
        if (generation !== this.scheduleGeneration || !this.record?.notice?.visible) return;
        this.dismissHandle = null;
        if (this.clock.now() >= this.record.notice.autoDismissAt) {
          this.dismiss("auto", { dismissedAt: this.record.notice.autoDismissAt });
        } else {
          this._scheduleAutoDismiss();
        }
      }, delay);
    }

    _cancelDismissSchedule() {
      this.scheduleGeneration += 1;
      if (this.dismissHandle != null) this.clock.clearTimeout(this.dismissHandle);
      this.dismissHandle = null;
    }

    _persist() {
      callSafely(this.effects.onPersist, this.getState());
    }
  }

  function createWebAudioRestSignal(options) {
    const source = options || {};
    const scope = source.scope || (typeof globalThis !== "undefined" ? globalThis : {});
    let context = source.audioContext || null;

    function ensureContext() {
      if (context) return context;
      const AudioContextClass = source.AudioContext || scope.AudioContext || scope.webkitAudioContext;
      if (!AudioContextClass) return null;
      try { context = new AudioContextClass(); } catch { context = null; }
      return context;
    }

    function prime() {
      const activeContext = ensureContext();
      if (!activeContext) return false;
      try {
        if (activeContext.state === "suspended") {
          const result = activeContext.resume();
          if (result && typeof result.catch === "function") result.catch(() => undefined);
        }
        return true;
      } catch {
        return false;
      }
    }

    function play(input) {
      const event = input || {};
      const settings = normalizeRestCompletionSettings(event.settings || event);
      if (!settings.soundEnabled || !prime()) return false;
      const pattern = SOUND_PATTERNS[event.soundId || settings.soundId] || SOUND_PATTERNS.sharp_two_tone;
      try {
        const now = context.currentTime;
        pattern.forEach((note) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const startsAt = now + note.delay;
          const endsAt = startsAt + note.duration;
          oscillator.type = note.type;
          oscillator.frequency.setValueAtTime(note.frequency, startsAt);
          gain.gain.setValueAtTime(0.0001, startsAt);
          gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, note.gain * settings.soundVolume), startsAt + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(startsAt);
          oscillator.stop(endsAt + 0.01);
        });
        return true;
      } catch {
        return false;
      }
    }

    return { play, preview: play, prime, getContext: () => context };
  }

  function createNavigatorHapticPlayer(navigatorObject) {
    const target = navigatorObject || (typeof navigator !== "undefined" ? navigator : null);
    return function playHaptic(event) {
      if (typeof target?.vibrate !== "function") return false;
      try { return target.vibrate(event?.hapticPattern || [...STRONG_HAPTIC_PATTERN]) !== false; }
      catch { return false; }
    };
  }

  function buildRestNotificationOptions(record, settings) {
    const normalized = normalizeRestCompletionSettings(settings || record?.settings);
    const notice = record?.notice || {};
    const timer = record?.timer || {};
    return {
      body: notice.message || notice.body || "Your next set is ready.",
      tag: "comprehensive-fitness-rest-timer",
      renotify: true,
      silent: !normalized.soundEnabled,
      icon: "/resources/icon-192.png",
      badge: "/resources/icon-192.png",
      vibrate: normalized.hapticsEnabled ? [...STRONG_HAPTIC_PATTERN] : [],
      data: {
        ...(clone(notice.payload || {})),
        timerId: timer.id || "",
        timerVersion: timer.version || 1,
        soundId: normalized.soundId,
        soundVolume: normalized.soundVolume
      }
    };
  }

  function createServiceWorkerNotificationEffect(scope) {
    const target = scope || (typeof globalThis !== "undefined" ? globalThis : {});
    return async function showSystemNotification(event) {
      if (!("Notification" in target) || target.Notification.permission !== "granted" || !target.navigator?.serviceWorker) return false;
      try {
        const registration = await target.navigator.serviceWorker.ready;
        const title = event?.record?.notice?.title || "Rest complete";
        await registration.showNotification(title, buildRestNotificationOptions(event?.record, event?.settings));
        return true;
      } catch {
        return false;
      }
    };
  }

  return Object.freeze({
    DEFAULT_AUTO_DISMISS_MS,
    DEFAULT_REST_COMPLETION_SETTINGS,
    REST_COMPLETION_SCHEMA_VERSION,
    SOUND_PATTERNS,
    STRONG_HAPTIC_PATTERN,
    RestCompletionController,
    buildRestNotificationOptions,
    createNavigatorHapticPlayer,
    createServiceWorkerNotificationEffect,
    createWebAudioRestSignal,
    normalizeRestCompletionSettings,
    timerCompletionKey
  });
});
