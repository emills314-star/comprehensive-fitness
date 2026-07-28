# Remediation Specification — Stage 1 + Stage 2 Findings

> **HISTORICAL REMEDIATION SPECIFICATION:** Every command, count, version, branch, publishing instruction, and implementation order below is scoped to the documented `main` @ `d636a1a` baseline. It is not a standing repository policy and must not redirect the Evidence & Change migration or override `AGENTS.md`, `docs/UI_UX.md`, or `docs/ROADMAP.md`. In particular, cache `v65` instructions are historical; current work must read the live `CACHE_NAME` and advance it only under the current architecture contract.

## Metadata

- **Purpose:** Complete, self-contained implementation spec for every issue found in the Stage 1 and Stage 2 independent reviews
- **Date:** 2026-07-24
- **Baseline:** `main` @ `d636a1a`, engine `3.4.1`, `sw.js` `CACHE_NAME = "comprehensive-fitness-pwa-v65"`
- **Audience:** An implementing agent with no access to the review conversation. Everything needed is in this document.
- **Source reports:** `stage-1-orientation-and-risk-assessment.md`, `stage-2-recommendation-and-fitness-logic-audit.md`

---

## READ FIRST — repository rules that apply to every item below

These are the repo's own rules (`AGENTS.md`, `docs/ARCHITECTURE.md`). Violating them breaks installed clients.

1. **`www/` is generated, not source.** Edit root files only, then run `npm run sync:web`. Never hand-edit `www/`.
2. **Any cross-file runtime contract change must advance `CACHE_NAME` in `sw.js`.** At this specification's `d636a1a` baseline the value was `comprehensive-fitness-pwa-v65`; do not reuse that value as current state. Increment once per shipped batch (not once per file). Without this, an installed PWA can pair a new UI with a stale cached engine.
3. **Mandatory documentation loop.** Every application change updates its governing doc in the same task. Routing: domain logic → `docs/DECISION_ENGINE.md`; structure → `docs/ARCHITECTURE.md`; scope → `docs/PROJECT.md`; UI → `docs/UI_UX.md`; status → `docs/ROADMAP.md` (always).
4. **Privacy review before every commit.** Run `git status`, inspect the staged list, confirm no `personal_fitness_data/`, `private-personal-data/`, or `www/private-personal-data/` content is included.
5. **Do not commit or push** unless the repository owner explicitly authorizes that action in the current task. This baseline-specific reminder agrees with the current explicit-authorization publishing policy in `AGENTS.md`.
6. **Validation gate for every batch:** `npm test` → `npm run lint` → `npm run verify:pwa`. Note that `npm test` is currently red for an unrelated reason — fix R1 first so you have a clean signal.

---

## Blocking product decisions

Two items **must not be implemented** until the owner answers. Specs are provided conditionally.

| # | Question | Blocks |
| --- | --- | --- |
| **D1** | When a confirmed progression coincides with poor readiness, does the load increase stand? Options: (a) hold the previous load that day, (b) proceed but mark the effort target advisory, (c) keep current behavior. | Item C2 |
| **D2** | Should one maximally-severe readiness domain trigger an adjustment, or is multi-domain corroboration deliberately required? | Item C1 |

Two further questions affect scope but not correctness:

| # | Question | Affects |
| --- | --- | --- |
| D3 | Should per-session light days be a user-facing concept, or is a lower-fatigue mesocycle the only intended route? | Item L3 |
| D4 | Does an authoritative rules document exist outside the repository? (`ROADMAP.md:81` references a `program/` folder that does not exist.) | Item L5 |

---

# BATCH R — Restore a trustworthy test signal

Do this batch first. Every later batch depends on `npm test` being meaningful.

## R1 — Fix `tar` invocation so the public test gate passes on Windows

- **Severity:** Medium | **Complexity:** Low | **Dependencies:** none
- **Files:** `scripts/test-research-archive-integrity.js`, `scripts/test-research-workbook-determinism.js`

**Problem.** Both harnesses shell out to `tar -xf C:\...\archive.tar -C C:\...`. GNU tar parses a leading `C:` as a `host:path` remote spec and tries a network connection, failing with `tar: Cannot connect to C: resolve failed` and exit 128. Result: `npm test` reports **48/50** on Windows. It passes on the Linux CI runner, which is why the failure went unnoticed.

