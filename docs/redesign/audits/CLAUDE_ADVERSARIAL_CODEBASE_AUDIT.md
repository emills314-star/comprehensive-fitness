# Claude Adversarial Codebase Audit

> **Product:** Comprehensive Fitness
> **Checkpoint:** Phase 1 adversarial codebase audit
> **Reviewer:** Claude Code — independent, advisory
> **Mode:** Read-only. No application code, schema, test, configuration, generated output, `AGENTS.md`, or `CLAUDE.md` was changed.
> **Last verified:** 2026-07-30
> **Revision audited:** `codex/chromium-ui-repair` @ `fe85e66`
> **Status:** ADVISORY — Codex adjudicates. No finding here is a product decision.
> **Related:** [`../README.md`](../README.md), [`../STATUS.md`](../STATUS.md), [`../DECISION_LOG.md`](../DECISION_LOG.md), [`CLAUDE_CODEBASE_AUDIT_REQUEST.md`](CLAUDE_CODEBASE_AUDIT_REQUEST.md), [`../phase-1/`](../phase-1/)

## 0. Scope and read-only confirmation

Verified read-only at audit start:

- `git rev-parse --show-toplevel` → `C:/Users/Erik Mills/Documents/Comprehensive Fitness` — matches the packet.
- `git status --short --branch` → `## codex/chromium-ui-repair...origin/codex/chromium-ui-repair`, untracked `.claude/`, `.vercel/`, `docs/redesign/`, `redesign/prompts/` — **identical to the packet. No difference to report.**
- `HEAD` = `fe85e66` ("Match app aesthetics to M-series mockups").

Read in full: `CLAUDE.md`, `AGENTS.md`, `docs/redesign/README.md`, `docs/redesign/STATUS.md`, `docs/redesign/DECISION_LOG.md`, all four `docs/redesign/phase-1/` files, `docs/redesign/audits/CLAUDE_CODEBASE_AUDIT_REQUEST.md`. Current-state evidence read directly from source: `index.html`, the eight ordered runtime segments, `prescription-engine.js`, `guided-mesocycle.js`, `backup-contract.js`, `sw.js`, `package.json`, `schemas/`, `scripts/test-*.js`, `tests/ui/`, `docs/UI_UX.md`.

No private personal-health records, secrets, or environment values appear anywhere in this report.

---

## 1. Executive verdict

**The Phase 1 product direction is correct and is supported — not contradicted — by the repository. Three of its stated premises are not.**

The code confirms the diagnosis. Today (`app-views.js:480`) is not a start screen; it is an analysis dashboard that runs the full prescription engine for every exercise of every template plus a six-week hypertrophy score before the user taps anything. Starting a workout opens a mandatory modal (`app-views.js:838`). Every live exercise renders a claim card plus three disclosures including a confidence panel showing evidence weights and `Exercise score /100` (`app-views.js:2012-2030`). Equipment metadata can hard-block an exercise (`app-foundation.js:1904-1905`). Phase 1 is describing a real product, and the deletions it proposes are real deletions.

Three Phase 1 premises are, however, **not supported by repository evidence** and should not be carried into the final specification unchallenged:

1. **"Multiple recommendation sources of truth" (Disposition H, DATA-13) is mostly false.** `unifiedPrescriptionSnapshot` (`app-foundation.js:1705`) is the single engine entry point; `legacyRecommendationFromSnapshot` (`:2025`) and `legacyTargetFromSnapshot` (`:2069`) are pure **projections** of it, not competing producers. There is exactly **one** genuine second progression engine (`recommendForExerciseWeek`, `app-foundation.js:3206-3294`) and **one** genuine independent rule set (`fatigueFlags` thresholds, `app-import.js:311-337`). Scoping the work as "collapse many engines into one" mis-frames the milestone: the projections are cheap to delete and the two real duplicates are cheap to identify. The expensive, unnamed work is **flag arbitration**, which Phase 1 assumes exists and which does not.
2. **The RPE input regression (INPUT-04/05, Scenario D) appears already fixed.** `set-rpe` is in `isNumericEditAction` (`app.js:3`), `focusin` calls `target.select()` and arms `replaceOnNextInput` (`app.js:660-664`), and the field is `type="number" step="0.5"` (`app-views.js:1864`). Building a redesign around a defect the code says is closed risks shipping the same experience and declaring victory. The residual friction is somewhere else and must be located on a device before it becomes an acceptance criterion.
3. **"Preserve all history" (Disposition F, PROGRESS-13) is already implemented.** The six-month window is a *filter*, not a deletion: `activeCompletedWorkoutHistory` (`app-foundation.js:389-397`) selects, and older sessions remain in `data.sessions` and are surfaced in the "Retention archive" disclosure (`app-analysis.js:236`). This disposition costs nothing and should be reclassified from SIMPLIFY to already-satisfied so it consumes no migration budget.

**The larger objection is that Phase 1 undercounts the deletion surface.** It scopes its cuts to product features and never mentions: `index.html` at 5,199 lines with the entire stylesheet inline; `prescription-engine.js` at 6,100 lines / 408 KB precached in the service-worker app shell (`sw.js:17`); `react` and `react-dom` in production `dependencies` (`package.json:71-72`) for a non-shipping concept gallery; and a duplicated `www/` tree of 40 tracked files that doubles every deletion into two edits. A redesign that removes the mesocycle builder but keeps those has not made the codebase simpler — it has made it smaller in the one place users could see, and unchanged everywhere maintenance actually happens.

**Verdict: proceed with Phase 1's direction. Revise premises 1–3 before writing the final specification. Add the four structural deletions in §6. Treat flag arbitration (§7, O-1) as the critical path, not the navigation change.**

---

## 2. Corrected current-system map and sources of truth

The packet's orientation map is broadly accurate. Corrections and additions, all verified:

