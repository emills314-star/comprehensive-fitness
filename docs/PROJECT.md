# Project

## Metadata

- **Purpose:** Product vision, verified scope, and boundary between current and intended behavior
- **Last verified:** 2026-07-31
- **Repository:** `codex/zero-based-redesign` working tree
- **Verification status:** VERIFIED from application code, tests, schemas, configuration, and existing docs; open conflicts are labeled
- **Related:** [Architecture](ARCHITECTURE.md), [Decision engine](DECISION_ENGINE.md), [UI/UX](UI_UX.md), [Roadmap](ROADMAP.md), [documentation inventory](DOCUMENTATION_INVENTORY.md)

## Living-document rule

Read this document before changing product scope, capabilities, target users, workflows, integrations, privacy boundaries, or non-goals. After implementation, update its status statements in the same task and update `ROADMAP.md`. If implementation and intended product behavior differ, preserve both and add **NEEDS REVIEW** rather than rewriting intent to match the code.

## Product purpose

### Zero-based redesign M1 — IMPLEMENTED LOCALLY

Named exercise variants now own the normal working-set count/roles, rep ranges, target-RPE bands, rest defaults, and increments used when a routine starts. Normal recommendation output cannot rewrite those stable targets or supply exact add-load/add-rep prefills. Editable set fields use the corresponding prior set for the same variant and role, an explicit routine default, then blank. A prefilled RPE can be replaced with a decimal value in one focused edit and completed immediately without losing the entry. Global equipment preference state is no longer a product setting or a logging constraint; legacy values are accepted only so old data can be decoded and discarded. Current app-data v3 exports through backup schema v3, while isolated v1/v2 compatibility remains available.

This began as the M1 implementation boundary. M2 through M6 are now implemented locally; M7 remains the completion/grade/Progress milestone.

### Planner/mesocycle removal — IMPLEMENTED LOCALLY (M3)

Guided planning, mesocycle lifecycle, candidate pools, portfolios, planner validation, and related active state are removed from the current product. A versioned legacy backup decoder may accept obsolete planning keys only to preserve workout and routine/template facts; it creates no active mesocycle state, writer, route, renderer, or new record. **Routines** is contextual secondary UI, not a persistent destination.

### Analytical product removal — IMPLEMENTED LOCALLY (M4)

Today and routine start now identify the expected workout and expose the start action without hypertrophy, weekly/fractional volume, research-status, evidence, confidence, program-score, or normal plan-preview cards. Progress is one factual, per-variant performance chart with point detail plus chronological submitted-workout history. The former dashboard, scorecards, volume/fatigue/hypertrophy views, research/evidence surfaces, duplicate recommendation views, and their current derived producers are removed. Historical source workout records, exact variant identities, stable targets, prior-performance facts, and allowlisted compatibility fields remain untouched or read-only.

### Two-destination shell and direct Start — IMPLEMENTED LOCALLY (M5)

The persistent shell now contains exactly **Today** and **Progress**. Routines and Settings are contextual secondary screens; legacy destination hashes resolve only to their bounded current context. An active workout owns the full screen and hides persistent navigation; Today returns to it through **Resume**.

Today starts the expected workout directly with usual readiness. Optional readiness is a separate, skippable action before starting or while the workout is active; it is not a confirmation or capability gate. A second start request cannot replace the sole active draft: the only conflict choices are Resume, Finish, or Discard, and Discard requires a concise destructive confirmation.

Normal boot loads only the catalog identity compatibility needed to retain exact exercise/variant matching. It does not load analytics or research-evidence surfaces. Direct research and personal-evidence UI is removed; legacy backup material preserves only workout, session, template, and immutable historical snapshot facts under bounded compatibility rules.

Comprehensive Fitness is a local-first strength-training workout logger with a quiet spotter. It prioritizes starting the expected workout, seeing prior performance, recording load/reps/RPE, managing rest, preserving trustworthy history, and showing a concise exception only when the approved resolver produces one.

The verified target user is a single strength/hypertrophy trainee using a phone during training. The research package is explicitly scoped to male hypertrophy and related strength, recovery, and nutrition questions (`research_database/README.md`, `research_database/METHODOLOGY.md`). Broader population support is not established.

The verified current shell has two persistent destinations: Today and Progress. Routines and Settings are contextual. The active workout renders every exercise and set in program order as one scrollable document on phone and wider screens; completion updates the current-set highlight without moving the viewport.

## Problems and principles