**Change.** Add `--force-local` to every `tar` invocation in both files. This flag tells tar to treat colons as literal path characters and is a no-op on Linux, so CI behavior is unchanged.

Locate each `run("tar", [...])` call (the helper is at `test-research-archive-integrity.js:21` and `test-research-workbook-determinism.js:22`) and insert `"--force-local"` as the first argument:

```js
// before
run("tar", ["-xf", tarPath, "-C", destination]);
// after
run("tar", ["--force-local", "-xf", tarPath, "-C", destination]);
```

Apply to **all** tar calls in both files, including any `-cf` creation calls, not just extraction.

**Alternative if `--force-local` proves unavailable:** convert paths to POSIX form (`path.resolve(p).replace(/\\/g, "/").replace(/^([A-Za-z]):/, "/$1")`) before passing them to tar. Prefer `--force-local`; it is a smaller change.

**Validation.** `node scripts/test-research-archive-integrity.js` and `node scripts/test-research-workbook-determinism.js` both exit 0 on Windows. `npm test` reports 50/50.

**Docs.** Update `docs/ROADMAP.md:77`, which currently claims "50/50 public harnesses ... pass" — a claim that was false on this platform. State the platform explicitly in the revised wording.

## R2 — Replace stub-based achievement tests with real collaborators

- **Severity:** High | **Complexity:** Medium | **Dependencies:** R1
- **Files:** `scripts/test-workout-grade.js` (lines ~165–195)

**Problem.** The achievement-badge test extracts `workoutAchievementBadges` by name and injects hand-written stubs that contradict production behavior and shape:

```js
() => true,                                // isWorkingSet  — warm-ups ALWAYS count
(set) => set.load,                         // resistanceLoad — production sets use set.weight
(set) => set.load * (1 + set.reps / 30),   // estimatedOneRepMax — re-implemented
(sets) => [...sets].sort(...)[0] || null   // bestWorkoutSet — re-implemented
```

Fixture sets use `{ reps: 10, load: 80 }`. `createSet` (`app-foundation.js:2404-2417`) produces `weight`, never `load`.

Consequences: the test cannot detect a warm-up-exclusion regression (its stub asserts the opposite rule), cannot detect an e1RM formula change (it supplies its own), and cannot detect a resistance-accessor bug (it bypasses the real one). This is the single most important documented product rule — "warm-ups are excluded from working-set scoring, volume, progression, and PR calculations" (`docs/PROJECT.md` terminology) — and it is currently untested in this path.

**Change.**
1. Extend `scripts/read-application-contract-source.js` with a helper that extracts a *named set* of functions together, so a test can pull `workoutAchievementBadges` along with its real dependencies (`isWorkingSet`, `resistanceLoad`, `estimatedOneRepMax`, `bestWorkoutSet`, `workoutSetPerformanceValue`, `setTypeSemantics`) into one `new Function` body rather than stubbing them.
2. Change fixtures to production set shape: `weight`, `weightUnit`, `resistanceType`, `setType`, `completed`, `skipped`, `countsTowardScore`, `countsTowardVolume`, `countsTowardProgression`. Mirror the shape produced by `createSet`.
3. Add a fixture containing **warm-up sets** and assert they are excluded from every badge.
4. Keep stubs only for genuinely external concerns (asset map, `isoNow`).

**Validation.** New test fails if `isWorkingSet` is changed to always-true; fails if the Epley divisor changes; fails if `resistanceLoad` stops consulting `addedLoad`.

**Note.** This is the highest-value test change in the repository, but it is scoped to one file. A broader campaign against source-regex assertions across the other 27 `readFileSync` harnesses is **out of scope** — see Item L6.

---

# BATCH C — Core logic corrections

Each item is independent unless noted. All touch `prescription-engine.js`, so ship them together, sync `www/`, and bump `CACHE_NAME` once.

## C1 — Rep-loss is measured against the prescribed ceiling, not the actual first set

- **Severity:** Medium | **Confidence:** High (confirmed by execution) | **Complexity:** Low
- **File:** `prescription-engine.js:2916-2919`, inside `determineProgressionDecision`

