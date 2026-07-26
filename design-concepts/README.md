# Top-down UI concepts

> **Status:** Design exploration. Not production, not a decision, not wired to anything.
> **Synthetic data only:** a fictional athlete and invented lifts. No imported or personal fitness data.

Four complete reinterpretations of the app, six screens each, rendered at 390 × 844.
Nothing in this folder is loaded by `index.html`, the service worker, or the Capacitor
payload, and no file outside `design-concepts/` and `artifacts/design-concepts/` is touched.

```bash
node design-concepts/capture.js
```

Renders 33 PNGs to `artifacts/design-concepts/` (gitignored). To browse interactively,
run `npm run dev` and open `http://127.0.0.1:8765/design-concepts/`.

## The one rule: the palette does not change

`tokens.css` is a **verbatim extract of `index.html` lines 19–202** — `:root`, the light
theme, and all ten colour packages. Concept files may only reference `var(--token)`.

`capture.js` enforces both halves before it renders anything:

| Guard | What it does |
| --- | --- |
| Token parity | Re-extracts the block from `index.html` and diffs it against `tokens.css`. Drift on either side fails the run. |
| No raw colour | Fails if a hex or `rgb()` literal appears in any concept HTML or CSS outside `tokens.css`. |

So "same palette" is proved on every render rather than asserted. Semantic roles are
preserved too — `--current` action/next, `--success` done, `--amber` warn,
`--rest-accent` rest, `--red` destructive. The concepts reinterpret layout, never the
meaning of a colour.

Each concept also renders a `night-stadium` dark variant of its active-workout screen, so
you can see the direction hold up across the palette's range.

## The four directions

Every concept is a thesis about what the app fundamentally *is*, and each yields a
different component language. None borrows a metaphor — that is deliberate, and it is what
separates them from the 15 directions in `docs/design/COMPLETE_REDESIGN_CONCEPTS.md`
(sequencer, bento, cards, timeline, mission, notebook, broadcast, newspaper, anatomy,
transcript, command line, workshop, graph, orbit, quest). All four here derive their
structure from the app's own domain logic instead.

### A — Two-Speed · `a-two-speed.html`

The app is used in two incompatible contexts and should carry two visual languages rather
than one compromise.

- **Gym** — under the bar. Near-monochrome, exactly one accent spent on the live state
  (blue your set → gold resting → green logged), numerals at arm's length, three
  interactive elements maximum, no cards, no disclosures, no navigation.
- **Study** — between sessions. Full palette, dense, layered, evidence open by default.
- Starting a workout does not navigate; it changes the app's personality.

**Optimises for:** the two seconds you actually have between sets.
**Costs:** two design systems to build and maintain, and a mode switch users must
understand. The Study half is, honestly, a refined version of today's app.

### B — Budget · `b-budget.html`

Hypertrophy training is allocation against research landmarks, so the app is built from
exactly one primitive: the allocation bar, repeated fractally at every scale — set in
exercise, exercise in session, session in week, week in mesocycle. The bar *is* the
container; there are no generic cards. MEV/MAV/MRV become labelled ticks on that same bar.
Navigation is a zoom level, not four peer tabs. Even the rest timer is an allocation —
the same bar spending time instead of sets.

**Optimises for:** understanding *why* a session looks the way it does, and making volume
management the spine of the product.
**Costs:** logging a set is not really an allocation act, so the active workout is the
weakest screen. The zoom ladder is unfamiliar navigation.

### C — Confidence · `c-confidence.html`

Every derived value already carries a confidence, so the interface renders itself to look
exactly as certain as the data is. Certainty becomes a visual dimension alongside hue:

| Level | Treatment | Meaning |
| --- | --- | --- |
| 4 | Solid fill, full weight | Well evidenced |
| 3 | Tinted fill, solid border | Good |
| 2 | Outline only, solid border | Thin |
| 1 | Dashed outline, muted ink | Provisional |

Evidence is never a disclosure — it is the always-visible second line of every claim. The
trend line itself goes dashed across weeks with too little data, so a trend you should not
trust never looks like one you should.

**Optimises for:** the app's actual differentiator — transparent, defensible reasoning —
made visible everywhere at zero navigation cost.
**Costs:** needs careful copy so "dashed" reads as *honest* rather than *broken*, and so
the app does not feel like it is constantly hedging.

### D — Plan vs Actual · `d-plan-actual.html`

The central relationship is prescribed versus performed; that delta drives the grade, the
progression, the fatigue flags and the score. So the whole interface becomes a diff, with
one three-column spine — **plan | actual | delta** — repeated at set, exercise, session,
week and block scale. The set row stops being a form: the prescription is printed and you
fill in the answer beside it. Delta is the only place strong colour is spent.

This is the only concept that surfaces a capability the app does not have today: the Plan
screen scores templates by completion rate, turning "back is 5 sets under" into "Upper B
gets cut after the third lift, five runs in a row — trim it to 4 lifts."

**Optimises for:** explaining itself, and catching the gap between the program you wrote
and the program you actually run.
**Costs:** two columns on a 390 px phone is tight, and the diff framing can read as
judgmental if the copy is not careful.

## Comparison

| | A Two-Speed | B Budget | C Confidence | D Plan vs Actual |
| --- | --- | --- | --- | --- |
| Speed under the bar | **Best** | Weakest | Good | Good |
| Explains its reasoning | Good | **Best** | **Best** | **Best** |
| Differentiated vs competitors | Good | Good | **Best** | Good |
| Migration risk | High — two systems | Medium — new navigation model | **Lowest** — rendering rule over existing IA | Medium — new row primitive |
| Weakest screen | Study side is incremental | Active workout | Plan | Progress at 390 px |
| Strongest screen | Active workout | Progress | Prescription & evidence | Completed summary |

## Recommendation

**Concept C — Confidence.** It makes the app's genuine differentiator visible on every
screen at no navigation cost, it is the hardest of the four for a competitor to copy, and
because it is a rendering rule layered over conventional information architecture rather
than a new spatial model, it carries the lowest migration risk.

Separately: **Concept A's gym screen is the best individual screen in the set.** Whichever
system wins, the active workout deserves that treatment — one accent, no disclosures,
numbers readable at arm's length. That is the screen where the shipped app's four levels of
nested `<details>` hurt most.

## If a direction is chosen

This folder is exploration and deliberately updates no living document. Per `AGENTS.md` the
documentation loop binds *application* changes, and nothing here changes the application.
A production cutover would need to update `docs/UI_UX.md` and `docs/ROADMAP.md`, refresh the
Playwright baselines in `tests/ui/__screenshots__/`, re-check the design-system entropy
ceilings in `tests/ui/ui-audit.spec.js`, and advance `CACHE_NAME` in `sw.js`.

Until then this folder can be deleted with no effect on the app.
