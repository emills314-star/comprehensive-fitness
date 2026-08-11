# Design direction decision

## Review package

- Review board: `artifacts/design-review/index.html`
- Interactive prototypes: `artifacts/design-review/lab/index.html`
- K3 design specification: `docs/redesign/K3_DESIGN_DIRECTIONS.md`
- K3 critique: `docs/redesign/K3_PROTOTYPE_CRITIQUE.md`
- K3 final comparison: `docs/redesign/K3_FINAL_DIRECTION_COMPARISON.md`

## Direction A — Logbook

A dense, typographic training ledger using hairlines, aligned facts, and a single open row. It provides the fastest logging loop, clearest factual visibility, strongest wide-screen translation, and lowest production implementation risk. Its main tradeoff is austerity: underline inputs and dense 44px rows need careful focus and touch verification.

K3 score: **88.2 / 100**. K3 rank: **1**.

## Direction B — Spotter Cards

A guided, one-set-at-a-time system with large input tiles, completed-set fact chips, and a prominent rest ballast. It has the best mobile ergonomics and delight but is slower for high-volume sessions, requires stricter dock geometry, and has a larger component/regression surface.

K3 score: **85.3 / 100**. K3 rank: **2**.

## Direction C — Session Spine

A spatial workout timeline using filled, ringed, and hollow markers to show completed, current, and pending work. It offers the strongest orientation concept but consumes mobile width and requires the most custom scroll-synchronized geometry.

K3 score: **81.7 / 100**. K3 rank: **3**.

## K3 recommendation

**Approve A — Logbook.** K3 found it was the only corrected direction that delivered its core premise without a remaining structural compromise. It leads on logging speed, clarity, accessibility, desktop behavior, and implementation feasibility.

## Codex recommendation

**Approve A — Logbook**, with two bounded borrowings:

1. Use B’s clearer standalone prior-performance fact format within A’s open-row context.
2. Use C’s structural rest idea by filling A’s existing 3px current-row tick during rest, without adding a full timeline rail.

This hybrid preserves A’s speed and low-risk presentation-only path while improving warmth and rest salience. It does not add a product destination, algorithm, data contract, or recommendation behavior.

## Approval interpretations

- `APPROVE A`: Logbook exactly as the base direction.
- `APPROVE B`: Spotter Cards exactly as the base direction.
- `APPROVE C`: Session Spine exactly as the base direction.
- `APPROVE RECOMMENDED`: A with the bounded B/C borrowings above.
- `APPROVE HYBRID: …`: the named base and requested elements, with reasonable secondary details resolved from the K3 comparison.

Production implementation has not begun. Existing inherited Kimi P0 source changes remain isolated and uncommitted pending this gate.
