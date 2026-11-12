# Decision engine

## Coach integration rules - PARTIALLY IMPLEMENTED locally, shadow only

The adapter evaluates and stores session prescriptions in shadow mode; the resolver exposes no coaching while the activation gate is closed. Opening it requires calibration, a 2-3 week shadow period, independent review of calibrated parameters, and Erik's explicit opt-in. Parameters remain **ASSUMPTION** until reviewed. Logging remains usable when evaluation fails.

Progression history requires proven comparable completed work, exact variant/resistance and compatible role/target version. Unproven legacy or Strong records are not silently adopted as coach evidence. **NEEDS REVIEW:** the owner must decide how Strong/pre-coach history can be adopted. Increment units must be established by the owner on the role or routine, not inferred from display units; unknown or ambiguous roles remain factual.

Load, reps and RPE track source and touched state independently. Accepting a visible coach target records `accepted_target`; accepting a factual Previous/routine placeholder records `prefill_previous`; typing records its own source. Clearing preserves blank versus zero and clears that field's source. RPE is never automatically prefilled. Reconcile writes only eligible untouched placeholder targets, never actuals or completed/edited rows.

A deload exposure is identified by a session mark, exercise mark, or deload-typed set. The same exposure predicate excludes it from Previous and coaching evidence, PR candidates, record baselines and trends; retrospective marks suppress record presentation without rewriting stored grades or prescriptions.

**NEEDS REVIEW before activation:** mid-session start-condition changes suspend the affected scope for the rest of the session instead of rebasing. Session deload changes, readiness changes and overriding an exception suspend the session; exercise deload changes, substitution, working-row removal and role changes suspend the exercise. Evaluation failure also suspends its affected scope. A suspended scope retains its frozen audit prescription, exposes no coach targets, reasons or revisions, and never blocks factual logging. This is stricter than coach contract sections 6.1 and 7 for mid-session changes; see D-029.

Switching an already prescribed active session to Off records the session suspension `coach_off`. Returning to Shadow does not replay that session's off-mode facts; coaching resumes only on a fresh session Start. In effective Show mode, factual-only, invalid, failed or suspended rows do not fall back to local target placeholders, equipment loads or RPE hints. Previous and typed logging remain usable. Shadow/off continue to use factual local placeholders.

A reason line requires a verified change or an active visible revision, subject to the resolver gate and scope. Certain progression codes establish change against prior actuals; otherwise compatible previous-plan anchors or row counts supply comparison evidence. A count-only change can show a reason when compatible metadata exists; insufficient metadata suppresses it. See [Roadmap](ROADMAP.md).

## Coach engine module - PARTIALLY IMPLEMENTED, wired in shadow

`coach-engine.js` is a pure, deterministic UMD module (`ComprehensiveFitnessCoach`) implementing the [coach v1 contract](redesign/coach/COACH_V1_CONTRACT.md) under [D-028](redesign/DECISION_LOG.md): `prescribeSession` (eligibility, deterioration before progression, double progression, one-set add/remove, readiness, deload, injury and layoff reentry, exception suppression, increase-blocked sessions), `reviseAfterSet` (untouched later same-role rows only, one step from the anchor, no reversal; between-set state is rebuilt from the anchors by replaying current facts, so corrected completions reconcile and completed, skipped, or edited rows stay frozen), `undoRevision`, and `validatePrescription`. Off-grid loads move to the nearest grid load within one increment, and hold reasons name the actual blocker. Every numeric parameter in `COACH_PARAMETERS_V1` is an uncalibrated ASSUMPTION. Inputs are unit-explicit and independent of app globals; held loads repeat the physical load unrounded.

The module is loaded and its adapter persists shadow prescriptions; the closed gate suppresses coach UI output. `scripts/coach-replay.js` replays the private pipeline's normalized workout CSV locally, chronologically and without future data, and prints aggregates only; it is run by the integration owner, never in CI. Tests: `scripts/test-coach-engine.js`, `scripts/test-coach-replay.js` (synthetic fixtures only). The quiet-spotter boundary below describes visible behavior while the gate is closed.

