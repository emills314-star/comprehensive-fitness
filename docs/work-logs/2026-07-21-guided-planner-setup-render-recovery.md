# Guided planner Setup render recovery

## Change

- Summary: Repaired the clean-install guided planner entry so Start Planning opens Setup instead of the bounded Plan destination-error surface.
- User flow affected: Plan → Plan Your Mesocycle → Start Planning.

## Evidence

- Files changed: `app-views.js`, `tests/ui/guided-planner-entry-regression.spec.js`.
- Documentation updated: `docs/UI_UX.md`, `docs/ROADMAP.md`, and this work log.
- Local validation (tests/lint/build): Focused guided-entry Playwright passed mobile and desktop (2/2); existing full guided planning lifecycle passed mobile and desktop (2/2); existing template CRUD/autosave/reload lifecycle passed mobile and desktop (2/2); prescription app integration, taxonomy-family projection, and static lint passed.
- Branch and commit: Pending publication.
- Deployment inspected: Not yet.
- Hosted URL/deployment identifier: Not yet.
- Browser viewport/device sizes: Reproduced locally at 390 × 844; verified with Playwright iPhone 13 Mini emulation and 1280 × 900 desktop.
- Exact hosted flow tested: Not yet; required after deployment.
- Expected result: Start Planning renders Objective, Schedule, Available Equipment, Muscle Group Scope, and the active Setup step without console errors.
- Actual result: Before the fix, Plan rendered `This area could not be opened` and Retry failed again. After the fix, Setup and the existing end-to-end guided/template lifecycles pass locally on mobile and desktop.
- Console/runtime errors: Before the fix, `Destination render failed` originated from `app-views.js`; the root cause was an undeclared optional `presentationLabels` lookup. The focused post-fix regression observed no application exception or destination-render failure.
- Screenshots or visual evidence: Browser DOM evidence captured; no visual design change.
- Remaining issues: Hosted verification remains required after deployment.

## Final status

**Implemented locally** pending local validation and hosted verification.
