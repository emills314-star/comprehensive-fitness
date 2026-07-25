# Stage 2 — Recommendation, Progression, Readiness, Deload, Mesocycle, and Exercise-Science Audit

## Metadata

- **Purpose:** Independent behavioral audit of the recommendation and fitness-logic systems
- **Date:** 2026-07-24
- **Repository state:** `main` @ `d636a1a`, engine `3.4.1`, snapshot/prescription `1.4.0`/`2.4.0`
- **Method:** The real `prescription-engine.js` was loaded and executed directly. Non-exported internals (`progressionConfirmationFor`, `enforceProgressionConfirmation`, `programmingContext`) were reached by running the module source in a `vm` context with a single injected capture line, leaving behavior unmodified. All results below are from executed code, not source reading, unless explicitly labeled otherwise.
- **Production code modified:** none.

### Coverage declaration — read this before using the score

This stage completed deep behavioral work on **source-of-truth, progression, readiness, deload/light-session precedence, and intervention definitions**. It did **not** complete:

- The full 15-fixture × 9-screen cross-screen matrix (Step 10). I established the *architecture* of cross-screen consistency and executed the engine side, but did not drive all nine UI surfaces.
- The volume and hypertrophy audit (Step 7).
- Mesocycle generation testing (Step 8) beyond constants and precedence.

Those sections are marked **NOT ASSESSED** and their points are withheld rather than guessed. A score that silently averaged unexamined categories would be exactly the false precision this audit is supposed to detect.

---

## 1. Executive assessment

### Score: 57 / 80 assessed (10 points withheld, 10 provisional)

| Category | Max | Awarded | Basis |
| --- | --- | --- | --- |
| Recommendation consistency | 25 | **18** | Engine has a genuine single authoritative path. Deductions: `recommendationForSurface` is dead in production (−3); `basePrescription` is read in 9 places in the view layer against a documented "explanation only" role (−2); full cross-screen matrix unverified (−2) |
| Progression logic | 15 | **11** | Confirmation gate, reduction-exclusion, and pain precedence all verified working. Deductions: rep-loss boundary measured against the wrong baseline (−3, Finding 1); no minimum-exposure gate inside `determineProgressionDecision` itself, so correctness depends entirely on callers remembering `enforceProgressionConfirmation` (−1) |
| Readiness logic | 15 | **10** | Single evaluator confirmed; guardrails hold. Deductions: severity is computed but ignored by the adjustment gate (−4, Finding 2); RHR threshold disagrees with documentation (−1) |
| Light-session and deload logic | 15 | **11** | Tier precedence is correct and deliberately designed; deload correctly supersedes readiness. Deductions: light session stacks with readiness where deload does not (−3, Finding 3); `plannedLightSession` has no app call site (−1, Finding 6) |
| Volume and hypertrophy logic | 10 | **NOT ASSESSED** | Withheld |
| Mesocycle logic | 10 | **5 (provisional)** | Constants, caps, and deload-tier interaction verified; generation, distribution, and validation not driven |
| Scientific defensibility | 10 | **7** | Thresholds are honestly labeled as heuristics and are mostly defensible. Deductions: two rules present more precision than their inputs support (−3, §6) |

**Assessed total: 57/80.** Treating the withheld category as neutral, this maps to roughly **71/100**, but the honest statement is 57 of 80 examined.

### Headline answer to the principal question

> *Given the same historical data, readiness data, mesocycle context, and selected exercise, will every part of the application produce one coherent, defensible, explainable recommendation?*

**At the engine level: yes, with three specific coherence defects.** There is exactly one decision path (`prescribeExercise` → `createExercisePrescriptionSnapshot`), it emits one immutable snapshot, and every app surface reads that snapshot rather than recomputing. This is a genuinely well-architected core and better than most systems of this kind.

**At the composition level: no, not fully.** Three confirmed defects produce internally contradictory or inconsistently-scoped prescriptions (Findings 1–3). None is dangerous; all are coherence failures rather than safety failures.

**At the presentation level: unverified.** I could not complete the cross-screen matrix, so I cannot certify that the nine consuming surfaces render the one snapshot identically.

### Three greatest strengths (verified by execution)

1. **The progression confirmation gate genuinely works.** Three consecutive qualifying exposures are required before any upward progression. One or two qualifying exposures produce `hold_for_confirmation`. Incomplete sets, out-of-range effort, missing RPE, and pain each reset the count to zero. This is the single most important safety property in the system and it is correctly implemented.
2. **Deload correctly supersedes readiness with an explicit anti-double-reduction guard** (`prescription-engine.js:4410-4411`). When any deload tier is active, the readiness adjustment is returned with `changed: false` and an explanation naming the supersession. Someone thought carefully about intervention composition.
3. **Planned reductions are excluded from progression evidence at every entry point.** `determineProgressionDecision:2882`, `progressionConfirmationFor:2786`, and `prescribedLoadFromHistory:4075` all filter `prescribedReduction`. A deload week therefore cannot be misread as failed progression — a classic bug in this domain, correctly avoided here.

### Five greatest risks

1. Set-to-set rep loss is measured against the prescribed rep ceiling rather than the actual first set, so a 20/9/9 session earns a load increase (Finding 1).
2. Readiness severity is computed and discarded; only the *count* of adverse domains gates adjustment, so one severe signal is treated as less serious than two trivial ones (Finding 2).
3. Light sessions and readiness adjustments stack into a double reduction that the deload path explicitly prevents (Finding 3).
4. The engine's own cross-surface projection API is never called, so the tests asserting surface consistency prove nothing about the app (Finding 4).
5. Cross-screen presentation consistency remains unverified end-to-end.

