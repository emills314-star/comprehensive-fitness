# Design-system sweep remediation

## Change

- **Summary:** Implemented the read-only sweep findings from the completed nine-phase migration without accepting appearance baselines. The remediation restores one-fact/one-place ownership, reconciles factual copy with implemented behavior, completes the rendered-class audit, enforces the system type/color rules, removes retired chrome, and protects the result with source and browser contracts.
- **User flow affected:** Today home and active workout; template start/readiness/conflict/cancel; completed summary; Dashboard; guided mesocycle; Lift analysis; History; Settings/privacy/data controls; offline/update presentation.

### Findings fixed

- Removed repeated session/current-focus/progress/date/count/grade/default-rest/target facts. The active hero, session dock, roll-up, row, and evidence surfaces now have explicit non-overlapping ownership.
- Replaced unsupported or misleading retention, update, active-draft destruction, cloud-copy, and storage-persistence implications with copy tied to the implementation. Active-draft destruction names exercises, sets, notes, readiness, and timer state; History describes the six-month analysis window without denying the full archive and fallback-coaching consumers.
- Completed the rendered-output review of the 43 statically unmatched class tokens. They are state, testing, structural, or companion-selector hooks. `.text-action` was the only ambiguous visual emitter and now has an explicit rule. No speculative rules were added.
- Enforced claim/fact/judgment separation. Factual storage state, readiness differences, set type, saved grades, and logged values use plain ink. Confidence uses one four-level meter/treatment. Filled level-four claims use the contrast-safe action token across all packages/themes.
- Reconciled delta semantics: below target is `.under`; ceiling exceedance is `.out`; `.over` is retained only for desirable exceedance; neutral differences are `.none`. Guided muscle deltas derive from the same `overallStatus` as their pills.
- Removed orphan Workout Board, status-strip, session-board, and support-drawer CSS. Component declarations consume tokens rather than raw hex.
- Converted every literal production type declaration below 12 px to the type system. `--fs-data` remains reserved for the two dense active-set-grid selectors.
- Reconciled browser tests with the migrated disclosures, history rows, Settings unit radios, session overflow, selected-lift heading, and single Previous fact.

## Evidence

- **Application files changed:** `index.html`, `app-views.js`, `app-analysis.js`, `app-history.js`, plus byte-identical `www/` mirrors.
- **Contracts changed/added:** `scripts/test-design-system-integrity.js`, `scripts/test-evidence-claim-ui.js`, `scripts/test-workout-safety.js`, `scripts/test-rep-alert-cancel.js`, `scripts/test-set-prescriptions.js`, `scripts/test-phase3-core-ui.js`; changed Playwright specs under `tests/ui/`.
- **Documentation updated:** `docs/UI_UX.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/ROADMAP.md`, and this work log. `docs/PROJECT.md` was reviewed; no scope/capability/data-handling change required an update.
- **Local source validation:** the complete public gate passes 53/53 selected scripts (54 discovered; one private-only harness intentionally excluded). This includes design-system integrity, prescription claim/evidence, workout safety, rep/role/alert/cancel, set prescription, Phase 3 presentation, research/archive determinism, security, packaging, and privacy contracts.
- **Local browser validation:** all 12 changed-path cases pass in mobile Chromium and all 12 pass in desktop Chromium: accessibility/default editors; Progress browser history; Strong-history fallback; compact logged-fact hierarchy; cancellation; critical submit → Progress → reload → lb/kg round trip; design-system source audit; and the four-level confidence contrast matrix.
- **Additional local validation:** static lint passes (192 JavaScript and 3,118 JSON files), PWA/native public-only packaging passes for 40 assets, and the public privacy guard passes all 539 tracked Git/archive files.
- **Branch and commit:** publication commit is reported in the coordinator/final task handoff.
- **Deployment inspected:** No.
- **Hosted URL/deployment identifier:** Not verified.
- **Browser viewport/device sizes:** Focused Playwright validation used the repository mobile Chromium project. The confidence contract iterated all ten colour packages and both themes. Existing exact 320 px/200% checks remain in the regression suite; the complete 320/390/768/1280 state matrix is not implemented.
- **Screenshots or visual evidence:** Failure screenshots were diagnostic only. No screenshot baseline was created, changed, or accepted.
- **Broad UI-suite result:** the complete one-worker `audit:ui` command reached the 15-minute shell bound without emitting a terminal Playwright result. It is recorded as incomplete, not as a pass or product failure; the changed-path mobile/desktop evidence above completed separately.

### Architectural safety

- No schema, persistence, recommendation engine, readiness calculation, progression rule, workout mutation, import/export, sync payload, or research record changed.
- The new non-visual source contract independently rejects duplicated semantic ownership patterns, misleading-copy regressions, delta-grammar drift, sub-floor type, `--fs-data` misuse, raw component hex, and retired selectors.
- Canonical root app files and their four `www/` mirrors are hash-identical. The full sync command was deliberately avoided so unrelated in-progress icon/asset work remained untouched.
- Appearance comparison is explicitly separate: ordinary `ui-audit` screenshots compare only when `CF_APPEARANCE_PROTECTION=1`.

