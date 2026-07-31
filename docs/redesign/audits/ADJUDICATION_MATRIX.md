# Comprehensive Fitness Redesign Adjudication Matrix

**Status:** FINAL PRODUCT ADJUDICATION  
**Adjudicator:** Codex, acting independently in a fresh conversation  
**Date:** 2026-07-30  
**Implementation authorized:** No  
**Purpose:** Account for every Claude finding and every Phase 1 feature family before the final redesign documents are written

## 1. Decision standard

The authority order used here is:

1. Erik's reported behavior and original product jobs.
2. The simplest product that reliably serves those jobs.
3. Data integrity and recommendation correctness.
4. Technical feasibility and migration risk.
5. Existing architecture and sunk effort.

The Phase 1 package is treated as a proposal. The Claude audit is treated as adversarial evidence. Repository code, schemas, tests, and current documentation prove current behavior and coupling, not product value.

The repository contains no usage telemetry that independently validates Erik's behavior. The behavioral statements in Phase 1 are therefore treated as reported user evidence, not as repository-derived facts. No current implementation survives merely because it exists.

## 2. Verification baseline

The following claims were independently checked against the current working tree:

- Four bottom-navigation destinations and three persistent Progress subviews exist in `app-views.js:37-42` and `app-views.js:273-282`.
- Today runs the hypertrophy analysis and per-template recommendation work before Start in `app-views.js:480-498`.
- The start flow contains active-conflict, confirmation, readiness, and review states in `app-views.js:823-1074` and `app-workout.js:1286-1380`.
- Three differently scoped recommendation/exception producers exist, and no `resolveSessionFlags`-style cross-producer arbiter exists: `app-import.js:311-452`, `app-foundation.js:1705-1916`, and `app-foundation.js:3206-3385`.
- The routine/template range and set count override engine output only when `standardWorkloadOverride === true` in `app-foundation.js:3671-3697`.
- Persisted `settings.availableEquipment` enters the engine request and can become a hard execution block in `app-foundation.js:1858-1915` and `app-foundation.js:819-895`.
- Mesocycle coupling spans the UI, foundation, engine, import, workout, backup contract, schemas, and tests. The audit's reference counts were reproduced.
- The current grade mixes retained product value with prescription-adherence scoring in `app-history.js:186-284`.
- The RPE control is coded as `step="0.5"` with select-on-focus and blur-before-complete handling in `app-views.js:1864` and `app.js:49-70,647-694`; target-device behavior was not verified.
- Submitted recommendation snapshots are deliberately immutable in `app-foundation.js:1770-1791`.
- Older sessions remain stored and are reachable through the retention archive in `app-foundation.js:389-397` and `app-analysis.js:226-236`.
- There is no browsable research-library route, but user-facing research database counts, versions, and status do exist in `app-analysis.js:1906-1915` and `app-workout.js:39-70`.
- `www/` contains 40 tracked generated files; sampled root/`www` assets are byte-identical. `CLAUDE.md:54-57` establishes root files as source and `www/` as generated packaging.

Focused current-state tests were run without application changes:

- `node scripts/test-backup-contract.js` - passed.
- `node scripts/test-domain-integrity.js` - passed.
- `node scripts/test-workout-grade.js` - passed.
- `node scripts/test-evidence-claim-ui.js` - passed.
- `node scripts/test-phase3-core-ui.js` - passed.

These passes verify the pre-redesign contracts that exist today. They are not acceptance evidence for the redesign.

## 3. Claude objection adjudication

