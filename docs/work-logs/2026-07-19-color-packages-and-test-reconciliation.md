# Color packages and test reconciliation

## Scope

- Implement all ten documented color packages as saved app settings.
- Make the visual choice discoverable under More.
- Fix the automatic planner frequency failure at the scheduler source.
- Reconcile valid old navigation/research tests with the current app instead of deleting coverage.

## Verification

- `npm run test:prescription-engine`: 40/40 passed.
- Backup contract, domain integrity, prescription integration, and static lint passed.
- `npm run sync:web` and `npm run verify:pwa`: 32 public assets synchronized and verified.
- Focused Playwright mobile/desktop color-package and persistence coverage passed.
- Focused Playwright current-navigation coverage passed after replacing one remaining superseded Progress heading assertion.
- The complete public functional gate passed; its two sandbox-denied nested Git checks passed when rerun with the required read-only process permission.
- The UI audit initially identified insufficient Signal Garden secondary-blue contrast. The light-package token was darkened, then axe, mobile/desktop route screenshots, and protected workout/Progress baselines passed and were refreshed.

## Hosted verification

Pending deployment of this task's pushed commit. Record the production URL, mobile/desktop result, refresh persistence, and console state here before completion.
