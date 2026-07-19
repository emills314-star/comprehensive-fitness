import type { SyntheticFixture } from "./types";

export const syntheticFixture: SyntheticFixture = {
  athlete: "Sample Athlete",
  date: "Tuesday, July 21",
  readiness: {
    score: 78,
    band: "Inside normal range",
    guidance: "Train the plan. Take programmed progressions only if warm-ups move normally.",
    metrics: [
      { id: "sleep", label: "Sleep", value: "7 h 42 m", state: "good" },
      { id: "hrv", label: "HRV", value: "54 ms", state: "neutral" },
      { id: "soreness", label: "Soreness", value: "Mild", state: "watch" },
      { id: "nutrition", label: "Fuel", value: "Adequate", state: "good" },
    ],
  },
  session: {
    id: "synthetic-upper-a",
    name: "Upper A",
    phase: "Week 4 of 6",
    duration: "56 min",
    exercises: [
      {
        id: "bench",
        name: "Barbell Bench Press",
        muscle: "Chest",
        prescription: "1 top + 2 back-off · 6–10 reps · RPE 7–9",
        restSeconds: 150,
        sets: [
          { id: "bench-warm", role: "Warm-up", target: "8 reps", weight: 95, reps: 8, rpe: 5, complete: true },
          { id: "bench-top", role: "Top", target: "6–8 reps", weight: 185, reps: 7, rpe: 8, complete: true },
          { id: "bench-back-1", role: "Back-off", target: "8–10 reps", weight: 165, reps: 9, rpe: 8, complete: false },
          { id: "bench-back-2", role: "Back-off", target: "8–10 reps", weight: 165, reps: 8, rpe: 8, complete: false },
        ],
      },
      {
        id: "row",
        name: "Chest-Supported Row",
        muscle: "Back",
        prescription: "3 straight sets · 8–12 reps · RPE 7–9",
        restSeconds: 120,
        sets: [
          { id: "row-1", role: "Top", target: "8–12 reps", weight: 120, reps: 10, rpe: 8, complete: false },
          { id: "row-2", role: "Back-off", target: "8–12 reps", weight: 120, reps: 10, rpe: 8, complete: false },
          { id: "row-3", role: "Back-off", target: "8–12 reps", weight: 120, reps: 9, rpe: 8, complete: false },
        ],
      },
      {
        id: "raise",
        name: "Cable Lateral Raise",
        muscle: "Side delts",
        prescription: "3 straight sets · 12–18 reps · RPE 8–9",
        restSeconds: 75,
        sets: [
          { id: "raise-1", role: "Top", target: "12–18 reps", weight: 20, reps: 15, rpe: 8, complete: false },
          { id: "raise-2", role: "Back-off", target: "12–18 reps", weight: 20, reps: 14, rpe: 8, complete: false },
          { id: "raise-3", role: "Back-off", target: "12–18 reps", weight: 20, reps: 13, rpe: 9, complete: false },
        ],
      },
    ],
  },
  week: [
    { day: "M", label: "Lower A", state: "done" },
    { day: "T", label: "Upper A", state: "today" },
    { day: "W", label: "Recovery", state: "rest" },
    { day: "T", label: "Lower B", state: "planned" },
    { day: "F", label: "Upper B", state: "planned" },
    { day: "S", label: "Rest", state: "rest" },
    { day: "S", label: "Rest", state: "rest" },
  ],
  progress: [
    { week: "W1", e1rm: 223, volume: 11.5 },
    { week: "W2", e1rm: 227, volume: 12 },
    { week: "W3", e1rm: 226, volume: 12.5 },
    { week: "W4", e1rm: 232, volume: 13 },
    { week: "W5", e1rm: 235, volume: 12.5 },
    { week: "W6", e1rm: 239, volume: 11 },
  ],
};
