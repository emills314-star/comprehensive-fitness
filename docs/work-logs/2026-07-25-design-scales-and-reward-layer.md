# Design scales, reward layer, and legibility floor

## Change

- **Summary:** Introduced explicit type, spacing, radius, elevation, and motion scales in `:root`; added a presentation-only reward/feedback layer for set completion, rest, and earned badges; raised the Today legibility floor to 12 px; and moved the achievement strip from hard-coded light-mode hex to a dedicated per-theme contrast-guaranteed palette.
- **User flow affected:** Today (active workout and home), the completion summary's earned achievement strip, the hypertrophy score module, section headings and status pills across all destinations, and every pressable control.

### Why

Measurement of the live app at 375 px found the stylesheet carried **63 distinct font sizes, 20 corner radii, 24 gap values, 9 transitions, and 2 keyframe animations across 1467 rules**, with 10 breakpoints several of which were 10 px apart. There was no spacing, type, radius, elevation, or motion scale at all — only color tokens. Successive phone-density passes had shrunk each component independently until hierarchy was lost: Today rendered 12 text elements below 12 px, six of them at 9.3 px (the hypertrophy score legend). With effectively no motion, completing a set was a silent state swap rather than an acknowledged accomplishment.

Separately, three of the four audited source ceilings in `tests/ui/ui-audit.spec.js` were **already breached** on the working tree before this change (88/74 hex, 41/40 rgb, 18/17 `!important`).

## Evidence

- **Files changed:** `index.html`, `sw.js` (cache v65 → v66), synchronized `www/`, `scripts/test-workout-grade.js`, `scripts/test-workout-page-density.js`.
- **Documentation updated:** `docs/UI_UX.md` (new Design scales, Reward and feedback layer, and Achievement strip palette subsections; metadata; requirement-matrix row), `docs/ROADMAP.md` (recently completed entry, two new technical-debt entries, metadata).
- **Local validation:**
  - `npm run lint` — pass (185 JS, 3118 JSON).
  - `npm test` — 48/50. The two failures are `test-research-archive-integrity.js` and `test-research-workbook-determinism.js`, both pre-existing Windows `tar` path failures unrelated to this change (see the Stage 1 audit). **No new failures.**
  - `node scripts/test-workout-grade.js` — pass. `node scripts/test-workout-page-density.js` — pass.
  - Source ceilings, all four now passing with headroom: hex **88 → 69** / 74, rgb **41 → 37** / 40, inline **0** / 3, `!important` **18 → 16** / 17.
  - `npm run sync:web` — root ↔ `www/` checksum parity confirmed for `index.html` and `sw.js`.
- **Branch and commit:** not committed; left in the working tree for owner review.
- **Deployment inspected:** none — not deployed.
- **Hosted URL/deployment identifier:** n/a.
- **Browser viewport/device sizes:** local dev server at 375 × 812 (mobile preset); 320 px reflow spot-checked via forced document width.
- **Exact local flow tested:** load Today → walk `#today`, `#plan`, `#progress-overview`, `#progress-lifts`, `#progress-history`, `#more` → measure computed font sizes, interactive target heights, and document scroll width on each.
- **Expected result:** no rendered text below 12 px on Today, no horizontal overflow, no interactive target under 44 px, tokens resolving, no console or page errors.
- **Actual result:** matched. Today reports **zero** elements below 12 px (from 12, six at 9.3 px) and its rendered type distribution collapsed to 12 / 14 / 16 / 20 / 22.7 px. No destination overflowed at 375 px. No interactive control under 44 px. All new tokens resolve.
- **Console/runtime errors:** none across all six routes.
- **Screenshots or visual evidence:** 13 captures at 375 × 812 via a standalone Playwright script (deliberately not a spec, so it cannot touch `tests/ui/__screenshots__`), seeded from the repository's own synthetic public fixture with service workers blocked. Covered the active workout mid-session, the set-completion reward state, an active rest timer, submit confirmation, the completion summary, the achievement strip in both the light default and Night Stadium, and all four destinations. Zero console or page errors across all three capture passes. The captures were delivered to the owner for review and were not committed to the repository.