---

## 2. Recommendation pipeline map

```
INPUTS
  submitted history ──┐
  set roles/reps/loads│
  RPE ────────────────┤
  pain / technique ───┤
  adherence ──────────┤
  readiness check-in ─┼─────────────────────────────────────────────┐
  research DB 3.0.0 ──┤                                             │
  personal evidence ──┤                                             │
  equipment/scope ────┤                                             │
  mesocycle type ─────┘                                             │
                                                                    │
 ┌──────────────────────────────────────────────────────────────────┴────────┐
 │ ENTRY: prescriptionEngine.prescribeExercise(options)      [engine:5977]    │
 │        → createExercisePrescriptionSnapshot(evidence, options) [4162]      │
 └───────────────────────────────────────────────────────────────────────────┘
   │
   ├─1  normalizeHistory()                          [1249]  derives incompletePrescribedWork,
   │                                                        prescribedReduction, adherence
   ├─2  filterHistoryForCandidate() / identity      [1829]  exact performance identity
   ├─3  assessExerciseStaleness()                   [1310]  classification + deloadCandidate
   ├─4  chooseSetStructure()                        [2528]
   ├─5  determineVolumePrescription()               [2619]
   ├─6  progressionConfirmationFor()                [2785]  3 consecutive qualifying exposures
   │                                                        (1 for stable low-fatigue isolation)
   ├─7  determineProgressionDecision()              [2881]  raw decision tree
   ├─8  enforceProgressionConfirmation(7, 6, ctx)   [2848]  ← DOWNGRADES progress → hold
   ├─9  assessDeloadNeed()                          [3081]  tier resolution
   ├─10 prescribedLoadFromHistory(candidate, 8, 9)  [4073]  latest anchor + watermark cap
   │                                                        + return-after-gap (>56d)
   ├─11 applyDeloadState(base, 9)                   [4134]  deload/light reductions
   ├─12 readinessAdjustmentFor(base, readiness)     [1473]
   └─13 finalPrescription =                         [4408]
          hard safety (illness/pain) → applyReadinessAdjustment  (zero sets, blocked)
          deload tier active         → readiness SUPPRESSED (changed:false)   ✅
          otherwise                  → applyReadinessAdjustment
   │
   ▼
 SNAPSHOT { recommendationId, basePrescription, finalPrescription, standardGuideline,
            evidenceSummary, confidence, versions, checksum }   ← immutable once submitted
   │
   ├─ persisted → data.recommendationHistory
   │
   ▼ CONSUMED BY (all read the stored snapshot; none re-decides)
   app-foundation.js  coachTargetForTemplateExercise      finalPrescription:24 reads
   app-analysis.js    setPrescriptionForRole    [413]     → exact role rows
   app-views.js       roleSessionPrescriptionLine         → collapsed summary + expanded detail
   app-workout.js     executable set rows                 → prepopulated fields
   app-history.js     grading / PRs / achievements
   app-import.js      recoveryRecommendationForSession    → readiness LABELS only
```

### Where recommendation logic is created, mutated, or interpreted

| Operation | Location | Notes |
| --- | --- | --- |
| **Created** | `createExercisePrescriptionSnapshot` [4162] | Sole creation point. Verified: app has exactly one call path via `prescribeExercise` |
| **Mutated (pre-snapshot)** | `applyDeloadState` [4134], `applyReadinessAdjustment` [1523], `applyProgrammingPolicy` [4330] | All operate on a `deepClone`; ordering is fixed and correct |
| **Overridden** | `applyManualOverride` — 2 app call sites | Append-only; evaluated post-workout by `evaluateOverride` |
| **Recomputed** | Post-submit "next exposure preview" | Documented as transient and non-persisting |
| **Translated** | `recoveryRecommendationForSession` [app-import.js:375] | Label adapter only — verified it performs no scoring |
| **Cached** | `coachRecommendationCache`, keyed on `analysisRevision` | Invalidation risk carried from Stage 1 |
| **Stored** | `data.recommendationHistory` | Submitted snapshots byte-immutable |
| **Projected for surfaces** | `recommendationForSurface` [4451] | **Never called by the app** — see Finding 4 |

---

## 3. Source-of-truth determination

**Verdict: the application has one authoritative recommendation source of truth at the engine level.**

Evidence:
- The app instantiates one engine (`app-foundation.js:300`, re-created on evidence change at `:1285`) and calls exactly nine distinct engine methods. Only one of them — `prescribeExercise` — produces a recommendation.
- `prescribeExercise` is a one-line delegate to `createExercisePrescriptionSnapshot` (`engine:5977`).
- `recommendationForSurface` (`:4451`) is a **pure projection**: it returns the same `basePrescription`, `finalPrescription`, `standardGuideline`, `evidenceSummary`, `confidence`, and versions for all seven allowed surfaces, varying only the `surface` label. If it were used, cross-surface divergence would be structurally impossible.

**Competing implementations found: none that produce a decision.** This materially improves on the Stage 1 hypothesis. Specifically:

