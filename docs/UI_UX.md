# UI and UX

## Metadata

- **Purpose:** Verified user experience, interaction contracts, and intended UX gaps
- **Last verified:** 2026-07-14
- **Repository:** `main` @ `7c52a2b`
- **Verification status:** VERIFIED from `index.html` and UI/domain tests; physical-device accessibility remains partly unverified
- **Related:** [Project](PROJECT.md), [architecture](ARCHITECTURE.md), [decision engine](DECISION_ENGINE.md), [roadmap](ROADMAP.md)

## Living-document rule

Read this document before changing navigation, screens, labels, visual hierarchy, interactions, forms, confirmations, loading/empty/error/success states, accessibility, or responsive behavior. After implementation and UI verification, update the affected workflow and requirement status in the same task and update `ROADMAP.md`. Do not describe intended UI as already present. Every user-facing UI change also requires hosted-site browser verification after deployment: inspect the actual URL at mobile and desktop widths, repeat the affected flow after refresh, check console/runtime errors and stale assets, and record URL, viewport, steps, expected/actual result, and evidence in `docs/WORK_LOG_TEMPLATE.md`. Local source inspection or a successful build is not completion proof.

## Experience principles

### Guided mesocycle workflow — IMPLEMENTED

The Templates hierarchy begins with **Plan Your Mesocycle**, followed by ordinary templates and Historical Mesocycles. Opening it creates a focused workspace: Before You Build guidance; objective/schedule/equipment/scope setup; empty training days; prioritized muscle needs; target-specific exercise search; focused pending set configuration; live workload review; Check Viability; exception acknowledgment; and final linked-template review.

One day is expanded at a time on mobile. Each assignment provides a working-set stepper, explicit Move to Day selector, and Remove action. Drag-and-drop is not required. The weekly summary distinguishes direct, fractional, and exposure-frequency values. Programming Guide remains available without discarding progress. The same exercise can be selected on multiple days without warning.

Warnings identify the affected day or muscle, explain why it matters, and suggest a correction. Passed checks and low-value notes remain hidden. Non-blocking exceptions may be accepted and remain audited in the draft.

Guide, Setup, Build, Check, and Create are compact step buttons. Active uses strong blue; completed/unlocked uses a light-blue return state with a checkmark; future steps are muted and disabled. Progress persists in the draft. Setup or Build edits retain compatible work but stale the prior viability result and relock Create.

Build keeps a compact Volume Remaining panel available. It shows direct/fractional sets, evidence-adjusted target range, sets to minimum, frequency need, remaining-day feasibility, and Below/Within/Above status. Candidate selection creates a pending Configuring Now card, focuses it with reduced-motion support, and shows target muscle, target-muscle effectiveness, confidence, sets, reps, RPE/RIR, structure, rest, and live warnings. Add to Day returns focus to the picker, updates needs immediately, and disables the same canonical exercise for that day while leaving it available on other days.

The current UI is mobile-first, light/dark capable, dense enough for training use, and designed to keep recommendations explainable. The visual language uses blue/current-state accents, cards, score tones, completion states, compact bottom navigation, and responsive wrapping. It should feel motivating without treating every workout as a maximal-performance test.

Build separates unresolved **Needs Attention** items from a collapsed **Completed** summary. Status copy shows total effective sets first, then direct/fractional detail and frequency. Amber “Needs Frequency” cannot use the success treatment even when volume is within range. Create review uses expandable day cards with order, sets, rep/RPE/rest targets, volume contributions, warnings, and an Edit Day route. Successful creation remains on a persistent **Mesocycle Completed** panel with exact created/updated template counts and next actions; it does not return to Build.

Interaction principles evidenced in code: one canonical active workout; explicit destructive/final actions; immediate visible set updates; preserved drafts; conservative empty states; full recommendation detail on demand; accessible labels/live regions/inert modal backgrounds; and user-controlled overrides with reasons.

## Design system

`index.html` is the authoritative implemented design-system source. Theme-level color variables in `:root` and `[data-theme="light"]` define background, panel, line, text, current, success, rest, warning, and destructive roles. Truthful `--color-*` aliases now map those established roles without changing computed appearance. `ChoiceChip`, `ChoiceTile`, and `DialogSheet` are compatibility classes over the existing Equipment, Muscle Scope, and bottom-sheet reference patterns; they are not a second visual language. New components must use those semantic roles and shared patterns rather than add one-off colors. The weekly source audit records the existing legacy color and specificity counts as non-regression ceilings; lowering those ceilings is preferred when legacy styling is consolidated.