## Read-only score and record selectors — IMPLEMENTED LOCALLY 2026-08-15

The Quiet Control refresh restores only canonical read-only evaluation selectors. They do not participate in workout generation or the exception resolver. A rolling summary uses the newest ten completed sessions, excludes active/cancelled/abandoned/incomplete sessions, computes the existing 0–100 hypertrophy score per distinct exact lift/resistance variant, drops missing or invalid scores, and averages valid lift scores with equal lift weight. Estimated 1RM remains the existing Epley calculation for completed external-load working sets with 1–12 repetitions. A next target is the smallest practical configured-increment or one-repetition set whose estimate exceeds the retained record; it is a mathematical threshold, not a performance promise.

## Readiness display ordering — IMPLEMENTED LOCALLY 2026-08-07

Historical August readiness displayed low-to-high as **Worse than usual → About usual → Better than usual** while retaining `meaningfully_poor`, `usual`, and `unusually_good`. The current sheet offers Worse and About usual; legacy unusually-good facts remain readable. Display order does not change thresholds or quiet-spotter behavior.

## Metadata

- **Purpose:** Current decision boundary and historical-compatibility rules
- **Last verified:** 2026-08-15
- **Status:** **PARTIALLY IMPLEMENTED LOCALLY; COACH SHADOW ONLY**
- **Related:** [Project](PROJECT.md), [architecture](ARCHITECTURE.md), [UI/UX](UI_UX.md), and [training-data map](training-prescription-data.md)

## Current decision boundary

`exception-resolver.js` is the sole current source of exception actions. It may produce one concise, advisory action when directly recorded current pain/injury or illness qualifies. Continuing to log remains possible; a user override is recorded as a workout fact.

There is no visible coach prescription or numeric readiness, fatigue, plateau, volume, research, evidence, or confidence action while the gate is closed. Shadow evaluation runs separately. The approved read-only hypertrophy score and e1RM/record selectors may render on Today or Progress, but cannot create a current action or alter a target.

Ordinary workout targets are stable routine facts owned by the named exercise variant and its set role: working-set count and roles, rep range, target-RPE band, rest default, and increment. They are not rewritten from prior performance, an exception action, research data, or any analytical calculation.

With the gate closed, factual load/rep placeholders are ordered:

1. The comparable prior working set for the exact variant and stable set position/role index.
2. An explicit routine default for that role.
3. Blank.

Warm-up, top, back-off, straight, and drop sets are not interchangeable. Warm-ups can display their same-position prior-session facts but remain excluded from progression, hypertrophy, grade, and e1RM evidence. A prior logged RPE is an actual value, not a replacement for the routine target-RPE band. Exact performance identity keeps named, custom, equipment, and resistance variants from being silently merged.

Optional readiness can be recorded before or during a workout. It is neither a start gate nor a normal-target writer. The current implementation stores readiness deviation, soreness, explicit pain/illness, affected area, and note facts, but only direct explicit pain/injury or illness is converted into a live resolver candidate. `meaningfully_poor` readiness remains a recorded fact and produces no action by itself.

## Actual-work grade

New submissions write one `comprehensive-fitness-workout-grade/2.0.0` result. The current prospective algorithm is `actual-work-rubric/1.1.0`.

Version 1.1 keeps substitutions, reorder, legitimate set-count changes, and explicit adaptations invariant: it grades the actual attempted workout, not agreement with an initial target. Logging validity uses both valid completed-work coverage and valid-RPE coverage, so missing RPE cannot be hidden by the denominator used for valid work. Stored earlier grades and algorithm versions are never rewritten or backfilled.

## Progress and units

Progress has Sessions and Exercises modes. Sessions is factual submitted-session history with stored grades. Exercises derives the canonical read-only hypertrophy score, latest exact-variant performance, trend, and external-load e1RM record/next mathematical threshold. It does not derive recommendation strength, weekly volume, fatigue, research, personal evidence, or confidence output.

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
