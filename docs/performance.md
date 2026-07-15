# Performance benchmark

## Method

Measurements use the development-only `?perf=1&perfFixture=large` fixture and the app's in-page `performance.now()` instrumentation. The fixture adds 180 submitted sessions, 1,440 exercise records, and 5,760 completed sets. The current Templates samples were recorded in Chromium at a 375 px mobile viewport and a 1280 x 900 desktop viewport. Browser-control transport time is excluded because it is not application latency.

The fixture and timing logs are available only on `localhost` or `127.0.0.1`. Production keeps neither the synthetic data nor verbose timing output.

## Results

| Interaction | Before | After |
| --- | ---: | ---: |
| Cold Lift render with program score | 1,145.2 ms | 233.4 ms |
| Cold active-workout restore/render | 1,145.2 ms shared path | 92.3-95.9 ms |
| Cached return to Lift | Not cached | 5.4 ms |
| Dashboard render | 393.0 ms | 90.3 ms cold, 11-12 ms cached |
| Templates render | 887.3 ms | 39.1 ms mobile, 7.3 ms desktop initial frame |
| Charts render | 2,150.6 ms | 95.5 ms after shared history warm-up |
| Reps/load/RPE input handler | Could trigger full-workout work | 0.5-0.9 ms |
| Complete set and start rest | 220.6 ms | 20.3 ms |
| Adjust active timer | Full render path | 1.8 ms |
| Full data serialization | 33.9 ms on the edit path | 34.3 ms, deferred and idle-scheduled |

These values are deterministic development benchmarks, not network round-trip timings. IndexedDB and remote synchronization continue asynchronously and report failures without blocking workout entry.

## Changes behind the result

- Active set edits use indexed entity lookup and mutate only the relevant draft record.
- Compact active-workout snapshots persist after a short debounce; full history persistence is batched and idle-scheduled.
- Completed-history analysis is separated from draft state and invalidates only when completed source data changes.
- Six-month history, weekly volume, fatigue, hypertrophy, chart, recommendation, and previous-performance queries share revision-keyed caches.
- The latest hypertrophy window uses a lightweight qualifying-week pass and performs the expensive target-aware aggregation once.
- Set completion and timer adjustment update the relevant DOM nodes instead of rebuilding the application shell.
- Templates skip coaching calculations while an active workout locks their Start actions.
- Templates now use progressive disclosure: the initial frame skips completed-history fatigue analysis and per-template prescription work, does not construct collapsed exercise editors, renders the current mesocycle as a summary until requested, and keeps historical mesocycles compact. Muscle-scope checkbox taps update local draft state without a full application render. The previous 71 ms cold / 5.4 ms cached Templates figures predate this planner disclosure boundary and should not be used as the post-change benchmark.
- The 2026-07-15 large-history browser regression at source commit `afe7a6c` (180 submitted sessions, 1,440 exercises, 5,760 sets) measured the initial Templates frame at **39.1 ms on the 375 px mobile project** and **7.3 ms on desktop Chromium**. `tests/ui/ui-audit.spec.js` enforces a conservative 250 ms ceiling and verifies that collapsed editors and mesocycle candidates are absent from the initial DOM, then verifies editor open/close behavior. These are local development measurements rather than a broad device benchmark; mobile samples can vary with evidence initialization but remain well inside the guardrail.
- Recent History reuses the workout grade saved at submission rather than recalculating it per row.
- The unused 2.0 MB legacy athlete image was removed from both source assets and web output.

## Bundle

At source commit `afe7a6c` on 2026-07-15, the dependency-free single HTML application is **1,111,567 bytes raw**, **229,358 bytes with gzip**, and **174,546 bytes with Brotli**. The compressed sizes were measured from the root `index.html` with the repository's current static-asset content; they are not network transfer traces and can differ with server compression settings. Chart logic is parsed with the application but is not executed on the workout path. A future module split could reduce initial parse work, but the current measured Lift bottleneck was analysis execution, not a chart-library download.

## Remaining watch item

The cold overall-program score is still the heaviest first-view calculation at about 233 ms for the dense fixture. It is outside active set entry and is cached after the first result. If retained histories or program breadth grow materially beyond the six-calendar-month boundary, the next useful step is chunked or worker-based score aggregation rather than broader component memoization.
