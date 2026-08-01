# Redesign status

- **Product:** Comprehensive Fitness
- **Primary owner:** Codex
- **Independent reviewer:** Claude Code at the required checkpoints
- **Branch:** `codex/zero-based-redesign`
- **Current phase:** M8 implemented and verified locally; independent/external acceptance pending
- **Implementation authority:** Local implementation and recoverable checkpoints only

## Product authority

- `final/FINAL_REDESIGN_PRD.md`
- `final/FINAL_FEATURE_DISPOSITION.md`
- `final/RECOMMENDATION_ENGINE_CONTRACT.md`
- `final/MIGRATION_AND_ACCEPTANCE_PLAN.md`
- `audits/ADJUDICATION_MATRIX.md`

Implementation clarifications and successor decisions are recorded in `DECISION_LOG.md`. Final product scope has not been reopened.

## Recoverable milestones

| Milestone | Status | Implementation checkpoint |
| --- | --- | --- |
| M0 | Complete locally | `3e24f93` |
| M1 | Complete locally | `2101e19` |
| M2 | Complete locally | `243ed81` |
| M3 | Complete locally | `3e102e2` |
| M4 | Complete locally | `576f582` |
| M5 | Complete locally | `ef71085` |
| M6 | Complete locally | `441b6cb` |
| M7 | Complete locally | `0223b36` |
| M8 | Complete locally | `10d3bb2` |

Associated documentation checkpoints and detailed evidence are in `implementation/MILESTONE_LOG.md`.

## Current verified product boundary

- Today and Progress are the only persistent destinations.
- Routines and Settings are contextual.
- Active workout is full-screen.
- The presentation is fixed light; theme/color-package settings are removed.
- Start is direct and readiness is optional.
- Stable named-variant targets and comparable prior facts drive normal logging.
- Direct explicit pain/injury or illness is the only live exception rule.
- Numeric fatigue, readiness, plateau, and deload detectors are not active.
- Meaningfully poor readiness is retained as a factual input but produces no current action by itself.
- Workout upload/cloud copy is removed; notification delivery and bounded legacy remote deletion remain.
- New submissions use grade contract v2 with prospective algorithm `actual-work-rubric/1.1.0`; stored earlier grades remain unchanged.
- Top-level retired global planner/evidence collections are discarded at compatibility decode. Embedded submitted snapshots and owning-workout actions/handling/overrides remain immutable.

## M8 implemented result

- Concept-only React/Vite application, prototype tests/configuration, and unused dependencies removed.
- Deleted-product assets, schemas, scripts, tests, routes, state, writers, and cache references were removed or reconciled.
- Current Settings, notification, import, backup, submission, grade, clear-data, and legacy compatibility boundaries are covered by final local tests.
- Living documentation now describes the fixed-light two-destination product and current data/service boundaries.
- Root, `www/`, service-worker, Android, and iOS public assets were synchronized from the same verified source state.

This is a local implementation result, not a publication or physical-device acceptance claim.

## Verification evidence available

- Focused M0-M7 contracts and their milestone browser evidence are recorded.
- The public Node gate passed effectively 51/51: 49 passed in the aggregate run and two unchanged research determinism tests passed when rerun outside the sandbox after sandboxed Git child-process creation returned `EPERM`.
- The private local harness passed 2/2 with 59 artifact checks and one preserved-source warning.
- Static lint passed 192 JavaScript and 3,112 JSON files; type checking is not applicable because no TypeScript source or `tsconfig` remains.
- Workflow validation, package-tree integrity, native-package privacy, staged/tracked privacy, PWA packaging, and dependency gates passed. The full dependency tree has three moderate development-only advisories, no high/critical advisories, and the production tree has zero advisories.
- Final mobile Playwright evidence is 144 passed and 15 configured skips. Final desktop evidence is 141 passed and 18 configured skips. The documentation sentinel that ran during the concurrent documentation rewrite was repaired and then passed 2/2 across mobile and desktop.
- `sync:web` and PWA verification passed for 26 public assets. Capacitor synchronized Android and iOS; Windows could not run CocoaPods or `xcodebuild`.
- Recoverable implementation checkpoint: `10d3bb2`.

## Exact next action

Finish `audits/CODEX_FINAL_SELF_AUDIT.md`, create the documentation checkpoint, obtain the current independent release review, and give Claude Code the final acceptance packet. Do not merge, push, deploy, mutate production data, or accept visual baselines.

## Open gates

- Final migration, recommendation, accessibility, visual, security/privacy, architecture, and release-readiness review.
- Pinned Node 22.23.x/npm 10.9.x rerun.
- Physical-device keyboard, background/suspension, notification, sound/vibration, and installed-PWA behavior.
- Representative real-data migration replay and owner acceptance.
- Current hosted backend/deployment verification.
- Five-workout field test.
- Owner visual-baseline acceptance.

## Protected working tree

Pre-existing untracked `.claude/`, `.vercel/`, and `redesign/prompts/` directories remain user-owned and outside redesign staging. No private personal fitness/health data or production data is authorized for mutation or publication.

## Publication state

Commit checkpoints are locally authorized by the continuous implementation assignment. Merge, push, deploy, production-data mutation, baseline acceptance, and publication are not authorized or completed.
