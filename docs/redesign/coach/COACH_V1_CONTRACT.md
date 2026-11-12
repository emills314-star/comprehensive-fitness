# Comprehensive Fitness Coach v1 Contract

**Status:** PLANNED — owner-approved direction; implementation and evaluation authorized; not yet implemented
**Date:** 2026-10-31
**Decision:** D-028 in [`../DECISION_LOG.md`](../DECISION_LOG.md)
**Review:** Astra (GPT-6 Astra) reviewed a draft on 2026-10-31 (approve with changes); its changes are incorporated.
**Supersedes:** only the clauses D-028 names. Everything else in [`../final/`](../final/) stays authoritative.

Every number marked **(A)** is an ASSUMPTION: a starting parameter that the replay harness and shadow period must calibrate, and an independent review must approve, before the coach is shown to Erik as live guidance. Tests may pin these values; passing tests does not approve them.

## 1. Purpose

For each workout Erik starts, the coach sets the load, target reps, and number of working sets for each exercise variant in the routine, and revises the not-yet-performed sets of an exercise after each completed set. Its goal is continual progressive overload for hypertrophy inside targets Erik owns.

It does not choose exercises, plan weeks or mesocycles, manage weekly muscle volume, or produce scores.

## 2. What Erik owns and the coach never changes

- The routine and its exercise variants.
- Each variant's role-specific rep range, target-RPE band, normal working-set count, rest default, and load increment with its unit.
- Every actual value he logs. A coaching target becomes an actual value only when he taps ✓ without typing that field (recorded per field as `accepted_target`).

The coach writes only a per-session prescription layer, stored separately from the routine and from actual observations (§7).

## 3. Inputs and eligibility

1. **Stable targets**, frozen per role at session start: normal set count `S`, rep range `[rMin, rMax]`, target-RPE band `[eMin, eMax]`, increment `Δ` with explicit unit, rest default.
2. **Comparable history:** retain at least the `4` **(A)** most recent completed exposures of the exact variant identity, plus every predecessor a comparison needs. Compare fixed role positions (set 1 with set 1), normalized physical loads (unit-converted), and compatible target versions. Skipped or extra positions are excluded from comparisons. Warm-ups are excluded.
3. **RPE provenance:** `typed` (entered by Erik in the app or imported from Strong, where he types it) or `unknown` (legacy app values that may have come from a prefill). Only `typed` RPE is evidence. Unknown RPE is never evidence of easy effort.
4. **Current session:** sets completed so far, with per-field provenance.
5. **Resolver output:** the canonical exception action, if any (§6).
6. **Readiness:** Erik's optional "Worse than usual" tap.
7. **Fitbit recovery:** display and shadow only in v1 (§8).
8. **Deload marks (Erik, 2026-10-31):** a "This was a deload" toggle on each exercise (the existing `exercise.isDeload`, `app-views.js:1155`) and a new one on the session (`session.isDeload`, which marks every exercise in it). Sets typed `deload` count the same way.
9. **Injury skips (Erik, 2026-10-31):** an "Injured — skip" action on the planned workout records a skipped session with reason `injury` (§7). Erik does not train while injured, so injury is recorded per skipped session, never per exercise.

**Deload exposures** are excluded from every comparison the coach makes: they are never "the last exposure" for seeding or progression, never count toward the two-exposure progression test or the plateau window, never count as deterioration, and never reset or extend a deterioration episode. The next normal session is compared with the last non-deload exposure. Deload sessions do not count as gaps.

**Injury-skipped days** never count as deterioration or a missed-training signal. The first session back is coded `injury_reentry`: targets repeat the last non-deload result (no progression), its result is excluded from deterioration comparisons, and progression resumes after `1` **(A)** completed exposure. If the injury gap exceeds the layoff threshold, the layoff rule below applies as well.

**Eligibility gates.** No automated progression when:

- fewer than `2` **(A)** comparable exposures exist (seed only, §4.1);
- the last exposure is more than `28` days **(A)** old: the first session back repeats the last result (or a seed) and progression resumes after one new completed exposure;
- the set role is ambiguous: factual Previous values only;
- the resistance is `bodyweight` or `assisted_bodyweight`: v1 progresses reps only, never load or assistance arithmetic, and the add-set rule still applies. `external` and `bodyweight_plus_load` (on the added load) get load arithmetic. `duration`, `distance`, and any unknown resistance type are `factual_only` (Previous values, no target). The resistance vocabulary is the app's (`app-foundation.js` resistance types); there is no band type.