- `recoveryRecommendationForSession` was suspected of being a second readiness scorer. It is not — it adapts engine output into labels, and `test-workout-safety.js:8` textually enforces that the removed duplicate scorer stays removed.
- `setPrescriptionForRole` (`app-analysis.js:413`) does not re-decide; it resolves exact per-role reps from `finalPrescription` plus the newest comparable role history.

**Qualifications that prevent a clean bill of health:**

1. `recommendationForSurface` is dead code in production (Finding 4). The mechanism that would *guarantee* surface consistency is not the mechanism actually in use.
2. `basePrescription` is read 9 times in `app-views.js` against a documented role of "exists only to explain readiness changes" (`DECISION_ENGINE.md:102`). Each read is a place a surface could display the pre-adjustment plan while another displays the adjusted one. Not verified as a defect; flagged as the highest-value target for the deferred cross-screen matrix.

---

## 4. Intervention-definition table

All triggers below were confirmed by execution.

| Intervention | `recommendationType` | Trigger (verified) | Sets | Load | RPE | Return criterion |
| --- | --- | --- | --- | --- | --- | --- |
| **Establish baseline** | `normal` | No prior history | — | latest or 90% of watermark if >56d gap | — | First qualifying exposure |
| **Progress — add rep** | `progress` | Confirmed ×3; first set below rep max, or later sets below the retention floor | = | = | = | — |
| **Progress — increase load** | `progress` | Confirmed ×3; first set ≥ rep max AND later sets ≥ `ceil(repMax × 0.75)`; effort ≤ ceiling | = | +1 increment, capped at watermark | = | — |
| **Progress — add working set** | `progress` | `volume_progression` method, all at top, PRODUCTIVE, target < max | +1 | = | = | — |
| **Progress — top-set load** | `progress` | `top_set_backoff`; top at max AND all back-offs at max | = | +1 increment on top; back-offs recalculated | = | — |
| **Hold — for confirmation** | `hold` | Fewer than 3 consecutive qualifying exposures | = | = | = | 3 qualifying exposures |
| **Hold — complete evidence** | `hold` | Missing RPE, RPE above ceiling, or incomplete prescribed work | = | = | = | Complete comparable exposure |
| **Hold — technique** | `hold` | `techniqueValid === false` or breakdown text | = | = | = | Valid technique |
| **Hold — rising RPE** | `hold` | RPE slope ≥ 0.3 and not all sets at top | = | = | = | 0.5 RPE easier |
| **Hold — pain-free modification** | `hold` | Pain on latest comparable exposure, or repeated pain in window | = | = | = | Pain-free or confirmed substitute |
| **Reduce volume** | `reduce_volume` | 2 regressions in last 2 exposures, not deload-eligible | −1 | = | = | Stable comparable performance |
| **Light session** | `light_session` | `mesocycleType === LOWER_FATIGUE` or `plannedLightSession` | −1 | = | capped 6–7 | Next normal session |
| **Exercise deload** | `exercise_deload` | `staleness.deloadCandidate` (REGRESSING/EXCESSIVELY_FATIGUING/ROTATION_CANDIDATE **and** fatigue ≥1 or pain) | → `volume.perExercise.deload` | −7.5–12% | 5.5–7 | One lower-fatigue exposure |
| **Muscle-group deload** | `muscle_group_deload` | ≥2 degraded exercises for the muscle | → deload volume | ↓ | 5.5–7 | Reassess scope |
| **Full-program deload** | `full_program_deload` | ≥3 degraded muscle groups **AND** ≥2 readiness signals **AND** persistent (≥2 days) | → deload volume | ↓ | 5.5–6.5 | Reassess program |
| **Substitute** | `substitute` | `rotationRecommended` with pain flag; or hard-safety pain | 0 (blocked) | none | — | Confirmed pain-free substitute |
| **Rotate exercise** | `rotate_exercise` | `rotationRecommended`, no pain, not exercise-deloading | — | — | — | — |
| **Stop (illness)** | `hold` / `stop_for_illness` | `illness === true` | 0 (blocked) | none | — | Illness resolved |
| **Readiness adjustment** | *(modifier, not a type)* | ≥2 adverse domains | −1 if ≥3 programmed | 0, or −5% if severe or cannot drop a set | −0.5, or −1 if severe | 2 domains near baseline |

### Verified precedence table

```
1. Hard safety (illness / pain)        → zero sets, execution blocked   [ABSOLUTE]
2. Historical pain evidence            → hold_for_pain_free_modification
3. Exercise deload (staleness + 2 regressions)
4. Evidence blockers (technique / effort / incomplete)
5. Rising RPE at flat performance      → hold
6. Two regressions                     → reduce_volume
7. Progression decision tree
8. enforceProgressionConfirmation      → may DOWNGRADE 7 to hold
─── deload tier resolution (independent axis) ───
   full_program > muscle_group > exercise > light_session > readiness_only
─── composition ───
   deload tier active  → readiness adjustment SUPPRESSED  ✅ [engine:4410]
   light_session       → readiness adjustment STACKS      ❌ [Finding 3]
```

### Answers to the Step 3 precedence questions

