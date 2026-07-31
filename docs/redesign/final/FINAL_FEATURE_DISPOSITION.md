# Comprehensive Fitness Final Feature Disposition

**Status:** FINAL PRODUCT AUTHORITY  
**Date:** 2026-07-30  
**Implementation status:** Not started or authorized by this document  
**Detailed evidence and objection rulings:** [`../audits/ADJUDICATION_MATRIX.md`](../audits/ADJUDICATION_MATRIX.md)

## 1. How to read this document

This is the authoritative permanent disposition for every Phase 1 feature row and every material feature discovered by the adversarial audit.

- **KEEP** - permanent user-facing capability.
- **SIMPLIFY** - permanent capability with the narrower contract stated here.
- **ENGINE ONLY** - retained only where required for a kept job; no normal-path interface.
- **PROCESS ONLY** - engineering, privacy, or review discipline; not shipped product scope.
- **DELETE** - remove the experience and all active producers, consumers, state, routes, writers, tests, and current-intent documentation after preservation/compatibility gates.
- **NOT AUTHORIZED** - no current product case; do not build or retain dormant implementation.
- **KEEP - ALREADY SATISFIED** - current behavior already meets the permanent rule and must survive migration.

DELETE never means deleting immutable source workout records. Historical preservation allows an isolated compatibility decoder, not a live renderer, writer, route, engine, or hidden active domain.

Technical coupling changes migration order only. It does not weaken a permanent DELETE or NOT AUTHORIZED decision.

## 2. Authoritative disposition tables

### A. Information architecture and startup

| ID | Feature | Final disposition | Permanent rule |
| --- | --- | --- | --- |
| A-01 | Today landing screen | **SIMPLIFY** | Default destination: expected workout, compact preview, direct Start, alternate picker, optional readiness, Resume/one session exception when applicable. |
| A-02 | Multi-day workout list on Today | **SIMPLIFY** | Secondary compact alternate-workout picker; no planning dashboard. |
| A-03 | Start-workout confirmation modal | **DELETE** | Start opens the logger directly. |
| A-04 | Readiness choice modal before every workout | **DELETE** | Readiness is optional and never blocks Start. |
| A-05 | Persistent Routines/Templates tab | **DELETE** | Routine management is secondary. |
| A-06 | Permanent Dashboard destination | **DELETE** | Progress is the only historical destination. |
| A-07 | Settings | **KEEP** | Secondary utility only; never a deleted-feature graveyard. |
| A-08 | Active-workout full-screen mode | **KEEP** | Logger owns the screen while active. |
| A-09 | Resume active workout | **KEEP** | Recover the one active draft with entries intact. |
| A-10 | Prevent a second active workout | **SIMPLIFY** | Offer Resume, Finish, or Discard; never create or replace silently. |
| A-11 | Cancel/discard workout | **KEEP** | Explicit action with destructive confirmation. |

### B. Readiness, fatigue, illness, and coaching signals

| ID | Feature | Final disposition | Permanent rule |
| --- | --- | --- | --- |
| B-01 | Usual-readiness baseline | **KEEP** | Default silently; no daily acknowledgement. |
| B-02 | Manual readiness logging | **SIMPLIFY** | Optional quick deviation capture. |
| B-03 | Sleep, HRV, and resting-HR integration | **ENGINE ONLY** | Consume already available validated data; no new integration is authorized. |
| B-04 | Soreness input | **SIMPLIFY** | Optional compact deviation input. |
| B-05 | Illness/injury toggle | **KEEP** | Direct safety input with highest arbitration priority. |
| B-06 | General readiness score | **DELETE** | No user-facing composite score. |
| B-07 | Intervention taxonomy | **ENGINE ONLY** | Minimum internal action vocabulary only. |
| B-08 | Muscle-group fatigue detection | **ENGINE ONLY** | Survives only after calibrated actionable-value evaluation. |
| B-09 | Exercise-level fatigue detection | **ENGINE ONLY** | Same evidence gate; at most one stricter exercise action. |
| B-10 | Plateau detection | **ENGINE ONLY** | Quiet exception only after evaluation. |
| B-11 | Deload detection | **ENGINE ONLY** | One validated session-level action. |
| B-12 | Pain/illness warning | **KEEP** | One plain warning; continuing remains loggable and is explicitly recorded. |
| B-13 | Flag severity/confidence matrices | **ENGINE ONLY** | Evidence gating only; no visible scores/matrices. |
| B-14 | Multiple simultaneous recommendation cards | **DELETE** | Resolve to one session action plus one stricter exercise action at most. |
| B-15 | Recommendation evidence citations | **DELETE** | Research validation stays outside normal product UI. |
| B-16 | Long recommendation explanation | **SIMPLIFY** | One short reason; concise detail only on demand. |
| B-17 | Recommendation confidence/severity badges | **DELETE** | No badges, meters, or pseudo-precision. |
| B-18 | Research database visible in app | **DELETE** | Delete counts/status/versions/weights/citations; validated internal sources may remain. |

