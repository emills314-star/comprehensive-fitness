# Repository agent guide

> **Purpose:** Working agreement for coding agents  
> **Last verified:** 2026-07-11 · `main` @ `7c52a2b`  
> **Status:** VERIFIED against repository structure and test scripts  
> **Related:** [`docs/PROJECT.md`](docs/PROJECT.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DECISION_ENGINE.md`](docs/DECISION_ENGINE.md), [`docs/UI_UX.md`](docs/UI_UX.md), [`docs/ROADMAP.md`](docs/ROADMAP.md)

Before changing code, read the relevant documents in `docs/` and inspect the affected implementation. Code proves current behavior; it does not automatically prove intended behavior.

## Mandatory documentation loop

Every application change must include its associated documentation change in the same task and working tree:

1. **Before implementation:** identify and read the documents governing the affected behavior.
2. **During implementation:** keep code, tests, and documented intent separate when they disagree; do not silently choose one.
3. **After implementation:** return to the governing documents and update them to match the verified result.
4. **Before completion:** inspect the final diff and confirm that every changed application area has a corresponding documentation review or update.

Do not postpone documentation to a later task. If a relevant document needs no text change, explicitly report that it was reviewed and why it remains accurate. A code-only application change is incomplete.

## Required workflow

1. Read the relevant product and technical docs.
2. Inspect the affected code, schemas, configuration, and tests.
3. Implement the requested change.
4. Add or update tests.
5. Run appropriate tests, type checks, linting, builds, or PWA/native synchronization checks.
6. Update only the relevant documentation.
7. Update `docs/ROADMAP.md` when work is completed, added, removed, or reprioritized.
8. Cross-check implementation and documentation before finishing.
9. Report remaining mismatches as **NEEDS REVIEW**, with concrete file references.

## Approval preference

The repository owner prefers agents to proceed autonomously and complete all safe, in-scope work without pausing for optional confirmation. When the execution environment requires approval, request it promptly and explain the concrete action. Where the interface supports persistent approvals, offer a reusable, reasonably scoped rule for the relevant command or workflow.

This preference does not grant permissions, disable sandboxing, or override platform safety controls. Do not claim that `AGENTS.md` enables global “approve everything,” and do not request blanket or unnecessarily broad command access. Actual approval mode must be configured by the repository owner in the Codex application or local session settings.

## Publishing policy

The repository owner granted standing, repository-scoped authorization on 2026-07-18 for coding agents to commit completed in-scope source changes, push them to this repository, and open or update the associated GitHub pull request without requesting optional confirmation again. This authorization remains in effect until the owner revokes it. It does not authorize publishing personal fitness or health data, secrets, credentials, unrelated changes, or content outside this repository, and it does not override sandbox, GitHub, branch-protection, or approval controls.

After an in-scope change is implemented, tested, documented, and cross-checked, commit the completed change and push it to the repository's GitHub `main` branch unless the owner explicitly requests a different branch, a local-only result, or no publication. Do not describe work as complete before the push succeeds. Report the pushed commit identifier in the final response.

Publishing source changes must never publish personal fitness or health data. Before staging, inspect the complete Git status and exclude all raw, normalized, derived, report, packaged, backup, or locally imported personal-data artifacts, including content under `personal_fitness_data/raw/`, `personal_fitness_data/normalized/`, `personal_fitness_data/derived/`, `personal_fitness_data/reports/`, `private-personal-data/`, and `www/private-personal-data/`. Also exclude credentials, tokens, environment files, deployment secrets, app-data exports, local databases, and generated audit artifacts that may contain user data.

Public pipeline code, schemas, empty templates, methodology, aggregate contracts, and non-personal configuration may be published only when they contain no actual personal records or secrets. `.gitignore` and `.vercelignore` are safeguards, not substitutes for reviewing the staged diff. Run `git status`, inspect the staged file list, and verify that no private data is included before every commit and push.

Never silently resolve a code-versus-documentation conflict. Preserve these labels and distinctions:

- **IMPLEMENTED:** verified current behavior.
- **PARTIALLY IMPLEMENTED:** a usable subset exists.
- **PLANNED:** intended behavior without a complete implementation.
- **ASSUMPTION:** an inference that has not been confirmed.
- **NEEDS REVIEW:** conflicting or insufficient evidence requiring a human decision.

Do not place secrets, credentials, tokens, private source exports, or raw personal health data in documentation. Private generated reports under `personal_fitness_data/` may be inspected locally, but public docs should describe contracts and aggregate behavior only.

## Documentation routing

- Product scope or major capability: `docs/PROJECT.md`
- Architecture, persistence, integration, or model change: `docs/ARCHITECTURE.md`
- Readiness, progression, fatigue, volume, scoring, or recommendation rule: `docs/DECISION_ENGINE.md`
- Screen, navigation, state, copy, or interaction: `docs/UI_UX.md`
- Status, priority, defect, debt, or open question: `docs/ROADMAP.md`
- Specialized operational details may remain in their focused documents; update the documentation inventory when their role changes.

## Definition of done

A task is not complete until the implementation has been tested, the relevant documentation has been reviewed and updated, the staged content has passed the privacy review, and the completed source changes have been pushed to GitHub under the publishing policy above.

The final report must name the documentation files updated, or name each reviewed document that required no change.
