# Comprehensive Fitness Zero-Based Redesign North Star

**Status:** Phase 1 product decision  
**Basis:** Erik's reported behavior across his recent workouts, prior Comprehensive Fitness product discussions, and the original reason for building the app  
**Working concept:** **Strong-quality logging with a quiet spotter**

---

## 1. Executive decision

Comprehensive Fitness will stop behaving like an exercise-science management platform.

It will become a fast, attractive personal workout logger that:

1. makes the next workout obvious;
2. makes prior performance easy to see;
3. makes weight, reps, and RPE fast to record;
4. stays mostly silent when training is proceeding normally; and
5. intervenes clearly when evidence suggests fatigue, a plateau, pain/illness risk, or a need for lighter work or a deload.

The redesign is not centered on generating a more elaborate prescription. Erik already makes ordinary progression decisions reasonably well. The product's distinctive intelligence should be **exception detection**: recognizing when continuing to push is less appropriate than holding, backing off, performing light work, or deloading.

---

## 2. One-sentence product definition

**Comprehensive Fitness is a personal workout logger that feels as direct and enjoyable as Strong, preserves trustworthy performance history, and quietly warns Erik when recovery or performance evidence suggests that he should stop progressing normally and back off.**

---

## 3. Target user

The target user is **Erik**.

Comprehensive Fitness is not being redesigned for:

- a broad commercial fitness audience;
- coaches managing multiple athletes;
- beginners who need the app to design an entire program;
- users who want to study exercise-science evidence during a workout;
- users who want a detailed mesocycle-planning system;
- users who want every internal calculation exposed as a score, badge, or dashboard.

Product decisions should be based on Erik's actual behavior, not hypothetical market requirements.

---

## 4. Behavioral diagnosis

The redesign is grounded in the following observed behavior:

- Erik normally opens **Today**, finds the workout that makes sense, and starts from his usual readiness baseline.
- He usually skips a readiness questionnaire.
- Before a working set, he primarily needs:
  - what he did last time;
  - the exercise's stable rep range;
  - the target RPE; and
  - a concise explanation only when the app asks him to do something materially different.
- Long recommendation text makes the reason for a change harder—not easier—to understand.
- He routinely records weight, reps, and RPE.
- He experiences avoidable input friction, especially when editing a prefilled RPE such as changing `7` to `7.5`.
- Ordinary rep- and load-progression recommendations have not meaningfully directed his behavior. He often follows his established rep range instead.
- Lower-RPE or recovery-related guidance is more likely to alter his behavior.
- A credible fatigue, plateau, pain/illness, or deload flag would be consequential.
- He has not used the mesocycle builder to change his routine.
- He wants to freely substitute, rename, duplicate, reorder, add, remove, or alter exercises without equipment metadata blocking the workout.
- The completed workout—not the original prescription—should be the source of truth for grading and history.
- The capabilities he considers indispensable are:
  1. recording weight, reps, and RPE;
  2. seeing previous performance; and
  3. using a rest timer.
- He values post-workout reward and progress visibility, especially:
  - a workout grade;
  - PRs;
  - exercise progression;
  - useful charts; and
  - a clear account of where performance improved.
- He wants the app to feel simple, polished, and fun—not clinical or administrative.

---

## 5. Core product jobs

### Job 1 — Start and record

Erik can open Comprehensive Fitness, identify the expected workout, and begin logging with almost no setup.

The app must make it fast to record:

- load;
- reps;
- RPE;
- exercise order;
- notes;
- session duration; and
- relevant readiness deviations.

### Job 2 — Remember

Comprehensive Fitness presents the historical context needed for the next set and preserves the information needed for future interpretation.

The normal live-workout view should prioritize:

- the most relevant previous performance;
- the stable target rep range;
- the target RPE; and
- any active exception flag.

### Job 3 — Intervene when necessary

Comprehensive Fitness should not narrate every normal progression decision.

It should intervene when evidence supports one of the following:

- unusual fatigue;
- deteriorating performance;
- a meaningful plateau;
- pain, illness, or injury concern;
- a readiness-driven adjustment;
- light work rather than normal work; or
- a deload.

An intervention must say what to do before explaining why.

### Job 4 — Accommodate reality

Erik can change the workout without fighting the application.

The app must accept:

- exercise substitutions;
- custom exercise variants;
- different exercise order;
- added or removed sets;
- changed loads, rep targets, or RPE targets;
- shortened sessions;
- interrupted and resumed sessions; and
- deviations from the template.

The recorded workout becomes the authoritative session. A legitimate override is not automatically a failure.

### Job 5 — Reward and review

Completing a workout should feel satisfying.

Comprehensive Fitness should concisely show:

- the workout grade;
- meaningful PRs or improvements;
- the exercises that progressed;
- any material fatigue or plateau observation; and
- a path to useful exercise-level charts.

This job does not justify multiple overlapping scores.

---

## 6. Product principles

### 6.1 Logging is the product

If a feature makes the live logging experience slower, harder to scan, or more mentally demanding, it must justify that cost with frequent and consequential value.

### 6.2 Coaching is exception-based

Normal training should not generate a wall of recommendations.

When no material concern exists, Comprehensive Fitness should show the target and prior performance, then let Erik train.

### 6.3 Show facts before interpretations

The live screen should first show:

- last performance;
- today's stable target;
- current inputs; and
- rest status.

Interpretation appears only when it changes an action.

### 6.4 Never silently rewrite the exercise

The template or exercise variant owns its normal rep range and target RPE.

The engine may recommend a temporary adjustment because of a flag, but it must not silently transform an 8–10-rep movement into a 12–15-rep movement and then require Erik to investigate why.

### 6.5 The action comes before the explanation

A warning should read like:

> **Back off chest today**  
> Cap these sets at RPE 7 and perform one fewer working set.

The explanation is secondary and available through **Why?**

### 6.6 Use the usual baseline by default

No readiness form appears in the normal start flow.

Comprehensive Fitness records the usual baseline automatically. Erik only logs readiness when today differs materially or when synced data provides it without manual work.

### 6.7 Actual work is the source of truth

Substitutions, changed order, altered set counts, or different rep choices are recorded as the real workout.

Grades and progress analysis use the completed session and its context, not blind adherence to the original template.

### 6.8 Custom variants are legitimate exercises

`Leg Extension — Heavy` and `Leg Extension — Light` may share a movement family while maintaining distinct rep ranges, targets, and histories.

Equipment metadata may help organization, but it may never block a workout.

### 6.9 Preserve intelligence without displaying its machinery

Comprehensive Fitness may internally use:

- recent training exposure;
- readiness;
- performance trends;
- RPE drift;
- muscle mapping;
- qualifying-session logic; and
- warm-up versus working-set classification.

Erik should not have to operate or understand those systems during a workout.

### 6.10 One rewarding summary is better than overlapping scores

The workout grade survives.

A separate hypertrophy score does not survive as a normal user-facing score because it duplicates the grade, increases apparent precision, and does not identify a clearer action. Useful underlying inputs may still support the grade or fatigue detection.

### 6.11 Infrequent planning cannot dominate frequent logging

Routine editing remains available, but mesocycle generation, candidate pools, portfolio construction, and program-design workflows leave the core product.

### 6.12 Deletion means deletion

A feature classified for deletion should not survive indefinitely as:

- an Advanced tab;
- a collapsed card;
- an unused route;
- dormant state;
- a permanent feature flag;
- stale documentation; or
- an inaccessible but maintained subsystem.

---

## 7. Information hierarchy

During a normal working set, the hierarchy is:

1. **Current exercise and set**
2. **What happened last time**
3. **Today's stable rep range and target RPE**
4. **Current weight, reps, and RPE inputs**
5. **Rest timer**
6. **A flag, only when one is material**
7. **Explanation, only on request**

Everything else is subordinate.

---

## 8. Final high-level product shape

Comprehensive Fitness has two primary destinations:

1. **Today**
   - expected workout;
   - active flag, when present;
   - one-tap start;
   - choose another workout.

2. **Progress**
   - completed workouts;
   - exercise history;
   - PRs;
   - concise, useful charts.

Routine management and settings are available through secondary entry points. They are not permanent bottom-navigation destinations because Erik rarely changes his routine.

An active workout is a dedicated full-screen experience.

---

## 9. Explicit non-goals

Comprehensive Fitness is no longer trying to be:

- an automatic mesocycle generator;
- a program-design course;
- a portfolio optimizer for exercise selection;
- a user-facing muscle-volume accounting system;
- a research-literature reader;
- a dashboard of competing fitness scores;
- a daily readiness questionnaire;
- a system that prescribes a new rep range whenever its internal logic changes;
- a rigid equipment database;
- a general-purpose commercial coaching platform;
- a substitute for Erik's ordinary judgment about adding a rep or modest load when training is going well.

---

## 10. What the app should feel like during a workout

Comprehensive Fitness should feel:

- immediate;
- visually calm;
- responsive;
- forgiving;
- rewarding;
- easy to scan under fatigue;
- confident enough to stay quiet;
- clear when it does interrupt.

Erik should be able to think about the set, not the application.

The app should never make him decode whether a recommendation is different because of progression logic, fatigue logic, readiness logic, a mesocycle rule, a qualification window, or an evidence score. It should state the actionable exception in plain language.

---

## 11. What the app is no longer trying to expose

The following may exist internally when they materially improve reliability, but they do not receive dedicated normal-path interfaces:

- direct versus fractional set calculations;
- multi-state intervention taxonomies;
- confidence and severity matrices;
- evidence citations;
- qualifying-week controls;
- program-wide exercise portfolios;
- candidate pools;
- muscle-frequency badges;
- exercise-science guardrail pages;
- readiness scoring dashboards;
- detailed model rationale;
- internal progression objects.

---

## 12. Second deletion pass

After the initial redesign, the visible product was challenged with:

> Could another 25% of the interface be removed without compromising the core jobs?

The following were removed in that second pass:

- the separate readiness-start modal;
- a permanent Routines bottom-navigation destination;
- normal recommendation cards for every exercise;
- the standalone hypertrophy score;
- the weekly muscle-volume dashboard;
- the mesocycle builder and all of its substeps;
- candidate pools and exercise portfolios;
- user-facing evidence and research citations;
- user-facing direct/fractional-set math;
- visible calculation-window controls;
- separate screens for routine progression statuses;
- equipment-availability blocking;
- a separate program-wide scorecard.

What remains visible is tied directly to starting, recording, reviewing, overriding, or responding to a consequential flag.

---

## 13. North-star measures

The redesign succeeds when:

- the expected workout starts in one deliberate tap;
- no readiness data is required before a normal workout;
- the current exercise, prior performance, rep range, and target RPE are immediately understandable;
- a normal exercise contains no explanatory recommendation paragraph;
- a material flag states one action in one concise card;
- weight, reps, and a decimal RPE can be entered without input workarounds;
- substitutions and custom variants are never blocked by equipment metadata;
- completing a workout produces a concise and rewarding summary;
- the user can inspect an exercise's progress without navigating a program-analysis system;
- no mesocycle workflow is required for normal use;
- Erik finishes five consecutive workouts without needing to decode the app's recommendation logic.

---

## 14. Product thesis

**Comprehensive Fitness should assume that Erik can push when training is going well. Its intelligence is most valuable when it recognizes that pushing is the wrong choice.**
