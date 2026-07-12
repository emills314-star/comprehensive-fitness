"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const verifier = path.join(ROOT, "scripts", "verify-pwa.ps1");
const candidates = process.platform === "win32" ? ["powershell.exe", "powershell", "pwsh"] : ["pwsh", "powershell"];

for (const executable of candidates) {
  const result = spawnSync(executable, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", verifier], {
    cwd: ROOT,
    stdio: "inherit"
  });
  if (result.error?.code === "ENOENT") continue;
  if (result.error) {
    console.error(`Unable to run ${executable}: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status || 0);
}

console.error("PWA verification requires PowerShell (powershell or pwsh), but neither executable is available.");
process.exit(1);
