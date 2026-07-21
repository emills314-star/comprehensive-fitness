# Compact Today workout logger

**Date:** 2026-07-20
**Status:** IMPLEMENTED

## Outcome

The active Today workout was redesigned to reduce page height and visual weight while preserving the existing workout, readiness, persistence, safety, timer, and submission behavior.

- The Workout Board/session aside and the bottom recovery-adjustment/Today's Plan section were removed from active execution.
- Deload and resistance type now share one exercise-level row; resistance type is a collapsed native selector.
- Working-set history is consolidated into one compact **Previous** column beside the current load, reps, RPE, and status controls.
- Progression criteria are collapsed behind a compact **Progress when** row.
- Add set, add warm-up, copy set, save template, exercise options, workout details, and add-exercise controls use lower-chrome compact treatments.
- Newly introduced interactive targets retain a 44 px minimum height.
- The light canvas is true white; History session names are blue and stored workout grades render as a color-coded letter only.

## Verification

- `node scripts/test-workout-page-density.js`
- `node scripts/test-workout-safety.js`
- `node scripts/test-performance.js`
- `node scripts/test-rest-timer-presentation.js`
- `node scripts/test-rep-alert-cancel.js`
- `node scripts/test-rest-warmup-targets.js`
- `node scripts/test-set-prescriptions.js`
- `npm run verify:pwa` (including cross-platform public research-export allowlisting)
- Focused Playwright Today/History lifecycle suite: 10/10 passed across mobile and desktop.
- Protected responsive UI suite: 14/14 passed across 320 px phone, 390 px phone, tablet, desktop, dark mode, and 200% equivalent zoom.
- `npm test`: 45 ordinary public checks passed; the two Git-spawning research checks were rerun outside the managed process sandbox and both passed.
- `npm run lint`

## Documentation review

- `docs/UI_UX.md` updated for the implemented layout and interaction contract.
- `docs/ARCHITECTURE.md` updated for the active-workout render ownership and unchanged domain boundaries.
- `docs/ROADMAP.md` updated with the completed compact logger item.
- `docs/PROJECT.md` reviewed; its continuous single-document Today scope remains accurate and needed no text change.
- `docs/DECISION_ENGINE.md` reviewed; no recommendation, readiness, or progression rule changed, so no text change was required.

## Hosted deployment evidence

Pending publication and cache-bypassing production verification for this revision.
