# Whole-app polish

## Change

- Summary: Phases 0-6 repair invalid scale references and dead CSS, add reusable range/pip/sparkline primitives, persist native-disclosure open state, compact the rest rail, reconcile intentional in-session deviations with the audited prescription/grade path, unify disclosure and recommendation-card structure, and apply existing quantitative data to compact visual summaries and shared feedback/state treatments.
- User flow affected: Today active workout and completion; Plan volume/planner summaries; Progress history, lift analysis, and charts; More appearance/import feedback.
- Deliberate omission: `renderChart` still has no canonical target-band input, so the chart target band was not fabricated.

## Evidence

- Files changed: root application presentation, history, workout, synchronization, foundation, and analysis segments; `index.html`; focused Node contracts; browser regression specs; `sw.js`; and the generated `www/` mirror after synchronization.
- Documentation updated: `docs/UI_UX.md`, `docs/DECISION_ENGINE.md`, `docs/ROADMAP.md`, and this work log.
- Documentation reviewed without change: `docs/ARCHITECTURE.md`; the disclosure-open registry is transient presentation state and does not change persistence, integration, or the durable data model.
- Branch and commit: dirty local working tree; no commit, push, merge, deployment, or baseline acceptance was authorized.
- Deployment inspected: excluded by the owner.
- Local URLs: `http://127.0.0.1:8765/#today` and an isolated local server at `http://127.0.0.1:8766/#today`.
- Browser viewport/device sizes: 375 px and 1280 px in the browser pane; automated coverage also exercised 320 px at 200% text.
- Browser flow tested: at 375 px, logged a materially deviating set, observed the deviation, opened and closed the rest rail, and reached the final-ten-second cue. At 1280 px, hard-refreshed the page and inspected console/runtime output.
- Expected browser result: compact persistent state, truthful target changes, visible rest/final states, no duplicated facts, stable disclosure state, keyboard/touch access, no narrow-width overflow, and semantic color/confidence roles.
- Actual browser result: set logging, deviation presentation, rest disclosure, final cue, desktop refresh, and clean console passed. The pane profile retained an older service-worker-controlled active synthetic session and deferred update, so a trustworthy clean-profile start -> accept reconciliation -> submit -> grade walkthrough could not be completed without deleting or canceling shared local state. Automated lifecycle tests cover that path, but the pane evidence remains incomplete.
- Console/runtime errors: none observed after the 1280 px hard refresh.
- Screenshots or visual evidence: 13 isolated visual states are registered for mobile and desktop. The clean audit produced 26 expected missing-baseline failures and auto-wrote candidates; all 26 candidates were removed again. No baseline was accepted.

## Exact validation

- `npm run check:public`: stopped at `audit:dependencies:full` after lint passed (192 JavaScript files, 3,118 JSON files, 0 inline scripts), workflow contracts passed (2), and privacy passed (541 files). Dependency audit result: 2 moderate, 9 high, 0 critical; all are dev-only.
- Final standalone `npm run check:privacy`: failed because the workspace scan found the owner's existing ignored `personal_fitness_data/` tree and archived release-worktree copies. No changed, untracked-public, or staged path from this task is under a private-data directory; staged file count is zero. Those user-owned local records were not altered.
- `npm run audit:dependencies:production`: passed with 0 low, moderate, high, or critical vulnerabilities.
- `npm test`: passed, 53/53 selected; 54 discovered; 1 private-only test excluded.
- Research validation: passed, 48 records with 34 known warnings.
- `npm run sync:web`: passed.
- `npm run verify:pwa`: passed, 40 required offline assets.
- Full `npm run audit:ui` from a clean missing-baseline state: 263 passed, 35 skipped, 26 failed in 2,317,131 ms (38 minutes 37 seconds). Every failure was a missing, unaccepted snapshot; no behavioral test failed.
- Protected-surface measurements within the audit: populated Lift height 2,840 px at 320 px; populated Dashboard height 2,509 px at 390 px.
- Dock at 320 px / 200% text: Finish 302 x 70 CSS px on one line; overflow 44 x 52 CSS px; menu items 180 x 156 CSS px.
- Ten-package x two-theme contrast sweep passed the implemented assertions; the lowest recorded Finish contrast was 4.74:1 (`harbor`, dark).

## Unaccepted visual states

Each state is missing at both `mobile` and `desktop`, for 26 failures total:

- rest rail: collapsed, expanded, final 10 seconds, paused
- reconciliation strip
- recommendation: closed, prescription open, confidence open, evidence open
- caret: closed, open
- range bar: all tones specimen
- plate diagram

## Independent verification and remediation — 2026-07-28, second pass

