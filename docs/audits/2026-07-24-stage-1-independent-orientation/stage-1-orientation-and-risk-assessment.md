# Stage 1 — Repository-Wide Orientation and Risk Assessment

## Metadata

- **Purpose:** Independent orientation, architecture map, and risk assessment prior to deep review
- **Date:** 2026-07-24
- **Repository state:** `main` @ `d636a1a`, clean working tree at review start
- **Reviewer stance:** Independent. Repository documentation was read as *claims to be tested*, not as established fact.
- **Scope limit:** This is an orientation stage. No production code was read line-by-line and no production behavior was modified.

---

## 1. Executive orientation

### What the application is

Comprehensive Fitness is a local-first strength-training PWA for a single trainee. It logs workouts, and converts submitted workout history, an optional private personal-evidence package, daily recovery check-ins, and a versioned exercise-science database into transparent, auditable training prescriptions. It is wrapped by Capacitor for iOS/Android and deployed as a static site on Vercel, with an optional serverless backend (Vercel Functions + Upstash Redis/QStash) for Web Push rest notifications and write-only workout upload.

The distinguishing product ambition is *auditability*: recommendations are captured as immutable versioned snapshots, historical snapshots are never recomputed, and the engine is expected to fail closed (toward "hold" or "insufficient data") rather than guess.

### How it is structured

Deliberately dependency-light. There is no UI framework and no bundler in the production path. `index.html` provides the shell; the runtime is eight ordered classic scripts (`app-foundation.js` → `app.js`) that share the browser global lexical scope, plus four UMD modules (`prescription-engine.js`, `guided-mesocycle.js`, `programming-family-ledger.js`, `rest-completion-controller.js`). Views are generated as HTML strings and events are handled by root-level `data-action` delegation. Persistence is IndexedDB-primary with a localStorage fallback and compact active-workout draft.

Scale: roughly 1.7 MB of production JavaScript. `prescription-engine.js` alone is ~407 KB; `app-foundation.js` ~277 KB.

### Can the repository be built and tested?

Partly, with one real caveat.

- **Lint:** passes (185 JS files, 3117 JSON files).
- **Public test gate (`npm test`):** **fails — 48 of 50 harnesses pass, 2 fail.** Both failures are `tar` invocation failures under Windows/Git Bash, not application defects. See Finding 1.
- **Application:** boots and runs cleanly. All four destinations and all Progress subviews render with zero console errors and zero page errors.
- **`www/` parity:** currently exact across all 15 synchronized files.

There is no build step for the production app — the deployed artifact is the source.

### Three greatest strengths

1. **Documentation quality is genuinely exceptional and largely accurate.** `docs/DECISION_ENGINE.md` documents thresholds, versions, and named functions with a precision that is rare. Spot-checks against code repeatedly confirmed the claims (engine version, `DEFAULT_POLICY` constants, `recentExerciseWindowDays: 56`, the readiness consolidation). Critically, the docs distinguish IMPLEMENTED / PARTIALLY IMPLEMENTED / PLANNED / NEEDS REVIEW and maintain an explicit NEEDS REVIEW register — the project does not oversell itself.
2. **Deliberate, defensible failure-closed design in the safety-critical paths.** Pain precedence over deload, typed non-executable rejections (`unknown_exercise_identity`, `no_dynamic_direct_target`), refusal to fabricate a readiness score when the engine is unavailable, and immutability of submitted snapshots are all real architectural commitments, not aspirations.
3. **Strong data-integrity discipline at the import boundary.** Backup import is size-bounded, shape-bounded, allowlisted, and transactional against a prepared candidate engine before a single write. The privacy boundary between public source and personal health data is enforced in `.gitignore`, `.vercelignore`, a dedicated `check:privacy` gate, and a documented pre-commit review procedure.

### Five greatest risks

1. **Test strategy is dominated by source-text assertion, not behavior.** 28 of 51 harnesses read source files as strings; several assert almost entirely via `assert.match`/`doesNotMatch` regexes against concatenated source. Where tests do execute code, they frequently extract a single function by name and inject hand-written stubs that do not match production data shapes. This produces tests that are simultaneously brittle (a rename fails them) and insensitive (a behavior change passes). See Finding 2.
2. **Estimated-1RM is implemented at four production sites with inconsistent resistance-type gating**, and the shared helper reads a raw field rather than the resistance-aware accessor used by every other consumer. See Finding 3.
3. **Every derived analytics cache depends on one manually-invoked invalidator.** `analysisRevision` is incremented in exactly one function; seven cache families key off it. Correctness therefore rests on every mutation path in eight files remembering to call it. See Risk R2.
4. **The shared global lexical environment across eight ordered scripts** is a load-bearing, order-sensitive contract with no module boundary, no type checking, and ~1.7 MB of surface. The repository acknowledges this as accepted debt; it remains the single largest structural constraint on safe change.
5. **The sheer volume of authoritative-sounding documentation is itself a review hazard.** ~1,900 lines of core docs written in a "VERIFIED" voice can substitute for verification. The `50/50 public harnesses pass` claim in `ROADMAP.md` is already false on this platform — a concrete instance of documentation outpacing measurement.

### Overall confidence in current understanding

**Moderate-to-good on architecture and data flow; low on functional correctness of the fitness logic.**

I can state with confidence what the systems are, where they live, and how data moves. I cannot yet state whether the progression, readiness, deload, and volume computations are *correct*, because the existing test suite provides weak evidence about behavior and I have not independently executed the engine against constructed scenarios. That is Stage 2's job and it should be treated as genuinely open.

---

## 2. Documentation inventory

