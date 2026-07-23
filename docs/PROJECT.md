# Project

## Metadata

- **Purpose:** Product vision, verified scope, and boundary between current and intended behavior
- **Last verified:** 2026-07-23
- **Repository:** `main` working tree (exercise-default RPE and disclosure cue)
- **Verification status:** VERIFIED from application code, tests, schemas, configuration, and existing docs; open conflicts are labeled
- **Related:** [Architecture](ARCHITECTURE.md), [Decision engine](DECISION_ENGINE.md), [UI/UX](UI_UX.md), [Roadmap](ROADMAP.md), [documentation inventory](DOCUMENTATION_INVENTORY.md)

## Living-document rule

Read this document before changing product scope, capabilities, target users, workflows, integrations, privacy boundaries, or non-goals. After implementation, update its status statements in the same task and update `ROADMAP.md`. If implementation and intended product behavior differ, preserve both and add **NEEDS REVIEW** rather than rewriting intent to match the code.

## Product purpose

### Guided mesocycle planning — IMPLEMENTED

New mesocycles are built in a guided manual workspace rather than assembled automatically. **Plan Your Mesocycle** appears before the ordinary template library. Users review concise planning rules, configure objective, schedule, equipment, and scope, create empty training days, select and arrange exercises, adjust working sets with immediate volume feedback, run a viability check, acknowledge non-blocking exceptions, and create linked workout templates. Guide, Setup, Build, Check, and Create use persisted progressive unlocking: completed steps remain available, locked steps cannot bypass validation, and Build edits invalidate Check/Create without deleting compatible work.

The same exercise may intentionally appear on multiple training days. Cross-day exercise reuse is not an error or warning. Same-day mechanical redundancy may still be surfaced when it creates a material programming problem.

During Build, selected muscles are ranked by direct-set deficit, missing exposure/frequency, priority, and remaining-day feasibility. Candidate eligibility is controlled by the canonical exercise–muscle taxonomy: direct and positive-credit fractional dynamic relationships qualify; incidental, isometric-only, unknown, and zero-credit relationships do not. Candidate cards display effectiveness for the selected target muscle separately from confidence and general exercise quality.

Total effective sets—not direct sets alone—determine whether a target range is satisfied. Frequency and distribution remain independent requirements, so a muscle cannot appear complete while an exposure is still missing. Final review exposes every training day before an idempotent create/update operation; successful creation ends on a persistent completion summary with routes to the linked templates.

Comprehensive Fitness is a local-first strength-training application that logs workouts and turns workout history, optional private personal evidence, recovery check-ins, and a versioned exercise-science database into transparent training guidance. It is trying to become a personal fitness decision system without hiding uncertainty or rewriting historical recommendations after engine updates.

The verified target user is a single strength/hypertrophy trainee using a phone during training. The research package is explicitly scoped to male hypertrophy and related strength, recovery, and nutrition questions (`research_database/README.md`, `research_database/METHODOLOGY.md`). Broader population support is not established.

The verified product navigation has four destinations: Today for the next action and continuous workout execution, Plan for templates and mesocycle construction, Progress for overview/lift/history analysis, and More for setup and data controls. The active workout renders every exercise and set in program order as one scrollable document on phone and wider screens; completion updates the current-set highlight without moving the viewport.

## Problems and principles

The application addresses fragmented workout records, inconsistent progression decisions, forgotten rest timing, poor visibility into fatigue/volume, and generic advice that ignores personal history.

Product principles evidenced in the repository:

- Local-first ownership and user-managed export/import.
- Explicit submission: drafts do not become history accidentally.
- Transparent recommendations with evidence, confidence, and manual overrides.
- Conservative failure under sparse, conflicting, pain-related, or low-quality data.
- Personal evidence when credible; research-led defaults when it is not.
- Immutable workout recommendation snapshots for historical auditability.
- Mobile-first, motivating presentation without turning readiness into permission for maximal effort.

## Capability status