| ID | Objection summary | Relevant Phase 1 decision | Repository verification | Classification | Ruling | Decision and rationale | Permanent product outcome | Temporary migration accommodation | Must be deleted at migration end | Codex must not infer or add |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O-1 | Phase 1 assumes one coherent flag contract, but three producers use different scopes, vocabularies, and cadences and no arbiter exists. | Keep material fatigue, plateau, deload, readiness, and pain/illness flags; show one coherent action; DATA-13 requires one source. | Verified in `app-import.js:311-452`, `app-foundation.js:1705-1916`, and `app-foundation.js:3206-3385`; no cross-producer resolver was found. | engine necessity | **ACCEPT** | The final product needs one authoritative exception resolver before it needs new flag UI. Producer outputs are inputs, not independently displayable recommendations. | One resolver produces at most one session action and one applicable exercise action. Normal progression produces no coaching card. Precedence is fixed in the engine contract. | Existing producers may run in non-visible shadow comparison while the resolver is evaluated. Historical snapshots remain readable. | Every direct UI consumer of individual producers; the legacy recommendation presentation path; any fallback path that can independently mutate live targets; the shadow path after its exit gate. | Do not infer that Claude's suggested implementation or existing thresholds are approved. Do not add new flag categories. |
| O-2 | Stable routine ranges require reversing the current default; Phase 1 did not name the mechanism. | Template-defined range/RPE KEEP; automatic rep-range rewriting DELETE; stable targets required. | Verified at `app-foundation.js:3671-3697` and `app-workout.js:1316-1378`. Engine output wins unless the opt-in override flag is true. | engine necessity | **ACCEPT** | Stable user-owned targets are a core job and must be authoritative by default. Technical inversion is sequencing, not a reason to retain mutation. | The exercise variant owns set count, rep range, target RPE, and rest. No engine path may change the normal rep range. Exception actions may reduce load, sets, or effort, but do not rewrite the variant range. | Migrate existing templates to explicit stable targets and compare generated sessions before switching the default. Read old snapshots without recomputing them. | `standardWorkloadOverride` as an opt-in ownership gate; automatic range/set-count mutation in active workout creation; engine-derived normal load/rep prefill that bypasses prior-set/routine-default priority. | Do not infer that an engine-supported different range deserves a flag. Do not add a second "recommended range" beside the routine range. |
| O-3 | Removing equipment UI would leave persisted equipment constraints capable of blocking logging. | Equipment blocking and equipment-filter setup DELETE; metadata optional. | Verified at `app.js:238-249,580-591`, `app-foundation.js:1858-1915`, `app-foundation.js:819-895`, and `app-import.js:1067-1077`. | migration sequencing | **ACCEPT** | A hidden persisted blocker would violate both the product job and deletion rule. | Equipment may remain descriptive exercise metadata, but no global equipment state may make an exercise non-loggable or disable set/timer controls. | A versioned migration clears active `availableEquipment`; legacy backup import may accept and discard the old preference while preserving workout data. | All global equipment-constraint writers, readers, hard-rejection mapping, execution blocking, builder setup, and active setting state. | Do not infer that per-exercise equipment labels or search metadata must be erased. Do not build a new equipment settings page. |
| O-4 | Mesocycle deletion is cross-layer, not a UI-only removal. | Mesocycle generator/builder, candidate pools, portfolios, lifecycle UI, and related planning flows DELETE. | Verified: 126 references in `app-views.js`, 32 in `app-foundation.js`, 107 in `prescription-engine.js`, 21 in `app-import.js`, 9 in `app-workout.js`, 6 in `backup-contract.js`, plus a dedicated module, two schemas, and tests. | migration sequencing | **ACCEPT** | The objection is factually correct. Its proposed permanent inert active-domain array is not adopted; compatibility cannot become hidden product scope. | No mesocycle concept, route, active state, prescription input, generator, lifecycle, or user-facing history survives. Completed workouts, routine names, and immutable historical snapshots survive. | Remove UI first, then request/engine coupling, then active state. Legacy backups remain importable through a compatibility reader that ignores or converts planning-only fields without rejecting workout history. Offer a full pre-migration export. | Builder/views/routes; `guided-mesocycle.js`; planner-only engine code and schemas from active use; `currentMesocycle` request coupling; `data.mesocycles` and `activeMesocycleId` from the active domain/writer; planner tests and docs. | Do not infer that legacy backup keys are permanent product fields. Do not retain a hidden mesocycle archive or settings graveyard. |
| O-5 | The workout grade should be rebalanced rather than deleted; current adherence and desired grade are one implementation. | Prescription-adherence grade DELETE; one simplified workout grade KEEP. | Verified at `app-history.js:186-284`. Execution, RPE-target compliance, and planned completion dominate much of the score; intent and one-off handling already exist. | product value | **PARTIALLY ACCEPT** | Phase 1 did not delete the grade; it deleted the wrong basis. Claude is correct about coupling but not that the existing function or weights deserve preservation. | Keep one versioned A-F grade based on actual completed work, logging completeness, comparable progress, effort coherence, and handling of active exception actions. No score for mere template obedience or legitimate substitution/reordering/set-count change. | Preserve stored historical grades and their version. Introduce the new grade only for new/regraded sessions with explicit versioning; never silently rewrite historical grades. | The old active adherence-weighted algorithm, plan/actual category breakdown, grade confidence meter, and rigid planned-set penalties. | Do not infer that current weights, categories, thresholds, or function structure survive. Do not add a second score. |
| O-6 | Source code appears to have fixed the reported RPE edit defect, so Phase 1 may be anchored to stale behavior. | RPE entry KEEP; immediate `7` to `7.5` replacement is a critical acceptance requirement and north-star measure. | Source intent verified in `app.js:2-3,49-70,647-694` and `app-views.js:1864`; no iPhone-class runtime reproduction was performed. | interface visibility | **DEFER FOR MISSING EVIDENCE** | Source inspection cannot overrule Erik's reported device experience. It also does not justify an input rewrite without reproduction. | Fast decimal RPE entry remains a non-negotiable outcome. The final redesign does not preselect a particular input implementation. | Reproduce on the target device before changing the input layer; retain a focused regression test and test completion without an intervening blur. | Only the superseded input workaround or duplicate handlers after the selected interaction passes real-device verification. | Do not infer that the defect is fixed, that it still exists, or that the input layer must be rebuilt. |
| O-7 | Counting only bottom-nav buttons misses persistent Progress subnavigation; the current effective navigation has six destinations. | No more than Today and Progress as persistent primary destinations; no dashboard duplication. | Verified at `app-views.js:37-42,273-282` and route state in `app-foundation.js:3919-3959`. | interface visibility | **ACCEPT** | Simplicity is about persistent choices, not the HTML element called bottom navigation. | Today and Progress are the only persistent destinations, and neither has persistent subnavigation. Contextual drilldowns and secondary Settings/routine entry points remain allowed. | Legacy hashes may redirect to the corresponding new Today, Progress, Settings, or routine destination during migration. | Plan/More bottom-nav items, the Progress switcher, obsolete `progressView` persistent state, and dead legacy destinations after redirects are verified. | Do not infer that all detail screens are forbidden or that Settings becomes a bottom tab. |
| O-8 | Deleting all state for removed features conflicts with preserving immutable historical snapshots. | DELETE-16 removes routes/state/tests/docs; DATA-01 preserves history; submitted snapshots are source records. | Verified at `app-foundation.js:1770-1791`, session creation in `app-workout.js:1347`, and backup validation. | data preservation | **ACCEPT** | "State" must mean active/executable product state, not immutable historical evidence. | Historical workout records and stored snapshots are preserved byte-for-byte or through lossless compatibility. Deleted concepts receive no live renderer, recomputation, navigation, or new writes. | Read-only legacy decoders and import transforms may remain. They must be isolated from normal execution and covered by historical fixtures. | Active writers, live readers, routes, controls, caches, producers, and tests that require the removed experience. | Do not infer that preserving data requires preserving the old UI, old engine, or ability to create new legacy records. |
| O-9 | Phase 1 may schedule deletion of a browsable research database feature that does not exist. | Research database visible in app DELETE; live evidence/research citations DELETE. | No dedicated research-library route was found. However, research database counts/status are visible in `app-analysis.js:1906-1915` and `app-workout.js:39-70`, and recommendation evidence is visible in `app-views.js:2012-2048`. | unsupported assertion | **PARTIALLY ACCEPT** | The Phase 1 label is imprecise, but the deletion is not a no-op. There are multiple user-facing research surfaces. | Delete research counts, versions, evidence weights, citations, and database-status presentation from normal product UI. Retain validated research inputs and engineering documentation only where they improve approved flags. | None beyond preserving historical snapshot fields and keeping engine validation available during transition. | All user-facing research-basis/status/count panels, evidence disclosures, and bibliography-like recommendation presentation. | Do not infer that the public research database itself is deleted or that a browsable library ever existed. |

## 4. Questions raised by Claude - resolved

| ID | Resolution |
| --- | --- |
| Q-1 | Persisted historical records are explicitly exempt from active-state deletion. They remain non-executable records with compatibility readers only. |
| Q-2 | Precedence is: explicit pain/illness safety action; session/full deload; the stricter coherent readiness-or-fatigue action at each scope; plateau; then no flag. A higher-priority action absorbs lower-priority reasons. A session action suppresses an equal or weaker exercise action; one stricter exercise action may remain. |
| Q-3 | An engine preference for a different normal rep range stays silent. It may support a factual `Top of range` marker, but only an explicit routine/variant edit changes the normal range. Exception flags do not mutate the range. |
| Q-4 | Target-device RPE behavior is **NEEDS REVIEW**. Reproduction is required before choosing implementation work. |
| Q-5 | Legacy backups remain importable, but mesocycle planning data does not remain an active hidden domain. The migration preserves workout/session/template facts, accepts legacy keys, and stops creating or consuming planning records. |
| Q-6 | User-facing model-confidence meters are deleted. Truthfulness survives as plain provenance: `recorded` and `inferred` are distinct facts, not confidence scores. |
| Q-7 | The plate calculator and per-exercise execution-quality questionnaire are deleted from the permanent product because no demonstrated core job justifies their live-workout cost. Historical execution-quality values remain readable; missing technique is unknown, not assumed. |
| Q-8 | There is no research-library route, but visible research database status/counts do exist. The final disposition deletes those UI surfaces, not the validated internal database. |

## 5. Corrected current-system map coverage

