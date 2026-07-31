# Redesign Status

**Product:** Comprehensive Fitness  
**Primary owner:** Codex  
**Adversarial reviewer:** Claude Code  
**Current phase:** Implementation active on `codex/zero-based-redesign`; M0–M6 gates complete locally
**Implementation authorized:** Yes — local implementation only

## Completed

- Zero-based user-behavior diagnosis completed.
- Phase 1 product-definition package created.
- Phase 1 files renamed and corrected to Comprehensive Fitness.
- Codex-first governance structure prepared.
- Git root, branch, upstream, and pre-existing uncommitted work inspected.
- Established root `AGENTS.md` and `CLAUDE.md` read in full and preserved.
- Phase 1 and current architecture, decision-engine, UI/UX, persistence, import, notification, deployment, and verification documentation reviewed.
- Current implementation areas mapped without changing application code.
- The four authoritative Phase 1 files contain no stale Finns reference.
- `audits/CLAUDE_CODEBASE_AUDIT_REQUEST.md` prepared with evidence and read-only requirements.
- Claude's adversarial codebase audit received and treated as advisory evidence.
- Claude's 9 primary objections, 8 questions, 14 current-map claims, supplementary findings, and evidence gaps independently adjudicated.
- All 137 Phase 1 feature rows accounted for in `audits/ADJUDICATION_MATRIX.md`.
- Final product, feature, recommendation-engine, migration, and acceptance contracts created under `final/`.
- Relevant current product, architecture, decision-engine, UI/UX, roadmap, and training-prescription documentation reviewed as implemented-state evidence.
- Five focused current-state contract tests run and passed; none is represented as redesign acceptance evidence.
- Erik separately authorized Codex to resume as implementation planner and executor.
- `implementation/IMPLEMENTATION_EXECPLAN.md` and `implementation/MILESTONE_LOG.md` created.
- M0 target app-data, backup, active-draft, resolved-action, and workout-grade contracts versioned as non-runtime schemas.
- Privacy-safe synthetic fixtures added for supported legacy backup versions, mesocycle/equipment compatibility, historical snapshots/grades/execution quality, set-role provenance, and active-draft recovery.
- M0 preservation, backup, domain-integrity, and runtime-persistence focused tests passed.
- The public test discovery gate passed all 54 selected scripts and includes the new M0 preservation suite.
- M1 made named exercise-variant set count, role, rep range, target RPE, and rest explicit stable routine facts.
- Normal recommendation set/load/rep outputs no longer mutate stable routine targets or prefill editable workout inputs.
- Factual input prefill now resolves same variant and same set role first, then explicit routine defaults, then blank.
- Legacy global equipment preferences are decoded/discarded; their UI writers, normal-path readers, and logging blocks are removed.
- M1 preserved workout history, active drafts, submitted snapshots, roles, IDs, variant identity, and legacy planner records.
- The M1 migration/role/variant/equipment suite, all 55 selected public scripts, lint, typecheck, production build, PWA verification, and affected mobile regressions passed.
- Current-build running-app verification passed at 390 × 844 for long names, large values, uncompleted/completed touch states, and deleted equipment controls; concrete screenshots are under `artifacts/ui-audit/m1/`.
- Current app-data v3 now has a working backup-v3 export/import path; legacy backup versions remain readable and stored historical grade/version values survive strict import.
- The required prefilled-RPE interaction was reproduced and corrected: one focused `7.5` entry replaces `7`, persists, and can be completed immediately without a lost touch.
- M0 is recoverable at local checkpoint `3e24f93` (`chore(redesign): establish preservation baseline`).
- M1 is recoverable at local checkpoint `2101e19` (`feat(redesign): stabilize workout targets and logging`).
- M2 establishes one versioned canonical exception resolver and persists resolved actions plus user handling through active drafts, imports, and submitted workouts.
- Ordinary sessions are silent. Direct recorded pain/injury or illness is the only independently approved live rule; it produces one advisory session action and never blocks actual-work logging.
- Numeric fatigue, readiness, plateau, deload, grade, evidence, and confidence thresholds remain out of scope and cannot create a current action.
- Direct detector UI consumers, legacy recommendation renderers/writers, target-mutating fallbacks, visible confidence/evidence paths, Today Program pulse, Progress score/expectation output, and completion coaching were removed.
- M2 focused contracts, 59/59 public scripts, lint, typecheck, production build, 41-file web sync, 40-asset PWA verification, privacy scan, and 2/2 mobile Playwright scenarios passed. Independent recommendation review approved the scoped M2 gate.
- M3 deleted the guided planner and mesocycle product across routes/UI/state, requests, engine branches, schemas for new records, writers, CSS, tests, service-worker/package entries, and current-intent documentation.
- A versioned legacy decoder now accepts obsolete planning keys, preserves workout/session/set/routine facts and immutable embedded snapshots, and discards planner-only state before active import or current export.
- M3 focused preservation/deletion tests, 60/60 public scripts, lint, typecheck, production build, 40-file web sync, 39-asset PWA verification, privacy scan, dependency search, and mobile running-app verification at 390 × 844 passed.
- M4 removed Today/Start hypertrophy, weekly/fractional volume, program score, research/evidence/confidence, normal plan-preview, and duplicate-recommendation execution paths.
- Progress is one factual destination with one inspectable per-variant performance chart and chronological workout history; dashboard/scorecard routes and persistent Progress subviews are gone.
- The programming-family ledger, historical fractional-volume projection APIs, obsolete analytical renderers/state/actions/styles, and obsolete analytical tests were deleted without changing stored workout history.
- M4 focused removal and 390 × 844 populated/empty Progress tests, 58/58 public scripts, 38/38 app-integration contracts, lint, typecheck, production build, 39-file web sync, 38-asset PWA verification, tracked-file privacy scan, and visual inspection passed.

