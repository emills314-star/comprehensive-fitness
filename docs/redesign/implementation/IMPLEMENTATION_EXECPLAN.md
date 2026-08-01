# Comprehensive Fitness Redesign Implementation ExecPlan

**Status:** ACTIVE  
**Authority:** `../final/FINAL_REDESIGN_PRD.md`, `../final/FINAL_FEATURE_DISPOSITION.md`, `../final/RECOMMENDATION_ENGINE_CONTRACT.md`, `../final/MIGRATION_AND_ACCEPTANCE_PLAN.md`  
**Adjudication record:** `../audits/ADJUDICATION_MATRIX.md`  
**Candidate branch:** `codex/zero-based-redesign`  
**Candidate baseline:** `fe85e6665ec6a4896b1f1a5bbe982710358bb1b4`  
**Implementation authorized:** 2026-07-30  
**Publication authorized:** No

## 1. Execution rule

The final package fixes product scope. This plan sequences implementation only. Coupling may change order inside a milestone, but it cannot preserve a deleted feature or add a new one.

Reopen a settled decision only when implementation proves a concrete data-loss risk, security issue, logical contradiction, or objectively impossible requirement. Record that evidence in `../DECISION_LOG.md` and mark the milestone **NEEDS REVIEW** before changing scope.

Every milestone:

1. reads the governing final and living documents;
2. records its pre-change revision and dirty-worktree boundary;
3. implements the narrow milestone contract;
4. adds or updates privacy-safe tests and fixtures;
5. runs focused checks, then the appropriate public gate;
6. updates affected living documentation and `docs/ROADMAP.md`;
7. synchronizes `www/` and advances `sw.js` when a runtime contract changes;
8. lists temporary adapters/flags and their deletion gate;
9. inspects the final diff and privacy boundary;
10. stops without commit, push, deployment, baseline acceptance, or publication unless separately authorized.

## 2. Protected boundaries

- Preserve every completed workout observation and immutable submitted snapshot.
- Preserve variant identity, set-role provenance, order, duration, notes, readiness/rest facts, Strong provenance, and stored historical grade values/versions.
- Preserve and migrate the independent active-draft store.
- Never use private personal records in committed fixtures or public evidence.
- Root runtime files are source; `www/` is generated.
- Compatibility readers are isolated, versioned, and read-only. They do not recreate active deleted domains.
- Recommendation failure cannot block logging.

## 3. Milestone map

| Milestone | Outcome | Primary ownership | Required exit evidence |
| --- | --- | --- | --- |
| M0 | Preservation contracts and synthetic migration baseline | backup/persistence contracts, schemas, fixtures, migration tests | Legacy backup round-trip, source-observation equality, active-draft recovery fixture, idempotency |
| M1 | Stable variant targets and unrestricted logging | template/variant targets, start projection, equipment gating, factual prefill | No engine normal-target mutation or equipment block; identity/role regressions pass |
| M2 | Canonical exception resolver | candidate adapters, resolver, resolved-action persistence, grade input | Precedence/scope/silence/failure tests; independent recommendation review |
| M3 | Mesocycle/planner deletion across layers | views/routes, requests, engine planner code, schemas, active state, legacy decoder | Old backups preserve workout facts; no active mesocycle runtime dependency |
| M4 | Removed analytics/research execution clutter | Today/Progress analysis, confidence/evidence UI, hypertrophy/volume code | Today/Start do no deleted work; approved flags retain minimum internal inputs |
| M5 | Two-destination shell and direct Start | navigation, contextual secondary routes, active-draft conflict flow | Only Today/Progress persist; direct Start; coherent Back/close behavior |
| M6 | Simplified active workout | set rows, prior facts, overrides, role correction, timer, RPE/device path | Browser/mobile/device and recovery coverage; no plate/execution-quality UI |
| M7 | Versioned actual-work grade and coherent Progress | grade v2, completion, workout/exercise history and chart detail | Historical grade preservation; concise completion; inspectable chart points |
| M8 | Dead-structure deletion and packaging closure | concept gallery/toolchain, expired adapters/flags, docs, `www/`, cache/native/PWA | Deletion ledger clean; full public/privacy/package gates; final independent audit packet |

Milestone exit does not authorize publication. M0-M8 may remain locally implemented and uncommitted.

## 4. M0 work package

### Scope