| ID | Claude map claim | Independent result | Adjudicated consequence |
| --- | --- | --- | --- |
| CM-1 | Four bottom tabs exist. | **VERIFIED** - `app-views.js:37-42`, `app-foundation.js:70`. | Replace with Today and Progress only. |
| CM-2 | Progress adds three persistent subviews. | **VERIFIED** - `app-views.js:273-282`. | Delete the switcher; use one Progress home with contextual drilldowns. |
| CM-3 | Today runs plan and hypertrophy analysis before Start. | **VERIFIED** - `app-views.js:480-498`. | Removed analytics must also stop executing on Today; hiding markup is insufficient. |
| CM-4 | Start has four modal states. | **VERIFIED** - `app-views.js:823-1074`. | Keep active-session conflict handling; remove mandatory confirmation/readiness/review. |
| CM-5 | `unifiedPrescriptionSnapshot` is the primary producer with a fallback progression producer. | **VERIFIED** - `app-foundation.js:1705-1916,3206-3320`. | Reframe "multiple sources": one primary producer, projections, fallback, and independent flag logic feed one final resolver during migration. |
| CM-6 | Legacy recommendation/target functions are projections. | **VERIFIED** - `app-foundation.js:2025-2167`. | Do not call them separate engines; remove active projections when consumers are gone. |
| CM-7 | Two live recommendation presentation paths exist. | **VERIFIED** - `app-views.js:2055-2113`. | Both paths must be removed; historical data does not need either renderer. |
| CM-8 | Fatigue rules are retrospective and independently thresholded. | **VERIFIED** - `app-import.js:311-369`. | Existing thresholds are unapproved candidates until evaluation; they cannot render directly. |
| CM-9 | Readiness advice is a separate session-scoped path. | **VERIFIED** - `app-import.js:375-452`. | Feed the canonical resolver; no second visible recommendation. |
| CM-10 | Mutation safety combines authorization, health restrictions, and equipment rejection. | **VERIFIED** - `app-foundation.js:819-895`. | Split data-integrity authorization from product advice; remove equipment blocking and preserve logging of actual work even after a recorded warning. |
| CM-11 | Grade weights and hypertrophy/volume surfaces are implemented. | **VERIFIED** - `app-history.js:186-284`, `app-analysis.js`, `app-views.js:593-754`. | Version the grade and delete overlapping scores/dashboards. |
| CM-12 | Mesocycle is first-class across runtime and backup. | **VERIFIED** - cross-file counts and schemas reproduced. | Cross-layer staged removal with compatibility import. |
| CM-13 | Primary persistence plus an independent active draft exists. | **VERIFIED** - `app-foundation.js:1-12,2283-2332`. | Every migration must cover app data and active draft restoration. |
| CM-14 | `www/` mirrors root files. | **VERIFIED**, with correction: it is generated packaging, not a second editable source (`CLAUDE.md:54-57`). | Continue root-only edits plus mandatory sync/cache verification; removal of `www/` is not authorized by this adjudication. |

## 6. Supplementary Claude finding ledger

### 6.1 Executive premises and hidden-complexity findings

| ID | Finding | Ruling | Permanent or migration outcome |
| --- | --- | --- | --- |
| P-1 | "Multiple recommendation sources" is mostly misframed. | **ACCEPT** | Final language distinguishes producers, projections, fallbacks, and the one authoritative visible resolver. |
| P-2 | RPE defect appears fixed in source. | **DEFER FOR MISSING EVIDENCE** | Keep outcome requirement; require target-device reproduction before input work. |
| P-3 | Preserve-all-history behavior already exists. | **ACCEPT** | Reclassify as KEEP - ALREADY SATISFIED; protect it as a regression gate. |
| H-1 | `www/` doubles every deletion. | **PARTIALLY ACCEPT** | It increases packaging/sync risk, but it is generated output, not a second hand-edited source. Keep packaging unless separately re-architected; verify no stale deleted code remains. |
| H-2 | Deleting equipment UI alone leaves active blocking state. | **ACCEPT** | Covered by O-3; migrate, stop consuming, then delete active state. |
| H-3 | Today performs substantial removed analysis before interaction. | **ACCEPT** | Today acceptance requires absence of those calls, not merely hidden cards. Runtime performance improvement remains to be measured rather than claimed. |
| H-4 | Modern and legacy recommendation renderers both exist. | **ACCEPT** | Delete both active renderers; retain only legacy data decoding. |
| H-5 | Confidence styling spans many product surfaces. | **PARTIALLY ACCEPT** | Remove user-facing model confidence everywhere. Preserve recorded-vs-inferred provenance in plain text, not via confidence tiers. |
| H-6 | Tests enforce features Phase 1 deletes. | **ACCEPT** | Replace positive legacy assertions with final contract/absence tests in the same milestone; do not merely disable the suite. |
| H-7 | `basePrescription` supports both removable detail and legitimate historical/temporary comparison. | **ACCEPT** | Keep it in immutable historical records and temporary migration audit. It does not justify a general prescription-detail UI. |

### 6.2 Claimed indispensable internal capabilities

| ID | Capability | Ruling | Outcome |
| --- | --- | --- | --- |
| IC-1 | `unifiedPrescriptionSnapshot` and snapshot immutability. | **PARTIALLY ACCEPT** | Snapshot immutability and legacy readability are indispensable. The full active normal-prescription generator survives only until approved flag inputs are separated; sunk complexity has no permanent entitlement. |
| IC-2 | Role-aware previous-set matching. | **ACCEPT** | Permanent engine necessity for trustworthy `Last time`. |
| IC-3 | Warm-up/working-set inference and audit trail. | **ACCEPT** | Permanent data-integrity capability; correction appears only when needed. |
| IC-4 | Exact performance identity versus research identity. | **ACCEPT** | Permanent data-integrity capability; named variants remain distinct. |
| IC-5 | Existing fail-closed safety gate. | **PARTIALLY ACCEPT** | Preserve authorization/integrity and highest-priority warnings; remove equipment coupling and do not make the logger unable to record actual work. |
| IC-6 | Active-draft persistence. | **ACCEPT** | Permanent core capability. |
| IC-7 | Readiness signal capture. | **ACCEPT** | Preserve optional/history capture; remove mandatory start placement and unnecessary manual fields. |
| IC-8 | Rest completion and push scheduling. | **ACCEPT** | Permanent core capability, with platform limitations stated truthfully. |
| IC-9 | Backup contract. | **ACCEPT** | Permanent data-ownership capability plus legacy import compatibility. |

### 6.3 Missed deletion and structural proposals

