# Training Prescription Data and Integration Map

This document is the durable map for future recommendation-engine iterations. It describes what is in the personal analysis and exercise-science database, how the app is allowed to use each source, and which files are canonical. Keep it current whenever a source schema, database version, engine version, or app persistence contract changes.

## Exercise–muscle taxonomy 2.1

The canonical relationship source is `research_database/source/exercise-muscle-taxonomy.js`; generated `exercise_muscle_map` and `exercise_taxonomy_review_queue` artifacts are the runtime/data-contract outputs. Every mapped row includes classification, loading/ROM role, hypertrophy credit, local-fatigue weight, confidence, evidence notes/IDs, review state/date, and taxonomy version. The 23 canonical anatomical IDs project into 20 programming families for guided-plan accounting; relationships and history keep their canonical IDs. Final-only family rounding is implemented in the guided ledger, not yet in the separate recommendation/historical calculation. See `research_database/EXERCISE_MUSCLE_TAXONOMY.md`. Legacy binary mappings are compatibility-only.

## Current versions

| Layer | Version | Reviewed/generated | Canonical source |
| --- | --- | --- | --- |
| Personal analysis pipeline | `1.1.0` | 2026-07-11 | `scripts/personal-fitness/` plus `personal_fitness_data/config/` |
| Personal analysis methodology | `1.1.0` | 2026-07-11 | `personal_fitness_data/reports/analysis_metadata.json` |
| Exercise-science database / muscle taxonomy | `3.0.0` / `2.1.0` | 2026-07-12 | `research_database/source/database.js` and `research_database/source/exercise-muscle-taxonomy.js` |
| Unified prescription engine | `3.0.0` | 2026-07-12 | `prescription-engine.js` |
| App prescription schema | `2.0.0` | 2026-07-11 | `prescription-engine.js` and the app prescription JSON Schemas |
| Push/sync backend contract | Unversioned endpoints | code-reviewed 2026-07-13; external status **NEEDS REVIEW** | `docs/push-backend.md` and `api/` |

The existing private personal-analysis snapshot retains its own source provenance. The runtime resolves its persistent research exercise crosswalk against the loaded taxonomy 2.1.0 and preserves both source versions in recommendation snapshots; only a deliberate local private rebuild may advance the private source version. Raw/private data remains unpublished.

Canonical taxonomy controls target-muscle candidate eligibility. A personal `exercise_muscle_scores` row can reweight a valid direct or positive-credit fractional relationship, but it cannot promote a canonical isometric-only, incidental, unknown, or zero-credit relationship into a hypertrophy candidate pool. This resolves version drift such as the older private Ab Wheel → Lats secondary row: taxonomy 2.1 classifies the lat role as isometric stabilization with zero hypertrophy credit, so Ab Wheel is eligible for abdominal selection but not lat selection. Personal-only/custom exercises without a canonical crosswalk remain eligible only from an explicit positive direct/fractional personal relationship and retain review-queue provenance.

Candidate scores now keep three questions separate: `targetMuscleEffectiveness` estimates usefulness for the selected muscle; `confidence` reports evidence certainty; `overallRecommendationStrength` remains a broader ranking input. Guided UI must label the selected-muscle value (for example, Lat Effectiveness) and may not present the overall score as muscle-specific.

The operational database is separate from both evidence sources. Upstash Redis stores installation-scoped push, timer, deletion-index, idempotency, and workout-sync records. Record hashes use documented TTLs; the global installation registry persists until completed deletion. It does not contain or replace the private personal-analysis package or the public research database. Exact keys, lifecycle, retention, and the external-status verification procedure are maintained in `docs/push-backend.md`.

Current personal analysis identity: `analysis_9a245e42ebd6605a3ef6`; 81,313 source/normalized records from 2019-03-02 through 2026-07-11; overall evidence confidence `moderate` (`64.77/100`). Preserve this ID in audit work so outputs from a later rebuild are not mistaken for the evidence used by an older recommendation snapshot.

## Personal analysis contents

Personal files under `raw/`, `normalized/`, `derived/`, and `reports/` are private health data. They are excluded from Git and public deployment. The app may load their aggregate outputs locally or import a local evidence package, but they must not be copied into a public web artifact.

For delivery, local development may read protected outputs directly, but automatic discovery is restricted to exact loopback origins or a Capacitor native runtime. Every optional path is resolved against the current document, must remain same-origin, and is fetched with same-origin credentials and `no-store`; a hosted installation never probes private paths. `npm run sync:web` copies only the required aggregate tables into ignored `www/private-personal-data/` for the local Capacitor payload, while `.vercelignore` blocks that directory. A hosted installation can import the private package created by `npm run build:app-evidence`; it is stored in that installation's IndexedDB. None of these paths publish personal evidence with the public PWA.

