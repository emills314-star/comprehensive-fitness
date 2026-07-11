const assert = require("node:assert/strict");
const {
  DEFAULT_AUTO_DISMISS_MS,
  RestCompletionController,
  STRONG_HAPTIC_PATTERN,
  buildRestNotificationOptions,
  normalizeRestCompletionSettings
} = require("../rest-completion-controller.js");

class FakeClock {
  constructor(now = 0) {
    this.time = now;
    this.nextId = 1;
    this.tasks = new Map();
  }

  now() {
    return this.time;
  }

  setTimeout(callback, delay) {
    const id = this.nextId++;
    this.tasks.set(id, { callback, dueAt: this.time + Math.max(0, Number(delay) || 0) });
    return id;
  }

  clearTimeout(id) {
    this.tasks.delete(id);
  }

  advance(milliseconds) {
    const target = this.time + milliseconds;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.dueAt <= target)
        .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])[0];
      if (!next) break;
      const [id, task] = next;
      this.tasks.delete(id);
      this.time = task.dueAt;
      task.callback();
    }
    this.time = target;
  }
}

function timer(overrides = {}) {
  return {
    id: "timer-1",
    version: 1,
    workoutId: "workout-1",
    exerciseId: "exercise-1",
    setId: "set-1",
    pendingNextSetId: "set-2",
    durationSeconds: 90,
    remainingSeconds: 0,
    endsAt: 1000,
    isActive: true,
    isPaused: false,
    notificationStatus: "scheduled",
    ...overrides
  };
}

function notice() {
  return { title: "Rest complete", message: "Bench Press - Set 2 is ready.", payload: { nextSetId: "set-2" } };
}

function testExactFiveSecondDismissal() {
  const clock = new FakeClock(1000);
  const dismissals = [];
  const controller = new RestCompletionController({
    clock,
    effects: { onDismiss: (event) => dismissals.push(event) }
  });

  const completed = controller.complete(timer(), notice());
  assert.equal(DEFAULT_AUTO_DISMISS_MS, 5000);
  assert.equal(completed.notice.autoDismissAt, 6000);
  assert.equal(completed.notice.visible, true);

  clock.advance(4999);
  assert.equal(controller.getVisibleNotice().message, notice().message, "The alert must remain visible before the fifth second elapses");
  assert.equal(dismissals.length, 0);

  clock.advance(1);
  assert.equal(controller.getVisibleNotice(), null, "The alert must dismiss at exactly five seconds");
  assert.equal(dismissals.length, 1);
  assert.equal(dismissals[0].reason, "auto");
  assert.equal(dismissals[0].state.notice.dismissedAt, 6000);
}

function testManualDismissalCancelsAutomaticDismissal() {
  const clock = new FakeClock(1000);
  const dismissals = [];
  const controller = new RestCompletionController({ clock, effects: { onDismiss: (event) => dismissals.push(event) } });
  controller.complete(timer(), notice());

  clock.advance(1200);
  assert.equal(controller.dismiss("manual"), true);
  assert.equal(controller.dismiss("manual"), false, "Manual dismissal is idempotent");
  assert.equal(controller.getState().notice.dismissedAt, 2200);
  assert.equal(controller.getState().notice.dismissReason, "manual");

  clock.advance(10000);
  assert.equal(dismissals.length, 1, "The canceled automatic callback must not dismiss twice");
  assert.equal(dismissals[0].reason, "manual");
}

function testRerendersCannotResetDeadline() {
  const clock = new FakeClock(1000);
  const controller = new RestCompletionController({ clock });
  const original = controller.complete(timer(), notice());

  clock.advance(2000);
  controller.getState();
  controller.getVisibleNotice();
  controller.complete(timer(), notice(), { restCompleteAutoDismissMs: 20000 });
  controller.restore(original);
  controller.sync();
  assert.equal(controller.getState().notice.autoDismissAt, 6000, "Repeated completion, restoration, and sync keep the original absolute deadline");

  clock.advance(2999);
  assert.equal(controller.getState().notice.visible, true);
  clock.advance(1);
  assert.equal(controller.getState().notice.visible, false);
  assert.equal(controller.getState().notice.dismissedAt, 6000);

  const reloadClock = new FakeClock(1000);
  const beforeReload = new RestCompletionController({ clock: reloadClock });
  beforeReload.complete(timer({ id: "reload-timer" }), notice());
  reloadClock.advance(2500);
  const persisted = beforeReload.getState();
  beforeReload.destroy();
  const afterReload = new RestCompletionController({ clock: reloadClock });
  afterReload.restore(persisted);
  reloadClock.advance(2499);
  assert.equal(afterReload.getState().notice.visible, true, "Reload restoration uses the remaining portion of the original deadline");
  reloadClock.advance(1);
  assert.equal(afterReload.getState().notice.visible, false);
  assert.equal(afterReload.getState().notice.dismissedAt, 6000);
}