| ID | Finding | Classification | Ruling | Outcome |
| --- | --- | --- | --- | --- |
| M-1 | Non-shipping React/Vite concept gallery and its toolchain can be deleted. | technical risk | **ACCEPT** | Delete the concept-gallery source, its prototype tests/config/scripts, and dependencies after the final design is no longer needed for acceptance. Do not delete redesign governance prompts or final documents. |
| M-2 | Extracting the 5,199-line inline stylesheet is a prerequisite. | unsupported assertion | **REJECT** | Size is verified; prerequisite status is not. CSS extraction is not authorized by this product adjudication and must not delay scope deletion. It may be separately justified during implementation planning. |
| M-3 | Planner-only code inside the 6,100-line engine should leave with mesocycles. | technical risk | **ACCEPT** | Delete planner-only constants/functions/exports after request decoupling and tests. Engine size alone is not a deletion criterion. |
| M-4 | Delete the Progress subnavigation switcher. | interface visibility | **ACCEPT** | One Progress home with contextual drilldowns; no persistent subnav. |
| M-5 | Plate calculator was unclassified. | product value | **ACCEPT** | DELETE; no demonstrated core-job evidence. |
| M-6 | Execution-quality questionnaire was unclassified. | product value | **ACCEPT** | DELETE user-facing control; preserve historical values and treat absent technique as unknown. |

### 6.4 Data, migration, and backup constraints

| ID | Finding | Ruling | Outcome |
| --- | --- | --- | --- |
| D-1 | Existing backups contain mesocycle keys and current validation expects them. | **PARTIALLY ACCEPT** | Legacy backups must import without losing workout history. Active mesocycle fields do not remain forever; a compatibility reader accepts/transforms or discards planning-only data. |
| D-2 | Set classification migration v3 is one-way and preserves original values. | **ACCEPT** | Do not reclassify sets as part of visual simplification. Any later semantic change needs a new idempotent migration and preserved originals. |
| D-3 | Submitted snapshots are immutable. | **ACCEPT** | Preserve stored bytes/shapes; delete their old UI and active validation dependencies only where historical reads remain safe. |
| D-4 | `appDataVersion` and `dataRevision` govern migration/conflict behavior. | **ACCEPT** | Every data change requires an idempotent versioned migration and one coherent revision transition. Exact implementation remains subject to tests. |
| D-5 | Active draft is separately stored and restored. | **ACCEPT** | Migrate/normalize draft shapes together with app data; test update during an in-flight workout. |
| D-6 | Exercise identity must not collapse variants. | **ACCEPT** | Heavy/light/custom histories remain distinct permanently. |
| D-7 | Cache version and root-to-`www` sync are installed-PWA gates. | **ACCEPT** | Required on every cross-file runtime milestone; no application change in this adjudication triggers them. |
| D-8 | Older history needs a replacement path before the current archive disclosure is deleted. | **ACCEPT** | Progress must prove full-history reachability before deleting the legacy retention view. |

### 6.5 Documentation conflicts

| ID | Current-state statement | Ruling |
| --- | --- | --- |
| DOC-1 | `docs/UI_UX.md` documents four persistent destinations. | Final documents supersede intended navigation; current doc remains current-state evidence until implementation updates it. |
| DOC-2 | `docs/UI_UX.md` documents Plan, candidate pools, and readiness-before-start. | Superseded as future intent; update/delete during the owning implementation milestones. |
| DOC-3 | `docs/UI_UX.md` documents the five-step mesocycle flow. | Superseded as future intent; remove when the implementation is removed. |
| DOC-4 | `docs/UI_UX.md` specifies weekly volume as intended UI. | Superseded as future intent; retain only as current-state history until deletion lands. |
| DOC-5 | Older audits/docs say one authoritative recommendation engine. | Compatible with the corrected framing: one primary engine still coexists with a fallback and independent flag logic; final authority is the one resolver contract. |
| DOC-6 | `PROJECT`, `ARCHITECTURE`, `DECISION_ENGINE`, `UI_UX`, `ROADMAP`, and `training-prescription-data` describe the current mesocycle/prescription product. | They are not rewritten in this adjudication-only task. Each must be updated with its owning application milestone; until then they are labeled current-state evidence, not final redesign intent. |

### 6.6 Claude's definite-delete list

| ID | Audit item | Ruling |
| --- | --- | --- |
| DD-1 | Mesocycle builder/five steps/pools/portfolio/viability/lifecycle. | **ACCEPT** |
| DD-2 | Research-confidence disclosure and exercise score. | **ACCEPT** |
| DD-3 | Evidence-summary disclosure. | **ACCEPT** |
| DD-4 | Standalone hypertrophy score. | **ACCEPT** |
| DD-5 | Weekly volume and direct/fractional display. | **ACCEPT** |
| DD-6 | Start confirmation step, while retaining active conflict. | **ACCEPT** |
| DD-7 | Legacy prescription presentation. | **ACCEPT** |
| DD-8 | React/Vite concept-gallery toolchain. | **ACCEPT**, scoped to prototype assets and dependencies, not redesign governance artifacts. |
| DD-9 | Progress switcher. | **ACCEPT** |
| DD-10 | Completion category breakdown. | **ACCEPT** |

### 6.7 Claude's keep-invisible list

| ID | Audit item | Ruling |
| --- | --- | --- |
| KI-1 | Full prescription generation. | **PARTIALLY ACCEPT** - keep during migration and only the minimum approved exception inputs permanently; normal prescription generation has no automatic right to survive. |
| KI-2 | Evidence weighting/confidence. | **PARTIALLY ACCEPT** - retain only if validated to gate material flags; never display; delete unused scoring dimensions. |
| KI-3 | Exercise-muscle taxonomy/fractional mapping. | **PARTIALLY ACCEPT** - keep minimum reliable mapping for identity and approved fatigue scope; fractional precision is not presumed necessary. |
| KI-4 | Set-role inference. | **ACCEPT** |
| KI-5 | Weekly exposure counts. | **PARTIALLY ACCEPT** - engine-only only if flag evaluation proves value; no user-facing volume system. |
| KI-6 | Readiness signals including nutrition/protein. | **PARTIALLY ACCEPT** - preserve existing data and optional imported signals; do not add manual fields or direct integrations without evidence. |
| KI-7 | Adjustment duration/return criteria. | **ACCEPT** - required for an active temporary exception; details on demand. |
| KI-8 | Rest-duration history. | **ACCEPT** |
| KI-9 | Existing grade internals. | **REJECT** as a permanent entitlement - preserve historical grade records, but new grade logic is versioned to the final contract. |
| KI-10 | Existing safety gate minus equipment. | **PARTIALLY ACCEPT** - retain integrity and warning precedence, not a blanket hard block that prevents logging actual work. |

### 6.8 Phase 1 reconsideration findings

| ID | Audit recommendation | Ruling |
| --- | --- | --- |
| R-1 | Reframe multiple recommendation sources. | **ACCEPT**; one final resolver, with explicit producer/projection/fallback terminology. |
| R-2 | Reclassify six-month retention as already satisfied. | **ACCEPT**. |
| R-3 | Demote RPE defect pending device reproduction. | **ACCEPT** as implementation scope; keep it as a required outcome/regression. |
| R-4 | Count persistent subnavigation in IA acceptance. | **ACCEPT**. |
| R-5 | State grade intent rather than two opposing dispositions. | **ACCEPT**; one versioned grade, no adherence dimension. |
| R-6 | Deferring exact add-load/add-rep while keeping engine prefill would preserve silent mutation. | **ACCEPT**, with a stronger outcome: exact normal prescriptions are deleted from current permanent scope and cannot drive prefill. |
| R-7 | Exempt historical records from DELETE-16. | **ACCEPT**. |
| R-8 | Add structural deletions. | **PARTIALLY ACCEPT**: concept toolchain and planner engine code delete; `www/` remains generated packaging; CSS extraction is not authorized as a prerequisite. |

