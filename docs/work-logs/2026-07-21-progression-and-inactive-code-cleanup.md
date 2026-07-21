# Progression integration and inactive-code cleanup

## Change

- Summary: Verified the existing goal-aware progression policy as the canonical recommendation source, preserved exact final-prescription-to-session-row prepopulation, and removed the unreachable automatic-planner UI/controller graph plus isolated superseded helpers.
- User flow affected: Plan guided entry and historical mesocycle list; template/mesocycle workout recommendation generation and prepopulated working-set targets.

## Evidence

- Files changed: application runtime segments, prescription engine, focused integration coverage, packaged web mirror.
- Documentation updated: `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, and `docs/ROADMAP.md`.
- Local validation (tests/lint/build): `npm test` passed 46/48 in the sandbox; the two Git-spawning research integrity tests then passed with required elevated execution, making all 48 public tests green. `node scripts/lint-static.js`, `node scripts/test-performance.js`, `node scripts/test-prescription-app-integration.js`, `node scripts/test-app-integration-contracts.js`, focused prescription tests, `npm run sync:web`, and `npm run verify:pwa` passed. `npm run audit:ui` produced no output and was stopped after exceeding its bounded runtime.
- Branch and commit: `main`; pending commit.
- Deployment inspected: pending publication.
- Hosted URL/deployment identifier: pending publication.
- Browser viewport/device sizes: pending hosted verification.
- Exact hosted flow tested: pending hosted verification.
- Expected result: guided planning remains reachable; historical mesocycles remain readable; eligible goal-aware recommendations prepopulate the exact load/rep/RPE rows shown in recommendation copy; retired automatic-planner controls are absent.
- Actual result: static, contract, progression, integration, research-integrity, and PWA gates pass; no reachable automatic-planner references remain.
- Console/runtime errors: none in completed gates; the UI audit hung without output and therefore is not recorded as passed.
- Screenshots or visual evidence: existing protected-screen baselines remain in scope; no intentional visual redesign.
- Remaining issues: hosted verification remains required after publication; the local browser audit was inconclusive because the runner hung.

## Final status

**Implemented locally and fully contract-tested** pending publication and hosted-browser gates.
