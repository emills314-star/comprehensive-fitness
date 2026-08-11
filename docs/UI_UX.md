# UI and UX

## 2026-08-09 corrective K3 Logbook production contract — IMPLEMENTED LOCALLY

Active workout now follows the approved Direction A ledger composition instead of the superseded card-oriented production shell. The active session owns one three-part header: Back to Today, the full wrapping exercise context, and Finish. Session progress, elapsed time, workout pause, and the workout menu are not duplicated in that header.

Completed and pending sets are 44px ruled factual rows. Only the current set expands inline, with a restrained cool blue-gray **Last comparable** fact and the exact `No comparable history.` unavailable state. Ambiguous `on` and numeric-delta chips are retired. All per-set actual-work controls are owned by the exercise overflow; set rows do not render separate option disclosures.

Active rest owns one structural 3px progress rail and one compact control row. Pause/Resume, -15s, +15s, and Skip/Finish are visible together. Rest completion is a polite in-flow status line rather than a modal or toast over set inputs. Mobile uses the useful viewport width with approximately 18px gutters; desktop workout remains a centered 760px ledger and has no persistent destination rail.

## Kimi P0 Today hierarchy and navigation — IMPLEMENTED LOCALLY 2026-08-08

- An active draft has one visible status surface: the draft hero says **Workout in progress** and the page heading no longer repeats **In progress**.
- A scheduled expected workout likewise relies on the **Expected workout** hero rather than repeating a page-level **Ready** chip; the exceptional no-selection state still retains **Plan needed**.
- Today remains a single focused column with a 720px maximum width on wide screens.
- Expected-workout and active-draft heroes use a flat hairline surface, a 3px current-state rail, and compact 44px Start/Resume actions without glow.
- Closed **Choose another workout** is a quiet secondary action; Routines and Settings use quiet header controls.
- The persistent Today/Progress navigation spans the viewport, centers its two destinations within 400px, uses a top hairline and current-location indicator, and no longer depends on a rounded elevated dock that can clip at desktop height.
- Product behavior is unchanged: the primary label remains **Resume**, persistent navigation still contains exactly Today and Progress, and active workouts still hide it.

## Active-session targeted improvements — IMPLEMENTED LOCALLY 2026-08-07

- Rest appears once in a compact pinned, safe-area-aware bar using shared timer state.
- Incomplete sets expose per-set rest editing; completion uses an icon and accessible label.
- Stable-identity exercise links open Progress and return with workout, current-set, timer, entered-data, and scroll context intact.
- The compact bottom dock keeps its overflow above the dock and within the viewport.
- Readiness wraps on mobile and preserves “Not entered” versus soreness “Not recorded.”

## Metadata

- **Purpose:** Current navigation, screen, copy, interaction, and accessibility contract
- **Last verified:** 2026-08-09
- **Status:** **K3 CORRECTIVE CANDIDATE VERIFIED LOCALLY; OWNER BASELINE ACCEPTANCE NOT RUN**
- **Product authority:** [`redesign/final/FINAL_REDESIGN_PRD.md`](redesign/final/FINAL_REDESIGN_PRD.md)
- **Related:** [Project](PROJECT.md), [architecture](ARCHITECTURE.md), [decision engine](DECISION_ENGINE.md), [roadmap](ROADMAP.md)

## Product shell

Persistent navigation contains exactly:

1. **Today**
2. **Progress**

Routines and Settings are contextual screens and return to Today. Workout/exercise history is reached contextually from Progress or the active workout. An active workout is full-screen and hides persistent navigation.

Retired route hashes do not remain as hidden features. They normalize to Today. There is no Dashboard, Plan, More, Insights, Advanced, persistent Routines tab, or persistent Progress subview switcher.

The production product uses one fixed light presentation. There is no theme selector, color-package selector, or appearance-settings group.

## Today

The first useful viewport shows:

- the expected routine/workout identity;
- a concise exercise preview;
- one primary **Start** action;
- secondary **Choose another workout**;
- optional **Log readiness**;
- **Resume** instead of Start when a draft exists;
- at most one session exception when the canonical resolver permits it.

Start opens the active logger directly. There is no readiness, prescription-review, or confirmation step before normal Start.

If another draft is active, the user receives exactly Resume, Finish, or Discard. Discard opens a concise destructive confirmation and removes only the confirmed draft; it does not silently start the newly requested routine.

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

