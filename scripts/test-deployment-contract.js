const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const targetRoot = path.resolve(process.argv[2] || process.env.CONTRACT_TARGET_ROOT || path.join(__dirname, ".."));
const failures = [];
let controls = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name}: ${error.message}`); }
}
function read(relative) { return fs.readFileSync(path.join(targetRoot, relative), "utf8"); }

let config;
check("control: public entry points and policy pages exist", () => {
  for (const file of ["index.html", "privacy.html", "support.html"]) assert(fs.existsSync(path.join(targetRoot, file)), `${file} missing`);
  controls += 1;
});
check("control: inline-script hashes are computed from exact UTF-8 bytes", () => {
  assert.equal(crypto.createHash("sha256").update("abc", "utf8").digest("base64"), "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=");
  controls += 1;
});
check("deployment configuration exists and parses", () => {
  const file = path.join(targetRoot, "vercel.json");
  assert(fs.existsSync(file), "vercel.json missing");
  config = JSON.parse(fs.readFileSync(file, "utf8"));
});

function headerMap() {
  assert(config && Array.isArray(config.headers), "vercel.json headers array missing");
  const applicable = config.headers.filter((entry) => entry && typeof entry.source === "string" && /\(\.\*\)|:\w+\*|\/\*/.test(entry.source));
  assert(applicable.length, "no application-wide header rule found");
  const map = new Map();
  for (const entry of applicable) for (const header of entry.headers || []) map.set(String(header.key).toLowerCase(), String(header.value));
  return map;
}

check("strict application-wide browser security headers are configured", () => {
  const headers = headerMap();
  const expected = {
    "content-security-policy": /./,
    "permissions-policy": /./,
    "referrer-policy": /^(no-referrer|strict-origin|strict-origin-when-cross-origin)$/,
    "x-content-type-options": /^nosniff$/i,
    "x-frame-options": /^(DENY|SAMEORIGIN)$/,
    "cross-origin-opener-policy": /^same-origin$/,
    "cross-origin-resource-policy": /^(same-origin|same-site)$/,
    "strict-transport-security": /max-age=(?:31536000|[4-9]\d{7,})/i
  };
  for (const [key, pattern] of Object.entries(expected)) assert.match(headers.get(key) || "", pattern, `${key} missing or weak`);
  assert.match(headers.get("permissions-policy") || "", /camera=\(\)/);
  assert.match(headers.get("permissions-policy") || "", /microphone=\(\)/);
  assert.match(headers.get("permissions-policy") || "", /geolocation=\(\)/);
});

function directives(csp) {
  return new Map(csp.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const [name, ...values] = part.split(/\s+/);
    return [name.toLowerCase(), values];
  }));
}

check("CSP denies injection and bounds every outbound or navigational surface", () => {
  const csp = headerMap().get("content-security-policy") || "";
  const d = directives(csp);
  const has = (name, value) => (d.get(name) || []).includes(value);
  assert(has("default-src", "'self'") || has("default-src", "'none'"), "default-src must be self/none");
  assert(has("object-src", "'none'"), "object-src must be none");
  assert(has("frame-src", "'none'"), "frame-src must be none");
  assert(has("frame-ancestors", "'none'"), "frame-ancestors must be none");
  assert(has("base-uri", "'self'"), "base-uri must be self");
  assert(has("form-action", "'self'"), "form-action must be self");
  assert(has("script-src-attr", "'none'"), "script-src-attr must be none");
  assert(!(d.get("script-src") || []).includes("'unsafe-inline'"), "script-src cannot allow unsafe-inline");
  for (const name of ["connect-src", "form-action", "frame-src", "script-src", "style-src"]) {
    for (const value of d.get(name) || []) {
      assert(!value.includes("*"), `${name} cannot contain a wildcard`);
      assert(!/^http:/.test(value), `${name} cannot permit insecure HTTP`);
    }
  }
  const style = d.get("style-src") || [];
  assert(style.includes("'self'"), "style-src must allow owned styles");
  for (const [name, values] of d) if (values.includes("'unsafe-inline'")) assert.equal(name, "style-src", "unsafe-inline is justified only for current owned inline styles");
});

check("executable inline scripts are absent or exactly hash-bound by CSP", () => {
  const html = read("index.html");
  const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).filter((body) => body.trim());
  const sources = directives(headerMap().get("content-security-policy") || "").get("script-src") || [];
  assert(sources.includes("'self'"), "owned external scripts must be allowed");
  for (const body of inline) {
    const hash = `'sha256-${crypto.createHash("sha256").update(body, "utf8").digest("base64")}'`;
    assert(sources.includes(hash), `inline script hash missing or stale: ${hash}`);
  }
});

check("privacy and support pages do not depend on inline event handlers", () => {
  for (const file of ["privacy.html", "support.html"]) {
    const html = read(file);
    assert(!/\son[a-z]+\s*=/i.test(html), `${file} contains an inline event handler`);
  }
});

if (controls !== 2) failures.push("control accounting did not execute");
if (failures.length) {
  console.error(`Deployment contract failed (${failures.length} unmet contract(s); ${controls} controls passed).`);
  process.exitCode = 1;
} else console.log(`Deployment contract passed (6 contracts; ${controls} controls).`);
