# Comprehensive production bug audit

## Campaign contract

- **Status:** COMPLETE
- **Scope:** Implemented production PWA, public data contracts, mocked backend/push behavior, offline/PWA packaging, and Capacitor public packaging checks.
- **Excluded:** Personal fitness records, non-production redesign parity, account/cloud restore, live wearable ingestion, signing/store release, and destructive live-service tests.
- **Data boundary:** Public synthetic fixtures and isolated browser storage only.
- **Reconciliation rule:** Reproduce, classify, fix, add a regression test, update governing documentation, rerun the owning charter, and complete hosted verification for user-facing changes.

## Severity

| Level | Definition |
| --- | --- |
| P0 | Safety, privacy, security, or credible data loss |
| P1 | Crash, blocked critical flow, corrupted persistence, or materially incorrect recommendation |
| P2 | Functional defect with a workaround |
| P3 | Visual, accessibility, copy, or low-impact inconsistency |

## Findings

| ID | Severity | Feature | Status | Evidence / expected reconciliation |
| --- | --- | --- | --- | --- |
| BUG-001 | P2 | Progress navigation | FIXED | Same-Progress Back/Forward now clears transient detail state and rerenders the hash-selected subview. Mobile/desktop regression: `progress-browser-history.spec.js` 2/2. |
| BUG-002 | P1 | Backup recoverability | FIXED | Full app backup import now shares the 50 MiB/100,000-record contract used by export; the separate personal-evidence limit remains 8 MiB. Boundary/integration contracts pass. |
| BUG-003 | P1 | Backup validation | FIXED | Set, target, classifier, and readiness-baseline values now enforce editor-equivalent ranges, integer/step rules, and ordered min/max pairs before replacement. Invalid imports remain atomic. |
| BUG-004 | P1 | Strong CSV units | FIXED | Import now requires an explicit lb/kg source choice, keeps display units independent, stores provenance on sets/original values/raw text, makes same-unit duplicates no-ops, and rejects conflicting reinterpretation. Node contracts 37/37; focused browser matrix 6/6. |
| BUG-007 | P1 | Guided mesocycle entry | FIXED | The Setup label formatter no longer assumes an optional presentation-label map exists. Clean mobile/desktop planner-entry coverage passes without destination or console errors. |
| BUG-005 | P2 | Secondary-page return | FIXED | Canonical navigation consumes recognized one-shot query fields while preserving unrelated verification parameters. Mobile/desktop return → Today → reload regression: 2/2. |
| BUG-006 | P1 | Runtime recovery | FIXED | Runtime restoration now reads the local journal when IndexedDB throws or returns no record while retaining a real IndexedDB runtime as authoritative. Focused persistence regression passes. |
| BUG-008 | P1 | Pain-free safety substitution | FIXED | Safety-locked selection uses an exact unambiguous catalog identity, evaluates every evidence-mapped substitute directly against current equipment instead of truncating through the five-item presentation rank, and revalidates the same identity after resolution. Node and mobile/desktop browser regressions pass. |
| BUG-009 | P2 | 320 px / 200% active-set reflow | FIXED | Active set rows reflow to two columns at large text, numeric spinner chrome no longer consumes the value area, and progression copy wraps. The complete 320 CSS-pixel/200% reflow audit passes. |
| BUG-010 | P1 | Strong exercise identity | FIXED | The complete configured exercise inventory was checked. All 23 explicitly research-mapped Strong labels resolve through one canonical alias owner, while custom names retain exact-history fallback; all 149 recorded names remain startable. Public contracts, private inventory validation, mobile/desktop browser coverage, and hosted verification pass. |
| BUG-011 | P2 | Exercise-options workload editor | FIXED | Straight sets now use one compact workload card; top-set/back-off prescriptions use distinct role cards with independent counts and rep ranges; repeated top efforts remain one role card. Audit replay, unfinished-row rebuilding, opt-in defaults, import validation, mobile/desktop coverage, and hosted verification pass. |
| BUG-012 | P1 | Plan empty-template start | FIXED | A template reduced to zero exercises no longer exposes an executable Start action, and both readiness-sheet opening and workout construction reject stale/programmatic starts. Mobile/desktop regression covers removal, persistence, runtime defense, and recovery after restoring an exercise. |
| BUG-013 | P2 | More numeric-setting persistence | FIXED | The runtime now normalizes typed default-rest and readiness-baseline values to the same ranges, increments, and integer rules enforced by their controls and backup import, so an app-created export cannot be rejected for these settings. Mobile/desktop regression covers bounded persistence and reload. |

