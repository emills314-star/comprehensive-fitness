# UI and UX

## Metadata

- **Purpose:** Verified user experience, interaction contracts, and intended UX gaps
- **Last verified:** 2026-07-11
- **Repository:** `main` @ `7c52a2b`
- **Verification status:** VERIFIED from `index.html` and UI/domain tests; physical-device accessibility remains partly unverified
- **Related:** [Project](PROJECT.md), [architecture](ARCHITECTURE.md), [decision engine](DECISION_ENGINE.md), [roadmap](ROADMAP.md)

## Living-document rule

Read this document before changing navigation, screens, labels, visual hierarchy, interactions, forms, confirmations, loading/empty/error/success states, accessibility, or responsive behavior. After implementation and UI verification, update the affected workflow and requirement status in the same task and update `ROADMAP.md`. Do not describe intended UI as already present.

## Experience principles

The current UI is mobile-first, light/dark capable, dense enough for training use, and designed to keep recommendations explainable. The visual language uses blue/current-state accents, cards, score tones, completion states, compact bottom navigation, and responsive wrapping. It should feel motivating without treating every workout as a maximal-performance test.

Interaction principles evidenced in code: one canonical active workout; explicit destructive/final actions; immediate visible set updates; preserved drafts; conservative empty states; full recommendation detail on demand; accessible labels/live regions/inert modal backgrounds; and user-controlled overrides with reasons.

## Design system

`index.html` is the authoritative implemented design-system source. Theme-level color variables in `:root` and `[data-theme="light"]` define background, panel, line, text, current, success, rest, warning, and destructive roles. New components must use those semantic roles rather than add one-off colors. The weekly source audit records the existing legacy color and specificity counts as non-regression ceilings; lowering those ceilings is preferred when legacy styling is consolidated.

The interface uses one compact system font stack, sentence-case labels, uppercase eyebrow labels, 6–18 px corner radii according to component scale, and dense 4–18 px spacing. Cards use a surface, one semantic border, and at most one status accent. Equivalent actions must reuse the existing primary, secondary, mini, text, destructive, selected, disabled, hover, pressed, and focus-visible patterns. Fixed navigation and transient notices must account for bottom safe-area insets and must not cover the final scrollable content.

Controls should provide a 44 px touch target where layout permits. Existing compact controls below 44 px are **NEEDS REVIEW** and must not be copied into new patterns. Text must wrap by default; truncation is allowed only when the complete value remains available through an accessible label or adjacent detail. Motion must honor `prefers-reduced-motion`.

## Navigation and screen inventory

The persistent bottom navigation has five tabs (`primaryTabIds`, `render`):

| Tab | Purpose and major screens |
| --- | --- |
| Workout | Program overview, quick templates, active workout, Today’s Plan, readiness, exercise/set logger, timer, submit confirmation, completion summary, read-only/edit history session. |
| Dashboard | Weekly muscle volume, fatigue flags, recent history, nested warning/session detail. |
| Templates | Full template list, template cards, mesocycle planner/candidate pools, readiness start sheet. |
| Charts | Exercise selector, progress charts, session-level point detail, hypertrophy score/detail, history/recommendations. |
| Settings | Units, goals/profile, readiness baseline, timers/notifications, PWA setup, evidence/CSV import, export, and clear-data flow. |

The header exposes the current context, an atomic lb/kg switch, and a theme switch. Full template access is available from Templates; quick-start cards are a subset. Unit changes convert app-owned load values together while private source evidence remains unchanged and is converted only at the display/prescription boundary.

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

### History and progress

Submitted sessions alone appear in history and analytics. History cards show full wrapping title, separate date, and grade with accessible combined labeling. A submitted workout opens read-only; editing requires an explicit mode and Save Edits confirmation, then PR/grade recalculation.

Charts are exercise-specific and interactive. Selecting a point opens session-level details and surrounding context (`renderChart`, `renderChartPointDetail`). Long names wrap in history/templates and suggestion controls; **NEEDS REVIEW:** physical testing should cover every chart axis/selector and very narrow devices.

The Charts scope controls form one rounded panel. It shows the canonical selected exercise, analysis type, qualifying-window label, exact dates, qualifying weeks, skipped deload weeks, and recalculation state. Exercise search and the custom period menu replace browser-default period dropdowns. Changing either clears dependent charts, score, rationale, expectations, actual-versus-expected, recommendations, and point detail until recalculation completes.

### Mesocycle planner

The Templates tab hierarchy is regular workout templates first, Mesocycle Planner second, and Historical Mesocycles last. The planner exposes ten ordered steps: objective; equipment/constraints; current evidence; candidates; portfolio; session distribution; interaction review; confirmation; save planned; activate. `Program Slot` is the selection unit. Planner fields share the same 48-pixel input, border, focus-ring, disabled, pressed, and responsive layout contract. `Top Exercise Candidates` is an active selector: the user chooses the stated number, sees the selected state immediately, and may compare up to three alternatives.

Templates are progressively disclosed for responsiveness. The initial tab shows compact template rows, a compact current-mesocycle summary, and compact history. “Edit template” constructs that template's exercise controls only while open; “Open Planner Review” constructs the candidate, portfolio, session, and validation detail only while requested. Weekly fatigue warnings remain available on Dashboard, and readiness-adjusted coaching is calculated when starting a workout rather than repeated across every template row. Muscle-scope checkboxes update their local draft immediately without rebuilding the full tab after each tap.

