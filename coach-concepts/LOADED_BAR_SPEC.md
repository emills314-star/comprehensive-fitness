# Loaded Bar: UI spec for coach v1

> **Status:** PARTIALLY IMPLEMENTED locally. Active-workout equipment, table, rest and deload presentation and history/progress deload views exist; coach targets remain hidden behind the closed gate. Today and Settings are implemented locally; Last night and the bounds flag are PLANNED. The owner reports synchronized packaging and a passing 29-asset PWA check; full Playwright, visual acceptance and physical-device verification remain pending.
> This spec maps the concept onto the engine that actually exists, and it is the input to
> Step 4 (the Strong-style set table) in the coach build.
> **Governing contract:** [`docs/redesign/coach/COACH_V1_CONTRACT.md`](../docs/redesign/coach/COACH_V1_CONTRACT.md)
> (D-028). Where this spec and the contract differ, the contract wins; D-029 records the mid-session suspension deviation that needs review.
> **Concept reference:** [`10-loaded-bar.html`](10-loaded-bar.html) (exploration; its scenario
> deliberately goes beyond v1).

## 1. The idea in one line

Every exercise is drawn as the equipment you are using, loaded exactly as the coach's target
says. The coach coaches by changing what is on it, and the Strong-fast set table sits right under
it.

## 2. What v1 can and cannot show

The concept was drawn before the engine existed. The engine (`coach-engine.js`) is deliberately
narrower, and the UI must show only what it decides.

| In the concept | In v1 | UI consequence |
| --- | --- | --- |
| A flag with "3.4σ beyond your usual drop" | No statistical bounds flag. Between sets, a set that falls ≥ 2 reps short of its target or is logged at RPE ≥ eMax + 1 moves the **next untouched set down one step** (§5) | The "flag" is the step change itself. It shows on the bar and set table, with the engine's reason line in the collar tag |
| Back off sets 3–4 to 165 (−11%) | One step per row: −1 rep, or −Δ load only when the row is already at rMin and Δ ≤ 5% | Show the actual step, e.g. set 3 "9 → 8 reps", or "185 → 180" with the plate swap |
| Ranked causes including HRV and sleep | Recovery is display and shadow only (§8) and is never a reason | No cause list. The reason line states the rule's evidence ("because set 2 was RPE 10") |
| Options A/B/C | No alternatives. Erik types his own values or taps Undo | No option sheet. Undo on the revised row is the "choose another" |
| Trim incline, weekly chest 15/16 | The coach never touches other exercises or weekly volume (§1) | Nothing about other lifts or weekly volume |
| Thursday: hold, raise rule, deload watch rule, HRV < 45 → 175 | Next session is a fresh session-start prescription with codes and one reason line (§4) | The next session shows the start target, plus a reason line only when it differs from last time |

Rendering the full concept flag would need an engine change: a calibrated per-lift
set-to-set-drop baseline and a back-off rule beyond one step. Decided 2026-11-02: v1 ships
without it, and it becomes the first engine upgrade after replay calibration (§6.3).

## 3. Screens

### 3.1 Today (planned workout)

- Routine name, exercises as small equipment glyphs with their start targets.
- **Start** (primary) and **Injured — skip** (quiet, red outline) side by side. Skip writes
  `skippedSessions[]` (`reason: "injury"`), moves Today to the next workout, and history shows
  "Skipped · injured". It is never shown as a failure. It **replaces** today's pre-start "Pain or
  injury" readiness toggle.
- **"Worse than usual"** tap before Start sets `readiness: "meaningfully_poor"` (§4.5). "Better
  than usual" changes nothing in v1, so v1 shows only the one tap.
- **Last night** line, one quiet line: sleep · HRV · resting HR, each against the 28-day
  baseline when at least 14 valid days exist (otherwise values only), with the measurement date.
  No score and no colour judgement beyond "below/above your usual" (§8).

### 3.2 Active exercise (the logging screen)

Top to bottom:

1. **Session header:** routine, elapsed time, **Session deload** switch (`session.isDeload`),
   Finish. The session menu keeps the existing session-level pain/illness toggle as the stop
   path (`session.recovery` → resolver `stop_or_skip_work`). Nothing moves to the exercise level.
2. **Equipment render**, loaded to the active set's target (§4).
3. **Total and per-side plates:** "185 lb · each side 45 + 25". No arithmetic block.
4. **Collar tag (reason line):** `exercise.reasonText`. Shown only when today's target differs
   from last time or after a between-set revision. It is one line of plain text hanging from the
   collar: no card, badge or icon set.
5. **Set table**: `SET | PREVIOUS | LB | REPS | RPE | ✓` (§9):
   - **SET** is the type flag (W, 1…n, D, F; T/B where used). Tapping it opens a W/D/F picker.
   - **PREVIOUS** is the same-position set from the last comparable session, e.g. `185 × 10 @ 8`.
   - **LB / REPS** show the current target as placeholders. ✓ with an empty field accepts the
     placeholder (`accepted_target`); typing replaces it (`entered`).
   - **RPE** starts empty and is never prefilled; it uses a 6–10 number pad in 0.5 steps.
   - **✓** completes the set and auto-starts rest.
   - **Revised rows** carry a small marker and **Undo**. Undo calls `undoRevision` and locks the
     row (§5).
   - **Optional rows** (`optional_last_set`) read "optional" and can be completed or skipped.
6. **Rep pips** under the active row show the target reps (visual only). They fill as reps are
   logged. They are not the input; the REPS field is.
