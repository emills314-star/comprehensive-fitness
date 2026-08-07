# Project

## Active-session correctness update — IMPLEMENTED LOCALLY 2026-08-07

Today resolves multi-day routine assignments against the local weekday: one match is recommended, while zero or multiple matches require selection. Active workouts own one pinned absolute-deadline rest timer; completing another set replaces prior rest and uses that set's optional rest target. Stable-identity history links return without recreating the active draft. These are targeted functional changes, not a broad redesign.

## Metadata

- **Purpose:** Current product scope and verified implementation boundary
- **Last verified:** 2026-08-02
- **Branch:** `codex/zero-based-redesign`
- **Status:** **CORRECTED CANDIDATE VERIFIED LOCALLY; IMMUTABLE/PINNED/CLAUDE GATES OPEN**
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

Ordinary training is quiet. The product is not a program-design system, research browser, volume dashboard, scorecard collection, or normal-progression coach.

## Current product topology

The only persistent destinations are **Today** and **Progress**.

- Today owns expected-workout identity, compact preview, direct Start, alternate-workout choice, optional readiness, Resume, and any current canonical exception.
- Progress owns chronological submitted-workout history and exact exercise-variant performance detail.
- Active workout, workout detail, exercise detail, Routines, Settings, privacy, support, import, export, and clear-data are contextual or secondary.
- A running workout owns the screen and hides persistent navigation.
- Retired route hashes fall back to Today; they do not reopen Dashboard, Plan, More, Insights, Advanced, or old Progress subviews.

The UI is fixed light presentation. Theme and color-package selectors are not current product settings.

## Current capabilities

| Capability | Verified implementation |
| --- | --- |
| Expected workout and Start | Today identifies an explicit expected routine when configured. Start opens the logger directly; readiness is not a gate. |
| One active draft | A competing start offers Resume, Finish, or confirmed Discard. It never silently replaces the current draft. |
| Stable targets | Named exercise variants own set count/roles, rep range, target RPE, rest, and independent identity/history. |
| Factual prefill and prior work | Comparable same-variant, same-resistance, same-role prior work is preferred, then an explicit routine default, then blank. |
| Active logging | Load, repetitions, and decimal RPE are directly editable. Add, remove, skip, reorder, notes, substitution, custom variants, and role correction remain available. |
| Rest | One shared timer starts from completed work, supports adjustment and Skip/Finish, displays overtime, and restores from the active draft. |
| Workout-only adaptation | Actual-work changes remain on the workout unless the user separately saves a suitable exercise change to the routine. |
| Completion and grade | New submissions store one A-F `comprehensive-fitness-workout-grade/2.0.0` result. The current prospective algorithm is `actual-work-rubric/1.1.0`; stored earlier grades and versions are unchanged. |
| Progress | One factual exact-variant/exact-resistance trend with inspectable points plus all chronological submitted history. |
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
- hypertrophy, volume, fractional-set, readiness, confidence, evidence, research-status, adherence, or program score;
- normal exact add-load/add-rep/add-set/hold recommendation;
- plate calculator or execution-quality questionnaire;
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
