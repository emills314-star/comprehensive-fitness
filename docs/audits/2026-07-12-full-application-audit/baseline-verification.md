# Baseline verification record

## Source state

- Branch: `main`
- Revision: `5edcd4b`
- Initial worktree state: clean
- Application-behavior changes before this record: none
- Audit-only additions: project Codex configuration, agent profiles, thread manifest, and fixed rubrics

## Commands and results

| Command | Result | Evidence summary |
| --- | --- | --- |
| `codex --version` | PASS | `codex-cli 0.142.5` |
| `codex features list` | PASS | Multi-agent, Browser Use, in-app browser, goals, hooks, and plugins reported stable. |
| `npm.cmd test` | PASS | 151.8 s; all 14 script groups passed, including 40/40 prescription-engine cases, 23 muscle-pool integration, schema contracts, persistence/migration/domain checks, performance architecture, and 59 private-pipeline checks. |
| `npm.cmd run audit:ui` | PASS | 173.7 s; 19 passed, 1 intentional skip across mobile/desktop Chromium, five primary destinations, snapshots, axe A/AA, layout, console, source-style, large-history, and planner checks. |
| `npm.cmd run verify:pwa` | PASS | Root/package PWA verification passed. |
| `npm.cmd run research:validate` | PASS WITH EXPECTED WARNINGS | Research database 2.0.0 valid; 0 errors, 31 intentional null-male-count warnings; 61 exercises, 23 muscle recommendations, and 149 exercise-muscle relationships. |
| `npm.cmd run personal:validate` | PASS WITH PRESERVED-SOURCE WARNING | 59 checks, 0 errors, 1 invalid source set preserved and excluded from progression. No personal values are reproduced in public audit docs. |
| `npm.cmd audit --json` | PASS | 0 known vulnerabilities across 212 installed dependencies at check time. |
| `node scripts/test-recommendation-regressions.js` in isolated red-phase worktree | EXPECTED FAIL | Independently reproduced 0/12 accepted safety, progression, assisted-resistance, stale-history, override, identity, and equipment-substitution regressions using public research JSON and synthetic history only. The failing baseline is preserved in local commit `4d3fb5b`. |
| Live Chrome DOM audit at `http://127.0.0.1:8765/` | PARTIAL PASS | Live Lift, Dashboard, Templates, planner Guide/Setup, Available Equipment, and Muscle Scope loaded; semantic states and 375 px overflow were checked; no console warning/error appeared. Chrome screenshot capture timed out and the debugger later detached, so repository-owned snapshots remain the pixel-diff evidence. |

## Important limitation

Passing baseline tests characterize existing assertions; they do not prove complete correctness. Audit threads found executable paths not covered by those tests, including safety, taxonomy, personalization, reachability, import-security, sync-consent, retention/deletion, and native-packaging gaps. Each accepted defect must receive an independent failing reproduction before implementation.
