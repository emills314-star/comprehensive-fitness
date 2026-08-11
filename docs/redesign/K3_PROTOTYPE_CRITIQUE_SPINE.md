# Direction 3 — Session Spine: rendered critique

**Inputs reviewed:** `02-mobile-390-today.png`, `03-mobile-390-workout.png`, `04-desktop-progress.png`, checked against `K3_DESIGN_DIRECTIONS.md` Section 0 (fixed invariants) and the Direction 3 concept/strengths text. **Scope caveat:** the provided file truncates mid-way through Direction 3's Strengths section, so its component/state tables could not be cited; anything depending on them is labeled accordingly. All findings are presentation-level; no product behavior is asked to change.

## What rendered true (preserve)

- Full exercise names wrap on both mobile frames; no truncation ("Barbell Bench Press — Competition Pause").
- Decimal RPE intact: current row shows `7.5`, a completed row shows `RPE 8.5`.
- Stable target fact line present on current and pending rows (`8–10 reps · RPE 8 · ⏱ 2:00`).
- Prior performance rendered as fact (`185 lb × 8 @ RPE 8 · Jul 31 · working set`), not inferred.
- Roles labeled in words (Warm-up / Working); current row carries `· now`, pending row carries `Upcoming` — states survive without color.
- Progress history is strictly chronological with grade facts (A, A–, B+); no sub-view switcher.
- Persistent destinations remain exactly Today and Progress.

---

## Critical

### C1 — The spine does not encode the session (exact rendering / state / rest-treatment)
In the workout frame the spine renders a few large hollow circles at exercise-block heights — not one tick per set grouped by exercise; the current set is not ringed; the lowest tick collides with the clipped "Next" block. On Today the spine duplicates the `1–4` numerals it floats beside. The direction's premise ("one tick per set… the current set ringed… during rest, the current segment fills with time") is absent from both mobile frames.
**Correction:** one tick per set, tightly grouped within an exercise, wider gap between exercises; current set gets a distinct **ring shape** alongside the existing `· now` text; completed ticks become filled **shapes**, not color alone; each tick vertically centered on its row; rest renders as fill inside the current tick. On Today, drop the numerals and let ticks carry order (or vice versa) — never both.

### C2 — Rest is absent where it must be structural (rest-treatment / hierarchy)
The bottom edge is occupied by `Pause · 12:46 elapsed · Finish` while no rest surface exists anywhere in the frame: no remaining/total readout, no `+15s/−15s` adjust, no Skip, no role default, no overtime treatment. Section 0 requires exactly one shared rest timer with those elements; Direction 3's entire navigation argument ("top nav leaves the bottom edge free for rest and Finish") depends on this bar. (The screenshot may be pre-rest; the dock's composition is still wrong for the rest state.)
**Correction:** the bottom bar carries the rest contract when rest exists — `1:28 / 2:00`, bordered `−15s · +15s`, Skip as the primary action — and collapses to an idle `Start rest · 2:00` otherwise. Overtime shows `+0:12 over` in amber **with the word "overtime"** (shape and text, not color alone). Elapsed time, if kept, is a small session-bar fact, never a dock peer.

### C3 — Duplicate Finish; uncontracted Pause (state / hierarchy / behavior)
`Finish` renders twice in one viewport (session bar top-right; dock right). `Pause` has no Section 0 basis — draft resilience is Back/Resume, and pause semantics are not in the contract. Duplicate consequential actions are precisely the inherited "duplicated status surfaces" defect.
**Correction:** exactly one Finish, in the session bar. Remove `Pause` from chrome. **NEEDS REVIEW:** if any existing logic maps to "Pause," it must surface as the existing draft behavior, not a new action.

### C4 — Progress chart is unusable at 1440px (exact rendering / density / spacing)
The chart card is ≈100px wide: the annotation block consumes half of it, x-axis labels collide into `FebAprJunAug`, and points touch edge-to-edge. The annotation omits most contract fields — it shows `190 lb × 8 @ 8.0 · Aug 8 · +5 lb from prior` but no raw-vs-display load/unit, role, source session, notes, or provenance. Meanwhile ~350px at the right of the canvas and a large void under `PERFORMANCE` go unused. Weak wide-screen use — a named inherited defect — persists.
**Correction:** the chart spans the focus plane (≥600px at 1440); the annotation becomes one pinned line **above** the plot carrying the full contract fact string (date · raw load+unit · display load+unit · reps · RPE · role · source session · notes · provenance); axis labels get collision rules (auto-thinning/abbreviation); the selected point fills, others stay hollow.

