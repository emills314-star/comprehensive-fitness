# Logo concepts

> **Status: decided.** **07 Sleeve** was chosen and shipped. The production mark now lives
> at `resources/icon.svg` and is documented in `docs/UI_UX.md` under *App mark*; regenerate
> its PNGs with `node scripts/build-icons.js`.
>
> This folder is the exploration that led there and stays as the record of what was
> considered and rejected. Nothing in it is referenced by `index.html`, `sw.js`,
> `manifest.webmanifest` or the Capacitor payload, and it can be deleted with no effect on
> the app. Editing `07-sleeve-*.svg` here changes nothing — edit `resources/icon.svg`.

Two rounds of directions for the home-screen icon and the in-app mark.

```bash
node design-concepts/logo/build-logos.js   # writes the SVGs, index.html and lifting.html
node design-concepts/logo/capture.js       # renders artifacts/logo-concepts/*.png
```

To browse interactively, run `npm run dev` and open
`http://127.0.0.1:8765/design-concepts/logo/` (round one) or
`.../logo/lifting.html` (round two).

## The one rule: the palette does not change

App icons are baked PNGs outside the CSS custom-property system, so unlike the sibling
concepts in `design-concepts/` these files carry literal colour values rather than
`var(--token)`. Every literal is lifted from the shipped token block in `index.html`
lines 19–202:

| Icon role | Value | Token it comes from |
| --- | --- | --- |
| Dark canvas | `#16283f` → `#07101d` | `--panel-3` → `--bg` |
| Light canvas | `#ffffff` → `#eef2f6` | manifest `background_color` → light `--bg-soft` |
| Deep blue | `#1f4f88` / `#183b62` | dark `--action` range / light `--current` |
| Mid blue | `#2f7bcf` / `#245ca6` | `modern-primary` range / `heritage-atlas --current` |
| Bright blue | `#4fa3ff` / `#1769d2` | `night-stadium --current` / `modern-primary --current` |
| Gold | `#f4c84c` / `#b87916` | `night-stadium --amber` / `heritage-atlas` light `--amber` |
| Cream | `#f4f7fa` / `#123d6b` | `--text` / `--achv-title` |
| Track | `#1c3f6b` / `#cbdcef` | `--line-strong` range |

No new hue is introduced. In round one gold only carries meanings it already has in the
app — rest, warn, achievement. In round two it is a **material accent** instead: the change
plate, the J-hooks, the hub collar. That is a deliberate loosening, not an oversight.

Because the mark lives outside the token system, this folder is **not** covered by the
no-raw-colour guard in `design-concepts/capture.js`; that guard reads only the `.html`
and `.css` files at the top level of `design-concepts/`. The mapping table above is what
keeps the promise here, so re-check it if a value is edited.

## Variants

Each concept builds four files:

| Suffix | Use |
| --- | --- |
| `-dark.svg` | Home-screen icon, rounded square, dark canvas |
| `-light.svg` | Home-screen icon on a light canvas |
| `-maskable.svg` | Full-bleed, for the `purpose: "maskable"` manifest slot |
| `-glyph.svg` | In-app mark. Single colour via `currentColor`, no canvas |

All art sits inside the circle of radius 396 about (512, 512), inside the 409.6 radius
Android reserves for maskable icons, so one geometry survives the rounded-square, circle
and squircle masks alike. The glyph inherits whatever `--current` the active colour
package supplies, so the in-app mark restains itself across all ten packages rather than
needing ten assets.

## Round one — derived from the app's own logic (`index.html`)

No borrowed fitness metaphor: no barbell, plate, bicep or heart trace. Each mark comes
from something the app actually does, the same way the four top-down UI concepts in the
parent folder do. **Rejected** — read as generic progress marks rather than as a gym app.

