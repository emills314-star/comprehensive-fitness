# Decision engine

## Metadata

- **Purpose:** Catalog of implemented and intended logic that turns history, research, and readiness into guidance
- **Last verified:** 2026-07-14
- **Repository:** integrated foundation plus accepted private-import and workout-safety composition
- **Verification status:** VERIFIED against `prescription-engine.js`, relevant `index.html` logic, schemas, data pipelines, and tests
- **Related:** [Project](PROJECT.md), [architecture](ARCHITECTURE.md), [UI/UX](UI_UX.md), [training data map](training-prescription-data.md), [research methodology](../research_database/METHODOLOGY.md)

## Living-document rule

Read this document before changing readiness, recovery, progression, volume, PR, fatigue, deload, scoring, confidence, evidence weighting, or recommendation behavior. After implementation, update every affected rule, formula, threshold, guardrail, missing-data behavior, and source reference in the same task; then update `ROADMAP.md`. Never document a proposed formula as implemented or leave an obsolete threshold here after code changes.

## Purpose and evidence hierarchy

### Guided planning rules — IMPLEMENTED

The introductory guide and viability evaluator consume the same exported `PLANNING_RULES` object. Normal sessions should remain at or below 18 working sets; more than two direct exercises for one muscle in one day is a strong warning; normal/priority muscles default to two meaningful weekly exposures, maintenance to one, and specialization to at least two. Direct sets, exercise-specific fractional contribution, weighted stimulus, and isometric exposure remain separate.

The engine's `aggregateMuscleResearchDefaults` adapter is the only guided-builder research target boundary. It reads `minimum_effective_weekly_sets` and `typical_effective_weekly_sets_low/high`, then applies documented maintenance or specialization adjustments. The builder does not parse alternate field names or maintain a duplicate fallback formula.

Target-muscle candidate eligibility requires canonical `direct_load` or positive-credit `meaningful_fractional_load` (legacy `primary`/`secondary` remain schema-compatible). Isometric stabilizing, incidental, unknown, and zero-credit relationships are excluded even when a private personal-derived row claims secondary involvement. `targetMuscleEffectiveness` combines canonical specificity with target-relevant progression, recovery, research support, and fatigue efficiency; confidence and overall exercise quality remain separate fields.

Empty configured days are technical blockers. Unusual but usable volume or frequency choices are warnings the user may explicitly accept. Cross-day reuse of the same canonical exercise is allowed and creates no finding. Any assignment, move, or set edit makes the prior viability result stale.

Viability begins at 100 and deducts for unresolved blockers, strong warnings, and advisories. Grades are Excellent (90+), Good (80+), Workable (70+), and Needs Revision. Only unresolved technical blockers prevent linked-template creation.

Guided muscle status is computed once from total effective sets (`direct + credited fractional`), exposure frequency, and distribution. A muscle is successful only when every applicable rule passes. Priority is blocking/invalid, fatigue or recovery risk, above target, missing frequency, below target, poor distribution, then fully valid. A fractional-only total may satisfy volume; it does not satisfy frequency unless qualifying work occurs across the required exposures. Remaining volume is `max(0, minimum target - total effective sets)` and retains half-set precision when applicable. Build, Needs Attention, Completed, Viability, Review, and Create consume the same status object.

The engine selects exercises, creates versioned prescriptions and mesocycles, adjusts a workout for current readiness, explains decisions, and preserves the exact recommendation used. It is deterministic for the same normalized inputs; research translation and some operational thresholds are heuristic.

Implemented precedence is tested as:

1. Credible high-confidence personal evidence.
2. Moderate personal evidence blended with research.
3. Sparse/low-confidence personal evidence with greater research weight.
4. Research defaults when meaningful personal evidence is absent.

Fewer than three comparable exposures remain research-led (`DEFAULT_POLICY.minimumComparableExposures`, `scripts/test-prescription-engine.js`). Confidence considers exposure count/span, variation consistency, RPE, recovery, nutrition completeness, data completeness, and confounding (`derivePersonalEvidenceMetrics`, `calculateEvidenceWeight`). Exact IDs/aliases are preferred; unresolved variants remain separate.

