# Comprehensive Fitness Redesign Milestone Log

## M0 — Preservation contracts and synthetic migration baseline

**Status:** IMPLEMENTED LOCALLY  
**Started:** 2026-07-30  
**Baseline revision:** `fe85e6665ec6a4896b1f1a5bbe982710358bb1b4`  
**Branch:** `codex/zero-based-redesign`  
**Checkpoint:** `3e24f93` (`chore(redesign): establish preservation baseline`)  
**Working tree at start:** Pre-existing untracked `.claude/`, `.vercel/`, `docs/redesign/`, and `redesign/prompts/`; preserve all user work.  
**Execution runtime:** Node `v24.18.0`, npm `11.16.0`; repository pins Node `22.23.x`, npm `10.9.x`  
**Visible behavior change:** None authorized

### Planned evidence

- Versioned target contract schemas.
- Synthetic app-data v1 and v2 backup fixtures.
- Legacy mesocycle/equipment compatibility fixture.
- Set-role ambiguity/provenance fixture.
- Historical recommendation/grade/execution-quality fixture.
- Active-draft recovery fixture.
- Deterministic, idempotent preservation comparison test.
- Focused backup/domain/runtime persistence regression results.

### Temporary artifacts

None beyond M0 schemas and synthetic fixtures. M0 does not introduce a production feature flag, adapter, writer, or runtime consumer.

### Documentation impact

- `docs/redesign/STATUS.md`: implementation authorization and M0 state.
- `docs/redesign/implementation/IMPLEMENTATION_EXECPLAN.md`: active sequencing authority.
- `docs/ROADMAP.md`: zero-based redesign implementation becomes active work.
- Current product/architecture/decision/UI behavior remains unchanged during M0; their implemented-state descriptions require no behavioral rewrite.

### Exit record

- Added five versioned target schemas for app data, backup, active draft, resolved actions, and prospective actual-work grades.
- Added four synthetic fixture families covering supported legacy app-data versions, legacy planner/equipment state, immutable historical recommendation/grade/execution-quality fields, role ambiguity/provenance, and interrupted active-draft state.
- Added `scripts/test-redesign-m0-preservation.js`; public discovery selected it automatically.
- Verified source-observation projection equality and idempotent backup validation/export round-trips for app-data versions 1 and 2.
- Verified incomplete decimal RPE, active exercise, exercise order, notes, completed sets, and timer state survive the synthetic active-draft serialization boundary.
- Verified fixtures contain no personal identity, personal-data path, or common private-email marker.
- Closed the executable preservation gap found during checkpoint review: current app-data v3 now exports as backup v3 and remains importable, while legacy v1/v2 backup envelopes retain their versioned compatibility path.
- Added a privacy-safe current-v3 round-trip fixture and preserved legacy/current stored grade values and versions through both the backup contract and strict app import allowlist.
- Focused passes:
  - `node scripts/test-redesign-m0-preservation.js`
  - `node scripts/test-backup-contract.js`
  - `node scripts/test-domain-integrity.js`
  - `node scripts/test-runtime-persistence.js`
- Full public gate: `npm.cmd test` passed 54/54 selected scripts (55 discovered; one private-only harness excluded).
- Static lint passed across 194 JavaScript and 3,128 JSON files.
- First sandboxed full run could not complete because the archive-integrity test was denied Git plumbing access; the approved unsandboxed rerun passed. This was an environment constraint, not a product failure.
- No production runtime consumes the target schemas yet. No current data or active draft was migrated.
- The executable backup contract and its `www/` mirror were synchronized. The shared service-worker cache advances with the immediately following M1 runtime checkpoint.

### Remaining external gates

- Independent migration verification begins when an executable migration exists.
- A complete real user export is required before any real local-data migration.
- No device, browser UI, PWA, notification, visual-baseline, or five-workout acceptance claim is made for M0.
- The full gate must be repeated on the repository-pinned Node/npm versions before M0 is called review-ready; the local environment used newer versions.

## M1 — Stable targets and logging integrity

**Status:** IMPLEMENTED LOCALLY  
**Started:** 2026-07-31  
**Completed locally:** 2026-07-31  
**Baseline revision:** `fe85e6665ec6a4896b1f1a5bbe982710358bb1b4`  
**Branch:** `codex/zero-based-redesign`  
**Checkpoint:** `2101e19` (`feat(redesign): stabilize workout targets and logging`)  
**Working tree at start:** Preserved the M0 work plus pre-existing untracked `.claude/`, `.vercel/`, `docs/redesign/`, and `redesign/prompts/`; no user work was overwritten.  
**Execution runtime:** Node `v24.18.0`, npm `11.16.0`; repository pins Node `22.23.x`, npm `10.9.x`  
**Visible behavior authority:** Final PRD §§6.1–6.4; feature dispositions C-01–C-12 and D-01–D-16  
**Primary exit gate:** Stable variant targets drive generated sessions and factual prefill; global equipment state cannot block any logged exercise; identity/role history remains intact.