**Holding means repeating the physical load.** Any rule that holds or repeats (seed, hold, readiness, injury, layoff, deload) repeats the previous physical load exactly, unrounded. Rounding to an available increment happens only when a rule authorizes a change, and the 10% increase cap and 5% reduction cap are checked against the unrounded previous load. When the previous load is off the increment grid, an increase goes to the highest grid load in (load, load + Δ] and a decrease to the lowest grid load in [load − Δ, load); only if no grid load exists there does the rule hold, and the reason names the actual blocker (anchor bound, increase cap, reduction cap, or no available load).

## 4. Session-start prescription

Computed once when the workout starts. Order of evaluation per exercise: eligibility → deterioration → progression → set count → readiness → resolver.

### 4.1 Seed

Working set `k` is seeded from set `k` of the same role in the most recent comparable exposure. With no comparable set: the routine's explicit default load and reps for that role; otherwise no load target and reps = `rMin`. Logging stays fully available.

### 4.2 Deterioration (evaluated first)

At the same physical load, the same fixed set position lost ≥ `2` **(A)** reps in each of the last `2` **(A)** consecutive comparisons, or the exercise's average typed RPE rose ≥ `1` **(A)** in each of them. Comparisons are by set position, never by totals across different set counts.

- First detection, including a cold start where no prior episode state exists: hold load and reps (`deteriorating_hold`).
- Still present one exposure later: one load reduction of `Δ`, provided `Δ` ≤ `5%` **(A)** of the load; otherwise hold and record `increment_too_coarse`. **At most one automatic reduction per deterioration episode.** The episode resets after `2` **(A)** stable comparable exposures.

### 4.3 Progression (double progression), when no deterioration is active

1. **Add load** — in each of the last `2` **(A)** comparable exposures, every working set reached `rMax` at the same load, with typed RPE ≤ `eMax` where RPE is typed (missing RPE does not block; reaching `rMax` is enough). Load = last load + `Δ`, rounded to an available increment in its stored unit, provided `Δ` ≤ `10%` **(A)** of the load; otherwise hold and record `increment_too_coarse`. Target reps after an increase = Epley-predicted reps at the new load from the set's last result, clamped to `[rMin, rMax]`.
2. **Add reps** — otherwise, each set below `rMax` whose last typed RPE was ≤ the band midpoint `(eMin + eMax) / 2` **(A)**, or whose RPE is unknown and which met its previous target, gets last reps + `1`, capped at `rMax`. Other sets hold. Load holds.

Targets always stay inside `[rMin, rMax]`.

### 4.4 Number of working sets

Default: `S`. The coach may change it by one set for this session, never more:

- **Add one set (`S + 1`)** is a monitored experiment, not an established plateau remedy. Eligible only for straight or back-off roles. Trigger: no improvement in best working-set e1RM (external load) or best reps (other resistance) across the last `4` **(A)** comparable exposures, no deterioration episode, last exposure's typed RPE ≤ `eMax`, no readiness or exception action. The extra set copies the last working set's target. Once added, the count stays `S + 1` for `3` **(A)** exposures and is then reassessed; it never toggles on one fluctuation. Ceiling `S + 1`. A deload session pauses the experiment without consuming or cancelling it. Only a deterioration episode or "Worse than usual" ends it early, with the reason recorded; a new experiment then needs a fresh plateau window that excludes the ended experiment's exposures.
- **Remove one set (`S − 1`, minimum 1)** when a deterioration episode is active, or Erik tapped "Worse than usual". Safety and readiness reductions take priority over an add.

Removing or adding applies to the last working set of the role and never touches warm-up or drop sets.

### 4.5 Readiness

"Worse than usual" holds every increase (load, reps, added set) and always applies §4.4's removal, including together with injury reentry, layoff reentry, or a deload. "Better than usual" changes nothing in v1.

### 4.6 Sessions where increases are blocked