### C. Prescription, targets, and normal progression

| ID | Feature | Final disposition | Permanent rule |
| --- | --- | --- | --- |
| C-01 | Template-defined rep range | **KEEP** | Stable exercise-variant target. |
| C-02 | Template-defined target RPE | **KEEP** | Stable exercise-variant target. |
| C-03 | Automatic rep-range rewriting | **DELETE** | Only explicit variant edits change the normal range. |
| C-04 | Normal recommendation paragraphs | **DELETE** | Stable targets and prior facts are normal guidance. |
| C-05 | Progress-ready detection | **SIMPLIFY** | Factual marker only; not an exact prescription. |
| C-06 | Exact add-rep recommendation | **DELETE** | No normal exact rep advice or prefill. |
| C-07 | Exact add-load recommendation | **DELETE** | No normal exact load advice or prefill. |
| C-08 | Add-set recommendation | **DELETE** | Set increases require an explicit routine/user choice. |
| C-09 | Hold recommendation | **DELETE** | Silence means proceed normally. |
| C-10 | Lower-RPE recommendation | **ENGINE ONLY** | Allowed only as a validated exception action. |
| C-11 | Load/set/rep adjustment object | **ENGINE ONLY** | Minimum versioned exception object; never a second visible prescription. |
| C-12 | Progression expectation/return criteria | **ENGINE ONLY** | Bounds temporary exceptions; concise detail only with an active action. |

### D. Live workout and set logging

| ID | Feature | Final disposition | Permanent rule |
| --- | --- | --- | --- |
| D-01 | Weight entry | **KEEP** | Fast numeric entry; factual prior-set/routine-default/blank prefill only. |
| D-02 | Rep entry | **KEEP** | Fast integer entry under the same factual prefill rule. |
| D-03 | RPE entry | **KEEP** | Immediate replacement and 0.5 increments; implementation awaits target-device reproduction. |
| D-04 | Previous-set performance | **KEEP** | Same variant and comparable set role only. |
| D-05 | Previous-workout summary | **SIMPLIFY** | Last date and compact relevant working-set facts. |
| D-06 | Current-set highlighting | **KEEP** | Accessible distinction from complete and pending. |
| D-07 | Completed/untouched set states | **KEEP** | Clear logging progress without status taxonomy. |
| D-08 | Automatic current-set advance | **SIMPLIFY** | Predictable, context-preserving, and editable. |
| D-09 | Add set | **KEEP** | Secondary action that records actual work. |
| D-10 | Remove/skip set | **KEEP** | Explicit and distinct from completion; no automatic grade penalty. |
| D-11 | Reorder exercises | **SIMPLIFY** | Simple reorder/Do next; persist actual order. |
| D-12 | Substitute exercise | **KEEP** | Quick current-workout substitution; routine update is separate and explicit. |
| D-13 | Custom exercise creation | **SIMPLIFY** | Name and stable targets required; metadata optional. |
| D-14 | Named exercise variants | **KEEP** | Independent identity, targets, defaults, and history. |
| D-15 | Equipment-availability blocking | **DELETE** | Equipment state cannot prevent logging. |
| D-16 | Exercise-library taxonomy during logging | **ENGINE ONLY** | Minimum validated mapping only; contextual correction when necessary. |
| D-17 | Exercise notes | **KEEP** | Optional and attached to the correct variant/session. |
| D-18 | Session notes | **KEEP** | Optional during workout and completion. |
| D-19 | Workout duration | **KEEP** | Capture automatically with defined pause/resume semantics. |
| D-20 | Exercise order | **KEEP** | Persist actual order automatically. |
| D-21 | Warm-up logging | **SIMPLIFY** | Loggable, visually distinct, inferred/prefilled classification correctable. |
| D-22 | Working-set classification | **ENGINE ONLY** | Infer conservatively and expose correction only when needed. |
| D-23 | Back-off/drop-set classification | **ENGINE ONLY** | Preserve known roles; do not force classification. |
| D-24 | Rest timer | **KEEP** | Automatic start, remaining/elapsed state, simple adjust and Skip, recoverable state. |
| D-25 | Exercise-specific rest defaults | **KEEP** | One stable default per variant, edited contextually. |
| D-26 | Lock-screen/live notification | **KEEP** | Where supported and permitted; device verification required. |
| D-27 | Sound and vibration controls | **SIMPLIFY** | Central permission-aware controls only. |
| D-28 | Elapsed-rest display | **KEEP** | Show over-target elapsed time. |
| D-29 | Per-set rest button | **SIMPLIFY** | Shared timer start/restart, not repeated on every set. |
| D-30 | Full exercise name visibility | **KEEP** | Wrap/expand; never hide a meaningful variant suffix. |