| Question | Verified answer |
| --- | --- |
| Does injury override progression? | **Yes, absolutely.** Pain → zero sets, `executionBlocked: true`, before any other rule |
| Does severe readiness override a planned heavy day? | **Partially.** It reduces sets/RPE but does **not** cancel a progression-driven load increase — see Finding 5 |
| Does a programmed light session satisfy a deload requirement? | **No.** Any deload tier overrides `light_session`. Verified with a genuinely degraded fixture |
| Can an exercise deload coexist with normal training elsewhere? | **Yes.** Scope is per-exercise |
| Can readiness adjustment occur inside a planned light session? | **Yes — and it stacks.** 4 sets → 2, RPE 7–9 → 5.5–6.5 (Finding 3) |
| Does a plateau automatically trigger a deload? | **No.** `stalled` yields `deloadCandidate: false`. Deload needs regression/fatigue/pain. Correctly conservative |
| When does hold become deload? | `deloadCandidate` **and** ≥2 regressions in the last 2 exposures |
| Can a load increase coexist with reduced sets and RPE? | **Yes** — Finding 5 |

---

## 5. Progression audit — executed boundary results

Range 6–12, RPE ceiling 9, three-exposure baseline, full pipeline with the confirmation gate active.

| Scenario | Raw decision | Final (gated) | Assessment |
| --- | --- | --- | --- |
| 3 qualifying, all at top | progress / increase_load | **progress / increase_load** | ✅ |
| 1 qualifying exposure | progress / increase_load | **hold / hold_for_confirmation** | ✅ gate works |
| 2 qualifying exposures | progress / increase_load | **hold / hold_for_confirmation** | ✅ |
| 3 exposures, last incomplete (2 of 3 sets) | hold / hold_for_complete_evidence | **hold** | ✅ |
| 3 exposures, middle incomplete | progress / increase_load | **hold / hold_for_confirmation** | ✅ consecutive-run reset works |
| 3 exposures, RPE 6 (below target min 7) | progress / increase_load | **hold / hold_for_confirmation** | ✅ under-effort blocks confirmation |
| 3 exposures, RPE absent | hold | **hold** | ✅ |
| Pain on last exposure | hold / hold_for_pain_free_modification | **hold** | ✅ |
| First set 12, later 9,9 | progress / increase_load | **progress / increase_load** | Boundary — exactly at floor |
| First set 12, later 8,8 | progress / add_one_rep | **progress / add_one_rep** | ✅ correctly discriminates |
| **First set 20, later 9,9** | progress / increase_load | **progress / increase_load** | ❌ **Finding 1** |
| Last exposure was a prescribed reduction | progress | progress | ✅ correctly excluded |
| Top-set: top 12 + back-offs 12,12 | progress / increase_top_set_load | ✅ | |
| Top-set: top 12 + back-offs 8,8 | progress / progress_backoff_reps | ✅ back-off gating correct | |
| RPE exactly 9 (at ceiling) | progress / increase_load | Inclusive boundary — reasonable | |
| RPE 9.5 (above ceiling) | hold | ✅ | |

**Correction to a Stage 1 concern:** Stage 1 flagged that `determineProgressionDecision` applies no minimum-exposure gate. That is true of the function in isolation but **not** of the pipeline — `enforceProgressionConfirmation` is wired at `:3326`, `:4243`, and `:4346`. The documented three-exposure rule is enforced. I withdraw that concern.

---

## 6. Readiness audit — executed results

| Scenario | State | Signals | Severity | Adjustment |
| --- | --- | --- | --- | --- |
| Normal | normal | 0 | 0 | none |
| Poor sleep only | monitor | 1 | 2 | **none** ✅ single marker monitored |
| Poor sleep + soreness 8 | below_baseline | 2 | 3 | −1 set, RPE −0.5 |
| Sleep + soreness 9 + HRV −40% | low | 3 | 6 | −1 set, −5% load, RPE −1 |
| **HRV −22% AND RHR +15%** | **monitor** | **1** | **2** | **none** ❌ **Finding 2** |
| Nutrition inadequate only | monitor | 1 | 1 | none ✅ |
| Nutrition + protein inadequate | monitor | **1** | 1 | none ✅ correctly one domain |
| Low energy availability only | monitor | 1 | **2** | **none** ❌ Finding 2 |
| Illness | low | 1 | 3 | blocked, zero sets ✅ |
| Pain | low | 1 | 3 | blocked, substitute required ✅ |
| RHR exactly 107% baseline | normal | 0 | 0 | none |
| RHR exactly 108% baseline | monitor | 1 | 1 | none — **doc says "above 108%"** ❌ Finding 7 |

**Verified guardrails that hold:** nutrition alone cannot deload; nutrition and protein correctly collapse into one domain; a single marker never rewrites the prescription; HRV and RHR correctly merge into one autonomic domain rather than double-counting; illness and pain bypass everything.

---

## 7. Volume and hypertrophy logic — NOT ASSESSED

Deferred. Stage 1 established the architecture (`weeklyMuscleVolume` → `programming-family-ledger`, direct 1.0 / fractional 0.5 or 0.25 / incidental 0). No behavioral verification was performed this stage. 10 points withheld.

---

## 8. Mesocycle logic — partially assessed

Verified by execution: `DEFAULT_POLICY` caps (18 working sets/session, 2 exercises/muscle/day, 8 target and 10 absolute max exercises, spinal 180, grip 190, 75/100-minute duration); volume factors (deload 0.5, lower-fatigue 0.72, specialization 1.2); and the deload-tier interaction with mesocycle type (`LOWER_FATIGUE` → `light_session`).

