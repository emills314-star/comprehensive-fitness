# Fixed scoring rubrics

## Status and freeze point

- **Established:** 2026-07-12, before application-behavior implementation began.
- **Baseline source revision:** `main` @ `5edcd4b`.
- **Freeze rule:** Categories, weights, and anchors below may not be redefined after baseline scoring. Later scores use the same evidence gates.
- **Scoring method:** Ten equally weighted categories, each assigned an integer from 1 to 5. No rounding, compensating one category with another, or removing difficult features.
- **Evidence rule:** A point is awarded only when repository/runtime evidence supports it. Documentation claims alone are insufficient. Unknown or externally blocked behavior cannot earn a 5.
- **Five-point gate:** A 5 requires consistently production-quality implementation, representative and adversarial tests, measured runtime evidence where applicable, accurate documentation, and no known material weakness in the category.
- **Four-point gate:** A 4 requires strong, dependable behavior with only minor non-blocking gaps and no unresolved safety-, privacy-, or data-integrity defect.

## Codebase rubric (maximum 50)

| # | Category | 5 | 4 | 3 | 2 | 1 |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Architecture and modularity | Clear ownership and dependency direction; cross-cutting behavior is modular, bounded, and parity-tested. | Strong boundaries with minor concentrated debt. | Functional but meaningfully coupled or difficult to change safely. | Significant structural risk or widespread hidden coupling. | Missing or fundamentally unreliable architecture. |
| 2 | Code quality and consistency | Consistent domain contracts, validation, naming, error semantics, and maintainable implementation across every feature. | Strong and consistent with minor non-behavioral gaps. | Functional with meaningful duplication, drift, or implicit contracts. | Significant correctness/maintenance risk. | Fundamentally inconsistent or unreliable. |
| 3 | Database design and data integrity | Versioned schemas, validated migrations, reversible recovery, canonical mappings, and historical/user-data preservation are comprehensively tested. | Strong integrity with only minor non-lossy gaps. | Functional persistence with meaningful migration, mapping, or validation weaknesses. | Significant corruption, orphan, or data-loss risk. | Missing or unsafe data model. |
| 4 | Functional correctness and error handling | Every actual feature, failure mode, recovery path, and boundary behaves correctly with deterministic evidence. | Strong correctness with minor non-critical gaps. | Main paths work but edge/failure behavior is meaningfully weak. | Frequent or high-impact defects. | Missing or fundamentally unreliable behavior. |
| 5 | Testing and reliability | Clean-checkout unit/integration/browser/property/regression coverage exercises every actual feature and critical invariant in CI. | Broad dependable coverage with small non-critical gaps. | Useful tests exist but major features, failure modes, or CI paths are missing. | Sparse, misleading, or flaky coverage. | No meaningful automated reliability evidence. |
| 6 | Performance and efficiency | Startup, navigation, rendering, data/recommendation latency, large datasets, assets, and repeated work are measured and within documented budgets. | Strong measured performance with minor gaps. | Functional but with meaningful unmeasured or demonstrated inefficiency. | Significant latency/resource risk. | Unusable or unmeasured critical performance. |
| 7 | Usability and visual consistency | One coherent, reusable design system covers every screen/state while protected surfaces remain stable and task-appropriate. | Strong consistency with minor polish gaps. | Usable but materially inconsistent or duplicated. | Significant UX friction or visual drift. | Fundamentally unusable or incoherent. |
| 8 | Accessibility and responsive behavior | Automated and manual keyboard, focus, semantics, announcements, contrast, zoom/text, motion, touch, chart, and viewport coverage passes across all features. | Strong A/AA and responsive behavior with minor device-level gaps. | Foundations exist but meaningful workflows/states remain unverified. | Significant access barriers. | Inaccessible or non-responsive. |
| 9 | Documentation and developer experience | Clean setup, architecture, data, recommendation, UI, testing, migration, recovery, and release documentation exactly match verified behavior. | Strong and current with minor low-risk gaps. | Useful but materially stale, incomplete, or non-reproducible. | Significant setup/operation ambiguity. | Missing or misleading documentation. |
| 10 | Security, observability, and release readiness | Threat-relevant controls, privacy boundaries, dependency risk, safe logging, operational diagnostics, CI/release gates, and rollback are comprehensively verified. | Strong with minor non-exploitable gaps. | Basic controls exist but meaningful security, visibility, or release gaps remain. | Significant exploitable/privacy/release risk. | Unsafe or not releasable. |

### Codebase acceptance gate

