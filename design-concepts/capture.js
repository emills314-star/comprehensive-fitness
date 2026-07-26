"use strict";

/**
 * Renders the design concept mockups to PNG.
 *
 * This script is exploration tooling. It reads the production stylesheet but
 * never writes to it, and it touches nothing outside artifacts/design-concepts/.
 *
 *   node design-concepts/capture.js
 *
 * Two guards run before anything renders, so the one rule these concepts must
 * obey - keep the shipped colour palette - is proved rather than asserted:
 *
 *   1. Token parity. tokens.css must still be a verbatim copy of the token
 *      block in index.html. Any drift on either side fails the run.
 *   2. No raw colour. Concept files may only reference var(--token). A hex or
 *      rgb() literal anywhere outside tokens.css fails the run.
 */

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const CONCEPT_DIR = __dirname;
const OUT_DIR = path.join(ROOT, "artifacts", "design-concepts");

const TOKEN_FIRST_LINE = 19; // index.html ":root {"
const TOKEN_LAST_LINE = 202; // index.html light-theme canvas override

// The original four explorations. `dark` names the screen that also renders on
// the night-stadium canvas.
const ALL_CONCEPTS = [
  { id: "a-two-speed", file: "a-two-speed.html", name: "Two-Speed", dark: "workout" },
  { id: "b-budget", file: "b-budget.html", name: "Budget", dark: "workout" },
  { id: "c-confidence", file: "c-confidence.html", name: "Confidence", dark: "workout" },
  { id: "d-plan-actual", file: "d-plan-actual.html", name: "Plan vs Actual", dark: "workout" }
];

// The chosen direction: Confidence as the base language with Plan-vs-Actual's
// delta spine grafted in, applied across the rest of the app.
const ALL_MERGED = [
  { id: "m1-workout-variants", file: "m1-workout-variants.html", name: "Active workout variants", dark: "v1-spine" },
  { id: "m2-core", file: "m2-core.html", name: "Core screens" },
  { id: "m3-start-flow", file: "m3-start-flow.html", name: "Start & readiness flow" },
  { id: "m4-mesocycle", file: "m4-mesocycle.html", name: "Guided mesocycle builder" },
  { id: "m5-analysis", file: "m5-analysis.html", name: "History & lift analysis" },
  { id: "m6-settings", file: "m6-settings.html", name: "Settings, data & states" },
  { id: "m7-workout-exit", file: "m7-workout-exit.html", name: "Leaving an active workout", dark: "exit-b-dock" },
  { id: "m8-icon-set", file: "m8-icon-set.html", name: "Icon set for review", dark: "icons-in-place" },
  { id: "m9-nav-icons", file: "m9-nav-icons.html", name: "Barbell, calendar, colour", dark: "nav-new-glyphs" }
];

// Authoring aid: render whatever exists so a file can be checked before the
// rest are written.
const exists = (entry) => fs.existsSync(path.join(CONCEPT_DIR, entry.file));
const CONCEPTS = ALL_CONCEPTS.filter(exists);
const MERGED = ALL_MERGED.filter(exists);
const EVERYTHING = [...CONCEPTS, ...MERGED];

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/;
const RGB = /\brgba?\s*\(/;

function fail(message) {
  console.error(`\n  FAILED  ${message}\n`);
  process.exit(1);
}

/** Guard 1: tokens.css is still byte-identical to index.html's token block. */
function verifyTokenParity() {
  const appLines = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").split(/\r?\n/);
  const expected = appLines.slice(TOKEN_FIRST_LINE - 1, TOKEN_LAST_LINE);

  if (!/^\s*:root\s*\{\s*$/.test(expected[0])) {
    fail(`index.html line ${TOKEN_FIRST_LINE} is no longer ":root {". The token block moved; re-extract tokens.css.`);
  }

  const tokenLines = fs.readFileSync(path.join(CONCEPT_DIR, "tokens.css"), "utf8").split(/\r?\n/);
  const start = tokenLines.findIndex((line) => /^\s*:root\s*\{\s*$/.test(line));
  if (start === -1) fail("tokens.css has no :root block.");
  const actual = tokenLines.slice(start, start + expected.length);

  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) {
      fail(
        `Palette drift at index.html line ${TOKEN_FIRST_LINE + index}.\n` +
        `    app:    ${JSON.stringify(expected[index])}\n` +
        `    tokens: ${JSON.stringify(actual[index])}`
      );
    }
  }
  console.log(`  ok  token parity - ${expected.length} lines match index.html:${TOKEN_FIRST_LINE}-${TOKEN_LAST_LINE}`);
}

/** Guard 2: concepts reference tokens only, never raw colour values. */
function verifyNoRawColour() {
  const files = fs.readdirSync(CONCEPT_DIR)
    .filter((name) => /\.(html|css)$/.test(name) && name !== "tokens.css");

  const offences = [];
  for (const name of files) {
    const lines = fs.readFileSync(path.join(CONCEPT_DIR, name), "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (HEX.test(line) || RGB.test(line)) offences.push(`${name}:${index + 1}  ${line.trim().slice(0, 90)}`);
    });
  }

  if (offences.length) {
    fail(`Raw colour outside tokens.css - concepts must use var(--token):\n    ${offences.join("\n    ")}`);
  }
  console.log(`  ok  no raw colour - ${files.length} files reference tokens only`);
}

async function shoot(page, selector, file) {
  await page.locator(selector).screenshot({ path: path.join(OUT_DIR, file) });
  return file;
}