| Concern | Owner (verified) | Correction to packet |
| --- | --- | --- |
| Bottom navigation | `app-views.js:37-42`, ids at `app-foundation.js:70` | **Four** destinations: `today`, `plan`, `progress`, `more`. Confirmed. |
| Destination dispatch | `app-views.js:229-234` (`renderView`) | Progress has a **further three sub-destinations** (`overview`/`lifts`/`history`, `app-views.js:280-282`). Effective destination count is **6**, not 4. |
| Today | `app-views.js:480-500` (`renderLiftHome`) | Also renders `hypertrophyAnalysis(0,"overall","")` (`:481`) and `renderQuickStartTemplates` (`:796`), which calls `cachedTemplateAdvice` for **every** template. |
| Start flow | `app-views.js:823-840` → `renderTemplateStartSheet` `:980-1074` → `app-workout.js:1286` (`startTemplate`) | Four modal steps exist: `active-conflict`, `confirm`, `readiness` ("step 1 of 2"), `review` ("step 2 of 2"). |
| Recommendation production | `app-foundation.js:1705` (`unifiedPrescriptionSnapshot`) → `prescriptionEngine.prescribeExercise` (`:1894`) | Single producer. **Fallback producer** at `:3206` (`recommendForExerciseWeek`) reached via `coachRecommendationForExercise` `:3320` when the snapshot is unusable. |
| Recommendation projection | `app-foundation.js:2025` (legacy recommendation), `:2069` (legacy target), `:2167` (`unifiedTargetContext`) | Projections, not sources. Correct to keep in the "adapter" column. |
| Recommendation presentation | `app-views.js:1989-2114`, `app-analysis.js:1723-1771` | **Two** presentation paths in `renderPrescriptionDetails` (`:2093`): snapshot path `:2094` and a legacy `exercise.prescription` path `:2095-2113`. |
| Fatigue / plateau flags | `app-import.js:311-369` (`fatigueFlags`) | **Independent thresholds** (≥2 missed sets; avg RPE ≥ 9.2; >7% e1RM decline) computed from `summarizeExerciseByWeek`, then *decorated* with an engine snapshot at `:338-366`. Weekly and retrospective, not session-scoped. |
| Readiness → session advice | `app-import.js:375-452` (`recoveryRecommendationForSession`, `adjustTargetForRecovery`) | A **third** flag producer, session-scoped. |
| Safety blocking | `app-foundation.js:819-895` (`workoutMutationSafetyDecision`, `guardWorkoutMutation`) | Fail-closed gate on `add-set`, `toggle-set`, `start-timer`, etc. Also enforces the equipment block via `executionBlocked` at `:833-841`. |
| Workout grade | `app-history.js:186-290` | 30 pts progression / 25 execution / 20 RPE / 15 completion / 10 fatigue. |
| Hypertrophy score | `app-analysis.js:838` (`calculateHypertrophyScore`), `:1133`, `:1515`, `:1535` | Rendered on **Today** (`app-views.js:498`) and on Progress → Lifts (`app-analysis.js:1695`). |
| Weekly volume dashboard | `app-views.js:593-655`, `app-import.js:211-288` | Is the **default** Progress view, not a separate destination. Direct/fractional set math is visible at `app-views.js:698`, `:700`, `:750`. |
| Mesocycle | `app-views.js:2209-2725`, `guided-mesocycle.js`, `prescription-engine.js` (107 refs), `schemas/guided-mesocycle.v1.schema.json`, `schemas/mesocycle-plan.v1.schema.json`, `backup-contract.js:17,83,104-107` | Reachable from Plan (`app-analysis.js:8`, `:25`, `:26`). 126 references in `app-views.js` alone. |
| Persistence | `app-foundation.js:1-12` (keys), `:2283-2332` (active draft), `:542-638` (`migrateDomainData`) | IndexedDB `comprehensive-fitness`/`state`; `DOMAIN_MIGRATION_VERSION = 3`; separate `active-workout-draft` record plus localStorage mirror. |
| Generated package | `www/` — 40 tracked files, byte-identical to root at HEAD | Every runtime deletion is two edits plus `npm run sync:web`. |

**Authoritative sources of truth, ranked by what actually governs runtime behavior:**

1. `prescription-engine.js` — owns rep ranges, RPE targets, load, set structure, deload state, confidence, evidence summaries.
2. Per-exercise `recommendationSnapshot` frozen into the session at `app-workout.js:1347` — immutable once submitted (`app-foundation.js:1774-1779`).
3. `data.settings` — including `availableEquipment` (`app-foundation.js:42`), which silently becomes a hard constraint.
4. `templates[].exercises[]` — owns rep range **only when `standardWorkloadOverride === true`** (`app-foundation.js:3672`). This is the single most consequential fact in the audit; see O-2.

---

## 3. Proposal-to-code matrix

Status labels per `AGENTS.md`. "Smallest resolution" is the minimum credible change, not a full estimate.

### A. Starting and navigating

| Phase 1 disposition | Current state | Evidence | Verdict |
| --- | --- | --- | --- |
| Today → SIMPLIFY to one workout plus Start | Today renders a per-exercise plan/last/delta table with confidence meters, a "Why N lifts hold" callout, a coach-lead card, a quick-start strip over all templates, and a "Program pulse" hypertrophy score | `app-views.js:480-500`, `:445-478`, `:796-821` | **IMPLEMENTED as the opposite.** Deletable; `renderLiftHome` is 20 lines calling five renderers. Low cost, high yield. |
| Start-workout confirmation modal → DELETE | `openTemplateStart` always sets `step:"confirm"` | `app-views.js:838` | **IMPLEMENTED.** Deleting the `confirm` step is a one-line change; `active-conflict` must survive — the "prevent second workout → SIMPLIFY" row is already satisfied at `:984-1004` with Return / Discard / Cancel. |
| Readiness choice modal → DELETE | Two-step readiness sheet with sleep, sleep quality, soreness, HRV, resting HR, nutrition, protein, illness, pain, affected area, note | `app-views.js:1027-1051` | **IMPLEMENTED.** The *fields* map cleanly onto Phase 1 §6.2's optional sheet. Do not delete `cleanRecovery` / `patchRecovery` — only the mandatory placement. |
| Persistent Routines/Templates tab → DELETE | `plan` is a permanent nav destination | `app-views.js:39`, `app-foundation.js:70` | **IMPLEMENTED.** Deleting the tab is trivial; deleting what lives behind it is not. See O-4. |
| Permanent Dashboard → DELETE | There is no `dashboard` tab; the dashboard is `progressView === "overview"`, the **default** Progress view | `app-views.js:274`, `:593-655` | **PARTIALLY IMPLEMENTED — packet correction.** Phase 1 (IA-06) and the packet both describe a separate dashboard destination. There isn't one. The fix is changing the Progress default view and deleting `renderProgressOverview`, not removing a tab. |
| Resume active workout → KEEP | Draft persisted to IndexedDB plus localStorage; restored on boot | `app-foundation.js:2283-2326` | **IMPLEMENTED.** Satisfies START-10 / DATA-07 / Scenario F at the persistence layer. Device verification still required. |

### B. Readiness and exception detection

| Phase 1 disposition | Current state | Evidence | Verdict |
| --- | --- | --- | --- |
| General readiness score → DELETE | `recoveryRecommendationForSession` returns `{decision, label, action, score, evidence}`; the review sheet shows trigger labels and per-lift deltas, not a bare score | `app-import.js:375-452`, `app-views.js:1055-1071` | **PARTIALLY IMPLEMENTED.** `score` is internal already. Low cost. |
| Muscle / exercise fatigue, plateau, deload detection → KEEP | Three producers with three vocabularies (see §2) | `app-import.js:311-337`; `app-foundation.js:1705`; `app-import.js:375` | **NEEDS REVIEW.** This is the real work. See O-1. |
| Flag severity / confidence matrices → HIDE | Confidence is rendered in **six** places: Today rows (`app-views.js:461`), start modal (`:1016`), exercise chip (`:1723-1726`), recommendation head (`:1997`), confidence disclosure with evidence weights and `Exercise score /100` (`:2012-2030`), set-level meter (`:1877`) | as cited | **IMPLEMENTED as user-facing.** DELETE-14 and FLAG-11 currently fail in six locations. |
| Recommendation evidence citations → DELETE | `renderEvidenceSection` renders `prescription.evidenceSummary` as a counted `<details>` list, plus "History and high watermark" and "What would change this" | `app-views.js:2033-2048` | **IMPLEMENTED.** Deleting the *view* is easy; `evidenceSummary` must remain on the persisted snapshot for historical sessions (§8, D-3). |
| Multiple simultaneous recommendation cards → DELETE | One card per exercise, but each expands to three disclosures | `app-views.js:2051-2090` | **PARTIALLY IMPLEMENTED.** The card count is already 1; the *content* is the violation. |
| Research database visible in the app → DELETE | `research_database/` is loaded as prescription evidence (`loadPrescriptionEvidence`, `app-foundation.js:1248`), not browsable as a library | — | **NOT IMPLEMENTED as a user feature.** Phase 1 lists a feature that may not exist as a screen. Confirm before scheduling its deletion. See O-9. |

