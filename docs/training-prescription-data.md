# Training data and historical-compatibility map

## Status

- **Last verified:** 2026-08-01
- **Status:** **IMPLEMENTED AND VERIFIED LOCALLY THROUGH M8; EXTERNAL ACCEPTANCE OPEN**

This is not a live recommendation or prescription-engine map. Normal app generation uses stable routine facts and `exception-resolver.js`. Research and personal-analysis assets are offline inputs for research, audit, or separately approved future work; they do not generate current workout targets, exception actions, grades, or Progress analytics.

## Current app boundary

| Concern | Current behavior |
| --- | --- |
| Exception actions | `exception-resolver.js` is the sole current action authority. Direct explicit pain/injury or illness is the only active candidate producer. |
| Optional readiness | Readiness deviations, soreness, pain/illness, and notes can be stored. Meaningfully poor readiness has no current detector and produces no action by itself. |
| Normal targets | Named routine variant and set-role facts are stable. History or research cannot rewrite them. |
| Prior performance | Factual same-variant, same-resistance, comparable-role observations only. |
| Progress | Factual submitted history with exact variant/resistance/role identity. |
| Grade | Prospective actual-work contract v2; current algorithm `actual-work-rubric/1.1.0`; stored legacy versions remain unchanged. |
| Catalog identity | Minimum alias/canonical identity compatibility for matching and historical validation. |
| Personal evidence | No in-app import, UI, normal-boot loading, current export field, or live generation use. |
| Research/prescription generation | No live generation, current presentation, or workout-target fallback. |

## Offline data assets

- `research_database/` remains public source/provenance and taxonomy material.
- `scripts/personal-fitness/` and `personal_fitness_data/` remain the private offline pipeline.
- Raw, normalized, derived, report, backup, and local-database outputs containing personal data remain excluded from Git and deployment.
- `prescription-engine.js` retains only bounded exercise identity and immutable historical-snapshot compatibility. It is not a current prescription, readiness, recommendation, override, or scoring source.

Do not add or restore an app-evidence build/import path as part of setup. Offline pipeline output is not app input.

## Immutable submitted history

Preservation applies to:

- completed session/exercise/set observations;
- exact exercise and named-variant identity;
- actual order, load, repetitions, RPE, role, and provenance;
- recorded duration, rest, readiness deviations, notes, and substitutions;
- immutable submitted prescription/action snapshots;
- resolved actions and explicit handling/overrides attached to their owning workout;
- stored grade value and algorithm version;
- stored historical execution-quality facts.

These facts are not recalculated through deleted engines.

## Retired global collections

Legacy backups may contain top-level `recommendationHistory`, `manualOverrides`, and `personalEvidencePackage`. In the supported legacy shapes, these were global planner/evidence collections and are not sufficient owning-workout source records.

The compatibility decoder accepts and discards them before current state/export. This prevents a hidden planner/evidence domain and a second source of truth. It does not authorize deletion of embedded submitted snapshots or workout-owned resolved actions/overrides, which remain immutable.

## Historical snapshot validation

Allowlisted embedded historical snapshot pairs may be read through bounded compatibility validation. The validator preserves stored versions, identity, raw-unit provenance, and checksum semantics; it does not:

- run the deleted normal prescription engine;
- migrate a snapshot into current targets;
- refresh its checksum because display units changed;
- create a current recommendation;
- recreate planner, evidence, confidence, equipment, or mesocycle state.

Malformed or incompatible historical material fails closed rather than being converted into a new target, action, grade, trend, or identity claim.

## Strong and backup imports

- Strong imports retain source provenance and conservative role classification.
- Unknown/ambiguous roles do not become progression-qualifying working sets.
- Current backup/app-data imports validate before mutating active state.
- Legacy decoders preserve supported workout/routine/source facts while discarding deleted product domains.
- Representative real-user migration replay and owner acceptance remain unproven final gates.

## Update checklist

Update this map only when one of these contracts changes:

- canonical exception input/output;
- stable routine target or exact performance identity;
- actual-work grade version;
- Strong/backup import, role classification, or atomicity;
- legacy snapshot validation;
- global-collection discard boundary;
- offline personal-data privacy boundary.

A future decision engine requires explicit product approval, a new versioned contract, migration policy, privacy review, calibrated evaluation, and independent acceptance. Retained offline assets and historical bytes are not authorization.
