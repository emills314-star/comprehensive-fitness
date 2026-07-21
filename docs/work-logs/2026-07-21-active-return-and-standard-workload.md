# Active Return and Standard Workload

**Date:** 2026-07-21
**Status:** IMPLEMENTED

## Result

- Previous-session History opened from an active set keeps a floating, safe-area-aware **Return to active session** action above bottom navigation.
- Returning restores the canonical active workout pointer and clears only transient History state; neither session is edited or submitted.
- Exercise options exposes a compact Standard workload card for working sets and rep range.
- Initial values come directly from the evidence-backed `finalPrescription` shown by the recommendation card.
- Applying changes uses the audited manual-override engine and rebuilds only unfinished working sets.
- Template workouts can save an explicit bounded standard. Future starts generate a fresh evidence snapshot, then apply the saved preference with the new workout identity.

## Verification

- `node scripts/test-active-workout-return-and-standards.js`
- `node scripts/test-prescription-app-integration.js`
- `node scripts/test-set-prescriptions.js`
- `node scripts/test-app-integration-contracts.js`
- `node scripts/lint-static.js`
- `npm.cmd run verify:pwa`
