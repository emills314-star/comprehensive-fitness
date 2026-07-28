"use strict";

/**
 * Rasterises every app icon from the SVG sources in resources/.
 *
 *   node scripts/build-icons.js
 *
 * The SVGs are the source of truth; every PNG in this repo that shows the app
 * mark is generated here, so the web icons, the iOS AppIcon and the Android
 * launcher set can never drift apart. Edit resources/icon.svg, mirror the change
 * into icon-maskable.svg / icon-foreground.svg / icon-glyph.svg, re-run this.
 *
 * Rasterising uses the Playwright chromium already pinned for the UI audit
 * rather than adding an image dependency. Playwright is a devDependency and
 * this script is build tooling, so nothing new reaches the runtime bundle.
 *
 * Which source feeds which target:
 *
 *   icon.svg (rounded)      web icons and apple-touch-icon - matches the
 *                           pre-existing shipped look, corners already cut
 *   icon-maskable.svg       manifest purpose:"maskable", the iOS AppIcon (iOS
 *                           rejects alpha) and the Android legacy launcher PNGs
 *   icon-foreground.svg     Android adaptive foreground, transparent
 *
 * After running this: npm run sync:web (copies resources/ into www/) and
 * npm run cap:sync (pushes www/ into the native projects). The service worker
 * caches the web icons by name, so CACHE_NAME in sw.js must also advance or
 * installed PWAs keep serving the old bytes from cache.
 */

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const RESOURCES = path.join(ROOT, "resources");

const SOURCES = {
  rounded: "icon.svg",
  maskable: "icon-maskable.svg",
  foreground: "icon-foreground.svg"
};

const ANDROID_RES = path.join(ROOT, "android", "app", "src", "main", "res");
const ANDROID_DENSITIES = [
  { dir: "mipmap-mdpi", legacy: 48, foreground: 108 },
  { dir: "mipmap-hdpi", legacy: 72, foreground: 162 },
  { dir: "mipmap-xhdpi", legacy: 96, foreground: 216 },
  { dir: "mipmap-xxhdpi", legacy: 144, foreground: 324 },
  { dir: "mipmap-xxxhdpi", legacy: 192, foreground: 432 }
];

const IOS_APPICON = path.join(
  ROOT, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png"
);

/** Splash geometry mirrors the layout of the asset it replaces. */
const SPLASH = {
  file: path.join(RESOURCES, "splash-1170x2532.png"),
  width: 1170,
  height: 2532,
  background: "#f4f8fb", // manifest background_color
  ink: "#0d2033", // light-theme --text
  mark: 278
};

function targets() {
  const list = [
    { source: "rounded", size: 180, file: path.join(RESOURCES, "icon-180.png") },
    { source: "rounded", size: 192, file: path.join(RESOURCES, "icon-192.png") },
    { source: "rounded", size: 512, file: path.join(RESOURCES, "icon-512.png") },
    { source: "maskable", size: 512, file: path.join(RESOURCES, "icon-maskable-512.png") },
    { source: "maskable", size: 1024, file: path.join(RESOURCES, "icon-1024.png") },
    { source: "maskable", size: 1024, file: IOS_APPICON }
  ];
  for (const density of ANDROID_DENSITIES) {
    list.push({
      source: "maskable",
      size: density.legacy,
      file: path.join(ANDROID_RES, density.dir, "ic_launcher.png")
    });
    list.push({
      source: "maskable",
      size: density.legacy,
      file: path.join(ANDROID_RES, density.dir, "ic_launcher_round.png")
    });
    list.push({
      source: "foreground",
      size: density.foreground,
      file: path.join(ANDROID_RES, density.dir, "ic_launcher_foreground.png")
    });
  }
  return list;
}

function readSource(name) {
  const file = path.join(RESOURCES, SOURCES[name]);
  if (!fs.existsSync(file)) {
    console.error(`\n  FAILED  resources/${SOURCES[name]} is missing.\n`);
    process.exit(1);
  }
  // Strip the leading XML comment so the markup can be injected straight into a
  // document body without the comment shifting layout.
  return fs.readFileSync(file, "utf8").replace(/^\s*<!--[\s\S]*?-->\s*/, "");
}

const shell = (body, background) => `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: ${background}; }
  svg { display: block; width: 100%; height: 100%; }
</style>${body}`;

async function main() {
  const sources = Object.fromEntries(Object.keys(SOURCES).map((key) => [key, readSource(key)]));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  let written = 0;

  for (const target of targets()) {
    if (!fs.existsSync(path.dirname(target.file))) {
      console.error(`\n  FAILED  ${path.relative(ROOT, path.dirname(target.file))} does not exist.\n`);
      process.exit(1);
    }
    await page.setViewportSize({ width: target.size, height: target.size });
    await page.setContent(shell(sources[target.source], "transparent"));
    // omitBackground keeps the adaptive foreground's transparency; the rounded
    // and maskable sources paint their own opaque canvas regardless.
    await page.screenshot({ path: target.file, omitBackground: true });
    written += 1;
    console.log(`      ${path.relative(ROOT, target.file).replace(/\\/g, "/")}  ${target.size}px`);
  }

  await page.setViewportSize({ width: SPLASH.width, height: SPLASH.height });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; }
  body {
    width: ${SPLASH.width}px; height: ${SPLASH.height}px;
    background: ${SPLASH.background}; color: ${SPLASH.ink};
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 56px;
    font-family: Inter, "Segoe UI", system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .mark { width: ${SPLASH.mark}px; height: ${SPLASH.mark}px; }
  .mark svg { display: block; width: 100%; height: 100%; }
  h1 { margin: 0; font-size: 62px; font-weight: 800; letter-spacing: -0.03em; }
</style><div class="mark">${sources.rounded}</div><h1>Comprehensive Fitness</h1>`);
  await page.screenshot({ path: SPLASH.file });
  written += 1;
  console.log(`      ${path.relative(ROOT, SPLASH.file).replace(/\\/g, "/")}  ${SPLASH.width}x${SPLASH.height}`);

  await browser.close();
  console.log(`\n  ok  ${written} icons rasterised from resources/*.svg`);
  console.log("      next: npm run sync:web, advance CACHE_NAME in sw.js, npm run cap:sync\n");
}

main().catch((error) => {
  console.error(`\n  FAILED  ${error && error.message ? error.message : error}\n`);
  process.exit(1);
});
