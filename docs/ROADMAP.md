# Roadmap

## Metadata

- **Purpose:** Evidence-based status, priorities, defects, debt, and open product/research questions
- **Last verified:** 2026-07-15
- **Repository:** integrated foundation plus accepted private-import and workout-safety composition
- **Verification status:** VERIFIED against current branch; dates/owners and unrecorded priorities are intentionally omitted
- **Related:** [Project](PROJECT.md), [architecture](ARCHITECTURE.md), [decision engine](DECISION_ENGINE.md), [UI/UX](UI_UX.md)

## Living-document rule

Read this document before starting implementation to identify current status, dependencies, risks, and open decisions. Update it in the same task whenever work is added, started, completed, removed, reprioritized, blocked, or found to differ from documented intent. Completed implementation must move to an accurate completed state; newly discovered bugs, debt, or uncertainty must not remain only in code comments or the final report.

Priority labels reflect risk/dependency where clear; otherwise they are **NEEDS REVIEW**. No owners or delivery dates are established.

## Current product status

- **IMPLEMENTED:** Guided manual mesocycle builder foundation: Templates entry, planning guide, setup, empty days, evidence-ranked exercise selection, working-set controls, move/remove actions, live volume ledger, viability review, exception acknowledgment, and linked-template creation.
- **IMPLEMENTED:** Progressive persisted Guide/Setup/Build/Check/Create navigation; canonical target eligibility; target-muscle effectiveness; evidence-correct volume ranges; prioritized sets remaining; focused pending configuration; same-day duplicate prevention; live distribution guardrails; separate Below/Within/Above status.
- **NEEDS REVIEW:** Advanced day naming, assignment reordering controls, per-muscle maintenance/specialization selectors, and active-mesocycle revision UX remain follow-up refinements. The persisted model reserves priority, override, and revision fields.

The app is a tested local-first PWA/Capacitor workout tracker with templates, active logging, submission/history/editing, progress/volume/fatigue analytics, recovery guidance, versioned evidence-backed prescriptions, private aggregate import, and optional Web Push/workout mutation upload. Accepted foundations now include research database 3.0.0, taxonomy 2.1.0, hardened backend lifecycle contracts, strict transactional imports, separate default-off server-confirmed workout-upload consent, exact-version timer cancellation, fail-closed remote deletion before local clearing, public-only web/native packaging and caching, public CI/release/privacy gates, protected Lift/Dashboard baselines, and the application accessibility/design contract. Direct wearable sync, comprehensive nutrition logging, account/cloud restore, notification-disable orchestration, physical screen-reader/native-device acceptance, and production verification are incomplete or unverified.

All user-facing work now has a mandatory hosted-site browser-verification gate. A work log may say **Complete** only after local validation, intended-branch deployment, and the affected hosted flow has passed mobile/desktop browser checks with console/runtime review. See `docs/DAILY_BROWSER_QA.md` and `docs/WORK_LOG_TEMPLATE.md`.

## Recently completed

