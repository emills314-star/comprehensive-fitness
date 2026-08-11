"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const port = 8876;
const base = `http://127.0.0.1:${port}/artifacts/design-review/lab/index.html`;
const directions = ["a", "b", "c"];
const screens = ["today", "workout", "rest", "complete", "progress", "routines"];
const viewports = [
  { name: "mobile-390", width: 390, height: 844, screens },
  { name: "mobile-430", width: 430, height: 932, screens: ["today", "workout"] },
  { name: "desktop", width: 1440, height: 900, screens: ["today", "workout", "progress"] }
];

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { const response = await fetch(base); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("Design-lab server did not start.");
}

(async () => {
  const server = spawn(process.execPath, [path.join(root, "scripts", "serve-local.js")], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
    windowsHide: true
  });
  try {
    await waitForServer();
    const browser = await chromium.launch();
    for (const direction of directions) {
      const output = path.join(root, "artifacts", "design-review", `direction-${direction}`);
      fs.mkdirSync(output, { recursive: true });
      for (const viewport of viewports) {
        for (const screen of viewport.screens) {
          const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: "light", reducedMotion: "reduce" });
          await page.goto(`${base}?direction=${direction}&screen=${screen}`, { waitUntil: "networkidle" });
          await page.screenshot({ path: path.join(output, `${viewport.name}-${screen}.png`), fullPage: false, animations: "disabled", caret: "hide" });
          await page.close();
        }
      }
    }
    await browser.close();
  } finally {
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