### C. Normal progression and targets

| Phase 1 disposition | Current state | Evidence | Verdict |
| --- | --- | --- | --- |
| Template-defined rep range → KEEP (variant owns it) | The engine's `repRange` wins **by default**. The template's `repMin`/`repMax` are applied only when `standardWorkloadOverride === true` | `app-foundation.js:3671-3691` | **IMPLEMENTED as the opposite.** See O-2 — the highest-severity finding. |
| Automatic rep-range rewriting → DELETE | Same as above, plus RPE shifted per set role at `app-workout.js:1340-1345` | as cited | **IMPLEMENTED.** Smallest resolution: invert the `standardWorkloadOverride` default. |
| Normal per-exercise recommendation paragraphs → DELETE | `renderPrescriptionDetails` runs for every exercise unconditionally | `app-views.js:1739`, `:2093` | **IMPLEMENTED.** |
| Add-set recommendation → DELETE | `setAdjustment` and `workingSets.target` flow into set generation | `app-foundation.js:2052`, `app-workout.js:1358-1360` | **PARTIALLY IMPLEMENTED.** Set *count* comes from the engine, not only from the template. Satisfying DELETE-04 requires the same fix as O-2. |
| Hold recommendation → DELETE | `recommendationActionLabel` renders a title for `hold`/`normal` states | `app-foundation.js:1934`, `app-views.js:1996` | **IMPLEMENTED.** Cheap. |
| Lower-RPE recommendation → KEEP inside a flag | Exists as `interventionType: "light"` with `rpeTarget` | `app-foundation.js:3358-3367`, `app-import.js:453` | **IMPLEMENTED.** Preserve. |

### D. Live workout and set logging

| Phase 1 disposition | Current state | Evidence | Verdict |
| --- | --- | --- | --- |
| Weight / rep / RPE entry → KEEP, fast | Number inputs with select-on-focus and `replaceOnNextInput`; RPE `step="0.5"` | `app-views.js:1860`, `:1864`; `app.js:3`, `:99-102`, `:660-664` | **IMPLEMENTED.** INPUT-04/05/06 and Scenario D appear already satisfied. Premise challenge — see O-6. |
| Previous-set performance → KEEP in the set row | Rendered as a `Previous` field, linked to the source session | `app-views.js:1808-1812`, `:1792` | **IMPLEMENTED.** Preserve `previousComparableSetForRole` (`app-analysis.js:416`) — role-aware matching is what makes this trustworthy. |
| Equipment-availability blocking → DELETE | Engine throws on equipment incompatibility → `hardConstraintRejection("unavailable_equipment")` → `executionBlocked` → "Exercise unavailable" card **and** disabled Add set / Complete / Timer buttons | `app-foundation.js:1904-1905`, `:1913-1914`, `:833-841`, `:891-895`; `app-views.js:2097-2099`, `app-analysis.js:1729` | **IMPLEMENTED as a hard gate.** OVERRIDE-02 / DELETE-12 currently fail. Mitigating fact: default is `["all"]` when unset (`app-foundation.js:1860`), so the block only fires once equipment is configured. |
| Working-set classification → HIDE | Inferred by `classifyImportedExerciseSets` (`app-foundation.js:442`) and migrated at `:556`, but a per-set `Set type` `<select>` is exposed in the live workout | `app-views.js:1880` | **PARTIALLY IMPLEMENTED.** Inference exists; SET-09 passes (not mandatory); SET-10's *correction* control is over-exposed. Move behind an inference-was-wrong affordance. |
| Rest timer → KEEP | `startTimer` / `completeTimer` plus `rest-completion-controller.js` and push scheduling | `app-sync.js:874-1066`, `:351-561` | **IMPLEMENTED.** Do not touch during the redesign. |

### E. Overrides, grading, and completion

| Phase 1 disposition | Current state | Evidence | Verdict |
| --- | --- | --- | --- |
| Grade based on adherence → DELETE | 55 of 100 points are adherence-derived: execution 25 (`planExecutionRatio`, `rangeCompliance`), completion 15 (`completedSets/plannedSets`), RPE 20 (within one point of target) | `app-history.js:196-204`, `:214-220` | **IMPLEMENTED.** OVERRIDE-10 and COMPLETE-07 fail today. **Partial credit:** readiness/deload intent is already handled (`intentAdherence`, `:222-225`) and deliberate one-offs are already excluded (`oneOffCount`, `:194-195`). Do not rebuild the grade — rebalance it. |
| Hypertrophy score → DELETE | Rendered on Today and Progress → Lifts, with a full accounting detail panel | `app-views.js:498`, `app-analysis.js:1535`, `:1515-1533`, `:1695` | **IMPLEMENTED.** `scripts/test-hypertrophy-score.js` and `tests/ui/analytics-settings-lifecycles.spec.js:204,239` must be retired with it. |
| PR summary page → DELETE | PRs render *inside* the completion summary via `workoutAchievementBadges`; no separate route exists in `renderView` | `app-history.js:553-654`, `:661-664`; `app-views.js:229-234` | **NOT IMPLEMENTED as a separate page — ASSUMPTION.** Likely already satisfied. Confirm before scheduling. |
| Completion summary → KEEP, concise | Currently grade hero, confidence meter, per-exercise diff, achievement badges, **category breakdown (5 rows with earned/possible bars)**, highlights, retrospective review | `app-history.js:679-688` | **IMPLEMENTED as a dashboard dump.** COMPLETE-06 (≤3 reasons) and COMPLETE-15 fail. The category breakdown is the largest cut. |

### F. Progress, history, and analytics

| Phase 1 disposition | Current state | Evidence | Verdict |
| --- | --- | --- | --- |
| Weekly muscle-volume dashboard → DELETE | Default Progress view | `app-views.js:274`, `:593-655` | **IMPLEMENTED.** PROGRESS-11 fails. |
| Direct/fractional-set display → DELETE | Rendered as "Direct Sets" / "Fractional Contribution" and per-exercise `N direct · M indirect` | `app-views.js:698`, `:700`, `:750` | **IMPLEMENTED.** DELETE-08 fails. |
| Six-month active retention → SIMPLIFY (preserve all) | Already a filter, not a deletion; archive is reachable | `app-foundation.js:389-397`; `app-analysis.js:236` | **ALREADY SATISFIED.** Reclassify. |
| Six qualifying weeks control → HIDE | `hypertrophyWindowOptions` / `hypertrophyWindowOffset` are user-visible period controls | `app-analysis.js:1086`, `:1578`, `:1643` | **IMPLEMENTED as user-facing.** DELETE-15 fails. Dies with the hypertrophy score. |
| Archived historical mesocycles → DELETE | `renderHistoricalMesocycles` renders a lifecycle timeline with Archive / Review outcomes / Delete | `app-views.js:2714-2725` | **IMPLEMENTED.** |

### G. Routines, templates, and mesocycles

