# Documentation inventory

## Metadata

- **Purpose:** Authority and retention map for repository documentation
- **Last verified:** 2026-08-01
- **Status:** **RECONCILED FOR LOCALLY VERIFIED M8; INDEPENDENT/EXTERNAL ACCEPTANCE OPEN**

## Authority order

1. `AGENTS.md` — repository working agreement.
2. `docs/redesign/final/` — final redesign product, feature, recommendation, migration, and acceptance authority.
3. `docs/redesign/DECISION_LOG.md` — implementation-era successor decisions and factual clarifications.
4. Current living documents in `docs/` — verified implemented state.
5. Code/tests — evidence of current behavior, not authority to change settled product scope.
6. Phase 1, adversarial audits, design concepts, migration proposals, work logs, and historical benchmarks — evidence only.

When these disagree, do not silently revive the older behavior. Record a concrete contradiction or data/security risk in the decision log.

## Living documents

| Document | Current role |
| --- | --- |
| `docs/PROJECT.md` | Current product scope and product/data boundaries. |
| `docs/ARCHITECTURE.md` | Current runtime, persistence, packaging, API, privacy, and compatibility architecture. |
| `docs/DECISION_ENGINE.md` | Current stable-target, exception, grade, and historical-decision boundary. |
| `docs/UI_UX.md` | Current two-destination screen and interaction contract. |
| `docs/ROADMAP.md` | Current milestone status, next gates, risks, and exclusions. |
| `docs/redesign/STATUS.md` | Redesign-specific implementation and acceptance status. |
| `docs/redesign/implementation/IMPLEMENTATION_EXECPLAN.md` | Sequential milestone execution plan and temporary-structure ledger. |
| `docs/redesign/implementation/MILESTONE_LOG.md` | Detailed milestone evidence and recoverable checkpoints. |

## Focused operational documents

| Document | Current role |
| --- | --- |
| `docs/push-backend.md` | Notification backend, bounded deletion, legacy remote cleanup, and external verification. It does not authorize workout upload. |
| `docs/iphone-pwa-personal-coach-setup.md` | PWA install, local backup, notification, and device acceptance runbook. |
| `docs/DAILY_BROWSER_QA.md` | Local browser verification procedure; hosted checks apply only when separately authorized/in scope. |
| `docs/performance.md` | Historical benchmark record plus current unmeasured final-flow gap. |
| `docs/training-prescription-data.md` | Offline research/personal-pipeline and immutable compatibility boundary; not a current live prescription map. |
| `docs/WORK_LOG_TEMPLATE.md`, `docs/work-logs/` | Operational evidence format. Dated records do not override current authority. |
| `store/app-store-notes.md` | Release/store checklist; no current publication authorization. |

## Research and private-data documents

- `research_database/README.md`, `METHODOLOGY.md`, `EXECUTIVE_SUMMARY.md`, `BIBLIOGRAPHY.md`, `SCHEMA_VALIDATION.md`, and `EXERCISE_MUSCLE_TAXONOMY.md` remain offline research/provenance authority. They are not proof of current app behavior.
- `personal_fitness_data/README.md` governs the private offline pipeline.
- Generated reports under `personal_fitness_data/` remain private artifacts and must not be copied into public documentation, tests, screenshots, Git, or deployment.

## Historical redesign evidence

- `docs/redesign/phase-1/`, `docs/redesign/audits/`, and retained prompts/governance records remain proposal, review, and adjudication evidence.
- `docs/design/COMPLETE_REDESIGN_CONCEPTS.md` and `docs/design/REDESIGN_MIGRATION_BLUEPRINT.md` are historical. The concept-only React/Vite application was removed in M8; these files do not authorize a second runtime or deleted product surface.
- Historical raster, palette, Dashboard, Plan, More, analytical Progress, planner, evidence, confidence, and theme-package descriptions are not current UI intent.

## Reconciliation rules

- Update this inventory when documentation is created, renamed, removed, archived, or changes authority.
- Current-intent documents must not describe cloud workout copy, themes/color packages, planner/mesocycle, analytics, research/evidence, confidence, or numeric exception detectors as live product behavior.
- Historical records may retain old facts only when clearly labelled as historical and not used as current instructions.
- Operational external-service claims require a date and fresh verification.
- Documentation-only cleanup does not prove application, package, device, hosted, or publication acceptance.
