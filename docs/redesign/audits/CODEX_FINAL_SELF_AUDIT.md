# Codex final traceability self-audit

> **Product:** Comprehensive Fitness
> **Audit date:** 2026-08-02
> **Audit type:** Corrective Codex self-audit of the mutable post-acceptance candidate
> **Branch:** `codex/zero-based-redesign`
> **Implementation checkpoint:** **PENDING OWNER AUTHORIZATION** (audited HEAD `54a972c`; corrective working tree is not immutable)
> **Documentation/self-audit baseline:** `54a972c`, corrected in the current working tree
> **Status:** **READY AFTER MINOR CORRECTIONS (corrections applied 2026-08-02) — IMMUTABLE COMMIT AND PINNED-RUNTIME RERUN PENDING**
> **Publication status:** **NOT AUTHORIZED / NOT PUBLISHED**

## 1. Scope, method, and non-inference boundary

This report traces the frozen M8 candidate against:

- every section of [`FINAL_REDESIGN_PRD.md`](../final/FINAL_REDESIGN_PRD.md);
- all 137 A-H rows and all 10 X rows in [`FINAL_FEATURE_DISPOSITION.md`](../final/FINAL_FEATURE_DISPOSITION.md);
- every section of [`RECOMMENDATION_ENGINE_CONTRACT.md`](../final/RECOMMENDATION_ENGINE_CONTRACT.md);
- every milestone, data-migration row, acceptance suite, deletion gate, field-test gate, and release-state rule in [`MIGRATION_AND_ACCEPTANCE_PLAN.md`](../final/MIGRATION_AND_ACCEPTANCE_PLAN.md); and
- the unchanged categories and anchors in [`fixed-scoring-rubrics.md`](../../audits/2026-07-12-full-application-audit/fixed-scoring-rubrics.md).

The fixed rubrics are applied exactly. Their categories, weights, and anchors are not redefined to fit the redesign. In particular, the historical workout-recommendation rubric still awards complete program, mesocycle, exact progression, and dose-management capabilities that the final redesign intentionally deleted. This audit does **not** award those points merely because deletion is correct under the final product contract.

The fixed-light appearance decision is not reopened. Per the scoring instrument's supersession note, category 7 evaluates capability preservation, factual correctness, safety, accessibility, responsive behavior, and the approved replacement intent. Pixel-appearance scoring remains withheld until the owner accepts the replacement baseline.

Status meanings:

- **PASS** — current source, contract tests, and runtime evidence satisfy the stated requirement in the locally tested scope.
- **PARTIAL** — useful implementation evidence exists, but a required dimension remains absent or unverified.
- **FAIL** — current evidence contradicts a required outcome or a required gate is known not to pass.
- **NOT PROVEN** — no acceptable evidence exists, normally because the gate is external, physical, protected-data-dependent, human, or not yet run.

A PASS in this report is not publication authorization. No raw personal record, secret, credential, environment value, or private test artifact is reproduced here.

## 2. Executive verdict

The M8 source, generated web package, native public payload, public/private local tests, Chromium browser suites, documentation sentinels, lint, workflows, tracked-file privacy scan, and dependency gates have current passing evidence. The earlier root/`www` divergence and grade-version/documentation mismatch are resolved through D-025 and D-026. D-027 removes workout cloud-copy authorization, upload, UI, and queue writers while retaining notification revocation/deletion and bounded cleanup.

Claude independently reviewed the corrective uncommitted worktree at HEAD `54a972c` and returned **READY AFTER MINOR CORRECTIONS**. The implementation corrections are verified, but the candidate is not immutable, the decisive pinned-runtime rerun has not occurred, and the desktop full-project gate is contention/race-sensitive. It is not approved for publication, and plan-wide acceptance remains incomplete, because all of the following remain open:

- the repository pins Node `22.23.x` and npm `10.9.x`, while the frozen evidence used Node `24.18.0` and npm `11.16.0`;
- physical-device decimal RPE, software keyboard, screen reader, notification, lock-screen, haptic/sound, background/suspension, and installed-PWA behavior are not proven;
- the complete protected-data migration/replay and independent migration verifier are not complete;
- fresh same-device final performance measurements are not complete;
- owner visual-baseline acceptance and Erik's five-workout field test are not complete;
- current-candidate hosted/deployment verification is not complete;
- CocoaPods and `xcodebuild` were unavailable on Windows;
- production notification/provider cleanup state is external and unverified; and
- the current independent final reviewer and immutable release freeze are pending.

No terminal safety-critical, privacy-critical, data-loss, fabricated-personalization, unsupported-settled-science, or hard logging-constraint defect was reproduced by the listed local gates. That is a self-audit finding, not independent clearance.

## 3. Frozen-candidate evidence catalog

The traceability tables use the evidence identifiers below. Each identifier names implementation, automated evidence, and runtime/visual evidence where applicable.