**Current code:**
```js
const acceptableRepLoss = number(options.maximumRepLossPercent, DEFAULT_POLICY.maximumRepLossPercent) / 100;
const firstSetAtTop = lastReps.length > 0 && lastReps[0] >= number(repRange.max);
const laterSetsConverged = lastReps.slice(1).every((reps) => reps >= Math.ceil(number(repRange.max) * (1 - acceptableRepLoss)));
const allAtTop = firstSetAtTop && laterSetsConverged;
```

**Problem.** The retention floor is `repRange.max × 0.75` — a constant that never references the observed lead set. A session of **20, 9, 9 reps** in a 6–12 range therefore returns `progress / increase_load`, despite a set-to-set rep loss of (20−9)/20 = **55%**, more than double the documented `maximumRepLossPercent: 25`.

`docs/DECISION_ENGINE.md:100` states load progression requires "every later set to remain within the configured acceptable rep-loss limit." The natural and coaching-correct reading is loss relative to the set actually performed.

**Change.** Measure the floor from the observed lead set, and additionally require the lead set to be inside the prescribed range so a wildly over-performing first set triggers a load correction rather than a progression:

```js
const acceptableRepLoss = number(options.maximumRepLossPercent, DEFAULT_POLICY.maximumRepLossPercent) / 100;
const leadReps = lastReps.length > 0 ? lastReps[0] : 0;
const firstSetAtTop = leadReps >= number(repRange.max);
const retentionFloor = Math.ceil(leadReps * (1 - acceptableRepLoss));
const laterSetsConverged = lastReps.slice(1).every((reps) => reps >= retentionFloor);
const allAtTop = firstSetAtTop && laterSetsConverged;
```

**Behavioral consequences to expect and verify:**

| Last exposure (range 6–12) | Before | After |
| --- | --- | --- |
| `[12, 12, 12]` | increase_load | increase_load (unchanged) |
| `[12, 9, 9]` | increase_load | increase_load (floor = ceil(9) = 9) |
| `[12, 8, 8]` | add_one_rep | add_one_rep (unchanged) |
| `[20, 9, 9]` | **increase_load** | **add_one_rep** (floor = ceil(15) = 15) |
| `[14, 11, 11]` | increase_load | add_one_rep (floor = ceil(10.5) = 11 → passes; verify) |

Run the full `test-recommendation-*` suite (9 harnesses, including seeded fuzz) after this change — it alters a decision boundary and some existing expectations may legitimately shift. **Do not update an existing expectation without confirming the new value is more correct**; a changed fuzz baseline needs justification recorded in the work log.

**Docs.** `docs/DECISION_ENGINE.md:100` — restate the rule as loss relative to the observed lead set, and note that a lead set above the range ceiling blocks a load increase.

## C2 — Light sessions stack with readiness adjustments; deloads do not

- **Severity:** Medium | **Confidence:** High (confirmed by execution) | **Complexity:** Low
- **File:** `prescription-engine.js:4408-4412`, inside `createExercisePrescriptionSnapshot`

**Current code:**
```js
const finalPrescription = hardSafetyReadiness
  ? applyReadinessAdjustment(basePrescription, effectiveReadiness)
  : ["exercise_deload", "muscle_group_deload", "full_program_deload"].includes(deloadStatus.state)
    ? { ...deepClone(basePrescription), readinessAdjustment: { ...readinessChange, changed: false, explanation: `${deloadStatus.explanation} The deload already supersedes a smaller readiness adjustment.` } }
    : applyReadinessAdjustment(basePrescription, effectiveReadiness);
```

**Problem.** `"light_session"` is absent from the suppression list. Measured behavior with a 4-set base at RPE 7–9, a planned light session, and two adverse readiness domains:

```
base                        sets: 4   RPE 7-9
after light_session         sets: 3   RPE 6-7
light + readiness (STACKED) sets: 2   RPE 5.5-6.5    readinessAdjustment.changed = true
```

A 50% set reduction on a session already designed to be low-fatigue. The adjacent deload branch demonstrates the author's intent was to prevent exactly this composition.

**Change.** Add `"light_session"` to the suppression list and generalize the explanation:

```js
const supersedingStates = ["exercise_deload", "muscle_group_deload", "full_program_deload", "light_session"];
const finalPrescription = hardSafetyReadiness
  ? applyReadinessAdjustment(basePrescription, effectiveReadiness)
  : supersedingStates.includes(deloadStatus.state)
    ? { ...deepClone(basePrescription), readinessAdjustment: { ...readinessChange, changed: false, explanation: `${deloadStatus.explanation} The planned reduction already supersedes a smaller readiness adjustment.` } }
    : applyReadinessAdjustment(basePrescription, effectiveReadiness);
```

