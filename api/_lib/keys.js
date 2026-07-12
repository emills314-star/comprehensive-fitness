const crypto = require("crypto");

const RETENTION_SECONDS = Object.freeze({
  installation: 180 * 24 * 60 * 60,
  timer: 7 * 24 * 60 * 60,
  workout: 90 * 24 * 60 * 60,
  mutation: 90 * 24 * 60 * 60
});

function installationKey(installationId) {
  return `cf:install:${installationId}`;
}

function timerKey(installationId, notificationId) {
  return `cf:timer:${installationId}:${notificationId}`;
}

function legacyTimerKey(notificationId) {
  return `cf:timer:${notificationId}`;
}

function activeTimerKey(installationId, workoutId) {
  return `cf:active:${installationId}:${workoutId}`;
}

function workoutKey(installationId, sessionId) {
  return `cf:workout:${installationId}:${sessionId}`;
}

function mutationKey(installationId, mutationId) {
  return `cf:mutation:${installationId}:${mutationId}`;
}

function installationTimersKey(installationId) {
  return `cf:timers:${installationId}`;
}

function installationWorkoutsKey(installationId) {
  return `cf:workouts:${installationId}`;
}

function installationMutationsKey(installationId) {
  return `cf:mutations:${installationId}`;
}

function scopedTimerId(installationId, requestedId) {
  return `t_${crypto.createHash("sha256").update(`${installationId}:${requestedId}`).digest("base64url").slice(0, 40)}`;
}

module.exports = {
  RETENTION_SECONDS,
  activeTimerKey,
  installationKey,
  installationMutationsKey,
  installationTimersKey,
  installationWorkoutsKey,
  legacyTimerKey,
  mutationKey,
  scopedTimerId,
  timerKey,
  workoutKey
};
