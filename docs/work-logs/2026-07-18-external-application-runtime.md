# External application-runtime boundary

## Status

**IMPLEMENTED:** The executable application runtime is no longer embedded in `index.html`. Its script body moved byte-preservingly to the owned `app.js` asset, leaving protected UI markup and behavior unchanged.

## Why

The inline 973 KB runtime coupled document edits, CSP digests, browser execution, and deployment line-ending behavior. That coupling caused the production CSP outage discovered during hosted milestone verification and materially limited architecture and release-readiness evidence.

## Changes

- Load `app.js` after the existing domain modules from the document shell.
- Provide one test-only contract-source adapter so static behavior contracts inspect both owned files without duplicating runtime source.
- Cache, package, parity-check, lint, and privacy-scan `app.js` as a first-class public asset; advance the service worker to cache version 34.
- Reduce Vercel `script-src` to exactly `'self'`; reject executable inline bodies and obsolete CSP hashes.
- Keep cloud-copy consent visually canonical while authorization is pending and render enabled state only after the durable IndexedDB write; the full release matrix exposed the immediate-reload race.

## Verification results

- `npm run check:public`: passed, including 41/41 selected public scripts, research validation, privacy/dependency/workflow gates, and 24-asset PWA/native parity.
- Focused candidate browser audit: 31 passed and one intentional skip across safety plus every primary-screen UI audit; protected screenshots were unchanged.
- Durable cloud-consent stress regression: 20/20 passed across mobile and desktop.
- `npm run release:verify`: passed on committed revision `21c8768` with 204 browser cases passed and 18 intentional protected/private skips.
- GitHub `main` and production resolved to `21c8768ff3eece2788d22d9ae01664b04b884570` before this documentation-only evidence update.
- Hosted asset inspection: `index.html` loads `app.js`, has zero executable inline bodies, CSP is exactly self-only for scripts, and service-worker cache v34 is live.
- Hosted focused verification: 12/12 safety-integrity cases and 2/2 durable-consent reload cases passed across mobile and desktop.
