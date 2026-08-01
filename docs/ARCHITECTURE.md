# Architecture

## Metadata

- **Purpose:** Verified technical architecture, data flows, and operational boundaries
- **Last verified:** 2026-08-01
- **Repository:** zero-based redesign M8 candidate
- **Verification status:** VERIFIED locally through M8 at source checkpoint `10d3bb2`; independent acceptance, hosted, pinned-runtime, protected-data replay, and physical-device gates remain open
- **Related:** [Project](PROJECT.md), [decision engine](DECISION_ENGINE.md), [UI/UX](UI_UX.md), [roadmap](ROADMAP.md), [push backend](push-backend.md)

## Living-document rule

Read this document before changing application structure, dependencies, persistence, models, schemas, APIs, authentication, integrations, data flow, builds, deployment, or testing architecture. After implementation and verification, update the affected sections and `ROADMAP.md` in the same task. New source-of-truth files and migrations must be referenced here.

Repository instructions may express an approval preference, but they cannot alter the Codex sandbox or approval policy. Those controls belong to the execution environment; see `AGENTS.md`.

## Stack and repository layout

### Zero-based redesign preservation contracts — IMPLEMENTED LOCALLY

M0 of the adjudicated redesign added declarative target schemas for app data v3, backup v3, active draft v2, resolved action v1, and workout grade v2 under `schemas/redesign-*.schema.json`. Privacy-safe synthetic fixtures under `tests/fixtures/redesign-m0/` cover supported legacy backup versions, legacy mesocycle/equipment fields, historical recommendation/grade/execution-quality records, set-role provenance, and interrupted active-draft state. `scripts/test-redesign-m0-preservation.js` verifies deterministic source-observation preservation, current compatibility round-trips, target version uniqueness, active-draft serialization, and fixture privacy.

Resolved action v1 and active draft v2 are runtime contracts validated by executable application code; their JSON Schema artifacts document those shapes but are not directly executed as validators. M7 makes workout-grade v2 an executable prospective contract: new submissions write one exact allowlisted object, while legacy grade shapes remain isolated read compatibility and are never silently upgraded. The executable backup boundary uses backup schema v3 for current app-data v3 and preserves isolated backup-v2 compatibility for app-data v1/v2. Active-draft v1 has a bounded migration reader and is rewritten to v2 only after validated restoration. See `redesign/final/MIGRATION_AND_ACCEPTANCE_PLAN.md` and `redesign/implementation/IMPLEMENTATION_EXECPLAN.md`.

### Zero-based redesign stable-target runtime — IMPLEMENTED LOCALLY

M1 activates app-data version 3 normalization in the existing local-first persistence path. Template exercises are normalized to explicit stable set-role records (`setTypes`) plus set count, rep bounds, target RPE, rest, and increment. Legacy `standardWorkloadOverride` and `standardRoleWorkload` fields are compatibility inputs only; they are decoded into the explicit form and removed from the normalized current model. The normal workout projection consumes that single template/variant source of truth. The recommendation snapshot remains immutable audit/history data but no longer supplies ordinary exact set/load/rep prefills.

Loaded app-data versions 1 and 2 receive an idempotent version-4 migration-audit entry and normalize to app-data version 3. Existing session/exercise/set records, submitted snapshots, IDs, role provenance, planner records, and the separate active-draft recovery boundary remain intact. Legacy global `settings.availableEquipment` is accepted by bounded import for compatibility and discarded during normalization; the application has no active writer or normal workout reader for it. Equipment-only stale execution blocks are cleared at the current logging boundary without rewriting submitted historical recommendation snapshots. The current app has no global exercise-exclusion state or equipment-based logging authorization.

RPE entry uses a bounded replacement buffer so a focused prefilled `7` accepts `7.5` without retaining the original numeric selection. If blur persistence rerenders the set row during a completion touch, delegated pointer handling resumes the action against the freshly rendered set control so the saved decimal and completion transition remain one continuous interaction.

Root runtime assets remain source and `www/` remains generated. The M8 source checkpoint advances the installed-service-worker cache to `comprehensive-fitness-pwa-v102`; final `sync:web` and PWA verification passed for all 26 public assets.

### Planner/mesocycle removal boundary — IMPLEMENTED LOCALLY (M3)

`guided-mesocycle.js`, planner-only schemas, active `data.mesocycles`/`activeMesocycleId` state, planner requests, writers, routes, service-worker references, and current runtime tests are removed. The migration boundary contains an isolated, versioned legacy backup decoder: it accepts obsolete planning keys and maps only the workout/routine-template facts needed for historical understanding. It does not recreate an active planner domain, route, writer, renderer, engine branch, or new-record schema. Routine/template management is a contextual secondary surface; Today and Progress are the only persistent destinations.

### Analytical product removal boundary — IMPLEMENTED LOCALLY (M4)

The normal Today/start path no longer invokes or renders hypertrophy, weekly/fractional volume, research-status, evidence, confidence, program-score, or normal plan-preview producers. `app-analysis.js` now owns one factual per-variant performance series/point-detail view and chronological submitted-workout history. Progress subview state and dashboard/scorecard/volume/fatigue/hypertrophy/research recommendation renderers are removed. The shared programming-family ledger and its derived historical-volume execution path are deleted.

This is a derived-code and UI deletion, not a workout-data migration. Submitted sessions, exercises, sets, exact variant identity, set classification, load/reps/RPE, dates, and immutable historical compatibility material remain in local data. Strict import allowlists may still accept obsolete analytical fields as inert historical bytes. The M2 `exception-resolver.js` remains the only live exception-action source and does not consume volume, hypertrophy, confidence, or research-status analysis.

### Two-destination startup and draft boundary — IMPLEMENTED LOCALLY (M5)

`primaryTabIds` contains only `today` and `progress`. Routines and Settings are secondary destinations; neither is persistent navigation. The active-workout destination is contextual and replaces persistent navigation while its sole draft is active. Only the current destination identifiers resolve; retired route hashes fall back to Today.

