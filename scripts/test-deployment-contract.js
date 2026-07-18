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
function deployText(relative) { return read(relative).replace(/\r\n/g, "\n"); }

let config;
check("control: public entry points and policy pages exist", () => {
  for (const file of ["index.html", "privacy.html", "support.html"]) assert(fs.existsSync(path.join(targetRoot, file)), `${file} missing`);
  controls += 1;
});
check("control: deploy-text normalization is deterministic", () => {
  assert.equal(crypto.createHash("sha256").update("abc", "utf8").digest("base64"), "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=");
  assert.equal("a\r\nb".replace(/\r\n/g, "\n"), "a\nb");
  assert.equal(deployText("index.html").includes("\r"), false, "deploy-equivalent HTML must use LF bytes for deterministic policy checks");
  controls += 1;
});
check("deployment configuration exists and parses", () => {
  const file = path.join(targetRoot, "vercel.json");
  assert(fs.existsSync(file), "vercel.json missing");
  config = JSON.parse(fs.readFileSync(file, "utf8"));
});

function catchAllRules() {
  assert(config && Array.isArray(config.headers), "vercel.json headers array missing");
  const recognized = new Set(["/(.*)", "/:path*"]);
  const applicable = config.headers.filter((entry) => entry && recognized.has(entry.source));
  assert(applicable.length, "no recognized exact application catch-all header rule found");
  return applicable;
}

function headerMap(entry) {
  const map = new Map();
  for (const header of entry.headers || []) {
    const key = String(header.key).toLowerCase();
    assert(!map.has(key), `${entry.source} repeats header ${key}`);
    map.set(key, String(header.value));
  }
  return map;
}

check("strict application-wide browser security headers are configured", () => {
  for (const rule of catchAllRules()) {
    const headers = headerMap(rule);
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
    for (const [key, pattern] of Object.entries(expected)) assert.match(headers.get(key) || "", pattern, `${rule.source}: ${key} missing or weak`);
    assert.match(headers.get("permissions-policy") || "", /camera=\(\)/);
    assert.match(headers.get("permissions-policy") || "", /microphone=\(\)/);
    assert.match(headers.get("permissions-policy") || "", /geolocation=\(\)/);
  }
});

function directives(csp) {
  const parsed = new Map();
  for (const part of csp.split(";").map((value) => value.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/);
    const normalized = name.toLowerCase();
    assert(!parsed.has(normalized), `duplicate CSP directive ${normalized} is unsafe because browsers honor the first occurrence`);
    parsed.set(normalized, values);
  }
  return parsed;
}

check("control: CSP parsing rejects duplicate directives instead of merging or overwriting them", () => {
  assert.throws(() => directives("default-src 'self'; script-src 'self'; script-src https://evil.example"), /duplicate CSP directive script-src/);
  controls += 1;
});

function publicSourceText() {
  const files = ["index.html", "privacy.html", "support.html", "app.js", "app.css", "styles.css"];
  const resources = path.join(targetRoot, "resources");
  if (fs.existsSync(resources)) {
    for (const entry of fs.readdirSync(resources, { withFileTypes: true })) {
      if (entry.isFile() && /\.(?:css|js)$/i.test(entry.name)) files.push(path.join("resources", entry.name));
    }
  }
  return files.filter((file) => fs.existsSync(path.join(targetRoot, file))).map(read).join("\n");
}

