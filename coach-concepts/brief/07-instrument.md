# 07 · Instrument — `coach-concepts/07-instrument.html`

**Thesis:** A training device with one knob. The app is a piece of dedicated, beautifully made
hardware — think premium audio gear or a Braun/Teenage Engineering object — and the whole session
is steered by a single rotary **Effort** knob that the coach turns with you.

**Organizing primitive:** the knob. Its position (as % of the planned load) drives every number on
the device: load, plates, rest, sets. You can turn it; the coach turns it too, and when it does,
you see a ghost pointer and hear (implied) the detent click. Around it: a segment/LCD-style
display (draw segments with CSS/SVG, palette colours only), a row of set LEDs (blue current, green
done, amber flagged), and three physical keys — LOG, REST, SKIP. Logging is one press of LOG
(prefilled numbers on the display; nudge reps with a small up/down rocker).

**Frames:**
- F1 — Device mid-bench: knob at 100%, display "BENCH · 185 × 8–10 · RIR 2 · PREV 10", LEDs:
  set 1 green (9), set 2 blue, sets 3–4 dim. Rest segment display ready.
- F2 — The flag: set-2 LED turns amber; display reads "SET 2 · 6 / EXP 8–9 · −3.4σ"; a scrolling
  dot-matrix line explains ("REST 1:32/2:30 · HRV −27% · SLEEP 5:48 · E1RM 253 = TREND"); the
  knob shows a **ghost pointer at 89%** where the coach wants it.
- F3 — The knob's detents become the options, each engraved on the dial ring: **89% BACK OFF
  (rec.)**, **100% HOLD + REST 3:00**, **0 STOP**. The display previews consequences of the
  hovered detent: "165 × 8 ×2 · INCLINE 3→2 · CHEST 15/16". A small red guarded switch: "PAIN".
- F4 — Knob at 89%: display "165 × 8", plate read-out "PER SIDE 45 + 10 + 5", rest display counting
  down and locked until 2:30, incline LED row showing 2 sets.
- F5 — NEXT mode: a preset card slotted into the device for Thursday — knob locked at 100% "HOLD
  185", a printed label strip "PROGRESS → 190 WHEN S1 + S2 ≥ 9 @ RIR ≥ 1", "2ND FLAG + NORMAL
  RECOVERY → DELOAD PRESSING", "HRV < 45 → START 175".

**Feel:** tactile and covetable — machined edges, subtle highlights built from palette tints, a
navy (`--text`) device body with white/blue legends, satisfying detents. Bold industrial design,
not a dashboard.

**Type:** Chakra Petch for engraved legends + Share Tech Mono for the display.

**Must not become:** a multi-panel console full of gauges (Mission Console). One device, one knob.
