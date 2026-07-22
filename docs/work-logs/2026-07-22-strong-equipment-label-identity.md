# Strong exercise-label identity remediation

**Date:** 2026-07-22
**Status:** IMPLEMENTED LOCALLY

## Change

- Reproduced `unknown_exercise_identity` for the four equipment-qualified Strong labels visible in the affected workout, then expanded the audit to every configured exercise.
- Verified all 149 recorded Strong names remain startable through canonical guidance or the exact-history fallback.
- Added every missing explicitly research-mapped Strong label to the authoritative public exercise aliases, each with one canonical owner; all 23 configured mappings now resolve.
- Preserved exact performance identities for aliases and trusted personal crosswalks so named, attachment, equipment, and light/heavy variations do not merge load history.
- Rebuilt the CSV, JSON, manifest, and workbook research artifacts from the source database.
- Retained the collision-first resolver and avoided fuzzy token reordering or equipment stripping; the exported inventory is now 62 canonical exercises and 84 unique aliases.

## Evidence

- `npm run research:build`
- `npm run research:validate`
- `npm run test:prescription-engine`
- `npm run test:personal-data` — the private 149-name inventory and all 23 declared research mappings passed.
- `node scripts/test-app-integration-contracts.js` — 38/38 identity and application integration contracts passed.
- `npx playwright test tests/ui/strong-history-fallback.spec.js --grep "all configured research-mapped Strong labels"` — mobile and desktop passed.
- `npm run check:public` — lint, workflows, tracked-content privacy, dependency audits, all 50 public test scripts, research validation, and PWA/native packaging passed.
- Live in-app browser inspection of the current local workout found zero `unknown_exercise_identity` messages, zero unavailable cards, and zero console errors.
- Node coverage verifies canonical identity and default dynamic target resolution.
- Browser coverage verifies the loaded public registry, frontend identity profile, distinct performance identity, executable state, and canonical target for every mapped label.

## Documentation review

- `docs/ARCHITECTURE.md` updated with the declared Strong-alias boundary.
- `docs/DECISION_ENGINE.md` updated with the explicit-alias and fail-closed behavior.
- `docs/UI_UX.md` updated with the active-workout result.
- `docs/ROADMAP.md` updated with the completed defect remediation.
- `docs/PROJECT.md` reviewed; product scope remains accurate and required no text change.

## Publication

- Branch: `main`
- Commit, deployment, hosted browser verification, and final status will be recorded after the release gates pass.