Private exercise identity reconciliation examines all three executable personal sources: exercise scores, exercise prescriptions, and exercise-muscle scores. A newly selected evidence file or backup is rejected atomically when any reconciled identity is invalid; no runtime engine, IndexedDB record, revision, completed-analysis cache, prescription cache, or muscle-assignment cache is changed. An invalid identity already present in persisted legacy data is preserved for audit and marked invalid by the reconciler, but canonical identity, prescription, muscle assignment, history grouping, and volume consumers fail closed for that exercise. A successful evidence replacement invalidates every dependent cache before new results are consumed.

### Canonical future-generation target boundary — ENGINE IMPLEMENTED

Prescription engine `3.3.5` exposes two deterministic instance adapters without changing the prescription or snapshot schemas. `resolveExerciseIdentity(value)` resolves a canonical research ID, canonical exercise name, or any exported exercise alias under the engine's case/whitespace/separator normalization. A valid personal crosswalk resolves to its canonical research exercise. An invalid explicit crosswalk returns `invalid_reconciled_identity`; an unmapped custom or unknown value returns `unknown_exercise_identity`. Broad display/reporting regions such as Back, Shoulders, Core, and Glutes are not exercise aliases and cannot become executable exercise identities.

`resolveDefaultPrescriptionTarget(value)` derives a future-generation default only when the resolved exercise has exactly one relationship with `relationship_type=direct_load`, `loading_role=dynamic|mixed`, and positive fractional-set credit. The result retains the exact canonical `mg_*` ID and returns the relationship's taxonomy version as transient resolver provenance. Multiple qualifying direct rows fail closed as `ambiguous_dynamic_direct_target`; zero qualifying rows, including zero-credit and isometric-only rows, fail closed as `no_dynamic_direct_target`. In taxonomy 2.1.0 this resolves 59 of 62 catalog exercises; Farmer's Carry, Pallof Press, and Side Plank remain intentionally ineligible for an automatic dynamic hypertrophy target.

This adapter does not broaden or replace explicit caller targets. `prescribeExercise` continues to accept a valid positive-credit fractional relationship and reject an unrelated target. The app must explicitly adopt the adapter for future automatic generation; existing broad display/reporting projection remains a separate presentation concern. Historical snapshots are immutable: engine 3.3.4 broad targets are read unchanged, engine 3.3.5 uses the existing snapshot/prescription schema pair, and `taxonomyVersion` is not added to persisted snapshot payloads. Consequently this engine-only patch requires no data migration or backfill; rollback to the 3.3.4 reader remains compatible with newly generated schema-unchanged snapshots.

## Inputs

| Input | Status | Implementation |
| --- | --- | --- |
| Submitted app workouts | **IMPLEMENTED** | Comparable sets, completion, load/reps/RPE, set roles, resistance type, pain/notes where available; `index.html` history adapters. |
| Private workout history | **IMPLEMENTED** | Normalized Strong data and exercise-session aggregates via `scripts/personal-fitness/`. |
| Fitbit-derived signals | **PARTIALLY IMPLEMENTED** | Offline exported sleep/HRV/RHR/activity/body-composition data feed aggregate analysis. No live Fitbit API. |
| Nutrition data | **PARTIALLY IMPLEMENTED** | Offline nutrition normalization, research strategies, and same-day adequacy/protein inputs; no meal logger. |
| User recovery report | **IMPLEMENTED** | Sleep hours/quality, HRV, resting HR, soreness, illness, affected muscle, nutrition/protein status, note. |
| Research database | **IMPLEMENTED** | Version 3.0.0 exercise defaults, muscle recommendations, progression rules, substitutions, nutrition strategies, verified PubMed/PMC provenance, rule-to-conclusion mappings, and explicit authority/enforcement/disclosure semantics. |
| Technique, velocity, pain series | **PARTIALLY IMPLEMENTED** | Rules can account for flags/notes, but complete longitudinal technique, velocity, and pain data are not generally present. |

## Readiness and recovery

Engine-level `evaluateReadiness`/`readinessAdjustmentFor` is the canonical scoring path. `recoveryRecommendationForSession` adapts its result into UI labels; it does not calculate a second readiness score. If the engine is unavailable, the app holds the base plan rather than inventing a score. Illness/pain remains an immediate rest/modify guardrail.

Verified engine rules:

