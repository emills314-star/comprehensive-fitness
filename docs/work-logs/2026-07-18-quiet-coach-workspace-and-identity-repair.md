# Quiet Coach workspace and exercise-identity repair

## Status

**IMPLEMENTED LOCALLY; HOSTED VERIFICATION PENDING**

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

Final full-suite, privacy, deployment, and hosted mobile/desktop evidence are recorded before this log is marked complete.
