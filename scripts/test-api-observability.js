const assert = require("node:assert/strict");
const path = require("node:path");

const targetRoot = path.resolve(process.argv[2] || process.env.CONTRACT_TARGET_ROOT || path.join(__dirname, ".."));
const responsePath = path.join(targetRoot, "api", "_lib", "response.js");
const response = require(responsePath);

const failures = [];
let controls = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

function mockResponse() {
  return {
    headers: {},
    statusCode: 0,
    body: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

async function exercise({ throws = false, method = "post", url = "/api/push/register?token=query-secret&userId=person-42" } = {}) {
  const req = {
    method,
    url,
    headers: {
      authorization: "Bearer header-secret",
      cookie: "session=cookie-secret",
      "x-forwarded-for": "203.0.113.44",
      "x-request-id": "attacker-controlled-request-id"
    },
    body: { token: "body-secret", userId: "person-42", note: "private-note" }
  };
  const res = mockResponse();
  const records = [];
  const originals = {};
  for (const method of ["log", "info", "warn", "error"]) {
    originals[method] = console[method];
    console[method] = (...args) => records.push({ method, args });
  }
  try {
    const wrapped = response.apiHandler(async (request, reply) => {
      if (throws) {
        const error = new Error("database exploded with private-note");
        error.stack = "STACK_SECRET";
        throw error;
      }
      return response.json(reply, 201, { ok: true });
    });
    await wrapped(req, res);
  } finally {
    Object.assign(console, originals);
  }
  return { req, res, records };
}

function inspectable(value, seen = new Set()) {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => inspectable(entry, seen));
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, inspectable(entry, seen)]));
}

function onlyTerminalEvent(sample) {
  assert.equal(sample.records.length, 1, "a response must produce exactly one console emission");
  assert.equal(sample.records[0].args.length, 1, "the terminal emission must contain one argument");
  const event = sample.records[0].args[0];
  assert(event && typeof event === "object" && !Array.isArray(event) && !(event instanceof Error), "the terminal emission must be one structured object");
  return event;
}

(async () => {
  check("control: response library exposes the shared JSON wrapper", () => {
    assert.equal(typeof response.json, "function");
    assert.equal(typeof response.apiHandler, "function");
    controls += 1;
  });

  const success = await exercise();
  const failure = await exercise({ throws: true });
  const unknownRoute = await exercise({ method: null, url: "/api/install/person-42?token=query-secret" });

  check("shared wrapper generates an opaque server request ID and returns it on every response", () => {
    for (const sample of [success, failure]) {
      const requestId = sample.res.headers["x-request-id"];
      assert.match(requestId || "", /^[A-Za-z0-9_-]{16,128}$/);
      assert.notEqual(requestId, sample.req.headers["x-request-id"]);
    }
    assert.notEqual(success.res.headers["x-request-id"], failure.res.headers["x-request-id"]);
  });

  check("each JSON response emits exactly one structured terminal event", () => {
    onlyTerminalEvent(success);
    onlyTerminalEvent(failure);
  });

  check("terminal events use only the privacy-safe bounded allowlist", () => {
    const allowed = ["durationMs", "event", "method", "requestId", "route", "statusClass", "timestamp"].sort();
    for (const [sample, expectedStatusClass] of [[success, "2xx"], [failure, "5xx"]]) {
      const event = onlyTerminalEvent(sample);
      assert.deepEqual(Object.keys(event).sort(), allowed);
      assert.equal(event.event, "api_request_complete");
      assert.equal(event.method, "POST");
      assert.equal(event.route, "/api/push/register");
      assert.equal(event.statusClass, expectedStatusClass);
      assert.equal(event.statusClass, `${Math.floor(sample.res.statusCode / 100)}xx`, "statusClass must describe the actual response status");
      assert(Number.isFinite(event.durationMs) && event.durationMs >= 0 && event.durationMs <= 600000);
      assert.equal(new Date(event.timestamp).toISOString(), event.timestamp);
      assert.equal(event.requestId, sample.res.headers["x-request-id"]);
      const serialized = JSON.stringify(sample.records.map((record) => ({ method: record.method, args: record.args.map((argument) => inspectable(argument)) }))).toLowerCase();
      for (const forbidden of ["query-secret", "person-42", "header-secret", "cookie-secret", "203.0.113.44", "body-secret", "private-note", "STACK_SECRET", "authorization", "cookie", "headers", "body", "query", "stack", "message", "userId"]) {
        assert(!serialized.includes(forbidden.toLowerCase()), `console emission leaked forbidden value/key ${forbidden}`);
      }
    }
  });

  check("missing method and unrecognized route metadata fail closed without logging identifiers", () => {
    const event = onlyTerminalEvent(unknownRoute);
    assert.equal(event.method, "UNKNOWN");
    assert.equal(event.route, "unknown");
    assert.equal(event.statusClass, "2xx");
    const serialized = JSON.stringify(unknownRoute.records.map((record) => record.args.map((argument) => inspectable(argument))));
    assert(!serialized.includes("person-42"));
    assert(!serialized.includes("query-secret"));
  });

  check("unexpected failures remain opaque to clients", () => {
    assert.equal(failure.res.statusCode, 500);
    assert.deepEqual(failure.res.body, { error: "The service could not complete this request." });
    controls += 1;
  });

  if (controls !== 2) failures.push("control accounting did not execute");
  if (failures.length) {
    console.error(`API observability contract failed (${failures.length} unmet contract(s); ${controls} controls passed).`);
    process.exitCode = 1;
  } else {
    console.log(`API observability contract passed (6 contracts; ${controls} controls).`);
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