The app treats that package and full app backups as untrusted input. It enforces an 8 MiB actual UTF-8 limit, bounded JSON depth/object width, forbidden executable/prototype keys, exact schema/privacy markers where applicable, allowlisted collections, nonempty core prescription/score/muscle-score arrays, collection caps, and bounded IDs/names/text/numeric fields. Backup migration-audit records also require typed/bounded versions, timestamps, counters, nested change fields, IDs, reasons, and confidence; Settings escapes every displayed migration value. Before persistence the private package reconciles exercise identities with the already loaded public research taxonomy and constructs the replacement prescription engine. A single IndexedDB replacement occurs only after those checks; runtime engine/data and every dependent analysis/recommendation/muscle cache change only after the write succeeds. Invalid packages preserve the prior state.

The current analysis covers source data from 2019-03-02 through 2026-07-11 and contains 81,313 normalized/input records across workout, Fitbit, nutrition, and body-composition sources. The most important prescription inputs are:

| Output | Records | Engine use |
| --- | ---: | --- |
| `derived/exercise_prescriptions.json` | 146 | Personal sets, reps, RPE/RIR, frequency, roles, progression, deload rules, substitutes, confidence, sample size, recovery and nutrition context |
| `derived/exercise_scores.csv` | 149 | Exercise-level progression, hypertrophy support, recovery efficiency, repeatability, nutrition support, confidence, and overall score |
| `derived/exercise_muscle_scores.csv` | 423 | Exercise-by-muscle attribution and muscle-specific support |
| `derived/exercise_session_metrics.csv` | 4,425 | Comparable exposures, performance/e1RM trend, set structure, rep loss, RPE, and recovery cost |
| `derived/muscle_group_rankings.csv` | 423 | Personal rank within each represented muscle group |
| `derived/exercise_sweet_spots.json` | 120 | Productive observed exercise ranges and context |
| `derived/muscle_group_sweet_spots.json` | 22 | Personal weekly volume and frequency ranges by muscle |
| `derived/weekly_muscle_volume_response.csv` | 3,583 | Weekly direct/indirect volume and subsequent response |
| `derived/volume_response_summary.json` | 1 | Whole-analysis volume-response summary |
| `derived/recovery_rules.json` | 9 | Multi-signal readiness and fatigue rules; a single HRV/RHR value is never sufficient |
| `derived/program_phases.csv` | 56 | Mesocycle/phase-specific historical context |
| `reports/analysis_metadata.json` | 1 | Versions, coverage, quality, missing-data flags, and weighting policy |

Known limitations that must lower personal evidence weight include absent direct longitudinal muscle-size measurements, incomplete historical RPE, no usable pain-note series, incomplete observed nutrition during the most recent workout period, and confounding when several exercises/program variables changed together.

## Exercise-science database contents

The public research database contains 19 normalized tables. The application-relevant tables are:

| Table | Records | Engine use |
| --- | ---: | --- |
| `exercise_database` | 62 | Exercise traits, rep/set/RIR/rest defaults, progression model, fatigue, stability/skill, substitution and deload criteria |
| `muscle_group_recommendations` | 23 | Weekly/session volume, frequency, rep, RIR and rest ranges for muscle groups/subdivisions |
| `exercise_muscle_map` | 151 | Direct, fractional, incidental, isometric, confidence, evidence, fatigue, and versioned muscle attribution |
| `exercise_taxonomy_review_queue` | 12 | Low-confidence exercise/family relationships awaiting future focused review |
| `exercise_substitution_map` | 93 | Preferred same-function replacements with similarity and confidence |
| `progression_rules` | 19 | Double, dynamic, load/rep, technique, volume, deload and fatigue-management actions plus conclusion, authority, enforcement, and disclosure provenance |
| `nutrition_strategies` | 13 | Goal/phase-specific nutrition modifiers and evidence confidence |
| `exercise_progression_metric_map` | 372 | Exercise-appropriate progression measures |
| `research_library` | 48 | Bibliographic/source records with DOI and verified PubMed/PMC provenance where available |
| `evidence_conclusions` | 31 | Graded research conclusions used by application rules |
| `evidence_gaps` | 15 | Explicit uncertainty and inference boundaries |
| `rule_exercise_map` | 827 | Rule-to-exercise applicability |
| `rule_muscle_group_map` | 46 | Rule-to-muscle applicability |
| `study_exercise_map` | 496 | Study-to-exercise evidence links |
| `study_muscle_group_map` | 69 | Study-to-muscle evidence links |