Ordinary Start constructs the workout directly with usual readiness. Optional readiness has separate pre-workout and active-workout flows without becoming a Start gate. Only direct explicit pain/injury or illness currently creates a resolver candidate; a stored `meaningfully_poor` deviation alone remains silent. A second start reaches an active-draft conflict that offers only Resume, Finish, or confirmed Discard, and no replacement workout is created before the existing draft is resolved.

Normal boot loads only the identity catalog compatibility required by exact variant/history matching. M5 does not initialize analytics or research-evidence surfaces, and removed personal-evidence UI has no startup route. Legacy backup decoding remains bounded to workout/session/template facts and immutable historical snapshots; obsolete planner settings are discarded before active import and current export.

This is a dependency-light static PWA with Capacitor wrappers, not a bundled component-framework application.

| Area | Implementation |
| --- | --- |
| Web UI/state | HTML/CSS shell in `index.html`; ordered classic-script runtime segments from `app-foundation.js` through `app.js`; synchronized public copies in `www/` |
| Exception and compatibility | `exception-resolver.js` is the sole live exception authority; `prescription-engine.js` is identity and immutable-snapshot compatibility only; both synchronize to `www/` |
| Rest lifecycle | UMD module `rest-completion-controller.js`; synchronized to `www/` |
| Persistence | IndexedDB primary, localStorage migration/fallback and compact active draft |
| Offline/install | `manifest.webmanifest`, `sw.js`, `resources/` |
| Serverless API | CommonJS Vercel Functions under `api/` |
| External services | Upstash Redis, QStash, standards-based Web Push/VAPID |
| Native shells | Capacitor 7 projects under `ios/` and `android/` |
| Research data | Source, schemas, exports, workbook, and validation under `research_database/` |
| Private analysis | Pipeline/config/schemas under `scripts/personal-fitness/` and `personal_fitness_data/` |
| Contracts | JSON Schema files under root `schemas/` |
| Verification | Dependency-free Node tests in `scripts/test-*.js`; Node-based public/private/release gates; Playwright/axe UI audit; GitHub Actions |

`npm run sync:web` is the canonical copy step from root web assets into `www/`. Root files are the editable source; duplicated `www/` files are packaging outputs.

Any cross-file runtime contract change must advance `CACHE_NAME` in `sw.js`. This retires the previous app shell and module assets together; otherwise an installed PWA can pair a new UI with older cached assets.

The service-worker cache version is also the installed-PWA update signal. Every published runtime change must advance it so `registration.updatefound` can surface the in-app update action; changing only a cached shell asset is insufficient. An active worker serves its allowlisted document and runtime assets cache-first without background replacement. The installing worker fills a separate versioned cache, preventing a controlled page from combining JavaScript modules from different releases.

## High-level system

```mermaid
flowchart LR
  User[Phone user] --> UI[index.html PWA]
  UI --> IDB[(IndexedDB app-data)]
  UI --> Draft[localStorage active draft/runtime]
  UI --> Resolver[exception-resolver.js]
  UI --> Identity[prescription-engine identity compatibility]
  Identity --> Research[public exercise identity JSON]
  UI --> SW[service worker]
  SW --> Cache[(Cache Storage)]
  UI --> API[Vercel Functions]
  API --> Redis[(Upstash Redis)]
  API --> QStash[QStash]
  QStash --> Push[Web Push]
  Push --> SW
  Pipeline[local personal-data pipeline] --> Package[private aggregate package]
  Package --> UI
```

## Frontend and state

`index.html` contains the document shell and semantic component styles. The local-first runtime is segmented by responsibility: foundation/state/persistence/compatibility (`app-foundation.js`), primary views (`app-views.js`), routine/history/factual-progress/settings presentation (`app-analysis.js`), workout mutations (`app-workout.js`), PWA/push/sync/timer integration (`app-sync.js`), grading/submission (`app-history.js`), import/export/readiness aggregation (`app-import.js`), and delegated events/startup (`app.js`). These ordered classic scripts intentionally share the browser global lexical environment; their order is a tested dependency contract. Only Today and Progress are primary destination IDs. Routines and Settings remain contextual, and active workout is a full-screen contextual logger. Progress has no secondary route or subview state: it renders one factual per-variant chart with source-point detail and chronological history. Legacy snapshot/explanation helpers are compatibility readers only and do not feed normal boot, Today/start, or Progress. Views are generated as HTML strings and events are handled at the root through `data-action` delegation.

Because each render replaces the view DOM, focus continuity is represented as an allowlisted data descriptor (`data-action` plus bounded identity fields and ordinal), never as a detached element or caller-provided selector. Initial load does not claim focus; explicit primary navigation targets the focusable `#main-content`. Modal sheets capture their invoking descriptor and verify that the resolved target is visible, enabled, programmatically focusable, and actually focused. A failed resolution or focus attempt falls back to the first visible enabled dialog control; that same filtered set owns forward/reverse Tab trapping. Closing restores the newly rendered durable trigger. Progress point detail is ordinary in-view disclosure state, not a persistent secondary route or dashboard stack.

The narrow large-text layout is activated only when the viewport is at most 380 CSS px and the computed root font is at least 24 px. That exact condition renders editable titles as multiline controls and permits one-column reflow and scaled controls while preserving the protected normal-scale 320 px Lift composition. At ordinary narrow text sizes, an input is upgraded only when its rendered value actually overflows. The quick-template list remains an explicit horizontal carousel; other primary-view content must not create document or nested horizontal overflow.

The production design-system boundary is source-enforced independently of visual baselines. Component rules consume semantic color tokens; raw component hex declarations, literal type below 12 px, misuse of the reserved `--fs-data` step, and retired Workout Board/support selectors fail `scripts/test-design-system-integrity.js`. Screenshot comparison remains separately gated until the owner accepts the complete replacement baseline set, so architectural checks cannot silently approve appearance.