| Document | Purpose | Authority | Systems covered | Assessment |
| --- | --- | --- | --- | --- |
| `docs/DECISION_ENGINE.md` (209 ln) | Readiness, progression, deload, volume, PR, mesocycle, scoring rules | **Principal source of truth for domain logic.** Explicitly named as canonical in `ROADMAP.md:81` | Prescription engine, readiness, progression, fatigue, planner, PRs, analytics | Highest-value document. Spot-checks confirmed engine version, policy constants, window days. Labels heuristics as heuristics. **High confidence.** |
| `docs/ARCHITECTURE.md` (255 ln) | Technical structure, persistence, data flow, integration | Principal source of truth for structure | All subsystems | Accurate on script ordering, persistence keys, `CACHE_NAME` rule, `sync:web`. **High confidence.** Extremely dense prose; low scannability. |
| `docs/PROJECT.md` (122 ln) | Product scope, capability status, non-goals | Principal source of truth for scope | Capability matrix, workflows, terminology, privacy | Capability table is candid about PARTIALLY IMPLEMENTED. **High confidence.** |
| `docs/ROADMAP.md` (217 ln) | Status, debt, defects, open questions | Principal for status | Cross-cutting | Rich and self-critical. **Medium confidence** — contains at least one stale verification claim (see Finding 1). Status claims are the most perishable content in the repo. |
| `docs/UI_UX.md` (222 ln) | Screens, navigation, state, interaction | Principal for UI | Navigation, destinations, accessibility | Not deeply verified this stage. |
| `AGENTS.md` (70 ln) | Working agreement for coding agents | Binding process document | Documentation loop, privacy review, publishing policy | Current and enforced in practice (work-log discipline is visibly followed). |
| `docs/DOCUMENTATION_INVENTORY.md` (48 ln) | Reconciliation of pre-existing docs | Supporting | Doc routing | Supports the routing table. |
| `docs/training-prescription-data.md` (177 ln) | Database inventory, crosswalks, regeneration | Authoritative for its specialty | Research + private DB | Specialized; not verified this stage. |
| `docs/push-backend.md` (101 ln) | Backend services, env vars, verification | Authoritative for its specialty | API, Redis, QStash, VAPID | Self-labels dated external observations as requiring re-verification — good practice. |
| `docs/performance.md` (46 ln) | Performance contracts | Supporting | Caching, render cost | Ties to `test-performance.js`, which is source-regex based. |
| `docs/DAILY_BROWSER_QA.md` (22 ln) | Hosted verification gate | Process | QA | Mandatory gate per ROADMAP. |
| `docs/audits/**` (2 audit sets) | Prior audit trails, rubrics, bug ledger | Historical evidence | Cross-cutting | Includes a prior independent scoring milestone (40/50, 41/50). Useful prior art; note it scored a specific older revision. |
| `docs/work-logs/**` (30+ files) | Per-change implementation records | Historical | Per-change | Consistently maintained. Genuinely useful for archaeology. |
| `docs/design/**`, `redesign/` | UI reinvention program | Parallel non-production track | Design lab | **Important scope caveat:** a 15-system React/TS design lab exists and "Dual Track" is a recorded product decision, but production remains on the current shell. Reviewers must not conflate the two. |

### Documentation findings

- **Principal source of truth:** `docs/DECISION_ENGINE.md` for domain logic; `docs/ARCHITECTURE.md` for structure. This is unambiguous and consistently signposted.
- **Do multiple documents conflict?** No material contradictions found between core documents. The routing table in `AGENTS.md` prevents overlap by design.
- **Systems lacking documentation:** None materially. Coverage is unusually complete.
- **Is documentation current?** Core docs are dated 2026-07-24 (same day as the latest commits). The perishable content is *status* claims, not *design* claims — see Finding 1.
- **Does it distinguish implemented from planned?** Yes, rigorously, with a five-label vocabulary and a NEEDS REVIEW register. This is a genuine strength.
- **A structural caution:** the mandatory documentation loop in `AGENTS.md` requires every code change to update governing docs in the same task. This produces excellent coverage, but it also creates pressure to write prose asserting that new behavior is correct at the moment it is written. Documentation density is not evidence of behavioral correctness, and Stages 2–3 must not treat it as such.

---

## 3. Architecture map

### Layers

```
┌─ Shell ──────────────────────────────────────────────────────┐
│ index.html — document, semantic color roles, CSS, CSP        │
├─ Runtime (8 ordered classic scripts, shared global scope) ───┤
│ app-foundation  state, persistence, normalization, identity, │
│                 caches, resistance model, createSet          │
│ app-views       Today/Plan renderers, guided planner views   │
│ app-analysis    templates/history/analytics/settings, charts,│
│                 setPrescriptionForRole                       │
│ app-workout     workout mutations, set edits                 │
│ app-sync        PWA, push, sync, timers                      │
│ app-history     grading, submission, PRs, achievements       │
│ app-import      import/export, weekly volume, fatigue flags, │
│                 readiness adaptation                         │
│ app.js          delegated events, startup, routing           │
├─ Domain modules (UMD) ───────────────────────────────────────┤
│ prescription-engine.js      407 KB — decision authority      │
│ guided-mesocycle.js         pure planning layer              │
│ programming-family-ledger.js muscle family projection        │
│ rest-completion-controller.js rest lifecycle                 │
│ backup-contract.js          backup allowlists                │
├─ Persistence ────────────────────────────────────────────────┤
│ IndexedDB comprehensive-fitness / state / app-data (primary) │
│ localStorage: legacy fallback + compact active draft         │
├─ Offline / packaging ────────────────────────────────────────┤
│ sw.js (CACHE_NAME = update signal), manifest, www/, Capacitor│
├─ Backend (optional) ─────────────────────────────────────────┤
│ api/ CommonJS Vercel Functions → Upstash Redis, QStash, VAPID│
└──────────────────────────────────────────────────────────────┘
```

### Subsystem responsibility table

