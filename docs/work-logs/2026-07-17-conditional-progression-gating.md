# Conditional progression gating — 2026-07-17

## Change

- **Summary:** Corrected active set guidance so a top/back-off/working-set load increment is actionable only after its complete role-level rep/RPE gate qualifies. An unqualified back-off now holds the current load and uses conditional progression state instead of presenting evidence confidence as permission to add weight.
- **User flow affected:** Lift → active workout → set prescription context and role details.

## Evidence

- **Files changed:** `index.html`, `www/index.html`, `scripts/test-set-prescriptions.js`.
- **Documentation updated:** `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, `docs/ROADMAP.md`.
- **Local validation:** `npm.cmd test` passed; `npm.cmd run audit:ui` passed locally (19 passed, 1 intentional skip); `npm.cmd run sync:web`, `npm.cmd run verify:pwa`, and `npm.cmd run cap:sync` passed.
- **Branch and commit:** `main` @ `3f8afd5`.
- **Deployment inspected:** GitHub `main` deployment through the production alias.
- **Hosted URL/deployment identifier:** `https://comprehensive-fitness.vercel.app/?verify=3f8afd5`.
- **Browser viewport/device sizes:** Hosted Playwright mobile and desktop runs; production source inspected directly.
- **Exact hosted flow tested:** Hosted UI audit exercised Workout, Dashboard, Templates, Charts, Settings, and the guided mesocycle flow. Direct production asset inspection confirmed `progressionReady`, `Hold current`, and the updated `www/index.html`.
- **Expected result:** A prior back-off below the 10–15 rep / 7–8 RPE gate must not authorize 80 lb; it should hold 75 lb until every programmed back-off qualifies.
- **Actual result:** Source and regression coverage confirm the unqualified branch holds `targetLoad`; qualifying all programmed back-offs unlocks `candidateNextLoad`.
- **Console/runtime errors:** No console errors in the hosted flows that passed.
- **Screenshots or visual evidence:** User-provided active Lift screenshot identified the mismatch; local responsive visual audit remained green.
- **Remaining issues:** Hosted audit’s large-history performance test reports `Infinity` on both viewports because the production run does not emit `renderTotal:plan` for that fixture; 17/20 hosted tests passed and the two failures are unrelated to this progression change. The hosted visual card itself was not independently completed with a seeded private fixture.

## Final status

**Deployed but not hosted-verified** — the fix is published and the deployed source is confirmed, but the hosted large-history audit gate remains incomplete as described above.