Not verified: plan generation, portfolio construction, session distribution, equipment filtering, and blocking validation. 5 of 10 points awarded provisionally.

One structural observation (Finding 6): `plannedLightSession` has **no call site anywhere in the application**. The only production route to a `light_session` state is a mesocycle whose type is `lower_fatigue_resensitization`.

---

## 9. Exercise-science assessment

| Rule | Implemented value | Classification | Comment |
| --- | --- | --- | --- |
| Progression requires confirmed repeat performance | 3 consecutive qualifying exposures | **Reasonably supported** | Conservative and defensible; the 1-exposure isolation exception is sensible coaching practice |
| Pain blocks progression | Absolute | **Strongly supported** | Correct and correctly prioritized |
| Double progression (reps then load) | Range 6–12 default | **Strongly supported** | Standard, well-evidenced practice |
| Deload volume factor | 0.5 | **Plausible but uncertain** | Honestly labeled as a heuristic in `DECISION_ENGINE.md:126` |
| Back-off reduction 8–18% (12% target) | — | **Plausible coaching practice** | Reasonable range, honestly labeled |
| Max rep loss 25% | — | **Reasonable consensus** | The threshold is defensible; its *measurement* is not (Finding 1) |
| Return-after-gap: >56 days → ~90% of watermark | — | **Primarily a product choice** | Honestly labeled; the 56-day cliff is arbitrary but harmless (conservative) |
| Single HRV reading cannot deload | Requires 3 degraded muscles + 2 signals + persistence | **Strongly supported** | Correctly resists the most common consumer-wearable error |
| Sleep adverse below 85% of baseline or <6 h | — | **Reasonably supported** | Individualized to baseline, which is the right design |
| Soreness/fatigue ≥7 adverse, ≥9 severe | — | **Primarily a product choice** | Honestly labeled as operational heuristic |
| Epley e1RM `load × (1 + reps/30)` | — | **Reasonable consensus, unsupported precision in display** | See below |
| Redundancy threshold 0.82 similarity | — | **Unsupported precision** | See below |
| Achievement badge thresholds (98% range, 99% RPE logging, 95% RPE compliance) | — | **Product preference, correctly labeled** | `DECISION_ENGINE.md:106` explicitly calls these product heuristics, not scientific thresholds. Honest |

### Unsupported precision — two items

1. **e1RM displayed to one decimal place.** `app-history.js:358` renders `currentE1rm.toFixed(1) + " e1RM"`. Epley has substantial error above ~10 reps, and the inputs (a self-reported rep count and a gym plate load) do not justify 0.1 lb resolution. Displaying "247.3 e1RM" implies measurement precision the method cannot deliver. **Low severity, high confidence.** Recommend rounding to the nearest whole unit, or to the nearest equipment increment.
2. **Mechanical redundancy threshold of 0.82.** A two-decimal similarity cutoff on a composite of movement pattern, muscle family, joint action, role, loading profile, stability, regional emphasis, and equipment implies a calibrated scale. Nothing in `research_database/` establishes that 0.82 is meaningfully different from 0.78 or 0.85. This is a product tuning constant presented as a measurement. **Observation.** The mitigating factor is that it only gates a *warning*, not a block.

### Notable scientific strength

The engine refuses to let time alone rotate a progressing lift (`stillProgressing` short-circuits rotation reasons at `:1396`), refuses to treat a plateau as a deload trigger, and requires persistence plus breadth before a systemic deload. These are the three places where fitness apps most commonly give harmful advice, and all three are handled conservatively.

---

## 10. Prioritized findings

### Finding 1 — Set-to-set rep loss is measured against the prescribed ceiling, not the actual first set

- **Severity:** Medium | **Confidence:** High (executed) | **Status:** Confirmed
- **Scientific classification:** Good rule implemented incorrectly
- **Product requirement:** `DECISION_ENGINE.md:100` — "load progression requires the first set to reach the top of the prescribed range within the RPE ceiling and every later set to remain within the configured acceptable rep-loss limit." `DEFAULT_POLICY.maximumRepLossPercent = 25`.
- **Files / functions:** `prescription-engine.js:2916-2919` (`determineProgressionDecision`)
- **Code:**
  ```js
  const acceptableRepLoss = number(options.maximumRepLossPercent, DEFAULT_POLICY.maximumRepLossPercent) / 100;
  const firstSetAtTop = lastReps.length > 0 && lastReps[0] >= number(repRange.max);
  const laterSetsConverged = lastReps.slice(1).every((reps) => reps >= Math.ceil(number(repRange.max) * (1 - acceptableRepLoss)));
  ```
  The retention floor is `repRange.max × 0.75`, a constant. It never references `lastReps[0]`.
- **Input scenario:** Range 6–12. Three qualifying exposures; the last is **20, 9, 9 reps** at RPE 8.
- **Observed:** `progress / increase_load`
- **Expected:** Not a load increase. Set-to-set rep loss is (20−9)/20 = **55%**, more than double the 25% limit.
- **Why it matters:** 20/9/9 is the signature of a load that was far too light for set one followed by rapid fatigue — the athlete needs the load *rebalanced*, not increased. The rule that should catch this is present and configured correctly; only its baseline is wrong. Note the rule does still function in the ordinary case: 12/8/8 correctly yields `add_one_rep` rather than a load increase.
- **Reproduction:** `determineProgressionDecision({ history: [3 qualifying exposures ending in reps [20,9,9] @ RPE 8], repRange: {min:6,max:12}, targetRpe: {min:7,max:9} })`
- **Recommended correction:** Compute the floor from the observed lead set: `lastReps.slice(1).every(r => r >= Math.ceil(lastReps[0] * (1 - acceptableRepLoss)))`, and additionally require `lastReps[0]` to be within the prescribed range so an over-performing first set triggers a load correction rather than a progression.
- **Required validation:** Boundary cases at exactly 25% loss, just inside, just outside; a first set above `repRange.max`; and a regression test asserting 12/9/9 still progresses while 20/9/9 does not.

