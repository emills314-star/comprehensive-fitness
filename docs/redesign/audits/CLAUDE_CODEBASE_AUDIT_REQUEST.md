# Claude Codebase Audit Request

**Product:** Comprehensive Fitness  
**Audit checkpoint:** Phase 1 adversarial codebase audit  
**Audit mode:** Read-only / Plan Mode  
**Requested reviewer:** Claude Code  
**Prepared by:** Codex  
**Prepared:** 2026-07-30  
**Implementation authorized:** No

## Audit mandate

Independently test the Phase 1 zero-based redesign against the current repository. Treat Phase 1 as proposed product intent, not as proof of current behavior or technical feasibility. Challenge unsupported assumptions, hidden coupling, deletion risks, data-loss risks, and cases where the proposal would merely hide complexity.

Do not edit, create, delete, move, rename, format, or regenerate any file. Do not install dependencies, accept visual baselines, start implementation, commit, push, deploy, or publish. Return one audit report in the Claude response. Claude is advisory; Codex will adjudicate findings and record durable decisions.

## Authority and required reading

Read first, in order:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `docs/redesign/README.md`
4. `docs/redesign/STATUS.md`
5. `docs/redesign/DECISION_LOG.md`
6. all four files under `docs/redesign/phase-1/`

Then inspect current-state evidence:

