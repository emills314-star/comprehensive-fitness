# Roadmap

## Per-session coach - PARTIALLY IMPLEMENTED locally, 2026-11-03

- **Step 1 — done:** the 2026-08-15 Quiet Control refresh is committed locally as `6d89b6e` (owner-authorized, not pushed). Re-verified on Node 24.18.0: lint, workflows, privacy, public tests 53/53, research validation, PWA packaging. Playwright not rerun.
- **NEEDS REVIEW:** the full-tree dependency audit now fails on advisories published since August: critical in `@capacitor/android` and `@capacitor/ios` 7.0.0–7.6.8; high in `tar`, `brace-expansion`, `@xmldom/xmldom`. Production subset clean; fixes available. Separate change pending owner approval.
- **Step 2 — done:** [D-028](redesign/DECISION_LOG.md) and [`redesign/coach/COACH_V1_CONTRACT.md`](redesign/coach/COACH_V1_CONTRACT.md), reviewed by Astra (approve with changes, incorporated), including Erik's deload and injury-skip requests.
- **Step 3 — PARTIALLY IMPLEMENTED (wired in shadow):** pure `coach-engine.js`, `scripts/test-coach-engine.js` (67 tests), `scripts/coach-replay.js` and `scripts/test-coach-replay.js` (16 tests) with a synthetic fixture. Implemented by Codex (GPT-6.1 Sol) over five correction rounds driven by three Astra code reviews (12 defects, then 4, then 2), each fix re-probed by Claude. Astra's final review identified issues subsequently addressed locally; final acceptance remains pending.
- **Step 3b — calibration, NEEDS REVIEW:** a local replay over the pipeline's history through 2026-07-07 (aggregates only) evaluates 836 of 849 sessions with zero oscillations, zero bound violations, and a passing leakage check. Session-start targets average about 2.7 reps above what Erik actually did and are missed at the target load 37% of the time, versus 12% for repeating last time, mainly because sets without RPE are treated as ready for +1 rep. The 10% increase cap also blocks load jumps on light dumbbell work. Both are calibration decisions for the full history once a fresh Strong export arrives. Replay on Erik's real history is pending a fresh Strong export.
- **Step 4 - IMPLEMENTED locally:** S1a, S1b, S2, S3a, S3b, S4a and S4b are complete; polish, browser-test reconciliation and final fixes are in source. This integration has not been committed.
- **Owner-reported verification:** `npm test` passed 66/66, `sync:web` regenerated `www`, `verify:pwa` passed for 29 assets, and `check:privacy` passed. Full Playwright on Node 24.18.0 (not the pinned 22.x): 295 passed, 2 failed, 33 configured skips; the one failing test (both projects) dispatched only a pointerdown on the set check, which no longer completes a set by design (activation waits for the matching release so a drag can cancel), and passes after the test also dispatches the release. The 33 skips include the appearance baselines (`CF_APPEARANCE_PROTECTION=1`), which were not run or accepted and now differ on Today and the rest rail.
- **PENDING for Erik:** visual review and baseline acceptance, a device check on his iPhone, and explicit authorization before any commit. Merge, deployment and publication require their own authorization and gates.
- **PLANNED:** activation gate remains closed until calibration, 2-3 weeks of shadow evaluation, independent parameter review and owner opt-in. Erik delegated this call on 2026-11-04 and Claude kept it closed: replay currently misses its own targets at the target load 37% of the time versus 12% for repeating last time, so showing targets before calibration would mislead.
- **NEEDS REVIEW:** adoption of Strong/pre-coach history as proven coaching evidence; current rules do not silently assume it.
- **NEEDS REVIEW:** the mid-session suspension policy is stricter than contract sections 6.1 and 7; Erik and the coach workstream must decide before activation.
- **NEEDS REVIEW:** `app-history.js` grade denominator counts edited or manually classified incomplete rows as attempted; valid completed-work metrics exclude them.
- **NEEDS REVIEW:** count-only reason comparison metadata when compatible previous-plan evidence is unavailable; count changes with compatible metadata can already receive a reason.
- **NEEDS REVIEW:** the coach engine `freezeOrder` fix exists only in the coach workstream scratchpad and requires integration and verification.
- **PLANNED:** Last night follows the Google Health step; the "outside your normal" bounds flag follows calibration.
- **Step 5:** Google Health API feasibility spike (encrypted refresh token in existing Upstash, values passed through).
- **Step 6:** shadow mode, independent review of calibrated parameters, opt-in coaching, five-workout field test.
- Every coaching parameter is an ASSUMPTION until calibrated. No push, merge, deployment, or publication is authorized.