### Finding 2 — Readiness severity is computed but ignored by the adjustment gate

- **Severity:** Medium | **Confidence:** High (executed) | **Status:** Confirmed
- **Scientific classification:** Product-rule coherence defect
- **Product requirement:** `DECISION_ENGINE.md:77-82` — "more extreme deviation increases severity"; "Adverse multi-domain/persistent readiness can reduce working sets, load, and target RPE."
- **Files / functions:** `prescription-engine.js:1461` (severity computed), `:1476` (gate)
- **Code:**
  ```js
  const severity = sum(signals.map((signal) => signal.severity));   // :1461
  ...
  if (evaluation.signalCount < 2 && !hardSafetySignals.length) { return { changed: false, ... } }  // :1476
  ```
  `severity` is returned and used to set `state` (`severity >= 4` → `"low"`), but the adjustment gate tests **only `signalCount`**.
- **Input scenario A:** HRV at 78% of baseline **and** resting HR at 115% of baseline, sleep and everything else normal.
- **Observed:** `signalCount: 1`, `severity: 2`, `state: "monitor"`, **no adjustment**. Both autonomic markers are merged into one domain (correctly, to avoid double-counting) — but the merge then makes the gate unreachable.
- **Input scenario B:** `energyAvailabilityLow: true` alone → `severity: 2`, no adjustment.
- **Expected:** A single domain at maximum severity should be capable of producing at least the mild adjustment that two trivial signals produce.
- **Why it matters:** An athlete with two strongly abnormal autonomic markers receives no adjustment, while an athlete with mildly short sleep plus soreness of 7 receives one. The system's own severity model disagrees with its own gate. This is not dangerous — failing to reduce is the status-quo plan, not an escalation — but it is incoherent and undermines the "smallest sufficient lever" principle.
- **Recommended correction:** Change the gate to `evaluation.signalCount < 2 && evaluation.severity < 2 && !hardSafetySignals.length`, or make the autonomic merge emit severity-scaled domain counts. Either way, decide deliberately whether one severe domain should adjust — this is a product decision (see §12).
- **Required validation:** Assert that HRV −22% + RHR +15% produces an adjustment; that a single mild domain still does not; and that nutrition alone still cannot deload.

### Finding 3 — Light sessions stack with readiness adjustments; deloads do not

- **Severity:** Medium | **Confidence:** High (executed) | **Status:** Confirmed
- **Scientific classification:** Product-rule coherence defect
- **Product requirement:** `DECISION_ENGINE.md:122` — "Readiness/fatigue adjustment changes the smallest sufficient lever."
- **Files / functions:** `prescription-engine.js:4408-4412`, `applyDeloadState:4137-4143`
- **Code:**
  ```js
  const finalPrescription = hardSafetyReadiness
    ? applyReadinessAdjustment(basePrescription, effectiveReadiness)
    : ["exercise_deload", "muscle_group_deload", "full_program_deload"].includes(deloadStatus.state)
      ? { ...deepClone(basePrescription), readinessAdjustment: { ...readinessChange, changed: false, ... } }
      : applyReadinessAdjustment(basePrescription, effectiveReadiness);
  ```
  `"light_session"` is absent from the suppression list.
- **Input scenario:** Base 4 working sets, RPE 7–9. Planned light session. Readiness: sleep 5 h vs 8 h baseline, soreness 8 (two adverse domains).
- **Observed (executed):**
  ```
  base                       sets: 4  RPE 7-9
  after light_session        sets: 3  RPE 6-7
  light + readiness STACKED  sets: 2  RPE 5.5-6.5    readiness.changed = true
  ```
  Compare `exercise_deload`, where readiness is correctly suppressed with `changed: false`.
- **Expected:** Either light sessions suppress readiness like deloads do, or the two compose under a stated rule. Currently the behavior differs from its sibling with no documented rationale.
- **Why it matters:** A 50% set reduction on a session already designed to be low-fatigue. Not harmful, but it defeats the purpose of a *planned* light session, and the user-facing explanation will attribute the reduction to readiness on a session that was already reduced by design. The engine's own guard at `:4410` demonstrates the author's intent was to prevent exactly this.
- **Recommended correction:** Add `"light_session"` to the suppression list, or introduce an explicit composition rule capping total reduction. Prefer the former for consistency.
- **Required validation:** Assert light + 2 readiness signals yields the light-session prescription unchanged with `readinessAdjustment.changed === false` and a supersession explanation.

### Finding 4 — `recommendationForSurface` is never called by the application