The interface uses one compact system font stack, sentence-case labels, uppercase eyebrow labels, 6–18 px corner radii according to component scale, and dense 4–18 px spacing. Cards use a surface, one semantic border, and at most one status accent. Equivalent actions must reuse the existing primary, secondary, mini, text, destructive, selected, disabled, hover, pressed, and focus-visible patterns. Fixed navigation and transient notices must account for bottom safe-area insets and must not cover the final scrollable content.

Controls should provide a 44 px touch target where layout permits. Equipment `ChoiceChip` controls and Muscle Scope `ChoiceTile` labels meet that contract and expose programmatically named groups. Existing compact controls below 44 px are **NEEDS REVIEW** and must not be copied into new patterns. Text must wrap by default; a redundant narrow-header context may be visibly abbreviated only while its complete value remains in an accessible label and the full screen heading. Motion and programmatic scrolling must honor `prefers-reduced-motion`.

## Navigation and screen inventory

The persistent bottom navigation has five tabs (`primaryTabIds`, `render`):

| Tab | Purpose and major screens |
| --- | --- |
| Workout | Program overview, quick templates, active workout, Today’s Plan, readiness, exercise/set logger, timer, submit confirmation, completion summary, read-only/edit history session. |
| Dashboard | Weekly muscle volume, fatigue flags, recent history, nested warning/session detail. |
| Templates | Full template list, template cards, mesocycle planner/candidate pools, readiness start sheet. |
| Charts | Exercise selector, progress charts, session-level point detail, hypertrophy score/detail, history/recommendations. |
| Settings | Units, goals/profile, readiness baseline, timers/notifications, PWA setup, separate workout-upload consent, bounded evidence/backup import, export, remote installation deletion, and clear-local-data flow. |

The header exposes the current context, an atomic lb/kg switch, and a theme switch. Full template access is available from Templates; quick-start cards are a subset. Unit changes convert app-owned load values together while private source evidence remains unchanged and is converted only at the display/prescription boundary.

The first keyboard stop is a hidden-until-focused **Skip to main content** link. `#main-content` is a programmatically focusable route-entry target. Initial load leaves focus alone; an explicit selection of any of the five primary tabs moves focus into the newly rendered main view. Focus restoration across HTML-string rerenders uses an allowlisted, data-only `data-action` descriptor rather than storing detached nodes or accepting arbitrary selectors.

## Primary workflows

### Template and active workout

1. Select a quick template or open the complete Templates tab.
2. Open the start sheet and enter/confirm readiness data.
3. Review adjustments and explicitly start.
4. Log set weight/reps/RPE; mark warm-up/type; complete or skip; add/reorder exercises/sets; view prescription/evidence.
5. Completing an eligible set can auto-start that exercise’s rest target. The notice names the next set and supports dismissal/return.
6. Request submit, review confirmation, then confirm final submission.
7. View post-workout grade, completed exercise results, PRs, highlights, and improvements.

Only one active workout is allowed. Other starts are disabled with one canonical resume notice (`scripts/test-performance.js`). Template edits during a workout remain session-specific unless the user explicitly updates the template.

### Settings privacy and data controls

- Lock-screen notifications and cloud workout upload are separate controls. Upload defaults off and is enabled only by its own checkbox; turning it off immediately invalidates old upload work, aborts an in-flight request, and clears the pending mutation queue without treating notification permission as consent.
- Backup and personal-evidence import announce an attempt-specific pending, success, or error state in a polite live region. Invalid, oversized, overly deep/wide, executable-key, duplicate, or orphaned data is rejected without replacing current data.
- **Delete Remote Installation Data** is a separate Danger Zone action from **Clear All Local App Data**. Remote deletion preserves local workouts, displays deleting/retry/error/deleted status, and resumes bounded server cleanup. Local clearing shows a status and pauses while that cleanup still needs its bearer or while an active rest notification cannot yet be canceled. With no such pending work, explicit local clearing remains available and does not claim to delete server records.
- Exported app JSON remains the only implemented user-managed recovery source. Cloud workout upload is write-only and must never be labeled restore, cloud history, or an account.

### History and progress

Submitted sessions alone appear in history and analytics. History cards show full wrapping title, separate date, and grade with accessible combined labeling. A submitted workout opens read-only; editing requires an explicit mode and Save Edits confirmation, then PR/grade recalculation.

Dashboard drill-down is a focus-aware stack. Opening a root or nested volume, fatigue, history, or session detail focuses its Back control; Back restores the prior detail level, scroll position, and durable control that opened it. Leaving Dashboard clears the stack.

