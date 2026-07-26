# Implementation handoff — "Evidence & Change" UI

> **Status:** Phases 1–3 IMPLEMENTED and independently verified (2026-07-25), uncommitted.
> Phases 4–7 PLANNED. `design-concepts/` itself remains design evidence only and ships nothing.
>
> **Phase 3 verification of record:** `npm test` 52/52. Eleven snapshot differences reviewed and
> approved — 4 empty tab states (today/plan × mobile/desktop), 5 populated Dashboard
> (1280 light/dark, 390, 768, 200%), empty Lift 390, empty Dashboard 390. Per-muscle weekly
> planned ranges confirmed real (`targetLow`/`targetHigh` via `weeklyMuscleVolume()`). Template
> completion rate confirmed absent from the engine and correctly **omitted rather than derived**.
>
> **Lesson worth keeping:** `protected-surfaces.spec.js` originally asserted two screenshots in
> one test, so a failure on the first permanently masked the second. It is now split. When adding
> visual assertions, give each screenshot its own test — a masked baseline surfaces one phase late
> and gets misattributed.
>
> **Phase 1–2 verification of record:** `npm test` 51/51. `check:privacy` passes in the main
> worktree (517 files). `audit:ui` 241 passed / 1 failed. Engine confidence confirmed as a
> four-value enum — `research_default` / `low` / `moderate` / `high` → levels 1/2/3/4 — and
> recorded in `docs/DECISION_ENGINE.md`.
>
> **Two pre-existing failures, neither caused by this work, neither to be fixed inside a phase:**
> 1. `audit:dependencies:full` reports 9 high / 2 moderate, **all development-only**; the
>    production subset is 0 and `package.json` / `package-lock.json` are untouched. This fails on
>    `main` today and blocks `check:public` for every phase. Needs its own task.
> 2. `audit:ui` fails one protected case: active workout at 320px / 200% text clips the load, RPE
>    and default numeric inputs. Phase 4 owns that surface — fix it there.
> **Audience:** `lead_orchestrator` and `implementation_worker_structural` (`gpt-5.6-sol`).
> **Binding agreement:** `AGENTS.md` governs. This document does not override it.
> **Synthetic data:** every figure in the mockups is a fictional athlete. No personal data.

---

## 0. Read before planning

| Read | Why |
| --- | --- |
| `AGENTS.md` | Documentation loop, privacy review, publishing policy, status labels |
| `docs/UI_UX.md` | Authoritative for screens, navigation, state, copy. **This change rewrites much of it.** |
| `docs/ROADMAP.md` | Must record this work |
| `design-concepts/README.md` | The four explorations and why this direction won |
| `design-concepts/merged.css` | **Normative for structure and rules.** See the contrast caveat below. |
| `artifacts/design-concepts/*.png` | Rendered target screens (run `node design-concepts/capture.js` if absent) |

`design-concepts/` is a **non-production prototype**. It is not loaded by `index.html`, the
service worker, or the Capacitor payload. Do not wire it into the app and do not import from
it at runtime. Port the rules; do not `<link>` the file.

**Contrast caveat (confirmed in Phase 2):** the prototype renders only in `signal-garden` light.
Its literal confidence level-1 and level-3 colours — `--muted-2` and `--muted` on transparent —
**fail AA in some of the ten packages.** Phase 2 corrected this with adjusted token mixtures and
added a contrast regression covering 14 text roles × levels 1–3 × ten packages × both themes.
Take the *structure and the four-level rule* from `merged.css`; take the *shipped colour values*
from `index.html` and that regression. Where they disagree, the shipped values win.

---

## 1. Decisions of record — do not reopen

1. **Active workout is V3 · Progressive.** Owner decision, 2026-07-25. The target is
   `design-concepts/m1-workout-variants.html` screen `v3-progressive`. The other two variants
   (`v1-spine`, `v2-card`) are rejected and remain in the file only as comparison evidence —
   **do not implement them, and do not blend them in.**

   V3's defining behaviour: **a set row has two rendering modes.** A *logged* set renders the
   full plan │ actual │ delta spine. A *pending* set renders as a single quiet line showing only
   its target. The row swaps mode at the moment the set is logged. This is not a class toggle on
   one markup shape — `renderSet` (`app-views.js:1382`) currently emits a single form and will
   need both. See §6 Phase 4 for the consequence.