- Establish explicit target versions for app data, backup, active draft, resolved action, and grade.
- Add privacy-safe synthetic legacy backup, mesocycle/equipment, role-ambiguity, historical-snapshot/grade, and active-draft fixtures.
- Prove supported legacy backup fixtures round-trip without source-observation loss.
- Prove fixture normalization/comparison is deterministic and idempotent.
- Record the compatibility-reader boundary before active feature deletion begins.

### Out of scope

- No visible UI change.
- No current data migration.
- No change to current backup import/export behavior.
- No stable-target switch, equipment deletion, resolver, planner deletion, or grade change.
- No `www/` synchronization or service-worker bump unless a production runtime starts consuming a new contract.

### Exit gate

- Target contract schemas parse and declare unique versions.
- Supported legacy app-data versions have synthetic fixtures.
- Legacy mesocycle/equipment fields survive the current round-trip baseline for later comparison.
- Core session/exercise/set/template observations compare losslessly.
- Immutable historical snapshot, grade, and execution-quality fields remain present.
- Active-draft fixtures preserve entered incomplete values, current identity/order, and timer context.
- The M0 test is part of `npm test`.

## M1 completion record — Stable variant targets and unrestricted logging

**Status:** IMPLEMENTED LOCALLY on 2026-07-31. M2 subsequently passed its exit gate; M3 is next.

### Completed requirements

- Named exercise variants now own explicit stable working-set count, role, rep range, target-RPE band, rest, and increment values. Legacy `standardWorkloadOverride` and `standardRoleWorkload` values are decoded into explicit `setTypes` and are not retained as active target-ownership gates.
- Generated normal sessions keep the routine's stable set count/range/RPE/rest. Ordinary engine load, rep, and set-count recommendations do not prefill or rewrite those targets.
- Editable load/reps/RPE prefill is factual in this order: corresponding prior working set for the same variant and role, explicit routine default, then blank. Back-off, top, straight, drop, and warm-up roles are not substituted for one another.
- Exact named variants retain separate performance identity and history matching.
- Global `availableEquipment` is discarded during load/import normalization, has no active writer or UI control, and cannot block normal exercise selection or logging. Legacy backups may still decode and discard the field.
- Existing sessions, workout history, submitted snapshots, roles, IDs, planner records, and active drafts remain preserved. Stale equipment-only execution blocks are cleared for current logging while their immutable recommendation snapshots remain historical evidence.
- The executable backup contract exports/imports current app-data v3 through backup schema v3 while retaining isolated v1/v2 compatibility, and strict import preserves stored historical grade/version fields.
- A prefilled RPE of 7 can be replaced with 7.5 in one focused edit; completing the set immediately afterward preserves 7.5 without a second tap, manual clear, or reopened keyboard.
- The PWA package is synchronized and the service-worker cache is `comprehensive-fitness-pwa-v95`.

### Files changed

- Runtime and package: `app-foundation.js`, `app-analysis.js`, `app-workout.js`, `app-views.js`, `app-import.js`, `app.js`, `index.html`, `sw.js`, and synchronized `www/` counterparts.
- Focused contracts and fixtures: `scripts/test-redesign-m1-stable-targets.js`, `tests/fixtures/redesign-m1/stable-target-migration.json`, and current-v3 backup coverage in `scripts/test-backup-contract.js` plus `tests/fixtures/redesign-m0/backup-v3-current.json`.
- Updated regressions: `scripts/test-set-prescriptions.js`, `scripts/test-active-workout-return-and-standards.js`, `scripts/test-app-integration-contracts.js`, `scripts/test-prescription-app-integration.js`, and M1-relevant Playwright specifications.
- New running-app regression: `tests/ui/redesign-m1-stable-targets.spec.js`.
- Living records: this file, `MILESTONE_LOG.md`, `../STATUS.md`, and the affected project/architecture/decision/UI/roadmap documents.

### Verification

- Focused migration/prefill/role/integration tests passed.
- M0 preservation and backup-contract tests passed unchanged.
- Full public gate passed 55/55 selected scripts (56 discovered; one private-only harness excluded).
- Static lint passed (196 JavaScript and 3,129 JSON files).
- TypeScript check passed: `npm.cmd run redesign:typecheck`.
- Production Vite build passed: `npm.cmd run redesign:build`.
- PWA/native public-only package verification passed for 40 assets.
- Public privacy guard passed across 608 tracked Git or archive project files.
- Five updated M1-relevant mobile Playwright regressions passed.
- The focused M1 running-app Playwright suite passed 3/3 at 390 × 844 and captured uncompleted, completed, RPE-replacement, and equipment-control-removed screenshots under `artifacts/ui-audit/m1/`.

