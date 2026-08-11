# Comprehensive Fitness — Three Visual Directions

**Prepared by:** Kimi, visual product and UX design authority
**Date:** 2026-08-08
**North star:** Strong with a quiet spotter — immediate, compact, calm, trustworthy, satisfying under fatigue.
**Status of this document:** PLANNED — design directions for evaluation; nothing here asserts implemented behavior.

---

## 0. Fixed invariants (applies to all three directions)

These are product facts from the governing contract. No direction may violate them; each direction expresses them differently.

**Product boundary**

- Persistent destinations are exactly **Today** and **Progress**. Routines and Settings are contextual and return to Today. Active workout is full-screen and hides persistent navigation.
- No mesocycles, planner UI, dashboards or KPI grids, theme/color-package selectors, numeric fatigue/readiness scores, or normal-progression coaching. Retired routes stay retired.
- One fixed light presentation. No dark mode, no appearance settings group.
- Offline PWA with dependency-free assets: **all directions use system font stacks only** (no webfonts), CSS/DOM presentation, and synthetic fixture data for any prototype work.

**Protected presentation facts**

- Full exercise/variant names wrap; they never truncate.
- Stable set count, roles (warm-up/working), rep range, target RPE, and per-set rest are always visible in the active workout.
- Compact comparable prior performance is shown as fact or as "unavailable" — never inferred.
- Decimal RPE with immediate replacement: a focused `7` becomes `7.5` in one edit without clearing.
- Prefill order: comparable prior set → explicit routine default → blank.
- States (current / completed / pending / skipped / warm-up) are distinguishable **without relying on color**.
- Touch targets ≥ 44px; set inputs keep a 16px font floor on mobile (no iOS focus zoom).
- Start opens the logger directly; readiness is optional and never gates Start, logging, timer, submission, or Progress.
- One shared rest timer: role default, remaining + overtime, adjust, Skip/Finish; survives navigation, reload, and draft recovery.
- Canonical exception only from direct pain/injury or illness records: one plain action, affected scope, one short reason, details on request. No confidence, severity, weights, citations, detectors. Non-diagnostic; never blocks logging.
- Completion: one consequential confirmation → one stored A–F grade, 2–3 factual reasons, ≤3 PR/progress highlights, still-relevant exception if any, Done + contextual Progress actions. No confetti, adherence breakdown, scores, achievement strips, or notification setup.
- Progress: variant selector, recent-default or all-history range, one interpretable chart with inspectable points (date, raw and display load/unit, reps, RPE, role, source session, notes, provenance), chronological history. No sub-view switcher.
- Draft resilience: Back leaves the workout without deleting it; Today exposes Resume; alternate-draft flow offers exactly Resume, Finish, Discard with explicit destructive confirmation.

**Evidence considered**

Real Chromium baselines (this worktree): `04-m9-navigation-candidate.png` (Today, plan-needed state), `05-m2-core-quiet-workout-candidate.png` (active workout, set 3 of 4), `06-m5-unified-progress-candidate.png` (Progress chart + history). Known inherited defects the directions must resolve: duplicated status surfaces, excessive card/elevation chrome, oversized CTAs, weak wide-screen use, a clipped bottom navigation, generic wellness-dashboard styling, inconsistent density, truncated identity text, ambiguous delta chips ("on", "+0.5"), and dock overlaying scrollable content.

---

## Direction 1 — **Logbook**

> *"The page is the workout card."* A density-first, typographic system: ruled lines, tabular numerals, no card chrome. Hierarchy comes from type and rules, not containers.

### Concept

Treat every screen as an entry in a precision paper training log. Cards, shadows, and pills are removed in favor of hairlines and aligned columns. The active workout renders as a true table-like ledger where **7–9 set rows are visible per mobile viewport** (current baseline shows ~2.5). The current set is not a giant colored card; it is the row that is *open for entry*. This is the closest living relative of Strong's logging model, executed with calmer typography and a stricter grid.

### Strengths