| Subsystem | Primary files | Inputs | Outputs | Stored vs derived | Tests | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| State & persistence | `app-foundation.js` (`emptyData`, `normalizeLoadedData`, dual-store startup) | IndexedDB, localStorage, imports | Normalized `data` object, `dataRevision` | Stored | `test-runtime-persistence`, `test-domain-integrity` | ARCHITECTURE |
| Recommendation engine | `prescription-engine.js` | History, readiness, research DB, personal evidence | Versioned snapshots, `finalPrescription` | Snapshot stored; decision derived | `test-prescription-engine`, `test-recommendation-*` (9 harnesses) | DECISION_ENGINE |
| Readiness | `prescription-engine.js:1432 evaluateReadiness`, `:1473 readinessAdjustmentFor`; adapter `app-import.js:375 recoveryRecommendationForSession` | User check-in + baseline | Band, domains, one-day adjustment | Derived | `test-prescription-engine`, `test-workout-safety` | DECISION_ENGINE |
| Progression / set targets | `app-analysis.js:413 setPrescriptionForRole`, `prescription-engine.js:4073 prescribedLoadFromHistory`, `:4051 historyHighWatermark` | `finalPrescription` + comparable history | Exact per-role rows | Derived, then persisted on workout | `test-set-prescriptions`, `test-prescription-app-integration` | DECISION_ENGINE |
| Deload / staleness | `prescription-engine.js` (`assessDeloadNeed`, `assessExerciseStaleness`) | Exposure history, RPE slope, pain | Scoped deload decision | Derived | `test-pain-deload-precedence` | DECISION_ENGINE |
| Guided mesocycle | `guided-mesocycle.js` + `app-views.js` | User config, taxonomy, research targets | Draft, viability, linked templates | Draft stored; status derived | schema contract tests | DECISION_ENGINE, PROJECT |
| Volume / fatigue | `app-import.js:211 weeklyMuscleVolume`, `:311 fatigueFlags`, `programming-family-ledger.js` | Submitted sets + taxonomy | Weekly family totals, flags | Derived (cached) | `test-performance` (source regex), `test-taxonomy-*` | DECISION_ENGINE |
| Grading / PRs / achievements | `app-history.js:180,199,325`, `workoutAchievementBadges` | Submitted session | Grade, PR list, badges | PRs stored on session | `test-workout-grade` (stubbed) | DECISION_ENGINE |
| Charts / lift analysis | `app-analysis.js:965,1142,1270` | Submitted history | Chart points, best sets | Derived | thin | UI_UX |
| Import (Strong/backup) | `app-import.js`, `backup-contract.js` | CSV, JSON backup, evidence package | Normalized entities | Stored | `test-backup-contract`, security suites | ARCHITECTURE |
| Rest / notifications | `rest-completion-controller.js`, `app-sync.js`, `sw.js`, `api/push/*` | Set completion, targets | Timers, push | Runtime | `test-rest-*` (4) | push-backend |
| Sync (write-only) | `app-sync.js`, `api/sync/*` | Consent + mutations | Redis records | Remote | `test-sync-consent` | push-backend |

### Data flows

**1. Historical workout data → new recommendation**
```
data.sets/exercises/sessions (IndexedDB)
  → activeHistorySessions() / submittedPerformanceIndex()   [cached on analysisRevision]
  → resolveExerciseIdentityProfile()  → performanceExerciseId (exact prior loads)
                                      → researchExerciseId (taxonomy/science)
  → prescription-engine: derivePersonalEvidenceMetrics + calculateEvidenceWeight
  → prescribedLoadFromHistory / historyHighWatermark (two anchors)
  → determineProgressionDecision → createExercisePrescriptionSnapshot
  → snapshot { basePrescription, finalPrescription, standardGuideline }
  → persisted to data.recommendationHistory (immutable)
```

**2. Readiness input → adjusted targets**
```
recovery check-in + user baseline
  → evaluateReadiness()            [engine — sole scoring path]
  → readinessAdjustmentFor(basePrescription, readiness)
  → recoveryRecommendationForSession()   [app-import.js — LABEL ADAPTER ONLY]
  → one-day set/load/RPE reduction; base prescription + mesocycle unchanged
```

**3. Live set entry → persisted history**
```
input/change on set field → delegated data-action handler (app.js)
  → app-workout.js mutation (patch; weight edit also patches addedLoad/assistanceLoad)
  → debounced IndexedDB write + synchronous compact localStorage draft
  → explicit submit → confirmation → submitWorkout()
  → submitWorkoutPrs(), calculateWorkoutAnalysis(), achievement badges
  → session marked submitted; dataRevision++; invalidateCompletedAnalysis()
```

**4. Completed workouts → charts and progression**
```
submitted sessions
  → completedAnalysisIndex()  [cached: exercisesByCanonical, setsByExercise, ...]
  → chart buckets (app-analysis.js:1142) → estimatedOneRepMax / resistance-specific value
  → weeklyMuscleVolume() → programming-family-ledger projection → family totals
  → fatigueFlags() (planned reductions excluded)
  → feeds back into evidence metrics for the next recommendation
```

**5. Template / mesocycle → generated session**
```
guided draft (data.mesocycles, builderMode:"guided", guidedDays)
  → viability check (PLANNING_RULES) → blockers vs warnings
  → idempotent create → linked templates (deterministic day-based IDs)
  → openTemplateStart → readiness preview → startTemplate
  → finalPrescription → executable role rows → active workout
```

**6. Imported data → classified active history**
```
Strong CSV (+ explicit source-unit choice) OR full JSON backup
  → size/shape/depth/prototype-key guards
  → versioned allowlist + bounded ID/text/count + duplicate/reference checks
  → executable snapshot revalidation against prepared candidate engine
  → ONE atomic IndexedDB replacement; rejection leaves prior state untouched
  → cache invalidation only after the write succeeds
```

### Areas of unclear ownership

- **Estimated-1RM**: no single owner (Finding 3).
- **Resistance-aware performance value**: `workoutSetPerformanceValue` (app-history.js:40), `bestEstimatedOneRepMax` (app-foundation.js:3158), and the chart path (app-analysis.js:965/1142) each re-express the same resistance switch inline rather than sharing one function.
- **Cache invalidation**: `invalidateCompletedAnalysis()` is the sole authority but has no enforcement that callers invoke it.

---

## 4. Source-of-truth map

