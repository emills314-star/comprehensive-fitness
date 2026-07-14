# Baseline audit and implementation plan

## Baseline decision

Source revision `main` @ `5edcd4b` is feature-rich and visually coherent, but it is not release-ready under the fixed rubrics. The original domain and browser suites pass, yet independent synthetic checks reproduce safety, data-integrity, security/privacy, accessibility, and test-validity defects that those suites did not cover.

No application behavior was changed before this baseline was scored.

- Codebase baseline: **25/50**.
- Workout-recommendation baseline: **22/50**.
- Lift and Dashboard: protected; no material redesign approved.
- Canonical muscle decision: retain all 23 anatomical IDs; add explicit family/display projections rather than merging meaningful distinctions.
- Recommendation architecture: deterministic hybrid of rules, evidence-weighted scores, templates, greedy portfolio selection, and stored snapshots; no ML or LLM inference is used.

## Architecture and data-flow baseline

```text
Public research source -> generated JSON exports -> prescription engine
Private local exports -> normalization/analysis -> optional aggregate import --+
Submitted app history --------------------------------------------------------+-> snapshot/prescription
Readiness/profile/template/constraints --------------------------------------+-> workout UI/history

UI string renderer -> IndexedDB app state + compact localStorage draft
                   -> optional installation-authorized push/sync APIs -> Redis/QStash/Web Push
                   -> service worker/cache -> PWA/Capacitor packaged copy under www/
```

Strengths are the local-first lifecycle, explicit submission, immutable recommendation snapshots, public/private evidence separation, revision-keyed analysis caches, progressive Templates rendering, useful research schemas, and a strong mobile visual foundation.

Structural risks are concentrated in the 919 KB inline frontend, implicit cross-file contracts, evolving in-place persistence migration, duplicated root/`www` assets, dead legacy UI, incomplete API lifecycle controls, and tests that rely on source regexes or excluded private artifacts.

The full feature, screen, route, persistence, integration, and risk inventory is maintained in `feature-inventory-and-risk-register.md`. The exact command baseline is in `baseline-verification.md`.

## Accepted release-blocking findings

1. Illness/pain and incomplete/invalid performance evidence can still yield normal or progressed prescriptions.
2. Assisted-bodyweight direction, planned-reduction anchoring, return-from-gap behavior, manual overrides, recommendation IDs, and substitute equipment are incorrect or weakly bounded.
3. Canonical exercise identity normalization misses almost every catalog name/alias in app analytics; guided family aggregation overcounts subdivisions and fails traps/calves.
4. Strict backup validation is absent and hostile imported fields can reach HTML attribute interpolation, creating stored DOM-XSS risk.
5. Notification consent silently enables workout upload, disabling alerts does not stop it, and no server deletion/revocation/retention lifecycle exists.
6. Public native synchronization can package ignored personal aggregates; stale private payloads are not pruned; Android backup/provider scope is too broad.
7. Existing public tests are not clean-checkout reproducible and browser goldens protect mostly empty light-mode states.
8. Quick-start controls lose button semantics; SPA navigation/dialog close lose focus; active Lift control names lack exercise context; no skip route avoids traversing roughly 160 controls.
9. Cold large-fixture Lift/Dashboard renders take roughly 718/581 ms; warm caches are strong, but duplicate evidence fetches, quadratic normalization, and Charts view construction remain material.
10. Documentation claims several guarantees that current executable behavior contradicts.

## Protected visual target

- Preserve the compact centered shell and fixed safe-area navigation.
- Preserve Lift as a dense divider-oriented training sheet.
- Preserve Dashboard as a compact summary/drilldown surface.
- Use Equipment chips and Muscle Scope tiles as the reference patterns for comparable multi-entry controls.
- Introduce truthful semantic token aliases and small HTML-string/CSS primitives incrementally; do not adopt a framework or perform a broad visual rewrite.
- Add rich-state baselines before shared Lift/Dashboard selectors change.

## Implementation workstreams and ownership

