"use strict";

/**
 * Guards for the coach concepts. Exploration tooling only; reads index.html,
 * never writes anything.
 *
 *   node coach-concepts/check.js        # every concept that exists
 *   node coach-concepts/check.js 03 07  # just these
 *
 * 1. Palette parity  - every token in palette.css matches index.html's :root.
 * 2. No raw colour   - concepts may only use var(--token), color-mix of tokens,
 *                      transparent and currentColor.
 * 3. Frame contract  - links palette.css, has .phone frames F1-F5, no external
 *                      scripts or modules, no remote images.
 */

const fs = require("node:fs");
const path = require("node:path");

const DIR = __dirname;
const ROOT = path.resolve(DIR, "..");

const CONCEPTS = [
  { id: "01", file: "01-control-chart.html", name: "Control Chart" },
  { id: "02", file: "02-earpiece.html", name: "Earpiece" },
  { id: "03", file: "03-futures.html", name: "Futures" },
  { id: "04", file: "04-sentence.html", name: "Sentence" },
  { id: "05", file: "05-ambient.html", name: "Ambient" },
  { id: "06", file: "06-hypothesis.html", name: "Hypothesis" },
  { id: "07", file: "07-instrument.html", name: "Instrument" },
  { id: "08", file: "08-lint.html", name: "Lint" },
  { id: "09", file: "09-engine.html", name: "Engine" },
  { id: "10", file: "10-loaded-bar.html", name: "Loaded Bar" }
];

const REQUIRED_FRAMES = ["F1", "F2", "F3", "F4", "F5"];
const NAMED_COLOURS = [
  "white", "black", "red", "green", "blue", "yellow", "orange", "purple", "pink", "gray", "grey",
  "navy", "gold", "silver", "teal", "aqua", "cyan", "magenta", "lime", "maroon", "olive", "brown",
  "beige", "ivory", "coral", "salmon", "crimson", "indigo", "violet", "tomato", "khaki", "lavender",
  "whitesmoke", "gainsboro", "lightgray", "lightgrey", "darkgray", "darkgrey", "dimgray", "slategray"
];
const NAMED = new RegExp(`(^|[\\s,(])(${NAMED_COLOURS.join("|")})(?=$|[\\s,);!])`, "i");
const COLOUR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/i;
const COLOUR_PROPS = /^(?:color|background|background-color|background-image|border|border-(?:top|right|bottom|left)(?:-color)?|border-color|outline|outline-color|box-shadow|text-shadow|fill|stroke|stop-color|flood-color|lighting-color|caret-color|accent-color|text-decoration|text-decoration-color|column-rule|column-rule-color|filter|-webkit-text-stroke|-webkit-text-fill-color|--[\w-]+)$/i;

function declarations(css) {
  const map = new Map();
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(match[1], match[2].trim().replace(/\s+/g, " "));
  return map;
}

function checkPalette() {
  const errors = [];
  const index = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const rootBlock = index.match(/:root\s*\{([\s\S]*?)\n\s*\}/);
  if (!rootBlock) return { errors: ["index.html: could not find the :root block"], tokens: new Map() };
  const production = declarations(rootBlock[1]);
  const palette = declarations(fs.readFileSync(path.join(DIR, "palette.css"), "utf8"));
  if (palette.size === 0) errors.push("palette.css: no tokens found");
  for (const [name, value] of palette) {
    if (!production.has(name)) errors.push(`palette.css: ${name} no longer exists in index.html`);
    else if (production.get(name) !== value) errors.push(`palette.css: ${name} is "${value}" but index.html has "${production.get(name)}"`);
  }
  return { errors, tokens: palette };
}