2. **Phase ordering is not negotiable.** Phases 1–3 are unblocked and must land before Phase 4
   (active workout) and Phase 6 (everything else). Do not reorder to "get the big screens done
   first." The design system has to be proven by a low-risk consumer before it touches the
   logging hot path.

---

## 2. The design system — normative

Two layers. The rule that keeps them from fighting is the **role separation**; violating it is
the single most likely way to get this wrong.

| Role | What it is | How it renders |
| --- | --- | --- |
| **CLAIM** | A prescription, target, or projection | Wears its **confidence**, expressed only through fill / border-style / weight, in `--current` or neutral. Never semantic hue. |
| **FACT** | A logged value | Plain ink. No decoration at all. |
| **JUDGMENT** | A delta | Owns **semantic hue** outright. Nothing else may use it. |

A claim, a fact, and a judgment never occupy the same slot, so hue never competes with certainty.

### Layer 1 — Confidence (claims)

Four levels, applied via `data-conf` on `.chip`, `.claim-card`, and `.meter`:

| Level | Treatment | Meaning |
| --- | --- | --- |
| `4` | Solid `--current` fill, `--on-action` text | Well evidenced |
| `3` | `--current-dark` fill, `--current` text, solid border | Good |
| `2` | Transparent, solid `--line-strong` border, `--muted` text | Thin |
| `1` | Transparent, **dashed** `--line-strong` border, `--muted-2` text | Provisional |

Plus `.meter` — a 4-bar glyph filling `--success` (levels 3–4) or `--amber` (levels 1–2).

Evidence is **never** a disclosure. It is the always-visible second line of every claim
(`.cc-why`, `.ex-why`). This is the point of the direction: it removes the four-level
`<details>` nesting described in `docs/UI_UX.md`.

### Layer 2 — Delta (judgments)

`.d` with exactly one modifier. **This is the only place semantic hue is spent anywhere in the app.**

| Class | Colour | Meaning |
| --- | --- | --- |
| `.on` | `--success` | On target |
| `.under` | `--amber` | Under / short of plan |
| `.over` | `--current` | Exceeded plan **in a desirable direction** |
| `.out` | `--red` | Outside tolerance — exceeding a *ceiling* is out, not over |
| `.none` | `--muted-2` | No comparison available |

**`.over` vs `.out` — my original spec was ambiguous here and Phase 3 inherited the ambiguity.**
`.over` (blue) is for exceeding a target where that is *good*: load added, extra reps, a
progression. Exceeding a **volume ceiling** is a problem, not an achievement, and takes `.out`
(red). The test is whether more is better; if it is not, it is `.out`.

A delta must never contradict the status pill beside it. Phase 3's Dashboard renders chest at
`ABOVE TARGET` in red with a `High concern` fatigue flag, and the delta beside it as a blue
`+8` — the same fact stated as a problem and as progress in one row. That combination is a bug
wherever it appears.

### The spine

Where a real comparison exists, use `.diff` / `.drow` with three columns:
`.plan` (claim, tinted `--panel-2`) │ `.act` (fact, plain) │ `.dlt` (judgment, hue).
Where no comparison exists (settings, planning), fall back to the card/list language.

`.tap` is the enlarged logging target the owner asked for — minimum 64px, `--current` inset ring.

---

## 3. Palette and token contract

**The palette does not change.** `design-concepts/tokens.css` is a verbatim extract of
`index.html` lines **19–202** (`:root`, `[data-theme="light"]`, all ten `[data-color-package]`
blocks). `design-concepts/capture.js` fails if it drifts.

- Reuse the existing semantic roles exactly: `--current` action/next, `--success` done,
  `--amber` warn, `--rest-accent` rest, `--red` destructive.
- **Do not add tokens** without recording them in `docs/UI_UX.md`.
- **Respect the 12px legibility floor.** `--fs-micro` is the floor; `--fs-data` (11px) stays
  reserved for dense tabular numerals in the set grid only. Pinned by
  `scripts/test-workout-page-density.js:36`.
