# Today and Progress destination recovery

**Date:** 2026-07-20
**Status:** IMPLEMENTED and deployed

## Reproduction and cause

An existing installed-browser fixture reproduced the reported Today error with a preserved open workout. The same application version could still open Plan and More, and the user confirmed the failure also affected Trend/Progress. The active service worker used stale-while-refresh behavior for each allowlisted shell asset, which allowed the old versioned cache to be overwritten one JavaScript file at a time during a release. Ordered classic modules could therefore come from different application versions.

## Fix

- Active workers now serve allowlisted navigations and runtime assets from their immutable versioned cache. A newly installing worker fills a separate cache and becomes the only point where the shell changes versions.
- The shared Today/Progress render boundary clears derived entity and completed-analysis caches and retries exactly once without mutating workout data.
- A second failure retains the bounded error view. If an update is waiting, the view and update banner expose the existing persistence-gated update action even with an open workout, so the workout is saved before activation and a failed save prevents reload.
- Today retains a missing-session fallback before reading session fields.

## Verification

- Commit `3b6fd14` was pushed to `main`; GitHub reported the Vercel deployment successful.
- The full public gate passed 45 application/recommendation/security contracts directly. Its two read-only research Git checks were initially sandbox-blocked, then passed individually with read-only Git access: archive integrity (57 hashes) and workbook determinism (19 sheets, 20,788 source cells, 57 hashes).
- Destination recovery, service-worker cache, integration, compact workout, workout safety, static lint, root/`www` PWA/native parity, and the 467-file alternate-index privacy guard passed.
- `https://comprehensive-fitness.vercel.app/?verify=3b6fd14` opened Today and Progress at 390 × 844 and 1280 × 900 without the destination error or console errors. Both destinations remained usable with the preserved open-workout fixture; no workout was submitted, canceled, or edited.
- Cache-bypassing production reads of `/sw.js?verify=3b6fd14` and `/app-views.js?verify=3b6fd14` confirmed service-worker v43, cache-first immutable shell hits, the shared render retry, and the persistence-gated open-workout update copy.

## Documentation review

- `docs/UI_UX.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md` updated.
- `docs/PROJECT.md` reviewed; product scope is unchanged.
- `docs/DECISION_ENGINE.md` reviewed; no readiness, progression, fatigue, or recommendation rule changed.
