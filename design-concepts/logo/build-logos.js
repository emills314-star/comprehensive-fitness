"use strict";

/**
 * Generates the five logo concepts as SVG plus a comparison page.
 *
 *   node design-concepts/logo/build-logos.js
 *
 * Exploration tooling. Writes only inside design-concepts/logo/ and touches no
 * shipped asset. Nothing here is referenced by index.html, sw.js, the manifest
 * or the Capacitor payload until a direction is chosen.
 *
 * Colour rule. App icons are baked PNGs outside the CSS custom-property system,
 * so these files carry literal values rather than var(--token). Every literal is
 * lifted from the shipped palette in index.html lines 19-202 - see PALETTE below
 * for the token each one comes from. No new hues are introduced.
 *
 * Maskable safety. All art sits inside the circle of radius 396 about (512,512),
 * comfortably within the 409.6 radius Android reserves for maskable icons, so
 * one geometry serves the rounded-square, circular and squircle masks alike.
 */

const fs = require("node:fs");
const path = require("node:path");

const OUT = __dirname;

/* ---------------------------------------------------------------- palettes */

// Dark icon. bgA/bgB are --panel-3 and --bg; the blue ladder walks
// heritage-atlas --current -> modern-primary --current -> night-stadium
// --current; gold is night-stadium --amber; cream is --text.
const DARK = {
  bgA: "#16283f",
  bgB: "#07101d",
  track: "#1c3f6b",
  deep: "#1f4f88",
  mid: "#2f7bcf",
  bright: "#4fa3ff",
  gold: "#f4c84c",
  cream: "#f4f7fa",
  ink: "#07101d"
};

// Light icon. bgA/bgB are the manifest background_color and light --bg-soft;
// deep is light-theme --current, mid is heritage-atlas --current, bright is
// modern-primary --current, gold is heritage-atlas light --amber.
const LIGHT = {
  bgA: "#ffffff",
  bgB: "#eef2f6",
  track: "#cbdcef",
  deep: "#183b62",
  mid: "#245ca6",
  bright: "#1769d2",
  gold: "#b87916",
  cream: "#123d6b",
  ink: "#f4f8fb"
};

// In-app glyph. Single-colour, inherits whatever --current the active colour
// package supplies, so the mark restains itself across all ten packages.
const GLYPH = {
  bgA: null,
  bgB: null,
  track: { c: "currentColor", o: 0.22 },
  deep: { c: "currentColor", o: 0.34 },
  mid: { c: "currentColor", o: 0.62 },
  bright: { c: "currentColor" },
  gold: { c: "currentColor", o: 0.48 },
  cream: { c: "currentColor", o: 0.85 },
  ink: { c: "none" }
};

function normalise(palette) {
  const out = {};
  for (const [key, value] of Object.entries(palette)) {
    out[key] = value === null ? null : typeof value === "string" ? { c: value } : value;
  }
  return out;
}

const f = (t) => `fill="${t.c}"${t.o != null ? ` fill-opacity="${t.o}"` : ""}`;
const st = (t, width, extra = "") =>
  `fill="none" stroke="${t.c}"${t.o != null ? ` stroke-opacity="${t.o}"` : ""}` +
  ` stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra ? ` ${extra}` : ""}`;

/* ------------------------------------------------------------------ geometry */

const n = (v) => Math.round(v * 10) / 10;
const CENTRE = 512;
const pt = (angle, radius) => [
  n(CENTRE + radius * Math.cos((angle * Math.PI) / 180)),
  n(CENTRE + radius * Math.sin((angle * Math.PI) / 180))
];

