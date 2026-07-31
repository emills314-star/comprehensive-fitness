# Redesign Decision Log

Record decisions here only after reviewing relevant product evidence, repository evidence, and material audit findings. Do not duplicate full specifications; link to the authoritative section and state the decision, rationale, and consequence.

## D-001 — Codex is the primary orchestrator

**Status:** Accepted  
**Decision:** Codex owns project organization, repository mapping, product-specification maintenance, audit adjudication, implementation planning, implementation, verification, and status tracking.  
**Rationale:** Keeping the primary agent inside the repository reduces context drift and keeps code, tests, documentation, and implementation decisions in one durable workspace.  
**Consequence:** Chat transcripts are not authoritative. All durable outputs must be committed as repository files.

## D-002 — Claude remains an independent adversarial reviewer

**Status:** Accepted  
**Decision:** Claude Code is used for read-only adversarial audits after Phase 1 and after implementation.  
**Rationale:** An independent model can challenge Codex's assumptions, identify hidden coupling, and detect cases where complexity was hidden rather than removed.  
**Consequence:** Claude reports are advisory evidence. Codex must explicitly adjudicate material findings before changing product scope or implementation plans.

## D-003 — Preserve the existing CLAUDE.md

**Status:** Accepted  
**Decision:** The existing root `CLAUDE.md` remains in place and is not replaced by the redesign package.  
**Rationale:** It may contain established repository conventions, commands, architecture guidance, and prior project knowledge.  
**Consequence:** Codex must inspect it before proposing any additive redesign section. Any edit must be minimal, reviewed, and preserve existing content.

## D-004 — Product name and repository path

**Status:** Accepted  
**Decision:** The product name is **Comprehensive Fitness**. The local repository root is `C:\Users\Erik Mills\Documents\Comprehensive Fitness`.  
**Consequence:** New artifacts, headings, prompts, and references must use Comprehensive Fitness, not Finns.

## D-005 — Established repository instructions remain authoritative

**Status:** Accepted  
**Decision:** The tracked root `AGENTS.md` and `CLAUDE.md` predate the redesign package and remain the repository instruction sources. The redesign does not replace, duplicate, or reorganize them.  
**Rationale:** Git history confirms both are established guidance. `CLAUDE.md` already directs Claude to `AGENTS.md`, and the audit prompt makes the redesign packet discoverable. No conflict requires a merge.  
**Consequence:** Neither file changes during bootstrap. Any later pointer must be strictly additive and justified by a demonstrated discoverability failure.

## D-006 — Phase 1 and current-state sources have different roles

**Status:** Accepted  
**Decision:** Phase 1 defines proposed redesign intent. Existing code, schemas, tests, and living documents remain evidence of current behavior and migration constraints, not vetoes over the proposal.  
**Rationale:** Current implementation materially differs from Phase 1 in navigation, readiness/start flow, planning, recommendation presentation, analytics, and equipment rules. Treating either side as proof of the other would silently adjudicate before independent review.  
**Consequence:** The Claude audit must cite proposal and current-state evidence. Codex adjudicates conflicts only after the audit.

## D-007 — Bootstrap preserves the existing branch

**Status:** Accepted  
**Decision:** This run records but does not create or switch branches.  
**Rationale:** The repository already contains uncommitted user work, and branch mutation is unnecessary for a read-only audit.  
**Consequence:** The audit begins from `codex/chromium-ui-repair` unless the owner changes repository state. Claude must report any difference at audit start.

## D-008 — Claude audit evidence standard

**Status:** Accepted  
**Decision:** The Phase 1 Claude checkpoint is read-only and must provide exact file-path and line evidence, distinguish implemented behavior from intent, and identify data/migration dependencies for deletion proposals.  
**Rationale:** The repository contains coupled classic-script runtime segments, persisted historical contracts, generated packages, and extensive legacy documentation. High-level opinion is insufficient for safe adjudication.  
**Consequence:** `audits/CLAUDE_CODEBASE_AUDIT_REQUEST.md` is the complete packet. Findings remain advisory until Codex records adjudications.

## D-009 - Final adjudication supersedes Phase 1 product intent

**Status:** Accepted  
**Decision:** `final/FINAL_REDESIGN_PRD.md`, `final/FINAL_FEATURE_DISPOSITION.md`, `final/RECOMMENDATION_ENGINE_CONTRACT.md`, and `final/MIGRATION_AND_ACCEPTANCE_PLAN.md` are the final redesign product-intent authority. Phase 1 remains a proposal record and the Claude audit remains advisory evidence.  
**Rationale:** Every Claude finding and all 137 Phase 1 feature rows were independently adjudicated in `audits/ADJUDICATION_MATRIX.md` using Erik's behavior and simplest reliable product as the highest authority.  
**Consequence:** Implementation may not silently choose Phase 1, Claude's preferred remedy, or current code when they conflict with the final package.

## D-010 - Comprehensive Fitness is a logger with a quiet spotter

