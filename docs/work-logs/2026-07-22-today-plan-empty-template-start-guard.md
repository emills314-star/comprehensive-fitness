# Today/Plan empty-template start guard

## Change

- Summary: Prevented templates with zero exercises from opening readiness or creating an empty active workout. Plan now disables Start with an accessible explanation, while both runtime entry points enforce the same invariant.
- User flow affected: Plan → template editing/removing all exercises → Start; adding an exercise restores Start.

## Evidence

- Files changed: `app-analysis.js`, `app-views.js`, `app-workout.js`, `tests/ui/template-workout-history-lifecycles.spec.js`.
- Documentation updated: `docs/UI_UX.md`, `docs/ROADMAP.md`, audit bug ledger (`BUG-012`), this work log.
- Local validation (tests/lint/build): Red mobile Playwright reproduction recorded Start as enabled after the last exercise was removed. The post-fix regression passes in the Playwright mobile and desktop projects; remaining integration checks are recorded in the final task report.
- Branch and commit: Current local working tree; no commit created by this audit worker.
- Deployment inspected: Not deployed by this audit worker.
- Hosted URL/deployment identifier: Not available.
- Browser viewport/device sizes: Playwright iPhone 13 Mini mobile project and 1280 × 900 desktop project.
- Exact hosted flow tested: Local synthetic flow removes every exercise from a template, verifies the disabled/explained Start state, calls both runtime entry points defensively, restores one exercise, and verifies Start becomes enabled.
- Expected result: No user or stale/programmatic path can create an empty active workout.
- Actual result: Implemented locally; hosted verification remains pending after integration and deployment.
- Console/runtime errors: None; asserted by the regression.
- Screenshots or visual evidence: Red-run failure screenshot retained under the local Playwright artifacts directory.
- Remaining issues: Hosted mobile/desktop verification is required after deployment.

## Final status

**Implemented locally.** Deployment and hosted-site browser verification remain pending.
