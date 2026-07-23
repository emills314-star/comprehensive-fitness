# Target RPE exercise defaults and recollapse cue

## Change

- Summary: Added shared and per-set Target RPE controls to every active exercise’s Exercise defaults editor, preserved exact RPE targets through reusable templates and history-derived structures, and added a yellow upward-chevron cue to expanded section-level disclosures.
- User flow affected: Today → active workout → Exercise options → Exercise defaults / Individual set targets, plus expanded section-level disclosures across the app.

## Evidence

- Files changed: Application analysis, foundation, import, view, workout, style, PWA cache, synchronized `www/` assets, focused tests, and governing documentation.
- Documentation updated: `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, `docs/training-prescription-data.md`, `docs/ROADMAP.md`, and this work log.
- Local validation (tests/lint/build): Full 50-script public test gate, static lint, privacy gate, PWA/native packaging verification, service-worker cache/update contracts, focused static/domain checks, and four focused mobile/desktop Playwright cases passed.
- Branch and commit: `main`; pending publication.
- Deployment inspected: Pending.
- Hosted URL/deployment identifier: `https://comprehensive-fitness.vercel.app`; pending updated deployment.
- Browser viewport/device sizes: Local in-app browser inspection passed at 390 × 844 and 1440 × 900; hosted sizes pending.
- Exact hosted flow tested: Pending.
- Expected result: Every exercise can apply a shared Target RPE or independent per-set Target RPE values; saved templates retain those targets; an expanded section shows a yellow upward-chevron recollapse cue and closes when its summary is pressed again.
- Actual result: Local controls and persistence passed. Visual inspection confirmed the phone reflow places Type/Reps above RPE/Rest, the yellow open-state cue is readable, and activating the summary closes the disclosure and removes the cue. Hosted result pending.
- Console/runtime errors: No local warnings or errors; hosted inspection pending.
- Screenshots or visual evidence: In-app browser captures at 390 × 844 and 1440 × 900 reviewed during local verification; hosted capture pending.
- Remaining issues: Hosted deployment and browser verification remain.

## Final status

**Implemented locally** — deployment and hosted verification are still required.
