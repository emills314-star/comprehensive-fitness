# Muscle-taxonomy audit and migration report

## Decision

Retain all 23 canonical anatomical IDs. Do not merge upper back, lats, or upper traps; they are anatomically, functionally, and programmatically distinct. Add an explicit 20-value programming-family projection for aggregate dose/status where anatomical subdivisions should coalesce.

The model is layered:

```text
display region -> programming family -> canonical anatomical muscle ID
                                      -> movement pattern / joint actions
exercise -> one or more typed muscle relationships
         -> direct/fractional hypertrophy credit + separate local-fatigue weight
```

Historical workout facts remain unchanged. The active taxonomy version recalculates derived volume/reporting views; aliases preserve legacy and user-facing values.

Prescription engine 3.3.5 now separates those broad display/reporting projections from exact future-generation defaults. Canonical exercise IDs, names, and 66 exported aliases resolve to one exercise identity. A default target is eligible only when exactly one positive-credit `direct_load` relationship has a dynamic or mixed loading role; the adapter returns that exact `mg_*` ID plus transient taxonomy provenance. Broad regions never become exercise aliases or automatic exact targets.

## Snapshot and worktree scope

This report records evidence produced in the isolated taxonomy worktrees and accepted in integration commit `b98022d`. The current engine implementation worktree contains the accepted public taxonomy and the 3.3.5 canonical resolver boundary: 23 canonical IDs, 20 programming families, 62 exercises, and 151 relationships. Final frontend/PWA adoption remains a separate integration task.

## Baseline defects

- App identity normalization used spaces while the engine alias map used underscores. Measured baseline direct hits were 0/61 canonical names and 6/124 names plus aliases; canonical Dashboard/history data therefore fell back to name regexes.
- Guided planning partially projected families, leaving traps and both calf subdivisions unsatisfied, while summing same-family chest rows could turn four sets into five effective chest sets.
- Exact `mg_*` queries broadened to same-family subdivisions, so neck flexor/extensor and sternal/clavicular requests returned each other.
- Obliques had no positive-credit dynamic candidate; referenced `ex_cable_woodchop` was absent.
- The personal crosswalk used invalid `mg_traps`, and alias expansion could duplicate personal IDs.
- Validators did not reject every dangling effective-exercise reference or verify every generated export hash.

## Inventory and decision matrix

Relationship counts below are database 2.1.0 after the non-destructive corrections. “Fatigue-only” includes isometric/incidental rows that remain visible for recovery but receive zero hypertrophy-set credit.