## 2026-08-15 Quiet Control progress refresh — IMPLEMENTED LOCALLY; COMMITTED 2026-10-31 AS `6d89b6e`

- Added the no-session workout chooser and honest rolling ten-completed-session score with equal distinct-lift weighting.
- Moved the sole Ready/rest countdown into the centered active-session header and removed the duplicate rendered rest bar.
- Added persistent completed-row treatment, disabled gray upcoming-set checks, all-required-sets exercise completion, and position-matched prior-session facts for every set row.
- Added stable-ID exercise detail with trend, exact-source e1RM record, mathematical next target, and active-session return preservation.
- Redesigned Progress into Sessions and Exercises modes with accessible stored-grade treatments, search, score/trend/latest/e1RM facts, and shared calculations.
- Kimi K3 completed one consolidated review of the approved screenshot matrix; justified spacing, hierarchy, grade, chart, menu, inactive-set, and Current Focus discrepancies were resolved in one production pass.
- Final focused screenshots pass 6/6 across mobile and desktop. The complete browser suite passes 297 tests with 33 intentional skips and zero failures across 330 discovered cases.
- Public validation passes 53/53 selected scripts (54 discovered; one private-only harness), and private validation passes 2/2 with the one preserved invalid-source warning remaining correctly excluded from calculations.
- Static lint, workflow policy, tracked-file privacy, research validation and determinism, PWA/native packaging parity, and both dependency gates pass. Production dependencies have zero known findings; the full development tree reports three accepted moderate-only findings and zero high/critical findings.
- Root/`www` are synchronized across 26 public-only assets and service-worker cache v106. The release wrapper's clean-source step remains intentionally inapplicable until the owner authorizes a commit; publication and hosted/device acceptance remain unauthorized or external.

## 2026-08-07 active-session correctness — IMPLEMENTED LOCALLY

- Fixed stale timer replacement with one absolute-deadline, versioned timer and idempotent completion path.
- Added per-set rest fallback/editing without rewriting submitted history.
- Added weekday assignment, deterministic Today selection, readiness ordering, and stable-identity history return.
- Added only targeted pinned-timer, completion, dock, overflow, and wrapping presentation changes.
- Source/`www` packaging advances to service-worker cache v105; external device, hosted, publication, and incomplete verification gates remain open.

## Metadata

- **Purpose:** Current implementation status, remaining gates, risks, and explicitly excluded work
- **Last verified:** 2026-08-15
- **Branch:** `codex/zero-based-redesign`
- **Status:** **SECOND PRODUCTION PACKAGING REMEDIATION VERIFIED AND INDEPENDENTLY APPROVED; NEEDS OWNER-AUTHORIZED IMMUTABLE COMMIT AND PUBLICATION**
- **Authority:** [`redesign/final/`](redesign/final/), [`redesign/implementation/IMPLEMENTATION_EXECPLAN.md`](redesign/implementation/IMPLEMENTATION_EXECPLAN.md)

## Completed local milestones

| Milestone | Outcome | Recoverable checkpoint |
| --- | --- | --- |
| M0 | Preservation contracts and synthetic migration baseline | `3e24f93` |
| M1 | Stable variant targets and unrestricted factual logging | `2101e19` |
| M2 | One canonical exception resolver; direct pain/illness only | `243ed81` |
| M3 | Planner/mesocycle removal | `3e102e2` |
| M4 | Analytical/research product removal | `576f582` |
| M5 | Two-destination shell and direct Start | `ef71085` |
| M6 | Simplified active logger, substitution, rest, and recovery | `441b6cb` |
| M7 | Versioned actual-work grade, concise completion, factual Progress | `0223b36` |

Checkpoint documentation commits are recorded in `docs/redesign/implementation/MILESTONE_LOG.md`.

## M8 current scope

M8 is deleting dead migration and concept structure, reconciling living documentation, synchronizing generated packaging, and executing the final local verification gates.

Current candidate work includes:

