# Role-aware exercise options

**Date:** 2026-07-22
**Status:** IMPLEMENTED, DEPLOYED, AND HOSTED-VERIFIED

## Result

- Replaced the single generic workload editor with one compact Straight sets card or distinct Top set and Back-off sets cards based on the final prescription.
- Preserved independent role counts and rep ranges when rebuilding unfinished rows; completed work, warm-ups, and logged outcomes remain untouched.
- Added append-only `rolePrescription` audit replay, aggregate-dose derivation, schema bounds, and tamper rejection.
- Preserved role-specific defaults across future template starts with bounded backup import validation.
- Kept multiple-top-set prescriptions in a single repeated-primary-effort card instead of displaying a nonexistent back-off role.

## Verification

- `node scripts/test-active-workout-return-and-standards.js`
- `node scripts/test-recommendation-regressions.js` — 44/44 passed.
- `node scripts/test-prescription-schema-contracts.js`
- `npm.cmd run audit:ui -- tests/ui/app-integration-accessibility.spec.js --grep "exercise guidelines separate" --workers=1` — mobile and desktop passed.
- `npm.cmd test` — all 50 selected public scripts passed; the single private-only personal-data harness remained excluded by contract.
- `npm.cmd run lint`, `npm.cmd run research:validate`, `npm.cmd run verify:pwa`, and both dependency audit modes passed. The full dependency tree retains two reported moderate development-only findings (`exceljs`, `uuid`); production has zero findings.
- `npm.cmd run check:public` could not use its whole-workspace privacy step because this owner checkout intentionally contains pre-existing tracked private fitness artifacts and archived verification worktrees. Publication therefore uses an explicit staged-file privacy review; no private artifact is in this change.
- Production assets expose the separate top/back-off fields and service-worker cache generation `comprehensive-fitness-pwa-v56`.
- The same focused Playwright regression passed on mobile and desktop against `https://comprehensive-fitness.vercel.app`.
- The deployed Today shell loaded successfully in the in-app browser and rendered the current application runtime.

## Documentation review

- `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, `docs/ROADMAP.md`, and `docs/training-prescription-data.md` updated for the verified role-aware behavior and engine contract.

## Publication

- Application commit `9c52274` was pushed to GitHub `main`.
- Hosted URL: `https://comprehensive-fitness.vercel.app/?verify=9c52274#today`.