- Final score at least 45/50.
- No category below 4.
- No unresolved safety-critical, privacy-critical, data-loss, or hard-constraint defect.

## Workout-recommendation rubric (maximum 50)

| # | Category | 5 | 4 | 3 | 2 | 1 |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Scientific evidence quality and fidelity | Every material rule is traceable to current graded evidence or explicitly labeled product judgment; uncertainty and population limits are faithful. | Strong evidence fidelity with minor low-impact gaps. | Useful evidence base with meaningful unsupported/overprecise rules. | Substantial scientific misapplication. | Missing or misleading evidence basis. |
| 2 | Goal alignment and program coherence | Complete sessions/mesocycles coherently reflect goal, schedule, dose, sequencing, balance, recovery, and practicality. | Strong coherence with minor non-critical limits. | Functional exercise lists but meaningful goal/program gaps. | Substantial programming incoherence. | Missing or fundamentally inappropriate output. |
| 3 | Correct use of personal and historical data | Every available relevant field has appropriate, current, explainable influence; missing/stale/conflicting data fails conservatively and no personalization is fabricated. | Strong use with minor transparent omissions. | Some useful personalization but meaningful ignored/misused fields. | Substantial false or unsafe personalization. | No reliable personal-data use. |
| 4 | Individualization and constraint satisfaction | Equipment, time, schedule, preferences, exclusions, scope, substitutions, experience, and overrides are deterministically respected with hard precedence. | Strong constraint handling with minor soft-preference limitations. | Main constraints work but meaningful conflicts/leaks remain. | Known hard-constraint violations. | Constraints are fundamentally unreliable. |
| 5 | Progression and autoregulation | Comparable performance, effort, technique, staleness, plateaus, missed sessions, regression, and return-to-training behavior produce conservative exact actions. | Strong progression with minor non-safety limitations. | Functional but meaningfully coarse or inconsistent. | Substantial overload/regression risk. | Missing or unsafe progression. |
| 6 | Volume, intensity, frequency, and exercise-dose management | Dose variables are evidence-aligned, taxonomy-correct, coherent across the full program, and bounded by validated practical limits. | Strong dose management with minor gaps. | Functional but meaningfully incomplete or falsely precise. | Substantial over/under-dose risk. | Missing or unreliable dose logic. |
| 7 | Fatigue, recovery, and safety handling | Illness, pain, technique, readiness, fatigue, deload scope, and hard safety restrictions are deterministic, conservative, and cannot be bypassed. | Strong safety with only minor non-critical limitations. | Useful safeguards with meaningful gaps. | Known safety bypass or inappropriate advice. | Unsafe or diagnostic/prescriptive beyond scope. |
| 8 | Exercise selection, substitution, and taxonomy integration | Canonical identity, anatomy, movement, equipment, primary/fractional/fatigue roles, aliases, custom exercises, and substitutions are consistent end to end. | Strong integration with minor ambiguous cases. | Functional catalog with meaningful mapping or substitution gaps. | Substantial invalid selection/taxonomy risk. | Missing or unreliable selection model. |
| 9 | Explainability, transparency, and user control | Users see material inputs, evidence/default distinction, constraints, changes, missing data, consequences, and safe editable alternatives without bypassing hard rules. | Strong explanation/control with minor gaps. | Basic rationale/controls but meaningful opacity. | Misleading or weakly controllable. | Opaque, fabricated, or coercive. |
| 10 | Robustness, testing, monitoring, and maintainability | Repeatable unit/integration/golden/property/invariant/counterfactual/adversarial/determinism tests cover the entire pipeline and versioned outputs. | Strong coverage with minor low-risk gaps. | Useful tests but important invariants/scenarios are missing. | Sparse or misleading verification. | No reliable evaluation system. |

### Recommendation acceptance gate

- Final score 48, 49, or 50/50.
- No category below 4 and no more than two points total below maximum.
- No unresolved safety-critical defect, hard-constraint violation, unsupported high-impact rule presented as settled science, or known fabricated personalization.
- First independent scoring pass is completed without disclosing the desired target score in its assignment.

## Baseline and final score records

The numerical baseline was fixed after the required read-only baseline waves completed and before any application-behavior implementation. Final and independent scores are appended without altering this rubric.

### Codebase baseline Ã¢â‚¬â€ 25/50