The Muscle Groups in Scope control lists every consolidated available group and defaults to all selected. The user may exclude any major or smaller group. The draft confirmation identifies every omission, offers Add to Mesocycle, and requires Keep These Exclusions and Continue before saving the draft as planned. Major groups are explicitly labelled and receive a fuller reason to reconsider; smaller groups use concise optional-goal copy. The UI does not coerce the user after confirmation.

Candidate hierarchy is recommendation badge, exercise name, user-facing role, Predicted Program Effectiveness, Confidence, target muscles, then programming detail. `Why This Recommendation` is the shared expandable detail pattern for role, selection reason, progression, deload/rotation, replacement, and score factors. Internal enum/ID strings must be formatted through `presentationLabel`; raw `mg_*`, snake_case roles, confidence keys, and session IDs are not user copy.

The review shows named session purpose, ordered exercises, roles, sets/reps, direct/indirect volume, target versus actual frequency, high-fatigue compounds, spinal/grip/systemic/local fatigue, duration, placement, substitutions, and severity-labelled findings. Blocking volume, frequency, or consecutive-heavy-pattern findings prevent activation. Historical plans show dates and lifecycle at the bottom of the tab. Never-activated drafts/plans may be deleted after confirmation; completed plans are protected and can be archived. Template cards show `Base Session Intent` only when a stable heavy/light/technique/deload/specialization intent exists and state that today’s readiness may modify execution.

### Recovery and nutrition

### Refined mesocycle construction

Mesocycle purpose uses four compact selectable options. Duration and training-day fields remain bounded numeric inputs, while equipment uses standardized selectable chips rather than free text. The generated summary uses labelled metadata for purpose, duration, calculated basis, frequency, lifecycle dates, and program size.

Omitted muscle groups use collapsed `Why Omitted?` explanations that distinguish indirect stimulus, selected scope, and objective deprioritization. Portfolio entries prioritize exercise name, target muscle, program role, and primary/secondary designation without repeating generic boilerplate. Primary, secondary, and destructive lifecycle actions are visually separated.

Program Slots provides compact jump navigation. Selected exercises render first; alternates return no markup until `View Alternates` is requested, then identify themselves as replacements for the slot selection. Full Program Review is a visually separated stage. Session headings distinguish Day number from workout type/purpose. Blocking volume, frequency, consecutive-heavy-pattern, exercise-count, or working-set findings prevent activation; dense sessions and adjacent-session overlap remain visible review warnings.

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
- **Loading:** Initial persistence/evidence loading occurs before primary use; imports expose progress/error feedback. **NEEDS REVIEW:** there is no unified skeleton/loading design.
- **Error:** Toasts, import validation, API status, persistence fallback, and setup errors are surfaced without exposing secrets.
- **Success:** Live-region toast, completed controls, timer-complete notice, notification tests, submission summary, PR/grade feedback.
- **Confirmation:** Submit, cancel workout, save/cancel history edits, template deletion, and clear-data flows require explicit action.

## Accessibility and responsive behavior

Implemented foundations include semantic `main`/`nav`, button labels, `aria-current`, `aria-live`, accessible card labels, form labels, keyboard-native controls, inert/hidden background during modal sheets, focusable details, safe-area insets, responsive breakpoints at 720/380/350 px, and wrapping long text.

**IMPLEMENTED:** the repository-owned Playwright audit runs axe WCAG A/AA checks, contrast checks, viewport overflow checks, active-navigation assertions, console-error checks, and visual snapshots at a 375 px-class mobile viewport and 1280 px desktop viewport.

**NEEDS REVIEW:** screen-reader walkthroughs, complete keyboard-only workflow coverage, dynamic text-size/native accessibility acceptance, physical safe-area/keyboard overlap, haptics, and system permission UI remain device-level work. Timer sound/vibration are configurable; visual status must remain sufficient without them.

## Weekly UI/UX audit and visual regression

`npm run audit:ui` runs the deterministic browser audit in fresh storage for Workout, Dashboard, Templates, Charts, and Settings in mobile and desktop Chromium. Approved baselines live beside `tests/ui/ui-audit.spec.js`; update them only for an intentional reviewed visual change with `npm run audit:ui:update`. HTML output, traces, screenshots, diffs, JSON results, and `weekly-report.md` are written under `artifacts/ui-audit/` and are not product data.

`.github/workflows/weekly-ui-audit.yml` runs every Monday at 13:17 UTC and supports manual dispatch. It uploads the full artifact directory for 30 days and fails visibly after report upload when any build, route, visual, accessibility, layout, console, source-style, or documentation check fails. The automation does not auto-approve baselines or modify application code. New routes and reusable visual states must be added to this suite in the same change that introduces them.

Current automated coverage does not yet synthesize every workout lifecycle, modal, data-heavy chart, import failure, offline/service-worker transition, or native-only state. Those gaps are **NEEDS REVIEW** and are listed in each weekly report rather than silently passed.

## Terminology and copy conventions

Use “Workout,” “Dashboard,” “Templates,” “Charts,” and “Settings” for primary navigation. Use “working set” versus “warm-up set” precisely. “Today’s readiness” is same-day context; “Today’s plan” is the base/adjusted work. “Go as planned” permits planned progression only when warm-ups support it. “Deload” must state scope. “History” means confirmed submitted workouts. Use lb/kg consistently and show the active unit.

Do not call offline Fitbit export analysis “Fitbit sync,” the nutrition adequacy selector “nutrition tracking,” or installation authorization a user login.
