# Roadmap

## Metadata

- **Purpose:** Evidence-based status, priorities, defects, debt, and open product/research questions
- **Last verified:** 2026-07-11
- **Repository:** `main` @ `7c52a2b`
- **Verification status:** VERIFIED against current branch; dates/owners and unrecorded priorities are intentionally omitted
- **Related:** [Project](PROJECT.md), [architecture](ARCHITECTURE.md), [decision engine](DECISION_ENGINE.md), [UI/UX](UI_UX.md)

## Living-document rule

Read this document before starting implementation to identify current status, dependencies, risks, and open decisions. Update it in the same task whenever work is added, started, completed, removed, reprioritized, blocked, or found to differ from documented intent. Completed implementation must move to an accurate completed state; newly discovered bugs, debt, or uncertainty must not remain only in code comments or the final report.

Priority labels reflect risk/dependency where clear; otherwise they are **NEEDS REVIEW**. No owners or delivery dates are established.

## Current product status

The app is a tested local-first PWA/Capacitor workout tracker with templates, active logging, submission/history/editing, progress/volume/fatigue analytics, recovery guidance, versioned evidence-backed prescriptions, private aggregate import, and optional Web Push/workout mutation upload. The full `npm test` suite passes on `main` @ `7c52a2b` (2026-07-11). Direct wearable sync, comprehensive nutrition logging, account/cloud restore, and production/device verification are incomplete or unverified.

All user-facing work now has a mandatory hosted-site browser-verification gate. A work log may say **Complete** only after local validation, intended-branch deployment, and the affected hosted flow has passed mobile/desktop browser checks with console/runtime review. See `docs/DAILY_BROWSER_QA.md` and `docs/WORK_LOG_TEMPLATE.md`.

## Recently completed

| Item | Status / priority | Acceptance evidence | References / docs |
| --- | --- | --- | --- |
| Unified prescription snapshot across surfaces | **COMPLETED** / High | Template, coach, chart, live workout, and history share immutable versioned recommendation; integration/schema tests pass. | `prescription-engine.js`, root `schemas/`, `scripts/test-prescription-app-integration.js`; update Architecture/Decision Engine on change. |
| Conservative readiness and scoped deload safety | **COMPLETED** / High | Single HRV/nutrition signal cannot force systemic deload; one-day changes preserve base/mesocycle. | Engine and safety tests; update Decision Engine/UI. |
| Explicit workout lifecycle and history integrity | **COMPLETED** / High | Active/cancel/submit confirmation, submitted-only analytics, edit confirmation, draft recovery. | `index.html`, safety/domain/performance tests; update UI/Architecture. |
| Rest-completion lifecycle | **COMPLETED** / High | Exact five-second default notice, deduplicated effects, foreground/background reconciliation tests pass. | `rest-completion-controller.js`, `sw.js`, rest tests; update UI/Architecture/push docs. |
| Research/private evidence contracts | **COMPLETED** / High | Versioned schemas, build/validation, adapters, and private/public boundary. | `research_database/`, `personal_fitness_data/`, data tests; update Architecture/Decision Engine/training map. |
| Safe lb/kg conversion | **COMPLETED** / High | Atomic app-data conversion, source-unit prescription adaptation, immutable private/raw packages, stable round trip, and refreshed snapshot integrity tests. | `index.html`, `prescription-engine.js`, resistance/prescription tests; Architecture/UI. |
| Readiness hierarchy and canonical evaluator | **COMPLETED** / High | Readiness renders above Today’s Plan; duplicate fallback scorer removed; engine-unavailable behavior holds conservatively; illness guardrail preserved. | `index.html`, workout-safety and prescription tests; Decision Engine/UI. |
| Full-program mesocycle planner and Charts control redesign | **COMPLETED** / High | Portfolio-first slots, dynamic program-fit scoring, distributed-session review, traceable sources/exclusions, protected lifecycle, Base Session Intent, and custom recalculating Charts controls have engine/schema/integration coverage. | `prescription-engine.js`, `index.html`, research DB 1.1.0, prescription tests; Decision Engine/Architecture/UI/data map. |
| Balanced mesocycle volume, split construction, and planner hierarchy | **COMPLETED** / High | Evidence-derived weekly set/frequency allocation, direct/indirect review, split anchors, consecutive-heavy blocking, engine-level activation guard, presentation-label boundary, candidate hierarchy, and Templates → Planner → History order are tested. | Engine 2.2.0, mesocycle schema 2.1.0, planner UI and prescription/UI audits; Decision Engine/Architecture/UI. |
| User-controlled mesocycle muscle scope | **COMPLETED** / High | Every consolidated muscle group is selectable; exclusions persist, major/smaller explanations differ, add-back is available, and plan/activation requires explicit omission confirmation. | Engine 2.3.0, mesocycle schema 2.2.0, planner UI and prescription tests; Decision Engine/Architecture/UI. |
| Responsive Templates and planner disclosure | **COMPLETED** / High | Initial Templates rendering defers hidden template editors, full candidate/session reviews, history analysis, and historical detail cards; muscle-scope taps remain local; the current editable mesocycle is selected by lifecycle state instead of array position. | `index.html`, performance and prescription-integration tests; Architecture/UI/performance notes. |
| Mesocycle workflow, equipment, and taxonomy refinement | **COMPLETED** / High | Eight dependency-ordered stages, explicit All Equipment, complete AND/OR equipment filtering, muscle education, structured slots/volume, meaningful comparison, no Unknown badges, and mechanics-aware redundancy are implemented and tested. | Engine/schema/UI, prescription and browser audits; Decision Engine/Architecture/UI/data map. |
| Mesocycle planner refinement and sustainability guardrails | **COMPLETED** / High | Compact purpose/numeric/equipment setup, seven capability bundles over detailed requirements, neutral assignment metadata, explainable score disclosure, separated session cards, severity-grouped validation, mechanics-aware redundancy, and unknown-safe review are implemented and tested. The planner remains in Templates after an explicit mobile information-architecture review. | `index.html`, `prescription-engine.js`, prescription/integration/performance/browser tests; Decision Engine/Architecture/UI. |

