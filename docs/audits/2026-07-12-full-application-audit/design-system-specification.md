# Design-system specification

## Design decision

The existing visual direction is retained. Lift and Dashboard are protected surfaces and must not be converted into a generic card dashboard. Available Equipment and Muscle Group Scope are the reference patterns for comparable multi-entry choice interfaces.

The target is incremental consolidation of the existing HTML-string/CSS system, not a framework migration or broad redesign.

**IMPLEMENTED 2026-07-14:** semantic token aliases, `ChoiceChip`, `ChoiceTile`, and `DialogSheet` compatibility classes, named Equipment/Scope groups, durable route/dialog/Dashboard focus, contextual Lift action names, reduced-motion scrolling, forced-colors focus protection, and content-driven 320 px/200% reflow. The protected Lift/Dashboard visual matrix remains unchanged.

## Foundations

### Page shell

- Compact centered content, maximum width 760 px.
- Sticky top brand/context bar and fixed bottom navigation with safe-area insets.
- Screen hierarchy: eyebrow, screen title, optional introductory copy, section heading/supporting copy, content collection, then grouped actions.
- Text wraps by default. Truncation is permitted only when the complete value remains programmatically available.

### Semantic token roles

The following aliases are implemented over the established palette without changing computed appearance:

| Role | Purpose |
| --- | --- |
| `--color-accent` / `--color-accent-subtle` | Selected/current/interactive state; existing blue/current palette |
| `--color-text` / `--color-muted` | Primary and supporting content |
| `--color-background` / `--color-surface` | App canvas and contained surfaces |
| `--color-border` / `--color-border-strong` | Dividers and emphasized boundaries |
| `--color-success` | Completed/success state; never generic selection |
| `--color-warning` | Caution/review state |
| `--color-danger` | Destructive/blocking state |
| `--color-rest` | Recovery/rest state distinct from success |

Existing `--green*` variables visually represent blue/current-state roles; migrate consumers to truthful aliases incrementally rather than global search/replace.

Spacing roles: 4, 6, 8, 10, 12, 14, 16, 18, and 24 px.

Radius roles:

- row: 0;
- compact: 7–8 px;
- control: 10 px;
- panel: 12–14 px;
- overlay: 18 px;
- pill: 999 px.

Elevation roles: none, sticky chrome, popover, modal. Ordinary content cards do not receive arbitrary shadows.

Typography roles: screen title, section title, body, compact body, metadata, and eyebrow. Essential information must remain legible/reflow at 200% zoom; very small ad-hoc metadata sizes are not reusable tokens.

## Surface and composition rules

- Divider-oriented rows: Lift, Dashboard, history, dense analytics.
- Rounded panels: configuration, grouped choices, focused workflows, modal sheets.
- One semantic border/accent per component.
- Form fields are bordered in settings/setup; compact inline fields remain a Lift-specific exception; underlined inputs are limited to edit-in-place names.
- Primary, secondary, text, and destructive actions have stable distinct hierarchy.
- Empty/loading/error/warning/success/retry states share one StatePanel family; destructive confirmation remains a dedicated sheet.

## Shared primitives

Primitives remain small CSS classes and render helpers:

- `PageHeader`: eyebrow/title/optional intro and route focus target.
- `SectionHeader`: section title/supporting copy/action slot.
- `StatePanel`: semantic state, optional retry/action, polite announcement where appropriate.
- `StatusBadge`: explicit success/warning/danger/rest/neutral/current variants.
- `ChoiceChip`: wrapping multi-select action, following Equipment.
- `ChoiceTile`: labelled checkbox/tile, following Muscle Scope.
- `Disclosure`: native details/summary with consistent heading and focus behavior.
- `ActionGroup`: primary/secondary/destructive separation and responsive wrapping.
- `DialogSheet`: labelled modal, trigger focus capture/restore, inert background, Escape/Tab behavior.

## Multi-entry controls

### ChoiceChip — Equipment reference

- Wrapping pill buttons.
- Neutral unselected state.
- Solid accent selected state.
- `aria-pressed` communicates state.
- Group has a programmatic name.
- Minimum critical mobile hit region 44 px without visually bloating the chip.
- Empty ambiguous state is impossible when the domain requires a default.

### ChoiceTile — Muscle Scope reference

- Neutral unchecked tile; subtle accent checked tile.
- Visible native checkbox and complete label hit area.
- Programmatically labelled group/fieldset.
- Three desktop columns, two mobile columns, one column only when content/reflow requires it.
- Canonical internal IDs never appear as user-facing labels.