Charts are exercise-specific and interactive. Selecting a point opens session-level details and surrounding context (`renderChart`, `renderChartPointDetail`). Long names wrap in history/templates and suggestion controls; **NEEDS REVIEW:** physical testing should cover every chart axis/selector and very narrow devices.

The Charts scope controls form one rounded panel. It shows the canonical selected exercise, analysis type, qualifying-window label, exact dates, qualifying weeks, skipped deload weeks, and recalculation state. Exercise search and the custom period menu replace browser-default period dropdowns. Changing either clears dependent charts, score, rationale, expectations, actual-versus-expected, recommendations, and point detail until recalculation completes.

### Mesocycle planner

Mesocycles intentionally remain inside Templates instead of becoming a sixth primary tab. The benefit of a dedicated tab would be shorter Template content and faster direct access; the drawbacks are overcrowded mobile navigation and separating plans from the templates they generate. The guided workflow therefore uses five dependency-ordered steps inside Templates: Guide, Setup, Build, Check, and Create. The former eight-stage automatic planner and Program Slot UI are legacy historical-plan behavior, not the new-plan workflow.

Templates are progressively disclosed for responsiveness. The initial tab shows compact template rows, a compact current-mesocycle summary, and compact history. “Edit template” constructs that template's exercise controls only while open; “Open Planner Review” constructs the candidate, portfolio, session, and validation detail only while requested. Weekly fatigue warnings remain available on Dashboard, and readiness-adjusted coaching is calculated when starting a workout rather than repeated across every template row. Muscle-scope checkboxes update their local draft immediately without rebuilding the full tab after each tap.

The Muscle Groups in Scope control lists every consolidated available group and defaults to all selected. Unselected controls use a light/transparent neutral surface rather than a heavy filled state. The user may exclude any major or smaller group. The draft confirmation identifies every omission, offers Add to Mesocycle, and requires Keep These Exclusions and Continue before saving the draft as planned. `Why Train This Muscle Group?` uses the research database's anatomical functions plus muscle-family-specific training consequences; it does not repeat a generic omission explanation. Major groups retain a stronger badge, but the UI does not coerce the user after confirmation.

Candidate hierarchy is recommendation badge, exercise name, user-facing role, Predicted Program Effectiveness, Confidence, target muscles, then programming detail. `Why This Recommendation` is the shared expandable detail pattern for role, selection reason, progression, deload/rotation, replacement, and score factors. Internal enum/ID strings must be formatted through `presentationLabel`; raw `mg_*`, snake_case roles, confidence keys, and session IDs are not user copy.

Workout recommendation detail also uses the exact `Why This Recommendation` heading. It shows prior versus today, each material set/load/rep/RPE change, the evidence window, expected duration, and resumption criteria. Recommendation badges describe the actual delta (`Progress Load`, `Add One Rep`, `Hold`, or fatigue reduction), rather than using generic Progress when the prescription is unchanged. Pound fields and displays never expose floating-point conversion residue and use 0.5-lb increments.

The review shows named session purpose, ordered exercises, roles, sets/reps, direct/indirect volume, target versus actual frequency, high-fatigue compounds, spinal/grip/systemic/local fatigue, duration, placement, substitutions, and severity-labelled findings. Blocking volume, frequency, or consecutive-heavy-pattern findings prevent activation. Historical plans show dates and lifecycle at the bottom of the tab. Never-activated drafts/plans may be deleted after confirmation; completed plans are protected and can be archived. Template cards show `Base Session Intent` only when a stable heavy/light/technique/deload/specialization intent exists and state that today’s readiness may modify execution.

### Recovery and nutrition

### Legacy automatic mesocycle review

Legacy automatically generated plans retain their existing review presentation for historical compatibility. New guided plans do not automatically generate a portfolio or distribute sessions.

Available Equipment has an explicit `All Equipment / Standard Gym` default. The only other user-facing capability choices are Bodyweight, Bands, Dumbbells, Barbell, Rack, and Cable Station. Selecting an individual capability clears Standard Gym; clearing the final individual capability restores Standard Gym, so an empty ambiguous state is impossible. Restrictions apply to selected candidates, alternates, and comparisons; detailed requirements remain in the engine and are not exposed as a long picker. Omitted muscle groups use collapsed `Why Train This Muscle Group?` education. Portfolio entries prioritize exercise name, target muscle, program role, and primary/secondary designation without repeating generic boilerplate. Primary, secondary, and destructive lifecycle actions are visually separated.