| Item | Status / priority | Acceptance evidence | References / docs |
| --- | --- | --- | --- |
| Accessibility, focus, and large-text design contract | **COMPLETED** / High | Initial load does not steal focus; explicit five-tab navigation and a keyboard skip link enter main; quick templates retain native button roles; modal sheets verify/fallback initial focus, trap, and durably restore focus; Dashboard nested Back restores context; Equipment/Scope groups are named with 44 px targets; Lift actions are contextual; reduced motion, forced colors, and exact 320 px/200% reflow pass while protected Lift/Dashboard goldens remain unchanged. | `index.html`, `tests/ui/accessibility-design-regressions.spec.js`, app-integration focus cases, protected-surface suite; UI/Architecture/design specification. |
| Unified prescription snapshot across surfaces | **COMPLETED** / High | Template, coach, chart, live workout, and history share versioned recommendations. Future generation resolves canonical exercise identity and one exact eligible dynamic direct `mg_*` target before prescription; broad reporting projection cannot become the target, typed collision/target failures remain zero-execution, and trusted custom identities require reconciliation. Submitted history bypasses current resolution byte/reference-equivalently; executable active/template reuse must pass schema/checksum, identity, target, and host binding or fail closed without prescribing/caching. | `prescription-engine.js`, `index.html`, root `schemas/`, canonical-adapter/app-integration/browser lifecycle tests; Architecture/Decision Engine/taxonomy report. |
| Runtime forms, charts, and lifecycle integrity remediation | **COMPLETED** / High | Template numeric fields share native `required`, finite HTML/model/import bounds, and one accessible unsaved invalid draft; chart search is cached/lexical and points use scoped opaque activation keys; dual-store save failure renders recovery immediately; one history edit creates one revision/write without blur rerender; submission uses one shared acceptance predicate before router feedback and calculation, suppressing duplicate feedback/effects while retaining the idempotent routed entry attempt. | `index.html`, workout-safety/app-integration/performance contracts, mobile/desktop lifecycle tests; Architecture/UI. |
| Conservative readiness and scoped deload safety | **COMPLETED** / High | Single HRV/nutrition signal cannot force systemic deload; one-day changes preserve base/mesocycle. | Engine and safety tests; update Decision Engine/UI. |
| Historical pain precedence over deload | **COMPLETED** / High | Date-normalized latest or repeated exercise-history pain enters the canonical hard-safety path before deload, blocks the painful original at zero sets/no load, and remains input-order invariant; pain-free regression retains the bounded deload control. | Engine 3.3.7, pain-deload precedence contract, prescription regression/fuzz/science suites; Decision Engine/training map. |
| Explicit workout lifecycle and history integrity | **COMPLETED** / High | Active/cancel/submit confirmation, per-session reentrancy locking, submitted-only analytics, edit confirmation, active-draft recovery, shared tab/Back exit guard, and pagehide/reload protection against persisting an unconfirmed history transaction. Startup ranks valid IndexedDB/fallback state by revision, canonical content, and reliable persistence time; unorderable divergence preserves both copies through ordinary saves until confirmed Clear All. Confirmed conflict clearing avoids an indefinitely pending service-worker-ready wait, deletes both copies, durably writes defaults, announces completion, and remains clear after reload. Edit entry persists the complete stable pre-edit snapshot; concurrent navigation or mutation aborts stale startup without rollback and awaits current-state reconciliation. Numeric history edits avoid rerender, advance exactly one revision for one real change, and explicit Save performs one durable write. External service-worker activation is deferred until Save/Discard plus explicit Update, whose persistence gate refuses a data-losing reload. | `index.html`, mobile/desktop lifecycle regression, app-integration contracts, safety/domain/performance tests; UI/Architecture. |
| Rest-completion lifecycle | **COMPLETED** / High | Exact five-second default notice, deduplicated effects, foreground/background reconciliation tests pass. | `rest-completion-controller.js`, `sw.js`, rest tests; update UI/Architecture/push docs. |
| Research/private evidence contracts | **COMPLETED** / High | Versioned schemas, build/validation, adapters, and private/public boundary. | `research_database/`, `personal_fitness_data/`, data tests; update Architecture/Decision Engine/training map. |
| Research evidence provenance and rule authority | **COMPLETED** / High | Database 3.0.0 carries verified PubMed/PMC identifiers, rule-to-conclusion overlap, evidence/product-policy/safety authority, advisory/allowlisted hard-blocker enforcement, disclosure, deterministic archives, and a deterministic 19-sheet workbook. | `research_database/`, research build/validation/reproducibility tests; Project/Architecture/Decision Engine. |
| Safe lb/kg conversion | **COMPLETED** / High | Atomic app-data conversion, source-unit prescription adaptation, immutable private/raw packages, stable round trip, and refreshed snapshot integrity tests. | `index.html`, `prescription-engine.js`, resistance/prescription tests; Architecture/UI. |
| Guided creation and coaching consistency remediation | **COMPLETED** / High | Total effective sets drive shared muscle status; frequency cannot appear successful when unresolved; review days are inspectable; creation is idempotent and ends in a persistent completion state; prescribed light/reduced work is excluded from decline flags; straight-set progression and recommendation labels require a real delta; pounds use stable 0.5-lb boundaries. | Guided planner, prescription engine, workout/analytics UI, schemas, integration/resistance/set tests; Decision Engine/Architecture/UI. |
| Readiness hierarchy and canonical evaluator | **COMPLETED** / High | Readiness renders above Today’s Plan; duplicate fallback scorer removed; engine-unavailable behavior holds conservatively; illness guardrail preserved. | `index.html`, workout-safety and prescription tests; Decision Engine/UI. |
| Full-program mesocycle planner and Charts control redesign | **COMPLETED** / High | Portfolio-first slots, dynamic program-fit scoring, distributed-session review, traceable sources/exclusions, protected lifecycle, Base Session Intent, and custom recalculating Charts controls have engine/schema/integration coverage. | `prescription-engine.js`, `index.html`, research DB 3.0.0/taxonomy 2.1.0, prescription tests; Decision Engine/Architecture/UI/data map. |
| Balanced mesocycle volume, split construction, and planner hierarchy | **COMPLETED** / High | Evidence-derived weekly set/frequency allocation, direct/indirect review, split anchors, consecutive-heavy blocking, engine-level activation guard, presentation-label boundary, candidate hierarchy, and Templates → Planner → History order are tested. | Engine 2.2.0, mesocycle schema 2.1.0, planner UI and prescription/UI audits; Decision Engine/Architecture/UI. |
| User-controlled mesocycle muscle scope | **COMPLETED** / High | Every consolidated muscle group is selectable; exclusions persist, major/smaller explanations differ, add-back is available, and plan/activation requires explicit omission confirmation. | Engine 2.3.0, mesocycle schema 2.2.0, planner UI and prescription tests; Decision Engine/Architecture/UI. |
| Responsive Templates and planner disclosure | **COMPLETED** / High | Initial Templates rendering defers hidden template editors, full candidate/session reviews, history analysis, and historical detail cards; muscle-scope taps remain local; the current editable mesocycle is selected by lifecycle state instead of array position. | `index.html`, performance and prescription-integration tests; Architecture/UI/performance notes. |
| Mesocycle workflow, equipment, and taxonomy refinement | **COMPLETED** / High | Eight dependency-ordered stages, explicit All Equipment, complete AND/OR equipment filtering, muscle education, structured slots/volume, meaningful comparison, no Unknown badges, and mechanics-aware redundancy are implemented and tested. | Engine/schema/UI, prescription and browser audits; Decision Engine/Architecture/UI/data map. |
| Mesocycle planner refinement and sustainability guardrails | **COMPLETED** / High | Compact purpose/numeric/equipment setup, seven capability bundles over detailed requirements, neutral assignment metadata, explainable score disclosure, separated session cards, severity-grouped validation, mechanics-aware redundancy, and unknown-safe review are implemented and tested. The planner remains in Templates after an explicit mobile information-architecture review. | `index.html`, `prescription-engine.js`, prescription/integration/performance/browser tests; Decision Engine/Architecture/UI. |
| Hard-capped practical mesocycle construction | **COMPLETED** / High | Construction enforces 18 working sets/day and two exercises/muscle/day, prioritizes major direct work, uses taxonomy 2.1 direct/fractional/fatigue semantics, reports schedule capacity, hides non-actionable review noise, and offers constrained regeneration. | Engine 3.0.0, planner UI, prescription/integration/hosted browser tests; Decision Engine/Architecture/UI. |
| Canonical exercise–muscle taxonomy and programming families | **COMPLETED** / High | Taxonomy 2.1.0 classifies all 62 canonical exercises through 151 relationships, retains 23 stable anatomical IDs, and projects them into 20 guided accounting families. The guided ledger selects the strongest qualifying relationship once, keeps local fatigue additive, and rounds only final exposed values. Future frontend generation now consumes the exact identity/default-target adapter without migrating historical broad snapshots. Stable IDs use explicit append epochs plus a fail-closed full source registry. Programming-family historical aggregation/version provenance remains **PLANNED / NEEDS REVIEW**. | Taxonomy source/exports, stable-ID fixture and source registry, canonical adapter, frontend lifecycle, guided planner/volume integration, taxonomy tests; Project/Architecture/Decision Engine. |
| Backend notification/sync lifecycle hardening | **COMPLETED** / High | Installation-scoped timer IDs, timer versions, delivery claims, tombstones, bounded resumable deletion, push-origin allowlisting, TTLs, and atomic consent/state/write checks are implemented server-side. The frontend reconciles cancel-before-schedule completion, checks both push IDs by exact version, preserves deletion/timer authorization until cleanup is confirmed, revokes retained workout copies when consent is disabled, and makes confirmed local clearing perform remote installation deletion first. Account-backed restore and notification-disable orchestration remain **NEEDS REVIEW**. | `api/`, `index.html`, `sw.js`, backend race/privacy, lifecycle-interleaving, sync-consent, and app-integration tests, `docs/push-backend.md`; Project/Architecture. |
| Private-data import and upload-consent hardening | **COMPLETED** / High | Backup/private-evidence files have exact 8 MiB, shape, allowlist, ID/text/count, duplicate/reference, schema/privacy, template numeric-domain, safe revision, and three-source identity-reconciliation gates. Imported ordering metadata is rebased monotonically. Active/template executable snapshots must pass exported schema/checksum plus prepared-engine identity/target validation before the single transactional write; submitted historical snapshots remain unchanged. Conflict-preserved dual stores block import, and export discloses that the selected copy excludes the alternate. Invalid input preserves prior persistence, runtime, revisions, and caches. Hosted private-path discovery is disabled. Workout-mutation queue activity requires separate default-off consent plus immediate epoch invalidation, upload abort, and durable revocation clearing. | `index.html`, privacy/security static and Playwright lifecycle contracts; Project/Architecture/UI/privacy/taxonomy report. |
| Public CI, privacy, and release gates | **COMPLETED** / High | Pull-request/`main` public jobs separate public from ignored private tests, pin Node 22.23.1/npm 10.9.8 and actions by immutable SHA, enforce privacy/workflow/dependency policies, validate research/PWA output, and run Chromium UI audit. | `package.json`, `.github/workflows/`, `scripts/run-*`, workflow/privacy/release tests; Architecture. |
| Workout evidence safety and protected-surface regression composition | **COMPLETED** / High | Confirmed pain-free substitutes must retain one observed/catalog identity and revalidate current equipment, exclusions, scope, and substitution evidence; unexpected engine faults remain non-executable. Empty legacy equipment means Standard Gym while explicit mesocycle restrictions narrow it. Dedicated mobile/desktop Lift and Dashboard behavior/visual baselines protect both reference surfaces without redesign. | `index.html`, safety-integrity and protected-surface Playwright tests; Decision Engine/Architecture/training map. |

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
- **Current implementation:** **IMPLEMENTED:** the backend defines record-specific TTLs, atomic consent/state/write enforcement, a global registry cleared by completed deletion, immediate revocation, resumable deletion, idempotency, and revision conflicts. The frontend separates notification permission from default-off server-confirmed workout-upload consent, reconciles exact-version cancel/schedule interleavings, deletes retained workout copies when consent is disabled, continues 202 installation cleanup across retry/reload/online recovery, and blocks confirmed local clearing until remote deletion and active-timer cancellation succeed. **PLANNED / NEEDS REVIEW:** notification-disable orchestration, account-backed restore, and the irreducible in-flight delivery disclosure remain open product work.
- **Acceptance criteria:** product decision recorded; retention/encryption/deletion and conflict behavior specified; UI labels match capability; restore endpoint/UI implemented and tested if promised.
- **References:** `api/sync/workout.js`, `index.html` sync queue, `docs/push-backend.md`.
- **Docs:** Project, Architecture, UI/UX, privacy/support, roadmap.