| Capability | Status | Verified scope |
| --- | --- | --- |
| Workout templates and quick start | **IMPLEMENTED** | Create/use templates, template-specific set roles, rest targets, readiness preview, and active-workout locking in `index.html` (`renderTemplates`, `openTemplateStart`, `startTemplate`). |
| Active workout logging | **IMPLEMENTED** | Exercises, warm-ups/working sets, load/reps/RPE, completion/skipping, timers, notes, travel state, draft restoration, and cancel flow. |
| Progression feedback and editable exercise defaults | **IMPLEMENTED** | Actual repetitions, logged RPE, and added sets remain outcome data without rewriting the recommendation. Every active exercise—catalog, Strong-derived, historical, or new custom—has a compact default editor for working-set count, rep range, target RPE, working rest, and warm-up rest, independent of whether research guidance exists. A nested individual-set editor can assign Top, Back-off, Drop, or Standard type plus a separate rep range, target RPE, and rest timer to each set. Applying changes audits and rebuilds unfinished rows only; saving to a source template is explicit. Research standards and custom-exercise recommendation limits remain separate from these user-owned execution defaults. |
| Submission, history, summaries, and editing | **IMPLEMENTED** | Confirmed submission, PR calculation, grade/summary, submitted-only history, and explicit history-edit save/cancel (`submitWorkout`, `renderSubmitConfirmation`, `renderCompletedWorkoutSummary`). |
| Progress and volume analytics | **IMPLEMENTED** | Interactive exercise charts, session detail, weekly weighted muscle volume, fatigue flags, hypertrophy scoring, and recent/all history. |
| Recovery readiness | **IMPLEMENTED** | User-entered sleep, HRV, resting heart rate, soreness, illness, nutrition/protein status, personal baseline, readiness band, and conservative adjustment guidance. |
| Prescription and mesocycle engine | **IMPLEMENTED** | User-defined muscle scope with explicit omission confirmation, versioned goal-aware progression and confirmation rules, traceable candidate pools, evidence-derived weekly set/frequency slots, portfolio-first compatibility construction, guided user-directed planning, split-aware session allocation, blocking validation, progression/hold/deload/rotation decisions, confidence, snapshots, exact session-row prepopulation, and audited overrides in `prescription-engine.js` and the application adapters. |
| Exercise-science database | **IMPLEMENTED** | Version 3.0.0 publishes source-provenance identifiers, rule-to-conclusion traceability, explicit evidence/product-policy/safety authority, advisory versus allowlisted hard-blocker enforcement, deterministic CSV/JSON/XLSX/SQL/schema outputs, bibliography, build, and validation under `research_database/`. |
| Private personal evidence pipeline | **IMPLEMENTED** | Local normalization/analysis of workout, Fitbit/Google Health, nutrition, and body-composition sources; aggregates can be packaged/imported without public deployment. Import is size/shape/schema bounded, builds a reconciled engine before one atomic replacement, and leaves prior state unchanged on rejection (`scripts/personal-fitness/`, `scripts/build-app-personal-evidence.js`, `index.html`). |
| Nutrition tracking | **PARTIALLY IMPLEMENTED** | Research strategies, historical analysis pipeline, and daily adequacy inputs influence context. There is no verified in-app meal/food/macronutrient logger. |
| Fitbit integration | **PARTIALLY IMPLEMENTED** | Exported Fitbit/Google Health data is normalized by the private pipeline. No OAuth, live sync, or direct wearable connection is implemented. |
| Optional push and workout cloud copy | **PARTIALLY IMPLEMENTED** | The Vercel/Upstash backend implements installation-scoped authorization, scoped timer identities and versions, delivery claims, revocation tombstones, bounded resumable deletion, allowed Web Push origins, retention limits, and write-only workout mutation sync. The frontend reconciles cancel/delivery races, requires separate default-off server-confirmed workout-upload consent, deletes retained workout copies when consent is disabled, and fails closed during local clearing until remote installation deletion and active-timer cancellation are confirmed. **NEEDS REVIEW:** notification-disable orchestration and the irreducible already-dispatched Web Push boundary remain qualified, and there is no cross-device restore UI or account-backed cloud history. |
| Native packaging | **PARTIALLY IMPLEMENTED** | Capacitor iOS/Android projects exist; store signing/submission and physical-device behavior remain operational tasks. |
| Account authentication/profile service | **PLANNED / NEEDS REVIEW** | No user account login exists. Local settings provide a lightweight training profile; backend authorization is installation-secret based. Product intent for accounts is not established. |

## Major workflows

1. Configure unit, goals, training status, readiness baseline, and notification preferences.
2. Create or select a template; review readiness and proposed adjustments; explicitly start.
3. Review or change exercise defaults; optionally open individual set targets for drop sets or differing reps, target RPE, and rest; then log warm-up and working sets, complete/skip sets, and use the exact completed set’s rest timer.
4. Request submission, review confirmation, submit, then view grade, lifts, PRs, and recommendations.
5. Reopen submitted sessions through Progress → History; inspect Progress → Lifts charts and Progress → Overview volume/fatigue detail.
6. Optionally import Strong CSV history and a locally built private evidence package.
7. Optionally install the PWA and enable backend-assisted rest notifications.
8. Separately opt in to installation-authorized workout-mutation upload; notifications alone do not enable it. Remote installation records can be revoked and deleted from the Settings Danger Zone without clearing local workouts.

## Terminology