Exercise Assignments provides compact jump navigation and a distinct container explaining where each selected exercise contributes. Selected exercises render first; alternates remain collapsed until requested. Static tags are neutral; blue is reserved for selected or interactive controls. Candidate `Why the Score?` reports real objective, muscle, equipment, evidence, progression, fatigue, redundancy, and stability inputs. Full Program Review renders separate session cards whose headers show exercise and working-set totals. The normal review shows only unresolved Blocking Issues, Recommended Changes, Warnings, and useful Optional Suggestions. Passed checks, unknown-metadata notices, and non-actionable redundancy observations are hidden. Actionable findings expose `Regenerate with Practical Limits`, which reruns the same 18-set, two-exercise-per-muscle, priority, and recovery constraints.

Program Slot summaries use exercise chips, session badges, role/frequency badges, and omit repeated generic rationale. `Compare Details` compares movement, muscles, equipment, stability, progression, fatigue, placement, and score limitations. Missing metadata is omitted or labelled `Metadata Review Needed`. The weekly summary makes direct sets primary, then taxonomy-defined fractional contribution, weighted stimulus, isometric exposure, target, frequency, and taxonomy version. Direct sets count 1.0; verified fractional work counts 0.5 or 0.25; incidental and unknown relationships count zero; isometric exposure is fatigue-only. `Why the Score?` lists the actual muscle relationships and credits rather than inferring targets from an exercise name.

Readiness capture includes sleep, quality, HRV, resting HR, soreness, illness, affected muscle, nutrition/protein status, and an outside-band note. Guidance uses concise states such as “Go as planned,” monitoring/adjustment, lower-fatigue, or rest guidance. Nutrition is a readiness input, not a standalone food-tracking workflow.

## Requirement matrix

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Warm-up sets in templates and active sessions | **IMPLEMENTED** | Template set roles and active `set-warmup`/type controls; warm-ups excluded from score/volume/progression; rest/warm-up tests. |
| Exercise-specific work and rest timers | **IMPLEMENTED** | Template/exercise `restSeconds`, target set roles, `startTimer`, foreground controller, optional push. “Work timer” as a separate elapsed exercise timer is **NEEDS REVIEW**. |
| Completed vs pending visual distinction | **IMPLEMENTED** | Set completion classes, check controls, next-set banner, completed-state styling in `renderSet`. |
| PR detection and celebrations | **IMPLEMENTED** | Submission-time PR calculation and celebratory completed summary. Exact PR taxonomy is **NEEDS REVIEW**. |
| Recovery readiness above Today’s Plan | **IMPLEMENTED** | `renderWorkout` renders `renderRecoveryPanel(session)` before `renderTodayPlan()`; workout-safety tests assert the order. |
| Concise readiness guidance | **IMPLEMENTED** | “Go as planned” and adjustment/rest labels/actions in recovery recommendation logic. Copy consistency needs review. |
| Complete template list | **IMPLEMENTED** | Templates tab uses all templates; quick start remains intentionally compact. |
| Explicit workout submission | **IMPLEMENTED** | `request-submit-workout` then `submitWorkout`. |
| Confirmation before final submission | **IMPLEMENTED** | `renderSubmitConfirmation`; cancellation returns to active workout. |
| Post-workout completed lifts and PRs | **IMPLEMENTED** | `renderCompletedWorkoutSummary` and exercise result details. |
| History only after confirmed submission | **IMPLEMENTED** | Canonical history filters submitted/completed states; safety/domain tests. Imported Strong workouts are normalized as submitted history. |
| Interactive progress charts with session detail | **IMPLEMENTED** | Point selection and detail view. |
| Full visibility for long exercise names | **PARTIALLY IMPLEMENTED** | Wrapping/overflow styles and performance fixture cover long workout names; broad physical-device exercise-name audit is absent. |
| Functional lb/kg controls | **IMPLEMENTED** | Header and Settings use the same atomic converter; sets, targets, template increments, overrides, and snapshots preserve physical meaning and explicit unit provenance. Private/raw source packages remain immutable. |
| Motivating, clean experience | **PARTIALLY IMPLEMENTED** | Score/grade colors, PR summary, cards, responsive layouts, light/dark themes exist; subjective design quality and device polish require human review. |

## States and feedback

- **Empty:** Controlled “not enough data,” no-template/history/chart messages explain qualifying data needed; analytics do not substitute unrelated scores.
- **Loading:** Initial persistence/evidence loading occurs before primary use; imports expose attempt-scoped progress/error feedback and remote deletion exposes its continuation state. **NEEDS REVIEW:** there is no unified skeleton/loading design.
- **Error:** Toasts, accessible import validation, retryable/non-retryable remote-deletion status, API status, persistence fallback, and setup errors are surfaced without exposing secrets.
- **Success:** Live-region toast and import status, completed controls, timer-complete notice, notification tests, remote-deletion confirmation, submission summary, PR/grade feedback.
- **Confirmation:** Submit, cancel workout, save/cancel history edits, template deletion, and clear-data flows require explicit action.

