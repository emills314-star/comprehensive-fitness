# Public-only offline cache boundary

## Change

- Summary: Replaced generic successful-GET caching with an immutable same-origin public-shell allowlist. Sensitive, API, backup/export, database, query-bearing, cross-origin, unlisted, private, and no-store responses cannot enter Cache Storage; notification URLs are restricted to non-sensitive same-origin targets.
- User flow affected: Installed/offline PWA loading, service-worker updates, background rest notification delivery, and notification-tap navigation.

## Evidence

- Files changed: `sw.js`, synchronized `www/sw.js`, `scripts/test-service-worker-cache.js`, `scripts/verify-pwa.ps1`, and `package.json`.
- Documentation updated: `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, and this work log.
- Local validation: `npm test` passed, including mocked runtime cache-policy assertions; `npm run cap:sync` copied the payload into Android and iOS; post-copy `npm run verify:pwa` passed; `npm run audit:ui` passed 19 tests with 1 intentional skip; production dependency audit reported zero vulnerabilities. CocoaPods/Xcode steps were unavailable on Windows and skipped by Capacitor as expected.
- Branch and commit: `main` at `a617e7a` (`Restrict offline cache to public assets`), pushed to GitHub.
- Deployment inspected: The Vercel production alias directly served worker cache revision `comprehensive-fitness-pwa-v31` with `PUBLIC_CACHE_PATHS`, `isSensitivePath`, no-store requests, and no generic `if (response.ok) caches.open` path.
- Hosted URL/deployment identifier: `https://comprehensive-fitness.vercel.app/?verify=a617e7a` and direct `https://comprehensive-fitness.vercel.app/sw.js?verify=a617e7a` inspection.
- Browser viewport/device sizes: 390 × 844 mobile and 1280 × 800 desktop overrides.
- Exact hosted flow tested: Load the cache-busted production app in fresh mobile and desktop tabs; wait for full render; inspect body/control presence, viewport widths, and console logs; directly open the deployed worker and verify its cache revision and policy markers.
- Expected result: The deployed worker contains the public-only policy; the app still renders responsively at both widths; no console/runtime errors occur; an active workout may defer activation without hiding the deployed worker revision.
- Actual result: Passed. The deployed worker was 8,129 bytes and contained cache `v31`, the explicit allowlist, sensitive-path and no-store handling, and no generic successful-response cache statement. The app rendered 25 controls at both widths, remained within the physical viewport (390/390 mobile and 1,273/1,280 desktop including scrollbar allowance), and produced no console logs/errors. The existing browser profile's active workout showed the intended update-deferred message; no workout state was modified.
- Console/runtime errors: None.
- Screenshots or visual evidence: Live DOM/viewport/log reads and direct deployed-worker source inspection were used; no visual baseline changed.
- Remaining issues: Physical-device offline/update and Web Push delivery remain **NEEDS REVIEW** external/device verification. The audit goal's independent 40/50 and 48/50 scoring gates have not yet been claimed.

## Final status

**Complete:** implemented locally, published to GitHub `main`, deployed, and verified on the hosted website within the stated non-destructive scope.
