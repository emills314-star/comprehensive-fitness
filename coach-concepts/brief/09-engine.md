# 09 · Engine — `coach-concepts/09-engine.html`

**Thesis:** A chess engine for your sets. Every set is a move; the coach is the engine — it
annotates each move, shows a live evaluation of the session, and always knows the best line from
here, for today and for the next game.

**Organizing primitive:** the analysis board. A vertical **evaluation bar** at the left edge shows
the session's balance of productive stimulus vs. accumulated fatigue (e.g., "+1.4"). The
**move list** is the logger: each set is a move with its annotation glyph (`!` strong, `!?`
interesting, `?!` dubious, `?` mistake). The engine panel shows the **best line** (principal
variation) for the rest of the session with alternatives ranked by eval. Logging is Strong-fast:
the engine's suggested move is prefilled; one tap plays it.

**Frames:**
- F1 — Move list: warm-ups as "book moves", set 1 `185 × 9 !` (eval +1.2), set 2 to play with
  "Best: 185 × 8–10 @ RIR 2"; eval bar steady; engine depth/line shown subtly ("depth: 12 sessions
  · recovery-adjusted").
- F2 — The flag: set 2 `185 × 6 ?` — "Mistake." The eval bar swings down (+1.2 → +0.3). Engine
  commentary explains the swing: expected 8–9, drop of 3 vs your 0.6 ± 0.7 (3.4σ); causes ranked:
  rest 1:32/2:30, HRV −27% / sleep 5 h 48 m; "not a strength loss — e1RM 253 holds your 249–254
  trend".
- F3 — Engine lines, ranked: **1. 165×8 · 165×8 · Incline 2×10–12 → +0.9 (best)** /
  2. 185×6–7 (rest 3:00, RIR 1) → +0.4 / 3. Stop bench → +0.1, each with a short consequence
  (chest 15/16 · more fatigue into Thu · chest 13/16). "Play best line" + choose another + small
  red "Something hurts".
- F4 — Best line accepted: upcoming moves queued (165 × 8, rest 2:30 held, incline 2 sets), eval
  recovering to +0.9.
- F5 — "Prepared opening · Thu 5 Nov": the opening book for Upper A — main line `Bench 185 × 4 ×
  8–10, rest 2:30` (hold); "if S1 & S2 ≥ 9 @ RIR ≥ 1 → next game 190"; variation "HRV < 45 → 175";
  and the trap to avoid: "second flag with normal recovery → pressing deload".

**Feel:** a serious, beautiful analysis board (think a premium chess-analysis app) — dense but
elegant, with the eval bar as the signature element. Smart, not gamified.

**Type:** Manrope + Roboto Mono.

**Must not become:** gamification (XP, levels, quests, badges) or a sports scoreboard. It's
analysis, not play.
