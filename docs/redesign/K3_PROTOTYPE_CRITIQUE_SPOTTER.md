# Design Review — Direction 2 (Spotter Cards): Rendered Critique

**Evidence:** `02-mobile-390-today.png`, `03-mobile-390-workout.png`, `04-desktop-progress.png` against Direction 2 in `01-K3_DESIGN_DIRECTIONS.md`.
**Scope:** Presentation only. Every correction below re-renders existing contract elements; no logic, schema, copy-contract, or flow changes. Static screenshots cannot prove focus traps, motion, or tab flow — those are flagged as unverified.

---

## 1. What renders correctly (preserve)

- Prior performance rendered verbatim with date and role: "Last comparable **185 lb × 8 @ RPE 8** / Jul 31 · working set". Exact-variant identity intact.
- Decimal RPE (**7.5**) rendered in the RPE tile; target line carries rep **range** (8–10), RPE 8, and per-set rest (2:00).
- Full exercise name wraps ("Barbell Bench Press — Competition Pause", 3 lines) — no truncation.
- Dock correctly disappears during the full-screen workout; pending ghost line carries the per-set rest clock control.
- Delta copy is unambiguous: "+5 lb from prior" (fixes the inherited "on / +0.5" defect class).
- Chart: soft card, 3px smooth line, open-circle points, hairline grid — matches the direction.

---

## 2. Issues, ranked

### Critical

**C1 — Floating dock clips content at 390×844 (Today). *(exact rendering, spacing, touch)***
"Log readiness" is sliced mid-glyph behind the dock; "Choose another workout" is not visible at all. This is the precise inherited defect Direction 2 named as must-fix, failing at the exact viewport the spec calls out (844px).
**Fix:** budget `padding-bottom = 56px dock + safe-area inset + 8px` on the page; the two text links must sit fully above the dock without scroll at 844px. Re-verify at 932px and at the <480px fallback to the full-width hairline bar.

**C2 — Rest ballast bar absent in the idle workout; its slot is occupied by unspec'd chrome. *(rest-treatment, hierarchy)***
Direction 2 defines the ballast as "the second-most-prominent object whenever it exists," with an idle state (`Start rest · 2:00`). The render shows no ballast at all; instead the bottom edge carries a `Pause · 12:46 elapsed · Finish` bar that appears nowhere in the direction. Rest is unreachable from the logged-set state as rendered.
**Fix:** mount the 64px ballast above the safe area: left readout/`Start rest · 2:00`, center `−15 +15` small pills, right `Skip` ghost; 3px fill sweep at its base. Delete the Pause/elapsed/Finish bar entirely (Back-keeps-draft already covers interruption; contract has no pause control).

### High

**H1 — Completed chips carry no facts. *(state, exact rendering, named regression realized)***
Spec: `1 ✓ 185×8 @ 8.0` per chip. Render: bare `1 ✓` and `2 ✓` rounds. Everything the user actually lifted vanishes from the session screen — the direction's self-identified weakness is worse than specced, and "compact comparable" recorded work is gone.
**Fix:** chips are 40px-tall (44px hit-slop) text chips: set number, ✓, `load×reps @ rpe`, wrap-safe strip with scroll-snap.

**H2 — Duplicated Finish and duplicated session context. *(hierarchy, exact rendering)***
"Finish" appears top-right of the session bar *and* in the bottom bar. Above that, a brand header (CF avatar, "SPOTTER CARDS", routine name, "Set 3 of 14", ⋯) duplicates the session bar's job — two stacked headers inside a supposed full-screen workout, re-creating the baseline's duplicated-surface defect.
**Fix:** in the workout, the session bar (Back to Today · workout name · Finish) *is* the top bar. One Finish, text-weight, top-right. Remove the global header and the bottom bar.

**H3 — Progress renders no variant selector. *(hierarchy, exact rendering, contract surface)***
Spec: selector card with full variant name + "Change lift" text button opening the existing picker. Render: the variant name is only a static H1. As rendered, the user cannot change which variant they are inspecting.
**Fix:** add the selector card above the range control; if the picker is reachable elsewhere within one tap, demote this to Medium — otherwise it blocks a contract-required Progress task and belongs at Critical.

