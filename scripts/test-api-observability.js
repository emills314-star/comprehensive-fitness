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

async function exercise({ throws = false } = {}) {
  const req = {
    method: "post",
    url: "/api/push/register?token=query-secret&userId=person-42",
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

function structuredEvents(records) {
  return records.flatMap(({ args }) => args).map((value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    if (typeof value !== "string") return null;
    try { return JSON.parse(value); } catch { return null; }
  }).filter(Boolean);
}

(async () => {
  check("control: response library exposes the shared JSON wrapper", () => {
    assert.equal(typeof response.json, "function");
    assert.equal(typeof response.apiHandler, "function");
    controls += 1;
  });

  const success = await exercise();
  const failure = await exercise({ throws: true });

  check("shared wrapper generates an opaque server request ID and returns it on every response", () => {
    for (const sample of [success, failure]) {
      const requestId = sample.res.headers["x-request-id"];
      assert.match(requestId || "", /^[A-Za-z0-9_-]{16,128}$/);
      assert.notEqual(requestId, sample.req.headers["x-request-id"]);
    }
    assert.notEqual(success.res.headers["x-request-id"], failure.res.headers["x-request-id"]);
  });

  check("each JSON response emits exactly one structured terminal event", () => {
    assert.equal(structuredEvents(success.records).length, 1);
    assert.equal(structuredEvents(failure.records).length, 1);
  });

  check("terminal events use only the privacy-safe bounded allowlist", () => {
    const allowed = ["durationMs", "event", "method", "requestId", "route", "statusClass", "timestamp"].sort();
    for (const sample of [success, failure]) {
      const [event] = structuredEvents(sample.records);
      assert(event, "missing structured terminal event");
      assert.deepEqual(Object.keys(event).sort(), allowed);
      assert.equal(event.event, "api_request_complete");
      assert.equal(event.method, "POST");
      assert.equal(event.route, "/api/push/register");
      assert.match(event.statusClass, /^[1-5]xx$/);
      assert(Number.isFinite(event.durationMs) && event.durationMs >= 0 && event.durationMs <= 600000);
      assert.equal(new Date(event.timestamp).toISOString(), event.timestamp);
      assert.equal(event.requestId, sample.res.headers["x-request-id"]);
      const serialized = JSON.stringify(event);
      for (const forbidden of ["query-secret", "person-42", "header-secret", "cookie-secret", "203.0.113.44", "body-secret", "private-note", "STACK_SECRET", "authorization", "cookie", "headers", "body", "query", "stack", "message", "userId"]) {
        assert(!serialized.includes(forbidden), `event leaked forbidden value/key ${forbidden}`);
      }
    }
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
    console.log(`API observability contract passed (5 contracts; ${controls} controls).`);
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
