# Daily browser QA

## Purpose

This is the runbook for browser automation. It exercises the local PWA and, for every user-facing change, the actual hosted deployment. Local code, a passing build, a commit, deployment status, or a written work log is not completion evidence by itself.

## Daily procedure

1. Read `AGENTS.md`, `docs/UI_UX.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md`. Preserve unrelated working-tree changes.
2. Start or reuse `npm run dev` at `http://127.0.0.1:8765/` and use the browser tools. Do not substitute source inspection for browser interaction.
3. Begin with a clean, non-personal browser state. Never import or expose files under `personal_fitness_data/`.
4. At desktop and mobile-width viewports, inspect the initial screen and click each primary destination: Today, Plan, Progress, and More. Within Progress, open Overview, Lifts, and History. Check clipping, overlap, wrapping, focus visibility, blank/empty states, responsive navigation, theme contrast, and browser console errors.
5. Exercise the critical flow with synthetic data only: create a disposable template in Plan, review readiness, start a workout, verify the focused phone exercise/session board hierarchy, enter and complete a set, open/cancel submission once, submit, inspect the summary, open Progress History and Overview, inspect Progress Lifts charts, toggle lb/kg in More and confirm values and labels remain coherent, then reload and verify persistence.
6. Exercise confirmation and cancellation paths without clearing unrelated local data. Verify dialogs trap focus and return focus sensibly.
7. Treat any console exception, blank screen, broken control, inaccessible label, clipped/overlapping content, contradictory unit label, or failed persistence check as a defect. Capture the route, viewport, interaction, expected result, actual result, console evidence, and screenshot when useful.
8. For each reproducible defect, inspect the implementation and governing docs, make the smallest safe fix, add or update a regression test, run the relevant tests plus `npm run sync:web` and `npm run verify:pwa`, reload the browser, and repeat the failed flow. Update `docs/UI_UX.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md` when their documented status changes.
9. For every UI/UX/navigation/interaction/styling change, confirm the intended branch and latest deployment, open the hosted URL, repeat the affected flow at mobile and desktop widths, inspect console/runtime errors and stale assets, and record the hosted URL, viewport, exact flow, expected result, actual result, and evidence in the work log. Refresh the hosted site and repeat the critical step to rule out stale local state. A change is not `Complete` until local validation, deployment inspection, and hosted browser verification all pass.
10. If the hosted site does not reflect the branch, investigate wrong branch/project, failed build, cache/service-worker, alias, environment, or runtime errors. Resolve the cause or report `BLOCKED`/`NEEDS REVIEW`; never mark it complete from source inspection alone.

## Safety boundary

The automation may edit and test this repository to fix verified application defects. Publishing or deployment requires the user's authorization, but once authorized it is part of the completion gate for user-facing work. Never clear user data, use private health data, change external services, or bypass confirmation requirements.
