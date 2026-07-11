# Decision engine

## Metadata

- **Purpose:** Catalog of implemented and intended logic that turns history, research, and readiness into guidance
- **Last verified:** 2026-07-11
- **Repository:** `main` @ `7c52a2b`
- **Verification status:** VERIFIED against `prescription-engine.js`, relevant `index.html` logic, schemas, data pipelines, and tests
- **Related:** [Project](PROJECT.md), [architecture](ARCHITECTURE.md), [UI/UX](UI_UX.md), [training data map](training-prescription-data.md), [research methodology](../research_database/METHODOLOGY.md)

## Living-document rule

Read this document before changing readiness, recovery, progression, volume, PR, fatigue, deload, scoring, confidence, evidence weighting, or recommendation behavior. After implementation, update every affected rule, formula, threshold, guardrail, missing-data behavior, and source reference in the same task; then update `ROADMAP.md`. Never document a proposed formula as implemented or leave an obsolete threshold here after code changes.

## Purpose and evidence hierarchy

The engine selects exercises, creates versioned prescriptions and mesocycles, adjusts a workout for current readiness, explains decisions, and preserves the exact recommendation used. It is deterministic for the same normalized inputs; research translation and some operational thresholds are heuristic.

Implemented precedence is tested as:

1. Credible high-confidence personal evidence.
2. Moderate personal evidence blended with research.
3. Sparse/low-confidence personal evidence with greater research weight.
4. Research defaults when meaningful personal evidence is absent.

Fewer than three comparable exposures remain research-led (`DEFAULT_POLICY.minimumComparableExposures`, `scripts/test-prescription-engine.js`). Confidence considers exposure count/span, variation consistency, RPE, recovery, nutrition completeness, data completeness, and confounding (`derivePersonalEvidenceMetrics`, `calculateEvidenceWeight`). Exact IDs/aliases are preferred; unresolved variants remain separate.

## Inputs

| Input | Status | Implementation |
| --- | --- | --- |
| Submitted app workouts | **IMPLEMENTED** | Comparable sets, completion, load/reps/RPE, set roles, resistance type, pain/notes where available; `index.html` history adapters. |
| Private workout history | **IMPLEMENTED** | Normalized Strong data and exercise-session aggregates via `scripts/personal-fitness/`. |
| Fitbit-derived signals | **PARTIALLY IMPLEMENTED** | Offline exported sleep/HRV/RHR/activity/body-composition data feed aggregate analysis. No live Fitbit API. |
| Nutrition data | **PARTIALLY IMPLEMENTED** | Offline nutrition normalization, research strategies, and same-day adequacy/protein inputs; no meal logger. |
| User recovery report | **IMPLEMENTED** | Sleep hours/quality, HRV, resting HR, soreness, illness, affected muscle, nutrition/protein status, note. |
| Research database | **IMPLEMENTED** | Exercise defaults, muscle recommendations, progression rules, substitutions, nutrition strategies, evidence conclusions/mappings. |
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

Implemented progression considers exercise/resistance type, rep-range position, completion, RPE/RIR, prior comparable exposure, increment size, technique/pain flags, and trends. Outcomes include normal, progress, hold, reduced volume, light session, scoped/full deload, substitute, and rotate. Exact next actions can add reps, add/reduce load or assistance, hold, reduce volume, or change exercise. Isolation/bodyweight cases prefer rep progression when load jumps are disproportionate (`index.html:progressionProfileForExercise` and recommendation helpers; `determineProgressionDecision`).

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

## Full-program mesocycle planning and candidate scoring

This is the authoritative program-planning section. The planner uses a two-stage process: first choose one program-wide exercise portfolio, then distribute that portfolio across sessions. A `Program Slot` is a muscle-group coverage and exercise-role requirement inside the complete plan; it replaces the former ambiguous “Prescription Block” term. Each slot states its required selection count, weekly sets/exposures, selected exercise, candidate alternatives, planned sessions, and rationale. Five candidates means up to five alternatives for a slot, never five mandatory weekly exercises.

Candidate discovery evaluates the entire compatible research exercise library plus traceable personal/current sources. `Current Program Exercises` means exercises in templates attached to the active mesocycle. `Recent Exercises` means submitted exercise exposures within the last 56 days. `Previously Successful Exercises` requires adequate comparable personal history. `Eligible Exercise Library` is the compatible canonical research library after equipment and restriction filters. Every displayed candidate carries a source trace; equipment exclusions are retained with an inspectable reason. Aliases must normalize to one canonical research ID. Camber Bar Bench Press, Cambered Bench Press, and Cambered Barbell Bench Press resolve to `ex_cambered_barbell_bench_press`.

