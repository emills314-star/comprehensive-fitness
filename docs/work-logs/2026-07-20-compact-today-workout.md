# Compact Today workout logger

**Date:** 2026-07-20
**Status:** IMPLEMENTED

## Outcome

The active Today workout was redesigned to reduce page height and visual weight while preserving the existing workout, readiness, persistence, safety, timer, and submission behavior.

- The Workout Board/session aside and the bottom recovery-adjustment/Today's Plan section were removed from active execution.
- Deload and resistance type now share one exercise-level row; resistance type is a collapsed native selector.
- Working-set prior reps, load, and RPE appear directly beneath their matching current fields.
- Progression criteria are collapsed behind a compact **Progress when** row.
- Add set, add warm-up, copy set, save template, exercise options, workout details, and add-exercise controls use lower-chrome compact treatments.
- Newly introduced interactive targets retain a 44 px minimum height.

## Verification

- `node scripts/test-workout-page-density.js`
- `node scripts/test-workout-safety.js`
- `node scripts/test-performance.js`
- `node scripts/test-rest-timer-presentation.js`
- Interactive browser fixture on the local app: resistance and progression disclosures opened correctly; nine field-aligned prior-value slots rendered across three working sets; no session board or recovery footer was present.
- The focused Playwright worker could not complete in the managed Windows shell because its child process remained stalled after launch; the run was terminated and the equivalent critical states were checked in the in-app browser. This runner condition is **NEEDS REVIEW** if it reproduces in CI.

## Documentation review

- `docs/UI_UX.md` updated for the implemented layout and interaction contract.
- `docs/ARCHITECTURE.md` updated for the active-workout render ownership and unchanged domain boundaries.
- `docs/ROADMAP.md` updated with the completed compact logger item.
- `docs/PROJECT.md` reviewed; its continuous single-document Today scope remains accurate and needed no text change.
- `docs/DECISION_ENGINE.md` reviewed; no recommendation, readiness, or progression rule changed, so no text change was required.
