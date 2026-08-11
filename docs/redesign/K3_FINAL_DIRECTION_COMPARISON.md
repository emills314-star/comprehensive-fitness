# Final Comparison — Corrected Directions

**Evidence base:** `01-K3_DESIGN_DIRECTIONS.md` (note: the Direction 3 section is truncated in the supplied input at its fourth strength bullet; Session Spine assessment therefore rests on its stated concept/strengths, the critique corrections, and the corrected captures), `02-K3_PROTOTYPE_CRITIQUE.md`, and nine corrected real-browser captures (Today 390px, workout 390px, Progress 1440px per direction). Static captures cannot evidence motion, focus behavior, rest-fill animation, or dock re-measurement; those items are labeled where they remain unverification gates.

---

## 1. Ranking

| Rank | Direction | Unweighted mean (0–100) | One-line verdict |
| --- | --- | --- | --- |
| **1** | **Logbook** | **88.2** | The premise is now delivered: a true ledger, ~10 set rows visible, zero wasted chrome, best desktop, lowest risk. |
| **2** | **Spotter Cards** | **85.3** | The best fatigue ergonomics and emotional tone; density, dock geometry, and wide-screen economy still cost it. |
| **3** | **Session Spine** | **81.7** | The strongest orientation idea; weakest evidence that its signature mechanics exist, highest one-off build cost. |

---

## 2. Scores

| Dimension | Logbook | Spotter Cards | Session Spine |
| --- | --- | --- | --- |
| Logging speed | **96** | 78 | 84 |
| Clarity | **92** | 90 | 82 |
| Hierarchy | **90** | 88 | 85 |
| Visual quality | 84 | **88** | 82 |
| Mobile ergonomics | 88 | **92** | 80 |
| Accessibility | **90** | 86 | 82 |
| Coaching trust | **88** | 84 | 86 |
| Delight | 72 | **90** | 84 |
| Implementation feasibility | **94** | 72 | 70 |
| **Mean** | **88.2** | **85.3** | **81.7** |

### Score rationale per direction

**Logbook.** The corrected workout capture shows the critique fully resolved: one session header, completed rows carrying full facts (`135 lb · 8 reps · RPE 6 · ✓ Done`), the open row printing target plus verbatim comparable prior, `7.5` demoed in a focused underline field, rest as one inline toolbar row, and the next exercise's four pending rows visible without scrolling — roughly ten set rows per 844px viewport versus ~2.5 in the inherited baseline. The bottom hairline bar span fix holds; there is no dock to clip. Desktop Progress is the best of the three: frameless wide chart, persistent left rail, history rows with grades at full measure. Score drags: underline-field discoverability (typed `7`→`7.5` proven, but fields read as text until focused), invisible 44px hit-slop that must be audited rather than seen, and the lowest warmth of the three — the grade stamp and ruled lists satisfy the contract's reward bounds but produce little joy.

**Spotter Cards.** Corrections landed where it mattered most: completed chips now carry performed facts (`1 ✓ 135×8 @ 6`), the ballast is present and populated (`Start rest · 2:00 · −15 +15 · Skip`), the dock is hidden during the workout, and Finish is a quiet text button. The "Last comparable · 185 lb × 8 @ RPE 8 · Jul 31 · working set" fact block is the single clearest prior-performance presentation in any direction. Mobile ergonomics are unmatched — 96px tiles, one pill, everything decidable in the lower two-thirds. Score drags: the corrected Today capture still shows "Log readiness" peeking out beneath the floating dock, so the anti-clip budget is not yet proven at 844px (the exact inherited defect this direction owns); a 24-set day means real vertical travel with facts demoted to ghost lines and chip taps; and the 1440px Progress plane is sparse — a 420px chart card and a narrow history column adrift in empty canvas, the weakest wide-screen economy of the three.

**Session Spine.** The corrected workout capture shows per-set ticks with correct semantics (filled = done, ringed = current, hollow = pending), deduplicated Finish, and a working bottom rest bar; the desktop Progress chart is no longer compressed. Orientation value is real — at a glance you know you are at set 3 of 4 in exercise 1 of 4. Score drags: the direction's two signature claims cannot be verified in static evidence — rest as a *structural* spine fill, and the margin-note exception pinned mid-rail (no exception state was captured); the spine consumes ~28px of a 390px measure, the narrowest content column of the three; completed rows duplicate Logbook's treatment, meaning the spine is additive geometry rather than a replacement for ledger facts; and it requires the most custom engineering (scroll-synced rail, per-set tick grid, filling segments, desktop aside) for benefits that Logbook already delivers ninety percent of through ordering and text labels alone.