| Data / decision | Authoritative source | Duplication / risk |
| --- | --- | --- |
| Exercises (catalog) | `research_database/` exports, taxonomy 2.1.0 (62 exercises, 151 relationships) | Personal/custom identities live alongside; reconciliation via `resolveExerciseIdentityProfile` |
| Exercise identity | **Split by design:** `performanceExerciseId` (exact history) vs `researchExerciseId` (taxonomy) | Intentional and documented. A genuine strength — but doubles the number of identity bugs possible |
| Muscle attribution | Canonical taxonomy 2.1.0 → `programming-family-ledger.js` (23 IDs → 20 families) | Single shared ledger. **Appears consistently centralized** |
| Templates | `data.templates` | Guided planner creates *linked derived* templates; guided draft is structural truth |
| Mesocycles | `data.mesocycles` (guided draft authoritative; templates derived) | Legacy auto-generated plans remain readable — two shapes coexist |
| Active workout state | `activeWorkoutId` + `activeSessionId` in runtime; IndexedDB `runtime` record; localStorage fallback journal | **Three locations.** Ranked at startup by revision/content/persistence time; unorderable divergence preserves both |
| Completed workouts | `data.sessions` (submitted only) + `data.exercises` + `data.sets` | Flat normalized triple; joined by ID at read time |
| Readiness | `prescription-engine.js:evaluateReadiness` | **Single path, verified.** `test-workout-safety.js:8` actively asserts the removed duplicate scorer never returns |
| Progression status | `finalPrescription` on the snapshot | Docs are explicit that `basePrescription` exists only to explain readiness deltas |
| Deload status | `assessDeloadNeed` (engine) | Pain precedence sits *above* it in the hard-safety path |
| Recommendations | Immutable snapshot in `data.recommendationHistory` | Stored active/template snapshots are re-validated before reuse; submitted ones are byte-immutable |
| Personal records | Computed at submission (`submitWorkoutPrs`), stored on session | **Recomputed for display** by `workoutPrPreviousHighWater` — two code paths, see R3 |
| Estimated 1RM | **No single owner** | 4 production sites + 1 pipeline + test re-implementations. **Finding 3** |
| Weekly volume | `weeklyMuscleVolume()` → family ledger | Cached on `analysisRevision` |
| 56-day windows | `DEFAULT_POLICY.recentExerciseWindowDays` / `maximumReturnGapDays` | Both 56, both in engine. Centralized |
| Six-month active history | `activeCompletedWorkoutHistory()` via `activeHistorySessions()` | Cached. Note: "last time" lookups deliberately search *beyond* this window |
| Archived data | Session lifecycle state | Not verified this stage |
| User preferences | `data.settings` (theme + colorPackage independent) | Normalized on load; import-allowlisted |
| Rest durations | Per-set `targetRestSeconds` → exercise fallback → settings default | Three-level fallback in `startTimer`. Documented |

**Systems where more than one source of truth exists:** estimated 1RM (Finding 3); active workout state (three stores, mitigated by explicit ranking); PR values (computed at submit, recomputed for display).

**UI components recreating business logic:** the resistance-type switch is re-expressed inline in at least four render/analysis paths rather than shared.

**Cached values without clear invalidation:** all seven derived caches depend on one manual invalidator (R2).

---

## 5. Preliminary requirements traceability matrix

> **Preliminary.** Statuses reflect orientation-level evidence only. None of these constitutes verification of correctness.

| # | Requirement | Source | Subsystem | Likely files | Tests | Preliminary status | Priority | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Readiness has exactly one scoring path; UI is an adapter | DECISION_ENGINE §Readiness | Readiness | `prescription-engine.js:1432`, `app-import.js:375` | `test-workout-safety` (source regex), `test-prescription-engine` | **Appears implemented** | High | Medium — enforced by a *textual* assertion, not behavioral |
| R2 | Readiness changes today only, never the base plan | DECISION_ENGINE | Readiness | `readinessAdjustmentFor` | engine tests | Appears implemented | Critical | Low-Medium |
| R3 | Nutrition alone cannot trigger deload; one HRV value cannot | DECISION_ENGINE | Readiness/deload | `evaluateReadiness`, `assessDeloadNeed` | `test-prescription-engine` | Appears implemented | Critical | Medium |
| R4 | Pain blocks progression and precedes deload | DECISION_ENGINE, PROJECT non-goals | Safety | engine hard-safety path | `test-pain-deload-precedence` | Appears implemented | **Critical** | Medium |
| R5 | Pain-blocked exercise executable only after confirmed, identity-verified substitute | DECISION_ENGINE | Safety | app runtime + engine | `test-app-integration-contracts` | Appears implemented | **Critical** | Low — complex revalidation path |
| R6 | Warm-ups excluded from volume, PR, progression, grade | PROJECT terminology, DECISION_ENGINE | Multiple | `isWorkingSet` consumers | `test-workout-grade` **stubs `isWorkingSet` to `()=>true`** | **Unable to determine** | **Critical** | **Low** |
| R7 | Progression requires consecutive comparable exposures + valid technique + target effort + pain-free | DECISION_ENGINE | Progression | `determineProgressionDecision` | engine tests | Appears implemented | High | Low-Medium |
| R8 | `progress` label invalid unless a real variable changed | DECISION_ENGINE | Progression | engine + labels | `test-recommendation-regressions` | Appears implemented | High | Low |
| R9 | Two load anchors: latest normal exposure + high watermark; progression capped at watermark | DECISION_ENGINE | Progression | `prescribedLoadFromHistory:4073`, `historyHighWatermark:4051` | `test-set-prescriptions` | Appears implemented | High | Medium |
| R10 | 56-day return gap → conservative restart (~90% of watermark) | DECISION_ENGINE | Progression | `DEFAULT_POLICY:113` | engine tests | Appears implemented | Medium | Medium |
| R11 | `finalPrescription` (not `basePrescription`) drives executable rows; displayed = prepopulated | DECISION_ENGINE | Progression/UI | `setPrescriptionForRole`, `roleSessionPrescriptionLine` | `test-prescription-app-integration` | Appears implemented | **Critical** | Low-Medium |
| R12 | PRs only at submission; warm-ups excluded; resistance-specific semantics | DECISION_ENGINE | PRs | `app-history.js:325` | `test-workout-grade` (stubbed) | **Documentation and code may conflict** on PR taxonomy (docs self-flag NEEDS REVIEW) | High | Low |
| R13 | e1RM peak achievement reuses submission-time PRs, creates no second rule | DECISION_ENGINE §badges | Achievements | `app-history.js:355–358, 513–520` | `test-workout-grade` (stubbed, re-implements formula) | **Multiple implementations may exist** | High | **Low** |
| R14 | Weekly volume: direct 1.0, fractional 0.5/0.25, incidental/isometric 0; family-coalesced | DECISION_ENGINE | Volume | `app-import.js:211`, family ledger | `test-taxonomy-*`, `test-performance` (regex) | Appears implemented | High | Medium |
| R15 | Deloaded work excluded from overload/decline flags | DECISION_ENGINE | Volume/fatigue | `fatigueFlags:311` | thin | Appears partially verified | High | Low |
| R16 | Session hard caps: 18 working sets, 2 exercises/muscle/day | DECISION_ENGINE §planner | Planner | engine construction | engine tests | Appears implemented | Medium | Medium |
| R17 | Same canonical exercise invalid twice in one day; allowed across days | PROJECT, DECISION_ENGINE | Planner | `guided-mesocycle.js` | schema/contract tests | Appears implemented | Medium | Medium |
| R18 | Muscle scope omissions require explicit `scopeConfirmed` | DECISION_ENGINE | Planner | engine + planner UI | engine tests | Appears implemented | Medium | Medium |
| R19 | Submitted snapshots byte-immutable; no backfill or checksum refresh | DECISION_ENGINE | Persistence | app import/history boundary | `test-recommendation-legacy-compatibility` | Appears implemented | **Critical** | Medium |
| R20 | Backup import atomic; rejection leaves state, revision, caches untouched | DECISION_ENGINE, ARCHITECTURE | Import | `app-import.js`, `backup-contract.js` | `test-backup-contract`, security suites | Appears implemented | **Critical** | Medium |
| R21 | Any cross-file runtime contract change advances `CACHE_NAME` | ARCHITECTURE | Packaging | `sw.js` | `test-service-worker-cache`, `-update-contract` | Appears implemented | High | Medium |
| R22 | Root and `www/` stay synchronized | ARCHITECTURE | Packaging | `sync:web`, `verify:pwa` | `verify:pwa` | **Appears implemented** — verified exact today | Medium | **High** |
| R23 | lb/kg switch converts atomically, retains provenance, round-trips stably | ROADMAP (COMPLETED) | Units | `app-foundation.js` resistance helpers | `test-resistance-model` | Appears implemented | High | Medium |
| R24 | Personal health data never enters git or deployment | AGENTS, PROJECT | Privacy | `.gitignore`, `.vercelignore`, `check:privacy` | `check:privacy`, `test-native-packaging-privacy` | Appears implemented | **Critical** | Medium-High |
| R25 | Workout cloud upload requires separate default-off consent | PROJECT, push-backend | Sync | `app-sync.js`, `api/sync/*` | `test-sync-consent` | Appears implemented | High | Medium |
| R26 | Engine unavailable → hold base plan, never invent a score | DECISION_ENGINE | Readiness | app adapter | `test-workout-safety` (regex on copy string) | Appears implemented | High | Low-Medium |
| R27 | Public test gate passes | ROADMAP "50/50" | CI | `scripts/run-public-tests.js` | — | **Documentation appears obsolete** | High | **High** |