The runtime supports root plus three child threads, so independent specialties run in successive waves. Write-enabled work is isolated by branch/worktree and overlapping files are serialized.

### Wave A Ã¢â‚¬â€ pure/core release blockers

1. **Recommendation engine** Ã¢â‚¬â€ `artifacts/worktrees/recommendation-engine`, branch `codex/recommendation-engine-20260712`.
   - Own `prescription-engine.js` and recommendation regression tests only.
   - Fix readiness safety, progression evidence, assisted resistance, reduced/stale history, override validation/locks, identity generation, and replacement compatibility.
2. **Security/platform core** Ã¢â‚¬â€ `artifacts/worktrees/security-core`, branch `codex/security-core-20260712`.
   - Own API helpers/routes, service worker, web-sync/native privacy configuration, and new isolated security tests.
   - Do not edit `index.html` during this wave.
3. **Taxonomy/data core** Ã¢â‚¬â€ `artifacts/worktrees/taxonomy-core`, branch `codex/taxonomy-core-20260712`.
   - Own research taxonomy/source/build/validators, private-pipeline configuration adapters, `guided-mesocycle.js`, and new taxonomy tests.
   - Do not edit `index.html` or `prescription-engine.js` during this wave.

Each workstream must start from a failing reproduction, run its existing dependent suite, receive independent review, and commit only privacy-safe source/test changes.

### Wave B Ã¢â‚¬â€ application integration and contracts

- Serialize all `index.html` work in one structural integration worktree.
- Wire illness/pain, performance evidence, planned sets, resistance type, time/equipment/exclusion/scope constraints, and canonical identity through the UI boundary.
- Add strict versioned backup import validation and output escaping.
- Separate cloud-workout-sync consent from notifications, add deletion/revocation UI/API behavior, and make missing/disabled sync fail closed.
- Add reachable specialization targeting or remove the unsupported objective until it is valid; preserve legacy records.
- Replace false source-only assertions with behavior-level integration tests.
- Advance the service-worker cache when cross-file runtime contracts change.

### Wave C Ã¢â‚¬â€ design, accessibility, and performance

- Add deterministic rich Lift/Dashboard screenshots and behavior fixtures before shared-style changes.
- Restore quick-template semantics, route/dialog focus, contextual Lift accessible names, skip links, group labels, live announcements, and critical mobile hit regions.
- Add semantic status variants and truthful token aliases while preserving computed protected-screen appearance.
- Remove duplicate public-evidence loading, index loaded sets once, prewarm/defer cold analyses, and progressively disclose expensive Charts detail.
- Enforce the documented large-fixture performance budgets.

### Wave D Ã¢â‚¬â€ reliability, evidence, and documentation

- Split public and optional-private test gates; create pull-request CI, clean-install/release/privacy commands, complete PWA parity/hashes, API/security tests, hostile-import tests, migration recovery tests, and feature/browser matrices.
- Refresh the primary-source evidence ledger and mark heuristic product policy explicitly.
- Update Project, Architecture, Decision Engine, UI/UX, Roadmap, privacy/support, data/migration, testing, and release documentation only after behavior is verified.

### Wave E Ã¢â‚¬â€ independent quality loops

- Fresh feature/recommendation/migration/security/accessibility/visual/performance reviews.
- A blind first scoring run in an isolated context that is not told the requested target.
- Fix, retest, and rescore without changing rubric definitions.
- Final release verification, staged privacy review, commit to `main`, and push only after all acceptance gates genuinely pass.

## Acceptance evidence required for every fix

- Reproduction before change.
- Focused unit/integration/browser/property/invariant or migration test after change.
- Existing dependent suite and public clean-checkout suite.
- Exact command/result in the verification report.
- Governing-document review/update and Roadmap status.
- Independent reviewer other than the implementation worker.
- Root/`www` parity where applicable.
- Staged-file review excluding personal data, credentials, local databases, generated audits, and artifacts.

External production deployment, live Upstash/QStash state, physical iPhone behavior, and App Store signing remain outside repository-verifiable authority and must be reported as **NEEDS REVIEW**, not claimed complete.