---

## 3. Recommendation

**Adopt Logbook.** It is the only direction whose corrected capture delivers its own premise without remainder: the densest honest presentation of protected facts (names wrap, targets and priors always on screen, states labeled in text), the fastest loop under fatigue, the cleanest 1440px translation with no compositional reinvention, and the smallest implementation surface — a presentation restructure over existing view output with logic modules untouched. Every inherited baseline defect named in the evidence (duplicated status surfaces, elevation chrome, oversized CTAs, clipped navigation, wellness genérica, ambiguous chips) is structurally absent in Logbook rather than engineered-against, as Spotter's dock and Spine's rail must be. Spotter Cards remains the correct fallback if the product were repositioned toward guided, anxious, or returning users; Session Spine's orientation payoff does not justify its cost when its differentiating mechanics are the least proven and its set rows converge on Logbook's anyway.

### Elements to borrow into Logbook

1. **Spotter's standalone prior-performance fact line.** `Last comparable · 185 lb × 8 @ RPE 8 / Jul 31 · working set` — with capture date and role — is stronger than Logbook's inline `last:` segment. Adopt its provenance format verbatim into the open row's target line, keeping "No comparable history" as the negative form.
2. **Spotter's single-obvious-action active rest.** During rest, morph the open row's ✓ commit into `Skip rest · Set 4` and dim completed facts; Logbook already replaces the input line in place, so this is a state-emphasis change, not new structure.
3. **Spine's structural rest, translated to Logbook's idiom.** Fill the current row's 3px blue left tick bottom-to-top with elapsed rest, turning amber in overtime — spine-fill semantics with zero new chrome, complementing the top rail.
4. **Spine's scope-adjacent exception placement.** Anchor the single amber exception callout at the affected exercise's separator line (the margin-note idea) instead of a generic top-of-screen slot, making "affected scope" spatial rather than textual.

Explicitly **not** borrowed: the chip strip (hides per-set rest editing behind taps, which Logbook rows expose directly), tinted state fills (Logbook's tick/glyph system already passes the non-color rule), and the top navigation (the contract's span-viewport bottom bar is proven; a second nav geometry is unjustified variance).

### Residual risks and open verification gates

- **Logbook:** underline inputs mistaken for static text (placeholder + focus rule must be exercised, not assumed); 44px row hit areas are invisible-by-design — hit-slop audit required; strikethrough legibility on long skipped names; keyboard Enter-complete must route through the existing completion path. All are device-gated checks, none yet evidenced.
- **Spotter Cards:** dock padding budget at 390×844 and 430×932 — the corrected capture still shows content peaking beneath the dock; per-set rest edit discovery on ghost lines; stepper/pill adjacency; wide-screen economy. **NEEDS REVIEW:** whether the fallback hairline bar or a re-budgeted offset resolves the residual Today occlusion.
- **Session Spine:** the two signature behaviors (structural rest fill, margin-note exception) are unproven in supplied evidence; tick semantics need non-positional text equivalents for assistive tech; desktop split-plane balance. **NEEDS REVIEW:** Direction 3's governing spec text is truncated in the comparison package; no further-disposition decision should cite its unrecovered sections.

---

## 4. Production design-system summaries

### Direction 1 — Logbook (recommended)

