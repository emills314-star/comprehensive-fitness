# Mesocycle session-quality correction

**Date:** 2026-07-12  
**Commit deployed and inspected:** `d8df9b2`  
**Status:** Complete — implemented locally, deployed, and verified on the hosted website

## Files changed

- `prescription-engine.js`
- `index.html`
- `schemas/mesocycle-plan.v1.schema.json`
- `scripts/test-prescription-engine.js`
- `scripts/test-prescription-app-integration.js`
- `tests/ui/ui-audit.spec.js`
- `playwright.config.js`
- `docs/DECISION_ENGINE.md`
- `docs/ARCHITECTURE.md`
- `docs/UI_UX.md`
- `docs/ROADMAP.md`
- `docs/training-prescription-data.md`
- this work log

## Documentation updated

The decision engine, architecture, UI/UX, roadmap, and training-prescription data contract now define the 18-working-set daily cap, two-exercises-per-target-muscle daily cap, major-muscle-first construction, direct/secondary/incidental set accounting, schedule-capacity handling, actionable review filtering, and constrained regeneration. `ARCHITECTURE.md` also documents `PLAYWRIGHT_BASE_URL` for repeatable hosted UI audits.

## Local validation performed

- Complete `npm test`: passed.
- Prescription engine: 36/36 passed, including four-day broad scope, insufficient schedule capacity, weighted secondary contribution, direct-set priority, redundancy, and regeneration constraints.
- Prescription application integration: passed.
- Mesocycle schema contracts: passed.
- `npm run sync:web`: passed.
- `npm run verify:pwa`: passed.
- Planner mobile/desktop Playwright regression: 2/2 passed.
- The full UI audit had 17 passing tests, two planner expectation failures caused by the old requirement that an empty review container always render, and one intentional skip. After correcting that expectation, the affected mobile/desktop planner regression passed 2/2.

## Deployment inspected

- Git branch: `main`.
- Vercel deployment status: Ready for commit `d8df9b2`.
- Public production alias: `https://comprehensive-fitness.vercel.app`.
- Deployment inspected in the signed-in browser: `https://comprehensive-fitness-13fkqsuke-emills314-stars-projects.vercel.app`.
- Repeatable hosted Playwright command: set `PLAYWRIGHT_BASE_URL=https://comprehensive-fitness.vercel.app`, then run the planner audit. Mobile and desktop passed 2/2 in 13.4 seconds.

The deployment-specific URL is protected by Vercel authentication for a new headless browser. The signed-in interactive browser was therefore used for that URL; unattended hosted automation used the public production alias. This is an access-control difference, not an application failure.

## Hosted browser verification

### Viewports

- Mobile: 390 × 844, representative of a narrow iPhone.
- Desktop: 1280 × 900 through the hosted Playwright planner audit.

### Exact flow tested

1. Opened the hosted deployment.
2. Opened Templates and the Mesocycle Planner.
3. Kept the existing Step 2 equipment behavior unchanged.
4. Selected a four-day schedule and broad scope, omitting Abs and Neck.
5. Built the full-program draft.
6. Reviewed every session’s exercise count and working-set total.
7. Reviewed direct and secondary weekly muscle volume.
8. Confirmed Passed Checks and Informational Notes were absent.
9. Confirmed an actionable review exposed **Regenerate with Practical Limits**.
10. Activated regeneration and confirmed the rebuilt sessions remained within the hard constraints; remaining capacity conflicts were presented as choices requiring a schedule or scope change.
11. Repeated the main hosted planner flow at mobile and desktop widths through the public alias.
12. Checked browser console and page runtime errors.

### Expected result

No session exceeds 18 working sets; placement never uses more than two exercises for one target muscle in a session; major work is placed first; direct and secondary contributions remain distinct; review noise stays hidden; and regeneration reruns the same constraints rather than randomizing.

### Actual result

The broad four-day hosted plan produced:

- Day 1 Upper: 9 exercises, 18 working sets.
- Day 2 Lower: 9 exercises, 18 working sets.
- Day 3 Upper: 9 exercises, 18 working sets.
- Day 4 Lower: 9 exercises, 18 working sets.

Nine exercises exceeds the normal five-to-eight design target only because this test deliberately selected nearly the complete muscle scope within four days; it remains below the absolute exercise cap and the review provides a consolidation/regeneration path. No session exceeded the hard set cap. Representative volume output kept direct and secondary work separate: Chest 4 direct + 0 secondary; Quads 6 + 0; Hamstrings 6 + 2.8; Glutes 6 + 4.9; Adductors 2 + 2.1. Incidental stabilization received zero credit.

Passed Checks and low-value Informational Notes were not rendered. The regeneration action was visible for actionable findings. No browser console or runtime errors were found. The mobile session cards did not overflow or merge.

## Stale-deployment investigation

The existing production-alias browser initially showed the prior 23-set plan because an active workout caused the service worker to defer activation of the new build to protect workout data. Direct asset inspection and the Vercel deployment both showed engine `2.4.0`. Opening the clean deployment-specific origin loaded the new code and passed the planner flow. The production alias then passed the fresh-context mobile/desktop Playwright audit. This confirms cached active-workout state—not a wrong branch or failed deployment—caused the first mismatch.

## Remaining issues

- Vercel deployment-specific URLs require authentication outside the existing signed-in browser; use the public alias for unattended hosted tests.
- A very broad four-day scope can require nine exercises per session while respecting the hard set cap. The app surfaces consolidation/capacity actions instead of silently dropping primary work. Users who want shorter sessions should add days, narrow scope, or assign lower-priority muscles to maintenance volume.