| # | Category | Score | Baseline evidence |
| ---: | --- | ---: | --- |
| 1 | Architecture and modularity | 2 | A 919 KB inline frontend owns rendering, persistence, imports, migrations, analytics, and integrations; dead compatibility paths and root/`www` duplication make change isolation unsafe. |
| 2 | Code quality and consistency | 3 | The code is functional and has useful helpers, but identity normalization, runtime contracts, CSS primitives, error semantics, and source/packaged parity are materially inconsistent. |
| 3 | Database design and data integrity | 2 | Canonical taxonomy lookups almost never hit, guided family aggregation miscounts, exact muscle queries overbroaden, migration/import validation is shallow, and sync writes are non-atomic. |
| 4 | Functional correctness and error handling | 2 | Illness/pain, progression, override, plan-authority, substitution, import, sync-consent, reachability, and recovery paths include high-impact reproducible defects. |
| 5 | Testing and reliability | 2 | Existing suites are broad but clean public checkout fails, regex tests certify unreachable code, rich feature states are unprotected, and accepted defects passed the original suite. |
| 6 | Performance and efficiency | 3 | Warm caches are effective, but cold Lift/Dashboard take roughly 718/581 ms on the large fixture, Charts stays near 146 ms warm, evidence fetches duplicate, and normalization contains a quadratic scan. |
| 7 | Usability and visual consistency | 4 | Lift, Dashboard, Equipment, and Scope form a coherent strong baseline with no protected-screen regression; state/status primitives, style duplication, and touch targets remain bounded gaps. |
| 8 | Accessibility and responsive behavior | 3 | Default-state axe/layout checks pass, but quick-template semantics, SPA/dialog focus, Lift control naming, skip navigation, group labeling, zoom/dark coverage, and critical target sizes are material gaps. |
| 9 | Documentation and developer experience | 2 | Core docs are substantial but claim several unimplemented guarantees, clean setup/tests are not reproducible from public files, release/build guidance conflicts, and version/count claims are stale. |
| 10 | Security, observability, and release readiness | 2 | Stored DOM-XSS, implicit persistent workout sync, no server deletion/retention lifecycle, resource-exhaustion exposure, private native packaging, broad caching, and weak release gates are unresolved. |
|  | **Total** | **25/50** | Below acceptance; categories 1, 3Ã¢â‚¬â€œ5, 9, and 10 require structural remediation. |

### Workout-recommendation baseline Ã¢â‚¬â€ 22/50

| # | Category | Score | Baseline evidence |
| ---: | --- | ---: | --- |
| 1 | Scientific evidence quality and fidelity | 3 | The versioned evidence base supports broad principles, but current 2022Ã¢â‚¬â€œ2026 evidence is missing and practical caps/readiness/deload thresholds are sometimes presented too strongly. |
| 2 | Goal alignment and program coherence | 2 | Planned sets can be discarded at workout start, specialization lacks a reachable target selector, automatic compatibility planning restricts cross-day repetition, and family rollups distort program dose. |
| 3 | Correct use of personal and historical data | 2 | Pain/illness and several profile fields are ignored or misrouted, stale/reduced exposures are mishandled, fabricated context copy exists, and some loaded evidence is unused. |
| 4 | Individualization and constraint satisfaction | 2 | Equipment-incompatible substitutes leak, hard constraints are not propagated to exercise prescriptions, and overrides can bypass safeguards or accept invalid exercises/bounds. |
| 5 | Progression and autoregulation | 2 | Pain, invalid/missing technique, missing/high RPE, incomplete work, planned reductions, stale returns, and assisted-bodyweight direction produce unsafe or incorrect progression. |
| 6 | Volume, intensity, frequency, and exercise-dose management | 2 | Same-family rows double count, traps/calves fail family projection, exact muscle queries overbroaden, and obliques have no positive eligible dynamic exercise. |
| 7 | Fatigue, recovery, and safety handling | 2 | Illness/pain can leave hard targets intact, hard deload/rotation states are overrideable, correlated readiness domains are separated, and pain can flow into lower-load testing. |
| 8 | Exercise selection, substitution, and taxonomy integration | 2 | App identity normalization misses canonical aliases, historical analytics fall back to name regexes, restricted replacements leak, and user-created exercises lack a robust canonical path. |
| 9 | Explainability, transparency, and user control | 3 | Snapshots and disclosures are rich, but some explanations fabricate causes, evidence versus policy is blurred, missing data is not transparent enough, and sync/control consequences are incomplete. |
| 10 | Robustness, testing, monitoring, and maintainability | 2 | The original suite missed twelve accepted red-phase regressions plus taxonomy and full-program counterfactuals; recommendation outcome monitoring and acceptance/rejection learning are absent. |
|  | **Total** | **22/50** | Below acceptance; every category requires evidence-backed improvement and independent rescoring. |
