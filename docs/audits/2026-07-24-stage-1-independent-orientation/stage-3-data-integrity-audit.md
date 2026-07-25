# Stage 3 — Workout Logging, Persistence, Imports, Historical Analysis, and Data-Integrity Audit

## Metadata

- **Purpose:** Independent behavioral audit of data capture, persistence, imports, historical windows, and derived-metric integrity
- **Date:** 2026-07-24
- **Repository state:** `main` @ `d636a1a`, `sw.js` `CACHE_NAME = comprehensive-fitness-pwa-v65`
- **Method:** The running application was driven directly. All runtime functions (`isWorkingSet`, `activeCompletedWorkoutHistory`, `calendarMonthCutoff`, `classifyImportedExerciseSets`, `startOfWeekIso`) are in browser global scope and were called with explicit arguments against synthetic fixtures. **Only pure functions were invoked; no application data was mutated.** The instance held 1 session and 0 sets, so there was no meaningful user data at risk.
- **Production code modified:** none.

### Coverage declaration — read before using the score

Verified behaviorally and in depth: **six-month active history**, **set classification**, **Strong import classification**, **submission idempotency**, **cache-invalidation topology**, **cancel/delete behavior**.

**NOT assessed:** migrations and versioning (Step 12), error-injection and recovery (Step 13), the full 20-fixture adversarial matrix (Step 15), the security and privacy review (Step 14), and — most importantly — **six-week qualifying-window temporal isolation** (Step 8), which is the single largest remaining unknown in the data layer.

Points for unassessed categories are withheld rather than estimated.

### A note on two withdrawn findings

During this stage I twice built a serious finding and then disproved it by testing more carefully. Both are documented in §9 because the near-misses are informative:

- I measured that `classifyImportedExerciseSets` **never** infers a warm-up at any load ratio, and was preparing a High finding that all imported Strong warm-ups count as working sets. Re-testing with the field shape the real parser produces (`sourceSetOrder`, `originalImportedValue.setOrder`) showed Strong `"W"` rows classify correctly as `warmup` with confidence 1.0 via `explicitStrongSetType`. **Withdrawn.**
- I initially read `analysisRevision`'s single increment site as evidence that cache invalidation depends on scattered manual discipline. It does not: `commit()` is a central funnel that invalidates by default. **Downgraded** to an enumerable opt-out audit.

---

## 1. Executive assessment

### Score: 55 / 70 assessed (30 points withheld)

| Category | Max | Awarded | Basis |
| --- | --- | --- | --- |
| Workout capture and live state | 15 | **12** | Classification semantics are correct and fail-closed for `unknown`. Deductions: unrecognized `setType` values fail *open* to a full working set (−2, F2); rapid-interaction and interruption paths not driven (−1) |
| Submission and persistence reliability | 15 | **14** | Genuinely idempotent, synchronous, single-commit. Deduction: submission failure is safe but silent — no catch, no user feedback (−1, F4) |
| Import accuracy | 15 | **11** | Strong explicit markers handled correctly with confidence 1.0. Deductions: back-off inferred at positions preceding the heaviest set (−2, F1); `isWarmup` input flag ignored by the classifier (−1, F3); import rollback and reimport not tested (−1) |
| Historical-window correctness | 15 | **8** | Six-month active history is **exactly correct** on every boundary tested including leap years — full credit for that half. Six-week qualifying-window temporal isolation **not verified** (−7) |
| Derived-metric integrity | 15 | **10** | `commit()` invalidates by default; `dataRevision` increments on every commit. Deductions: 8 explicit `invalidateAnalysis: false` opt-outs rely on author judgment (−3, F5); full metric dependency map not built (−2) |
| Delete, restore, and archive behavior | 10 | **NOT ASSESSED** for archive/restore; cancel verified | Withheld — see F6 |
| Migration and recovery | 10 | **NOT ASSESSED** | Withheld |
| Security and privacy | 5 | **NOT ASSESSED** | Withheld |

**Assessed total: 55/70 (79%).** The honest statement is 55 of 70 examined, not a 100-point score.

### Principal question