The application addresses fragmented workout records, slow workout entry, forgotten prior performance, rest timing, and untrustworthy history while keeping ordinary sessions quiet.

Product principles evidenced in the repository:

- Local-first ownership and user-managed export/import.
- Explicit submission: drafts do not become history accidentally.
- One concise approved exception action when material pain or illness evidence exists.
- Conservative failure under missing, conflicting, or pain-related data.
- Stable routine targets and factual same-variant/same-role prior performance.
- Immutable historical recommendation material for compatibility and auditability.
- Mobile-first, motivating presentation without turning readiness into permission for maximal effort.

## Capability status

| Capability | Status | Verified scope |
| --- | --- | --- |
| Workout templates and quick start | **IMPLEMENTED (M5)** | Today directly starts the expected routine with usual readiness; optional readiness is independently available before starting. An existing active draft resolves only through Resume, Finish, or confirmed Discard. Routines are contextual. |
| Active workout logging | **IMPLEMENTED LOCALLY (M6)** | The full-screen logger shows full exercise/variant names, concise stable targets, role-aware prior facts, clear current/completed/skipped states, and direct load/reps/RPE entry. Add/remove/skip/reorder, notes, ordinary substitution, custom variants, and role correction remain available. One consolidated rest control owns the timer lifecycle, including overtime and draft restoration; duplicate per-set timer buttons, the plate calculator, and the execution-quality questionnaire are removed. |
| Progression feedback and editable exercise defaults | **IMPLEMENTED LOCALLY (M6)** | Actual repetitions, logged RPE, set-count changes, substitutions, and exercise order remain workout facts without silently rewriting the routine. Active-workout changes apply to the current workout by default; saving the changed exercise back to its source routine is a separate explicit action. Stable performance identity keeps named/custom variants and their prior facts separate. |
| Submission, history, summaries, and editing | **IMPLEMENTED / M6 NARROWED** | Confirmed submission, PR calculation, stored grade/summary, submitted-only history, and explicit history-edit save/cancel remain. Seven retained achievement types use submitted workout facts: estimated-performance peaks, other PRs, external-load volume records, comparable progression, full plan completion, rep/RPE precision, and successful readiness-adjusted or deload execution. The former Controlled Execution badge and all live execution-quality questions/writers are removed; legacy execution-quality bytes remain import-readable only. |
| Progress and history | **IMPLEMENTED LOCALLY (M4)** | One factual per-variant performance chart with tappable date/load/reps/RPE/set-role/session detail, plus chronological submitted-workout history. Weekly/fractional volume, fatigue, hypertrophy, scorecard, research, evidence, confidence, and duplicate recommendation views are removed. |
| Recovery readiness | **IMPLEMENTED (M5)** | User-entered readiness remains optional and independent before or during the active workout; skipping it does not block Start or logging. |
| Routine/template facts and exception engine | **IMPLEMENTED / M1–M4 NARROWED** | Named-variant targets, factual same-variant/same-role prepopulation, immutable historical snapshots, and the sole M2 exception resolver remain. Planner/mesocycle and analytical recommendation producers are deleted. Legacy backups decode obsolete fields solely to preserve workout/routine-template/history facts. |
| Exercise-science database | **IMPLEMENTED / COMPATIBILITY ONLY AT NORMAL BOOT** | Version 3.0.0 remains repository data with source-provenance and validation contracts. M5 normal boot retains only minimum identity compatibility; it does not expose research/evidence UI or analytics surfaces. |
| Private personal evidence pipeline | **IMPLEMENTED / COMPATIBILITY ONLY AT NORMAL BOOT** | Local normalization and aggregate-package validation remain repository capabilities. Direct personal-evidence UI is removed; legacy backups preserve only workout/session/template and immutable historical snapshot facts. |
| Nutrition tracking | **PARTIALLY IMPLEMENTED** | Research strategies, historical analysis pipeline, and daily adequacy inputs influence context. There is no verified in-app meal/food/macronutrient logger. |
| Fitbit integration | **PARTIALLY IMPLEMENTED** | Exported Fitbit/Google Health data is normalized by the private pipeline. No OAuth, live sync, or direct wearable connection is implemented. |
| Optional push and workout cloud copy | **PARTIALLY IMPLEMENTED** | The Vercel/Upstash backend implements installation-scoped authorization, scoped timer identities and versions, delivery claims, revocation tombstones, bounded resumable deletion, allowed Web Push origins, retention limits, and write-only workout mutation sync. After separate default-off consent, the frontend may upload the complete active, unsubmitted session plus every associated exercise and set object; payloads expire after 90 days and cannot be read or restored by the app. Background notification scheduling separately sends timer/workout/exercise/set identifiers, exercise name, upcoming-set detail, and completion time; Private detail changes only the visible notification body. The frontend reconciles cancel/delivery races, deletes retained workout copies when consent is disabled, and fails closed during local clearing until remote installation deletion and active-timer cancellation are confirmed. **NEEDS REVIEW:** notification-disable orchestration and the irreducible already-dispatched Web Push boundary remain qualified, and there is no cross-device restore UI or account-backed cloud history. |
| Native packaging | **PARTIALLY IMPLEMENTED** | Capacitor iOS/Android projects exist; store signing/submission and physical-device behavior remain operational tasks. |
| Account authentication/profile service | **PLANNED / NEEDS REVIEW** | No user account login exists. Local settings provide a lightweight training profile; backend authorization is installation-secret based. Product intent for accounts is not established. |

