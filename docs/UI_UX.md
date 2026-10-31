# UI and UX

## Quiet Control refresh — IMPLEMENTED LOCALLY 2026-08-15

- Empty Today says **Choose your workout** and never says **Choose another workout** until a session exists.
- A polished rolling score card links to Progress → Exercises and labels the actual completed-session count when fewer than ten exist.
- The compact pinned active-session header visually centers the session name and owns the sole blue **Ready**/rest-countdown treatment.
- Completed set rows use a checkmark and restrained mint treatment; upcoming set checks are visibly gray and disabled.
- Every set row shows position-matched previous-session load, repetitions, and RPE when available.
- Progress switches between Sessions and Exercises; stable exercise IDs open one read-only exercise detail with no completed-session list.

## Active-session targeted improvements — IMPLEMENTED LOCALLY 2026-08-07

- Rest appears once in a compact pinned, safe-area-aware bar using shared timer state.
- Incomplete sets expose per-set rest editing; completion uses an icon and accessible label.
- Stable-identity exercise links open Progress and return with workout, current-set, timer, entered-data, and scroll context intact.
- The pinned session header owns the workout overflow menu; the bottom dock contains only progress, duration control, and Finish so menu actions are not duplicated.
- Readiness wraps on mobile and preserves “Not entered” versus soreness “Not recorded.”

## Metadata

- **Purpose:** Current navigation, screen, copy, interaction, and accessibility contract
- **Last verified:** 2026-08-15
- **Status:** **CORRECTED CANDIDATE VERIFIED LOCALLY; INDEPENDENT ACCEPTANCE BLOCKED**
- **Product authority:** [`redesign/final/FINAL_REDESIGN_PRD.md`](redesign/final/FINAL_REDESIGN_PRD.md)
- **Related:** [Project](PROJECT.md), [architecture](ARCHITECTURE.md), [decision engine](DECISION_ENGINE.md), [roadmap](ROADMAP.md)

## Product shell

Persistent navigation contains exactly:

1. **Today**
2. **Progress**

Routines and Settings are contextual screens and return to Today. Workout/exercise history is reached contextually from Progress or the active workout. An active workout is full-screen and hides persistent navigation.

Retired route hashes do not remain as hidden features. They normalize to Today. There is no Dashboard, Plan, More, Insights, Advanced, or persistent Routines tab. Progress intentionally owns a Sessions/Exercises mode switch and stable-ID exercise-detail query state.

The production product uses one fixed light presentation. There is no theme selector, color-package selector, or appearance-settings group.

## Today

With no loaded session, the first useful viewport shows:

- one rolling ten-completed-session hypertrophy summary;
- the honest available completed-session count;
- the primary prompt **Choose your workout**;
- directly selectable workouts;
- optional **Log readiness**;
- at most one session exception when the canonical resolver permits it.

After a session is loaded, Today shows **Resume** and **Choose another workout**. The replacement wording never appears in the no-session state. A session with no logged/skipped/edited set, note, readiness, or recovery progress can be replaced directly; otherwise a clear confirmation is required before abandonment and replacement.

Start opens the active logger directly. There is no readiness, prescription-review, or confirmation step before normal Start.

If a progressed draft is active, the confirmation preserves Resume/Finish/cancel choices and names the requested replacement. Confirmed replacement removes only that draft and then loads the selected workout as a new session.

## Optional readiness

Readiness is secondary and skippable before or during the workout. Current inputs support:

- usual, unusually good, or meaningfully poor readiness;
- soreness;
- explicit pain/injury;
- explicit illness;
- affected area when relevant;
- an optional note.

Skipping readiness never blocks Start, logging, timer use, submission, or Progress. Current live advice uses only explicit pain/injury or illness. Meaningfully poor readiness is stored as a factual deviation but does not currently produce a recommendation.

