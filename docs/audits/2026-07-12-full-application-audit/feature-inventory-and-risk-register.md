# Feature inventory and risk register

## Coverage rule

The collaboration runtime exposes root plus three child threads and retains completed children. The audit therefore runs specialties in successive turns on those children. Each feature below has explicit mapping, test, and independent-review ownership; user-facing features additionally receive visual/accessibility coverage, persistent-data features receive migration/integrity coverage, recommendation-affecting features receive logic/science coverage, and personal/external features receive security/privacy coverage.

## Actual feature inventory

| # | Actual feature/surface | Baseline status | Mapping evidence | Required dedicated verification before release |
| ---: | --- | --- | --- | --- |
| 1 | Five-tab shell, header, hash/deep-link navigation, theme, units, safe areas | IMPLEMENTED | Thread 002; `primaryTabIds`, `render`, `setActiveTab` | Feature/browser, visual, accessibility, unit persistence, independent review |
| 2 | Lift program overview and quick start | IMPLEMENTED / protected | Thread 002; `renderLiftHome` | Critical feature, visual regression, accessibility, performance, independent review |
| 3 | Template create/edit/delete/start/save-current-workout | PARTIALLY IMPLEMENTED | Thread 002; `renderTemplates`, delegated actions | CRUD/validation/error/long-label/mobile tests, visual/a11y, independent review |
| 4 | Guided mesocycle Guide/Setup/Build/Check/Create | IMPLEMENTED WITH DEFECTS | Threads 002Ã¢â‚¬â€œ005; guided renderer/domain module | Recommendation/taxonomy invariants, browser lifecycle, migration/persistence, visual/a11y, science, independent review |
| 5 | Legacy automatic mesocycle compatibility | INTERNAL / unreachable UI | Threads 002/006; unconditional return in `renderMesocyclePlanner` | Reachability classification, remove false tests/claims, historical preservation, independent review |
| 6 | Available Equipment multi-entry selector | IMPLEMENTED reference surface | Threads 002/007; guided setup | State/persistence/hard-constraint/substitution tests, visual/a11y, independent review |
| 7 | Muscle Group Scope multi-entry selector | IMPLEMENTED WITH TAXONOMY DEFECTS | Threads 002/003/007 | All canonical/family values, empty/all/conflict/persistence/recommendation tests, visual/a11y, migration review |
| 8 | Readiness capture and template-start preview | IMPLEMENTED WITH SAFETY DEFECT | Threads 002/004/005 | Illness/pain/targeting/missing/conflicting data E2E, safety/science/security, visual/a11y, independent review |
| 9 | Active workout creation/editing | IMPLEMENTED | Thread 002; active workout handlers | Create/add/remove/reorder/replace/save/cancel/concurrency/mobile tests, visual/a11y, independent review |
| 10 | Set logging and completion | IMPLEMENTED | Thread 002; set handlers/classifier | Load/reps/RPE/roles/skip/undo/duplicate/retry/history/recommendation-impact tests, performance/a11y/review |
| 11 | User-entered/custom exercises | PARTIALLY IMPLEMENTED | Threads 002/003/004 | Create/mapping/duplicates/eligibility/persistence/import/migration/a11y tests, independent review |
| 12 | Plate calculator and resistance models | IMPLEMENTED | Thread 002; resistance helpers | External/bodyweight/assisted/duration/distance/unit boundaries, independent review |
| 13 | Unified prescription and explanation | IMPLEMENTED WITH MATERIAL DEFECTS | Threads 002/004/005 | Full invariant/counterfactual/golden/property suite, explainability/browser tests, independent review/scoring |
| 14 | Manual prescription override | IMPLEMENTED WITH SAFETY/VALIDATION DEFECTS | Thread 004; `applyManualOverride`, override UI | Runtime schema bounds, hard-safety precedence, replacement semantics, audit outcome, browser/a11y/security review |
| 15 | Rest timer, completion notice, wake lock, deep link | IMPLEMENTED | Thread 002; rest controller | Lifecycle/background/dedup/reload/permission/browser/a11y tests, independent review |
| 16 | Optional Web Push rest alerts | PARTIALLY IMPLEMENTED | Thread 002; API/service worker | Auth/idempotency/input/retention/error/device tests, privacy/security, independent review |
| 17 | Explicit submission, grade, PRs, completed summary | IMPLEMENTED | Thread 002; `submitWorkout`, summary renderers | Partial/duplicate/error/PR taxonomy/history effects/browser/a11y tests, independent review |
| 18 | Submitted history and edit transaction | IMPLEMENTED | Thread 002; history render/edit functions | Read-only/edit/save/cancel/recalculate/legacy/large-data tests, visual/a11y/migration/review |
| 19 | Dashboard weekly volume, fatigue, details | IMPLEMENTED WITH TAXONOMY DEFECT / protected | Threads 002/003 | Deterministic aggregates/date/legacy/empty/large/error tests, visual/a11y/performance, independent review |
| 20 | Charts, score, expectations, point detail | IMPLEMENTED | Thread 002 | Deterministic data/date/period/empty/large/chart accessibility/responsive/performance tests, review |
| 21 | Exercise search, filters, option lists | PARTIALLY IMPLEMENTED | Thread 002 | Exact/partial/case/alias/legacy/no-results/large/stable-sort/keyboard/performance tests, review |
| 22 | Backup JSON export/import | IMPLEMENTED WITH WEAK VALIDATION | Threads 002/003/008 | Full schema, malformed/legacy/duplicate/partial/idempotency/sensitive-data tests, security/migration/review |
| 23 | Strong CSV import/migration | IMPLEMENTED | Threads 002/003 | Valid/invalid/duplicates/units/legacy/taxonomy/record-count/rollback tests, privacy/migration/review |
| 24 | Private aggregate evidence import/pipeline | IMPLEMENTED LOCALLY | Threads 002Ã¢â‚¬â€œ005/008 | Clean public fixture boundary, staleness/version/crosswalk/privacy/validation tests, migration/review |
| 25 | Clear all local data | IMPLEMENTED | Threads 002/008 | Unsynced warning/export/typed confirm/cancel/partial cleanup/cache/subscription tests, a11y/security/review |
| 26 | Offline shell, install, update deferral, service worker | IMPLEMENTED | Threads 002/006 | Cache manifest/hash parity, offline/update/deep-link/browser/PWA tests, security/performance/review |
| 27 | Workout mutation sync | PARTIALLY IMPLEMENTED | Threads 002/006/008 | Auth/idempotency/conflict/retention/error/privacy tests; restore/delete promise review; independent review |
| 28 | Privacy and Support static pages | IMPLEMENTED | Thread 002 | Hosted/local navigation, responsive/a11y/content-security/docs accuracy, independent review |
| 29 | Public research database build/validation | IMPLEMENTED WITH VALIDATION/EVIDENCE GAPS | Threads 003/005 | Reference/vocabulary/credit/alias/pool/version/export/hash/rollback checks, science/review |
| 30 | Private normalization/analysis pipeline | IMPLEMENTED LOCALLY | Threads 002Ã¢â‚¬â€œ005/008 | Synthetic public testability, dedupe/crosswalk/data-integrity/privacy/performance/migration/review |
| 31 | Capacitor iOS/Android packaging | PARTIALLY IMPLEMENTED | Threads 002/006 | Web sync/privacy guard, native build/tests/device limits, accessibility/security/release review |