---

## 6. Build and test baseline

### Commands run

| Command | Result | Notes |
| --- | --- | --- |
| `npm i -g vercel` | Success — Vercel CLI 57.0.0 | Environment setup, not repo change |
| `npm run lint` | **Pass** | 185 JS, 3117 JSON, 0 inline scripts. Notes that TS is unchecked by this gate |
| `npm test` (`run-public-tests.js`) | **Fail — 48/50** | Discovers 51 `test-*.js`, excludes 1 private-only, runs 50 |
| `node scripts/test-research-archive-integrity.js` | **Fail** | `tar: Cannot connect to C: resolve failed` — exit 128 |
| `node scripts/test-research-workbook-determinism.js` | **Fail** | Same root cause |
| App launch (`npm run dev`, port 8765) | **Pass** | Server was already running; reused |
| Browser: 4 destinations + 3 Progress subviews + 2 legacy hashes | **Pass** | Zero console errors, zero page errors, correct legacy hash normalization (`#charts` → Progress/lifts, `#dashboard` → Progress/overview) |
| Root ↔ `www/` checksum comparison (15 files) | **Pass** | All identical |
| `git status` | Clean apart from review additions | No production files modified |

### Not run this stage

- `npm run audit:ui` (Playwright, 244-case matrix) — long-running; deferred to Stage 3
- `npm run test:private` — requires git-ignored personal pipeline artifacts, unavailable and correctly so
- `npm run check:public` full suite — the two failing harnesses would block it at the `test:public` step
- `npm run release:verify` — blocked by the same
- Type checking — there is no production typecheck; `redesign:typecheck` covers only the non-production React lab

### Determinism

Tests appear deterministic where they run. `test-recommendation-fuzz.js` (859 lines) is seeded fuzzing rather than random. The two failures are deterministic platform failures, not flakes.

### Can the application be meaningfully reviewed in its current state?

**Yes.** It builds (trivially — no build step), runs clean, and the domain modules are UMD and directly `require`-able from Node, which makes constructing behavioral review harnesses in Stage 2 straightforward. That is a significant advantage.

### Temporary changes made

1. Created `.claude/launch.json` (dev-server config for the review tooling). **Non-production, untracked.** Remove if unwanted.
2. Created `CLAUDE.md` at repo root (from an earlier request in this session). **Non-production, untracked.**
3. Installed Vercel CLI globally. **Environment only.**
4. The two failing tests created and then cleaned up `artifacts/research-*` temp directories. No residue.

No production file was modified.

---

## 7. Risk register

Ranked by review priority for Stages 2–3.

| Rank | System | Risk basis | What deep review must prove |
| --- | --- | --- | --- |
| **1** | **Progression & set-target generation** (`setPrescriptionForRole`, `prescribedLoadFromHistory`, `historyHighWatermark`, `determineProgressionDecision`) | Highest user impact — wrong output means wrong weight on the bar. Highest complexity. Two load anchors, role-specific rows, conditional top-set/back-off gating, 56-day return logic. Tests exist but several are source-regex. Failure is *silent*: a subtly wrong target looks plausible | That displayed target == prepopulated field == what the engine decided, for straight sets, top/back-off, drop sets, returns after gaps, and below/above watermark cases |
| **2** | **Warm-up vs working-set classification** (`isWorkingSet`) | Touches volume, PRs, progression, grades, and achievements simultaneously. One misclassification corrupts five downstream systems. **The primary badge test stubs this predicate to always-true** (R6) | That warm-ups are excluded from every one of the five consumers, including imported Strong data where classification provenance differs |
| **3** | **Pain / deload / readiness precedence** | Safety-critical. Wrong precedence produces actively harmful guidance (progressing a painful lift). Interacting rules with documented ordering | That pain precedes deload, that a single marker cannot cascade, that substitution revalidation cannot silently fall back, and that readiness never mutates the base plan |
| **4** | **Estimated-1RM and PR calculation** | Confirmed multi-site implementation with inconsistent gating (Finding 3). Directly user-visible on charts, PRs, and achievement badges — three surfaces that must agree | That every surface reports the same e1RM for the same set, and that the resistance-type gating is intentional and identical |
| **5** | **Derived-cache invalidation** (`analysisRevision`) | Stale cache = contradictory numbers across screens with no error. Depends on manual discipline across 8 files. Very hard to detect; easy to reproduce only under specific mutation orders | That every mutation path calls `invalidateCompletedAnalysis()`, enumerated exhaustively |
| **6** | **Active-workout persistence & interruption recovery** | Data-loss potential. Three state locations, debounced writes, dual-store conflict ranking, pagehide handling | That no interleaving of edit → suspend → reload → resume loses or duplicates sets |
| **7** | **Import classification (Strong CSV)** | Imported data feeds every downstream calculation. Unit provenance, role classification, identity drift, and resistance inference all happen here | That imported history produces the same downstream numbers as natively logged equivalent history |
| **8** | **Weekly volume & family projection** | Fail-closed design is good, but the taxonomy → family → total chain has several rounding and coalescing rules that must not double-count | That family coalescing counts each exercise once per family and that rounding occurs only at final exposure |
| **9** | **Guided mesocycle viability** | High complexity, but failure is visible and non-destructive (a bad plan is inspectable before creation) | That blockers genuinely block and that status is computed once from a shared object |
| **10** | **Backend sync / push lifecycle** | Privacy-sensitive, but write-only and consent-gated. Repository-side contracts look strong; production state is unverifiable from the repo | Deferred — needs external service access |