- Sleep is adverse below 85% of baseline or below 6 hours; below 70% of baseline is more severe.
- Soreness or fatigue at least 7 is adverse; at least 9 is more severe.
- Subjective readiness at most 4 is adverse; at most 2 is more severe when supplied.
- HRV below 90% of baseline or resting heart rate above 108% of baseline contributes a physiologic domain; more extreme deviation increases severity.
- Recent regression contributes a performance domain.
- Nutrition/protein inadequacy or low energy availability is one independent domain.
- A single isolated marker is monitored and does not rewrite today’s prescription.
- Nutrition alone cannot trigger a deload; an independent signal is required.
- Adverse multi-domain/persistent readiness can reduce working sets, load, and target RPE for one day; it does not rewrite the base prescription or mesocycle.

These thresholds are in `prescription-engine.js:evaluateReadiness` and tested in `scripts/test-prescription-engine.js`. They are operational heuristics, not universal medical cutoffs.

Positive readiness means “follow the plan and take already-planned progressions if warm-ups agree,” not “exceed the plan” (`recoverySessionDetail`, `recoveryRecommendationForSession`). The implemented concise labels include “Go as planned” and adjustment/rest variants. **NEEDS REVIEW:** exact copy differs across app- and engine-level paths.

Missing markers do not count as zeros. Sparse input reduces the number of independent domains available and normally preserves the base plan. Conflicting markers are retained as evidence; multiple independent adverse domains outweigh a lone positive marker. Confidence is expressed in snapshots/evidence, but there is no probabilistic readiness confidence interval.

## Prescription, progression, and overload

`createExercisePrescriptionSnapshot` combines personal/research defaults, selected set structure, volume, progression, staleness, deload, readiness, and explanation. `createWorkoutPrescription` groups immutable exercise snapshots.

The app maps only recognized native `Error` constraint failures with exact supported messages to executable hard-constraint explanations. Unexpected exceptions, including lookalike `TypeError` messages, become a non-executable `engine_failure`; they cannot revive legacy Dashboard advice or be misreported as an ordinary equipment/exclusion condition.

Implemented progression considers exercise/resistance type, rep-range position, completion, RPE/RIR, prior comparable exposure, increment size, technique/pain flags, and trends. Outcomes include normal, progress, hold, reduced volume, light session, scoped/full deload, substitute, and rotate. Exact next actions can add reps, add/reduce load or assistance, hold, reduce volume, or change exercise. Isolation/bodyweight cases prefer rep progression when load jumps are disproportionate (`index.html:progressionProfileForExercise` and recommendation helpers; `determineProgressionDecision`).

For comparable straight sets, load progression requires the first set to reach the top of the prescribed range within the RPE ceiling and every later set to remain within the configured acceptable rep-loss limit. Otherwise the next action is rep-first: keep load constant and add a repetition to the first eligible set below the retention threshold. Once the lead set and retained sets qualify, increase every straight set by the smallest supported equipment increment. A `progress` label is invalid unless load, reps, sets, assistance, execution target, or another explicit performance variable changes.

Readiness/fatigue adjustment changes the smallest sufficient lever. A moderate signal normally preserves load and reps, removes one set only when at least three are programmed, and lowers target RPE by 0.5; a severe multi-domain signal may reduce one set, load by about 5%, and RPE by 1. A planned reduced/light prescription is stored with the performed exposure. Analytics exclude that exposure from weakness/regression baselines and label it as a planned reduction; prescribed lower work must not generate a “performance declined” fatigue flag. Reassessment uses subsequent comparable normal exposures.

Set structures are straight sets, top-set/back-off, multiple top sets, single working set, or custom. A compound may use top/back-off; isolation work uses straight sets when a peak set adds no value. Conflicting personal structure summaries are surfaced rather than silently chosen (`chooseSetStructure`, corresponding test).

The engine’s default policy includes minimum comparable exposures 3, moderate 5, high 8, plateau window 3, regression window 2, minimum rep-range width 2, back-off reduction 8–18% (12% target), maximum rep loss 25%, and maximum back-off reduction 30%. These are **IMPLEMENTED HEURISTICS**, not claimed universal science (`DEFAULT_POLICY`).

Volume does not automatically increase on a plateau and reduces under regression (`determineVolumePrescription`). Mesocycle specialization and lower-fatigue factors are implemented policy values (1.2 and 0.72), while default deload volume factor is 0.5. Any change requires engine tests and contract review.

## Fatigue, staleness, rotation, and deload

