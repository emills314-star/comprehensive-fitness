export const capabilityIds = [
  "nextAction",
  "readiness",
  "templateStart",
  "activeLogging",
  "setRoles",
  "restTimer",
  "prescriptions",
  "safetySubstitution",
  "overrides",
  "submission",
  "summary",
  "templates",
  "mesocyclePlanning",
  "progressOverview",
  "liftAnalysis",
  "historyEditing",
  "settings",
  "privacy",
  "importExport",
  "syncConsent",
  "offlineUpdates",
  "conflictRecovery",
] as const;

export type CapabilityId = (typeof capabilityIds)[number];

export type CapabilityFit =
  | "Reused"
  | "Adapted"
  | "New UI only"
  | "Requires backend change";

export type ScreenFamilyId =
  | "home"
  | "readiness"
  | "workout"
  | "safety"
  | "summary"
  | "plan"
  | "progress"
  | "data";

export interface StructuralDimensions {
  metaphor: string;
  navigation: string;
  primaryUnit: string;
  workoutModel: string;
  planningModel: string;
  progressModel: string;
  interactionGrammar: string;
}

export interface BackendScore {
  domainReuse: number;
  stateReuse: number;
  adapterEffort: number;
  platformFit: number;
  safetyRisk: number;
}

export interface ExperienceScore {
  gymSpeed: number;
  screenEconomy: number;
  clarity: number;
  aesthetics: number;
  accessibility: number;
  scalability: number;
}

export interface ConceptScores {
  backend: BackendScore;
  experience: ExperienceScore;
}

export interface ConceptTheme {
  canvas: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
}

export interface Concept {
  id: string;
  rank: number;
  name: string;
  thesis: string;
  aesthetic: string;
  font: string;
  responsive: string;
  layout: string;
  dimensions: StructuralDimensions;
  scores: ConceptScores;
  capabilityFit: Record<CapabilityId, CapabilityFit>;
  theme: ConceptTheme;
  strengths: string[];
  risks: string[];
}

export interface ReadinessMetric {
  id: string;
  label: string;
  value: string;
  state: "good" | "watch" | "neutral";
}

export interface SyntheticSet {
  id: string;
  role: "Warm-up" | "Top" | "Back-off";
  target: string;
  weight: number;
  reps: number;
  rpe: number;
  complete: boolean;
}

export interface SyntheticExercise {
  id: string;
  name: string;
  muscle: string;
  prescription: string;
  restSeconds: number;
  sets: SyntheticSet[];
}

export interface SyntheticFixture {
  athlete: string;
  date: string;
  readiness: {
    score: number;
    band: string;
    guidance: string;
    metrics: ReadinessMetric[];
  };
  session: {
    id: string;
    name: string;
    phase: string;
    duration: string;
    exercises: SyntheticExercise[];
  };
  week: Array<{ day: string; label: string; state: "done" | "today" | "planned" | "rest" }>;
  progress: Array<{ week: string; e1rm: number; volume: number }>;
};
