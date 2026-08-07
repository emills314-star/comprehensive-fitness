# Roadmap

## 2026-08-07 active-session correctness — IMPLEMENTED LOCALLY

- Fixed stale timer replacement with one absolute-deadline, versioned timer and idempotent completion path.
- Added per-set rest fallback/editing without rewriting submitted history.
- Added weekday assignment, deterministic Today selection, readiness ordering, and stable-identity history return.
- Added only targeted pinned-timer, completion, dock, overflow, and wrapping presentation changes.
- Source/`www` packaging advances to service-worker cache v105; external device, hosted, publication, and incomplete verification gates remain open.

## Metadata

- **Purpose:** Current implementation status, remaining gates, risks, and explicitly excluded work
- **Last verified:** 2026-08-04
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
