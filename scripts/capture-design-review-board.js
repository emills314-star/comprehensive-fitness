"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const port = 8877;
const url = `http://127.0.0.1:${port}/artifacts/design-review/index.html`;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("Review-board server did not start.");
}

(async () => {
  const server = spawn(process.execPath, [path.join(root, "scripts", "serve-local.js")], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: "ignore", windowsHide: true });
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, colorScheme: "light", reducedMotion: "reduce" });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(root, "artifacts", "design-review", "review-board-contact-sheet.png"), fullPage: true, animations: "disabled", caret: "hide" });
    await browser.close();
  } finally { server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