- removal of the concept-only React/Vite application, prototype tests, scripts, configuration, dependencies, and obsolete achievement assets;
- removal of expired routes, obsolete tests/schemas, dead feature-state writers, and current-intent documentation for deleted systems;
- fixed-light, two-destination Settings/navigation cleanup;
- permanent rejection of new cloud workout copies while notification delivery and bounded legacy remote deletion remain;
- prospective grade algorithm correction to `actual-work-rubric/1.1.0` without historical regrading;
- strict/atomic import, backup, draft, submission, and clear-local-data safeguards;
- final browser-test reconciliation for deleted fields and current behavior.

The 2026-08-02 corrective candidate fixes the audited readiness-copy and current-focus refresh defects, retains the existing readiness label, adds advancement/reload regression coverage, and advances the public cache to v103. This remains a mutable working-tree candidate, not a final acceptance claim.

Production verification of merge `b0de5cd` found that the broad Vercel export exclusion also removed the two public research compatibility JSON files, so normal identity-only boot could not initialize and the hosted critical workout lifecycle stopped before mutation. PR #9 (`95f4feb`) proved that Vercel source upload recognized narrow export exceptions, but the final static output still omitted both nested export paths. The second local remediation removes those exceptions entirely: canonical files remain under the excluded research export tree, while `sync:web` materializes byte-identical public copies at `resources/exercise_database.json` and `resources/exercise_muscle_map.json`. Runtime, offline shell, packaged `www/`, and deployment regressions now use that production-native boundary; cache v104 creates a distinct installed-client upgrade boundary. No protected-data migration is involved.

## Exact next actions

1. Obtain explicit owner authorization for an immutable candidate commit and its exact-commit rerun.
2. After separately authorized publication, push only the reviewed remediation, allow PR checks to pass, then redeploy and repeat hosted verification against the two `resources/` URLs.
3. Keep protected-data migration, physical-device, baseline, and field-testing gates blocked.

Do not begin new product work after M8. Do not merge, push, deploy, mutate production data, or publish.

## Current product decisions

- Exactly two persistent destinations: Today and Progress.
- Routines and Settings are contextual.
- The product has one fixed light presentation.
- Start is direct and readiness is optional.
- Optional readiness includes compact unusual-soreness capture before or during the workout and remains silent unless a separately approved rule exists.
- Stable named-variant targets and factual prior work own the normal logger.
- Direct explicit pain/injury or illness is the only live exception rule.
- Numeric fatigue, readiness, plateau, and deload detectors are not active.
- New submissions use actual-work grade contract v2 and prospective algorithm `actual-work-rubric/1.1.0`.
- Stored legacy grades and snapshots are immutable.
- Workout cloud-copy upload is decommissioned; Web Push notifications and bounded legacy remote deletion remain.
- Top-level retired global planner/evidence collections are discarded at the compatibility boundary; embedded owning-workout snapshots/actions/overrides are preserved.
- The approved rolling hypertrophy summary is read-only: newest ten completed sessions, honest available count, distinct exact lift/resistance variants, invalid scores excluded, equal weight per valid lift.
- Progress intentionally owns Sessions/Exercises modes and stable-ID exercise detail; these surfaces do not create workout targets or exception actions.

## Corrective-candidate local verification

- Focused readiness/current-focus Playwright: 3/3 passed.
- Public gate: 51/51 selected scripts passed; tracked privacy passed for 581 files; lint passed 192 JavaScript and 3,112 JSON files; workflows, research validation, packaging, and dependency gates passed.
- Full Playwright: mobile 146 passed/15 configured skips/0 failures. Desktop is **NEEDS REVIEW**: Codex recorded 143 passed/18 skipped, but Claude reproduced 142 passed/1 failed/18 skipped and then 141 passed/2 failed/18 skipped. All three distinct failures pass in isolation and are classified as pre-existing contention/race-sensitive test-design defects, not correction regressions.
- Protected local gate: 2/2 passed with one preserved-source warning.
- Root/`www` synchronization and PWA verification passed for all 26 public assets; cache v103.
- **NEEDS REVIEW:** these results used Node 24.18.0/npm 11.16.0, not the required pinned runtime, and were run before an immutable candidate commit existed.

## Production-packaging remediation verification