**H4 — Dock geometry ignores its own spec on both breakpoints. *(exact rendering)***
Spec: 56px tall, **max-width 400px**, centered. Render: ~95% viewport width at 390px and effectively full-width at 1440px — a giant footer slab, the opposite of the signature floating capsule, and the thing that makes the desktop look emptier.
**Fix:** clamp container to `min(400px, 100vw − 32px)`; center with left/right constraints, no transforms; modest filled bubble behind the active label only (current bubble spans ~half the dock).

**H5 — Readiness is not silent on Today. *(hierarchy, state, product boundary)***
"Ready" (blue label) + "Your work is set." headline sit *above* Start inside the card. Boundary: readiness is recorded but remains silent and nonblocking; Direction 2's Today spec contains no readiness block — only the "Log readiness" text link. The render also spends the blue "current" semantic on a readiness label.
**Fix:** remove the Ready/headline block from the card; keep "Log readiness" as a quiet stacked text link below Start. If readiness was recorded, it surfaces nowhere on Today per contract.

### Medium

**M1 — Primary pill is blue, not ink. *(generic-SaaS, exact rendering)***
Direction 2 primaries are solid ink pills; blue is reserved for the current-state tint/accent. Today's "Start workout" is ink; the workout's "Complete set" is bright blue — internally inconsistent and the single strongest generic-SaaS signal in the set.
**Fix:** all primaries ink-filled; blue appears only as the current card's tint + top accent + focus rule.

**M2 — Stepper tiles missing their steppers; numerals undersized. *(touch, typography, exact rendering)***
Render: three plain tiles (`185 / 8 / 7.5`) with no −/+ edge zones; numerals ≈30px against the specced 40–48px in 96px tiles. The direction's headline promise ("largest targets of the three") is unmet, and the additive stepper convenience is absent.
**Fix:** 96px tiles, 16px radius, 44px embedded −/+ zones at tile edges (RPE 0.5, reps 1, load by unit), value 40–48px tabular, whole-tile tap focuses a real input with select-all-on-focus (preserves the `7` → `7.5` contract).

**M3 — Current-set card identity is off-spec. *(exact rendering, state)***
Render: full blue outline ring + overall tint. Spec: 6% tint card + **3px top accent bar** + "now" chip with dot. The outline reads as a focus/selected state, not a "current" state. Also missing: the `NOW — SET 3 OF 4 · WORKING` eyebrow — the card shows a bare "3" and "Working · now", while the header counts globally ("Set 3 of 14"), so per-exercise position ("of 4") never appears where the work happens.
**Fix:** drop the ring; paint the 3px top accent; add the eyebrow in 11px tracked caps with per-exercise set position; keep "now" as chip + dot + word.

**M4 — Today preview is 3× too tall and wrongly formatted. *(density, spacing)***
Spec: three single-line previews (`Barbell Bench Press — 4 × 8 @ RPE 8`) + `+2 more`. Render: four entries × 3 lines each (name / `4 × 8` / `RPE 8`) — twelve lines that push the text links under the dock (feeds C1).
**Fix:** one line per exercise, `name — sets × reps @ RPE n`, names wrapping to two lines max if needed; cap at 3 + `+N more`; targets on one line.

**M5 — Progress controls deviate and duplicate. *(exact rendering, hierarchy)***
(a) Range is a dropdown pill ("Last 6 months⌄") instead of the specced segmented pill (Recent 6 months | All history) — the dropdown hides the alternative the contract wants visible as two choices. (b) An unspec'd "Working sets⌄" role filter adds a contract-external analytic selector. (c) An "All history" link on the history panel duplicates the range control's semantics in a second idiom.
**Fix:** segmented pill for range; delete the role filter and the panel link.

**M6 — Chart has no y-axis labels. *(chart behavior, accessibility)***
Values are readable only via the header fact or inspection. "One interpretable chart" requires at least minimal y tick labels (tabular numerals).
**Fix:** 2–3 hairline y ticks with load-unit labels; keep frameless-card composition. Bottom-sheet point inspection (with provenance fields) is **unverified** from a static render — needs interaction check.

