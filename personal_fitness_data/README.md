# Personal fitness data layer

This directory contains the reproducible personal hypertrophy, progression, nutrition, body-composition, and recovery analysis. It is deliberately separate from the generic research database.

## Privacy

Everything under `raw/`, `normalized/`, `derived/`, and `reports/` is sensitive personal health data. `config/personal_context.json` is also private because it contains personal body-composition, nutrition, recovery, and training context. Those paths are excluded from Git and Vercel deployment. Generic mapping/config files, schemas, pipeline code, and this README may be tracked.

## Directory layout

```text
personal_fitness_data/
├── raw/          # untouched source exports; excluded from deployment/version control
├── normalized/   # repeatable normalized CSV outputs
├── derived/      # linked metrics, scores, rankings, sweet spots, prescriptions, rules
├── reports/      # detailed report, source inventory, quality/validation metadata
├── schemas/      # JSON schemas and data dictionary
├── config/       # editable context, aliases, mappings, thresholds, and score weights
└── README.md
```

The active workout input is `raw/strong_workouts (8).csv`. The full replacement export supplied on July 11, 2026 covers August 19, 2021 through July 7, 2026. The previous March–July 2026 partial export is preserved at `raw/archive/strong_workouts_partial_2026-03-02_to_2026-07-04.csv` and is not ingested.

No workbook, worksheet, InBody scan file, circumference file, or progress-photo series exists in the source tree. User-confirmed InBody reference points are stored in `config/personal_context.json` with explicit context provenance.

## Run the pipeline

From the repository root on Windows:

```powershell
npm.cmd run personal:build -- --analysis-date 2026-07-11
npm.cmd run personal:validate
npm.cmd run test:personal-data
```

On a shell where `npm` is available directly, `npm run ...` is equivalent. The pipeline uses Node/CommonJS and no additional runtime dependency.

Every output is atomically replaced; nothing is appended. Rerunning does not duplicate records or mutate raw files.

## Core outputs

Normalized CSVs:

- `normalized_workouts.csv`
- `normalized_fitbit.csv`
- `normalized_nutrition.csv`
- `normalized_body_composition.csv`
- `exercise_aliases.csv`
- `exercise_muscle_map.csv`

Derived outputs:

- `workout_recovery_links.csv`
- `exercise_session_metrics.csv`
- `exercise_scores.csv`
- `exercise_muscle_scores.csv`
- `muscle_group_rankings.csv`
- `exercise_sweet_spots.json`
- `exercise_prescriptions.json`
- `recovery_rules.json`
- `period_comparisons.csv` and `.json`
- `program_phases.csv`
- `weekly_muscle_volume_response.csv`
- `muscle_group_sweet_spots.json`
- `volume_response_summary.json`

Reports and provenance:

- `PERSONAL_HYPERTROPHY_AND_RECOVERY_REPORT.md`
- `source_file_inventory.csv`
- `source_schema_inventory.json`
- `data_quality_report.json`
- `analysis_metadata.json`
- `output_manifest.json`
- `validation_report.json`

## How calculations work

Warm-ups never count toward hypertrophy volume or PRs. Strong `F` and `D` codes remain failure/drop sets. Numeric sets are inferred as top/back-off only when the load pattern supports that distinction; otherwise they remain straight working sets.

External-load performance uses Epley estimated 1RM. A transition uses RPE-adjusted estimates only when both compared sessions have usable RPE; otherwise both sides use unadjusted Epley so an RPE-recording change cannot create a false trend. Bodyweight, band, and duration movements use their configured progression metric.

Progression requires at least +1%; regression is below -1.5%. A same-load decline greater than three repetitions at comparable RPE is a separate review trigger. Exposures more than 56 days apart establish a re-entry baseline. Implausible set metrics remain in normalized raw-derived records but are excluded from PR/progression/sweet-spot calculations. Abrupt between-session load-regime changes and one-exposure performance changes of at least 40% establish a new comparison baseline instead of being scored as gains or losses. These guards are methodology version 1.1.0 and are configurable.

The raw overall score is configurable and currently combines:

- 30% progression
- 25% hypertrophy support
- 20% recovery efficiency
- 15% repeatability
- 10% nutrition support

The result is then shrunk toward a neutral prior according to data-confidence, and the final score also includes an explicit confidence contribution. Fewer than three comparable exposures remain insufficient evidence regardless of apparent score.

Recovery uses rolling 14-, 28-, and 42-day personal baselines. Major changes require multiple independent domains; short sleep relative to baseline and sleep under six hours count as one sleep domain. Missing recovery data are labeled insufficient rather than normal. One HRV, resting-heart-rate, sleep, soreness, or fatigue observation never proves hypertrophy or overtraining. Prior-day activity is labeled as a full-day total and is not misrepresented as a pre-workout morning value.

## Edit exercise aliases and muscle mappings

Exact known variations live in:

- `config/exercise_aliases.csv`
- `config/exercise_muscle_map.csv`

Recorded names not yet listed explicitly are kept as distinct IDs and classified through ordered, editable rules in `config/exercise_mapping_rules.json`. Rule-inferred rows are labeled in normalized outputs. To correct a mapping, add an exact alias and muscle-map rows; do not rename historical raw data or merge machine variations merely because their generic research family is similar.

## Add new data

1. Place the new export in `raw/` without editing its contents.
2. Replace the active Strong root file only when the new export supersedes it; archive the previous file under `raw/archive/`.
3. Update an exact alias/muscle mapping when a new exercise appears or when equipment/grip/angle details become known.
4. Run build, validate, and tests.
5. Review `reports/data_quality_report.json` and the mapping audit before using new rankings.

Fitbit timestamps are preserved verbatim. Verified Fitbit/Google Health CSV timestamps often use local wall time with a misleading trailing `Z`; the pipeline intentionally derives the literal local date instead of UTC-shifting those sources.

## Personal versus research evidence

Prescription and recovery-rule JSON records include a future integration envelope with personal estimates, confidence, sample size, and a provisional final recommendation. This task does not blend the external research database, so current research confidence and weight are both zero; personal confidence separately communicates uncertainty. A later layer can apply the intended hierarchy: strong personal evidence first, a blend when personal evidence is limited, and research defaults when meaningful personal evidence is absent.