### Add browser-level critical-flow testing

- **Status:** PARTIALLY IMPLEMENTED
- **Priority:** High
- **Area/dependencies:** Testing tooling/CI decision.
- **Current implementation:** **IMPLEMENTED:** repository-owned Playwright coverage checks all five primary destinations at mobile/desktop viewports, approved screenshots, axe A/AA, overflow/clipping, console errors, source-style ceilings, documentation presence, native quick-template roles, modal/route focus including hidden-target fallback, Dashboard restoration, guarded browser Back and reload rejection of temporary history edits, revision/timestamp-ranked dual-source recovery, equal-revision and legacy-revisionless conflict preservation, concurrent edit-start rejection plus truthful successful/failed current-state reconciliation, preservation of unrelated debounced state at edit entry, deferred service-worker controller activation, failed-update persistence gating, reduced motion, forced colors, exact 320 px/200% reflow, and dedicated protected Lift/Dashboard behavior and visual baselines. Pull-request/`main` public CI plus the weekly/manual audit own the established release checks. **PARTIALLY IMPLEMENTED:** the complete deterministic template start through submission/history/chart journey, broad reload persistence, unit toggling, offline transitions, data-heavy edge fixtures, and native-only states remain incomplete.
- **Acceptance criteria:** extend the deterministic suite to cover template start → log → confirm submit → summary → history → chart, reload persistence, console errors, unit toggling, and remaining offline/native states without private fixture data or protected-surface redesign. The non-protected Settings goldens were intentionally reviewed and refreshed after the duplicate notification-area cloud control was removed; the separate Data control remains tested.
- **References:** `playwright.config.js`, `tests/ui/ui-audit.spec.js`, `tests/ui/protected-surfaces.spec.js`, `tests/ui/accessibility-design-regressions.spec.js`, `.github/workflows/weekly-ui-audit.yml`, `scripts/generate-ui-audit-report.js`.
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
- **Stable-ID append-epoch/source-registry repair — FIXED / IMPLEMENTED:** accepted source commits `5d95f40` and `90cb27a` preserve the 2.0.0 digest identities; split Cable Woodchop (`rex_00754`–`rex_00765`) from `rule_0019` (`rex_00766`–`rex_00827`) under `chg_0004`/`chg_0005`; and fail closed on undeclared, deleted, reordered, duplicate, or zero-row rule/exercise source changes.
- No known regression remains for readiness ordering or lb/kg relabeling; retain their tests during future UI/data-model work.
- **Operational status can become stale — OPEN / Medium:** `docs/push-backend.md` now labels dated external observations and provides a re-verification procedure, but production service state and iPhone behavior still require external/device checks. References: `docs/push-backend.md`, `docs/iphone-pwa-personal-coach-setup.md`.
- **Encoding artifacts in older generated/docs text — OPEN / Low:** sequences such as malformed smart quotes appear in existing Markdown output. Correct only where source encoding is confirmed; do not alter research IDs/content. References: existing research/training Markdown.

## Technical debt

- **Monolithic frontend — High:** UI, state, domain calculations, migrations, imports, and integrations share `index.html` (~1.1 MB).
- **Duplicated packaged assets — Medium:** root and `www/` can drift; `sync:web`/`verify:pwa` must remain mandatory.
- **Readiness adapter drift — Low:** UI copy still adapts engine outcomes; tests must keep it from becoming a second scoring system.
- **Write-only server sync — High:** no read/restore contract.
- **CI coverage remains partial — Medium:** public domain/schema, research/PWA, and Chromium UI jobs now run for pull requests and `main`; private evidence, native-device behavior, and full notification lifecycle remain intentionally outside public CI.
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
6. Accessibility under physical screen readers, native dynamic text, physical safe areas, and keyboard-open states; automated axe, keyboard-focus, forced-colors, reduced-motion, and browser large-text/reflow coverage is implemented.
7. Population scope beyond male hypertrophy research.
8. Pipeline metadata’s “schema-ready not blended” phrase versus runtime blending.
9. Dates, owners, and priority for items not explicitly ranked above.
