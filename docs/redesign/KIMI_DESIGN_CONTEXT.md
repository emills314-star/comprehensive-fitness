# Kimi design context

## Product and primary flow

Comprehensive Fitness is a local-first static JavaScript PWA: **“Strong with a quiet spotter.”** The ordinary flow is Today → expected routine → direct Start → fast load/reps/decimal-RPE logging → set completion → persistent rest → Finish → factual grade/highlights → Progress.

## Current screen inventory and navigation

- Persistent destinations: **Today** and **Progress** only.
- Contextual screens: active workout, submitted workout detail, exact exercise history, Routines, Settings, Support, and Privacy.
- Active workout is full-screen and hides persistent navigation.
- Mesocycles, a persistent Templates tab, dashboards, themes, numeric fatigue/readiness scoring, and normal-progression coaching are retired product concepts and must not be recreated.

## Current visual system and problems

The app is a fixed-light, dependency-light interface with semantic blue/current, green/completed, neutral/pending, muted/skipped, warm/intervention, and red/danger states. Existing CSS and SVG icons live in `index.html`; rendering is primarily in `app-views.js`, with behavior in `app-workout.js`, `app-history.js`, and the remaining classic-script modules. Root assets are mirrored to `www/` by `npm run sync:web`.

The inherited K3 review identified duplicated status, excessive card/elevation chrome, oversized calls to action, weak wide-screen use, a clipped bottom navigation, generic wellness-dashboard styling, and inconsistent density. Meaningful exercise suffixes, logging speed, state distinction, touch ergonomics, and keyboard/focus behavior are protected.

## Authority and constraints

1. `AGENTS.md`
2. `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`
3. `docs/ROADMAP.md`
4. Historical design records only where they do not conflict with the current documents

The source worktree contains untracked historical `redesign/final/` records referenced by the docs but absent from this isolated worktree. Their verified conclusions are already summarized in the governing docs. **NEEDS REVIEW:** those untracked files are not independently versioned evidence in this worktree.

## Key commands

- `npm run dev`
- `npm run lint`
- `npm test`
- `npm run audit:ui`
- `npm run sync:web`
- `npm run verify:pwa`

## Synthetic evidence and current failures

Browser tests use public synthetic fixtures under `tests/ui/fixtures/`. Baseline capture on 2026-08-08 produced real Chromium screenshots; 7/10 focused mockup-fidelity cases passed and 3 failed because the untouched baseline implementation no longer matched newer assertions for the rest slot and expected-workout action. These are baseline/test-revision mismatches, not prototype failures.