function arcPath(from, to, radius) {
  const [x0, y0] = pt(from, radius);
  const [x1, y1] = pt(to, radius);
  return `M ${x0} ${y0} A ${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/* ------------------------------------------------------------------ concepts */

const ROUND_ONE = [
  {
    id: "01-increment",
    name: "Increment",
    tag: "Progression",
    thesis:
      "The same lift, moved one step. Three identical pills stacked and offset by exactly one increment, " +
      "brightening as they climb; the gold cap is the step you have not taken yet.",
    art: (p) => `
  <rect x="240" y="608" width="400" height="104" rx="52" ${f(p.deep)}/>
  <rect x="304" y="460" width="400" height="104" rx="52" ${f(p.mid)}/>
  <rect x="368" y="312" width="400" height="104" rx="52" ${f(p.bright)}/>
  <circle cx="716" cy="364" r="52" ${f(p.gold)}/>`
  },
  {
    id: "02-landmark",
    name: "Landmark",
    tag: "Volume budget",
    thesis:
      "Weekly volume as an allocation against research landmarks. The sweep is what you have spent, the " +
      "three notches are MEV, MAV and MRV, and the heavier third notch is the ceiling.",
    art: (p) => {
      const ticks = [0.4, 0.65, 0.9]
        .map((fraction, index) => {
          const angle = 135 + 270 * fraction;
          const [x0, y0] = pt(angle, 150);
          const [x1, y1] = pt(angle, 290);
          return `<path d="M ${x0} ${y0} L ${x1} ${y1}" ${st(p.gold, index === 2 ? 34 : 22)}/>`;
        })
        .join("\n  ");
      // The open arc's mass sits above the geometric centre, so the whole group
      // is nudged down to put its optical centre on the icon centre.
      return `
  <g transform="translate(0 26)">
  <path d="${arcPath(135, 405, 220)}" ${st(p.track, 88)}/>
  <path d="${arcPath(135, 302.4, 220)}" ${st(p.bright, 88)}/>
  ${ticks}
  </g>`;
    }
  },
  {
    id: "03-overshoot",
    name: "Overshoot",
    tag: "Plan vs actual",
    thesis:
      "The prescription is the outline; what you actually did is the solid block. It does not sit inside the " +
      "frame - it breaks out of the top-right corner, and only the part beyond plan is gold.",
    art: (p, uid) => `
  <defs>
    <mask id="beyond-${uid}">
      <rect width="1024" height="1024" fill="#ffffff"/>
      <rect x="244" y="244" width="480" height="480" rx="116" fill="#000000"/>
    </mask>
  </defs>
  <g transform="translate(0 20)">
  <rect x="440" y="216" width="336" height="336" rx="84" ${f(p.bright)}/>
  <rect x="264" y="264" width="440" height="440" rx="96" ${st(p.mid, 40)}/>
  <rect x="440" y="216" width="336" height="336" rx="84" ${f(p.gold)} mask="url(#beyond-${uid})"/>
  </g>`
  },
  {
    id: "04-forecast",
    name: "Forecast",
    tag: "Honest projection",
    thesis:
      "What is measured is drawn solid; what is inferred is drawn dashed to a hollow node. The mark says the " +
      "one thing that separates this app - it never renders a projection as though it were a record.",
    // The projection is drawn as discrete dots rather than stroke-dasharray:
    // at this stroke weight round caps overrun the gaps and the dashes fuse
    // into one solid lump, which is the opposite of what the mark has to say.
    art: (p) => `
  <path d="M 232 700 L 380 620 L 496 528" ${st(p.bright, 72)}/>
  <circle cx="496" cy="528" r="50" ${f(p.bright)}/>
  <circle cx="578.7" cy="458.7" r="23" ${f(p.gold)}/>
  <circle cx="633.9" cy="412.4" r="23" ${f(p.gold)}/>
  <circle cx="689" cy="366.2" r="23" ${f(p.gold)}/>
  <circle cx="768" cy="300" r="48" ${f(p.ink)} ${st(p.gold, 26).replace('fill="none" ', "")}/>`
  },
  {
    id: "05-cadence",
    name: "Cadence",
    tag: "Work and rest",
    thesis:
      "A session is not one effort, it is a rhythm: long blue work, short gold rest, the heaviest set widest. " +
      "The app's two signature accents carry their shipped meaning straight into the mark.",
    art: (p) => {
      const rows = [
        { width: 360, tone: "mid" },
        { width: 150, tone: "gold" },
        { width: 470, tone: "bright" },
        { width: 130, tone: "gold" },
        { width: 300, tone: "mid" }
      ];
      return rows
        .map((row, index) => {
          const y = 266 + index * 104;
          const x = n(512 - row.width / 2);
          return `\n  <rect x="${x}" y="${y}" width="${row.width}" height="76" rx="38" ${f(p[row.tone])}/>`;
        })
        .join("");
    }
  }
];

/* Round two. Round one read as abstract progress marks rather than as a gym
   app, so this set stays inside the equipment vocabulary and works the palette
   instead of the metaphor. Gold is a material accent here rather than a state
   token - it is the small plate, the J-hook, the weight band. */

const ROUND_TWO = [
  {
    id: "06-plate",
    name: "Plate",
    tag: "Bumper plate, face on",
    thesis:
      "A single plate loaded on the sleeve, seen face on: deep body, bright colour ring near the rim, gold " +
      "collar at the hub. The bar stubs are what stop a disc from reading as a dial - without them this is " +
      "a steering wheel.",
    art: (p) => `
  <rect x="120" y="480" width="784" height="64" rx="32" ${f(p.cream)}/>
  <circle cx="512" cy="512" r="272" ${f(p.deep)}/>
  <circle cx="512" cy="512" r="238" ${st(p.bright, 46)}/>
  <circle cx="512" cy="512" r="104" ${st(p.gold, 30)}/>`
  },
  {
    id: "07-sleeve",
    name: "Sleeve",
    tag: "Loaded barbell",
    thesis:
      "A loaded bar in profile, plates stepping down toward the collar. The outermost pair is gold - the " +
      "change plate you added this week, which is the whole point of the app.",
    art: (p) => {
      // Two plates a side, not three, and pushed well outboard. Crowding six
      // plates around the centre made the first pass read as a dumbbell; a
      // barbell is mostly bare bar.
      const plates = [
        { inner: 196, width: 80, height: 320, radius: 40, tone: "bright" },
        { inner: 296, width: 56, height: 220, radius: 28, tone: "gold" }
      ];
      const pair = plates
        .map((plate) => {
          const y = n(512 - plate.height / 2);
          const right = 512 + plate.inner;
          const left = 512 - plate.inner - plate.width;
          return (
            `\n  <rect x="${right}" y="${y}" width="${plate.width}" height="${plate.height}" ` +
            `rx="${plate.radius}" ${f(p[plate.tone])}/>` +
            `\n  <rect x="${left}" y="${y}" width="${plate.width}" height="${plate.height}" ` +
            `rx="${plate.radius}" ${f(p[plate.tone])}/>`
          );
        })
        .join("");
      return `
  <rect x="122" y="488" width="780" height="48" rx="24" ${f(p.cream)}/>${pair}`;
    }
  },
  {
    id: "08-rack",
    name: "Rack",
    tag: "Bar in the hooks",
    thesis:
      "The moment before the set: the bar racked high on two uprights, gold J-hooks holding it. The punched " +
      "hole pattern is what makes it a rack rather than another barbell - drop the holes and it reads as a " +
      "dumbbell again.",
    art: (p, uid) => {
      const holes = [];
      for (let y = 246; y <= 790; y += 68) {
        holes.push(`<circle cx="304" cy="${y}" r="13" fill="#000000"/>`);
        holes.push(`<circle cx="720" cy="${y}" r="13" fill="#000000"/>`);
      }
      const uprights =
        `<rect x="272" y="200" width="64" height="624" rx="32" ` +
        `<<fill>>/>\n    <rect x="688" y="200" width="64" height="624" rx="32" <<fill>>/>`;
      return `
  <defs>
    <mask id="rack-${uid}">
    ${uprights.replace(/<<fill>>/g, 'fill="#ffffff"')}
    ${holes.join("\n    ")}
    </mask>
  </defs>
  <g mask="url(#rack-${uid})">
    ${uprights.replace(/<<fill>>/g, f(p.deep))}
  </g>
  <rect x="256" y="330" width="96" height="104" rx="26" ${f(p.gold)}/>
  <rect x="672" y="330" width="96" height="104" rx="26" ${f(p.gold)}/>
  <rect x="216" y="352" width="592" height="60" rx="30" ${f(p.cream)}/>`;
    }
  },
  {
    id: "09-press",
    name: "Press",
    tag: "Lockout",
    thesis:
      "A lifter at lockout, bar overhead. The only mark in the set with a person in it, which is also the " +
      "only one that shows what the app is for rather than what it is about.",
    art: (p) => `
  <rect x="248" y="272" width="528" height="58" rx="29" ${f(p.cream)}/>
  <rect x="248" y="236" width="62" height="130" rx="28" ${f(p.bright)}/>
  <rect x="714" y="236" width="62" height="130" rx="28" ${f(p.bright)}/>
  <path d="M 398 618 L 374 346" ${st(p.mid, 62)}/>
  <path d="M 626 618 L 650 346" ${st(p.mid, 62)}/>
  <rect x="392" y="562" width="240" height="72" rx="36" ${f(p.mid)}/>
  <rect x="440" y="604" width="144" height="178" rx="70" ${f(p.mid)}/>
  <circle cx="512" cy="456" r="74" ${f(p.cream)}/>`
  },
  {
    id: "10-kettlebell",
    name: "Kettlebell",
    tag: "One object",
    thesis:
      "One object, one silhouette. Handle and body share a colour so the mark casts as a single shape with a " +
      "real hole under the arch - a contrasting handle over a round body reads as a handbag, which is exactly " +
      "what the first pass did.",
    art: (p) => `
  <path d="M 428 556 C 414 236 610 236 596 556" ${st(p.bright, 54)}/>
  <circle cx="512" cy="660" r="192" ${f(p.bright)}/>
  <rect x="356" y="790" width="312" height="72" rx="32" ${f(p.deep)}/>`
  }
];

const ROUNDS = [
  {
    file: "index.html",
    title: "Logo concepts &mdash; round one",
    eyebrow: "Design exploration &middot; not wired to the app",
    heading: "Five logo directions",
    lede:
      "Marks derived from what the app does rather than from gym equipment. " +
      "Every colour is lifted from the shipped palette in <code>index.html</code>.",
    concepts: ROUND_ONE
  },
  {
    file: "lifting.html",
    title: "Logo concepts &mdash; round two",
    eyebrow: "Design exploration &middot; not wired to the app",
    heading: "Five lifting marks",
    lede:
      "Round two stays inside the equipment vocabulary: plate, bar, rack, lifter, bell. " +
      "Same palette rule, same maskable safe circle, same one-colour in-app glyph.",
    concepts: ROUND_TWO
  }
];

/* -------------------------------------------------------------------- render */

function icon(concept, palette, uid, { rounded = true } = {}) {
  const p = normalise(palette);
  const background = p.bgA
    ? `
  <defs>
    <linearGradient id="bg-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.bgA.c}"/>
      <stop offset="1" stop-color="${p.bgB.c}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024"${rounded ? ' rx="220"' : ""} fill="url(#bg-${uid})"/>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" ` +
    `aria-label="Comprehensive Fitness - ${concept.name}">${background}${concept.art(p, uid)}\n</svg>\n`
  );
}