## Accessibility and responsive behavior

Implemented foundations include semantic `main`/`nav`, a keyboard-visible skip link, button labels, `aria-current`, `aria-live`, accessible card labels, form labels, keyboard-native controls, inert/hidden background during modal sheets, focusable details, safe-area insets, responsive breakpoints at 720/380/350 px, and wrapping long text.

**IMPLEMENTED:** template-start, cancel-workout, history-edit, and clear-data sheets are labelled modal dialogs. A newly opened dialog receives safe initial focus, traps forward and reverse Tab within rendered enabled controls, closes on Escape or its backdrop where dismissal is allowed, and restores a durable invoking control after rerender. Same-dialog rerenders preserve the focused step control instead of returning to the first action. Repeated Lift controls include exercise context in their accessible names.

**IMPLEMENTED:** all five primary views pass the exact 320 CSS-pixel reflow matrix at ordinary text and at a computed 200% root text size. Large-text mode preserves the normal 320 px protected Lift composition until text is genuinely enlarged, then permits content-driven one-column/wrapping layouts and multiline title editing. Form text keeps a 16 px anti-zoom floor while still scaling with an enlarged root. The Plan quick-template row remains the one documented keyboard-operable horizontal carousel. Reduced-motion mode converts reachable programmatic scrolling to `auto`, and forced-colors checks require a visible non-shadow focus indicator.

**IMPLEMENTED:** the repository-owned Playwright audit runs axe WCAG A/AA checks, contrast checks, viewport overflow checks, active-navigation assertions, dialog/focus restoration, 320 px/200% reflow, reduced-motion and forced-colors checks, contextual-name and target-size assertions, console-error checks, and visual snapshots at a 375 px-class mobile viewport and 1280 px desktop viewport. Dedicated protected Lift/Dashboard goldens additionally cover 320, 390, 640 zoom-equivalent, 768, and 1280 px reference states.

**NEEDS REVIEW:** physical screen-reader walkthroughs, native dynamic-text acceptance beyond the browser reflow contract, physical safe-area/keyboard overlap, haptics, and system permission UI remain device-level work. Timer sound/vibration are configurable; visual status must remain sufficient without them.

## Weekly UI/UX audit and visual regression

`npm run audit:ui` runs the deterministic browser audit in fresh storage for Workout, Dashboard, Templates, Charts, and Settings in mobile and desktop Chromium. It uses one worker because both projects load the full research/personal-evidence adapters and large-history fixture; serial execution prevents resource-contention timeouts from masquerading as UI failures. Approved baselines live beside `tests/ui/ui-audit.spec.js`; update them only for an intentional reviewed visual change with `npm run audit:ui:update`. HTML output, traces, screenshots, diffs, JSON results, and `weekly-report.md` are written under `artifacts/ui-audit/` and are not product data.

`.github/workflows/weekly-ui-audit.yml` runs every Monday at 13:17 UTC and supports manual dispatch. It uploads the full artifact directory for 30 days and fails visibly after report upload when any build, route, visual, accessibility, layout, console, source-style, or documentation check fails. The automation does not auto-approve baselines or modify application code. New routes and reusable visual states must be added to this suite in the same change that introduces them.

Current automated coverage does not yet synthesize every workout lifecycle, modal, data-heavy chart, import failure, offline/service-worker transition, or native-only state. Those gaps are **NEEDS REVIEW** and are listed in each weekly report rather than silently passed.

**NEEDS REVIEW:** the two ordinary Settings goldens predate the already-implemented default-off cloud workout-upload consent and explanatory copy. Their behavior, axe, console, and layout assertions pass, but the stored images require a separate intentional baseline review; the control must not be hidden merely to match stale images. Protected Lift/Dashboard goldens remain unchanged.

## Terminology and copy conventions

Use “Workout,” “Dashboard,” “Templates,” “Charts,” and “Settings” for primary navigation. Use “working set” versus “warm-up set” precisely. “Today’s readiness” is same-day context; “Today’s plan” is the base/adjusted work. “Go as planned” permits planned progression only when warm-ups support it. “Deload” must state scope. “History” means confirmed submitted workouts. Use lb/kg consistently and show the active unit.

Do not call offline Fitbit export analysis “Fitbit sync,” the nutrition adequacy selector “nutrition tracking,” or installation authorization a user login.