The empty readiness choice remains **Not entered**. The empty soreness choice is **Not recorded**, reflecting that soreness is an observation rather than a readiness judgment. Accessibility coverage identifies each radio within its named fieldset and retains the existing dialog focus trap.

## Active workout

The active screen prioritizes:

- complete exercise/variant name;
- stable set count/roles, rep range, target RPE, and rest;
- compact comparable prior performance;
- current set;
- load, repetitions, and RPE;
- shared rest state.

The pinned header uses an asymmetric-safe three-column grid so the session name remains visually centered. The old **In progress** badge is removed. The left slot says **Ready** or shows the live blue countdown/progress; timer controls remain reachable without a second rest bar. Long names truncate gracefully and preserve the overflow menu touch target.

Current, completed, pending, skipped, and warm-up states are distinguishable without relying on color alone. Meaningful variant suffixes wrap rather than truncate.

Only the current set has an enabled completion control. Upcoming sets show a gray disabled check. Completing a set adds a green check and subtle mint row treatment, de-emphasizes the row, and preserves readable load/repetition/RPE facts. The exercise container receives its restrained completed state only after every required working set is logged.

### Inputs

- Load is a numeric entry in the current display unit.
- Repetitions are integer entry.
- RPE supports decimal 0.5 values and immediate replacement. A prefilled `7` can become `7.5` in one focused edit without manual clearing or a second tap on `7`.
- Factual prefill order is comparable prior set, explicit routine default, then blank.
- Completing a set preserves the value just entered and advances predictably.
- The Current focus description and remaining-set message refresh from the same `workoutProgress()` result after each completion. In a three-set workout they advance after sets 1 and 2 and restore the same current set and remaining count after reload.
- Touch controls retain the supported minimum target size and set inputs keep a 16 CSS-pixel font floor on mobile to avoid iOS focus zoom.

### Actual-work controls

The user can add, remove, or skip a set; reorder exercises; choose what to do next; substitute an exercise; create or name a custom variant; correct set role; and add exercise/session notes.

Changes apply to the current workout by default. Saving a suitable substituted exercise back to the source routine is a separate explicit action. Equipment metadata cannot disable selection, inputs, the timer, or submission.

### Prior performance

Previous facts match exact performance identity, resistance type, and stable row position/role in the most recent completed comparable session. Each row—set 1 to set 1, set 2 to set 2, and so on—shows load, repetitions, and RPE. Warm-ups may compare only with the same warm-up position and still do not qualify as progression evidence. Ambiguous or absent prior data is shown as unavailable rather than inferred.

### Rest

One shared rest control appears in the active-session header after completed, non-skipped work. It:

- uses the exercise/role rest default;
- shows remaining time and overtime;
- supports adjustment and Skip/Finish;
- survives supported navigation, reload, and active-draft recovery;
- can schedule a Web Push notification where supported and permitted;
- remains functional in-app when notifications are unavailable or denied.

Physical-device suspension, lock-screen delivery, sound, vibration, and software-keyboard behavior remain device acceptance gates.

Status toasts do not capture taps outside an explicit action button. This keeps the pinned workout menu usable while an Undo/status message is visible without making the toast's explicit Undo action inert.

### Recovery

The active draft retains workout identity, exercises, order, entered set values, roles, notes, duration semantics, timer state, recovery facts, and immutable historical/action references. Browser Back returns to Today without deleting the draft, and Today exposes Resume.

## Canonical exception presentation

Ordinary sessions show no recommendation card. A direct pain/injury or illness record may show:

- one plain action;
- affected scope;
- one short reason;
- concise details on request.

The UI does not show confidence, severity, evidence weights, citations, detector lists, internal adjustment objects, or exact normal progression instructions. The warning is non-diagnostic, does not claim that continuing is safe, and does not block logging. Continue/modify/stop handling is explicit and stored on the workout.

## Completion

Finish uses one consequential-action confirmation. After submission, the result contains:

- one stored A-F actual-work grade;
- two or three factual reasons;
- at most three meaningful PR/progress highlights;
- the still-relevant canonical exception, if any;
- Done and contextual Progress actions.

There is no adherence breakdown, confidence/category presentation, plan-difference ledger, hypertrophy/volume/program score, achievement strip, notification setup, confetti, or active-session dock on the submitted result.

The current prospective grade writes algorithm `actual-work-rubric/1.1.0`. Stored earlier grades and algorithm versions render unchanged.

## Progress

Progress is one coherent destination with two top-level modes:

- **Sessions:** chronological submitted-session cards with session/workout name, date, duration, stored grade, supporting facts, notable PR where present, and detail navigation.
- **Exercises:** searchable exact exercise variants with current valid hypertrophy score, recent trend, latest performance, retained best e1RM where applicable, and stable-ID detail navigation.

Exercise detail makes the exact exercise name dominant, offers **Back to workout** when launched from an active session, retains active scroll/timer/entered state, shows one interpretable trend chart with inspectable source points, and presents a distinct estimated-1RM record/source/next-threshold card. It is read-only and has no replace-exercise or completed-session list.

A chart point reveals date, raw and display load/unit facts, repetitions, RPE, role, source session, notes, and provenance where present. Exact variants, resistance types, and roles stay separate. Older workouts remain reachable; a recent default never deletes or archives them.

There is no Dashboard, weekly-volume, fatigue, readiness, evidence, research-status, confidence, program-score, or PR-only destination. The Sessions/Exercises switch and narrowly scoped hypertrophy/e1RM displays are the approved Progress exception.

## Routines and Settings

Routines is secondary planning UI for the infrequent task of editing:

- routine/day names;
- ordered variants;
- set count and roles;
- rep minimum and maximum;
- target RPE;
- rest;
- duplication.

Settings is a secondary utility for:

- lb/kg display preference;
- timer sound/vibration/notification behavior;
- import/export;
- clear local data;
- remote installation deletion;
- privacy and support links.

Settings contains no workout cloud-copy control and no deleted-feature graveyard.

## Accessibility and responsive contract

- Primary verification includes approximately 390 × 844 and wider desktop layouts.
- Controls remain touch-sized, labelled, keyboard reachable, and focus visible.
- Dialogs trap focus, restore it sensibly, and make destructive consequences explicit.
- Active/completed/pending/skipped/warm-up distinctions do not rely on color alone.
- Long exercise names, large loads/repetition values, decimal RPE, empty states, errors, overrides, completion, and reduced-motion/forced-color behavior are covered by the final verification plan.
- Code inspection and desktop emulation do not replace rendered inspection or physical-device-only checks.

The dated M8 browser/a11y result was mobile 144 passed/15 configured skips and desktop 141 passed/18 configured skips. The corrective mobile project reproduced cleanly at 146 passed/15 configured skips/0 failures. Corrective desktop is **NEEDS REVIEW**: independent full-project reruns produced one and then two contention-sensitive failures across three tests that pass in isolation. Owner visual-baseline acceptance, hosted verification, and physical-device acceptance have not been claimed.

## Design system and review process

The **Design system** uses the fixed-light semantic roles and shared controls in `index.html`; it does not expose themes or color packages as product settings. The repository's **weekly UI/UX audit** remains an engineering process for navigation, touch targets, focus, responsive layout, and accessibility. **Visual regression** coverage protects current Today, Progress, Routines, Settings, active-workout, and completion states, but generated screenshots are evidence only; no owner baseline acceptance is claimed by M8 documentation.

## Historical design records

`docs/design/COMPLETE_REDESIGN_CONCEPTS.md`, `docs/design/REDESIGN_MIGRATION_BLUEPRINT.md`, Phase 1, and prior raster/mockup records remain historical evidence. They are not current UI authority and do not authorize deleted Plan, Dashboard, More, analytical Progress, theme-package, planner, confidence, or research surfaces.
