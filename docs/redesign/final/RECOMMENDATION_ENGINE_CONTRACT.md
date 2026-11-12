# Comprehensive Fitness Recommendation Engine Contract

**Status:** FINAL PRODUCT CONTRACT, partly superseded by D-028 (2026-10-31)  
**Date:** 2026-07-30  
**Superseded clauses:** [D-028](../DECISION_LOG.md) adds a distinct per-session prescription channel governed by [`../coach/COACH_V1_CONTRACT.md`](../coach/COACH_V1_CONTRACT.md). The bans on normal add-load, add-rep, add-set, hold, and reason text no longer apply to that channel. Exception validation, precedence, the pain/illness advisory, and the threshold-approval gates in this contract stand.  
**Implementation status:** Not started or authorized by this document  
**Product authority:** [`FINAL_REDESIGN_PRD.md`](FINAL_REDESIGN_PRD.md)  
**Evidence and rulings:** [`../audits/ADJUDICATION_MATRIX.md`](../audits/ADJUDICATION_MATRIX.md)

## 1. Purpose

The recommendation engine is a quiet exception resolver. Its job is to identify the rare case in which credible fatigue, plateau, deload, readiness, pain, or illness evidence should change today's action.

It is not responsible for narrating normal training, designing programs, choosing a normal rep range, or prescribing exact routine progression.

The engine has succeeded when:

- normal sessions are silent;
- a material exception produces one coherent action;
- competing signals cannot create competing user instructions;
- stable user-owned targets remain stable;
- every surfaced action is reproducible and auditable;
- missing or weak evidence produces no coaching output;
- engine failure never prevents recording the actual workout.

## 2. Non-negotiable boundaries

### 2.1 Variant targets are authoritative

The active exercise variant owns its normal:

- set count;
- rep range;
- target RPE;
- rest default.

Only an explicit user edit changes these normal targets.

The engine may not:

- rewrite a normal rep range;
- create a second “recommended range”;
- use an exact normal load/rep output as input prefill;
- add sets during normal progression;
- silently mutate a routine;
- grade a user for obeying an engine-generated plan.

A validated exception may prospectively reduce load, set count, or effort ceiling. It does not rewrite the normal range and it does not alter completed observations.

### 2.2 Silence is a valid and preferred output

No action is the default. The absence of a flag means “use the stable target and your judgment,” not “the model guarantees readiness” or “hold the exact previous load.”

The engine does not generate normal:

- add-rep advice;
- add-load advice;
- add-set advice;
- hold advice;
- recommendation paragraphs;
- confidence/severity badges;
- research citations.

### 2.3 One authority

Candidate detectors may remain separate modules, but they are not recommendation sources. They submit normalized evidence to one versioned resolver.

Only the canonical resolver may:

- decide that an exception is user-visible;
- choose the winning action;
- persist a resolved action;
- provide recommendation output to Today, the active workout, completion, history, or grade logic.

No screen may read a detector directly. No fallback may independently mutate live targets or render a second recommendation.

## 3. Contract vocabulary

### 3.1 Candidate

A detector's versioned claim that available evidence might justify an action. A candidate is not user-visible and has no product authority.

Every candidate must declare:

- detector and rule version;
- evaluation time and applicable scope;
- source observation identifiers or an immutable input digest;
- evidence provenance;
- proposed action family;
- reason code;
- evidence sufficiency result;
- expiry/return condition when applicable.

### 3.2 Resolved action

The single canonical decision produced after validation, precedence, deduplication, and scope arbitration.

It contains at minimum:

- contract version;
- resolver version;
- unique decision identifier;
- evaluation timestamp;
- `no_action` or `action`;
- category;
- scope (`session` or one exercise variant);
- plain action code and parameters;
- short reason code(s);
- input/source references;
- effective and expiry/return boundary;
- whether Erik accepted, modified, ignored, or overrode it;
- superseded decision reference when reevaluated.

The stored contract should be structural and versioned. UI copy is derived from it; prose is not the authoritative state.

### 3.3 Factual marker

A compact historical fact such as `Top of range last time`. It may help Erik judge progression, but it is not a resolved action and may not include an exact next load or rep prescription.

### 3.4 Provenance

Source truth is represented plainly:

- `recorded` - directly entered or supplied as a source observation;
- `inferred` - derived or classified by a documented rule;
- `missing` - unavailable;
- `ambiguous` - available but not safely classifiable.

Provenance is not a confidence score. Missing data is not zero, normal, or bad unless a specific product rule explicitly establishes that meaning.

## 4. Allowed exception categories

The permanent category set is:

1. **pain_or_illness**
2. **deload**
3. **readiness**
4. **fatigue**
5. **plateau**

The internal action vocabulary may express only the minimum needed to communicate:

- stop or skip the affected work;
- use a lighter session or exercise;
- reduce load;
- reduce sets;
- cap effort/RPE;
- follow a time-bounded deload;
- address a plateau with one validated action;
- no action.