- PR #9 exact-commit local evidence remained green, but hosted verification failed because Vercel's final static output returned 404 for both re-included export paths; upload-time ignore exceptions were therefore insufficient.
- Second-remediation focused identity-only boot and package verification pass locally under Node 22.23.1/npm 10.9.8. The public compatibility files are byte-identical to their canonical sources, all export trees are excluded without exceptions, superseded packaged paths are pruned, and service-worker cache v104 contains the two `resources/` URLs.
- Complete public suite under Node 22.23.1/npm 10.9.8: lint 192 JavaScript/3,110 JSON, workflows, tracked privacy 583/583, full dependency policy with zero high/critical findings, production dependencies with zero findings, public contracts 51/51, research validation, and PWA verification 26/26 all passed.
- Pinned-runtime full Playwright: 289 passed, 33 configured skips, 0 failed. Both mobile and desktop passed the public-catalog/offline-shell boundary and the critical Today → workout → completion → Progress lifecycle; none of the previously observed contention-sensitive cases failed.
- A subsequent exact-tree rerun reproduced the pre-existing `private-data-lifecycle-regressions.spec.js:423` test-design race: successful boot cleanup added its two documented identity fields before an exact-equality assertion. The corrected regression now awaits runtime and IndexedDB cleanup completion, permits exactly those two fields while preserving every selected-identity assertion, and passes 6/6 focused mobile/desktop repetitions.
- Final exact-tree Playwright after that correction: 289 passed, 33 configured skips, 0 failed in 15.4 minutes. Both mobile and desktop passed the strengthened asset audit, corrected cleanup race, and critical lifecycle.
- Fresh independent review initially identified the too-narrow browser fetch predicates; after they were broadened, the reviewer approved the complete final remediation and the cleanup-race correction with no blocking defect.
- **NEEDS REVIEW:** hosted asset, PWA upgrade, and lifecycle verification remain blocked until this second remediation is independently approved, explicitly authorized for publication, committed, pushed, merged, and deployed.

## External and human gates

### 2026-08-07 expedited active-session release

- **IMPLEMENTED:** active-session timer replacement, per-set rest targets, weekday routine scheduling, readiness ordering/copy, exact-identity exercise-history navigation, compact pinned timer/dock behavior, compatibility schema changes, root/`www` synchronization, and service-worker cache v105.
- Pinned Node 22.23.0/npm 10.9.8 public release suite passed: lint, workflows, tracked privacy, dependency policy, 52/52 public scripts, research validation, and 26/26 PWA/native packaging assets.
- Focused mobile and desktop Playwright coverage passed for the critical workout lifecycle, timer persistence/overtime, and consecutive timer replacement regression.
- **ASSUMPTION (owner-authorized release waiver):** for this production deployment only, the owner explicitly waived fresh Claude independent review, the complete 324-case Playwright matrix, and the five-workout acceptance gate. The attempted full matrix exceeded its 15-minute command ceiling without a reported assertion failure and is recorded as waived, not passed.
- Physical-device push, vibration, sound, lock-screen timing, and installed-PWA suspension behavior remain unverified external gates and are not represented as passed.

These cannot be claimed from the current local environment:

- owner-authorized immutable candidate commit and exact-commit rerun;
- fresh Claude corrective acceptance naming that exact commit;
- physical iPhone keyboard, background/suspension, Web Push, sound, vibration, and installed-PWA behavior;
- current Vercel/Upstash/QStash operational state;
- representative existing-user/real-data migration replay and owner acceptance;
- five-workout field test;
- owner visual-baseline acceptance;
- hosted verification;
- merge, push, deployment, publication, or production-data mutation.

## Risks and watch items

- `www/` is generated packaging and can become stale until final synchronization.
- Historical backup support must not recreate deleted active product domains.
- Remote notification deletion must retain its bearer until bounded cleanup is terminal.
- Already-dispatched Web Push cannot be recalled; cancellation prevents later state resurrection but cannot promise perfect recall.
- An unverified detector or score must not re-enter through offline research assets, legacy imports, or documentation.
- Owner untracked `.claude/`, `.vercel/`, and `redesign/prompts/` directories remain outside redesign staging.
- The original Claude final acceptance audit was intentionally returned in conversation rather than written to the repository. Its absence from `docs/redesign/audits/` is not a missing-artifact defect; persistence there is an owner decision.

## Explicitly excluded

No new:

- recommendation category or numeric detector;
- score, dashboard, chart family, research/evidence surface, or analytics setting;
- mesocycle/program-design workflow;
- theme or color-package setting;
- workout cloud backup/sync feature;
- wearable/OAuth integration;
- account/profile system;
- celebration effect;
- framework rewrite or CSS extraction.

Any future scope requires an explicit product decision after this redesign is complete.