Use these patterns for grouped preferences, filters, scope, settings, and collections only when selection is the task. Dense read-only data remains row-oriented.

## Interaction states

Every interactive primitive defines:

- default;
- selected/current;
- hover where supported;
- active/pressed;
- focus-visible with a non-color-only indicator;
- disabled with semantics and adequate contrast;
- validation/error and explanatory association;
- loading/busy where applicable.

Explicit route changes move focus to the canonical `#main-content` entry; initial load does not claim focus. Same-screen edits retain local focus through an allowlisted data descriptor that survives HTML-string rerenders. Dialog open verifies that its preferred action is visible, enabled, focusable, and actually focused, otherwise falls back to the first eligible dialog control. That shared filtered set traps Tab in both directions; Escape/backdrop dismissal remains available where allowed and closing restores the invoking control. A hidden-until-focused skip link targets main content. Repeated controls include exercise/set context in their accessible names.

## Responsive and accessibility rules

- Baseline widths: 320 small mobile, 375 large mobile, tablet, 1280 laptop/desktop, and wide desktop.
- Forms: two columns to one.
- Scope tiles: three columns to two; allow one when large text requires it.
- Equipment: wrapping chips.
- Planner/day cards: two columns to one where appropriate.
- Test 200% zoom/large text, light/dark, reduced motion, and forced colors where supported.
- At 320 CSS px, normal protected composition stays stable; when the computed root text is at least 24 px at a viewport no wider than 380 px, editable titles become multiline and content reflows without document/nested horizontal overflow. At ordinary narrow text sizes, a title changes control only when its rendered value overflows. The keyboard-operable quick-template carousel is the documented overflow exception; every card remains a native button without conflicting list/listitem roles.
- Critical touch targets are 44×44 CSS px or provide an equivalent enlarged hit region.
- Dynamic route/current-set state uses one restrained polite live region; do not announce every keystroke.
- Charts retain keyboard-addressable labelled data points and an equivalent textual summary.

## Protected-surface contracts

### Lift

- Preserve dense training-sheet hierarchy, dividers, set-row information density, quick access, active state, rest timer, recommendation disclosure, and mobile behavior.
- Do not globally enlarge rows or convert exercises into generic cards.
- Improve hit regions and accessible names without expanding visible copy.
- Rich regression fixtures must cover warm-up/current/completed/skipped sets, timer, completion, readiness, recommendation, start/cancel/submit/history sheets, and long labels.

### Dashboard

- Preserve compact summary/drilldown hierarchy, weekly cards, fatigue/detail behavior, labels, and one-column mobile layout.
- Rich fixtures must cover populated volume/fatigue/history, expanded details, long labels, date ranges, and empty/error states.

Shared changes to `button`, `.status-pill`, `.exercise-card`, `.set-row`, `.dashboard-grid`, `.volume-card`, `.brand-bar`, `.app-main`, or navigation require protected screenshot and behavior verification first.

## Screen migration map

| Surface | Target adoption | Protected exception |
| --- | --- | --- |
| Lift | Contextual names, skip links, focus/live behavior, selective hit regions, rich fixtures | Preserve density and computed visual hierarchy |
| Dashboard | Section/header/state primitives, selective hit regions, rich fixtures | Preserve compact drilldown presentation |
| Guided Setup | ChoiceChip/ChoiceTile groups, shared headers/actions/errors | Keep existing Equipment/Scope appearance as reference |
| Guided Build/Check/Create | StatusBadge, StatePanel, Disclosure, ActionGroup | Preserve progressive workflow and per-day task layout |
| Templates | Page/section headers, disclosures, state/action groups | Keep compact list and progressive rendering |
| Charts | Page/section/state patterns, accessible filter groups | Preserve accessible SVG points and performance disclosure |
| Settings | Shared form sections, choice groups, state/action panels | Keep task-specific setup and danger-zone separation |
| Privacy/Support | Shared background/token declarations and `<main>` landmark | May remain intentionally light-only only if documented and contrast-tested |

## Known baseline debt

- 1,992 CSS lines, 1,134 rule blocks, and a late override layer.
- Key selectors appear three to seven times.
- Source ceilings are exhausted at 74 hex colors, 40 RGB colors, 3 inline styles, and 14 `!important` rules.
- `deload`, `rest`, and notification/install status classes lack a complete semantic visual mapping.
- Approved goldens primarily represent fresh-storage light mode.
- The two ordinary Settings goldens predate the existing cloud-upload consent label/explanation and require an intentional isolated baseline review; protected Lift/Dashboard goldens are current.

New work must first consolidate or reuse; it may not raise those style ceilings.