### E. Overrides, grade, and completion

| ID | Feature | Final disposition | Permanent rule |
| --- | --- | --- | --- |
| E-01 | Free load/rep/RPE override | **KEEP** | Record actual work without permission; warnings inform but do not falsify/block the record. |
| E-02 | Save for workout versus routine | **SIMPLIFY** | Current workout is default; routine mutation is explicit. |
| E-03 | Grade based on prescription adherence | **DELETE** | Deviation itself is not a negative signal. |
| E-04 | Workout grade | **SIMPLIFY** | One versioned A-F grade based on actual work; current formula is not approved. |
| E-05 | Hypertrophy score | **DELETE** | No second/renamed stimulus score. |
| E-06 | Exercise progression summary | **KEEP** | Factual comparable improvements only. |
| E-07 | PR detection | **SIMPLIFY** | Small defined set of meaningful comparable PRs. |
| E-08 | PR summary page | **DELETE** | Integrate highlights into completion and contextual Progress detail. |
| E-09 | Post-workout completion experience | **KEEP** | One concise grade/highlights/exception screen. |
| E-10 | Next-time recommendation on completion | **SIMPLIFY** | Factual progress marker or canonical active exception only. |
| E-11 | Confetti/celebration effects | **NOT AUTHORIZED** | Polish is required; a new effect is not. |
| E-12 | Completion confirmation | **KEEP** | One concise consequential-action confirmation and supported recovery. |

### F. Progress, history, and analytics

| ID | Feature | Final disposition | Permanent rule |
| --- | --- | --- | --- |
| F-01 | Completed-workout history | **KEEP** | Chronological factual history. |
| F-02 | Exercise history | **KEEP** | Variant-specific recent and older sessions. |
| F-03 | Exercise charts | **SIMPLIFY** | One interpretable comparable-performance trend first. |
| F-04 | Clickable chart points | **KEEP** | Reveal date, load, reps, RPE, role, and session context. |
| F-05 | “Reps at weight” chart | **DELETE** | Relevant facts remain in unified history. |
| F-06 | Date-window selector | **SIMPLIFY** | Sensible default and one contextual range control. |
| F-07 | Six qualifying weeks control | **ENGINE ONLY** | Validated comparable-exposure selection; no user control or universal six-week rule. |
| F-08 | Six-month active retention | **KEEP - ALREADY SATISFIED** | Preserve all history; recent windows affect calculation/default display only. |
| F-09 | Weekly muscle-volume dashboard | **DELETE** | No replacement dashboard or Today computation. |
| F-10 | Direct/secondary/fractional-set display | **DELETE** | No visible volume taxonomy. |
| F-11 | Direct/secondary/fractional-set calculation | **ENGINE ONLY** | Minimum mapping only if evaluation proves it necessary for an approved flag. |
| F-12 | Program-wide hypertrophy score | **DELETE** | No renamed replacement. |
| F-13 | Per-lift hypertrophy score | **DELETE** | Use actual performance history. |
| F-14 | Overall dashboard scorecards | **DELETE** | Today shows an exception only; Progress shows historical facts. |
| F-15 | Muscle-group progress charts | **NOT AUTHORIZED** | Exercise-level charts are the evidenced scope. |
| F-16 | Recovery-impact charts | **NOT AUTHORIZED** | Preserve source facts; do not create a new chart family. |
| F-17 | Archived historical mesocycles | **DELETE** | Preserve workouts/routine labels/snapshots without mesocycle UI. |

