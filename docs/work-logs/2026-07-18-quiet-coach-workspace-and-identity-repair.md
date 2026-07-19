# Quiet Coach workspace and exercise-identity repair

## Status

**COMPLETE** — implementation commit `324f008` is published to `main` and verified on production.

## Scope

- Replace the prior five-tab/reskin composition with four destinations: Today, Plan, Progress, and More.
- Make an active phone workout focus one lift and actionable set; retain a wide-screen session board.
- Put volume, lift charts, and submitted history into one Progress workspace.
- Prevent an unexpected view-render exception from leaving the application blank.
- Restore exact prior-session history and science-backed recommendations for reconciled personal exercise variations.
- Remove superseded renderers, selectors, navigation markup, and obsolete visual baselines.

## Root cause

The prior-history failure was an identity-boundary defect, not an absence of workout data.

- `double_pulley_lat_pulldown` was a valid personal performance identity crosswalked to public `ex_lat_pulldown`, but the application discarded that crosswalk result. History and prescription consumers consequently queried inconsistent IDs.
- `chest_assisted_row` was valid and collision-free but was rejected solely because it predated the `custom_`/`user_` prefix convention.
- Strong imports stored exercise names without a durable performance/research identity profile, so downstream consumers independently inferred identity.

The repair separates `performanceExerciseId` (exact prior loads and variation history) from optional `researchExerciseId` (taxonomy and science defaults), persists `exercise-identity/2.0.0` fields on new/imported executable records, and resolves legacy records at read time without rewriting submitted history.

## Local verification

- Application integration contracts: 34/34 passed, including sanitized Double Pulley Lat Pulldown and Chest Assisted Row evidence.
- Analytics/settings lifecycle: 18/18 passed on mobile and desktop, including chart opening, search, period changes, selected-point detail, persistence, and offline shell behavior.
- Protected Today/Progress surfaces: 14 passed and 14 expected project skips; intentional mobile/tablet/desktop/light/dark/zoom baselines refreshed.
- Public prescription integration, backup contract, service-worker cache, performance, and syntax checks passed during implementation.

## Publication and hosted verification

- GitHub `main`: `324f008` (`Rebuild UI and repair exercise history identity`).
- GitHub deployment `5507770536`: Production completed successfully at 2026-07-19T04:12:45Z.
- Production alias: `https://comprehensive-fitness.vercel.app/?verify=324f008-mobile` at 390 × 844 and `?verify=324f008-desktop` at 1280 × 900.
- Flow: load → inspect four destination controls → open Progress → open Lifts → verify rendered empty state → reload.
- Expected/actual: Today, Plan, Progress, and More rendered with Now, Map, Trend, and Menu cues; Progress Lifts rendered “Log an exercise…” instead of a blank view; reload retained `#progress-lifts`; no destination error appeared.
- Console/runtime evidence: zero `pageerror` or application console-error events in either clean context.
- Existing in-app-browser state remained untouched: its prior service worker correctly deferred activation because a local workout was open. The final served `app-foundation.js` was independently confirmed to contain the four-destination contract, and clean production contexts verified the rendered result.

The final public suite passed 42/42 selected scripts; PWA verification, static lint, privacy guard, 34/34 application integration contracts, 18/18 analytics/settings lifecycles, the focused accessibility matrix, the executable-snapshot trust check, eight destination goldens, and 14 protected-surface checks all passed. No private fitness artifact, credential, local database, or generated audit artifact was staged or published.
