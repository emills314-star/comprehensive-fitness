# Today and Progress destination recovery

**Date:** 2026-07-20
**Status:** IMPLEMENTED; hosted verification pending

## Reproduction and cause

An existing installed-browser fixture reproduced the reported Today error with a preserved open workout. The same application version could still open Plan and More, and the user confirmed the failure also affected Trend/Progress. The active service worker used stale-while-refresh behavior for each allowlisted shell asset, which allowed the old versioned cache to be overwritten one JavaScript file at a time during a release. Ordered classic modules could therefore come from different application versions.

## Fix

- Active workers now serve allowlisted navigations and runtime assets from their immutable versioned cache. A newly installing worker fills a separate cache and becomes the only point where the shell changes versions.
- The shared Today/Progress render boundary clears derived entity and completed-analysis caches and retries exactly once without mutating workout data.
- A second failure retains the bounded error view. If an update is waiting, the view and update banner expose the existing persistence-gated update action even with an open workout, so the workout is saved before activation and a failed save prevents reload.
- Today retains a missing-session fallback before reading session fields.

## Verification plan

- Destination recovery, service-worker cache, update persistence, compact workout, safety, and PWA parity contracts.
- Root/`www` synchronization and privacy review.
- Hosted mobile and desktop Today/Progress checks after deployment, including refresh, console review, and the published service-worker version.

## Documentation review

- `docs/UI_UX.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md` updated.
- `docs/PROJECT.md` reviewed; product scope is unchanged.
- `docs/DECISION_ENGINE.md` reviewed; no readiness, progression, fatigue, or recommendation rule changed.
