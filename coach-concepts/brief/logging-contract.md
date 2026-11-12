# Logging-screen contract (fixed, 31 Oct)

The coach engine is being built in parallel, and its set-table UI will be built from whichever
concept the owner picks. So every concept's **logging screens (F1 and F4)** must follow these
rules. Keep your concept's character everywhere else; F2/F3/F5 stay free, apart from rules 4–6,
which apply wherever their elements appear. The full engine contract will live at
`docs/redesign/coach/COACH_V1_CONTRACT.md`.

1. **Per-set targets** for load, reps and number of working sets, revised after each completed
   set. Only untouched later sets change, one step at a time, visibly, with **undo**. F4 shows
   this: sets 3–4 changed 185 → 165, marked as changed by the coach, with an undo affordance.
2. **The Strong behaviours the owner named:**
   - a **Previous** column (last time's load × reps per set);
   - **tap the check to accept** the placeholder targets (load and reps are placeholders, accepted
     by the check);
   - **set-type flags**: W (warm-up), working (the set number), D (drop), F (failure);
   - a **rest timer that auto-starts on the check**, with **−15s / +15s** and **Skip**.
3. **RPE is never prefilled.** The owner types his own RPE. Show an RPE entry that is empty until he
   sets it (the target can appear as a quiet hint, e.g. "target RPE 8"). The scenario's "RIR 2"
   equals RPE 8, and "RIR 0" equals RPE 10, so set 2 was logged as RPE 10.
4. **"This was a deload" toggle** on each exercise and on the session (off in this scenario).
5. **"Injured, skip"** is an action on the **planned session only** (Thursday's session in F5, or
   any not-yet-started session), never per exercise and not inside the active logging screen.
   Remove the per-exercise "Something hurts" escape. The coach says plainly that a session skipped
   for injury doesn't count as a failure or a missed progression.
6. **Fitbit appears only as a quiet "Last night" line**: sleep 5 h 48 m (avg 7 h 21 m) · HRV 38 ms
   (baseline 52) · resting HR 61 (baseline 55). **No readiness score, no scores, no badges** —
   remove "readiness 41" everywhere. Recovery may still be cited as a cause in the flag.
7. **One short reason line per exercise when its target changes** (e.g. bench in F4: "Backed off
   after a short-rest grinder; keeps two productive sets"). No cards or confidence meters on the
   logging screen.