The remaining tables are `executive_summary` (14), `definitions_data_dictionary` (258), `change_log` (5), and `study_conclusion_map` (60). `research_database/exports/json/manifest.json` is the machine-readable inventory.

## Crosswalk and evidence hierarchy

Personal records use `exercise_id`/`muscle_group_id` and may provide `research_exercise_id`/`research_muscle_group_id`. Research records use `ex_*` and `mg_*` identifiers. Exact crosswalk IDs win; normalized aliases are a fallback and must not merge equipment, grip, or angle variations that the personal pipeline keeps distinct.

Current caveats matter for future work: only 20 of 146 personal prescriptions carry an explicit research exercise ID, so the engine next checks exact normalized exercise names/declared research aliases and otherwise leaves a variation personal-only. The app has 13 coarse display groups, the personal layer has 22 groups, and research has 23 subdivision records. The UI maps subdivisions to coarse labels only for display; evidence scoring keeps the original personal/research muscle IDs so “Back,” “Shoulders,” “Core,” and “Neck” do not erase regional attribution.

Twenty-one personal prescriptions currently have median `top_set_structure`/`backoff_set_structure` counts that disagree with the productive `recommended_future_range.top_and_backoff_pattern`. The engine treats this as an explicit evidence conflict, weighs comparable productive history and research suitability, and explains the selected structure instead of blindly trusting either field.

The engine applies this order:

1. High-confidence personal evidence.
2. Moderate-confidence personal evidence blended with research.
3. Low-confidence personal evidence with greater research weight.
4. Research defaults when meaningful personal evidence is absent.

Personal weight is constrained by comparable exposure count, observation span, variation consistency, muscle-attribution confidence, RPE/RIR coverage, recovery coverage, nutrition coverage, data completeness, and confounding. Fewer than three comparable exposures remain research-led even when the apparent personal result is large.

## App integration contract

All app surfaces consume the same immutable exercise-prescription snapshot. The canonical prescription includes exercise and muscle IDs, action type, mesocycle role, set structure, working-set/rep/RPE/RIR/rest/frequency ranges, top and back-off details, progression/hold/regression/deload/substitution rules, readiness adjustment, evidence weights, confidence, evidence summary, and user explanation.

Workout snapshots preserve the engine, schema, personal-data, and research-data versions plus the base prescription, today's adjusted prescription, scores, mesocycle ID, evidence, creation time, and manual overrides. Historical workouts render this stored snapshot and are never silently recomputed after an engine update.

Mesocycles are decision contexts, not time-only rotation commands. Supported types are primary progression, alternative exercise, lower-fatigue/resensitization, and specialization. Productive, tolerated exercises stay available across transitions; regression, rising effort/fatigue, pain, redundancy, completed block objectives, or a supported variation goal can trigger rotation.

## Prescription contract schema inventory

The app-facing contracts are intentionally separate from the personal-analysis schemas under `personal_fitness_data/schemas/` and the research-table schemas under `research_database/schema/`. Those source schemas describe evidence inputs; the following root `schemas/` files describe immutable decisions produced from those inputs:

| Contract | Version | Canonical file | What it records |
| --- | --- | --- | --- |
| Exercise prescription | `2.0.0` | `schemas/exercise-prescription.v2.schema.json` | Exercise and muscle IDs; normal/progress/hold/light/deload/rotation action; role; set structure; working sets; reps; RPE/RIR; top and back-off details; rest; frequency; three-level volume; progression/hold/regression/deload/substitution rules; readiness; full score breakdown; staleness; deload scope; evidence weights; confidence; explanation |
| Mesocycle plan and candidate pools | `mesocycle/2.4.0` | `schemas/mesocycle-plan.v1.schema.json` | User-selected scope; normalized equipment/joint actions; evidence-derived targets; major-muscle-first portfolio; hard 18-working-set and two-exercises-per-muscle daily caps; direct/0.35 secondary/zero incidental volume; capacity conflicts; constrained regeneration; actionable review; outcome and lifecycle |
| Recommendation snapshot and overrides | `1.0.0` | `schemas/recommendation-snapshot.v1.schema.json` | Recommendation/engine/personal/research versions; mesocycle; exercise and muscle scores; base and readiness-adjusted final prescriptions; explanation/evidence; checksum; append-only manual override entries; prior final prescription; override outcomes and later comparison |

Candidate score objects expose the distinct dimensions used by ranking: personal hypertrophy support, progression quality, recovery efficiency, repeatability, muscle specificity, lengthened-position loading, stability, ease of progression, joint tolerance, fatigue cost, research support, personal-data confidence, and overall recommendation strength. Pool rank is deliberately separate from raw score rank because movement pattern, equipment, regional emphasis, stability, loading range, recovery cost, and redundancy can change the diversified order.