`assessExerciseStaleness` evaluates recent comparable exposures, progression/e1RM trends, RPE slope, rep loss, back-off drop, recovery cost, pain, adherence, and alternative advantage. Time alone cannot rotate a still-progressing lift. Classifications include productive, approaching plateau, stalled, regressing, excessively fatiguing, rotation candidate, and insufficient evidence.

Implemented notable thresholds include recovery cost at least 60 on repeated exposures, RPE slope at least 0.3, two recent regressions (including less than -1.5% comparisons), and score-based classifications. These are deterministic operational rules in `prescription-engine.js`, not externally validated universal thresholds.

`assessDeloadNeed` scopes action:

- One affected exercise → exercise-specific deload.
- Multiple degraded exercises for a muscle → muscle-group deload.
- Widespread decline plus persistent systemic suppression → full-program deload.
- One poor HRV value → never sufficient for full-program deload.

Pain blocks automatic progression and can support substitution/rotation; medical diagnosis is outside scope.

A pain-blocked exercise becomes executable only after the user selects and confirms a distinct evidence-linked substitute whose observed workout name resolves to the same current catalog identity recorded by the prescription and safety audit. The app revalidates that identity, current equipment, exclusions, mesocycle scope, and substitution map whenever it renders or executes the workout. Identity drift or a newly incompatible constraint restores the block and asks for a new explicit pain-free confirmation; it never silently falls back to the original exercise.

## Full-program mesocycle planning and candidate scoring

This is the authoritative program-planning section. The planner uses a two-stage process: first choose one program-wide exercise portfolio, then distribute that portfolio across sessions. A `Program Slot` is a muscle-group coverage and exercise-role requirement inside the complete plan; it replaces the former ambiguous “Prescription Block” term. Each slot states its required selection count, weekly sets/exposures, selected exercise, candidate alternatives, planned sessions, and rationale. Five candidates means up to five alternatives for a slot, never five mandatory weekly exercises.

Candidate discovery evaluates the entire compatible research exercise library plus traceable personal/current sources. `Current Program Exercises` means exercises in templates attached to the active mesocycle. `Recent Exercises` means submitted exercise exposures within the last 56 days. `Previously Successful Exercises` requires adequate comparable personal history. `Eligible Exercise Library` is the compatible canonical research library after equipment and restriction filters. Every displayed candidate carries a source trace; equipment exclusions are retained with an inspectable reason. Aliases must normalize to one canonical research ID. Camber Bar Bench Press, Cambered Bench Press, and Cambered Barbell Bench Press resolve to `ex_cambered_barbell_bench_press`.

Equipment filtering uses explicit requirement alternatives. Each alternative is an AND-list (for example barbell + plates + bench + rack); alternatives are OR paths (for example dumbbell, or selectorized machine). The UI exposes seven predictable bundles: Standard Gym (`all`) bypasses restriction; a legacy empty Settings selection has the same Standard Gym meaning. Bodyweight, Bands, and Dumbbells add only their named capability; Barbell adds plates but not a rack; Rack adds rack, flat/incline bench, pull-up bar, and Nordic anchor; Cable Station adds cable and the station's common pull-up bar. An explicit mesocycle equipment restriction narrows Settings equipment: it replaces unrestricted `all`, intersects with any explicit Settings restriction, and fails closed when the intersection is empty. Bodyweight alone does not satisfy a pull-up bar, Nordic anchor, ab wheel, cable, machine, dumbbell, or barbell requirement. Missing verified equipment metadata fails closed whenever restrictions are active.

`Predicted Program Effectiveness` estimates usefulness for the proposed slot and plan; it does not guarantee hypertrophy. The implemented score is 72% isolated target-muscle recommendation strength and 28% full-program fit. The isolated score already blends personal hypertrophy/progression/recovery/repeatability/tolerance evidence with muscle specificity, lengthened loading, stability, progression ease, fatigue cost, research support, and personal confidence. Full-program fit then adjusts for redundant patterns, local/systemic fatigue, spinal load, grip demand, joint stress, equipment, current portfolio, and lower-fatigue role value. Candidate ordering is recomputed after selection. Confidence separately describes evidence quality; Evidence identifies the sources. Positive and limiting factors explain the score.