---

## High

### H1 — "Ready / Your work is set." hero card implies a gate (hierarchy / state / generic-SaaS)
A tinted panel welding the word **Ready** to the Start button puts readiness-adjacent status language directly on the one action Section 0 says readiness may never gate; the wellness-hero styling is also the inherited generic-dashboard defect.
**Correction:** delete "Ready," the copy line, and the tinted card. Start is one right-sized primary button on the meta line; meta stays factual (`4 exercises · 14 sets planned`). Restore the missing `Log readiness` as a quiet text link beneath Start — optional, visible, silent.

### H2 — Three stacked headers before the first set row (hierarchy / density)
Workout stacks: app header (`Upper A — Strength · Set 3 of 14`) → session bar (`← Today · EXERCISE 1 OF 4 · Finish`) → three-line ~28px exercise title → two boxed prior rows → target row. Position is stated twice in chrome (`Set 3 of 14` and `EXERCISE 1 OF 4`) plus a third time in-row (`3 · Working · now`); the first set row starts ~450px deep at 844px height.
**Correction:** one session bar — `← Today · Barbell Bench Press — Competition Pause · Set 3 of 14 · Finish`; exercise title at content size (17–20px semibold, wraps); exactly one position statement in chrome.

### H3 — Mobile bottom bar contradicts the direction's own navigation treatment (exact rendering / spacing)
Direction 3 specifies "Navigation moves to the top as a quiet text bar, leaving the mobile bottom edge free for rest and Finish controls." The render keeps a two-item bottom bar on Today *and* a top brand bar — two navigation surfaces on a 390×844 screen, with the bottom edge unavailable to the rest model (see C2).
**Correction:** the top bar becomes the two-destination text nav (Today · Progress, active underlined) with `•••` for contextual entries; the mobile bottom bar is removed. If retention is an adjudicated deviation, label it **NEEDS REVIEW**.

### H4 — Per-set rest editing is not visibly exposed on pending rows (state / touch)
The pending row's `⏱ 2:00` sits inline in the target string with no control affordance — it reads as text. Section 0 keeps per-set rest always visible, and user overrides are protected behavior; an affordance-free glyph fails the override path.
**Correction:** rest on incomplete rows is a real control — clock glyph + value, ≥44px hit area, visible focus/disabled states — visually distinct from the static target line on the committed rows.

### H5 — No identifiable variant selector; "Working sets" is an uncontracted control (state / exact rendering)
On Progress the exercise name is display text only — no way to change variant is visible. Beside `Last 6 months⌄` sits `Working sets⌄`; Section 0 specifies a variant selector plus a two-state range (recent-default / all history). A role filter is not in the contract. **NEEDS REVIEW:** if "Working sets" *is* the variant selector it is mislabeled; if it is a role filter it is new surface.
**Correction:** variant selector = one full-width underline-style select showing the complete exact-variant name; range = compact two-choice text toggle (`Last 6 months · All history`). Remove or formally adjudicate the role filter.

### H6 — Prior-performance block mimics disabled form fields (generic-SaaS / hierarchy)
`Last comparable …` and `Jul 31 · working set` sit in two stacked hairline-outlined boxes that read as empty inputs. Prior performance is fact, not form.
**Correction:** one compact fact line, no boxes: `Last time: 185 lb × 8 @ 8.0 — Jul 31 · working set`; wrap permitted, box never.

---

## Medium