## In progress

No repository artifact identifies an actively assigned implementation item. **NEEDS REVIEW:** the user referred to an authoritative Markdown file inside a `program` folder, but no such folder/file exists; `docs/DECISION_ENGINE.md` is the canonical program-rules document under current repository conventions.

## Next priorities

### Place readiness before Today’s Plan — completed

- **Status:** COMPLETED
- **Priority:** High
- **Area/dependencies:** Workout UI; confirm desired hierarchy/copy.
- **Acceptance criteria:** readiness summary and concise guidance render before Today’s Plan in start and active flows; current plan remains visible; UI/safety tests assert order; no recommendation semantics change.
- **References:** `index.html` `renderWorkout`, `renderTodayPlan`, `renderRecoveryPanel`; `docs/UI_UX.md`.
- **Docs:** UI/UX and this roadmap.

### Consolidate readiness evaluators — completed

- **Status:** COMPLETED
- **Priority:** High (safety/drift)
- **Area/dependencies:** Decision engine and app adapters; preserve current tested outcomes.
- **Acceptance criteria:** one canonical normalized evaluator feeds labels and adjustments; missing/conflicting data behavior is tested; historical snapshots remain stable.
- **References:** `prescription-engine.js:evaluateReadiness`, `index.html:readinessScore`, `readinessBandStatus`, `recoveryRecommendationForSession`.
- **Docs:** Decision Engine, Architecture, UI/UX.

### Define sync/restore product contract

- **Status:** NEEDS REVIEW
- **Priority:** High (data expectations/privacy)
- **Area/dependencies:** API, local persistence, privacy; decide backup-only versus cross-device restore/account model.
- **Acceptance criteria:** product decision recorded; retention/encryption/deletion and conflict behavior specified; UI labels match capability; restore endpoint/UI implemented and tested if promised.
- **References:** `api/sync/workout.js`, `index.html` sync queue, `docs/push-backend.md`.
- **Docs:** Project, Architecture, UI/UX, privacy/support, roadmap.

### Add browser-level critical-flow testing

- **Status:** PARTIALLY IMPLEMENTED
- **Priority:** High
- **Area/dependencies:** Testing tooling/CI decision.
- **Current implementation:** **IMPLEMENTED:** repository-owned Playwright coverage checks all five primary destinations at mobile/desktop viewports, visual baselines, axe A/AA, overflow/clipping, console errors, source-style ceilings, and documentation presence on a weekly/manual GitHub Actions schedule. **PARTIALLY IMPLEMENTED:** deterministic template start through submission/history/chart, reload persistence, unit toggling, modal focus restoration, offline transitions, and data-heavy edge fixtures still need automation.
- **Acceptance criteria:** the daily Codex browser runbook and schedule cover template start → log → confirm submit → summary → history → chart, reload persistence, responsive visual inspection, console errors, and unit toggling without private fixture data. A deterministic repository-owned browser test suite remains proposed.
- **References:** `playwright.config.js`, `tests/ui/ui-audit.spec.js`, `.github/workflows/weekly-ui-audit.yml`, `scripts/generate-ui-audit-report.js`.
- **Docs:** `docs/UI_UX.md`, Architecture, and roadmap.

### Make lb/kg handling semantically safe — completed

- **Status:** COMPLETED
- **Priority:** High (data correctness)
- **Area/dependencies:** Persistence, imports, templates, charts, prescription display; decide canonical storage unit and legacy migration policy first.
- **Acceptance criteria:** switching units converts display values without mutating meaning; saved records retain unambiguous provenance; imports preserve source units; round-trip lb → kg → lb is stable; volume/PR/chart calculations and labels agree; tests cover mixed legacy records.
- **References:** `index.html` `toggle-unit`, `weight-unit`, `createSet`, resistance/format helpers; `scripts/test-resistance-model.js`.
- **Docs:** Architecture, UI/UX, Decision Engine if calculation inputs change, and roadmap.

## Later opportunities