| Canonical ID | User group / subdivision | Programming family | Direct | Fractional | Fatigue-only | Representative direct exercises | Decision and rationale |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| `mg_chest_sternal` | Chest / sternal pectoralis major | `chest` | 5 | 3 | 0 | Barbell Bench Press; Cambered Barbell Bench Press; Dumbbell Bench Press | Retain canonical regional identity for selection/report detail; coalesce chest family dose with clavicular rows per exercise so overlap cannot double count. High confidence in distinction; low confidence in exact region-specific dose thresholds. |
| `mg_chest_clavicular` | Chest / clavicular pectoralis major | `chest` | 3 | 0 | 0 | Incline Dumbbell Press; Incline Machine Press; Low-to-High Cable Fly | Retain for meaningful incline/regional selection and reporting; aggregate only for broad chest status. Preserve legacy `chest` alias. |
| `mg_upper_back` | Upper Back / rhomboids and mid trapezius | `upper_back` | 2 | 6 | 1 | Chest-Supported Row; Seated Cable Row | Retain. Scapular retraction/mid-trap function and row emphasis differ from shoulder extension/adduction by lats and elevation by upper traps. Do not merge. |
| `mg_lats` | Lats / latissimus dorsi | `lats` | 5 | 2 | 1 | Pull-Up; Chin-Up; Lat Pulldown | Retain. Vertical pull/shoulder extension programming, filters, substitutions, and reporting have clear value distinct from upper back. |
| `mg_traps_upper` | Traps / upper trapezius | `traps` | 2 | 1 | 2 | Barbell Shrug; Dumbbell Shrug | Retain canonical upper-trap ID; project to stable `traps` family/display alias. Correct legacy invalid `mg_traps` references through alias mapping, not destructive renaming. |
| `mg_front_delts` | Front Delts / anterior deltoid | `front_delts` | 2 | 8 | 0 | Barbell Overhead Press; Machine Shoulder Press | Retain. Press overlap is meaningful fractional work, while direct anterior-delt selection remains useful. |
| `mg_side_delts` | Side Delts / middle deltoid | `side_delts` | 3 | 2 | 0 | Cable/Dumbbell/Machine Lateral Raise | Retain. Distinct abduction function and exercise selection. |
| `mg_rear_delts` | Rear Delts / posterior deltoid | `rear_delts` | 2 | 3 | 0 | Reverse Pec Deck; Cable Rear-Delt Fly | Retain. Distinct horizontal-abduction emphasis and reporting value despite row overlap. |
| `mg_biceps` | Biceps / biceps brachii | `biceps` | 4 | 7 | 0 | Incline Dumbbell Curl; Preacher Curl; Cable Curl | Retain. Direct elbow-flexion work and fractional pulling volume remain separated. |
| `mg_triceps` | Triceps / triceps brachii | `triceps` | 3 | 8 | 0 | Pushdown; Overhead Extension; Close-Grip Bench | Retain. Direct elbow-extension work and fractional pressing volume are programmatically useful. |
| `mg_forearms` | Forearms / wrist and finger flexors/extensors | `forearms` | 2 | 4 | 8 | Wrist Curl; Reverse Wrist Curl | Retain. Grip/isometric fatigue is large but must remain separate from dynamic hypertrophy credit. |
| `mg_spinal_erectors` | Spinal Erectors / erector spinae | `spinal_erectors` | 1 | 0 | 8 | 45-Degree Back Extension | Retain. Many compounds add fatigue without qualifying direct hypertrophy dose; the separate fatigue dimension is essential. |
| `mg_abdominals` | Abdominals / rectus abdominis | `abs` | 3 | 1 | 1 | Cable Crunch; Hanging Leg Raise; Ab Wheel | Retain canonical ID; preserve app-compatible `abs` family/display alias. Do not merge obliques because rotation/anti-rotation and user scope differ. |
| `mg_obliques` | Obliques / internal and external obliques | `obliques` | 1 | 0 | 3 | Cable Woodchop | Retain. Added the already referenced dynamic Cable Woodchop rather than granting hypertrophy credit to isometric-only carries/planks. |
| `mg_glutes_max` | Glutes / gluteus maximus | `glutes` | 2 | 8 | 0 | Conventional Deadlift; Barbell Hip Thrust | Retain canonical ID; preserve broad `glutes` family alias. Future medius/minimus-specific expansion must not rewrite this ID. |
| `mg_quadriceps` | Quadriceps / vasti and rectus femoris | `quads` | 6 | 1 | 0 | Back Squat; Front Squat; Leg Press | Retain; use app-compatible `quads` family alias. No meaningful duplicate canonical subdivision exists today. |
| `mg_hamstrings` | Hamstrings / knee flexors and hip extensors | `hamstrings` | 5 | 2 | 1 | Romanian Deadlift; Good Morning; Seated Curl | Retain. Hip-hinge and knee-flexion exercise diversity belongs to movement/role metadata rather than destructive muscle splitting. |
| `mg_adductors` | Adductors / adductor group | `adductors` | 1 | 5 | 0 | Hip Adduction Machine | Retain. Direct work and squat/lunge fractional exposure have distinct scope/reporting value. |
| `mg_abductors` | Abductors / gluteus medius/minimus | `abductors` | 2 | 0 | 2 | Hip Abduction Machine; Cable Hip Abduction | Retain. Do not hide under broad glutes; abduction/stability function and user targeting are meaningful. |
| `mg_calves_gastroc` | Calves / gastrocnemius | `calves` | 2 | 1 | 1 | Standing Calf Raise; Leg Press Calf Raise | Retain canonical knee-extended distinction; coalesce broad calf status with soleus without losing regional detail. |
| `mg_calves_soleus` | Calves / soleus | `calves` | 1 | 2 | 0 | Seated Calf Raise | Retain canonical knee-flexed distinction; share family dose/status so scope is satisfiable. |
| `mg_neck_flexors` | Neck / cervical flexors | `neck` | 1 | 0 | 0 | Neck Flexion | Retain because direction-specific exercise selection and safety differ; aggregate broad neck status only when the user selects the family. |
| `mg_neck_extensors` | Neck / cervical extensors | `neck` | 1 | 0 | 0 | Neck Extension | Retain. Exact canonical queries must stay exact and never silently return flexor work. |

## Canonical/family alias map