This list does not approve any current threshold, percentage, duration, copy string, or detector implementation. New categories or action families require a new product decision and evidence review.

## 5. Inputs

### 5.1 Stable routine facts

- exercise-variant identity;
- normal set count;
- normal rep range;
- target RPE;
- rest default;
- routine/day identity and intended order.

These are reference facts, not detector outputs.

### 5.2 Actual training observations

- submitted load, reps, and RPE;
- working/warm-up/back-off/drop role with provenance;
- actual exercise order;
- timestamps/duration where semantics are known;
- rest observations where recorded;
- substitutions and named variants;
- notes;
- explicit user overrides;
- immutable prior resolved actions and snapshots.

Only comparable observations may be used for trend claims. Variant identity and set role are part of comparability.

### 5.3 Readiness and safety observations

- usual-readiness baseline;
- explicit readiness deviation;
- unusual soreness;
- explicit pain, injury, or illness input;
- a user note;
- already available sleep, HRV, or resting-HR observations with provenance.

No new sensor integration is authorized. Absence of optional objective data cannot count against the user.

### 5.4 Historical window

All history is preserved. A detector may use a documented recent window or minimum exposure rule only when evaluation proves it appropriate for that detector. “Six weeks” and “six months” are not universal engine constants approved by this contract.

## 6. Candidate qualification

A candidate can reach arbitration only when all applicable conditions pass:

1. **Identity integrity:** relevant observations belong to the correct exercise variant and role.
2. **Source integrity:** imported, recorded, and inferred fields retain provenance and pass schema validation.
3. **Comparability:** the claimed trend is based on meaningfully comparable exposures.
4. **Sufficiency:** the rule's minimum quantity and quality of evidence are met.
5. **Freshness:** the evidence is recent enough for the proposed action under a documented rule.
6. **Materiality:** the action would reasonably change today's decision, not merely describe ordinary variance.
7. **Calibration:** replay/evaluation supports an acceptable false-positive and false-negative profile.
8. **Actionability:** the candidate maps to one allowed, plain action with a defined scope and expiry.
9. **Non-duplication:** it is not merely a lower-level restatement of another candidate.
10. **Auditability:** the output can be reproduced from a versioned input fixture.

If any required condition fails, the candidate is suppressed. The UI receives no “low confidence” card.

Existing detector thresholds and passing legacy tests demonstrate implemented behavior only. Each surviving rule requires explicit evaluation and approval against this contract.

## 7. Arbitration

### 7.1 Precedence

Precedence is:

1. explicit pain/illness safety action;
2. session-level/full deload;
3. the stricter coherent readiness-or-fatigue action at each scope;
4. plateau;
5. no action.

Higher-priority actions absorb lower-priority reasons when those reasons support the same user action. The renderer does not show the absorbed candidates as extra cards.

### 7.2 Scope

The resolver returns:

- at most one session action; and
- at most one exercise action, only when it is materially stricter than and not redundant with the session action.

A session action suppresses an equal or weaker exercise action. A safety action suppresses ordinary plateau/progression output. An exercise action names one exercise variant and cannot silently apply to every variant with a similar display name.

### 7.3 Strictness

The implementation must define and test a versioned action ordering before arbitration ships. Renderers cannot improvise strictness.

At minimum:

- stop/skip is stricter than continuing with modification;
- a modification is stricter than no action;
- an exercise action survives a session action only if it materially changes what Erik should do for that exercise.

Where two modifications are not safely comparable, the resolver must choose the coherent higher-priority action or produce one combined action that remains within the allowed vocabulary. It may not display both as a compromise.

### 7.4 Reevaluation

Evaluation may occur only at explicit boundaries, such as:

- workout start;
- submission or change of readiness/safety input;
- entry into an exercise before working sets;
- completion of a set that adds material evidence;
- workout completion for future exception state.

Reevaluation is prospective. It cannot rewrite completed sets, submitted workouts, stable routine targets, or the historical decision that was visible at the time. A changed result supersedes the prior active decision and preserves the relationship for audit.

## 8. Presentation contract

A resolved action is rendered consistently on every surface.

The default presentation contains:

- one plain action;
- affected scope;
- one short reason.

Optional detail may show:

- the material trigger;
- the relevant recorded facts;
- the action's expiry or return condition.

The presentation does not show:

- numeric model confidence;
- severity matrices or badge taxonomy;
- evidence weights;
- citations or research-database status;
- every contributing detector;
- raw internal adjustment objects;
- normal recommendation prose.

Today shows only a session action. The active workout may show the same session action and, when permitted, one stricter exercise action. Completion does not generate an independent new coaching source.

## 9. Safety and logging integrity

An explicit pain/illness observation has highest priority and must not be buried under a score or lower-priority training suggestion.

The product:

- uses plain, non-diagnostic language;
- does not claim that continuing is safe;
- does not manufacture medical certainty from training data;
- records Erik's explicit decision to continue, modify, or stop;
- continues to permit recording actual work if he proceeds;
- keeps authorization/data-integrity failures distinct from product advice.

Equipment availability is not a safety input and cannot block logging.

If the recommendation path fails, the logger remains usable. A versioned, deterministic safety fallback inside the canonical resolver boundary may present a generic warning for an explicit pain/illness input; it must not create a second recommendation source.

## 10. Persistence and historical integrity

### 10.1 Active workout

The active draft stores the resolved action and the immutable references needed to understand the action visible at that time. It also records subsequent user handling of the action.

### 10.2 Submitted workout

Submission freezes:

- actual observations;
- relevant stable-target snapshot;
- resolved-action snapshot;
- explicit overrides;
- grade value and version when produced;
- source/provenance required to interpret the record.

Historical workouts are not silently recomputed after rule changes.

### 10.3 Legacy fields

Legacy prescription, recommendation, confidence, mesocycle, equipment, execution-quality, and evidence fields may remain readable through isolated compatibility decoders. They do not require:

- an old renderer;
- old detector execution;
- new writes;
- an active domain array;
- an interface;
- a permanent feature flag.

`basePrescription` may temporarily support before/after migration comparison and historical interpretation. It does not entitle the full normal prescription generator to survive.

## 11. Grade relationship

The grade consumes:

- actual submitted work;
- logging completeness/validity;
- comparable historical facts;
- the canonical resolved action and Erik's handling of it.

The grade does not consume detector outputs directly. It cannot:

- penalize deviation merely because it differed from an initial plan;
- require the deleted execution-quality questionnaire;
- reward following a normal engine prescription;
- include a user-facing confidence score;
- silently regrade historical workouts when engine rules change.

## 12. Failure behavior

| Condition | Required outcome |
| --- | --- |
| Missing optional readiness/objective data | No penalty and no invented value. Continue normal logging. |
| Insufficient or ambiguous history | Suppress the candidate. Show source facts only where useful. |
| Detector error | Suppress that candidate, record an engineering error without personal data leakage, and keep logging usable. |
| Resolver error | Use only the canonical safety fallback for explicit pain/illness; otherwise no action. Keep stable targets and logging available. |
| Stale candidate | Do not surface it. |
| Conflicting lower-priority candidates | Resolve to one coherent action or no action; never show both. |
| Unknown variant/role identity | Do not claim a comparable trend or plateau. |
| Notification unavailable | Timer remains functional in-app and explains permission/platform limitation contextually. |
| Import ambiguity | Preserve original input and mark provenance; do not convert uncertainty into confidence. |

Silence after an engine failure must not be presented as proof that no risk exists.

## 13. Evaluation and approval gates

Each detector and the resolver require:

- documented rule intent and allowed action;
- synthetic boundary and permutation fixtures;
- historical replay using privacy-safe/synthetic or locally controlled data;
- variant/role comparability tests;
- missing, sparse, and ambiguous-data tests;
- conflicting-candidate arbitration tests;
- one-session/one-exercise output-cap tests;
- no-normal-prescription and stable-range invariant tests;
- false-positive and false-negative review;
- deterministic versioned snapshots;
- performance measurement at Today and workout-start boundaries;
- independent recommendation-logic review;
- Erik's five-workout field test.

Evaluation must include ordinary sessions and prove that ordinary variance remains silent. A detector is not approved merely because it can find true examples; its nuisance rate matters.

No current fatigue, readiness, plateau, deload, grade, evidence, or confidence threshold is approved by this document. Threshold approval is a separate evidence result recorded during implementation.

## 14. Migration contract

During migration:

1. normalize current detector outputs into candidate adapters without adding new UI;
2. implement the canonical resolver and immutable output contract;
3. compare old and new results in non-visible shadow evaluation using safe fixtures and approved local data;
4. ensure every visible surface reads only the resolved contract;
5. remove legacy and modern recommendation renderers;
6. remove fallback target mutation and direct detector consumers;
7. remove shadow adapters and the migration flag after exit criteria pass;
8. delete obsolete detector code that does not support an approved category;
9. update tests and living documentation in the same integration revision.

Temporary coexistence is sequencing only. It does not authorize two permanent approaches.

## 15. Explicit prohibitions

Codex must not infer or add:

- a new category, score, integration, screen, or settings control;
- exact normal load/rep recommendations under another label;
- a visible “low confidence” output;
- a hidden mesocycle or equipment domain to keep legacy backups simple;
- a recommendation graveyard under Progress, Settings, Advanced, More, Help, or Insights;
- direct UI consumption of candidate detectors;
- approval of current thresholds because current tests pass;
- medical diagnosis or a claim that a workout is safe;
- historical recomputation as a substitute for preserving source records;
- implementation or publication authority from this contract.