### 6.9 Audit evidence gaps

| ID | Gap | Final treatment |
| --- | --- | --- |
| EG-1 | Claude did not run the app. | Source-derived UI claims are current-state evidence; final acceptance requires browser/runtime verification. |
| EG-2 | No target-device verification. | RPE, responsive layout, notifications, keyboard, text scaling, and installed-PWA behavior remain external gates. |
| EG-3 | Claude read the large engine selectively. | Planner-code deletion needs a complete dependency inventory before implementation; no extra engine scope is retained by assumption. |
| EG-4 | Claude did not run tests. | Five focused current-state tests were run in this adjudication and passed; the final suite still does not exist. |
| EG-5 | Private pipeline was not inspected. | No private records were read. Public contracts show additional coupling; implementation must use synthetic fixtures and privacy review. |
| EG-6 | Five-workout field test is unmet. | It remains a mandatory human acceptance gate. |
| EG-7 | Existing governing docs were only sampled by Claude. | Relevant sections were reviewed in this adjudication. They remain current-state evidence and will be updated with implementation, not in this documentation-only task. |

## 7. Phase 1 feature-family coverage

Disposition vocabulary:

- **KEEP** - permanent product capability.
- **SIMPLIFY** - permanent capability with a narrower interaction and contract.
- **ENGINE ONLY** - retained only when necessary for a kept job; no normal-path interface.
- **PROCESS ONLY** - retained as engineering, privacy, or review discipline; it is not shipped product scope.
- **DELETE** - remove UI, active state, producers/consumers, tests, and current-intent documentation after compatibility gates.
- **NOT AUTHORIZED** - no current product case; do not build or retain dormant implementation. A future return requires new behavioral evidence and a new decision.
- **KEEP - ALREADY SATISFIED** - current behavior already meets the permanent rule; protect it during migration.

### A. Information architecture and startup flow

| ID | Phase 1 feature | Phase 1 proposal | Final disposition | Adjudicated outcome |
| --- | --- | --- | --- | --- |
| A-01 | Today landing screen | KEEP | **SIMPLIFY** | Today is the default destination and shows the next workout, an alternate-day picker, Resume when applicable, and one Start action. |
| A-02 | Multi-day workout list on Today | KEEP | **SIMPLIFY** | Use a compact alternate-day picker; do not reproduce a planning dashboard or permanent list of parallel decisions. |
| A-03 | Start-workout confirmation modal | DELETE | **DELETE** | Start opens the workout directly. Active-session conflict handling is a separate integrity case, not a confirmation step. |
| A-04 | Readiness choice modal before every workout | DELETE | **DELETE** | Readiness is optional and inline/secondary; it never blocks Start. |
| A-05 | Persistent bottom-navigation Routines/Templates tab | DELETE | **DELETE** | Routine management is a secondary entry from Today or Settings, not a third destination. |
| A-06 | Permanent Dashboard destination | DELETE | **DELETE** | There is one Progress destination, with no duplicate scorecard home. |
| A-07 | Settings | KEEP | **KEEP** | Keep a secondary Settings destination for support, privacy, backup/export, notifications, and local-data actions; do not make it a feature graveyard. |
| A-08 | Active-workout full-screen mode | KEEP | **KEEP** | The active logger owns the screen so persistent app navigation does not compete with set entry. |
| A-09 | Resume active workout | KEEP | **KEEP** | A recoverable active draft resumes from Today and after reload/crash. |
| A-10 | Prevent starting a second workout while one is active | KEEP | **SIMPLIFY** | Offer Resume, Finish, or Discard for the one existing draft. Never create two active sessions. |
| A-11 | Cancel/discard workout | KEEP | **KEEP** | Discard is explicit and confirmed because it is destructive; ordinary navigation is not. |

### B. Readiness, fatigue, illness, and coaching signals

| ID | Phase 1 feature | Phase 1 proposal | Final disposition | Adjudicated outcome |
| --- | --- | --- | --- | --- |
| B-01 | Usual-readiness baseline | KEEP | **KEEP** | Silence represents usual readiness; no acknowledgement is required. |
| B-02 | Manual readiness logging | KEEP | **SIMPLIFY** | Optional quick capture only. Skipping it must be indistinguishable from a normal fast start. |
| B-03 | Sleep, HRV, and resting-HR integration | KEEP | **ENGINE ONLY** | May consume already supplied/imported data after validation. This adjudication does not authorize a new device or service integration. |
| B-04 | Soreness input | KEEP | **SIMPLIFY** | Optional compact input only when the user chooses readiness details. |
| B-05 | Illness/injury toggle | KEEP | **KEEP** | A direct safety signal receives highest arbitration priority and a plain warning/action. |
| B-06 | General readiness score | DELETE | **DELETE** | Do not turn readiness into a dashboard score or require a composite number. |
| B-07 | Normal/Readiness-Adjusted/Light/Deload intervention taxonomy | KEEP | **ENGINE ONLY** | Retain the minimum internal action vocabulary needed by the canonical resolver; do not expose taxonomy navigation or multiple cards. |
| B-08 | Muscle-group fatigue detection | KEEP | **ENGINE ONLY** | Retain only if calibrated evaluation proves a material, actionable exception with acceptable false positives. |
| B-09 | Exercise-level fatigue detection | KEEP | **ENGINE ONLY** | Same conditional contract as B-08; it may yield at most one stricter exercise action. |
| B-10 | Plateau detection | KEEP | **ENGINE ONLY** | Retain only as a quiet exception after evaluation; normal progression advice remains absent. |
| B-11 | Deload detection | KEEP | **ENGINE ONLY** | A validated session-level exception may be surfaced as one plain action. |
| B-12 | Pain/illness warning | KEEP | **KEEP** | Surface one direct warning. If the user continues, record actual work and the override; do not claim the workout is safe. |
| B-13 | Flag severity/confidence matrices | KEEP ENGINE / DELETE UI | **ENGINE ONLY** | Internal gating may use calibrated evidence sufficiency. Delete user-facing matrices, meters, and pseudo-precision. |
| B-14 | Multiple simultaneous recommendation cards | DELETE | **DELETE** | Arbitration absorbs reasons into one session action plus, only when stricter, one exercise action. |
| B-15 | Recommendation evidence citations | DELETE | **DELETE** | Evidence belongs in engineering validation, not the normal workout interface. |
| B-16 | Long “Why this recommendation” text | DELETE | **SIMPLIFY** | A short reason and optional concise detail may explain a rare flag; no essay or research panel. |
| B-17 | Recommendation confidence/severity badges | DELETE | **DELETE** | No visible confidence meter, severity badge system, or color-coded model taxonomy. |
| B-18 | Research database visible in the app | DELETE | **DELETE** | Delete counts, versions, status, weights, and bibliography-like UI. Retain only validated internal research assets used by approved rules. |