const written = [];
function write(name, contents) {
  fs.writeFileSync(path.join(OUT, name), contents, "utf8");
  written.push(name);
}

const variants = [
  { suffix: "dark", palette: DARK },
  { suffix: "light", palette: LIGHT },
  { suffix: "glyph", palette: GLYPH },
  { suffix: "maskable", palette: DARK, options: { rounded: false } }
];

for (const round of ROUNDS) {
  for (const concept of round.concepts) {
    for (const variant of variants) {
      const uid = `${concept.id}-${variant.suffix}`;
      write(`${concept.id}-${variant.suffix}.svg`, icon(concept, variant.palette, uid, variant.options || {}));
    }
  }
}

/* ---------------------------------------------------------- comparison page */

const inline = (concept, variant, palette, options) =>
  icon(concept, palette, `page-${concept.id}-${variant}`, options || {});

const SIZES = [128, 96, 64, 48, 32, 24];

const renderSections = (concepts) => concepts.map((concept) => {
  const dark = inline(concept, "dark", DARK);
  const light = inline(concept, "light", LIGHT);
  const glyph = inline(concept, "glyph", GLYPH);
  const strip = SIZES.map(
    (size) =>
      `<figure class="chip"><div class="shot" style="width:${size}px;height:${size}px">${inline(
        concept,
        `s${size}`,
        DARK
      )}</div><figcaption>${size}</figcaption></figure>`
  ).join("");
  return `
<section class="concept">
  <header>
    <span class="num">${concept.id.split("-")[0]}</span>
    <div>
      <h2>${concept.name}</h2>
      <span class="tag">${concept.tag}</span>
    </div>
  </header>
  <p class="thesis">${concept.thesis}</p>
  <div class="pair">
    <figure><div class="big">${dark}</div><figcaption>Home screen &mdash; dark</figcaption></figure>
    <figure><div class="big">${light}</div><figcaption>Home screen &mdash; light</figcaption></figure>
  </div>
  <div class="row">
    <div class="strip">${strip}</div>
    <div class="glyphs">
      <div class="glyph on-surface">${glyph}</div>
      <div class="glyph on-accent">${glyph}</div>
      <div class="glyph on-rest">${glyph}</div>
      <figcaption>In-app glyph, <code>currentColor</code></figcaption>
    </div>
  </div>
  <div class="lockups">
    <div class="lockup"><div class="mark">${dark}</div><div class="words"><b>Comprehensive</b><span>Fitness</span></div></div>
    <div class="lockup light"><div class="mark">${light}</div><div class="words"><b>Comprehensive</b><span>Fitness</span></div></div>
  </div>
</section>`;
}).join("\n");