async function main() {
  console.log("\nDesign concept capture\n");
  verifyTokenParity();
  verifyNoRawColour();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const written = [];

  // Individual phone screens, retina.
  const phone = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  const page = await phone.newPage();

  for (const concept of EVERYTHING) {
    const url = `file://${path.join(CONCEPT_DIR, concept.file).replace(/\\/g, "/")}`;
    await page.goto(url, { waitUntil: "load" });

    // Screens are fixed at 390x844 and clip. Report any that overflow so
    // silently truncated content never ships as a finished mockup.
    const overflow = await page.locator("[data-screen]").evaluateAll((nodes) => nodes
      .map((node) => {
        const body = node.querySelector(".study-body, .b-body, .c-body, .d-body");
        if (!body) return null;
        const spill = body.scrollHeight - body.clientHeight;
        return spill > 1 ? { screen: node.dataset.screen, spill } : null;
      })
      .filter(Boolean));
    for (const item of overflow) {
      console.log(`  !!  ${concept.id} "${item.screen}" overflows by ${item.spill}px - content is being clipped`);
    }

    const ids = await page.locator("[data-screen]").evaluateAll((nodes) => nodes.map((node) => node.dataset.screen));
    for (const id of ids) {
      written.push(await shoot(page, `[data-screen="${id}"]`, `${concept.id}--${id}.png`));
    }

    // Same markup, dark canvas, to show the palette's range.
    if (concept.dark) {
      await page.evaluate(() => { document.documentElement.dataset.colorPackage = "night-stadium"; });
      written.push(await shoot(page, `[data-screen="${concept.dark}"]`, `${concept.id}--${concept.dark}-dark.png`));
      await page.evaluate(() => { document.documentElement.dataset.colorPackage = "signal-garden"; });
    }
  }
  await phone.close();

  // Contact sheets: all six screens of a concept in one wide image.
  // Viewports are sized to the content (6 or 4 screens + gaps + padding) so the
  // full-page capture carries no dead canvas.
  const MAX_SHEET = 6 * 390 + 5 * 24 + 64;
  const COMPARE_WIDTH = 4 * 390 + 3 * 24 + 64;

  const wide = await browser.newContext({ viewport: { width: MAX_SHEET, height: 1200 }, deviceScaleFactor: 1 });
  const wpage = await wide.newPage();
  for (const concept of EVERYTHING) {
    const url = `file://${path.join(CONCEPT_DIR, concept.file).replace(/\\/g, "/")}`;
    await wpage.goto(url, { waitUntil: "load" });
    // Fit the viewport to the content so sheets with fewer than six screens
    // carry no dead canvas.
    // body is block-level so its scrollWidth is just the viewport; measure the
    // max-content children instead.
    const width = await wpage.evaluate(() => {
      const sheet = document.querySelector(".sheet");
      const head = document.querySelector(".sheet-head");
      return Math.ceil(Math.max(sheet ? sheet.scrollWidth : 0, head ? head.scrollWidth : 0));
    });
    await wpage.setViewportSize({ width: Math.min(Math.max(width, 420), MAX_SHEET), height: 1200 });
    const file = `${concept.id}--contact-sheet.png`;
    await wpage.screenshot({ path: path.join(OUT_DIR, file), fullPage: true });
    await wpage.setViewportSize({ width: MAX_SHEET, height: 1200 });
    written.push(file);
  }

  // Master comparison: the decisive screen from all four concepts together.
  const compareHtml = `<!doctype html>
<html data-theme="light" data-color-package="signal-garden"><head><meta charset="utf-8">
<link rel="stylesheet" href="${path.join(CONCEPT_DIR, "tokens.css").replace(/\\/g, "/")}">
<style>
  body { margin:0; background: color-mix(in srgb, var(--text) 8%, var(--bg)); color: var(--text);
         font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { padding: 32px 32px 0; display:grid; gap:6px; }
  .k { font-size:12px; font-weight:900; letter-spacing:.14em; text-transform:uppercase; color: var(--current); }
  h1 { margin:0; font-size:28px; font-weight:850; letter-spacing:-.02em; }
  p { margin:0; font-size:14px; color: var(--muted); }
  .row { display:flex; gap:24px; padding:24px 32px 32px; width:max-content; }
  figure { margin:0; display:grid; gap:8px; width:390px; }
  img { width:390px; display:block; border:1px solid var(--line-strong); border-radius:20px; }
  figcaption b { font-size:13px; font-weight:850; }
  figcaption span { display:block; font-size:12px; color: var(--muted); }
</style></head><body>
<header><span class="k">Side by side</span><h1>The same moment in four designs</h1>
<p>Mid-session, rest timer running. The screen that decides which direction is right.</p></header>
<div class="row">
${CONCEPTS.map((c) => `<figure><img src="${c.id}--workout.png"><figcaption><b>${c.name}</b><span>Concept ${c.id[0].toUpperCase()}</span></figcaption></figure>`).join("\n")}
</div></body></html>`;

  const comparePath = path.join(OUT_DIR, "_compare.html");
  fs.writeFileSync(comparePath, compareHtml);
  await wpage.setViewportSize({ width: COMPARE_WIDTH, height: 1200 });
  await wpage.goto(`file://${comparePath.replace(/\\/g, "/")}`, { waitUntil: "load" });
  await wpage.screenshot({ path: path.join(OUT_DIR, "_all-four--workout.png"), fullPage: true });
  written.push("_all-four--workout.png");

  await wide.close();
  await browser.close();

  console.log(`  ok  rendered ${written.length} images to artifacts/design-concepts/\n`);
}

main().catch((error) => fail(error.stack || String(error)));