| Phase 1 disposition | Current state | Evidence | Verdict |
| --- | --- | --- | --- |
| Mesocycle generator, modular builder, Guide/Setup/Build/Check/Create → DELETE | Five-step builder with progress nav, candidate pool, portfolio, equipment chips, muscle scope, viability score `N/100`, template review | `app-views.js:2663-2711`; steps in `guided-mesocycle.js`; `renderMesocyclePlanner` `:2708` | **IMPLEMENTED.** 126 refs in `app-views.js`, 32 in `app-foundation.js`, 107 in `prescription-engine.js`, plus two schemas, `backup-contract.js:17,83,104-107`, and `tests/ui/guided-planner-entry-regression.spec.js`. **The largest single deletion in the redesign, and it is not a UI deletion.** See §8 D-1 and O-4. |
| Equipment-filter setup → DELETE | Equipment chips in builder setup **and** `data.settings.availableEquipment` written from two places | `app-views.js:2684`, `app.js:249`, `:591` | **IMPLEMENTED.** The setting outlives the builder — deleting the builder does not remove the block. See O-3. |

### H. Data, imports, settings, and quality systems

| Phase 1 disposition | Current state | Evidence | Verdict |
| --- | --- | --- | --- |
| Multiple recommendation sources → DELETE | One engine, two projections, one fallback engine, one independent flag rule set | `app-foundation.js:1705`, `:2025`, `:2069`, `:3206`; `app-import.js:311` | **CONTESTED — see §1 premise 1, O-1, R-1.** |
| Strong import and warm-up inference → KEEP / HIDE | `importStrongCsv` (`app-import.js:671`), `classifyImportedExerciseSets` (`app-foundation.js:442`), audit trail in `migrationAudit` | as cited | **IMPLEMENTED.** Preserve intact. |
| Data export → KEEP | `exportData` (`app-import.js:2`) via `backup-contract.js` | — | **IMPLEMENTED.** |
| Feature flags hiding deleted systems → SIMPLIFY | No permanent feature-flag system found; `guidedMesocycleView` / `hypertrophyScoreExpanded` are transient view state | `app-foundation.js:274`, `app-views.js:2709` | **NOT IMPLEMENTED — no debt here.** |

---

## 4. Hidden-complexity and duplicate-source findings

**H-1 — `www/` doubles every deletion.** 40 tracked files, byte-identical to root at HEAD (verified by `cmp` on `app-views.js`, `app-foundation.js`, `sw.js`, `index.html`, `prescription-engine.js`). Every Phase 1 deletion is two file edits plus `npm run sync:web`, and a missed sync ships a stale engine to the installed PWA behind a fresh UI. `CLAUDE.md` already warns about this; Phase 1 does not budget for it.

**H-2 — Deleting a *view* does not delete its *state*.** `data.settings.availableEquipment` is written from `app.js:249` (chip toggle) and `app.js:591` (mesocycle equipment field), persisted, validated on import (`app-import.js:1076`), and read as a hard constraint at `app-foundation.js:1858-1860`. Removing the builder removes the writers but leaves any already-persisted value **still blocking exercises**, with no UI left to clear it. This is precisely the "complexity hidden rather than deleted" failure mode Phase 1 §6.12 warns about — and Phase 1's own plan would cause it.

**H-3 — Today executes the whole engine before the user taps anything.** `renderLiftHome` (`app-views.js:480-499`) calls `hypertrophyAnalysis` over six qualifying weeks (`:481`), `todayPlanPreview` → `cachedTemplateAdvice` → `recommendForTemplate` → `coachTargetForTemplateExercise` **per exercise** (`app-foundation.js:3859-3863`), and `renderQuickStartTemplates` → `cachedTemplateAdvice` for **every** template (`app-views.js:809`). Phase 1's one-tap Today is not only a layout change; it is a large reduction in work-before-first-paint. This is an unclaimed benefit and should be stated as one, so a "just hide the cards" implementation does not silently forfeit it.

**H-4 — Two live recommendation *presentation* paths.** `renderPrescriptionDetails` (`app-views.js:2093`) branches on `exercise.recommendationSnapshot`: modern path at `:2094`, legacy `exercise.prescription` path at `:2095-2113` with its own "Legacy confidence:" string and its own rationale splitter on the literal `"Why these levers:"`. Any redesign that only edits the modern path leaves the legacy renderer live for older or fallback sessions.

**H-5 — Confidence is a design-system primitive, not a feature.** `data-conf` levels 1–4 are asserted in the shipped stylesheet by `scripts/test-evidence-claim-ui.js:47-49` (`.claim-card[data-conf="N"]`, `.meter[data-conf="N"]`) and are used by the *hypertrophy* card (`app-analysis.js:1553`), the *grade* card (`app-history.js:677`), the *guided* assignments (`app-views.js:2271`), and the *deload presentation* (`app-analysis.js:241-244`). DELETE-14 cannot be satisfied by deleting a component; it requires deciding, per surface, whether the meter is a confidence display (delete) or an evidence-quality display (keep — e.g. "Recorded deload" vs "Possible deload", which is a *truthfulness* device Phase 1 should not lose).

**H-6 — Tests actively enforce what Phase 1 deletes.** `scripts/test-evidence-claim-ui.js:50-59` requires the unified recommendation card, the counted Evidence disclosure, the `unified-recommendation-grid`, and the `claim-projection-rule` "Next action / Deload status" block. `scripts/test-phase3-core-ui.js:29-31` requires Today to render `todayPlanPreview`. `tests/ui/guided-planner-entry-regression.spec.js` requires the guided builder to open. These are gates in `npm test`. Deletion milestones must retire them in the same commit or the suite blocks the work.

**H-7 — `basePrescription` is retained purely for a diff the redesign deletes.** `renderPrescriptionDetailSection` (`app-views.js:2007`) and `renderEvidenceSection` (`:2042-2045`) exist to show base-vs-today. Phase 1 keeps exactly one legitimate use: FLAG-13 ("temporary adjustment visibly distinguished from the normal target"). Everything else in those two functions is deletable, but `basePrescription` itself must stay on the persisted snapshot.

---

## 5. Indispensable internal capabilities

These must survive regardless of how much UI is deleted. Each is load-bearing for something Phase 1 explicitly keeps.