Active Today execution is deliberately one render column. `renderWorkout` owns a top-level rest-timer slot, the exercise document, add/details disclosures, and submission controls; it no longer constructs a parallel session-board/support aside or a repeated bottom recovery-adjustment plan. During execution the sticky shell header owns the visible session heading, state, and current exercise/set identity. The fixed session dock is active-workout-only and owns completed/total set progress and elapsed time. The deleted adherence/RPE-drift roll-up is absent. Notification setup remains available during active execution but is suppressed from the concise submitted completion state. Removed Workout Board, status-strip, and support-drawer selectors are absent from production CSS. `renderExercise` keeps the editable name, target facts, grip/menu controls, and native supporting disclosures. `renderSet` projects comparable submitted load × reps @ RPE and date into one full-width Previous strip and routes a known source session through `open-session`.

The timer remains single-instance runtime state. `startTimer` now projects that state into `.workout-timer-slot` rather than nesting it under the completed set. Pause/resume and adjustment may rotate the timer identifier; DOM synchronization retags the single visible strip, and cancellation removes either the current identifier or the slot-owned fallback before clearing the source set's resting class. The completed set and timer state machine, notification scheduling, next-set selection, persistence, and focus behavior are unchanged. These are presentation projections only: readiness, prescription snapshots, workout mutation guards, persistence, and submission semantics are unchanged.

**SUPERSEDED HISTORICAL PRESENTATION RECORD (M8):** The earlier M-series raster pass covered Plan, More, guided planning, analytical Progress, and other surfaces later deleted by the authoritative redesign. Retained delegated actions and accessibility invariants were migrated into the final Today, Progress, contextual Routines/Settings, active-workout, and completion flows; obsolete screenshots and test expectations are not current architecture.

Mobile active-set inputs retain a final-cascade 16 CSS-pixel font floor so iOS Safari does not focus-zoom while a user enters load, reps, or RPE. The delegated pointer handler releases a focused set-entry control before the completion checkmark receives its default focus transition, and the click path repeats the release as a programmatic/keyboard fallback before `toggleSetCompletion`. This changes focus/viewport presentation only: set mutation, rest timing, persistence, and the rule that set transitions never invoke programmatic scrolling remain unchanged.

Exercise execution defaults are a universal app-owned layer, not a recommendation prerequisite. `renderStandardWorkloadControls` reads active set rows and renders the user-editable plan. Its down/value/up steppers remain native number inputs and route changes through the existing delegated input/change path. `applyExerciseDefaultTargets` validates the owning active session and ordered rep/RPE ranges, preserves completed work, rebuilds unfinished rows, advances the session timestamp, and stores the `exercise_default_targets` event only on its owning exercise. Reusable routine defaults use bounded `setTypes` and `warmups`; Strong-derived routines and explicit routine updates serialize the same target fields. `startTimer` selects the completed set’s `targetRestSeconds` before the exercise fallback.

Open section-level native disclosures render a compact yellow upward-chevron badge in the summary’s trailing edge. The cue is presentation-only, appears only while the section is expanded, and leaves the summary as the native keyboard- and pointer-operable recollapse target. Compact controls that already own a specialized disclosure indicator retain that indicator instead of receiving a duplicate badge.

Comparable prior-set projections retain both `priorSessionId` and `priorExerciseId`. The Previous link carries that exact historical exercise plus the originating active exercise through the transient navigation context; after each render, the destination exercise card receives programmatic focus and scroll alignment. If that History record temporarily owns Today while `activeWorkoutId` identifies another valid session, `renderWorkout` exposes one fixed return action. Dispatch restores the active session, clears the transient History pointer, and focuses the originating active exercise without mutating either workout. Legacy shared/role workload fields are decoded into stable routine targets; no live snapshot override writer or second target shape remains.

Workout targets have one current pipeline: stable routine/variant targets plus factual same-variant, same-resistance, same-role prior performance. `exception-resolver.js` may apply one temporary prospective exception action without changing the routine. `prescription-engine.js` does not prescribe, rank, score readiness, apply overrides, or create workout recommendations; it resolves identity and validates supported immutable historical snapshot pairs. Submitted snapshot bytes are never recomputed or used as a current target fallback.

The current normalized app object (`emptyData`, `normalizeLoadedData`) contains sessions, exercises, sets, templates, raw-import metadata, migration audit, revision, and retained settings. Resolved actions and explicit handling/overrides are stored on their owning workout. Mesocycles, top-level `recommendationHistory`, top-level `manualOverrides`, `personalEvidencePackage`, global equipment preferences, exercise-exclusion arrays, themes, color packages, and workout-cloud-copy settings are legacy decoder inputs only and are not recreated as active state or current export. The UI applies one fixed light presentation. IDs are UUIDs when supported. Domain migration and set classification preserve required historical semantics.

Exercise identity has two explicit roles. `performanceExerciseId` is the exact identity used to retrieve prior loads and preserve named/equipment variations; `researchExerciseId` is an optional reconciled public identity used for taxonomy and science defaults. `resolveExerciseIdentityProfile` produces both plus `identitySource` and `identityVersion` (`exercise-identity/2.0.0`). A collision-free personal ID is executable even when it predates `custom_`/`user_` prefixes. A reconciled personal crosswalk such as Double Pulley Lat Pulldown keeps its personal performance identity while projecting to the public lat-pulldown research identity. Direct public catalog identity wins over a same-name personal spoof. New/imported exercises persist these fields when present; legacy records resolve them at read time without rewriting submitted history.

IndexedDB database `comprehensive-fitness`, store `state`, key `app-data` is primary. `comprehensive-fitness-data-v1` supports legacy/fallback state; runtime and a compact active draft use separate localStorage keys. Runtime restoration consults its localStorage failed-write fallback when the IndexedDB read fails or succeeds without a runtime record; an existing IndexedDB runtime remains authoritative. Draft writes are debounced and the compact synchronous fallback protects immediate-close recovery. Completed-history calculations use revisioned caches (`scripts/test-performance.js`).

