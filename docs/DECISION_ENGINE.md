# Decision engine

## Readiness display ordering — IMPLEMENTED LOCALLY 2026-08-07

Readiness displays low-to-high as **Worse than usual → About usual → Better than usual** while retaining `meaningfully_poor`, `usual`, and `unusually_good`. Display order does not change thresholds or quiet-spotter behavior.

## Metadata

- **Purpose:** Current decision boundary and historical-compatibility rules
- **Last verified:** 2026-08-01
- **Status:** **IMPLEMENTED LOCALLY (M8)**
- **Related:** [Project](PROJECT.md), [architecture](ARCHITECTURE.md), [UI/UX](UI_UX.md), and [training-data map](training-prescription-data.md)

## Current decision boundary

`exception-resolver.js` is the sole current source of exception actions. It may produce one concise, advisory action when directly recorded current pain/injury or illness qualifies. Continuing to log remains possible; a user override is recorded as a workout fact.

There is no live prescription, recommendation, readiness-score, fatigue, plateau, deload, volume, hypertrophy, research, evidence, confidence, PR, or analytics engine in normal workout generation. Those signals cannot create a current action, alter a target, or add a Progress surface.

Ordinary workout targets are stable routine facts owned by the named exercise variant and its set role: working-set count and roles, rep range, target-RPE band, rest default, and increment. They are not rewritten from prior performance, an exception action, research data, or any analytical calculation.

Normal editable-field prefill is factual and ordered:

1. The comparable prior working set for the exact variant and role/index.
2. An explicit routine default for that role.
3. Blank.

Warm-up, top, back-off, straight, and drop sets are not interchangeable. A prior logged RPE is an actual value, not a replacement for the routine target-RPE band. Exact performance identity keeps named, custom, equipment, and resistance variants from being silently merged.

Optional readiness can be recorded before or during a workout. It is neither a start gate nor a normal-target writer. The current implementation stores readiness deviation, soreness, explicit pain/illness, affected area, and note facts, but only direct explicit pain/injury or illness is converted into a live resolver candidate. `meaningfully_poor` readiness remains a recorded fact and produces no action by itself.

## Actual-work grade

New submissions write one `comprehensive-fitness-workout-grade/2.0.0` result. The current prospective algorithm is `actual-work-rubric/1.1.0`.

Version 1.1 keeps substitutions, reorder, legitimate set-count changes, and explicit adaptations invariant: it grades the actual attempted workout, not agreement with an initial target. Logging validity uses both valid completed-work coverage and valid-RPE coverage, so missing RPE cannot be hidden by the denominator used for valid work. Stored earlier grades and algorithm versions are never rewritten or backfilled.

## Progress and units

Progress is factual submitted-workout history and exact-variant/exact-resistance performance. It does not derive recommendation strength, volume, fatigue, research, personal evidence, or confidence output.

Display-unit conversion is presentation-only. Raw imported/submitted unit values and their provenance are immutable. A display preference must not rewrite historical records, reinterpret raw values, refresh a historical snapshot checksum, or change the source values used by compatibility validation.

## Historical compatibility record

This section deliberately preserves the boundary for pre-M8 records; it is not a source of current generation behavior.

- Older backups may contain prescription, recommendation, research, personal-evidence, planner, mesocycle, analytical, and override fields.
- The isolated legacy decoder may read allowlisted obsolete fields only to retain workout, session, routine/template, exact-identity, and immutable historical-snapshot facts.
- Historical snapshots, including their stored versions, raw-unit provenance, and checksums, remain byte-immutable. They are not migrated, recalculated, backfilled, or used to generate a new action or target.
- Minimal catalog identity compatibility may remain to match exact variants and validate/read historical material. It is not a research, analytics, prescription, or evidence-loading path.
- Obsolete planner and analytical fields create no active state, writer, route, renderer, current export field, or normal boot input.

The former guided planning, prescription ranking, research/personal-evidence blending, family-volume, fatigue, hypertrophy, readiness scoring, and program-review descriptions are **SUPERSEDED HISTORICAL RECORDS (M1-M7)**. They document how existing historical material may be recognized, not approved live policy.

## Guardrails

- Direct pain/injury or illness is the only approved current exception input. Numeric fatigue, readiness, plateau, and deload detectors are not live.
- Missing, malformed, conflicting, or non-comparable compatibility data fails closed: preserve it where allowed, but do not fabricate an action, target, identity, or trend.
- Routine facts and submitted history remain distinct. Logging a result does not silently modify the routine.
- New decision rules require a separately approved, versioned implementation and documentation update; they must not be revived through legacy imports or local evidence artifacts.

## Review trigger

Update this document when the resolver contract, stable routine-target contract, exact-identity contract, historical snapshot validation, or unit-provenance rule changes. Update `docs/ROADMAP.md` in the integration-owned task when that work changes scope or status.
