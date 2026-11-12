# Coach concepts — shared brief (read fully before designing)

You are designing ONE of ten radically different UI concepts for a strength-training app whose
owner wants a **personal coach that steers his workouts**. The app reads his workouts (sets, reps,
load, reps-in-reserve) and his Fitbit recovery (sleep, HRV, resting heart rate), then adapts each
session for progressive hypertrophy. The owner's brief, verbatim in spirit: *"This is a blue-ocean
task — dream big. If the coach sees me flagging on a lift outside of normal bounds, it tells me and
suggests the next best action for this session and the next session. BE BOLD."*

He already uses Strong. Whatever you build must keep **Strong-fast logging**: load and reps
prefilled, previous performance visible, one tap to complete a set. Everything else — layout,
structure, typography, iconography, motion, interaction grammar, tone — is yours to reinvent
within your concept's thesis.

## Deliverable

Exactly one self-contained HTML file at the path given in your concept brief
(`coach-concepts/NN-name.html`). Write nothing else anywhere in the repository. Do not modify any
existing file. No git operations of any kind (no add, commit, branch, push).

The page presents the concept to the owner for comparison:

1. A short **concept header** at the top of the page: number + name, the one-line thesis, and three
   short lines — *How it feels*, *How the coach speaks*, *The trade-off* (be honest).
2. A horizontal row (wrapping is fine) of **phone frames**, each exactly **390 × 844 CSS px**, each
   with a small caption above it. Every frame is an element with `class="phone"` and a
   `data-frame` attribute (`F1` … `F5`, optional `F6`), `overflow: hidden`, so a script can
   screenshot each one. Draw a simple status bar (time 10:24) inside each frame. Do not draw a
   physical device bezel or notch artwork beyond a minimal rounded frame.

## Required frames (same story in all ten concepts)

| Frame | Caption | Must show |
| --- | --- | --- |
| F1 | Lifting | The concept's primary in-session logging view **before** the flag. Bench set 1 is logged (185 × 9), set 2 is next/active. Load, reps, previous, and a one-tap complete must be obvious. |
| F2 | The flag | The moment the coach flags bench set 2 (185 × 6) as **outside normal bounds**: what happened, expected vs actual, how far outside normal, and *why* (the ranked causes below). This is the hero frame — make it unforgettable. |
| F3 | Next best action · today | The coach's recommended adjustment for the rest of **this session**, the alternatives, and the downstream effect. Clear accept / choose-another / dismiss. A small "Something hurts" escape must exist (it would route to pain handling; you need not draw that flow). |
| F4 | Plan applied | The session after accepting the recommendation: bench set 3 now 165 × 8, the rest timer holding to the full 2:30, incline reduced to 2 sets. Logging continues Strong-fast. |
| F5 | Next session | The coach's plan for the **next** Upper A (Thu 5 Nov): bench holds at 185, progression rule, the watch rule, and the low-HRV contingency. |
| F6 (optional) | Your choice | One extra frame that best sells the concept (e.g., morning readiness, progress, how the coach shows it was right). |

## The shared scenario (use these numbers exactly — every concept tells the same story)

All data is synthetic. Do not invent other personal data. Units are pounds.

**Session:** Upper A · Hypertrophy block 2 · Week 4 of 6 · Sat 31 Oct · elapsed 24:10 at the flag ·
planned ~62 min.

**Recovery this morning (Fitbit):**
- Sleep 5 h 48 m (14-day average 7 h 21 m)
- HRV 38 ms (30-day baseline 52 ms, −27%)
- Resting HR 61 bpm (baseline 55, +6)
- Daily readiness 41 (your typical 70–85)

**Plan:**
1. Barbell Bench Press — 4 × 8–10 @ 185 lb, 2 reps in reserve (RIR 2), rest 2:30.
   Warm-ups done: 45 × 10, 95 × 8, 135 × 5, 165 × 3.
   History: Oct 24 → 185 × 10, 10, 9, 9 · Oct 17 → 180 × 10, 10, 9, 9 · Oct 10 → 175 × 10, 10, 10, 9.