Mechanical redundancy requires a known shared primary movement pattern, overlapping primary muscle family, and compatible joint action. The implemented similarity also considers role, loading profile, stability, regional emphasis, and equipment; the review requires at least 0.82 similarity before showing a user-facing duplication warning. Unknown or missing patterns score zero and remain internal data-quality work rather than normal user review. Shared equipment, generic compound status, broad push/pull labels, or incidental secondary overlap cannot create redundancy. Repeated same-role hinges for one target can trigger review, while press/fly overlap remains complementary unless the actual role/loading profile is nearly identical. Systemic, spinal, grip, or joint conflicts remain separate fatigue/recovery findings.

Generation order is objective/schedule/equipment/scope; evidence-adjusted effective-volume targets; muscle priority; major compounds/high-value lifts; session distribution and recovery; secondary/isolation work; hard daily-limit enforcement; taxonomy-weighted volume calculation; automatic balancing; then unresolved actionable review. Major program muscles are allocated before smaller supplemental muscles. Research taxonomy 2.1.0 retains 23 canonical anatomical muscle IDs across 62 exercises and 151 relationships, then projects them into 20 programming families. Direct dynamic work receives 1.0, meaningful fractional work 0.5 or 0.25, and incidental/unknown/isometric relationships receive zero hypertrophy credit. In the guided builder's family ledger, the strongest qualifying relationship is counted once per exercise/family, local fatigue remains additive, and only final exposed values are rounded. Credited fractional work contributes to the same guided effective-set target as direct work; the UI preserves the breakdown and separately warns when frequency, distribution, or evidence confidence remains inadequate. **PLANNED / NEEDS REVIEW:** the recommendation/prescription historical path has not yet adopted this family-ledger/version contract.

The retained automatic generator may schedule each canonical exercise on only one day. Guided plans may intentionally reuse the same exercise across different days. Within one training day, the same canonical exercise or alias is invalid: candidate selection disables it, domain validation rejects it, move/import paths surface it, and viability blocks legacy duplicates. The intended correction is to merge or restructure the existing assignment, not add a duplicate card.

Muscle scope is user-controlled. `includedMuscleGroupIds` filters candidate pools and program slots before portfolio construction; the engine never silently re-adds an excluded group. The snapshot retains all available groups, included groups, and structured omissions. Omitted major groups receive a fuller balance/movement-coverage explanation; smaller groups receive a concise optional-goal explanation. Any omission requires explicit `scopeConfirmed` acknowledgement before the draft can become planned or active. A confirmed omission is intentional scope, not a volume-validation failure.

Session construction uses named split anchors by training-day count (full body, upper/lower, push/pull, and accessories as applicable), then applies primary/supporting role fit, local overlap, adjacent-session recovery, high-fatigue movement spacing, systemic fatigue, spinal load, grip demand, joint stress, duration, and equipment constraints. Repeated high-fatigue exercises on consecutive training days are blocking. Review also blocks materially inadequate effective sets or frequency. Above-range volume, redundancy, grip concentration, and similar correctable conditions are warnings unless another rule elevates them. Engine transition logic refuses activation while a blocking issue remains; this is not only a UI restriction.

Implemented policy defaults remain 75-minute target/100-minute maximum sessions, no more than three high-fatigue compounds per session, maximum session spinal load 180, and grip demand 190. A practical session normally has five to eight exercises. Every constructed session has a hard maximum of 18 working sets and two exercises targeting one muscle; warm-ups are excluded. Placement rejects allocations that would exceed either hard cap. If the requested scope cannot fit, lower-priority work remains unallocated and a blocking schedule-capacity finding offers more days, less scope/direct volume, maintenance volume, or a different objective.

Mesocycle lifecycle states are `draft`, `planned`, `active`, `completed`, `reviewed`, `abandoned`, and `archived`. Draft/planned/abandoned plans that were never activated may be deleted with confirmation. Completed plans are protected and may be archived/reviewed, not destructively deleted. Productive, tolerated exercises remain across objective changes; elapsed time alone never forces rotation. Readiness can adjust a started workout but never silently rewrites this base mesocycle.

## PRs, volume, grades, and analytics

### Mesocycle slot and session-density refinement

Normal program slots select one exercise so recommended, selected, and replacement roles cannot silently duplicate the same requirement. Specialization slots may select two complementary exercises when distinct patterns or regional emphases justify both.

