# Exercise options benchmark strip and range steppers

## Change

- Selected the Benchmark Strip direction for active-workout Exercise options.
- Broad exercise guidance now renders before editable defaults as an explicitly informational program benchmark with compact value badges and no form controls.
- Working sets, rep bounds, target RPE bounds, working rest, warm-up rest, and every individual-set numeric target now use a bounded down/value/up stepper while preserving direct number entry.
- Shared and individual Target RPE controls write exact ordered minimum and maximum values instead of reconstructing the minimum from one visible maximum.

## Verified intent

- **IMPLEMENTED:** active sets and template `setTypes`/`warmups` retain exact `targetRpeMin` and `targetRpeMax`; the existing `targetRpe` field remains the compatibility upper bound.
- **IMPLEMENTED:** completed rows and logged actuals remain unchanged when defaults are applied.
- **IMPLEMENTED:** exercises without research guidance still receive the editable defaults surface but do not receive fabricated benchmark guidance.
- **IMPLEMENTED:** service-worker cache generation advances to `comprehensive-fitness-pwa-v62`.

## Documentation

- Updated `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, `docs/ROADMAP.md`, and `docs/training-prescription-data.md`.

## Verification

- `node scripts/test-active-workout-return-and-standards.js`
- `node scripts/test-progression-feedback-custom-guidelines.js`
- `node scripts/test-set-prescriptions.js`
- `npm.cmd run audit:ui -- tests/ui/app-integration-accessibility.spec.js --grep "every exercise exposes|an exercise without" --workers=1` — four mobile/desktop cases passed.
- Local in-app browser verification on an uncached origin confirmed the Benchmark Strip order, zero form controls inside the read-only strip, exact `6-9` shared RPE bounds, all numeric steppers, and working increment/decrement behavior.
- The public-test harness completed 48 tests directly; its two read-only Git subprocess tests were blocked by sandbox `EPERM`, then both passed when rerun with the required permission.
- `npm.cmd run lint`
- `npm.cmd run verify:pwa`
- `npm.cmd run research:validate`
- `npm.cmd run check:workflows`
- `npm.cmd run check:privacy`
- Deployment and hosted verification are recorded after publication.
