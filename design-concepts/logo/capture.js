"use strict";

/**
 * Renders the logo comparison page to PNG for side-by-side review.
 *
 *   node design-concepts/logo/build-logos.js && node design-concepts/logo/capture.js
 *
 * Exploration tooling. Writes only to artifacts/logo-concepts/ (gitignored).
 * Reads the generated page over file:// - no dev server required.
 */

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(ROOT, "artifacts", "logo-concepts");

const PAGES = [
  { file: "index.html", prefix: "round1" },
  { file: "lifting.html", prefix: "round2" }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 2 });
  let count = 0;

  for (const target of PAGES) {
    const file = path.join(__dirname, target.file);
    if (!fs.existsSync(file)) {
      console.error(`\n  FAILED  design-concepts/logo/${target.file} is missing. Run build-logos.js first.\n`);
      process.exit(1);
    }
    await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
    await page.waitForTimeout(400);

    await page.screenshot({ path: path.join(OUT, `${target.prefix}-sheet.png`), fullPage: true });
    count += 1;

    const sections = await page.$$("section.concept");
    for (let index = 0; index < sections.length; index += 1) {
      await sections[index].screenshot({ path: path.join(OUT, `${target.prefix}-${index + 1}.png`) });
      count += 1;
    }
  }

  await browser.close();
  console.log(`  ok  ${count} PNGs written to artifacts/logo-concepts/`);
})();