### Visual decisions and assumptions

- The active-workout visual redesign remains M6. M1 changes target ownership, factual prefill, and logging authorization only.
- Current recommendation/evidence presentation remains until M2/M4 deletion gates.
- The current guided planner remains until M3; M1 removes only its global equipment-preference control and related logging constraint.
- A mobile verification case exposed two direct M1 acceptance defects: grouped display formatting made a four-digit numeric prefill empty, and the current-set options target intercepted the completion target. Numeric inputs now receive unformatted values, and current-set options occupy their own touch row.
- The required 7-to-7.5 regression exposed two additional interaction defects: the replacement handler left the original numeric selection active after the first character, and blur-driven rerender detached the completion target. RPE replacement now buffers one focused decimal edit, and completion resumes against the freshly rendered stable target.

### Remaining known issues and gates

- The repository-pinned Node 22.23.x/npm 10.9.x gate was not available; verification ran on Node 24.18.0/npm 11.16.0.
- The in-app installed PWA correctly deferred cache activation while an existing active workout remained open. Current-revision visual verification used an isolated Playwright context so the preserved draft was not canceled or submitted.
- Physical iPhone RPE replacement, notification, safe-area, and five-workout acceptance remain later milestone/human gates.
- No commit, push, merge, deployment, real personal-data migration, visual-baseline acceptance, or publication occurred.

## M2 completion record — Canonical exception resolver

**Status:** IMPLEMENTED LOCALLY; scoped independent recommendation gate approved on 2026-07-31.

The application now has one versioned current exception-action pipeline. Ordinary sessions resolve silently. Direct recorded pain/injury or illness is the sole approved live rule and wins precedence; continuing records an explicit override without blocking actual-work logging. Stable variant targets remain unchanged, active drafts/imports/submitted workouts preserve canonical actions and handling, and prospective grade/completion paths consume the persisted action rather than raw detectors.

Direct detector UI consumers, target-mutating fallbacks, duplicate recommendation writers, legacy/modern recommendation renderers, visible confidence/evidence output, Today Program pulse, Progress score/expectation output, and prospective completion coaching were removed. Legacy snapshots remain compatibility-only. Numeric fatigue, readiness, plateau, deload, grade, evidence, and confidence thresholds are not approved and cannot produce a current action.

Exit evidence is recorded in `MILESTONE_LOG.md`: 59/59 public scripts, focused M2 contracts, lint, typecheck, production build, 41-file web sync, 40-asset PWA verification, privacy scan, 2/2 mobile Playwright scenarios at 390 × 844, and independent recommendation-logic approval passed. The service-worker cache is v96. M2 is recoverable at local checkpoint `243ed81`; M3 may begin.

## M3 completion record — Planner and mesocycle deletion

**Status:** IMPLEMENTED LOCALLY on 2026-07-31; M4 is next.

The active application no longer contains a guided planner or mesocycle product. Routes/deep links, UI/state, lifecycle and storage writers, request coupling, engine construction/review/scoring branches, planner schemas, package/cache entries, CSS, and planner-only tests were deleted. Plan temporarily contains routines/templates only until the M5 shell migration.

Legacy planning data survives only at a versioned input boundary. `backup-contract.js` accepts obsolete keys, preserves workout/session/set/routine observations and immutable embedded history, and discards planner collections/linkage/settings before active import or current export. Current recommendation and workout writers emit no planner linkage, and current schemas treat historical planner fields as optional read compatibility rather than required output.

Exit evidence is recorded in `MILESTONE_LOG.md`: the focused decoder/deletion suite, 60/60 public scripts, 38/38 app-integration contracts, retained engine/recommendation suites, lint, typecheck, production build, 40-file web sync, 39-asset PWA verification, privacy scan, dependency search, and focused mobile Playwright verification at 390 × 844 passed. The service-worker cache is v97. No private or production data was mutated. M3 is recoverable at local checkpoint `3e102e2`.

## M4 completion record — Analytical and research-clutter deletion