1. **`unifiedPrescriptionSnapshot` and snapshot immutability** — `app-foundation.js:1705-1792`. The submitted-session branch at `:1774-1779` returns the stored snapshot byte-exact without revalidation, deliberately, so a later engine cannot rewrite history. Phase 1 §16.2 depends on this. Do not "simplify" it.
2. **Role-aware previous-set matching** — `previousComparableSetForRole` (`app-analysis.js:416`), consumed at `app-views.js:1792`. This is what makes "what I did last time" correct rather than merely present. It is Phase 1's Job 2.
3. **Warm-up / working-set inference and its audit trail** — `classifyImportedExerciseSets` (`app-foundation.js:442`), `migrateDomainData` (`:542-638`) writing `classificationSource`, `classificationConfidence`, `originalImportedValue`, `reviewRequired`. DATA-05 and DATA-06 are unachievable without it.
4. **Exercise identity resolution** — `resolveExerciseIdentityProfile` / `performanceExerciseId` / `researchExerciseId` (`app-foundation.js:1407-1488`). DATA-04 ("custom/duplicate exercises are not silently collapsed") and OVERRIDE-08 (independent heavy/light histories) are entirely this code.
5. **Safety fail-closed gate** — `workoutMutationSafetyDecision` (`app-foundation.js:819-859`). Illness and localized-pain blocking, and the "taxonomy unresolved → fail closed" rule at `:853-855`, are the mechanism behind FLAG-16 and Phase 1's pain/illness KEEP. **Warning:** it is also the mechanism behind the equipment block (`:833-841`). Separating those two behaviors is required work, not a byproduct.
6. **Active-workout draft persistence** — `app-foundation.js:2283-2332`, dual-written to IndexedDB and localStorage with a `savedAt` tiebreak at `:2313`. Satisfies Scenario F.
7. **Readiness signal capture** — `cleanRecovery` (`app-foundation.js:734`), `sessionRecovery` (`:2423`), `prescriptionReadiness` (`:1573`). Phase 1 deletes the mandatory *form*, not the *record*; §16 requires readiness deviation history.
8. **Rest completion and push scheduling** — `rest-completion-controller.js`, `app-sync.js:351-561`, `sw.js`. Untouched by Phase 1 and should stay untouched.
9. **Backup contract** — `backup-contract.js`. The only guarantee behind DATA-01 and DATA-09.

---

## 6. Safe deletion opportunities Phase 1 missed

**M-1 — React and Vite are production dependencies for a non-shipping concept gallery.** `package.json:71-72` lists `react` and `react-dom` under `dependencies`; the only consumer is `redesign/src/` (`App.tsx`, `ConceptGallery`, `ConceptPhone`, `DualTrackPrototype`, `FocusedMockups`), reachable only via `npm run redesign:dev`. The shipped app is dependency-light classic scripts. `scripts/test-redesign-contracts.js` asserts "exactly 15 concepts". The concept study has served its purpose; Phase 1 supersedes it as the product decision. Deleting `redesign/`, its four npm scripts, `scripts/test-redesign-contracts.js`, and the React/Vite/TypeScript/`@types` dependencies removes a whole toolchain from a project that ships no bundler output. **This is the single cleanest deletion available and Phase 1 does not mention it.**

**M-2 — `index.html` is 5,199 lines with the entire stylesheet inline.** 324 KB served on every load. Phase 1's UX-01/UX-04/UX-05 work will touch this file heavily; splitting the stylesheet out — and letting the service worker cache it separately — is a prerequisite for doing that work safely, and is itself a simplification.

**M-3 — `prescription-engine.js` is 6,100 lines / 408 KB in the app shell.** `sw.js:17` precaches it on every install. Phase 1 deletes the mesocycle *product*, but `MESOCYCLE_SCHEMA_VERSION`, `MESOCYCLE_TYPES`, `createMesocyclePlan`, `refreshMesocycleProgram`, `buildProgramPortfolio`, `rankExercisePool`, `chooseMesocycleDuration`, `reviewFullProgram`, and `distributePortfolioAcrossSessions` are all in this file (`prescription-engine.js:23,44,2074-2090,3407-3853`). If the builder goes, most of that goes with it and the app shell shrinks materially. Phase 1 should claim this explicitly or it will not happen.

**M-4 — The Progress sub-navigation.** `app-views.js:280-282` gives Progress three tabs (Overview / Lifts / History). With the volume dashboard deleted — Phase 1's own decision — only two remain, and Phase 1 §12 describes a single Progress home with search. The switcher itself should be deleted, not repopulated; otherwise IA-01's "two destinations" is satisfied on paper while the user still navigates six places.

**M-5 — `renderPlateCalculator` and `isBarbellExercise`** (`app-views.js:2116-2151`). Not mentioned anywhere in Phase 1. It infers barbell-ness from the exercise *name* — exactly the kind of implicit taxonomy Phase 1 §6.8 objects to. Either KEEP deliberately (it is genuinely useful and cheap) or delete; leaving it unclassified means it survives by default, which Phase 1 §12 forbids.

**M-6 — `renderExecutionQualityAssessment`** (`app-views.js:1649`) and `executionQualityAssessment: "not_assessed"` on every exercise (`app-workout.js:1347`). An unmentioned per-exercise self-assessment control in the live workout. Falls squarely under "if it makes logging slower it must justify the cost" (§6.1) and is in no Phase 1 disposition.

---

## 7. Ranked objections to Phase 1

### O-1 — CRITICAL: Phase 1 asserts a flag contract that does not exist, and does not schedule building it

FLAG-06, FLAG-05, §9.4, and DATA-13 all assume competing concerns already resolve to one action somewhere in the engine. They do not. Three producers exist with three different scopes, vocabularies, and cadences:

- `fatigueFlags` (`app-import.js:311-337`) — **weekly, retrospective**; thresholds ≥2 missed sets / average RPE ≥ 9.2 / >7% e1RM decline, computed from `summarizeExerciseByWeek`, then decorated with an engine snapshot at `:338-366`.
- `unifiedPrescriptionSnapshot` (`app-foundation.js:1705`) — **per exercise, prospective**; `recommendationType` ∈ {progress, hold, normal, reduce_volume, light_session, exercise_deload, muscle_group_deload, full_program_deload, substitute, rotate_exercise}.
- `recoveryRecommendationForSession` (`app-import.js:375-452`) — **per session**; decision ∈ {rest, deload, light_session, normal}.

There is no arbiter. The only prioritization that exists is `unifiedSnapshotForFatigueFlag`'s local `priority` map (`app-import.js:300`), which ranks snapshots *within one flag*, not across producers. Building the single contract Phase 1 assumes is the largest engineering item in the redesign, and it is invisible in the Phase 1 documents.

*Affects:* FLAG-01, FLAG-05, FLAG-06, FLAG-12, FLAG-15, DATA-12, DATA-13, Scenario B, Scenario E.

*Smallest credible resolution:* Before any UI work, specify one `resolveSessionFlags(session, context) → { sessionFlag | null, exerciseFlags: Map }` contract with an explicit precedence order (pain/illness > deload > readiness > fatigue > plateau), have all three producers feed it, and make every visible flag read only from it. Write its unit tests first — this is the one place where a test-first approach genuinely pays.

### O-2 — CRITICAL: "Never silently rewrite the rep range" requires inverting a default, and Phase 1 does not say so

`prescriptionSnapshotWithTemplateStandard` (`app-foundation.js:3671-3691`) applies the template's `repMin` / `repMax` / `sets` **only when `templateExercise.standardWorkloadOverride === true`**. Absent that opt-in flag, `snapshot.finalPrescription.repRange` from `prescriptionEngine` becomes the set targets (`app-workout.js:1332-1346`, `app-analysis.js:302-321`). This is the mechanism behind the reported experience of the app changing the rep range, and it is the root cause of §6.4, ORIENT-07, DELETE-03, and ROUTINE-05.

*Smallest credible resolution:* Make template-owned rep range and set count the default and the engine's the exception — treat `standardWorkloadOverride` as true unless explicitly false — and route any engine-proposed range change through a visible temporary flag. A small diff with a very large behavioral consequence, and it must land **before** the UI redesign, or the redesign will be evaluated against a still-mutating target.

### O-3 — HIGH: Deleting the equipment UI does not delete the equipment block

