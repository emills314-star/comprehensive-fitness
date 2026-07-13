const webpush = require("web-push");
const net = require("node:net");
const { Client, Receiver } = require("@upstash/qstash");

const DEFAULT_PUSH_PROVIDER_ORIGINS = Object.freeze([
  "https://fcm.googleapis.com",
  "https://updates.push.services.mozilla.com",
  "https://web.push.apple.com"
]);

function normalizedProviderOrigin(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) return "";
    if (parsed.pathname !== "/" && parsed.pathname !== "") return "";
    if (!hostname.includes(".") || net.isIP(hostname) || hostname === "localhost" || /\.(?:local|internal|localhost)$/.test(hostname)) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function pushProviderOrigins() {
  const configured = String(process.env.WEB_PUSH_ALLOWED_ORIGINS || "")
    .split(",")
    .map(normalizedProviderOrigin)
    .filter(Boolean);
  return new Set([...DEFAULT_PUSH_PROVIDER_ORIGINS, ...configured]);
}

function pushEndpointAllowed(endpoint) {
  try {
    const parsed = new URL(String(endpoint || "").trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return false;
    return pushProviderOrigins().has(parsed.origin);
  } catch {
    return false;
  }
}

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

module.exports = {
  DEFAULT_PUSH_PROVIDER_ORIGINS,
  configureWebPush,
  configuredPublicAppUrl,
  publicAppUrl,
  pushConfigured,
  pushEndpointAllowed,
  pushProviderOrigins,
  qstashClient,
  qstashReceiver
};
