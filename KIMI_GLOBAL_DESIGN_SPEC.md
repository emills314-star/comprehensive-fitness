# Kimi global design specification

**Status:** Design authority output recovered from Kimi K3 Shared
**Date:** 2026-08-08
**Scope:** Global visual system and responsive behavior. No production implementation is included.

## Inputs and guardrails

Kimi reviewed `FINAL_REDESIGN_PRD.md`, `FINAL_FEATURE_DISPOSITION.md`, `docs/UI_UX.md`, the Kimi authority/context files, and Today-page baselines at 390×844, 430×932, 768×1024, and 1440×900.

The design preserves the final two-tab product model (Today and Progress), the full-screen active-workout state, Routines as the planning surface, exact decision-engine semantics, numeric readiness/fatigue/progression output, and the fixed light presentation. It does not resurrect retired mesocycle, template-destination, dashboard, or theme concepts.

## Baseline critique

- Status is duplicated between the page-level “IN PROGRESS” treatment and the workout-card eyebrow.
- Nearly every region is elevated with borders, shadows, glow, or outlined pills, flattening hierarchy through excessive chrome.
- The oversized Resume action dominates the screen without adding clarity.
- Tablet and desktop layouts leave large unused acreage while retaining a narrow mobile composition.
- The bottom navigation is clipped in the 1440×900 baseline.
- Repeated “Today” branding and title copy gives the page a generic wellness-dashboard tone instead of a focused training-tool identity.

## 1. Design north star
- "Strong with a quiet spotter" → interface behaves like a training partner's clipboard: precise, fast, quiet, legible under fatigue.
- Principles: hierarchy over chrome (typography and spacing carry hierarchy; borders and shadows are rare and sharp), one accent, state color is reserved for set/workout state, density without clutter, data-first composition, no novelty.

## 2. Color tokens
Semantic tokens per KIMI_DESIGN_AUTHORITY baseline: current blue; completed green; future neutral; skipped muted; intervention warm; stop/error red. Fixed light presentation (UI_UX.md: one fixed light presentation, no themes).