### Playwright UI audit

`npm run audit:ui` — **237 passed, 18 skipped, 1 failed** of 256. Visual baselines were deliberately refreshed with `npm run audit:ui:update` (all 20 goldens; the four-destination baselines shrank, the protected Lift/Dashboard baselines grew slightly, both consistent with the type changes rather than broken layout).

The single remaining failure is `accessibility-design-regressions.spec.js:1393` (320 px / 200 % text reflow, nested input overflow). **It is pre-existing, not caused by this change.** Verified by restoring `HEAD`'s `index.html` and `www/index.html`, running that test alone — it fails identically — then restoring the working copy. The reported overflow is input `scrollWidth` 32 vs `clientWidth` 28, i.e. font-metric dependent, so it is likely a Windows-local artifact in the same class as the two `tar` failures and may pass on the Linux CI runner. Confirm against CI rather than "fixing" it here.

### Regression found and fixed during verification: achievement pill contrast

The first audit run failed `critical-workout-lifecycle.spec.js:261` with **4.96:1 against a required 7:1**. The achievement strip is held to **WCAG AAA**, not AA, on title, heading, earned-count pill, and evidence name/value (`:257-264`).

The initial tokenisation pointed the earned-count pill at `var(--action)`. In the default Signal Garden package that is `#176fd1`, which against white reaches only 4.96:1 — passing axe AA (which is what the four-destination audit checks) while failing the strip's AAA contract. Assuming axe AA was sufficient was the error; the original hard-coded `#143f6b` / `#fff1b8` pair had been tuned for AAA.

Fixed by giving the pill its own `--achv-pill-bg` / `--achv-pill-border` / `--achv-pill-text` tokens, restoring the original pair, measured at **9.42:1**. Three assertions were added to `scripts/test-workout-grade.js` so the pill cannot be re-pointed at an accent token.

This partially vindicates the original "fallible theme token" comment: the concern was real, and the correct resolution was dedicated explicit tokens rather than either hard-coded hex or package-derived colors.

### Decision recorded: achievement strip contrast

`scripts/test-workout-grade.js` previously asserted the strip must use explicit hex "instead of a fallible theme token" — a deliberate outcome of the 2026-07-24 washed-out contrast repair. That hard-coding also meant the strip rendered light-on-light in the Night Stadium dark package.

Rather than discard either intent, the strip now consumes a dedicated `--achv-bg/-card/-border/-line/-title/-body` palette whose values are declared **explicitly per theme** rather than mixed from `--current`/`--surface`. The contrast guarantee across all ten packages is preserved; the dark packages are additionally fixed. Night Stadium receives dark values through its own `[data-color-package]` layer because it renders dark under `data-theme="light"`. The test was rewritten to lock both palettes and to assert the strip never derives its surface from the package accent.

**This is the one place a previously recorded decision was changed.** Revert this portion if the owner prefers the original hard-coded treatment.

## Remaining issues

- **Type-scale migration is roughly 15 % complete.** The scales are authoritative for new work, but about 370 legacy `font-size` declarations still carry hand-tuned rem values, so tokens and literals coexist and the distinct-value count is temporarily higher than before the change.
- **Plan, Progress detail, the guided planner, and chart typography** received only the shared foundation, not dedicated passes.
- **One pre-existing audit failure remains** (`accessibility-design-regressions.spec.js:1393`, 320 px/200 % reflow). Not introduced here; see the UI audit section above.
- **No hosted verification.** Per `docs/DAILY_BROWSER_QA.md`, local measurement is not completion evidence.
- The `prefers-reduced-motion` degradation of the new keyframes was confirmed by inspection of the existing global override block, not by an automated assertion. A focused test would be worth adding.

## Final status

**Implemented locally.** Not committed, not deployed, and not hosted-verified. The deployment and hosted-browser gates in `docs/DAILY_BROWSER_QA.md` remain open, and `npm run audit:ui` visual goldens have not been re-approved.
