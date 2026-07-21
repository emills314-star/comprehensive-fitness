# Active set UI and prescription consistency

**Date:** 2026-07-21
**Status:** IMPLEMENTED

## Outcome

The active Today logger now keeps set execution compact and makes every visible target agree with the authoritative recommendation snapshot.

- Rest renders as a compact blue progress rail. Pause/Resume, Cancel, −15, +15, and Skip appear only after the rail is tapped.
- Narrow set rows retain six explicit columns, allowing Previous to wrap while Status stays inside the set boundary.
- Comparable Previous values are native links to the exact submitted History session that supplied them.
- Resistance uses a two-row label/value summary with a blue disclosure arrow.
- A recommendation snapshot's `finalPrescription` is authoritative for set roles/count, load, repetitions, and RPE. Prior performance remains evidence and progression context instead of replacing those targets.
- Explicit top-set/back-off roles are retained during workout construction and described consistently in the recommendation summary.

## Verification

- `node scripts/test-rest-timer-presentation.js`
- `node scripts/test-workout-page-density.js`
- `node scripts/test-set-prescriptions.js`
- `node scripts/test-rest-warmup-targets.js`
- `node scripts/test-service-worker-cache.js`
- `npm run lint`
- `npm run verify:pwa`
- `npm test`
- Synthetic mobile browser flow: the rest rail stayed collapsed until tapped, timing controls expanded on activation, Previous opened its exact read-only submitted session, the narrow Status cell stayed within the set card, and recommendation/set targets matched.
- Synthetic desktop browser flow and hosted deployment verification are recorded after publication.

## Documentation review

- `docs/UI_UX.md` updated for the rest disclosure, Previous history link, narrow set-grid containment, and resistance summary.
- `docs/DECISION_ENGINE.md` updated to identify `finalPrescription` as the executable target authority and preserve explicit set structure.
- `docs/ARCHITECTURE.md` updated for render routing, compact rest disclosure, grid ownership, and workout-construction precedence.
- `docs/ROADMAP.md` updated with the completed remediation.
- `docs/PROJECT.md` reviewed; its product scope remains accurate and required no text change.
- `docs/design/rest-timer-mockup.html` updated to the implemented blue collapsed-rail interaction.

## Publication

- Branch: `main`
- Commit and hosted deployment evidence: pending publication.
