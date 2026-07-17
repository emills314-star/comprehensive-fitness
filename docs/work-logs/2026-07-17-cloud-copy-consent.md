# Workout cloud-copy consent and deletion

## Change

- Summary: Separated workout cloud copy from Web Push. Cloud copy now defaults off, requires explicit client and server consent, rejects non-consenting or oversized writes, expires retained copies within 90 days, and supports authenticated workout, push, and installation deletion.
- User flow affected: Settings → Data and backup → Optional workout cloud copy; Settings notification toggles; Danger Zone local clearing; submitted-workout background behavior.

## Evidence

- Files changed: Settings/state/sync clients in `index.html`; sync authorization, consent, workout, push-revocation, installation-revocation, and Redis deletion helpers under `api/`; `scripts/test-sync-consent.js`; PWA/privacy copies.
- Documentation updated: `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/UI_UX.md`, `docs/ROADMAP.md`, `docs/push-backend.md`, and `privacy.html`.
- Local validation: Node syntax checks passed for all new/changed APIs; `npm test` passed; `npm run test:sync-consent` passed with runtime server denial/acceptance/oversize assertions; `npm run sync:web` and `npm run verify:pwa` passed; `npm run audit:ui` passed 19 with 1 intentionally skipped. Local Settings checks at desktop and 375 × 812 confirmed the cloud-copy checkbox is present/default-off, the disclosure is readable, document width equals client width, and console warnings/errors are empty.
- Branch and commit: `main` at `9aa3134` (`Separate workout cloud consent from push`), pushed to GitHub.
- Deployment inspected: Production served the `workout-cloud-sync` revision after deployment; the new `/api/sync/authorize` route returned method-not-allowed for an unauthenticated GET, confirming route deployment without creating data.
- Hosted URL/deployment identifier: `https://comprehensive-fitness.vercel.app/?view=settings&verify=9aa3134#data`.
- Browser viewport/device sizes: 1280 px desktop and 375 × 812 mobile override (360 px document layout width after opening the disclosure).
- Exact hosted flow tested: Open cache-busted production Settings, expand Data and backup, confirm Optional workout cloud copy is unchecked and states default-off/90-day/non-restore behavior, reload and repeat at mobile width, inspect overflow and console state, then fetch the deployed privacy policy and new API route read-only.
- Expected result: Notifications do not imply workout upload; cloud copy is visibly independent/default-off; desktop/mobile layout remains stable; the privacy page states separation and retention; new API routes are deployed; no console/runtime failures occur.
- Actual result: Passed. Checkbox `checked` was absent at both widths, disclosure and privacy text matched the implemented contract, mobile document/client widths were both 360 px, `/api/sync/authorize` returned 405 to GET, and console warning/error reads were empty.
- Console/runtime errors: None.
- Screenshots or visual evidence: DOM snapshots plus explicit checkbox, viewport, privacy-text, API-status, and console reads were inspected; no visual baseline changed.
- Remaining issues: Live destructive enable/disable was intentionally not exercised against stored workout data during verification. Repository tests prove client/server consent, denial, TTL, deletion scanning, revocation, and offline fail-closed contracts. Production Redis contents and physical-device Push behavior remain **NEEDS REVIEW** external state.

## Final status

**Complete:** implemented locally, published to GitHub `main`, deployed, and verified on the hosted website within the stated non-destructive scope.
