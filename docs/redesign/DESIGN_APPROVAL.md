# Approved redesign direction

## Owner selection

**APPROVED:** Hybrid direction using **A — Logbook** as the production base.

The owner requested two refinements:

1. Prior-session performance must be more visible than Direction A's original treatment, using a distinct color while remaining clearly factual and non-interactive in meaning.
2. Rest uses Direction C's stronger structural progress behavior, adapted to Direction A's color system, with an explicit Pause/Resume button.

## Production interpretation

- The logger remains a dense ruled ledger with one clearly open current row.
- Comparable prior performance uses a cool blue-gray fact surface and the label **Last comparable**. This color is deliberately separate from the saturated blue reserved for current focus and primary actions.
- Rest progress becomes a structural rule in the compact sticky rest control. It uses the Logbook navy/blue palette rather than Direction C's teal.
- Pause/Resume is always visible while rest is active. Existing `-15 sec`, `+15 sec`, Skip/Finish, cancellation, persistence, overtime, and notification behavior remains unchanged.
- No destination, algorithm, persistence contract, recommendation rule, or historical comparison rule changes.

## Approval status

This decision satisfies the design-direction gate. Production implementation may proceed without another product-selection gate. Visual-baseline acceptance, physical-device behavior, publication, deployment, and hosted verification remain separate gates.

## Implemented visual acceptance

**OWNER APPROVED 2026-08-08.** The owner inspected the live production candidate at `http://127.0.0.1:8765/#workout`, including the ruled current row, blue-gray **Last comparable** fact treatment, structural rest-progress rule, labeled Pause control, and secondary rest-adjustment disclosure, and approved the result.

This approval closes the local visual-acceptance gate for the current working-tree candidate. It does not authorize a commit, push, merge, deployment, publication, or physical-device acceptance claim.