### C. Prescription, targets, and normal progression

| ID | Phase 1 feature | Phase 1 proposal | Final disposition | Adjudicated outcome |
| --- | --- | --- | --- | --- |
| C-01 | Template-defined rep range | KEEP | **KEEP** | The named exercise variant owns a stable normal rep range. |
| C-02 | Template-defined target RPE | KEEP | **KEEP** | The named exercise variant owns a stable normal target RPE. |
| C-03 | Automatic rep-range rewriting | DELETE | **DELETE** | No normal or exception engine path rewrites the active range. Only an explicit routine/variant edit changes it. |
| C-04 | Normal per-exercise recommendation paragraphs | DELETE | **DELETE** | Ordinary sessions show targets and prior facts, not coaching prose. |
| C-05 | Progress-ready detection | KEEP | **SIMPLIFY** | A factual marker such as `Top of range` may be derived from actual history; it is not a prescription. |
| C-06 | Exact add-rep recommendation | DEFER | **DELETE** | Current permanent scope does not include exact normal progression prescriptions or silent rep prefill. |
| C-07 | Exact add-load recommendation | DEFER | **DELETE** | Current permanent scope does not include exact normal progression prescriptions or silent load prefill. |
| C-08 | Add-set recommendation | DELETE | **DELETE** | Set-count changes remain explicit routine edits or user actions. |
| C-09 | Hold recommendation | DELETE | **DELETE** | Showing the stable target is sufficient; do not narrate “hold” during ordinary training. |
| C-10 | Lower-RPE recommendation | KEEP ONLY FOR FLAGS | **ENGINE ONLY** | A validated exception action may lower the effort ceiling without changing the rep range. |
| C-11 | Load/set/rep adjustment object | KEEP ENGINE / DELETE UI | **ENGINE ONLY** | Retain the smallest versioned exception-action object; it must not become a second visible prescription or normal prefill path. |
| C-12 | Progression expectation and return criteria | KEEP ENGINE / DELETE NORMAL UI | **ENGINE ONLY** | May bound a temporary exception and its expiry; visible detail is concise and appears only with the flag. |

### D. Live workout and set logging

| ID | Phase 1 feature | Phase 1 proposal | Final disposition | Adjudicated outcome |
| --- | --- | --- | --- | --- |
| D-01 | Weight entry | KEEP | **KEEP** | Fast numeric entry. Prefill priority is same-variant prior set, then explicit routine default, then blank; no normal engine prescription. |
| D-02 | Rep entry | KEEP | **KEEP** | Fast integer entry with the same factual prefill rule as load. |
| D-03 | RPE entry | KEEP | **KEEP** | Support immediate replacement and 0.5 increments; exact input implementation remains contingent on target-device reproduction. |
| D-04 | Previous-set performance | KEEP | **KEEP** | Show the corresponding prior working set for the same exercise variant and role; do not substitute a different identity silently. |
| D-05 | Previous-workout summary | KEEP | **SIMPLIFY** | Show last date plus a compact relevant working-set summary, not a recommendation narrative. |
| D-06 | Current-set highlighting | KEEP | **KEEP** | Current, complete, and pending states are visually and accessibly distinct. |
| D-07 | Completed/untouched set states | KEEP | **KEEP** | Preserve explicit progress through the exercise without adding status taxonomy. |
| D-08 | Automatic current-set advance | SIMPLIFY | **SIMPLIFY** | Advance predictably after completion, preserve context, and never make an edit impossible. |
| D-09 | Add set | KEEP | **KEEP** | A secondary action records what actually happened without requiring permission. |
| D-10 | Remove/skip set | KEEP | **KEEP** | Distinguish removal/skip from completion and do not penalize legitimate deviation merely for being different. |
| D-11 | Reorder exercises | KEEP | **SIMPLIFY** | Provide `Do next` or a simple reorder action and store actual order. |
| D-12 | Substitute exercise | KEEP | **KEEP** | Replace quickly for the current workout; separately offer an explicit routine update. |
| D-13 | Custom exercise creation | KEEP | **SIMPLIFY** | Require a name and stable targets only; optional metadata cannot block creation or logging. |
| D-14 | Named exercise variants | KEEP | **KEEP** | Variants have independent identity, targets, defaults, and history; labels such as heavy/light remain visible in full. |
| D-15 | Equipment-availability blocking | DELETE | **DELETE** | No equipment preference can disable logging or reject a real exercise choice. |
| D-16 | Exercise library taxonomy during logging | ENGINE ONLY | **ENGINE ONLY** | Preserve mappings only for validated history/flag logic. Corrections belong in the relevant routine/import context, not a new Settings graveyard. |
| D-17 | Exercise notes | KEEP | **KEEP** | Optional compact note entry; history remains attached to the correct variant/session. |
| D-18 | Session notes | KEEP | **KEEP** | Optional throughout the workout and at completion. |
| D-19 | Workout duration | KEEP | **KEEP** | Capture automatically with explicit semantics for active, paused, resumed, and completed time. |
| D-20 | Exercise order | KEEP | **KEEP** | Persist actual order automatically. |
| D-21 | Warm-up logging | SIMPLIFY | **SIMPLIFY** | Warm-ups remain loggable and visibly distinct; inference may prefill classification but must be correctable. |
| D-22 | Working-set classification | ENGINE ONLY | **ENGINE ONLY** | Infer from template/import/context; surface correction only when necessary to protect history or analysis. |
| D-23 | Back-off and drop-set classification | ENGINE ONLY | **ENGINE ONLY** | Preserve recorded/imported roles and infer conservatively; do not force routine classification. |
| D-24 | Rest timer | KEEP | **KEEP** | Starts from a completed set, survives relevant screen/app state, and exposes remaining time plus simple adjustment/skip controls. |
| D-25 | Exercise-specific rest defaults | SIMPLIFY | **KEEP** | One stable rest default belongs to each exercise variant and is editable in routine/timer context. |
| D-26 | Lock-screen/live notification | KEEP | **KEEP** | Notify when rest ends where platform support and permission permit; installed-device verification is mandatory. |
| D-27 | Sound and vibration controls | KEEP | **SIMPLIFY** | Central notification controls only; honor system permissions and do not create per-feature settings sprawl. |
| D-28 | Elapsed-rest display | KEEP | **KEEP** | After the target, show elapsed-over-target so timing remains useful without forcing an action. |
| D-29 | Per-set rest button | SIMPLIFY | **SIMPLIFY** | Keep manual start/restart in shared timer controls, not a repeated control on every set row. |
| D-30 | Full exercise name visibility | KEEP | **KEEP** | Names wrap or expand and retain the meaningful variant suffix. |

### E. Overrides, grading, and completion