| ID | Implementation location | Automated evidence | Runtime / visual evidence |
| --- | --- | --- | --- |
| E-01 Authority/docs | `docs/redesign/final/*`, `docs/redesign/DECISION_LOG.md` D-025-D-027, `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, `docs/ROADMAP.md`, `docs/redesign/STATUS.md` | Two configured documentation sentinels passed 2/2 through `tests/ui/ui-audit.spec.js` | Documentation strings were exercised in both configured Chromium projects; this is not owner acceptance. |
| E-02 Shell/Start/readiness | `app-foundation.js:45-57,697-721,724-728,2964-2979`; `app-views.js:487-692`; `app-analysis.js:2-175`; `app-workout.js:285-300,1431-1513`; `app.js:547-556,963+` | `scripts/test-redesign-m5-two-destination-shell.js`; `scripts/test-final-contract-state.js`; `tests/ui/redesign-m5-navigation-and-drafts.spec.js` | Mobile and desktop suites cover two destinations, direct Start, contextual Routines/Settings, Back, one-draft conflict, Resume/Finish/Discard, and confirmed discard. A post-audit focused mobile case passed 1/1 for compact soreness capture before Start and during the active workout. |
| E-03 Stable targets/logger | `app-foundation.js:1144-1227,2175-2210,2860-2895`; `app-views.js:312-384,1067-1260`; `app-workout.js:600-765,1080-1170,1280-1513`; `app.js:2-75,620-710` | `scripts/test-redesign-m1-stable-targets.js`; `scripts/test-redesign-m2-workout-writers.js`; `scripts/test-redesign-m6-active-workout.js`; `tests/ui/redesign-m1-stable-targets.spec.js`; `tests/ui/redesign-m6-active-workout.spec.js` | Chromium covers same-role factual prefills, stable targets, add/remove/skip/reorder/substitute/custom work, one-edit `7` to `7.5`, validation, notes, and draft reload. Physical keyboard behavior remains open. |
| E-04 Timer/notifications | `app-sync.js`; `rest-completion-controller.js`; timer state in `app-foundation.js`/`app-workout.js`; notification controls in `app-analysis.js`; `sw.js`; `api/push/*` | `scripts/test-rest-completion-controller.js`; `scripts/test-service-worker-update-contract.js`; `scripts/test-redesign-m6-active-workout.js`; timer/browser cases in `tests/ui/redesign-m6-active-workout.spec.js` | In-app timer, overtime, reload, skip/finish, unavailable-permission fallback, and route recovery pass in Chromium. Physical background/lock-screen/sound/haptic delivery is not proven. |
| E-05 Resolver/safety | `exception-resolver.js`; `schemas/redesign-resolved-action.v1.schema.json`; `app-foundation.js:809-904`; `app-workout.js:270-345`; canonical rendering in `app-views.js:420-486` | `scripts/test-redesign-m2-exception-resolver.js` (12 named cases); `scripts/test-final-contract-state.js`; `scripts/test-redesign-m2-workout-writers.js`; `tests/ui/redesign-m2-exception-resolver.spec.js` | Ordinary silence and one direct pain/illness action pass in Chromium; continuing remains loggable and handling is recorded. No numeric fatigue/readiness/plateau/deload detector is live. |
| E-06 Grade/completion | `app-history.js:2-381,430-565`; `schemas/redesign-workout-grade.v2.schema.json`; grade consumers in `app-analysis.js`/`app-views.js`; D-024/D-025 | `scripts/test-workout-grade.js`; `scripts/test-redesign-m7-grade-progress.js`; `tests/ui/redesign-m7-grade-progress.spec.js`; `tests/ui/critical-workout-lifecycle.spec.js` | Current submissions use `actual-work-rubric/1.1.0`; stored `1.0.0`, legacy, plus/minus, and missing grades remain unchanged across boot/detail/reload. Completion is concise. |
| E-07 Progress/history | `app-analysis.js:176-715`; `app-history.js:100-290`; `app-views.js:289-311`; contextual navigation in `app.js` | `scripts/test-redesign-m4-analytics-removal.js`; `scripts/test-redesign-m7-grade-progress.js`; `tests/ui/redesign-m4-factual-progress.spec.js`; `tests/ui/redesign-m7-grade-progress.spec.js`; `tests/ui/progress-browser-history.spec.js` | Chronological all-history, exact variant/resistance/role trends, tappable source points, date windows, notes, and contextual completion-to-Progress pass. |
| E-08 Routines/Settings | `app-analysis.js:2-175,716+`; routine writers in `app-workout.js:1170-1430`; settings events in `app.js` | `scripts/test-redesign-m7-grade-progress.js`; `scripts/test-settings-minimization.js`; `tests/ui/redesign-m5-navigation-and-drafts.spec.js`; `tests/ui/analytics-settings-lifecycles.spec.js` | Contextual Routines/Settings, duplicate/edit/reorder, timer controls, import/export, privacy/support, and clear-data flows pass in Chromium. |
| E-09 Data/migration | `app-foundation.js:303+,1180-1410,1840-2050`; `app-import.js`; `backup-contract.js`; `schemas/redesign-app-data.v3.schema.json`; `schemas/redesign-backup.v3.schema.json`; `schemas/redesign-active-draft.v2.schema.json`; D-026 | `scripts/test-redesign-m0-preservation.js`; `scripts/test-backup-contract.js`; `scripts/test-domain-integrity.js`; `scripts/test-clear-local-data.js`; `tests/ui/runtime-trust-boundaries.spec.js`; `tests/ui/app-integration-accessibility.spec.js` | Synthetic v1-v3 backup/import/round-trip, idempotency, hostile validation, dual-store conflict, independent draft/timer recovery, complete export, and local clear pass. Real protected-data replay remains open. |
| E-10 Deletion/M8 | Root runtime, package graph, schemas, service worker, API, removed `redesign/`, removed planner/analytics/achievement/test assets | `scripts/test-redesign-m3-planner-removal.js`; `scripts/test-redesign-m4-analytics-removal.js`; `scripts/test-redesign-m4-identity-only-boot.js`; `scripts/test-redesign-m8-deletion.js`; `scripts/test-final-contract-state.js` | No current route, renderer, active default/writer, package/cache reference, or current-intent product path was reproduced for deleted systems. Bounded legacy decoding remains. |
| E-11 Package/native | `scripts/sync-web.ps1`; `scripts/verify-pwa.ps1`; `www/`; Android/iOS public roots; `sw.js` cache v103 | `npm run sync:web`; `npm run verify:pwa`; native privacy/cache/service-worker tests | Root/`www` synchronization and PWA verification passed 26/26 assets; private directories and obsolete assets are absent. Corrective Capacitor sync was not rerun. |
| E-12 Browser/a11y | `playwright.config.js`; `tests/ui/*.spec.js`; fixed-light tokens in `index.html` | Corrective mobile reproduced: 146 passed, 15 configured skipped, 0 failed. Desktop **NEEDS REVIEW**: Claude reproduced 142 passed/1 failed/18 skipped, then 141 passed/2 failed/18 skipped; all three distinct cases pass in isolation. | Chromium covers the prior matrix plus explicit readiness/soreness labels and Current focus advancement after sets 1 and 2 with reload restoration. Desktop full-project execution is contention/race-sensitive; no physical screen reader/device claim. |
| E-13 Quality/test gate | `scripts/run-public-tests.js`; `scripts/run-private-tests.js`; `scripts/lint-static.js`; `scripts/validate-workflows.js`; `.github/workflows/*` | Public 51/51; private 2/2; lint 192 JS/3112 JSON; workflow validation passed | The full public assertions pass, but Node 24.18.0/npm 11.16.0 do not match repository pins. |
| E-14 Privacy/security/dependencies | `.gitignore`; `.vercelignore`; `scripts/check-public-privacy.js`; import validators; CSP/cache/API controls; Android privacy XML | Tracked privacy 581/581; production dependency audit zero vulnerabilities; full tree three moderate development-only findings and no high/critical; security/platform/public tests passed | No private payload appears in the tracked public boundary. Owner-controlled untracked private roots remain present and untouched. |
| E-15 Science | `research_database/METHODOLOGY.md`; `research_database/EXECUTIVE_SUMMARY.md`; `research_database/exports/json/{progression_rules,research_library,evidence_conclusions}.json` | `scripts/test-science-evidence-contracts.js` 21/21; research validation and archive/workbook gates in the public suite | Numeric plateau/deload/readiness heuristics remain explicitly low/very-low product policy and are not live. Direct pain handling remains non-diagnostic product safety policy. |
| E-16 Cloud-copy boundary | `app-analysis.js:733+`; `app-import.js:502-503`; `api/sync/{authorize,consent,workout}.js`; notification cleanup in `api/_lib/installation-data.js`; D-027 | `scripts/test-sync-consent.js`; security/platform and clear-data suites; browser Settings/data lifecycles | Workout upload/authorization endpoints return 410 and no UI/queue writer remains. Notification revocation/deletion remains; external service cleanup state is unverified. |
| E-17 Performance | `scripts/test-performance.js`; `docs/performance.md` | Architectural “removed work stays off Today/Start” assertions pass | No fresh same-fixture, same-device final Today/Start/set/chart/bundle measurement exists. |
| E-18 External/human | Final PRD §13 and migration plan §§7.4-10 | No repository command can satisfy these gates | Physical device, protected-data migration, independent final review, owner baseline, five workouts, hosted/deployment, and publication remain open. |

## 4. Fixed-rubric self-scores

These are Codex self-scores, not the required score-neutral independent final review. No target score was supplied or inferred.

### 4.1 Codebase rubric — 38/50

| # | Fixed category | Score | Awarded evidence | Withheld points |
| ---: | --- | ---: | --- | --- |
| 1 | Architecture and modularity | 4 | Responsibility-separated runtime files, bounded resolver/backup/timer/API modules, deleted dead systems, and 26-asset source/package parity support strong ownership and dependency direction (E-05, E-10, E-11). | 5 withheld because ordered classic scripts still share lexical/global state and no current independent final architecture review has cleared the frozen worktree. |
| 2 | Code quality and consistency | 4 | Versioned contracts, allowlisted validation, canonical identities, consistent error boundaries, 192-JS/3112-JSON lint, and no TypeScript/toolchain residue are strong (E-03, E-05, E-09, E-13). | 5 withheld because JavaScript cross-file contracts remain implicit and compatibility code is still structurally complex. |
| 3 | Database design and data integrity | 4 | Versioned app/backup/draft/action/grade schemas, strict import, idempotent synthetic migration, immutable history, dual-store recovery, and D-026 preservation boundaries pass (E-09). | 5 withheld because real protected-data migration/replay and the independent migration verifier are incomplete. |
| 4 | Functional correctness and error handling | 4 | Public 51/51, private 2/2, 285 executed browser cases, atomic validation, resolver failure behavior, draft recovery, clear-data failure boundaries, and 410 cloud-copy behavior are dependable (E-02-E-09, E-13, E-16). | 5 withheld because physical notification/device/background paths and hosted provider behavior are unknown. |
| 5 | Testing and reliability | 4 | Broad unit, contract, migration, browser, accessibility, privacy, workflow, package, private-local, and documentation coverage passes (E-09-E-14). | 5 withheld because the evidence used unpinned Node/npm, 33 browser cases were configured skipped, and the exact candidate lacks an independent clean immutable rerun. |
| 6 | Performance and efficiency | 3 | Removed analytics/planner/research work is contract-tested off Today/Start, and the app remains functional (E-10, E-17). | 4 and 5 withheld because the final same-device startup, Start-to-logger, set latency, chart/detail, and bundle/cache measurements required by the migration plan do not exist. |
| 7 | Usability and visual consistency | 4 | The fixed-light two-destination product, contextual secondary routes, full-screen logger, concise completion, factual Progress, and responsive current-screen coverage are coherent (E-02, E-03, E-06-E-08, E-12). | 5 withheld because owner replacement-baseline acceptance and physical-device visual review are pending. The fixed-light decision itself is not reopened. |
| 8 | Accessibility and responsive behavior | 4 | Axe, keyboard, focus, dialogs, labels, touch targets, 320px/200% text, forced colors, reduced motion, chart semantics, and mobile/desktop responsive suites pass (E-12). | 5 withheld because physical screen-reader, native dynamic text, software keyboard, safe-area, and real-device coverage are absent. |
| 9 | Documentation and developer experience | 4 | Final authority, living docs, D-025-D-027, implementation records, package/test commands, and this exhaustive audit agree with current behavior (E-01). | 5 withheld because pinned-runtime reproduction, macOS native toolchain steps, immutable candidate instructions, and independent final verification remain incomplete. |
| 10 | Security, observability, and release readiness | 3 | Tracked privacy 581/581, public-only packaging, zero production vulnerabilities, bounded imports/cache/API, D-027 cloud-copy removal, workflows, and deletion controls are meaningful (E-11, E-14, E-16). | 4 and 5 withheld because current hosted/provider state, physical push behavior, immutable release freeze, deployment, rollback, and publication verification are open; three moderate dev-only findings remain. |
|  | **Total** | **38/50** | Strong local implementation evidence. | Fixed acceptance fails: total is below 45 and categories 6 and 10 are below 4. |

### 4.2 Workout-recommendation rubric — 27/50

The low score is not a claim that the final quiet-spotter product is incorrectly implemented. It is the unavoidable result of applying the unchanged historical rubric, which still awards capabilities the final authority deliberately removes. Absence of a mesocycle generator, normal exact progression, and program-dose engine cannot earn points under categories that explicitly require them.

| # | Fixed category | Score | Awarded evidence | Withheld points |
| ---: | --- | ---: | --- | --- |
| 1 | Scientific evidence quality and fidelity | 5 | Every live material rule is either traceable or explicitly product policy; numeric fatigue/readiness/plateau/deload heuristics remain low/very-low and inactive; direct pain copy is non-diagnostic and uncertainty/population limits remain explicit (E-05, E-15). | No point withheld under this category; this does not approve a medical claim or future numeric threshold. |
| 2 | Goal alignment and program coherence | 1 | Stable user-owned routine/workout targets avoid fabricating a generated program (E-03, E-08). | Points 2-5 withheld because the fixed anchor requires complete goal/schedule/dose/mesocycle coherence, while program and mesocycle generation are intentionally absent. |
| 3 | Correct use of personal and historical data | 3 | Direct pain/illness, stable target facts, comparable prior work, and immutable snapshots are used conservatively; missing evidence produces silence rather than fabricated personalization (E-03, E-05, E-09). | 4 and 5 withheld because available readiness/objective/soreness/rest history has no approved broad detector influence and real protected-data replay is incomplete. |
| 4 | Individualization and constraint satisfaction | 3 | Exact variant identity, substitutions, workout-only overrides, routine-save separation, and user control are deterministic; equipment never blocks actual logging (E-03). | 4 and 5 withheld because time, schedule, goal, experience, equipment, and program-scope constraints no longer drive a recommendation/program output as required by the fixed anchor. |
| 5 | Progression and autoregulation | 1 | Factual progress markers are conservative and normal exact prescriptions are absent (E-06, E-07). | Points 2-5 withheld because the fixed anchor requires conservative exact actions for comparable performance, plateaus, regression, missed sessions, and return-to-training; those normal progression/autoregulation capabilities were deliberately deleted. |
| 6 | Volume, intensity, frequency, and exercise-dose management | 1 | Stable user-authored set/range/RPE/rest facts remain (E-03, E-08). | Points 2-5 withheld because program-wide dose, frequency, fractional-volume, and validated practical-limit management are absent by final disposition. |
| 7 | Fatigue, recovery, and safety handling | 3 | Direct pain/illness has deterministic precedence, one plain action, failure-safe logging, and explicit handling; weak numeric evidence stays silent (E-05). | 4 and 5 withheld because readiness/fatigue/deload/technique rules are not live and the fixed anchor's non-bypassable hard-safety model differs from the final advisory-but-recordable contract. |
| 8 | Exercise selection, substitution, and taxonomy integration | 3 | Exact performance identity, resistance type, aliases, named/custom variants, role-aware history, and multi-hop substitutions are consistent in retained flows (E-03, E-07, E-09). | 4 and 5 withheld because anatomy, primary/fractional/fatigue roles, equipment-driven selection, and program-wide taxonomy selection are no longer active recommendation inputs. |
| 9 | Explainability, transparency, and user control | 3 | One action/scope/reason, factual source history, stable targets, explicit handling, and workout-only versus routine-save control are clear (E-03, E-05, E-07). | 4 and 5 withheld because the fixed anchor requires visible material inputs, evidence/default distinctions, constraints, missing data, and consequences that the deliberately minimal presentation does not expose. |
| 10 | Robustness, testing, monitoring, and maintainability | 4 | Candidate normalization, silence, qualification, precedence, scope, strictness, expiry, failure, privacy-safe replay, deterministic IDs/digests, writer isolation, and browser presentation are broadly tested (E-05, E-13). | 5 withheld because no final independent review, physical/field evaluation, production outcome monitoring, or complete future numeric-rule evaluation exists. |
|  | **Total** | **27/50** | The narrow live safety resolver is well evidenced. | Fixed acceptance fails: total is not 48-50 and categories 2, 5, and 6 are below 4. No score inflation is applied for intentionally deleted capabilities. |

## 5. Final redesign PRD traceability

| PRD requirement | Status | Implementation and test evidence | Runtime / remaining gap |
| --- | --- | --- | --- |
| §1 Authority and scope | PASS | E-01; final documents govern intent and D-025-D-027 record successor implementation decisions. | No implementation/publication authority is inferred from the documents. |
| §2 Product decision | PASS | E-02-E-08 implement a workout logger with quiet direct-safety spotter rather than a planning dashboard. | Subjective trust/speed remains part of the five-workout gate. |
| §3.1 Start | PASS | E-02. | Direct Start and one-draft behavior pass mobile/desktop Chromium. |
| §3.2 Execute | PARTIAL | E-03 and E-04. | Complete local/browser evidence; physical RPE keyboard and timer/notification behavior remain open. |
| §3.3 Interpret exceptions | PASS | E-05. | Only the approved direct safety producer is live; no numeric detector capability is claimed. |
| §3.4 Finish | PASS | E-06. | Concise current completion passes; subjective “rewarding” acceptance remains human. |
| §3.5 Review progress | PASS | E-07. | Factual history/trends pass in both configured projects. |
| §3.6 Trust the record | PARTIAL | E-09 proves synthetic preservation and recovery. | Real protected-data replay, independent verifier, objective provenance, and actual rest observations remain incomplete. |
| §4 Product topology | PASS | E-02 and E-10. | Today/Progress are the only persistent destinations; package parity passes. |
| §5 Today | PASS | E-02, E-05, E-10. | Expected workout, compact alternatives, optional readiness, Resume, and at most one session action are present. Removed analysis does not run. |
| §5.1 Start behavior | PASS | E-02. | Direct Start and exact active-conflict actions pass. |
| §5.2 Readiness behavior | PARTIAL | E-02, E-05, E-09. | Optional deviation/soreness/pain/illness/note is non-blocking; objective-metric provenance/consumption remains incomplete. |
| §6.1 Stable variant targets | PASS | E-03. | Separate named/custom identities and stable sets/range/RPE/rest pass. |
| §6.2 Set row | PARTIAL | E-03. | Chromium one-edit decimal RPE passes; target-device reproduction is explicitly still required. |
| §6.3 Prior performance | PASS | E-03 and E-07. | Exact identity/resistance/role facts and missing-source handling pass. |
| §6.4 Actual-workout control | PASS | E-03. | Add/remove/skip/reorder/substitute/custom/notes/workout-only/routine-save and no equipment block pass. |
| §6.5 Set roles/imported provenance | PARTIAL | E-03 and E-09. | Role inference/correction and original import values pass; complete readiness/rest provenance is not proven. |
| §6.6 Rest timer | PARTIAL | E-04. | In-app and Chromium behavior passes; physical notification/background/sound/haptic acceptance does not. |
| §6.7 Recovery/interruption | PARTIAL | E-03, E-04, E-09. | Reload/draft recovery passes; true device crash/OS suspension is not proven. |
| §7 Quiet-spotter behavior | PASS | E-05 and E-15. | Ordinary silence, one direct safety action, stable targets, override recording, and failure-safe logging pass. Numeric rules remain unapproved/inactive. |
| §8 Completion and grade | PASS | E-06 and D-025. | `actual-work-rubric/1.1.0`, concise reasons/highlights, historical immutability, and deleted-score absence pass. |
| §9 Progress | PASS | E-07 and E-10. | All required facts/routes pass; prohibited dashboard/score/mesocycle/research modes are absent. |
| §10.1 Routines | PASS | E-08. | Each template is a basic repeatable workout/day with ordered variants, independent duplication, and stable-target editing; no planner survives. |
| §10.2 Settings | PASS | E-08 and E-16. | Required utilities are present and deleted features/cloud history are not relocated there. |
| §11 Data and integrity contract | PARTIAL | E-09, D-025, and D-026. | Local synthetic preservation and removed-domain discard pass; real protected-data replay, independent migration review, complete objective provenance, and actual-rest retention are open. |
| §12 Permanent exclusions | PASS | E-10 and E-11. | Source, route, writer, schema/package/cache, dependency, test, and current-doc deletion checks pass locally. |
| §13 gate 1 — direct expected Start | PASS | E-02. | Browser-verified. |
| §13 gate 2 — immediately usable logger | PARTIAL | E-03 and E-04. | Browser-verified; physical RPE/timer gate open. |
| §13 gate 3 — actual work never blocked | PASS | E-03 and E-05. | Equipment and advice do not block logging. |
| §13 gate 4 — quiet/singular/evaluated exception | PASS | E-05 and E-15. | Approved direct-safety scope passes; inactive numeric rules receive no capability claim. |
| §13 gate 5 — trustworthy grade/facts | PASS | E-06. | Functional local/browser evidence passes; field judgment remains external. |
| §13 gate 6 — factual Progress | PASS | E-07. | Browser-verified. |
| §13 gate 7 — all history/draft survive migration | PARTIAL | E-09. | Synthetic fixtures pass; real protected-data migration and independent verifier do not. |
| §13 gate 8 — deleted systems absent everywhere | PASS | E-10 and E-11. | Root/`www`/native/package/cache checks pass. |
| §13 gate 9 — target-device RPE/timer/notification | NOT PROVEN | E-18. | No physical-device evidence. |
| §13 gate 10 — five-workout field test | NOT PROVEN | E-18. | Not performed. |
| §13 publication prerequisites | FAIL | E-12-E-18. | Automated/privacy/local browser pass, but physical device, independent final review, field test, owner acceptance, and explicit publication authorization do not. |
| §14 Explicit non-inference | PASS | E-01, E-05, E-10. | No new integration/category/screen/score/normal prescription/CSS rewrite or publication authority was inferred. |

## 6. Final feature-disposition traceability

Every A-H and X identifier appears below. “PASS (conditional)” means the final ENGINE ONLY/NOT AUTHORIZED ruling is satisfied by keeping the capability inactive; it does not claim that the original feature remains available.

### A. Starting and navigation

| ID | Final disposition | Status | Implementation / test / runtime evidence |
| --- | --- | --- | --- |
| A-01 Today landing | SIMPLIFY | PASS | E-02: expected workout, compact preview, Start, alternates, readiness, and Resume/action exception pass in mobile/desktop. |
| A-02 Multi-day list | SIMPLIFY | PASS | E-02: `renderQuickStartTemplates` supplies a secondary compact alternate-workout list without a planning dashboard. |
| A-03 Start confirmation | DELETE | PASS | E-02/E-10: no confirmation step remains; Start directly opens the logger. |
| A-04 Mandatory readiness modal | DELETE | PASS | E-02/E-10: readiness is optional and non-blocking before or during the workout. |
| A-05 Persistent Routines tab | DELETE | PASS | E-02/E-08: Routines is contextual; only Today/Progress persist. |
| A-06 Permanent Dashboard | DELETE | PASS | E-02/E-10: Dashboard route/state/renderers are absent. |
| A-07 Settings | KEEP | PASS | E-08: contextual utility route contains only approved data/timer/privacy/support tasks. |
| A-08 Full-screen active workout | KEEP | PASS | E-03: active logger owns the main surface; persistent nav is absent while active. |
| A-09 Resume workout | KEEP | PASS | E-02/E-09: one saved active draft resumes with entered values and timer context. |
| A-10 Prevent second workout | SIMPLIFY | PASS | E-02: exact Resume/Finish/Discard flow prevents overlap and preserves the first draft. |
| A-11 Cancel/discard | KEEP | PASS | E-02/E-09: destructive confirmation precedes draft deletion. |

### B. Readiness and exceptions

| ID | Final disposition | Status | Implementation / test / runtime evidence |
| --- | --- | --- | --- |
| B-01 Usual-readiness baseline | KEEP | PASS | E-02/E-05: usual is silent/default and needs no daily acknowledgement. |
| B-02 Manual readiness | SIMPLIFY | PASS | E-02: compact deviation/pain/illness/note entry is optional before or during work. |
| B-03 Sleep/HRV/resting-HR | ENGINE ONLY | PARTIAL | E-09 validates and preserves supplied values, but explicit observation provenance and an approved live consumer are not proven; no integration is inferred. |
| B-04 Soreness input | SIMPLIFY | PASS | E-02: one compact segmented soreness control is available before or during work, persists the existing bounded soreness fact, and creates no action by itself. |
| B-05 Illness/injury toggle | KEEP | PASS | E-02/E-05: direct illness and pain/injury inputs feed the highest-priority canonical safety action. |
| B-06 General readiness score | DELETE | PASS | E-10: no user-facing composite readiness score remains. |
| B-07 Intervention taxonomy | ENGINE ONLY | PASS | E-05: bounded internal category/action vocabulary exists only inside the resolver contract. |
| B-08 Muscle-group fatigue | ENGINE ONLY | PASS (conditional) | E-05/E-15: no calibrated rule earned activation; absence is required rather than a live capability claim. |
| B-09 Exercise fatigue | ENGINE ONLY | PASS (conditional) | E-05/E-15: schema/arbitration can scope one exercise action, but no unapproved detector is live. |
| B-10 Plateau detection | ENGINE ONLY | PASS (conditional) | E-05/E-15: low-evidence policy heuristic remains inactive and ordinary Progress stays factual. |
| B-11 Deload detection | ENGINE ONLY | PASS (conditional) | E-05/E-15: no numeric deload threshold is approved/live. |
| B-12 Pain/illness warning | KEEP | PASS | E-05: one plain non-diagnostic warning, recorded handling, and continued logging pass. |
| B-13 Severity/confidence matrices | ENGINE ONLY | PASS | E-05/E-10: qualification is internal; visible matrices/meters are absent. |
| B-14 Multiple recommendation cards | DELETE | PASS | E-05/E-10: resolver enforces one session plus at most one materially stricter exercise action. |
| B-15 Evidence citations | DELETE | PASS | E-05/E-10: no research citation appears in normal product UI. |
| B-16 Long explanation | SIMPLIFY | PASS | E-05: presentation is one action, scope, and short reason with bounded detail. |
| B-17 Confidence/severity badges | DELETE | PASS | E-05/E-10: badges/meters/pseudo-precision are absent. |
| B-18 Research database in app | DELETE | PASS | E-10/E-11: research counts/status/versions/weights/citations are absent from runtime and package. |

### C. Targets and progression

| ID | Final disposition | Status | Implementation / test / runtime evidence |
| --- | --- | --- | --- |
| C-01 Template rep range | KEEP | PASS | E-03: named variant owns stable `targetRepMin`/`targetRepMax`. |
| C-02 Template target RPE | KEEP | PASS | E-03: named variant owns stable half-step target RPE. |
| C-03 Automatic range rewriting | DELETE | PASS | E-03/E-10: only explicit routine/variant edits change normal range. |
| C-04 Normal recommendation paragraphs | DELETE | PASS | E-05/E-10: ordinary sessions show stable targets/prior facts and no coaching paragraph. |
| C-05 Progress-ready detection | SIMPLIFY | PASS | E-06/E-07: factual comparable-improvement/PR markers exist without an exact next prescription. |
| C-06 Exact add-rep advice | DELETE | PASS | E-03/E-05/E-10: no exact normal rep advice or prefill source remains. |
| C-07 Exact add-load advice | DELETE | PASS | E-03/E-05/E-10: no exact normal load advice or prefill source remains. |
| C-08 Add-set advice | DELETE | PASS | E-03/E-10: added work is an explicit user/routine action, not advice. |
| C-09 Hold advice | DELETE | PASS | E-05/E-10: ordinary silence replaces “hold.” |
| C-10 Lower-RPE advice | ENGINE ONLY | PASS (conditional) | E-05/E-15: action family is bounded but no unapproved live detector produces it. |
| C-11 Adjustment object | ENGINE ONLY | PASS | E-05: one versioned resolved-action object exists and never becomes a normal prefill. |
| C-12 Return criteria | ENGINE ONLY | PASS | E-05: effective/expiry/return boundaries are structural and shown only with an action. |

### D. Active workout

| ID | Final disposition | Status | Implementation / test / runtime evidence |
| --- | --- | --- | --- |
| D-01 Weight entry | KEEP | PASS | E-03: bounded numeric writer and factual same-role prefill pass. |
| D-02 Rep entry | KEEP | PASS | E-03: integer validation and factual prefill pass. |
| D-03 RPE entry | KEEP | PARTIAL | E-03: half-step validation and one-edit `7` to `7.5` pass in Chromium; physical target-device keyboard remains unproven. |
| D-04 Previous-set performance | KEEP | PASS | E-03/E-07: exact variant/resistance/comparable-role matching passes. |
| D-05 Previous-workout summary | SIMPLIFY | PASS | E-03: compact date and relevant working facts render without coaching. |
| D-06 Current-set highlight | KEEP | PASS | E-03/E-12: current state is semantic and not color-only. |
| D-07 Completed/untouched states | KEEP | PASS | E-03/E-12: completed, current, pending, and skipped states pass browser/a11y checks. |
| D-08 Auto-advance | SIMPLIFY | PASS | E-03: advancement preserves context and remains editable. |
| D-09 Add set | KEEP | PASS | E-03: explicit add-set writer records actual work with validation. |
| D-10 Remove/skip set | KEEP | PASS | E-03/E-06: explicit skip/remove is distinct from completion and not automatically grade-negative. |
| D-11 Reorder exercises | SIMPLIFY | PASS | E-03: move/Do-next behavior persists actual order. |
| D-12 Substitute exercise | KEEP | PASS | E-03: workout-only substitution, explicit routine save, exact identity, and multi-hop provenance pass. |
| D-13 Custom exercise | SIMPLIFY | PASS | E-03: bounded name plus required stable targets and deterministic custom identity pass. |
| D-14 Named variants | KEEP | PASS | E-03/E-07: independent identity, target, default, resistance type, and history pass. |
| D-15 Equipment blocker | DELETE | PASS | E-03/E-10: equipment state cannot prevent exercise/set/timer logging. |
| D-16 Exercise taxonomy while logging | ENGINE ONLY | PASS | E-03/E-09: minimum identity mapping remains; uncertainty does not create a logging blocker. |
| D-17 Exercise notes | KEEP | PASS | E-03/E-07/E-09: notes stay attached to exact exercise/session source. |
| D-18 Session notes | KEEP | PASS | E-03/E-09: active and completion notes persist/recover. |
| D-19 Workout duration | KEEP | PASS | E-03/E-09: versioned active-time semantics and legacy recovery boundaries pass. |
| D-20 Exercise order | KEEP | PASS | E-03/E-09: actual order persists in draft/submission/history. |
| D-21 Warm-up logging | SIMPLIFY | PASS | E-03/E-09: warm-ups are distinct, correctable, and excluded from working comparisons. |
| D-22 Working-set classification | ENGINE ONLY | PASS | E-03/E-09: conservative normalized roles and ambiguity handling pass. |
| D-23 Back-off/drop roles | ENGINE ONLY | PASS | E-03/E-09: known roles/provenance are preserved without forced certainty. |
| D-24 Rest timer | KEEP | PASS | E-04: shared automatic timer, remaining/elapsed/overtime, adjust, Skip/Finish, and reload pass locally/browser. |
| D-25 Variant rest defaults | KEEP | PASS | E-03/E-04/E-08: one stable editable rest default per variant drives the timer. |
| D-26 Lock-screen/live notification | KEEP | PARTIAL | E-04: code, package, permission fallback, and notification contracts pass; physical installed-device behavior is unproven. |
| D-27 Sound/vibration controls | SIMPLIFY | PARTIAL | E-04/E-08: central permission-aware controls exist; physical sound/haptic behavior is unproven. |
| D-28 Elapsed rest | KEEP | PASS | E-04: overtime elapsed display passes. |
| D-29 Per-set rest button | SIMPLIFY | PASS | E-04: one shared authorized starter replaces repeated controls. |
| D-30 Full exercise name | KEEP | PASS | E-03/E-12: full name/suffix wraps and is not programmatically truncated. |

### E. Override, completion, and grade

| ID | Final disposition | Status | Implementation / test / runtime evidence |
| --- | --- | --- | --- |
| E-01 Free load/rep/RPE override | KEEP | PASS | E-03/E-05: valid actual work is recordable without permission; warnings do not falsify/block it. |
| E-02 Workout vs routine save | SIMPLIFY | PASS | E-03: workout-only is default and routine mutation is a separate explicit action. |
| E-03 Adherence grade | DELETE | PASS | E-06/E-10: target deviation itself is not a negative grade signal. |
| E-04 Workout grade | SIMPLIFY | PASS | E-06 and D-025: one prospective actual-work v2 grade uses algorithm 1.1; earlier stored versions remain immutable. |
| E-05 Hypertrophy score | DELETE | PASS | E-10: no renamed/second stimulus score or normal consumer remains. |
| E-06 Exercise progression summary | KEEP | PASS | E-06/E-07: only factual comparable improvements are summarized. |
| E-07 PR detection | SIMPLIFY | PASS | E-06/E-07: bounded exact-role/identity/resistance PRs require a prior baseline. |
| E-08 PR summary page | DELETE | PASS | E-07/E-10: no separate route; bounded facts are contextual. |
| E-09 Post-workout experience | KEEP | PASS | E-06: one concise grade/reasons/highlights/exception state passes. |
| E-10 Next-time completion advice | SIMPLIFY | PASS | E-05-E-07: completion shows factual marker or the same canonical exception only. |
| E-11 Confetti | NOT AUTHORIZED | PASS (conditional) | E-10: no new celebration effect was introduced. |
| E-12 Completion confirmation | KEEP | PASS | E-06/E-09: one consequential confirmation and supported recovery pass. |

### F. Progress, history, and analytics

| ID | Final disposition | Status | Implementation / test / runtime evidence |
| --- | --- | --- | --- |
| F-01 Workout history | KEEP | PASS | E-07: chronological submitted history remains complete. |
| F-02 Exercise history | KEEP | PASS | E-07: exact variant/resistance history includes recent and older sessions. |
| F-03 Exercise charts | SIMPLIFY | PASS | E-07: one interpretable comparable-performance trend is primary. |
| F-04 Clickable chart points | KEEP | PASS | E-07/E-12: point date/load/reps/RPE/role/session/notes/source are inspectable. |
| F-05 “Reps at weight” chart | DELETE | PASS | E-07/E-10: separate chart/route/state is absent; source facts remain. |
| F-06 Date-window selector | SIMPLIFY | PASS | E-07: recent/all control filters the chart only, not stored history. |
| F-07 Six qualifying weeks | ENGINE ONLY | PASS (conditional) | E-07/E-15: no user control or universal six-week rule survives; no validated detector capability is claimed. |
| F-08 Six-month retention | KEEP — ALREADY SATISFIED | PASS | E-07/E-09: all history is retained; recent window is display-only. |
| F-09 Weekly volume dashboard | DELETE | PASS | E-10: route/render/Today computation absent. |
| F-10 Visible set fractions | DELETE | PASS | E-10: no direct/secondary/fractional display survives. |
| F-11 Fractional-set calculation | ENGINE ONLY | PASS (conditional) | E-10/E-15: no live approved flag needs it, so runtime calculation is absent. |
| F-12 Program hypertrophy score | DELETE | PASS | E-10: absent. |
| F-13 Per-lift hypertrophy score | DELETE | PASS | E-10: absent; factual performance replaces it. |
| F-14 Dashboard scorecards | DELETE | PASS | E-02/E-07/E-10: Today and Progress contain no replacement scorecard. |
| F-15 Muscle-group charts | NOT AUTHORIZED | PASS (conditional) | E-10: no new chart family. |
| F-16 Recovery-impact charts | NOT AUTHORIZED | PASS (conditional) | E-10: source facts remain without a new chart family. |
| F-17 Mesocycle archives | DELETE | PASS | E-09/E-10: workout/routine labels and snapshots remain; archive UI/state does not. |

### G. Routines and removed planning

| ID | Final disposition | Status | Implementation / test / runtime evidence |
| --- | --- | --- | --- |
| G-01 Basic routine/template | KEEP | PASS | E-08: each template is a basic repeatable workout/day with ordered variants and stable sets/range/RPE/rest. |
| G-02 Duplicate routine | KEEP | PASS | E-08: independent IDs are allocated through every persisted routine level. |
| G-03 Edit routine | SIMPLIFY | PASS | E-08: name/order/exercises/sets/range/RPE/rest are the supported fields. |
| G-04 Automatic mesocycle generation | DELETE | PASS | E-10: generator, request inputs, hidden state, routes, schemas, and package entries are absent. |
| G-05 Modular mesocycle builder | DELETE | PASS | E-10: complete workflow/state removed. |
| G-06 Guide/Setup/Build/Check/Create | DELETE | PASS | E-10: routes/state/copy/tests/deep links removed. |
| G-07 Mesocycle guide | DELETE | PASS | E-08/E-10: not moved into Help or Settings. |
| G-08 Exercise candidate pool | DELETE | PASS | E-03/E-10: direct exercise search/create remains without planner pool state. |
| G-09 Selected portfolio | DELETE | PASS | E-08/E-10: ordered actual routine exercises are the only collection. |
| G-10 Equipment-filter setup | DELETE | PASS | E-03/E-10: no global constraint; metadata cannot block. |
| G-11 Muscle-group scope | DELETE | PASS | E-10: questionnaire/state absent. |
| G-12 Frequency badges/status colors | DELETE | PASS | E-10: no replacement validation badges. |
| G-13 Maximum sets/day guardrail | DELETE | PASS | E-03/E-10: no planner/logging blocker or warning. |
| G-14 Maximum exercises/muscle/day | NOT AUTHORIZED | PASS (conditional) | E-10: dormant planner logic does not survive. |
| G-15 Program exercise-reuse rules | DELETE | PASS | E-08/E-10: explicit routine choice prevails. |
| G-16 Recommended builder content | DELETE | PASS | E-10: no algorithmic planner substitute. |
| G-17 Mesocycle lifecycle | DELETE | PASS | E-09/E-10: legacy decode is bounded; no active state/new writer. |
| G-18 Recommendation quality score | PROCESS ONLY | PASS | E-05/E-13/E-15: resolver evaluation discipline exists without product score/state/route. |

### H. Data, privacy, and engineering process

| ID | Final disposition | Status | Implementation / test / runtime evidence |
| --- | --- | --- | --- |
| H-01 Load/reps/RPE history | KEEP | PASS | E-07/E-09: preserved until explicit clear/delete. |
| H-02 Exercise-order history | KEEP | PASS | E-03/E-09: actual sequence and identity preserved. |
| H-03 Duration history | KEEP | PASS | E-03/E-09: captured values/semantics retained; missing time is not invented. |
| H-04 Readiness history | KEEP | PARTIAL | E-09 preserves recorded/supplied values, but complete field-level provenance for objective metrics is not proven. |
| H-05 Notes history | KEEP | PASS | E-07/E-09: exercise/session notes preserved. |
| H-06 Rest-duration history | ENGINE ONLY | NOT PROVEN | E-04/E-09 prove target/timer/draft state, but no submitted per-set actual-rest observation contract was found. |
| H-07 Strong import | KEEP | PASS | E-09: secondary import has preview, strict validation, versioning, identity handling, and recovery. |
| H-08 Warm-up inference | ENGINE ONLY | PASS | E-03/E-09: conservative role inference, original value, ambiguity, and correction pass. |
| H-09 Data export | KEEP | PASS | E-09: complete versioned export includes validated independent active draft. |
| H-10 Clear local data | KEEP | PASS | E-09/E-16: explicit scope, confirmation, remote cleanup authorization boundary, and fail-closed behavior pass. |
| H-11 Retention controls | DELETE | PASS | E-08/E-10: no risky archive-window setting; all history retained. |
| H-12 Notification settings | KEEP | PASS | E-04/E-08: timer behavior/permission controls only; physical effect remains separately gated. |
| H-13 Privacy/support | KEEP | PASS | E-08/E-12/E-14: reliable secondary pages and return paths pass. |
| H-14 Weekly UI audit | PROCESS ONLY | PASS | E-12/E-13: workflow and current-screen audit automation pass without product UI. |
| H-15 Browser/device verification | PROCESS ONLY | PARTIAL | E-12: mobile/desktop Chromium evidence passes; physical device, screen reader, and broader browser matrix remain open. |
| H-16 Research logic audit | PROCESS ONLY | PASS | E-05/E-15: the only live rule was reviewed; numeric rules remain explicitly out of scope. |
| H-17 Documentation sources | SIMPLIFY | PASS | E-01: final package is intent; historical audits are labeled; living docs and D-025-D-027 match current implementation. |
| H-18 Recommendation sources | DELETE | PASS | E-05/E-10: one canonical resolver feeds visible/stored current actions. |
| H-19 Permanent feature flags | SIMPLIFY | PASS | E-10: no expired final migration/product flag survives. |

### X. Additional adjudicated structures

| ID | Final disposition | Status | Implementation / test / runtime evidence |
| --- | --- | --- | --- |
| X-01 Generated `www/` mirror | KEEP — ALREADY SATISFIED | PASS | E-11: root/`www`/native sync passes and PWA verification reports 26/26 assets. |
| X-02 React/Vite concept toolchain | DELETE | PASS | E-10/E-13: concept runtime/config/tests/dependencies are deleted; historical governance docs remain labeled. |
| X-03 Large inline CSS | NOT AUTHORIZED | PASS (conditional) | E-01/E-10: no unrelated extraction/stack rewrite was inferred. |
| X-04 Plate calculator | DELETE | PASS | E-10: code/state/styles/tests/assets absent. |
| X-05 Execution-quality questionnaire | DELETE | PASS | E-06/E-09/E-10: UI/new writes absent; submitted historical facts remain read-only. |
| X-06 Legacy/modern recommendation renderers | DELETE | PASS | E-05/E-10: canonical action presentation is the sole current renderer. |
| X-07 User confidence primitive | DELETE | PASS | E-05/E-10: UI/state/styles absent; plain provenance remains internal. |
| X-08 Prescription snapshots | SIMPLIFY | PASS | E-09/E-10/D-026: owning-workout immutable compatibility facts remain; no normal generator entitlement. |
| X-09 Equipment preference | DELETE | PASS | E-03/E-09/E-10: decoder accepts/discards legacy value; no active reader/writer/blocker/current export. |
| X-10 Research/evidence surfaces | DELETE | PASS | E-10/E-11: product UI/package absent; validated source material remains offline for approved-rule review. |

## 7. Recommendation-engine contract traceability

| Contract requirement | Status | Implementation, tests, and runtime evidence |
| --- | --- | --- |
| §1 Purpose | PASS | E-05: ordinary silence, one coherent direct-safety action, stable targets, reproducible records, weak-evidence suppression, and usable logger on failure pass. |
| §2.1 Variant targets | PASS | E-03/E-05: variant sets/range/RPE/rest are authoritative; exceptions cannot rewrite normal range or completed facts. |
| §2.2 Silence | PASS | E-05/E-10: no normal add/hold/prose/confidence/citation output. |
| §2.3 One authority | PASS | E-05/E-10: detectors submit candidates only; resolver alone decides/persists/renders current actions. |
| §3.1 Candidate vocabulary | PASS | E-05: detector/rule version, time, scope, sources/digest, provenance, action, reason, sufficiency, and return boundary are validated. |
| §3.2 Resolved action | PASS | E-05: versioned deterministic action/no-action, scope, handling, source references, expiry, and supersession pass. |
| §3.3 Factual marker | PASS | E-06/E-07: compact historical facts remain distinct from resolved actions and exact next prescriptions. |
| §3.4 Provenance | PARTIAL | E-05/E-09: resolver/import provenance is plain; complete readiness/objective/rest provenance remains incomplete. |
| §4 Category/action allowlist | PASS | E-05/E-15: permanent categories/actions are bounded; no current numeric threshold is treated as approved. |
| §5.1 Stable routine inputs | PASS | E-03/E-08: exact variant, stable targets, repeatable workout/day, and order exist as reference facts. |
| §5.2 Training observations | PARTIAL | E-03/E-07/E-09 cover actual work, roles, order, duration, substitutions, notes, overrides, and snapshots; submitted actual-rest observation is not proven. |
| §5.3 Readiness/safety observations | PARTIAL | E-02/E-05/E-09 cover deviation, soreness, pain/illness, note, and retained objective values; complete objective provenance remains incomplete. |
| §5.4 Historical window | PASS | E-07: all history persists and no universal six-week/six-month engine constant is active. |
| §6.1 identity, §6.3 comparability, §6.4 sufficiency, §6.5 freshness, §6.6 materiality | PASS | E-05/E-07: wrong/ambiguous variant-role data suppresses; active direct input is fresh/material; synthetic qualification boundaries pass. |
| §6.2 source integrity | PARTIAL | E-09: schema/original-import preservation passes; wider objective/rest provenance is incomplete. |
| §6.7 calibration | PASS for current scope | E-05/E-15: direct recorded safety input received scoped review; all numeric rules are inactive until separately calibrated. |
| §6.8 actionability, §6.9 non-duplication, §6.10 auditability | PASS | E-05: allowlisted action/scope/return, absorption/deduplication, deterministic fixtures/IDs/digests pass. |
| §7.1 Precedence | PASS | E-05: direct pain/illness wins; deload/readiness/fatigue/plateau ordering is deterministic in resolver fixtures. |
| §7.2 Scope | PASS | E-05: one session plus at most one materially stricter nonredundant exercise action. |
| §7.3 Strictness | PARTIAL | E-05: versioned action-family ordering passes; parameter-aware same-family numeric ordering must be completed before any numeric detector is approved. |
| §7.4 Reevaluation | PASS | E-05/E-09: explicit start/input boundaries, prospective action changes, immutable past facts, handling, and supersession pass. |
| §8 Presentation | PASS | E-05/E-12: one action/scope/reason and bounded detail; prohibited internal/confidence/evidence content absent. |
| §9 Safety/logging integrity | PASS | E-03/E-05: highest-priority plain warning, no safety claim/diagnosis, explicit handling, actual-work recording, no equipment block, and canonical fallback pass. |
| §10.1 Active workout persistence | PASS | E-05/E-09: draft stores action/reference/handling with recovery. |
| §10.2 Submitted workout persistence | PASS | E-06/E-09/D-025/D-026: actual observations, stable snapshot, action, override, grade/version, and provenance freeze prospectively. |
| §10.3 Legacy fields | PASS | E-09/E-10/D-026: isolated readers preserve owning-workout facts; no old renderer/execution/new writer/active array/flag. |
| §11 Grade relationship | PASS | E-06: grade consumes actual work/completeness/comparable facts/canonical handling, not detector output or plan adherence; history never regrades. |
| §12 missing/ambiguous/stale/error/conflict/unknown-identity/import failure rows | PASS | E-05/E-09: all suppress or resolve conservatively, preserve source facts, record privacy-safe engineering state, and keep logging usable. |
| §12 notification unavailable | PARTIAL | E-04: in-app fallback/context passes; physical platform behavior is unproven. |
| §13 Evaluation/approval gates | PARTIAL | E-05/E-13/E-15 cover intent, boundaries, synthetic replay, comparability, ambiguity, conflicts, cap, invariants, deterministic snapshots, and scoped review. E-17/E-18 withhold fresh performance, physical device, independent final review, and five workouts. |
| §14 migration steps 1-8 | PASS | E-05/E-10: normalized boundary/resolver/shadow comparison/sole-surface consumption/deleted renderers/direct consumers/flags/unsupported detectors are complete. |
| §14 step 9 tests/docs | PASS | E-01/E-13 and this audit: tests and living docs match D-025-D-027 and the package. |
| §15 Prohibitions | PASS | E-01/E-05/E-10: no new category/score/integration/screen/exact normal prescription/graveyard/direct detector UI/medical claim/historical recomputation. |

## 8. Migration and acceptance traceability

### 8.1 Principles, invariants, and milestones

| Plan requirement | Status | Evidence / gap |
| --- | --- | --- |
| §§1-2 purpose, sequencing, one-way deletion, no hidden coexistence | PASS | E-01/E-10; M0-M8 order and decision records are explicit. |
| §3 protected invariants | PARTIAL | E-03/E-06/E-09 prove synthetic identity/history/draft/snapshot preservation; real protected-data replay remains open. |
| §4 required evidence baseline | PARTIAL | Synthetic fixtures, schemas, tests, package, and docs pass; complete real pre-migration export and independent verifier are not complete. |
| M0 preservation contracts | PASS locally | E-09: synthetic v1-v3 preview/import/idempotency/export/comparison/draft round-trip pass. |
| M1 stable targets | PASS | E-03. |
| M2 canonical resolver | PASS for approved scope | E-05/E-15: direct safety survives; numeric thresholds are explicitly out of scope. |
| M3 planner removal | PASS | E-10/E-11. |
| M4 analysis/research clutter removal | PASS | E-07/E-10/E-11. |
| M5 two-destination/direct Start | PASS | E-02/E-12. |
| M6 active workout | PARTIAL | E-03/E-04 pass local/browser; target-device RPE/background/notification/permission states remain open. |
| M7 grade/Progress | PASS locally | E-06/E-07 and D-025; 1.1 current behavior and 1.0 historical boundary are reconciled. |
| M8 dead structure/package closure | PASS locally | E-10-E-14: deletion, 26-asset package, native sync, privacy, lint, workflows, and dependency gates pass. Independent release freeze remains separate. |

### 8.2 Data migration matrix

| Data family | Status | Evidence / gap |
| --- | --- | --- |
| Completed workouts/sets | PASS synthetic / PARTIAL final | E-09 preserves without recomputation; real protected-data replay is open. |
| Exercise/variant identity | PASS | E-03/E-07/E-09 prevent named/custom collapse. |
| Set roles | PASS | E-03/E-09 preserve/correct conservatively with original values. |
| Order/duration/notes/readiness/rest | PARTIAL | Order/duration/notes/readiness values pass; complete provenance and submitted actual-rest observations do not. |
| Active draft | PASS synthetic/browser | E-03/E-04/E-09; physical crash/OS suspension remains open. |
| Historical prescription/action snapshots | PASS | E-09/D-026: immutable owning-workout boundary and isolated decode pass. |
| Historical grades | PASS | E-06/D-025: values/versions remain immutable; 1.1 applies only prospectively. |
| Historical execution-quality | PASS | E-09/E-10: read-only preservation, no current UI/writer/dependency. |
| Mesocycle planning/lifecycle | PASS | E-10: removed from active domain; bounded decoder retains only approved facts. |
| Global equipment preference | PASS | E-03/E-09/E-10: accepted/discarded, never a blocker. |
| Research/evidence/confidence UI state | PASS | E-10/E-11: active state/UI absent; embedded immutable source snapshots remain bounded. |
| History beyond recent window | PASS | E-07/E-09: preserved and reviewable. |

### 8.3 Acceptance suites and release states

| Acceptance criterion | Status | Evidence / gap |
| --- | --- | --- |
| §7.1 stable targets, prefills, matching, roles, one draft, timer semantics, backup, grade, resolver, no exact prescription/equipment block, immutable snapshots | PASS locally | E-03-E-09 and public effective 51/51. |
| §7.2 synthetic preview/import/idempotency/export/comparison/no retired state/interruption | PASS synthetic | E-09. |
| §7.2 real migration and independent verifier | NOT PROVEN | E-18. |
| §7.3 two destinations, Start/readiness/conflict/logger/names/states/controls/notes/timer/completion/Progress/Settings/a11y | PARTIAL / NEEDS REVIEW | E-12: corrective mobile 146 pass/15 skip/0 fail; desktop full-project reruns produced 142 pass/1 fail/18 skip and 141 pass/2 fail/18 skip. All three distinct failures pass in isolation and are classified as pre-existing contention/race-sensitive test-design defects. |
| §7.3 physical screen reader/native accessibility | NOT PROVEN | E-18. |
| §7.4 cold/cached local load, reload, packaged parity, in-app timer/permission, configured keyboard/scroll/offline routes | PASS locally/configured | E-04/E-11/E-12. |
| §7.4 installed physical PWA/background/lock-screen/sound/haptic/device RPE/reconnect/SW upgrade matrix | NOT PROVEN | E-18. Source/emulation is explicitly insufficient. |
| §7.5 Today/Start/set/chart/bundle performance | NOT PROVEN | E-17: removed-work assertions pass, but required final measurements do not exist. |
| §7.6 synthetic fixtures, tracked/private exclusions, package privacy | PASS locally | E-11/E-14: privacy 581/581 and public/native payload checks pass. |
| §7.6 final staged-diff/independent privacy/publication review | NOT PROVEN | E-18; no publication action is authorized. |
| §8 deletion across navigation/UI/compute/state/inputs/schema/package/deps/tests/docs/flags | PASS locally | E-10/E-11. Only bounded historical decoders/fixtures/governance remain. |
| §9 five-workout conditions 1-8 | NOT PROVEN | E-18: no real workout field test has occurred. |
| §10 “review-ready” | PARTIAL | Checkpoint `90934ef` is locally review-ready for independent/external acceptance; the plan-wide label still awaits physical/PWA performance, real migration verification, current independent final review, documentation-inclusive freeze, and human gates. |
| §10 “approved for publication” | FAIL | Five-workout/human acceptance and explicit owner authorization are absent. |
| §10 “published” | FAIL | No authorized deployment/hosted verification of this checkpoint occurred. |
| §11 non-inference rules | PASS | E-01/E-10: no hidden alternate product, feature addition, destructive data shortcut, or publication inference. |

## 9. Verification record and final disposition

Current frozen-candidate evidence supplied by the integration run and reproduced where noted:

- `npm run verify:pwa` — **PASS**, 26 assets; reproduced during this audit.
- `node scripts/test-final-contract-state.js` — **PASS**; reproduced.
- `node scripts/test-redesign-m8-deletion.js` — **PASS**; reproduced.
- public tests — effective **51/51**; two unchanged tests required separate reruns only because sandbox policy blocked Git child-process spawn, so this report does not misstate the original single command as clean.
- private local gate — **2/2 PASS**, without exposing private artifacts.
- corrective mobile Chromium — **146 passed, 15 configured skipped, 0 failed**.
- corrective desktop Chromium — **NEEDS REVIEW**: Claude reproduced **142 passed, 1 failed, 18 skipped**, then **141 passed, 2 failed, 18 skipped**; all three distinct failures pass in isolation.
- documentation sentinels — **2/2 PASS**.
- post-audit compact-soreness mobile regression — **1/1 PASS**, including persistence before Start and from the active workout; the rendered 390-class sheet was inspected.
- lint — **192 JavaScript / 3,112 JSON PASS**.
- workflow validation — **PASS**.
- tracked public privacy — **581/581 PASS**.
- dependencies — production **0 vulnerabilities**; full tree **3 moderate development-only**, no high/critical.
- `npm run cap:sync` — **PASS** for web/Android/iOS public payload copy; CocoaPods and `xcodebuild` unavailable.
- `git diff --check` before this audit edit — **PASS**, with line-ending warnings only.

### Final self-audit state

- **Implemented locally:** the zero-based redesign source, tests, generated package, native public payload, documentation reconciliation, and this traceability audit.
- **Locally review-ready:** source checkpoint `90934ef` is ready for the pending independent and external acceptance gates.
- **Not objectively complete:** pinned-runtime reproduction, physical/device/accessibility/notification gates, fresh performance measurements, real protected-data migration/independent verifier, current independent final reviewer, immutable release freeze, owner baseline acceptance, and five real workouts.
- **Not approved for publication:** no explicit authorization exists.
- **Not published:** no deployment or hosted verification of checkpoint `90934ef` occurred.

This document changes no product decision, does not reopen fixed-light appearance, contains no private record, and does not inflate either fixed rubric to a target score.

## 10. Corrective-candidate addendum — 2026-08-02

This section supersedes older checkpoint/count statements above where they conflict with the current working tree.

- **Claude corrective finding CF-01 corrected:** the soreness group’s empty option is `Not recorded`; readiness remains `Not entered`. Accessibility tests now locate both values through their named fieldsets and retain the dialog focus-trap assertions. `CF-*` labels in this addendum refer to Claude corrective findings and are distinct from `FINAL_FEATURE_DISPOSITION.md` feature IDs such as feature F-01 through F-17.
- **Claude corrective finding CF-03 corrected:** `updateWorkoutStatusDom()` refreshes both Current focus text nodes from `workoutProgress()`. A three-set Playwright regression proves advancement after sets 1 and 2 and correct restoration after reload.
- **Claude corrective finding CF-07 retained as cosmetic dead code:** `const advice = null` and its three unreachable ternaries in `app-analysis.js` are local to `renderTemplateCard()`, have no resolved-action or compatibility role, and can be removed without behavioral effect. The earlier compatibility rationale was a misidentification of required maps in `renderResolvedAction()`.
- **Excluded Claude findings CF-06 and CF-09 remain omitted:** no optional progress marker or rest capture was added. These labels are not feature-disposition F-06/F-09.
- **Corrective evidence:** focused Playwright 3/3; public 51/51; protected local 2/2; mobile 146 passed/15 configured skips/0 failures; tracked privacy 581/581; PWA 26/26; lint 192 JavaScript/3,112 JSON; workflows/research/package/dependency gates passed; production dependencies have zero vulnerabilities and the full tree has three moderate development-only findings with no high/critical findings. Desktop remains **NEEDS REVIEW** as described below.
- **Runtime limitation:** the corrective evidence used Node 24.18.0/npm 11.16.0. It does not satisfy the required Node 22.23.x/npm 10.9.x decisive gate.
- **Immutable revision limitation:** no candidate commit was created because the current task does not authorize commits. The exact candidate identifier therefore remains pending owner authorization.
- **Desktop race record:** `runtime-trust-boundaries.spec.js:547`, `private-data-lifecycle-regressions.spec.js:423`, and `template-workout-history-lifecycles.spec.js:1273` flaked only in full-project execution and pass in isolation (6/6 and 30/30). For `private-data-lifecycle-regressions.spec.js:423`, boot-time `cleanupLegacyWorkoutCloudData()` writes `legacyWorkoutCleanupCompletedAt` and `legacyWorkoutCleanupPending` before the test’s exact-equality assertion; the test’s own `/api/sync/consent` stub guarantees successful cleanup. This is a pre-existing M8-era test-design race, not a regression. Do not weaken the assertion merely to force a pass; a future test correction should either tolerate those documented cleanup fields or await cleanup before asserting.
- **Review-record location:** Claude’s original final acceptance audit and this corrective verification were explicitly returned in conversation rather than written to the repository. Their absence from `docs/redesign/audits/` is intentional, not a missing artifact; persistence is an owner decision.
- **M2 attribution:** Claude’s original final acceptance audit §7 plus this corrective verification are the independent recommendation-logic review for M2. Claude approves direct recorded pain/illness resolving to one advisory session-scoped `stop_or_skip_work` action and concurs that numeric fatigue, readiness, plateau, and deload thresholds are correctly out of scope.

### Corrective verdict

**READY AFTER MINOR DOCUMENTATION CORRECTIONS.** Claude verified the implementation corrections and found no regression or scope expansion. The candidate remains uncommitted and untested under the pinned runtime, and desktop full-project execution remains **NEEDS REVIEW** for pre-existing contention/race-sensitive tests. External/device testing, protected migration, hosted deployment, baseline acceptance, field testing, merge, push, and publication must not begin.
