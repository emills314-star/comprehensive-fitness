# Documentation inventory

## Metadata

- **Purpose:** Reconciliation record for Markdown that existed before the living-documentation structure
- **Last verified:** 2026-07-11
- **Repository:** `main` @ `7c52a2b`
- **Verification status:** COMPLETE inventory; private generated content is identified but not reproduced
- **Related:** [Project](PROJECT.md), [architecture](ARCHITECTURE.md), [decision engine](DECISION_ENGINE.md), [UI/UX](UI_UX.md), [roadmap](ROADMAP.md)

## Living-document rule

Update this inventory whenever a Markdown document is created, renamed, merged, archived, superseded, generated, or changes authority. Documentation reorganization is incomplete until this table explains where unique knowledge moved and which document is now authoritative.

No existing Markdown was deleted. The new core documents are authoritative for cross-cutting product/current-state questions; focused documents remain authoritative within their narrower scope.

| Existing document | Decision | Rationale / moved knowledge |
| --- | --- | --- |
| `README.md` | **UPDATE** | Keep as contributor/user entry point; link the new core docs and avoid duplicating their detail. |
| `docs/training-prescription-data.md` | **RETAIN, specialized** | Unique version/count/crosswalk/schema/runtime map. Core principles are summarized in Architecture/Decision Engine; detailed inventories stay here. Some generated counts/status require refresh after rebuild. |
| `docs/push-backend.md` | **RETAIN, specialized; NEEDS REVIEW** | Unique API/service/Redis/physical-test operations. “Live deployment” claims cannot be proven locally and must be dated/reverified. |
| `docs/performance.md` | **RETAIN as benchmark record** | Unique benchmark method/results. Architecture captures only current performance decisions; rerun benchmark before treating old numbers as current. |
| `docs/iphone-pwa-personal-coach-setup.md` | **RETAIN, operational; NEEDS REVIEW** | Unique installation/private-import/device acceptance steps. External “complete” claims need human verification. |
| `personal_fitness_data/README.md` | **RETAIN, specialized/private boundary** | Canonical pipeline layout, calculations, extension process, and privacy guidance. Cross-cutting flow summarized without personal values. |
| `personal_fitness_data/reports/PERSONAL_HYPERTROPHY_AND_RECOVERY_REPORT.md` | **RETAIN as generated private artifact; do not merge** | Unique personal analysis, generated from excluded health data. Never copy raw/personal findings into public living docs. Regeneration owns this file. |
| `research_database/README.md` | **RETAIN, specialized** | Canonical research package scope/layout/import guidance. |
| `research_database/METHODOLOGY.md` | **RETAIN, authoritative methodology** | Unique evidence selection, grading, conflict, and translation rules; Decision Engine links rather than duplicates it. |
| `research_database/EXECUTIVE_SUMMARY.md` | **RETAIN, research summary** | Research findings are evidence, not automatically current app behavior. Decision Engine distinguishes implemented operational rules. |
| `research_database/BIBLIOGRAPHY.md` | **RETAIN, authoritative citations** | Unique source index; no duplication into product docs. |
| `research_database/SCHEMA_VALIDATION.md` | **RETAIN, specialized** | Unique validation/import semantics; Architecture summarizes commands and fail-closed behavior. |
| `store/app-store-notes.md` | **RETAIN as release checklist** | Unique store metadata/prerequisites; current release remains blocked. |

## Naming decisions

`PROJECT.md`, `ARCHITECTURE.md`, `DECISION_ENGINE.md`, `UI_UX.md`, and `ROADMAP.md` use the requested stable names. Existing narrowly named documents were not renamed because their operational/research purpose is distinct and links are already established. `DOCUMENTATION_INVENTORY.md` was added so future maintainers can see why overlapping files remain without bloating `AGENTS.md`.

## Reconciliation rules

- Core docs describe verified cross-cutting current state and link to specialized detail.
- Research summaries describe evidence, not proof that a UI rule exists.
- Generated personal reports describe one private analysis run, not general product behavior.
- Operational deployment statements require external verification and a date.
- When specialized and core documents disagree, record current code behavior plus the intended statement and add a `NEEDS REVIEW` roadmap entry.
