# Redesign Status

**Product:** Comprehensive Fitness  
**Primary owner:** Codex  
**Adversarial reviewer:** Claude Code  
**Current phase:** Implementation active on `codex/zero-based-redesign`; M0 preservation and M1 stable-target/logging-integrity gates complete locally  
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

## Current objective

M0 through M2 are complete and recoverable. M2 is checkpointed at `243ed81`. M3 planner/mesocycle deletion is next.

## Next actions

1. Begin M3 planner/mesocycle deletion without reactivating legacy recommendation paths.
2. Continue through M3–M8 with code, tests, living docs, and deletion evidence integrated per milestone.
3. Automated, privacy, migration, independent, target-device, and five-workout human acceptance gates precede any separately authorized publication.

## Open issues

- Target-device RPE replacement/completion behavior is **NEEDS REVIEW**; source code intent does not resolve Erik's reported device experience.
- Current numeric fatigue, readiness, plateau, deload, evidence, confidence, and grade thresholds/formulas are not approved. M2 prevents them from producing current actions; M4/M7 remove remaining hidden analysis and legacy grade debt.
- Target migration contracts and synthetic baselines exist; M1 runtime normalization is implemented, but a complete real-data export/replay and independent migration verification remain unperformed.
- Focused browser/PWA/accessibility verification passed for M1; physical-device, notification, performance, privacy, independent-review, pinned-runtime, and five-workout acceptance gates remain unverified.
- M3–M8 product behavior remains incomplete. Guided planner/mesocycle systems persist only until M3; hidden analytics/research and legacy grade/UI debt remain assigned to M4/M7.
- Pre-existing uncommitted `.claude/`, `.vercel/`, `docs/redesign/`, and `redesign/prompts/` paths must remain preserved.
- Current code and living docs differ materially from final product intent. They remain accurate as current-state evidence until an authorized implementation updates behavior and documentation together.
- Local implementation is authorized. Commit, push, merge, deployment, real-data migration, baseline acceptance, and publication are not authorized or completed.

## Last verification

M1 completed locally by Codex on 2026-07-31. All 55 selected public scripts passed; lint, typecheck, production build, PWA/native packaging, and focused 390 × 844 visual/touch verification passed. Checkpoint review then closed current-v3 backup compatibility and the required one-edit decimal RPE path; the focused suite passed 3/3 and service-worker cache v95 was produced. No dependency, `AGENTS.md`, `CLAUDE.md`, private personal fitness/health data, deployment, or publication change occurred.