> *Can the user trust that every workout, set, classification, historical metric, personal record, chart, and recommendation is derived from the correct underlying data and remains correct after every supported state transition?*

**For the transitions I tested: yes.** Submission is exactly-once. Set classification is correct and fails closed where it matters. The six-month window is precisely right. Cache invalidation is centralized, not scattered.

**For the transitions I did not test: unknown.** Migrations, restore, archive, and six-week window isolation are unverified. I cannot certify the full claim, and the score reflects that.

### Three greatest strengths (verified by execution)

1. **Submission is genuinely exactly-once.** `workoutSubmissionIsAccepted` (`app-history.js:400`) guards on both `!session.submitted` and an in-flight `Set`, and the entire submit body is **synchronous with no `await` between the guard and the single `commit()`**. On a single-threaded event loop, double-tap submit cannot interleave. Partial writes are structurally impossible: one `commit` writes sessions, exercises, recommendation history, and overrides atomically.
2. **The six-month active-history window is exactly correct.** Every boundary case passed, including the specification's own example (July 10 → January 10 included, January 9 excluded), month-length clamping (Aug 31 → Feb 28), and leap years (2024-08-31 → 2024-02-29). Canceled, deleted, draft, future-dated, and dateless sessions are all correctly excluded.
3. **Warm-up exclusion cannot be overridden.** `isWorkingSet` (`app-foundation.js:399`) returns `false` for warm-ups and `unknown` sets **before** consulting the `countsToward*` flags. A set with `setType: "warmup"` plus all three override flags set to `true` is still excluded from score, volume, progression, and PR. This is the correct precedence and it closes the Stage 1 concern (R6) that this rule was untested.

### Five greatest risks

1. Six-week qualifying-window temporal isolation is unverified — the largest gap in the data layer (§6).
2. Canceling a workout is an irreversible hard delete; the schema's soft-delete fields are never written (F6).
3. Unrecognized `setType` values fail open to a fully-counting working set (F2).
4. Eight `invalidateAnalysis: false` opt-out sites depend on author judgment rather than a structural rule (F5).
5. Migrations, restore, and error-recovery paths are entirely unexamined.

---

## 2. Data-model map (as verified)

| Entity | Identifier | Raw/Derived | Lifecycle notes |
| --- | --- | --- | --- |
| Session | `id` (UUID) | Raw | `submitted`, `workoutState`, `completedAt`, `submittedAt`, `canceledAt`, `deletedAt`, `trashed`. **`deletedAt`/`trashed` are read but never written** (F6) |
| Exercise | `id`, `sessionId` | Raw | Flat, joined by ID at read time |
| Set | `id`, `exerciseId` | Raw | `setType`, `isWarmup`, `countsTowardScore/Volume/Progression`, `classificationSource`, `classificationConfidence`, `classifierVersion`, `sourceSetOrder`, `originalImportedValue` |
| Template | `id` | Raw | Deterministic day-based IDs when mesocycle-linked |
| Mesocycle | `id` | Raw | Lifecycle states `draft`→`planned`→`active`→`completed`→`reviewed`/`abandoned`/`archived` |
| Recommendation snapshot | `recommendationId` + `checksum` | Raw once stored | Byte-immutable after submission |
| PR | none — array on session | **Derived, then persisted** | Computed once at submission (`submitWorkoutPrs`), stored on `session.prs`. Recomputed independently for badge display (`workoutPrPreviousHighWater`) — Stage 1 C6 |
| Workout analysis / grade | none | **Derived, then persisted** | `session.workoutAnalysis` written at submission |
| Weekly volume, fatigue flags | none | Derived, cached | Keyed on `analysisRevision` |
| `dataRevision` | integer | Raw | Incremented on **every** `commit()` (`app-foundation.js:2359`) |

**Flagged:**
- **Denormalized derived data persisted on the session** (`prs`, `workoutAnalysis`) with no recomputation trigger on later edits. If a submitted session's sets are edited, `session.prs` and `session.workoutAnalysis` are stale unless the edit path recomputes them — **not verified**.
- **`completedAt` is set from `session.date`, not submission time** (`app-history.js:416`). Deliberate and consistent with `sessionCompletionDate` precedence, but it means the six-month window keys on workout date, not submission date. Correct choice; worth documenting explicitly.
- **No import-batch entity.** `rawImports` stores the original text and `sessionExternalIds`, but there is no first-class batch record supporting selective rollback (§5).

