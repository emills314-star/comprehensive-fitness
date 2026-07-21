# Progression integration and inactive-code cleanup

## Change

- Summary: Verified the existing goal-aware progression policy as the canonical recommendation source, preserved exact final-prescription-to-session-row prepopulation, and removed the unreachable automatic-planner UI/controller graph plus isolated superseded helpers.
- User flow affected: Plan guided entry and historical mesocycle list; template/mesocycle workout recommendation generation and prepopulated working-set targets.

## Evidence

- Files changed: application runtime segments, prescription engine, focused integration coverage, packaged web mirror.
- Documentation updated: `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, and `docs/ROADMAP.md`.
- Local validation (tests/lint/build): `npm test` passed 46/48 in the sandbox; the two Git-spawning research integrity tests then passed with required elevated execution, making all 48 public tests green. `node scripts/lint-static.js`, `node scripts/test-performance.js`, `node scripts/test-prescription-app-integration.js`, `node scripts/test-app-integration-contracts.js`, focused prescription tests, `npm run sync:web`, and `npm run verify:pwa` passed. `npm run audit:ui` produced no output and was stopped after exceeding its bounded runtime.
- Branch and commit: `main`; application commit `466bf13`.
- Deployment inspected: Vercel production alias after `466bf13` reached `main`.
- Hosted URL/deployment identifier: `https://comprehensive-fitness.vercel.app/?verify=466bf13#plan`.
- Browser viewport/device sizes: in-app browser default desktop viewport.
- Exact hosted flow tested: opened the production app, selected Plan, confirmed the compact planner entry and historical list, selected Continue Planning, and verified the guided builder plus Weekly Volume & Frequency step.
- Expected result: guided planning remains reachable; historical mesocycles remain readable; eligible goal-aware recommendations prepopulate the exact load/rep/RPE rows shown in recommendation copy; retired automatic-planner controls are absent.
- Actual result: static, contract, progression, integration, research-integrity, and PWA gates pass; the hosted guided builder is reachable and the retired automatic-planner copy is absent.
- Console/runtime errors: none in completed gates or hosted verification; the separate local UI audit hung without output and therefore is not recorded as passed.
- Screenshots or visual evidence: existing protected-screen baselines remain in scope; no intentional visual redesign.
- Remaining issues: the local browser audit was inconclusive because the runner hung; hosted inspection and all deterministic public gates passed.

## Final status

**Implemented, published, and hosted-verified.**