- **Intent:** precision training ledger; hierarchy from type and hairlines, not containers. Emotion: competent, serious, unfussy.
- **Typography:** system sans; sentence case; 400/600 weights; 13–15px labels, 12px numeric captions, single 11px tracked eyebrow for date; set facts 15–17px semibold; timer 20px; H1 22px/600; all quantities tabular numerals; `ui-monospace` only for the rest readout fallback.
- **Grid/spacing:** 4px base; set rows ≥44px touch / 40px desktop; section gaps 16–24px; full-width hairline between exercises, half-strength between sets; measure 720px (Today/Progress), 760px ledger.
- **Color:** near-monochrome ink; state carried by 3px left ticks (blue current, amber exception), green ✓ glyphs, muted/hollow/slashed markers, red reserved for destructive confirmations. No fills.
- **Components:** rectangle buttons 4px radius (ink primary 44/36px, bordered secondary, underlined tertiary); 48px right-aligned underline inputs with 2px blue focus rule, trailing 12px units, `inputmode="decimal"`, select-all-on-focus; one-line completed set rows; 104px inline open-row editing strip; top 3px rest rail + single toolbar row; hairline exception callout quieter than an open row; frameless charts with pinned annotation line; bottom full-width hairline nav (mobile) / 200px left rail (≥1024px).
- **States:** text labels mandatory (`now`, `Done`, `Upcoming`, `Skipped` + strikethrough + slashed marker), superscript `W` warm-ups.
- **Motion:** 180ms check-stroke; linear rail fill; single 240ms stamp rotation; reduced-motion removes all.
- **Accessibility floor:** list semantics with hidden column headers, 2px outline focus (forced-colors safe), `aria-live="polite"` timer at 30s throttle, 16px input font floor.
- **Build:** presentation-only restructure of existing view output; root/`www` sync via repository command; service-worker advance only on contract change.

### Direction 2 — Spotter Cards

- **Intent:** one set has your attention; staged guidance as presentation only. Emotion: held, guided, encouraged.
- **Typography:** humanist system sans; body 16–17px; tile values 40–48px; timer 34px; one 11px tracked eyebrow idiom (`NOW — SET n OF m`); tabular numerals everywhere.
- **Grid/spacing:** 8px base; card padding 20–24px; 16px mobile margins; desktop 560px card column within 1080px canvas, optional sticky session-overview column.
- **Color:** the only fill-based system — blue 6% current tint + top accent, green 8% completed, neutral pending, gray-wash skipped, warm-amber exception; every tint paired with icon + text; all pairs WCAG AA.
- **Components:** pill primary 52px (`✓ Complete set`), ghost secondary, text tertiary; 96px stepper tiles (LOAD/REPS/RPE) with embedded 44px −/+ zones (RPE steps 0.5) wrapping the decimal replacement contract; fact-preserving completed chips with fact sheets; two ghost pending lines with per-set rest clocks; 64px bottom ballast rest bar; soft exception card with one action + disclosure; grade medallion completion; chart card with bottom-sheet point inspection; floating dock with explicit anti-clip budget (height + safe-area + 8px, constrained positioning, 480px-height fallback to hairline bar), hidden in workouts.
- **Motion:** 220ms card crossfade-rise; 160ms chip settle; one 200ms completion scale-pop; reduced-motion removes all.
- **Accessibility floor:** chips are buttons with full spoken facts; focus moves and announces on card swap; sheets trap/restore focus; tints never sole signal.
- **Build:** new composite components (tile, chip strip, ballast, dock) over unchanged logic; highest regression surface of the three.

### Direction 3 — Session Spine

- **Intent:** you always know where you are; session structure as a persistent vertical rail. Emotion: oriented, progressing, accompanied.
- **Composition (evidenced):** slim left spine with per-exercise ticks (Today) and per-set ticks grouped by exercise (workout) — filled = completed, ringed = current, hollow = pending; rest bar pinned bottom within a bordered session frame; top text navigation (Today · Progress) leaving the bottom edge free; desktop split-plane with title/selector column left and wide chart + history right, left rail nav.
- **Specified but unrecovered/unverified:** typography scale, spacing grid, color tokens, motion spec, the spine-fill rest mechanic, and the margin-note exception block are absent from the truncated input; corrected captures imply ink-on-paper styling near Logbook's palette with teal-ink accents. **Treat those surfaces as ASSUMPTION until the governing text is restored.**
- **Build:** most custom geometry of the three — scroll-synced rail, tick grid, filling segments, desktop aside — for orientation value partially reproduced by Logbook's ordering and labels. Highest feasibility risk; completed-set rows already converge on Logbook's treatment.
- **Use in the adopted system:** source of two borrowings only (structural rest encoded on the current-row tick; scope-adjacent exception anchoring); not adopted as the base system.