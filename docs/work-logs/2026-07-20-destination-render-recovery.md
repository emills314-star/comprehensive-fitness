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

## Follow-up Today diagnosis

- After the Progress repair, a persisted legacy/new-exercise prescription still reproduced the Today destination error. Its explanation could be a structured object, but the legacy rationale renderer called `.split()` directly on that saved value.
- The trace then exposed a second Today-only `ReferenceError`: compact logger commit `4ae7e39` moved prior performance into field-aligned rows and removed `formatPreviousSetPerformance`, while the expanded legacy role rationale still called that formatter.
- Commit `cc52f00` restores the resistance-aware prior-set formatter, adds a bounded `recommendationExplanationForDisplay` projection without rewriting persisted data, advances the installed-app cache to v45, and adds a browser regression for the exact structured legacy prescription path.
- Ten focused mobile/desktop tests passed across Today legacy/Strong fallback, partial snapshots, template start, and Progress hard rejections. Static lint, integration, compact-density, PWA/native parity, service-worker cache/update, and privacy checks passed. The full 47-test public gate passed collectively after its two read-only Git checks were rerun outside the child-process sandbox.
- Production reads confirmed service-worker v45 plus both repaired runtime boundaries. `https://comprehensive-fitness.vercel.app/?verify=cc52f00#today` rendered the app shell and Today navigation with zero destination-error elements at 390 x 844 and 1280 x 900.
