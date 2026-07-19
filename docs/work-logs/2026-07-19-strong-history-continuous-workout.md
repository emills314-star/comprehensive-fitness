# Strong history and continuous workout — 2026-07-19

## Change

- **Summary:** Replaced the focused single-exercise workout renderer with one continuous exercise document; removed automatic viewport movement from set/rest transitions; added a shared resistance-aware prior-workout resolver with dated ordered-set fallback; retained Strong exercise identity in generated templates; rejected unusable zero-set recommendation snapshots in favor of saved template structure; and added post-import history/structure auditing.
- **Design artifacts:** Added ten semantic color package specifications. Heritage Atlas and Signal Garden five-screen Strong restyles remain local and privacy-ignored because the supplied screenshots contain personal workout details.
- **User flow affected:** Strong import → generated template → start workout → scroll through all exercises → inspect Last time → complete/rest/continue.

## Evidence

- **Files changed:** `app-foundation.js`, `app-analysis.js`, `app-import.js`, `app-workout.js`, `app-views.js`, `app-sync.js`, `app.js`, synchronized `www/` segments, static tests, and focused Playwright lifecycle/accessibility tests.
- **Documentation updated:** `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, `docs/ROADMAP.md`, `docs/DOCUMENTATION_INVENTORY.md`, and `docs/design/UI_COLOR_PACKAGES.md`.
- **Source commit:** `cad41a2` on `main`.
- **Hosted URL/deployment identifier:** `https://comprehensive-fitness.vercel.app/?verify=cad41a2`.
- **Browser viewport/device sizes:** Playwright iPhone 13 Mini profile and desktop 1280 × 900; production source and visible DOM also inspected through the in-app browser.
- **Exact hosted flow tested:** A public synthetic submitted workout and two-exercise template were installed in isolated browser storage; the template was started with usual readiness; both exercises rendered together; all generated working sets displayed dated prior performance; the workout survived reload. A separate active-workout fixture confirmed repeated controls for both exercises, zero `scrollIntoView` calls after set completion, and one reduced-motion-safe scroll only after an explicit workout-board exercise jump.
- **Expected result:** Imported history supplies Last time across exercises despite set-role differences; custom exercises never collapse to zero sets; active workouts remain manually scrollable without completion/rest focus jumps.
- **Actual result:** Four focused hosted tests passed (two mobile interaction/accessibility tests plus the prior-history lifecycle on mobile and desktop). Task-specific static tests, runtime-boundary checks, PWA/native public packaging, research archive integrity, and workbook determinism passed.
- **Console/runtime errors:** No browser errors were collected in the hosted prior-history lifecycle, and the focused hosted runs emitted no console/runtime failure.
- **Privacy review:** No raw/imported personal data, screenshots, backups, databases, credentials, or private generated artifacts were published. `docs/design/strong-ui-mockups/` is ignored and remains local.

## Remaining repository-wide mismatches

- **NEEDS REVIEW:** The unchanged upstream prescription-engine test `mesocycle volume and frequency are balanced across coherent sessions` fails because the generated quads plan misses planned frequency. Neither `prescription-engine.js`, its research inputs, nor that test changed in this task.
- **NEEDS REVIEW:** The complete UI suite still contains several pre-redesign navigation expectations (Dashboard/Templates/Settings tabs) that do not match the current four-destination Today/Plan/Progress/More workspace. The task-specific updated browser tests pass locally and hosted.

## Final status

**Hosted-verified** — the requested history and continuous-workout paths are published and verified on the production alias at mobile and desktop sizes.