## Major workflows

1. Configure unit, readiness baseline, and notification preferences in contextual Settings.
2. Identify the expected routine on Today, optionally choose an alternate, and start directly; optional readiness can be recorded before starting or during the workout.
3. Review factual prior performance and stable targets; log warm-up and working-set load, reps, and RPE; complete or skip sets; and use the consolidated rest control for the current recovery interval.
4. Request submission, review confirmation, submit, and review the retained completion facts pending the M7 concise-completion replacement.
5. Use Progress to inspect the exact variant’s factual performance chart and chronological submitted-workout history.
6. Optionally import Strong CSV history and compatibility-preserved backup data; direct research/personal-evidence UI is not a current product surface.
7. Optionally install the PWA and enable backend-assisted rest notifications.
8. Separately opt in to installation-authorized workout-mutation upload; notifications alone do not enable it. Remote installation records can be revoked and deleted from the Settings Danger Zone without clearing local workouts.

## Terminology

- **Working set:** A set eligible for performance, progression, volume, and PR logic unless explicitly classified otherwise.
- **Warm-up set:** Preparation work excluded from working-set scoring, volume, progression, and PR calculations.
- **RPE/RIR:** Effort measures; RPE is logged in the workout UI, while prescriptions can expose both.
- **Readiness:** An optional same-day, multi-domain record against a user baseline. It may affect today without rewriting routine targets and is never required to start or log a workout.
- **Prescription:** Versioned exercise targets and decision rules derived from personal and research evidence.
- **Recommendation snapshot:** Immutable record of the base and readiness-adjusted prescription used for a workout.
- **Standard guideline:** The versioned goal-aware set/rep/RPE/RIR/rest comparison range captured before a user override or same-day readiness adjustment.
- **Custom exercise profile:** User-confirmed primary muscle, resistance mode, exercise style, progression metric, and applicable smallest increment attached to a stable non-canonical performance identity.
- **Legacy mesocycle:** Obsolete planning data accepted only by the isolated versioned backup decoder to preserve associated workout/routine facts; not current product state.
- **PR:** A submitted-workout performance record under implemented comparison semantics; see `docs/DECISION_ENGINE.md`.
- **Legacy weighted muscle volume/programming family:** Removed derived analytical product concepts. Historical/import compatibility fields may remain read-only; current Progress and the M2 resolver do not compute or present them.
- **Performance exercise identity:** The exact logged/personal exercise ID used to retrieve prior-session loads and keep equipment or named variations distinct.
- **Research exercise identity:** An optional reconciled public exercise ID used for taxonomy and science defaults without collapsing the performance history identity.

## Data sources and privacy

Public/runtime sources include submitted app workouts and the minimum catalog identity compatibility required for exact exercise/variant matching. M5 normal boot does not load analytics or research-evidence surfaces. Private local sources can include Strong exports, Fitbit/Google Health exports, nutrition exports, body-composition records, and generated aggregates; direct personal-evidence UI is removed. Raw and generated personal data are excluded from public deployment by `.gitignore`/`.vercelignore`; legacy backup material is preserved only for workout, session, template, and immutable historical snapshot compatibility.

Do not treat the optional Redis backend as the personal evidence database. It stores installation/push/timer records and, only after separate explicit consent, serialized workout mutations (`api/`, `docs/push-backend.md`). A consented mutation is the complete selected session graph, including an active session plus its exercises and sets. A scheduled notification record retains navigation identifiers, the exercise name, set detail, and completion time even when Private visible-body wording is selected. Record hashes use documented rolling TTLs; the global installation registry persists until completed deletion. Disabling workout-cloud consent stops local uploads and deletes retained workout copies. Confirmed local clearing performs terminal remote installation deletion before discarding its bearer, and pauses offline or on incomplete cleanup. A retained tombstone prevents credential reuse. An already-dispatched Web Push network request cannot be recalled. No raw personal values or credentials belong in public documentation.

