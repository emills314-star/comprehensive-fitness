const webpush = require("web-push");
const { Client, Receiver } = require("@upstash/qstash");

function pushConfigured() {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT &&
    process.env.QSTASH_TOKEN &&
    process.env.QSTASH_CURRENT_SIGNING_KEY &&
    process.env.QSTASH_NEXT_SIGNING_KEY &&
    configuredPublicAppUrl()
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

function configuredPublicAppUrl() {
  const configured = String(process.env.PUBLIC_APP_URL || "").trim();
  if (!configured) return "";
  try {
    const parsed = new URL(configured);
    const developmentLocalhost = process.env.NODE_ENV !== "production" &&
      parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    if ((parsed.protocol !== "https:" && !developmentLocalhost) || parsed.username || parsed.password || parsed.search || parsed.hash) return "";
    if (parsed.pathname !== "/" && parsed.pathname !== "") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function publicAppUrl() {
  const configured = configuredPublicAppUrl();
  if (!configured) throw new Error("A safe PUBLIC_APP_URL is required.");
  return configured;
}

module.exports = { configureWebPush, configuredPublicAppUrl, publicAppUrl, pushConfigured, qstashClient, qstashReceiver };
