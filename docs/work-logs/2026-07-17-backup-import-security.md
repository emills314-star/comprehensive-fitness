# App-backup import security

## Change

- Summary: Added a versioned, fail-closed trust boundary for app JSON backups. Imports now reject unsupported versions, unsafe or duplicate structural IDs, broken entity references, oversized/deep payloads, hostile object keys, and unsupported values before current state can be replaced or persisted.
- User flow affected: Settings → Data and backup → Export data / Import backup or Strong CSV. Strong CSV and private evidence retain separate import paths.

## Evidence

- Files changed: `backup-contract.js`, Settings import/export wiring in `index.html`, PWA shell/parity files, and `scripts/test-backup-contract.js`.
- Documentation updated: `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/UI_UX.md`, and `docs/ROADMAP.md`.
- Local validation: `npm test` passed; `npm run test:backup-contract` passed; `npm run sync:web` passed; `npm run verify:pwa` passed; `npm run audit:ui` passed 19 with 1 intentionally skipped. Local desktop and 375 × 812 browser checks loaded the new contract, rendered Settings/Data and backup, showed no horizontal overflow, and produced no console warnings/errors.
- Branch and commit: `main` at `b31d208` (`Harden app backup import boundary`), pushed to GitHub.
- Deployment inspected: Production alias served the new `backup-contract.js` application-shell reference from the pushed implementation.
- Hosted URL/deployment identifier: `https://comprehensive-fitness.vercel.app/?verify=b31d208`.
- Browser viewport/device sizes: 1280 px desktop and 375 × 812 mobile override (360 px document layout width).
- Exact hosted flow tested: Open production with a cache-busting commit query, confirm the new backup-contract script is in the loaded document, navigate to Settings, expand Data and backup, verify export/import controls, reload at mobile width, and inspect layout plus console state.
- Expected result: The deployed Settings flow loads the new backup boundary, remains usable at desktop/mobile widths, has no page-level horizontal overflow, and emits no runtime/console failures.
- Actual result: Passed. The contract script was present, Data and backup rendered at desktop, the 360 px document width matched its mobile client width, and console warning/error reads were empty before and after mobile reload.
- Console/runtime errors: None.
- Screenshots or visual evidence: DOM snapshots and viewport/console reads were inspected in the signed-in Codex browser session; no screenshot was needed because the change did not alter intended visual styling.
- Remaining issues: This closes the accepted hostile app-backup structural-ID path. The broader audit still requires independent rescoring and remediation of other security/privacy, correctness, testing, and release-readiness findings.

## Final status

**Complete:** implemented locally, published to GitHub `main`, deployed, and verified on the hosted website.