## Baseline risk register

| ID | Severity | Risk | Evidence | Required disposition |
| --- | --- | --- | --- | --- |
| R-001 | Critical | Illness/pain can display stop/rest guidance while engine-backed start preserves hard targets. | Threads 002/004; `prescriptionReadiness`, `adjustTargetForRecovery` | Failing E2E/domain reproduction, deterministic hard precedence, independent regression review |
| R-002 | Critical | Progression can occur with current pain, missing/high RPE, or incomplete work. | Thread 004; `determineProgressionDecision` | Invariant tests and safety-first progression fix |
| R-003 | High | Assisted-bodyweight progression can increase assistance while calling it progress. | Thread 004; `prescribedLoadFromHistory` | Resistance-contract tests and canonical direction fix |
| R-004 | High | Planned mesocycle working sets are replaced by generic prescription targets at workout start. | Thread 004; template creation/start path | Plan-authority counterfactual and integration fix |
| R-005 | High | Manual overrides accept invalid bounds/unknown exercise and can clear deload/rotation safeguards. | Thread 004; `applyManualOverride` | Runtime schema validation, safety locks, browser tests |
| R-006 | High | Canonical alias normalization fails across most app analytics/history lookups. | Thread 003; measured 0/61 canonical direct hits | One shared resolver and exhaustive 124-key integration tests |
| R-007 | High | Guided family projection breaks traps/calves and overcounts same-family chest subdivisions. | Thread 003; guided ledger reproductions | Explicit hierarchy, safe coalescing, all-family tests |
| R-008 | High | Exact canonical muscle queries overbroaden; obliques have no positive-credit candidate. | Thread 003 | Scope-aware matching plus valid eligibility/unavailable-state decision |
| R-009 | High | Public `npm test` depends on excluded private artifacts; source-regex tests certify unreachable UI. | Threads 002/006 | Public synthetic suite, optional private suite, reachable behavior tests, CI |
| R-010 | High | Native sync can silently copy locally present private aggregates into packaged apps. | Thread 006 interim | Public-by-default sync, explicit local-private opt-in, release privacy guard |
| R-011 | High | Backup import and app persistence lack complete runtime schema/migration validation. | Threads 002/003 | Schema/validator, preservation counts, rollback/recovery tests |
| R-012 | Medium | Scientific operating heuristics become hard blockers or falsely precise scores. | Threads 004/005 | Goal-specific advisory/blocking severity and evidence/product-policy labels |
| R-013 | Medium | Documentation/version/count/performance/reachability claims are stale. | Threads 002Ã¢â‚¬â€œ006 | Mandatory documentation reconciliation after verified implementation |
| R-014 | Medium | Browser coverage protects only selected default states, not complete feature lifecycles. | Threads 002/007 | Critical-flow/fixture/empty-error-large/a11y/responsive expansion |
| R-015 | Medium | Monolithic frontend and duplicated root/`www` outputs amplify cross-cutting regression risk. | Threads 002/006 | Targeted shared contracts, generated-parity release gates, no broad rewrite |
| R-016 | Critical | A tampered backup can retain hostile IDs/fields that are interpolated into `innerHTML`, creating a stored DOM-XSS path with access to local workout data and installation credentials. | Thread 008; import/normalization/render paths | Strict versioned backup validation, safe attribute construction/escaping, hostile-import regression, independent security review |
| R-017 | Critical | Enabling notifications implicitly enables workout-cloud upload; disabling notifications does not stop upload, revoke credentials, or delete retained server data. | Thread 008; notification registration and sync queue/flush paths | Separate explicit sync consent, default off, stop/revoke/delete lifecycle, just-in-time disclosure, API/UI tests |
| R-018 | High | Anonymous backend registration and unbounded sync/timer inputs lack quotas, retention, token expiry, deletion, and atomic idempotency. | Thread 008; push/sync APIs and Redis helpers | Bounded schemas, size/rate/installation quotas, TTL/revocation/deletion, atomic write ordering, failure/concurrency tests |
| R-019 | High | The service worker dynamically caches any successful non-API GET, including locally served private aggregate paths. | Thread 008; `sw.js` fetch handler | Explicit public-asset allowlist, sensitive-path/no-store exclusions, cache-content regression |
| R-020 | High | Android backup/FileProvider and the public web-sync script broaden or silently package sensitive local data. | Threads 006/008; native manifest/path config and `scripts/sync-web.ps1` | Public-by-default/pruned sync, release blocker, scoped/disabled native backup and provider paths, packaging verification |

No application fix may be marked complete until its risk row has an executable regression, independent verification, governing-document update, and privacy-safe staged review.
