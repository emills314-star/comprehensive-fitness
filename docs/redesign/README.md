# Comprehensive Fitness Zero-Based Redesign

This directory is the durable source of truth for the redesign. Codex owns organization, adjudication, implementation, and status tracking. Claude Code serves as an independent adversarial reviewer at defined checkpoints.

## Product north star

**Comprehensive Fitness should feel like Strong with a quiet spotter:** fast, attractive workout logging; trustworthy history; prior performance and rest timing; unrestricted practical overrides; and concise intervention only when credible evidence suggests fatigue, plateau, pain/illness risk, lighter work, or a deload.

## Current authority order

Until final adjudicated documents exist:

1. `phase-1/REDESIGN_NORTH_STAR.md`
2. `phase-1/FEATURE_DISPOSITION.md`
3. `phase-1/SIMPLIFIED_PRODUCT_SPEC.md`
4. `phase-1/SIMPLICITY_ACCEPTANCE_TESTS.md`
5. `DECISION_LOG.md`
6. Claude audit reports as advisory evidence
7. Existing code, tests, and older documentation as evidence of current implementation

After the `final/` documents are created, authority becomes:

1. `final/FINAL_REDESIGN_PRD.md`
2. `final/FINAL_FEATURE_DISPOSITION.md`
3. `final/RECOMMENDATION_ENGINE_CONTRACT.md`
4. `final/MIGRATION_AND_ACCEPTANCE_PLAN.md`
5. `DECISION_LOG.md`
6. `implementation/IMPLEMENTATION_EXECPLAN.md` for sequencing only
7. Claude audit reports as advisory evidence
8. Older documents and current code as historical/current-state evidence

No chat transcript overrides tracked files.

## Directory map

```text
docs/redesign/
├── README.md
├── STATUS.md
├── DECISION_LOG.md
├── phase-1/
│   ├── REDESIGN_NORTH_STAR.md
│   ├── FEATURE_DISPOSITION.md
│   ├── SIMPLIFIED_PRODUCT_SPEC.md
│   └── SIMPLICITY_ACCEPTANCE_TESTS.md
├── audits/
│   ├── CLAUDE_CODEBASE_AUDIT_REQUEST.md
│   ├── CLAUDE_ADVERSARIAL_CODEBASE_AUDIT.md
│   ├── CLAUDE_FINAL_ACCEPTANCE_REQUEST.md
│   └── CLAUDE_FINAL_ACCEPTANCE_AUDIT.md
├── final/
│   ├── FINAL_REDESIGN_PRD.md
│   ├── FINAL_FEATURE_DISPOSITION.md
│   ├── RECOMMENDATION_ENGINE_CONTRACT.md
│   └── MIGRATION_AND_ACCEPTANCE_PLAN.md
├── implementation/
│   ├── IMPLEMENTATION_EXECPLAN.md
│   └── MILESTONE_LOG.md
├── prompts/
│   ├── CODEX_ORCHESTRATOR_BOOTSTRAP.md
│   └── CLAUDE_ADVERSARIAL_CODEBASE_AUDIT_PROMPT.md
└── reference/
    └── current-ui/
```

Empty future files should not be created merely to fill the map. Create them when their phase begins.

## Model roles

### Codex — primary

Codex:

- maintains this directory;
- maps the repository;
- prepares Claude audit packets;
- adjudicates audit findings;
- writes the final specification;
- creates and maintains the implementation plan;
- implements milestones;
- verifies the running application;
- records decisions and status.

### Claude Code — adversarial reviewer

Claude:

- runs from the same repository root;
- reads the existing root `CLAUDE.md` and the relevant redesign packet;
- remains read-only during audits;
- challenges hidden complexity, unsupported assumptions, technical coupling, data risks, and incomplete acceptance evidence;
- writes or returns one audit report;
- does not implement or make final product decisions.

## Required checkpoints

1. **Codex bootstrap and repository orientation**
2. **Claude adversarial codebase audit**
3. **Codex adjudication and final specification**
4. **Codex implementation plan**
5. **Codex milestone implementation and verification**
6. **Claude final acceptance audit**
7. **Codex corrective pass and final verification**
