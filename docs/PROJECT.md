# Project

## Loaded Bar integration - PARTIALLY IMPLEMENTED locally, 2026-11-03

Loaded Bar active workout, Today, Settings, injury skip and Progress/history deload presentation are **IMPLEMENTED** locally. The coach is wired in shadow only, with its activation gate closed. The owner reports public tests, PWA packaging and privacy checks passing; full Playwright, visual acceptance and device checks remain open. **PLANNED:** Google Health "Last night" and the "outside your normal" bounds flag after calibration. See [Roadmap](ROADMAP.md) for gates and open decisions.

## Per-session coach - product direction accepted 2026-10-31

Erik reset the product goal on 2026-10-31: an app that looks and feels like Strong during logging but acts as a coach, using his workouts, Fitbit recovery, and sets and reps to decide what each workout should look like for continual hypertrophy progress. [D-028](redesign/DECISION_LOG.md) supersedes the "not a normal-progression coach" boundary below. The planned v1 coach sets load, target reps, and working-set count per session inside Erik's stable targets, revises later sets after each completed set, honors "This was a deload" and "Injured — skip" marks, and shows Google Health recovery as information only. Contract: [`redesign/coach/COACH_V1_CONTRACT.md`](redesign/coach/COACH_V1_CONTRACT.md). The integration status above supersedes the original implementation status; the contract remains governing intent.

## Quiet Control progress refresh — IMPLEMENTED LOCALLY 2026-08-15

The approved Quiet Control refresh keeps Today and Progress as the only persistent destinations while adding a narrowly scoped read-only analytics layer. An empty Today screen says **Choose your workout** and shows an equally weighted rolling score across distinct valid lifts represented in the ten most recent completed sessions. Progress now has Sessions and Exercises modes; exercise identity routes to a read-only scoped detail with trend, exact estimated-1RM source set, and a mathematical next target. The August active-session header owned the rest countdown (now presented in the Loaded Bar clamp); set completion is explicit, and every set row shows position-matched prior-session load, repetitions, and RPE when available. None of these analytics creates a workout target, exception action, or normal-progression recommendation.

## Active-session correctness update — IMPLEMENTED LOCALLY 2026-08-07

Today resolves multi-day routine assignments against the local weekday: one match is recommended, while zero or multiple matches require selection. Active workouts own one pinned absolute-deadline rest timer; completing another set replaces prior rest and uses that set's optional rest target. Stable-identity history links return without recreating the active draft. These are targeted functional changes, not a broad redesign.

## Metadata

- **Purpose:** Current product scope and verified implementation boundary
- **Last verified:** 2026-08-15
- **Branch:** `codex/zero-based-redesign`
- **Status:** **PARTIALLY IMPLEMENTED LOCALLY; LOADED BAR INTEGRATION ACCEPTANCE OPEN**
- **Product authority:** [`redesign/final/FINAL_REDESIGN_PRD.md`](redesign/final/FINAL_REDESIGN_PRD.md), [`redesign/final/FINAL_FEATURE_DISPOSITION.md`](redesign/final/FINAL_FEATURE_DISPOSITION.md)
- **Related:** [Architecture](ARCHITECTURE.md), [decision engine](DECISION_ENGINE.md), [UI/UX](UI_UX.md), [roadmap](ROADMAP.md)

## Product purpose

Comprehensive Fitness is a local-first workout logger with a quiet spotter. Its normal flow is:

1. identify the expected workout on Today;
2. start it directly;
3. see stable targets and comparable prior performance;
4. record load, repetitions, and RPE quickly;
5. manage rest;
6. complete the actual workout;
7. review one factual grade, limited highlights, and historical progress.

Visible ordinary training is quiet while the coach activation gate is closed. The product is not a program-design system, research browser, volume dashboard, or scorecard collection.

## Current product topology

The only persistent destinations are **Today** and **Progress**.

- Today owns the no-session workout chooser, rolling ten-completed-session score, active-session Resume/replacement entry, optional readiness, and any current canonical exception.
- Progress owns Sessions and Exercises modes, chronological submitted-session history, and stable-ID exact exercise-variant detail.
- Active workout, workout detail, exercise detail, Routines, Settings, privacy, support, import, export, and clear-data are contextual or secondary.
- A running workout owns the screen and hides persistent navigation.
- Retired route hashes fall back to Today; they do not reopen Dashboard, Plan, More, Insights, Advanced, or old Progress subviews.

The UI is fixed light presentation. Theme and color-package selectors are not current product settings.

## Current capabilities

