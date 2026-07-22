# Today/Plan empty-template start guard

## Change

- Summary: Prevented templates with zero exercises from opening readiness or creating an empty active workout. Plan now disables Start with an accessible explanation, while both runtime entry points enforce the same invariant.
- User flow affected: Plan → template editing/removing all exercises → Start; adding an exercise restores Start.

## Evidence

- Files changed: `app-analysis.js`, `app-views.js`, `app-workout.js`, `tests/ui/template-workout-history-lifecycles.spec.js`.
- Documentation updated: `docs/UI_UX.md`, `docs/ROADMAP.md`, audit bug ledger (`BUG-012`), this work log.
- Local validation (tests/lint/build): Red mobile Playwright reproduction recorded Start as enabled after the last exercise was removed. The post-fix regression passes in the Playwright mobile and desktop projects; the complete UI matrix passed 234/252 with 18 intentional cross-project skips and zero failures, and the public gate passed 50/50.
- Branch and commit: GitHub `main`, application commit `6361959`.
- Deployment inspected: Vercel production assets exposed cache generation v57 and both runtime guard markers.
- Hosted URL/deployment identifier: `https://comprehensive-fitness.vercel.app/?verify=6361959#plan`.
- Browser viewport/device sizes: Playwright iPhone 13 Mini mobile project and 1280 × 900 desktop project.
- Exact hosted flow tested: The deployed synthetic flow removes every exercise from a template, verifies the disabled/explained Start state, calls both runtime entry points defensively, restores one exercise, and verifies Start becomes enabled.
- Expected result: No user or stale/programmatic path can create an empty active workout.
- Actual result: Implemented, deployed, and verified on mobile and desktop; the paired settings-domain regression also passed, for 4/4 focused hosted cases.
- Console/runtime errors: None; asserted by the regression.
- Screenshots or visual evidence: Red-run failure screenshot retained under the local Playwright artifacts directory.
- Remaining issues: None within this defect's automated scope.

## Final status

**IMPLEMENTED, DEPLOYED, AND HOSTED-VERIFIED.**