- **Fastest logging loop of the three.** Eyes land on the open row; thumb lands on the ✓. Minimal page travel under fatigue; the whole session fits in one or two screens.
- **Best desktop translation.** Column alignment (Set | Target | Last | Entry | Status) persists across exercises at 1440px with no rethinking.
- **Lowest build risk.** Mostly CSS and view-markup restructuring on existing `app-views.js` output; no new components.
- Directly repairs baseline defects: single status line (no duplication), hairlines instead of elevation, right-sized actions, no dock to clip, no wellness-card generica.

### Weaknesses

- Can read as austere or clinical; least emotionally warm of the three.
- Underline inputs are less discoverable to first-time users than boxed fields; mitigated by placeholder pattern and focus rule.
- Density demands strict enforcement of the 44px row floor; visually the rows *look* thinner, so hit-area padding is invisible-by-design and must be audited.

### Emotional target

Competent, serious, unfussy. "Your record is accurate and in order." Trust through restraint.

### Typography

- Labels/UI: system sans (`-apple-system, "Segoe UI", Roboto, sans-serif`), 13–15px, numeric captions 12px.
- Deliberately **sentence-case labels with modest weight steps** (400/600); no all-caps shouting except one 11px tracked eyebrow for the date.
- All quantities (load, reps, RPE, timer, targets, prior) in **tabular numerals** (`font-variant-numeric: tabular-nums` on the system stack, falling back to `ui-monospace` for the rest readout only).
- Value sizes: set facts 15–17px semibold; timer readout 20px tabular; H1 22px/600.

### Spacing

- 4px base grid. Set rows 44px minimum (touch) / 40px desktop. Section gaps 16–24px. One full-width hairline between exercises, half-strength hairlines between sets of one exercise (as in baseline M2, but lighter).
- Content measure: 720px Today/Progress (current contract), 760px active-workout ledger on desktop.

### Color semantics

Near-monochrome ink-on-paper; color is spent only where it carries state:

| Role | Usage |
| --- | --- |
| Current | Blue 3px left tick on the open row + blue focus rule on inputs. Never a filled background. |
| Completed | Green ✓ glyph only; values stay ink. |
| Pending | Secondary ink; hollow marker. |
| Skipped | Muted ink + strikethrough label + slashed hollow marker + the word "Skipped" for assistive tech. |
| Intervention | Amber 3px left tick on the single exception callout. |
| Danger | Red reserved for Discard/clear-data confirmations. |

### Component rules

