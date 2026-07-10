const { getHash, redis, setHash } = require("../_lib/redis");
const { configureWebPush, qstashReceiver } = require("../_lib/push");
const { json, methodNotAllowed } = require("../_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  const signature = String(req.headers["upstash-signature"] || "");
  const verifyRequest = { signature, body: rawBody };
  if (process.env.PUBLIC_APP_URL) verifyRequest.url = `${String(process.env.PUBLIC_APP_URL).replace(/\/$/, "")}/api/push/deliver`;
  const valid = await qstashReceiver().verify(verifyRequest).catch(() => false);
  if (!valid) return json(res, 401, { error: "Invalid scheduler signature." });

  const { notificationId } = typeof req.body === "object" ? req.body : JSON.parse(rawBody || "{}");
  const record = await getHash(`cf:timer:${notificationId}`);
  if (!record.notificationId || record.status !== "scheduled") return json(res, 200, { status: "ignored" });
  const activeKey = `cf:active:${record.installationId}:${record.workoutId}`;
  if (await redis(["GET", activeKey]) !== notificationId) {
    await setHash(`cf:timer:${notificationId}`, { status: "stale", canceledAt: new Date().toISOString() });
    return json(res, 200, { status: "stale" });
  }

  const installation = await getHash(`cf:install:${record.installationId}`);
  if (installation.active !== "1" || !installation.endpoint) return json(res, 200, { status: "inactive" });
  const detail = record.messageDetail === "private"
    ? "Your next set is ready."
    : `${record.exerciseName}${record.upcomingSetNumber ? ` - Set ${record.upcomingSetNumber}` : ""} is ready.`;
  const payload = JSON.stringify({
    title: "Rest complete",
    body: detail,
    tag: `fitness-rest-${record.workoutId}`,
    url: `/?workout=active&exercise=${encodeURIComponent(record.exerciseId)}&set=${encodeURIComponent(record.upcomingSetId || record.setId)}`,
    timerId: notificationId
  });

  try {
    await configureWebPush().sendNotification({
      endpoint: installation.endpoint,
      keys: { p256dh: installation.p256dh, auth: installation.auth }
    }, payload, { TTL: 120, urgency: "high" });
    const deliveredAt = new Date().toISOString();
    await setHash(`cf:timer:${notificationId}`, { status: "delivered", deliveredAt });
    await setHash(`cf:install:${record.installationId}`, { lastSuccessfulDeliveryAt: deliveredAt });
    await redis(["DEL", activeKey]);
    return json(res, 200, { status: "delivered" });
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      const invalidAt = new Date().toISOString();
      await setHash(`cf:install:${record.installationId}`, { active: "0", invalidAt });
      await setHash(`cf:timer:${notificationId}`, { status: "invalid-subscription", deliveryError: String(error.message || "Subscription expired").slice(0, 240) });
      await redis(["DEL", activeKey]);
      return json(res, 200, { status: "invalid-subscription" });
    }
    await setHash(`cf:timer:${notificationId}`, { status: "retrying", deliveryError: String(error?.message || error).slice(0, 240) });
    return json(res, 500, { error: "Push delivery failed and will be retried." });
  }
};
