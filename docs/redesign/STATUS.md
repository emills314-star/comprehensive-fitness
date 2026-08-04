# Redesign status

- **Product:** Comprehensive Fitness
- **Primary owner:** Codex
- **Independent reviewer:** Claude Code at the required checkpoints
- **Branch:** `codex/zero-based-redesign`
- **Current phase:** Corrective candidate verified locally; immutable freeze and Claude corrective review pending
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
| M8 | Complete locally; corrective candidate is uncommitted | `10d3bb2`, prior correction `90934ef`, current commit pending owner authorization |

Associated documentation checkpoints and detailed evidence are in `implementation/MILESTONE_LOG.md`. The final documentation reconciliation and Codex self-audit checkpoint is `acb1b02`.

## Current verified product boundary

- Today and Progress are the only persistent destinations.
- Routines and Settings are contextual.
- Active workout is full-screen.
- The presentation is fixed light; theme/color-package settings are removed.
- Start is direct and readiness is optional.
- Optional readiness includes compact unusual-soreness capture before or during the workout; it remains silent and non-blocking.
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
- The 2026-08-02 corrective public Node gate passed 51/51 selected scripts in one permitted run.
- The private local harness passed 2/2 with 59 artifact checks and one preserved-source warning.
- Static lint passed 192 JavaScript and 3,112 JSON files; type checking is not applicable because no TypeScript source or `tsconfig` remains.
- Workflow validation, package-tree integrity, native-package privacy, staged/tracked privacy, PWA packaging, and dependency gates passed. The full dependency tree has three moderate development-only advisories, no high/critical advisories, and the production tree has zero advisories.
- Corrective mobile Playwright reproduced at 146 passed, 15 configured skips, and zero failures. Corrective desktop is **NEEDS REVIEW**: Claude reproduced 142 passed/1 failed/18 skipped and, on a clean rerun, 141 passed/2 failed/18 skipped. The three distinct failures pass in isolation (6/6 and 30/30) and are assessed as pre-existing contention/race-sensitive test-design defects rather than regressions from the corrections.
- `sync:web` and PWA verification passed for 26 public assets. Capacitor synchronized Android and iOS; Windows could not run CocoaPods or `xcodebuild`.
- Recoverable implementation checkpoint: `10d3bb2`.
- The current corrective working tree changes the soreness empty label to `Not recorded` while retaining readiness `Not entered`, refreshes Current focus after set completion, and adds three-set advancement/reload coverage. Root/`www` parity and PWA cache v103 pass.
- **NEEDS REVIEW:** the corrective evidence ran on Node 24.18.0/npm 11.16.0 rather than the required Node 22.23.x/npm 10.9.x, and no immutable candidate commit exists.

## Exact next action

Claude’s original final acceptance audit and corrective verification were intentionally returned in conversation rather than stored in the repository. Their absence from `docs/redesign/audits/` is not a missing-artifact defect; persistence is an owner decision. After explicit owner authorization, create the immutable candidate commit from exactly the named 15 files and rerun the decisive gates against it. Stop before physical-device, protected migration, hosted, field-test, merge, push, deployment, baseline acceptance, or publication work.

## Open gates

- Final migration, recommendation, accessibility, visual, security/privacy, architecture, and release-readiness review.
- Pinned Node 22.23.x/npm 10.9.x rerun.
- Owner-authorized immutable candidate commit and exact-commit rerun.
- Fresh unqualified Claude acceptance naming the exact candidate commit.
- Physical-device keyboard, background/suspension, notification, sound/vibration, and installed-PWA behavior.
- Representative real-data migration replay and owner acceptance.
- Current hosted backend/deployment verification.
- Five-workout field test.
- Owner visual-baseline acceptance.

## Protected working tree

Pre-existing untracked `.claude/`, `.vercel/`, and `redesign/prompts/` directories remain user-owned and outside redesign staging. No private personal fitness/health data or production data is authorized for mutation or publication.

## Publication state

No corrective candidate commit is authorized by the current task. Commit, merge, push, deploy, production-data mutation, baseline acceptance, and publication are not authorized or completed.
