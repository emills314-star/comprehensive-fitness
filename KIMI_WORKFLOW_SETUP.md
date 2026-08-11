# Kimi K3 design workflow setup

## Status

**IMPLEMENTED LOCALLY — GLOBAL DESIGN SPECIFICATION COMPLETE**

Codex owns implementation, tests, browser verification, regression repair, and documentation. Kimi K3 is limited to design-system direction, screen critique, responsive composition, and final visual review.

## Preflight

- OS: Windows 10 Home 10.0.19045, x64; PowerShell 5.1.
- Source repository: `C:\Users\Erik Mills\Documents\Comprehensive Fitness`.
- Preserved source branch: `codex/zero-based-redesign`, ahead of its remote with user-owned untracked `.claude/`, `.vercel/`, and `redesign/` paths.
- Isolated worktree: `artifacts/worktrees/kimi-k3-redesign` on `codex/kimi-k3-redesign`.
- Application: dependency-light static JavaScript PWA; IndexedDB; hash navigation; Playwright; npm.
- Required app runtime: Node 22.23.1/npm 10.9.8. System runtime is Node 24.18.0/npm 11.16.0.
- Kilo CLI: 7.4.20. Kilo Code extension: 7.4.20 pre-release, previously installed with VS Code 1.130.0. The `code` launcher is not currently on `PATH`.
- Modal CLI: 1.5.3, installed in Codex's bundled Python 3.12 runtime. No repository dependency was added.

## Official Modal facts verified 2026-08-07

- Starter plan: $0 with $30/month free credits.
- Kimi K3 is offered as an OpenAI-compatible Shared Endpoint; a dedicated Auto Endpoint is not required.
- Shared Endpoint pricing: prompt $3.00/MTok; cached prompt $0.30/MTok; completion $15.00/MTok; reasoning $15.00/MTok.
- Public catalog identifier: `moonshotai/Kimi-K3`.
- Context: 1M tokens; text and native vision.
- Authenticated plan: Starter with $30.00 included compute credits per month.
- Workspace budget: hard stop at $29.00 per billing period; Modal states running apps stop at the budget, preserving at least $1 of the monthly grant.
- Shared endpoint: `kimi-k3`, live at `https://emills314-star--ep-kimi-k3-server.us-west.modal.direct`.
- OpenAI-compatible base URL: `https://emills314-star--ep-kimi-k3-server.us-west.modal.direct/v1`.
- Model ID: `moonshotai/Kimi-K3`; Kilo alias: `modal-kimi/kimi-k3`.
- Authentication: one Modal proxy bearer credential stored in the user-level `MODAL_KIMI_API_KEY` environment variable and referenced only from trusted global Kilo configuration. No secret is stored in this worktree.
- Smoke test: Kilo returned exactly `KIMI_K3_MODAL_OK` using the Shared endpoint.
- After the smoke test and one bounded global-design session, Modal reports $0.22 total usage, $0.22 credits applied, and $0.00 total spend. Approximately $29.78 of the monthly credit remains; the $29 hard stop still preserves at least $1.

Sources: Modal pricing, Modal's Kimi K3 announcement, Modal's Kimi K3 model-library entry, Modal CLI documentation, and Kilo custom-model documentation.

## Authenticated checks

All checks above passed. The owner reported that Modal required a payment method to unlock the monthly grant. A $29 hard workspace budget was therefore set before endpoint creation or inference. The endpoint is Shared/token-billed, not dedicated GPU capacity. The unused duplicate proxy token created during browser setup was deleted; one active credential remains.

## Repository discrepancy record

The original setup request describes Templates, mesocycles, numeric readiness/fatigue/progression recommendations, and several related screenshots. Current product authority explicitly retired those systems. The workflow therefore covers Today, active workout, factual Progress, contextual Routines, Settings, Support, Privacy, direct recorded pain/illness, rest, completion, and recovery states. Kimi may critique product UX but may not restore retired systems or redefine workout algorithms.

## Completion gate

Setup, screenshot intake, Kilo connectivity, and the bounded global-design session are complete. Kimi's output is persisted in `KIMI_GLOBAL_DESIGN_SPEC.md`. The next phase is Codex-owned implementation planning and application changes; no implementation was started by this setup task.