Current, completed, pending, skipped, and warm-up states are distinguishable without relying on color alone. Meaningful variant suffixes wrap rather than truncate.

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

Previous facts match exact performance identity, resistance type, and comparable set role. Warm-up and unknown-role work do not qualify as progression evidence. Ambiguous or absent prior data is shown as unavailable rather than inferred.

The approved Logbook presentation labels this row **Last comparable** and uses a cool blue-gray fact surface. Saturated blue remains reserved for the current set and primary actions, so the prior value is easier to scan without implying that it is a new target or recommendation.

### Rest

One shared rest control appears after completed, non-skipped work. It:

- uses the exercise/role rest default;
- shows remaining time and overtime;
- supports adjustment and Skip/Finish;
- keeps an explicit, always-visible Pause/Resume control while the timer is active;
- survives supported navigation, reload, and active-draft recovery;
- can schedule a Web Push notification where supported and permitted;
- remains functional in-app when notifications are unavailable or denied.

Physical-device suspension, lock-screen delivery, sound, vibration, and software-keyboard behavior remain device acceptance gates.

The active rest control borrows Direction C's structural progress idea as a thin progress rail attached to the compact Logbook timer. It uses the fixed navy/blue Logbook palette, and paused state is also identified by label and dashed structure rather than color alone.

### Logbook shell and page structure

The approved production direction uses Direction A's structure, not only its colors. On desktop, Today and Progress use a fixed 200px navigation rail; secondary destinations remain explicit text actions. On mobile, the two-destination navigation remains a compact bottom bar. Today, Progress, Routines, Settings, workout, and completion use frameless ruled sections on one paper-like surface instead of stacked rounded cards.

An active workout replaces the ordinary masthead and bottom dock with one compact sticky session bar containing only Back to Today, current context, and Finish. Exercises render as a dense ledger: completed and pending sets remain compact rows, the current set opens inline, and **Last comparable** is visually distinct without becoming a recommendation. Actual-work controls live in the exercise overflow. While rest is active, exactly one structural rail appears below the session bar with Pause/Resume, −15 seconds, +15 seconds, and Skip/Finish. Completion uses the same ruled language with a stamped outcome treatment. These are presentation and navigation-shell changes; workout, history, timer, and recommendation semantics remain governed by their existing contracts.

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

Progress is one coherent destination:

- exercise/variant selection;
- a recent default or all-history range;
- one interpretable comparable-performance chart;
- inspectable chart points;
- chronological submitted-workout history.

A chart point reveals date, raw and display load/unit facts, repetitions, RPE, role, source session, notes, and provenance where present. Exact variants, resistance types, and roles stay separate. Older workouts remain reachable; a recent default never deletes or archives them.

There is no Overview/Lifts/History switcher, Dashboard, weekly volume, hypertrophy, fatigue, readiness, evidence, research-status, confidence, scorecard, or PR-only destination.

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

The 2026-08-09 K3 corrective candidate adds a deterministic direct-Playwright gate at 390 × 844 and 1440 × 900. Both viewports pass the complete workout-to-rest-to-completion lifecycle, one-header/one-open-row/one-rest-surface assertions, horizontal-overflow and full-name checks, 44px required rest controls, and zero serious or critical axe violations. The eleven required local production screenshots and the side-by-side Direction A comparison board were regenerated from the synchronized candidate. Physical-device, hosted, and owner baseline-acceptance gates remain unverified.

## Design system and review process

The **Design system** uses the fixed-light semantic roles and shared controls in `index.html`; it does not expose themes or color packages as product settings. The first Kimi P0 slice establishes flat Today hierarchy, a 720px Today measure, quiet contextual actions, and a full-width two-destination navigation bar while preserving 44px controls. The repository's **weekly UI/UX audit** remains an engineering process for navigation, touch targets, focus, responsive layout, and accessibility. **Visual regression** coverage protects current Today, Progress, Routines, Settings, active-workout, and completion states, but generated screenshots are evidence only; no owner baseline acceptance is claimed.

## Historical design records

`docs/design/COMPLETE_REDESIGN_CONCEPTS.md`, `docs/design/REDESIGN_MIGRATION_BLUEPRINT.md`, Phase 1, and prior raster/mockup records remain historical evidence. They are not current UI authority and do not authorize deleted Plan, Dashboard, More, analytical Progress, theme-package, planner, confidence, or research surfaces.