- **Buttons:** rectangles, 4px radius. Primary = ink-filled ("Start", "Resume", "Finish"), 44px touch / 36px desktop. Secondary = bordered. Tertiary = underlined text links ("Choose another workout", "Log readiness"). No pill CTAs, no glow, no oversized full-bleed blocks.
- **Inputs:** underline ("ruled") fields, 48px tall, right-aligned tabular numerals at 16–17px, trailing unit suffix at 12px secondary ink. Focus thickens the rule to 2px blue. RPE is a text field with `inputmode="decimal"`, select-all-on-focus so `7` → `7.5` is one keystroke; steppers are deliberately absent (typing is the fast path).
- **Set rows:** one line per completed/pending/skipped set: `1 · Top Set — 185 lb × 8 @ 8.0 — 10:06 ✓`. The **current row expands inline** to a 104px editing strip: target line ("Working · 8 reps @ RPE 8 · rest 2:00 · last: 185 lb × 8 @ 8.0" — the "last" segment prints the comparable prior verbatim or "No comparable history"), then one line of three underline inputs, then a 44px ✓ commit button. Incomplete rows expose the per-set rest edit via a small clock glyph at row end.
- **Rest timer:** a 3px progress rail fixed at the top of the workout viewport + one text toolbar row: `REST 1:28 / 2:00 — +15s · −15s · Skip`. Idle state: `Start rest · 2:00`. Overtime: `+0:12 over` in amber with the word "overtime" — shape and text, not color alone.
- **Exception card:** one hairline-bordered callout, amber 3px left tick, single sentence reason + scope, one plain action button, "Details ▸" disclosure. It is visually *quieter* than a set row's open state, signaling it does not gate work.
- **Completion feedback:** the session "closed as a ledger entry": `Workout closed — Public Synthetic A · 46 min`; the grade rendered as a 64px ink-stamped letter inside a double hairline ring (teacher's mark); reasons and highlights as two ruled lists ≤3 entries each; Done as ink primary, "View in Progress" as tertiary link.
- **Charts:** frameless — no card behind the chart. Hairline axes, tabular tick labels, 2px line, open-circle points. Point selection swaps a pinned annotation line *above* the chart (not a floating tooltip): `Jul 15 · 220 lb (display 220 lb) × 8 @ 8.0 · Top Set · Session 01 · imported from Strong`. Selected point fills; others stay hollow.
- **Navigation:** mobile bottom **full-width hairline-topped bar**, two text-centric items with small icons, active item underlined 2px (the current contract's span-viewport fix, kept). Desktop ≥1024px: **fixed 200px left rail** with "Today" / "Progress" stacked; the workout screen replaces it with a minimal session bar (Back to Today · exercise · Finish).

### Screen-by-screen composition

**Today.** Date rule (eyebrow + hairline); H1 = routine name; factual meta line (`5 exercises · 18 sets planned`); exercise preview as a compact ruled table, names wrapping to two lines max; Start primary floated right on the header line; "Choose another workout" and "Log readiness" as underlined links beneath; at most one exception callout. Draft state replaces meta with `In progress — Barbell Bench Press · Set 3 of 6` and swaps Start for Resume (primary) plus Finish / Discard links. Plan-needed state keeps the current hero structure but flattened into the ledger idiom.

**Active workout.** Sticky one-line session header: full exercise name (wraps), `Set 3 of 4`, Finish ghost button right. Below: the ledger — completed rows, open current row, pending rows; exercise separators carry the next exercise's name + target line. Actual-work controls (add/skip/reorder/substitute/rename/role/notes) live in a per-exercise "⋯" overflow pinned at the separator line, never floating over rows.

**Active rest.** Header rail fills left→right; the toolbar row replaces the open row's input line in place (so layout does not jump); Skip primary, Extend/Cut as small bordered buttons.

**Completion.** Centered 720px ledger close: stamp, reason list, highlight list, exception echo if present, Done / View in Progress.

**Progress.** Header block: underline-style variant select (full name), fact line (`8 reps × 220 lb @ RPE 8 · Jul 15`), text-tab range toggle `6 months | All history`. Frameless chart; annotation line on selection. Chronological history as ruled rows, one per session, opening detail inline.

**Routines.** Ruled sections per routine: rows per exercise with role chip (W/Working), target columns aligned into the same table grid as the workout ledger; drag handles at row left; add/duplicate via bordered secondary buttons at section end. (Settings inherits the same idiom: a single ruled list — lb/kg, timer behavior, import/export, clear data, deletion, privacy/support links. No groups cards.)

### State system (exact)

| State | Logbook treatment |
| --- | --- |
| Current | 3px blue left tick; label `3 · Working — now`; inputs open; blue focus rule; caret marker shape (▸) |
| Completed | Green ✓ glyph + filled marker; facts in ink; per-set time right-aligned secondary |
| Pending | Hollow square marker; secondary ink; `4 · Working — 8 reps @ RPE 8` |
| Skipped | Slashed hollow marker; strikethrough label + word "Skipped"; muted |
| Warm-up | Small superscript `W` before set number; never counts as prior-performance evidence |

### Mobile rules

Single column; sticky session header; 16px input floor; rows never below 44px hit area; wrapped exercise names increase row height rather than font shrink; rest rail respects safe-area top when header is sticky.

### Desktop rules

760px centered ledger; persistent column header (Set | Target | Last | Entry | ✓) aligning all exercises into one grid; keyboard-first: Tab flows Load → Reps → RPE → ✓, Enter completes the focused set (presentation-level accelerator; completion still runs the existing logic). Rail nav replaces bottom bar.

### Accessibility

Rows expose list semantics with visually-hidden column headers; every state has a text label ("now", "Skipped") in addition to marker shape; strikethrough is never the only skipped signal; timer in `aria-live="polite"` with 30s throttling; focus is a 2px outline (outline, not ring shadow) so it survives forced-colors; reduced-motion disables rail fill animation and check-draw.

### Motion and reward

Micro only: 180ms check-stroke draw on set completion; rail fills linearly; completion stamp rotates in once (240ms, spring-less). Nothing loops. No confetti (contract), no haptics beyond the single completion tick already supported.

### Implementation constraints

- Presentation-only restructure of existing view output; no logic-module changes (per protected-logic map: workout, timer, exception, grade, history untouched).
- Underline inputs must be verified against iOS zoom (font floor) and against the `7`→`7.5` replacement test.
- Regression risks to watch: **row-height collapse truncating variant suffixes** (forbid ellipsis; assert wrap), **underline fields mistaken for text** (placeholder + focus rule), **density pushing ✓ below 44px** (hit-slop audit), and status duplication if headers re-add state words.
- Root/`www` parity via `npm run sync:web`; service-worker cache advance only if the rendered contract changes.

**Protected-behavior check:** preserves set order/roles, prior-performance identity, per-set rest edit, immediate RPE replacement, Back-keeps-draft, canonical exception, grade rendering, exact-variant Progress. **Named regression risks:** legibility of skipped strikethrough on long names; keyboard Enter-complete must never bypass the existing completion path.

---

## Direction 2 — **Spotter Cards**

> *"One set has your attention."* A staged, medium-low-density system: a single dominant card per moment; everything else recedes into chips, queues, and a floating dock.

### Concept

The app behaves like a quiet coach holding one card up at a time. The active workout foregrounds **only the current set as a large calm card** with big numerals and stepper tiles; completed sets compress into a horizontal chip strip; upcoming sets become two ghost lines plus an overflow count; further exercises collapse to a footer list. Today is a statement of intent with a gentle vertical action stack. Rest is a bottom "ballast" bar that is the second-most-prominent object whenever it exists. This is the calmest and most guided direction — guidance is *presentation* (staging, wording, focus), never new logic.

### Strengths

- **Lowest cognitive load under fatigue:** one decision surface visible at a time; targets are the largest of the three (96px input tiles).
- Best one-handed reach model on phone sizes: commit control and rest controls live in the lower half.
- Strong emotional reassurance for returning or anxious users; errors are hard to make because only the current set is editable inline.
- Fixes the generic-wellness feel by *radical simplification* rather than styling.

### Weaknesses

- **Slowest for high-volume sessions:** a 24-set day requires travel; chip strips hide per-set facts behind a tap.
- Floating dock is precisely the element that clipped in the inherited baseline; it must be engineered against safe-area and height clipping rather than assumed safe.
- Reduced persistent visibility of targets/priors (they live on the card only for the current set) risks weakening the "stable targets always visible" property for pending sets — mitigated by keeping target lines on ghost rows, but it needs rendered verification.

### Emotional target

Held, guided, encouraged. "Just this set. We'll tell you what's next when it's time."

### Typography

- Humanist system sans; sentence-case; friendly reading sizes: body 16–17px, card values 40–48px for the big three inputs, timer 34px.
- No small caps except an 11px tracked eyebrow on the card ("NOW — SET 3 OF 4", mirroring the baseline's eyebrow language but consistent app-wide).
- Numerals default tabular within inputs; display numerals (timer, page titles) may use proportional with fixed-width via `tabular-nums` anyway to prevent jitter.

### Spacing

- 8px base grid; generous card padding (20–24px); viewport margins 16px mobile / auto-centered 560px card column on desktop within a max 1080px canvas.
- Fewer elements per viewport is the point: target ~1 primary card + 1 strip + 1 queue on screen.

### Color semantics

Soft tinted surfaces carry state (the only direction that uses fills):

| Role | Usage |
| --- | --- |
| Current | Blue 6% tint card + 3px top accent bar + "now" chip with dot icon |
| Completed | Green 8% tint chip + ✓ icon + text |
| Pending | Neutral gray surface, no tint |
| Skipped | Gray wash + slash-through chip + "(skipped)" text |
| Intervention | Warm amber tint card + icon (the only other tinted surface — keeps it findable) |
| Danger | Red text on the destructive confirmation sheet only |

Text/background pairs must pass WCAG AA at the tint strengths chosen; tints are decorative reinforcement, never the sole signal (icon + text ride along).

### Component rules

- **Buttons:** pill-shaped. Primary = solid ink pill, 52px, full card width ("✓ Complete set"); secondary = ghost pill (outline only); tertiary = plain text link. Finish is a quiet top-right text button in the session bar, not a giant block (fixes the baseline's oversized FINISH).
- **Inputs:** **stepper tiles** — 96px-tall rounded tiles (16px radius) with a centered real input (inputmode decimal/numeric, select-all-on-focus, 16px+ font) flanked by embedded −/+ steppers at the tile's left and right edges (44px zones; RPE steps 0.5, reps 1, load by unit increment). Tiles labeled LOAD / REPS / RPE in 11px eyebrow. Whole tile tap focuses the field; steppers are additive convenience.
- **Set rows (staged, not tabular):**
  - Completed → 40px chips in a wrap-safe strip: `1 ✓ 185×8 @ 8.0` (tap opens a fact sheet with that set's facts and its rest value).
  - Current → the card: eyebrow `NOW — SET 3 OF 4 · WORKING`; target line `8 reps @ RPE 8 · rest 2:00`; prior line `Last time: 185 lb × 8 @ 8.0` or `No comparable history`; three tiles; primary pill below.
  - Pending → two ghost lines (`4 · Working — 8 reps @ RPE 8 · rests 2:00`) each with a small clock control for per-set rest editing, then `+1 more set`.
  - Skipped → a chip in the strip with slash + `(skipped)`.
  - Warm-up → chips/lines prefixed `W1`, `W2`.
- **Rest timer:** **bottom ballast bar**, 64px, safe-area-anchored inside the workout screen (not inside the dock — the dock is hidden during workouts): large readout left (`1:28`), `−15 +15` small pills center, `Skip` ghost right. Background is the 3px fill sweep at bar bottom. Idle: `Start rest · 2:00`. Overtime: readout turns amber with `+0:12 overtime` text.
- **Exception card:** the one fully-soft card: warm tint, 20px radius, icon + scope + one-sentence reason + **one plain action button** + "Why am I seeing this?" disclosure. It never covers inputs; it sits above the queue.
- **Completion feedback:** centered single column: 96px grade medallion (letter in a soft ring), 2–3 reasons as plain text, ≤3 highlight chips ("New top-set load — 220 lb × 8"), exception echo if present, Done pill, "See in Progress" ghost. Reward = one scale-pop (200ms) + the existing completion haptic. No confetti.
- **Charts:** one soft card; 3px smooth line, 10px points with 44px touch expansion; selecting a point opens a **bottom sheet** listing the point's facts with hairline dividers (date, raw/display load+unit, reps, RPE, role, source session, notes, provenance). Range toggle is a segmented pill (Recent 6 months / All history) — presentation of the existing contract's two-choice range, not a new switcher.
- **Navigation:** bottom **floating dock** (the direction's signature surface), 56px tall, max-width 400px centered, two destinations with icon+label, active destination gains a filled bubble behind its label. **Anti-clip engineering ( explicit, because the baseline clipped):** dock height + safe-area inset + 8px offset budgeted into the page padding-bottom; container positioned with `left/right` constraints (no transform beyond container bounds); re-measured at 844px and 932px heights; falls back to the full-width hairline bar (Direction 1 style) if computed viewport height minus safe area is below 480px. Desktop ≥1024px: the dock pins to the same bottom-center position; content columns widen around it.

### Screen-by-screen composition

**Today.** Eyebrow date; H1 routine name; exercise preview as 3 minimal lines (`Barbell Bench Press — 4 × 8 @ RPE 8`) + `+2 more`; one large Start pill; then quiet stacked text links: Choose another workout · Log readiness. Draft: hero swaps to `Workout in progress — Set 3 of 6` with Resume pill and Finish/Discard text links (Discard → explicit sheet). One exception card max, below actions.

**Active workout.** Top: session bar (Back to Today · workout name · Finish). Under it: exercise title (full, wrapping) + target line; completed chip strip; **the card**; pending ghost lines; remaining exercises as a collapsed footer list with drag handles and "⋯" per-exercise menus (add/skip/substitute/rename/role/notes/reorder). Ballast bar pinned above safe-area bottom.

**Active rest.** Ballast stays (it *is* the rest control); the card dims to 60% and its primary pill swaps to `Skip rest → Set 4`, so there is exactly one obvious next action; editing previous chips remains possible (rest never locks the log).

**Completion.** Medallion column as above, on the plain background (no dashboard scaffolding).

**Progress.** Selector card (variant name full-width, "Change lift" as a text button opening the existing picker); range segmented pill; chart card with sheet-based inspection; chronological history as soft cards, one per session, expanding inline.

**Routines.** One card per routine; roomy 56px rows with role pill, target text, drag handle; duplicate at card foot; edit reveals inline rows for names, variants, set counts, rep min/max, RPE, rest. (Settings: one soft card containing a flat list of the contract's items; no graveyard, no cloud-copy.)

### State system (exact)

| State | Spotter Cards treatment |
| --- | --- |
| Current | Tinted card, top accent bar, "NOW — SET n OF m" eyebrow, editable |
| Completed | Green chip: `n ✓ facts`, tap → fact sheet |
| Pending | Untinted ghost line with target + per-set rest clock control |
| Skipped | Slashed chip + `(skipped)` text in the completed strip position |
| Warm-up | `W{n}` prefix on chip/line; excluded from prior-performance evidence |

### Mobile rules

Card column is the viewport width minus 16px margins; chip strip scrolls horizontally with scroll-snap; tiles never shrink below 88px; steppers keep 44px zones; ballast respects gesture bar; the dock disappears the moment a workout starts (full-screen contract).

### Desktop rules

Two-plane composition: card column (max 560px) left; session overview column (exercise list with chip strips, notes, menus) right, sticky at 1440px. Ballast spans the card column only. Keyboard: full Tab loop through tiles → pill; Enter commits; sheet/dialog focus-trapping per contract.

### Accessibility

Chips are buttons with full accessible names ("Set 3 completed, 185 pounds, 8 reps, RPE 8 point five"); ghost lines are real list items — nothing important is presentation-hidden; card transitions move focus to the new current set's first tile and announce `Set 4 of 4, Working`; sheets trap and restore focus; tints are always paired with icon + text; reduced-motion removes the pop and the fill sweep.

### Motion and reward

Card swap: 220ms crossfade-with-4px-rise; chip appears with a 160ms settle; ballast fill sweeps linearly; completion medallion one-time scale-pop. All disabled under reduced-motion. Reward is modal and singular; nothing confetti-like, nothing looping.

### Implementation constraints

- New composite components (tile, chip strip, ballast, dock) but **zero logic changes**; tiles wrap the existing input contract including the RPE replacement test.
- Highest visual-regression surface area of the three.
- Regression risks to watch: **dock clipping regression** (the exact inherited defect — must be re-verified at 390×844 and 430×932), **chip strip hiding per-set rest editing** (spec'd on ghost lines + fact sheets; verify), **pending-set targets demoted below the fold** (assert ghost lines visible without scroll at 844px), and staging transitions interfering with exercise-link round-trip scroll restoration.

**Protected-behavior check:** identical set facts/order/roles, prior-performance identity (printed on the card; unavailable shown as unavailable), per-set rest editing on incomplete sets, draft/Back behavior, exception singularity, grade + reasons + highlights only, Progress facts intact. **Named regression risks:** vertical travel time for long sessions; accidental stepper taps near the primary pill (spacing audit required).

---

## Direction 3 — **Session Spine**

> *"You always know where you are."* An orientation-first, asymmetric composition: a persistent vertical rail (the spine) encodes session structure and progress on every screen.

### Concept

A slim spine runs along the left edge of the app. On Today it carries one tick per expected exercise; in the workout it carries one tick per set, grouped by exercise, with the current set ringed and completed sets filled; during rest, the current segment *fills with time*. Content lives in a focus plane to the right of the spine. On desktop the spine expands into a 280px aside containing the full session map (exercise blocks with per-set tick grids, notes entry). Navigation moves **to the top** as a quiet text bar, leaving the mobile bottom edge free for rest and Finish controls — a genuinely different navigation treatment justified by the workout's vertical rhythm. Coaching presence is a **margin note** pinned to the spine at the affected exercise: a spotter standing at the rail.

### Strengths

- **Best sense of position and progress** of the three; the session reads as one artifact with a beginning and an end.
- Rest timing becomes *structural* (the spine fills) rather than another floating widget — directly serves "persistent rest" comprehension.
- Desktop split-plane is the strongest wide-screen story without inventing dashboards.
- Margin-note exception model is the most literal reading of