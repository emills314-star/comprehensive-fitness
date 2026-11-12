# 05 · Ambient — `coach-concepts/05-ambient.html`

**Thesis:** The best coach app is one you never open. The coach lives in the phone's ambient
surfaces — the lock-screen Live Activity, the Dynamic Island, a wrist tap on the watch, home-screen
widgets — and the full app is only a fallback.

**Organizing primitive:** the OS surface. Every frame is a lock screen, island, notification,
watch face, or widget drawn convincingly (rendered only in palette colours — e.g., a navy
`--text` wallpaper with soft blue tints from the palette). Logging happens from the Live Activity's
quick actions (rep chips prefilled with the target: "8 · 9 · 10 · other").

**Frames:**
- F1 — Lock screen during bench: Live Activity with exercise, set 2 of 4, "185 × 8–10 · RIR 2",
  previous 10, rest countdown ring in rest gold, and one-tap rep chips to log. Set 1 shown as done.
- F2 — The flag: the **Dynamic Island expands** into an amber alert ("Bench set 2 outside your
  normal"), and a **watch** (drawn within the frame, lower half) shows the wrist-tap version with a
  haptic pattern indicator. The expanded island carries the key evidence compactly: expected 8–9,
  got 6, 3.4σ beyond your normal drop; causes: rest 1:32/2:30, HRV −27%, not strength (e1RM 253).
- F3 — The **expanded notification** with long-press actions: "Drop to 165 × 8 · 2 sets
  (recommended)", "Keep 185 · rest 3:00", "Stop bench", plus "Why?" and a small red "Something
  hurts". Show the downstream line (incline 3 → 2 sets, chest 15/16 this week).
- F4 — Live Activity updated: "Set 3 of 4 · 165 × 8", plate instruction "Swap each 25 → 10 + 5",
  rest ring locked until 2:30, incline now "2 sets".
- F5 — Home screen with widgets: a medium widget "Thu · Upper A — Bench holds at 185" with the
  progression rule, a small widget showing the HRV < 45 → 175 contingency, and a watch
  complication. Optionally the minimal in-app fallback peeking.
- F6 (optional, encouraged) — The morning: a lock-screen notification at 7:02 with today's
  readiness (41 vs typical 70–85) and the coach's heads-up before you ever open anything.

**Feel:** native, polished, convincing — like a real iOS/Wear surface designed by the best
platform designers, but in this exact palette.

**Type:** Inter (system feel), with tabular numerals.

**Must not become:** in-app screens dressed up as notifications. Every frame must be an OS-level
surface.
