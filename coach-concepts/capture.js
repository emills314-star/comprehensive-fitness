"use strict";

/**
 * Screenshots every phone frame of the coach concepts to coach-concepts/shots/.
 * Exploration tooling only; writes nothing outside shots/.
 *
 *   node coach-concepts/capture.js        # every concept that exists
 *   node coach-concepts/capture.js 03 07  # just these
 *
 * Also reports layout problems the eye misses at a glance: frames that are not
 * 390 x 844, content clipped at the bottom of a frame, elements spilling out of
 * a frame's sides, text under 11px, and console errors.
 */

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("@playwright/test");
const { CONCEPTS } = require("./check.js");

const DIR = __dirname;
const OUT = path.join(DIR, "shots");

async function captureConcept(browser, concept) {
  const file = path.join(DIR, concept.file);
  const context = await browser.newContext({ viewport: { width: 2600, height: 1200 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(err.message));
  await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" }).catch(() => page.goto(pathToFileURL(file).href));
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(600);

  const report = await page.evaluate(() => {
    const frames = [...document.querySelectorAll(".phone[data-frame]")];
    return frames.map((frame) => {
      const box = frame.getBoundingClientRect();
      const problems = [];
      if (Math.abs(box.width - 390) > 1 || Math.abs(box.height - 844) > 1) problems.push(`size ${Math.round(box.width)}x${Math.round(box.height)} (expected 390x844)`);
      if (frame.scrollHeight > frame.clientHeight + 2) problems.push(`content is ${frame.scrollHeight - frame.clientHeight}px taller than the frame (clipped)`);
      let spill = 0;
      let small = new Set();
      for (const el of frame.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (r.right > box.right + 2 || r.left < box.left - 2) spill += 1;
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (hasText && parseFloat(style.fontSize) < 11) small.add(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 24)}" ${style.fontSize}`);
      }
      if (spill) problems.push(`${spill} element(s) extend past the frame's sides`);
      if (small.size) problems.push(`text under 11px: ${[...small].slice(0, 4).join("; ")}${small.size > 4 ? ` (+${small.size - 4} more)` : ""}`);
      return { frame: frame.dataset.frame, problems };
    });
  });

  for (const handle of await page.$$(".phone[data-frame]")) {
    const id = await handle.getAttribute("data-frame");
    await handle.screenshot({ path: path.join(OUT, `${concept.id}-${id}.png`), animations: "disabled", timeout: 60000 });
  }
  await page.screenshot({ path: path.join(OUT, `${concept.id}-page.png`), fullPage: true, animations: "disabled", timeout: 60000 });
  await context.close();
  return { report, consoleErrors };
}

async function main() {
  const wanted = process.argv.slice(2).map((arg) => arg.padStart(2, "0"));
  const selected = CONCEPTS.filter((c) => (wanted.length ? wanted.includes(c.id) : true))
    .filter((c) => fs.existsSync(path.join(DIR, c.file)));
  if (!selected.length) { console.error("No concept files found to capture."); process.exitCode = 1; return; }
  fs.mkdirSync(OUT, { recursive: true });
  // CAPTURE_CHANNEL=msedge uses the installed Edge, for machines where Playwright's
  // bundled Chromium hangs on launch.
  const channel = process.env.CAPTURE_CHANNEL;
  const browser = await chromium.launch({ timeout: 90000, ...(channel ? { channel } : {}) });
  try {
    for (const concept of selected) {
      const { report, consoleErrors } = await captureConcept(browser, concept);
      console.log(`${concept.id} ${concept.name}: ${report.length} frame(s) -> shots/${concept.id}-F*.png`);
      for (const r of report) for (const p of r.problems) console.log(`  ! ${r.frame}: ${p}`);
      for (const e of consoleErrors) console.log(`  ! console: ${e}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
