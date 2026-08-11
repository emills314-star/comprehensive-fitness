# Kimi P0 Today hierarchy and navigation

## Change

- Summary: Implemented the first bounded Kimi P0 slice for expected-workout and active-draft Today hierarchy plus persistent navigation.
- User flow affected: Viewing or starting the expected workout; returning to Today with an active draft; choosing another workout; opening Routines or Settings; switching between Today and Progress.

## Evidence

- Files changed: `app-views.js`, `index.html`, synchronized `www/app-views.js` and `www/index.html`, and `tests/ui/redesign-m5-navigation-and-drafts.spec.js`.
- Documentation updated: `docs/UI_UX.md`, `docs/ROADMAP.md`, and `CODEX_REDESIGN_IMPLEMENTATION_LOG.md`.
- Local validation: `npm.cmd run sync:web` passed; both focused Today regressions passed in mobile and desktop Chromium; `npm.cmd run lint` passed.
- Branch and commit: local `codex/kimi-k3-redesign` worktree; no commit created.
- Deployment inspected: not in scope.
- Hosted URL/deployment identifier: not applicable.
- Browser viewport/device sizes: fixtures start at 390 × 844; expected workout is explicitly verified at 768 × 1024 and active draft at 1440 × 900.
- Exact flow tested: load scheduled-workout and active-draft Today states, verify one authoritative status surface and Start/Resume accessibility, verify quiet secondary/context actions, then verify hero/navigation bounds and flat styling at tablet and desktop widths.
- Expected result: one active-draft status, focused Today measure, unclipped full-width two-destination navigation, unchanged Resume behavior.
- Actual result: matched expected result in the focused mobile and desktop projects.
- Console/runtime errors: none reported by the passing focused runs.
- Screenshots: `artifacts/ui-audit/m5/m5-tablet-kimi-p0-expected-today.png` and `artifacts/ui-audit/m5/m5-desktop-kimi-p0-today.png` (generated local evidence; not accepted baselines).
- Remaining issues: **NEEDS REVIEW** — the complete M5 spec file exceeded its four-minute command ceiling without producing results; hosted and physical-device verification were not in scope.

## Final status

**Implemented locally.** No commit, push, deployment, publication, or visual-baseline acceptance occurred.