| Capability | Verified implementation |
| --- | --- |
| Workout chooser and Start | Today presents the planned routine or chooser and starts the selected routine directly; readiness is not a gate. |
| One active draft | A clean, unlogged session may be replaced directly. Logged, skipped, edited, readiness, recovery, or note progress requires explicit replacement/abandonment confirmation. |
| Stable targets | Named exercise variants own set count/roles, rep range, target RPE, rest, and independent identity/history. |
| Factual prefill and prior work | Every set row exposes the same-position/same-role set from the most recent comparable completed session, including warm-ups when recorded; working-set placeholders then use the explicit routine default or blank; actual values remain blank until entered or accepted. |
| Active logging | Load, repetitions, and decimal RPE are directly editable. Add, remove, skip, reorder, notes, substitution, custom variants, and role correction remain available. |
| Rest | One shared timer appears in the gold rest clamp, supports adjustment and Skip/Finish, displays overtime, and restores from the active draft. |
| Workout-only adaptation | Actual-work changes remain on the workout unless the user separately saves a suitable exercise change to the routine. |
| Completion and grade | New submissions store one A-F `comprehensive-fitness-workout-grade/2.0.0` result. The current prospective algorithm is `actual-work-rubric/1.1.0`; stored earlier grades and versions are unchanged. |
| Progress | Sessions presents chronological submitted-session cards with immutable stored grades. Exercises provides search, shared hypertrophy scores, latest performance, retained e1RM where applicable, and stable-ID detail. |
| Rolling hypertrophy score | The ten most recent completed sessions (or the honest available count) supply distinct exact lift/resistance variants. Missing/invalid lift scores are excluded; every remaining lift score has equal weight. |
| Routines | Contextual routine management supports names, order, variants, sets, rep range, target RPE, rest, and duplication. |
| Data | Versioned export/import, Strong import, atomic validation, active-draft recovery, and explicit clear-local-data remain. |
| Notifications | Foreground rest behavior and optional permission-aware Web Push notifications remain. |

## Quiet-spotter boundary

`exception-resolver.js` is the only live exception authority.

- Direct, explicitly recorded current pain/injury or illness can produce one advisory session action.
- Optional readiness can record `usual`, `unusually_good`, or `meaningfully_poor` plus soreness/note context, but the current implementation has no approved readiness detector. It does not itself create an action.
- No live numeric fatigue, readiness, plateau, or deload detector is approved or active.
- Missing or ambiguous evidence remains silent.
- An exception never blocks logging and never rewrites stable routine targets.
- Continuing after a warning remains loggable and the explicit response is stored with the owning workout.

## Removed product systems

The current product has no:

- mesocycle builder, lifecycle, candidate pool, program validation, or equipment gating;
- Dashboard, Plan, More, Insights, Advanced, or persistent Routines destination;
- weekly-volume, fractional-set, readiness, confidence, evidence, research-status, adherence, or program-score dashboards; the only current hypertrophy presentation is the approved read-only per-lift score and equally weighted rolling summary;
- normal exact add-load/add-rep/add-set/hold recommendation;
- the former standalone plate-calculator product or execution-quality questionnaire; Loaded Bar's equipment illustration includes bounded plate accounting;
- React/Vite concept application or parallel product runtime;
- cloud workout-copy control, queue, or upload path.

The notification backend and bounded deletion of legacy remote workout/mutation keys remain. Workout upload endpoints reject new uploads.

## Data and preservation boundary

Preservation applies to completed workout facts, exact exercise/variant identity, set roles and provenance, actual order, load, repetitions, RPE, duration, recorded rest/readiness, notes, substitutions, immutable submitted prescription/action snapshots, and stored grade value/version.

The top-level legacy collections `recommendationHistory`, `manualOverrides`, and `personalEvidencePackage` were global planner/evidence state rather than owning-workout historical facts. The compatibility boundary accepts and discards them instead of recreating them in current app state or exports. Embedded submitted snapshots and resolved actions/overrides attached to their owning workout remain immutable.

All personal fitness and health records remain outside Git and public deployment. Exported backups and notification installation data are sensitive. No production or private data is used as a migration experiment.

## Offline research boundary

`research_database/` and the private `scripts/personal-fitness/` pipeline remain offline research, validation, or audit assets. They are not normal-boot app inputs, current recommendation sources, or user-facing product surfaces.

## Verification state

Milestones M0-M8 have recoverable local checkpoints. M8 source, deletion, packaging, privacy, and browser verification are complete locally at `10d3bb2`; independent acceptance and the external gates below remain open. Do not infer publication approval from local completion.

Still unproven at this point:

- an owner-authorized immutable corrective candidate and exact-commit rerun;
- the repository-pinned Node/npm runtime;
- fresh Claude corrective approval naming that exact commit;
- physical-device keyboard, suspension, and notification behavior;
- representative real-data migration replay;
- hosted verification;
- the five-workout field test;
- publication approval.

The mutable 2026-08-02 corrective working tree has passing unpinned evidence: public 51/51, mobile 146 passed/15 configured skips/0 failures, protected local 2/2, tracked privacy 581/581, and PWA packaging 26/26 at cache v103. Desktop is **NEEDS REVIEW** because independent full-project reruns produced one and then two contention-sensitive failures, although all three distinct cases pass in isolation. These results do not authorize an immutable commit or release any external publication gate.

## Non-goals and authority

Do not recreate a deleted system under a new name or hidden route. Do not add a score, chart family, recommendation category, wearable integration, celebration effect, or account system without a new product decision.

Final redesign documents govern product intent. This file describes verified current implementation and must be updated with the code, tests, and roadmap when that implementation changes.