Detailed in H-2. `availableEquipment` survives its own UI, remains persisted and import-validated, and continues to produce `hardConstraintRejection("unavailable_equipment")` → `executionBlocked` → disabled Complete / Add-set / Timer controls. OVERRIDE-02 and DELETE-12 would still fail after the builder is deleted.

*Smallest credible resolution:* One migration that clears `settings.availableEquipment`, plus removing `availableEquipment` from the `request` object at `app-foundation.js:1878` so equipment can never again become a prescribing constraint. Keep the field readable for backup compatibility; stop consuming it.

### O-4 — HIGH: The mesocycle deletion is scoped as a UI removal and is not one

126 refs in `app-views.js`, 32 in `app-foundation.js`, 107 in `prescription-engine.js`, 21 in `app-import.js`, 9 in `app-workout.js`, 6 in `backup-contract.js`, plus two JSON schemas, a dedicated UMD module, and a Playwright regression spec. `data.mesocycles` and `activeMesocycleId` are first-class backup keys validated with referential integrity (`backup-contract.js:83,104-107`). `currentMesocycle()` (`app-foundation.js:1597`) feeds `mesocycle` into every prescription request (`:1867`), and the engine reads `currentMesocycleExposures` and `mesocycleType` when scoring (`prescription-engine.js:1376,2086-2090`).

*Smallest credible resolution:* Split into three sequenced deletions — (a) remove the builder UI, its routes and view state; (b) remove `mesocycle` from the prescription request path and delete the planner half of the engine; (c) leave `data.mesocycles` readable and exportable **forever** as an inert array. Do not attempt these as one milestone.

### O-5 — HIGH: The workout grade needs rebalancing, not deletion, and Phase 1 conflates the two

Phase 1 DELETEs "grade based on prescription adherence" while SIMPLIFYing "workout grade". In the code they are the same function. 55 of 100 points are adherence-derived (`app-history.js:196-204`). But the grade already does two things Phase 1 wants: it credits readiness/deload intent instead of penalizing it (`intentAdherence`, `:222-225`, `:247-248`) and it excludes deliberate one-off sets from target comparison (`:194-195`).

*Smallest credible resolution:* Keep `calculateWorkoutAnalysis`. Re-weight so completion is measured against *sets actually undertaken* rather than *sets originally planned*, and let progression, effort, and logging completeness carry the majority. Then cut the completion summary's category breakdown (`app-history.js:685`) to satisfy COMPLETE-06. Rewriting the grade would put DATA-11 and every stored `workoutAnalysis` at risk for no product gain.

### O-6 — MEDIUM: The RPE-input premise is contradicted by the code

`set-rpe` is a numeric edit action (`app.js:3`), `focusin` selects the whole value and arms `replaceOnNextInput` (`app.js:660-664`), and the input is `step="0.5"` (`app-views.js:1864`). INPUT-04, INPUT-05, INPUT-06, and Scenario D read as already satisfied at the source level. Yet Phase 1 §4 elevates this to a headline behavioral driver and §13 makes it a north-star measure.

Either the diagnosis predates the fix, or the residual friction is environmental — iOS Safari's handling of `.select()` on `type="number"`, or the `focusout`-only commit (`app.js:682-694`) losing an edit when a set is completed without blurring, which `releaseSetEntryFocusForCompletion` (`app.js:49`) exists to mitigate.

*Smallest credible resolution:* Reproduce on an actual iPhone before writing the final specification. If it does not reproduce, demote it from north-star measure to a regression test. Do not rebuild the input layer on a stale premise.

### O-7 — MEDIUM: "Two persistent destinations" is measured against the wrong number

IA-01 counts bottom-nav buttons. The user's actual navigation surface is six: four tabs (`app-views.js:37-42`) plus three Progress sub-views (`:280-282`). Deleting `plan` and `more` from the bottom bar while keeping the Progress switcher satisfies IA-01 and changes almost nothing.

*Smallest credible resolution:* Restate IA-01 as "no more than two persistent primary destinations **and** no persistent sub-navigation within them."

### O-8 — MEDIUM: DELETE-16 conflicts with DATA-01 and the immutable-snapshot contract

DELETE-16 requires deleted screens be removed from "routes, state, tests, and current documentation". But submitted sessions carry `recommendationSnapshot`, `basePrescription`, `evidenceSummary`, `programTargetContext`, and `appliedTargetContext` (`app-workout.js:1347`), and the submitted branch of `unifiedPrescriptionSnapshot` (`:1774-1779`) deliberately never revalidates them. Historical sessions will keep referencing concepts whose UI no longer exists.

*Smallest credible resolution:* Amend DELETE-16 to scope "state" to *executable/active* state only, and state explicitly that persisted historical records are exempt. Otherwise the acceptance test and the data-preservation requirement are in direct contradiction and Codex will have to choose silently — which `AGENTS.md` forbids.

### O-9 — LOW: Phase 1 lists at least one feature that may not exist

"Research database visible in the app" (Disposition B) is scheduled for deletion, but `research_database/` appears to be consumed only as prescription evidence (`loadPrescriptionEvidence`, `app-foundation.js:1248`), not exposed as a browsable library. Deleting a non-existent feature is harmless but signals that the disposition list was written partly from memory rather than from the running app. Verify each DELETE row against a live screen before the final disposition is frozen.

---

## 8. Data, schema, migration, backup, and historical-preservation constraints

**D-1 — `data.mesocycles` and `activeMesocycleId` cannot be removed from the backup schema.** `backup-contract.js:17` lists them in `TOP_LEVEL_KEYS`; `:83` enforces unique ids; `:104-107` enforces that `activeMesocycleId` references a real mesocycle. `SUPPORTED_APP_DATA_VERSIONS = new Set([1, 2])` (`:9`). Existing exports contain these keys. **Constraint:** keep both keys accepted and preserved on import forever; stop *writing* them. Removing them from the contract breaks every backup already held.

**D-2 — `DOMAIN_MIGRATION_VERSION = 3` gates a one-way set reclassification.** `migrateDomainData` (`app-foundation.js:542-638`) rewrites `setType`, `isWarmup`, `countsToward*`, and stamps `originalImportedValue` and `classifierVersion`. It runs once (`:544`). Any redesign that changes set semantics must bump to 4 and preserve `originalImportedValue`, or DATA-05 (warm-ups must not become working-set progression records) fails silently and irreversibly.

**D-3 — Submitted snapshots are immutable and must stay readable after the UI that displayed them is gone.** `app-foundation.js:1774-1779` returns stored snapshots byte-exact for submitted sessions. `evidenceSummary`, `confidence`, `personalEvidenceWeight`, `researchEvidenceWeight`, and `exerciseScore` live inside them. Deleting the *renderers* is safe; adding validation that rejects historical shapes is not.

**D-4 — `appDataVersion` is 2 (`app-foundation.js:366`) and `dataRevision` is the conflict token.** `dataRevision` increments in `migrateDomainData:635` and is used for sync conflict recovery. Any migration must increment it exactly once.

**D-5 — The active-workout draft is a second, independently-written store.** `active-workout-draft` in IndexedDB plus `ACTIVE_DRAFT_KEY` in localStorage, reconciled by `savedAt` (`app-foundation.js:2313`). A schema change to sessions/exercises/sets must be applied to the draft restore path at `:2318-2320` or an in-flight workout is corrupted on the first launch after update.