JSON replacement imports are an explicit trust boundary. Full app backups are limited to 50 MiB using both the browser file size and actual UTF-8 bytes. Iterative shape validation caps depth/object width and rejects prototype or event-handler keys. Backup records pass versioned top-level/entity allowlists, bounded identifiers/text/collections, duplicate checks, and relationship checks before a canonical replacement is produced. Imported `dataRevision` is optional but, when present, must be a non-negative safe integer; it is never trusted as local ordering authority. An accepted replacement receives exactly the next local monotonic revision. Template numeric values, logged/target set values, classifier metadata, and readiness values enforce editor/domain ranges, integer requirements, increments, and ordered min/max pairs before persistence. Import is atomic: a rejected candidate does not partially mutate active or durable state.

Before a full-backup write, every recommendation snapshot that can execute from an active exercise, active workout prescription, or template passes the engine's exported schema/checksum serializer, canonical identity and exact direct-target resolution, and (for exercise/template records) host-exercise identity binding against a prepared candidate engine. Validation does not invoke fresh prescription logic. A stale checksum, unknown schema, identity collision/unresolved identity, unrelated target, or host mismatch rejects the replacement atomically. Submitted historical snapshots are deliberately not reserialized or rewritten; their stored bytes remain historical evidence. Persisted snapshots created by an older runtime may therefore omit fields that a newer renderer recognizes. The display compatibility boundary projects safe strings, arrays, and optional metric ranges in memory only, and both unit and browser tests assert byte-equivalent source state after presentation. A private-evidence replacement likewise reconciles identities from exercise scores, prescriptions, and exercise-muscle scores against the loaded research data and constructs a complete candidate engine before the single IndexedDB write. Any invalid new identity rejects the whole replacement. Only after the candidate write succeeds does the app remove the local fallback, install runtime state, and invalidate the evidence-dependent completed-analysis, recommendation, prescription-snapshot, muscle-assignment, and entity-index caches. Rejection preserves both stores, the previous engine, runtime data, revisions, and caches.

When startup has preserved two valid but unorderable app-data copies, replacement import is blocked: otherwise an accepted import could be shadowed by the alternate on the next load. Export truthfully serializes only the selected runtime copy and identifies the preserved alternate as excluded; confirmed Clear All remains the destructive resolution before importing a replacement. Confirmed clearing inspects only an existing service-worker registration instead of awaiting the potentially never-settling `serviceWorker.ready` promise, cancels queued local saves, removes the IndexedDB database and fallback, durably writes fresh defaults, removes the alternate again, and announces completion only after that write succeeds. Persisted legacy packages are not silently rewritten: an invalid identity stays available to the reconciler for audit while canonical, prescription, muscle, history, and volume consumers fail closed. Import status is attempt-scoped and exposed through an accessible live region. Although IndexedDB is primary, the localStorage fallback may temporarily contain the complete app-data object, including workout history, settings, and an imported personal-evidence package; it is same-device recovery storage, not a privacy-free cache.

**SUPERSEDED HISTORICAL RECORD (M3/M5):** The former Templates/mesocycle/Dashboard/start-flow rendering boundary is retained only as historical performance evidence. Current Routines are contextual, have no mesocycle candidate tree or Dashboard dependency, and direct Start does not construct a readiness prescription or confirmation sheet.

## Workout lifecycle

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Active: direct Start
  Active --> ActiveConflict: competing Start
  ActiveConflict --> Active: Resume
  ActiveConflict --> SubmitReview: Finish
  ActiveConflict --> CancelReview: Discard
  Active --> Active: edit/complete/skip sets; timers
  Active --> CancelReview: request cancel
  CancelReview --> Idle: confirm cancel
  Active --> SubmitReview: request submit
  SubmitReview --> Active: cancel confirmation
  SubmitReview --> Submitted: confirm submit
  Submitted --> Summary: grade + lifts + PRs
  Summary --> History
  History --> EditDraft: explicit edit
  EditDraft --> Submitted: save edits and recalculate