## Feature disposition matrix

Every implemented area must finish as `PASS`, `FIXED`, `BLOCKED`, or `NEEDS REVIEW` with evidence.

| Area | Current disposition |
| --- | --- |
| Shell, routes, responsive UI, accessibility | FIXED / PASS — complete mobile/desktop matrix |
| Today, readiness, prescriptions, workout execution, timers | PASS — deterministic lifecycle mobile/desktop |
| Plan, templates, guided mesocycles, historical plans | FIXED / PASS |
| Submission, summary, PRs, grading | PASS — deterministic lifecycle mobile/desktop |
| Progress overview, lifts, charts, history editing | FIXED / PASS |
| More, settings, units, imports/exports, consent, clearing | FIXED / PASS |
| Persistence conflict and draft/runtime recovery | FIXED / PASS |
| Offline shell, service-worker update, public packaging | PASS — PWA/public-native verification |
| Mocked push/sync backend contracts | PASS — public security/sync harnesses |
| Physical device, system permissions, live service state | NEEDS REVIEW |

## Evidence log

- Final public gate: 50/50 selected harnesses passed from 51 discovered; one private-only harness was correctly excluded because it requires ignored personal artifacts.
- `node scripts/test-runtime-persistence.js`: passed.
- `node scripts/test-backup-contract.js`: passed.
- `node scripts/test-app-integration-contracts.js`: 36/36 passed with the 50 MiB/100,000-record fixture contract.
- Focused Progress + secondary-return Playwright matrix: 4/4 passed across mobile and desktop.
- Strong source-unit Playwright matrix: 6/6 passed across mobile and desktop.
- Critical template → readiness → active workout/timer → cancel/confirm submission → summary → all Progress views → reload → lb/kg round-trip: passed on mobile and desktop without console/page errors.
- Complete Playwright audit: 226 passed, 18 intentional cross-project skips, 0 failed across 244 mobile/desktop cases.
- Focused reconciliation after the first complete audit: dirty-history Back, large-text reflow, safety revalidation, and design-source contract 7 passed / 1 intentional skip; protected Lift baselines 5/5 passed outside update mode.
- PWA/native packaging: 32/32 public assets passed. Static lint, workflow validation, production dependency audit (zero vulnerabilities), and tracked-content privacy scan (469 files) passed.
- Hosted deployment verification: commit `44f925a` runtime markers were present on Vercel; 17 changed-flow browser cases passed with 1 intentional cross-project skip across mobile/desktop, including the critical lifecycle, safety substitute, Strong import/history, planner entry, Progress history, secondary-page return, and 320 px/200% reflow.
- 2026-07-22 continuation: the expanded Playwright inventory passed 234/252 with 18 intentional cross-project skips and zero failures. Those skips are 14 protected visual/interactivity cases owned by deterministic desktop viewports, one desktop-owned 320 px/200% text matrix, one desktop-owned IndexedDB semantics case, one desktop-owned import-boundary case, and one mobile-owned restricted-equipment interaction.
- Continuation public/runtime gates: 50/50 selected public harnesses passed from 51 discovered; the one private-only harness remained excluded by contract. Application integration passed 38/38, static lint passed, research validation passed, and PWA/native packaging passed for all 32 public assets with cache generation `comprehensive-fitness-pwa-v57`.