Keep the deload-specific wording if `deloadStatus.state` ends in `_deload`; use the generic wording for `light_session`. Do not lose the distinction in user-facing copy — a user on a planned light day should be told the light session already accounts for the reduction, not that they are deloading.

**Note.** Hard safety (illness/pain) must remain first and unconditional. Do not reorder the ternary.

**Docs.** `docs/DECISION_ENGINE.md:122` — state the composition rule explicitly: any planned reduction (light session or deload tier) supersedes a same-day readiness adjustment; hard safety supersedes everything.

## C3 — Resting-heart-rate threshold disagrees with documentation

- **Severity:** Low | **Confidence:** High (confirmed by execution) | **Complexity:** Trivial
- **File:** `prescription-engine.js:1450`

**Current code:** `if (rhrRatio !== null && rhrRatio > 1.07) autonomicReasons.push(...)`

**Problem.** `docs/DECISION_ENGINE.md:77` states "resting heart rate above 108% of baseline." The code triggers above 107%. Verified: 108% triggers, 107% does not; the real band is 107.1%+.

**Change.** Pick one and align the other. There is no recorded rationale for either value, so this is an owner-visible choice. Absent direction, prefer changing the **documentation** to "above 107%" — the code is what has been running and been implicitly validated, and loosening a recovery threshold is the more conservative edit.

If instead the code changes: `rhrRatio > 1.08`.

**Docs.** `docs/DECISION_ENGINE.md:77`.

## C4 — CONDITIONAL on D2: readiness severity is computed but ignored by the adjustment gate

- **Severity:** Medium | **Confidence:** High (confirmed by execution) | **Complexity:** Low–Medium
- **Files:** `prescription-engine.js:1461` (severity computed), `:1476` (gate)
- **DO NOT IMPLEMENT until D2 is answered.**

**Problem.** `evaluateReadiness` computes `severity` as the sum of per-domain severities and uses it to set `state` (`severity >= 4` → `"low"`). But `readinessAdjustmentFor` gates purely on count:

```js
if (evaluation.signalCount < 2 && !hardSafetySignals.length) { return { changed: false, ... } }
```

Measured consequences:

| Input | signalCount | severity | Adjustment |
| --- | --- | --- | --- |
| HRV 78% of baseline **and** RHR 115% of baseline | 1 | 2 | **none** |
| `energyAvailabilityLow: true` | 1 | 2 | **none** |
| Sleep 7.5 h vs 8 h baseline + soreness 7 | 2 | 2 | −1 set, RPE −0.5 |

Two strongly abnormal autonomic markers produce no adjustment while two trivial markers do. Note the HRV/RHR merge into a single domain is **correct and deliberate** (it prevents double-counting one physiological signal) — the defect is that the merge then makes the count-based gate unreachable.

**If D2 = "one severe domain should adjust":**
```js
const severeSingleDomain = evaluation.severity >= 2;
if (evaluation.signalCount < 2 && !severeSingleDomain && !hardSafetySignals.length) { ... }
```
Verify this does **not** break the two guardrails that must hold:
- `energyAvailabilityLow` alone has severity 2 and would now adjust. Confirm the owner accepts nutrition alone producing a *set/RPE adjustment* — it must still never produce a **deload** (`assessDeloadNeed` is a separate path and unaffected, but re-verify).
- A single mild domain (severity 1: sleep slightly low, nutrition inadequate, one regression) must still produce no change.

**If D2 = "multi-domain corroboration is deliberate":** make that explicit rather than leaving severity looking load-bearing. Add a comment at `:1476` stating that severity intentionally informs `state` and user messaging only, and document the rule in `docs/DECISION_ENGINE.md:88`.

**Docs.** `docs/DECISION_ENGINE.md:77-88` either way.

## C5 — CONDITIONAL on D1: progression load increase composes with a readiness RPE reduction

- **Severity:** Low | **Confidence:** High | **Complexity:** Medium
- **Files:** `prescription-engine.js:4403` (load assigned), `:4412` (readiness applied after)
- **DO NOT IMPLEMENT until D1 is answered.**