- The `--achv-*` family is deliberately hard-coded to hold a 7:1 contrast floor
  (`index.html:116-134`) and is asserted by `scripts/test-workout-grade.js:150-159`.
  **Do not swap it for accent tokens.**

### Mockup inline styles must not survive

The prototype uses `style="..."` attributes liberally as prototyping shorthand.
`tests/ui/ui-audit.spec.js:153-167` caps the shipped stylesheet at **3 inline `style=`
attributes**, 74 hex colours, 40 `rgb()` calls, and 17 `!important`. Every inline style in the
mockups must become a class in `index.html`'s `<style>` block. Budget for this — a literal
port fails the audit immediately.

Favour `color-mix(in srgb, var(--token) N%, transparent)` over new literals; that is the
existing pattern and keeps the hex/rgb counters flat.

### `--panel-3` is not a neutral surface

Caught while rendering the system states: `--panel-3` is a **warm cream** in several packages
(`signal-garden #fff0bd`, `harbor-pulse #f7e5b4`, `prairie-electric #f1dfaa`,
`modern-primary #fff1ba`). Using it for an *empty*, *inactive*, or *placeholder* surface —
progress-bar tracks, loading skeletons, off-state toggles, disabled buttons — spends warm hue on
something that is not a delta, and reads as a warning in exactly the packages that matter.

Use `color-mix(in srgb, var(--text) 9-10%, transparent)` for neutral inactive surfaces. It stays
neutral across all ten packages and both themes. `merged.css` already does this; do not
"simplify" it back to `--panel-3`.

---

## 4. Data contract — VERIFY FIRST, DO NOT INVENT

The design asserts things about data. Confirm each against the engine before building UI.
If a value does not exist, **stop and report**; do not fabricate a plausible number.

| Design needs | Likely source | Risk |
| --- | --- | --- |
| A 4-level confidence per prescription | `renderUnifiedEvidence` (`app-views.js:1529`), `renderUnifiedPrescriptionDetails` (`app-views.js:1553`), `prescription-engine.js` | Confidence exists, but its **shape and scale are unconfirmed**. Map the existing model onto 4 buckets; do not define a new one. Record the mapping in `docs/DECISION_ENGINE.md`. |
| Prescribed vs performed per set | `renderSet` (`app-views.js:1382`) already renders previous performance and targets | Delta is probably **derived in the view today**. Decide where it lives and document it. |
| Session mean RPE vs target | `renderExerciseExpectations` (`app-analysis.js:1399`) has RPE-compliance % | Likely available; confirm the window matches "this session." |
| Planned vs actual weekly volume | `renderProgressOverview` (`app-views.js:386`), `renderWeeklyVolumeWarningDetail` (`app-views.js:489`) | Actual exists. **"Planned" may not** — verify a per-week planned target exists per muscle. |
| Template completion rate | — | **Probably does not exist.** This is the one genuinely new capability. If it requires derivation over history, it is a `docs/DECISION_ENGINE.md` + `docs/ARCHITECTURE.md` change, not a UI change. Scope it separately or drop it from phase 3. |

---

## 5. Migration map

Views are HTML strings rendered into `#root`; events are delegated via `data-action`.
**Script load order is a tested dependency contract** (`index.html:2614-2626`) — do not convert
to modules or reorder.