```

Only `submitted`/completed sessions participate in canonical history (`activeCompletedWorkoutHistory`, `activeHistorySessions`). Direct Start creates one active session from stable routine targets and persists any canonical advisory action; it does not create a new legacy workout prescription or recommendation snapshot. Submission owns duration finalization and uses a per-session in-progress lock before one app-state commit, so a routed duplicate or reentrant call cannot duplicate analysis, persistence, sound, or feedback. It calculates retained PR/summary facts, timestamps completion, invalidates relevant caches, and persists locally. It does not queue or upload a workout copy. Historical snapshots are not silently recomputed after engine changes.

`getMostRecentWorkoutPerformance` is the shared live-workout history boundary. Unlike trend/fatigue analysis, it searches the full submitted archive rather than the six-month active-analysis window, because an old completed exposure is still the user's last recorded performance. A revision/date-keyed index first matches the stable performance identity and resistance type; if identity provenance changed across import/evidence versions, submitted Strong records may additionally match the exact normalized exercise name. This fallback never joins differently named variations. Current-session and deload-ineligible work remain excluded, and returned working sets retain their source session/date. Set-role matching prefers the same role and role index, then uses the same ordered working-set position so Strong classification differences do not erase real prior performance.

Workout construction treats the saved routine and named variant as the stable structure: set roles/count, rep ranges, target-RPE band, rest, resistance mode, and explicit defaults. Factual prefill comes from the corresponding prior set for the same performance identity and role/index, then an explicit routine default, then blank. The sole canonical resolver may apply a prospective temporary action for directly recorded pain/illness, but its output is advisory and cannot disable logging or rewrite routine defaults. Legacy recommendation/prescription snapshots remain immutable submitted-history compatibility data and are not projected into current editable targets. Strong CSV import requires an explicit lb/kg choice because the file does not declare its Weight-column unit; the choice is stored on every created set, in its original imported value, and beside the immutable raw text without changing the display unit. Exact same-unit raw duplicates are no-ops, while a conflicting reinterpretation is rejected.

The active workout remains one continuous scroll document. Set/rest state transitions update the persisted active-set identity and visual highlight without programmatic viewport movement; only an explicit set deep link may scroll to its requested target. M6 assigns rest to one consolidated starter/controller rather than repeating a button on every set. Its persisted timer identity, duration, start/end timestamps, ownership fields, and overtime phase survive the supported draft, navigation, background, and reload paths.

## Models and relationships

- A **session** has many exercises and sets, recovery input, lifecycle timestamps/state, optional template/mesocycle context, PRs, and stored analysis.
- An **exercise** belongs to a session and references its sets; it holds muscle/resistance metadata, prescription/snapshot, notes, deload/override state, and optional `customExerciseProfile`. A user-declared custom exercise receives a stable namespaced performance identity that survives name edits and never implies a public research crosswalk. A legacy submitted/imported exercise may also retain `executionQualityAssessment` bytes, but current workouts have no renderer, writer, completion consumer, or active-draft field for them.
- A **set** belongs to an exercise and has sequence/type, targets, actual load/reps/RPE, completion/skip/edit flags, resistance semantics, and inclusion flags for score/volume/progression.
- A **template** owns exercise targets and set-role definitions but does not become history until a started workout is submitted.
- **SUPERSEDED HISTORICAL RECORD (M3):** The following mesocycle model description applies only to obsolete backup input. The isolated decoder may preserve associated workout/routine-template facts but cannot recreate this model as active state.
- A historical **recommendation/prescription snapshot** may retain its stored engine/schema/evidence versions, base/final facts, readiness adjustment, checksum, and embedded overrides. M8 removes the obsolete standalone recommendation/prescription schemas and live generator; bounded compatibility validation recognizes only supported immutable pairs and never backfills them.

The root JSON Schemas are application decision contracts. `personal_fitness_data/schemas/` describe private pipeline artifacts; `research_database/schema/` describes public research tables. These are distinct layers.

## Decision and evidence data flow

```mermaid
flowchart TD
  ResearchSource[research_database/source/database.js] --> Build[scripts/build-research-database.js]
  Build --> ResearchExports[validated public research artifacts]
  ResearchExports --> Identity[identity compatibility catalog]
  AppHistory[submitted exercise observations] --> PriorFacts[factual prior-performance matching]
  StableRoutine[stable routine targets] --> Logger[active workout]
  PriorFacts --> Logger
  Resolver[canonical exception resolver] --> Logger
  PrivateExports[Strong + health/nutrition/body composition exports] --> OfflinePipeline[local offline analysis only]