**Problem.** Ordering is: load set from progression → deload applied → readiness applied. With three qualifying exposures (→ `increase_load`) and two adverse readiness domains (non-severe), the final prescription carries the **incremented load**, **one fewer set**, and a **target RPE lowered by 0.5**. For a fixed rep target, a heavier load necessarily produces a higher RPE — "add load and lower your target effort" is not executable as stated.

Each lever is individually documented; their composition is not.

**If D1 = (a) hold the previous load:** in the readiness branch, when `readinessChange.changed === true` and the progression action is one of `increase_load` / `increase_top_set_load` / `increase_load_first`, retain the prior load in `finalPrescription.prescribedLoad` and record the deferral in `progressionRule` so the next session can take the increment. Do **not** mutate `basePrescription` — it must keep the unadjusted plan.

**If D1 = (b) advisory effort target:** leave numbers alone; change only the explanation to state that the planned load increase stands and the effort target is advisory for the day. Lowest-risk option.

**If D1 = (c) status quo:** no code change; document the composition in `docs/DECISION_ENGINE.md` so it is a stated rule rather than an emergent one.

## C6 — Sibling deload parameters accept different shapes with no validation

- **Severity:** Low (robustness; **not** a live defect) | **Complexity:** Low
- **File:** `prescription-engine.js:3084` and `:3086-3093`, inside `assessDeloadNeed`

**Problem.** `muscleExerciseHistories` accepts a flat array of histories. `programMuscleHistories` requires an array of *arrays* of histories (or `[{ history: [...] }]`). Passing the flat shape yields `degradedMuscleGroupCount: 0` **silently** — full-program deload becomes unreachable with no error.

**This is not currently broken in production.** `app-foundation.js:1586` passes `Array.from(byMuscle.values())`, the correct nested shape. Verified by execution: full-program deload does fire. Fix this as a trap for future callers, not as a bug.

**Change.** Normalize both parameters through one tolerant helper that accepts a precomputed staleness object, a `{ history }` wrapper, a flat history array, or an array of histories — and throws a named error on an unrecognizable shape rather than silently returning zero.

**Validation.** Assert that flat and nested `programMuscleHistories` produce identical results, or that the flat form throws a clear error. Assert `app-foundation.js:1586`'s exact shape still yields `full_program_deload` under the documented conditions.

---

# BATCH A — Application-layer consistency

## A1 — Consolidate estimated-1RM to one resistance-aware implementation

- **Severity:** Medium | **Confidence:** High for the duplication and gating inconsistency; the divergence is **latent, not currently observed** | **Complexity:** Medium

**Problem.** The Epley formula exists at four production sites, and the shared helper bypasses the resistance-aware accessor every neighbouring calculation uses:

| Location | Implementation | Reads |
| --- | --- | --- |
| `app-foundation.js:2750` `estimatedOneRepMax(set)` | `set.weight * (1 + set.reps / 30)` | **`set.weight` directly** |
| `app-history.js:40` `workoutSetPerformanceValue(set, type)` | resistance-aware switch | `resistanceLoad(set, type)` |
| `prescription-engine.js:4055` `historyHighWatermark` | `set.load * (1 + max(0, reps) / 30)` | `set.load` (engine shape) |
| `scripts/personal-fitness/normalize-workouts.js:197` | `round(load * (1 + reps / 30), 3)` | pipeline shape |

`resistanceLoad` (`app-foundation.js:2934`) resolves `bodyweight_plus_load` → `addedLoad ?? weight` and `assisted_bodyweight` → `assistanceLoad ?? weight`. `estimatedOneRepMax` ignores this.

Callers also gate inconsistently:
```js
app-foundation.js:3158  ["external","bodyweight_plus_load"].includes(type) ? estimatedOneRepMax(set) : ...
app-analysis.js:965     ["external","bodyweight_plus_load"].includes(type) ? estimatedOneRepMax(set) : ...
app-analysis.js:1142    type === "external" ? estimatedOneRepMax(set) : ...     // narrower
app-history.js:355      if (resistanceType === "external") { ... }              // narrower
```

So the chart and the lift analysis can legitimately disagree about whether a bodyweight-plus-load exercise has an e1RM at all.

**Why this is latent rather than live:** app-created data keeps `weight` and `addedLoad` synchronized (`createSet` at `app-foundation.js:2417`; the weight-edit handler at `app-workout.js:930` patches `addedLoad` alongside `weight`). The exposure is data that did not pass through those paths — Strong CSV imports, backup restores, legacy records, or any future write that sets one field without the other.

