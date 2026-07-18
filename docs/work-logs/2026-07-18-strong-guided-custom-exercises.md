# 2026-07-18 — Guided custom exercises and per-set targets

## Status

**IMPLEMENTED locally.** PR publication, CI, and hosted mobile/desktop verification remain **NEEDS REVIEW** for the publishing agent.

## Scope

- Added a persistent validated custom exercise catalog with stable `user:` IDs, required primary muscle, optional secondary muscle, resistance/equipment metadata, and non-destructive archive/restore.
- Integrated referenced custom records into templates, active workouts, guided manual planning, programming-family weekly dose, analytics, and backup import/export.
- Made the stable `customExerciseId` authoritative across completed-history grouping, charts, prior-performance lookup, and coaching, so a rename cannot fork training history.
- Kept custom recommendations explicitly user-defined and limited-confidence. No canonical research identity, effectiveness score, citation, or pain-safe substitution is fabricated.
- Added an optional per-working-set exact/min-max rep editor. Targets retain user-authored provenance and flow to active `targetRepMin`/`targetRepMax` values.
- Standardized collapsed `Why This Recommendation` disclosures on the remaining actionable coaching surfaces and made logged-workout editing more discoverable while retaining the existing transaction safeguards.
- Adapted the unqualified top/back-off progression gate so the prior comparable load and no more than prior reps are prescribed until the complete rep/RPE gate passes.
- Reused the unpublished family-authoritative weekly dose work from commit `65bcca870f14eb66e6eb9a32671e2d64a465d15e`.

## Verification

- `node --check` passed for all changed runtime segments.
- `node scripts/test-custom-exercise-workflow.js` passed.
  - Behavioral fixtures prove rename continuity through the real completed index and prior-set lookup, isolated per-set range updates, archived/built-in name collisions, and backup retention of archive metadata plus template references.
- `node scripts/test-set-prescriptions.js` passed.
- `node scripts/test-app-integration-contracts.js` passed 32/32 contracts.
- `node scripts/test-taxonomy-family-projection.js`, `node scripts/test-exercise-expectations.js`, and `node scripts/test-backup-contract.js` passed.
- An initial direct `scripts/test-prescription-app-integration.js` run reached its private-evidence-only assertion because the public-checkout flag was absent; the canonical public gate reran it successfully with the truly private assertion skipped.
- A focused rerun with `CF_PUBLIC_CHECKOUT=1` passed and confirmed 20 public muscle pools; line 152 is intentionally the private-fixture assertion, not a product-path failure.
- After installing declared development dependencies, `npm test` passed 41 of 43 public harnesses. `test-research-workbook-determinism.js` passed when rerun with Git metadata access. `test-research-archive-integrity.js` remained environment-blocked because the unusually deep isolated-worktree path exceeds Windows checkout filename limits; it did not report a research-data or feature assertion mismatch.
- `npm run sync:web` and `npm run verify:pwa` passed for all 32 public assets.
- PR CI exposed an operating-system-specific verifier defect: Linux payload paths used `/`, while the public research-export allowlist matched only Windows `\\` separators. The verifier now normalizes relative paths before applying the narrow `research_database/exports/json/*` allowlist, and the native packaging privacy contract asserts that cross-platform boundary.
- The first Chromium PR run also exposed stale UI-test contracts: six history regressions still targeted the former `Edit History` label, the template performance check used a now-ambiguous nested `summary`, guided muscle-scope setup used rerender-sensitive positional clicks, and seven visual baselines predated the intentional UI additions. Those contracts and approved mobile/desktop baselines were updated; the complete `npm run audit:ui` rerun passed 206 tests with 18 intentional skips in 12.3 minutes.
- Linux CI then isolated cross-platform browser differences: fixed mobile chrome could intercept Playwright's auto-scrolled planner controls, native form-control internals reported a few clipped pixels without widening the document, and Linux screenshot geometry differed from Windows. Guided state-transition tests now activate already-verified visible controls without pointer-coordinate dependence, the reflow audit still enforces root/offscreen safety while excluding viewport-contained replaced form controls, and public CI retains failed screenshot/diff/trace evidence for platform-specific baseline review.
- The retained public-CI artifact was downloaded outside the repository, retry pairs were hash-checked, and representative mobile, desktop, light, dark, large-text, and empty-state captures were visually reviewed. Only existing tracked baselines were replaced with the first Linux capture; all content uses the public synthetic fixture and contains no personal fitness data.

## Documentation review

- Updated `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, and `docs/ROADMAP.md`.
- Reviewed `docs/training-prescription-data.md`; the reused family-authoritative commit already updated the user-authored Primary/Secondary mapping contract, so no additional task-specific change was required.
- Reviewed `docs/DOCUMENTATION_INVENTORY.md`; no inventory role or source-of-truth routing changed.

## Follow-up gate

Before merging: run root/`www` synchronization, full public/release checks, PR CI, and browser verification of create/edit/archive, catalog selection, per-set targets, active-workout propagation, and editable history at mobile and desktop widths.