const renderPage = (round) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comprehensive Fitness &mdash; ${round.title}</title>
<style>
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0; padding: 48px 24px 96px; background: #07101d; color: #f4f7fa;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 940px; margin: 0 auto; }
.eyebrow { font-size: 12px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; color: #4fa3ff; }
h1 { margin: 10px 0 0; font-size: 34px; font-weight: 850; letter-spacing: -.03em; }
.lede { margin: 14px 0 0; max-width: 62ch; line-height: 1.6; color: #b3c2d6; font-size: 15px; }
.concept { margin-top: 56px; padding-top: 32px; border-top: 1px solid #1c3f6b; }
.concept header { display: flex; gap: 16px; align-items: baseline; }
.num { font-size: 13px; font-weight: 900; color: #4fa3ff; letter-spacing: .1em; }
h2 { margin: 0; font-size: 24px; font-weight: 850; letter-spacing: -.02em; }
.tag { display: inline-block; margin-top: 6px; font-size: 11px; font-weight: 800; letter-spacing: .12em;
  text-transform: uppercase; color: #f4c84c; }
.thesis { margin: 14px 0 0; max-width: 68ch; line-height: 1.65; color: #b3c2d6; font-size: 14px; }
figure { margin: 0; }
figcaption { margin-top: 8px; font-size: 11px; color: #91a5bd; letter-spacing: .04em; }
.pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 24px; }
.big { width: 100%; aspect-ratio: 1; }
.big svg, .shot svg, .glyph svg, .mark svg { width: 100%; height: 100%; display: block; }
.row { display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-end; margin-top: 28px; }
.strip { display: flex; gap: 16px; align-items: flex-end; }
.chip { text-align: center; }
.chip figcaption { margin-top: 6px; }
.glyphs { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.glyphs figcaption { width: 100%; margin-top: 0; }
.glyph { width: 44px; height: 44px; padding: 6px; border-radius: 10px; }
.on-surface { background: #132439; color: #4fa3ff; }
.on-accent { background: #1769d2; color: #f4f7fa; }
.on-rest { background: #f4c84c; color: #07101d; }
.lockups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 28px; }
.lockup { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-radius: 16px;
  background: #132439; border: 1px solid #1c3f6b; }
.lockup.light { background: #f4f8fb; border-color: #cbdcef; color: #183b62; }
.mark { width: 52px; height: 52px; flex: none; }
.words { display: flex; flex-direction: column; line-height: 1.05; letter-spacing: -.02em; }
.words b { font-size: 17px; font-weight: 850; }
.words span { font-size: 17px; font-weight: 400; opacity: .72; }
@media (max-width: 720px) { .pair, .lockups { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <p class="eyebrow">${round.eyebrow}</p>
  <h1>${round.heading}</h1>
  <p class="lede">${round.lede} Each mark is drawn inside the maskable safe circle, so the same geometry
  survives the rounded-square, circle and squircle masks. The in-app glyph is single-colour
  <code>currentColor</code>, so it restains itself in all ten colour packages.</p>
${renderSections(round.concepts)}
</div>
</body>
</html>
`;

for (const round of ROUNDS) write(round.file, renderPage(round));

console.log(`  ok  ${written.length} files written to design-concepts/logo/`);
for (const name of written) console.log(`      ${name}`);