| ID | Phase 1 feature | Phase 1 proposal | Final disposition | Adjudicated outcome |
| --- | --- | --- | --- | --- |
| E-01 | Free load/rep/RPE override | KEEP | **KEEP** | Actual work is freely editable. A safety warning may inform but cannot convert the logger into a fictional plan record. |
| E-02 | Save change to this workout versus routine | SIMPLIFY | **SIMPLIFY** | Default to current workout. Routine mutation is a separate explicit action, never an automatic consequence of logging. |
| E-03 | Grade based on prescription adherence | DELETE | **DELETE** | Do not score deviation itself or reward mere obedience to an initial plan. |
| E-04 | Workout grade | SIMPLIFY | **SIMPLIFY** | One versioned A-F grade with two or three factual reasons; current formula and weights are not approved. |
| E-05 | Hypertrophy score | DELETE | **DELETE** | Remove the separate score and every dashboard dependency; do not relabel it as stimulus or quality. |
| E-06 | Exercise progression summary | KEEP | **KEEP** | Summarize meaningful factual changes in load, reps, effort efficiency, or validated comparable performance. |
| E-07 | PR detection | SIMPLIFY | **SIMPLIFY** | Detect a small, defined set of meaningful PRs using comparable roles/variants; do not manufacture highlights. |
| E-08 | PR summary page | DELETE | **DELETE** | PRs belong in the single completion summary and relevant Progress detail, not an extra destination. |
| E-09 | Post-workout completion experience | KEEP | **KEEP** | One concise screen provides grade, limited progress/PR highlights, any still-relevant exception, and Done/Progress actions. |
| E-10 | Recommendation for next time on completion | SIMPLIFY | **SIMPLIFY** | Show only a factual progress-ready marker or the one active exception action; no normal exact load/rep prescription. |
| E-11 | Confetti/celebration effects | DEFER | **NOT AUTHORIZED** | A polished completion state is required, but no new celebration effect is justified by current evidence. |
| E-12 | Completion confirmation | KEEP | **KEEP** | One concise confirmation protects against accidental finish and offers immediate recovery where technically feasible. |

### F. Progress, history, and analytics

| ID | Phase 1 feature | Phase 1 proposal | Final disposition | Adjudicated outcome |
| --- | --- | --- | --- | --- |
| F-01 | Completed-workout history | KEEP | **KEEP** | Progress contains chronological completed workouts with factual session detail. |
| F-02 | Exercise history | KEEP | **KEEP** | Search/select an exercise variant and review comparable recent and older sessions. |
| F-03 | Exercise charts | SIMPLIFY | **SIMPLIFY** | Begin with one interpretable performance trend based on comparable data; add no extra chart without a distinct demonstrated question. |
| F-04 | Clickable chart points | KEEP | **KEEP** | A point reveals date, load, reps, RPE, role, and session context. |
| F-05 | “Reps at weight” chart | DELETE | **DELETE** | Remove the isolated chart and its route/state/tests; relevant facts remain in unified history. |
| F-06 | Date-window selector | SIMPLIFY | **SIMPLIFY** | Use a sensible recent default and one contextual range control, not persistent analytical navigation. |
| F-07 | Six qualifying weeks control | ENGINE ONLY | **ENGINE ONLY** | A validated calculation may select comparable recent exposures; there is no user control or promise that six weeks is universally correct. |
| F-08 | Six-month active retention | SIMPLIFY | **KEEP - ALREADY SATISFIED** | Preserve all history. Recent windows affect calculations/display defaults only, never storage or import. |
| F-09 | Weekly muscle-volume dashboard | DELETE | **DELETE** | Delete display, route, and Today computation. No replacement dashboard. |
| F-10 | Direct/secondary/fractional-set display | DELETE | **DELETE** | Remove visible volume taxonomy and its explanatory UI. |
| F-11 | Direct/secondary/fractional-set calculation | ENGINE ONLY | **ENGINE ONLY** | Retain only the minimum exposure mapping that evaluation proves necessary for an approved fatigue rule; delete unused fractional precision. |
| F-12 | Program-wide hypertrophy score | DELETE | **DELETE** | Delete without a renamed replacement. |
| F-13 | Per-lift hypertrophy score | DELETE | **DELETE** | Use actual exercise performance history instead of a second score. |
| F-14 | Overall dashboard scorecards | DELETE | **DELETE** | No Progress dashboard of readiness, volume, hypertrophy, or model summaries. |
| F-15 | Muscle-group progress charts | DEFER | **NOT AUTHORIZED** | Current evidence supports exercise-level history, not a new taxonomy-dependent chart family. |
| F-16 | Recovery-impact charts | DEFER | **NOT AUTHORIZED** | Preserve source facts but do not invent a new analytics surface. |
| F-17 | Archived historical mesocycles | DELETE | **DELETE** | Preserve workouts, routine labels, and stored snapshots; delete mesocycle navigation and lifecycle grouping. |

### G. Routines, templates, and mesocycles

| ID | Phase 1 feature | Phase 1 proposal | Final disposition | Adjudicated outcome |
| --- | --- | --- | --- | --- |
| G-01 | Basic routine/template | KEEP | **KEEP** | A routine contains days and ordered exercise variants with stable sets, rep range, target RPE, and rest. |
| G-02 | Duplicate routine | KEEP | **KEEP** | A secondary routine-management action; duplication creates an independently editable routine. |
| G-03 | Edit routine | SIMPLIFY | **SIMPLIFY** | Edit only routine/day names, order, variants, sets, rep range, target RPE, and rest. |
| G-04 | Automatic mesocycle generation | DELETE | **DELETE** | No generator, active planning state, prescription input, or hidden future route survives. |
| G-05 | Modular mesocycle builder | DELETE | **DELETE** | Delete the complete builder workflow and active-domain state. |
| G-06 | Guide/Setup/Build/Check/Create tabs | DELETE | **DELETE** | Delete tabs, routes, state, copy, tests, and deep links. |
| G-07 | “Plan your mesocycle” guide | DELETE | **DELETE** | Do not move it to Help, Settings, More, or an Advanced section. |
| G-08 | Exercise candidate pool | DELETE | **DELETE** | Routine editing searches/creates the actual exercise directly. |
| G-09 | Selected exercise portfolio | DELETE | **DELETE** | The routine's actual ordered exercises are the only portfolio. |
| G-10 | Equipment-filter setup | DELETE | **DELETE** | Global equipment constraints and setup UI are removed; descriptive metadata may remain. |
| G-11 | Muscle-group scope selection | DELETE | **DELETE** | No program-design questionnaire or hidden scope state. |
| G-12 | Frequency badges and target-status colors | DELETE | **DELETE** | No replacement badges or builder validation theater. |
| G-13 | Maximum sets/day guardrail | ENGINE ONLY | **DELETE** | No demonstrated core job supports retaining this planner rule. It cannot block or warn during actual logging. |
| G-14 | Maximum exercises/muscle/day guardrail | DEFER | **NOT AUTHORIZED** | Do not rebuild or retain dormant runtime code without evidence that routine editing needs it. |
| G-15 | Program-wide exercise reuse rules | DELETE | **DELETE** | Explicit routine choices prevail; no hidden variety enforcement. |
| G-16 | Recommended muscles/exercises in builder | DELETE | **DELETE** | No algorithmic program-design substitute is introduced. |
| G-17 | Historical mesocycle lifecycle states | DELETE | **DELETE** | Legacy values may be decoded for migration only; no new lifecycle records are written. |
| G-18 | Program recommendation quality score | ENGINEERING ONLY | **PROCESS ONLY** | Retain only a test/evaluation discipline for surviving rules; no app score, state, or route. |