A session is increase-blocked when a deterioration episode is active, readiness is "Worse than usual", an exception was overridden to continue, or it is an injury reentry, layoff reentry, or deload session. The prescription records the reason, and §5 may lower but never raise any row in an increase-blocked session.

## 5. After each completed set

When set `k` of an exercise is completed, the coach may revise **only** later working sets of that exercise that are untouched (not completed, skipped, or edited). Edited rows are frozen.

- **Anchors:** each row's session-start target. A row may move at most one increment or one rep from its anchor during the session **(A)**, within `[rMin, rMax]` and load caps.
- **Increases** require typed RPE on set `k` and set `k` performed at its prescribed physical load. Rule: reps ≥ target + `2` **(A)** and typed RPE ≤ `eMax − 1` **(A)** → the next untouched same-role row moves up one step (reps + 1, or load + `Δ` if its reps are already `rMax` and `Δ` ≤ `10%` **(A)**). Missing RPE never triggers an increase.
- **Decreases**: reps ≤ target − `2` **(A)**, or typed RPE ≥ `eMax + 1` **(A)** → the next untouched same-role row moves down one step (reps − 1, floor `rMin`; at `rMin`, load − `Δ` if `Δ` ≤ `5%` **(A)**, else hold and record `increment_too_coarse`).
- **No reversal:** after any downward revision, no upward revision for that exercise in this session.
- **Optional last set:** reps < `rMin − 2` **(A)** at typed RPE ≥ `9.5` **(A)** → the last untouched working set is marked optional with a reason. It is not deleted; it can be completed or skipped normally.
- **Top/back-off coupling:** in v1, back-off rows are revised only by their own completed back-off sets; a top-set result does not move back-off loads.
- **Mechanics:** completion events are idempotent (re-completing or editing a completed set re-evaluates once, from the anchor). A corrected result supersedes the earlier evaluation: between-set state is rebuilt from the anchors by replaying the current facts, superseded revisions stay only as audit records, and revision ids stay unique across corrections. A row's target is frozen once it is completed, skipped, or edited, and replay never changes a frozen row. Undo restores the previous target and locks that row against further revision. A setting turns between-set revision off.

## 6. Arbitration

The canonical resolver (`exception-resolver.js`) stays the single action authority and gains a **distinct prescription channel**; exception validation (which rejects exact load/reps/sets parameters) is not weakened. Order:

1. Explicit pain/injury or illness → the existing advisory `stop_or_skip_work` wins (D-019). Coaching targets for the session are hidden while it is unresolved. If Erik continues, logging works as today, his override is recorded, and targets return without any increases.
2. Readiness "Worse than usual" → §4.5.
3. Coaching prescription (§4, §5).

No screen reads the coach module directly. Coach failure yields no targets (Previous values still show) and never blocks logging. Simultaneous reasons (e.g., add load and remove set) carry both codes; the shown line names the stricter one.

## 7. Stored contract

`session.coachingPrescription` — new, versioned, absent on historical sessions, never backfilled, validated at runtime (not only by the permissive JSON schemas) through active drafts, app-data v3, backup v3, and import allowlists, with round-trip tests:

- `contractVersion` `comprehensive-fitness-coach/1.0.0`, `engineVersion`, `parameterVersion`, `evaluationId`, `createdAt`, `inputDigest`.
- `stableTargets` per role as frozen at session start (count, range, RPE band, rest, increment + unit).
- `exercises[]`: `exerciseId`, variant identity, `plannedSetCount`, `optionalSetIds`, `codes[]` (`seed`, `add_reps`, `add_load`, `hold`, `deteriorating_hold`, `reduce_load`, `increment_too_coarse`, `add_set`, `remove_set`, `readiness_hold`, `exception_suppressed`, `layoff_reentry`, `injury_reentry`, `deload_marked`, `factual_only`), `reasonText`, comparison exposure ids, deterioration-episode state, added-set experiment state.
- `sets[]`: `setId`, role, anchor load + unit, anchor reps, target-RPE band, current target, and `revisions[]` (`revisionId`, `at`, `afterSetId`, from/to load and reps, `code`, `undone`, `locked`).