| Target screen | Mockup | Owning function |
| --- | --- | --- |
| Today | `m2-core.html#today` | `renderLiftHome` `app-views.js:323`, `renderQuickStartTemplates` `app-views.js:596` |
| Active workout | `m1-workout-variants.html#v3-progressive` | `renderWorkout` `app-views.js:245`, `renderExercise` `app-views.js:1314`, `renderSet` `app-views.js:1382`, `renderTimer` `app-views.js:1622` |
| Prescription & evidence | `m2-core.html#evidence` | `renderPrescriptionDetails` `app-views.js:1572`, `renderUnifiedPrescriptionDetails` `:1553`, `renderUnifiedEvidence` `:1529`, `renderRolePrescriptionDetails` `:1476` |
| Progress | `m2-core.html#progress` | `renderProgressOverview` `app-views.js:386`, `renderChart` `app-analysis.js:1192` |
| Plan | `m2-core.html#plan` | `renderTemplates` `app-analysis.js:2`, `renderTemplateCard` `app-analysis.js:124` |
| Completed summary | `m2-core.html#summary` | `renderCompletedWorkoutSummary` `app-history.js:644`, `renderWorkoutExerciseResult` `app-history.js:456` |
| Start / conflict / discard | `m3-start-flow.html` | `renderTemplateStartSheet` `app-views.js:654`, `renderCancelWorkoutSheet` `app-views.js:780` |
| Readiness log & adjustment review | `m3-start-flow.html` | `renderTemplateStartSheet` readiness steps `app-views.js:688-752`, `renderReadableReadinessChange` `app-views.js:759` |
| Mesocycle builder | `m4-mesocycle.html` | `renderGuidedMesocycle` `app-views.js:2022`, `renderGuidedMusclePrioritySummary` `:1985`, `renderGuidedViabilityFindings` `:1896`, `renderGuidedTemplateReview` `:1883` |
| Lift analysis & chart point | `m5-analysis.html` | `renderLiftProgress` `app-analysis.js:1434`, `renderChart` `:1192`, `renderChartPointDetail` `:1257`, `renderExerciseExpectations` `:1399` |
| History | `m5-analysis.html` | `renderHistory` `app-analysis.js:185`, `renderExerciseHistory` `:223` |
| Settings & data | `m6-settings.html` | `renderSettings` `app-analysis.js:1631`, `renderAlertSetting` `:1609`, `renderPwaSetup` `:1615` |
| Destructive / clear data | `m6-settings.html#danger-zone` | `renderClearDataSheet` `app-workout.js:39` |
| System states | `m6-settings.html#state-system` | `renderUpdateBanner` `app-views.js:183`, destination error in `renderViewSafely` `app-views.js:229` |

Imperative DOM patches bypass full re-render and **must be kept in sync** with any set-row
markup change: `applyCompletedSetVisual` `app-views.js:120`, `applyCurrentSetVisual` `:140`,
`updateWorkoutStatusDom` `:110`, `syncTimerDom` `:159`, `removeTimerDom` `:177`.

Focus restoration uses an allowlist of `data-action` descriptors, not node references
(`app-foundation.js:71-82`). Renaming or removing a `data-action` breaks focus restoration.

**Known dead code** — decide explicitly, do not silently revive:
`renderTemplates` hardcodes `const volumeFlags = []` (`app-analysis.js:6`) and
`renderTemplateCard` hardcodes `const advice = null` (`app-analysis.js:134`).

---

## 6. Phase plan

Sequenced so no two phases write the same file concurrently. One worktree per phase.
Each phase is independently shippable and independently verifiable.

### Phase 1 — Design system foundation *(unblocked, start here)*
**Owns:** `index.html` `<style>` block only.
Port `merged.css` into the inline stylesheet as classes: confidence layer, delta layer, the
`.diff` spine, `.tap`, `.rollup`, `.callout`, `.meter`. Add nothing to any `app-*.js`.
Ship behind no flag — unused CSS is inert.
**Gate:** entropy ceilings hold; `npm run audit:ui` baselines unchanged (no markup changed yet).

### Phase 2 — Prescription & evidence *(unblocked)*
**Owns:** `app-views.js` prescription functions (`:1476`, `:1529`, `:1553`, `:1572`).
Replace nested `<details>` with the always-visible claim + evidence pattern. This is the
highest-value, lowest-risk screen: it is where the current nesting hurts most and it is not
the active-workout hot path.
**Gate:** `npm test`, `npm run audit:ui`, plus accessibility — removing disclosures changes
focus order and `aria-expanded` semantics.

### Phase 3 — Today, Progress, Plan, Completed summary *(unblocked, parallelisable)*
**Owns, one worktree each, no overlap:**
- 3a `renderLiftHome` (`app-views.js:323`)
- 3b `renderProgressOverview` (`app-views.js:386`)
- 3c `renderTemplates` / `renderTemplateCard` (`app-analysis.js:2`, `:124`)
- 3d `renderCompletedWorkoutSummary` (`app-history.js:644`)