---

## 8. Confirmed findings

### Finding 1 — Public test gate fails on Windows; ROADMAP claims it passes

- **Severity:** Medium
- **Confidence:** High (reproduced directly)
- **Files:** `scripts/test-research-archive-integrity.js:21`, `scripts/test-research-workbook-determinism.js:22,62`; claim in `docs/ROADMAP.md:77`
- **Evidence:**
  ```
  Public test gate failed (2/50):
  - test-research-archive-integrity.js: exit 1
  - test-research-workbook-determinism.js: exit 1

  tar: Cannot connect to C: resolve failed   (exit 128)
  ```
  Both harnesses shell out to `tar -xf C:\...\repository-lf.tar -C C:\...`. GNU tar interprets a leading `C:` as a `host:path` remote spec and attempts a network connection.
- **Expected:** `npm test` is the primary local gate; it should pass on a supported development platform. `docs/ROADMAP.md:77` states "50/50 public harnesses ... pass".
- **Observed:** 48/50 on Windows. The claim holds only on the Linux CI runner.
- **Consequence:** Two-fold. (a) The developer's local gate is permanently red, which trains reviewers to ignore failures — the most expensive kind of test debt. (b) A documentation status claim is measurably false, which is direct evidence that "VERIFIED" labels in this repository track CI runs, not local reality.
- **Next step:** Pass `--force-local` to tar, or invoke it with a POSIX-style path, or use Node's own tar handling. Then re-assert the 50/50 claim with the platform stated.

### Finding 2 — Test suite is dominated by source-text assertions and stubbed function extraction

- **Severity:** High
- **Confidence:** High
- **Files:** `scripts/read-application-contract-source.js`; `scripts/test-workout-safety.js:1–30`; `scripts/test-workout-grade.js:165–195`; `scripts/test-performance.js:68–69`; 28 of 51 harnesses use `readFileSync`
- **Evidence:**
  - `read-application-contract-source.js` concatenates `index.html` plus all eight runtime segments into one string. Harnesses then regex it. Counts of `assert.match`/`doesNotMatch` per file: `test-workout-safety.js` 59, `test-performance.js` 59, `test-prescription-app-integration.js` 53, `test-app-integration-contracts.js` 34.
  - Representative assertions:
    ```js
    // test-workout-safety.js:8 — asserts a function NAME is absent
    assert.doesNotMatch(html, /function readinessScore\(|function readinessBandStatus\(/, ...);

    // test-performance.js:68 — asserts source contains a cache lookup
    assert.match(html, /function weeklyMuscleVolume[\s\S]*weeklyVolumeCache\.has\(cacheKey\)/, ...);
    ```
  - Where code *is* executed, it is extracted by name and given hand-written stubs. In `test-workout-grade.js` the achievement-badge factory is injected with:
    ```js
    () => true,                                  // isWorkingSet  — warm-ups always count
    (set) => set.load,                           // resistanceLoad — production sets use set.weight
    (set) => set.load * (1 + set.reps / 30),     // estimatedOneRepMax — re-implemented
    (sets) => [...sets].sort(...)[0] || null     // bestWorkoutSet — re-implemented
    ```
    and the fixture sets use `{ reps: 10, load: 80 }` — a shape `createSet` never produces (`app-foundation.js:2404–2417` produces `weight`, not `load`).
- **Expected:** Tests should fail when behavior becomes wrong and pass when it is right.
- **Observed:** Large parts of the suite fail when *identifiers or source text* change, and pass when *behavior* changes. The badge test cannot detect a warm-up-exclusion regression (its stub asserts the opposite rule), cannot detect an e1RM formula change (it supplies its own), and cannot detect a resistance-accessor bug (it bypasses the real one).
- **Consequence:** The suite's 48 green results are much weaker evidence of correctness than their count suggests. This directly undermines confidence in every "VERIFIED against tests" claim in the documentation. It also makes safe refactoring harder, not easier — renaming a private helper breaks tests that never tested it.
- **Next step:** For Stage 2, do not treat these as coverage. Build independent behavioral harnesses that `require()` the real UMD modules and, where app-layer functions are needed, extract them together with their *real* collaborators rather than stubs.
- **Fair qualification:** the `test-recommendation-*` family (9 harnesses, ~5,700 lines including seeded fuzzing) and `test-prescription-engine.js` do execute the real engine. The problem is concentrated in the app-layer and contract tests, not universal.

### Finding 3 — Estimated-1RM has four production implementations with inconsistent resistance gating

- **Severity:** Medium
- **Confidence:** High for the duplication and the gating inconsistency; **not established** that it currently produces divergent user-visible numbers
- **Files / functions:**
  - `app-foundation.js:2750 estimatedOneRepMax(set)` — `set.weight * (1 + set.reps / 30)`, reads `set.weight` **directly**
  - `app-history.js:40 workoutSetPerformanceValue(set, resistanceType)` — resistance-aware, reads `resistanceLoad(set, type)`
  - `prescription-engine.js:4055 historyHighWatermark` — `set.load * (1 + max(0, set.reps) / 30)`
  - `scripts/personal-fitness/normalize-workouts.js:197` — `round(load * (1 + reps / 30), 3)`