7. **Rest clamp:** the collar clamp is the rest timer. It starts on ✓ with the role's rest
   default and shows a countdown, −15 s, +15 s, Skip, overtime count-up, and a notification
   where permitted.
8. **Exercise menu:** "This was a deload" (`exercise.isDeload`), plus the existing per-exercise
   actions.
9. **Up next:** the remaining exercises as small equipment glyphs with their start targets.

### 3.3 A between-set revision (the v1 "flag")

When `reviseAfterSet` lowers the next row:

- The **set table** row animates from the old target to the new one and keeps a "was" value
  (e.g. ~~9~~ 8, or ~~185~~ 180).
- **Load step:** the bar re-renders with the plate change spelled out ("Swap each 25 for
  10 + 10 + 2.5"). This is Loaded Bar's signature moment, and it is real whenever the engine
  changes load.
- **Reps step:** the bar stays; the pips for the next set drop by one.
- The **collar tag** shows the engine's sentence, e.g. "Set 3: −1 rep because set 2 was RPE 10."
- `increment_too_coarse` shows "Holding 185 lb: …" with the engine's blocker text.
- After a downward revision there is no upward revision in that session (§5), so the UI never
  shows a reversal.

### 3.4 Next session preview

From the session-start prescription: start targets per exercise, rendered as the equipment
pre-loaded, with the session-start reason line when it differs from last time, for example
`deteriorating_hold`, `reduce_load`, `injury_reentry`, `layoff_reentry`, `deload_marked`,
`add_set` or `remove_set`.

### 3.5 History and Progress

- Deload sessions and exercises carry a small "Deload" tag; their points are drawn distinctly
  and excluded from records and trends.
- Injury skips appear as a quiet "Skipped · injured" entry.

## 4. Equipment and plate rules (UI-owned)

The contract does not model equipment, so these are UI settings and derivations:

- **Equipment class** per exercise: `barbell`, `dumbbell`, `stack` (pin-loaded machine or cable),
  `plate_loaded`, `bodyweight` or `generic`. Derive it in this order, and let Erik correct it
  once per exercise:
  1. the saved `equipmentClass`;
  2. the Strong name suffix: (Barbell) and (Smith Machine) → `barbell`, (Dumbbell) →
     `dumbbell`, (Cable) and (Machine) → `stack`, (Bodyweight) and (Assisted) → `bodyweight`;
  3. the `equipment` field in `exercise_database.json` (barbell* → `barbell`, dumbbell* →
     `dumbbell`, cable* → `stack`, machine → `stack` (correctable to `plate_loaded`),
     bodyweight* → `bodyweight`). It covers only 62 of the 149 identities in Erik's history;
  4. otherwise `generic`: a plain weight block with the number. Ambiguous values stay `generic`
     until Erik picks.
- **Barbell:** bar weight setting (default 45 lb / 20 kg) and a plate inventory per unit (lb: 45,
  35, 25, 10, 5, 2.5; kg: 25, 20, 15, 10, 5, 2.5, 1.25). Per side = (target − bar) / 2,
  chosen by bounded exact search: maximize load without exceeding the target, then use the fewest plates, breaking ties with the heaviest descending plate list. Search is limited to 30 plates per side, 64 inventory entries and 10,000 visits; when no optimum can be established within those limits, a generic numeric block replaces the plate drawing. If the inventory cannot make the target exactly, show
  the nearest lower loadable weight with "can't load 182.5 exactly" when the target is at least the bar weight. A target below the bar shows "lighter than the bar". Never change the target.
- **Plate-change instruction:** a diff of the per-side plate lists, phrased as "Swap each 25 for
  10 + 10 + 2.5" or "Add a 2.5 each side". Only shown when the load changes.
- **Dumbbells:** a pair labelled "55s". **Stack:** the pin at the target. **Bodyweight:** a
  figure glyph; reps only (v1 progresses reps only).
- `factual_only` exercises (duration, distance, unknown resistance) show Previous values only:
  no targets, no tag.

## 5. Behaviour that must hold

- No screen reads the coach module directly (§6); targets come through the resolver channel.
- In effective Show mode, failed, suspended or factual-only coaching has no fallback targets, equipment load or tag; Previous values still show and logging never blocks. Shadow/off use factual local placeholders.
- While an explicit pain/illness exception is unresolved, targets are hidden (§6.1); if Erik
  continues, session coaching is suspended for the remainder of that session (D-029, NEEDS REVIEW).
- A **Between-set revision off** setting hides revisions and the tag while keeping start targets.
- Actual RPE is never populated from targets, defaults or previous sets (§7).
- Light theme with the shipped palette; semantic roles as in the concepts: blue = current/action,
  green = done, amber = coach change, gold = rest, red = destructive only.

## 6. Resolved questions (2026-11-02)

1. **Pain/illness entry point.** It is already session-level (readiness toggles feed
   `session.recovery` and the single resolver candidate `stop_or_skip_work`). On Today, "Injured
   — skip" replaces the pre-start "Pain or injury" toggle. During a workout the session-level
   pain/illness toggle stays as the stop path (§3.1, §3.2).
2. **Equipment data.** Derived in the order given in §4.
3. **Concept-level flag.** It needs engine work (a calibrated drop baseline and a multi-step
   back-off). It waits until after replay calibration, where targets are currently missed at the
   target load 37% of the time versus 12% for repeating last time. v1 ships with the one-step
   behaviour in §3.3 (option A, 2026-11-02).
