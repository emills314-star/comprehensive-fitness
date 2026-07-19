import type { CapabilityId, ScreenFamilyId } from "./types";

export const capabilityLabels: Record<CapabilityId, string> = {
  nextAction: "Next action",
  readiness: "Readiness",
  templateStart: "Template start",
  activeLogging: "Active logging",
  setRoles: "Set roles",
  restTimer: "Rest timer",
  prescriptions: "Prescription and evidence",
  safetySubstitution: "Pain-safe substitution",
  overrides: "Audited overrides",
  submission: "Explicit submission",
  summary: "Completion summary",
  templates: "Templates",
  mesocyclePlanning: "Mesocycle planning",
  progressOverview: "Progress overview",
  liftAnalysis: "Lift analysis",
  historyEditing: "History editing",
  settings: "Settings",
  privacy: "Privacy controls",
  importExport: "Import and export",
  syncConsent: "Sync consent",
  offlineUpdates: "Offline and updates",
  conflictRecovery: "Data-conflict recovery",
};

export const screenFamilies: Array<{ id: ScreenFamilyId; label: string; purpose: string }> = [
  { id: "home", label: "Next action", purpose: "Resume or start the right session without hunting." },
  { id: "readiness", label: "Readiness", purpose: "Review inputs and today-only adjustments before starting." },
  { id: "workout", label: "Active workout", purpose: "Log sets, maintain context, and recover from interruption." },
  { id: "safety", label: "Evidence & safety", purpose: "Explain prescriptions, holds, substitutions, and overrides." },
  { id: "summary", label: "Submit & summary", purpose: "Confirm finality, then show grades, PRs, and next actions." },
  { id: "plan", label: "Plan", purpose: "Manage templates and build a viable mesocycle." },
  { id: "progress", label: "Progress", purpose: "Understand volume, fatigue, lift trends, and history." },
  { id: "data", label: "Data & privacy", purpose: "Control settings, backups, imports, consent, and deletion." },
];

export interface AppReadModel {
  nextAction: {
    kind: "start" | "resume" | "review";
    title: string;
    detail: string;
    templateId?: string;
    sessionId?: string;
  };
  readiness: {
    score: number;
    band: string;
    guidance: string;
    adjustmentKind: "none" | "moderate" | "severe" | "blocked";
  };
  activeWorkout: null | {
    sessionId: string;
    title: string;
    currentSetId: string;
    completedSetCount: number;
    totalSetCount: number;
  };
  plan: {
    activeMesocycleId: string | null;
    templateCount: number;
    blockingFindingCount: number;
  };
  progress: {
    submittedSessionCount: number;
    fatigueFlagCount: number;
    historyConfidence: "insufficient" | "provisional" | "established";
  };
  system: {
    online: boolean;
    updateAvailable: boolean;
    cloudWorkoutConsent: boolean;
    conflictingCopies: boolean;
  };
}

export type AppCommand =
  | { type: "workout/start"; templateId: string }
  | { type: "workout/resume"; sessionId: string }
  | { type: "readiness/save"; sessionId: string; values: Record<string, string | number | boolean> }
  | { type: "set/update"; setId: string; weight?: number; reps?: number; rpe?: number }
  | { type: "set/complete"; setId: string }
  | { type: "set/skip"; setId: string; reason?: string }
  | { type: "rest/start"; setId: string; seconds: number }
  | { type: "rest/cancel" }
  | { type: "override/append"; exerciseId: string; reason: string }
  | { type: "workout/request-submit"; sessionId: string }
  | { type: "workout/confirm-submit"; sessionId: string }
  | { type: "workout/cancel"; sessionId: string }
  | { type: "template/save"; templateId: string }
  | { type: "mesocycle/save-draft"; mesocycleId: string }
  | { type: "history/save-edit"; sessionId: string }
  | { type: "settings/update"; values: Record<string, unknown> }
  | { type: "backup/export" }
  | { type: "backup/import"; file: File }
  | { type: "consent/update"; enabled: boolean };

export interface AppEffects {
  persist(): Promise<void>;
  enqueueSync(command: AppCommand): Promise<void>;
  scheduleRestNotification(seconds: number, setId: string): Promise<void>;
  cancelRestNotification(): Promise<void>;
  requestWakeLock(): Promise<void>;
  playCompletionCue(): Promise<void>;
  vibrate(pattern: number | number[]): void;
}

export interface AppAdapter {
  snapshot(): AppReadModel;
  dispatch(command: AppCommand): Promise<AppReadModel>;
  subscribe(listener: (snapshot: AppReadModel) => void): () => void;
}
