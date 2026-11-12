# 08 · Lint — `coach-concepts/08-lint.html`

**Thesis:** The coach lints your training like code. Your session is a document; the coach runs
diagnostics on every set as you log it, underlines what's out of bounds, explains the rule that
fired, and offers Quick Fixes scoped to this session, the next one, or both.

**Organizing primitive:** the diagnostic. Each set is a line in an editor-like logger (line
numbers in a gutter, Strong-fast: prefilled values, one tap ✓). The coach's voice is diagnostics:
squiggly underlines, gutter severity icons, a hover card with a rule ID, a Problems panel, and a
lightbulb **Quick Fix** menu. A status bar shows session state (elapsed, chest volume, problems).

**Frames:**
- F1 — The session "file" (Upper A, Week 4) with bench lines: warm-ups dimmed, set 1 `185 × 9 @2 ✓`
  clean, set 2 active with cursor. Status bar: "24:10 · chest 13/16 · 0 problems". An info
  diagnostic already sits on the header: `recovery/below-baseline` (HRV 38 vs 52, sleep 5 h 48 m)
  — informational, not an error.
- F2 — Set 2 logged `185 × 6 @0` → amber squiggle; gutter warning icon; hover card:
  **`bounds/set-drop`** "Rep drop of 3 exceeds your normal 0.6 ± 0.7 (3.4σ). Expected 8–9." with
  related diagnostics listed underneath: `rest/short` (1:32 < 2:30 prescribed), `recovery/
  below-baseline`, and a passing check `strength/e1rm-stable ✓` (253 lb within 249–254). Status
  bar: "1 warning · 1 info".
- F3 — The **Quick Fix** menu (lightbulb), in order: "Back off sets 3–4 to 165 × 8 @2, rest 2:30
  (recommended)", "Keep 185, rest 3:00, cap RIR 1", "End bench here", each with scope chips
  `this session` / `next session` / `both`; a before → after inline preview of the affected lines
  (bench sets 3–4, incline 3 → 2 sets, chest 15/16). A small red "Something hurts" link.
- F4 — Fix applied: lines updated (sets 3–4 = 165 × 8), a subtle "1 fix applied" marker in the
  gutter, rest-timer line holding to 2:30, problems 0, warning moved to "resolved".
- F5 — Next session `Thu · Upper A`: bench held at 185 with an inline code-lens note "held: last
  session flagged"; the **watch rule** shown as an enabled lint rule in a small rules config
  (`watch/press-repeat-flag → deload pressing −10%, −1 set`); `progress/double` rule ("sets 1–2 ≥ 9
  @ RIR ≥ 1 → 190"); `recovery/hrv-gate` ("HRV < 45 → start 175").

**Feel:** a gorgeous, calm modern code editor (light theme) translated to a phone — precise, dense
where useful, calm everywhere else. Developer delight applied to lifting.

**Type:** JetBrains Mono for the document + Inter for chrome.

**Must not become:** a command line or command palette (that was Command Gym). No typing commands
— diagnostics and fixes only. Avoid a plan | actual | delta table.