- **Evidence of inconsistent gating among callers of the shared helper:**
  ```js
  app-foundation.js:3158  ["external","bodyweight_plus_load"].includes(type) ? estimatedOneRepMax(set) : ...
  app-analysis.js:965     ["external","bodyweight_plus_load"].includes(type) ? estimatedOneRepMax(set) : ...
  app-analysis.js:1142    type === "external" ? estimatedOneRepMax(set) : ...      // narrower
  app-history.js:355      if (resistanceType === "external") { ... }               // narrower
  ```
  `resistanceLoad` (`app-foundation.js:2934`) resolves `bodyweight_plus_load` to `addedLoad ?? weight` and `assisted_bodyweight` to `assistanceLoad ?? weight`. `estimatedOneRepMax` ignores this entirely and always reads `set.weight`.
- **Expected:** One resistance-aware performance function, used identically by charts, PRs, achievements, and the engine.
- **Observed / inferred:** For `bodyweight_plus_load`, two of the four call sites feed raw `set.weight` into an Epley formula while every neighbouring calculation uses `addedLoad`. App-created data appears to keep the two fields synchronized (`createSet` at `app-foundation.js:2417`; the weight-edit handler at `app-workout.js:930` patches `addedLoad` alongside `weight`), which is why I am **not** claiming a live defect. The exposure is data that did not pass through those paths — imports, backups, legacy records, or any future write that sets one field without the other.
- **Consequence:** Charts (`app-analysis.js:1142`, external only) and lift analysis (`:965`, external + added-load) can legitimately disagree about whether a bodyweight-plus-load exercise has an e1RM at all. Combined with the achievement badge path, this is a live "same question, different answers on different screens" risk.
- **Next step (Stage 2):** Construct a `bodyweight_plus_load` set with `weight !== addedLoad` and compare the value reported by the chart, the lift analysis, the PR list, and the achievement disclosure. Then consolidate to one resistance-aware helper.

### Finding 4 — `docs/ROADMAP.md` "In progress" section references a non-existent artifact

- **Severity:** Observation
- **Confidence:** High
- **Files:** `docs/ROADMAP.md:81`
- **Evidence:** "**NEEDS REVIEW:** the user referred to an authoritative Markdown file inside a `program` folder, but no such folder/file exists". Confirmed — no `program/` directory exists.
- **Consequence:** Minor, and the document already handles it correctly by flagging rather than inventing. Noted only because it is an unresolved product-owner question that Stage 2 depends on: if such a document exists outside the repo, it may contain authoritative rules that contradict `DECISION_ENGINE.md`.
- **Next step:** Ask the product owner whether an external rules document exists.

---

## 9. Cross-system contradiction risks

| # | Potential contradiction | Classification | Basis |
| --- | --- | --- | --- |
| C1 | Chart e1RM vs lift-analysis e1RM vs PR e1RM for `bodyweight_plus_load` | **Strong contradiction risk** | Finding 3 — gating differs at `app-analysis.js:1142` vs `:965` vs `app-foundation.js:3158` |
| C2 | Recommendation summary vs prepopulated live set target | **Appears consistently centralized** | Documented as deliberately unified through `finalPrescription` → generated rows → both surfaces (`DECISION_ENGINE.md:102`). Architecture supports the claim. Verify behaviorally in Stage 2 |
| C3 | Readiness adjustment vs progression decision | **Appears consistently centralized** | Single evaluator confirmed at `prescription-engine.js:1432`; app layer is an adapter (`app-import.js:375`). Textually enforced by `test-workout-safety.js:8` |
| C4 | Deload vs programmed light session | **Possible contradiction risk** | Both produce reduced prescriptions; docs state deload/readiness supersede the history anchor and that light sessions must not collapse explicit roles. Interaction not verified |
| C5 | Warm-up classification vs volume/PR/grade attribution | **Strong contradiction risk** | R6 — the one test covering badge attribution stubs `isWorkingSet` to always-true, so the exclusion rule is untested in that path |
| C6 | Stored PR (submission) vs recomputed prior high-water (display) | **Possible contradiction risk** | `submitWorkoutPrs:325` computes and stores; `workoutPrPreviousHighWater:513` independently recomputes for the badge disclosure using different filters (`priorWorkoutPrSets` adds `!set.skipped` and `sessionComesBefore`, which the submission path does not) |
| C7 | Cached derived metrics vs freshly computed | **Possible contradiction risk** | R2 — single manual invalidator; correctness unenforced |
| C8 | Template prescription vs generated live session | **Appears consistently centralized** | Deterministic day-based template IDs; guided draft is structural truth. Not behaviorally verified |
| C9 | Mesocycle weekly rules vs per-session hard caps | **Appears consistently centralized** | Docs explicit that frequency never overrides set caps (`DECISION_ENGINE.md:177`); placement rejects cap-exceeding allocations |
| C10 | Archived/excluded history vs recommendation inputs | **Possible contradiction risk** | "Last time" deliberately searches beyond the six-month window while trend analysis does not — intentional, but the boundary is subtle and easy to get wrong in one of the two |
| C11 | Imported Strong history vs natively logged history | **Possible contradiction risk** | Different classification provenance, unit provenance, and an explicit ordered-position fallback when roles differ |

No contradiction is classified as **Confirmed** — none was traced to a reproduced divergent output during this stage.

---

## 10. Open investigative questions

**Requiring deeper code tracing:**

1. Does every path that mutates `data.sets` / `data.exercises` / `data.sessions` call `invalidateCompletedAnalysis()`? (Enumerate all mutation sites across the 8 segments.)
2. Can `set.weight` and `set.addedLoad` / `set.assistanceLoad` diverge through any write path — import, backup restore, history edit, template application, or unit conversion?
3. Do `submitWorkoutPrs` and `priorWorkoutPrSets` apply identical filters? The latter adds `!set.skipped` and `sessionComesBefore`; the former uses `priorSessionIds` from `activeHistorySessions` only.
4. Is `isWorkingSet(set, context)` consistent across its `"pr"`, `"volume"`, `"progression"`, and grading contexts, and what does the second argument actually switch on?
5. When Strong-imported role classification differs from programmed structure, does the "ordered working-set position" fallback ever cross exercise boundaries?

**Requiring behavioral testing:**

6. Does the readiness adjustment provably leave `basePrescription` and the mesocycle unmutated? (Deep-equality before/after.)
7. Does a 57-day gap produce the documented conservative restart, and is the boundary inclusive or exclusive at exactly 56?
8. Does a planned deload session provably avoid generating a "performance declined" fatigue flag?
9. Does family coalescing count an exercise exactly once per family when it has both a direct and a fractional relationship into the same family?

**Requiring product-owner input:**

