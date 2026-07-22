# Progression feedback, custom guidance, and editable guidelines

## Change

- Summary: Implemented versioned standard guidelines, today-only set/rep editing, explicit future-template opt-in, stable custom-exercise profiles with bounded guidance, per-exercise execution quality, distinct submitted exposure history, and a transient next-exposure preview.
- User flow affected: Today/Now add exercise → complete custom setup when needed → inspect standard/today/saved values → edit unfinished guidelines or log extra reps/sets → assess execution → submit → inspect Base next exposure.

## Evidence

- Files changed: prescription engine and schemas; application foundation, workout, views, history, import, interaction, and styles; progression contract tests.
- Documentation updated: `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, `docs/ROADMAP.md`, `docs/training-prescription-data.md`, and this work log.
- Local validation: all 49 selected public test scripts passed, including schema, legacy, profile, backup, privacy, and the new progression/custom-guideline contract; lint, workflow, dependency, focused integration, and 32-asset PWA checks passed. The dedicated Today accessibility/responsiveness audit passed 2/2 across mobile and desktop.
- Branch and commit: `main`; pending publication.
- Deployment inspected: pending publication.
- Hosted URL/deployment identifier: pending publication.
- Browser viewport/device sizes: local clean-origin acceptance passed at 390 × 844 and 1280 × 900; hosted verification remains pending publication.
- Exact hosted flow tested: local clean-origin add custom exercise → exact missing metrics → complete setup → receive bounded guidance → edit today guideline → log above-ceiling reps → mark Controlled → submit → regenerate Base next exposure passed. Hosted repetition remains pending publication.
- Expected result: recommendation standards remain immutable; only unfinished rows are rebuilt; custom guidance is withheld until metadata is complete; execution quality controls progression confirmation.
- Actual result: implemented locally; mobile and desktop clean-origin acceptance passed; hosted result pending.
- Console/runtime errors: local acceptance exposed and resolved the missing standard binding and custom-preview delegation defects; the final local flows completed without the destination error. Hosted console verification remains pending.
- Screenshots or visual evidence: pending hosted verification.
- Remaining issues: hosted verification is required before final Complete status. **NEEDS REVIEW:** the repository-wide research validator reports manifest hash mismatches for six pre-existing CSV exports; this feature does not modify or regenerate those research artifacts. The 234-test full UI suite exceeded the ten-minute wrapper window, while the targeted Today mobile/desktop audit passed 2/2.

## Final status

**Implemented locally** — publication and hosted browser verification remain.
