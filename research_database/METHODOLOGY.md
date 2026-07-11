# Research selection and translation methodology

## Objective and population

The target population is resistance-trained or resistance-training-eligible males. Healthy adult, natural, resistance-trained males receive the highest direct-applicability grade. Untrained males are used when trained-male evidence is unavailable. Older, adolescent, clinical, injured, military, athlete, obesity, and enhanced populations must be labeled and are not automatically generalized.

Mixed-sex research is eligible only as indirect evidence unless male outcomes are separable. Every source records sample sex, known male count, separability, and male applicability. A missing aggregate male count in a review is `null`; it is not estimated from incomplete reporting. Female-only findings cannot support conclusions or rules. Natural and enhanced outcomes are never pooled into one recommendation.

## Search process for version 1.0

Search date: 2026-07-11.

Sources searched: PubMed/MEDLINE and PubMed Central via title/topic searches; DOI landing pages and journal records were used for persistent identifiers and source verification. Backward citation knowledge from included syntheses was used to identify foundational trials. Version 1.0 emphasizes high-yield syntheses and male-direct trials and is broad evidence mapping, not a PRISMA-complete systematic review for every database topic.

Core search concepts were combined in topic-specific queries:

- resistance training, male/men, trained/untrained, hypertrophy, muscle thickness, cross-sectional area;
- weekly sets, volume, frequency, dose response, minimum dose, maintenance;
- load, repetition range, low load, high load, failure, proximity to failure, RIR, RPE;
- rest interval, repetition duration, tempo, range of motion, long muscle length, exercise order, machine, free weight;
- progression, autoregulation, velocity loss, periodization, deload;
- protein, energy restriction, calorie deficit, lean-mass retention, recomposition, overfeeding, surplus, weight gain;
- systematic review, meta-analysis, randomized trial, position stand, consensus.

## Inclusion criteria

1. Human resistance-training or relevant body-composition outcomes.
2. Adult male-only data, male-separable data, or mixed adult evidence that can be explicitly labeled indirect.
3. Longitudinal outcomes preferred for hypertrophy and body composition.
4. Systematic reviews/meta-analyses, consensus/position stands, randomized trials, and longitudinal trials prioritized.
5. Acute or observational evidence retained only for measurement or mechanism questions and labeled accordingly.
6. Original peer-reviewed source preferred over summaries.

## Exclusion and flagging

Female-only, animal, in-vitro, retracted, and irrelevant studies do not support application records. Mixed-sex sources without separable male findings are indirect. Acute hormones, surface EMG, muscle protein synthesis, soreness, or short-term strength alone cannot establish superior long-term hypertrophy. Enhanced-participant studies cannot support natural-male defaults. Preprints may be logged as gaps but do not displace peer-reviewed evidence without explicit review.

Retractions and corrections are checked during scheduled updates through PubMed/journal status and DOI metadata. A source with an unresolved major concern is marked high risk and removed from recommendation mappings until resolved. Credible disagreement is retained in `evidence_gaps` and `conflicting_study_ids` rather than excluded.

## Evidence hierarchy and grading

- `tier_1`: systematic review or meta-analysis.
- `tier_2`: reputable consensus statement or position stand.
- `tier_3`: randomized controlled trial.
- `tier_4`: longitudinal resistance-training study.
- `tier_5`: high-quality observational study.
- `tier_6`: acute mechanistic study.
- `tier_7`: expert or narrative inference.

Confidence uses `very_high`, `high`, `moderate`, `low`, and `very_low`. Direct male applicability, training-status match, natural/enhanced match, longitudinal outcome quality, consistency, replication, precision, and risk of bias can raise or lower confidence. A meta-analysis is not automatically male-specific and does not automatically receive very-high confidence.

Risk of bias uses the source authors' formal instrument when available (for example RoB 2, TESTEX, or review-level appraisal). Version 1.0 stores `varies_across_included_studies` when a synthesis cannot be reduced to one rating and `not_formally_assessed` when no reproducible assessment was available. These values are limitations, not neutral endorsements.

## Data extraction and conflict resolution

One structured record is created per paper or major source. Extraction includes population sex, training status, duration, intervention, comparator, nutrition, outcome, effect/statistical result when available, practical meaning, limitations, risk, applicability, replication, and conflicts. Source claims are paraphrased; acute mechanisms are separated from chronic outcomes.

Version 1.0 was extracted by one reviewer-agent. Discrepancies were resolved conservatively: store null rather than guess; downgrade confidence rather than imply certainty; retain conflicting credible sources; and use a conservative practical default when an application requires deterministic behavior. A future two-reviewer workflow should independently screen and extract high-impact updates, then document adjudication in the change log.

## Translation into application rules

Evidence conclusions describe what the literature supports. Application rules add monitoring inputs, deterministic conditions, and actions. If a numeric threshold is not directly validated, the rule is labeled `inferred`, confidence is reduced, and the evidence-gap table records the uncertainty.

Set volume uses fractional hard sets. Primary muscles receive a default 1.0 set; clearly loaded secondary muscles receive 0.5; trivial contribution receives 0. These are query conventions, not physiological constants, and applications should permit exercise-specific overrides.

Progress requires comparable load, repetition, RIR/RPE, ROM, technique, rest, equipment, and set role. Single-session changes can be noise. Higher-skill or higher-variability exercises require longer confirmation windows. Pain and technique failure override progression.

## Update and version control

Review high-impact topics at least every six months and perform a complete annual audit. Search alerts should prioritize new meta-analyses, male-only trained trials, corrections, and retractions. Each material change receives a persistent change ID, database semantic version, affected IDs, previous/new value, reason, evidence IDs, reviewer note, and review date. IDs are never reused. Breaking schema changes increment the major version; changed interpretation increments minor; corrections without meaning change increment patch.