**Status:** IMPLEMENTED LOCALLY on 2026-07-31; M5 is next.

Today and workout Start no longer compute or display hypertrophy analysis, weekly/fractional volume, program scores, research/evidence/confidence status, normal plan previews, or a duplicate recommendation. Stable named-variant targets and factual same-role prior prefills remain authoritative.

Progress is now one coherent factual destination: one per-variant performance chart with inspectable source facts plus chronological workout history. Dashboard/scorecard routes, persistent Progress modes, analytical renderers/state/actions/styles, the programming-family ledger, historical fractional-volume projection APIs, and obsolete analytical tests were deleted. Supported source history and bounded legacy identity/import/snapshot compatibility remain unchanged.

Exit evidence is recorded in `MILESTONE_LOG.md`: 58/58 public scripts, 38/38 app-integration contracts, focused M4 removal and mobile factual-Progress tests, lint, typecheck, production build, 39-file web sync, 38-asset PWA verification, tracked-file privacy scan, residue/diff checks, and populated/empty 390 × 844 visual verification passed. The service-worker cache is v98. No private or production data was mutated. M4 is recoverable at local checkpoint `576f582`.

## M5 completion record — Two-destination shell and direct Start

**Status:** IMPLEMENTED LOCALLY

Today and Progress are now the only persistent destinations. Routines and Settings are contextual secondary routes with coherent return behavior. Expected-workout Start opens the active logger directly and the logger is full-screen; readiness is optional, brief, and independently available before or during a workout.

The active-draft safety boundary remains one draft. A competing start request presents exactly Resume, Finish, and Discard; Discard requires concise confirmation, removes only the confirmed draft, and never silently begins the previously requested workout. Browser Back returns from the logger to Today without losing the draft, where Resume remains available. Bounded legacy routes land only on retained Today, Progress, Settings, routine, workout, or exercise contexts.

M5 retains exact legacy routine `reps` values. It removes visible writers for obsolete settings; legacy planner settings such as training goal, nutrition phase, and experience level continue to decode then discard before active import or current export and are not preserved as current backup settings. The M4 identity-only boot correction found during M5 means normal boot requests only the exercise identity catalog; the relationship map remains import-validation-only. Neither correction restores analytics, evidence UI, or a second recommendation authority.

Focused M5 mobile evidence passed 5/5. Identity/compatibility coverage passed 65/65 and 13/13 on mobile plus 2/2 desktop compatibility boundaries. Strict target regressions passed 2/2, and the readiness-dismissal/custom-exercise-render regressions passed 2/2 after their production fixes. One clean approved public-suite run passed 60/60. Lint (202 JavaScript/3,118 JSON/0 inline), typecheck, 33-check PWA verification, 24-module approved Vite build, 646-file privacy check, and nine inspected screenshots passed. No production/private data migration or mutation occurred.

M5 is implemented locally. It is not published or independently accepted: pinned-runtime/device and human acceptance, independent migration verification, and all publication gates remain outside this local record.

The recoverable M5 implementation checkpoint is `ef71085`.

## M6 completion record — Simplified active workout

**Status:** IMPLEMENTED LOCALLY

The full-screen logger now centers each complete exercise/variant name, one stable target summary, comparable prior facts, and fast load/repetitions/RPE entry. Prior performance is restricted to the same stable performance identity and comparable set role. Current, completed, pending, and skipped set states remain explicit, and warm-ups remain excluded from progression-qualifying comparisons.

Normal substitution and named custom variants preserve independent identities, completed source facts, unfinished set order, and auditable multi-hop provenance. New exercise entry requires the approved stable targets. All workout edits remain workout-only by default; routine mutation is a separate explicit action. The completed workout, rather than the original prescription, remains the factual source of truth.

Rest now has one shared starter that appears only after a completed non-skipped set and one recoverable timer surface with remaining time, adjustment, Skip/Finish, overtime, reload recovery, and notification-permission fallback. Timer authorization independently rejects incomplete/skipped sources. Active drafts and imports use strict, atomic runtime validation for their nested numeric, text, enumeration, role, and count domains.

The plate calculator, live/completion execution-quality questionnaire and writers, controlled-execution badge, duplicate timer starters, active equipment/exclusion logging blocks, and obsolete generic execution-block transient are gone. Submitted historical execution-quality and equipment/exclusion snapshot facts remain immutable compatibility data only.