- `README.md`, `package.json`
- `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, `docs/ROADMAP.md`
- `docs/DOCUMENTATION_INVENTORY.md`, `docs/training-prescription-data.md`, `docs/push-backend.md`
- `docs/DAILY_BROWSER_QA.md`, `docs/iphone-pwa-personal-coach-setup.md`
- relevant runtime files, domain modules, schemas, tests, and configuration listed below

Authority is defined in `docs/redesign/README.md`: Phase 1 governs proposed intent; current code, tests, schemas, and older docs evidence the implemented system; Claude findings remain advisory.

## Repository and working-tree facts to preserve

- Confirmed Git root: `C:\Users\Erik Mills\Documents\Comprehensive Fitness`
- Branch at packet preparation: `codex/chromium-ui-repair`
- Upstream: `origin/codex/chromium-ui-repair`
- Uncommitted paths observed before this packet: `.claude/`, `.vercel/`, `docs/redesign/`, `redesign/prompts/`
- Root `AGENTS.md` and `CLAUDE.md` are tracked, established instructions. Do not rewrite them.
- Root web files are source; `www/` is generated packaging output.
- Private personal-health data and secrets are out of scope. Do not quote or enumerate private records.

Re-run `git status --short --branch` and `git rev-parse --show-toplevel` read-only at audit start. Report any difference.

## Current-system map to verify

This is orientation, not a conclusion. Correct it with exact path-and-line evidence.

| Area | Likely current locations |
| --- | --- |
| Shell, navigation, destination dispatch, styling | `index.html`, `app.js`, `app-foundation.js`, `app-views.js`, `app-analysis.js` |
| Today and workout start | `app-views.js` (`renderLiftHome`, `renderTodayPlanPreview`, `openTemplateStart`), `app-workout.js` (`startTemplate`) |
| Active workout, sets, RPE, prior performance | `app-views.js` (`renderWorkout`, `renderExercise`, `renderSet`), `app-workout.js`, `app-foundation.js` |
| Rest timers and notifications | `app-sync.js`, `rest-completion-controller.js`, `sw.js`, `api/`, `docs/push-backend.md` |
| Readiness and recovery | `app-import.js`, `app-foundation.js`, `app-views.js`, `prescription-engine.js` |
| Recommendation, fatigue, plateau, light-work, deload | `prescription-engine.js`, `app-foundation.js`, `app-import.js`, `app-analysis.js`, `app-views.js` |
| Grades, PRs, completion, progress, charts, hypertrophy | `app-history.js`, `app-analysis.js`, `app-views.js` |
| Templates and mesocycles | `app-analysis.js`, `app-views.js`, `app-workout.js`, `guided-mesocycle.js`, `prescription-engine.js` |
| Exercise/equipment taxonomy and custom identity | `prescription-engine.js`, `programming-family-ledger.js`, `app-foundation.js`, `research_database/` |
| State, persistence, migrations, imports, history | `app-foundation.js`, `app-import.js`, `app-workout.js`, `backup-contract.js`, `schemas/` |
| Automated/browser/visual verification | `scripts/test-*.js`, `tests/ui/`, `playwright.config.js`, `scripts/run-check-suite.js`, `.github/workflows/` |
| Non-production React redesign lab | `redesign/`, `docs/design/COMPLETE_REDESIGN_CONCEPTS.md`, `docs/design/REDESIGN_MIGRATION_BLUEPRINT.md` |

## Known tensions to investigate, not adjudicate

1. Phase 1 proposes two persistent destinations; current docs/code describe four.
2. Phase 1 requires one-tap start and no mandatory pre-start sheet; current code exposes a readiness/baseline start flow.
3. Phase 1 deletes normal recommendation walls, visible confidence/evidence, silent target rewriting, and multiple sources; current projections span the engine and several adapters/views.
4. Phase 1 deletes mesocycle creation/management; current code has a versioned planning layer, schema, persisted lifecycle, template linkage, tests, and extensive docs.
5. Phase 1 deletes user-facing hypertrophy, volume, and program-score surfaces; current analysis/completion systems may share underlying calculations.
6. Phase 1 makes equipment metadata non-blocking; current planner eligibility intentionally uses equipment constraints.
7. Phase 1 makes variants own stable targets/history; current identity uses `performanceExerciseId` and optional `researchExerciseId`, plus Strong/custom reconciliation.
8. Phase 1 makes actual completed work authoritative for grading; current grading already uses some actual/readiness-adjusted context but remains coupled to snapshots/adherence.
9. Phase 1 asks for one flag/progress contract; current docs claim one snapshot while fatigue/readiness/analytics functions span runtime segments. Determine projection versus duplication.
10. Phase 1 requires deletion rather than hidden state. Determine what must remain readable/exportable for historical compatibility.
11. The React/Vite redesign lab defines an earlier planned presentation boundary. Determine whether it is reusable, conflicting, or unrelated.
12. Existing living docs conflict materially with Phase 1. Identify required supersession or current-state labeling after adjudication.

## Required audit questions

For every material Phase 1 disposition:

- What is implemented now, and where is it owned?
- What state, schema, route, test, documentation, service-worker, native, API, or packaging dependency exists?
- Can the visible feature be removed while retaining a smaller internal capability?
- Can it be deleted safely, or must legacy data remain readable/exportable?
- What would be hidden complexity rather than genuine simplification?
- What acceptance evidence proves removal without historical-data loss?
- Do Phase 1 files contradict one another?
- Do current docs disagree with code?

Pay particular attention to active-session recovery; prior-performance identity; warm-up classification; immutable snapshots; Strong import provenance; custom identity; backup compatibility; `dataRevision` conflict recovery; service-worker/root/`www` synchronization; background timer behavior; shared grade/PR/chart/fatigue/volume calculations; deletion of routes/state/schemas/tests/docs; and external five-workout/device gates.

## Evidence standard

Every substantive claim must cite repository-relative paths and exact line numbers or a tight range. Prefer:

1. executable source and schemas;
2. focused tests;
3. current governing docs;
4. work logs/audit history only when necessary.

Use the repository labels **IMPLEMENTED**, **PARTIALLY IMPLEMENTED**, **PLANNED**, **ASSUMPTION**, and **NEEDS REVIEW**. Do not infer intent solely from code or current behavior solely from documentation. Show both sides when they conflict. Never include private records, secrets, environment values, or raw imports.

## Required report

Return one report titled `CLAUDE_ADVERSARIAL_CODEBASE_AUDIT.md` with:

1. Executive verdict.
2. Scope, revision/branch, and read-only confirmation.
3. Corrected system/source-of-truth map.
4. Proposal-to-code matrix for every Phase 1 feature family and disposition.
5. Hidden-complexity and duplicate-source findings.
6. Indispensable internal capabilities.
7. Safe deletion opportunities Phase 1 missed.
8. Ranked objections to Phase 1.
9. Data, schema, migration, backup, and historical-preservation constraints.
10. Documentation conflicts and supersession needs.
11. Recommended implementation order without redesigning the product.
12. Questions requiring Codex adjudication.
13. Features that should definitely be deleted.
14. Capabilities that should remain but become invisible.
15. Phase 1 decisions that should be reconsidered.
16. Evidence gaps and external/device/human gates.

For ranked findings include severity, rationale, exact evidence, affected Phase 1 requirement/test IDs, and the smallest credible resolution.

## Prohibited outcomes and completion

Do not edit; make final product-scope decisions; preserve features because of sunk cost; add user-facing features; or claim hosted, visual, native, or field-test verification that did not occur.

The audit is complete only when Codex can adjudicate Phase 1 from exact repository evidence without rediscovering the current architecture.