**Baselines: ACCEPTED by the owner.** Reduced from 26 to 13. The specimens set a 390 px viewport inside the test body regardless of project, so the `desktop` project produced 13 byte-identical copies of the `mobile` images — duplicate coverage presented as two-viewport coverage. The specimens now skip outside `mobile`. They are also hand-authored markup rather than renderer output, so they pin CSS, not renderer structure; renderer structure stays covered by the static contract suites.

`polish visual state: rest-rail-collapsed` was flaky as the first test of a cold run: `test.beforeEach` navigates to the app, and on a cold start the app's asynchronous boot completed *after* the specimen replaced `body.innerHTML`, clobbering it. Fixed by awaiting the rendered `Main navigation` landmark before injection. Cold run: 13 passed, 13 skipped.

**Clean-profile pane walkthrough: VERIFIED.** Environment first had to be corrected — three stale `scripts/serve-local.js` processes were running and Playwright's `reuseExistingServer` had attached the pane to one serving a different checkout, so the pane was exercising stale bytes. After killing them, restarting from the working tree, unregistering the service worker (a re-registered worker was intercepting `fetch`, which `cache: "no-store"` does not bypass), and deleting `comprehensive-fitness` IndexedDB plus both `v74`/`v88` caches, the journey ran at 390 px: template start → 15 reps logged against an 8–10 target → reconcile strip (`data-tone="over"`) → **Apply to remaining** → source set retargeted and stamped `deviationIntent: "accepted"`, unfinished set rebuilt and marked **CORRECTED** → submit → grade rendered with a filled track, level-2 confidence meter, and no numeric score.

Four defects found and fixed:

| Defect | Location | Fix |
| --- | --- | --- |
| UTF-8 double-encoding: `Â·` and `Ã—` rendered as visible garbage | `app-views.js` reconcile strip | Restored `·` and `×`; confirmed byte-level clean in root and `www/` |
| `1 set remain` — noun pluralised, verb not | same line | `set remains` / `sets remain` |
| Delta column read `on` beside `15 reps` vs a `15` target with no metric named | `app-views.js` logged row | Added an `RPE` `.lbl`; `.dlt` is a flex column so it stacks at 11 px without overlap |
| **Accepted reconciliations still graded against the superseded exercise rep range** | `app-history.js` | `setRepBounds(set)` prefers the set's own ordered `targetRepMin`/`targetRepMax`, falling back to the exercise range. Reconciled exercise moved from `rangeCompliance: 0` to `1` |

The fourth is the material one: it was the requirement that the end-of-session grade follow the modified recommendation, and `rangeMatches`/`targetRepMatches` were the one path still reading the exercise-level range. Guard assertions were added to `scripts/test-workout-grade.js` for the new bounds resolution rather than only loosening the old regexes.

`CACHE_NAME` advanced to `comprehensive-fitness-pwa-v89`; `www/` re-synced and byte-identical. `npm test`: 53/53.

## Remaining review

- **NEEDS REVIEW (pre-existing, not introduced here):** an exercise with zero planned and zero completed working sets contributes `rangeCompliance: 0` to the Program execution average instead of being excluded, so an unusable or untouched exercise drags the category down. Observed as a residual "50% in range" while the only performed exercise scored 100%. Not changed here because it alters scoring semantics beyond the reconciliation contract.
- **NEEDS REVIEW (stale generated payload, not a source defect):** `android/app/src/main/assets/public/` and `ios/App/App/public/` still hold a 2026-07-25 Capacitor payload — three days older than source and predating this entire polish run. It contains removed code (a `readinessReviewTitle` DOM patch and markup absent from current source) and a separate `â€™` UTF-8 double-encoding in "Today's Readiness Adjustments" that does not exist anywhere in tracked source. Both trees are git-ignored, so nothing corrupt can be committed, but a native build made without re-syncing would package a stale UI with none of the polish work. Resolve with `npm install && npm run sync:web && npm run cap:sync` before any native build; iOS additionally requires macOS with Xcode. Not run here because native packaging was outside this batch and unverifiable on this platform.
- **NEEDS REVIEW:** OS-level pointer input in the browser pane could not be exercised — the pane was not compositing, so synthetic clicks did not hit-test. The walkthrough drove the app's real delegated `data-action` dispatch via DOM `click()`, which proves application logic but not pointer hit-testing. Playwright covers real input separately.
- **PLANNED:** define the chart target-band metric identity, unit, lower/upper target, source confidence, and point/window applicability before drawing it.
- Physical-device and screen-reader review remain outside this batch.

## Final status

**IMPLEMENTED LOCALLY - REVIEW REQUIRED.** Public functional, PWA, scoped-public privacy, and behavioral UI coverage passed except for the documented dev-only dependency gate. The final workspace-wide privacy scan is not green because it includes existing ignored private-data and archived-worktree trees. Visual baselines remain deliberately unaccepted, and the clean-profile pane submission/grade walkthrough remains outstanding. Nothing was published.
