# Daily browser QA

## Purpose

This is the runbook for the daily Codex browser automation. It exercises the real local PWA, checks visual and interactive behavior, and fixes reproducible defects with tests and documentation.

## Daily procedure

1. Read `AGENTS.md`, `docs/UI_UX.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md`. Preserve unrelated working-tree changes.
2. Start or reuse `npm run dev` at `http://127.0.0.1:8765/` and use the in-app browser tools. Do not substitute source inspection for browser interaction.
3. Begin with a clean, non-personal browser state. Never import or expose files under `personal_fitness_data/`.
4. At desktop and mobile-width viewports, inspect the initial screen and click each primary destination: Workout, Dashboard, Templates, Charts, and Settings. Check clipping, overlap, wrapping, focus visibility, blank/empty states, responsive navigation, theme contrast, and browser console errors.
5. Exercise the critical flow with synthetic data only: create a disposable template, review readiness, start a workout, enter and complete a set, open/cancel submission once, submit, inspect the summary, open History/Dashboard, inspect Charts, toggle lb/kg and confirm values and labels remain coherent, then reload and verify persistence.
6. Exercise confirmation and cancellation paths without clearing unrelated local data. Verify dialogs trap focus and return focus sensibly.
7. Treat any console exception, blank screen, broken control, inaccessible label, clipped/overlapping content, contradictory unit label, or failed persistence check as a defect. Capture the route, viewport, interaction, expected result, actual result, console evidence, and screenshot when useful.
8. For each reproducible defect, inspect the implementation and governing docs, make the smallest safe fix, add or update a regression test, run the relevant tests plus `npm run sync:web` and `npm run verify:pwa`, reload the browser, and repeat the failed flow. Update `docs/UI_UX.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md` when their documented status changes.
9. If no defect is found, do not edit application files. Report the surfaces, viewports, and flows checked. If blocked by an approval, authentication, unavailable browser, or pre-existing conflicting edit, report `NEEDS REVIEW` with concrete file and interaction references instead of guessing.

## Safety boundary

The automation may edit and test this repository to fix verified application defects. It must not publish, deploy, push, clear user data, use private health data, change external services, or bypass confirmation requirements. Those actions require separate user authorization.