- **Severity:** Medium | **Confidence:** High | **Status:** Confirmed
- **Scientific classification:** n/a — architecture / test-assurance
- **Files:** `prescription-engine.js:4451`; asserted by `scripts/test-prescription-engine.js`
- **Observed:** `grep` for `recommendationForSurface` across `app-*.js` and `index.html` returns **no matches**. The app's complete engine API usage is: `evidence` (8), `resolveExerciseIdentity` (5), `resolveDefaultPrescriptionTarget` (2), `applyManualOverride` (2), `transitionMesocycle`, `rankExercisePool`, `prescribeExercise`, `evaluateReadiness`, `evaluateOverride`.
- **Expected:** Either the surfaces consume the projection, or the projection is removed and the tests stop implying surface coverage.
- **Why it matters:** This is the API whose entire purpose is guaranteeing that seven surfaces see one recommendation. Tests exercise it and pass; a reader concludes cross-surface consistency is proven. It is not — the app achieves consistency by a different route (shared stored snapshot), which is *probably* equivalent but is not what the tests verify. This compounds the Stage 1 finding about source-text and stub-based testing.
- **Recommended correction:** Route surface reads through `recommendationForSurface`, which would make divergence structurally impossible and give the existing tests real force. Removing it is the cheaper alternative but forfeits the guarantee.

### Finding 5 — A progression-driven load increase composes with a readiness-driven RPE reduction

- **Severity:** Low | **Confidence:** High | **Status:** Confirmed (behavior); **product decision required** (whether it is wrong)
- **Scientific classification:** Product-rule coherence gap — composition undefined
- **Files:** `prescription-engine.js:4403` (load set), `:4412` (readiness applied after)
- **Input scenario:** Three qualifying exposures all at the rep ceiling (→ `increase_load`), plus two adverse readiness domains (non-severe).
- **Observed:** Final prescription carries the incremented load from `prescribedLoadFromHistory`, **minus one set**, with **target RPE lowered 0.5**.
- **Why it matters:** For a fixed rep target, a heavier load necessarily produces a *higher* RPE. "Add load and lower your target effort" is not executable as stated. The documentation defines each lever independently but never defines their composition.
- **Note on severity:** Low rather than Medium because the direction is conservative overall (fewer sets) and an experienced trainee will interpret it sensibly. It is a coherence and explanation problem, not a safety one.
- **Recommended correction:** A product decision. Either (a) readiness suppresses a load increase for that day and holds the previous load, or (b) the explanation explicitly states "the planned load increase stands; effort target is advisory today." Do not implement until the owner chooses (§12, Q1).

### Finding 6 — `plannedLightSession` has no application call site

- **Severity:** Low | **Confidence:** High | **Status:** Confirmed
- **Files:** `prescription-engine.js:4258`
- **Observed:** `plannedLightSession` appears only in the engine. No `app-*.js` or `index.html` reference exists. The sole production route to `light_session` is `mesocycleType === MESOCYCLE_TYPES.LOWER_FATIGUE`.
- **Why it matters:** `DECISION_ENGINE.md` and `PROJECT.md` describe "programmed light session" as a first-class intervention distinct from deload. In practice it is reachable only by choosing a lower-fatigue mesocycle — there is no per-session light-day concept. The documentation implies a capability the UI does not expose.
- **Recommended correction:** Either expose it, or document that light sessions are a mesocycle-level property only.

### Finding 7 — Resting-heart-rate threshold disagrees with documentation

- **Severity:** Low | **Confidence:** High (executed) | **Status:** Confirmed
- **Files:** `prescription-engine.js:1450` — `if (rhrRatio !== null && rhrRatio > 1.07)`
- **Product requirement:** `DECISION_ENGINE.md:77` — "resting heart rate above 108% of baseline"
- **Observed:** RHR at exactly 108% of baseline triggers the signal (1.08 > 1.07). RHR at 107% does not. The trigger band is 107.1%+, not 108%+.
- **Why it matters:** Small, but this is a documented numeric threshold in a document whose stated purpose is that thresholds never drift from code. It is the kind of divergence the living-document rule exists to prevent.
- **Recommended correction:** Change the constant to `1.08` or the documentation to "above 107%". Prefer whichever was intended; the code comment history does not say.

### Finding 8 — Sibling deload parameters take different shapes with no validation

- **Severity:** Low | **Confidence:** High (executed) | **Status:** Confirmed (robustness, not a live defect)
- **Files:** `prescription-engine.js:3084` vs `:3086-3093`
- **Observed:** `muscleExerciseHistories` accepts a flat array of histories. `programMuscleHistories` requires an array of *arrays* of histories (or `[{history: [...]}]`). Passing the flat shape to `programMuscleHistories` yields `degradedMuscleGroupCount: 0` silently — full-program deload becomes unreachable with no error.
- **Verified not a live defect:** `app-foundation.js:1586` passes `Array.from(byMuscle.values())`, which is the correct nested shape. Full-program deload does fire in production. I initially suspected a Critical defect here and disproved it.
- **Why it matters:** A silent-failure trap for future callers, on the one intervention whose absence is hardest to notice.
- **Recommended correction:** Normalize both parameters through one shape-tolerant helper, or throw on an ambiguous shape.

---

## 11. Required test plan

Existing engine tests (`test-prescription-engine.js`, the nine `test-recommendation-*` harnesses) do execute real code and are considerably better than the app-layer tests criticized in Stage 1. The gaps below are behavioral, not stylistic.

