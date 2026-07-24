# Achievement badge drill-downs

## Change

- Summary: Made every exercise-specific workout achievement badge expandable while leaving Plan Complete static. Each disclosure identifies the contributing exercise, this workout’s result, and the prior high-water mark.
- User flow affected: Workout submission → completed workout summary; Progress → History → saved workout summary.

## Evidence

- Files changed: `app-history.js`, `app.js`, `index.html`, `sw.js`, synchronized `www/`, achievement contract/browser tests, and governing documentation.
- Evidence mapping:
  - New e1RM Peak and Personal Record use the exact prior PR metric reconstructed from strictly earlier submitted sets.
  - Volume Record lists each external-load exercise’s current load × reps contribution and its highest strictly earlier per-session contribution.
  - Forward Progress, Dialed In, Controlled Execution, and Smart Adjustment/Recovery Protected use each exercise’s saved current best and prior comparable performance high.
  - Plan Complete has no disclosure because it is a workout-wide completion outcome.
- Persistence: no schema, backup, or stored-session field was added; badges and disclosure evidence remain derived read-only presentation.
- Documentation updated: `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, `docs/ROADMAP.md`, and this work log.
- Local validation:
  - `node scripts/test-workout-grade.js` — passed.
  - Focused Playwright achievement test — mobile and desktop passed for pointer/keyboard disclosure, exercise/current/prior evidence, full-width expansion, image loading, overflow, console health, and WCAG contrast floors for both badge summaries and evidence rows.
  - `npm run sync:web` — passed; 40 public-only assets synchronized.
  - `npm run lint` — passed.
  - `npm run verify:pwa` — passed; service-worker cache v65 and 40 public/native assets verified.
  - `npm test` — passed 50/50 selected public harnesses.
  - `npm run cap:sync` — passed for Android, iOS, and web; CocoaPods/Xcode cleanup remained unavailable on Windows as expected.
- Branch and commit: `main`; pending publication.
- Deployment inspected: pending.
- Hosted URL/deployment identifier: pending.
- Browser viewport/device sizes: local automated Chromium at iPhone 13 Mini/375 px and desktop 1280 × 900; hosted sizes pending.
- Exact hosted flow tested: pending publication.
- Expected result: seven badges show an explicit exercise-detail cue, expand by pointer or keyboard, remain within the achievement strip, and show current/prior evidence; Plan Complete remains non-interactive.
- Actual result: local mobile/desktop focused tests passed.
- Console/runtime errors: none in the passing focused run.
- Remaining issues: hosted deployment and production mobile/desktop verification remain required.

## Final status

**Implemented locally** — implementation, focused tests, PWA synchronization, and documentation are complete; broader validation and hosted verification remain.