### Regression-tested safety

- The critical workout lifecycle still creates, logs, submits, persists, reloads, navigates through Progress, and round-trips lb/kg through the real Settings radio controls on mobile and desktop.
- Active-workout cancellation still keeps the draft on safe dismissal and removes only that draft after destructive confirmation.
- Exact-history fallback still permits working-set add/remove and persists through reload without inventing research identity.
- Recommendation tests require role evidence to retain Last performed, Next increment, and the progression gate while rejecting repeated targets/confidence.
- Confidence text passes WCAG contrast for all four levels across ten packages and both themes.

## Coverage-gap inventory

Lift/active-workout and Dashboard have the reference invariant composition. Other surfaces have partial tests, but no equivalent combined contrast + target-size + overflow suite across all requested states and widths. This is a separate test-authoring task; do not solve it by accepting screenshots.

| Surface | Existing partial coverage | Missing equivalent coverage |
| --- | --- | --- |
| Today home / first run / empty quick starts | Primary-view 320 px reflow and ordinary audit | Ten-package/two-theme contrast; complete target-size checks; 390/768/1280 and state variants |
| Template start Confirm | Package/theme contrast and focus | Target size and overflow at all requested widths/200% |
| Readiness entry | Package/theme contrast; 320 px/200% targets and overflow | 390/768/1280 equivalents and loading/failure variants |
| Readiness Review | Functional assertions | Package/theme contrast, targets, and overflow matrix |
| Active-session conflict | Functional/destructive assertions | Package/theme contrast, targets, and overflow matrix |
| Cancel-workout sheet | Focus trap/restoration and destructive lifecycle | Package/theme contrast, target-size, and overflow matrix |
| Completed-workout summary and achievement disclosures | Lifecycle and selected contrast checks | Full package/theme contrast, targets, overflow, empty/partial/conflicting-result states |
| Plan template list, empty list, template editor, delete confirmation | Functional lifecycle and primary-view reflow | Full package/theme contrast and target-size matrix; state-specific overflow |
| Guided Setup / Build / candidate workspace | Package/theme contrast and 320 px/200% target/reflow checks | 390/768/1280 and empty/failure/conflict variants |
| Guided viability Check | Package/theme contrast | Equivalent target-size/overflow matrix |
| Guided Create/result/comparison | Functional assertions | Package/theme contrast, targets, overflow, no-previous-plan/conflicting-plan states |
| Lift analysis | Package/theme contrast and 320 px/200% target/reflow checks | 390/768/1280 and loading/empty/failure/update variants |
| Chart-point detail | Keyboard/focus and data grouping | Dedicated package/theme contrast, targets, and overflow matrix |
| History session list / per-exercise history | Package/theme contrast and 320 px/200% target/reflow checks | 390/768/1280 and empty/conflicting-data variants |
| History session detail and edit/save/cancel/conflict flows | Lifecycle, persistence, browser Back/reload guards | Dedicated package/theme contrast, targets, overflow, failure/conflict matrix |
| Settings groups | Package/theme contrast and 320 px/200% target/reflow checks | 390/768/1280 and per-group empty/loading/failure states |
| Clear-local-data sheet | Package/theme contrast, focus/destructive behavior | Equivalent target-size/overflow matrix and remote-cleanup failure/offline variants |
| Privacy and Support secondary pages | Route-return behavior | Package/theme contrast, targets, and overflow matrix |
| Offline banner, update banner, loading skeleton, destination error | Selected copy/behavior contracts | Full package/theme contrast, targets, and 320/390/768/1280 overflow at 200% |
| PWA install prompt and notification permission/error states | Selected functional tests | Full combined invariant matrix |

## Owner-judgment differences that do not violate a system rule

- Native disclosure summaries now use a plain plus/minus cue rather than the mockup’s decorative chevron.
- Logged History names and grades use plain ink instead of the mockup’s colour-coded hierarchy because they are saved facts.
- Exact set targets appear in the editable/generated row rather than being repeated in the recommendation evidence.
- Some density, wrapping, and copy lengths differ from individual m1–m9 mockups while preserving the merged system roles and all implemented capabilities.

## Unverifiable

- Hosted/deployed behavior: no deployment was requested or inspected in this local remediation pass.
- Physical iPhone/PWA, native WebView, screen reader, notification delivery, and OS-level 200% text: require real devices/platform services.
- Production Vercel/Upstash/QStash state and retention: repository code documents the intended contract but cannot prove current external state.
- Complete state × ten-package × theme × 320/390/768/1280 × 200% matrix: no mechanical harness exists yet; listed above as the separate coverage task.
- Complete repository Playwright suite: the bounded all-suite run did not produce a final result before the 15-minute shell cap; use the green changed-path mobile/desktop suites as scoped regression evidence, not as a claim that every browser case passed.
- Replacement appearance: owner review and one-time baseline acceptance have not occurred.

## Final status

**Implemented locally.** Source and focused regression evidence pass; baselines remain unaccepted, hosted verification has not occurred, and the comprehensive invariant matrix remains a separate test-authoring task.