- M5 installed exactly two persistent destinations, Today and Progress; Routines and Settings are contextual routes with explicit return behavior.
- Expected-workout Start now opens the full-screen logger directly. Readiness is optional and independently available before or during a workout.
- A competing start request offers exactly Resume, Finish, or Discard. Discard requires confirmation and never silently replaces or starts over an active draft.
- M5 retained exact legacy routine `reps`; it has no visible writer for removed settings. Obsolete planner settings, including training goal, nutrition phase, and experience level, remain decode/discard-only before active import or current export.
- A bounded identity-only boot correction keeps normal boot to the identity catalog and reserves the relationship map for import validation.
- M5 focused mobile checks passed 5/5, identity/compatibility mobile checks passed 65/65 plus 13/13, desktop compatibility checks passed 2/2, strict target regressions passed 2/2, readiness dismissal and custom-exercise rendering regressions passed 2/2, and one clean approved public-suite run passed 60/60. Lint, typecheck, 33 PWA checks, approved 24-module Vite build, 646-file privacy scan, and nine screenshot inspections passed.
- M6 simplified the active logger around full variant names, stable targets, role-comparable prior facts, fast load/repetitions/RPE entry, explicit set states, workout-only overrides, and one recoverable rest surface.
- Normal and custom substitutions retain independent performance identities, completed source facts, unfinished order, and multi-hop provenance. Saving a current-workout change to the routine is a separate explicit action.
- Plate-calculator UI/state, live/completion execution-quality UI and writers, the controlled-execution badge, duplicate rest starters, and active equipment/exclusion logging blocks were removed. Historical submitted compatibility facts remain readable and immutable.
- Active-draft and import validation is strict and atomic at runtime. Invalid candidates cannot partially mutate durable or in-memory state.
- M6 focused static checks, 61/61 public scripts, 38/38 integration contracts, 13/13 mobile Playwright scenarios, lint, typecheck, workflows, a 24-module production build, 33-asset PWA verification, a 644-file privacy scan, public archive/workbook integrity, root/`www` parity, three inspected 390 x 844 screenshots, and the post-correction independent review passed.

## Current objective

M0 through M6 are complete locally. M2 is checkpointed at `243ed81`; M3 is checkpointed at `3e102e2`; M4 is checkpointed at `576f582`; M5 is checkpointed at `ef71085`; the M6 checkpoint is being recorded after documentation closeout.

## Next actions

1. Create and record the recoverable M6 checkpoint.
2. Re-read the M7 authoritative grade, completion, and progress scope against the M6 implementation state.
3. Implement only M7 without reactivating deleted scoring, adherence, planner, dashboard, or recommendation paths.
4. Automated, privacy, migration, independent, target-device, and five-workout human acceptance gates precede any separately authorized publication.

## Open issues

- Target-device RPE replacement/completion behavior remains **NEEDS REVIEW**. Browser/mobile automation proves one-edit 7-to-7.5 replacement and immediate completion, but physical-device keyboard behavior is not locally provable.
- Current numeric fatigue, readiness, plateau, deload, evidence, confidence, and grade thresholds/formulas are not approved. M2 prevents them from producing current actions; M4 removed the normal analytical product paths, while M7 owns remaining legacy grade debt.
- Target migration contracts and synthetic baselines exist; M1 runtime normalization is implemented, but a complete real-data export/replay and independent migration verification remain unperformed.
- Focused browser/PWA/accessibility verification passed through M6; physical-device notification delivery, true OS suspension, pinned-runtime, full independent migration review, and five-workout acceptance remain unverified.
- M7–M8 product behavior remains incomplete; legacy grade/completion debt remains assigned to M7.
- Two broader Strong-history browser assertions disagree with current shared-runtime copy/prior-row resolution; they were not caused by M3 planner-field deletion and remain separately reproducible.
- Pre-existing uncommitted `.claude/`, `.vercel/`, and `redesign/prompts/` paths must remain preserved.
- Current code and living docs differ materially from final product intent. They remain accurate as current-state evidence until an authorized implementation updates behavior and documentation together.
- Local implementation is authorized. Commit, push, merge, deployment, real-data migration, baseline acceptance, and publication are not authorized or completed.

## Last verification

M6 completed locally on 2026-07-31: focused M6 mobile 13/13 at 390 x 844; public suite 61/61; app integration 38/38; lint, typecheck, workflows, 33 PWA checks, approved 24-module Vite build, 644-file privacy scan, archive/workbook integrity, runtime-package parity, and three screenshot inspections passed. Physical-device RPE/background/notification behavior remains an external gate. No private personal fitness/health data, production-data migration, deployment, or publication occurred.
