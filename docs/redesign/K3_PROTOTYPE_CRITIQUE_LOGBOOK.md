# Critique — Direction 1 (Logbook): Rendered Evidence vs. Direction Spec

**Scope:** The three attached renders (`02-mobile-390-today.png`, `03-mobile-390-workout.png`, `04-desktop-progress.png`) reviewed against Direction 1 in `01-K3_DESIGN_DIRECTIONS.md`. Corrections are presentation-only; no product behavior is changed. States not shown (skipped sets, running rest, exception callout, completion screen, Resume/draft) are excluded from judgment and listed as verification items.

## Severity by Review Category

| Category | Worst severity raised | Anchor findings |
| --- | --- | --- |
| Exact rendering (fidelity to specified formats) | **Critical** | C1, C2 |
| Density | **Critical** | C1 |
| Rest-treatment | **Critical** | C2 |
| Hierarchy | **High** | H1, H2 |
| Touch | **High** | H3 |
| State | **High** | H1 |
| Generic-SaaS traces | **Medium** | M4, M5 |
| Typography | **Medium** | M1, M2 |
| Spacing | **Medium** | M5 |
| Accessibility | **Medium** (several items unverifiable from rasters) | M3, verification list |

## Critical

**C1 — The direction's flagship density claim fails. The workout ledger renders ~4 set rows per 844px viewport; spec promises 7–9 and was written to fix a ~2.5-row baseline.**
Root causes, all visible: the `LOGBOOK / Upper A — Strength / Set 3 of 14` masthead (~64px); the second session row (`← Today · EXERCISE 1 OF 4 · Finish`); a display-size three-line exercise title (~110px at ~30px/line vs. the 22px H1 cap); a standalone two-line "Last comparable" block; a separate "Target" line; ~55px completed/pending rows; and a dark bottom dock. Roughly 330px of non-ledger chrome sits above row 1.
*Corrections:*
- Delete the masthead on the workout screen; the sticky session header is one 44px line: `← Today · Barbell Bench Press — Competition Pause · Set 3 of 4 · Finish` (Finish = ghost text button, the only Finish; the title may wrap to two lines max at 15–17px/600, not display type).
- Fold prior and target into the open row's target line exactly as spec'd: `Working · 8–10 reps @ RPE 8 · rest 2:00 · last: 185 lb × 8 @ 8.0 (Jul 31) · working set`. Delete the standalone "Last comparable" block and the separate "Target" line.
- Compress completed/pending rows to exactly 44px: `1 · Warm-up — 135 lb × 8 @ RPE 6 · 10:03 ✓`; `4 · Working — 8–10 reps @ RPE 8 · ⏱ 2:00`.
- Acceptance check: ≥7 set rows visible at 390×844 and 430×932 with the open row expanded.

**C2 — The rest treatment specified for this direction does not exist in the render, and its replacement reintroduces an inherited defect.**
No 3px progress rail at the top of the workout viewport. No text toolbar row (`REST 1:28 / 2:00 — +15s · −15s · Skip`, idle `Start rest · 2:00`, amber `+0:12 over` + "overtime"). Instead an opaque dark bottom dock shows `Pause | 12:46 elapsed | Finish` — it duplicates the Finish that already sits top-right, and it overlays scroll content: the "Next — Chest-Supported Row" separator is visibly clipped beneath it, the exact "dock overlaying scrollable content" defect this direction was supposed to repair.
*Corrections:*
- Add the 3px rail at viewport top (safe-area-aware) and the single text toolbar row; while rest runs, the toolbar replaces the open row's input line in place so layout does not jump.
- Remove the dark dock entirely. Keep exactly one Finish (top-right ghost).
- **Preserve behavior:** if Pause and elapsed session time are existing product behavior, relocate them into the session "⋯" overflow — do not remove the functions.
- Acceptance check: with the next-exercise separator at viewport bottom, no fixed element overlaps it at 390×844 or 430×932.

## High

**H1 — The named regression risk "status duplication if headers re-add state words" is fully realized on all three screens.**
Today