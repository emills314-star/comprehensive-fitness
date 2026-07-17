const crypto = require("node:crypto");

const REQUEST_CONTEXT = Symbol("apiRequestContext");
const MAX_DURATION_MS = 600000;
const KNOWN_ROUTES = new Set([
  "/api/install/delete",
  "/api/push/cancel",
  "/api/push/config",
  "/api/push/deliver",
  "/api/push/register",
  "/api/push/schedule",
  "/api/push/test",
  "/api/sync/workout"
]);

function createRequestId() {
  return crypto.randomBytes(18).toString("base64url");
}

function normalizeMethod(method) {
  const normalized = String(method || "UNKNOWN").toUpperCase();
  return /^[A-Z]{1,16}$/.test(normalized) ? normalized : "UNKNOWN";
}

function normalizeRoute(url) {
  let pathname;
  try {
    pathname = new URL(String(url || "/"), "https://local.invalid").pathname;
  } catch {
    return "unknown";
  }
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return KNOWN_ROUTES.has(normalized) ? normalized : "unknown";
}

function statusClass(statusCode) {
  const status = Number(statusCode);
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? `${Math.floor(status / 100)}xx`
    : "unknown";
}

function boundedDuration(startedAt) {
  const elapsed = Number(process.hrtime.bigint() - startedAt) / 1e6;
  return Math.min(MAX_DURATION_MS, Math.max(0, Math.round(elapsed)));
}

function beginRequest(req, res) {
  const context = {
    emitted: false,
    method: normalizeMethod(req && req.method),
    requestId: createRequestId(),
    route: normalizeRoute(req && req.url),
    startedAt: process.hrtime.bigint()
  };
  Object.defineProperty(res, REQUEST_CONTEXT, { configurable: true, value: context });
  res.setHeader("X-Request-ID", context.requestId);
  return context;
}

function emitTerminal(res) {
  const context = res && res[REQUEST_CONTEXT];
  if (!context || context.emitted) return;
  context.emitted = true;
  console.info({
    timestamp: new Date().toISOString(),
    event: "api_request_complete",
    requestId: context.requestId,
    method: context.method,
    route: context.route,
    statusClass: statusClass(res.statusCode),
    durationMs: boundedDuration(context.startedAt)
  });
}

module.exports = { beginRequest, emitTerminal };