Exit evidence is recorded in `MILESTONE_LOG.md`: 61/61 public scripts, 38/38 integration contracts, focused M6 static checks, 13/13 mobile Playwright cases at 390 x 844, lint, typecheck, workflows, a 24-module production build, 33-asset PWA verification, a 644-file privacy scan, public research/archive integrity, root/`www` parity, three inspected screenshots, and the post-correction independent gate passed. No private or production data was migrated or mutated.

No M6 transition flag was introduced. Physical-device RPE keyboard behavior, OS suspension, and notification delivery remain explicit external target-device gates; browser/mobile/PWA behavior is locally proven.

The recoverable M6 implementation checkpoint is `441b6cb`.

## M7 completion record — Versioned actual-work grade and factual Progress

**Status:** COMPLETE — IMPLEMENTED LOCALLY

The implementation replaces the live adherence/plan grade with one prospective A-F `comprehensive-fitness-workout-grade/2.0.0` record using algorithm `actual-work-rubric/1.0.0`. It preserves legacy grade values/versions without boot, render, import, or history-edit recomputation. Completion is limited to the approved grade/reasons/highlights/exception/actions, while Progress uses exact variant, resistance type, comparable working-set role, normalized display units, and inspectable raw source facts across all submitted history.

Focused contracts, the effective 62/62 public gate, lint, typecheck, production build, workflow/privacy/package verification, root/`www` parity, 4/4 mobile M7, 4/4 desktop M7, and the consolidated 8/8 affected mobile regression gate pass. Fresh 390 × 844 screenshots were inspected. Independent review found and verified corrections for action-handling semantics, exact action scope, mixed units, same-name resistance variants, source provenance, high-repetition estimate bounds, semantic heading structure, and no-highlight Progress context.

The external dependency audit could not reach the npm registry under the environment policy; M7 changes no package metadata and local package/build/runtime gates pass. Pinned Node 22.23.x/npm 10.9.x and physical-device acceptance remain unverified external gates. M8 may begin only after the recoverable M7 checkpoint is recorded.

## 5. Temporary structure ledger

| Artifact | Introduced | Purpose | Delete gate |
| --- | --- | --- | --- |
| `schemas/redesign-*.schema.json` | M0 | Target contract definitions | Retain only schemas consumed by final runtime/compatibility; remove planning-only drafts at M8 |
| `tests/fixtures/redesign-m0/` | M0 | Synthetic preservation/migration evidence | Permanent regression evidence unless superseded by versioned fixtures |
| M1 normal-target comparison | M1 | Detect unintended target changes | Delete at M1 exit |
| M2 detector shadow adapters | M2 | Compare canonical resolver with legacy behavior | Delete at M2 exit |
| M3 legacy mesocycle decoder | M3 | Import old backups without active mesocycle state | Retain isolated decoder while supported legacy backups require it |
| M4 removed-compute instrumentation | M4 | Prove Today/Start work is gone | Delete at M4 exit |
| M5 legacy route redirects | M5 | Bounded navigation compatibility | Delete after documented redirect window, no later than M8 |
| M6 UI migration flag | M6 | Not introduced; the active logger migrated atomically | Satisfied at M6 exit |
| M7 grade comparison | M7 | Verify prospective grade change | Delete at M7 exit |

No unnamed or ownerless feature flag is allowed.

## 6. Verification progression

- **M0:** focused preservation test, backup/domain/runtime persistence tests, public test discovery.
- **M1-M2:** focused unit/contract suites, recommendation evals, backup/draft regressions, public gate.
- **M3-M5:** full public tests, lint, PWA verification, Playwright navigation/critical flows, root/`www` parity.
- **M6-M7:** full public/release-local gates, accessibility/visual review without baseline acceptance, target-device RPE/timer/notification checks.
- **M8:** release verification, privacy review, migration verifier, independent Claude final audit, then Erik’s five-workout field test.

Private-data validation may run locally only when required and available; its records never enter public artifacts.

## 7. Completion states

- **Milestone implemented locally:** code/tests/docs for that milestone pass focused gates.
- **Milestone review-ready:** preservation/privacy/independent evidence required for that milestone is complete.
- **Redesign review-ready:** all M0-M8 gates are complete, with external/device/human gaps explicitly named.
- **Approved for publication:** requires Erik’s separate authorization of a named revision after all acceptance gates.
