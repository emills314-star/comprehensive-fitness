# Codex Orchestrator Bootstrap Prompt

Paste the prompt below into a new Codex chat opened at the repository root.

---

You are taking over as the primary orchestrator for the zero-based redesign of **Comprehensive Fitness**.

Repository root:

`C:\Users\Erik Mills\Documents\Comprehensive Fitness`

This is an organization, repository-orientation, and audit-preparation task. **Do not change application behavior or implementation code in this run.**

## Operating roles

- Codex is the primary owner of project organization, product-document maintenance, repository mapping, audit adjudication, implementation planning, implementation, and verification.
- Claude Code remains an independent adversarial reviewer at two checkpoints: after Phase 1 and after implementation.
- Claude reports are advisory evidence. You must adjudicate them and record decisions; Claude does not directly set product scope or implement changes during audits.

## Required first reads

1. Root `AGENTS.md`.
2. Root `CLAUDE.md` in full. Preserve it; do not overwrite or reorganize it.
3. `docs/redesign/README.md`.
4. `docs/redesign/STATUS.md`.
5. `docs/redesign/DECISION_LOG.md`.
6. All four files in `docs/redesign/phase-1/`.
7. Existing repository documentation that describes architecture, build/test commands, data storage, recommendation logic, live workout behavior, and deployment.

## Objectives for this run

1. Confirm that this directory is the actual Git/project root.
2. Inspect `git status`, current branch, and existing uncommitted work. Preserve all user work.
3. Detect whether an `AGENTS.md` already existed before this package. If there is a conflict or duplicated guidance, merge deliberately and retain project-specific instructions. Do not blindly replace anything.
4. Inspect the existing `CLAUDE.md` and report whether a small redesign-audit pointer is needed. Do not edit it unless the benefit is clear and the change is strictly additive.
5. Validate that the Phase 1 documents consistently use the name Comprehensive Fitness and do not contain stale Finns references.
6. Map, at a high level, the repository locations for:
   - navigation and screens;
   - Today and workout-start flow;
   - set logging and RPE input;
   - prior-performance display;
   - rest timers and notifications;
   - readiness and recovery data;
   - recommendation, fatigue, plateau, light-work, and deload logic;
   - workout grading, hypertrophy scoring, PRs, charts, and progress;
   - templates and mesocycle systems;
   - exercise/equipment taxonomy and custom variants;
   - state, persistence, migrations, imports, and historical data;
   - automated tests and visual/browser verification.
7. Do not adjudicate Phase 1 yet. Identify only obvious ambiguities, repository-document mismatches, or missing evidence that the Claude audit should investigate.
8. Create or update `docs/redesign/audits/CLAUDE_CODEBASE_AUDIT_REQUEST.md` as a complete read-only audit packet. It must point Claude to the authoritative Phase 1 files and request exact file-path evidence.
9. Update `docs/redesign/STATUS.md` with what was inspected, what was prepared, any blockers, and the exact next action.
10. Record any governance or source-of-truth decisions in `docs/redesign/DECISION_LOG.md`.

## Write boundary

Allowed writes in this run:

- `AGENTS.md`, only if a careful merge is needed;
- a strictly additive pointer in `CLAUDE.md`, only when justified and after preserving all existing content;
- files under `docs/redesign/`;
- no application code, schemas, tests, dependencies, configuration, or generated build files.

## Completion report

At the end, report:

1. Git root, branch, and working-tree condition.
2. Existing instruction files found and how conflicts were handled.
3. Repository areas mapped.
4. Files created or changed.
5. Stale naming or documentation conflicts found.
6. Whether the Claude audit packet is ready.
7. The exact Claude Code command and prompt file to use next.
8. Any issue that genuinely blocks the audit.

Do not start implementation and do not make product changes in this run.