---

## 3. Workout state machine — verified portion

```
 [no session] ──createSession──> DRAFT
      │
      ├─ startTemplate ──> ACTIVE  (activeWorkoutId set, draft persisted, debounced)
      │                      │
      │                      ├─ set/exercise/session edits
      │                      │    commit(..., {invalidateAnalysis:false, deferPersistence:true})
      │                      │    → analysis caches deliberately NOT invalidated (correct:
      │                      │      an unsubmitted draft is not part of completed history)
      │                      │
      │                      ├─ cancel ──> HARD DELETE  ❌ no tombstone, no restore  [F6]
      │                      │      removes session + its exercises + its sets from arrays
      │                      │
      │                      └─ submit ──> guard: workoutSubmissionIsAccepted()
      │                             │        (!submitted && !inProgress.has(id))
      │                             │  synchronous body, no await
      │                             │  → PRs, analysis, override outcomes
      │                             │  → activeWorkoutId cleared, draft cleared
      │                             │  → ONE commit()  [atomic]
      │                             │  finally: release in-flight lock
      │                             ▼
      │                          COMPLETED (submitted:true, workoutState:"completed")
      │                             │
      │                             └─ history edit ──> isEditingHistorySession() branch
      │                                    commit() sets historyEditFlow.dirty, returns early
      │                                    (does NOT persist until explicit Save)
```

### Verified transition properties

| Requirement | Result |
| --- | --- |
| A completed workout cannot be submitted twice | ✅ Double guard: `!session.submitted` **and** in-flight `Set` |
| A failed submission can be safely retried | ✅ `try/finally` releases the lock; no `commit` occurs on throw, so no partial write |
| Rapid double-tap submit | ✅ Structurally impossible — synchronous path, no `await` between guard and commit |
| A canceled workout does not affect history | ✅ Records are removed entirely; also `isCompletedWorkout` rejects `canceledAt` |
| One logical workout → two completed workouts | ✅ Not reachable via the tested path |
| Partial writes detectable | ✅ Not applicable — single atomic `commit` |
| Canceled workout is recoverable | ❌ **No** — hard delete (F6) |
| Interrupted workout resumes with correct set/timer state | **Not tested** |
| Second workout cannot start while one is active | **Not tested** |

---

## 4. Historical-window verification

### Six-month active history — CORRECT

`calendarMonthCutoff` (`app-foundation.js:343`) and `activeCompletedWorkoutHistory` (`:362`). All results below are executed output.

| Input | Cutoff | Expected | Result |
| --- | --- | --- | --- |
| 2026-07-10 *(spec example)* | 2026-01-10 | 2026-01-10 | ✅ |
| 2026-08-31 *(→ short month)* | 2026-02-28 | 2026-02-28 | ✅ |
| 2024-08-31 *(leap year)* | 2024-02-29 | 2024-02-29 | ✅ |
| 2026-03-31 *(→ 30-day month)* | 2025-09-30 | 2025-09-30 | ✅ |
| 2026-01-15 *(year rollover)* | 2025-07-15 | 2025-07-15 | ✅ |
| `""` / garbage | `""` | `""` | ✅ |

Inclusion at the exact boundary, `asOfDate = 2026-07-10`:

```
INCLUDED: in-boundary(2026-01-10), recent, today, strong-undef, completedAt-overrides
EXCLUDED: out-boundary(2026-01-09), future, canceled, deleted, draft, no-date,
          strong-false, malformed-date
```

Confirmed: **January 10 included, January 9 excluded** — precisely the documented rule. `throughDate` isolation also works (`throughDate: 2026-06-30` correctly drops July sessions).