### G. Routines, templates, and mesocycles

| ID | Feature | Final disposition | Permanent rule |
| --- | --- | --- | --- |
| G-01 | Basic routine/template | **KEEP** | Days plus ordered variants with stable sets/range/RPE/rest. |
| G-02 | Duplicate routine | **KEEP** | Secondary action creating an independent routine. |
| G-03 | Edit routine | **SIMPLIFY** | Names, order, variants, sets, range, target RPE, and rest only. |
| G-04 | Automatic mesocycle generation | **DELETE** | No generator, request input, hidden state, or route. |
| G-05 | Modular mesocycle builder | **DELETE** | Remove complete workflow and active state. |
| G-06 | Guide/Setup/Build/Check/Create tabs | **DELETE** | Remove routes/state/copy/tests/deep links. |
| G-07 | Plan-your-mesocycle guide | **DELETE** | Do not move to Help or Settings. |
| G-08 | Exercise candidate pool | **DELETE** | Search/create the actual exercise directly. |
| G-09 | Selected exercise portfolio | **DELETE** | The routine's actual ordered exercises are sufficient. |
| G-10 | Equipment-filter setup | **DELETE** | Descriptive metadata only; no global constraint. |
| G-11 | Muscle-group scope selection | **DELETE** | No program-design questionnaire/state. |
| G-12 | Frequency badges and target-status colors | **DELETE** | No replacement validation badges. |
| G-13 | Maximum sets/day guardrail | **DELETE** | No evidenced core job; cannot block/warn during logging. |
| G-14 | Maximum exercises/muscle/day guardrail | **NOT AUTHORIZED** | Do not retain dormant planner logic. |
| G-15 | Program-wide exercise reuse rules | **DELETE** | Explicit routine choice prevails. |
| G-16 | Recommended muscles/exercises in builder | **DELETE** | No algorithmic planner substitute. |
| G-17 | Historical mesocycle lifecycle states | **DELETE** | Legacy decode only; stop active state and new writes. |
| G-18 | Program recommendation quality score | **PROCESS ONLY** | Evaluation discipline for surviving rules; no app score/state/route. |

### H. Data, imports, Settings, and quality systems

| ID | Feature | Final disposition | Permanent rule |
| --- | --- | --- | --- |
| H-01 | Load, reps, and RPE history | **KEEP** | Preserve until Erik explicitly deletes data. |
| H-02 | Exercise order history | **KEEP** | Preserve actual sequence and identity. |
| H-03 | Session duration history | **KEEP** | Preserve captured values/semantics; do not invent missing time. |
| H-04 | Readiness deviation history | **KEEP** | Preserve recorded/supplied facts and provenance. |
| H-05 | Notes history | **KEEP** | Preserve exercise and session notes. |
| H-06 | Rest-duration history | **ENGINE ONLY** | Preserve where recorded; no analytics screen follows from retention. |
| H-07 | Strong import | **KEEP** | Secondary Data action with preview, validation, versioning, and recovery. |
| H-08 | Warm-up inference during import | **ENGINE ONLY** | Conservative inference, original value/provenance, correction for ambiguity. |
| H-09 | Data export | **KEEP** | Complete documented versioned export. |
| H-10 | Clear local data | **KEEP** | Explicit scope and destructive confirmation. |
| H-11 | Data retention controls | **DELETE** | Preserve all history; no risky archive-window setting. |
| H-12 | Notification settings | **KEEP** | Timer behavior and permission controls only. |
| H-13 | Privacy policy and support | **KEEP** | Reliable secondary pages and return path. |
| H-14 | Weekly UI-consistency audit automation | **PROCESS ONLY** | Engineering workflow, not product UI. |
| H-15 | Browser/device visual verification | **PROCESS ONLY** | Required release evidence. |
| H-16 | Research-backed logic audit | **PROCESS ONLY** | Required for surviving rules; no research-status UI. |
| H-17 | Multiple documentation sources of truth | **SIMPLIFY** | Final package is intent; Phase 1/audit are labeled evidence; living docs track implemented state. |
| H-18 | Multiple recommendation sources of truth | **DELETE** | One versioned canonical resolver feeds all visible/stored actions. |
| H-19 | Permanent feature flags hiding deleted systems | **SIMPLIFY** | Migration-only flags have owner/exit/deletion gates; none survive final acceptance. |