Manual override `changes` are typed `{ from, to }` pairs for exercise, set count, rep range, load, set structure, deload action, rotation action, and mesocycle. Each entry preserves `previousFinalPrescription`; an intentional override remains locked for that workout and can later receive an outcome evaluation without erasing the original recommendation.

Run `node scripts/test-prescription-schema-contracts.js` after changing any of these contracts or the engine enums. The dependency-free test checks every local reference, required-field declaration, enum uniqueness, the five-candidate cap, override coverage, and exact synchronization with the engine's recommendation, role, structure, mesocycle, and staleness constants.

## Runtime implementation map

Keep this list synchronized with the code so future iterations do not create a second recommendation path:

| Runtime concern | Canonical implementation |
| --- | --- |
| Evidence adapters, weighting, scoring, diversified pools, staleness, volume, progression, deload scope, readiness, mesocycles, snapshots, and overrides | `prescription-engine.js` |
| App ingestion, IndexedDB persistence, recommendation cards, chart/template/coach/start/live/history adapters, mesocycle UI, and override UI | `index.html` (copied to `www/index.html` by `npm run sync:web`) |
| Rest-complete lifecycle, absolute five-second dismissal deadline, one-shot sound/haptic/notification receipts, preview, and background reconciliation | `rest-completion-controller.js` |
| Exercise, mesocycle, and immutable snapshot contracts | `schemas/exercise-prescription.v2.schema.json`, `schemas/mesocycle-plan.v1.schema.json`, and `schemas/recommendation-snapshot.v1.schema.json` |
| Private aggregate package builder | `scripts/build-app-personal-evidence.js` |
| Decision, contract, app integration, and rest lifecycle tests | `scripts/test-prescription-engine.js`, `scripts/test-prescription-schema-contracts.js`, `scripts/test-prescription-app-integration.js`, and `scripts/test-rest-completion-controller.js` |

The app data object is versioned and now includes `mesocycles`, `activeMesocycleId`, `recommendationHistory`, `manualOverrides`, and an optional locally imported `personalEvidencePackage`. Full backup replacement uses the same 8 MiB/shape gate plus versioned top-level and entity allowlists, bounded identifiers/text/collections, duplicate rejection, and referential-integrity checks. Embedded personal evidence is validated and its engine is prepared before the single app-data replacement; rejected imports cannot partially replace history or evidence. A started workout stores a `workoutPrescription`; each exercise stores the matching immutable recommendation snapshot, base prescription, readiness-adjusted final prescription, evidence versions, and override records. Volume records include an explicit `adjustmentType`, three-level volume ranges, current prescribed volume, observed recoverable volume, deload volume, and research fallback range. The daily check-in passes sleep, HRV, resting heart rate, soreness, pain/illness, nutrition adequacy, and protein adequacy to the engine; nutrition/protein remain one independent readiness domain and cannot trigger a deload by themselves.

`progressionAction` records the measurable action behind the recommendation label (for example `increase_load`, `add_one_rep`, or `hold`). Straight-set load progression requires the first set at the rep ceiling and later sets inside the allowed drop-off before the smallest equipment increment is applied to all working sets. Planned readiness/fatigue reductions are retained on the exposure as prescribed-reduction provenance and excluded from weakness/regression comparisons. This prevents a deliberately lower biceps/triceps light-session prescription from creating a false performance-decline flag. User-facing pounds are normalized to 0.5-lb increments; source evidence and raw imports remain immutable in their declared units.

The rest-complete controller uses a noticeable short two-tone Web Audio signal by default and mixes with other browser audio rather than taking permanent audio focus. Foreground vibration, exact overlay timing, and notification handoff are feature-detected. Standard web push cannot guarantee a custom sound, vibration, audio ducking, or identical lock-screen behavior on every operating system; those guarantees would require native Capacitor notification, haptic, and audio-session plugins.

## Regeneration and validation

From the repository root:

```powershell
npm.cmd run research:build
npm.cmd run research:validate
npm.cmd run personal:build -- --analysis-date 2026-07-11
npm.cmd run personal:validate
npm.cmd run test:personal-data
npm.cmd test
```

After app assets change, run `npm.cmd run sync:web` so the root PWA and Capacitor `www/` payload remain identical, then run `npm.cmd run verify:pwa`.

## Update checklist

When iterating, update this document if any of the following changes:

- A source table/output is added, removed, or renamed.
- Record counts or source coverage materially change.
- Personal or research version numbers change.
- Crosswalk behavior or evidence weighting changes.
- Prescription, mesocycle, snapshot, or override schemas change.
- A new app surface consumes recommendations.
- Private-data packaging or public-deployment boundaries change.