check("CSP denies injection and bounds every outbound or navigational surface", () => {
  const html = read("index.html");
  const publicSources = publicSourceText();
  const hasOwnedInlineStyles = /<style\b[^>]*>[\s\S]*?<\/style>/i.test(html) || /\sstyle\s*=/i.test(html);
  for (const rule of catchAllRules()) {
    const d = directives(headerMap(rule).get("content-security-policy") || "");
    const permittedDirectiveNames = new Set([
      "default-src", "script-src", "script-src-attr", "style-src", "connect-src", "img-src", "font-src",
      "media-src", "worker-src", "manifest-src", "frame-src", "child-src", "object-src", "base-uri",
      "form-action", "frame-ancestors", "upgrade-insecure-requests", "block-all-mixed-content"
    ]);
    for (const name of d.keys()) assert(permittedDirectiveNames.has(name), `${rule.source}: unrecognized or unconstrained CSP directive ${name}`);
    const defaults = d.get("default-src");
    assert(defaults && (defaults.length === 1 && ["'self'", "'none'"].includes(defaults[0])), `${rule.source}: default-src must be exactly self or none`);
    assert.deepEqual(d.get("object-src"), ["'none'"]);
    assert.deepEqual(d.get("frame-src"), ["'none'"]);
    assert.deepEqual(d.get("child-src"), ["'none'"]);
    assert.deepEqual(d.get("frame-ancestors"), ["'none'"]);
    assert.deepEqual(d.get("base-uri"), ["'self'"]);
    assert.deepEqual(d.get("form-action"), ["'self'"]);
    assert.deepEqual(d.get("script-src-attr"), ["'none'"]);
    const scripts = d.get("script-src") || [];
    assert(scripts.includes("'self'"), "script-src must allow owned external scripts");
    assert(scripts.every((value) => value === "'self'" || /^'sha256-[A-Za-z0-9+/]+={0,2}'$/.test(value)), "script-src may contain only self and exact SHA-256 hashes");
    assert.deepEqual(d.get("connect-src"), ["'self'"], "connect-src must be self only");
    const styles = d.get("style-src") || [];
    assert(styles.includes("'self'"), "style-src must allow owned external styles");
    assert(styles.every((value) => value === "'self'" || value === "'unsafe-inline'"), "style-src may contain only self and the temporary inline-style exception");
    if (styles.includes("'unsafe-inline'")) assert(hasOwnedInlineStyles, "unsafe-inline style exception lacks a current inline-style justification");
    if (hasOwnedInlineStyles) assert(styles.includes("'unsafe-inline'"), "current owned inline styles need an explicit transitional exception");
    const exactSources = {
      "font-src": ["'self'"],
      "manifest-src": ["'self'"],
      "media-src": ["'self'"]
    };
    for (const [name, allowed] of Object.entries(exactSources)) assert.deepEqual(d.get(name), allowed, `${name} must be self only`);
    const imgAllowed = ["'self'"];
    if (/data:image\//i.test(publicSources)) imgAllowed.push("data:");
    assert.deepEqual(d.get("img-src"), imgAllowed, "img-src may use data only while an owned data image requires it");
    const workerAllowed = ["'self'"];
    if (/new\s+(?:Shared)?Worker\s*\(\s*URL\.createObjectURL|new\s+(?:Shared)?Worker\s*\(\s*[^)]*blob:/i.test(publicSources)) workerAllowed.push("blob:");
    assert.deepEqual(d.get("worker-src"), workerAllowed, "worker-src may use blob only while an owned blob worker requires it");
  }
});

check("executable inline scripts are absent or exactly hash-bound by CSP", () => {
  const html = deployText("index.html");
  const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).filter((body) => body.trim());
  assert.match(html, /<script src="\.\/app\.js"><\/script>/, "the application runtime must load from the owned external app.js boundary");
  for (const rule of catchAllRules()) {
    const sources = directives(headerMap(rule).get("content-security-policy") || "").get("script-src") || [];
    assert(sources.includes("'self'"), "owned external scripts must be allowed");
    if (inline.length === 0) assert.deepEqual(sources, ["'self'"], "script-src must not retain obsolete inline-script hashes");
    for (const body of inline) {
      const hash = `'sha256-${crypto.createHash("sha256").update(body, "utf8").digest("base64")}'`;
      assert(sources.includes(hash), `${rule.source}: inline script hash missing or stale: ${hash}`);
    }
  }
});

check("privacy and support pages do not depend on inline event handlers", () => {
  for (const file of ["privacy.html", "support.html"]) {
    const html = read(file);
    assert(!/\son[a-z]+\s*=/i.test(html), `${file} contains an inline event handler`);
  }
});

if (controls !== 3) failures.push("control accounting did not execute");
if (failures.length) {
  console.error(`Deployment contract failed (${failures.length} unmet contract(s); ${controls} controls passed).`);
  process.exitCode = 1;
} else console.log(`Deployment contract passed (7 contracts; ${controls} controls).`);