3a, 3b, 3d all touch `app-views.js`/`app-history.js` — **3a and 3b must serialise**, they share
a file. Drop the template completion rate from 3c unless §4 confirms the data exists.

### Phase 4 — Active workout, V3 Progressive *(unblocked; still runs after Phases 1–3)*
**Owns:** `renderWorkout`, `renderExercise`, `renderSet`, `renderTimer`, and the five
imperative DOM patchers.
Target: `m1-workout-variants.html` screen `v3-progressive`.

Highest risk in the repo. `tests/ui/critical-workout-lifecycle.spec.js` and
`scripts/test-workout-page-density.js` guard it. `ui_design_system_auditor` is instructed to
protect Lift and Dashboard — route this through it before merge.

**The two-mode set row is the hard part.** Per §1.1, a logged set renders the full
plan │ actual │ delta spine and a pending set renders a single quiet target line. Consequences:

- `renderSet` (`app-views.js:1382`) must emit two distinct markup shapes, not one shape with a
  modifier class.
- The imperative patchers bypass full re-render and currently mutate classes and text in place:
  `applyCompletedSetVisual` (`app-views.js:120`), `applyCurrentSetVisual` (`:140`),
  `updateWorkoutStatusDom` (`:110`), `syncTimerDom` (`:159`), `removeTimerDom` (`:177`).
  Completing a set now **changes the row's structure**, so a class flip is no longer sufficient.
  Either have the patcher replace the row's subtree, or re-render the exercise. Decide
  deliberately and record it in `docs/UI_UX.md` — this is the most likely source of a subtle
  logging bug.
- Verify focus is not lost when a row swaps mode mid-session. Focus restoration keys off a
  `data-action` allowlist (`app-foundation.js:71-82`), not node identity.
- The session roll-up (sets, mean RPE with drift, adherence) updates on every logged set. Confirm
  it is cheap enough to recompute in the patch path rather than forcing a full re-render.

### Phase 5 — Start & readiness flow *(runs after Phase 3)*
**Owns:** `renderTemplateStartSheet` (`app-views.js:654`), `renderCancelWorkoutSheet`
(`app-views.js:780`), `renderReadableReadinessChange` (`app-views.js:759`).
Mockup: `m3-start-flow.html`. The adjustment-review screen is the valuable one — it makes
readiness adjustments legible instead of silent. Modal state sets `inert`/`aria-hidden` on the
header, main, and nav (`app-views.js:13-31`); preserve that.

### Phase 6 — Remaining surfaces *(runs after Phase 3, parallelisable)*
One worktree each, no shared files:
- 6a Mesocycle builder — `renderGuidedMesocycle` and children (`app-views.js:1883-2058`). Mockup `m4-mesocycle.html`.
- 6b Lift analysis & history — `app-analysis.js:185`, `:223`, `:1192`, `:1257`, `:1399`, `:1434`. Mockup `m5-analysis.html`.
- 6c Settings & data — `renderSettings` (`app-analysis.js:1631`) and children. Mockup `m6-settings.html`.
- 6d Destructive & system states — `renderClearDataSheet` (`app-workout.js:39`), `renderUpdateBanner` (`app-views.js:183`), `renderViewSafely` error branch (`app-views.js:229`). Mockup `m6-settings.html`.

6b and 6c both write `app-analysis.js` — **they must serialise.** 6a and 6d are independent.

`m6-settings.html#state-system` is a **reference sheet showing four states together**, not one
screen. Implement each state in its own surface.