## 3. Audit-discovered features and structures

| ID | Item | Final disposition | Permanent rule |
| --- | --- | --- | --- |
| X-01 | Generated `www/` mirror | **KEEP - ALREADY SATISFIED** | Generated package, never a second hand-edited source; sync/cache verification required. |
| X-02 | React/Vite redesign concept gallery/toolchain | **DELETE** | Remove concept-only runtime/build/test/config/dependencies at migration end; preserve governance and adjudication records. |
| X-03 | Large inline CSS | **NOT AUTHORIZED** | Extraction is not a product prerequisite; separate evidence/authorization required. |
| X-04 | Plate calculator | **DELETE** | Remove completely; do not relocate. |
| X-05 | Execution-quality questionnaire | **DELETE** | Stop UI/new writes; preserve historical values and treat missing as unknown. |
| X-06 | Modern and legacy recommendation renderers | **DELETE** | Canonical exception presentation replaces both; historical records need no old renderer. |
| X-07 | User-facing confidence primitive | **DELETE** | Remove UI/state/styles; retain plain provenance and calibrated internal sufficiency only. |
| X-08 | `basePrescription`/prescription snapshots | **SIMPLIFY** | Preserve immutable history and temporary migration comparison; no entitlement for the normal prescription generator. |
| X-09 | Equipment preference in settings/backups | **DELETE** | Legacy decoder may accept/discard; no active writer/reader/blocker. |
| X-10 | Research-status/evidence-weight surfaces | **DELETE** | Remove UI; validated internal source material may remain for approved rules. |

## 4. End-of-migration deletion ledger

Final acceptance requires complete deletion of:

- Dashboard, Plan, More, persistent Routines, and persistent Progress-subview navigation;
- confirmation/readiness/review start modal states;
- mandatory readiness and visible general-readiness scoring;
- all normal exact add-rep/add-load/add-set/hold coaching and prefill;
- automatic normal rep-range rewriting;
- direct detector consumers, fallback target mutation, and duplicate recommendation renderers;
- recommendation confidence/severity/evidence/research-status UI;
- global equipment constraint state, writers, readers, setup, and blockers;
- mesocycle UI, routes, guide, builder, pools, portfolio, validation, lifecycle, active state, request coupling, planner-only engine code/schemas/tests/cache/docs;
- hypertrophy/volume/program scores, scorecards, visible fractional-set accounting, and removed chart families;
- plate calculator and execution-quality questionnaire/new writes;
- old live adherence-grade algorithm, confidence/category presentation, and PR-only page;
- concept-only React/Vite runtime/build/test/dependency path;
- expired adapters, shadow paths, feature flags, dead styles/assets, and obsolete current-intent tests/docs.

The final product does not keep both competing approaches. Temporary migration coexistence ends at its named gate.

## 5. Preserved historical/data boundary

Deletion does not erase:

- completed workouts and actual set observations;
- exercise/variant identity, order, duration, notes, readiness, and rest facts;
- original imported values and provenance;
- immutable submitted prescription/action snapshots;
- historical grade value/version;
- historical execution-quality values;
- routine/template facts needed to interpret history.

These records may be read through an isolated compatibility decoder. They receive no deleted route, renderer, recomputation path, active writer, hidden domain, or new record creation.

## 6. Coverage assertion

This document contains **137 of 137** Phase 1 rows:

- A: 11
- B: 18
- C: 12
- D: 30
- E: 12
- F: 17
- G: 18
- H: 19

It also adjudicates ten audit-discovered feature/structural items. The exhaustive Claude finding-by-finding rationale, temporary accommodations, and non-inference limits are in the adjudication matrix.

## 7. Codex must not infer or add

- A retained internal calculation does not authorize its old interface.
- Preserved historical fields do not authorize active feature state.
- Imported health observations do not authorize a new direct integration.
- Progress-ready facts do not authorize exact normal load/rep prescriptions.
- Settings does not authorize an Advanced/More/Insights graveyard.
- Current code/tests do not approve current thresholds, formula weights, or UI.
- Technical file size does not authorize a framework rewrite or CSS extraction.
- This disposition does not authorize implementation, data migration, commit, push, deployment, or publication.
