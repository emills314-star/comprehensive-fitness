const webpush = require("web-push");
const { Client, Receiver } = require("@upstash/qstash");

function pushConfigured() {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT &&
    process.env.QSTASH_TOKEN &&
    process.env.QSTASH_CURRENT_SIGNING_KEY &&
    process.env.QSTASH_NEXT_SIGNING_KEY
  );
}

function configureWebPush() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    throw new Error("VAPID is not configured.");
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return webpush;
}

function qstashClient() {
  if (!process.env.QSTASH_TOKEN) throw new Error("QStash is not configured.");
  return new Client({ token: process.env.QSTASH_TOKEN });
}

function qstashReceiver() {
  return new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || "",
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || ""
  });
}

function publicAppUrl(req) {
  if (process.env.PUBLIC_APP_URL) return String(process.env.PUBLIC_APP_URL).replace(/\/$/, "");
  const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  return `${protocol}://${req.headers.host}`;
}

module.exports = { configureWebPush, publicAppUrl, pushConfigured, qstashClient, qstashReceiver };
