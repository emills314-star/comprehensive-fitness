# Exercise–muscle taxonomy

## Authority and version

`source/exercise-muscle-taxonomy.js` is the canonical relationship source. Generated `exercise_muscle_map` JSON/CSV/XLSX/SQL artifacts are read-only outputs. Taxonomy version **2.1.0**, reviewed **2026-07-12**, covers every one of the 62 canonical research exercises. Twelve exercises/families with one or more low-confidence relationships are also present in `exercise_taxonomy_review_queue`; queued does not mean unclassified.

The legacy `primary_muscles` and `secondary_muscles` exercise columns remain descriptive compatibility fields. They do not control volume, candidate eligibility, program balance, or historical recalculation when taxonomy 2.1 is available.

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

## Canonical muscles and programming families

The persistent anatomical taxonomy retains all 23 canonical muscle IDs. A separate, complete projection maps those IDs to 20 practical programming families. Only the sternal/clavicular chest, gastrocnemius/soleus calf, and flexor/extensor neck pairs coalesce for family-level programming. Upper back, lats, and upper traps remain distinct because their movement roles and programming value differ.

The projection is an accounting layer, not an anatomical consolidation or data migration. Exercise relationships, historical records, filters, evidence, and reporting retain canonical IDs. In the implemented guided-mesocycle family ledger, one exercise selects the strongest qualifying hypertrophy relationship once per family so subdivisions do not double count. Local-fatigue weights remain additive, calculations retain full precision through aggregation, and only the ledger's final exposed values are rounded. This final-only rounding contract does not yet describe the separate prescription/historical calculation path.

## Conventional Deadlift example

Conventional Deadlift is not a spinal-erector-only exercise. Taxonomy 2.1 models:

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
- guided-plan family volume/status and canonical prescription volume inputs;
- private personal-evidence analysis after canonical exercise crosswalk.

Manual/custom exercises without a research crosswalk retain their explicit personal mapping and are labelled `personal_mapping_review_queue`; they do not silently alter the public taxonomy.

## Persistent-ID and provenance contract

Generated primary IDs are semantic historical identities, not disposable row numbers. Existing ID-to-row mappings in `exercise_muscle_map`, `exercise_progression_metric_map`, `study_exercise_map`, and `rule_exercise_map` must never be renumbered or reused. Rule and exercise source identities are registered in explicit ordered epochs rather than derived from the live arrays. Undeclared additions, deletion, reordering, or duplication fail closed—even when a new source would create zero applicable mapping rows.

Change history is also append-only. `chg_0002` and `chg_0003` retain their exact 2.0.0 versions and wording. The checked-in public 2.0.0 digest contract at `scripts/fixtures/taxonomy-v2.0.0-stable-id-contract.json` protects all 1,756 prior semantic identities independently of Git history or a `.git` directory. The repaired mapping epochs are explicit:

- `v2.0.0_baseline`: `rex_00001`–`rex_00753`.
- `chg_0004`: `rex_00754`–`rex_00765`, the Cable Woodchop exercise appended against the applicable baseline rules.
- `chg_0005`: `rex_00766`–`rex_00827`, `rule_0019` appended across all 62 registered exercises and attributed to `rule_exercise_map` in the change log.

**IMPLEMENTED:** accepted source repairs `5d95f40` and `90cb27a` preserve those ranges, require a higher suffix range and exact change attribution for every future epoch, expose the full ordered source registry contract, and add positive/negative stable-ID coverage. `node scripts/test-taxonomy-stable-ids.js` verifies the historical fixture, known epochs, valid future-epoch behavior, and rejection of undeclared, deleted, reordered, or duplicate rule/exercise IDs.

## Historical recalculation

Logged dates, loads, repetitions, RPE, completion, and exercise identity remain immutable in the current application. The accepted taxonomy source repair does not itself change the separate prescription engine's canonical historical calculation, establish an explicit historical taxonomy-version field, or prove atomic rollback. **PLANNED / NEEDS REVIEW:** recommendation integration must define version provenance, migration/recalculation boundaries, failure behavior, rollback, and family-level rounding before those semantics can be claimed for historical analytics.

## Review queue

Low-confidence rows are queued by exercise with priority and status. Review should prefer systematic/longitudinal evidence, then biomechanics/anatomy, record disagreements, and update the semantic taxonomy/database version. Unknown relationships never receive default set credit or create confirmed redundancy warnings.