**D-6 — Exercise identity must not be collapsed.** `performanceExerciseId` vs `researchExerciseId` (`app-foundation.js:1407-1488`), plus Strong exact-name indexing at `:2623-2630`. DATA-04 and OVERRIDE-08 depend on these staying distinct. A "simplify exercise identity" refactor would merge Heavy and Light histories irreversibly.

**D-7 — `sw.js` `CACHE_NAME` must advance on every milestone.** Currently `comprehensive-fitness-pwa-v93` (`sw.js:1`). `CLAUDE.md` states this is also the installed-PWA update signal. Every milestone that changes a cross-file runtime contract needs a bump plus `npm run sync:web`; missing it pairs a new UI with a stale cached engine on the installed app.

**D-8 — The retention archive must remain reachable.** `app-analysis.js:236` is currently the only path to sessions older than six months. If the History view is rewritten, this disclosure must be carried forward or PROGRESS-13 regresses from passing to failing.

---

## 9. Documentation conflicts and supersession needs

Confirmed direct conflicts between current living documents and Phase 1. Codex owns the resolution; this audit only identifies them.

| Current document | Statement | Phase 1 requirement | Action needed after adjudication |
| --- | --- | --- | --- |
| `docs/UI_UX.md:202-211` | "the persistent bottom navigation has four destinations (`primaryTabIds`, `render`)", with a table naming Today / Plan / Progress / More | IA-01 (two persistent destinations), IA-02, IA-03 | Supersession or current-state labelling |
| `docs/UI_UX.md:207` | "Plan — Full template list, template cards, mesocycle planner/candidate pools, and readiness start sheet" | IA-05, DELETE-10, DELETE-11, START-07 | Supersession |
| `docs/UI_UX.md:295` | "Mesocycles intentionally remain inside Plan… The guided workflow uses five dependency-ordered steps: Guide, Setup, Build, Check, and Create." | DELETE-10, ROUTINE-06 | Supersession |
| `docs/UI_UX.md:206` | "Readiness is captured before workout start" | START-04, START-07, DELETE-01 | Supersession |
| `docs/UI_UX.md:70`, `:140` | Weekly-volume plan/actual/delta table as an intended design contract | PROGRESS-11, DELETE-07 | Supersession |
| `docs/audits/2026-07-24-.../stage-2-recommendation-and-fitness-logic-audit.md:137` | "the application has one authoritative recommendation source of truth at the engine level" | Disposition H claims multiple sources | **Corroborates this audit's premise-1 challenge.** Reconcile Phase 1, not the docs. |

`docs/ROADMAP.md`, `docs/PROJECT.md`, `docs/DECISION_ENGINE.md`, and `docs/training-prescription-data.md` were sampled by search rather than read end to end; the supersession list above is therefore incomplete. See §12.

---

## 10. Recommended implementation order

No product decisions are made here; this is sequencing only, ordered so that each step is independently verifiable and none depends on a later one.

**Phase A — Truth before appearance (no visible change)**

1. Invert the rep-range / set-count default (O-2). Template owns; engine proposes via flag. Update `scripts/test-set-prescriptions.js` and `scripts/test-exercise-expectations.js`.
2. Stop consuming `availableEquipment` in the prescription request (O-3); migration clears the stored value; keep the field readable.
3. Specify and build `resolveSessionFlags` (O-1) with unit tests, fed by all three existing producers. No UI consumes it yet.

**Phase B — Structural deletions with no product surface (no visible change)**

4. Delete `redesign/`, its four npm scripts, `scripts/test-redesign-contracts.js`, and the React/Vite/TypeScript dependencies (M-1).
5. Extract the stylesheet from `index.html` (M-2); add it to `sw.js` `APP_SHELL`; bump `CACHE_NAME`.

**Phase C — Mesocycle removal, in three steps (O-4)**

6. Remove the builder UI, routes, and view state; retire `tests/ui/guided-planner-entry-regression.spec.js`.
7. Remove `mesocycle` from the prescription request path; delete the planner half of `prescription-engine.js` and `guided-mesocycle.js` (M-3); retire the two mesocycle schemas from active use.
8. Leave `data.mesocycles` / `activeMesocycleId` inert-but-preserved in `backup-contract.js` (D-1).

**Phase D — Presentation deletions**

9. Delete the evidence / confidence / prescription-detail disclosures (`app-views.js:2001-2053`) and the legacy presentation path (`:2095-2113`, H-4). Retire `scripts/test-evidence-claim-ui.js`.
10. Delete the hypertrophy score surfaces (`app-views.js:498`, `app-analysis.js:1515-1556`, `:1695`) and the qualifying-window controls that die with it. Retire `scripts/test-hypertrophy-score.js`.
11. Delete `renderProgressOverview` and the volume / fractional-set detail views; change the Progress default; delete the Progress switcher (M-4).

**Phase E — The new normal path**

12. Rebuild Today: expected workout, Start, Choose another workout, one flag slot reading only from `resolveSessionFlags`. Retire `scripts/test-phase3-core-ui.js`.
13. Delete the `confirm` start step; keep `active-conflict`; move readiness to an optional sheet.
14. Rebalance the grade (O-5) and cut the completion summary to grade plus ≤3 reasons plus ≤3 highlights plus flag.
15. Collapse the bottom navigation to two destinations.

**Phase F — Verification**

16. Device verification on an iPhone-class target for UX-01/03/04/06/13 and O-6.
17. Five-workout field test.

*Rationale for the order:* Phases A–C change no pixels, so any visual regression in Phases D–E is unambiguously attributable. Phase A must precede everything because the redesign cannot be evaluated against targets that still mutate.

---

## 11. Questions requiring Codex adjudication

These cannot be resolved from repository evidence, and each changes what gets built.

**Q-1 (from O-8).** Does DELETE-16 exempt persisted historical records? Repository evidence makes DELETE-16 and DATA-01 mutually unsatisfiable as written. Codex must pick and record it, per `AGENTS.md`'s prohibition on silently resolving code-versus-documentation conflicts.

**Q-2 (from O-1).** What is the precedence order when a session-level deload flag, an exercise-level plateau flag, and a readiness adjustment all fire? Phase 1 §9.4 says "the most consequential action wins" without defining consequence. This must be a table before implementation.

**Q-3 (from O-2).** When the engine's evidence genuinely supports a different rep range than the template's, does it (a) stay silent, (b) surface a progress marker, or (c) raise a flag? Phase 1 §6.4 forbids silent rewriting and §8.5 permits markers, but the two do not resolve this case.

**Q-4 (from O-6).** Does the RPE input defect reproduce on the target device today? If not, what was the actual friction? This determines whether Phase E includes an input-layer rebuild.

**Q-5 (from O-4 / D-1).** Should mesocycle *data* be preserved indefinitely as an inert backup key, or migrated away with an explicit one-time export? Preserving costs a permanent contract clause; migrating risks data that cannot be recovered.

**Q-6 (from H-5).** Which confidence displays are "model certainty" (DELETE-14 applies) and which are "evidence truthfulness" (should survive)? Specifically: does `Recorded deload` (confidence 4) vs `Possible deload` (confidence 2) at `app-analysis.js:241-244` survive? It is the app's main defense against presenting an inference as a fact — deleting it would make the product *less* honest, not simpler.

