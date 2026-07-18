"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { APPLICATION_RUNTIME_FILES } = require("./read-application-contract-source");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const externalScripts = [...html.matchAll(/<script\s+src="\.\/([^"]+)"><\/script>/g)].map((match) => match[1]);

assert.equal(new Set(APPLICATION_RUNTIME_FILES).size, APPLICATION_RUNTIME_FILES.length, "Runtime segment names must be unique");
assert.deepEqual(
  externalScripts.slice(-APPLICATION_RUNTIME_FILES.length),
  APPLICATION_RUNTIME_FILES,
  "Runtime segments must load exactly once in dependency order"
);

const segments = APPLICATION_RUNTIME_FILES.map((file) => {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  assert(source.trim(), `${file} must not be empty`);
  assert(
    Buffer.byteLength(source, "utf8") <= 300 * 1024,
    `${file} exceeds the 300 KiB concentration ceiling; create or strengthen an owned runtime boundary`
  );
  new vm.Script(source, { filename: file });
  return source;
});

new vm.Script(segments.join(""), { filename: "application-runtime-contract.js" });
assert.match(segments[0], /const STORAGE_KEY =/);
assert.match(segments.at(-1), /async function boot\(\)/);

console.log(`Application runtime boundary passed (${APPLICATION_RUNTIME_FILES.length} ordered segments; largest ${Math.max(...segments.map((source) => Buffer.byteLength(source, "utf8")))} bytes).`);