### Exit record

- Migrated legacy routine target ownership into explicit stable variant/set-role targets and removed `standardWorkloadOverride` as an active gate.
- Normal engine exact set/load/rep outputs no longer rewrite routine targets or prefill editable fields.
- Factual prefills now use the corresponding prior same-variant/same-role set, explicit routine defaults, then blank.
- Global equipment preference state is decoded/discarded and no longer has an active UI writer, runtime reader, or normal logging rejection path.
- Role-aware history, named variant identity, workout history, active drafts, recommendation snapshots, and legacy planner records remain preserved.
- Added privacy-safe M1 migration data and focused contracts; updated stale UI/integration assertions.
- Fixed four-digit numeric input serialization and a mobile current-set completion/options touch collision found during required visual verification.
- Reproduced the reported RPE interaction failure in mobile Chromium: typing `7.5` over selected `7` produced `.5`, and the subsequent completion touch could be lost during blur-driven rerender.
- Added a bounded decimal replacement buffer for the active RPE field and deferred completion to the freshly rendered stable set target. The same focused edit now stores `7.5` and completes the set without clearing or reopening the field.
- Synchronized 40 public PWA assets and advanced the service-worker cache to v95 after the backup/import and RPE interaction contract changed.

### Verification record

- M1 focused migration, prescription, standards, integration, and backup/preservation suites passed.
- Full public gate passed 55/55 selected scripts; one private-only harness was correctly excluded.
- Lint, TypeScript check, Vite production build, PWA/native package verification, root/`www/` synchronization, and the 608-file public privacy guard passed.
- Five affected mobile Playwright regressions passed.
- Focused current-build visual verification passed 3/3 at 390 × 844 with long-name, 1,234.5-lb, uncompleted, completed, one-edit `7` to `7.5` RPE replacement, touch, and deleted-equipment-control states.
- Screenshots: `artifacts/ui-audit/m1/m1-mobile-stable-target-prefill.png`, `m1-mobile-stable-target-completed.png`, `m1-mobile-rpe-7-to-7-5.png`, and `m1-mobile-equipment-preference-removed.png`.

### Deletion and compatibility record

- Deleted active target-ownership checks based on `standardWorkloadOverride`.
- Deleted global equipment setting controls, event writers, normal-path readers, and equipment-only logging blocks.
- Retained only legacy decode/discard fields for backup compatibility and internal recommendation/planner equipment capabilities scheduled for M3 deletion.
- No M1 comparison path or new feature flag remains.

### Remaining gates

- Repeat on repository-pinned Node/npm before review-ready status.
- Physical-device RPE, notification, safe-area, and human workout acceptance are later gates.
- The authorized local checkpoint is `2101e19`. Push, deployment, real-data migration, baseline acceptance, and publication remain unauthorized and incomplete.

## M2 — Canonical exception resolver

**Status:** IN PROGRESS  
**Started:** 2026-07-31  
**Baseline checkpoint:** `2101e19`  
**Branch:** `codex/zero-based-redesign`  
**Visible behavior authority:** Final PRD §§7–8; feature dispositions B-01–B-18, C-03–C-12, H-18, X-06–X-08; recommendation engine contract §§2–15  
**Primary exit gate:** One versioned resolver is the only source of visible or stored current exception actions; ordinary cases are silent; safety precedence, scope, persistence, failure isolation, and stable-target invariants are proven.

### Exact milestone scope

- Normalize candidate input for only `pain_or_illness`, `deload`, `readiness`, `fatigue`, and `plateau`.
- Implement deterministic precedence, strictness, scope arbitration, expiry/return boundaries, supersession, and user handling.
- Persist resolved actions in current app data, active drafts, and submitted workout snapshots without rewriting historical snapshots.
- Route Today, active workout, completion, and grade through resolved actions only.
- Delete direct detector consumers, target-mutating fallbacks, duplicate recommendation stores/renderers, and visible evidence/confidence presentation assigned to M2.
- Evaluate surviving thresholds with privacy-safe ordinary, boundary, sparse, ambiguous, failure, conflict, variant, role, and nuisance fixtures; suppress any rule that does not pass calibration and independent recommendation review.

### Affected data and migration safety

- Existing `recommendationHistory`, `manualOverrides`, `workoutPrescription`, per-exercise recommendation snapshots, readiness observations, historical grades, and legacy imported fields remain readable and immutable.
- New current decisions use the versioned resolved-action contract and do not replace or recompute old records.
- Active drafts must preserve the action visible at evaluation time and the later `accepted`, `modified`, `ignored`, or `overridden` handling.
- Resolver or detector failure must produce no target mutation and must leave the logger usable; explicit pain/illness alone may use the canonical safety fallback.

### Authority/conflict review

No material contradiction was found in the final documents. Existing fatigue, readiness, plateau, and deload thresholds are implemented-state evidence only and are not automatically approved. M2 will not expose or retain a threshold merely because a legacy test passes.