```

**SUPERSEDED HISTORICAL RECORD (M3):** The former automatic/guided planner engine, renderer, controller graph, lifecycle list, and planner tests are removed. Legacy backup input is decoded only to preserve associated workout/routine-template facts; no planner compatibility surface or lifecycle action remains.

`research_database/source/exercise-muscle-taxonomy.js` remains the research exercise–muscle relationship authority. Taxonomy 2.1.0 covers 62 canonical exercises with 151 relationships and retains all 23 canonical anatomical muscle IDs. Its current consumers are the public catalog/identity build, lazy validation of imported executable compatibility records, and the Node research and private personal-evidence pipelines. The removed planner and weekly scorecard analytics are not consumers of the running M6 product.

The frontend resolves catalog names and aliases only to establish stable research/performance identity. Stable routine targets and prior comparable performance drive the logger; the one exception resolver may make a temporary action without rewriting variant defaults. The older exact-target prescription flow is deleted. Submitted recommendation snapshots remain immutable historical bytes, while a supported active/template compatibility record admitted through backup import must pass bounded checksum, identity, and semantic validation.

Submitted app history remains a collection of distinct exercise exposures rather than weekly summaries. Each record preserves stable workout/exercise identity, actual set loads/repetitions/RPE, planned and completed counts, and recorded reduction/pain state. Historical controlled/breakdown/unassessed execution-quality values are compatibility-only bytes: M6 does not create, evaluate, or display them. Stable exposure keys continue to deduplicate repeat imports.

Legacy custom profiles and historical snapshots remain bounded compatibility inputs. Current custom variants need a name and stable targets, remain loggable without a research crosswalk, and receive a distinct stable performance identity. Backup import allowlists and validates profiles, historical execution-quality fields, and nested routine warm-up/set-role structures without restoring deleted UI or writers.

Programming families remain derived reporting metadata in the research taxonomy and private pipeline configuration; they are not a normal M6 navigation, workout, completion, or Progress concept. The former shared `programming-family-ledger.js` and guided-builder consumer path were deleted in M4. Current research build/validation and private pipeline configuration read the taxonomy source without creating an in-app family-accounting subsystem. Source workout records remain immutable and no workout-history migration is required.

Persistent source and mapping IDs are fail-closed. The 2.0.0 digest fixture protects 1,756 prior mappings; `rex_00754`–`rex_00765` are the `chg_0004` Cable Woodchop append, and `rex_00766`–`rex_00827` are the `chg_0005` `rule_0019` append across all 62 registered exercises. Explicit ordered registries reject undeclared, deleted, reordered, or duplicate rule/exercise source IDs—including additions that would generate zero mapping rows—and every append epoch requires a higher suffix range and matching change-log attribution.

**SUPERSEDED UI CONSUMER RECORD (M4–M6):** Canonical hypertrophy-candidate eligibility, confidence, set contribution, and family-dose calculations remain engine/pipeline facts only. The guided UI, muscle-volume response, sweet-spot, confidence, recovery-rule, and score surfaces are deleted. The current app does not expose those internals or use them to create ordinary workout targets.

## Readiness, progress, units, and analytics

Readiness uses a user-configured baseline plus optional session inputs. `exception-resolver.js` is the sole current action authority; detailed rules are catalogued in `docs/DECISION_ENGINE.md`.

The M7 Progress path retains every submitted workout, exact exercise/variant identity, one exact resistance type, and one comparable working-set role per chart. It derives factual PR/progress highlights from submitted source observations and excludes warm-ups, skipped sets, mismatched roles, and distinct variants. Display comparisons normalize source units while point detail preserves raw load/unit provenance; estimated-performance comparison is bounded to 1–12 repetitions. Chart points expose date, load, reps, RPE, role, session, notes, and provenance through render-epoch-scoped opaque activation keys. Completion writes no badge/achievement, adherence, category, confidence, plan-diff, or second-grade state. Stored legacy grades remain read-only; current grade objects are validated on import and never reconstructed for historical sessions.

New submissions write grade contract `comprehensive-fitness-workout-grade/2.0.0` using prospective algorithm `actual-work-rubric/1.1.0`. The 1.1 correction keeps target/adaptation invariance and scores valid-RPE coverage explicitly. Existing `1.0.0` and older stored grades remain immutable; no load, render, import, or edit path upgrades them.

The header/settings controls use `setAppWeightUnitPreference`, which changes display preference only. Stored observations, explicit per-record `weightUnit`, raw imports, historical snapshots, and their checksums remain unchanged. Rendering converts a stored load into the chosen display unit; editing writes the displayed value with that unit to the current record. This prevents preference switches from rewriting workout history or provenance. `scripts/test-resistance-model.js` and the M1 stable-target contract cover this boundary.

## Authentication, backend, and external integration

There is no account authentication. Push registration creates an installation-scoped secret; later requests use a bearer token whose hash is compared in constant time (`api/_lib/security.js`). Workout-cloud-copy authorization and upload are permanently disabled: `/api/sync/authorize` and `/api/sync/workout` return HTTP 410 and the frontend has no queue, upload control, or writer. Deleted or deleting installation tombstones cannot be reactivated. Timer IDs are installation-scoped hashes and every schedule carries a `timerVersion`; cancellation, delivery, and active-pointer checks reject stale versions.

Every JSON response sent through the shared `apiHandler` receives a new server-generated opaque `X-Request-ID` and produces exactly one structured terminal console event. The event schema is deliberately limited to an ISO timestamp, fixed event name, request ID, normalized method, allowlisted static route, status class, and bounded duration. Client request IDs are never trusted, and headers, authorization tokens, bodies, query strings, network addresses, installation/device/workout identifiers, error messages, and stacks are excluded. Unknown routes and methods fail closed to non-identifying labels. Unexpected errors remain opaque `500` responses; this local structured event contract does not add an external logging service or change data retention.

Rest completion can be entirely foreground/local. Optional background scheduling transmits the installation and timer identifiers, workout/exercise/set identifiers, exercise name, upcoming-set label or number, and completion time, then writes authoritative Redis state before QStash publication. The `private` notification-detail setting changes only the visible Web Push body; the server-side timer record and navigation payload retain those identifiers and the exercise name. Delivery obtains a short-lived claim token, rechecks the installation, timer version, and active pointer immediately before Web Push, and may commit success/retry state only while it still owns that claim. Cancellation and installation deletion revoke claims before scheduler cleanup. The server accepts only HTTPS push endpoints on the default FCM, Mozilla, and Apple origins or an explicitly configured `WEB_PUSH_ALLOWED_ORIGINS` allowlist. Web platform constraints mean custom sound/haptic/lock-screen timing cannot be guaranteed.

Installation deletion is immediately revoking and bounded: indexed per-install registries are scanned in pages, cleanup is limited per request, and an HTTP 202 response instructs the caller to continue until the retained tombstone reaches `deleted`. Installation/tombstone hashes use a rolling 180-day TTL and timers use 7 days. The global `cf:installations` registry has no member TTL; membership is removed on completed deletion. An already-in-flight Web Push request cannot be recalled, but its revoked claim cannot commit success, retry, or resurrect state. Legacy workout/mutation keys are cleanup inputs only and are removed through bounded continuation.

The cleanup-only `/api/sync/consent` accepts only `enabled: false`, deletes legacy workout/mutation keys in bounded pages, and returns HTTP 202 while continuation remains. Enabling workout copy returns HTTP 410. Notification permission cannot enable workout upload.

The Settings Danger Zone exposes explicit remote installation deletion. The client retains the installation identifier and bearer authorization while it follows HTTP 202 cleanup, honors `Retry-After`, prevents overlapping continuations, resumes after reload/online recovery, and clears the token only after terminal `deleted`. Push-identity restore evaluates both IndexedDB and the localStorage failed-write journal: a pending-deletion bearer outranks an unrelated ordinary/generated identity, while a strictly newer terminal deletion for the same installation prevents stale-bearer resurrection. Confirmed local clearing deletes the remote installation and cancels any active timer; it fails closed while offline or cleanup remains unresolved so the required bearer is not orphaned.

Rest cancellation sends the exact `timerVersion` and tracks an in-flight schedule by the client timer ID/version. A cancel request marks that composite immediately; if scheduling later returns a distinct authoritative notification ID, the client cancels it before treating the schedule as complete. A lost or ambiguous schedule response creates a durable cancellation for the client ID/version. The service worker checks both payload `notificationId` and `timerId` at the exact version (defaulting legacy payloads to version 1), so canceling an older timer cannot suppress its replacement. Its cache policy is a public allowlist with network-only/no-store handling for API, private-data, backup, and export paths.

**PARTIALLY IMPLEMENTED / NEEDS REVIEW:** explicit remote deletion, bounded legacy workout cleanup, fail-closed local clearing, notification revocation, and schedule/cancel reconciliation are integrated. The irreducible already-dispatched Web Push boundary remains qualified. There is no workout cloud copy or account-backed restore lifecycle.

Required server environment names are documented without values in `.env.example`. Secrets must remain in deployment configuration.

## Error handling and privacy boundaries

The document shell and executable application runtime have separate ownership: `index.html` contains markup/styles and ordered owned script references, while eight bounded application segments own the local-first runtime behavior. Current domain modules are `prescription-engine.js` (identity and immutable-snapshot compatibility only), `exception-resolver.js` (sole live exception-action authority), `rest-completion-controller.js`, and `backup-contract.js`. The former programming-family ledger and guided-mesocycle modules are deleted. `scripts/test-runtime-boundary.js` verifies the ordered application segments and deployment contract; root/`www` parity, service-worker cache v102, and the CSP verify every current segment as a first-class public asset.

Startup always inspects both IndexedDB and the localStorage fallback. IndexedDB reads retain each record's persistence `updatedAt` metadata without changing value-only callers. New local fallbacks use the versioned `comprehensive-fitness-local-fallback` envelope with source, timestamp, conflict marker, and app data; legacy plain app-data remains readable. Each candidate must be a compatible object with a finite non-negative integer `dataRevision`. Corrupt candidates are quarantined. A higher revision wins; equal-revision candidates are deep-canonicalized only when both are valid, identical content deduplicates, and otherwise a strictly newer reliable persistence timestamp wins. If divergent equal-revision copies have missing or equal timestamps, ordering is unknowable: IndexedDB remains the runtime copy, the local alternate is wrapped and marked conflict-preserved, a visible recovery status asks for export, and neither startup promotion nor later ordinary/stable saves may delete or replace that alternate. The marker survives later revision changes and reloads; only explicitly confirmed **Clear All Local App Data** removes both stores and releases it. The conflict-clear browser regression seeds divergent IndexedDB/fallback templates, confirms deletion, checks the accessible completion announcement and fresh zero-template state, and reloads to prove neither alternate nor conflict returns. Outside conflict recovery, a selected local fallback remains until its normalized data is successfully promoted to IndexedDB, after which cleanup is safe.

A submitted-history edit is an in-memory transaction: entering edit mode cancels queued/idle full-data saves, clones the complete pre-edit state, and durably writes that stable snapshot before opening the transaction. This preserves unrelated pending changes while ensuring temporary history mutations never reach storage. If state changes while persistence is awaited, the older transaction is abandoned without rollback and a fresh clone of current state is saved through the same dual-store helper. Explicit Save ends the transaction before persisting; explicit discard restores its cloned original. Navigation and popstate use the same cancel-edit confirmation and return to a current canonical destination. Service-worker activation is deferred while an edit or active workout is unresolved. The public exercise identity catalog is fetched once; the app performs no private-evidence URL discovery or import. APIs return structured JSON errors and fail authorization. Service-worker navigation falls back to cached `index.html`.

**SUPERSEDED (M5):** the preceding historical startup description of public research fetch and private-evidence discovery no longer describes normal boot. Normal boot loads only catalog identity compatibility; it does not fetch analytics/research-evidence surfaces or expose direct personal-evidence UI.

Private raw/normalized/derived/reports data must not enter public web or native assets. `sync:web` copies an explicit public allowlist and prunes stale sensitive directories from `www/` and Capacitor public roots; `verify:pwa` checks parity, native privacy controls, and all payload roots. Legacy backup decoding preserves bounded workout/session/template and immutable owning-workout historical snapshot compatibility. Top-level retired planner/evidence collections are accepted and discarded rather than recreated. `.vercelignore` remains defense in depth. Exported app backups and any residual legacy remote workout payloads are sensitive.

Numeric history edits update the in-memory set and logical revision without rerendering, so blur cannot detach and swallow the first Save Edits click; repeated identical browser events are no-ops. Explicit Save ends the transaction before one durable write. Separately, an ordinary save that exhausts both stores rerenders its recovery message immediately instead of waiting for another interaction.

## Testing, build, and deployment

User-facing changes require deployment verification in addition to local validation. The completion gate is: governing documentation review; implementation; tests/lint/build; confirmation that the intended branch and latest deployment are live; browser inspection of the hosted URL through the affected flow at mobile and desktop widths; refresh/repeat to detect stale assets; console/runtime and visual checks; and a work-log entry using `docs/WORK_LOG_TEMPLATE.md`. If the hosted site differs, investigate branch/project, build, cache/service-worker, alias, environment, or runtime causes. Do not mark the work complete from local code or a written summary alone.

- Runtime pins are Node `22.23.1` and npm `10.9.8` (`.node-version`, `.nvmrc`, `package.json`). GitHub Actions use the same Node patch release and immutable 40-character action SHAs with read-only permissions and disabled checkout credential persistence.
- `npm test` / `npm run test:public`: discover filesystem entries matching `scripts/test-*.js`, sort them, and exclude the explicitly private `test-personal-fitness-data.js` harness. `npm run test:private` is an explicit local-only gate that requires ignored personal artifacts; `npm run test:all-local` combines both.
- `npm run research:build` / `research:validate`: regenerate and validate research outputs.
- `npm run personal:build` / `personal:validate`: local private analysis only.
- `npm run check:public`: lint, workflow validation, privacy scanning, full and production dependency audit policies, public tests, research validation, and PWA verification.
- `npm run release:verify`: clean-source verification, the complete public gate, and the Playwright UI audit. `npm run verify:pwa` is the cross-platform Node verifier; `npm run sync:web` remains the canonical packaging synchronization command.
- The executable app runtime is external, so Vercel `script-src` is exactly `'self'` and has no line-ending-sensitive inline hash. The deployment contract rejects executable inline script bodies, obsolete hashes, missing/reordered runtime segments, or root/packaged parity drift.
- `npm run check:workflows` parses workflow YAML and enforces immutable action SHAs, least-privilege permissions, disabled persisted checkout credentials, the exact Node patch, and prohibition of `pull_request_target`. `npm run check:privacy` scans tracked/archive paths and content for personal-data and secret patterns. `npm run check:clean-source` prevents release from an uncommitted tracked-source state.
- `npm run audit:dependencies:full` fails on high/critical findings while reporting accepted moderate development-only findings; `npm run audit:dependencies:production` fails on any production severity. `npm run test:release-automation` regression-tests these gates. CI installs with `npm ci --ignore-scripts` before running them.
- Daily Codex browser QA follows `docs/DAILY_BROWSER_QA.md`: it traverses primary navigation and the critical workout lifecycle at desktop/mobile widths, checks console and visual state, and requires a regression test plus browser re-verification for each fix.
- Repository-owned Playwright UI QA runs through `npm run audit:ui`. **SUPERSEDED (M5):** the prior four-destination statement is historical. Current focused coverage includes the two persistent destinations, contextual Routines/Settings, direct Start, optional readiness, active full-screen ownership, and single-draft conflict handling at mobile/desktop Chromium viewports, plus axe WCAG A/AA rules, overflow/clipping, console errors, source-style ceilings, documentation presence, and approved screenshots. Set `PLAYWRIGHT_BASE_URL` to run the same suite against the public hosted origin; this disables the local test server. Deployment-specific Vercel URLs may require an authenticated browser, so unattended hosted automation should use the public production alias while the signed-in browser is used for deployment-specific inspection. GitHub Actions runs the local audit weekly and on manual dispatch; artifacts and the structured Markdown report are retained for review.
- `npm run cap:sync`: copy web assets and update native projects.
- `npm run dev`: dependency-light local server.

Deployment configuration is explicit in `vercel.json`, including strict application-wide security headers. `.github/workflows/public-ci.yml` runs public domain/schema, research/PWA, and Chromium UI jobs for pull requests and `main`; `.github/workflows/weekly-ui-audit.yml` provides the scheduled/manual audit. Private evidence validation is deliberately excluded from public CI. Native release still requires external signing/toolchains.

Repository publication follows `AGENTS.md`: verified source, tests, schemas, public research exports, and documentation are committed and pushed to GitHub `main` by default. Raw/normalized/derived/reported or packaged personal evidence, app exports, local databases, credentials, and secrets remain local and must be excluded after an explicit staged-file privacy review. Ignore rules provide defense in depth but do not replace that review.

## Decisions, risks, and debt

**SUPERSEDED HISTORICAL RECORD (M3):** Planner candidate rendering, equipment compatibility branches, and planner-only engine/test surfaces are deleted. There is no current planner review or application equipment constraint; the decoder-only legacy path has no runtime UI or writer.

- **Decision:** Local-first static app minimizes infrastructure and account requirements.
- **Decision:** Stable routine targets and factual prior records feed normal workout/start surfaces. `exception-resolver.js` alone creates current exception actions; historical prescription snapshots remain compatibility data rather than a live presentation source.
- **Decision:** Separate public research, private personal evidence, and operational Redis data.
- **Residual risk:** the eight application segments still share one ordered classic-script lexical environment, so moving declarations across boundaries requires parity and browser verification. The largest segment is currently 236,903 bytes and the boundary test enforces a 300 KiB ceiling. A future migration to explicit module imports can strengthen dependency enforcement after offline/native compatibility is verified.
- **Risk:** Root/`www` duplication requires disciplined synchronization.
- **Decision:** `exception-resolver.js` is the only current exception-action path. Only direct explicit pain/injury or illness produces a live candidate; optional non-safety readiness deviations remain stored facts. If unavailable, the app holds stable targets and uses only the canonical explicit-safety fallback.
- **Decision (M6):** Ordinary in-workout substitution is not equipment-gated and does not consult a global exclusion list. It records from/to identity and provenance, applies to the current workout by default, and mutates a source routine only through a separate explicit action. Pain/illness exception output remains advisory and cannot block logging.
- **Decision:** Workout cloud copy is disabled. Redis/QStash remain for notification delivery, installation lifecycle, and bounded cleanup of legacy remote workout/mutation keys.
- **PARTIALLY IMPLEMENTED:** Public CI includes Playwright, axe, responsive/overflow, console, target sizing, reduced motion, forced colors, and exact 320 px/200% reflow checks. M8 removes obsolete Dashboard/Lift/Plan/More baselines and reconciles coverage to Today, Progress, contextual Routines/Settings, active logging, and completion. Physical native-device CI remains absent.
- **NEEDS REVIEW:** External production, Upstash region/status, and physical iPhone acceptance claims in operational docs require human re-verification.

## Zero-based redesign runtime boundary

- **IMPLEMENTED (M2):** `exception-resolver.js` is the sole current exception-action authority and loads before the application modules. New decisions are stored on their owning workout as versioned `resolvedActions`; active-draft restore and strict import validate them through the runtime semantic validator.
- **IMPLEMENTED:** Stable routine targets are computed independently of advice. Canonical actions may apply a temporary prospective adjustment but cannot mutate routine defaults. Mutation authorization protects exact active/history targets and does not turn pain/illness advice into a logging block.
- **IMPLEMENTED compatibility:** Historical recommendation snapshots, prescription fields, and stored grades remain readable and immutable. No new current writer populates legacy `recommendationHistory` or `workoutPrescription`.
- **PACKAGE:** Root and `www/` include the resolver through `scripts/sync-web.ps1`; M8 service-worker cache v102 excludes removed concept and programming assets.
- **IMPLEMENTED LOCALLY (M3):** Planner/mesocycle runtime and active-domain coupling is removed; only the isolated legacy decoder preserves workout/routine-template facts.
- **IMPLEMENTED LOCALLY (M4):** Dashboard, scorecard, hypertrophy, weekly/fractional volume, fatigue, research-status, evidence/confidence, program-score, normal plan-preview, and duplicate recommendation producers/surfaces are removed. Factual exact-variant Progress and chronological history remain.
- **IMPLEMENTED LOCALLY (M7):** The temporary live legacy grade is replaced with one prospective actual-work v2 writer and immutable compatibility projection. Concise completion and factual role/variant/resistance-aware Progress pass focused/public/build/package/privacy, mobile/desktop running-app, visual, and independent-review gates.

## Historical React presentation proposal — REMOVED IN M8

The former `redesign/` React/TypeScript/Vite entry, typed seam, synthetic fixtures, prototype tests, and build dependencies were concept-only evidence. The final zero-based redesign was implemented directly in the production shell, so M8 removed that parallel path. `docs/design/REDESIGN_MIGRATION_BLUEPRINT.md` remains historical decision evidence and does not authorize a future cutover or second application stack.