| # | Test | Fixture | Expected | Guards |
| --- | --- | --- | --- | --- |
| T1 | Rep-loss baseline | 3 qualifying, last = `[20,9,9]` @ RPE 8, range 6–12 | **Not** `increase_load` | Finding 1 |
| T2 | Rep-loss boundary | last = `[12,9,9]` vs `[12,8,8]` | progress vs add_one_rep | Finding 1 regression |
| T3 | Severe single domain | HRV 0.78 + RHR 1.15, all else normal | adjustment applied | Finding 2 |
| T4 | Mild single domain | sleep 7.5 h vs 8 h baseline | no adjustment | Finding 2 regression |
| T5 | Light + readiness | light session + 2 adverse domains | `readinessAdjustment.changed === false` | Finding 3 |
| T6 | Deload + readiness | exercise deload + 2 adverse domains | `changed === false` + supersession text | Locks in correct behavior |
| T7 | Surface projection | one snapshot → all 7 surfaces | deep-equal prescriptions | Finding 4 |
| T8 | Confirmation reset | 3 exposures, middle incomplete | `hold_for_confirmation`, `observedQualifyingExposures === 1` | Locks in correct behavior |
| T9 | Deload tier precedence | full > muscle > exercise > light > readiness, correct nested shape | each tier wins over lower tiers | Findings 3, 8 |
| T10 | Full-program shape tolerance | flat and nested `programMuscleHistories` | identical result, or explicit throw | Finding 8 |
| T11 | Prescribed-reduction exclusion | deload week then normal week | deload week absent from progression evidence | Locks in correct behavior |
| T12 | Return-after-gap boundary | 56 vs 57 days elapsed | 56 = normal, 57 = conservative restart | Boundary unverified |
| T13 | Load × RPE composition | progression `increase_load` + 2 adverse domains | matches whatever §12 Q1 decides | Finding 5 |
| T14 | RHR threshold | 1.07, 1.075, 1.08 | matches documented band | Finding 7 |
| T15 | Cross-screen matrix | 15 athlete states × 9 surfaces | identical type/load/reps/sets/RPE/explanation | Deferred Step 10 |

---

## 12. Remediation roadmap

**Immediate — contradiction fixes** (no product decision needed)

| Item | Scope | Complexity | Files | Validation |
| --- | --- | --- | --- | --- |
| Finding 1 — rep-loss baseline | 3 lines | Low | `prescription-engine.js:2916-2919` | T1, T2 + full `test-recommendation-*` regression |
| Finding 3 — light-session suppression | 1 line | Low | `prescription-engine.js:4410` | T5, T6, T9 |
| Finding 7 — RHR constant | 1 char or 1 doc word | Trivial | `:1450` or `DECISION_ENGINE.md:77` | T14 |

**Core logic — requires a product decision first**

| Item | Scope | Dependencies | Complexity | Validation |
| --- | --- | --- | --- | --- |
| Finding 2 — severity in gate | `evaluateReadiness` gate | §12 Q2 | Low–Medium | T3, T4 |
| Finding 5 — load × RPE composition | `finalPrescription` assembly + explanation copy | §12 Q1 | Medium | T13 |

**Centralization / architecture**

| Item | Scope | Complexity | Validation |
| --- | --- | --- | --- |
| Finding 4 — route surfaces through `recommendationForSurface` | 9 app read sites | Medium | T7 + cross-screen matrix |
| Finding 8 — normalize deload history shapes | `assessDeloadNeed` | Low | T10 |
| Audit the 9 `basePrescription` reads in `app-views.js` | Investigation | Low | Part of T15 |

**Test strengthening:** T1–T14 before any refactor; T15 (cross-screen matrix) as the exit gate for the deferred Step 10.

**Explanation and usability:** round e1RM to the equipment increment; state the light-session/readiness rule in user copy; align `DECISION_ENGINE.md` with Findings 1, 3, 5, 7.

**Longer-term scientific model:** calibrate or de-precision the 0.82 redundancy threshold; revisit whether the 56-day return cliff should be a ramp.

---

## 13. Product-owner decisions required

1. **When a confirmed progression coincides with poor readiness, does the load increase stand?** Options: (a) hold the previous load for the day, (b) proceed and mark the effort target advisory, (c) status quo. Blocks Finding 5.
2. **Should one maximally-severe readiness domain trigger an adjustment, or is multi-domain corroboration deliberately required?** The current code requires two domains; the current severity model implies otherwise. Blocks Finding 2.
3. **Should a planned light session be reducible further by readiness?** Blocks Finding 3's preferred fix (though the consistency argument favors suppression regardless).
4. **Should per-session light days exist as a user-facing concept**, or is a lower-fatigue mesocycle the only intended route? Blocks Finding 6.
5. **Carried from Stage 1, still open:** user-facing PR taxonomy; whether an authoritative rules document exists outside the repository.

---

## 14. Completion statement

This stage demonstrates that **the same athlete state produces one recommendation object throughout the engine**, created at a single point, immutable once stored, and consumed rather than recomputed by every application surface. That core is sound.

It also demonstrates **three confirmed composition defects** (Findings 1–3) where independently-correct rules combine into an incoherent prescription, and **one assurance gap** (Finding 4) where the mechanism that would guarantee cross-surface identity is not the mechanism in use.

The stage does **not** demonstrate cross-screen presentation consistency, volume/hypertrophy correctness, or mesocycle generation correctness. Those remain open, and the score reflects that rather than concealing it.

No production code was modified. Review harnesses were written to the session scratchpad, not the repository.
