# History-derived session targets and high-watermark return

## Status

**COMPLETE.** Implemented, published to `main` in `9aa7bc6`, and verified on the production alias.

## Intent

Remove the split where the Today recommendation could describe a generic load/rep range while the generated workout rows used different role-specific values. Use prior exercise history, including the strongest valid top-end performance, to construct one executable session plan.

## Implemented

- The load engine separates the latest comparable normal exposure from the historical high watermark.
- Planned reductions, painful exposures, and explicitly invalid-technique exposures cannot become load anchors.
- Ordinary progression advances one equipment increment from the latest comparable load and approaches an older watermark gradually.
- A return after more than 56 days uses the lower-stress of the latest comparable load and about 90% of the valid external-load watermark, rounded down; assisted work uses the easier of the latest assistance and about 10% more assistance with conservative rounding.
- Exact role repetitions come from comparable role/index history: hold repeats, rep progression adds one, a load increase restarts at the range floor, and a return baseline steps down one rep.
- Top and back-off rows share one top-load anchor; recommendation summary and expanded role details render from those generated rows.
- The expanded rationale discloses the history/high-watermark load reason.

## Verification

- `node scripts/test-prescription-engine.js`
- `node scripts/test-set-prescriptions.js`
- `node scripts/test-prescription-app-integration.js`
- `node scripts/test-recommendation-regressions.js`
- `node scripts/test-workout-safety.js`
- `node scripts/test-pain-deload-precedence.js`
- `node scripts/test-prescription-schema-contracts.js`
- `node scripts/test-service-worker-cache.js`
- `node scripts/test-performance.js`
- `npm run verify:pwa`
- `npm run lint`
- Focused desktop Playwright lifecycle: template start, generated row persistence, exact recommendation/load/rep parity, expanded role details, and reload (1/1 passed).

The repository-wide `check:public` wrapper was terminated after remaining silent beyond its bounded run; its focused recommendation, schema, safety, static, packaging, cache, performance, and browser constituents above passed. The full 23-case lifecycle file was also stopped after its detached worker exceeded the wrapper timeout; the directly affected focused case passed independently. These are verification-runner limitations, not observed product failures.

## Hosted verification

- Production URL: `https://comprehensive-fitness.vercel.app/?verify=9aa7bc6`.
- Production `sw.js` served `comprehensive-fitness-pwa-v52`; hosted `app-views.js` contained the generated-row summary boundary and hosted engine/package deployment was synchronized by the v52 release.
- The existing installed browser correctly deferred activation because an active workout is preserved. Verification did not submit, cancel, edit, or reload that draft.
- Isolated production browser profiles ran the affected template-to-workout lifecycle at mobile and desktop sizes: recommendation summary load and exact reps matched the generated editable row, expanded role details reused those targets, persistence succeeded, reload succeeded, and browser errors remained empty (2/2 passed).

## Documentation

- Updated `docs/DECISION_ENGINE.md`, `docs/ARCHITECTURE.md`, `docs/UI_UX.md`, and `docs/ROADMAP.md`.
- Reviewed `docs/PROJECT.md`; no scope statement changed because this is a correction within the existing evidence-backed workout-prescription capability.