- **Working set:** A set eligible for performance, progression, volume, and PR logic unless explicitly classified otherwise.
- **Warm-up set:** Preparation work excluded from working-set scoring, volume, progression, and PR calculations.
- **RPE/RIR:** Effort measures; RPE is logged in the workout UI, while prescriptions can expose both.
- **Readiness:** A same-day, multi-domain comparison against a user baseline; it modifies today, not the base mesocycle.
- **Prescription:** Versioned exercise targets and decision rules derived from personal and research evidence.
- **Recommendation snapshot:** Immutable record of the base and readiness-adjusted prescription used for a workout.
- **Standard guideline:** The versioned goal-aware set/rep/RPE/RIR/rest comparison range captured before a user override or same-day readiness adjustment.
- **Custom exercise profile:** User-confirmed primary muscle, resistance mode, exercise style, progression metric, and applicable smallest increment attached to a stable non-canonical performance identity.
- **Mesocycle:** A decision context (primary, alternative, lower-fatigue, or specialization), not an automatic calendar rotation.
- **PR:** A submitted-workout performance record under implemented comparison semantics; see `docs/DECISION_ENGINE.md`.
- **Weighted muscle volume:** Versioned canonical relationships count direct dynamic sets fully, meaningful fractional dynamic work at its configured weight, and incidental/unknown/isometric work at zero hypertrophy credit while retaining fatigue exposure separately.
- **Programming family:** A derived accounting projection from 23 stable anatomical muscle IDs into 20 practical families. It prevents paired subdivisions from double-counting program volume without rewriting exercise relationships, filters, history, or canonical IDs.
- **Performance exercise identity:** The exact logged/personal exercise ID used to retrieve prior-session loads and keep equipment or named variations distinct.
- **Research exercise identity:** An optional reconciled public exercise ID used for taxonomy and science defaults without collapsing the performance history identity.

## Data sources and privacy

Public/runtime sources include submitted app workouts and the research JSON exports cached by `sw.js`. Private local sources can include Strong exports, Fitbit/Google Health exports, nutrition exports, body-composition records, and generated aggregates. Raw and generated personal data are excluded from public deployment by `.gitignore`/`.vercelignore`; the app imports only a user-provided aggregate evidence package into local IndexedDB. Hosted pages never probe private-evidence paths; automatic discovery is restricted to exact loopback origins or a native Capacitor runtime and rejects cross-origin candidates.

Do not treat the optional Redis backend as the personal evidence database. It stores installation/push/timer records and, only after separate explicit consent, serialized workout mutations (`api/`, `docs/push-backend.md`). Record hashes use documented rolling TTLs; the global installation registry persists until completed deletion. Disabling workout-cloud consent stops local uploads and deletes retained workout copies. Confirmed local clearing performs terminal remote installation deletion before discarding its bearer, and pauses offline or on incomplete cleanup. A retained tombstone prevents credential reuse. An already-dispatched Web Push network request cannot be recalled. No raw personal values or credentials belong in public documentation.

## Non-goals and boundaries

- **IMPLEMENTED boundary:** Informational fitness guidance, not diagnosis, treatment, or medical advice (`privacy.html`, `store/app-store-notes.md`).
- **IMPLEMENTED boundary:** No drug-use prescription; enhanced populations are not merged into natural-male recommendations (`research_database/EXECUTIVE_SUMMARY.md`).
- **IMPLEMENTED boundary:** No automatic progression on pain or invalid/missing technique evidence.
- **NEEDS REVIEW:** Whether multi-user accounts, direct wearable sync, comprehensive food logging, or clinician workflows are future product goals; the repository does not establish them.

## Vision gaps

- **IMPLEMENTED:** Today’s readiness now renders above Today’s Plan, and the prescription engine is the single readiness-scoring path (`index.html`, `renderWorkout`, `recoveryRecommendationForSession`).
- **PARTIALLY IMPLEMENTED:** “Fitness, food, and wearable data in one app” currently means offline analysis/import and readiness context, not live Fitbit or food tracking.
- **PARTIALLY IMPLEMENTED:** Workout sync uploads mutations but the UI remains local-first and has no verified remote restore/read API.
- **IMPLEMENTED:** lb/kg changes atomically convert load-bearing app data, retain per-record provenance, preserve private source packages, normalize source-unit prescriptions at the UI boundary, and refresh converted snapshot checksums.
- **NEEDS REVIEW:** Live deployment and physical-device status cannot be proven from repository state alone; dated operational observations must be reverified before release claims.
- **NEEDS REVIEW:** Research scope is male-specific; desired inclusivity/population expansion is not documented.

## Blank-slate UI reinvention

- **IMPLEMENTED:** A separate synthetic-data React/TypeScript comparison lab defines and renders 15 structurally distinct phone-first design systems without using the production UI as a visual reference (`redesign/`, `docs/design/COMPLETE_REDESIGN_CONCEPTS.md`).
- **DECISION:** Dual Track is the recommended product direction. It organizes active work as parallel exercise lanes above a persistent logging dock; Bento Studio and Set Stack remain comparison finalists and are not silently blended into the winner.
- **PLANNED:** Production behavior remains on the current shell until the typed-adapter, parity, offline, privacy, accessibility, hosted-browser, PWA, and Capacitor gates in `docs/design/REDESIGN_MIGRATION_BLUEPRINT.md` pass.
- **PARTIALLY IMPLEMENTED / NEEDS REVIEW:** The editable Figma file contains foundations but its remaining canvases are blocked by the connected Starter-plan automation limit. The repository lab and dossier are complete design evidence; Figma is not yet a complete joint source of truth.
- **IMPLEMENTED:** A focused comparison adds 25 inspectable mockup screens for the five shortlisted directions across active workout, set/rep editing, template choice, recommendations, and warning flags. Every option now includes a dense previous/load/reps/completion set table, automatic rest state, session controls, and contextual decisions. Body Atlas is no longer shortlisted. Dual Track, Mission Control, and Editorial Performance share the selected light-blue palette without sharing structure.
