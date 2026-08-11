# Protected logic map

| Contract | Primary implementation | Verification evidence | Redesign rule |
| --- | --- | --- | --- |
| Local persistence, import/export, recovery | `app-foundation.js`, `app-import.js`, `backup-contract.js`, `app-sync.js` | public/domain, backup, sync, privacy, runtime-trust tests | Presentation only; never write real data from prototypes. |
| Stable routine targets and set roles | `app-workout.js`, `prescription-engine.js`, schemas | M1 and active-workout suites | Keep set order, warm-up/working role, rep range, RPE, and rest unchanged. |
| Optional readiness and safety exceptions | `exception-resolver.js`, `app-workout.js`, `app-views.js` | M2, M5, M6 suites | Readiness never gates Start; only explicit pain/illness may surface one advisory action. |
| Active draft and interrupted recovery | `app-workout.js`, `app-foundation.js` | M5/M6 and lifecycle suites | Preserve entered load/reps/RPE, current set, notes, order, and timer. |
| Rest timer and notifications | `rest-completion-controller.js`, `app-workout.js`, `app-sync.js` | rest, PWA, notification, M6 suites | One persistent timer; per-set duration and replacement semantics remain intact. |
| Workout submission and immutable history | `app-workout.js`, `app-history.js` | critical lifecycle, M7, history suites | No set loss; submitted facts and historical algorithms remain immutable. |
| Actual-work grade and PR highlights | `app-analysis.js`, `app-history.js`, `app-views.js` | M7 and grade suites | Redesign feedback only; do not reinterpret or invent results. |
| Factual Progress | `app-history.js`, `app-views.js` | M4/M7, analytics/history suites | Exact variant/resistance/role separation and chronological history remain. |
| Routines | `app-views.js`, `app-workout.js` | template/history lifecycle suites | Contextual planning surface only; do not restore mesocycles or a persistent tab. |
| Offline/PWA/native packaging | `sw.js`, `manifest.webmanifest`, `scripts/sync-web.ps1`, Capacitor projects | PWA, cache, native privacy checks | Keep root/`www` parity and offline boot behavior. |
| Privacy and public-data boundary | `.gitignore`, `.vercelignore`, privacy scripts/tests | `check:privacy`, private lifecycle tests | Synthetic prototype data only; never commit personal records or secrets. |

## Explicitly retired behavior

Mesocycle planning, numeric fatigue/readiness scoring, normal progression recommendations, dashboard KPI grids, themes, cloud workout copy, and persistent Templates/Settings destinations are not redesign scope. Reintroducing them would be a product change, not a visual redesign.
