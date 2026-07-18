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

## Verification required

- Public tests, deployment/PWA/service-worker contracts, and root/`www` parity.
- Full mobile/desktop browser audit with protected screenshots unchanged.
- Hosted runtime, console, CSP, cache, and critical safety-flow verification.