10. Which user-facing PR categories should exist? (Repository self-flags this — `DECISION_ENGINE.md:179`, `ROADMAP.md` NEEDS REVIEW #4.)
11. Does an authoritative rules document exist outside the repository (the missing `program/` folder, `ROADMAP.md:81`)?
12. What does "sync" promise — backup, restore, or multi-device? This blocks the sync/restore contract and affects data-loss expectations.
13. Is the male-specific research scope intentional for the product's audience?
14. Is the "Dual Track" redesign an active near-term migration or a parked decision? This materially changes whether Stage 2/3 findings should target the current shell or the adapter boundary.

---

## 11. Stage 2 and Stage 3 review plan

### Stage 2 — Recommendation, progression, readiness, deload, mesocycle, and exercise-science logic

**Systems:** prescription engine decision path, progression/hold/light/deload distinctions, readiness evaluation and adjustment, load anchors, pain precedence and substitution, guided mesocycle viability, taxonomy/family credit.

**Required documents:** `docs/DECISION_ENGINE.md` (primary), `docs/training-prescription-data.md`, `research_database/METHODOLOGY.md`, `schemas/recommendation-snapshot.v1.schema.json`, `schemas/exercise-prescription.v2.schema.json`.

**Required files:** `prescription-engine.js` (focus: `evaluateReadiness:1432`, `readinessAdjustmentFor:1473`, `historyHighWatermark:4051`, `prescribedLoadFromHistory:4073`, `determineProgressionDecision`, `assessDeloadNeed`, `assessExerciseStaleness`, `DEFAULT_POLICY:100–135`); `app-analysis.js:413 setPrescriptionForRole`; `app-foundation.js coachTargetForTemplateExercise`; `app-views.js roleSessionPrescriptionLine`; `guided-mesocycle.js`; `programming-family-ledger.js`.

**User flows:** template start → readiness preview → adjusted targets; second session of the same lift after full completion (should progress); after partial completion (should hold); after 57+ days (should restart conservatively); with pain logged (should block and demand substitute); with a single poor HRV reading (must not deload).

**Tests to run:** `test-prescription-engine`, `test-recommendation-*` (all 9), `test-set-prescriptions`, `test-prescription-app-integration`, `test-pain-deload-precedence`, `test-hypertrophy-score`, `test-taxonomy-*`.

**New harnesses required:** Yes, and this is the critical dependency. Build a scenario harness that `require()`s `prescription-engine.js` directly (it is UMD and Node-loadable) and drives full history fixtures through the real decision path, asserting on *outputs* — prescribed load, reps, role rows, `progressionAction`, `progressionRule` — not source text. Separately, extract `setPrescriptionForRole` together with its real collaborators to verify that the engine decision and the prepopulated row agree (C2).

**Questions to answer:** R2, R4, R7, R8, R9, R10, R11 from the matrix; open questions 6–9.

**Product-owner dependencies:** Q10 (PR taxonomy), Q11 (external rules doc), Q13 (population scope).

**Exit criteria:** For each of progression / hold / light / deload / readiness-adjusted, a reproducible scenario demonstrating the correct decision *and* a reproducible near-miss scenario demonstrating the boundary. Pain precedence proven to sit above deload. `finalPrescription` proven to be the sole driver of executable rows. Every `DEFAULT_POLICY` constant traced to at least one behavioral assertion.

### Stage 3 — Logging, persistence, imports, historical windows, derived metrics, recovery, archival

**Systems:** active workout persistence and interruption recovery, dual-store conflict resolution, Strong/backup import, warm-up classification, six-week/six-month windows, weekly volume, PRs, achievements, cache invalidation, delete/archive.

**Required documents:** `docs/ARCHITECTURE.md`, `docs/performance.md`, `backup-contract.js` allowlists, `docs/DAILY_BROWSER_QA.md`.

**Required files:** `app-foundation.js` (`createSet:2400`, `resistanceLoad:2934`, `estimatedOneRepMax:2750`, `completedAnalysisIndex:2531`, `activeHistorySessions:2571`, `invalidateCompletedAnalysis:2458`, startup ranking `~1077–1175`); `app-history.js` (`submitWorkoutPrs:325`, `calculateWorkoutAnalysis:199`, `workoutPrPreviousHighWater:513`); `app-import.js` (`weeklyMuscleVolume:211`, `fatigueFlags:311`); `app-workout.js:930`.

**User flows:** log → suspend → reload → resume mid-workout; log → force-close before submit; import Strong CSV in kg with lb display; import a full backup that fails validation at the last record; edit a submitted session; switch units with mixed-provenance records; complete a workout containing warm-ups, a drop set, and an assisted-bodyweight exercise.

**Tests to run:** `test-runtime-persistence`, `test-domain-integrity`, `test-backup-contract`, `test-resistance-model`, `test-workout-grade`, `test-performance`, `test-service-worker-*`, plus the full `npm run audit:ui` Playwright matrix.

**New harnesses required:** Yes. (a) A cache-invalidation audit: enumerate every `data =` reassignment and cross-check against `invalidateCompletedAnalysis()` calls. (b) A resistance-shape harness constructing sets where `weight !== addedLoad` and comparing all four e1RM consumers (Finding 3 / C1). (c) A warm-up exclusion harness using the *real* `isWorkingSet` against all five consumers (R6 / C5). (d) An interruption matrix driving IndexedDB/localStorage interleavings.

**Questions to answer:** R6, R12, R13, R14, R15, R19, R20, R23; open questions 1–5.

**Product-owner dependencies:** Q12 (sync/restore promise) — determines whether data-loss scenarios are acceptable or critical.

**Exit criteria:** No interleaving of edit/suspend/reload loses or duplicates a set. Warm-ups proven excluded from all five consumers. All e1RM surfaces proven to agree for every resistance type. Every mutation path proven to invalidate derived caches. Imported and natively-logged equivalent histories proven to produce identical downstream metrics.

### Suggested ordering rationale

Stage 2 before Stage 3 is correct as specified, with one adjustment: **resolve Finding 2 first.** Both stages depend on being able to trust test results, and the current suite's source-regex character means neither stage can rely on "the tests pass" as evidence. Building one solid behavioral harness pattern at the start of Stage 2 will pay for itself across both stages.

---

## Completion note

This stage did not modify production behavior. Two untracked, non-production files were added (`CLAUDE.md`, `.claude/launch.json`) and the Vercel CLI was installed globally. The public test gate's two failures are pre-existing and platform-related, not caused by this review.
