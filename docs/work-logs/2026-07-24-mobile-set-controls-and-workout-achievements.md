# Mobile set controls and workout achievements

## Change

- Summary: Rescaled advanced individual-set steppers so their values remain readable on phones, retained the selected read-only Program benchmark strip, and added an earned workout-completion strip with eight cohesive achievement images.
- User flow affected: Today → active workout → Exercise options → Individual set targets; workout submission → completed workout summary; Progress → History → saved workout summary.

## Evidence

- Files changed: `index.html`, `app-history.js`, `resources/achievements/`, `sw.js`, public/native synchronization scripts and output, focused contract/browser tests.
- Documentation updated: `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, and `docs/ROADMAP.md`.
- Local validation (tests/lint/build):
  - `npm run sync:web` — passed; 40 public-only assets synchronized.
  - `npm run lint` — passed.
  - `npm run verify:pwa` — passed; 40 public/native assets matched.
  - `npm test` — 48 public harnesses passed in the main sandbox run; its two read-only Git tree harnesses were denied `spawnSync git` by the sandbox and then passed independently with the required permission.
  - `node scripts/test-research-archive-integrity.js` — passed.
  - `node scripts/test-research-workbook-determinism.js` — passed.
  - `node scripts/test-workout-grade.js` — passed.
  - `node scripts/test-active-workout-return-and-standards.js` — passed.
  - `npx playwright test tests/ui/critical-workout-lifecycle.spec.js --grep "full earned achievement strip"` — mobile and desktop passed.
  - `npx playwright test tests/ui/app-integration-accessibility.spec.js --project=desktop --grep "every exercise exposes shared defaults"` — passed as part of the first focused run.
  - `npx playwright test tests/ui/app-integration-accessibility.spec.js --project=mobile --grep "every exercise exposes shared defaults"` — passed on isolated rerun after the first combined run’s evidence-loader poll timed out on mobile.
  - `npm run cap:sync` — passed for Android, iOS, and web; CocoaPods/Xcode cleanup remained unavailable on Windows as expected.
- Branch and commit: `main`; pending publication.
- Deployment inspected: pending.
- Hosted URL/deployment identifier: pending.
- Browser viewport/device sizes: local automated Chromium at iPhone 13 Mini/375 px and desktop 1280 × 900; hosted sizes pending.
- Exact hosted flow tested: pending publication.
- Expected result: Individual-set arrow cells render at 36 px, numeric values retain at least 52 px, ranges stack below 360 px, no page-level horizontal overflow appears, and earned outcomes render the matching eight-image achievement strip without broken assets.
- Actual result: Local mobile/desktop browser tests passed those geometry, overflow, badge-count, and image-load contracts.
- Console/runtime errors: none in passing focused browser runs.
- Screenshots or visual evidence: user-provided cramped-state reference; final raster artwork in `resources/achievements/`; focused browser traces/screenshots are retained only on failure by the test configuration.
- Remaining issues: Hosted deployment and mobile/desktop verification remain required before this log can be marked Complete. Exact underlying PR taxonomy remains **NEEDS REVIEW** in `docs/UI_UX.md`; badge derivation intentionally reuses the implemented PR engine.

## Final status

**Implemented locally** — code, artwork, tests, docs, PWA synchronization, and native synchronization are complete; deployment and hosted browser verification remain.
