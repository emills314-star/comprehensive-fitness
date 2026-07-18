# Family-aware recommendation history

## Outcome

**IMPLEMENTED:** guided planning, prescription history, and app weekly analytics now share one versioned programming-family ledger. The recommendation/history path no longer counts anatomical subdivisions independently, no longer reports the overall research-database version as relationship provenance, and no longer rounds each canonical contribution before aggregation.

## Verified behavior

- `programming-family-ledger.js` owns canonical-to-family mapping, relationship normalization, within-exercise family coalescing, and historical projection for browser and Node consumers.
- `historical-family-volume/1.0.0` emits family totals only when every used relationship has one common taxonomy version. Missing or mixed provenance returns `blocked_unverifiable_taxonomy` with an empty family dose.
- Direct load wins over fractional load within one exercise/family. Local and isometric fatigue remain additive and separate from hypertrophy credit.
- Canonical muscle ownership cannot be redirected by an inconsistent caller-supplied family.
- Historical facts remain immutable. No persistent migration or snapshot backfill occurs; changing evidence and rolling back both recalculate from the original records.
- The prescription engine advances to 3.3.8 without changing prescription schema 2.3.0 or snapshot schema 1.3.0. Legacy canonical totals remain readable alongside the new family projection.
- Weekly app analytics use submitted active history, coalesce canonical relationships before broad reporting projection, and expose ledger version, taxonomy provenance, status, family totals, and rollback contract.
- Root/web/native packaging includes the shared module and service-worker cache v36.

## Verification

- `npm run check:public`: passed; 42/42 selected public scripts, 10,240/10,240 fuzz assertions, research validation, privacy/dependency/workflow gates, and 32-asset PWA parity.
- Focused family/provenance/rollback tests: passed, including the `0.335 × 3 = 1.01` final-only rounding counterexample and alternate-taxonomy rollback reproduction.
- Initial `npm run audit:ui`: 203 passed, 18 intentionally skipped, and one mobile helper raced the early empty engine before public evidence initialization. The helper now waits for the required canonical catalog row; the exact mobile/desktop regression passed 2/2 after correction.
- The exact clean committed `npm run release:verify` is the publication gate and must be reported from the committed revision.

## Documentation review

Updated `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/training-prescription-data.md`, `research_database/EXERCISE_MUSCLE_TAXONOMY.md`, `docs/ROADMAP.md`, and the current rubric evidence ledger. `docs/PROJECT.md` and `docs/UI_UX.md` were reviewed; no change was required because this cycle changes derived accounting/version contracts without changing product scope, navigation, or user-facing interaction copy.