| Item | Status | Priority | Acceptance/dependencies | References / docs |
| --- | --- | --- | --- | --- |
| Direct wearable ingestion | **PLANNED / NEEDS REVIEW** | Unknown | Define provider, consent, cadence, baseline, revocation, missing/duplicate/conflict handling before implementation. | `scripts/personal-fitness/normalize-fitbit.js`; Project/Architecture/Decision Engine/privacy. |
| In-app nutrition workflow | **PLANNED / NEEDS REVIEW** | Unknown | Decide adequacy-only vs food/macros; avoid treating nutrition as multiple readiness domains; create privacy/data model. | `normalize-nutrition.js`, nutrition research export, readiness UI; all core docs. |
| Cloud restore or multi-device support | **PLANNED / NEEDS REVIEW** | Unknown | Depends on sync contract and authentication decision. | `api/sync/workout.js`; Project/Architecture/UI. |
| Native notification/haptic integration | **PLANNED** | Unknown | Capacitor plugin choice; demonstrate more reliable device behavior without claiming unsupported Web Push guarantees. | native projects, rest controller; Architecture/UI/push docs. |
| Broader population evidence | **NEEDS REVIEW** | Unknown | Define target populations and rebuild evidence/mappings without extrapolating male-specific rules. | `research_database/METHODOLOGY.md`; Project/Decision Engine. |
| Modularize frontend | **PROPOSED** | Medium | Extract domain/state/view modules with parity tests and no loss of offline simplicity. | `index.html`; Architecture. |

## Bugs and regressions

- **Blank initial screen from removed readiness helper — FIXED:** browser QA reproduced `ReferenceError: readinessBandStatus is not defined`; `renderRecoveryPanel` no longer calls the removed duplicate scorer, and workout-safety coverage prevents recurrence.
- **Exercise metadata normalization — NEEDS REVIEW:** runtime `mesocycle/2.3.0` now normalizes the research database's legacy free-text `equipment` field into complete requirement alternatives and derives joint actions from controlled movement patterns. A future research-database minor release should persist these normalized fields directly for every exercise; restricted personal-only records already fail closed until verified metadata exists.
- No known regression remains for readiness ordering or lb/kg relabeling; retain their tests during future UI/data-model work.
- **Operational status can become stale — OPEN / Medium:** setup/push docs contain “live/complete/verified” claims that local code cannot validate. Replace with a dated verification procedure or re-verify externally. References: `docs/push-backend.md`, `docs/iphone-pwa-personal-coach-setup.md`.
- **Encoding artifacts in older generated/docs text — OPEN / Low:** sequences such as malformed smart quotes appear in existing Markdown output. Correct only where source encoding is confirmed; do not alter research IDs/content. References: existing research/training Markdown.

## Technical debt

- **Monolithic frontend — High:** UI, state, domain calculations, migrations, imports, and integrations share `index.html` (~790 KB).
- **Duplicated packaged assets — Medium:** root and `www/` can drift; `sync:web`/`verify:pwa` must remain mandatory.
- **Readiness adapter drift — Low:** UI copy still adapts engine outcomes; tests must keep it from becoming a second scoring system.
- **Write-only server sync — High:** no read/restore contract.
- **CI coverage remains partial — Medium:** a weekly/manual UI audit workflow now exists; domain tests still lack a general pull-request workflow.
- **Browser/accessibility/native E2E remains partial — High:** Playwright now covers primary routes, snapshots, axe, layout, and console health, but not the complete workout lifecycle, IndexedDB recovery, notifications, screen readers, or physical devices.
- **Unit conversion coverage — Low:** future load-bearing fields must be added to the atomic conversion contract and tests.

## Research and product questions

- Which user-visible PR categories should exist across external, bodyweight, assisted, duration, and distance resistance?
- Should positive readiness merely authorize planned progression (current behavior) or ever change the plan upward? Current safety language says the former.
- Are current operational plateau/regression/fatigue thresholds producing useful outcomes over time?
- Is the male-specific research scope intentional for the product’s long-term audience?
- Should nutrition remain a coarse readiness domain or become a first-class logged dataset?
- What does “sync” promise: delivery redundancy, backup, restore, or multi-device continuity?

## Blocked items

- **Production/backend verification:** blocked on access to current Vercel/Upstash/QStash state and a deliberate external verification; repository evidence is insufficient.
- **Physical iPhone acceptance:** blocked on device/PWA permission testing; follow `docs/iphone-pwa-personal-coach-setup.md` without publishing credentials or personal evidence.
- **App Store release:** blocked on developer accounts, signing, screenshots, privacy declarations, and macOS/Xcode tasks (`store/app-store-notes.md`).

## NEEDS REVIEW register

1. Meaning, retention, privacy, and restore behavior of workout sync.
2. Direct wearable and nutrition product scope.
3. Account/multi-user intent; none is implemented.
4. User-facing PR taxonomy.
5. Production service status and physical-device acceptance.
6. Accessibility and responsive behavior under screen readers, dynamic text, physical safe areas, and keyboard-open states; automated axe/layout coverage is implemented.
7. Population scope beyond male hypertrophy research.
8. Pipeline metadata’s “schema-ready not blended” phrase versus runtime blending.
9. Dates, owners, and priority for items not explicitly ranked above.