**Change.**
1. Make `estimatedOneRepMax` resistance-aware. Change its signature to `estimatedOneRepMax(set, resistanceType)` and have it read `resistanceLoad(set, resistanceType)` rather than `set.weight`. Return `0` for resistance types where Epley is meaningless (`assisted_bodyweight`, `duration`, `distance`, plain `bodyweight`).
2. Update all five call sites to pass the resistance type. The inline ternaries at `app-foundation.js:3158`, `app-analysis.js:965`, and `app-analysis.js:1142` become redundant once the helper handles the switch — collapse them.
3. **Decide and apply one gating rule**: should `bodyweight_plus_load` have an e1RM? Both answers are defensible (added load is a real external load; total system load is unknown without bodyweight). Pick one, apply it in the helper, and document it. Currently two screens say yes and two say no.
4. Leave `prescription-engine.js:4055` alone — it operates on the engine's own normalized `{ load, reps }` shape, not app set records. Note the intentional separation in `docs/ARCHITECTURE.md`.

**Validation.** New test: construct a `bodyweight_plus_load` set with `weight !== addedLoad` and assert the chart, lift analysis, PR list, and achievement disclosure all report the same value. This is the test that would have caught the divergence.

**Docs.** `docs/DECISION_ENGINE.md:179` (PR semantics) and `docs/ARCHITECTURE.md`.

## A2 — Reduce displayed e1RM precision

- **Severity:** Low | **Complexity:** Trivial | **Dependencies:** A1
- **File:** `app-history.js:358` — `prs.push({ ..., value: currentE1rm.toFixed(1) + " e1RM" })`

**Problem.** One decimal place implies measurement precision the method cannot deliver. Epley has substantial error above ~10 reps, and the inputs are a self-reported rep count and a gym plate load. "247.3 e1RM" is false precision.

**Change.** Round to the nearest whole unit: `Math.round(currentE1rm)`. Apply the same treatment at `app-history.js:520` (`workoutPrPreviousHighWater`) so the current value and the prior benchmark use identical formatting. Search for other `toFixed` calls on e1RM values and align them.

**Docs.** `docs/DECISION_ENGINE.md:106` (achievement criteria) if the badge copy changes.

## A3 — Route recommendation surfaces through `recommendationForSurface`

- **Severity:** Medium | **Complexity:** Medium | **Dependencies:** none, but do after Batch C settles
- **Files:** `prescription-engine.js:4451`; consumers across `app-*.js`

**Problem.** `recommendationForSurface` is a pure projection returning the same `basePrescription`, `finalPrescription`, `standardGuideline`, `evidenceSummary`, `confidence`, and versions for all seven allowed surfaces. If used, cross-surface divergence would be structurally impossible. It is **never called by the application** — verified: the app's complete engine API usage is `evidence`, `resolveExerciseIdentity`, `resolveDefaultPrescriptionTarget`, `applyManualOverride`, `transitionMesocycle`, `rankExercisePool`, `prescribeExercise`, `evaluateReadiness`, `evaluateOverride`.

`scripts/test-prescription-engine.js` exercises it and passes, implying a surface-consistency guarantee the app does not actually rely on.

**Change.** Have each consuming surface read its snapshot through `recommendationForSurface(snapshot, "<surface>")` instead of destructuring the stored snapshot directly. Allowed surfaces: `coach`, `template`, `chart`, `workout_start`, `live_workout`, `deload`, `mesocycle`.

**Do this incrementally**, one surface per commit, with the cross-screen fixture from A4 passing at each step. This touches display code across six files; a single large change is high-risk against the protected-surface Playwright goldens.

**Cheaper alternative if the owner declines:** delete `recommendationForSurface` and its tests, so nothing implies a guarantee that is not enforced. This forfeits the structural protection — prefer adoption.

**Validation.** A4's matrix. Also assert `recommendationForSurface` output is deep-equal across all seven surfaces for one snapshot (differing only in the `surface` label).

## A4 — Build the cross-screen consistency matrix

- **Severity:** High (assurance gap) | **Complexity:** Medium–High | **Dependencies:** A3 preferred
- **New file:** `scripts/test-cross-screen-recommendation-consistency.js`

