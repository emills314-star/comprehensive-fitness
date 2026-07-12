# Exercise–muscle taxonomy and mesocycle uniqueness

**Date:** 2026-07-12  
**Taxonomy/database:** `2.0.0`  
**Prescription engine:** `3.0.0`  
**Implementation commit inspected:** `f3bb30f`  
**Status:** Complete — implemented locally, deployed, and verified on the hosted website

## Files changed

- Canonical model: `research_database/source/exercise-muscle-taxonomy.js`, `research_database/source/database.js`.
- Generated database: research JSON/CSV schemas, SQL, workbook, bibliography, manifest, validation report, `exercise_muscle_map`, and `exercise_taxonomy_review_queue`.
- Engine/application: `prescription-engine.js`, `index.html`, synchronized `www/` runtime assets.
- Private pipeline adapter: `scripts/personal-fitness/config.js`; no private personal records were published.
- Contracts/tests: `schemas/mesocycle-plan.v1.schema.json`, `scripts/test-prescription-engine.js`, `tests/ui/ui-audit.spec.js`, research build/validation.
- Documentation: `research_database/EXERCISE_MUSCLE_TAXONOMY.md`, methodology, README, executive summary, project, architecture, decision engine, UI/UX, roadmap, setup guide, and training-data map.

## Implemented behavior

- All 61 canonical exercises produce explicit taxonomy rows; 149 exercise–muscle relationships are generated.
- Direct, fractional, incidental, isometric, and unknown classifications are distinct from their numeric credit.
- Direct work uses 1.0; meaningful fractional work uses 0.5 or 0.25; incidental/unknown/isometric work receives zero hypertrophy credit.
- Isometric/local-fatigue exposure remains available independently of hypertrophy volume.
- Eleven exercises/families with low-confidence relationships are in a versioned manual-review queue.
- Canonical aliases resolve before scheduling. An automatically generated mesocycle schedules a canonical exercise on only one day; distinct exercises provide repeated muscle exposures.
- Program construction, candidate scoring, `Why the Score?`, volume balancing, historical weekly volume, redundancy inputs, and the private analysis crosswalk consume taxonomy rows.
- Historical recalculation is deterministic and non-mutating. Logged date/load/reps/RPE/completion remain unchanged; derived totals carry taxonomy version 2.0.0.

## Local validation

- `npm test`: passed.
- Prescription engine: 39/39 passed.
- Research build: passed; 42 research records, 61 exercises, 149 taxonomy relationships, 11 queued reviews.
- Research validation: valid with no errors; expected missing aggregate male-count warnings remain.
- Personal fitness pipeline: 59 artifact checks passed; one preserved-source warning.
- Prescription integration, schema contracts, performance, domain integrity, hypertrophy, resistance, workout safety/grade, rest, set prescription, and PWA tests: passed.
- `npm run sync:web`: passed; private aggregates included only in the ignored local Capacitor payload.
- `npm run verify:pwa`: passed.
- Local planner browser regression: mobile and desktop passed 2/2.

## Deployment inspected

- Branch: `main`.
- Vercel deployment for `f3bb30f`: Ready/success.
- Hosted URL: `https://comprehensive-fitness.vercel.app`.
- Viewports: iPhone-class mobile and 1280 × 900 desktop.

## Hosted user flows and results

### Mesocycle generation

Flow: open hosted app → Templates → Mesocycle Planner → select objective → four weeks → four training days → Standard Gym → build full-program draft → inspect sessions → expand `Why the Score?` → expand alternates.

Actual session totals at both mobile and desktop widths:

- Day 1: 8 exercises, 18 working sets.
- Day 2: 8 exercises, 18 working sets.
- Day 3: 8 exercises, 18 working sets.
- Day 4: 10 exercises, 18 working sets.

The 34 scheduled exercise names were unique. No exact/canonical exercise appeared on multiple days. The broad default scope used the absolute ten-exercise allowance on one day but remained at the 18-set hard limit.

`Why the Score?` displayed `Taxonomy Basis` with relationship categories and set-credit assumptions. Passed Checks and non-actionable Informational Notes remained hidden. The layout passed the narrow mobile and desktop audit.

### Conventional Deadlift

The hosted taxonomy export returned:

- Glutes: direct, 1.0.
- Quadriceps: fractional, 0.5.
- Hamstrings: fractional, 0.25.
- Adductors: fractional, 0.25.
- Spinal erectors: isometric fatigue 0.9, hypertrophy credit 0.
- Upper traps: isometric fatigue 0.6, hypertrophy credit 0.
- Upper back: isometric fatigue 0.5, hypertrophy credit 0.
- Forearms/grip: isometric fatigue 0.8, hypertrophy credit 0.

All rows reported taxonomy version `2.0.0`.

### Historical recalculation

The deterministic migration test recalculated four logged Conventional Deadlift sets without altering the source record. It produced four direct glute sets, two fractional quad sets, zero hypertrophy sets but positive isometric exposure for spinal erectors, and taxonomy version 2.0.0. Repeating the calculation returned the same output.

### Console/runtime and responsive checks

- Templates mobile and desktop accessibility/responsive/console audit: 2/2 passed.
- Planner hosted mobile and desktop audit: 2/2 passed.
- No relevant page errors or console errors were found. Expected 404 probes for unpublished private evidence are intentionally ignored; the app falls back to public research plus local/imported evidence.

## Evidence and uncertainty

The database added the Martín-Fuentes et al. deadlift systematic review (`stu_0041`, DOI `10.1371/journal.pone.0229507`) and Lee et al. kinetic/EMG comparison (`stu_0042`, DOI `10.1016/j.jesf.2018.08.001`). EMG is recorded as mechanistic support only. Fractional weights are documented modeling choices, not claimed exact biological constants.

## Remaining review work

- Eleven low-confidence exercise/family entries remain in the review queue for future focused evidence updates.
- Custom/personal exercise variations without a canonical research crosswalk use their explicit personal mapping and are labelled for mapping review.
- The existing private aggregate snapshot predates taxonomy 2.0; the updated local pipeline will apply taxonomy 2.0 on the next private rebuild. The runtime already applies taxonomy 2.0 to public/historical derived views.
