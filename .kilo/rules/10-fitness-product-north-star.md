# Fitness product north star

Comprehensive Fitness is **Strong with a quiet spotter**: fast, attractive, compact logging; trustworthy history; prior performance and rest timing; practical overrides; and concise intervention only when an approved meaningful exception exists.

The final adjudicated documents under `docs/redesign/final/` define intended product scope. Current code defines implemented behavior. Phase 1 and audit documents are historical or advisory evidence and cannot reopen final feature disposition.

## Ordinary flow

1. Open Today and identify the expected workout.
2. Start directly; readiness is optional and never a logging gate.
3. See stable targets and comparable prior performance.
4. Log weight, reps, and decimal RPE with minimal friction.
5. Complete the set, use the rest timer, and advance clearly.
6. Finish with one concise summary and clear next action.
7. Review factual exact-variant progress and chronological history.

Prior performance, current targets, inputs, current-set state, and rest status come before explanation. Current is blue, completed is green, future is neutral, and skipped is muted. Preserve readable exercise names, large mobile touch targets, light presentation, obvious states, and a focused full-screen workout.

## Current product boundary

- Today and Progress are the only persistent destinations.
- Routines and Settings are contextual; active workout is full-screen.
- Readiness may be recorded but remains silent and nonblocking.
- Direct recorded pain/injury or illness is the only current live exception rule.
- Numeric fatigue, readiness, plateau, and deload recommendations are not active.
- Mesocycle/planner UI, dashboards, volume analytics, research/evidence surfaces, theme packages, and persistent secondary navigation are retired. Verify their continued absence; do not restore them.
- Preserve immutable legacy observations through bounded compatibility readers without recreating retired active domains.

## Protected behavior

Do not silently change history, Strong import/export, set roles, stable named-variant targets, prior-performance identity, exercise order, notes, substitutions, user overrides, exact performed sets, decimal RPE, interrupted/resumed workouts, timer persistence, offline recovery, grades, PR facts, schemas, API contracts, notification scheduling, taxonomy identity, or source provenance.