## Non-goals and boundaries

- **IMPLEMENTED boundary:** Informational fitness guidance, not diagnosis, treatment, or medical advice (`privacy.html`, `store/app-store-notes.md`).
- **IMPLEMENTED boundary:** No drug-use prescription; enhanced populations are not merged into natural-male recommendations (`research_database/EXECUTIVE_SUMMARY.md`).
- **IMPLEMENTED boundary:** No automatic progression on pain or invalid/missing technique evidence.
- **NEEDS REVIEW:** Whether multi-user accounts, direct wearable sync, comprehensive food logging, or clinician workflows are future product goals; the repository does not establish them.

## Vision gaps

- **IMPLEMENTED:** Ordinary Today/start is quiet. The M2 resolver is the sole current exception-action path; only directly recorded pain/injury or illness can produce a live advisory action.
- **PARTIALLY IMPLEMENTED:** “Fitness, food, and wearable data in one app” currently means offline analysis/import and readiness context, not live Fitbit or food tracking.
- **PARTIALLY IMPLEMENTED:** Workout sync uploads mutations but the UI remains local-first and has no verified remote restore/read API.
- **IMPLEMENTED:** lb/kg changes atomically convert load-bearing app data, retain per-record provenance, preserve private source packages, normalize source-unit prescriptions at the UI boundary, and refresh converted snapshot checksums.
- **NEEDS REVIEW:** Live deployment and physical-device status cannot be proven from repository state alone; dated operational observations must be reverified before release claims.
- **NEEDS REVIEW:** Research scope is male-specific; desired inclusivity/population expansion is not documented.

## Zero-based redesign implementation status

- **IMPLEMENTED (M0–M6):** The final redesign package is now the product authority. Stable named-variant targets, factual same-variant/same-role prefills, unrestricted actual-work logging, one versioned canonical exception-action pipeline, planner/mesocycle removal, analytical producer deletion, factual per-variant Progress, the two-destination shell, and the simplified active logger are live locally.
- **IMPLEMENTED (M2):** Ordinary sessions are silent. Direct recorded pain/injury or illness is the only approved live exception rule; it presents one advisory action while preserving logging. Numeric legacy thresholds cannot create a current action.
- **IMPLEMENTED (M6):** The active logger now centers stable targets, exact prior facts, direct set entry, substitutions/variants, and one rest lifecycle. Workout edits remain local unless the user explicitly saves them to the routine. Plate-calculator, execution-quality, duplicate-timer, equipment-blocking, and app-level exercise-exclusion remnants are absent from the normal runtime. M7–M8 remain to replace completion/grade behavior and perform final integration. The older Dual Track comparison lab is historical design evidence and does not override the final PRD.

## Blank-slate UI reinvention

- **IMPLEMENTED:** A separate synthetic-data React/TypeScript comparison lab defines and renders 15 structurally distinct phone-first design systems without using the production UI as a visual reference (`redesign/`, `docs/design/COMPLETE_REDESIGN_CONCEPTS.md`).
- **DECISION:** Dual Track is the recommended product direction. It organizes active work as parallel exercise lanes above a persistent logging dock; Bento Studio and Set Stack remain comparison finalists and are not silently blended into the winner.
- **PLANNED:** Production behavior remains on the current shell until the typed-adapter, parity, offline, privacy, accessibility, hosted-browser, PWA, and Capacitor gates in `docs/design/REDESIGN_MIGRATION_BLUEPRINT.md` pass.
- **PARTIALLY IMPLEMENTED / NEEDS REVIEW:** The editable Figma file contains foundations but its remaining canvases are blocked by the connected Starter-plan automation limit. The repository lab and dossier are complete design evidence; Figma is not yet a complete joint source of truth.
- **IMPLEMENTED:** A focused comparison adds 25 inspectable mockup screens for the five shortlisted directions across active workout, set/rep editing, template choice, recommendations, and warning flags. Every option now includes a dense previous/load/reps/completion set table, automatic rest state, session controls, and contextual decisions. Body Atlas is no longer shortlisted. Dual Track, Mission Control, and Editorial Performance share the selected light-blue palette without sharing structure.