Actual sets gain per-field provenance: `loadSource`, `repsSource` ∈ {`accepted_target`, `entered`, `prefill_previous`}; `rpeSource` ∈ {`typed`, `unknown`}. **The app stops populating actual RPE from targets, routine defaults, or previous sets** (today: `app-workout.js:456`, `app-workout.js:1422`, `app-foundation.js:2218`).

The submitted workout freezes this object. Rule changes never recompute it.

Deload and injury records:

- `session.isDeload` (boolean, default false) alongside the existing `exercise.isDeload`; both editable during and after the workout, and both preserved through drafts, backups, and imports. Marking a session as a deload while it is active sets coaching targets for that session to `deload_marked` (no progression; targets repeat the last non-deload result).
- `skippedSessions[]` in app data: `id`, `date` (local), `routineId`, `dayId`, `reason` (`injury` in v1), optional `note`, `createdAt`. Validated and round-tripped like sessions. A skip never creates a workout, grade, or progress point and is never shown as a failure.

## 8. Fitbit recovery in v1

- **Display:** a "Last night" line on Today: sleep duration, HRV (RMSSD), resting HR, each versus Erik's own 28-day baseline (requires ≥ `14` **(A)** valid days; otherwise values only), with measurement date, time zone, and freshness. No score and no color judgement beyond "below/above your usual".
- **Source:** Google Health API data types `daily-heart-rate-variability`, `daily-resting-heart-rate`, and `sleep`, via Google OAuth (read-only scopes). The refresh token is stored encrypted in the existing Upstash Redis behind an authenticated Vercel function, with explicit revoke-and-delete. Recovery responses pass through to the phone and are not cached or logged server-side.
- **Storage:** a separate validated `wearableObservations` structure on the device (source, metric, value, unit, measurement date, time zone, fetchedAt, baseline coverage), distinct from manual `recovery` fields.
- **Shadow:** each session records what a candidate recovery rule would have done (e.g., hold increases when ≥ 2 of 3 markers fall beyond the 10th/90th percentile of the 28-day baseline **(A)**) without applying it. After 6–8 weeks of use, a separate decision approves, changes, or drops it. Recovery may never raise a target.

## 9. Presentation (Strong-style set table)

Per exercise: name, then one row per set:

`SET | PREVIOUS | LB | REPS | RPE | ✓`

- **SET** shows the set-type flag (W warm-up, numbered working sets, D drop, F failure; T/B where top/back-off are used); tapping it changes the type.
- **PREVIOUS** shows the same-position set from the last comparable session (`155 × 10 @ 8`).
- **LB / REPS** show the current target as placeholder values. Tapping ✓ with an empty field accepts that placeholder; typed values replace it. Per-field provenance is recorded.
- **RPE** starts empty and is never prefilled.
- **✓** completes the set and auto-starts the rest timer with the role's rest default: countdown, ±15 s, skip, overtime, and a notification where permitted.
- **Reason line:** one line under the exercise name, only when today's target differs from last time or after a between-set revision ("Set 3: −1 rep — set 2 was RPE 9.5"). Revised rows show a subtle marker and undo.
- No cards, badges, confidence meters, or citations.
- **Deload toggles:** "This was a deload" on each exercise's menu and on the session header; deload exercises and sessions show a small "Deload" tag in the logger, workout history, and Progress, and their points are drawn distinctly and excluded from records and trends.
- **Injury skip:** on Today, the planned workout offers "Injured — skip" next to Start. It records the skip, moves Today to the next workout, and shows a quiet "Skipped · injured" entry in session history.

## 10. Evaluation gates

1. **Replay harness** (`scripts/coach-replay.js`, run locally by Claude on private data; outputs aggregates only): chronological, using only information available before each session and each set. Checks: no future-data leakage; targets within bounds; reason codes match rules; no oscillation; rep-prediction error at the load Erik actually used versus repeat-last and plain double progression. Replay checks correctness and calibration; it cannot prove a prescription is better.
2. **Shadow mode** (2–3 weeks of real workouts logged in the app): the coach computes and stores targets without showing them.
3. **Opt-in coaching (experimental activation) + five-workout field test:** acceptance rate, overshoots (target not reached at target load), overrides, and Erik's judgment. Requires independent review of calibrated parameters first.

Hypertrophy itself is not measurable by these gates; they establish that the coach is achievable, progressive, and trusted.