function lineOf(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function checkConcept(concept, tokens) {
  const errors = [];
  const warnings = [];
  const file = path.resolve(DIR, concept.file);
  const html = fs.readFileSync(file, "utf8");

  // Hex anywhere, except entities (&#215;), fragment links and SVG url(#id) references.
  for (const match of html.matchAll(/(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g)) {
    const before = html.slice(Math.max(0, match.index - 6), match.index);
    if (/(?:url\(|href=["'])$/.test(before)) continue;
    errors.push(`line ${lineOf(html, match.index)}: raw hex colour ${match[0]}`);
  }

  // Colour functions anywhere (color-mix is allowed; its arguments are checked below).
  const stripped = html.replace(/color-mix\s*\(/gi, "COLORMIX(");
  for (const match of stripped.matchAll(new RegExp(COLOUR_FN.source, "gi"))) {
    errors.push(`line ${lineOf(html, match.index)}: raw colour function ${match[0].trim()}`);
  }

  // Named colours in CSS declarations (style blocks + style attributes) and SVG colour attributes.
  const cssChunks = [];
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) cssChunks.push({ css: m[1], offset: m.index });
  for (const m of html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)) cssChunks.push({ css: m[1], offset: m.index });
  for (const { css, offset } of cssChunks) {
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, (c) => " ".repeat(c.length));
    for (const decl of noComments.matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)) {
      const prop = decl[1];
      const value = decl[2];
      if (!COLOUR_PROPS.test(prop)) continue;
      if (NAMED.test(value)) errors.push(`line ${lineOf(html, offset + decl.index)}: named colour in "${prop}: ${value.trim()}"`);
      if (prop.startsWith("--") && tokens.has(prop)) errors.push(`line ${lineOf(html, offset + decl.index)}: redefines palette token ${prop}`);
    }
  }
  for (const m of html.matchAll(/\s(fill|stroke|stop-color|color|flood-color)\s*=\s*"([^"]*)"/gi)) {
    const value = m[2].trim();
    if (/^(none|currentColor|transparent|inherit)$/i.test(value) || /^url\(#/.test(value)) continue;
    if (/var\(/.test(value)) {
      warnings.push(`line ${lineOf(html, m.index)}: ${m[1]}="${value}" â€” var() in presentation attributes is unreliable; prefer CSS`);
      continue;
    }
    errors.push(`line ${lineOf(html, m.index)}: SVG/HTML colour attribute ${m[1]}="${value}"`);
  }

  // Frame contract.
  if (!/<link[^>]+href=["']palette\.css["']/i.test(html)) errors.push("does not link palette.css");
  const frames = [...html.matchAll(/<[a-z]+\b(?=[^>]*\bclass=["'][^"']*\bphone\b)[^>]*\bdata-frame=["'](F\d)["']/gi)].map((m) => m[1].toUpperCase());
  for (const frame of REQUIRED_FRAMES) if (!frames.includes(frame)) errors.push(`missing frame .phone[data-frame="${frame}"]`);
  const duplicate = frames.find((frame, i) => frames.indexOf(frame) !== i);
  if (duplicate) errors.push(`duplicate frame ${duplicate}`);
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) errors.push(`line ${lineOf(html, m.index)}: external script`);
    if (/type\s*=\s*["']module["']/i.test(m[1])) errors.push(`line ${lineOf(html, m.index)}: module script`);
  }
  for (const m of html.matchAll(/<script\b(?![^>]*\bsrc)[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { new Function(m[1]); } catch (error) { errors.push(`line ${lineOf(html, m.index)}: inline script does not parse (${error.message})`); }
  }
  if (/<img\b[^>]+src=["']https?:/i.test(html)) errors.push("loads a remote image");
  if (/lorem ipsum/i.test(html)) errors.push("contains lorem ipsum");

  return { errors, warnings, frames };
}

function main() {
  const wanted = process.argv.slice(2).map((arg) => arg.padStart(2, "0"));
  const palette = checkPalette();
  let failed = false;
  if (palette.errors.length) {
    failed = true;
    console.error("Palette parity FAILED:");
    palette.errors.forEach((e) => console.error(`  - ${e}`));
  } else {
    console.log(`Palette parity OK (${palette.tokens.size} tokens match index.html).`);
  }

  const selected = CONCEPTS.filter((c) => (wanted.length ? wanted.includes(c.id) : true));
  for (const concept of selected) {
    if (!fs.existsSync(path.join(DIR, concept.file))) {
      if (wanted.length) { failed = true; console.error(`${concept.id} ${concept.name}: ${concept.file} not found`); }
      else console.log(`${concept.id} ${concept.name}: not built yet`);
      continue;
    }
    const result = checkConcept(concept, palette.tokens);
    if (result.errors.length) {
      failed = true;
      console.error(`${concept.id} ${concept.name}: FAILED`);
      result.errors.forEach((e) => console.error(`  - ${e}`));
    } else {
      console.log(`${concept.id} ${concept.name}: OK (frames ${result.frames.join(", ")})`);
    }
    result.warnings.forEach((w) => console.log(`  ! ${w}`));
  }
  process.exitCode = failed ? 1 : 0;
}

if (require.main === module) main();

module.exports = { CONCEPTS, checkConcept, checkPalette };
