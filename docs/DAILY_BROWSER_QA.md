# Daily browser QA

## Purpose

This is the runbook for browser automation. It exercises the local PWA and, when deployment is separately authorized and in scope, the hosted candidate. Local code inspection, a passing build, a commit, deployment status, or a written work log is not interaction evidence by itself.

## Daily procedure

1. Read `AGENTS.md`, `docs/UI_UX.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md`. Preserve unrelated working-tree changes.
2. Start or reuse `npm run dev` at `http://127.0.0.1:8765/` and use the browser tools. Do not substitute source inspection for browser interaction.
3. Begin with a clean, non-personal browser state. Never import or expose files under `personal_fitness_data/`.
4. At desktop and mobile-width viewports, inspect the initial screen and click the only persistent destinations: Today and Progress. Open contextual Routines and Settings from their current entry points, and verify that each returns to Today. In Progress, inspect the exact-variant factual chart and chronological submitted-workout history; do not expect retired Overview, Lifts, Dashboard, analytics, or evidence subviews. Check clipping, overlap, wrapping, focus visibility, blank/empty states, responsive navigation, fixed-light contrast, and browser console errors.
5. Exercise the critical flow with synthetic data only: choose or create a disposable routine through contextual Routines, optionally log readiness, use direct Start, verify the focused active-workout hierarchy, enter and complete a set, open/cancel submission once, submit, inspect the concise result, inspect factual Progress/history, toggle lb/kg in contextual Settings and confirm values and labels remain coherent, then reload and verify persistence. Confirm that ordinary Start never requires readiness or a prescription-review sheet. Verify explicit pain/illness when the fixture provides it; a meaningfully-poor readiness value alone must remain stored and silent.
6. Exercise confirmation and cancellation paths without clearing unrelated local data. Verify dialogs trap focus and return focus sensibly.
7. Treat any console exception, blank screen, broken control, inaccessible label, clipped/overlapping content, contradictory unit label, or failed persistence check as a defect. Capture the route, viewport, interaction, expected result, actual result, console evidence, and screenshot when useful.
8. For each reproducible defect, inspect the implementation and governing docs, make the smallest safe fix, add or update a regression test, run the relevant tests plus `npm run sync:web` and `npm run verify:pwa`, reload the browser, and repeat the failed flow. Update `docs/UI_UX.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md` when their documented status changes.
9. When hosted verification is explicitly authorized, confirm the intended branch and deployed revision, repeat the affected flow at mobile and desktop widths, inspect console/runtime errors and stale assets, and record the URL, revision, viewport, flow, and evidence. Refresh and repeat the critical step to rule out stale state.
10. If a separately authorized hosted candidate does not reflect the revision, investigate branch/project, build, cache/service-worker, alias, environment, and runtime errors. Resolve the cause or report `BLOCKED`/`NEEDS REVIEW`; do not infer a hosted pass from local evidence.

## Safety boundary

The automation may edit and test this repository to fix verified application defects. Publishing or deployment always requires current explicit authorization and remains a separate completion state. Never clear user data, use private health data, change external services, or bypass confirmation requirements.
