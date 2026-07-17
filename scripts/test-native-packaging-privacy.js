const assert = require("node:assert/strict");
const fs = require("node:fs");

const sync = fs.readFileSync("scripts/sync-web.ps1", "utf8");
const verify = fs.readFileSync("scripts/verify-pwa.ps1", "utf8");
const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
const paths = fs.readFileSync("android/app/src/main/res/xml/file_paths.xml", "utf8");
const extraction = fs.readFileSync("android/app/src/main/res/xml/data_extraction_rules.xml", "utf8");

assert.doesNotMatch(sync, /personal_fitness_data\\derived|personal_fitness_data\\reports|Included private aggregate/i,
  "The web sync must never embed private personal evidence");
assert.match(sync, /\$publicFiles\s*=\s*@\(/, "Packaging must use an explicit public allowlist");
assert.match(sync, /GetFullPath[\s\S]*StartsWith[\s\S]*Remove-Item/, "Stale-payload pruning must validate containment before deletion");
for (const name of ["private-personal-data", "personal_fitness_data", "personal-fitness-data", "backups", "exports"]) {
  assert.match(sync, new RegExp(`"${name.replaceAll("-", "\\-")}"`), `Sync must prune ${name}`);
}
assert.match(verify, /Get-FileHash/, "Verification must enforce source/package parity");
assert.match(verify, /Sensitive files found in public payload/, "Verification must scan public payloads for private artifacts");

assert.match(manifest, /android:allowBackup="false"/);
assert.match(manifest, /android:fullBackupContent="false"/);
assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
assert.match(manifest, /android:usesCleartextTraffic="false"/);
assert.doesNotMatch(paths, /<external-path|path="\."/, "FileProvider paths must be narrowly scoped");
assert.match(paths, /path="share\/"/);
for (const domain of ["root", "file", "database", "sharedpref", "external"]) {
  const occurrences = extraction.match(new RegExp(`exclude domain="${domain}" path="\\."`, "g")) || [];
  assert.equal(occurrences.length, 2, `${domain} must be excluded from backup and device transfer`);
}

console.log("Native packaging privacy tests passed.");