**Q-7 (from M-5 / M-6).** `renderPlateCalculator` and `renderExecutionQualityAssessment` have no Phase 1 disposition. Per §6.12 nothing survives by default. KEEP or DELETE?

**Q-8 (from O-9).** Is "research database visible in the app" a real current feature? If not, remove the row rather than scheduling a no-op deletion.

---

## 12. Features that should definitely be deleted

High confidence, low risk, clear evidence:

1. **The mesocycle builder, its five steps, candidate pool, portfolio, viability score, and historical lifecycle** — `app-views.js:2209-2725`, `guided-mesocycle.js`. Zero demonstrated use; the largest single complexity source in the view layer.
2. **The research-confidence disclosure with evidence weights and `Exercise score /100`** — `app-views.js:2012-2030`. Numeric model internals presented to a user who has never acted on them.
3. **The evidence-summary disclosure** — `app-views.js:2033-2048`.
4. **The standalone hypertrophy score, everywhere** — `app-views.js:498`, `app-analysis.js:1515-1556`, `:1695`. Overlaps the grade; implies precision it cannot support.
5. **The weekly muscle-volume dashboard and all direct/fractional-set display** — `app-views.js:593-655`, `:691-707`, `:741-754`.
6. **The start-confirmation modal step** — `app-views.js:838`, `:1006-1025`. Keep `active-conflict`; delete `confirm`.
7. **The legacy prescription presentation path** — `app-views.js:2095-2113`.
8. **The React/Vite concept-gallery toolchain** — `redesign/`, `package.json:71-72,80-82,87`, four npm scripts, `scripts/test-redesign-contracts.js`. *(Phase 1 missed this.)*
9. **The Progress sub-navigation switcher** — `app-views.js:280-282`. *(Phase 1 missed this.)*
10. **The completion-summary category breakdown** — `app-history.js:685`.

---

## 13. Capabilities that should remain but become invisible

1. **Prescription generation** — `unifiedPrescriptionSnapshot`. Keep producing snapshots; stop rendering them as coaching. They remain the audit record and the flag substrate.
2. **Confidence and evidence weighting** — `prescriptionEngine.calculateEvidenceWeight`. Use it to decide *whether* a flag surfaces (FLAG-12), never to display a number.
3. **Exercise↔muscle taxonomy and fractional mapping** — `app-import.js:107-196`, `research_database/`. Retain the minimum that makes muscle-scoped fatigue flags reliable; display none of it.
4. **Warm-up / working-set / back-off inference** — `app-foundation.js:399-441`, `:442`. Keep the inference and the `reviewRequired` audit; expose only a correction affordance when the inference is flagged wrong.
5. **Weekly exposure counts** — `weeklyMuscleVolume` (`app-import.js:211`). Needed by `fatigueFlags:328-331`. Keep as an internal input; delete every view.
6. **Readiness signals** — sleep, HRV, resting HR, soreness, nutrition, protein. Keep capture and storage (§16); surface only as a flag action.
7. **Structured adjustment duration and return criteria** — `durationInSessions`, `returnToNormalCriteria` (`app-foundation.js:2060-2061`). Required by FLAG-15; show only inside **Why?**.
8. **Rest-duration history** — produced by the timer at no cost.
9. **Grade internals** — `internalScore` and `categoryScores` (`app-history.js:203-204`). Keep computing; display the letter and at most three reasons.
10. **The safety fail-closed gate** — `app-foundation.js:819-859`, minus its equipment branch.

---

## 14. Phase 1 decisions that should be reconsidered

**R-1 — "Multiple recommendation sources of truth → DELETE" (Disposition H).** Reframe. There is one engine, two projections, one fallback engine (`recommendForExerciseWeek`), and one independent flag rule set. The projections are near-free to delete. The fallback engine (`app-foundation.js:3206-3294` plus the parallel target computation at `:3537-3660`) is roughly 250 lines that fire only when the snapshot is unusable — deleting it means deciding what the app shows when the engine cannot prescribe, which today is a graceful degradation that may be relied on for Strong-imported exercises with no research identity (`strongHistoryFallbackForTemplateExercise`, `:3482-3499`).

**R-2 — "Six-month active retention → SIMPLIFY" (Disposition F).** Already satisfied (`app-foundation.js:389-397`, `app-analysis.js:236`). Reclassify to already-satisfied so it consumes no migration budget and PROGRESS-13 becomes a regression guard rather than new work.

**R-3 — RPE input as a north-star measure (§13, INPUT-05, Scenario D).** Demote pending device reproduction (O-6). The code says it is fixed.

**R-4 — IA-01's destination count (O-7).** Restate to include sub-navigation, or the test passes while the problem remains.

**R-5 — "Grade based on adherence → DELETE" versus "Workout grade → SIMPLIFY" (Disposition E).** These are one function (`app-history.js:207`). State the intended weighting explicitly rather than as two opposing dispositions, and note that intent-adherence and one-off exclusion already exist and should be preserved.

**R-6 — "Exact add-load / add-rep recommendation → DEFER" (Disposition C).** DEFER is the correct call, but note the coupling: `prescribedLoad.target` currently drives set prefill through `legacyTargetFromSnapshot:2116-2130` → `startTemplate`. Deferring the *recommendation* while keeping engine-derived *prefill* would reintroduce silent target mutation under another name — §8.3 puts the prior working set first; the code does not.

**R-7 — DELETE-16 (O-8).** Amend to exempt persisted historical records, or it contradicts DATA-01.

**R-8 — Phase 1 omits any disposition for `index.html`'s inline stylesheet, `prescription-engine.js`'s size, the `www/` duplication, and the React toolchain.** Under §6.12 ("deletion means deletion") and §6.1 ("complexity must justify itself"), these are in scope and are the four largest simplifications available. Add them.

---

## 15. Evidence gaps and external / device / human gates

Stated plainly so this audit is not treated as more complete than it is.

- **No runtime verification.** Every finding is from source reading. The dev server was not started, `npm test` was not run, and the app was not opened. Claims about rendered output are inferences from template literals and should be confirmed by rendering.
- **No device or visual verification.** UX-01 through UX-13, and O-6 in particular, require an iPhone-class device or faithful simulator. `docs/UI_UX.md` and `AGENTS.md` both require this; it did not occur here.
- **`prescription-engine.js` read selectively.** 6,100 lines; the mesocycle, equipment, evidence-weight, and readiness regions were read. Claims about the planner's full extent (M-3) are **ASSUMPTION** pending a complete read.
- **Test suite not executed.** H-6's claim that specific tests block deletions is from reading assertions, not from a failing run.
- **Personal data pipeline not inspected.** `scripts/personal-fitness/` is out of scope by the privacy boundary; `scoring.js` (49 hypertrophy references) and `recommendations.js` (41) may impose additional constraints on the hypertrophy deletion that this audit cannot see.
- **Five-workout field test (Phase 1 §17)** is a human gate that no audit can satisfy.
- **`docs/ROADMAP.md`, `docs/PROJECT.md`, `docs/DECISION_ENGINE.md`, `docs/training-prescription-data.md`** were sampled by search, not read end to end. The supersession list in §9 is therefore incomplete.

---

*End of audit. Advisory only. No application code, schema, test, or configuration was modified, and nothing was committed, pushed, or deployed. Codex adjudicates.*