**Problem.** Stage 2 could not certify that the nine consuming surfaces render one snapshot identically. This is the largest remaining unknown in the recommendation system. Related concern: `basePrescription` is read **9 times in `app-views.js`** against a documented role of "exists only to explain readiness changes" (`docs/DECISION_ENGINE.md:102`). Each read is a place a surface could display the pre-adjustment plan while another displays the adjusted one.

**Change.** Build a harness that constructs one athlete state, produces one snapshot, and asserts that every surface derives identical `recommendationType`, load, reps, sets, target RPE, and explanation.

Minimum fixture set (15 states): normal progression; rep progression; load progression; hold for confirmation; acute poor readiness; localized soreness; accumulated fatigue; exercise plateau; planned light session; exercise deload; recent substitution; insufficient history; conflicting readiness signals; missing RPE; deload week followed by normal training.

Surfaces to compare: chart, exercise detail, coach card, template, mesocycle, workout-start, readiness summary, live workout, post-workout summary.

**Also audit as part of this work:** each of the 9 `basePrescription` reads in `app-views.js`. Confirm every one is rendering a deliberate before/after comparison, not a target the user could mistake for today's plan.

**Validation.** Any material discrepancy is either fixed or explicitly justified in the test with a comment.

---

# BATCH V — Verification of unexamined areas

These are not fixes. They are the audit work Stage 2 explicitly did not complete, and they should be scheduled before the recommendation system is considered verified.

## V1 — Cache-invalidation audit

- **Severity:** High risk, unquantified | **Complexity:** Medium
- **Files:** `app-foundation.js:260` (`analysisRevision`), `:1169` (set at startup), `:2458-2478` (`invalidateCompletedAnalysis`)

**Problem.** Seven derived cache families (`completedAnalysisIndexCache`, `weeklyVolumeCache`, `fatigueFlagCache`, `coachRecommendationCache`, `exerciseProgressCache`, `previousPerformanceCache`, `submittedPerformanceIndexCache`, plus `targetContextCache` and `actualExpectedCache` in `app-analysis.js`) key on `analysisRevision`. That variable is incremented in exactly one place: `invalidateCompletedAnalysis()`. Correctness therefore depends on every mutation path across eight files remembering to call it. Stale caches produce contradictory numbers across screens with no error.

**Task.** Enumerate every site that reassigns `data` or mutates `data.sets` / `data.exercises` / `data.sessions` / `data.templates`, and cross-check against `invalidateCompletedAnalysis()` calls. Produce a table of mutation site → invalidation status. Any uncovered path is a defect.

**Consider afterward:** making invalidation structural rather than manual — e.g. routing all mutations through a single `commitData()` that bumps the revision — so the invariant cannot be forgotten.

## V2 — Warm-up exclusion audit

- **Severity:** Critical if broken | **Complexity:** Medium | **Dependencies:** R2

**Problem.** `isWorkingSet` gates five downstream systems: volume, PRs, progression, grades, achievements. One misclassification corrupts all five. The primary badge test currently stubs it to always-true (R2), so the exclusion rule is untested in that path.

**Task.** Verify with the *real* `isWorkingSet` that warm-ups are excluded from all five consumers, including Strong-imported data where classification provenance differs from natively logged data. Determine what the second argument (`"pr"`, `"volume"`, `"progression"`) actually switches on and whether the contexts are mutually consistent.

## V3 — Volume and hypertrophy audit (Stage 2 Step 7, not performed)

Weekly hard sets, family coalescing, direct vs fractional credit, double-counting, unilateral handling, deload exclusion, hypertrophy score inputs and minimum sample size. Specifically verify that family coalescing counts an exercise exactly once per family when it has both a direct and a fractional relationship into that family, and that rounding occurs only at final exposure.

## V4 — Mesocycle generation audit (Stage 2 Step 8, partially performed)

Constants and deload-tier interaction are verified. Not verified: plan generation, portfolio construction, session distribution, equipment filtering, blocking validation. Check specifically for weekly volume targets that exceed per-session caps, and equipment filters that produce empty or invalid sessions.

## V5 — Progression boundary verification

Return-after-gap at exactly 56 vs 57 days (`DEFAULT_POLICY.maximumReturnGapDays`) — inclusive/exclusive boundary is unverified.

---

# BATCH L — Low priority and documentation

