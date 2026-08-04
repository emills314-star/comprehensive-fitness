# M1 V3 active-workout visual fidelity

## Change

- Summary: Restyled the active workout against `artifacts/design-concepts/m1-workout-variants--v3-progressive.png` without changing workout state, recommendation rules, persistence, submission, or timer behavior.
- User flow affected: active Today session at phone and responsive widths.
- Scope boundary: presentation and presentation-owned DOM placement only. Existing actions and facts were retained even when the raster mockup omits them.

## Implemented presentation

- The sticky active-session header is the visible page heading and exposes session name, active/logged state, and current exercise/set identity without duplicating dock-owned progress or elapsed time.
- The single rest timer renders in a top-level amber Rest / Next / countdown strip before the exercise document. Pause, resume, adjust, skip, cancel, notifications, and focus behavior are unchanged.
- Logged sets use compact target, completion-time actual, delta, and completion-control columns.
- The current set is the dominant solid-blue surface with Load, Reps, and RPE inputs. An unset numeric RPE displays a dash; its stored value and completion behavior are unchanged.
- Previous submitted performance remains a full-width linked strip after the three primary fields.
- Pending sets are quiet rows that name the exercise and target.
- The notification-setup control is visually ordered after the workout document while remaining present and keyboard reachable.

## Verification

- `node scripts/test-workout-page-density.js`: passed.
- `node scripts/test-set-prescriptions.js`: passed.
- `node scripts/test-rest-timer-presentation.js`: passed.
- `node scripts/test-rest-completion-controller.js`: passed.
- `tests/ui/mockup-fidelity.spec.js --project=mobile`: passed and generated local 390 × 844 candidate/full-page captures when `CF_MOCKUP_REVIEW_DIR` was set.
- `tests/ui/critical-workout-lifecycle.spec.js --project=mobile`: 2/2 passed, including timer pause/resume/adjust/skip, submission, persistence, reload, and unit conversion.
- `tests/ui/template-workout-history-lifecycles.spec.js --project=mobile`: 26/26 passed after reconciling the superseded Previous-column geometry assertion to the M1 full-width strip.
- Focused `tests/ui/protected-surfaces.spec.js` 320 px / 200%-text Lift and session-dock checks: 2/2 passed after long target chips were allowed to wrap.
- Focused `tests/ui/protected-surfaces.spec.js` ten-color-package × light/dark Lift/Dashboard contrast matrix: passed after small logged/pending labels and the Previous strip were returned to contrast-safe semantic token mixtures.
- `tests/ui/app-integration-accessibility.spec.js` plus the M1 fidelity spec on mobile: 18 passed, 2 intentional private-evidence skips.
- `npm test`: 53/53 selected public scripts passed; one private-only harness remained excluded by design.
- `npm run lint`: passed for 193 JavaScript files, 3,118 JSON files, and zero inline scripts.
- `npm run verify:pwa`: passed for 40 public assets after `npm run sync:web`; the completed M-series pass advances the cache to `comprehensive-fitness-pwa-v93`.

## Documentation

- Updated: `docs/UI_UX.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, and this work log.
- Reviewed without change: `docs/PROJECT.md` and `docs/DECISION_ENGINE.md`; this pass changes no product capability, recommendation rule, scoring input, or training decision.

## Needs review

- Exact raster equivalence would require removing or materially redesigning retained production capabilities absent from the mockup: set completion controls, Previous history, notification setup, per-set options, editable exercise controls, supporting disclosures, Add exercise / Workout details, and the owner-selected M7 session dock.
- The mockup's single cross-exercise Remaining table would require a new interaction/presentation ownership model rather than a style-only change. It was not implemented.
- The simulated device frame/status bar is mockup scaffolding and was not added to production.
- The new M1 visual candidate is not an accepted baseline. No commit, push, merge, deployment, publication, or baseline acceptance was authorized.
