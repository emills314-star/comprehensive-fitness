# Post-merge Chromium UI repair

## Change

- Summary: Reconciled the three `chromium-ui` failures carried into `main` by merge commit `cf075d0`: chart-detail close hit testing, readiness-sheet contrast, and normal-scale 320 px active-set heading overflow. Advanced the public cache to v91, synchronized `www/`, and refreshed the ignored Android/iOS Capacitor web payloads.
- User flow affected: Progress to Lifts selected-point detail; Plan/Today template-start confirmation; active Today current-set entry at narrow width.

## Evidence

- Files changed: `index.html`, `sw.js`, synchronized `www/index.html` and `www/sw.js`.
- Documentation updated: `docs/UI_UX.md`, `docs/ROADMAP.md`, and this work log.
- Documentation reviewed without change: `docs/PROJECT.md` and `docs/ARCHITECTURE.md`. The product capability, persistence model, runtime ownership, and canonical `sync:web`/`cap:sync` packaging workflow remain accurate; these fixes change presentation geometry and contrast only.
- Local validation: public tests 53/53. Every one of the 16 UI spec files completed: 263 passed, 61 intentional/project skips, 0 failed (324 total). The directly affected full specs were analytics/settings lifecycle 26/26; protected surfaces 21 passed with 23 intentional project skips; accessibility design regressions 51 passed with 9 intentional project skips; and UI audit 19 passed with 27 owner-gated/project skips. The aggregate `npm run audit:ui` wrapper itself reached its imposed 30-minute process limit and is therefore not reported as a pass; complete coverage was recovered by running every spec file to completion. Static lint passed over 192 JavaScript and 3,118 JSON files; workflow validation passed for two workflows; privacy passed over 604 tracked files when run with normal Git child-process access; the full dependency audit passed with 0 high/critical and 3 reported development-only moderate findings; the production dependency audit reported no vulnerabilities; research validation was valid with 34 known null-sample warnings; and PWA/native public-only packaging verification passed for 40 assets.
- Branch and commit: local uncommitted candidate on `main` based on merge commit `cf075d0`; no commit, push, merge, baseline update, or deployment is authorized in this task.
- Deployment inspected: GitHub Actions run evidence for PR/main was inspected; the local candidate was not published or deployed.
- Hosted URL/deployment identifier: none for this candidate.
- Browser viewport/device sizes: Playwright mobile project plus controlled 320, 390, 640 zoom-equivalent, 768, and 1280 CSS px cases; readiness contrast traversed ten color packages by two themes.
- Exact hosted flow tested: none; hosted verification requires publication authority.
- Expected result: close the selected chart point with a real pointer action; retain AA readiness copy in every package/theme; show the current set target and 44 px completion action without horizontal overflow at 320 px.
- Actual result: all three unchanged focused assertions pass locally, and every complete affected spec passes.
- Console/runtime errors: none reported by the completed affected browser specs.
- Screenshots or visual evidence: existing baselines were neither changed nor accepted; ordinary screenshots remain owner-gated.
- Native payload: `npm run cap:sync` copied current `www/` bytes to both ignored native public roots. Android sync completed. iOS web/plugin sync completed on Windows; CocoaPods and Xcode cleanup were skipped because those macOS tools are unavailable.
- Verification caveat: the first sandboxed `check:privacy` invocation could not spawn `git` (`EPERM`) and consequently fell back to walking ignored local private-data and archived-worktree directories. This was an execution-environment artifact, not a repository finding. The unchanged gate passed over exactly 604 tracked files with normal child-process access. No private artifact was changed or included.
- Remaining issues: Linux GitHub Actions and hosted/device verification require a published candidate; iOS CocoaPods/Xcode build verification requires macOS.

## Final status

**Implemented locally.** The three known Chromium defects are fixed and their complete owning specs pass locally. Publication, Linux CI confirmation, hosted verification, baseline acceptance, and physical native-device checks remain unperformed.