**Status:** Accepted  
**Decision:** The permanent product has two persistent destinations, Today and Progress. It prioritizes direct start, stable targets, prior performance, fast set logging, rest timing, actual-workout overrides, concise completion, and exercise/workout history.  
**Rationale:** These capabilities serve Erik's demonstrated workout behavior. Persistent planning, dashboards, research presentation, and routine coaching add decisions without improving the core job.  
**Consequence:** No Dashboard, Plan, More, Insights, Advanced, or persistent Routines destination survives or may become a graveyard for deleted features.

## D-011 - Stable variant targets replace normal prescription mutation

**Status:** Accepted  
**Decision:** The named exercise variant owns normal set count, rep range, target RPE, and rest. Exact normal add-rep, add-load, add-set, hold, and automatic rep-range rewriting are deleted from current permanent scope.  
**Rationale:** Erik relies on stable heavy/light/custom intent and generally uses his own judgment for normal progression. Silent mutation creates mistrust and is not justified by existing engine effort.  
**Consequence:** Factual prior-set/routine defaults may prefill inputs; the recommendation engine cannot become a second normal prescription through prefill, completion copy, grade logic, or another label.

## D-012 - One canonical resolver owns exception advice

**Status:** Accepted  
**Decision:** Fatigue, readiness, plateau, deload, and pain/illness detectors are candidate producers only. One versioned resolver qualifies, arbitrates, persists, and presents at most one session action and one materially stricter exercise action.  
**Rationale:** Current producers differ in scope and cadence and have no canonical arbitration. Multiple cards or direct consumers would preserve contradictory product behavior.  
**Consequence:** Precedence is pain/illness, session/full deload, stricter coherent readiness-or-fatigue action, plateau, then silence. Existing thresholds remain unapproved until evaluation.

## D-013 - Historical preservation is distinct from active product state

**Status:** Accepted  
**Decision:** Completed workouts, observations, identity, order, duration, notes, readiness/rest facts, import provenance, immutable snapshots, historical grades, and historical execution-quality values are preserved. Deleted concepts receive no active writer, renderer, route, recomputation, or new record creation.  
**Rationale:** Data integrity is higher authority than migration convenience, while preserving source records does not justify preserving an old interface or engine.  
**Consequence:** Isolated versioned compatibility decoders may remain. Hidden active domains and compatibility writers may not.

## D-014 - Mesocycle and equipment removal is cross-layer

**Status:** Accepted  
**Decision:** Mesocycle planning/lifecycle and global equipment constraints are permanently removed from active product scope across UI, requests, engine, state, schemas for new records, tests, caches, and current-intent docs.  
**Rationale:** Mesocycle management has no demonstrated user value, and global equipment state can actively prevent logging actual work. Their technical coupling affects sequencing only.  
**Consequence:** Legacy backups remain importable while planning-only keys are accepted/ignored or mapped to preserved workout/routine facts. Equipment may remain descriptive metadata but cannot block logging.

## D-015 - One actual-work grade replaces overlapping scores

**Status:** Accepted  
**Decision:** Keep one versioned A-F grade based on actual completed work, logging validity, comparable progress, effort coherence, and handling of an active exception. Delete adherence scoring, hypertrophy scores, confidence presentation, and the execution-quality questionnaire for new workouts.  
**Rationale:** Erik values a grade and progress recognition, not punishment for legitimate substitutions or adaptive training and not multiple opaque scores.  
**Consequence:** Preserve stored historical grade values/versions and historical questionnaire answers. Do not silently regrade history or retain the current formula by assumption.

## D-016 - Final documents do not authorize implementation or publication

**Status:** Accepted  
**Decision:** This adjudication stops at final documents and checks. Implementation, data migration, baselines, commit, push, merge, deployment, and publication require separate authorization and their applicable gates.  
**Rationale:** Product approval, implementation completion, human acceptance, and publication are different states.  
**Consequence:** Target-device RPE/notification behavior, engine thresholds, migration verification, privacy review, independent review, and Erik's five-workout field test remain unverified gates.

## D-017 - Redesign implementation uses a dedicated local branch and milestone checkpoints

**Status:** Accepted  
**Decision:** Continuous implementation proceeds on `codex/zero-based-redesign` with recoverable local commits at verified milestone boundaries.  
**Rationale:** The full redesign spans destructive cross-layer deletion and requires reviewable rollback points without altering the existing `codex/chromium-ui-repair` branch or its remote.  
**Consequence:** Checkpoint commits are local only. Merge, push, deployment, production-data migration, and publication remain unauthorized.

## D-018 - Current app-data v3 requires an executable backup-v3 path

**Status:** Accepted  
**Decision:** Backup schema v3 is the export contract for current app-data v3; backup schema v2 remains an isolated compatibility envelope for app-data v1/v2 imports. Stored historical grade values and versions are source observations and remain importable.  
**Rationale:** M1 normalized active state to app-data v3 while the old executable backup contract accepted only v1/v2, which would prevent the required complete pre-migration export and could drop legacy grade attribution at strict import.  
**Consequence:** Backup/app-data version pairings are validated, current v3 round-trips are covered by a synthetic fixture, and later deletion cannot remove the legacy reader until the migration acceptance gate passes.
