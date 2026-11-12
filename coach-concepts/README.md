# Coach concepts

> **Status:** Design exploration. Not production, not a decision, not wired to anything.
> **Synthetic data only.** No imported or personal fitness data.

Ten complete reinterpretations of the app as a personal coach that notices when a lift falls
outside your normal and tells you the next best action for this session and the next one.
Open `index.html` in a browser to compare them side by side; each concept page shows five or six
390 × 844 screens.

Nothing in this folder is loaded by the app's `index.html`, the service worker, or the Capacitor
payload. Deleting the folder has no effect on the app.

## What is the same in all ten

- **Colour.** `palette.css` is a verbatim copy of the colour tokens in the shipped `index.html`
  `:root`. Concepts use colour only through those tokens (or `color-mix` of them). Roles are fixed:
  blue = current/action, green = done/inside bounds, amber + pale yellow = the coach's
  out-of-bounds flag, gold = rest, red = destructive only.
- **The story.** Same session, same numbers (`brief/shared.md`): Upper A, week 4, after a
  5 h 48 m night with HRV 27% under baseline. Bench set 1 is 185 × 9; after resting only 1:32 of
  2:30, set 2 is 185 × 6 at RPE 10, about 3.4σ beyond the usual set-to-set drop, while the set-1
  e1RM (253 lb) shows no sign of strength loss. The coach backs sets 3–4 off to 165 × 8, trims
  incline to two sets, and holds bench at 185 for Thursday with a progression rule, a pressing
  deload watch rule, and an HRV < 45 → 175 contingency.
- **The logging contract** (`brief/logging-contract.md`), so the coach engine's set table can be
  built from whichever concept is picked: a Previous column, W / D / F set flags, tap the check to
  accept targets, a rest timer that starts on the check with −15s / +15s / Skip, RPE never
  prefilled, coach changes to later sets with one reason line and Undo, a "This was a deload"
  toggle on every exercise and on the session, "Injured, skip" only on a planned session, and
  Fitbit as one quiet "Last night" line with no scores.

## The ten directions

| # | Concept | Thesis | Built by |
| --- | --- | --- | --- |
| 01 | Control Chart | Every lift lives inside its own normal band; leaving it is the flag. | Sol |
| 02 | Earpiece | The coach talks; the screen is one live caption and one huge button. | Sonnet |
| 03 | Futures | Every decision shows the next session it creates. | Sol |
| 04 | Sentence | The workout is one paragraph the coach keeps rewriting. | Sonnet |
| 05 | Ambient | The best coach app is one you never open. | Sonnet |
| 06 | Hypothesis | Every set is a prediction; every miss is a finding. | Sonnet |
| 07 | Instrument | A training device with one knob the coach turns with you. | Sol |
| 08 | Lint | The coach lints your training like code, with scoped Quick Fixes. | Sol |
| 09 | Engine | Chess-engine analysis for your sets: eval bar, annotations, best line. | Sol |
| 10 | Loaded Bar | The interface is the real, correctly loaded equipment. | Sonnet |

"Sol" is `gpt-6.1-sol` through the Codex CLI; "Sonnet" is Claude Sonnet. Astra (`gpt-6-astra`)
critiqued every round independently. None of the ten reuses a direction from the 15-concept study
in `docs/design/COMPLETE_REDESIGN_CONCEPTS.md` or the four in `design-concepts/`; each brief in
`brief/` names the prior direction it must not become.

## Tooling

```bash
node coach-concepts/check.js                                # palette parity + no raw colour + frame contract
CAPTURE_CHANNEL=msedge node coach-concepts/capture.js       # renders every frame to coach-concepts/shots/
```

On this PC Playwright's bundled Chromium hangs on launch, so `CAPTURE_CHANNEL=msedge` uses the
installed Edge. `capture.js` also reports frames that are clipped, spill sideways, or use text under
11 px.

## If a direction is chosen

This folder deliberately updates no living document; the `AGENTS.md` documentation loop binds
application changes, and nothing here changes the application. A production adoption would need
`docs/UI_UX.md` and `docs/ROADMAP.md` updates, refreshed Playwright baselines, and a `CACHE_NAME`
bump in `sw.js`, and should follow `docs/redesign/coach/COACH_V1_CONTRACT.md`.