### Phase 7 — Documentation reconciliation
`docs/UI_UX.md:233` still mandates five-tab copy ("Workout, Dashboard, Templates, Charts,
Settings") while the shipped nav is Today / Plan / Progress / More. Resolve rather than
inherit. Record the confidence-level mapping from §4.

---

## 7. Repo rules that break the installed app if missed

1. **`www/` is generated, not source.** Edit root web files, then `npm run sync:web`.
   Never hand-edit `www/`. A source edit without a sync makes the native app diverge.
2. **Advance `CACHE_NAME` in `sw.js`** for any cross-file runtime contract change. The cache
   version is also the installed-PWA update signal. Without a bump, a controlled page can pair
   new UI with a stale cached engine and `registration.updatefound` never fires. **Every phase
   here needs a bump.**
3. **Privacy review before every commit.** Inspect `git status` and the staged file list.
   `.gitignore` and `.vercelignore` are safeguards, not substitutes (`AGENTS.md` §Publishing).
4. `artifacts/` is gitignored — rendered PNGs are not committed.

---

## 8. Verification

Per phase, before requesting review:

```bash
npm run check:public
```

That composes lint, workflows, privacy, dependency audits, tests, research validation, and PWA
verify — **in that order**.

### An aborted gate is not a passed gate

`check:public` runs stages sequentially and stops at the first failure. Privacy runs *before*
tests, so a privacy failure means **the test gate never executed**. Phase 2 shipped a review
report this way: privacy aborted, `npm test` never ran, and three existing tests were left
failing against markup the phase had deleted.

If `check:public` stops early for any reason, run the remaining stages directly before claiming
verification. At minimum:

```bash
npm test
```

`npm test` auto-discovers all `scripts/test-*.js` (51 at time of writing). A phase is not
verified until it has run to completion and passed. Report the pass count.

**Corollary — reconcile tests, never just add one.** Per `AGENTS.md`, when code and tests
disagree you must not silently choose one. Removing a class or markup shape that an existing
test asserts is a *contradiction to resolve*, not a detail. Before deleting any markup, grep the
test suite for it. Adding a new test asserting the opposite while the original still asserts the
original is how Phase 2 produced three failures nobody saw.

Then, for any phase that changes markup:

```bash
npm run audit:ui
```

Playwright goldens live in `tests/ui/__screenshots__/{mobile,desktop}/`. **This work invalidates
them by design.** Regenerate with `npm run audit:ui:update` only after a human has looked at the
diff — an auto-accepted baseline hides regressions.

The audit also enforces per-tab axe checks (wcag2a/2aa/21aa incl. colour-contrast), horizontal
overflow, clipped controls, and zero console errors, at 320/390/640/768/1280px.

Targeted guards worth running directly:

```bash
node scripts/test-workout-page-density.js
```

Others: `scripts/test-rest-timer-presentation.js`, `scripts/test-workout-grade.js`,
`scripts/test-destination-render-recovery.js`.

**Contrast is a real risk.** Confidence level 2–3 uses `--muted` on transparent, and level 1
uses `--muted-2`. Verify against all ten colour packages in both themes, not just the
`signal-garden` default the mockups render in.

---

## 9. Out of scope

**Designed but deliberately not covered:** the mockups show 24 screens across the six files.
Surfaces with no mockup — import/export detail, the Strong CSV migration audit, sync consent
detail, the manual review queue, per-set tools and overrides
(`renderPrescriptionOverrideControls` `app-views.js:1136`, `renderStandardWorkloadControls`
`app-views.js:1180`) — keep their current design. Apply the token and component rules from §2
where they touch a redesigned surface, but do not redesign them from imagination. Record the
remaining gap in `docs/ROADMAP.md`.

**Known dead code, decide explicitly:** `renderTemplates` hardcodes `volumeFlags = []`
(`app-analysis.js:6`) and `renderTemplateCard` hardcodes `advice = null` (`app-analysis.js:134`).
The mockups do not assume either is revived.

`design-concepts/logo/` is **separate work by a different session** and is not covered by this
handoff. Do not implement, delete, or reconcile it here. If a logo direction is chosen it needs
its own task — it touches `resources/` icons, `manifest.webmanifest`, the apple-touch and splash
assets, and the `.brand-mark` in `app-views.js:19-43`.

---

## 10. Definition of done

Per `AGENTS.md`: implementation tested, governing documentation updated (or explicitly reviewed
and reported as still accurate), staged content privacy-reviewed, and the change pushed under
the publishing policy. The final report must name the documentation files updated and the
pushed commit identifier.

Do not self-approve or merge. Route through independent review before publication.
