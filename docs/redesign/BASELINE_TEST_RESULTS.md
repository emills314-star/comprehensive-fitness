# Baseline test results

## 2026-08-08 focused Chromium capture

Command: `npx playwright test tests/ui/mockup-fidelity.spec.js --project=mobile --reporter=line` against the untouched source worktree with public synthetic fixtures.

- Passed: 7
- Failed: 3
- Duration: 1.2 minutes
- Real screenshots captured: 16 under `artifacts/design-review/baseline/`

The failures were assertion/revision mismatches in the baseline: one expected a newer `.workout-timer-slot` placement, and two expected a newer `start-next-template` action. The browser rendered and remaining scenarios continued. They are recorded as known baseline failures and do not authorize changing protected behavior.

Captured states include active workout, completion, active-draft conflict, Progress/chart detail/history, Settings/data/privacy-adjacent controls, first-run/error, persistent session controls, and navigation. Today and active workout are the representative K3 baseline inputs; the three-direction design lab supplies deterministic comparison coverage for every requested representative screen.

Physical device, hosted deployment, notification delivery, and owner visual-baseline acceptance remain unverified external gates.