| # | Item | Files | Action |
| --- | --- | --- | --- |
| L1 | `plannedLightSession` has no application call site | `prescription-engine.js:4258` | Depends on D3. Either expose per-session light days in the UI, or document that light sessions are a mesocycle-level property only (`lower_fatigue_resensitization`). Docs currently imply a capability the UI does not offer |
| L2 | Mechanical redundancy threshold `0.82` | `prescription-engine.js` (`mechanicalRedundancyScore` consumers) | Unsupported precision — a two-decimal cutoff on an uncalibrated composite. It only gates a *warning*, so no urgency. Either document it explicitly as an untuned product constant or coarsen it |
| L3 | 56-day return cliff | `DEFAULT_POLICY:113` | Product choice, honestly labeled. Consider a ramp rather than a step. No action required |
| L4 | `ROADMAP.md:81` references a non-existent `program/` folder | `docs/ROADMAP.md` | Depends on D4. If no external rules document exists, remove the reference; if one does, reconcile it against `DECISION_ENGINE.md` before any further logic work |
| L5 | Stale status claims | `docs/ROADMAP.md` | After R1, re-verify and restate the test-count claim with the platform named. Audit other "VERIFIED" status lines for the same class of drift |
| L6 | Broader source-regex test campaign | 27 remaining `readFileSync` harnesses | **Out of scope for this remediation.** Track separately. The pattern is brittle (a rename fails them) and insensitive (a behavior change passes). Convert opportunistically when touching a file, rather than as a campaign |
| L7 | `.claude/launch.json` and `CLAUDE.md` | repo root | Added during Stage 1 review. Both untracked and non-production. Keep or delete at owner's discretion |

---

## Suggested execution order

```
1.  R1                    → restores a trustworthy npm test signal        [do first]
2.  C1, C2, C3, C6        → engine fixes, ship as one batch
    then: npm run sync:web, bump CACHE_NAME v65 → v66, npm run verify:pwa
3.  R2                    → real-collaborator achievement tests
4.  A1, A2                → e1RM consolidation
    then: sync:web, bump CACHE_NAME again
5.  V1, V2                → invalidation and warm-up audits (may surface new defects)
6.  A3, A4                → surface routing + cross-screen matrix, incrementally
7.  C4, C5                → only after D1/D2 are answered
8.  V3, V4, V5            → remaining audit coverage
9.  Batch L               → cleanup and documentation
```

## Per-batch validation checklist

```bash
npm test
```
```bash
npm run lint
```
```bash
npm run sync:web
```
```bash
npm run verify:pwa
```

Then, for anything touching UI or runtime contracts:

```bash
npm run audit:ui
```

Before commit: `git status`, inspect the staged file list, confirm no personal-data paths are included. Update `docs/ROADMAP.md` and the governing document for each change. Do not push unless the owner asks.

---

## Findings index

| ID | Title | Severity | Confirmed | Item |
| --- | --- | --- | --- | --- |
| S1-F1 | Public test gate fails on Windows | Medium | Yes | R1 |
| S1-F2 | Source-regex and stub-based tests | High | Yes | R2, L6 |
| S1-F3 | e1RM duplicated with inconsistent gating | Medium | Yes (latent) | A1 |
| S1-F4 | `ROADMAP.md` references missing folder | Observation | Yes | L4 |
| S1-R2 | Cache invalidation depends on manual discipline | High risk | Unquantified | V1 |
| S1-R6 | Warm-up exclusion untested in badge path | Critical if broken | Unquantified | V2 |
| S2-F1 | Rep-loss measured against ceiling | Medium | Yes | C1 |
| S2-F2 | Readiness severity ignored by gate | Medium | Yes | C4 (D2) |
| S2-F3 | Light session stacks with readiness | Medium | Yes | C2 |
| S2-F4 | `recommendationForSurface` unused | Medium | Yes | A3 |
| S2-F5 | Load increase + RPE reduction | Low | Yes | C5 (D1) |
| S2-F6 | `plannedLightSession` no call site | Low | Yes | L1 |
| S2-F7 | RHR threshold vs documentation | Low | Yes | C3 |
| S2-F8 | Deload parameter shape asymmetry | Low | Yes (not live) | C6 |
| S2-§9 | e1RM displayed to 0.1 precision | Low | Yes | A2 |
| S2-§9 | Redundancy threshold 0.82 | Observation | Yes | L2 |