| Legacy/display input | Canonical/family resolution |
| --- | --- |
| `chest` | Programming family containing `mg_chest_sternal` and `mg_chest_clavicular`; exact IDs remain exact |
| `upper_back` | `mg_upper_back` only |
| `lats` | `mg_lats` only |
| `traps`, legacy `mg_traps` | Family/display alias for `mg_traps_upper` |
| `abs`, `abdominals` | Family/display alias for `mg_abdominals` |
| `glutes` | Family/display alias for `mg_glutes_max` |
| `quads`, `quadriceps` | Family/display alias for `mg_quadriceps` |
| `calves` | Family containing `mg_calves_gastroc` and `mg_calves_soleus` |
| `neck`, `neck_musculature` | Family containing flexor/extensor IDs; exact `mg_*` queries remain directional |

Exercise aliases normalize through one canonical ID boundary. Historical names and user-created exercises remain facts; a custom exercise without a verified canonical crosswalk stays explicit/unknown rather than being guessed from its name.

## Versioned change and counts

| Contract | Before | After |
| --- | ---: | ---: |
| Database/taxonomy version | 2.0.0 | 2.1.0 |
| Canonical muscle IDs | 23 | 23 |
| Programming families | implicit/partial | 20 explicit |
| Exercises | 61 | 62 |
| Exercise-muscle relationships | 149 | 151 |
| Review-queue items | 11 | 12 |

New records are `ex_cable_woodchop` plus a direct oblique relationship and a low-confidence 0.25 abdominal relationship. Existing canonical IDs are not deleted or renumbered.

## Dependency and migration map

```text
research source taxonomy/database
  -> build script
     -> CSV/JSON/workbook/schemas/manifest hashes
        -> prescription engine candidate/muscle adapters
        -> guided family ledger/status/scope
        -> app analytics/history/search/filter presentation
        -> private personal crosswalk and future local aggregate rebuild
```

Migration is additive and derived:

1. Preserve every logged session, exercise, set, template, recommendation snapshot, and raw import unchanged.
2. Load taxonomy 2.1.0 and resolve canonical IDs/aliases at the adapter boundary.
3. Recalculate derived family volume/status using per-exercise family coalescing; direct or the highest fractional relationship wins for hypertrophy credit.
4. Sum `local_fatigue_weight` separately, including isometric/incidental rows.
5. Deduplicate personal crosswalk expansion by `(personal exercise ID, taxonomy relationship)` and map legacy traps aliases.
6. Return the active relationship taxonomy version with future-generation resolver output. Persist it only in a future explicitly versioned schema; engine 3.3.5 does not add it to snapshot 1.3.0 or prescription 2.3.0 and does not rewrite historical records.
7. Report/reject every unmapped/dangling canonical reference during validation.

Rollback does not delete data. Restore the prior public taxonomy export/version and recompute derived views. Because logged facts and historical snapshots are immutable, no record-count reversal is required. The old derived family totals may differ, which is the intended audited effect of rollback.

The engine 3.3.5 resolver patch is likewise migration-free. Engine 3.3.4 broad-target snapshots retain their original checksum and lineage; new exact-target prescriptions use the same persisted schema and contain no `taxonomyVersion` field. A direct verification loaded a 3.3.5 exact-target snapshot through the unchanged 3.3.4 reader and preserved it byte-for-byte, so code rollback does not require data rollback or a backfill.

## Validation evidence

- `node scripts/test-taxonomy-family-projection.js` — PASS: 23 canonical IDs, 20 families, 62 exercises, 151 relationships.
- `node scripts/test-taxonomy-personal-crosswalk.js` — PASS on public synthetic rows; family dedupe and traps compatibility verified.
- `npm.cmd run research:build` — PASS; public exports/schemas/workbook rebuilt.
- `npm.cmd run research:validate` — PASS: 0 errors and 34 intentional missing male-sample-count warnings.
- Schema, domain-integrity, and performance tests — PASS.
- Manifest validation now checks SHA-256 for generated CSV/JSON/schema outputs and canonical/alias/referential contracts.
- `node scripts/test-recommendation-canonical-target-adapter.js` — PASS: 10/10 groups; 62 exercises, 66 aliases, 59 exact dynamic defaults, three intentional isometric exceptions, order invariance, invalid crosswalks, and broad-label rejection.
- `node scripts/test-recommendation-legacy-compatibility.js` — PASS: engine 3.3.4 broad snapshots and mixed history remain unchanged; engine 3.3.5 exact targets retain the existing persisted schema and omit `taxonomyVersion`.

**Snapshot note:** accepted integration `b98022d` contains the audited public taxonomy/source/test changes, and prescription engine 3.3.5 now supplies the canonical resolver/default-target boundary. Frontend consumption remains a separate integration task; no private aggregate rebuild or personal-data migration is required, and no personal values were inspected or migrated here.