2. Chest-Supported T-Bar Row — 4 × 10–12 @ 90 lb (last: 90 × 12, 12, 11, 10)
3. Incline Dumbbell Press — 3 × 10–12 @ 55 lb dumbbells (last: 55 × 12, 11, 10)
4. Lat Pulldown — 3 × 10–12 @ 140 lb (last: 140 × 12, 11, 11)
5. Cable Lateral Raise — 3 × 12–15 @ 15 lb (last: 15 × 15, 14, 13)

**What happens:**
- Bench set 1: 185 × 9 @ RIR 2 — inside bounds (a rep under last week, expected given recovery).
- Rest taken before set 2: **1:32** of the prescribed 2:30.
- Bench set 2: **185 × 6 @ RIR 0** (a grinder).

**Why it is outside normal bounds:**
- Expected set 2 today: **8–9 reps** (recovery-adjusted band 7–9).
- Your usual set-to-set drop on this lift: **0.6 ± 0.7 reps** (last 12 sessions). Today's drop: **3 reps** —
  about **3.4 SD** beyond your normal.
- Estimated 1RM from set 1: **253 lb**, in line with your 4-week trend (249–254). Set 2 implies 222 lb (−12%).

**Ranked causes (coach's read):**
1. Short rest — 1:32 of 2:30 (61%). Most likely main driver.
2. Low recovery — HRV −27%, 5 h 48 m sleep.
3. Not a strength loss — set-1 e1RM matches your trend.

**Next best action — this session (recommended):**
- Bench sets 3–4: **drop to 165 lb × 8 @ RIR 2** (−11%), full 2:30 rest; the timer holds the next
  set until 2:30. Plates: swap each 25 for a 10 + 5 (per side: 45 + 10 + 5).
- Incline DB Press: **3 → 2 sets**, 55 lb × 10–12.
- Pulling work unchanged. Session time ≈ −1 min.
- Weekly chest volume: **15 of 16 planned sets** — still inside your 12–18 target.

**Alternatives:**
- B: Stay at 185, rest 3:00, cap at RIR 1 (expect 6–7 reps). More fatigue carried into Thursday.
- C: Stop bench here and move on. Loses 2 productive chest sets (weekly chest 13 of 16).

**Next best action — next session (Upper A, Thu 5 Nov):**
- Bench: **hold at 185 lb × 4 × 8–10**, rest 2:30 enforced. No load increase, no decrease.
- Progression resumes when sets 1 and 2 are both ≥ 9 reps at RIR ≥ 1 → then 190 lb.
- Watch rule: if bench flags again Thursday with normal recovery → a one-week pressing deload
  (−10% load, −1 set).
- Contingency: if Thursday-morning HRV is under 45 ms → start bench at 175 lb.

## Owner additions (31 Oct, after the first round)

**F1 and F4 now follow the fixed logging contract in `brief/logging-contract.md`.** Where it
differs from anything below (RPE instead of RIR entry, "Injured, skip" only on the planned
session, no readiness score), the contract wins.

These come from the owner and apply to every concept. Render them in your concept's own visual
language.

1. **Deload marker on every exercise.** Each exercise carries a "This was a deload" toggle (off by
   default). When it's on, that exercise's sets don't count toward progression or the coach's
   normal bounds. Show it in F1 on bench (off), and wherever upcoming exercises are listed.
2. **Deload marker on the session.** The session header carries the same toggle for the whole
   session (off in F1), so a planned light day never reads as a regression.
3. **Injury lives at the session level only.** The owner never trains injured, so an injury
   button on an exercise makes no sense. Replace the exercise-level "Something hurts" escape on
   F2/F3 with a session-level **Injury** control in the session header or menu (end or skip the
   session as injury). On F5, Thursday's plan needs a clear **"Skip · injury"** action, with the
   coach's note that a session skipped for injury doesn't count as a failure or a missed
   progression.

Fixes after the first review also apply: option C leaves weekly chest at **14 of 16** (not 13);
causes are never stated as certainties ("no sign of strength loss", not "ruled out"); F1 shows a
way to record actual RIR; write "3.4σ beyond your usual drop" with no minus sign.

## Colour — the one constant (hard rule, machine-checked)

Link `palette.css` (`<link rel="stylesheet" href="palette.css">`). It is a verbatim copy of the
production app's colour tokens. You may ONLY use colour through `var(--token)` from that file,
`color-mix(in srgb, var(--a) N%, var(--b))` or `color-mix(in srgb, var(--a) N%, transparent)`,
`transparent`, and `currentColor`. **No hex, rgb(), hsl(), or named colours (white, black, …)
anywhere in your file**, including SVG attributes and inline styles. For SVG, colour via CSS
classes or `style="fill: var(--x)"` — not `fill="#…"`.

Semantic roles are fixed across all ten concepts (the scheme stays the same; only its use changes):

| Token | Role |
| --- | --- |
| `--current` / `--action` / `--green` | **All the same blue (#176fd1)** despite the name `--green`. Current / next action, primary buttons, live state. |
| `--green-2` | Deeper blue: pressed state, strong accent text. |
| `--current-dark`, `--green-dark`, `--panel-2`, `--surface` | Pale blue tints for selected rows and quiet backgrounds. |
| `--success`, `--success-dark` | Done / logged / inside bounds. |
| `--amber`, `--panel-3` | **The coach's out-of-bounds flag** (amber ink, pale yellow surface). |
| `--rest-accent`, `--rest-text` | Rest timer. |
| `--red` | Destructive actions and the pain/stop escape only — not the bounds flag. |
| `--text` | Navy ink. May also be used as a dark surface (with `--on-action` / `--bg` text on it). |
| `--muted`, `--muted-2`, `--line`, `--line-strong` | Secondary text and rules. |
| `--bg`, `--panel`, `--surface-strong`, `--input-bg` | White surfaces. |

## Everything else must be different

- Use the typeface assigned in your concept brief (Google Fonts `<link>` is fine; include a system
  fallback). Your type scale, spacing, radii, iconography, and component shapes are your own.
- Do not reuse the production app's component look (white cards with blue pill buttons, nested
  disclosures). Do not reproduce Strong's visual design either — keep its *speed*, not its *look*.
- Your concept must not resemble any direction explored before. Prior directions (do NOT
  resemble): music-sequencer lanes (Dual Track), bento dashboard tiles (Bento Studio), a
  foreground card stack (Set Stack), a time spine/timeline (Weekline), mission preflight/telemetry
  console (Mission Console), a dated training notebook/ledger (Iron Ledger), a sports broadcast
  scoreboard/ticker (Stadium Live), a newspaper/editorial front page (Editorial Performance), an
  anatomical body map (Body Atlas), a chat transcript with bubbles (Coach Thread), a command
  line/command palette (Command Gym), a workbench with tool trays (Training Workshop), a node or
  dependency graph (Program Circuit), a radial orbit with satellites (Orbit), a quest map/route
  with unlocks (Quest Map), a gym-vs-study two-mode split (Two-Speed), fractal allocation bars
  (Budget), solid/tinted/dashed certainty weighting (Confidence), and a plan|actual|delta diff
  table (Plan vs Actual).
- Your concept must also stay in its own lane relative to the other nine in this set:
  01 Control Chart · 02 Earpiece · 03 Futures · 04 Sentence · 05 Ambient · 06 Hypothesis ·
  07 Instrument · 08 Lint · 09 Engine · 10 Loaded Bar.

## Quality bar

- Production-grade visual craft. This is being compared against nine others by someone who asked
  you to BE BOLD. Commit fully to the thesis; a timid version of a bold idea loses.
- Real copy everywhere. No lorem ipsum, no placeholder boxes. The coach's voice is direct, warm,
  plain-spoken, and specific — it cites the numbers above. No medical claims, no "AI magic"
  language; the coach reasons only from the data listed.
- Legibility: body text ≥ 13 px inside frames; nothing below 11 px. Touch targets ≥ 44 px.
- Inline SVG for any illustration or icon. No external images, no emoji as icons.
- Scripts are optional. If used: inline, classic (no `type="module"`, no `import`, no top-level
  `await`), no external libraries, and the page must look complete with scripts disabled.
- The file must render correctly when opened directly from disk (file://) at 1x.

## Self-check before you finish

Run `node coach-concepts/check.js NN` (your number). It verifies the palette rule and the frame
contract. Then run `node coach-concepts/capture.js NN` and look at every PNG it writes to
`coach-concepts/shots/` — fix anything clipped, overlapping, cramped, or off-thesis. Iterate until
you would be proud to put it in front of the owner. Your final message: the file path, a three-line
summary of the concept, and anything you could not do.
