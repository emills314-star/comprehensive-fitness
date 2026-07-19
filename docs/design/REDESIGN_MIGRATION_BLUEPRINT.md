# Redesign Migration Blueprint: Dual Track

> **Status:** IMPLEMENTED architecture specification and non-production interaction lab; PLANNED production migration
> **Winner:** Dual Track
> **Non-goal:** No recommendation, progression, privacy, persistence, import, or synchronization semantics change in this phase.

## Outcome

Replace the presentation layer with a React/TypeScript Dual Track shell while preserving the prescription engine, guided-mesocycle engine, schemas, IndexedDB records, backup format, APIs, service-worker behavior, sync consent, and immutable historical snapshots. The legacy interface remains the behavioral reference until every parity gate passes. There is no permanent redesign toggle.

## Target structure

```text
Existing domain + persistence + APIs
                |
        typed adapter boundary
       /         |          \
 read models   commands   effect ports
       \         |          /
          Dual Track React shell
```

The repository now contains the proposed boundary in `redesign/src/contract.ts`, a synthetic fixture in `redesign/src/fixtures.ts`, and an interactive presentation proof in `redesign/src/components/DualTrackPrototype.tsx`. These are non-production and do not read or mutate canonical app data.

## Read models

The target adapter exposes deliberately UI-shaped, immutable projections:

- `nextAction`: start, resume, or review with stable identifiers.
- `readiness`: score/band, guidance, and none/moderate/severe/blocked adjustment state.
- `activeWorkout`: canonical session identifier, current set, and completion counts.
- `plan`: active mesocycle, available templates, and blocking viability findings.
- `progress`: submitted-session sample state, fatigue flags, and evidence confidence.
- `system`: online state, update availability, cloud-workout consent, and conflicts.

Later projections may add presentation-ready detail but cannot become alternate domain truth. Historical views must point to immutable submitted snapshots.

## Command surface

Commands are discriminated TypeScript values. Initial coverage includes:

- Start/resume workout; save readiness.
- Update, complete, or skip a set; start/cancel rest.
- Append an audited override.
- Request and explicitly confirm submission; cancel a draft.
- Create/update/delete templates and mesocycles.
- Edit eligible history through the existing rules.
- Update settings; import/export backup.
- Grant/revoke cloud-workout consent and resolve data conflicts.

The UI may optimistically display a pending command, but success is determined by the adapter. Failed commands retain entered values and expose recovery actions.

## Effect ports

Side effects remain behind replaceable adapters: IndexedDB persistence, service-worker caching/update coordination, notification scheduling, optional synchronization, wake lock, audio, and haptics. Browser or Capacitor capability absence must be conservative and non-blocking where existing behavior is non-blocking.

## Winner interaction architecture

### Phone workout

Exercise lanes preserve session context. Each lane contains role-aware set clips. One playhead indicates current position. A persistent dock owns weight, reps, RPE, rest state, override access, and commit. Submission is a separate final review, never an automatic consequence of completing the last set.

### Phone planning

A week arrangement board uses session lanes and viability markers. Editing a lane emits existing template/mesocycle commands. Blocking findings remain blocking; the composition does not invent scheduling intelligence.

### Progress and history

Performance tracks visualize existing aggregates and confidence. The linear accessible representation is canonical for assistive technologies. History editing remains distinct from submitted snapshot interpretation.

### Data and privacy

Export, import, local deletion, notification consent, and optional workout cloud-copy consent stay separate. Enabling notifications must never imply upload consent. Conflict resolution names both copies and waits for an explicit choice.

## Migration phases and gates

### Phase 0 — contract characterization

- Freeze UI-neutral behavior with existing domain, schema, privacy, import, recommendation, and backend tests.
- Add adapter contract fixtures around canonical records.
- Record legacy journey outcomes, not legacy markup or layout.

Gate: same inputs produce the same prescriptions, safety holds, submissions, history, imports, conflicts, and consent outcomes.

### Phase 1 — adapter seam

- Create production `ui-adapter` read-model selectors and command dispatcher around existing modules.
- Add effect ports for persistence, caching, notifications, sync, wake lock, audio, and haptics.
- Keep legacy handlers operational through the same characterized behavior.

