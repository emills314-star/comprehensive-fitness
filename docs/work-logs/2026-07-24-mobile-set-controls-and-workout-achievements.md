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
- Branch and commit: `main` at implementation commit `8d5655d`, pushed to `origin/main`.
- Deployment inspected: Vercel production alias served service-worker cache v63 and the achievement artwork allowlist after the implementation push.
- Hosted URL/deployment identifier: `https://comprehensive-fitness.vercel.app/?verify=8d5655d`; direct cache inspection at `https://comprehensive-fitness.vercel.app/sw.js?verify=8d5655d`.
- Browser viewport/device sizes: local and hosted automated Chromium at iPhone 13 Mini/375 px and desktop 1280 × 900.
- Exact hosted flow tested: Production ran the focused active-workout flow through Exercise options → Individual set targets and measured the value/arrow geometry; a synthetic submitted workout then rendered every earned badge and verified its images, count, viewport containment, and console state.
- Expected result: Individual-set arrow cells render at 36 px, numeric values retain at least 52 px, ranges stack below 360 px, no page-level horizontal overflow appears, and earned outcomes render the matching eight-image achievement strip without broken assets.
- Actual result: Local focused browser checks passed, and the corresponding production matrix passed 4/4 across mobile and desktop.
- Console/runtime errors: none in passing local or hosted focused browser runs.
- Screenshots or visual evidence: user-provided cramped-state reference; final raster artwork in `resources/achievements/`; focused browser traces/screenshots are retained only on failure by the test configuration.
- Remaining issues: Exact underlying PR taxonomy remains **NEEDS REVIEW** in `docs/UI_UX.md`; badge derivation intentionally reuses the implemented PR engine.

## Final status

**Complete** — implementation, artwork, tests, documentation, privacy review, PWA/native synchronization, publication, and hosted mobile/desktop verification all passed.
