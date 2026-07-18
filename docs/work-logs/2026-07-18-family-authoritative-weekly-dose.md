# Family-authoritative weekly recommendation dose

## Outcome

**IMPLEMENTED:** exact programming-family totals now drive weekly prescription dose, Dashboard target status, and volume overload flags. Broad Chest/Back/Shoulders-style regions remain presentation containers and no longer act as the recommendation dose authority.

## Behavior

- Canonical submitted exercises require one common relationship-taxonomy version.
- A user-defined custom exercise contributes only through a saved Primary muscle and optional Secondary muscle under `personal-muscle-mapping/1.0.0`.
- Automatic name classification remains available for legacy display assistance but is not accepted as verified recommendation dose evidence.
- Taxonomy 2.1.0 and personal mapping 1.0.0 may coexist without a false mixed-taxonomy result.
- Any submitted unmapped custom exercise returns `blocked_unverifiable_provenance`, emits no family totals, passes no `currentWeeklySets` into progression, and renders a mapping-required explanation.
- An empty submitted-history window is a known zero-dose state.
- Family rows expose exact direct/fractional totals, targets, status, taxonomy/personal versions, and ledger version in expanded Dashboard detail.
- Family-level overload flags replace broad-bucket overload decisions; high-RPE and missed-set reporting remain broad presentation signals.

## Verification

- Unit/invariant coverage: taxonomy-only, personal-only, mixed-source, unmapped, empty, subdivision coalescing, fatigue separation, canonical-family tamper resistance, final-only rounding, immutable recalculation, and rollback.
- Static integration contracts assert that `currentWeeklySets` consumes `familyDose.weightedHypertrophySets` and rendered Dashboard source includes family rows and mapping-required copy.
- Mobile and desktop Playwright: synthetic canonical plus mapped-custom history renders Chest 5 and Triceps 2.5 exact family dose; adding one unmapped custom exercise removes all family rows and renders the mapping-required state. Focused result: 2/2 passed.
- The protected Dashboard contract follows the family-level Chest overload identity, and compact quiet cards permit long family-status copy to wrap without horizontal overflow.
- Complete public gate: 42/42 selected scripts passed (43 discovered; one intentionally private-only), with lint, workflow, privacy, full/production dependency, research, and 32-asset PWA checks clean. The clean committed release gate remains required before publication.

## Documentation

Updated Architecture, Decision Engine, UI/UX, Roadmap, training-prescription data map, exercise-muscle taxonomy, frozen independent checkpoint, and current score-neutral evidence ledger. Project scope remains unchanged, so `docs/PROJECT.md` was reviewed and required no text change.
