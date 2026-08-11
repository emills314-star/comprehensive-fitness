# Kimi hybrid Logbook implementation

## Outcome

**IMPLEMENTED LOCALLY 2026-08-08.** The owner-approved hybrid uses Direction A — Logbook as the production base, a cool blue-gray **Last comparable** fact row, and Direction C-inspired structural rest progress in the fixed Logbook palette. Rest now exposes a labeled Pause/Resume control without opening its secondary adjustment disclosure.

The first production pass changed active-workout styling but retained too much of the prior shell and card structure. The completed translation supersedes that pass and applies the Logbook structure across Today, active workout, completion, Progress, Routines, and Settings. Desktop uses a fixed 200px rail; the active workout uses a compact top session bar with no bottom dock; content uses ruled, frameless sections and denser ledger rows.

## Protected behavior

Comparable-history resolution, stable targets, decimal RPE, active-draft recovery, overtime, adjustment, Skip/Finish, notification scheduling, workout mutation authorization, and two-destination navigation remain unchanged. During verification, the implementation also corrected active-dock timer ID synchronization after Pause/Resume and `+15 sec`, and preserved completion-button focus across the deferred full-shell timer render.

## Files and documentation

- Production presentation and interaction: `index.html`, `app-views.js`, `app-sync.js`, `app-workout.js`, `sw.js`
- Packaged mirror: synchronized `www/` assets through `npm run sync:web`
- Contracts and browser coverage: `scripts/test-rest-timer-presentation.js`, `tests/ui/critical-workout-lifecycle.spec.js`, `tests/ui/mockup-fidelity.spec.js`, `tests/ui/redesign-m6-active-workout.spec.js`
- Product documentation: `docs/redesign/DESIGN_APPROVAL.md`, `docs/UI_UX.md`, `docs/ROADMAP.md`

`docs/PROJECT.md`, `docs/ARCHITECTURE.md`, and `docs/DECISION_ENGINE.md` were reviewed and require no text change: this slice adds no product capability, persistence/model change, or decision/recommendation rule.

## Verification

- Static lint: passed (165 JavaScript, 82 JSON, 0 inline scripts).
- Public contract gate: 52/52 selected scripts passed.
- PWA/native public packaging: 26/26 assets passed.
- Active-workout browser matrix: 32/32 mobile and desktop cases passed.
- Critical workout lifecycle: 4/4 mobile and desktop cases passed.
- Focused mobile visual-fidelity capture: passed and inspected at 390 × 844.
- `git diff --check`: passed.

The app-shell cache advanced to v116 after the structural translation and final shell correction. This corrected the misleading local preview that continued executing the coherent pre-redesign v105 shell even while the development server contained newer source.

The first unprivileged public-gate attempt reported two sandbox `EPERM` subprocess failures; the authorized rerun passed. A stale timer location in two visual/lifecycle tests was updated from the retired in-view slot to the implemented sticky active-rest dock.

## Remaining gates

**OWNER APPROVED:** the live 390px production candidate was inspected in the in-app browser and visually accepted on 2026-08-08.

**NEEDS REVIEW:** physical-device sound/vibration/notification/suspension behavior, hosted verification, commit, push, merge, deployment, and publication were not performed.