### H. Data, imports, settings, and quality systems

| ID | Phase 1 feature | Phase 1 proposal | Final disposition | Adjudicated outcome |
| --- | --- | --- | --- | --- |
| H-01 | Load, reps, and RPE history | KEEP | **KEEP** | Preserve all recorded observations unless Erik explicitly deletes them. |
| H-02 | Exercise order history | KEEP | **KEEP** | Preserve actual session sequence and identity. |
| H-03 | Session duration history | KEEP | **KEEP** | Preserve captured timestamps/durations with known semantics; do not fabricate missing duration. |
| H-04 | Readiness deviation history | KEEP | **KEEP** | Preserve recorded baselines/deviations and supplied objective metrics, with provenance. |
| H-05 | Notes history | KEEP | **KEEP** | Preserve exercise and session notes as source records. |
| H-06 | Rest-duration history | ENGINE ONLY | **ENGINE ONLY** | Preserve automatically where recorded; no new analytics screen follows from having the data. |
| H-07 | Strong import | KEEP | **KEEP** | Import remains a secondary Data action with preview, validation, versioning, and rollback/recovery behavior. |
| H-08 | Warm-up inference during import | ENGINE ONLY | **ENGINE ONLY** | Infer conservatively, retain original imported values/provenance, and permit correction when ambiguous. |
| H-09 | Data export | KEEP | **KEEP** | Export complete user-owned history and relevant definitions in a documented, versioned format. |
| H-10 | Clear local data | KEEP | **KEEP** | Keep behind explicit scope disclosure and destructive confirmation. |
| H-11 | Data retention controls | DELETE | **DELETE** | Preserve all history by default; no archive-window setting that can accidentally erase or hide records. |
| H-12 | Notification settings | KEEP | **KEEP** | Settings contains only controls needed for timer notification behavior and permissions. |
| H-13 | Privacy policy and support | KEEP | **KEEP** | Keep reliable secondary pages with clear return navigation. |
| H-14 | Weekly UI-consistency audit automation | KEEP | **PROCESS ONLY** | Retain as an engineering workflow; do not expose an audit feature in the app. |
| H-15 | Browser/device visual verification | KEEP | **PROCESS ONLY** | Required release evidence, including target-device checks that source inspection cannot replace. |
| H-16 | Research-backed logic audit | KEEP | **PROCESS ONLY** | Required for every surviving exception rule and threshold; research status is not app UI. |
| H-17 | Multiple documentation sources of truth | SIMPLIFY | **SIMPLIFY** | This final package is product intent. Phase 1 and adversarial audit remain labeled evidence; current docs remain implemented-state references until migration changes them. |
| H-18 | Multiple recommendation sources of truth | DELETE | **DELETE** | One versioned canonical resolver feeds every visible exception and stored resolved action. |
| H-19 | Feature flags that permanently hide deleted systems | SIMPLIFY | **SIMPLIFY** | Migration flags must have an owner, expiry gate, and deletion milestone; none survive final acceptance. |

### I. Audit-discovered feature and structural coverage

These items were not all named as Phase 1 feature rows, but the Claude audit requires an explicit permanent outcome.

| ID | Discovered item | Final disposition | Permanent outcome, accommodation, and deletion boundary |
| --- | --- | --- | --- |
| X-01 | Generated `www/` mirror | **KEEP - ALREADY SATISFIED** | Keep as generated packaging while the current Capacitor/PWA pipeline requires it. Root files remain the only hand-edited source. Sync and cache-version verification are acceptance gates; no second-source edits are permitted. |
| X-02 | React/Vite redesign concept gallery and prototype test path | **DELETE** | It may remain while final intent is being reviewed. At migration completion remove the concept-only runtime/build/test/config path and dependencies that have no production consumer. Preserve governance prompts and adjudication records as documentation evidence; do not delete them as “prototype code.” |
| X-03 | Large inline CSS in `index.html` | **NOT AUTHORIZED** | CSS extraction is a possible implementation refactor, not a product prerequisite proven by the audit. Do not expand redesign scope merely because a file is large. |
| X-04 | Plate calculator | **DELETE** | No demonstrated core job supports it. Remove renderer, controls, state, styles, and tests; do not relocate it to Settings or an Advanced area. |
| X-05 | Per-exercise execution-quality questionnaire | **DELETE** | Remove live and completion questions and stop new writes. Preserve historical answers with provenance; missing answers remain unknown. The new grade cannot require the questionnaire. |
| X-06 | Modern and legacy recommendation presentation paths | **DELETE** | Remove both after the canonical exception presentation and historical compatibility tests are in place. Do not keep a legacy renderer for stored records. |
| X-07 | User-facing confidence primitive | **DELETE** | Delete confidence badges, meters, CSS hooks, and grade/recommendation presentation. Internal evidence sufficiency may remain only if calibrated; plain `recorded` versus `inferred` provenance is retained. |
| X-08 | `basePrescription` and stored prescription snapshots | **SIMPLIFY** | Preserve immutable historical snapshots and a temporary before/after reference for versioned exception audits. Do not retain the full normal prescription generator merely to keep this field populated. |
| X-09 | Equipment preference in persisted settings/backups | **DELETE** | A legacy decoder may accept and discard it. Final active state, writers, readers, and blockers are removed. |
| X-10 | Research-status and evidence-weight surfaces | **DELETE** | Remove normal-product status/count/version/weight UI while retaining only validated internal sources required by approved rules. |

## 8. Coverage and non-inference check

- Phase 1 rows adjudicated: **137 of 137** (`A:11`, `B:18`, `C:12`, `D:30`, `E:12`, `F:17`, `G:18`, `H:19`).
- Claude primary objections adjudicated: **9 of 9**.
- Claude explicit questions answered: **8 of 8**.
- Claude current-map claims covered: **14 of 14**.
- Claude supplementary groups covered: executive premises, hidden complexity, indispensable internals, missed deletions, data constraints, documentation conflicts, definite deletes, keep-invisible proposals, reconsideration items, sequence proposal, and evidence gaps.
- Audit-discovered features/structures not represented by a Phase 1 row are listed in section 7.I.

Codex must not infer from any KEEP or ENGINE ONLY ruling that:

1. current thresholds, weights, formulas, model outputs, or UI implementations are approved;
2. stored historical fields require an active feature or renderer;
3. an imported signal authorizes building a new integration;
4. a useful internal input authorizes a new user-facing score, panel, settings area, or recommendation;
5. temporary compatibility code may remain after its named exit gate;
6. a deleted feature may be moved to Advanced, More, Insights, Settings, Help, or a hidden route;
7. exact normal load/rep prescriptions may return as prefill, completion advice, notification copy, or grade logic;
8. implementation, publication, migration, or data mutation is authorized by this adjudication.