Gate: adapter contract tests pass against an isolated synthetic IndexedDB database and cannot bypass explicit submission or consent.

### Phase 2 — separate React entry

- Promote the current non-production Vite lab into an application entry that consumes only the adapter.
- Implement Today/readiness, workout lanes/dock/rest, and submission/summary first.
- Route paths and caches must be isolated from the production entry.

Gate: template start → readiness → workout → rest → submission → summary → history passes after refresh and offline interruption.

### Phase 3 — planning, analysis, and data controls

- Add templates/mesocycle arrangement, viability findings, progress tracks, lift analysis, history editing, settings, privacy, import/export, and conflicts.
- Add tablet and desktop compositions without changing command semantics.

Gate: all 22 capabilities have parity evidence and no unresolved `Requires backend change` classification. Dual Track currently has none.

### Phase 4 — packaging and hosted verification

- Integrate the entry into service-worker precache/update flow and Capacitor web synchronization.
- Verify stale asset recovery, notification deep links, offline startup, background/foreground recovery, wake lock, and haptics/audio fallbacks.
- Verify the hosted URL at 320, 390, 768, and 1280 widths after a hard refresh; inspect console and network errors.

Gate: PWA and native packaging tests, privacy checks, axe, keyboard, reduced-motion, 200% text, and visual baselines pass.

### Phase 5 — single cutover

- Switch the main entry only after behavioral and migration gates pass.
- Remove temporary non-production routing and retire legacy presentation after a recovery window.
- Do not ship a permanent toggle or maintain two product shells.

Gate: production smoke test and rollback artifact are ready; no canonical data migration is required unless an adapter test proves otherwise.

## Verification matrix

Required automated journeys:

1. Template start → readiness → active workout → set edit → rest → interruption/reload → resume → explicit submission → summary → history.
2. Pain report → conservative substitution or block → explanation → audited override where permitted.
3. Template and mesocycle creation → viability findings → update → reload.
4. Progress and lift analysis with insufficient, provisional, and established evidence.
5. History correction without mutating immutable interpretation snapshots.
6. Backup export/import, invalid import rollback, and conflict resolution.
7. Notification consent independent from cloud-workout consent; grant and revoke sync consent.
8. Offline launch, deferred network effects, update availability, stale asset recovery, and reconnection.

Cross-cutting gates cover keyboard-only use, axe, reduced motion, 200% text, forced colors, 320/390/768/1280 layouts, Chromium/WebKit where supported, and Capacitor/PWA packaging. Visual baselines may change only after behavioral assertions pass.

## Test ownership

- Existing domain/schema/privacy/import/recommendation tests stay authoritative and should not be rewritten for React.
- Adapter tests prove mapping and error semantics.
- Component tests prove interaction state without duplicating domain formulas.
- Playwright proves end-to-end parity and platform recovery.
- Contract tests in `scripts/test-redesign-contracts.js` enforce 15 directions, 22 capability classifications, the weighted ranking, and at least four structural differences across all 105 concept pairs.

## Safety invariants

- Exactly one canonical active workout.
- Drafts never become canonical history without explicit final submission.
- Readiness modifies today, not the base template.
- Missing or failed safety evidence resolves conservatively.
- The UI never invents progression, fatigue, health inference, or AI coaching.
- Local ownership and existing import/sync consent boundaries remain intact.
- Historical interpretation snapshots remain immutable.

## Rollback and observability

Before cutover, log adapter command type, result class, recovery state, and timing without recording sensitive workout values. A rollback swaps the presentation entry, not the data schema. Any schema change requires its own reviewed migration, backup round trip, and explicit documentation.

## Acceptance checklist

- [x] Separate React/TypeScript/Vite non-production entry exists.
- [x] Typed read-model, command, and effect boundary is specified.
- [x] Synthetic Dual Track workout, planning, progress, and data journeys are interactive.
- [x] Concept/ranking/uniqueness contract test exists.
- [ ] Production adapter implemented against existing modules.
- [ ] Full parity Playwright suite passes against canonical persistence.
- [ ] Service worker and Capacitor package the new entry.
- [ ] Hosted and native gates pass.
- [ ] Main entry cut over and legacy presentation retired.