**M7 — Touch targets below 44px. *(touch, accessibility)***
Completed chips render ≈32–36px rounds (even the spec's 40px chip needs hit-slop to reach the 44px invariant); the ghost-line rest clock glyph is ≈20px.
**Fix:** chip hit area 44px via padding; clock control a 44px icon-button; audit Start pill height against the 52px spec (renders ≈48px and hugs text instead of spanning card width).

**M8 — Secondary-text contrast is borderline. *(accessibility)***
Meta lines ("Saturday · August 8", "4 exercises · 14 sets · about 58 minutes"), ghost-line text, and "Latest qualifying set" captions render as mid-gray at 13–14px. Verify 4.5:1 at tint strengths; darken toward the body-ink ramp if short.

### Low

- **L1 *(state, spacing)*:** Ghost line wraps "2:00" onto an orphan line; the "Upcoming" chip on the pending line is an extra state word the spec doesn't ask for — pending is already signaled by ghost styling + position. Fix: keep the ghost line on one line (`4 · Working — 8–10 reps · RPE 8 · rest 2:00`) and drop the chip.
- **L2 *(generic-SaaS)*:** "12:46 elapsed" is an unspec'd session clock; remove with the bottom bar. Iconography is incoherent: Today gets a literal "•", Progress an "↗" (an external-link metaphor for a primary destination), and the rest clock is a system emoji (platform-variable rendering). Fix: one drawn icon set or text-only items; replace the emoji with a drawn clock glyph.
- **L3 *(exact rendering)*:** History renders as flat rows in a panel, not "soft cards, one per session, expanding inline". Grade chips (A / A− / B+) are factual and fine; convert rows to the soft-card idiom with inline expansion.
- **L4 *(spacing, generic-SaaS)*:** The branded header block (avatar + "SPOTTER CARDS" + ⋯) consumes ~64px on every mobile screen and duplicates the page eyebrow/H1; on desktop the empty side rails plus full-width dock exaggerate the void (canvas stays ~700px against the specced 1080 max). Fix: slim the header to the eyebrow line; widen Progress columns toward the 1080px canvas budget.
- **L5 *(typography, unverified)*:** System-stack-only usage, `tabular-nums` on numerals, timer jitter control — not provable from images. **NEEDS REVIEW** in code/interaction pass.

**Unverified from static renders (do not claim without interaction evidence):** chip fact-sheet open/close and accessible names; card-swap focus move + `Set n of m` announcement; sheet focus trap/restore; ballast overtime state (`+0:12 overtime` in amber with text); reduced-motion removal of the pop and sweep; iOS input focus zoom at the 16px font floor; dock clip at 430×932; skipped-state chip rendering and warm-up `W{n}` prefixes (neither state appears in any provided screen).

---

## 3. Highest-ROI corrections (in order)

1. **Fix dock physics (C1, H4):** padding-bottom budget + 400px max-width clamp; Today's links fully visible at 844px. One change kills the flagship regression and the desktop's worst proportion problem.
2. **Restore the ballast, delete the Pause/elapsed/Finish bar (C2, H2):** rest becomes reachable, Finish becomes singular, and ~56px returns to the workout.
3. **Put facts back in the completed chips (H1, M7):** `n ✓ 185×8 @ 8.0` at 44px hit area — restores trust in recorded work for the cost of chip text.
4. **Rebuild the Progress control row (H3, M5, M6):** selector card + segmented range pill, delete the role filter and duplicate link, add y-axis tick labels.
5. **Silence readiness and compress Today (H5, M4):** remove the Ready hero; one-line previews with `+N more`; Start becomes the single dominant 52px ink pill, full card width.
6. **Conform the current-set card (C2-adjacent, M1–M3):** top accent bar instead of the blue ring, `NOW — SET n OF m · ROLE` eyebrow, ink "Complete set", 96px tiles with steppers and 40–48px numerals.

Items 1–4 together are roughly half the flagged severity mass and are all CSS/markup restructuring on existing surfaces — no protected behavior (set facts, order, roles, prior identity, rest editing, draft semantics, grades, Progress facts) needs to move.