function testOneSoundAndHapticPerTimer() {
  const clock = new FakeClock(1000);
  let sounds = 0;
  let haptics = 0;
  const controller = new RestCompletionController({
    clock,
    effects: {
      playSound: () => { sounds += 1; },
      playHaptic: () => { haptics += 1; }
    }
  });

  const first = controller.complete(timer(), notice());
  controller.complete(timer(), notice());
  controller.restore(first);
  controller.sync();
  assert.equal(sounds, 1, "Normal renders and duplicate completion sources cannot replay sound");
  assert.equal(haptics, 1, "Normal renders and duplicate completion sources cannot replay haptics");
  assert.equal(first.signals.soundAttemptedAt, 1000);
  assert.equal(first.signals.hapticAttemptedAt, 1000);

  const restoredController = new RestCompletionController({
    clock,
    effects: {
      playSound: () => { sounds += 1; },
      playHaptic: () => { haptics += 1; }
    }
  });
  restoredController.restore(first);
  assert.equal(sounds, 1, "Restoring persisted effect receipts cannot replay sound");
  assert.equal(haptics, 1, "Restoring persisted effect receipts cannot replay haptics");

  controller.complete(timer({ id: "timer-2", version: 2 }), notice());
  assert.equal(sounds, 2, "A genuinely new timer gets one sound");
  assert.equal(haptics, 2, "A genuinely new timer gets one haptic pattern");

  controller.complete(timer({ id: "timer-3", version: 3 }), notice(), { timerSound: false, timerVibration: false });
  assert.equal(sounds, 2, "Silent mode suppresses foreground sound");
  assert.equal(haptics, 2, "Haptic-only and fully silent modes are representable independently");
}

function testBackgroundCompletion() {
  const clock = new FakeClock(5000);
  let notifications = 0;
  let foregroundSounds = 0;
  let foregroundHaptics = 0;
  const controller = new RestCompletionController({
    clock,
    effects: {
      showSystemNotification: () => { notifications += 1; },
      playSound: () => { foregroundSounds += 1; },
      playHaptic: () => { foregroundHaptics += 1; }
    }
  });
  const payload = {
    title: "Rest complete",
    body: "Your next set is ready.",
    timerId: "background-timer",
    timerVersion: 4,
    workoutId: "workout-1",
    exerciseId: "exercise-1",
    completedSetId: "set-1",
    nextSetId: "set-2",
    endsAt: 5000
  };

  const completed = controller.completeFromBackground(payload);
  controller.completeFromBackground(payload);
  assert.equal(completed.source, "background");
  assert.equal(completed.timer.status, "completed");
  assert.equal(completed.timer.remainingSeconds, 0);
  assert.equal(notifications, 1, "Background completion requests one operating-system notification");
  assert.equal(foregroundSounds, 0, "A hidden page does not attempt a blocked Web Audio signal");
  assert.equal(foregroundHaptics, 0, "The system notification owns background haptics");

  const alreadyDelivered = new RestCompletionController({
    clock,
    effects: { showSystemNotification: () => { notifications += 1; } }
  });
  alreadyDelivered.completeFromBackground({ ...payload, timerId: "already-delivered" }, undefined, { systemSignalAlreadyDelivered: true });
  assert.equal(notifications, 1, "A service-worker notification is not duplicated when the page later reconciles");
}

function testCompletedTimerAndWorkoutStateArePreserved() {
  const clock = new FakeClock(1000);
  let returnEvents = 0;
  const sourceTimer = timer({ customAuditField: { origin: "workout-runtime" } });
  const originalTimer = structuredClone(sourceTimer);
  const workoutState = {
    sets: [
      { id: "set-1", completed: true },
      { id: "set-2", completed: false }
    ],
    notes: "Keep this workout data"
  };
  const originalWorkout = structuredClone(workoutState);
  const controller = new RestCompletionController({
    clock,
    effects: { onReturnToWorkout: () => { returnEvents += 1; } }
  });

  controller.complete(sourceTimer, notice());
  assert.deepEqual(sourceTimer, originalTimer, "Completion never mutates the live timer input");
  assert.deepEqual(workoutState, originalWorkout, "Completion never edits sets, notes, or workout data");
  assert.deepEqual(controller.getState().timer.customAuditField, { origin: "workout-runtime" });

  clock.advance(5000);
  const afterDismiss = controller.getState();
  assert.equal(afterDismiss.timer.status, "completed");
  assert.equal(afterDismiss.timer.remainingSeconds, 0);
  assert.equal(afterDismiss.timer.isActive, false);
  assert.equal(afterDismiss.timer.pendingNextSetId, "set-2");
  assert.equal(workoutState.sets[1].completed, false, "Rest completion never completes the next set");
  assert.equal(returnEvents, 0, "Default auto-dismiss does not navigate or start another timer");

  assert.equal(controller.returnToWorkout(), true);
  assert.equal(controller.returnToWorkout(), false, "Return-to-workout navigation is idempotent per timer");
  assert.equal(returnEvents, 1);
}

function testSettingsAndNotificationContract() {
  const settings = normalizeRestCompletionSettings({
    timerSound: true,
    timerVibration: false,
    timerSoundSelection: "clear_bell",
    timerSoundVolume: 0.6,
    timerAlertAutoDismissMs: 5000,
    timerNotifications: true,
    automaticReturnToWorkout: true
  });
  assert.deepEqual(settings, {
    overlayEnabled: true,
    soundEnabled: true,
    hapticsEnabled: false,
    soundId: "clear_bell",
    soundVolume: 0.6,
    autoDismissMs: 5000,
    lockScreenNotifications: true,
    autoReturnToWorkout: true
  });
  const options = buildRestNotificationOptions({
    notice: notice(),
    timer: timer(),
    settings
  });
  assert.equal(options.silent, false);
  assert.deepEqual(options.vibrate, []);
  assert.equal(options.data.soundId, "clear_bell");
  assert.deepEqual(STRONG_HAPTIC_PATTERN, [260, 100, 260, 100, 480]);
}

testExactFiveSecondDismissal();
testManualDismissalCancelsAutomaticDismissal();
testRerendersCannotResetDeadline();
testOneSoundAndHapticPerTimer();
testBackgroundCompletion();
testCompletedTimerAndWorkoutStateArePreserved();
testSettingsAndNotificationContract();

console.log("Rest completion controller tests passed: exact dismissal, manual dismissal, rerender safety, signal deduplication, background delivery, and state preservation.");
