# Project

## Metadata

- **Purpose:** Product vision, verified scope, and boundary between current and intended behavior
- **Last verified:** 2026-07-11
- **Repository:** `main` @ `7c52a2b`
- **Verification status:** VERIFIED from application code, tests, schemas, configuration, and existing docs; open conflicts are labeled
- **Related:** [Architecture](ARCHITECTURE.md), [Decision engine](DECISION_ENGINE.md), [UI/UX](UI_UX.md), [Roadmap](ROADMAP.md), [documentation inventory](DOCUMENTATION_INVENTORY.md)

## Living-document rule

Read this document before changing product scope, capabilities, target users, workflows, integrations, privacy boundaries, or non-goals. After implementation, update its status statements in the same task and update `ROADMAP.md`. If implementation and intended product behavior differ, preserve both and add **NEEDS REVIEW** rather than rewriting intent to match the code.

## Product purpose

### Guided mesocycle planning — IMPLEMENTED

New mesocycles are built in a guided manual workspace rather than assembled automatically. **Plan Your Mesocycle** appears before the ordinary template library. Users review concise planning rules, configure objective, schedule, equipment, and scope, create empty training days, select and arrange exercises, adjust working sets with immediate volume feedback, run a viability check, acknowledge non-blocking exceptions, and create linked workout templates.

The same exercise may intentionally appear on multiple training days. Cross-day exercise reuse is not an error or warning. Same-day mechanical redundancy may still be surfaced when it creates a material programming problem.

Comprehensive Fitness is a local-first strength-training application that logs workouts and turns workout history, optional private personal evidence, recovery check-ins, and a versioned exercise-science database into transparent training guidance. It is trying to become a personal fitness decision system without hiding uncertainty or rewriting historical recommendations after engine updates.

The verified target user is a single strength/hypertrophy trainee using a phone during training. The research package is explicitly scoped to male hypertrophy and related strength, recovery, and nutrition questions (`research_database/README.md`, `research_database/METHODOLOGY.md`). Broader population support is not established.

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
| Submission, history, summaries, and editing | **IMPLEMENTED** | Confirmed submission, PR calculation, grade/summary, submitted-only history, and explicit history-edit save/cancel (`submitWorkout`, `renderSubmitConfirmation`, `renderCompletedWorkoutSummary`). |
| Progress and volume analytics | **IMPLEMENTED** | Interactive exercise charts, session detail, weekly weighted muscle volume, fatigue flags, hypertrophy scoring, and recent/all history. |
| Recovery readiness | **IMPLEMENTED** | User-entered sleep, HRV, resting heart rate, soreness, illness, nutrition/protein status, personal baseline, readiness band, and conservative adjustment guidance. |
| Prescription and mesocycle engine | **IMPLEMENTED** | User-defined muscle scope with explicit omission confirmation, versioned rules, traceable candidate pools, evidence-derived weekly set/frequency slots, portfolio-first full-program construction, split-aware session allocation, blocking validation, four mesocycle types, progression/hold/deload/rotation decisions, confidence, snapshots, and audited overrides in `prescription-engine.js`. |
| Exercise-science database | **IMPLEMENTED** | Versioned JSON/CSV/XLSX/SQL exports, schemas, mappings, bibliography, build, and validation under `research_database/`. |
| Private personal evidence pipeline | **IMPLEMENTED** | Local normalization/analysis of workout, Fitbit/Google Health, nutrition, and body-composition sources; aggregates can be packaged/imported without public deployment (`scripts/personal-fitness/`, `scripts/build-app-personal-evidence.js`). |
| Nutrition tracking | **PARTIALLY IMPLEMENTED** | Research strategies, historical analysis pipeline, and daily adequacy inputs influence context. There is no verified in-app meal/food/macronutrient logger. |
| Fitbit integration | **PARTIALLY IMPLEMENTED** | Exported Fitbit/Google Health data is normalized by the private pipeline. No OAuth, live sync, or direct wearable connection is implemented. |
| Optional push and workout backup | **PARTIALLY IMPLEMENTED** | Installation-scoped Web Push/rest scheduling and write-only workout mutation sync use Vercel Functions/Upstash. There is no verified cross-device restore UI or account-backed cloud history. |
| Native packaging | **PARTIALLY IMPLEMENTED** | Capacitor iOS/Android projects exist; store signing/submission and physical-device behavior remain operational tasks. |
| Account authentication/profile service | **PLANNED / NEEDS REVIEW** | No user account login exists. Local settings provide a lightweight training profile; backend authorization is installation-secret based. Product intent for accounts is not established. |

## Major workflows

1. Configure unit, goals, training status, readiness baseline, and notification preferences.
2. Create or select a template; review readiness and proposed adjustments; explicitly start.
3. Log warm-up and working sets; complete/skip sets; use exercise rest timers and prescription guidance.
4. Request submission, review confirmation, submit, then view grade, lifts, PRs, and recommendations.
5. Reopen submitted sessions through Dashboard/History; inspect interactive charts and weekly volume/fatigue detail.
6. Optionally import Strong CSV history and a locally built private evidence package.
7. Optionally install the PWA and enable backend-assisted rest notifications.

## Terminology

- **Working set:** A set eligible for performance, progression, volume, and PR logic unless explicitly classified otherwise.
- **Warm-up set:** Preparation work excluded from working-set scoring, volume, progression, and PR calculations.
- **RPE/RIR:** Effort measures; RPE is logged in the workout UI, while prescriptions can expose both.
- **Readiness:** A same-day, multi-domain comparison against a user baseline; it modifies today, not the base mesocycle.
- **Prescription:** Versioned exercise targets and decision rules derived from personal and research evidence.
- **Recommendation snapshot:** Immutable record of the base and readiness-adjusted prescription used for a workout.
- **Mesocycle:** A decision context (primary, alternative, lower-fatigue, or specialization), not an automatic calendar rotation.
- **PR:** A submitted-workout performance record under implemented comparison semantics; see `docs/DECISION_ENGINE.md`.
- **Weighted muscle volume:** Versioned canonical relationships count direct dynamic sets fully, meaningful fractional dynamic work at its configured weight, and incidental/unknown/isometric work at zero hypertrophy credit while retaining fatigue exposure separately.

## Data sources and privacy

Public/runtime sources include submitted app workouts and the research JSON exports cached by `sw.js`. Private local sources can include Strong exports, Fitbit/Google Health exports, nutrition exports, body-composition records, and generated aggregates. Raw and generated personal data are excluded from public deployment by `.gitignore`/`.vercelignore`; the app imports only a user-provided aggregate evidence package into local IndexedDB.

Do not treat the optional Redis backend as the personal evidence database. It stores installation/push/timer records and serialized workout mutations (`api/`, `docs/push-backend.md`). No raw personal values or credentials belong in public documentation.

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
- **NEEDS REVIEW:** Existing setup docs state live deployment status that cannot be proven from repository state alone.
- **NEEDS REVIEW:** Research scope is male-specific; desired inclusivity/population expansion is not documented.