Proposed palette:
- `--surface-base`: cool paper white, e.g. `#FAFAFA` or slightly warm/neutral `#F7F8F9`
- `--surface-raised`: `#FFFFFF`
- `--surface-sunk` (inputs/pending cells): `#F2F4F6`
- `--border-hairline`: `#E2E5E9` (1px)
- `--border-strong`: `#C9CFD6`
- `--ink-primary`: `#101418` / `#0F1316`
- `--ink-secondary`: `#454D55`
- `--ink-tertiary/muted`: `#5B6470`
- `--accent` (current/action): `#1D4ED8`; `--accent-strong`: `#1741BC`
- State tokens:
  - `--state-current`: `#1D4ED8` (reserve accent = current)
  - `--state-complete`: `#15803D` (green-700, 4.5:1 with white? green-700 #15803D luminance ~0.18 → contrast ~4.6:1 white; okay for large; use for text on tinted bg instead)
  - `--state-future/pending`: neutral ink-tertiary on `--surface-sunk`
  - `--state-skipped`: muted — hatched/50% ink, e.g. `#8A929B` with strikethrough affordance? Skipped muted per authority. Use ink `#6B7480` on `#EEF1F4` plus a small "SKIPPED" label.
  - `--state-warmup`: neutral outline, maybe amber-ish? Warm-up is a role not a state; visually distinct but subtle — use slashed border style or a "WU" tag in neutral cool tone.
  - `--state-intervention` (warm): `#B45309` (amber-700) text on `#FDF3E3` surface — warm per authority.
  - `--state-danger` (stop/error): `#B91C1C` (red-700).
- Evidence/fact tint: prior-performance facts shouldn't use accent; use secondary ink to avoid implying action.

Contrast-check text combinations disclaimers: target ≥4.5:1 body text and ≥3:1 large text/UI icons; Codex to verify with exact rendered values.

## 3. Typography
- Keep system stack (no webfont download → fast, offline PWA-friendly): `-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Optionally `Inter` if already bundled... but no; keep no new dependencies: system stack with `font-feature-settings: "tnum"` / `font-variant-numeric: tabular-nums` for numeric data. This is a big one: tabular numerals for weights/reps/RPE/timer so digits don't shift while typing/timing.
- Type scale (device-independent, rem-based with 16px root):
  - Display (page titles, workout title): 24/30 tight-tracking -0.01em, weight 700
  - Title (exercise name, dialogs): 17/24, weight 650–700
  - Body: 15/22 (mobile data rows) / 14/20 secondary
  - Label (caps eyebrows): 11/14, weight 700, letter-spacing 0.08em, uppercase
  - Data numerals (set inputs, timer): 17-20 with tabular-nums; timer remaining 20/24 tabular
  - Small/meta: 12.5/16 (13px)
- Rules: measure ≤ 68ch for body copy; numeric data right-aligned in entry cells; never truncate meaningful variant suffixes — wrap up to 2 lines (D-30 keep rule).
- At 320–390px the display drops to 22/28; no type below 11px; input font floor 16px to prevent iOS zoom (UI_UX existing contract).

## 4. Spacing and density
- 4px base grid. Spacing tokens: 1=4, 2=8, 3=12, 4=16, 6=24, 8=32, 12=48.
- Screen gutters: 16px ≤480px; 20px ≤768px; 24px larger.
- Card padding: 16-20px mobile; 24px desktop.
- Set-row height: 56px minimum (touch), dense but editable; input cells 48px tall min.
- Kill empty acreage: content column max-widths (see responsive) and vertical rhythm that keeps the first useful viewport ≤ 90% viewport height on standard devices.

## 5. Surfaces, borders, elevation
- Flat is default. Two elevation levels only:
  - Level 0: hairline 1px `--border-hairline`, no shadow (in-line rows, set rows, secondary panels)
  - Level 1: 1px border + small crisp shadow `0 1px 2px rgba(16,20,24,.06), 0 2px 8px rgba(16,20,24,.04)` — reserved for floating elements (bottom nav, sticky rest bar, primary status card)
  - Level 2 (dialogs/drawers): overlay scrim 40% + shadow `0 8px 24px rgba(16,20,24,.12)`
- Radii: 10px cards; 8px inputs/buttons; full-radius only for tiny status pills... Actually athletic = tighter: 8px standard, 6px small elements, pill only for narrow status chips (or use squared 3px chips). Choose: radius tokens `--r-sm 6`, `--r-md 8`, `--r-lg 12`; pills retired for buttons (buttons are 8px radius rectangles), status chips keep 9999 pill but subtle.
- No gradients anywhere; no colored glow shadows; shadows never tinted (neutral only).
- Left state rail: 3px (not 4) accent rail only on the *active item* (current exercise / draft card), replacing both the glow and the thick border emphasis.

## 6. Components
### App bar
- Reduce to: destination wordmark + contextual links as quiet text buttons (no pills).
- Height 56px; border-bottom hairline only while scrolled; sticky.

### Bottom navigation (Today/Progress)
- Fixed bottom bar, height calc(64px + safe-area); full width on mobile with top hairline (not a floating pill) — floating pill wasted space and clipped at 1440... Actually a centered floating dock at max-width 360 is fine on desktop; but bug: clipped at 1440×900. Rule: on ≥768, still full-width bar anchored bottom (or a centered elevated bar with margin). Keep it simple: full-width top-hairline bar at all widths, content centered max-width 400px, icon+label, active = accent text + 2px top indicator (on mobile) or filled icon. Remove heavy rounded container; remove shadow except hairline. 56px icon+label target height 64 minimum.
- Icons: 22px stroke 1.75, currentColor.

### Buttons
- Primary: accent bg, white 600-weight label 14.5px, height 44px (mobile) / 40px (desktop), radius 8, full-width only on ≤480px single-CTA screens; otherwise auto width min 120px. No glow. Hover: darken 6%; active: darken 12%/translate 0.5px none (keep flat).
- Secondary: transparent bg, 1px `--border-strong`, ink-primary label.
- Tertiary/quiet: text-only ink-secondary.
- Destructive: danger text/underline confirm pattern (never danger-filled primary unless final confirm).
- No all-caps button labels; sentence case ("Start workout", "Resume"). This is a big de-SaaS/athlete move. Actually RESUME all caps — change to sentence case "Resume workout".
- Icon buttons: 44px target, 20px icon.

### Status chips/badges
- One status at a time; sentence case chip, e.g. "In progress" — small 11px caps or 12px medium in a neutral or tinted chip. Rule: if the card title already says "Workout in progress," no duplicate page-level badge. Status appears exactly once.

### Cards (consolidate)
- The draft/resume card today = page's single "hero" region; convert to a surface with 1px border + 3px accent left rail; no shadow, no glow. Title 20/26, supporting line 14/20 secondary, actions row: primary button auto-width.
- "Choose another workout" becomes a quiet secondary action (tertiary text button with icon) directly beneath the hero, not a full-width boxed card.

### Set rows (active workout)
- One row per set: [set # + role tag] [load field] [reps field] [RPE field] [complete check].
- Completed: row bg `--surface-sunk`, values secondary, green check 18px + "Set done" accessible label.
- Current: 2px accent outline/hairline border + 3px left rail; inputs white.
- Pending: flat, hairline dividers between rows (no per-row cards).
- Skipped: 45% opacity? better muted ink + "Skipped" tag, unstriked values retained.
- Warm-up: role chip "WU" (neutral); classification correctable.

### Rest bar
- Pinned bottom-above-nav bar (already implemented per UI_UX.md; spec codifies): hairline top border, surface raised, remaining time in 20px tabular, subtle progress hairline (1.5px accent fill) under it, Skip tertiary button right. Overtime: time turns danger? no—use intervention warm/informational: "+0:15" in ink-primary with subtle warm dot. Keep flat.
- During active workout nav is hidden; rest bar sits at viewport bottom within safe-area.

### Dialogs/drawers
- Mobile: bottom sheet with 8px top radius, drag-not-required, scrim 40%, max-height 88dvh; Desktop: 480px max-width dialog centered.
- Focus trap + restore; destructive confirm states name consequence ("Discard workout deletes 4 logged sets").

### Prior performance block
- Compact fact line above set rows: "Last: 3×8 @ 60 kg · RPE 8 · Aug 3". Secondary ink, no card, 13px, tabular numerals. Unavailable: "No comparable prior sets" in muted ink — never invented.

### Empty/loading/error/skeleton
- Empty: one iconless line of muted copy + one quiet action; no illustrations, no giant empty card.
- Loading amazing: skeleton hairline rows (sunk surface shimmer disabled under reduced motion → static).
- Error: `danger` icon + one sentence + retry; inline, not toast-only.

### Exception card (quiet spotter)
- Warm surface `#FDF3E3` 1px `#E8D9BE` border?? Actually keep to token scheme: intervention-warm surface tint, no icon overload: small warning glyph, one action sentence 15px semibold ink, one short reason 13px secondary, "Details" disclosure. No severity color ramp, no meters (PRD).

## 7. Responsive rules
- Breakpoints: keep max-width content measure, not device targets:
  - base (default) ≤ 600
  - `--bp-sm` 600 (wider gutter)
  - `--bp-md` 900 (content column 720 center)
  - `--bp-lg` 1240 (column 720–800; never let single cards span >800px)
- Content measure: primary column max 720px centered from 900px up. On 1440 the hero/draft card = 720px centered, not 1120.
- Multi-column only when a second column carries real data (e.g., Progress chart + history side by side ≥1024); Today is always single column.
- Set entry grid: inputs share one row ≥360px; below 360 weight/reps/RPE stay one row with 8px gaps and 3×~96px min cells... At 320: 3 cells of (320-32-16)/3 ≈ 90px each — acceptable; labels above inputs, 11px caps.
- Inputs keep 16px font min (iOS zoom contract), 48px height.
- Sticky elements: rest bar bottom; current-exercise header sticky top within workout; page headers not sticky on content screens to preserve space? Keep sticky app bar simple.
- Bottom nav: full-width at all widths (fixes 1440 clipping), max content width 400 centered, `padding-bottom: env(safe-area-inset-bottom)`.

## 8. Motion
- 120–160ms ease-out for state changes; 200ms max for sheets (transform+opacity only).
- No page transitions, no parallax, no confetti (PRD E-11), timer digits do not animate; progress hairline uses width transition 160ms linear.
- `prefers-reduced-motion`: all transitions → 0ms functional states swap instantly; skeleton static.

## 9. Accessibility notes
- Body text must meet at least 4.5:1 contrast; large text and UI graphics must meet at least 3:1. The proposed `--ink-muted: #5B6470` targets compliant small text on `--surface-base`; Codex must verify exact rendered combinations during implementation.
- State never color-alone: current gets rail + "Current" label; completed gets check glyph + label; skipped gets tag; warm-up gets "WU" tag.
- Focus: 2px accent outline offset 2px, never removed; visible against both white and sunk surfaces.
- Touch targets ≥ 44×44 (platform minimum); set-complete control 44px.
- RPE stepper/entry: immediately replaceable value (D-03 contract), announce value changes via aria-live? Keep to notes: inputs have visible labels (not placeholder-only); timer has `role="timer"` optional; dialogs trap focus.
- Forced-colors/HC: state conveyed by glyph/label; hairline borders become visible system borders; ensure no `background:none` on focus outline.
- Live today title/date uses proper heading levels (h1 once per view).

## 10. Prioritized changes
P0 (hierarchy/trust):
1. Remove duplicate status (IN PROGRESS pill vs card eyebrow) — one status surface.
2. De-elevate: remove glow shadows + gradients; move to hairline + flat cards.
3. Fix 1440 layout: 720px content column; fix clipped bottom nav; full-width nav bar.
4. Button system: sentence-case, 44px standard height, remove all-caps/glow; quiet Routines/Settings (text buttons not pills).
5. Sentence-case eyebrow labels? Athletic systems often keep small caps labels — keep caps for tiny 11px labels (that reads "technical") but reduce letter-spacing. Fine.

P1 (density/speed under fatigue):
6. Today first-viewport assembly: identity, preview, Start/Resume, secondary actions with no large gaps; hero card compact (≤ ~320px tall at 390).
7. Apply the set-row grid, tabular numerals, and 56px row minimum defined above.
8. Rest bar codified as persistent thin bar.

P2 (finesse):
9. Empty/loading skeleton standardization.
10. Exception card pattern.
11. Type scale rollout, numeric font features.
12. Reduced-motion + forced-colors passes.

The changes above are presentation-only. They must not alter data contracts, recommendation logic, stored values, navigation ownership, or documented product behavior; Codex records any conflict in `CODEX_REDESIGN_IMPLEMENTATION_LOG.md`.

## Explicit anti-patterns

- No dashboard grids or decorative KPI tiles.
- No card stacking for every row or section.
- No tinted glow shadows, gradients, or ornamental glass effects.
- No all-caps primary buttons.
- No proliferation of badges, confidence meters, or percentage decoration.
- No visual changes that reinterpret decision-engine values or hide exception explanations.

## Authority and implementation boundary

This specification is Kimi’s design-authority output. Codex owns implementation, testing, documentation reconciliation, and conflict logging. When a design recommendation conflicts with the final product or decision-engine authority, the product authority wins and the mismatch must be recorded in `CODEX_REDESIGN_IMPLEMENTATION_LOG.md`.