**Archiving is dynamically calculated, not persisted.** There is no archive job, no archived flag, no periodic processing — the window is a filter applied at read time via `activeHistorySessions()`. This is a good design: nothing is ever destroyed, and changing the current date automatically re-scopes the window. It also means "restore archived data" is a non-operation — older data is always present in `data.sessions` and simply falls outside the active filter.

**Observation — date-format fragility.** Filtering uses lexical string comparison on `YYYY-MM-DD` slices, with no format validation. A correctly-padded date is always compared correctly. An unpadded date such as `2026-6-1` compares as greater than `2026-07-10` and would be silently excluded from active history. Whether that shape is reachable depends on import normalization, which I did not trace. Low risk; worth a validation assertion.

### Six-week qualifying windows — NOT VERIFIED

`selectHypertrophyWeeks`, `buildHypertrophyWeekAggregates`, `calculateHypertrophyScore`, `hypertrophyWindowOptions`, and `latestQualifyingFallbackWeekStarts` all exist in global scope. I verified only that week boundaries are **Monday-start**, matching the documented Monday–Sunday rule:

```
startOfWeekIso("2026-07-10" Fri) -> 2026-07-06 (Mon)  ✅
startOfWeekIso("2026-07-12" Sun) -> 2026-07-06 (Mon)  ✅
startOfWeekIso("2026-07-13" Mon) -> 2026-07-13        ✅
```

**The temporal-isolation requirement from Step 8 — that data occurring after a selected window must not influence any metric, label, warning, recommendation, or comparison within that window — was not tested.** This is the highest-value remaining test in the data layer and is specified in full in §8.

---

## 5. Set classification and import assessment

### `isWorkingSet` — executed matrix

| Set | score | volume | progression | pr |
| --- | --- | --- | --- | --- |
| `straight` | Y | Y | Y | Y |
| `warmup` | **n** | **n** | **n** | **n** |
| `isWarmup: true` (no setType) | **n** | **n** | **n** | **n** |
| `top` / `backoff` / `drop` / `failure` / `amrap` / `technique` / `deload` | Y | Y | Y | Y |
| `unknown` | **n** | **n** | **n** | **n** |
| **missing / `null` / garbage** | **Y** | **Y** | **Y** | **Y** |
| `warmup` + all `countsToward*: true` | **n** | **n** | **n** | **n** |
| `unknown` + all `countsToward*: true` | **n** | **n** | **n** | **n** |
| `straight` + `countsTowardVolume: false` | Y | n | Y | Y |
| `drop` + `countsTowardProgression: false` | Y | Y | n | n |

**Confirmed correct:** warm-ups and `unknown` sets are excluded from all four purposes and **cannot be re-enabled** by the override flags. Back-off and drop sets correctly count as working sets — they are not misclassified as warm-ups on the basis of lower load. This closes Stage 1 risk R6.

**Confirmed defect (F2):** a missing, `null`, or unrecognized `setType` normalizes to `straight` and counts toward everything. The application has an `unknown` class that fails closed; unrecognized input should reach it.

### Strong CSV import classification

With the field shape the real parser produces (`app-import.js:742-759`):

| Set Order | Load × Reps | Classified | Source | Confidence |
| --- | --- | --- | --- | --- |
| `W` | 45 × 5 | **warmup** | strong-explicit | 1.0 |
| `W` | 135 × 5 | **warmup** | strong-explicit | 1.0 |
| `1` | 165 × 8 | top | inferred | 0.86 |
| `2` | 145 × 8 | backoff | inferred | 0.86 |
| `3` | 125 × 12 | backoff | inferred | 0.86 |
| `D` | 95 × 15 | **drop** | strong-explicit | 1.0 |

Explicit Strong markers are honored at full confidence via `explicitStrongSetType` (`app-foundation.js:407`, called at `:434`). Three consecutive `W` rows followed by three working sets classify correctly. Bodyweight sets with no load classify as `unknown` with `reviewRequired: true` — a good fail-closed default.

**Confirmed defect (F1) — position-independent back-off inference.** With no explicit markers, any set lighter than the session maximum is labeled `backoff` regardless of position:

```
Set Order 1: 45x5   -> straight
Set Order 2: 135x5  -> backoff   ← precedes the heaviest set (165)
Set Order 3: 165x8  -> straight
Set Order 4: 145x8  -> backoff   ← correct
Set Order 5: 125x12 -> backoff
```

A "back-off" set occurring *before* the top set is semantically impossible. Same pattern on a classic ramp (`45,95,135,185,225` → `straight,backoff,backoff,backoff,straight`).

**Impact is bounded:** `backoff` counts as a working set for all four purposes, identically to `straight`. So volume, PRs, progression evidence, and grades are **unaffected**. The damage is to set-structure interpretation, display, and any future logic that treats back-off sets differently (the engine's `top_set_backoff` progression path does).

**Also confirmed (F3):** `classifyImportedExerciseSets` **ignores an `isWarmup: true` input flag** — `[{weight:45,reps:5,isWarmup:true}, ...]` classifies as `straight`. `setTypeSemantics` honors `isWarmup`; the import classifier does not. Reachable only by a non-Strong import path that sets `isWarmup` without `setType`; the backup-restore path preserves fields directly rather than re-classifying, so this is currently latent.

**Not tested:** duplicate detection, reimport, partial/corrupt files, interrupted import, import rollback, import-batch deletion, unit-conversion round-trips.

---

## 6. Cache and invalidation topology

Stage 1 flagged this as a high risk on the assumption that invalidation was scattered manual discipline. **That assumption was wrong.** `commit()` (`app-foundation.js:2353`) is a central funnel:

```js
data = { ...nextData, dataRevision: Number(data?.dataRevision || 0) + 1 };
if (options.invalidateAnalysis !== false) invalidateCompletedAnalysis();
```

Invalidation is **default-on**; `dataRevision` increments on every commit. The risk therefore reduces to an enumerable set of explicit opt-outs.

### Complete `invalidateAnalysis: false` inventory (8 sites, all in `app-workout.js`)

| Line | Context | Assessment |
| --- | --- | --- |
| 187 | session patch, `!draftMutation` | Conditional — safe when the session is the unsubmitted active workout |
| 800 | exercise patch, `!draftMutation` | Conditional — same guard |
| 846 | set patch, `!draftMutation` | Conditional — same guard |
| 325, 589, 792 | active-workout mutations | Unconditional opt-out — **verify each touches only the active draft** |
| 711 | `templatesWithStandard()` | Templates only; no completed-history effect |
| 1326, 1328 | workout start — adds session/exercises/sets | Adds an **unsubmitted** session, so it is correctly outside completed history |
| 1375 | exercise reorder | Ordering only |

`draftMutation` is correctly derived (`app-workout.js:186`): `session.id === activeWorkoutId && !isSessionSubmitted(session) && !isEditingHistorySession()`. All three conditions are required, which is the right guard.

**Finding F5:** the three unconditional opt-outs (325, 589, 792) rely on the author knowing they only touch draft state. Each needs individual verification, and the pattern has no structural protection against a future edit that touches submitted data under an opt-out.

**Not verified:** whether editing a *submitted* session recomputes `session.prs` and `session.workoutAnalysis`, which are persisted derived values.

---

## 7. Prioritized findings

### F1 — Back-off sets inferred at positions preceding the heaviest set

- **Severity:** Medium | **Confidence:** High (executed) | **Status:** Confirmed
- **Affected flow:** Strong CSV import → set classification
- **Files:** `app-foundation.js:415` `classifyImportedExerciseSets`
- **Fixture:** Sets with numeric `Set Order` only: `45×5, 135×5, 165×8, 145×8, 125×12`
- **Observed:** `straight, backoff, straight, backoff, backoff` — position 2 (135, lighter than the later 165) labeled `backoff`
- **Expected:** A back-off must follow a heavier top set. Position 2 should be `straight` (or `warmup`, if load-ratio inference were added)
- **Data-integrity consequence:** Set-structure metadata is wrong on imported history. Volume, PR, progression, and grade outputs are **unaffected**, because `backoff` and `straight` are equivalent for all four `isWorkingSet` purposes
- **User-facing consequence:** Incorrect set-type labels in history; potential mis-selection of the engine's `top_set_backoff` progression path for imported exercises
- **Correction:** Require that a `backoff` classification be preceded by a heavier set in the same exercise. Sets lighter than the maximum that occur *before* it are ramp-ups, not back-offs
- **Regression tests:** the ramp fixtures in §5; assert no `backoff` precedes the session maximum
- **Existing-data repair:** Reclassification is sufficient — recompute `setType` from `originalImportedValue`, which is retained on every imported set. No user warning needed since downstream metrics are unaffected

### F2 — Unrecognized `setType` fails open to a fully-counting working set

- **Severity:** Medium | **Confidence:** High (executed) | **Status:** Confirmed
- **Files:** `app-foundation.js:372` `normalizeCanonicalSetType`, `:399` `isWorkingSet`
- **Fixture:** `{ setType: "zzz" }`, `{ setType: null }`, `{}`
- **Observed:** all normalize to `straight` → `isWorkingSet` true for score, volume, progression, and PR
- **Expected:** Unrecognized input should normalize to `unknown`, which already fails closed on all four purposes and cannot be overridden
- **Data-integrity consequence:** Any set whose type fails to normalize silently becomes eligible for volume, PRs, progression evidence, and grading
- **Why it matters:** The application already implements the correct fail-closed class. Defaulting unrecognized values to `straight` contradicts its own design. The current exposure is low (a missing `setType` on a natively-logged set genuinely *is* a straight set), but the behavior is wrong for genuinely unrecognized values from a future import format or schema change
- **Correction:** Distinguish absent from unrecognized. `undefined`/`null` → `straight` (correct default for native sets); a non-empty string that matches no known type → `unknown` with `reviewRequired: true`
- **Regression tests:** assert `{setType:"zzz"}` yields `unknown` and is excluded from all four purposes; assert `{}` still yields `straight`

### F3 — Import classifier ignores the `isWarmup` input flag

- **Severity:** Low | **Confidence:** High (executed) | **Status:** Confirmed (latent)
- **Files:** `app-foundation.js:415`
- **Fixture:** `classifyImportedExerciseSets([{weight:45,reps:5,isWarmup:true}, {weight:185,reps:5}, {weight:185,reps:5}])`
- **Observed:** `straight, straight, straight` — the flag is ignored
- **Expected:** `warmup, ...` — `setTypeSemantics` honors `isWarmup`; the classifier should too
- **Status note:** Currently unreachable in production. The Strong path never sets `isWarmup` pre-classification, and backup restore preserves fields directly rather than re-classifying. Fix as consistency hardening
- **Correction:** treat a truthy `isWarmup` as an explicit classification alongside `setType`

### F4 — Submission failure is safe but silent

- **Severity:** Low | **Confidence:** High (code trace) | **Status:** Confirmed
- **Files:** `app-history.js:406-431`
- **Observed:** `submitWorkout` wraps its body in `try { ... } finally { release lock }` with **no `catch`**. If `submitWorkoutPrs` or `calculateWorkoutAnalysis` throws, no `commit` occurs (good — no partial write, retry is safe), but the exception propagates to the delegated event handler and the user receives no feedback
- **Expected:** The user should be told the submission failed and that their workout is intact and retryable
- **Data-integrity consequence:** None — this is the correct failure mode for integrity. The gap is purely in user communication
- **Correction:** Add a `catch` that surfaces a toast and leaves the session unsubmitted. Do **not** change the `finally` or add partial writes

### F5 — Three unconditional cache-invalidation opt-outs

- **Severity:** Medium | **Confidence:** High (enumerated) | **Status:** Confirmed as a risk, not as a live defect
- **Files:** `app-workout.js:325`, `:589`, `:792`
- **Observed:** These pass `{ invalidateAnalysis: false }` unconditionally, unlike `:187`/`:800`/`:846` which guard on `draftMutation`
- **Expected:** Every opt-out should be provably unable to touch submitted history
- **Correction:** Either add the `draftMutation` guard, or add an assertion in `commit()` that throws in development when `invalidateAnalysis: false` accompanies a change to a submitted session's sets/exercises
- **Verification required:** read each of the three call sites and confirm the mutation is draft-only. I did not do this

### F6 — Cancel is an irreversible hard delete; soft-delete fields are never written

- **Severity:** Medium | **Confidence:** High (code trace) | **Status:** Confirmed
- **Files:** `app-views.js:997`
- **Observed:** Canceling removes the session and all its exercises and sets from the arrays outright. The schema defines `deletedAt` and `trashed`, `isCompletedWorkout` (`app-foundation.js:358`) checks them, and the backup importer allowlists them (`app-import.js:858`) — but **no code path in the application ever writes either field**
- **Expected:** Either soft-delete with a restore path, or remove the unused fields so the schema does not imply a capability that does not exist
- **Data-integrity consequence:** A canceled workout is unrecoverable. For an unsubmitted draft this is defensible and is behind a confirmation dialog
- **Open question I did not resolve:** whether a **submitted** session can be deleted through any path, and whether that is also a hard delete. If so, severity rises — that is destroying real history with no undo
- **Correction:** Decide deliberately. If soft delete is wanted, write `deletedAt` and add restore; the read-side filters already exist

---

## 8. Required regression-test plan

| # | Test | Fixture | Expected | Guards |
| --- | --- | --- | --- | --- |
| **D1** | **Six-week window temporal isolation** | Build 10 weeks of history; select the window covering weeks 3–8; then append two new workouts in weeks 9–10 | Every metric, label, flag, trend, recommendation, comparison, and displayed date for the weeks 3–8 window is **byte-identical** before and after the append | Highest-priority gap |
| D2 | Window switching completeness | Same fixture; switch latest ↔ previous window | Date range, score, e1RM, volume, target volume, point count, chart points, trend, flags, strengths, warnings, coach recommendation, comparison labels all update together | Step 8 |
| D3 | Six-month boundary | Sessions on cutoff−1, cutoff, cutoff+1 | cutoff and cutoff+1 included; cutoff−1 excluded | Locks in verified behavior |
| D4 | Leap-year and short-month cutoff | asOf 2024-08-31, 2026-08-31, 2026-03-31 | 2024-02-29, 2026-02-28, 2025-09-30 | Locks in verified behavior |
| D5 | Warm-up exclusion, all consumers | Session with 3 warm-ups + 3 working sets | Warm-ups absent from volume, PRs, progression evidence, grade, hypertrophy | Locks in verified behavior |
| D6 | Override cannot resurrect a warm-up | `{setType:"warmup", countsTowardVolume:true, countsTowardScore:true, countsTowardProgression:true}` | Excluded from all four purposes | Locks in verified behavior |
| D7 | Unrecognized set type fails closed | `{setType:"zzz"}` | `unknown`, excluded from all four | F2 |
| D8 | Back-off ordering | Ramp `45,95,135,185,225` numeric Set Order | No `backoff` precedes the session maximum | F1 |
| D9 | Strong explicit markers | `W,W,1,2,3` with `sourceSetOrder` populated | Two `warmup` at confidence 1.0 | Locks in verified behavior |
| D10 | Double submission | Call `submitWorkout` twice synchronously | Second call is a no-op; one session, one PR set, one analysis | Locks in verified behavior |
| D11 | Submission throw | Stub `calculateWorkoutAnalysis` to throw | Session remains unsubmitted; lock released; retry succeeds; user notified | F4 |
| D12 | Edit a submitted session | Change a set's reps on a submitted session, save | `session.prs` and `session.workoutAnalysis` recomputed; derived caches invalidated | Unverified persisted-derived risk |
| D13 | Import → delete → recalculate | Import a Strong CSV, delete the batch | All derived metrics return to pre-import values | Untested |
| D14 | Interrupted active workout | Log sets, reload mid-draft | Sets, current-set pointer, and timer state restored exactly once | Untested |
| D15 | Migration with legacy dataset | Pre-migration fixture with old set classifications | No workout history dropped or reinterpreted; migration idempotent on re-run | Untested |

---

## 9. Affected-data assessment

| Finding | Existing data affected? | Detection | Repair |
| --- | --- | --- | --- |
| F1 back-off ordering | **Likely yes** for Strong imports whose CSV lacks `W` markers | Query sets where `classificationSource === "inferred"` and `setType === "backoff"` and a heavier set exists later in the same exercise | Reclassify from retained `originalImportedValue`. **No metric recalculation needed** — `backoff` and `straight` are equivalent to all consumers. No user warning needed |
| F2 unrecognized type | Unlikely — requires a non-normalizing `setType` in stored data | Query sets whose `setType` is a non-empty string outside the known set | Reclassify to `unknown`; recompute volume, PRs, grades for affected sessions. Warn the user if any set changes eligibility |
| F3 `isWarmup` ignored | No — path unreachable | n/a | n/a |
| F4 silent failure | No stored data affected | n/a | n/a |
| F5 invalidation opt-outs | Unknown pending verification | Compare cached vs freshly computed weekly volume after a draft edit | Invalidate all caches once at next launch; no stored data repair |
| F6 hard delete | Any already-canceled workouts are permanently gone | Not detectable — the records no longer exist | **Not recoverable.** Users should be told cancel is permanent |

---

## 10. Remediation roadmap

**Immediate — data-loss protection**
- F6: decide soft vs hard delete. If a *submitted* session can be hard-deleted, treat as High and fix first. Scope: `app-views.js:997` + a restore path. Validation: D13-style recalculation

**Classification fixes**
- F1: ordering constraint on back-off inference. `app-foundation.js:415`. Low complexity. Repair pass over existing imported sets
- F2: distinguish absent from unrecognized `setType`. `app-foundation.js:372`. Low complexity
- F3: honor `isWarmup` in the classifier. Trivial

**Cache and invalidation**
- F5: verify the three unconditional opt-outs; add a development-mode assertion in `commit()`. Medium complexity
- Verify persisted derived values (`session.prs`, `session.workoutAnalysis`) recompute on history edit — D12

**Reliability**
- F4: add a `catch` with user feedback to `submitWorkout`. Trivial

**Verification work (not fixes)**
- D1/D2 six-week window isolation — **do this first among the unassessed areas**
- Migrations (Step 12), error injection (Step 13), security/privacy (Step 14), full adversarial matrix (Step 15)

All engine-adjacent changes require `npm run sync:web` and a `CACHE_NAME` bump (v65 → v66).

---

## 11. Release recommendation

### **Suitable for controlled beta with safeguards** — for a single technical owner, effectively "suitable for personal use."

**Why not lower:** The properties that would make a fitness data layer untrustworthy are demonstrably correct. Submission is exactly-once and atomic. The six-month window is precisely right on every boundary including leap years. Warm-up exclusion is enforced and cannot be overridden. Cache invalidation is centralized and default-on. No confirmed defect corrupts volume, PRs, progression evidence, or grades.

**Why not higher:** Three material unknowns remain — six-week window temporal isolation, migration safety, and restore/archive behavior — and one confirmed irreversible operation (F6). "Suitable for personal use" would require certifying data trustworthiness across all supported transitions, and I have certified a subset.

**Safeguards for the beta period:**
1. Tell users that canceling a workout is permanent (F6).
2. Encourage a backup export before any import or bulk edit — the export path exists and the import path is transactional.
3. Treat imported set-*type* labels as advisory until F1 is fixed; imported set *values* are trustworthy.
4. Do not ship a schema migration until Step 12 is audited.

**What would move this to "suitable for personal use":** D1, D12, D14, and D15 passing, plus a decision on F6.

---

## 12. Completion statement

**Demonstrated:** one workout is persisted exactly once; warm-ups and unknown sets are correctly and unoverridably excluded from every metric; the six-month active window is temporally exact; deleted, canceled, and draft sessions do not leak into active calculations; derived caches invalidate by default on every mutation.

**Not demonstrated:** six-week qualifying-window temporal isolation; interrupted-workout recovery; migration safety; import rollback; restore behavior; error-path recovery; security and privacy posture.

Two findings were built and then withdrawn after more careful testing (§ coverage declaration). No production code was modified; only pure functions were invoked against synthetic fixtures.