`Predicted Program Effectiveness` estimates usefulness for the proposed slot and plan; it does not guarantee hypertrophy. The implemented score is 72% isolated target-muscle recommendation strength and 28% full-program fit. The isolated score already blends personal hypertrophy/progression/recovery/repeatability/tolerance evidence with muscle specificity, lengthened loading, stability, progression ease, fatigue cost, research support, and personal confidence. Full-program fit then adjusts for redundant patterns, local/systemic fatigue, spinal load, grip demand, joint stress, equipment, current portfolio, and lower-fatigue role value. Candidate ordering is recomputed after selection. Confidence separately describes evidence quality; Evidence identifies the sources. Positive and limiting factors explain the score.

The portfolio is placed into configured training days only after selection. Research subdivisions are consolidated into user-facing muscle plans before portfolio construction so, for example, chest is balanced as one weekly requirement while regional contributions remain evidence inputs. Each slot derives a weekly effective-set range and exposure target from aggregated research defaults, available personal ranges, mesocycle type, recovery context, and training-day capacity. Primary/specialization blocks can select complementary exercises; weekly sets are divided across those exercises and across the required exposures. Direct sets count fully and mapped secondary work counts 0.5 in program review.

Muscle scope is user-controlled. `includedMuscleGroupIds` filters candidate pools and program slots before portfolio construction; the engine never silently re-adds an excluded group. The snapshot retains all available groups, included groups, and structured omissions. Omitted major groups receive a fuller balance/movement-coverage explanation; smaller groups receive a concise optional-goal explanation. Any omission requires explicit `scopeConfirmed` acknowledgement before the draft can become planned or active. A confirmed omission is intentional scope, not a volume-validation failure.

Session construction uses named split anchors by training-day count (full body, upper/lower, push/pull, and accessories as applicable), then applies primary/supporting role fit, local overlap, adjacent-session recovery, high-fatigue movement spacing, systemic fatigue, spinal load, grip demand, joint stress, duration, and equipment constraints. Repeated high-fatigue exercises on consecutive training days are blocking. Review also blocks materially inadequate effective sets or frequency. Above-range volume, redundancy, grip concentration, and similar correctable conditions are warnings unless another rule elevates them. Engine transition logic refuses activation while a blocking issue remains; this is not only a UI restriction.

Implemented policy defaults remain 75-minute target/100-minute maximum sessions, no more than three high-fatigue compounds per session, maximum session spinal load 180, and grip demand 190. These are operational heuristics. The minimum research weekly set value is used as the normal starting target; specialization multiplies it by 1.2 and lower-fatigue/resensitization by 0.72. Frequency normally caps at two weekly exposures, or three for specialization, bounded by training days and allocated sets.

Mesocycle lifecycle states are `draft`, `planned`, `active`, `completed`, `reviewed`, `abandoned`, and `archived`. Draft/planned/abandoned plans that were never activated may be deleted with confirmation. Completed plans are protected and may be archived/reviewed, not destructively deleted. Productive, tolerated exercises remain across objective changes; elapsed time alone never forces rotation. Readiness can adjust a started workout but never silently rewrites this base mesocycle.

## PRs, volume, grades, and analytics

PRs are calculated only during submission (`submitWorkoutPrs`, `submitWorkout`). Warm-ups and sets excluded from progression do not qualify. Resistance-specific performance semantics distinguish external, bodyweight, added-load, assisted-bodyweight, duration, and distance work. The app preserves PRs on the submitted session and celebrates them in the summary. **NEEDS REVIEW:** the UI uses broader performance-value comparisons rather than a single documented named taxonomy such as “load PR / rep PR / e1RM PR”; product copy should define which PR categories users see.

Weekly muscle volume uses Monday–Sunday submitted history. Direct sets count 1; mapped secondary work is fractional. Warm-ups and excluded sets do not count; explicitly deloaded work is excluded from overload flags (`weeklyMuscleVolume`, `fatigueFlags`). A muscle volume flag activates above its configured upper target; two weighted missed sets can create a caution. A lift high-concern flag can activate at two missed planned sets.

Workout grades use progression, program adherence, working-set completion/consistency, RPE compliance/logging, adjustment intent, and severe fatigue safeguards (`calculateWorkoutAnalysis`, `scoreWorkoutGradeMetrics`; `scripts/test-workout-grade.js`). Warm-ups are excluded. A well-executed planned deload can earn an A-level grade; reduced load is not intrinsically failure.

Hypertrophy scoring requires qualifying submitted weeks and reports insufficient data conservatively. Formula components and thresholds are implemented in the marked hypertrophy section of `index.html` and tested by `scripts/test-hypertrophy-score.js`; they are product heuristics, not a clinical or validated hypertrophy outcome measure.

## Research translation and guardrails

Research selection, population, grading, conflicts, and update policy live in `research_database/METHODOLOGY.md`; sources are indexed in `research_database/BIBLIOGRAPHY.md`. Build validation enforces mappings, population exclusions, controlled vocabularies, and referential integrity. Operational rules unsupported by direct validation are labeled as inference in the research database.

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
