# Exercise–muscle taxonomy

## Authority and version

`source/exercise-muscle-taxonomy.js` is the canonical relationship source. Generated `exercise_muscle_map` JSON/CSV/XLSX/SQL artifacts are read-only outputs. Taxonomy version **2.0.0**, reviewed **2026-07-12**, covers every one of the 61 canonical research exercises. Eleven exercises/families with one or more low-confidence relationships are also present in `exercise_taxonomy_review_queue`; queued does not mean unclassified.

The legacy `primary_muscles` and `secondary_muscles` exercise columns remain descriptive compatibility fields. They do not control volume, candidate eligibility, program balance, or historical recalculation when taxonomy 2.0 is available.

## Relationship model

Each exercise–muscle row stores the relationship category separately from its numerical programming weight:

- `direct_load`: intended dynamic target through a useful range; normally 1.0 set credit.
- `meaningful_fractional_load`: substantial but incomplete dynamic contribution; currently 0.5 or 0.25.
- `minor_incidental_load`: participation too limited to count; zero hypertrophy credit.
- `isometric_stabilizing_load`: fatigue/tension without qualifying dynamic set credit; zero hypertrophy credit and a separate `local_fatigue_weight`.
- `unknown_insufficient_evidence`: no hypertrophy credit and no confirmed redundancy inference.

`loading_role`, `range_of_motion_role`, confidence, rationale, evidence IDs, review status, review date, and taxonomy version make the classification auditable. The 1/0.5/0.25/0 weights are interpretable engineering conventions, not scientifically proven constants.

## Evidence standard

Exercise-specific longitudinal hypertrophy evidence is preferred, followed by systematic reviews, anatomy, joint actions/moments, external resistance direction, range of motion, muscle-length demands, and technique. EMG is supporting mechanistic evidence only and never independently proves hypertrophy credit. When direct evidence is unavailable, the row explicitly uses anatomy/biomechanics or exercise-family inference and lowers confidence.

Variation records are reviewed independently where mechanics materially differ. The current classification assumes the named exercise's conventional controlled technique and pain-free useful range. It does not infer unrecorded stance, grip, bar path, foot placement, straps, or individual anatomy.

## Conventional Deadlift example

Conventional Deadlift is not a spinal-erector-only exercise. Taxonomy 2.0 models:

- Gluteus maximus: direct dynamic load, 1.0.
- Quadriceps: meaningful dynamic contribution, 0.5.
- Hamstrings: limited meaningful dynamic contribution, 0.25, low confidence because biarticular length change complicates attribution.
- Adductors: limited hip-extension contribution, 0.25, low confidence.
- Spinal erectors: high isometric fatigue exposure, zero hypertrophy-set credit.
- Upper traps/upper back: isometric shoulder-girdle and thoracic stabilization, zero hypertrophy-set credit.
- Forearms/grip: high isometric fatigue exposure, zero hypertrophy-set credit.

The evidence combines deadlift biomechanics and anatomy with the Martín-Fuentes et al. systematic review (`stu_0041`) and Lee et al. kinetic/EMG comparison (`stu_0042`). Acute EMG is not treated as longitudinal hypertrophy evidence.

## Application contract

All canonical consumers use `exercise_muscle_map`:

- candidate discovery and target-muscle scoring;
- program portfolio construction and direct-volume priority;
- fractional-volume balancing and hidden-volume checks;
- redundancy and fatigue interpretation;
- weekly/historical volume displays;
- private personal-evidence analysis after canonical exercise crosswalk;
- deterministic historical derived-metric recalculation.

Manual/custom exercises without a research crosswalk retain their explicit personal mapping and are labelled `personal_mapping_review_queue`; they do not silently alter the public taxonomy.

## Historical recalculation

Logged dates, loads, repetitions, RPE, completion, and exercise identity remain immutable. Muscle volume is a derived view and is recalculated atomically from one loaded taxonomy version. Cache keys include the taxonomy version, and `recalculateHistoricalMuscleVolume` returns the version plus traceable per-exercise contributions without mutating source records. Loading the prior research export restores the prior derived interpretation; partial mixed-version totals are not persisted.

## Review queue

Low-confidence rows are queued by exercise with priority and status. Review should prefer systematic/longitudinal evidence, then biomechanics/anatomy, record disagreements, and update the semantic taxonomy/database version. Unknown relationships never receive default set credit or create confirmed redundancy warnings.