Session-density review begins above eight exercises; more than ten exercises remains blocking. Eighteen working sets is a construction-time hard cap, not a warning threshold. More than two exercises for one muscle in a session is also blocking. Frequency targets never override set caps, duration, fatigue, or recovery safeguards. Normal review hides passed checks, unknown-metadata notes, and low-confidence redundancy observations. Every displayed finding must identify the affected session/muscle/exercise, explain impact, recommend a correction, and expose constrained regeneration when the engine can act.

PRs are calculated only during submission (`submitWorkoutPrs`, `submitWorkout`). Warm-ups and sets excluded from progression do not qualify. Resistance-specific performance semantics distinguish external, bodyweight, added-load, assisted-bodyweight, duration, and distance work. The app preserves PRs on the submitted session and celebrates them in the summary. **NEEDS REVIEW:** the UI uses broader performance-value comparisons rather than a single documented named taxonomy such as “load PR / rep PR / e1RM PR”; product copy should define which PR categories users see.

Weekly muscle volume uses Monday–Sunday submitted history. The current prescription/app historical path calculates canonical muscle rows: direct sets count 1; exercise-specific fractional work counts 0.5 or 0.25; incidental and unknown relationships count zero; isometric exposure affects fatigue context rather than hypertrophy-set totals. Warm-ups and excluded sets do not count; explicitly deloaded work is excluded from overload flags (`weeklyMuscleVolume`, `fatigueFlags`). Logged workout facts remain unchanged by this derived view. **PLANNED / NEEDS REVIEW:** integrate the programming-family ledger, explicit taxonomy 2.1 provenance, migration/rollback behavior, and final-only rounding into the recommendation/historical path before describing those semantics as implemented there.

Workout grades use progression, program adherence, working-set completion/consistency, RPE compliance/logging, adjustment intent, and severe fatigue safeguards (`calculateWorkoutAnalysis`, `scoreWorkoutGradeMetrics`; `scripts/test-workout-grade.js`). Warm-ups are excluded. A well-executed planned deload can earn an A-level grade; reduced load is not intrinsically failure.

Hypertrophy scoring requires qualifying submitted weeks and reports insufficient data conservatively. Formula components and thresholds are implemented in the marked hypertrophy section of `index.html` and tested by `scripts/test-hypertrophy-score.js`; they are product heuristics, not a clinical or validated hypertrophy outcome measure.

## Research translation and guardrails

Research selection, population, grading, conflicts, and update policy live in `research_database/METHODOLOGY.md`; sources are indexed in `research_database/BIBLIOGRAPHY.md`. Research database 3.0.0 validates PubMed/PMC provenance where verified, rule-to-conclusion-to-study overlap, population exclusions, controlled vocabularies, and referential integrity. `rule_authority` distinguishes evidence, product policy, and safety; `enforcement_level` distinguishes advisory rules from a narrow allowlist of deterministic hard blockers. Unsupported numeric or timing policies remain disclosed, configurable product judgments rather than settled science. Importers must preserve authority, enforcement, and policy disclosure fields.

Guardrails:

- Null/unknown is not zero.
- Sparse or non-comparable evidence fails toward hold, research default, or insufficient data.
- Pain/invalid technique blocks automatic progression.
- One readiness marker cannot cause a systemic deload.
- Nutrition is not double-counted as multiple independent signals.
- Readiness changes today, not the base plan.
- Manual overrides are append-only, explained, locked for the workout, and evaluable afterward.
- Historical snapshots retain engine/schema/personal/research versions and are not silently recomputed.

## Planned and review items

- **PLANNED / NEEDS REVIEW:** Direct wearable ingestion; no thresholds should be designed until source cadence, consent, and missing-data behavior are specified.
- **PLANNED / NEEDS REVIEW:** Full food/macronutrient logging and its relationship to readiness versus long-term prescription.
- **IMPLEMENTED:** Duplicated readiness scoring was removed; maintain UI copy as an adapter over the engine result.
- **NEEDS REVIEW:** Define user-facing PR categories while retaining resistance-type correctness.
- **NEEDS REVIEW:** Validate operational thresholds against future outcomes before describing them as personalized optima.
- **NEEDS REVIEW:** Private pipeline metadata says research blending is schema-ready in one generated metadata field, while the runtime engine demonstrably blends personal/research evidence. Clarify whether that field describes pipeline-only output or an outdated integration status (`scripts/personal-fitness/pipeline.js`, `prescription-engine.js`).