| | Thesis | Strongest | Weakest |
| --- | --- | --- | --- |
| 01 Increment | Same lift, one step higher; gold cap is the step not yet taken | Small sizes | Says "tracker", not "fitness" |
| 02 Landmark | Volume spent against MEV / MAV / MRV notches | Carries the differentiator | Closest to a generic gauge |
| 03 Overshoot | Solid block breaking out of its prescribed outline | Silhouette | Needs a sentence to read |
| 04 Forecast | Measured solid, inferred dotted to a hollow node | Meaning | Dies below 32 px |
| 05 Cadence | Long blue work, short gold rest, heaviest set widest | Unmistakably this app | Reads as centred text lines |

## Round two — lifting marks (`lifting.html`)

Same palette rule and same safe circle, inside the equipment vocabulary.

### 06 Plate · a plate on the sleeve

Face on: deep body, bright colour ring near the rim, gold collar at the hub, bar stubs left
and right. The stubs are load-bearing — without them the disc reads as a dial. Circular, so
it is the only mark here that needs no compromise under a circular mask.

### 07 Sleeve · loaded barbell — **CHOSEN**

Two plates a side, pushed outboard, on a long bare bar; the outer pair is gold — the change
plate you added this week. The proportion is the whole design: crowd the plates toward the
centre and it reads as a dumbbell, which is what the first pass did.

### 08 Rack · bar in the hooks

The bar racked high on two uprights with gold J-hooks. The punched hole pattern down each
upright is what makes it a rack; drop the holes and it collapses back into a barbell. The
most architectural silhouette of the set.

### 09 Press · lockout

A lifter at lockout, bar overhead. The only mark with a person in it, and the only one that
shows what the app is *for* rather than what it is *about*. Also the most detailed, so it
is the one to watch at 24 px.

### 10 Kettlebell · one object

Handle and body share a colour so the mark casts as one silhouette with a real hole under
the arch — a contrasting handle over a round body reads as a handbag. Best small-size
survival of round two, and the least tied to barbell work, which is either a feature or a
mismatch depending on how the app is positioned.

### Comparison

| | 06 Plate | 07 Sleeve | 08 Rack | 09 Press | 10 Kettlebell |
| --- | --- | --- | --- | --- | --- |
| Legible at 24 px | Good | Fair | Fair | Weakest | **Best** |
| Reads as lifting instantly | Good | **Best** | Good | **Best** | Good |
| Distinct from other fitness apps | Fair | Weakest | **Best** | Fair | Fair |
| Works as a one-colour glyph | Good | Good | Fair | Fair | **Best** |
| Matches what the app tracks | **Best** | **Best** | Good | Good | Weakest |

## What adopting Sleeve actually took

Recorded here because the same steps apply if the mark is ever changed again:

1. `resources/icon.svg` replaced, plus three sibling variants — `icon-maskable.svg`
   (full bleed), `icon-foreground.svg` (Android adaptive, scaled 0.8),
   `icon-glyph.svg` (`currentColor`).
2. `node scripts/build-icons.js` — rasterises all 22 PNGs: web icons, splash, the iOS
   AppIcon, and five Android densities of legacy / round / adaptive-foreground.
3. `android/.../values/ic_launcher_background.xml` moved `#FFFFFF` → `#0E1B2A`. The bar is
   cream; on white it disappeared completely.
4. `npm run sync:web` so `www/` picks up the new `resources/` payload.
5. `CACHE_NAME` advanced in `sw.js` — the service worker caches the web icons by name, so
   installed PWAs otherwise keep serving the old bytes.
6. `docs/UI_UX.md` gained an *App mark* section; `docs/ROADMAP.md` gained a status row.
7. `npm run verify:pwa` passed for 40 assets; `npm run lint` and `npm run check:privacy`
   clean; public test gate 50/52. The two failures (`test-research-archive-integrity`,
   `test-research-workbook-determinism`) are a Git-Bash `tar` quirk on Windows — it reads
   `C:\...` as a remote host — and neither test references an icon. `npm run check:public`
   halts before the tests on a pre-existing full-tree dependency audit (9 high, all in the
   `exceljs`/`archiver` dev chain; the production subset is clean and `package.json` and
   `package-lock.json` are untouched by this change).
8. Still outstanding: `npm run cap:sync` (needs the native toolchains), the Playwright UI
   audit, and hosted verification.