- **M1 (accessibility / state):** 20px hollow spine rings beside numbered rows mimic radio inputs. Make ticks 8–10px discs, `aria-hidden`, with a visually-hidden structural label ("Exercise 3 of 4, pending") carried on the row, not the tick.
- **M2 (accessibility / typography):** secondary ink (`Jul 31 · working set`, `Upcoming`, meta lines) is mid-gray on the warm paper ground at ~13px — verify ≥4.5:1; darken muted ink rather than enlarging.
- **M3 (density / typography):** the display-size exercise title consumes ~150px; Today's eyebrow + H1 + hero push the exercise list below the first ~40% of the viewport. Cap the workout title at 17–20px and Today's H1 near 22px; the exercise table should begin within the first viewport half at 844px.
- **M4 (typography / exact rendering):** `Latest qualifying set` is undefined jargon; `+5 lb from prior` names no prior — a cousin of the inherited ambiguous-delta defect. Use `Latest working set — 190 lb × 8 @ 8.0` and anchor deltas: `+5 lb vs Jul 31`.
- **M5 (generic-SaaS / density):** `Last 6 months⌄` / `Working sets⌄` render as ~140×120px pale cards — oversized, input-like. Compact underline selects or text tabs at 44px tall.
- **M6 (spacing / exact rendering):** the desktop rail is ~90px of mostly empty width with nav items floating mid-height; the promised desktop session-map aside is absent while its width cost is paid. Either slim the rail to its honest nav width or deliver the aside only where a session exists.
- **M7 (exact rendering):** history rows lead with routine name (`Upper A — Strength`) inside an exact-variant view. Show the variant's per-session set facts first; routine name demoted to secondary context.

## Low

- **L1 (spacing):** the "Next — Chest-Supported Row" preview is clipped by the viewport bottom with a spine tick overlapping it; clip previews cleanly or omit within the fold.
- **L2 (hierarchy):** `Choose another workout` carries near-primary full-width bordered weight, and `Log readiness` is absent; both should be quiet text links under Start.
- **L3 (generic-SaaS):** the persistent `CF` logo + `SESSION SPINE` eyebrow + `•••` header is brand chrome duplicating the destination label beneath it; keep the text destination only.
- **L4 (typography):** confirm tabular numerals on the elapsed/timer readouts — jitter cannot be judged from statics.
- **L5 (state):** desktop top bar exposes `Routines` while mobile buries it in `•••`; confirm it remains contextual and returns to Today, and does not drift into a third persistent destination.
- **L6 (touch):** 44px chart-point touch expansion is unverifiable statically; verify before any approval.

## Generic-SaaS assessment (rollup)
Four inherited generica patterns persist: branded logo/wordmark/menu header, tinted hero panel with praise copy, bordered fact boxes, oversized pale selector cards. The direction's differentiating assets — the per-set spine, top text nav, structural rest — are exactly the parts not rendered; what remains is the generic shell.

## Accessibility assessment (rollup)
Non-color state signals are present and worth protecting (`· now`, `Upcoming`, role words, grade letters). Gaps: tick/row misalignment breaks the spine's spatial state story (C1); ticks mimic radios (M1); secondary-ink contrast unverified on the warm ground (M2); rest `aria-live` behavior unverifiable with no rest frame; chart inspection unproven at this width (C4); forced-colors behavior of the tinted current row unchecked — the `· now` text currently saves it and must never be removed.

## Highest-ROI list

1. **Fix the Progress chart width and annotation contract (C4).** Largest trust and rendering failure; layout + one annotation template.
2. **One Finish, no Pause, dock rebuilt as the real rest contract (C2/C3).** A single component change resolves the behavior-contract, duplication, and rest-treatment gaps together.
3. **Flatten the Today hero (H1).** Removing "Ready"/the tinted card eliminates both the gate-implying language and the strongest wellness signal; right-size Start and restore the `Log readiness` link.
4. **Collapse the workout header stack (H2).** One session bar + content-size title recovers ~200px of logging viewport at 844px.
5. **Make the spine per-set or remove it (C1).** Grouped per-set ticks, ringed current, filled completed — or a deliberately simple progress rule. A decorative spine is worse than none.
6. **Replace the two giant Progress control tiles (H5/M5) and expose per-set rest editing as a real control on pending rows (H4).**

**Protected-behavior check:** every correction is presentation-only — set facts, order, roles, prior-performance identity, prefill order, decimal-RPE entry (`7` → `7.5`), draft/back semantics, timer logic, the canonical exception, grade rendering, and exact-variant Progress facts are untouched. **Open NEEDS REVIEW items:** the `Pause` action's logic basis (C3), the `Working sets` control's contract basis (H5), and any adjudicated decision to keep a mobile bottom bar despite the direction's top-nav treatment (H3).