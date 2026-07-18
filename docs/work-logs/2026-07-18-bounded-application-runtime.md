# Bounded application runtime

## Verified result

**IMPLEMENTED:** The external 973 KB application runtime is byte-preservingly divided into eight ordered, responsibility-named classic-script segments. The document shell, CSP, service worker, packaging, static contract source, and deployment checks own the complete ordered list.

The split retains the current browser-global lexical contract so behavior does not need to be rewritten at the same time as file ownership. The largest segment is 236,903 bytes; `scripts/test-runtime-boundary.js` enforces a 300 KiB ceiling, parses every segment independently, verifies exact document order, and parses the concatenated runtime.

## Ownership

- `app-foundation.js`: state, persistence, canonical prescription integration, and navigation foundations.
- `app-views.js`: Lift/Dashboard and guided-planner view behavior.
- `app-analysis.js`: Templates, history, charts, score, and Settings presentation.
- `app-workout.js`: local workout/template mutation commands.
- `app-sync.js`: installation, push, workout sync, rest timers, and background integration.
- `app-history.js`: workout grading, submission, PRs, and completed summary.
- `app-import.js`: export/import validation, volume, fatigue, and readiness aggregation.
- `app.js`: delegated interaction routing, lifecycle listeners, and startup.

## Residual risk

**NEEDS REVIEW:** The segments share an ordered classic-script lexical environment. Explicit ES-module imports would strengthen compile-time dependency direction, but require a separate offline/native compatibility change with full browser parity evidence.

## Verification

- `npm run check:public`: passed; 42/42 public scripts, 1 private-only harness intentionally excluded, 10,240/10,240 recommendation fuzz assertions, research validation, privacy/dependency gates, and 31-asset PWA parity all green.
- `npm run audit:ui`: passed; 204 cases passed and 18 protected/private cases intentionally skipped across the 222-case mobile/desktop matrix, with unchanged protected screenshots.
- Focused app-integration browser suite: 32 passed and 2 intentionally skipped across mobile/desktop.
- `test-runtime-boundary`, deployment, service-worker cache, app-integration, workout-grade, and sync-consent contracts passed.
- The static contract adapter was corrected after a focused grading test showed that synthetic per-segment wrapper tags could interrupt a marker-spanning extraction. It now concatenates the exact ordered runtime into one test-only contract body while the real document continues to load separate external scripts.
