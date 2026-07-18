      const STORAGE_KEY = "comprehensive-fitness-data-v1";
      const LOCAL_FALLBACK_FORMAT = "comprehensive-fitness-local-fallback";
      const LOCAL_FALLBACK_VERSION = 1;
      const RUNTIME_KEY = "comprehensive-fitness-runtime-v1";
      const ACTIVE_DRAFT_KEY = "comprehensive-fitness-active-draft-v1";
      const IDENTITY_KEY = "comprehensive-fitness-installation-v1";
      const DB_NAME = "comprehensive-fitness";
      const DB_VERSION = 1;
      const DB_STORE = "state";
      const ACTIVE_HISTORY_MONTHS = 6;
      const SET_CLASSIFIER_VERSION = 2;
      const DOMAIN_MIGRATION_VERSION = 3;
      const BACKUP_IMPORT_LIMITS = Object.freeze({
        maxFileBytes: 8 * 1024 * 1024,
        maxJsonDepth: 32,
        maxObjectKeys: 128,
        maxSessions: 1024,
        maxExercises: 4096,
        maxSets: 16384,
        maxTemplates: 512
      });
      const PERSONAL_EVIDENCE_IMPORT_LIMITS = Object.freeze({
        maxFileBytes: 8 * 1024 * 1024,
        maxJsonDepth: 32,
        maxObjectKeys: 128,
        maxCoreCollectionItems: 1024,
        maxStableIdChars: 128,
        maxNameChars: 256,
        maxTextChars: 4096
      });
      const root = document.getElementById("root");
      const defaultReadinessBaseline = { sleepHours: 7.5, sleepQuality: 4, hrv: "", restingHr: "", soreness: 2, band: 8 };
      const defaultSettings = {
        weightUnit: "lb",
        trainingGoal: "",
        trainingGoalSource: "missing_default",
        trainingGoalDisclosure: "General fitness is used as the disclosed default until a training goal is selected.",
        nutritionPhase: "",
        experienceLevel: "",
        returningAfterGap: null,
        trainingDaysPerWeek: 4,
        availableEquipment: [],
        excludedExerciseIds: [],
        theme: "light",
        timerSound: true,
        workoutCompletionSound: true,
        timerVibration: true,
        interactionVibration: true,
        timerNotifications: true,
        inAppRestAlerts: true,
        restCompleteSound: "sharp_two_tone",
        restCompleteSoundVolume: 0.85,
        restCompleteAutoDismissMs: 5000,
        restCompleteLockScreenNotifications: true,
        restCompleteAutoReturnToWorkout: false,
        defaultRestSeconds: 90,
        notificationMessageDetail: "exercise-set",
        autoStartRestTimer: true,
        autoHighlightNextSet: true,
        autoScrollNextSet: true,
        installGuideDismissed: false,
        setupSoundConfirmed: false,
        cloudWorkoutSyncConsent: false,
        workoutCloudSync: false,
        workoutCloudSyncConsentVersion: 0,
        readinessBaseline: { ...defaultReadinessBaseline }
      };
      let data = emptyData();
      const primaryTabIds = ["lift", "dashboard", "plan", "charts", "data"];
      const focusActionAllowlist = new Set([
        "set-tab", "start-template", "request-cancel-workout", "request-save-history-edits", "request-cancel-history-edits", "clear-data",
        "continue-template-start", "return-active-workout", "use-usual-readiness", "review-template-readiness", "start-adjusted-workout",
        "keep-workout", "keep-history-editing", "cancel-clear-data", "close-dashboard-detail", "dashboard-detail-parent",
        "open-history", "open-dashboard-detail", "open-dashboard-session", "open-volume-session", "open-fatigue-flag",
        "cancel-template-start", "log-today-readiness", "edit-readiness-metrics", "start-original-workout",
        "template-readiness-sleep-hours", "template-readiness-sleep-quality", "template-readiness-hrv", "template-readiness-resting-hr",
        "template-readiness-soreness", "template-readiness-nutrition", "template-readiness-protein", "template-readiness-illness",
        "template-readiness-pain", "template-readiness-affected-muscle", "template-readiness-note",
        "clear-data-ack", "clear-data-phrase", "sync-before-clear", "confirm-clear-data", "confirm-cancel-workout",
        "confirm-save-history-edits", "confirm-cancel-history-edits"
      ]);
      const focusDescriptorDataKeys = ["tab", "templateId", "sessionId", "detail", "flagId"];
      const focusableCandidateSelector = 'button, input, select, textarea, a[href], summary, [tabindex]';
      let activeTab = tabFromLocation();
      const tabScrollPositions = new Map();
      let activeSessionId = "";
      let activeWorkoutId = "";
      let timer = null;
      let timerInterval = 0;
      let timerCompleteNotice = null;
      let restCompletionState = null;
      let restNavigationState = null;
      let timerAudioContext = null;
      const restAudioSignal = window.RestCompletion?.createWebAudioRestSignal({ scope: window }) || null;
      const restCompletionController = window.RestCompletion ? new window.RestCompletion.RestCompletionController({
        settings: defaultSettings,
        effects: {
          playSound: (event) => restAudioSignal?.play(event),
          playHaptic: window.RestCompletion.createNavigatorHapticPlayer(navigator),
          showSystemNotification: (event) => {
            const notice = event?.record?.notice || {};
            const timerSnapshot = event?.record?.timer || {};
            return sendRestTimerNotification(notice, timerSnapshot.pendingNextSetId || "", timerSnapshot.exerciseId || "");
          },
          onPersist: (state) => {
            restCompletionState = state || null;
            timerCompleteNotice = state?.notice?.visible ? state.notice : null;
            saveRuntime();
          },
          onShow: (state) => {
            restCompletionState = state || null;
            timerCompleteNotice = state?.notice?.visible ? state.notice : null;
            render();
          },
          onDismiss: ({ state }) => {
            restCompletionState = state || null;
            timerCompleteNotice = null;
            saveRuntime();
            render();
          },
          onReturnToWorkout: ({ state }) => navigateToRestCompletion(state?.notice?.payload || restNavigationState || {})
        }
      }) : null;
      let timerWakeLock = null;
      let activeSetId = "";
      let pendingNextSetId = "";
      let activeSetAcknowledged = false;
      let activeSetNotice = "";
      let notificationMessage = "";
      let syncMessage = "";
      let pushIdentity = null;
      let pushConfig = null;
      let installPromptEvent = null;
      let updateRegistration = null;
      let updateAvailable = false;
      let pendingControllerReload = false;
      let persistenceReady = false;
      let syncFlushTimer = 0;
      let syncConsentEpoch = 0;
      let syncConsentTransition = Promise.resolve();
      const activeWorkoutSyncOperations = new Set();
      const activeWorkoutSyncAbortControllers = new Set();
      const restSchedulePromises = new Map();
      const canceledRestScheduleKeys = new Map();
      let pushOperationWriteChain = Promise.resolve();
      let selectedExerciseId = "";
      let chartExerciseDraft = "";
      let chartExerciseSearchOpen = false;
      let chartExerciseSearchError = "";
      let chartExerciseHighlight = 0;
      let recentChartExerciseIds = [];
      const chartPointActivations = new Map();
      let chartPointActivationEpoch = 0;
      let chartPointActivationSequence = 0;
      let addExerciseDraft = "";
      let addExercisePrimaryMuscle = "";
      let addExerciseSecondaryMuscle = "";
      let exportText = "";
      let clearDataFlow = null;
      let cancelWorkoutFlow = null;
      let historyEditFlow = null;
      let historyEditStartPending = false;
      let historyEditConfirm = "";
      let viewingHistorySessionId = "";
      let appToast = "";
      let pendingDeleteTemplateId = "";
      let expandedVolumeMuscle = "";
      let dashboardWeekStart = startOfWeekIso(todayIso());
      let dashboardDetail = null;
      const dashboardFocusStack = [];
      let planVolumeDetailId = "";
      let dashboardReturnScroll = 0;
      let settingsMessage = "";
      let appDataPersistenceConflict = null;
      let importInProgress = false;
      let importAttempt = 0;
      let importStatus = { state: "idle", message: "" };
      let saveTimer = 0;
      let draftSaveTimer = 0;
      let idleSaveHandle = 0;
      let interactionRenderFrame = 0;
      let pendingFocusDescriptor = null;
      let renderedDialogKey = "";
      const dialogFocusOrigins = { template: null, cancel: null, history: null, clear: null };
      const performanceDebugEnabled = ["127.0.0.1", "localhost"].includes(window.location.hostname) && new URLSearchParams(window.location.search).has("perf");
      const performanceFixtureEnabled = performanceDebugEnabled && new URLSearchParams(window.location.search).get("perfFixture") === "large";
      const performanceEvents = [];
      if (performanceDebugEnabled) window.__CF_PERF__ = performanceEvents;

      function performanceNow() {
        return globalThis.performance?.now ? globalThis.performance.now() : Date.now();
      }

      function recordPerformance(label, startedAt, detail = {}) {
        if (!performanceDebugEnabled) return;
        const duration = Math.round((performanceNow() - startedAt) * 10) / 10;
        performanceEvents.push({ label, duration, detail, at: Date.now() });
        if (performanceEvents.length > 250) performanceEvents.splice(0, performanceEvents.length - 250);
        console.debug("[CF performance]", label, duration + "ms", detail);
      }

      function measurePerformance(label, operation, detail = {}) {
        if (!performanceDebugEnabled) return operation();
        const startedAt = performanceNow();
        try { return operation(); }
        finally { recordPerformance(label, startedAt, detail); }
      }

      function installDevelopmentPerformanceFixture() {
        if (!performanceFixtureEnabled) return;
        const sessions = [];
        const exercises = [];
        const sets = [];
        const names = ["Bench Press", "Leg Press", "Cable Lateral Raise", "Seated Leg Curl", "Straight-Arm Pulldown", "Cable Crossover", "Neck Curl Side", "Triceps Pushdown"];
        const recentHistoryTitles = ["Friday Neck Day", "Tuesday \u2014 Heavy Push + Calves + Light Quads", "Monday Neck Day", "Three-Line Mobile Layout Stress Test With Posterior Chain, Calves, Core, and Neck Work"];
        const recentHistoryScores = [82, 95, 90, 97, 58];
        for (let dayOffset = 0; dayOffset < 180; dayOffset += 1) {
          const date = new Date();
          date.setDate(date.getDate() - (dayOffset < recentHistoryTitles.length + 1 ? 0 : dayOffset));
          const dateIso = localDateIso(date);
          const sessionId = "perf-session-" + dayOffset;
          const internalScore = recentHistoryScores[dayOffset] ?? 78 + (dayOffset % 18);
          const grade = internalScore >= 97 ? "A+" : internalScore >= 93 ? "A" : internalScore >= 90 ? "A-" : internalScore >= 87 ? "B+" : internalScore >= 83 ? "B" : internalScore >= 80 ? "B-" : internalScore >= 77 ? "C+" : internalScore >= 73 ? "C" : internalScore >= 70 ? "C-" : internalScore >= 60 ? "D" : "F";
          sessions.push({ id: sessionId, date: dateIso, completedAt: dateIso, submitted: true, workoutState: "completed", title: recentHistoryTitles[dayOffset] || (dayOffset % 2 ? "Tuesday - Heavy Push + Calves + Light Quads" : "Sunday - Light Upper + Posterior Chain"), createdAt: dateIso + "T12:00:00.000Z", updatedAt: dateIso + "T13:00:00.000Z", workoutAnalysis: { version: 1, grade, internalScore, intent: "Standard training session", interpretation: "Fixture workout", rationale: "Used for development layout and performance verification.", categoryScores: [], highlights: [], improvements: [], exerciseResults: [], confidence: "moderate", metrics: { completedSets: names.length * 4, rpeLoggedRatio: 1 } } });
          names.forEach((name, exerciseIndex) => {
            const exerciseId = sessionId + "-exercise-" + exerciseIndex;
            exercises.push({ id: exerciseId, sessionId, name, order: exerciseIndex, resistanceType: "external", restSeconds: 90, primaryMuscle: "", secondaryMuscle: "" });
            for (let setIndex = 0; setIndex < 4; setIndex += 1) {
              sets.push({ id: exerciseId + "-set-" + setIndex, exerciseId, setNumber: setIndex + 1, sequenceIndex: setIndex, sequence: setIndex, setType: setIndex === 0 ? "top" : "backoff", reps: 8 + (setIndex % 2), weight: 50 + exerciseIndex * 10 + Math.floor(dayOffset / 30) * 2.5, weightUnit: "lb", resistanceType: "external", rpe: 7.5 + (setIndex % 3) * 0.5, completed: true, skipped: false, edited: false, countsTowardScore: true, countsTowardVolume: true, countsTowardProgression: true, targetReps: 9, targetRepMin: 8, targetRepMax: 12, targetRpe: 8, targetRpeMin: 7, targetRpeMax: 9 });
            }
          });
        }
        const legTemplate = {
          id: "perf-leg-template",
          name: "Leg Day Prescription QA",
          notes: "Development-only set-role fixture",
          createdAt: isoNow(),
          updatedAt: isoNow(),
          exercises: [
            { id: "perf-leg-press", name: "Leg Press", sets: 2, reps: 10, targetRpe: 8.5, increment: 5, restSeconds: 150, resistanceType: "external", warmups: [{ id: "lp-wu-1", reps: 8, weight: 90, rpe: 5 }, { id: "lp-wu-2", reps: 5, weight: 135, rpe: 6 }], setTypes: [{ type: "top", setCount: 1, repMin: 8, repMax: 10, rpeMin: 8, rpeMax: 9 }, { type: "backoff", setCount: 1, repMin: 10, repMax: 15, rpeMin: 7, rpeMax: 8, loadReductionMin: 8, loadReductionMax: 15 }] },
            { id: "perf-leg-extension", name: "Leg Extension", sets: 2, reps: 15, targetRpe: 8.5, increment: 5, restSeconds: 90, resistanceType: "external", warmups: [], setTypes: [{ type: "top", setCount: 1, repMin: 10, repMax: 15, rpeMin: 8, rpeMax: 9 }, { type: "backoff", setCount: 1, repMin: 12, repMax: 20, rpeMin: 7, rpeMax: 8, loadReductionMin: 10, loadReductionMax: 20 }] },
            { id: "perf-lying-leg-curl", name: "Lying Leg Curl", sets: 2, reps: 9, targetRpe: 8.5, increment: 5, restSeconds: 90, resistanceType: "external", warmups: [], setTypes: [{ type: "top", setCount: 1, repMin: 9, repMax: 9, rpeMin: 8, rpeMax: 8, rangeSource: "strong-history" }, { type: "backoff", setCount: 1, repMin: 8, repMax: 9, rpeMin: 9, rpeMax: 9, rangeSource: "strong-history", loadReductionMin: 10, loadReductionMax: 18 }] }
          ]
        };
        data = { ...data, sessions: [...sessions, ...data.sessions], exercises: [...data.exercises, ...exercises], sets: [...data.sets, ...sets], templates: [legTemplate, ...data.templates.filter((template) => template.id !== legTemplate.id)], dataRevision: Number(data.dataRevision || 0) + 1 };
        measurePerformance("fixture:serializeFullData", () => JSON.stringify(data), { sessions: data.sessions.length, exercises: data.exercises.length, sets: data.sets.length });
      }
      let pendingSubmitSessionId = "";
      const workoutSubmissionsInProgress = new Set();
      let completedSummarySessionId = "";
      let chartDetailPoint = null;
      let hypertrophyScoreExpanded = false;
      let hypertrophyScoreLoading = false;
      let hypertrophyWindowOffset = 0;
      let analysisRevision = 0;
      let entityStructureRevision = 0;
      let entityIndexCache = null;
      let completedAnalysisIndexCache = null;
      let exerciseCatalogCache = null;
      let completedEntriesCache = null;
      const activeHistoryCache = new Map();
      const activeHistoryIdCache = new Map();
      const exerciseScopeCache = new Map();
      const exerciseWeekCache = new Map();
      const hypertrophyWeekCache = new Map();
      const hypertrophyQualificationCache = new Map();
      const hypertrophyScoreCache = new Map();
      const weeklyVolumeCache = new Map();
      const fatigueFlagCache = new Map();
      const templateAdviceCache = new Map();
      const targetContextCache = new Map();
      const actualExpectedCache = new Map();
      const coachRecommendationCache = new Map();
      const exerciseProgressCache = new Map();
      const previousPerformanceCache = new Map();
      const muscleAssignmentCache = new Map();
      const prescriptionIdentityResolutionCache = new Map();
      let prescriptionIdentityCacheEngine = null;
      let prescriptionIdentityCacheResolver = null;
      const templateNumericDrafts = new Map();
      const templateNumericFields = Object.freeze({
        "template-exercise-sets": Object.freeze({ field: "sets", label: "sets", min: 1, max: 100, step: 1, integer: true }),
        "template-exercise-reps": Object.freeze({ field: "reps", label: "repetitions", min: 1, max: 1000, step: 1, integer: true }),
        "template-exercise-rpe": Object.freeze({ field: "targetRpe", label: "target RPE", min: 5, max: 10, step: 0.5, integer: false }),
        "template-exercise-increment": Object.freeze({ field: "increment", label: "load increment", min: 0.5, max: 10000, step: 0.5, integer: false }),
        "template-exercise-rest": Object.freeze({ field: "restSeconds", label: "rest seconds", min: 15, max: 3600, step: 15, integer: true })
      });
      const recentHistoryDataIssueIds = new Set();
      let templateStartFlow = null;
      const prescriptionApi = window.ComprehensiveFitnessPrescriptionEngine || null;
      let prescriptionEngine = prescriptionApi?.createPrescriptionEngine({}) || null;
      let prescriptionEvidenceStatus = { state: "loading", personalRecords: 0, researchExercises: 0, personalVersion: "unknown", researchVersion: "unknown", message: "Loading training evidence." };
      const prescriptionSnapshotCache = new Map();
      let selectedPrescriptionPoolMuscle = "chest";
      let mesocycleDraftType = "primary_progression";
      let mesocycleSpecializationMuscle = "";
      let mesocycleDurationDraft = "";
      let mesocycleScopeDraft = null;
      let mesocycleComparisonIds = [];
      let expandedMesocycleAlternateSlots = new Set();
      let pendingDeleteMesocycleId = "";
      let mesocyclePlannerExpanded = false;
      const guidedMesocycleApi = window.ComprehensiveFitnessGuidedMesocycle || null;
      let guidedMesocycleView = "closed";
      let guidedMesocycleDraftId = "";
      let guidedSelectedDayId = "";
      let guidedExerciseBrowserDayId = "";
      let guidedExerciseMuscleFilter = "";
      let guidedExerciseSearch = "";
      let guidedPendingAssignment = null;
      let guidedReturnFocusToPicker = false;
      let guidedWeeklySummaryOpen = false;
      let guidedGenerationReviewOpen = false;
      let guidedCreationPending = false;
      const expandedTemplateEditorIds = new Set();

      const icon = {
        workout: "Lift",
        dashboard: "Dash",
        templates: "Plan",
        history: "Past",
        review: "Chart",
        settings: "Data",
        add: "+",
        clock: "Rest",
        done: "&#10003;",
        delete: "X",
        pause: "&#10074;&#10074;",
        play: "&#9654;",
        duplicate: "Copy",
        download: "Export",
        upload: "Import"
      };

      function emptyData() {
        return { appDataVersion: 2, sessions: [], exercises: [], sets: [], templates: [], mesocycles: [], activeMesocycleId: "", recommendationHistory: [], manualOverrides: [], personalEvidencePackage: null, rawImports: [], migrationAudit: [], dataRevision: 0, settings: { ...defaultSettings } };
      }

      // DOMAIN_INTEGRITY_ENGINE_START
      function calendarMonthCutoff(asOfDate, months = ACTIVE_HISTORY_MONTHS) {
        const parts = String(asOfDate || "").slice(0, 10).split("-").map(Number);
        if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) return "";
        const [year, month, day] = parts;
        const target = new Date(year, month - 1 - months, 1);
        const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
        target.setDate(Math.min(day, lastDay));
        return localDateIso(target);
      }

      function sessionCompletionDate(session) {
        return String(session?.completedAt || session?.submittedAt || session?.date || "").slice(0, 10);
      }

      function isCompletedWorkout(session) {
        if (!session || session.deletedAt || session.trashed || session.canceledAt || session.workoutState === "canceled") return false;
        return session.submitted === true || session.workoutState === "completed" || (session.source === "strong" && session.submitted !== false);
      }

      function activeCompletedWorkoutHistory(model, options = {}) {
        const asOfDate = String(options.asOfDate || todayIso()).slice(0, 10);
        const throughDate = String(options.throughDate || asOfDate).slice(0, 10);
        const cutoffDate = calendarMonthCutoff(asOfDate, ACTIVE_HISTORY_MONTHS);
        return (model?.sessions || []).filter((session) => {
          const completionDate = sessionCompletionDate(session);
          return isCompletedWorkout(session) && completionDate && completionDate >= cutoffDate && completionDate <= throughDate;
        });
      }

      function normalizeCanonicalSetType(value, isWarmup = false) {
        if (isWarmup) return "warmup";
        const key = String(value || "straight").toLowerCase().replace(/[^a-z]/g, "");
        if (["w", "warmup", "warmupset"].includes(key)) return "warmup";
        if (["top", "topset"].includes(key)) return "top";
        if (["backoff", "backoffset"].includes(key)) return "backoff";
        if (["d", "drop", "dropset"].includes(key)) return "drop";
        if (["f", "failure", "failureset"].includes(key)) return "failure";
        if (["amrap", "amrapset"].includes(key)) return "amrap";
        if (["technique", "techniqueset"].includes(key)) return "technique";
        if (["deload", "deloadset"].includes(key)) return "deload";
        if (["unknown", "review", "reviewrequired"].includes(key)) return "unknown";
        return "straight";
      }

      function setTypeSemantics(set) {
        const type = normalizeCanonicalSetType(set?.setType, set?.isWarmup);
        const isWarmup = type === "warmup";
        return {
          type,
          isWarmup,
          countsTowardScore: set?.countsTowardScore != null ? Boolean(set.countsTowardScore) : !isWarmup && type !== "unknown",
          countsTowardVolume: set?.countsTowardVolume != null ? Boolean(set.countsTowardVolume) : !isWarmup && type !== "unknown",
          countsTowardProgression: set?.countsTowardProgression != null ? Boolean(set.countsTowardProgression) : !isWarmup && type !== "unknown"
        };
      }

      function isWorkingSet(set, purpose = "score") {
        const semantics = setTypeSemantics(set);
        if (semantics.isWarmup || semantics.type === "unknown") return false;
        if (purpose === "volume") return semantics.countsTowardVolume;
        if (purpose === "progression" || purpose === "pr") return semantics.countsTowardProgression;
        return semantics.countsTowardScore;
      }

      function explicitStrongSetType(value) {
        const key = String(value || "").trim().toLowerCase();
        if (["w", "warmup", "warm-up"].includes(key)) return "warmup";
        if (["d", "drop", "drop set"].includes(key)) return "drop";
        if (["f", "failure", "failure set"].includes(key)) return "failure";
        return "";
      }

      function classifyImportedExerciseSets(sourceSets, resistanceType = "external", source = "strong") {
        const ordered = sourceSets.map((set, index) => ({ ...set, sequenceIndex: Number.isFinite(Number(set.sequenceIndex)) ? Number(set.sequenceIndex) : index, sequence: Number.isFinite(Number(set.sequence)) ? Number(set.sequence) : index }));
        const results = ordered.map((set) => ({ set, type: "", source: "", confidence: 0, reviewRequired: false, reason: "" }));
        results.forEach((result) => {
          const set = result.set;
          if (set.manualOverride || set.classificationSource === "manual") {
            result.type = normalizeCanonicalSetType(set.setType, set.isWarmup);
            result.source = "manual";
            result.confidence = 1;
            result.reason = "Manual correction preserved.";
            return;
          }
          if (source !== "strong") {
            result.type = normalizeCanonicalSetType(set.setType, set.isWarmup);
            result.source = set.classificationSource || "app-explicit";
            result.confidence = Number(set.classificationConfidence || 1);
            result.reason = "App-created classification preserved.";
            return;
          }
          const explicit = explicitStrongSetType(set.originalImportedValue?.setOrder || set.sourceSetType || set.sourceSetOrder);
          if (explicit) {
            result.type = explicit;
            result.source = "strong-explicit";
            result.confidence = 1;
            result.reason = "Strong supplied an explicit " + explicit + " marker.";
            return;
          }
          if (set.setType && normalizeCanonicalSetType(set.setType, set.isWarmup) !== "straight" && set.classificationSource !== "inferred") {
            result.type = normalizeCanonicalSetType(set.setType, set.isWarmup);
            result.source = set.classificationSource || "app-explicit";
            result.confidence = Number(set.classificationConfidence || 0.95);
            result.reason = "Existing explicit app classification preserved.";
          }
        });
        if (["bodyweight", "assisted_bodyweight", "duration", "distance"].includes(resistanceType)) {
          results.forEach((result) => {
            if (result.type) return;
            const numericStrongOrder = /^\d+$/.test(String(result.set.originalImportedValue?.setOrder || result.set.sourceSetOrder || "").trim());
            result.type = numericStrongOrder ? "straight" : "unknown";
            result.source = numericStrongOrder ? "strong-explicit" : "inferred";
            result.confidence = numericStrongOrder ? 0.95 : 0.45;
            result.reviewRequired = !numericStrongOrder;
            result.reason = numericStrongOrder ? "Strong numeric set order identifies working work without load-ramp inference." : "Load-ramp inference is unsafe for this resistance type.";
          });
          return results;
        }
        const unresolved = results.map((result, index) => result.type ? -1 : index).filter((index) => index >= 0);
        const resetIndex = unresolved.find((index, position) => position > 0 && Number(ordered[index].setNumber) <= Number(ordered[unresolved[position - 1]].setNumber));
        let firstWorkingIndex = results[0]?.type && results[0].type !== "warmup" ? 0 : -1;
        if (results[0]?.type === "warmup") {
          const firstNonWarmup = results.findIndex((result) => result.type !== "warmup");
          if (firstNonWarmup >= 0) firstWorkingIndex = firstNonWarmup;
        }
        if (firstWorkingIndex < 0 && resetIndex > 0) {
          const prefix = ordered.slice(0, resetIndex);
          const postLoad = Number(ordered[resetIndex]?.weight || 0);
          const monotonicRamp = prefix.every((set, index) => index === 0 || Number(set.weight || 0) >= Number(prefix[index - 1].weight || 0));
          const belowWorkingLoad = postLoad > 0 && prefix.every((set) => Number(set.weight || 0) <= postLoad * 0.85);
          if (monotonicRamp && belowWorkingLoad) {
            for (let index = 0; index < resetIndex; index += 1) {
              if (results[index].type) continue;
              results[index] = { ...results[index], type: "warmup", source: "inferred", confidence: 0.9, reason: "Early ascending load ramp before imported numbering reset." };
            }
            firstWorkingIndex = resetIndex;
          }
        }
        if (firstWorkingIndex < 0) firstWorkingIndex = results.findIndex((result) => !result.type);
        const workingLoads = ordered.slice(Math.max(0, firstWorkingIndex)).map((set) => Number(set.weight || 0));
        const maxWorkingLoad = Math.max(0, ...workingLoads);
        results.forEach((result, index) => {
          if (result.type) return;
          if (index < firstWorkingIndex) {
            result.type = "unknown";
            result.source = "inferred";
            result.confidence = 0.45;
            result.reviewRequired = true;
            result.reason = "Early set could not be separated confidently from working work.";
            return;
          }
          const load = Number(result.set.weight || 0);
          const laterLower = ordered.slice(index + 1).some((set) => Number(set.weight || 0) < load * 0.98);
          const priorWorkingLoad = index > firstWorkingIndex ? Number(ordered[index - 1]?.weight || 0) : 0;
          if (index === firstWorkingIndex && load >= maxWorkingLoad * 0.98 && laterLower) {
            result.type = "top";
            result.reason = "First confident working set followed by lower working loads.";
          } else if (index > firstWorkingIndex && maxWorkingLoad > 0 && load < maxWorkingLoad * 0.98) {
            result.type = "backoff";
            result.reason = priorWorkingLoad > 0 && load < priorWorkingLoad * 0.98
              ? "Load reduction occurred after a confirmed working set; treated as back-off, not warm-up."
              : "Set remained below the confirmed top-set load; preserved as back-off work.";
          } else {
            result.type = "straight";
            result.reason = "Standard working set after the warm-up prefix.";
          }
          result.source = "inferred";
          result.confidence = result.type === "straight" ? 0.75 : 0.86;
        });
        return results;
      }

      function migrateDomainData(model) {
        const currentVersion = Number(model.domainMigrationVersion || 0);
        if (currentVersion >= DOMAIN_MIGRATION_VERSION) return model;
        const report = { version: DOMAIN_MIGRATION_VERSION, startedAt: isoNow(), inspected: 0, changed: 0, explicitRetained: 0, manualOverridesPreserved: 0, warmups: 0, topSets: 0, backoffSets: 0, dropSets: 0, ambiguous: 0, changes: [] };
        const exerciseById = new Map((model.exercises || []).map((exercise) => [exercise.id, exercise]));
        const groups = new Map();
        (model.sets || []).forEach((set, index) => {
          if (!groups.has(set.exerciseId)) groups.set(set.exerciseId, []);
          const fallbackSequence = groups.get(set.exerciseId).length;
          groups.get(set.exerciseId).push({ ...set, sequenceIndex: Number(set.sequenceIndex ?? set.sequence ?? fallbackSequence), sequence: Number(set.sequence ?? set.sequenceIndex ?? fallbackSequence), _modelIndex: index });
        });
        const nextSets = [...(model.sets || [])];
        groups.forEach((sets, exerciseId) => {
          const exercise = exerciseById.get(exerciseId);
          const classifications = classifyImportedExerciseSets(sets, exercise?.resistanceType || "external", exercise?.source || "app");
          classifications.forEach((classification) => {
            const original = nextSets[classification.set._modelIndex];
            report.inspected += 1;
            if (classification.source === "manual") report.manualOverridesPreserved += 1;
            else if (classification.source.includes("explicit")) report.explicitRetained += 1;
            if (classification.type === "warmup") report.warmups += 1;
            if (classification.type === "top") report.topSets += 1;
            if (classification.type === "backoff") report.backoffSets += 1;
            if (classification.type === "drop") report.dropSets += 1;
            if (classification.reviewRequired) report.ambiguous += 1;
            const semantics = setTypeSemantics({ ...original, setType: classification.type, isWarmup: classification.type === "warmup" });
            const changed = normalizeCanonicalSetType(original.setType, original.isWarmup) !== classification.type || Number(original.sequenceIndex ?? original.sequence ?? -1) !== Number(classification.set.sequenceIndex ?? classification.set.sequence);
            const migrated = {
              ...original,
              sequenceIndex: classification.set.sequenceIndex ?? classification.set.sequence,
              sequence: classification.set.sequenceIndex ?? classification.set.sequence,
              setType: classification.type,
              isWarmup: semantics.isWarmup,
              countsTowardScore: semantics.countsTowardScore,
              countsTowardVolume: semantics.countsTowardVolume,
              countsTowardProgression: semantics.countsTowardProgression,
              classificationSource: classification.source,
              classificationConfidence: classification.confidence,
              classifierVersion: SET_CLASSIFIER_VERSION,
              manualOverride: classification.source === "manual",
              reviewRequired: classification.reviewRequired,
              originalImportedValue: original.originalImportedValue || { setType: original.setType || "", isWarmup: Boolean(original.isWarmup), setNumber: original.setNumber, setOrder: original.sourceSetOrder || "" },
              classifiedAt: isoNow()
            };
            nextSets[classification.set._modelIndex] = migrated;
            if (changed) {
              report.changed += 1;
              report.changes.push({ setId: original.id, exerciseId, from: normalizeCanonicalSetType(original.setType, original.isWarmup), to: classification.type, reason: classification.reason, confidence: classification.confidence });
            }
          });
        });
        report.completedAt = isoNow();
        model.sets = nextSets;
        const activeSessions = activeCompletedWorkoutHistory(model);
        const latestStrongByTitle = new Map();
        activeSessions.filter((session) => session.source === "strong").forEach((session) => {
          const key = String(session.title || "Strong Workout").trim().toLowerCase();
          const current = latestStrongByTitle.get(key);
          if (!current || sessionCompletionDate(session) > sessionCompletionDate(current)) latestStrongByTitle.set(key, session);
        });
        report.templatesReseeded = 0;
        model.templates = (model.templates || []).map((template) => {
          if (!/imported from strong workout name/i.test(String(template.notes || ""))) return template;
          const sourceSession = latestStrongByTitle.get(String(template.name || "").trim().toLowerCase());
          if (!sourceSession) return { ...template, historySeedStatus: "no-active-history", historySeededAt: isoNow() };
          const sessionExercises = (model.exercises || []).filter((exercise) => exercise.sessionId === sourceSession.id).sort((a, b) => a.order - b.order);
          const existingByName = new Map((template.exercises || []).map((exercise) => [canonicalExerciseId(exercise.name), exercise]));
          const exercises = sessionExercises.map((exercise) => {
            const existing = existingByName.get(canonicalExerciseId(exercise.name)) || {};
            const exerciseSets = nextSets.filter((set) => set.exerciseId === exercise.id).sort((a, b) => Number(a.sequence || a.setNumber) - Number(b.sequence || b.setNumber));
            const workingSets = exerciseSets.filter((set) => set.completed && isWorkingSet(set, "progression"));
            const reps = workingSets.length ? Math.round(workingSets.reduce((sum, set) => sum + Number(set.reps || 0), 0) / workingSets.length) : Number(existing.reps || 8);
            const rpeSets = workingSets.filter((set) => Number(set.rpe || 0) > 0);
            return {
              ...existing,
              id: existing.id || id(),
              name: exercise.name,
              primaryMuscle: exercise.primaryMuscle || existing.primaryMuscle || "",
              secondaryMuscle: exercise.secondaryMuscle || existing.secondaryMuscle || "",
              resistanceType: exercise.resistanceType || existing.resistanceType || "external",
              isBodyweight: isBodyweightResistance(exercise.resistanceType || existing.resistanceType),
              sets: Math.max(workingSets.length, 1),
              reps: Math.max(reps, 1),
              targetRpe: rpeSets.length ? Math.round(rpeSets.reduce((sum, set) => sum + Number(set.rpe || 0), 0) / rpeSets.length * 2) / 2 : existing.targetRpe || "",
              restSeconds: exercise.restSeconds || existing.restSeconds || 90,
              setTypes: templateSetTypesFromHistory(workingSets, exercise.restSeconds || existing.restSeconds || 90),
              warmups: exerciseSets.filter((set) => setTypeSemantics(set).isWarmup).map((set) => ({ reps: set.reps, weight: set.weight, weightUnit: set.weightUnit, resistanceType: set.resistanceType, addedLoad: set.addedLoad, assistanceLoad: set.assistanceLoad, rpe: set.rpe }))
            };
          });
          report.templatesReseeded += 1;
          return { ...template, exercises, sourceSessionId: sourceSession.id, historySeedStatus: "active-working-sets", historySeededAt: isoNow(), updatedAt: isoNow() };
        });
        model.domainMigrationVersion = DOMAIN_MIGRATION_VERSION;
        model.dataRevision = Number(model.dataRevision || 0) + 1;
        model.migrationAudit = [...(Array.isArray(model.migrationAudit) ? model.migrationAudit : []), report];
        return model;
      }
      // DOMAIN_INTEGRITY_ENGINE_END

      function openFitnessDb() {
        return new Promise((resolve, reject) => {
          if (!("indexedDB" in window)) return reject(new Error("IndexedDB is unavailable."));
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "key" });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error("IndexedDB could not be opened."));
        });
      }

      async function readIndexedRecord(key) {
        const db = await openFitnessDb();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(DB_STORE, "readonly");
          const request = transaction.objectStore(DB_STORE).get(key);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error || new Error("IndexedDB read failed."));
          transaction.oncomplete = () => db.close();
        });
      }

      async function readIndexedValue(key) {
        const record = await readIndexedRecord(key);
        return record?.value ?? null;
      }

      async function writeIndexedValue(key, value) {
        const db = await openFitnessDb();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(DB_STORE, "readwrite");
          transaction.objectStore(DB_STORE).put({ key, value, updatedAt: isoNow() });
          transaction.oncomplete = () => { db.close(); resolve(true); };
          transaction.onerror = () => { db.close(); reject(transaction.error || new Error("IndexedDB write failed.")); };
        });
      }

      function todayIso() {
        return localDateIso(new Date());
      }

      function localDateIso(date) {
        return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
      }

      function isoNow() {
        return new Date().toISOString();
      }

      function startOfWeekIso(dateIso) {
        const date = new Date(dateIso + "T00:00:00");
        const day = date.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        date.setDate(date.getDate() + diff);
        return localDateIso(date);
      }

      function formatDate(dateIso) {
        if (!dateIso) return "";
        const parsed = new Date(String(dateIso).slice(0, 10) + "T00:00:00");
        if (Number.isNaN(parsed.getTime())) return String(dateIso);
        return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(parsed);
      }

      function formatWeek(dateIso) {
        return "Week of " + formatDate(startOfWeekIso(dateIso));
      }

      function id() {
        return crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2);
      }

      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      }

      function cleanReadinessBaseline(source = {}) {
        return {
          sleepHours: source.sleepHours ?? defaultReadinessBaseline.sleepHours,
          sleepQuality: source.sleepQuality ?? defaultReadinessBaseline.sleepQuality,
          hrv: source.hrv ?? defaultReadinessBaseline.hrv,
          restingHr: source.restingHr ?? defaultReadinessBaseline.restingHr,
          soreness: source.soreness ?? defaultReadinessBaseline.soreness,
          band: source.band ?? defaultReadinessBaseline.band
        };
      }

      function cleanRecovery(source = {}) {
        const hasExplicitPain = typeof source.pain === "boolean";
        const legacyAffectedInjury = !hasExplicitPain && Boolean(source.illness) && Boolean(String(source.affectedMuscle || "").trim());
        return {
          sleepHours: source.sleepHours ?? "",
          sleepQuality: source.sleepQuality ?? "",
          hrv: source.hrv ?? "",
          restingHr: source.restingHr ?? "",
          soreness: source.soreness ?? "",
          nutritionStatus: source.nutritionStatus ?? "",
          proteinStatus: source.proteinStatus ?? "",
          outsideBandNote: source.outsideBandNote ?? "",
          illness: Boolean(source.illness) && !legacyAffectedInjury,
          pain: hasExplicitPain ? Boolean(source.pain) : legacyAffectedInjury,
          affectedMuscle: source.affectedMuscle ?? ""
        };
      }

      function resolveWorkoutMutationTarget(action, identifiers = {}) {
        const executableActions = ["add-exercise", "add-set", "add-warmup-set", "duplicate-set", "toggle-set", "toggle-skip-set", "start-timer"];
        const normalizedAction = String(action || "");
        if (!executableActions.includes(normalizedAction)) return { authorized: true, authorizationMode: "not_executable", action: normalizedAction, exercise: null, set: null, session: null };
        const failure = (reason, message) => ({ authorized: false, authorizationMode: "blocked", action: normalizedAction, exercise: null, set: null, session: null, reason, message });
        const hasValue = (value) => value !== undefined && value !== null;
        const explicitExerciseId = hasValue(identifiers.exerciseId) ? String(identifiers.exerciseId).trim() : "";
        const explicitSetId = hasValue(identifiers.setId) ? String(identifiers.setId).trim() : "";
        const explicitSessionId = hasValue(identifiers.sessionId) ? String(identifiers.sessionId).trim() : "";
        if (hasValue(identifiers.exerciseId) && !explicitExerciseId) return failure("invalid_exercise_target", "The requested exercise target is missing or invalid.");
        if (hasValue(identifiers.setId) && !explicitSetId) return failure("invalid_set_target", "The requested set target is missing or invalid.");
        if (hasValue(identifiers.sessionId) && !explicitSessionId) return failure("invalid_session_target", "The requested workout target is missing or invalid.");

        const objectExerciseId = hasValue(identifiers.exercise) ? String(identifiers.exercise?.id || "").trim() : "";
        const objectSetId = hasValue(identifiers.set) ? String(identifiers.set?.id || "").trim() : "";
        const objectSessionId = hasValue(identifiers.session) ? String(identifiers.session?.id || "").trim() : "";
        if (hasValue(identifiers.exercise) && !objectExerciseId) return failure("invalid_exercise_target", "The requested exercise target is not an authoritative application exercise.");
        if (hasValue(identifiers.set) && !objectSetId) return failure("invalid_set_target", "The requested set target is not an authoritative application set.");
        if (hasValue(identifiers.session) && !objectSessionId) return failure("invalid_session_target", "The requested workout target is not an authoritative application session.");
        if (explicitExerciseId && objectExerciseId && explicitExerciseId !== objectExerciseId) return failure("mixed_exercise_target", "The requested exercise identities do not match.");
        if (explicitSetId && objectSetId && explicitSetId !== objectSetId) return failure("mixed_set_target", "The requested set identities do not match.");
        if (explicitSessionId && objectSessionId && explicitSessionId !== objectSessionId) return failure("mixed_session_target", "The requested workout identities do not match.");

        const requestedExerciseId = explicitExerciseId || objectExerciseId;
        const requestedSetId = explicitSetId || objectSetId;
        const requestedSessionId = explicitSessionId || objectSessionId;
        let set = requestedSetId ? setById(requestedSetId) : null;
        let exercise = requestedExerciseId ? exerciseById(requestedExerciseId) : null;
        let session = requestedSessionId ? sessionById(requestedSessionId) : null;
        if (requestedSetId && !set) return failure("unknown_set_target", "The requested set no longer exists.");
        if (requestedExerciseId && !exercise) return failure("unknown_exercise_target", "The requested exercise no longer exists.");
        if (requestedSessionId && !session) return failure("unknown_session_target", "The requested workout no longer exists.");

        if (set) {
          const setExercise = exerciseById(set.exerciseId);
          if (!setExercise) return failure("orphaned_set_target", "The requested set is not attached to a valid exercise.");
          if (exercise && exercise.id !== setExercise.id) return failure("mixed_exercise_set_target", "The requested set does not belong to the requested exercise.");
          exercise = setExercise;
        }
        if (normalizedAction === "start-timer" && (!set || !exercise)) return failure("incomplete_timer_target", "A rest timer requires one matching exercise and set.");
        if (["toggle-set", "toggle-skip-set"].includes(normalizedAction) && !set) return failure("missing_set_target", "This action requires a valid set target.");
        if (["add-set", "add-warmup-set", "duplicate-set"].includes(normalizedAction) && !exercise) return failure("missing_exercise_target", "This action requires a valid exercise target.");
        if (normalizedAction === "add-exercise" && (set || exercise)) return failure("unexpected_exercise_target", "Adding an exercise must target the current workout session directly.");

        const derivedSession = exercise?.sessionId ? sessionById(exercise.sessionId) : null;
        if (exercise && !derivedSession) return failure("orphaned_exercise_target", "The requested exercise is not attached to a valid workout.");
        if (session && derivedSession && session.id !== derivedSession.id) return failure("mixed_session_target", "The requested entities do not belong to the same workout.");
        session = derivedSession || session || (normalizedAction === "add-exercise" ? activeSession() : null);
        if (!session) return failure("missing_session_target", "This action requires a valid workout target.");

        const exactHistoryEdit = isSessionSubmitted(session)
          && activeSessionId === session.id
          && historyEditFlow?.sessionId === session.id;
        const exactActiveWorkout = !isSessionSubmitted(session) && activeWorkoutId === session.id;
        const newWorkoutExercise = normalizedAction === "add-exercise"
          && !isSessionSubmitted(session)
          && !activeWorkoutId
          && activeSessionId === session.id;
        if (normalizedAction === "start-timer") {
          if (!exactActiveWorkout || !sessionHasStarted(session)) return failure("timer_requires_active_workout", "Rest timers can run only for the exact active workout.");
          return { authorized: true, authorizationMode: "active_workout", action: normalizedAction, exercise, set, session };
        }
        if (exactHistoryEdit) return { authorized: true, authorizationMode: "history_edit", action: normalizedAction, exercise, set, session };
        if (exactActiveWorkout || newWorkoutExercise) return { authorized: true, authorizationMode: exactActiveWorkout ? "active_workout" : "new_workout", action: normalizedAction, exercise, set, session };
        return failure("unauthorized_workout_target", "This action does not belong to the exact active workout or history-edit session.");
      }

      function workoutMutationSafetyDecision(action, context = {}) {
        const executableActions = ["add-exercise", "add-set", "add-warmup-set", "duplicate-set", "toggle-set", "toggle-skip-set", "start-timer"];
        if (!executableActions.includes(String(action || ""))) return { allowed: true, scope: "none", reason: "not_executable" };
        const normalize = (value) => String(value || "").toLowerCase().replace(/^mg_/, "").replace(/[^a-z0-9]+/g, " ").trim();
        const block = (scope, reason, message) => ({ allowed: false, executable: false, executionBlocked: true, scope, reason, message });
        if (context.authorization?.authorized === false) {
          return block("workout", context.authorization.reason || "unauthorized_workout_target", context.authorization.message || "This action is not authorized for the requested workout.");
        }
        if (context.authorization?.authorizationMode === "history_edit") {
          return { allowed: true, scope: "history", reason: "authorized_history_correction" };
        }
        const recovery = context.recovery || {};
        const exercise = context.exercise || null;
        const restriction = exercise?.safetyRestriction || exercise?.finalPrescription?.safetyRestriction || exercise?.recommendationSnapshot?.finalPrescription?.safetyRestriction || null;
        const blockedBySnapshot = exercise?.executionBlocked === true
          || exercise?.finalPrescription?.executionBlocked === true
          || exercise?.recommendationSnapshot?.finalPrescription?.executionBlocked === true;
        if (recovery.illness === true) return block("workout", "illness", "Current illness blocks executable workout actions.");
        const affectedMuscle = normalize(recovery.affectedMuscle);
        if (recovery.pain === true && !affectedMuscle) return block("workout", "pain", "Pain without a specified affected area blocks executable workout actions.");
        if (blockedBySnapshot) {
          return block(restriction?.scope || "exercise", restriction?.reason || "pain", "This exercise remains non-executable until its hard-safety restriction is resolved.");
        }
        const confirmedSubstitute = restriction?.status === "resolved_by_confirmed_substitute"
          && restriction?.painFreeConfirmed === true
          && restriction?.substituteExerciseId;
        if (confirmedSubstitute) {
          if (context.substituteValidation?.valid === true) return { allowed: true, scope: "exercise", reason: "confirmed_pain_free_substitute" };
          return block("exercise", context.substituteValidation?.reason || "substitute_constraints_changed", context.substituteValidation?.message || "This confirmed substitute no longer satisfies the current catalog, equipment, exclusion, or program constraints.");
        }
        if (recovery.pain !== true) return { allowed: true, scope: "none", reason: "clear" };
        const exerciseMuscles = (Array.isArray(context.exerciseMuscles) ? context.exerciseMuscles : [])
          .map((item) => normalize(typeof item === "string" ? item : item?.muscle || item?.programmingFamilyId || item?.programming_family_id))
          .filter(Boolean);
        if (!exercise || context.taxonomyResolved !== true || !exerciseMuscles.length) {
          return block("exercise", "pain", "The exercise taxonomy is unresolved, so a localized pain restriction must fail closed.");
        }
        if (exerciseMuscles.includes(affectedMuscle)) {
          return block("exercise", "pain", "This exercise trains the affected area and is blocked until a validated pain-free substitute is confirmed.");
        }
        return { allowed: true, scope: "exercise", reason: "catalog_resolved_nonmatch" };
      }

      function workoutMutationSafetyContext(action, identifiers = {}, authorization = resolveWorkoutMutationTarget(action, identifiers)) {
        const exercise = authorization.exercise
          || (action === "add-exercise" && addExerciseDraft.trim() ? { name: addExerciseDraft.trim(), primaryMuscle: addExercisePrimaryMuscle, secondaryMuscle: addExerciseSecondaryMuscle } : null);
        const session = authorization.session;
        const taxonomy = exercise ? taxonomyMusclesForExercise(exercise) : [];
        const restriction = exercise?.safetyRestriction || exercise?.finalPrescription?.safetyRestriction || exercise?.recommendationSnapshot?.finalPrescription?.safetyRestriction || null;
        const substituteValidation = identifiers.substituteValidation !== undefined
          ? identifiers.substituteValidation
          : restriction?.status === "resolved_by_confirmed_substitute" && exercise?.recommendationSnapshot
            ? safetySubstituteContext(exercise.recommendationSnapshot, { exercise, session }).resolvedValidation
            : null;
        return {
          authorization,
          recovery: authorization.authorized && authorization.authorizationMode !== "history_edit" && session ? cleanRecovery(session.recovery || {}) : cleanRecovery({}),
          exercise,
          exerciseMuscles: taxonomy.map((item) => item.muscle),
          taxonomyResolved: taxonomy.length > 0,
          substituteValidation
        };
      }

      function guardWorkoutMutation(action, identifiers = {}, notify = true) {
        const target = resolveWorkoutMutationTarget(action, identifiers);
        const decision = workoutMutationSafetyDecision(action, workoutMutationSafetyContext(action, identifiers, target));
        const result = { ...decision, target };
        if (!result.allowed && notify) showAppToast(result.message || "This action is blocked by the current workout safety restriction.");
        return result;
      }

      function workoutSafetyDisabledAttributes(decision, fallbackLabel) {
        if (decision?.allowed !== false) return "";
        const label = decision.message || fallbackLabel || "Blocked by the current workout safety restriction";
        return ` disabled aria-disabled="true" data-safety-reason="${escapeHtml(label)}"`;
      }

      function normalizeLoadedData(model) {
        const storedSettings = model.settings || {};
        const legacyGoal = String(storedSettings.goal || "").trim().toLowerCase();
        const legacyTrainingStatus = String(storedSettings.trainingStatus || "").trim().toLowerCase();
        const validTrainingGoals = new Set(["strength", "hypertrophy", "muscular_endurance", "general_fitness"]);
        const validNutritionPhases = new Set(["deficit", "maintenance", "surplus", "recomposition"]);
        const validExperienceLevels = new Set(["novice", "intermediate", "advanced"]);
        const legacyTrainingGoal = ({
          strength: "strength", hypertrophy: "hypertrophy", endurance: "muscular_endurance",
          muscular_endurance: "muscular_endurance", general: "general_fitness", general_fitness: "general_fitness",
          cut: "general_fitness", recomposition: "general_fitness", maintain: "general_fitness", maintenance: "general_fitness", bulk: "general_fitness"
        })[legacyGoal] || "";
        const legacyNutritionPhase = ({ cut: "deficit", deficit: "deficit", recomposition: "recomposition", maintain: "maintenance", maintenance: "maintenance", bulk: "surplus", surplus: "surplus" })[legacyGoal] || "";
        const trainingGoal = validTrainingGoals.has(storedSettings.trainingGoal) ? storedSettings.trainingGoal : legacyTrainingGoal;
        const nutritionPhase = validNutritionPhases.has(storedSettings.nutritionPhase) ? storedSettings.nutritionPhase : legacyNutritionPhase;
        const experienceLevel = validExperienceLevels.has(storedSettings.experienceLevel)
          ? storedSettings.experienceLevel
          : validExperienceLevels.has(legacyTrainingStatus) ? legacyTrainingStatus : "";
        const returningAfterGap = typeof storedSettings.returningAfterGap === "boolean" ? storedSettings.returningAfterGap : null;
        const safeSettings = {
          weightUnit: storedSettings.weightUnit,
          trainingGoal,
          trainingGoalSource: validTrainingGoals.has(storedSettings.trainingGoal) ? (storedSettings.trainingGoalSource || "explicit") : (storedSettings.trainingGoalSource || "missing_default"),
          trainingGoalDisclosure: validTrainingGoals.has(storedSettings.trainingGoal) ? (storedSettings.trainingGoalDisclosure || "") : (storedSettings.trainingGoalDisclosure || "General fitness default used because the legacy nutrition goal did not specify a training goal."),
          nutritionPhase,
          experienceLevel,
          returningAfterGap,
          trainingDaysPerWeek: storedSettings.trainingDaysPerWeek,
          availableEquipment: storedSettings.availableEquipment,
          excludedExerciseIds: storedSettings.excludedExerciseIds,
          theme: storedSettings.theme,
          timerSound: storedSettings.timerSound,
          workoutCompletionSound: storedSettings.workoutCompletionSound,
          timerVibration: storedSettings.timerVibration,
          interactionVibration: storedSettings.interactionVibration,
          timerNotifications: storedSettings.timerNotifications,
          inAppRestAlerts: storedSettings.inAppRestAlerts,
          restCompleteSound: storedSettings.restCompleteSound,
          restCompleteSoundVolume: storedSettings.restCompleteSoundVolume,
          restCompleteAutoDismissMs: storedSettings.restCompleteAutoDismissMs,
          restCompleteLockScreenNotifications: storedSettings.restCompleteLockScreenNotifications,
          restCompleteAutoReturnToWorkout: storedSettings.restCompleteAutoReturnToWorkout,
          defaultRestSeconds: storedSettings.defaultRestSeconds,
          notificationMessageDetail: storedSettings.notificationMessageDetail,
          autoStartRestTimer: storedSettings.autoStartRestTimer,
          autoHighlightNextSet: storedSettings.autoHighlightNextSet,
          autoScrollNextSet: storedSettings.autoScrollNextSet,
          installGuideDismissed: storedSettings.installGuideDismissed,
          setupSoundConfirmed: storedSettings.setupSoundConfirmed,
          cloudWorkoutSyncConsent: storedSettings.cloudWorkoutSyncConsent === true || (storedSettings.workoutCloudSync === true && Number(storedSettings.workoutCloudSyncConsentVersion || 0) >= 1),
          workoutCloudSync: storedSettings.workoutCloudSync,
          workoutCloudSyncConsentVersion: storedSettings.workoutCloudSyncConsentVersion
        };
        model.settings = { ...defaultSettings, ...Object.fromEntries(Object.entries(safeSettings).filter(([, value]) => value != null)), readinessBaseline: cleanReadinessBaseline(storedSettings.readinessBaseline || {}) };
        model.settings.workoutCloudSync = model.settings.cloudWorkoutSyncConsent === true;
        model.settings.workoutCloudSyncConsentVersion = model.settings.cloudWorkoutSyncConsent === true ? 1 : 0;
        delete model.settings.goal;
        delete model.settings.trainingStatus;
        model.sessions = (Array.isArray(model.sessions) ? model.sessions : []).map((session) => ({
          ...session,
          submitted: session.source === "strong" && session.submitted == null ? true : session.submitted,
          workoutState: session.source === "strong" && !session.workoutState ? "completed" : session.workoutState,
          completedAt: session.completedAt || session.submittedAt || (session.source === "strong" ? session.date : ""),
          recovery: cleanRecovery(session.recovery || {})
        }));
        model.exercises = Array.isArray(model.exercises) ? model.exercises : [];
        model.sets = Array.isArray(model.sets) ? model.sets : [];
        model.sets = model.sets.map((set) => ({ ...set, skipped: Boolean(set.skipped), edited: Boolean(set.edited) }));
        const setsByExercise = new Map();
        model.sets.forEach((set) => {
          if (!setsByExercise.has(set.exerciseId)) setsByExercise.set(set.exerciseId, []);
          setsByExercise.get(set.exerciseId).push(set);
        });
        model.exercises = model.exercises.map((exercise) => {
          const exerciseSets = setsByExercise.get(exercise.id) || [];
          const legacyBodyweight = exerciseSets.length > 0 && exerciseSets.every((set) => Boolean(set.isBodyweight)) && isBodyweightExerciseName(exercise.name);
          const resistanceType = inferResistanceType(exercise.name, { ...exercise, isBodyweight: exercise.isBodyweight ?? legacyBodyweight }, exerciseSets);
          return { ...exercise, resistanceType, isBodyweight: isBodyweightResistance(resistanceType) };
        });
        const normalizedExerciseById = new Map(model.exercises.map((exercise) => [exercise.id, exercise]));
        model.sets = model.sets.map((set) => {
          const exercise = normalizedExerciseById.get(set.exerciseId);
          const resistanceType = resistanceTypeValues.includes(exercise?.resistanceType) ? exercise.resistanceType : resistanceTypeValues.includes(set.resistanceType) ? set.resistanceType : inferResistanceType(exercise?.name || "", set, [set]);
          return normalizeResistanceSet(set, resistanceType);
        });
        model.templates = (Array.isArray(model.templates) ? model.templates : []).map((template) => ({
          ...template,
          exercises: (Array.isArray(template.exercises) ? template.exercises : []).map((exercise) => { const resistanceType = inferResistanceType(exercise.name, exercise); return { ...exercise, resistanceType, isBodyweight: isBodyweightResistance(resistanceType), targetRpe: Number(exercise.targetRpe || 0) || "", increment: Number(exercise.increment || 0) || "", setTypes: Array.isArray(exercise.setTypes) ? exercise.setTypes.map((setType) => normalizeTargetSetType(setType, { restSeconds: exercise.restSeconds, targetRpe: exercise.targetRpe })) : [] }; })
        }));
        model.appDataVersion = Math.max(2, Number(model.appDataVersion || 0));
        model.mesocycles = (Array.isArray(model.mesocycles) ? model.mesocycles : []).map((mesocycle) => ({
          ...mesocycle,
          status: mesocycle.status === "preview" ? "draft" : mesocycle.status === "loaded" ? "planned" : mesocycle.status,
          planningStep: Number(mesocycle.planningStep || 5),
          programSlots: Array.isArray(mesocycle.programSlots) ? mesocycle.programSlots : [],
          selectedPortfolio: Array.isArray(mesocycle.selectedPortfolio) ? mesocycle.selectedPortfolio : (Array.isArray(mesocycle.activeExercises) ? mesocycle.activeExercises : []),
          sessions: Array.isArray(mesocycle.sessions) ? mesocycle.sessions : [],
          programReview: mesocycle.programReview || { warnings: [], seriousWarningCount: 0, musclePlans: [], explanation: ["Legacy mesocycle: rebuild the draft to receive full-program interaction analysis."] }
        }));
        model.activeMesocycleId = model.mesocycles.some((mesocycle) => mesocycle.id === model.activeMesocycleId && mesocycle.status === "active") ? model.activeMesocycleId : "";
        model.recommendationHistory = Array.isArray(model.recommendationHistory) ? model.recommendationHistory : [];
        model.manualOverrides = Array.isArray(model.manualOverrides) ? model.manualOverrides : [];
        model.personalEvidencePackage = model.personalEvidencePackage && typeof model.personalEvidencePackage === "object" ? model.personalEvidencePackage : null;
        model.rawImports = Array.isArray(model.rawImports) ? model.rawImports : [];
        model.migrationAudit = Array.isArray(model.migrationAudit) ? model.migrationAudit : [];
        model.dataRevision = Number(model.dataRevision || 0);
        return migrateDomainData(model);
      }

      function persistenceTimestamp(value) {
        if (typeof value !== "string" || !value) return null;
        const timestamp = Date.parse(value);
        return Number.isFinite(timestamp) ? timestamp : null;
      }

      function unwrapLocalAppData(value) {
        if (value && typeof value === "object" && !Array.isArray(value)
          && value.format === LOCAL_FALLBACK_FORMAT
          && value.version === LOCAL_FALLBACK_VERSION
          && Object.prototype.hasOwnProperty.call(value, "data")) {
          return {
            data: value.data,
            updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
            source: typeof value.source === "string" && value.source ? value.source : "localstorage-fallback",
            conflictPreserved: value.conflictPreserved === true,
            conflictReason: typeof value.conflictReason === "string" ? value.conflictReason : ""
          };
        }
        return { data: value, updatedAt: null, source: "legacy-localstorage", conflictPreserved: false, conflictReason: "" };
      }

      function createLocalAppDataEnvelope(snapshot, options = {}) {
        const hasUpdatedAt = Object.prototype.hasOwnProperty.call(options, "updatedAt");
        return {
          format: LOCAL_FALLBACK_FORMAT,
          version: LOCAL_FALLBACK_VERSION,
          source: options.source || "localstorage-fallback",
          updatedAt: hasUpdatedAt ? options.updatedAt : isoNow(),
          conflictPreserved: options.conflictPreserved === true,
          conflictReason: options.conflictReason || "",
          data: snapshot
        };
      }

      function writeLocalAppDataFallback(snapshot, options = {}) {
        if (appDataPersistenceConflict?.preserveLocal && options.replaceConflictPreserved !== true) return false;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(createLocalAppDataEnvelope(snapshot, options)));
          return true;
        } catch {
          return false;
        }
      }

      function storedAppDataCandidate(value, source, metadata = {}) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        const revision = value.dataRevision ?? 0;
        if (!Number.isSafeInteger(revision) || revision < 0) return null;
        const requiredCollectionKeys = ["sessions", "exercises", "sets", "templates"];
        if (requiredCollectionKeys.some((key) => !Array.isArray(value[key]))) return null;
        const collectionKeys = ["sessions", "exercises", "sets", "templates", "mesocycles", "recommendationHistory", "manualOverrides", "rawImports", "migrationAudit"];
        if (collectionKeys.some((key) => Object.prototype.hasOwnProperty.call(value, key) && !Array.isArray(value[key]))) return null;
        if (Object.prototype.hasOwnProperty.call(value, "settings") && (!value.settings || typeof value.settings !== "object" || Array.isArray(value.settings))) return null;
        return { source, value, revision, canonicalContent: null, updatedAt: metadata.updatedAt || null, timestamp: persistenceTimestamp(metadata.updatedAt) };
      }

      function resolveStoredAppDataCandidates(indexedCandidate, localCandidate) {
        if (!indexedCandidate && !localCandidate) return { selected: null, conflict: false, identical: false, reason: "none" };
        if (!indexedCandidate) return { selected: localCandidate, conflict: false, identical: false, reason: "local-only" };
        if (!localCandidate) return { selected: indexedCandidate, conflict: false, identical: false, reason: "indexed-only" };
        if (localCandidate.revision > indexedCandidate.revision) return { selected: localCandidate, conflict: false, identical: false, reason: "newer-revision" };
        if (indexedCandidate.revision > localCandidate.revision) return { selected: indexedCandidate, conflict: false, identical: false, reason: "newer-revision" };
        const canonicalContent = (candidate) => {
          if (typeof candidate.canonicalContent === "string") return candidate.canonicalContent;
          const canonicalize = (item) => {
            if (Array.isArray(item)) return item.map(canonicalize);
            if (!item || typeof item !== "object") return item;
            return Object.keys(item).sort().reduce((result, key) => {
              result[key] = canonicalize(item[key]);
              return result;
            }, {});
          };
          try { return JSON.stringify(canonicalize(candidate.value)); }
          catch { return undefined; }
        };
        const indexedContent = canonicalContent(indexedCandidate);
        const localContent = canonicalContent(localCandidate);
        if (indexedContent !== undefined && indexedContent === localContent) return { selected: indexedCandidate, conflict: false, identical: true, reason: "identical-content" };
        const indexedTimestamp = Number.isFinite(indexedCandidate.timestamp) ? indexedCandidate.timestamp : null;
        const localTimestamp = Number.isFinite(localCandidate.timestamp) ? localCandidate.timestamp : null;
        if (indexedTimestamp !== null && localTimestamp !== null && indexedTimestamp !== localTimestamp) {
          return { selected: localTimestamp > indexedTimestamp ? localCandidate : indexedCandidate, conflict: false, identical: false, reason: "newer-timestamp" };
        }
        return { selected: indexedCandidate, conflict: true, identical: false, reason: "equal-revision-unordered" };
      }

      async function loadData() {
        let indexedRecord = null;
        let indexedStored = null;
        let indexedReadSucceeded = false;
        try {
          indexedRecord = await readIndexedRecord("app-data");
          indexedStored = indexedRecord?.value ?? null;
          indexedReadSucceeded = true;
          persistenceReady = true;
        } catch {
          persistenceReady = false;
        }
        let localStored = null;
        let localStoredDetails = unwrapLocalAppData(null);
        let localStoragePresent = false;
        try {
          const localSource = localStorage.getItem(STORAGE_KEY);
          localStoragePresent = localSource !== null;
          localStored = localStoragePresent ? JSON.parse(localSource) : null;
          localStoredDetails = unwrapLocalAppData(localStored);
        } catch {
          localStoragePresent = true;
          localStored = null;
          localStoredDetails = unwrapLocalAppData(null);
        }
        const indexedCandidate = storedAppDataCandidate(indexedStored, "indexeddb", { updatedAt: indexedRecord?.updatedAt || null });
        const localCandidate = storedAppDataCandidate(localStoredDetails.data, "localstorage", { updatedAt: localStoredDetails.updatedAt });
        let selectedCandidate = indexedCandidate || localCandidate;
        if (indexedCandidate && localCandidate && localCandidate.revision > indexedCandidate.revision) selectedCandidate = localCandidate;
        const candidateResolution = resolveStoredAppDataCandidates(indexedCandidate, localCandidate);
        selectedCandidate = candidateResolution.selected || selectedCandidate;
        const persistedConflict = Boolean(localCandidate && localStoredDetails.conflictPreserved);
        const detectedConflict = Boolean(candidateResolution.conflict && indexedCandidate && localCandidate);
        appDataPersistenceConflict = persistedConflict || detectedConflict ? {
          preserveLocal: true,
          reason: localStoredDetails.conflictReason || candidateResolution.reason,
          message: "Conflicting saved app-data copies were preserved because their ordering is unavailable. Export a backup before using Clear All Local App Data; automatic fallback cleanup is paused."
        } : null;
        if (appDataPersistenceConflict && localCandidate && !localStoredDetails.conflictPreserved) {
          writeLocalAppDataFallback(localCandidate.value, {
            source: localStoredDetails.source,
            updatedAt: localStoredDetails.updatedAt,
            conflictPreserved: true,
            conflictReason: candidateResolution.reason,
            replaceConflictPreserved: true
          });
        }
        const stored = selectedCandidate?.value || null;
        const invalidStoredSource = Boolean((indexedStored !== null && !indexedCandidate) || (localStoragePresent && !localCandidate));
        data = stored ? { ...emptyData(), ...stored, settings: { ...defaultSettings, ...stored.settings } } : emptyData();
        const needsDomainRecalculation = Number(data.domainMigrationVersion || 0) < DOMAIN_MIGRATION_VERSION;
        data = normalizeLoadedData(data);
        analysisRevision = Number(data.dataRevision || 0);
        entityStructureRevision += 1;
        entityIndexCache = null;
        if (needsDomainRecalculation) {
          const activeIds = activeHistorySessionIds();
          data.sessions = data.sessions.map((session) => {
            if (!activeIds.has(session.id)) return session;
            const prs = submitWorkoutPrs(session);
            const updated = { ...session, prs };
            return { ...updated, workoutAnalysis: calculateWorkoutAnalysis(updated, { prs }) };
          });
          invalidateCompletedAnalysis();
        }
        applyTheme();
        if (data.sessions.length === 0) data.sessions.push(createSession());
        activeSessionId = [...data.sessions].sort((a, b) => b.date.localeCompare(a.date))[0].id;
        const draftSessions = data.sessions
          .filter((session) => sessionHasStarted(session))
          .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
        activeWorkoutId = draftSessions[0]?.id || "";
        if (!performanceFixtureEnabled) {
          await restoreRuntime();
          await restoreActiveWorkoutDraft();
        }
        if (activeWorkoutId && !hasActiveWorkout()) activeWorkoutId = "";
        if (!activeWorkoutId && draftSessions.length) activeWorkoutId = draftSessions[0].id;
        if (activeWorkoutId) {
          data.sessions = data.sessions.map((session) => {
            if (isSessionSubmitted(session)) return session;
            if (session.id === activeWorkoutId) return { ...session, workoutStarted: true, workoutState: "active" };
            return sessionHasStarted(session) ? { ...session, workoutStarted: false, workoutState: "inactive" } : session;
          });
        }
        if (activeWorkoutId) activeSessionId = activeWorkoutId;
        await restorePushIdentity();
        if (invalidStoredSource && !settingsMessage) settingsMessage = "One saved app-data copy was invalid. The newest valid copy was used; export a backup before clearing local data.";
        if (!appDataPersistenceConflict && selectedCandidate) {
          try {
            await writeIndexedValue("app-data", data);
            persistenceReady = true;
            if (localStoragePresent) {
              try { localStorage.removeItem(STORAGE_KEY); } catch { /* Confirmed IndexedDB data remains primary. */ }
            }
          } catch {
            persistenceReady = false;
            // Keep any local fallback until a later promotion is confirmed.
          }
        } else if (!indexedReadSucceeded) {
          persistenceReady = false;
        }
      }

      async function loadPrescriptionEvidence(options = {}) {
        if (!prescriptionApi) {
          prescriptionEvidenceStatus = { state: "unavailable", personalRecords: 0, researchExercises: 0, personalVersion: "unknown", researchVersion: "unknown", message: "The unified prescription module did not load." };
          return false;
        }
        const researchBaseUrl = "./research_database/exports/json";
        const personalEvidencePackage = Object.prototype.hasOwnProperty.call(options, "personalEvidencePackage")
          ? options.personalEvidencePackage
          : data.personalEvidencePackage;
        const persistedPersonalData = personalEvidencePackage?.personalData || null;
        let bundle = null;
        let sourceLabel = persistedPersonalData ? "imported local evidence" : "research defaults";
        try {
          const researchBundle = await prescriptionApi.loadEvidenceFromUrls({ researchBaseUrl, personalData: {} });
          if (persistedPersonalData) {
            bundle = prescriptionApi.normalizeEvidenceBundle({ personalData: persistedPersonalData, research: researchBundle.research });
          } else {
            const evidenceHostname = String(window.location.hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
            const loopbackEvidenceOrigin = evidenceHostname === "localhost" || evidenceHostname === "127.0.0.1" || evidenceHostname === "::1";
            const nativeEvidenceOrigin = window.Capacitor?.isNativePlatform?.() === true;
            if (!loopbackEvidenceOrigin && !nativeEvidenceOrigin) {
              bundle = researchBundle;
            } else {
            const personalSources = [
              { base: "./private-personal-data", metadata: "./private-personal-data/analysis_metadata.json", label: "private native evidence" },
              { base: "./personal_fitness_data/derived", metadata: "./personal_fitness_data/reports/analysis_metadata.json", label: "local protected evidence" }
            ];
            const fetchOptional = async (url, kind) => {
              try {
                const resolved = new URL(url, window.location.href);
                if (resolved.origin !== window.location.origin) return kind === "csv" ? [] : kind === "metadata" ? {} : [];
                const response = await fetch(resolved.href, { credentials: "same-origin", cache: "no-store" });
                if (!response.ok) return kind === "csv" ? [] : kind === "metadata" ? {} : [];
                return kind === "csv" ? prescriptionApi.parseCsv(await response.text()) : response.json();
              } catch {
                return kind === "csv" ? [] : kind === "metadata" ? {} : [];
              }
            };
            for (const source of personalSources) {
              const [exercisePrescriptions, exerciseScores, exerciseMuscleScores, exerciseSessionMetrics, weeklyMuscleVolumeResponse, recoveryRules, muscleGroupSweetSpots, embeddedMetadata] = await Promise.all([
                fetchOptional(`${source.base}/exercise_prescriptions.json`, "json"),
                fetchOptional(`${source.base}/exercise_scores.csv`, "csv"),
                fetchOptional(`${source.base}/exercise_muscle_scores.csv`, "csv"),
                fetchOptional(`${source.base}/exercise_session_metrics.csv`, "csv"),
                fetchOptional(`${source.base}/weekly_muscle_volume_response.csv`, "csv"),
                fetchOptional(`${source.base}/recovery_rules.json`, "json"),
                fetchOptional(`${source.base}/muscle_group_sweet_spots.json`, "json"),
                fetchOptional(`${source.base}/analysis_metadata.json`, "metadata")
              ]);
              let metadata = embeddedMetadata || {};
              if (!metadata.methodology_version && !metadata.pipeline_version) metadata = await fetchOptional(source.metadata, "metadata");
              const personalData = { exercisePrescriptions, exerciseScores, exerciseMuscleScores, exerciseSessionMetrics, weeklyMuscleVolumeResponse, recoveryRules, muscleGroupSweetSpots, metadata };
              const candidate = prescriptionApi.normalizeEvidenceBundle({ personalData, research: researchBundle.research });
              if (!candidate.personal.exercisePrescriptions.length && !candidate.personal.exerciseScores.length) {
                if (!bundle) bundle = candidate;
                continue;
              }
              bundle = candidate;
              sourceLabel = source.label;
              break;
            }
            }
          }
          if (!bundle) bundle = researchBundle;
          const nextPrescriptionEngine = prescriptionApi.createPrescriptionEngine(bundle);
          const personalRecords = bundle.personal.exercisePrescriptions.length + bundle.personal.exerciseScores.length + bundle.personal.exerciseMuscleScores.length;
          const nextPrescriptionEvidenceStatus = {
            state: bundle.research.exerciseDatabase.length ? "ready" : "research_unavailable",
            source: sourceLabel,
            personalRecords,
            researchExercises: bundle.research.exerciseDatabase.length,
            personalVersion: bundle.versions.personal,
            researchVersion: bundle.versions.research,
            message: personalRecords
              ? `Unified engine loaded ${personalRecords} personal prescription/score records and ${bundle.research.exerciseDatabase.length} research exercises from ${sourceLabel}.`
              : `Unified engine loaded ${bundle.research.exerciseDatabase.length} research exercises. Import the private personal evidence package on devices that cannot access the protected local files.`
          };
          prescriptionEngine = nextPrescriptionEngine;
          prescriptionEvidenceStatus = nextPrescriptionEvidenceStatus;
          invalidateCompletedAnalysis();
          return true;
        } catch (error) {
          if (options.preserveCurrentOnFailure === true) return false;
          prescriptionEngine = prescriptionApi.createPrescriptionEngine({});
          prescriptionEvidenceStatus = { state: "error", personalRecords: 0, researchExercises: 0, personalVersion: "unknown", researchVersion: "unknown", message: `Prescription evidence could not be loaded: ${error?.message || error}` };
          invalidateCompletedAnalysis();
          return false;
        }
      }

      async function initializePrescriptionEvidence() {
        return loadPrescriptionEvidence();
      }

      function normalizePrescriptionIdentity(value) {
        return String(value || "").toLowerCase().replace(/^ex_/, "").replace(/[^a-z0-9]+/g, " ").trim();
      }

      function personalExerciseRecordForName(exerciseName, evidence = prescriptionEngine?.evidence) {
        const requested = normalizePrescriptionIdentity(exerciseName);
        const personal = evidence?.personal;
        if (!requested || !personal) return null;
        const matchesRequestedName = (item) => normalizePrescriptionIdentity(item?.exercise_name || item?.exerciseName || item?.exercise_id || item?.exerciseId) === requested;
        for (const records of [personal.exerciseScores, personal.exercisePrescriptions, personal.exerciseMuscleScores]) {
          const match = Array.isArray(records) ? records.find(matchesRequestedName) : null;
          if (match) return match;
        }
        return null;
      }

      function resolvePrescriptionExerciseIdentity(exerciseOrName) {
        if (!prescriptionEngine || typeof prescriptionEngine.resolveExerciseIdentity !== "function") {
          return { status: "unresolved", reason: "unknown_exercise_identity" };
        }
        const exercise = typeof exerciseOrName === "string" ? { name: exerciseOrName } : (exerciseOrName || {});
        const explicitIdentity = exercise.researchExerciseId || exercise.research_exercise_id || exercise.exerciseId || exercise.exercise_id || "";
        const requestedValue = String(explicitIdentity || exercise.name || "").trim();
        if (!requestedValue) return { status: "unresolved", reason: "unknown_exercise_identity" };
        const resolver = prescriptionEngine.resolveExerciseIdentity;
        if (prescriptionIdentityCacheEngine !== prescriptionEngine || prescriptionIdentityCacheResolver !== resolver) {
          prescriptionIdentityResolutionCache.clear();
          prescriptionIdentityCacheEngine = prescriptionEngine;
          prescriptionIdentityCacheResolver = resolver;
        }
        let resolved = prescriptionIdentityResolutionCache.get(requestedValue);
        if (!resolved) {
          resolved = resolver.call(prescriptionEngine, requestedValue) || { status: "unresolved", reason: "unknown_exercise_identity" };
          prescriptionIdentityResolutionCache.set(requestedValue, resolved);
        }
        if (resolved.status === "resolved" && resolved.exerciseId) return resolved;
        if (resolved.reason && resolved.reason !== "unknown_exercise_identity") return resolved;

        // The engine deliberately leaves unmapped personal records unresolved.
        // Only a namespaced stable ID that is present in the reconciled personal
        // evidence index may remain executable as a trusted custom identity.
        const evidence = prescriptionEngine.evidence;
        const personalRecord = personalExerciseRecordForName(requestedValue, evidence)
          || (!explicitIdentity && exercise.name ? personalExerciseRecordForName(exercise.name, evidence) : null);
        const personalId = resolved.exerciseId || personalRecord?.exercise_id || personalRecord?.exerciseId || "";
        const reconciled = personalId ? evidence?.personal?.reconciledIdentityByExerciseId?.get(personalId) : null;
        if (/^(?:custom|user)(?::|_)/.test(personalId) && reconciled && !reconciled.invalid && !reconciled.researchExerciseId) {
          return { status: "resolved", exerciseId: personalId, source: "trusted_custom_personal_evidence", custom: true };
        }
        return { status: "unresolved", ...(resolved.exerciseId ? { exerciseId: resolved.exerciseId } : {}), reason: resolved.reason || "unknown_exercise_identity" };
      }

      function prescriptionExerciseIdentity(exerciseName) {
        if (typeof resolvePrescriptionExerciseIdentity === "function") {
          const resolved = resolvePrescriptionExerciseIdentity(exerciseName);
          return resolved.status === "resolved" ? resolved.exerciseId : null;
        }
        if (!prescriptionEngine) return null;
        if (typeof prescriptionEngine.resolveExerciseIdentity === "function") {
          const resolved = prescriptionEngine.resolveExerciseIdentity(exerciseName);
          if (resolved?.status === "resolved") return resolved.exerciseId;
          if (resolved?.reason && resolved.reason !== "unknown_exercise_identity") return null;
        }
        const requested = normalizePrescriptionIdentity(exerciseName);
        const evidence = prescriptionEngine.evidence;
        const researchId = evidence?.research?.exerciseIdByAlias?.get(requested)
          || evidence?.research?.exerciseDatabase?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === requested)?.exercise_id;
        if (researchId) return researchId;
        const records = [evidence?.personal?.exerciseScores, evidence?.personal?.exercisePrescriptions, evidence?.personal?.exerciseMuscleScores];
        const personalRecord = records.flatMap((items) => Array.isArray(items) ? items : []).find((item) => normalizePrescriptionIdentity(item?.exercise_name || item?.exerciseName || item?.exercise_id || item?.exerciseId) === requested);
        const personalId = personalRecord?.exercise_id || personalRecord?.exerciseId || "";
        const reconciled = evidence?.personal?.reconciledIdentityByExerciseId?.get(personalId);
        if (reconciled?.invalid) return null;
        if (reconciled?.researchExerciseId) return reconciled.researchExerciseId;
        return /^(?:custom|user)(?::|_)/.test(personalId) ? personalId : null;
      }

      function prescriptionMuscleGroup(exerciseOrName) {
        const exercise = typeof exerciseOrName === "string" ? { name: exerciseOrName } : (exerciseOrName || {});
        const resolved = musclesForExercise(exercise)[0]?.muscle || exercise.primaryMuscle || "";
        if (resolved) return normalizePrescriptionIdentity(resolved);
        const identity = prescriptionExerciseIdentity(exercise.name);
        const prescription = identity ? prescriptionEngine?.evidence.personal.prescriptionsFor(identity)[0] : null;
        return normalizePrescriptionIdentity(prescription?.muscle_group_id || prescription?.muscleGroupId || "general");
      }

      function appPrescriptionHistory(exerciseName, options = {}) {
        const weeks = summarizeExerciseByWeek(exerciseName, { throughDate: options.throughDate || todayIso(), retentionAsOfDate: todayIso(), excludeSessionId: options.excludeSessionId });
        return weeks.slice().reverse().map((week, index, ordered) => {
          const previous = ordered[index - 1];
          const currentPerformance = Number(week.bestEstimatedOneRepMax || 0);
          const priorPerformance = Number(previous?.bestEstimatedOneRepMax || 0);
          const change = currentPerformance > 0 && priorPerformance > 0 ? (currentPerformance / priorPerformance - 1) * 100 : null;
          const status = week.intentionalReduction ? "planned_reduction" : change == null ? "baseline" : change >= 1 ? "improved" : change < -1.5 ? "regressed" : "held";
          return {
            workout_date: week.weekStart,
            progression_status: status,
            progression_pct_vs_prior: change,
            comparison_performance_value: currentPerformance || null,
            best_epley_e1rm: currentPerformance || null,
            average_rpe: Number(week.averageRpe || 0) || null,
            set_repetitions: JSON.stringify([week.maxRepsAtTopWeight, week.minRepsAtTopWeight].filter((value) => value > 0)),
            set_loads: JSON.stringify(week.topWeight > 0 ? Array(Math.max(1, week.topWeightSetCount)).fill(week.topWeight) : []),
            top_set_count: week.setsBelowTopWeight > 0 ? Math.max(1, week.topWeightSetCount) : 0,
            back_off_set_count: week.setsBelowTopWeight,
            straight_working_set_count: week.setsBelowTopWeight > 0 ? 0 : week.completedSets,
            completed_set_ratio: week.completedSets / Math.max(1, week.completedSets + week.failedSets),
            regression_duration_exposures: status === "regressed" ? Math.min(3, 1 + (previous?.progression_status === "regressed" ? 1 : 0)) : 0,
            prescribed_reduction: Boolean(week.intentionalReduction),
            prescribed_reduction_reasons: week.intentionalReductionReasons || []
          };
        });
      }

      function prescriptionHistoryForExercise(exerciseName, exerciseId, options = {}) {
        const throughDate = options.throughDate || todayIso();
        const personal = (prescriptionEngine?.evidence.personal.historyFor(exerciseId) || []).filter((item) => String(item.workout_date || item.date || "").slice(0, 10) <= throughDate);
        const appHistory = appPrescriptionHistory(exerciseName, options);
        const latestPersonalDate = personal.reduce((latest, item) => {
          const date = String(item.workout_date || item.date || "").slice(0, 10);
          return date > latest ? date : latest;
        }, "");
        return [...personal, ...appHistory.filter((item) => !latestPersonalDate || item.workout_date > latestPersonalDate)];
      }

      function prescriptionReadiness(recoveryInput = {}, history = []) {
        const recovery = cleanRecovery(recoveryInput);
        const baseline = readinessBaseline();
        const recentStatus = String(history.at(-1)?.progression_status || history.at(-1)?.progressionStatus || "").toLowerCase();
        return {
          sleepHours: recovery.sleepHours === "" ? undefined : Number(recovery.sleepHours),
          baselineSleepHours: Number(baseline.sleepHours || 0) || undefined,
          hrv: recovery.hrv === "" ? undefined : Number(recovery.hrv),
          baselineHrv: Number(baseline.hrv || 0) || undefined,
          restingHeartRate: recovery.restingHr === "" ? undefined : Number(recovery.restingHr),
          baselineRestingHeartRate: Number(baseline.restingHr || 0) || undefined,
          soreness: recovery.soreness === "" ? undefined : Number(recovery.soreness) * 2,
          illness: Boolean(recovery.illness),
          pain: Boolean(recovery.pain),
          affectedMuscle: recovery.affectedMuscle,
          previousExposureRegressed: /regress|declin/.test(recentStatus),
          consecutiveRegressions: history.slice(-2).filter((item) => /regress|declin/.test(String(item.progression_status || item.progressionStatus || "").toLowerCase())).length,
          readinessScore: recovery.sleepQuality === "" ? undefined : Number(recovery.sleepQuality) * 2,
          nutritionAdequate: recovery.nutritionStatus === "" ? undefined : recovery.nutritionStatus === "on_plan",
          proteinAdequate: recovery.proteinStatus === "" ? undefined : recovery.proteinStatus === "adequate",
          energyAvailabilityLow: recovery.nutritionStatus === "low_energy"
        };
      }

      function currentMesocycle() {
        return data.mesocycles.find((mesocycle) => mesocycle.id === data.activeMesocycleId && mesocycle.status === "active") || null;
      }

      function prescriptionScopeHistories(template, targetMuscle, options = {}) {
        const entries = (template?.exercises || []).map((exercise) => {
          const id = prescriptionExerciseIdentity(exercise.name);
          if (!id) return null;
          return { muscle: prescriptionMuscleGroup(exercise), history: prescriptionHistoryForExercise(exercise.name, id, options) };
        }).filter(Boolean);
        const muscleExerciseHistories = entries.filter((entry) => entry.muscle === targetMuscle).map((entry) => entry.history);
        const byMuscle = new Map();
        entries.forEach((entry) => {
          if (!byMuscle.has(entry.muscle)) byMuscle.set(entry.muscle, []);
          byMuscle.get(entry.muscle).push(entry.history);
        });
        return { muscleExerciseHistories, programMuscleHistories: Array.from(byMuscle.values()) };
      }

      function trustedCustomPrescriptionMuscleGroup(exercise, exerciseId) {
        const manualMuscle = String(exercise?.primaryMuscle || "").trim();
        if (manualMuscle) return normalizePrescriptionIdentity(manualMuscle);
        const personal = prescriptionEngine?.evidence?.personal;
        const explicitPersonalRecord = personal?.prescriptionsFor?.(exerciseId)?.find((record) => record?.muscle_group_id || record?.muscleGroupId)
          || personal?.muscleScoresFor?.(exerciseId)?.find((record) => record?.muscle_group_id || record?.muscleGroupId);
        return String(explicitPersonalRecord?.muscle_group_id || explicitPersonalRecord?.muscleGroupId || "").trim();
      }

      function unifiedPrescriptionSnapshot(exerciseOrName, options = {}) {
        if (!prescriptionEngine || prescriptionEvidenceStatus.state === "error") return null;
        const hardConstraintRejection = (reason, message) => {
          const normalizedReason = String(reason || "constraint_rejection").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
          return {
            type: "hard_constraint_rejection",
            kind: "hard_constraint_rejection",
            code: `HARD_CONSTRAINT_${normalizedReason.toUpperCase()}`,
            hardConstraint: true,
            executionBlocked: true,
            executable: false,
            status: "blocked",
            reason: normalizedReason,
            message: String(message || "The workout request violates a hard constraint."),
            decision: "hold",
            mode: "stop-modify",
            interventionType: "stop_modify",
            sets: 0,
            reps: 0,
            repLow: 0,
            repHigh: 0,
            weight: 0,
            addedLoad: 0,
            assistanceLoad: 0,
            rpe: 0,
            restSeconds: 0,
            warmups: [],
            executableActions: [],
            safetyRestriction: {
              schemaVersion: "hard-safety/1.0.0",
              status: "blocked",
              scope: normalizedReason === "empty_muscle_scope" || normalizedReason === "invalid_time_constraint" ? "workout" : "exercise",
              reason: normalizedReason,
              resumeCriteria: "Correct the rejected hard constraint before generating or executing this workout."
            }
          };
        };
        const engineFailure = () => ({
          type: "engine_failure",
          kind: "engine_failure",
          code: "PRESCRIPTION_ENGINE_FAILURE",
          hardConstraint: false,
          executionBlocked: true,
          executable: false,
          status: "unavailable",
          recommendationStatus: "unavailable",
          reason: "engine_failure",
          message: "Recommendation guidance is unavailable because the prescription engine could not generate a recommendation.",
          decision: "hold",
          mode: "stop-modify",
          interventionType: "stop_modify",
          sets: 0,
          reps: 0,
          repLow: 0,
          repHigh: 0,
          weight: 0,
          addedLoad: 0,
          assistanceLoad: 0,
          rpe: 0,
          restSeconds: 0,
          warmups: [],
          executableActions: []
        });
        const exercise = typeof exerciseOrName === "string" ? { name: exerciseOrName } : (exerciseOrName || {});
        if (exercise.recommendationSnapshot) {
          const owningSession = exercise.sessionId
            ? data.sessions.find((session) => session.id === exercise.sessionId)
            : null;
          // Submitted history is an immutable audit record. It must remain
          // byte/reference exact even when a later engine no longer accepts the
          // historical schema. Active and template snapshots are executable
          // state, so they must pass the current integrity and identity boundary
          // before reuse.
          if (owningSession && isSessionSubmitted(owningSession)) return exercise.recommendationSnapshot;
          try {
            validateExecutableRecommendationSnapshot(exercise.recommendationSnapshot, prescriptionEngine, exercise, "Stored executable recommendationSnapshot");
            return exercise.recommendationSnapshot;
          } catch {
            return hardConstraintRejection(
              "invalid_stored_recommendation_snapshot",
              "The stored recommendation snapshot failed integrity, identity, or taxonomy validation and cannot be executed."
            );
          }
        }
        const identityInput = Object.prototype.hasOwnProperty.call(options, "exerciseId")
          ? { ...exercise, exerciseId: options.exerciseId }
          : exercise;
        const identity = typeof resolvePrescriptionExerciseIdentity === "function"
          ? resolvePrescriptionExerciseIdentity(identityInput)
          : (() => {
              const fallbackId = options.exerciseId || prescriptionExerciseIdentity(exercise.name);
              return fallbackId ? { status: "resolved", exerciseId: fallbackId, source: "compatibility_adapter" } : { status: "unresolved", reason: "unknown_exercise_identity" };
            })();
        if (identity.status !== "resolved" || !identity.exerciseId) {
          const reason = identity.reason || "unknown_exercise_identity";
          return hardConstraintRejection(reason, `The exercise identity could not be resolved safely (${reason}).`);
        }
        const exerciseId = identity.exerciseId;
        const hasExplicitMuscleGroup = Object.prototype.hasOwnProperty.call(options, "muscleGroupId");
        let muscleGroupId = hasExplicitMuscleGroup ? String(options.muscleGroupId || "").trim() : "";
        if (!hasExplicitMuscleGroup && identity.custom) {
          muscleGroupId = typeof trustedCustomPrescriptionMuscleGroup === "function" ? trustedCustomPrescriptionMuscleGroup(exercise, exerciseId) : normalizePrescriptionIdentity(exercise.primaryMuscle || "");
        } else if (!hasExplicitMuscleGroup) {
          if (typeof prescriptionEngine.resolveDefaultPrescriptionTarget === "function") {
            const target = prescriptionEngine.resolveDefaultPrescriptionTarget(exerciseId);
            if (!target || target.status !== "resolved") {
              const reason = target?.reason || "unknown_exercise_identity";
              return hardConstraintRejection(reason, `The exercise has no safe canonical default prescription target (${reason}).`);
            }
            muscleGroupId = target.muscleGroupId;
          } else {
            muscleGroupId = normalizePrescriptionIdentity(prescriptionMuscleGroup(exercise));
          }
        }
        if (!muscleGroupId || muscleGroupId === "general") return hardConstraintRejection("invalid_muscle_identity", "The exercise does not have a resolved canonical muscle-group identity.");
        const explicitScope = Object.prototype.hasOwnProperty.call(options, "includedMuscleGroupIds")
          ? options.includedMuscleGroupIds
          : Object.prototype.hasOwnProperty.call(options, "muscleScope") ? options.muscleScope : undefined;
        if (explicitScope !== undefined && (!Array.isArray(explicitScope) || explicitScope.length === 0)) {
          return hardConstraintRejection("empty_muscle_scope", "At least one canonical muscle group must remain in scope.");
        }
        const explicitDurationValues = ["sessionDurationMinutes", "timeConstraintMinutes", "maxSessionMinutes", "sessionDurationMaximumMinutes"]
          .filter((field) => Object.prototype.hasOwnProperty.call(options, field))
          .map((field) => options[field]);
        if (explicitDurationValues.some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0)) {
          return hardConstraintRejection("invalid_time_constraint", "Session duration constraints must be finite positive minutes.");
        }
        const throughDate = options.throughDate || todayIso();
        const history = options.history || prescriptionHistoryForExercise(exercise.name, exerciseId, options);
        const mesocycle = options.mesocycle === undefined ? currentMesocycle() : options.mesocycle;
        const appSettings = typeof data === "object" && data?.settings ? data.settings : {};
        const recoveryInput = options.recovery || {};
        const affectedMuscle = String(recoveryInput.affectedMuscle || "").trim();
        const painApplies = !recoveryInput.pain || !affectedMuscle || musclesForExercise(exercise).some((item) => normalizePrescriptionIdentity(item.muscle) === normalizePrescriptionIdentity(affectedMuscle));
        const scopedRecovery = painApplies ? recoveryInput : { ...recoveryInput, pain: false, affectedMuscle: "" };
        const readiness = options.readiness || prescriptionReadiness(scopedRecovery, history);
        const scope = prescriptionScopeHistories(options.template, muscleGroupId, options);
        const appMuscle = musclesForExercise(exercise)[0]?.muscle || appMuscleFromPrescriptionGroup(muscleGroupId);
        const currentWeeklySets = appMuscle ? Number(weeklyMuscleVolume(startOfWeekIso(throughDate)).find((item) => item.muscle === appMuscle)?.sets || 0) : undefined;
        const equipmentIncrement = Number(options.equipmentIncrement || exercise.increment || 0);
        const sessionDurationMinutes = options.sessionDurationMinutes ?? options.timeConstraintMinutes ?? options.maxSessionMinutes ?? options.template?.sessionDurationMinutes ?? mesocycle?.sessionDurationTargetMinutes ?? mesocycle?.constraints?.sessionDurationTargetMinutes;
        const availableEquipment = Object.prototype.hasOwnProperty.call(options, "availableEquipment")
          ? options.availableEquipment
          : mesocycle?.availableEquipment ?? (Array.isArray(appSettings.availableEquipment) && appSettings.availableEquipment.length ? appSettings.availableEquipment : ["all"]);
        const request = {
          exerciseId,
          muscleGroupId,
          history,
          histories: options.histories,
          readiness,
          mesocycle,
          role: options.role,
          muscleExerciseHistories: scope.muscleExerciseHistories,
          programMuscleHistories: scope.programMuscleHistories,
          currentWeeklySets,
          equipmentIncrement,
          plannedWorkingSets: options.plannedWorkingSets ?? options.plannedSets ?? exercise.plannedSets ?? exercise.sets,
          resistanceType: options.resistanceType ?? exercise.resistanceType,
          sessionDurationMinutes,
          sessionDurationTargetMinutes: sessionDurationMinutes,
          sessionDurationMaximumMinutes: options.sessionDurationMaximumMinutes ?? sessionDurationMinutes,
          availableEquipment,
          excludedExerciseIds: options.excludedExerciseIds ?? options.exerciseExclusions ?? options.template?.excludedExerciseIds ?? mesocycle?.constraints?.excludedExerciseIds ?? appSettings.excludedExerciseIds,
          includedMuscleGroupIds: options.includedMuscleGroupIds ?? options.muscleScope ?? mesocycle?.includedMuscleGroupIds,
          trainingDays: options.trainingDays ?? mesocycle?.trainingDays ?? appSettings.trainingDaysPerWeek,
          trainingGoal: options.trainingGoal ?? appSettings.trainingGoal,
          nutritionPhase: options.nutritionPhase ?? appSettings.nutritionPhase,
          experienceLevel: options.experienceLevel ?? appSettings.experienceLevel,
          returningAfterGap: options.returningAfterGap ?? appSettings.returningAfterGap,
          createdAt: options.createdAt || `${throughDate}T12:00:00.000Z`
        };
        ["plannedWorkingSets", "resistanceType", "sessionDurationMinutes", "sessionDurationTargetMinutes", "sessionDurationMaximumMinutes", "availableEquipment", "excludedExerciseIds", "includedMuscleGroupIds", "trainingDays", "trainingGoal", "nutritionPhase", "experienceLevel", "returningAfterGap"].forEach((field) => {
          if (request[field] === undefined || request[field] === null || request[field] === "") delete request[field];
        });
        const cacheKey = [analysisRevision, exerciseId, muscleGroupId, throughDate, mesocycle?.id || "", equipmentIncrement, JSON.stringify(readiness), JSON.stringify({ plannedWorkingSets: request.plannedWorkingSets, resistanceType: request.resistanceType, sessionDurationMinutes: request.sessionDurationMinutes, availableEquipment: request.availableEquipment, excludedExerciseIds: request.excludedExerciseIds, includedMuscleGroupIds: request.includedMuscleGroupIds, trainingDays: request.trainingDays, trainingGoal: request.trainingGoal, nutritionPhase: request.nutritionPhase, experienceLevel: request.experienceLevel, returningAfterGap: request.returningAfterGap }), options.historical ? "history" : "current"].join("|");
        if (!options.fresh && prescriptionSnapshotCache.has(cacheKey)) return prescriptionSnapshotCache.get(cacheKey);
        try {
          const snapshot = prescriptionEngine.prescribeExercise(request);
          if (!options.fresh) prescriptionSnapshotCache.set(cacheKey, snapshot);
          return snapshot;
        } catch (error) {
          const recognizedConstraintError = error?.name === "Error" && error?.constructor?.name === "Error";
          const detail = recognizedConstraintError
            ? `${error?.code || ""} ${error?.message || error || ""}`.toLowerCase()
            : "";
          const reason = recognizedConstraintError && /exercise .+ is excluded by the supplied|excluded exercise .+ (?:invalid|unknown)|exclusions? must resolve|excludedexerciseids must/.test(detail)
            ? "excluded_exercise"
            : /exercise .+ is not compatible with the supplied equipment|available equipment (?:input|restriction)|equipment restrictions?; missing/.test(detail)
              ? "unavailable_equipment"
              : /unknown exercise .+ for muscle group|exerciseid and musclegroupid are required|invalid trusted identity|no positive dynamic taxonomy target relationship/.test(detail)
                ? "invalid_exercise_identity"
                : /includedmusclegroupids scope/.test(detail)
                  ? "invalid_muscle_scope"
                  : /session duration .+(?:positive finite|must not exceed)|positive finite number of minutes/.test(detail)
                    ? "invalid_time_constraint"
                    : "";
          return reason
            ? hardConstraintRejection(reason, error?.message || "The prescription engine rejected a recognized hard workout constraint.")
            : engineFailure();
        }
      }

      function recommendationLabel(type) {
        return ({
          normal: "Train as prescribed",
          progress: "Progress",
          hold: "Hold",
          reduce_volume: "Reduce volume",
          light_session: "Readiness-adjusted light session",
          exercise_deload: "Exercise-specific deload",
          muscle_group_deload: "Muscle-group deload",
          full_program_deload: "Full-program deload",
          substitute: "Substitute exercise",
          rotate_exercise: "Rotate exercise"
        })[type] || "Training prescription";
      }

      function recommendationActionLabel(prescription) {
        if (!prescription) return "Training prescription";
        if (prescription.recommendationType !== "progress") return recommendationLabel(prescription.recommendationType);
        return ({
          increase_load: "Progress Load",
          increase_top_set_load: "Progress Top-Set Load",
          increase_load_first: "Progress Load",
          add_one_rep: "Add One Rep",
          add_one_rep_fixed_load: "Add One Rep",
          progress_top_set_rep: "Add a Top-Set Rep",
          progress_backoff_reps: "Add Back-Off Reps",
          add_one_working_set: "Add One Working Set",
          improve_technique_quality: "Progress Execution"
        })[prescription.progressionAction] || "Progress";
      }

      function legacyRecommendationFromSnapshot(snapshot, exerciseName) {
        if (!snapshot) return null;
        if (snapshot.executionBlocked === true && snapshot.executable === false && ["hard_constraint_rejection", "engine_failure"].includes(snapshot.type || snapshot.kind)) return snapshot;
        const prescription = snapshot.finalPrescription;
        const type = prescription.recommendationType;
        const deload = ["exercise_deload", "muscle_group_deload", "full_program_deload"].includes(type);
        const rotation = ["substitute", "rotate_exercise"].includes(type);
        const light = ["reduce_volume", "light_session"].includes(type);
        const progressionAction = type === "progress"
          ? Number(prescription.prescribedLoad?.adjustmentPercent || 0) > 0 ? "increase_load" : "increase_reps"
          : type === "hold" || type === "normal" ? "repeat" : type;
        const explanationLead = String(prescription.userExplanation || snapshot.explanation || "").split(/(?<=[.!?])\s+/)[0] || recommendationLabel(type);
        return {
          decision: rotation ? "change" : deload ? "deload" : type === "progress" ? "progress" : "hold",
          label: recommendationLabel(type),
          reason: explanationLead,
          action: prescription.progressionRule,
          evidence: prescription.evidenceSummary || snapshot.evidenceSummary || [],
          confidence: prescription.confidence || snapshot.confidence,
          interventionType: rotation ? "stop_modify" : deload ? "deload" : light ? "light" : "normal",
          progressionAction,
          affectedExerciseIds: [prescription.exerciseId],
          affectedExerciseName: exerciseName || prescription.exerciseId,
          reasonCodes: [type, prescription.staleness?.classification, prescription.deloadStatus?.state].filter(Boolean),
          humanReadableReason: prescription.userExplanation,
          severity: deload || rotation ? "high" : light ? "moderate" : "normal",
          loadAdjustment: Number(prescription.prescribedLoad?.adjustmentPercent || 0) / 100,
          setAdjustment: Number(prescription.readinessAdjustment?.setChange || 0),
          targetLoad: Number(prescription.prescribedLoad?.target || 0),
          targetReps: Number(prescription.repRange?.target || prescription.repRange?.min || 0),
          resistanceType: prescription.resistanceType || "external",
          rpeTarget: prescription.targetRpe ? Number(((prescription.targetRpe.min + prescription.targetRpe.max) / 2).toFixed(1)) : null,
          restAdjustment: 0,
          removeIntensificationTechniques: deload || light,
          progressionExpected: type === "progress",
          durationInSessions: deload || light ? 1 : rotation ? 4 : 1,
          returnToNormalCriteria: prescription.readinessAdjustment?.resumeRule || prescription.holdRule,
          sourceWindow: { historical: false },
          recommendationId: snapshot.recommendationId,
          recommendationSnapshot: snapshot,
          prescription
        };
      }

      function legacyTargetFromSnapshot(snapshot, templateExercise = {}, options = {}) {
        if (!snapshot) return null;
        if (snapshot.executionBlocked === true && snapshot.executable === false && ["hard_constraint_rejection", "engine_failure"].includes(snapshot.type || snapshot.kind)) return snapshot;
        const prescription = options.useBase ? snapshot.basePrescription : snapshot.finalPrescription;
        const type = prescription.recommendationType;
        const resistanceType = templateExercise.resistanceType || inferResistanceType(templateExercise.name || prescription.exerciseId, templateExercise);
        if (prescription.executionBlocked === true) {
          const reason = prescription.userExplanation || prescription.readinessAdjustment?.explanation || "A hard safety restriction blocks this exercise until its resume criteria are met.";
          const blockedTarget = {
            decision: type,
            mode: "stop-modify",
            interventionType: "stop_modify",
            executionBlocked: true,
            safetyAdjustment: true,
            safetyRestriction: prescription.safetyRestriction || null,
            sets: 0,
            reps: 0,
            repLow: 0,
            repHigh: 0,
            weight: 0,
            rpe: 0,
            weightUnit: data.settings.weightUnit,
            resistanceType,
            addedLoad: 0,
            assistanceLoad: 0,
            isBodyweight: isBodyweightResistance(resistanceType),
            isDeload: false,
            restSeconds: 0,
            warmups: [],
            executableActions: [],
            reason,
            preferredReplacementExerciseId: prescription.preferredReplacementExerciseId || null,
            substitutionRule: prescription.substitutionRule || "Stop the affected work unless a distinct, catalog-backed, pain-free alternative is explicitly confirmed.",
            confidence: prescription.confidence,
            recommendationSnapshot: snapshot,
            basePrescription: snapshot.basePrescription,
            finalPrescription: snapshot.finalPrescription,
            coachRecommendation: legacyRecommendationFromSnapshot(snapshot, templateExercise.name || prescription.exerciseId),
            adjusted: true,
            adjustmentReason: reason,
            triggerLabels: prescription.readinessAdjustment?.signals?.map((signal) => signal.explanation) || []
          };
          blockedTarget.text = targetText(blockedTarget, reason);
          return blockedTarget;
        }
        const rpe = prescription.targetRpe ? Number(((prescription.targetRpe.min + prescription.targetRpe.max) / 2).toFixed(1)) : 8;
        const sourceWeightUnit = prescription.prescribedLoad?.unit || templateExercise.weightUnit || data.settings.weightUnit;
        const weight = Number(convertWeightValue(prescription.prescribedLoad?.target || 0, sourceWeightUnit, data.settings.weightUnit));
        const reps = Number(prescription.repRange?.target || Math.round((prescription.repRange.min + prescription.repRange.max) / 2));
        const mode = type === "progress" ? (Number(prescription.prescribedLoad?.adjustmentPercent || 0) > 0 ? "load-progression" : "rep-progression")
          : ["exercise_deload", "muscle_group_deload", "full_program_deload"].includes(type) ? "deload"
            : type === "light_session" || type === "reduce_volume" ? "light"
              : type === "substitute" || type === "rotate_exercise" ? "substitution" : "maintenance";
        const target = {
          decision: type,
          mode,
          interventionType: type,
          sets: prescription.workingSets.target,
          reps,
          repLow: prescription.repRange.min,
          repHigh: prescription.repRange.max,
          weight,
          rpe,
          weightUnit: data.settings.weightUnit,
          resistanceType,
          addedLoad: resistanceType === "bodyweight_plus_load" ? weight : 0,
          assistanceLoad: resistanceType === "assisted_bodyweight" ? weight : 0,
          isBodyweight: isBodyweightResistance(resistanceType),
          isDeload: ["exercise_deload", "muscle_group_deload", "full_program_deload"].includes(type),
          reason: prescription.userExplanation,
          increment: Math.abs(weight - Number(convertWeightValue(prescription.prescribedLoad?.previous || 0, sourceWeightUnit, data.settings.weightUnit))) || Number(templateExercise.increment || progressionProfileForExercise(templateExercise.name || prescription.exerciseId).increment),
          confidence: prescription.confidence,
          restSeconds: prescription.restSeconds.target,
          restReason: `Unified ${prescription.confidence} confidence target: ${prescription.restSeconds.min}-${prescription.restSeconds.max} seconds.`,
          setStructure: prescription.setStructure,
          topSet: prescription.topSet,
          backoffSets: prescription.backoffSets,
          recommendationSnapshot: snapshot,
          basePrescription: snapshot.basePrescription,
          finalPrescription: snapshot.finalPrescription,
          coachRecommendation: legacyRecommendationFromSnapshot(snapshot, templateExercise.name || prescription.exerciseId),
          adjusted: Boolean(prescription.readinessAdjustment?.changed),
          adjustmentReason: prescription.readinessAdjustment?.changed ? prescription.readinessAdjustment.explanation : "",
          triggerLabels: prescription.readinessAdjustment?.signals?.map((signal) => signal.explanation) || []
        };
        target.text = targetText(target, target.reason);
        return target;
      }

      function unifiedTargetContext(target, template, templateExercise) {
        const prescription = target?.finalPrescription || target?.recommendationSnapshot?.finalPrescription;
        if (!prescription) return null;
        if (target.executionBlocked === true || prescription.executionBlocked === true) {
          return {
            id: target.recommendationSnapshot?.recommendationId || "",
            exerciseId: prescription.exerciseId,
            exerciseName: templateExercise?.name || prescription.exerciseId,
            templateId: template?.id || "",
            templateName: template?.name || "Unified prescription",
            sessionType: "stop-modify",
            source: "Unified prescription engine hard-safety restriction",
            effectiveStartDate: todayIso(),
            setTypes: [],
            confidence: prescription.confidence,
            executionBlocked: true,
            safetyRestriction: prescription.safetyRestriction || null,
            recommendationSnapshot: target.recommendationSnapshot
          };
        }
        const setTypes = [];
        if (prescription.setStructure === "top_set_backoff") {
          setTypes.push({ type: "top", label: "Top set", setCount: Number(prescription.topSet?.count || 1), repMin: prescription.topSet?.repRange?.min || prescription.repRange.min, repMax: prescription.topSet?.repRange?.max || prescription.repRange.max, rpeMin: Math.max(5, Number(prescription.topSet?.targetRpe || prescription.targetRpe.min) - 1), rpeMax: Number(prescription.topSet?.targetRpe || prescription.targetRpe.max), rirMin: prescription.topSet?.targetRir, rirMax: prescription.topSet?.targetRir, restSeconds: prescription.restSeconds.target, countsTowardScore: true, countsTowardVolume: true });
          setTypes.push({ type: "backoff", label: "Back-off set", setCount: Number(prescription.backoffSets?.count || Math.max(1, prescription.workingSets.target - 1)), repMin: prescription.backoffSets?.repRange?.min || prescription.repRange.min, repMax: prescription.backoffSets?.repRange?.max || prescription.repRange.max, rpeMin: Math.max(5, Number(prescription.backoffSets?.targetRpe || prescription.targetRpe.min) - 1), rpeMax: Number(prescription.backoffSets?.targetRpe || prescription.targetRpe.max), rirMin: prescription.backoffSets?.targetRir, rirMax: prescription.backoffSets?.targetRir, loadReductionMin: prescription.backoffSets?.loadReductionPercent?.min, loadReductionTarget: prescription.backoffSets?.loadReductionPercent?.target, loadReductionMax: prescription.backoffSets?.loadReductionPercent?.max, restSeconds: prescription.restSeconds.target, countsTowardScore: true, countsTowardVolume: true });
        } else if (prescription.setStructure === "multiple_top_sets") {
          setTypes.push({ type: "top", label: "Top set", setCount: prescription.workingSets.target, repMin: prescription.repRange.min, repMax: prescription.repRange.max, rpeMin: prescription.targetRpe.min, rpeMax: prescription.targetRpe.max, restSeconds: prescription.restSeconds.target, countsTowardScore: true, countsTowardVolume: true });
        } else {
          const type = target.isDeload ? "deload" : "straight";
          setTypes.push({ type, label: setTypeLabels[type] || "Working set", setCount: prescription.workingSets.target, repMin: prescription.repRange.min, repMax: prescription.repRange.max, rpeMin: prescription.targetRpe.min, rpeMax: prescription.targetRpe.max, restSeconds: prescription.restSeconds.target, countsTowardScore: true, countsTowardVolume: true });
        }
        return {
          id: target.recommendationSnapshot.recommendationId,
          exerciseId: prescription.exerciseId,
          exerciseName: templateExercise?.name || prescription.exerciseId,
          templateId: template?.id || "",
          templateName: template?.name || "Unified prescription",
          sessionType: target.mode,
          source: "Unified prescription engine",
          effectiveStartDate: todayIso(),
          setTypes,
          progressionRule: prescription.progressionRule,
          confidence: prescription.confidence,
          recommendationSnapshot: target.recommendationSnapshot
        };
      }

      function cancelPendingDataSave() {
        window.clearTimeout(saveTimer);
        saveTimer = 0;
        if (idleSaveHandle && "cancelIdleCallback" in window) window.cancelIdleCallback(idleSaveHandle);
        idleSaveHandle = 0;
      }

      async function persistStableAppDataSnapshot(snapshot) {
        if (performanceFixtureEnabled) return true;
        const saveStartedAt = performanceNow();
        try {
          await writeIndexedValue("app-data", snapshot);
          persistenceReady = true;
          if (!appDataPersistenceConflict) {
            try { localStorage.removeItem(STORAGE_KEY); } catch { /* IndexedDB remains primary. */ }
          }
          queueActiveWorkoutSync();
          recordPerformance("persistence:stableSnapshot", saveStartedAt, { sessions: snapshot.sessions.length, exercises: snapshot.exercises.length, sets: snapshot.sets.length });
          saveRuntime();
          return true;
        } catch {
          persistenceReady = false;
          if (writeLocalAppDataFallback(snapshot, { source: "stable-snapshot-fallback" })) {
            saveRuntime();
            return true;
          }
          settingsMessage = appDataPersistenceConflict
            ? "Current changes are not durable. A conflicting alternate is preserved; export a backup and retry before reloading."
            : "Storage is full on this device. Export a backup, clear old data, or import a smaller file.";
          return false;
        }
      }

      function saveData() {
        cancelPendingDataSave();
        if (historyEditFlow) return false;
        if (performanceFixtureEnabled) return true;
        const saveStartedAt = performanceNow();
        writeIndexedValue("app-data", data).then(() => {
          persistenceReady = true;
          if (!appDataPersistenceConflict) {
            try { localStorage.removeItem(STORAGE_KEY); } catch { /* IndexedDB remains primary. */ }
          }
          queueActiveWorkoutSync();
          recordPerformance("persistence:fullData", saveStartedAt, { sessions: data.sessions.length, exercises: data.exercises.length, sets: data.sets.length });
        }).catch(() => {
          persistenceReady = false;
          if (!writeLocalAppDataFallback(data, { source: "ordinary-save-fallback" })) {
            settingsMessage = appDataPersistenceConflict
              ? "Current changes are not durable. A conflicting alternate is preserved; export a backup and retry before reloading."
              : "Storage is full on this device. Export a backup, clear old data, or import a smaller file.";
            render();
          }
        });
        saveRuntime();
        return true;
      }

      function scheduleSave() {
        window.clearTimeout(saveTimer);
        scheduleActiveDraftSave();
        if (idleSaveHandle && "cancelIdleCallback" in window) window.cancelIdleCallback(idleSaveHandle);
        saveTimer = window.setTimeout(() => {
          if ("requestIdleCallback" in window) idleSaveHandle = window.requestIdleCallback(saveData, { timeout: 1500 });
          else saveData();
        }, 1800);
      }

      function activeWorkoutDraftSnapshot() {
        const session = activeWorkoutSession();
        if (!session) return null;
        const index = dataEntityIndex();
        const exercises = (index.exerciseIndicesBySession.get(session.id) || []).map((exerciseIndex) => data.exercises[exerciseIndex]);
        const sets = exercises.flatMap((exercise) => (index.setIndicesByExercise.get(exercise.id) || []).map((setIndex) => data.sets[setIndex]));
        return { version: 1, workoutId: session.id, savedAt: isoNow(), session, exercises, sets };
      }

      function scheduleActiveDraftSave() {
        window.clearTimeout(draftSaveTimer);
        if (!hasActiveWorkout()) return;
        draftSaveTimer = window.setTimeout(persistActiveWorkoutDraft, 120);
      }

      function persistActiveWorkoutDraft() {
        window.clearTimeout(draftSaveTimer);
        const snapshot = activeWorkoutDraftSnapshot();
        if (!snapshot || performanceFixtureEnabled) return false;
        const startedAt = performanceNow();
        writeIndexedValue("active-workout-draft", snapshot).then(() => recordPerformance("persistence:activeDraft", startedAt, { exercises: snapshot.exercises.length, sets: snapshot.sets.length })).catch(() => undefined);
        try { localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(snapshot)); } catch { /* IndexedDB remains the primary draft store. */ }
        return true;
      }

      async function restoreActiveWorkoutDraft() {
        let indexed = null;
        let local = null;
        try { indexed = await readIndexedValue("active-workout-draft"); } catch { /* Fall back below. */ }
        try { local = JSON.parse(localStorage.getItem(ACTIVE_DRAFT_KEY) || "null"); } catch { local = null; }
        const snapshot = [indexed, local].filter((item) => item?.workoutId).sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))[0];
        if (!snapshot) return false;
        const session = data.sessions.find((item) => item.id === snapshot.workoutId && !isSessionSubmitted(item));
        if (!session || !Array.isArray(snapshot.exercises) || !Array.isArray(snapshot.sets)) return false;
        const existingExerciseIds = new Set(data.exercises.filter((exercise) => exercise.sessionId === snapshot.workoutId).map((exercise) => exercise.id));
        data.sessions = data.sessions.map((item) => item.id === snapshot.workoutId ? { ...item, ...snapshot.session, workoutStarted: true, workoutState: "active" } : item);
        data.exercises = [...data.exercises.filter((exercise) => exercise.sessionId !== snapshot.workoutId), ...snapshot.exercises];
        data.sets = [...data.sets.filter((set) => !existingExerciseIds.has(set.exerciseId)), ...snapshot.sets];
        activeWorkoutId = snapshot.workoutId;
        activeSessionId = snapshot.workoutId;
        entityStructureRevision += 1;
        entityIndexCache = null;
        return true;
      }

      function clearActiveWorkoutDraft() {
        window.clearTimeout(draftSaveTimer);
        try { localStorage.removeItem(ACTIVE_DRAFT_KEY); } catch { /* IndexedDB cleanup remains primary. */ }
        writeIndexedValue("active-workout-draft", null).catch(() => undefined);
      }

      function saveRuntime() {
        if (performanceFixtureEnabled) return true;
        const runtime = { activeSessionId, activeWorkoutId, timer, timerCompleteNotice, restCompletionState: restCompletionController?.getState() || restCompletionState, restNavigationState, activeSetId, pendingNextSetId, activeSetAcknowledged, activeSetNotice };
        writeIndexedValue("runtime", runtime).catch(() => {
          try { localStorage.setItem(RUNTIME_KEY, JSON.stringify(runtime)); } catch { return false; }
        });
        return true;
      }

      async function restoreRuntime() {
        let runtime = null;
        try {
          runtime = await readIndexedValue("runtime");
        } catch {
          try { runtime = JSON.parse(localStorage.getItem(RUNTIME_KEY) || "null"); } catch { runtime = null; }
        }
        if (!runtime) return;
        if (data.sessions.some((session) => session.id === runtime.activeSessionId)) activeSessionId = runtime.activeSessionId;
        if (data.sessions.some((session) => session.id === runtime.activeWorkoutId && !isSessionSubmitted(session))) activeWorkoutId = runtime.activeWorkoutId;
        if (data.sets.some((set) => set.id === runtime.activeSetId)) {
          activeSetId = runtime.activeSetId;
          activeSetAcknowledged = Boolean(runtime.activeSetAcknowledged);
          activeSetNotice = runtime.activeSetNotice || "";
        }
        if (data.sets.some((set) => set.id === runtime.pendingNextSetId)) pendingNextSetId = runtime.pendingNextSetId;
        timerCompleteNotice = runtime.timerCompleteNotice || null;
        restCompletionState = runtime.restCompletionState || null;
        if (restCompletionState && restCompletionController) {
          const restored = restCompletionController.restore(restCompletionState, data.settings);
          restCompletionState = restored || restCompletionState;
          timerCompleteNotice = restored?.notice?.visible ? restored.notice : null;
        }
        restNavigationState = runtime.restNavigationState || null;
        if (runtime.timer && data.sets.some((set) => set.id === runtime.timer.setId) && (!runtime.timer.workoutId || runtime.timer.workoutId === activeWorkoutId)) {
          timer = { id: runtime.timer.id || id(), pendingNextSetId: runtime.timer.pendingNextSetId || runtime.pendingNextSetId || "", ...runtime.timer };
          if (!restNavigationState) setRestNavigationState(timer, timer.isPaused ? "paused" : "active");
          pendingNextSetId = timer.pendingNextSetId || pendingNextSetId;
          if (timer.isActive && !timer.isPaused) {
            timer.remainingSeconds = Math.max(0, Math.ceil((Number(timer.endsAt || 0) - Date.now()) / 1000));
            if (timer.remainingSeconds > 0) startTimerInterval();
            else window.setTimeout(completeTimer, 0);
          }
        }
      }

      function commit(nextData, shouldRender = true, options = {}) {
        const previousData = data;
        if (arrayIdentityChanged(previousData.sessions, nextData.sessions) || arrayIdentityChanged(previousData.exercises, nextData.exercises) || arrayIdentityChanged(previousData.sets, nextData.sets)) {
          entityStructureRevision += 1;
          entityIndexCache = null;
        }
        data = { ...nextData, dataRevision: Number(data?.dataRevision || 0) + 1 };
        if (options.invalidateAnalysis !== false) invalidateCompletedAnalysis();
        if (previousData.settings !== data.settings) applyTheme();
        if (isEditingHistorySession()) {
          historyEditFlow.dirty = true;
          if (shouldRender) render();
          return;
        }
        if (shouldRender && !options.deferPersistence) saveData();
        else scheduleSave();
        if (shouldRender) render();
      }

      function applyTheme() {
        const theme = data.settings?.theme === "dark" ? "dark" : "light";
        document.documentElement.dataset.theme = theme;
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f4f8fb" : "#081015");
      }

      function themeLabel() {
        return data.settings.theme === "light" ? "Light" : "Dark";
      }

      function createSession(title, options = {}) {
        const now = isoNow();
        const sameDayCount = data.sessions.filter((session) => session.date === todayIso()).length + 1;
        return { id: id(), date: todayIso(), title: title || "Workout " + sameDayCount, isTravel: false, notes: "", recovery: defaultRecovery(), submitted: false, workoutStarted: Boolean(options.started), workoutState: options.started ? "active" : "idle", startedAt: options.started ? now : "", createdAt: now, updatedAt: now };
      }

      function defaultRecovery() {
        return cleanRecovery();
      }

      function sessionRecovery(session) {
        return cleanRecovery(session?.recovery || {});
      }

      function createSet(exerciseId, setNumber, previous) {
        const exercise = data.exercises.find((item) => item.id === exerciseId);
        const resistanceType = previous?.resistanceType || exercise?.resistanceType || inferResistanceType(exercise?.name || "", exercise || {});
        const weight = previous?.weight ?? 0;
        return {
          id: id(),
          exerciseId,
          setNumber,
          sequenceIndex: Number(previous?.sequenceIndex ?? previous?.sequence ?? setNumber),
          sequence: Number(previous?.sequence ?? previous?.sequenceIndex ?? setNumber),
          setTypeIndex: Number(previous?.setTypeIndex ?? 0),
          sourceTemplateSetId: previous?.sourceTemplateSetId || "",
          reps: previous?.reps ?? 8,
          weight,
          weightUnit: previous?.weightUnit ?? data.settings.weightUnit,
          resistanceType,
          isBodyweight: isBodyweightResistance(resistanceType),
          addedLoad: resistanceType === "bodyweight_plus_load" ? Number(previous?.addedLoad ?? weight) : Number(previous?.addedLoad || 0),
          assistanceLoad: resistanceType === "assisted_bodyweight" ? Number(previous?.assistanceLoad ?? weight) : Number(previous?.assistanceLoad || 0),
          durationSeconds: Number(previous?.durationSeconds || 0),
          distance: Number(previous?.distance || 0),
          distanceUnit: previous?.distanceUnit || "m",
          rpe: previous?.rpe ?? 8,
          completed: previous?.completed ?? false,
          isWarmup: previous?.isWarmup ?? false,
          setType: normalizeSetTypeCode(previous?.setType, previous?.isWarmup),
          countsTowardScore: previous?.countsTowardScore ?? !(previous?.isWarmup ?? false),
          countsTowardVolume: previous?.countsTowardVolume ?? !(previous?.isWarmup ?? false),
          countsTowardProgression: previous?.countsTowardProgression ?? !(previous?.isWarmup ?? false),
          classificationSource: previous?.classificationSource || "app-explicit",
          classificationConfidence: previous?.classificationConfidence ?? 1,
          classifierVersion: previous?.classifierVersion || SET_CLASSIFIER_VERSION,
          manualOverride: Boolean(previous?.manualOverride),
          reviewRequired: Boolean(previous?.reviewRequired),
          skipped: previous?.skipped ?? false,
          edited: previous?.edited ?? false,
          targetReps: previous?.targetReps ?? previous?.reps,
          targetRepMin: previous?.targetRepMin ?? 0,
          targetRepMax: previous?.targetRepMax ?? previous?.targetReps ?? previous?.reps,
          targetWeight: previous?.targetWeight ?? previous?.weight,
          targetRpe: previous?.targetRpe ?? previous?.rpe,
          targetRpeMin: previous?.targetRpeMin ?? 0,
          targetRpeMax: previous?.targetRpeMax ?? previous?.targetRpe ?? previous?.rpe,
          targetRpeTolerance: previous?.targetRpeTolerance ?? 0.5,
          targetRestSeconds: previous?.targetRestSeconds ?? exercise?.restSeconds ?? 0,
          setPrescription: previous?.setPrescription ? { ...previous.setPrescription, previousComparableSet: previous.setPrescription.previousComparableSet ? { ...previous.setPrescription.previousComparableSet } : null } : null,
          previousComparableSet: previous?.previousComparableSet ? { ...previous.previousComparableSet } : null,
          prescriptionReason: previous?.prescriptionReason || "",
          prescriptionMode: previous?.prescriptionMode || "",
          prescriptionConfidence: previous?.prescriptionConfidence || "",
          validationWarning: previous?.validationWarning || ""
        };
      }

      function isSessionSubmitted(session) {
        return isCompletedWorkout(session);
      }

      function invalidateCompletedAnalysis() {
        analysisRevision += 1;
        activeHistoryCache.clear();
        activeHistoryIdCache.clear();
        completedAnalysisIndexCache = null;
        exerciseCatalogCache = null;
        completedEntriesCache = null;
        exerciseScopeCache.clear();
        exerciseWeekCache.clear();
        hypertrophyWeekCache.clear();
        hypertrophyQualificationCache.clear();
        hypertrophyScoreCache.clear();
        weeklyVolumeCache.clear();
        fatigueFlagCache.clear();
        templateAdviceCache.clear();
        targetContextCache.clear();
        actualExpectedCache.clear();
        coachRecommendationCache.clear();
        exerciseProgressCache.clear();
        previousPerformanceCache.clear();
        muscleAssignmentCache.clear();
        prescriptionSnapshotCache.clear();
      }

      function arrayIdentityChanged(previous, next) {
        if (previous === next) return false;
        if (!Array.isArray(previous) || !Array.isArray(next) || previous.length !== next.length) return true;
        for (let index = 0; index < previous.length; index += 1) {
          if (previous[index]?.id !== next[index]?.id) return true;
        }
        return false;
      }

      function dataEntityIndex() {
        if (entityIndexCache?.revision === entityStructureRevision) return entityIndexCache;
        const sessionIndexById = new Map();
        const exerciseIndexById = new Map();
        const setIndexById = new Map();
        const exerciseIndicesBySession = new Map();
        const setIndicesByExercise = new Map();
        data.sessions.forEach((session, index) => sessionIndexById.set(session.id, index));
        data.exercises.forEach((exercise, index) => {
          exerciseIndexById.set(exercise.id, index);
          const list = exerciseIndicesBySession.get(exercise.sessionId) || [];
          list.push(index);
          exerciseIndicesBySession.set(exercise.sessionId, list);
        });
        data.sets.forEach((set, index) => {
          setIndexById.set(set.id, index);
          const list = setIndicesByExercise.get(set.exerciseId) || [];
          list.push(index);
          setIndicesByExercise.set(set.exerciseId, list);
        });
        entityIndexCache = { revision: entityStructureRevision, sessionIndexById, exerciseIndexById, setIndexById, exerciseIndicesBySession, setIndicesByExercise };
        return entityIndexCache;
      }

      function sessionById(sessionId) {
        const index = dataEntityIndex().sessionIndexById.get(sessionId);
        return index == null ? null : data.sessions[index];
      }

      function exerciseById(exerciseId) {
        const index = dataEntityIndex().exerciseIndexById.get(exerciseId);
        return index == null ? null : data.exercises[index];
      }

      function setById(setId) {
        const index = dataEntityIndex().setIndexById.get(setId);
        return index == null ? null : data.sets[index];
      }

      function completedAnalysisIndex() {
        if (completedAnalysisIndexCache?.revision === analysisRevision) return completedAnalysisIndexCache;
        const sessions = activeHistorySessions();
        const sessionById = new Map(sessions.map((session) => [session.id, session]));
        const exerciseById = new Map();
        const exercisesByCanonical = new Map();
        const setsByCanonical = new Map();
        const exercisesBySession = new Map();
        const setsByExercise = new Map();
        const canonicalByExerciseId = new Map();
        data.exercises.forEach((exercise) => {
          if (!sessionById.has(exercise.sessionId)) return;
          const canonicalId = canonicalExerciseId(exercise.name);
          if (!canonicalId) return;
          exerciseById.set(exercise.id, exercise);
          const sessionExercises = exercisesBySession.get(exercise.sessionId) || [];
          sessionExercises.push(exercise);
          exercisesBySession.set(exercise.sessionId, sessionExercises);
          canonicalByExerciseId.set(exercise.id, canonicalId);
          const list = exercisesByCanonical.get(canonicalId) || [];
          list.push(exercise);
          exercisesByCanonical.set(canonicalId, list);
        });
        data.sets.forEach((set) => {
          const exercise = exerciseById.get(set.exerciseId);
          if (!exercise) return;
          const canonicalId = canonicalByExerciseId.get(exercise.id);
          const list = setsByCanonical.get(canonicalId) || [];
          list.push(set);
          setsByCanonical.set(canonicalId, list);
          const exerciseSets = setsByExercise.get(set.exerciseId) || [];
          exerciseSets.push(set);
          setsByExercise.set(set.exerciseId, exerciseSets);
        });
        exercisesBySession.forEach((exercises) => exercises.sort((a, b) => Number(a.order || 0) - Number(b.order || 0)));
        setsByExercise.forEach((sets) => sets.sort((a, b) => Number(a.sequenceIndex ?? a.sequence ?? a.setNumber ?? 0) - Number(b.sequenceIndex ?? b.sequence ?? b.setNumber ?? 0)));
        completedAnalysisIndexCache = { revision: analysisRevision, sessions, sessionById, exerciseById, exercisesByCanonical, setsByCanonical, exercisesBySession, setsByExercise, canonicalByExerciseId };
        return completedAnalysisIndexCache;
      }

      function activeHistorySessions(options = {}) {
        const key = analysisRevision + "|" + (options.asOfDate || todayIso()) + "|" + (options.throughDate || "");
        if (!activeHistoryCache.has(key)) activeHistoryCache.set(key, activeCompletedWorkoutHistory(data, options));
        return activeHistoryCache.get(key);
      }

      function activeHistorySessionIds(options = {}) {
        const key = analysisRevision + "|" + (options.asOfDate || todayIso()) + "|" + (options.throughDate || "");
        if (!activeHistoryIdCache.has(key)) activeHistoryIdCache.set(key, new Set(activeHistorySessions(options).map((session) => session.id)));
        return activeHistoryIdCache.get(key);
      }

      function activeSession() {
        return sessionById(activeSessionId) || data.sessions[0];
      }

      function activeWorkoutSession() {
        const session = sessionById(activeWorkoutId);
        return session && !isSessionSubmitted(session) ? session : null;
      }

      function sessionHasStarted(session) {
        if (session?.workoutState === "inactive") return false;
        return Boolean(session && !isSessionSubmitted(session) && (session.workoutStarted || session.templateId || (dataEntityIndex().exerciseIndicesBySession.get(session.id) || []).length));
      }

      function sessionCanBeDiscarded(session) {
        return Boolean(session && !isSessionSubmitted(session));
      }

      function isEditingHistorySession(sessionId = activeSessionId) {
        return Boolean(historyEditFlow && historyEditFlow.sessionId === sessionId);
      }

      function cloneAppData(source = data) {
        return typeof structuredClone === "function" ? structuredClone(source) : JSON.parse(JSON.stringify(source));
      }

      function hasActiveWorkout() {
        const session = activeWorkoutSession();
        return sessionHasStarted(session);
      }

      function activeExercises() {
        const session = activeSession();
        if (!session) return [];
        return (dataEntityIndex().exerciseIndicesBySession.get(session.id) || []).map((index) => data.exercises[index]).sort((a, b) => a.order - b.order);
      }

      function workoutSessionOptions(session) {
        const activeIds = activeHistorySessionIds();
        const recent = [...data.sessions]
          .filter((item) => activeIds.has(item.id) || item.id === activeWorkoutId || item.id === session?.id)
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 60);
        return Array.from(new Map([session, ...recent].filter(Boolean).map((item) => [item.id, item])).values());
      }

      function setsForExercise(exerciseId) {
        return (dataEntityIndex().setIndicesByExercise.get(exerciseId) || []).map((index) => data.sets[index]).sort((a, b) => canonicalSetSequence(a) - canonicalSetSequence(b) || Number(a.setNumber || 0) - Number(b.setNumber || 0));
      }

      function canonicalSetSequence(set) {
        return Number(set?.sequenceIndex ?? set?.sequence ?? set?.setNumber ?? 0);
      }

      function setExecutionLabel(set) {
        if (!set) return "Set";
        const exerciseSets = setsForExercise(set.exerciseId);
        if (setTypeSemantics(set).isWarmup) {
          const warmups = exerciseSets.filter((item) => setTypeSemantics(item).isWarmup);
          const index = warmups.findIndex((item) => item.id === set.id);
          return "Warm-Up " + (Math.max(0, index) + 1) + " of " + warmups.length;
        }
        const type = normalizeSetTypeCode(set.setType, set.isWarmup);
        const sameRole = exerciseSets.filter((item) => normalizeSetTypeCode(item.setType, item.isWarmup) === type);
        const roleIndex = Math.max(0, sameRole.findIndex((item) => item.id === set.id));
        const numberedRole = (label) => label + " " + (roleIndex + 1) + (sameRole.length > 1 ? " of " + sameRole.length : "");
        if (type === "top") return sameRole.length > 1 ? numberedRole("Top Set") : "Top Set";
        if (type === "backoff") return numberedRole("Back-Off Set");
        if (type === "drop") return numberedRole("Drop Set");
        if (type === "deload") return numberedRole("Deload Set");
        if (type === "technique") return numberedRole("Technique Set");
        if (type === "amrap") return numberedRole("AMRAP Set");
        return numberedRole("Working Set");
      }

      function orderedActiveSets() {
        return activeExercises().flatMap((exercise) => setsForExercise(exercise.id));
      }

      function setVisualState(set) {
        if (set.skipped) return "skipped";
        if (set.completed) return "completed";
        if (set.id === activeSetId) return "current";
        if (set.edited) return "edited";
        return "future";
      }

      function ensureActiveSet() {
        if (timer?.isActive) {
          activeSetId = "";
          return;
        }
        const current = data.sets.find((set) => set.id === activeSetId);
        const activeSetIds = new Set(orderedActiveSets().map((set) => set.id));
        if (current && activeSetIds.has(current.id) && !current.completed && !current.skipped) {
          if (!activeSetAcknowledged) activeSetNotice = setExecutionLabel(current) + " is ready";
          return;
        }
        const next = orderedActiveSets().find((set) => !set.completed && !set.skipped) || null;
        activeSetId = next?.id || "";
        activeSetAcknowledged = false;
        activeSetNotice = next ? setExecutionLabel(next) + " is ready" : "";
      }

      function nextIncompleteSet(afterSetId) {
        const ordered = orderedActiveSets();
        const index = ordered.findIndex((set) => set.id === afterSetId);
        return ordered.slice(Math.max(0, index + 1)).find((set) => !set.completed && !set.skipped)
          || ordered.find((set) => set.id !== afterSetId && !set.completed && !set.skipped)
          || null;
      }

      function setActiveSet(setId, notice = "", acknowledged = false) {
        activeSetId = setId || "";
        if (activeSetId && pendingNextSetId === activeSetId) pendingNextSetId = "";
        activeSetNotice = notice;
        activeSetAcknowledged = acknowledged;
        saveRuntime();
      }

      function acknowledgeActiveSet(setId) {
        if (!setId || setId !== activeSetId || activeSetAcknowledged) return;
        activeSetAcknowledged = true;
        activeSetNotice = "";
        saveRuntime();
        const block = document.getElementById("set-" + setId);
        block?.classList.add("acknowledged");
        const label = block?.querySelector(".next-set-banner span:last-child");
        if (label) label.textContent = "Current set";
      }

      function estimatedOneRepMax(set) {
        if (set.weight <= 0 || set.reps <= 0) return 0;
        return set.weight * (1 + set.reps / 30);
      }

      function roundToIncrement(value, increment) {
        return Math.max(increment, Math.round(value / increment) * increment);
      }

      function getExerciseNames() {
        return Array.from(completedAnalysisIndex().exercisesByCanonical.values()).map((exercises) => exercises.at(-1)?.name?.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
      }

      function exerciseKey(name) {
        return String(name || "")
          .toLowerCase()
          .replace(/\([^)]*\)/g, "")
          .replace(/\b(barbell|dumbbell|machine|cable|bodyweight)\b/g, "")
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      }

      function canonicalExerciseId(name) {
        const normalized = normalizePrescriptionIdentity(name);
        if (!normalized) return "";
        const evidence = prescriptionEngine?.evidence;
        if (typeof resolvePrescriptionExerciseIdentity === "function") {
          const structured = resolvePrescriptionExerciseIdentity(name);
          if (structured.status === "resolved") return structured.exerciseId;
          if (structured.reason && structured.reason !== "unknown_exercise_identity") return null;
        } else {
          const researchId = evidence?.research?.exerciseIdByAlias?.get(normalized)
            || evidence?.research?.exerciseDatabase?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalized)?.exercise_id;
          if (researchId) return researchId;
        }
        const personalRecord = typeof personalExerciseRecordForName === "function"
          ? personalExerciseRecordForName(name, evidence)
          : evidence?.personal?.exerciseScores?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalized)
            || evidence?.personal?.exercisePrescriptions?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalized)
            || evidence?.personal?.exerciseMuscleScores?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalized);
        const personalId = personalRecord?.exercise_id || personalRecord?.exerciseId || "";
        const reconciled = evidence?.personal?.reconciledIdentityByExerciseId?.get(personalId);
        if (reconciled?.invalid) return null;
        if (reconciled && !reconciled.invalid && reconciled.researchExerciseId) return reconciled.researchExerciseId;
        if (/^(?:custom|user)(?::|_)/.test(personalId)) return personalId;
        // This fallback is reporting-only. Prescription generation always uses
        // resolvePrescriptionExerciseIdentity and can never execute this ID.
        return `custom_${normalized.replace(/\s+/g, "_")}`;
      }

      function exerciseCatalog() {
        if (exerciseCatalogCache?.revision === analysisRevision) return exerciseCatalogCache.items;
        const analysisIndex = completedAnalysisIndex();
        const sessions = analysisIndex.sessionById;
        const catalog = new Map();
        analysisIndex.exerciseById.forEach((exercise) => {
          const id = canonicalExerciseId(exercise.name);
          if (!id) return;
          const session = sessions.get(exercise.sessionId);
          const current = catalog.get(id) || { id, name: exercise.name.trim(), resistanceType: resistanceTypeFor(exercise), lastDate: "", submittedUses: 0 };
          if (session) {
            current.submittedUses += 1;
            if (!current.lastDate || session.date >= current.lastDate) { current.lastDate = session.date; current.name = exercise.name.trim(); current.resistanceType = resistanceTypeFor(exercise); }
          }
          catalog.set(id, current);
        });
        const items = Array.from(catalog.values()).sort((a, b) => a.name.localeCompare(b.name));
        exerciseCatalogCache = { revision: analysisRevision, items };
        return items;
      }

      function selectedExerciseRecord() {
        const catalog = exerciseCatalog();
        return catalog.find((exercise) => exercise.id === selectedExerciseId) || null;
      }

      function selectedExerciseName() {
        return selectedExerciseRecord()?.name || "";
      }

      function normalizeChartSearch(value) {
        return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
      }

      function exactStructuredChartExerciseId(query) {
        const raw = String(query || "").trim();
        if (!raw) return "";
        const resolution = resolvePrescriptionExerciseIdentity(raw);
        return resolution.status === "resolved" ? resolution.exerciseId : "";
      }

      function matchingChartExercises(query = chartExerciseDraft) {
        const lexicalQuery = normalizeChartSearch(query);
        const exactStructuredId = exactStructuredChartExerciseId(query);
        const recentRank = new Map(recentChartExerciseIds.map((id, index) => [id, index]));
        return exerciseCatalog()
          .map((exercise) => ({ ...exercise, lexicalName: normalizeChartSearch(exercise.name), lexicalId: normalizeChartSearch(exercise.id) }))
          .filter((exercise) => !lexicalQuery || exercise.lexicalName.includes(lexicalQuery) || exercise.lexicalId.includes(lexicalQuery) || exercise.id === exactStructuredId)
          .sort((a, b) => {
            const aExact = a.id === exactStructuredId || a.lexicalName === lexicalQuery ? 0 : a.lexicalName.startsWith(lexicalQuery) || a.lexicalId.startsWith(lexicalQuery) ? 1 : 2;
            const bExact = b.id === exactStructuredId || b.lexicalName === lexicalQuery ? 0 : b.lexicalName.startsWith(lexicalQuery) || b.lexicalId.startsWith(lexicalQuery) ? 1 : 2;
            if (aExact !== bExact) return aExact - bExact;
            const aRecent = recentRank.has(a.id) ? recentRank.get(a.id) : 999;
            const bRecent = recentRank.has(b.id) ? recentRank.get(b.id) : 999;
            return aRecent - bRecent || b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name);
          })
          .map(({ lexicalName, lexicalId, ...exercise }) => exercise)
          .slice(0, 8);
      }

      function renderExerciseSuggestions(query = chartExerciseDraft) {
        const matches = matchingChartExercises(query);
        if (!matches.length) return '<div class="exercise-search-empty">No matching logged exercise. Keep the current selection or try another name.</div>';
        return matches.map((exercise, index) => '<button class="exercise-suggestion ' + (index === chartExerciseHighlight ? 'highlighted' : '') + '" type="button" data-action="select-chart-exercise" data-exercise-id="' + escapeHtml(exercise.id) + '"><strong>' + escapeHtml(exercise.name) + '</strong><span>' + exercise.submittedUses + ' submitted workout' + (exercise.submittedUses === 1 ? '' : 's') + (exercise.lastDate ? ' · Last ' + formatDate(exercise.lastDate) : '') + '</span></button>').join('');
      }

      function updateExerciseSuggestionList() {
        const list = root.querySelector(".exercise-suggestions");
        if (!list) return;
        list.innerHTML = renderExerciseSuggestions(chartExerciseDraft);
        list.hidden = !chartExerciseSearchOpen;
        const error = root.querySelector(".exercise-search-error");
        if (error) { error.textContent = chartExerciseSearchError; error.hidden = !chartExerciseSearchError; }
      }

      function selectChartExercise(exerciseId) {
        const exercise = exerciseCatalog().find((item) => item.id === exerciseId);
        if (!exercise) return false;
        selectedExerciseId = exercise.id;
        chartExerciseDraft = exercise.name;
        hypertrophyWindowOffset = 0;
        chartExerciseSearchOpen = false;
        chartExerciseSearchError = "";
        chartExerciseHighlight = 0;
        recentChartExerciseIds = [exercise.id, ...recentChartExerciseIds.filter((id) => id !== exercise.id)].slice(0, 8);
        chartDetailPoint = null;
        hypertrophyScoreExpanded = false;
        hypertrophyScoreLoading = true;
        render();
        window.setTimeout(() => { hypertrophyScoreLoading = false; render(); }, 80);
        return true;
      }

      function confirmChartExerciseDraft() {
        const matches = matchingChartExercises(chartExerciseDraft);
        const exactStructuredId = exactStructuredChartExerciseId(chartExerciseDraft);
        const lexicalQuery = normalizeChartSearch(chartExerciseDraft);
        const exact = matches.find((exercise) => exercise.id === exactStructuredId || normalizeChartSearch(exercise.name) === lexicalQuery);
        return selectChartExercise((exact || matches[chartExerciseHighlight] || matches[0])?.id || "");
      }

      function exerciseMatches(storedName, requestedName) {
        const stored = String(storedName || "").trim().toLowerCase();
        const requested = String(requestedName || "").trim().toLowerCase();
        return stored === requested || exerciseKey(storedName) === exerciseKey(requestedName);
      }

      // RESISTANCE_MODEL_START
      function isBodyweightExerciseName(name) {
        return /body ?weight|push up|pushup|pull up|pullup|chin up|chinup|\bdip\b|inverted row|air squat|pistol squat|plank|crunch|sit up|sit-up|hanging raise|knee raise|ab wheel|burpee/.test(exerciseKey(name));
      }

      const resistanceTypeValues = ["external", "bodyweight", "bodyweight_plus_load", "assisted_bodyweight", "duration", "distance"];

      function inferResistanceType(name, source = {}, sets = []) {
        if (resistanceTypeValues.includes(source.resistanceType)) return source.resistanceType;
        if (/\bassisted\b/.test(String(name || "").toLowerCase())) return "assisted_bodyweight";
        const bodyweight = Boolean(source.isBodyweight || isBodyweightExerciseName(name));
        if (!bodyweight) return "external";
        return sets.some((set) => Number(set.addedLoad ?? set.weight ?? 0) > 0) ? "bodyweight_plus_load" : "bodyweight";
      }

      function isBodyweightResistance(type) {
        return ["bodyweight", "bodyweight_plus_load", "assisted_bodyweight"].includes(type);
      }

      function resistanceTypeFor(exercise, set = null) {
        if (resistanceTypeValues.includes(exercise?.resistanceType)) return exercise.resistanceType;
        return inferResistanceType(exercise?.name || "", set || exercise || {}, set ? [set] : []);
      }

      function resistanceTypeLabel(type) {
        return ({ external: "External load", bodyweight: "Bodyweight", bodyweight_plus_load: "Bodyweight + load", assisted_bodyweight: "Assisted bodyweight", duration: "Duration", distance: "Distance" })[type] || "External load";
      }

      function resistanceTypeOptions(selected) {
        return resistanceTypeValues.map((type) => '<option value="' + type + '" ' + (type === selected ? 'selected' : '') + '>' + resistanceTypeLabel(type) + '</option>').join('');
      }

      function resistanceLoad(set, type) {
        if (type === "bodyweight_plus_load") return Number(set?.addedLoad ?? set?.weight ?? 0);
        if (type === "assisted_bodyweight") return Number(set?.assistanceLoad ?? set?.weight ?? 0);
        return Number(set?.weight || 0);
      }

      function formatLoadNumber(value) {
        return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
      }

      function roundLoadForUnit(value, unit = data.settings.weightUnit, increment = 0) {
        const numeric = Number(value || 0);
        if (!Number.isFinite(numeric)) return 0;
        if (unit === "lb") return Math.round(numeric * 2) / 2;
        if (Number(increment) > 0) return Number((Math.round(numeric / Number(increment)) * Number(increment)).toFixed(3));
        return Number(numeric.toFixed(3));
      }

      function displayLoadNumber(value, unit = data.settings.weightUnit) {
        return formatLoadNumber(roundLoadForUnit(value, unit));
      }

      function formatResistance(value, exercise = null) {
        const type = inferResistanceType(exercise?.name || "", value || exercise || {}, value ? [value] : []);
        const unit = value?.weightUnit || data.settings.weightUnit;
        const load = resistanceLoad(value, type);
        if (type === "bodyweight") return "BW";
        if (type === "bodyweight_plus_load") return load > 0 ? "BW + " + displayLoadNumber(load, unit) + " " + unit : "BW";
        if (type === "assisted_bodyweight") return load > 0 ? "BW - " + displayLoadNumber(load, unit) + " " + unit + " assistance" : "BW assisted";
        if (type === "duration") return formatLoadNumber(value?.durationSeconds || value?.reps || 0) + " sec";
        if (type === "distance") return formatLoadNumber(value?.distance || value?.reps || 0) + " " + (value?.distanceUnit || "m");
        return displayLoadNumber(load, unit) + " " + unit;
      }

      function formatSetPerformance(set, exercise = null) {
        const type = resistanceTypeFor(exercise, set);
        const effort = set?.rpe ? " @ RPE " + set.rpe : "";
        if (type === "duration") return formatResistance(set, exercise) + effort;
        if (type === "distance") return formatResistance(set, exercise) + effort;
        return Number(set?.reps || 0) + " reps × " + formatResistance(set, exercise) + effort;
      }

      function normalizeResistanceSet(set, type) {
        const load = Number(set.weight || 0);
        return {
          ...set,
          resistanceType: type,
          isBodyweight: isBodyweightResistance(type),
          addedLoad: type === "bodyweight_plus_load" ? Number(set.addedLoad ?? load) : Number(set.addedLoad || 0),
          assistanceLoad: type === "assisted_bodyweight" ? Number(set.assistanceLoad ?? load) : Number(set.assistanceLoad || 0),
          durationSeconds: Number(set.durationSeconds || 0),
          distance: Number(set.distance || 0),
          distanceUnit: set.distanceUnit || "m"
        };
      }

      const convertibleLoadKeys = new Set([
        "weight", "targetWeight", "originalTargetWeight", "addedLoad", "assistanceLoad",
        "increment", "targetLoad", "nextLoad"
      ]);

      function convertWeightValue(value, fromUnit, toUnit) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || fromUnit === toUnit) return value;
        const converted = fromUnit === "lb" && toUnit === "kg" ? numeric / 2.2046226218 : numeric * 2.2046226218;
        return roundLoadForUnit(converted, toUnit);
      }

      function convertWeightFields(value, fromUnit, toUnit, key = "") {
        if (value == null || fromUnit === toUnit) return value;
        if (key === "personalEvidencePackage" || key === "rawImports") return value;
        if (Array.isArray(value)) return value.map((item) => convertWeightFields(item, fromUnit, toUnit));
        if (typeof value !== "object") return convertibleLoadKeys.has(key) ? convertWeightValue(value, fromUnit, toUnit) : value;
        const converted = {};
        const hasExplicitUnitField = Object.prototype.hasOwnProperty.call(value, "weightUnit");
        Object.entries(value).forEach(([field, item]) => {
          if (field === "prescribedLoad" && item && typeof item === "object") {
            converted[field] = { ...item, target: convertWeightValue(item.target, fromUnit, toUnit), previous: convertWeightValue(item.previous, fromUnit, toUnit), unit: item.unit ? toUnit : item.unit };
          } else if (field === "load" && item && typeof item === "object" && ("from" in item || "to" in item)) {
            converted[field] = { ...item, from: convertWeightValue(item.from, fromUnit, toUnit), to: convertWeightValue(item.to, fromUnit, toUnit) };
          } else {
            converted[field] = convertWeightFields(item, fromUnit, toUnit, field);
          }
        });
        if (hasExplicitUnitField) converted.weightUnit = toUnit;
        if (converted.recommendationId && converted.checksum && typeof window !== "undefined" && window.ComprehensiveFitnessPrescriptionEngine?.refreshRecommendationChecksum) {
          return window.ComprehensiveFitnessPrescriptionEngine.refreshRecommendationChecksum(converted);
        }
        return converted;
      }

      function convertAppWeightUnit(model, toUnit) {
        const fromUnit = model?.settings?.weightUnit === "kg" ? "kg" : "lb";
        if (!model || !["lb", "kg"].includes(toUnit) || fromUnit === toUnit) return model;
        const converted = convertWeightFields(model, fromUnit, toUnit);
        converted.settings = { ...model.settings, weightUnit: toUnit };
        converted.personalEvidencePackage = model.personalEvidencePackage;
        converted.rawImports = model.rawImports;
        return converted;
      }
      // RESISTANCE_MODEL_END

      function getExerciseSets(exerciseName, options = {}) {
        const canonicalId = options.canonicalExerciseId || canonicalExerciseId(exerciseName);
        const key = analysisRevision + "|" + canonicalId;
        if (!exerciseScopeCache.has(key)) {
          const index = completedAnalysisIndex();
          exerciseScopeCache.set(key, { exercises: index.exercisesByCanonical.get(canonicalId) || [], sets: index.setsByCanonical.get(canonicalId) || [] });
        }
        return exerciseScopeCache.get(key);
      }

      function progressionProfileForExercise(name) {
        const key = exerciseKey(name);
        const unit = data.settings.weightUnit;
        const small = unit === "kg" ? 1 : 2.5;
        const standard = unit === "kg" ? 2.5 : 5;
        if (/pull up|pullup|chin up|chinup|\bdip\b|push up|pushup|plank/.test(key)) {
          return { kind: "bodyweight", increment: small, lowerRep: 8, upperRep: 20, maxJumpRatio: 0.2, roleRanges: { top: [8, 15], straight: [8, 20], backoff: [10, 20], drop: [15, 25] }, backoffReduction: [5, 10] };
        }
        if (/leg press|hack squat|pendulum squat|belt squat/.test(key)) {
          return { kind: "compound", subtype: "machine-compound", increment: standard, lowerRep: 8, upperRep: 15, maxJumpRatio: 0.12, roleRanges: { top: [8, 10], straight: [8, 15], backoff: [10, 15], drop: [15, 20] }, backoffReduction: [8, 15] };
        }
        if (/leg extension/.test(key)) {
          return { kind: "machine", subtype: "machine-isolation", increment: standard, lowerRep: 10, upperRep: 15, maxJumpRatio: 0.12, roleRanges: { top: [10, 15], straight: [10, 15], backoff: [12, 20], drop: [15, 25] }, backoffReduction: [10, 20] };
        }
        if (/leg curl/.test(key)) {
          return { kind: "machine", subtype: "machine-isolation", increment: standard, lowerRep: 8, upperRep: 15, maxJumpRatio: 0.12, roleRanges: { top: [8, 12], straight: [8, 15], backoff: [10, 15], drop: [12, 20] }, backoffReduction: [10, 18] };
        }
        if (/pulldown|machine row|seated row/.test(key)) {
          return { kind: "machine", subtype: "machine-compound", increment: standard, lowerRep: 8, upperRep: 15, maxJumpRatio: 0.12, roleRanges: { top: [8, 12], straight: [8, 15], backoff: [10, 15], drop: [12, 20] }, backoffReduction: [8, 15] };
        }
        if (/lateral raise|rear delt|fly|crossover|pec deck|bicep curl|hammer curl|pushdown|tricep extension|calf|neck/.test(key)) {
          const lowerRep = /lateral raise|rear delt/.test(key) ? 12 : 10;
          const topMin = lowerRep;
          const topMax = /lateral raise|rear delt/.test(key) ? 15 : 15;
          return { kind: "isolation", increment: small, lowerRep, upperRep: 20, maxJumpRatio: 0.18, roleRanges: { top: [topMin, topMax], straight: [lowerRep, 20], backoff: [Math.max(12, lowerRep), 20], drop: [15, 25] }, backoffReduction: [10, 20] };
        }
        return { kind: "compound", increment: standard, lowerRep: 6, upperRep: 12, maxJumpRatio: 0.25, roleRanges: { top: [6, 10], straight: [6, 12], backoff: [8, 12], drop: [12, 20] }, backoffReduction: [8, 15] };
      }

      function recommendedRestSeconds(exerciseName, options = {}) {
        const profile = progressionProfileForExercise(exerciseName);
        const reps = Number(options.reps || 8);
        const rpe = Number(options.rpe || 8);
        let seconds = profile.kind === "compound" ? 180 : profile.kind === "machine" ? 120 : 75;
        if (reps <= 5 || rpe >= 9) seconds += profile.kind === "isolation" ? 15 : 30;
        if (reps >= 15 && profile.kind === "isolation") seconds = Math.min(seconds, 75);
        const recentDurations = (completedAnalysisIndex().exercisesByCanonical.get(canonicalExerciseId(exerciseName)) || [])
          .filter((exercise) => Number(exercise.restSeconds) > 0)
          .map((exercise) => Number(exercise.restSeconds))
          .sort((a, b) => a - b)
          .slice(-6);
        if (recentDurations.length) {
          const historical = recentDurations[Math.floor(recentDurations.length / 2)];
          seconds = Math.round((seconds * 2 + historical) / 3);
        }
        const latestWeek = summarizeExerciseByWeek(exerciseName, options)[0];
        if (latestWeek && (latestWeek.failedSets >= 2 || (latestWeek.averageRpe >= 9.2 && latestWeek.completedSets >= 2))) seconds += 30;
        return Math.max(60, Math.min(300, Math.round(seconds / 15) * 15));
      }

      function restRecommendationReason(exerciseName, options = {}) {
        const profile = progressionProfileForExercise(exerciseName);
        const seconds = recommendedRestSeconds(exerciseName, options);
        const type = profile.kind === "compound" ? "compound lift" : profile.kind === "machine" ? "machine movement" : "isolation lift";
        const history = summarizeExerciseByWeek(exerciseName, options)[0];
        const historyNote = history && (history.failedSets >= 2 || history.averageRpe >= 9.2) ? " Recent hard or missed sets added recovery time." : "";
        return seconds + " seconds for this " + type + " at the planned rep range." + historyNote;
      }

      function nextLoadForExercise(name, currentWeight, incrementOverride) {
        const profile = progressionProfileForExercise(name);
        const increment = Number(incrementOverride || profile.increment);
        if (currentWeight <= 0) return 0;
        const raw = currentWeight + increment;
        const rounded = roundToIncrement(raw, increment);
        const jumpRatio = (rounded - currentWeight) / currentWeight;
        return jumpRatio > profile.maxJumpRatio ? currentWeight : rounded;
      }

      function summarizeExerciseByWeek(exerciseName, options = {}) {
        const canonicalId = options.canonicalExerciseId || canonicalExerciseId(exerciseName);
        const cacheKey = [analysisRevision, canonicalId, options.excludeSessionId || "", options.retentionAsOfDate || todayIso(), options.throughDate || options.asOfDate || todayIso()].join("|");
        if (exerciseWeekCache.has(cacheKey)) return exerciseWeekCache.get(cacheKey);
        const scoped = getExerciseSets(exerciseName, { canonicalExerciseId: options.canonicalExerciseId });
        const exerciseById = new Map(scoped.exercises.map((exercise) => [exercise.id, exercise]));
        const sessionById = new Map(activeHistorySessions({ asOfDate: options.retentionAsOfDate || todayIso(), throughDate: options.throughDate || options.asOfDate || todayIso() }).map((session) => [session.id, session]));
        const grouped = new Map();
        scoped.sets.forEach((set) => {
          const exercise = exerciseById.get(set.exerciseId);
          const session = exercise ? sessionById.get(exercise.sessionId) : null;
          if (!session || !isWorkingSet(set, "score")) return;
          if (options.excludeSessionId && session.id === options.excludeSessionId) return;
          const week = startOfWeekIso(session.date);
          const bucket = grouped.get(week) || { sessions: new Set(), travelCount: 0, sets: [], deloadFlags: [], intentionalReductionFlags: [], intentionalReductionReasons: [] };
          if (!bucket.sessions.has(session.id) && session.isTravel) bucket.travelCount += 1;
          bucket.sessions.add(session.id);
          bucket.sets.push(set);
          bucket.deloadFlags.push(Boolean(exercise.isDeload));
          const recommendationType = exercise.recommendationSnapshot?.finalPrescription?.recommendationType || exercise.finalPrescription?.recommendationType || exercise.prescription?.interventionType || exercise.prescription?.mode || "";
          const intentionallyReduced = Boolean(exercise.prescription?.adjusted || exercise.adjustmentReason || ["light_session", "reduce_volume", "exercise_deload", "muscle_group_deload", "full_program_deload", "readiness_adjusted", "deload", "light"].includes(recommendationType));
          bucket.intentionalReductionFlags.push(intentionallyReduced);
          if (intentionallyReduced) bucket.intentionalReductionReasons.push(exercise.adjustmentReason || exercise.prescription?.adjustmentReason || exercise.recommendationSnapshot?.finalPrescription?.readinessAdjustment?.explanation || presentationLabel(recommendationType));
          grouped.set(week, bucket);
        });
        const summaries = Array.from(grouped.entries()).map(([weekStart, bucket]) => {
          const completed = bucket.sets.filter((set) => set.completed);
          const rpeSets = bucket.sets.filter((set) => set.rpe > 0);
          const representativeExercise = exerciseById.get(bucket.sets[0]?.exerciseId);
          const resistanceType = resistanceTypeFor(representativeExercise, completed[0]);
          const positiveLoads = completed.map((set) => resistanceLoad(set, resistanceType)).filter((value) => value > 0);
          const topWeight = positiveLoads.length ? (resistanceType === "assisted_bodyweight" ? Math.min(...positiveLoads) : Math.max(...positiveLoads)) : 0;
          const topWeightSets = completed.filter((set) => set.weight === topWeight);
          const setsBelowTopWeight = topWeight > 0 ? completed.filter((set) => set.weight > 0 && set.weight < topWeight).length : 0;
          const topWeightRpeSets = topWeightSets.filter((set) => set.rpe > 0);
          return {
            weekStart,
            travelCount: bucket.travelCount,
            isDeload: bucket.deloadFlags.length > 0 && bucket.deloadFlags.every(Boolean),
            intentionalReduction: bucket.intentionalReductionFlags.some(Boolean),
            intentionalReductionReasons: Array.from(new Set(bucket.intentionalReductionReasons.filter(Boolean))),
            topWeight,
            topWeightSetCount: topWeightSets.length,
            setsBelowTopWeight,
            maxRepsAtTopWeight: Math.max(0, ...topWeightSets.map((set) => set.reps)),
            minRepsAtTopWeight: topWeightSets.length ? Math.min(...topWeightSets.map((set) => set.reps)) : 0,
            averageRpeAtTopWeight: topWeightRpeSets.length
              ? topWeightRpeSets.reduce((sum, set) => sum + set.rpe, 0) / topWeightRpeSets.length
              : 0,
            completedSets: completed.length,
            failedSets: bucket.sets.filter((set) => !set.completed && !set.skipped).length,
            averageRpe: rpeSets.length ? rpeSets.reduce((sum, set) => sum + set.rpe, 0) / rpeSets.length : 0,
            bestEstimatedOneRepMax: Math.max(0, ...completed.map((set) => ["external", "bodyweight_plus_load"].includes(resistanceType) ? estimatedOneRepMax(set) : resistanceType === "assisted_bodyweight" ? Math.max(0, 10000 - resistanceLoad(set, resistanceType) * 10 + set.reps) : resistanceType === "duration" ? Number(set.durationSeconds || 0) : resistanceType === "distance" ? Number(set.distance || 0) : Number(set.reps || 0)))
          };
        }).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
        summaries.forEach((summary, index) => {
          const previous = summaries[index + 1];
          summary.isLikelyDeload = summary.isDeload;
          summary.deloadBaselineWeek = summary.isDeload ? previous?.weekStart || "" : "";
        });
        exerciseWeekCache.set(cacheKey, summaries);
        return summaries;
      }

      function deloadEvidence(deloadWeek, baselineWeek, loadFormatter = null) {
        if (!deloadWeek || !baselineWeek) return "";
        const loadText = deloadWeek.topWeight > 0 && baselineWeek.topWeight > 0
          ? " resistance moved from " + (loadFormatter ? loadFormatter(baselineWeek.topWeight) : baselineWeek.topWeight + " " + data.settings.weightUnit) + " to " + (loadFormatter ? loadFormatter(deloadWeek.topWeight) : deloadWeek.topWeight + " " + data.settings.weightUnit) + ","
          : "";
        return "You marked " + formatWeek(deloadWeek.weekStart).toLowerCase() + " as a deload/recovery week:" + loadText + " it is skipped as the baseline and " + formatWeek(baselineWeek.weekStart).toLowerCase() + " is used for the next target.";
      }

      function recommendForExerciseWeek(exerciseName, weekStart, options = {}) {
        const summaries = summarizeExerciseByWeek(exerciseName, options);
        const scopedExercise = getExerciseSets(exerciseName, options).exercises[0] || { name: exerciseName, resistanceType: "external" };
        const resistanceType = resistanceTypeFor(scopedExercise);
        const loadText = (value) => formatResistance({ weight: value, addedLoad: resistanceType === "bodyweight_plus_load" ? value : 0, assistanceLoad: resistanceType === "assisted_bodyweight" ? value : 0, resistanceType, weightUnit: data.settings.weightUnit }, scopedExercise);
        const selectedIndex = summaries.findIndex((summary) => summary.weekStart === weekStart);
        const rawIndex = selectedIndex >= 0 ? selectedIndex : 0;
        const rawCurrent = summaries[rawIndex];
        const skippedDeload = rawCurrent?.isLikelyDeload ? rawCurrent : null;
        const effectiveIndex = skippedDeload
          ? summaries.findIndex((summary, index) => index > rawIndex && !summary.isLikelyDeload)
          : rawIndex;
        const current = summaries[effectiveIndex >= 0 ? effectiveIndex : rawIndex];
        const previous = summaries.slice((effectiveIndex >= 0 ? effectiveIndex : rawIndex) + 1).find((summary) => !summary.isLikelyDeload);
        const older = summaries.slice((effectiveIndex >= 0 ? effectiveIndex : rawIndex) + 1, (effectiveIndex >= 0 ? effectiveIndex : rawIndex) + 6).filter((summary) => !summary.isLikelyDeload);
        const profile = progressionProfileForExercise(exerciseName);
        const increment = profile.increment;
        if (!current) {
          return {
            decision: "hold",
            label: "Need more data",
            reason: "There is not enough history for this lift yet.",
            action: "Log at least one complete session, then review again.",
            evidence: ["No completed sets found for the selected exercise."],
            confidence: "low"
          };
        }
        const travelAdjusted = current.travelCount > 0;
        const hardWeek = current.averageRpe >= 9;
        const failedMultipleSets = current.failedSets >= 2;
        const performanceDrop = previous && current.bestEstimatedOneRepMax > 0 && current.bestEstimatedOneRepMax < previous.bestEstimatedOneRepMax * 0.92;
        const repeatedFailures = older.filter((week) => week.failedSets > 0 || week.averageRpe >= 9.5).length >= 2 && current.failedSets > 0;
        const flatWeeks = older.length >= 3 && older.every((week) => Math.abs(week.bestEstimatedOneRepMax - current.bestEstimatedOneRepMax) <= current.bestEstimatedOneRepMax * 0.025);
        const evidence = [
          current.completedSets + " completed set" + (current.completedSets === 1 ? "" : "s") + " and " + current.failedSets + " missed set" + (current.failedSets === 1 ? "" : "s") + ".",
          "Average RPE " + (current.averageRpe ? current.averageRpe.toFixed(1) : "not logged") + ".",
          (resistanceType === "external" ? "Best estimated 1RM " : "Best comparable performance index ") + (current.bestEstimatedOneRepMax ? current.bestEstimatedOneRepMax.toFixed(1) : "not available") + ".",
          current.topWeight > 0 ? current.topWeightSetCount + " of " + current.completedSets + " completed sets used " + loadText(current.topWeight) + "." : resistanceType === "bodyweight" ? "Bodyweight-only work was logged." : "No comparable load was found."
        ];
        if (skippedDeload && skippedDeload !== current) evidence.unshift(deloadEvidence(skippedDeload, current, loadText));
        if (travelAdjusted) evidence.push("Travel was logged this week, so the recommendation is less punitive for a dip.");
        if (skippedDeload && skippedDeload !== current) {
          const targetLoad = current.topWeight > 0 ? loadText(current.topWeight) : "the prior normal resistance";
          const targetReps = current.maxRepsAtTopWeight > 0 ? " for about " + current.maxRepsAtTopWeight + " reps" : "";
          return {
            decision: "hold",
            label: "Return from deload",
            reason: "The latest work looks like a planned recovery break, so it should not reset your working weights downward.",
            action: "Use the prior normal baseline next time: " + targetLoad + targetReps + ". Keep RPE controlled, then resume progression after that session confirms performance.",
            evidence,
            confidence: "high"
          };
        }
        if (flatWeeks && (hardWeek || repeatedFailures)) {
          return { decision: "change", label: "Consider changing variation", reason: "This lift looks stalled across several recent weeks.", action: "Swap to a close variation for 4-6 weeks, then retest the original lift.", evidence, confidence: "medium" };
        }
        if ((failedMultipleSets || repeatedFailures || performanceDrop) && !travelAdjusted) {
          const target = roundToIncrement(current.topWeight * (resistanceType === "assisted_bodyweight" ? 1.1 : 0.9), increment);
          return { decision: "deload", label: "Deload", reason: "Recent performance suggests fatigue or an overly aggressive load.", action: (resistanceType === "assisted_bodyweight" ? "Increase assistance" : "Reduce added or external load") + " about 10% next time, aiming near " + loadText(target) + ", and keep 1-3 reps in reserve.", evidence, confidence: "high" };
        }
        if (hardWeek || current.failedSets > 0 || current.completedSets < 3 || travelAdjusted) {
          return { decision: "hold", label: "Hold", reason: travelAdjusted ? "The travel context makes this a good week to repeat before judging progress." : "The work was close enough to the limit that repeating is the cleaner next step.", action: "Repeat the same load and rep target next time; progress only if RPE settles below 9.", evidence, confidence: travelAdjusted ? "medium" : "high" };
        }
        if (current.topWeight > 0 && current.setsBelowTopWeight > 0 && (profile.kind === "isolation" || current.topWeightSetCount < Math.max(2, current.completedSets - 1))) {
          return {
            decision: "hold",
            label: "Consolidate load",
            reason: "Your top set is ahead of your back-off sets, so the next progression is making the current load repeatable.",
            action: "Keep " + loadText(current.topWeight) + " as the top resistance and work later sets up to it before progressing.",
            evidence,
            confidence: "high"
          };
        }
        const canAddLoad = current.topWeight > 0 && current.maxRepsAtTopWeight >= profile.upperRep && current.averageRpeAtTopWeight > 0 && current.averageRpeAtTopWeight <= 8.5;
        const nextWeight = resistanceType === "assisted_bodyweight" ? Math.max(0, roundToIncrement(Math.max(0, current.topWeight - increment), increment)) : nextLoadForExercise(exerciseName, current.topWeight);
        if (profile.kind === "isolation" && !canAddLoad) {
          const nextReps = Math.min(profile.upperRep, Math.max(profile.lowerRep, current.maxRepsAtTopWeight + 1));
          return { decision: "progress", label: "Progress reps", reason: "You completed the work, but this is an isolation lift where load jumps are large.", action: "Keep " + loadText(current.topWeight) + " and add reps first, targeting about " + nextReps + " reps before increasing load.", evidence, confidence: previous ? "high" : "medium" };
        }
        if (["bodyweight", "bodyweight_plus_load", "assisted_bodyweight"].includes(resistanceType) && !canAddLoad) {
          const nextReps = Math.min(profile.upperRep, Math.max(profile.lowerRep, current.maxRepsAtTopWeight + 1));
          return { decision: "progress", label: "Progress reps", reason: "The current bodyweight resistance has not yet reached the top of its programmed rep range at a confirmed manageable RPE.", action: "Keep " + loadText(current.topWeight) + " and build toward " + nextReps + "-" + profile.upperRep + " controlled reps before changing added load or assistance.", evidence, confidence: previous ? "high" : "medium" };
        }
        if (nextWeight === current.topWeight && current.topWeight > 0) {
          const nextReps = Math.min(profile.upperRep, Math.max(profile.lowerRep, current.maxRepsAtTopWeight + 1));
          return { decision: "progress", label: "Progress reps", reason: "The next load jump is too large relative to the current working weight.", action: "Keep " + loadText(current.topWeight) + " and add reps toward " + nextReps + "-" + profile.upperRep + " before increasing load.", evidence, confidence: previous ? "high" : "medium" };
        }
        return { decision: "progress", label: "Progress load", reason: "You completed the work without a high-RPE warning or repeated misses.", action: current.topWeight > 0 ? (resistanceType === "assisted_bodyweight" ? "Reduce assistance to " : "Target ") + loadText(nextWeight) + " next time." : resistanceType === "bodyweight" ? "Add reps or a harder bodyweight variation next time." : "Use the programmed working load and add a controlled rep before increasing resistance.", evidence, confidence: previous ? "high" : "medium" };
      }

      // COACH_RECOMMENDATION_ENGINE_START
      function coachRecommendationForExercise(exerciseName, options = {}) {
        const cacheAvailable = typeof coachRecommendationCache !== "undefined";
        const cacheKey = [typeof analysisRevision === "undefined" ? 0 : analysisRevision, options.canonicalExerciseId || canonicalExerciseId(exerciseName), options.weekStart || "", options.throughDate || options.asOfDate || todayIso(), options.historical ? "historical" : "current"].join("|");
        if (cacheAvailable && coachRecommendationCache.has(cacheKey)) return coachRecommendationCache.get(cacheKey);
        if (typeof unifiedPrescriptionSnapshot === "function") {
          const snapshot = unifiedPrescriptionSnapshot(exerciseName, {
            throughDate: options.throughDate || options.asOfDate || todayIso(),
            historical: Boolean(options.historical),
            recovery: options.recovery || {},
            template: options.template,
            mesocycle: options.historical ? null : undefined
          });
          if (snapshot) {
            const unified = legacyRecommendationFromSnapshot(snapshot, exerciseName);
            unified.sourceWindow = { weekStart: options.weekStart || "", throughDate: options.throughDate || todayIso(), historical: Boolean(options.historical) };
            unified.asOfDate = options.throughDate || todayIso();
            if (cacheAvailable) coachRecommendationCache.set(cacheKey, unified);
            return unified;
          }
        }
        const weeks = summarizeExerciseByWeek(exerciseName, options);
        const weekStart = options.weekStart || weeks[0]?.weekStart || "";
        const summary = weeks.find((week) => week.weekStart === weekStart) || weeks[0];
        const base = weekStart ? recommendForExerciseWeek(exerciseName, weekStart, options) : { decision: "hold", label: "Establish baseline", reason: "No recent qualifying working-set history is available.", action: "Use the current program target with controlled technique.", evidence: [], confidence: "low" };
        const profile = progressionProfileForExercise(exerciseName);
        const representativeExercise = getExerciseSets(exerciseName, options).exercises.find((exercise) => canonicalExerciseId(exercise.name) === (options.canonicalExerciseId || canonicalExerciseId(exerciseName))) || { name: exerciseName, resistanceType: "external" };
        const resistanceType = resistanceTypeFor(representativeExercise);
        let progressionAction = base.decision === "progress" ? (/rep/i.test(base.label) ? "increase_reps" : "increase_load") : base.decision === "hold" ? "repeat" : base.decision;
        let targetLoad = Number(summary?.topWeight || 0);
        let targetReps = Number(summary?.maxRepsAtTopWeight || 0);
        if (progressionAction === "increase_reps") targetReps = Math.min(profile.upperRep, Math.max(profile.lowerRep, targetReps + 1));
        if (progressionAction === "increase_load" && targetLoad > 0) targetLoad = resistanceType === "assisted_bodyweight" ? Math.max(0, roundToIncrement(targetLoad - profile.increment, profile.increment)) : nextLoadForExercise(exerciseName, targetLoad);
        let interventionType = "normal";
        let severity = "normal";
        let durationInSessions = 1;
        let loadAdjustment = 0;
        let setAdjustment = 0;
        let rpeTarget = null;
        let progressionExpected = base.decision === "progress";
        let removeIntensificationTechniques = false;
        let returnToNormalCriteria = "Continue normal programming while reps and RPE remain inside target.";
        const reasonCodes = [];
        if (base.decision === "deload") {
          interventionType = "deload";
          severity = "high";
          durationInSessions = 1;
          loadAdjustment = -0.1;
          setAdjustment = -0.35;
          rpeTarget = 6.5;
          progressionExpected = false;
          removeIntensificationTechniques = true;
          returnToNormalCriteria = "Resume normal programming after one deload exposure when the next warm-up is normal and comparable performance no longer declines at rising RPE.";
          reasonCodes.push("repeated-misses-or-regression");
        } else if (base.decision === "change") {
          interventionType = "stop_modify";
          severity = "high";
          durationInSessions = 4;
          progressionExpected = false;
          removeIntensificationTechniques = true;
          returnToNormalCriteria = "Return after 4-6 weeks with a close variation, or earlier only after the pain, safety, or repeated-stall concern is resolved.";
          reasonCodes.push("persistent-stall");
        } else if (summary && (summary.failedSets === 1 || summary.averageRpe >= 9 || (weeks[1] && summary.bestEstimatedOneRepMax < weeks[1].bestEstimatedOneRepMax * 0.95))) {
          interventionType = "light";
          severity = "moderate";
          loadAdjustment = -0.05;
          setAdjustment = -1;
          rpeTarget = 7;
          progressionExpected = false;
          removeIntensificationTechniques = true;
          returnToNormalCriteria = "Return to normal after one light exposure if all planned reps are completed at or below the target RPE and performance stabilizes.";
          reasonCodes.push(summary.failedSets === 1 ? "single-missed-set" : summary.averageRpe >= 9 ? "high-effort" : "moderate-performance-decline");
        } else {
          reasonCodes.push(base.decision === "progress" ? "progression-supported" : "repeat-or-hold-supported");
        }
        const result = {
          ...base,
          interventionType,
          progressionAction,
          affectedExerciseIds: [canonicalExerciseId(exerciseName)],
          affectedExerciseName: exerciseName,
          reasonCodes,
          humanReadableReason: base.reason,
          severity,
          loadAdjustment,
          setAdjustment,
          repRangeAdjustment: null,
          targetLoad,
          targetReps,
          resistanceType,
          rpeTarget,
          restAdjustment: interventionType === "light" || interventionType === "deload" ? 15 : 0,
          removeIntensificationTechniques,
          progressionExpected,
          durationInSessions,
          returnToNormalCriteria,
          sourceWindow: { weekStart, throughDate: options.throughDate || todayIso(), historical: Boolean(options.historical) },
          asOfDate: options.throughDate || todayIso()
        };
        if (cacheAvailable) coachRecommendationCache.set(cacheKey, result);
        return result;
      }
      // COACH_RECOMMENDATION_ENGINE_END

      function templateExerciseCount(template) {
        return template.exercises.reduce((sum, exercise) => sum + Number(exercise.sets || 0), 0);
      }

      function researchVolumeTarget() {
        const records = prescriptionEngine?.evidence?.research?.muscleGroupRecommendations || [];
        const experienceLevel = data.settings.experienceLevel || "all";
        const matched = records.filter((item) => !item.training_status || item.training_status === experienceLevel || item.training_status === "all" || item.training_status === "mixed");
        return matched.length
          ? `${matched.length} muscle/subdivision-specific weekly ranges from research database ${prescriptionEvidenceStatus.researchVersion}`
          : "the exercise-specific research fallback stored in each prescription";
      }

      function goalContext() {
        const phase = data.settings.nutritionPhase || "all";
        const experienceLevel = data.settings.experienceLevel || "all";
        const records = prescriptionEngine?.evidence?.research?.nutritionStrategies || [];
        const strategy = records.find((item) => item.nutrition_phase === phase && item.training_status === experienceLevel)
          || records.find((item) => item.nutrition_phase === phase && ["all", "mixed"].includes(item.training_status))
          || records.find((item) => item.nutrition_phase === phase)
          || records.find((item) => item.nutrition_phase === "all");
        if (!strategy) return "Nutrition and recovery modify the prescription only when supported by the available evidence markers.";
        return [strategy.training_volume_adjustment, strategy.training_intensity_adjustment, strategy.recovery_guidance].filter(Boolean).join(" ");
      }

      function getLastCompletedSet(exerciseName, options = {}) {
        const cacheKey = ["last", analysisRevision, options.canonicalExerciseId || canonicalExerciseId(exerciseName), options.throughDate || options.asOfDate || todayIso(), options.excludeSessionId || "", options.includeDeloads ? 1 : 0].join("|");
        if (previousPerformanceCache.has(cacheKey)) return previousPerformanceCache.get(cacheKey);
        const scoped = getExerciseSets(exerciseName, { canonicalExerciseId: options.canonicalExerciseId || canonicalExerciseId(exerciseName) });
        const exerciseById = new Map(scoped.exercises.map((exercise) => [exercise.id, exercise]));
        const sessionById = new Map(activeHistorySessions({ asOfDate: options.retentionAsOfDate || todayIso(), throughDate: options.throughDate || options.asOfDate || todayIso() }).map((session) => [session.id, session]));
        const deloadWeeks = options.includeDeloads ? new Set() : new Set(scoped.exercises.filter((exercise) => {
          const session = sessionById.get(exercise.sessionId);
          return exercise.isDeload || session?.isDeload || session?.sessionType === "deload";
        }).map((exercise) => startOfWeekIso(sessionById.get(exercise.sessionId)?.date || todayIso())));
        const result = scoped.sets
          .filter((set) => set.completed)
          .map((set) => {
            const exercise = exerciseById.get(set.exerciseId);
            const session = exercise ? sessionById.get(exercise.sessionId) : null;
            return session ? { set, session } : null;
          })
          .filter(Boolean)
          .filter((entry) => isWorkingSet(entry.set, "progression"))
          .filter((entry) => !options.excludeSessionId || entry.session.id !== options.excludeSessionId)
          .filter((entry) => !deloadWeeks.has(startOfWeekIso(entry.session.date)))
          .sort((a, b) => b.session.date.localeCompare(a.session.date))[0];
        previousPerformanceCache.set(cacheKey, result);
        return result;
      }

      function getMostRecentWorkoutSets(exerciseName, options = {}) {
        const cacheKey = ["sets", analysisRevision, options.canonicalExerciseId || canonicalExerciseId(exerciseName), options.throughDate || options.asOfDate || todayIso(), options.excludeSessionId || "", options.includeDeloads ? 1 : 0].join("|");
        if (previousPerformanceCache.has(cacheKey)) return previousPerformanceCache.get(cacheKey);
        const scoped = getExerciseSets(exerciseName, { canonicalExerciseId: options.canonicalExerciseId || canonicalExerciseId(exerciseName) });
        const exerciseById = new Map(scoped.exercises.map((exercise) => [exercise.id, exercise]));
        const sessionById = new Map(activeHistorySessions({ asOfDate: options.retentionAsOfDate || todayIso(), throughDate: options.throughDate || options.asOfDate || todayIso() }).map((session) => [session.id, session]));
        const deloadWeeks = options.includeDeloads ? new Set() : new Set(scoped.exercises.filter((exercise) => {
          const session = sessionById.get(exercise.sessionId);
          return exercise.isDeload || session?.isDeload || session?.sessionType === "deload";
        }).map((exercise) => startOfWeekIso(sessionById.get(exercise.sessionId)?.date || todayIso())));
        const completed = scoped.sets
          .filter((set) => set.completed)
          .map((set) => {
            const exercise = exerciseById.get(set.exerciseId);
            const session = exercise ? sessionById.get(exercise.sessionId) : null;
            return session ? { set, session } : null;
          })
          .filter(Boolean)
          .filter((entry) => isWorkingSet(entry.set, "progression"))
          .filter((entry) => !options.excludeSessionId || entry.session.id !== options.excludeSessionId)
          .filter((entry) => !deloadWeeks.has(startOfWeekIso(entry.session.date)))
          .sort((a, b) => b.session.date.localeCompare(a.session.date) || Number(a.set.sequence || a.set.setNumber) - Number(b.set.sequence || b.set.setNumber));
        const latestSessionId = completed[0]?.session.id;
        const result = latestSessionId ? completed.filter((entry) => entry.session.id === latestSessionId).map((entry) => entry.set).sort((a, b) => Number(a.sequence || a.setNumber) - Number(b.sequence || b.setNumber)) : [];
        previousPerformanceCache.set(cacheKey, result);
        return result;
      }

      function latestSkippedDeloadForExercise(exerciseName, options = {}) {
        const weeks = summarizeExerciseByWeek(exerciseName, options);
        if (!weeks[0]?.isLikelyDeload) return null;
        const baseline = weeks.slice(1).find((week) => !week.isLikelyDeload);
        return baseline ? { deload: weeks[0], baseline } : null;
      }

      function coachTargetForTemplateExercise(templateExercise, options = {}) {
        if (typeof unifiedPrescriptionSnapshot === "function") {
          let snapshot;
          try {
            snapshot = unifiedPrescriptionSnapshot(templateExercise, {
              throughDate: options.throughDate || options.asOfDate || todayIso(),
              historical: Boolean(options.historical),
              recovery: {},
              template: options.template,
              role: templateExercise.role,
              equipmentIncrement: templateExercise.increment,
              mesocycle: options.historical ? null : undefined
            });
          } catch (error) {
            const detail = error?.error || error;
            const code = String(detail?.code || "");
            if (detail?.hardConstraint === true || ["hard_constraint_rejection", "engine_failure"].includes(detail?.type || detail?.kind) || /^HARD_CONSTRAINT_/i.test(code)) return detail;
            throw error;
          }
          if (snapshot?.executionBlocked === true && snapshot?.executable === false && ["hard_constraint_rejection", "engine_failure"].includes(snapshot?.type || snapshot?.kind)) return snapshot;
          if (snapshot) return legacyTargetFromSnapshot(snapshot, templateExercise, { useBase: true });
        }
        const profile = progressionProfileForExercise(templateExercise.name);
        const sessionType = sessionTypeForTemplate(options.template);
        const programContext = exerciseTargetContext(options.template, templateExercise, { source: "Current workout template" });
        const scoredTypes = (programContext?.setTypes || []).filter((type) => type.countsTowardScore && !type.isWarmup);
        const primaryType = scoredTypes.find((type) => type.type === "top") || scoredTypes.find((type) => type.type === "straight") || scoredTypes[0];
        const activeLowerRep = Number(primaryType?.repMin || templateExercise.repMin || profile.lowerRep || 0);
        const activeUpperRep = Number(primaryType?.repMax || templateExercise.repMax || templateExercise.reps || profile.upperRep || activeLowerRep);
        const activeProfile = { ...profile, lowerRep: activeLowerRep, upperRep: activeUpperRep };
        const targetReps = Number(templateExercise.reps || activeUpperRep || 8);
        const plannedSets = Math.max(1, scoredTypes.reduce((sum, type) => sum + Number(type.setCount || 0), 0) || Number(templateExercise.sets || 1));
        const weeks = summarizeExerciseByWeek(templateExercise.name, options);
        const recommendation = coachRecommendationForExercise(templateExercise.name, { ...options, weekStart: weeks[0]?.weekStart || "" });
        const recentSets = getMostRecentWorkoutSets(templateExercise.name, options);
        const last = getLastCompletedSet(templateExercise.name, options);
        const skippedDeload = latestSkippedDeloadForExercise(templateExercise.name, options);
        const increment = Number(templateExercise.increment || profile.increment);
        const resistanceType = templateExercise.resistanceType || last?.set?.resistanceType || inferResistanceType(templateExercise.name, templateExercise, recentSets);
        const recentLoads = [...recentSets.map((set) => resistanceLoad(set, resistanceType)), resistanceLoad(last?.set, resistanceType)].filter((value) => value > 0);
        const recentTop = recentLoads.length ? (resistanceType === "assisted_bodyweight" ? Math.min(...recentLoads) : Math.max(...recentLoads)) : 0;
        const topSets = recentSets.filter((set) => set.weight === recentTop);
        const recentReps = Math.max(0, ...topSets.map((set) => set.reps), last?.set?.reps || 0);
        const representativeSet = topSets.slice().sort((a, b) => b.reps - a.reps || (a.rpe || 99) - (b.rpe || 99))[0] || last?.set;
        const recentRpe = Number(representativeSet?.rpe || 0);
        const knownBodyweight = isBodyweightResistance(resistanceType);
        const daysSinceLast = last?.session?.date ? Math.floor((Date.now() - new Date(last.session.date + "T12:00:00").getTime()) / 86400000) : 0;
        let sets = plannedSets;
        let reps = Math.max(activeLowerRep, Math.min(activeUpperRep, recentReps || targetReps));
        let weight = recentTop;
        let rpe = programmedRpeForExercise(templateExercise, profile, sessionType, recentRpe);
        let mode = recentSets.length ? "maintenance" : "baseline";
        let reason = "No prior completed sets found. Use a controlled load near RPE 7-8.";

        if (sessionType === "deload") {
          mode = "deload";
          reason = "Planned deload: reduce fatigue with lower load, fewer sets, and lower effort.";
          weight = recentTop > 0 ? roundToIncrement(recentTop * (resistanceType === "assisted_bodyweight" ? 1.1 : 0.9), increment) : 0;
          sets = Math.max(1, Math.ceil(plannedSets * 0.65));
          reps = Math.max(activeLowerRep, Math.min(targetReps, activeUpperRep));
          rpe = Math.min(Number(templateExercise.targetRpe || 6.5), 6.5);
        } else if (sessionType === "light" || sessionType === "technique") {
          mode = sessionType;
          reason = sessionType === "light" ? "Programmed light session: preserve movement quality while limiting fatigue." : "Technique-focused session: prioritize repeatable positions and bar path over loading.";
          weight = recentTop > 0 ? roundToIncrement(recentTop * (resistanceType === "assisted_bodyweight" ? 1.1 : 0.9), increment) : 0;
          rpe = Math.min(Number(templateExercise.targetRpe || 7), 7);
        } else if (daysSinceLast >= 35 && recentTop > 0) {
          mode = "return";
          reason = "Return from a training gap of " + daysSinceLast + " days: use a small ramp-in before resuming normal progression.";
          weight = roundToIncrement(recentTop * (resistanceType === "assisted_bodyweight" ? 1.05 : 0.95), increment);
          sets = Math.max(1, plannedSets - 1);
          rpe = Number(templateExercise.targetRpe || 7.5);
        } else if (skippedDeload) {
          mode = "return-from-deload";
          reason = "The most recent week looks like a deload/recovery break, so this target skips that reduced week and returns to the prior normal training baseline before progressing again.";
        } else if (recommendation?.interventionType === "light") {
          mode = "light";
          reason = recommendation.reason + " One light exposure is prescribed before normal progression resumes.";
          weight = recentTop > 0 ? roundToIncrement(recentTop * (resistanceType === "assisted_bodyweight" ? 1.05 : 0.95), increment) : 0;
          sets = Math.max(1, plannedSets - 1);
          rpe = Math.min(Number(templateExercise.targetRpe || recommendation.rpeTarget || 7), Number(recommendation.rpeTarget || 7));
        } else if (recommendation?.decision === "progress") {
          const shouldAddLoad = recommendation.progressionAction === "increase_load" && Number(recommendation.targetLoad || 0) > 0;
          if (shouldAddLoad) {
            mode = "load-progression";
            reason = resistanceType === "assisted_bodyweight"
              ? "You reached the top of the programmed rep range at a manageable RPE, so the next assistance reduction is appropriate."
              : resistanceType === "bodyweight_plus_load"
                ? "You reached the top of the programmed rep range at a manageable RPE, so the next added-load increment is appropriate."
                : "You reached the top of the programmed rep range at a manageable RPE, so the next available load increment is appropriate.";
            weight = Number(recommendation.targetLoad);
            reps = Math.max(activeLowerRep, Math.min(activeUpperRep, targetReps - Math.max(2, Math.round((activeUpperRep - activeLowerRep) * 0.35))));
          } else {
            mode = "rep-progression";
            reason = profile.kind === "isolation"
              ? "Progress this lift by adding reps first; load jumps are large for isolation work."
              : "Progress by adding reps before taking the next load jump.";
            reps = Math.min(activeUpperRep, Math.max(activeLowerRep, Number(recommendation.targetReps || 0), recentReps + 1, targetReps));
          }
        } else if (recommendation?.decision === "deload") {
          mode = "deload";
          reason = "Recent work suggests fatigue or misses. Reduce load and volume.";
          weight = recentTop > 0 ? roundToIncrement(recentTop * (resistanceType === "assisted_bodyweight" ? 1.1 : 0.9), increment) : 0;
          sets = Math.max(1, Math.ceil(plannedSets * 0.65));
          reps = Math.max(activeLowerRep, Math.min(reps, activeUpperRep));
          rpe = Math.min(Number(templateExercise.targetRpe || 6.5), 6.5);
        } else if (recommendation?.decision === "change") {
          mode = "substitution";
          reason = "This pattern looks stalled. Consider swapping the lift for 4-6 weeks.";
        } else if (recommendation) {
          mode = "maintenance";
          reason = recentTop > 0
            ? "Repeat the prior top performance and aim for cleaner execution or a lower achieved RPE before adding load."
            : "Repeat the target and make it cleaner before adding workload.";
        }
        let target = validatePrescription({
          decision: recommendation?.decision || "hold",
          mode,
          sets,
          reps,
          repLow: activeLowerRep,
          repHigh: activeUpperRep,
          weight,
          rpe,
          weightUnit: data.settings.weightUnit,
          resistanceType,
          addedLoad: resistanceType === "bodyweight_plus_load" ? weight : 0,
          assistanceLoad: resistanceType === "assisted_bodyweight" ? weight : 0,
          isBodyweight: knownBodyweight,
          isDeload: mode === "deload",
          reason,
          increment,
          confidence: prescriptionConfidence(weeks, daysSinceLast),
          coachRecommendation: recommendation,
          programTargetContext: programContext
        }, recentSets, activeProfile);
        target.text = targetText(target, target.reason);
        return target;
      }

      function sessionTypeForTemplate(template) {
        const text = ((template?.name || "") + " " + (template?.notes || "")).toLowerCase();
        if (/deload/.test(text)) return "deload";
        if (/recovery|restoration/.test(text)) return "light";
        if (/technique|skill|form/.test(text)) return "technique";
        if (/light|easy/.test(text)) return "light";
        if (/heavy|strength/.test(text)) return "heavy";
        return "normal";
      }

      function programmedRpeForExercise(templateExercise, profile, sessionType, recentRpe) {
        const explicit = Number(templateExercise.targetRpe || 0);
        if (explicit > 0) return explicit;
        if (sessionType === "deload" || sessionType === "light" || sessionType === "technique") return 6.5;
        if (sessionType === "heavy" && profile.kind === "compound") return 8.5;
        if (recentRpe >= 7 && recentRpe <= 9) return Math.round(recentRpe * 2) / 2;
        return profile.kind === "isolation" ? 8.5 : 8;
      }

      function prescriptionConfidence(weeks, daysSinceLast) {
        if (daysSinceLast >= 35 || weeks.length < 1) return "low";
        if (weeks.length < 3) return "moderate";
        return "high";
      }

      function validatePrescription(target, recentSets, profile) {
        const result = { ...target };
        const assisted = result.resistanceType === "assisted_bodyweight";
        const recentValues = recentSets.map((set) => resistanceLoad(set, result.resistanceType)).filter((value) => value > 0);
        const recentTop = recentValues.length ? (assisted ? Math.min(...recentValues) : Math.max(...recentValues)) : 0;
        const recentTopSets = recentSets.filter((set) => Number(set.weight || 0) === recentTop);
        const recentBest = recentTopSets.slice().sort((a, b) => b.reps - a.reps)[0];
        const intentionalRegression = ["deload", "light", "technique", "return"].includes(result.mode);
        const guardrails = [];
        result.reps = Math.max(profile.lowerRep, Math.min(profile.upperRep, Number(result.reps || profile.lowerRep)));
        if (recentBest && !intentionalRegression && !assisted) {
          const loadDrop = recentTop > 0 && result.weight > 0 ? 1 - result.weight / recentTop : 0;
          const loweredEffort = recentBest.rpe > 0 && result.rpe < recentBest.rpe;
          if (loadDrop > 0.1 && result.reps >= recentBest.reps - 1) {
            result.weight = recentTop;
            guardrails.push("prevented an unexplained load reduction greater than 10% after the prior successful top set");
          }
          if (result.weight < recentTop && loweredEffort && result.reps >= recentBest.reps - 1) {
            result.weight = recentTop;
            guardrails.push("prevented load and effort from both regressing in a normal session");
          }
        }
        if (result.resistanceType === "bodyweight_plus_load") result.addedLoad = Number(result.weight || 0);
        if (result.resistanceType === "assisted_bodyweight") result.assistanceLoad = Number(result.weight || 0);
        if (guardrails.length) result.reason += " Guardrail: " + guardrails.join("; ") + ".";
        return result;
      }

      function targetText(target, reason) {
        const weightText = formatResistance(target);
        return "Target " + target.sets + " x " + target.reps + " @ " + weightText + ", aim RPE " + target.rpe + ". " + reason;
      }

      function exerciseGuidanceFor(name) {
        const key = exerciseKey(name);
        const base = {
          cues: [
            "Use a controlled eccentric and pause if momentum creeps in.",
            "Stop the set when positions break, not when pride says one more.",
            "Progress only after target reps look repeatable and controlled."
          ]
        };
        const patterns = [
          { match: /neck curl|neck flexion|neck extension|neck harness|neck lateral/, cues: ["Move slowly through a comfortable range.", "Keep the jaw relaxed and avoid jerking into end range.", "Progress conservatively; small muscles do not need big jumps."] },
          { match: /side plank/, cues: ["Keep ribs and pelvis stacked instead of rotating toward the floor.", "Move through the trunk under control without pushing from the shoulder.", "Add reps or a small external load only after the same range stays crisp."] },
          { match: /seated leg curl|lying leg curl|standing leg curl|nordic curl|hamstring curl|leg curl/, cues: ["Keep hips pinned and control the stretched position.", "Curl without letting the low back or hips pop up.", "Add reps before load when the contraction gets sloppy."] },
          { match: /leg press/, cues: ["Brace before the descent and keep pressure through the whole foot.", "Use a repeatable depth without the pelvis rolling off the pad.", "Let the active program's top-set and back-off ranges determine today's target."] },
          { match: /squat|lunge|split squat/, cues: ["Brace before the descent and keep pressure through midfoot.", "Let knees track with toes; do not dive-bomb the bottom.", "Use a depth you can repeat without lumbar rounding."] },
          { match: /deadlift|rdl|romanian|hinge|good morning/, cues: ["Start by pushing hips back, not by squatting the weight.", "Keep lats tight and the load close to the body.", "End the set when back position or hamstring tension breaks."] },
          { match: /bench|chest press|push up|pushup|dip|chest|pec/, cues: ["Set shoulder blades before the first rep and keep wrists stacked.", "Lower under control to a consistent touch point or depth.", "Press without bouncing or letting shoulders roll forward."] },
          { match: /row|pulldown|pull up|chin|lat pulldown|\blat\b/, cues: ["Lead with elbows and keep ribs down.", "Pause briefly in the shortened position instead of yanking.", "Control the stretch without losing shoulder position."] },
          { match: /shoulder|overhead|lateral raise|rear delt/, cues: ["Keep ribs stacked and avoid turning it into a low-back lift.", "Use a smooth path and stop before joint irritation.", "For raises, chase tension and control rather than load."] },
          { match: /curl|tricep|extension|pushdown|skull/, cues: ["Pin the upper arm and move through the elbow.", "Use full range you can control without swinging.", "Add reps before load when jumps are large."] },
          { match: /calf/, cues: ["Use a full stretch and hard top contraction.", "Pause instead of bouncing through the ankle.", "Keep reps consistent before adding load."] },
          { match: /plank|crunch|leg raise|hanging raise|knee raise|ab|core/, cues: ["Brace as if resisting motion, not just chasing burn.", "Keep pelvis controlled and avoid low-back takeover.", "Make the range harder before making it sloppy."] }
        ];
        const found = patterns.find((item) => item.match.test(key));
        return found ? { ...base, ...found } : base;
      }

      function renderExerciseGuidance(exercise) {
        const guidance = exerciseGuidanceFor(exercise.name);
        const snapshot = exercise.recommendationSnapshot || unifiedPrescriptionSnapshot(exercise);
        const prescription = snapshot?.finalPrescription;
        const setText = prescription ? `${prescription.workingSets.min}-${prescription.workingSets.max} (target ${prescription.workingSets.target})` : "See saved prescription";
        const repText = prescription ? `${prescription.repRange.min}-${prescription.repRange.max} reps` : "Evidence unavailable";
        const effortText = prescription?.targetRpe
          ? `RPE ${prescription.targetRpe.min}-${prescription.targetRpe.max}`
          : prescription?.targetRir ? `RIR ${prescription.targetRir.min}-${prescription.targetRir.max}` : "See saved prescription";
        return `
          <div class="exercise-guidance">
            <strong>Broad exercise guidance</strong>
            <div class="guidance-grid">
              <div class="guidance-pill"><span>Sets</span><b>${escapeHtml(setText)}</b></div>
              <div class="guidance-pill"><span>Reps</span><b>${escapeHtml(repText)}</b></div>
              <div class="guidance-pill"><span>Effort</span><b>${escapeHtml(effortText)}</b></div>
            </div>
            <p class="muted-note">These values come from the same saved prescription shown above. The cues are technique reminders, not a second recommendation.</p>
            <ul class="cue-list">${guidance.cues.map((cue) => "<li>" + escapeHtml(cue) + "</li>").join("")}</ul>
          </div>
        `;
      }

      function muscleOptions(selectedValue, includeAuto = false, autoLabel = "Auto") {
        const selected = selectedValue || "";
        const options = includeAuto ? ['<option value="" ' + (selected === "" ? "selected" : "") + ">" + escapeHtml(autoLabel) + "</option>"] : [];
        return options.concat(muscleGroups.map((muscle) => '<option value="' + escapeHtml(muscle) + '" ' + (selected === muscle ? "selected" : "") + ">" + escapeHtml(muscle) + "</option>")).join("");
      }

      function renderMuscleSelectors(exercise) {
        const auto = musclesForExercise(exercise.name, { ignoreManual: true });
        const autoText = auto.length ? auto.map((item) => item.muscle + " " + item.weight + "x").join(", ") : "Unclassified";
        return `
          <div class="muscle-select-grid">
            <label>Primary muscle
              <select data-action="exercise-primary-muscle" data-exercise-id="${exercise.id}" aria-label="Primary muscle for ${escapeHtml(exercise.name)}">
                ${muscleOptions(exercise.primaryMuscle || "", true, "Auto: " + autoText)}
              </select>
            </label>
            <label>Secondary muscle
              <select data-action="exercise-secondary-muscle" data-exercise-id="${exercise.id}" aria-label="Secondary muscle for ${escapeHtml(exercise.name)}">
                ${muscleOptions(exercise.secondaryMuscle || "", true, "None / auto")}
              </select>
            </label>
          </div>
        `;
      }

      function recoverySessionLabel(recoveryAdvice, hasHistory) {
        if (recoveryAdvice?.decision === "rest") return "Today's start guidance: recovery / technique only";
        if (recoveryAdvice?.decision === "light_session") return "Today's start guidance: readiness-adjusted light session";
        if (recoveryAdvice?.decision === "deload") return "Today's start guidance: deload";
        if (recoveryAdvice?.decision === "hold") return hasHistory ? "Today's start guidance: hold the plan" : "Today's start guidance: establish baseline";
        return hasHistory ? "Today's start guidance: planned progression" : "Today's start guidance: establish baseline";
      }

      function recoverySessionDetail(recoveryAdvice) {
        if (recoveryAdvice?.decision === "rest") return "Today's readiness is low enough that hard loading is not the target. Rest is preferred; if you train, use reduced volume, reduced load, and technique-focused sets.";
        if (recoveryAdvice?.decision === "light_session") return "Today's converging recovery markers support a temporary lower-fatigue session. The base mesocycle remains unchanged and normal progression resumes when the affected markers and warm-ups normalize.";
        if (recoveryAdvice?.decision === "deload") return "Today's readiness is below your normal band. Use the plan as a structure, but reduce load 10-15%, reduce volume 30-50%, and keep effort around RPE 6-7.";
        if (recoveryAdvice?.decision === "hold") return "Today's readiness is inside your normal band. Train the plan as written and do not change load just because of normal day-to-day fluctuation.";
        if (recoveryAdvice?.decision === "progress") return "Today's readiness is above your normal band. You may take planned progressions if warmups move normally, but do not force a max.";
        return "";
      }

      function recommendForTemplate(template, recoveryAdvice, options = {}) {
        if (!template || template.exercises.length === 0) {
          return { label: "Build the plan first", detail: "Add exercises, sets, and target reps before starting this template.", items: [] };
        }
        const items = template.exercises.map((exercise) => {
          const original = coachTargetForTemplateExercise(exercise, { ...options, template });
          const target = recoveryAdvice ? adjustTargetForRecovery(original, recoveryAdvice, { recovery: options.recovery || {}, exerciseName: exercise.name, template }) : original;
          return { name: exercise.name, text: target.text, target, recommendationSnapshot: target.recommendationSnapshot };
        });
        const totalSets = items.reduce((sum, item) => sum + Number(item.target?.sets || 0), 0);
        const hasHistory = items.some((item) => getLastCompletedSet(item.name, options));
        const label = recoverySessionLabel(recoveryAdvice, hasHistory);
        const baseDetail = hasHistory
          ? "Personal performance is weighted first where the sample is reliable. Follow each card's exact progression, hold, regression, or deload rule. " + goalContext()
          : "No reliable personal comparison exists for at least one lift, so its saved prescription uses the research database as the fallback. " + goalContext();
        const recoveryDetail = recoverySessionDetail(recoveryAdvice);
        const detail = recoveryDetail ? recoveryDetail + " " + baseDetail : baseDetail;
        const context = " Evidence source: " + researchVolumeTarget() + "; exact sets, reps, effort, rest, and progression remain exercise-specific in the unified cards.";
        return { label, detail: detail + " Planned volume: " + totalSets + " working sets." + context, items, totalSets, recommendationIds: items.map((item) => item.recommendationSnapshot?.recommendationId).filter(Boolean) };
      }

      function cachedTemplateAdvice(template, recoveryAdvice, options = {}) {
        const recovery = cleanRecovery(options.recovery || {});
        const key = [analysisRevision, template.id, template.updatedAt || template.createdAt || "", recoveryAdvice?.decision || "", JSON.stringify(recovery)].join("|");
        if (!templateAdviceCache.has(key)) templateAdviceCache.set(key, recommendForTemplate(template, recoveryAdvice, options));
        return templateAdviceCache.get(key);
      }

      function createTemplateFromSession(sessionId) {
        const session = data.sessions.find((item) => item.id === sessionId);
        if (!session) return null;
        const exercises = data.exercises
          .filter((exercise) => exercise.sessionId === session.id)
          .sort((a, b) => a.order - b.order)
          .map((exercise) => {
            const sets = setsForExercise(exercise.id);
            const workingSets = sets.filter((set) => isWorkingSet(set, "progression"));
            const representative = workingSets[0];
            return {
              id: id(),
              name: exercise.name || "Exercise",
              primaryMuscle: exercise.primaryMuscle || "",
              secondaryMuscle: exercise.secondaryMuscle || "",
              resistanceType: resistanceTypeFor(exercise),
              isBodyweight: isBodyweightResistance(resistanceTypeFor(exercise)),
              sets: Math.max(workingSets.length, 1),
              reps: representative?.reps || 8,
              targetRpe: representative?.rpe || "",
              increment: progressionProfileForExercise(exercise.name).increment,
              restSeconds: exercise.restSeconds || recommendedRestSeconds(exercise.name, { reps: representative?.reps || 8 }),
              setTypes: templateSetTypesFromHistory(workingSets, exercise.restSeconds),
              warmups: sets.filter((set) => setTypeSemantics(set).isWarmup).map((set) => ({ reps: set.reps, weight: set.weight, weightUnit: set.weightUnit, resistanceType: set.resistanceType, isBodyweight: set.isBodyweight, addedLoad: set.addedLoad, assistanceLoad: set.assistanceLoad, rpe: set.rpe }))
            };
          });
        return { id: id(), name: (session.title || "Workout") + " Template", notes: "", exercises, createdAt: isoNow(), updatedAt: isoNow() };
      }

      function tabFromLocation() {
        const hash = window.location.hash.replace(/^#/, "").toLowerCase();
        if (primaryTabIds?.includes(hash)) return hash;
        const legacyView = new URLSearchParams(window.location.search).get("view");
        return legacyView === "settings" ? "data" : "lift";
      }

      function tabUrl(tab) {
        const url = new URL(window.location.href);
        url.hash = tab;
        return url.pathname + url.search + url.hash;
      }

      function actionFocusDescriptor(action, dataValues = {}, ordinal = 0) {
        if (!focusActionAllowlist.has(action)) return null;
        const data = {};
        for (const key of focusDescriptorDataKeys) {
          if (dataValues[key] != null && String(dataValues[key])) data[key] = String(dataValues[key]);
        }
        return { kind: "action", action, data, ordinal: Math.max(0, Number.isInteger(ordinal) ? ordinal : 0) };
      }

      function focusDescriptorForElement(element) {
        const actionElement = element?.closest?.("[data-action]");
        if (!actionElement || !focusActionAllowlist.has(actionElement.dataset.action)) return null;
        const descriptor = actionFocusDescriptor(actionElement.dataset.action, actionElement.dataset);
        const matching = Array.from(root.querySelectorAll("[data-action]")).filter((candidate) => {
          if (candidate.dataset.action !== descriptor.action) return false;
          if (!candidate.matches('button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex="-1"])')) return false;
          return Object.entries(descriptor.data).every(([key, value]) => candidate.dataset[key] === value);
        });
        descriptor.ordinal = Math.max(0, matching.indexOf(actionElement));
        return descriptor;
      }

      function isVisibleEnabledFocusable(element, options = {}) {
        if (!(element instanceof HTMLElement) || !element.matches(focusableCandidateSelector)) return false;
        if (element.matches(":disabled") || element.getAttribute("aria-disabled") === "true") return false;
        if (element.closest('[inert], [hidden], [aria-hidden="true"]')) return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || element.getClientRects().length === 0) return false;
        if (options.sequential !== false && element.tabIndex < 0) return false;
        return options.sequential !== false || element.tabIndex >= 0 || element.hasAttribute("tabindex");
      }

      function visibleEnabledFocusableElements(container) {
        return Array.from(container?.querySelectorAll(focusableCandidateSelector) || []).filter((element) => isVisibleEnabledFocusable(element));
      }

      function focusVisibleEnabledElement(element, options = {}) {
        if (!isVisibleEnabledFocusable(element, { sequential: options.sequential !== false })) return null;
        try { element.focus({ preventScroll: options.preventScroll !== false }); }
        catch { return null; }
        return document.activeElement === element ? element : null;
      }

      function queuePostRenderFocus(descriptor) {
        if (!descriptor || !["action", "main"].includes(descriptor.kind)) return;
        pendingFocusDescriptor = descriptor.kind === "main"
          ? { kind: "main" }
          : actionFocusDescriptor(descriptor.action, descriptor.data, descriptor.ordinal);
      }

      function resolveFocusDescriptor(descriptor) {
        if (!descriptor) return null;
        if (descriptor.kind === "main") return document.getElementById("main-content");
        if (descriptor.kind !== "action" || !focusActionAllowlist.has(descriptor.action)) return null;
        const matching = Array.from(root.querySelectorAll("[data-action]")).filter((element) => {
          if (element.dataset.action !== descriptor.action) return false;
          if (!element.matches('button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex="-1"])')) return false;
          return Object.entries(descriptor.data || {}).every(([key, value]) => focusDescriptorDataKeys.includes(key) && element.dataset[key] === value);
        });
        return matching[Math.max(0, Number(descriptor.ordinal || 0))] || matching[0] || null;
      }

      function applyPendingFocus() {
        const descriptor = pendingFocusDescriptor;
        pendingFocusDescriptor = null;
        const target = resolveFocusDescriptor(descriptor);
        const focusedTarget = focusVisibleEnabledElement(target, { sequential: false });
        if (focusedTarget) return focusedTarget;
        const activeDialog = root.querySelector('[role="dialog"][aria-modal="true"]');
        for (const fallback of visibleEnabledFocusableElements(activeDialog)) {
          const focusedFallback = focusVisibleEnabledElement(fallback);
          if (focusedFallback) return focusedFallback;
        }
        return null;
      }

      function captureDialogFocusOrigin(kind) {
        dialogFocusOrigins[kind] = focusDescriptorForElement(document.activeElement) || { kind: "main" };
      }

      function restoreFocusAfterDialog(kind) {
        queuePostRenderFocus(dialogFocusOrigins[kind] || { kind: "main" });
        dialogFocusOrigins[kind] = null;
      }

      function activeDialogKey() {
        if (templateStartFlow) return `template:${templateStartFlow.templateId}:${templateStartFlow.step}`;
        if (cancelWorkoutFlow) return `cancel:${cancelWorkoutFlow.sessionId}`;
        if (historyEditConfirm) return `history:${historyEditConfirm}`;
        if (clearDataFlow?.open) return "clear";
        return "";
      }

      function activeDialogInitialFocusDescriptor() {
        if (templateStartFlow) {
          const action = ({
            "active-conflict": "return-active-workout",
            confirm: "continue-template-start",
            readiness: "use-usual-readiness",
            metrics: "review-template-readiness",
            review: "start-adjusted-workout"
          })[templateStartFlow.step] || "continue-template-start";
          return actionFocusDescriptor(action);
        }
        if (cancelWorkoutFlow) return actionFocusDescriptor("keep-workout");
        if (historyEditConfirm) return actionFocusDescriptor("keep-history-editing");
        if (clearDataFlow?.open) return actionFocusDescriptor("cancel-clear-data");
        return null;
      }

      function preferredScrollBehavior(preferred = "smooth") {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : preferred;
      }

      function usesLargeTextReflow() {
        const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
        return window.innerWidth <= 380 && rootFontSize >= 24;
      }

      function openDashboardDetailView(nextDetail, originElement) {
        const previousDetail = dashboardDetail ? { ...dashboardDetail } : null;
        const origin = focusDescriptorForElement(originElement) || { kind: "main" };
        const scrollY = window.scrollY;
        dashboardFocusStack.push({ origin, previousDetail, scrollY });
        dashboardReturnScroll = scrollY;
        dashboardDetail = nextDetail;
        const rootDetail = ["history", "sessions", "muscles", "fatigue"].includes(nextDetail?.type);
        queuePostRenderFocus(actionFocusDescriptor(rootDetail ? "close-dashboard-detail" : "dashboard-detail-parent"));
        render();
        window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
      }

      function closeDashboardDetailView() {
        const returnState = dashboardFocusStack.pop();
        if (returnState) {
          dashboardDetail = returnState.previousDetail;
          queuePostRenderFocus(returnState.origin);
          render();
          window.setTimeout(() => window.scrollTo({ top: returnState.scrollY, behavior: "auto" }), 0);
          return;
        }
        if (dashboardDetail?.type === "session") dashboardDetail = { type: dashboardDetail.parent === "fatigue-flag" ? "fatigue" : "sessions" };
        else if (dashboardDetail?.type === "fatigue-flag") dashboardDetail = { type: "fatigue" };
        else dashboardDetail = null;
        queuePostRenderFocus({ kind: "main" });
        render();
      }

      function setActiveTab(nextTab, options = {}) {
        const next = primaryTabIds.includes(nextTab) ? nextTab : "lift";
        if (historyEditFlow && next !== "lift" && !options.allowHistoryExit) {
          requestHistoryEditConfirmation("cancel", { preserveOrigin: true });
          return;
        }
        const previous = activeTab;
        if (previous === next && !options.force) {
          if (next === "dashboard" && dashboardDetail) {
            dashboardDetail = null;
            dashboardFocusStack.length = 0;
            queuePostRenderFocus({ kind: "main" });
            render();
          }
          if (next === "plan" && planVolumeDetailId) {
            planVolumeDetailId = "";
            queuePostRenderFocus({ kind: "main" });
            render();
          }
          return;
        }
        tabScrollPositions.set(previous, window.scrollY);
        activeTab = next;
        if (previous === "dashboard" && next !== "dashboard") dashboardFocusStack.length = 0;
        if (options.focus !== false && options.renderNow === false) queuePostRenderFocus({ kind: "main" });
        if (options.updateUrl !== false) {
          const state = { ...(window.history.state || {}), tab: next };
          if (options.replace) window.history.replaceState(state, "", tabUrl(next));
          else window.history.pushState(state, "", tabUrl(next));
        }
        if (options.renderNow !== false) {
          render();
          const mainContent = document.getElementById("main-content");
          if (options.focus !== false && mainContent && document.activeElement !== mainContent) mainContent.focus({ preventScroll: true });
          window.setTimeout(() => window.scrollTo({ top: tabScrollPositions.get(next) || 0, behavior: "auto" }), 0);
        }
      }

      function render() {
        const renderStartedAt = performanceNow();
        document.documentElement.classList.toggle("large-text-reflow", usesLargeTextReflow());
        const session = activeSession();
        if (!session) {
          root.innerHTML = '<div class="loading">Loading your training log...</div>';
          return;
        }
        if (templateStartFlow && !data.templates.some((template) => template.id === templateStartFlow.templateId)) templateStartFlow = null;
        if (cancelWorkoutFlow && !sessionCanBeDiscarded(data.sessions.find((item) => item.id === cancelWorkoutFlow.sessionId))) cancelWorkoutFlow = null;
        if (historyEditConfirm && !isEditingHistorySession()) historyEditConfirm = "";
        const modalOpen = Boolean(templateStartFlow || cancelWorkoutFlow || historyEditConfirm || clearDataFlow?.open);
        const dialogKey = activeDialogKey();
        const sameDialogFocus = dialogKey && dialogKey === renderedDialogKey ? focusDescriptorForElement(document.activeElement) : null;
        document.body.classList.toggle("modal-open", modalOpen);
        const viewHtml = measurePerformance("renderView:" + activeTab, renderView, { tab: activeTab, sessions: data.sessions.length, exercises: data.exercises.length, sets: data.sets.length });
        const domStartedAt = performanceNow();
        root.innerHTML = `
          <div class="app-shell">
            <a class="skip-link" href="#main-content" data-action="skip-content" ${modalOpen ? 'tabindex="-1" aria-hidden="true"' : ""}>Skip to main content</a>
            <header class="brand-bar" ${modalOpen ? 'inert aria-hidden="true"' : ""}>
              <div class="brand-mark" aria-label="Comprehensive Fitness">CF</div>
              <div class="brand-title">Comprehensive <span>Fitness</span><small>${escapeHtml(liftHomeIsVisible() ? "Program overview" : activeSession()?.title || "Training")}</small></div>
              <button class="brand-action" type="button" data-action="toggle-unit" title="Switch pounds and kilograms">${data.settings.weightUnit.toUpperCase()}</button>
              <button class="theme-toggle" type="button" data-action="toggle-theme" title="Toggle light and dark theme">${themeLabel()}</button>
            </header>
            ${renderUpdateBanner()}
            ${appToast ? '<div class="app-toast" role="status" aria-live="polite">' + escapeHtml(appToast) + '</div>' : ''}
            <main class="app-main" id="main-content" tabindex="-1" ${modalOpen ? 'inert aria-hidden="true"' : ""}>${viewHtml}</main>
            <nav class="bottom-nav" aria-label="Main navigation" ${modalOpen ? 'inert aria-hidden="true"' : ""}>
              ${navButton("lift", "Workout", "workout")}
              ${navButton("dashboard", "Dashboard", "dashboard")}
              ${navButton("plan", "Templates", "templates")}
              ${navButton("charts", "Charts", "review")}
              ${navButton("data", "Settings", "settings")}
            </nav>
            ${renderTemplateStartSheet()}
            ${renderCancelWorkoutSheet()}
            ${renderHistoryEditConfirmSheet()}
            ${renderClearDataSheet()}
            ${renderTimerCompleteNotice()}
          </div>
        `;
        const readinessReviewTitle = root.querySelector("#readiness-review-title");
        if (readinessReviewTitle) readinessReviewTitle.textContent = "Today's Readiness Adjustments";
        const dailyReadinessTitle = root.querySelector("#daily-readiness-title");
        if (dailyReadinessTitle) dailyReadinessTitle.textContent = "Today's readiness";
        root.querySelectorAll(".readiness-comparison > .today > span").forEach((label) => { label.textContent = "Today's readiness"; });
        const chartLiftLabel = root.querySelector('label[for="chart-exercise-search"]');
        if (chartLiftLabel) chartLiftLabel.textContent = "Change lift";
        adaptOverflowingTitleFields();
        fitBrandSubtitle();
        resizeExerciseNameFields();
        if (dialogKey && dialogKey !== renderedDialogKey && !pendingFocusDescriptor) queuePostRenderFocus(activeDialogInitialFocusDescriptor());
        else if (sameDialogFocus && !pendingFocusDescriptor) queuePostRenderFocus(sameDialogFocus);
        renderedDialogKey = dialogKey;
        applyPendingFocus();
        recordPerformance("renderDom:" + activeTab, domStartedAt, { tab: activeTab });
        recordPerformance("renderTotal:" + activeTab, renderStartedAt, { tab: activeTab });
      }

      function resizeExerciseNameFields() {
        root.querySelectorAll(".exercise-name-field, .autosize-title-field").forEach((field) => {
          field.style.height = "auto";
          field.style.height = Math.max(38, field.scrollHeight + 2) + "px";
        });
      }

      function adaptOverflowingTitleFields() {
        if (window.innerWidth > 380) return;
        root.querySelectorAll('input[data-action="session-title"], input[data-action="template-name"]').forEach((input) => {
          if (input.clientWidth <= 0 || input.scrollWidth <= input.clientWidth + 1) return;
          const textarea = document.createElement("textarea");
          for (const attribute of input.attributes) {
            if (attribute.name !== "value") textarea.setAttribute(attribute.name, attribute.value);
          }
          textarea.classList.add("autosize-title-field");
          textarea.rows = 1;
          textarea.value = input.value;
          input.replaceWith(textarea);
        });
      }

      function fitBrandSubtitle() {
        if (usesLargeTextReflow() || window.innerWidth > 380) return;
        const subtitle = root.querySelector(".brand-title small");
        if (!subtitle || subtitle.clientWidth <= 0 || subtitle.scrollWidth <= subtitle.clientWidth + 1) return;
        const fullLabel = subtitle.textContent || "";
        subtitle.setAttribute("aria-label", fullLabel);
        subtitle.title = fullLabel;
        let low = 0;
        let high = fullLabel.length;
        while (low < high) {
          const midpoint = Math.ceil((low + high) / 2);
          subtitle.textContent = fullLabel.slice(0, midpoint).trimEnd() + "…";
          if (subtitle.scrollWidth <= subtitle.clientWidth + 1) low = midpoint;
          else high = midpoint - 1;
        }
        subtitle.textContent = fullLabel.slice(0, low).trimEnd() + "…";
      }

      function renderAfterInteractionFrame() {
        if (interactionRenderFrame) window.cancelAnimationFrame(interactionRenderFrame);
        interactionRenderFrame = window.requestAnimationFrame(() => {
          interactionRenderFrame = 0;
          window.setTimeout(render, 0);
        });
      }

      function updateWorkoutStatusDom() {
        const status = root.querySelector(".workout-status-strip");
        if (!status) return;
        const values = status.querySelectorAll(":scope > span");
        const progress = workoutProgress();
        if (values[0]) values[0].textContent = progress.current;
        if (values[1]) values[1].textContent = progress.completed + "/" + progress.total + " sets";
        if (values[2]) values[2].textContent = progress.elapsed;
      }

      function applyCompletedSetVisual(setId) {
        const block = document.getElementById("set-" + setId);
        if (!block) return;
        block.dataset.setState = "completed";
        block.classList.remove("next-set", "edited-set", "skipped-set", "acknowledged");
        block.classList.add("completed");
        const row = block.querySelector(".set-row");
        row?.classList.remove("pending");
        row?.classList.add("completed");
        const button = block.querySelector('[data-action="toggle-set"]');
        if (button) {
          button.classList.add("checked");
          button.setAttribute("aria-pressed", "true");
          button.setAttribute("aria-label", "Set completed");
          button.setAttribute("title", "Completed");
        }
        block.querySelector(".next-set-banner")?.remove();
        updateWorkoutStatusDom();
      }

      function applyCurrentSetVisual(setId, notice = "Current set") {
        const block = document.getElementById("set-" + setId);
        if (!block) return;
        block.dataset.setState = "current";
        block.classList.remove("completed", "edited-set", "skipped-set", "acknowledged");
        block.classList.add("next-set");
        const row = block.querySelector(".set-row");
        row?.classList.remove("completed");
        row?.classList.add("pending");
        let banner = block.querySelector(".next-set-banner");
        if (!banner && row) {
          row.insertAdjacentHTML("afterend", '<div class="next-set-banner"><span aria-hidden="true">&#10148;</span><span></span></div>');
          banner = block.querySelector(".next-set-banner");
        }
        const label = banner?.querySelector("span:last-child");
        if (label) label.textContent = notice;
        updateWorkoutStatusDom();
      }

      function syncTimerDom() {
        if (!timer) return;
        const bar = document.querySelector(".timer-bar");
        if (!bar) return;
        bar.dataset.timerId = timer.id;
        const stateLabel = bar.querySelector(".timer-heading-copy > span");
        const status = bar.querySelector(".timer-heading-copy small");
        const pause = bar.querySelector('[data-action="toggle-timer"]');
        if (stateLabel) stateLabel.textContent = timer.isPaused ? "Paused" : "Rest";
        if (status) status.textContent = timer.isPaused ? "Notification paused" : timer.notificationStatus === "scheduled" ? "Lock-screen alert scheduled" : timer.notificationStatus === "error" ? "Foreground alert only" : "Scheduling alert";
        if (pause) {
          pause.innerHTML = timer.isPaused ? icon.play : icon.pause;
          pause.setAttribute("title", timer.isPaused ? "Resume timer" : "Pause timer");
          pause.setAttribute("aria-label", timer.isPaused ? "Resume timer" : "Pause timer");
        }
        updateTimerDisplay();
      }

      function removeTimerDom(timerSnapshot) {
        const block = document.getElementById("set-" + (timerSnapshot?.setId || ""));
        block?.querySelector(".timer-bar")?.remove();
        block?.classList.remove("resting-set");
      }

      function renderUpdateBanner() {
        if (!updateAvailable && !pendingControllerReload) return "";
        const historyEditing = Boolean(historyEditFlow || historyEditStartPending);
        const workoutActive = hasActiveWorkout();
        const message = historyEditing
          ? 'A new app version is ready. Save or discard history edits before updating.'
          : workoutActive
            ? 'Update available. It will wait until this workout is logged.'
            : 'A new app version is ready.';
        return '<div class="update-banner" role="status"><span>' + message + '</span>' + (historyEditing || workoutActive ? '' : '<button type="button" data-action="apply-update">Update now</button>') + '</div>';
      }

      function navButton(tab, label, iconKey) {
        const active = activeTab === tab;
        return '<button class="nav-button ' + (active ? "active" : "") + '" data-action="set-tab" data-tab="' + tab + '" type="button"' + (active ? ' aria-current="page"' : '') + ' aria-label="' + escapeHtml(icon[iconKey] + ' ' + label) + '"><span class="nav-icon" aria-hidden="true">' + icon[iconKey] + '</span><span>' + label + '</span></button>';
      }

      function renderView() {
        if (activeTab === "dashboard") return renderDashboard();
        if (activeTab === "plan") return renderTemplates();
        if (activeTab === "charts") return renderReview();
        if (activeTab === "data") return renderSettings();
        return renderWorkout();
      }

      function liftHomeIsVisible() {
        return activeTab === "lift" && !hasActiveWorkout() && !viewingHistorySessionId && !completedSummarySessionId;
      }

      function renderWorkout() {
        const session = activeSession();
        if (liftHomeIsVisible()) return renderLiftHome();
        const editingHistory = isEditingHistorySession(session.id);
        const historyReadOnly = isSessionSubmitted(session) && !editingHistory;
        const addExerciseSafety = guardWorkoutMutation("add-exercise", {}, false);
        if (activeWorkoutId === session.id) ensureActiveSet();
        const progress = workoutProgress();
        const quickStartHtml = measurePerformance("lift:quickTemplates", renderQuickStartTemplates);
        const exerciseHtml = measurePerformance("lift:exerciseList", () => activeExercises().map(renderExercise).join(""), { count: activeExercises().length });
          const planReadinessHtml = measurePerformance("lift:planReadiness", () => renderRecoveryPanel(session) + renderTodayPlan() + renderActiveWorkoutAdvice());
        return `
          <section class="view workout-view ${historyReadOnly ? "history-readonly" : ""} ${editingHistory ? "history-editing" : ""}">
            <div class="workout-heading">
              <div><div class="section-kicker">Today</div><h1>${escapeHtml(session.title || "Workout")}</h1></div>
              <span class="status-pill ${isSessionSubmitted(session) ? "good" : session.id === activeWorkoutId && hasActiveWorkout() ? "inside" : "neutral"}">${isSessionSubmitted(session) ? "Logged" : session.id === activeWorkoutId && hasActiveWorkout() ? "In progress" : "Ready"}</span>
            </div>
            ${quickStartHtml}
            ${renderNotificationPrompt()}
            <div class="workout-status-strip">
              <span>${escapeHtml(progress.current)}</span><span>${progress.completed}/${progress.total} sets</span><span>${progress.elapsed}</span>
              <button class="icon-button" type="button" data-action="new-session" title="${hasActiveWorkout() ? "Finish or cancel the active workout before starting another" : "New workout"}" aria-label="${hasActiveWorkout() ? "New workout unavailable while a workout is active" : "New workout"}" ${hasActiveWorkout() ? "disabled" : ""}>${icon.add}</button>
            </div>
            ${session.adjustmentSummary ? '<div class="adjustment-summary">' + escapeHtml(session.adjustmentSummary) + '</div>' : ""}
            ${exerciseHtml}
            ${historyReadOnly ? "" : `<details class="compact-disclosure add-exercise-panel">
              <summary>Add exercise <span>${icon.add}</span></summary>
              <div class="disclosure-body">
                <div class="row">
                  <input value="${escapeHtml(addExerciseDraft)}" data-action="add-exercise-draft" placeholder="Exercise name" aria-label="New exercise name" />
                  <button class="icon-button" type="button" data-action="add-exercise" title="Add exercise"${workoutSafetyDisabledAttributes(addExerciseSafety)}>${icon.add}</button>
                </div>
                <div class="muscle-select-grid">
                  <label>Primary muscle<select data-action="add-exercise-primary" aria-label="Primary muscle for new exercise">${muscleOptions(addExercisePrimaryMuscle, true, "Auto classify")}</select></label>
                  <label>Secondary muscle<select data-action="add-exercise-secondary" aria-label="Secondary muscle for new exercise">${muscleOptions(addExerciseSecondaryMuscle, true, "None")}</select></label>
                </div>
              </div>
            </details>`}
            <details class="compact-disclosure">
              <summary>Plan and readiness <span>View</span></summary>
              <div class="disclosure-body">${planReadinessHtml}</div>
            </details>
            <details class="compact-disclosure">
              <summary>Workout details <span>Edit</span></summary>
              <div class="disclosure-body session-header">
              <div class="row split">
                <select data-action="change-session" aria-label="Workout session">
                  ${workoutSessionOptions(session).map((item) => '<option value="' + item.id + '" ' + (item.id === session.id ? "selected" : "") + '>' + escapeHtml(item.title) + " - " + formatDate(item.date) + '</option>').join("")}
                </select>
              </div>
              <div class="grid two">
                ${usesLargeTextReflow()
                  ? '<textarea class="autosize-title-field" rows="1" data-action="session-title" aria-label="Workout title">' + escapeHtml(session.title) + '</textarea>'
                  : '<input value="' + escapeHtml(session.title) + '" data-action="session-title" aria-label="Workout title" />'}
                <input type="date" value="${session.date}" data-action="session-date" aria-label="Workout date" />
              </div>
              <label class="toggle-line"><input type="checkbox" data-action="session-travel" ${session.isTravel ? "checked" : ""} />Travel session</label>
              <textarea data-action="session-notes" placeholder="Session notes" aria-label="Session notes">${escapeHtml(session.notes)}</textarea>
              </div>
            </details>
            <div class="workout-footer-actions"><button class="secondary-action" type="button" data-action="save-template">Save as template</button>
            ${isSessionSubmitted(session)
              ? '<div class="session-submitted">Workout logged' + (session.submittedAt ? ' ' + formatDate(session.date) : '') + '</div>'
              : '<button class="primary-action submit-workout" type="button" data-action="request-submit-workout">Submit workout</button>'}
            </div>
            ${editingHistory ? '<section class="history-edit-bar"><div><strong>Editing logged workout</strong><span>Changes remain temporary until you confirm Save Edits. The workout grade will be recalculated from the revised sets.</span></div><div class="history-edit-actions"><button class="primary-action" type="button" data-action="request-save-history-edits">Save Edits</button><button class="secondary-action" type="button" data-action="request-cancel-history-edits">Cancel Edits</button></div></section>' : ''}
            ${historyReadOnly && completedSummarySessionId !== session.id ? renderCompletedWorkoutSummary(session, { history: true }) : ''}
            ${historyReadOnly ? '<div class="history-view-actions"><button class="primary-action" type="button" data-action="begin-history-edit">Edit History</button><button class="secondary-action" type="button" data-action="return-lift-home">Return to Lift Home</button></div>' : ''}
            ${sessionCanBeDiscarded(session) ? '<div class="session-controls"><button class="text-danger-action" type="button" data-action="request-cancel-workout" data-session-id="' + session.id + '">Cancel Workout</button><span>Discards only this open session.</span></div>' : ''}
            ${pendingSubmitSessionId === session.id ? renderSubmitConfirmation(session) : ""}
            ${completedSummarySessionId === session.id ? renderCompletedWorkoutSummary(session) : ""}
          </section>
        `;
      }

      function renderLiftHome() {
        const analysis = hypertrophyAnalysis(0, "overall", "");
        return `
          <section class="view lift-home-view">
            <div class="workout-heading"><div><div class="section-kicker">Lift</div><h1>Program overview</h1></div><span class="status-pill inside">Ready</span></div>
            ${renderQuickStartTemplates()}
            <section class="lift-home-score"><div class="section-heading"><div><h2>Overall Program Hypertrophy Score</h2><p>${escapeHtml(hypertrophyWindowLabel(analysis))}</p></div></div>${renderHypertrophyScore(analysis)}<div class="score-scale" aria-label="Hypertrophy score ranges"><span class="score-excellent">90-100 Excellent</span><span class="score-very-good">80-89 Very good</span><span class="score-good">70-79 Good</span><span class="score-mixed">60-69 Mixed</span><span class="score-limiting">40-59 Limited</span><span class="score-critical">Below 40 Attention</span></div></section>
          </section>`;
      }

      function workoutProgress() {
        const session = activeSession();
        const exercises = activeExercises();
        const running = Boolean(session && session.id === activeWorkoutId && hasActiveWorkout());
        const visibleTimer = timer?.workoutId === session?.id ? timer : null;
        const workSets = exercises.flatMap((exercise) => setsForExercise(exercise.id).filter((set) => isWorkingSet(set, "score")));
        const activeSet = data.sets.find((set) => set.id === activeSetId);
        const activeExercise = activeSet ? exercises.find((exercise) => exercise.id === activeSet.exerciseId) : null;
        const waitingSet = visibleTimer ? data.sets.find((set) => set.id === visibleTimer.pendingNextSetId) : null;
        const waitingExercise = waitingSet ? exercises.find((exercise) => exercise.id === waitingSet.exerciseId) : null;
        const startedAt = new Date(session?.startedAt || Date.now()).getTime();
        const elapsedMinutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
        const remaining = workSets.filter((set) => !set.completed && !set.skipped).length;
        const currentLabel = visibleTimer && waitingSet
          ? "Rest - " + (waitingExercise?.name || "Next set") + " · Set " + (waitingSet.isWarmup ? "WU" : waitingSet.setNumber)
          : activeExercise && activeSet
            ? activeExercise.name + " · Set " + (activeSet.isWarmup ? "WU" : activeSet.setNumber)
            : workSets.length > 0 && remaining === 0 ? "Workout ready to submit" : "Plan ready";
        return {
          current: currentLabel,
          completed: workSets.filter((set) => set.completed).length,
          total: workSets.length,
          remaining,
          elapsed: running
            ? (elapsedMinutes < 60 ? elapsedMinutes + "m elapsed" : Math.floor(elapsedMinutes / 60) + "h " + (elapsedMinutes % 60) + "m elapsed")
            : isSessionSubmitted(session) ? "Workout logged" : "Not started"
        };
      }

      function renderNotificationPrompt() {
        if (!isStandalonePwa() && !data.settings.installGuideDismissed) {
          return '<div class="notification-prompt install-prompt"><div><strong>Install on iPhone</strong><span>In Safari, tap Share, choose Add to Home Screen, enable Open as Web App when shown, then tap Add.</span></div><button type="button" data-action="dismiss-install-guide">Got it</button></div>';
        }
        const alerts = restAlertState();
        const denied = alerts.permissionStatus === "denied";
        const detail = alerts.lockScreenReady
          ? "Lock-screen rest alerts are active for this installed app."
          : denied
            ? "Permission is denied in iPhone or browser settings. Foreground alerts remain available."
            : "Enable alerts so the app can tell you when rest ends while your iPhone is locked or another app is open.";
        return '<div class="notification-prompt rest-alert-control ' + (alerts.lockScreenReady ? 'selected' : '') + ' ' + (denied ? 'denied' : '') + '"><div><strong>Rest notifications</strong><span>' + escapeHtml(detail) + '</span></div><button class="alert-toggle-button ' + (alerts.lockScreenReady ? 'selected-control' : '') + '" type="button" data-action="toggle-rest-notifications" ' + (denied ? 'aria-label="Rest notification permission denied"' : '') + '>' + (alerts.lockScreenReady ? '&#10003; Enabled' : denied ? 'Permission denied' : alerts.notificationsEnabled ? 'Finish setup' : 'Enable') + '</button></div>';
      }

      function renderTodayPlan() {
        const session = activeSession();
        const exercises = activeExercises();
        const savedPrescriptions = exercises.map((exercise) => exercise.recommendationSnapshot?.finalPrescription).filter(Boolean);
        const adjustedCount = savedPrescriptions.filter((prescription) => prescription.readinessAdjustment?.changed).length;
        const highestPriorityType = ["full_program_deload", "muscle_group_deload", "exercise_deload", "rotate_exercise", "substitute", "light_session", "reduce_volume", "progress", "hold", "normal"].find((type) => savedPrescriptions.some((prescription) => prescription.recommendationType === type));
        const readiness = savedPrescriptions.length
          ? { action: adjustedCount ? `${adjustedCount} exercise${adjustedCount === 1 ? " has" : "s have"} a temporary readiness adjustment; base prescriptions are preserved.` : `${recommendationLabel(highestPriorityType || "normal")}. These are the immutable targets saved when this workout started.`, band: { outside: adjustedCount > 0, direction: adjustedCount > 0 ? "low" : "inside" } }
          : recoveryRecommendationForSession(session);
        if (!exercises.length) {
          return `
            <div class="compact-plan-empty">Choose a template above, or add an exercise to build today’s workout.</div>
          `;
        }
        return `
          <section class="plan-compact">
            <div class="row split">
              <strong>Today’s plan</strong>
              <span class="status-pill ${readiness.band?.outside ? readiness.band.direction : "inside"}">${readiness.band?.outside ? readiness.band.direction + " band" : "inside band"}</span>
            </div>
            <p class="advice-detail">${escapeHtml(readiness.action)}</p>
            <div class="plan-list">
              ${exercises.map((exercise) => {
                const sets = setsForExercise(exercise.id).filter((set) => isWorkingSet(set, "score"));
                const first = sets[0] || createSet(exercise.id, 1);
                const loadText = formatResistance(first, exercise);
                return `
                  <div class="plan-card">
                    <header><strong>${escapeHtml(exercise.name)}</strong><span class="status-pill" data-plan-count="${exercise.id}">${sets.length} sets</span></header>
                    <div class="plan-targets">
                      <span data-plan-reps="${exercise.id}">${sets.length || 1} x ${first.reps || 0}</span>
                      <span data-plan-load="${exercise.id}">${escapeHtml(loadText)}</span>
                      <span data-plan-rest="${exercise.id}">${exercise.restSeconds || data.settings.defaultRestSeconds || 90}s rest</span>
                    </div>
                    <div class="plan-meta" data-plan-meta="${exercise.id}">Aim RPE ${first.rpe || 8}. ${escapeHtml(exercise.notes || "Use clean reps and stop when positions break.")}</div>
                  </div>
                `;
              }).join("")}
            </div>
          </section>
        `;
      }

      function renderDashboard() {
        if (dashboardDetail) return renderDashboardDetail();
        const volumes = measurePerformance("dashboard:weeklyMuscleVolume", () => weeklyMuscleVolume(dashboardWeekStart), { weekStart: dashboardWeekStart });
        const flags = measurePerformance("dashboard:fatigueFlags", () => fatigueFlags(dashboardWeekStart), { weekStart: dashboardWeekStart });
        const trained = volumes.filter((bucket) => bucket.sets > 0);
        const untrained = volumes.filter((bucket) => bucket.sets === 0);
        const completedSessions = dashboardSessionsForWeek(dashboardWeekStart);
        const highConcernCount = flags.filter((flag) => flag.concern === "high").length;
        const moderateConcernCount = flags.filter((flag) => flag.concern === "moderate").length;
        const currentWeek = startOfWeekIso(todayIso());
        const renderBucket = (bucket, quiet = false) => {
          const max = Math.max(bucket.targetHigh, bucket.sets, 1);
          const meter = Math.min(100, Math.round((bucket.sets / max) * 100));
          const label = bucket.status === "low" ? "below target" : bucket.status === "over" ? "above target" : "in range";
          const expanded = expandedVolumeMuscle === bucket.muscle;
          return `
            <article class="volume-card ${quiet ? "quiet-volume" : ""} ${expanded ? "expanded" : ""}">
              <button class="volume-card-toggle" type="button" data-action="toggle-volume-muscle" data-muscle="${escapeHtml(bucket.muscle)}" aria-expanded="${expanded ? "true" : "false"}">
                <header><strong>${bucket.muscle}</strong><span class="status-pill ${bucket.status}">${label}</span></header>
                <div class="meter" style="--meter:${meter}%"><span></span></div>
                <small>${bucket.sets.toFixed(bucket.sets % 1 ? 1 : 0)} sets. Target ${bucket.targetLow}-${bucket.targetHigh}. ${bucket.exerciseCount || 0} lifts.</small>
              </button>
              ${expanded ? renderVolumeDetails(bucket) : ""}
            </article>
          `;
        };
        return `
          <section class="view dashboard-view">
            <div class="screen-heading">
              <div><div class="section-kicker">Dashboard</div><h1>Volume and fatigue</h1></div>
              <div class="dashboard-period" aria-label="Dashboard week">
                <button type="button" data-action="dashboard-week" data-direction="-1" aria-label="Previous dashboard week">‹</button>
                <strong>${formatDate(dashboardWeekStart)}</strong>
                <button type="button" data-action="dashboard-week" data-direction="1" aria-label="Next dashboard week" ${dashboardWeekStart >= currentWeek ? "disabled" : ""}>›</button>
              </div>
            </div>
            <div class="dashboard-summary-row" aria-label="Weekly overview">
              <button type="button" data-action="open-dashboard-detail" data-detail="sessions" aria-label="Open logged sessions for ${formatWeek(dashboardWeekStart)}"><strong>${completedSessions.length}</strong><span>logged sessions</span></button>
              <button type="button" data-action="open-dashboard-detail" data-detail="muscles" aria-label="Open trained muscles for ${formatWeek(dashboardWeekStart)}"><strong>${trained.length}</strong><span>trained muscles</span></button>
              <button type="button" data-action="open-dashboard-detail" data-detail="fatigue" aria-label="Open fatigue flags for ${formatWeek(dashboardWeekStart)}"><strong>${flags.length}</strong><span class="fatigue-summary-text">${highConcernCount ? '<span class="high">' + highConcernCount + ' high</span>' : ''}${moderateConcernCount ? '<span class="moderate">' + moderateConcernCount + ' moderate</span>' : ''}${!flags.length ? 'fatigue flags' : ''}</span></button>
            </div>
            <section class="screen-section">
              <div class="section-heading"><div><h2>Weekly muscle volume</h2><p>Tap a muscle to see the contributing lifts.</p></div><span>${formatWeek(dashboardWeekStart).replace("Week of ", "")}</span></div>
              <div class="dashboard-grid">
                ${trained.length ? trained.map((bucket) => renderBucket(bucket)).join("") : '<div class="empty-state">Log a working set to start your weekly volume dashboard.</div>'}
              </div>
              ${untrained.length ? '<details class="compact-disclosure"><summary>All muscles <span>' + untrained.length + ' untouched</span></summary><div class="disclosure-body"><div class="dashboard-grid">' + untrained.map((bucket) => renderBucket(bucket, true)).join("") + '</div></div></details>' : ""}
            </section>
            <section class="screen-section">
              <div class="section-heading"><div><h2>Fatigue flags</h2><p>Lift and muscle signals remain separate from today’s recovery score.</p></div></div>
              ${flags.length ? '<div class="drilldown-list">' + flags.map((flag) => renderFatigueFlagRow(flag)).join("") + '</div>' : '<div class="empty-state">No fatigue flags for this week. This can be true even when a single day’s recovery is low; lift and muscle flags use training-history rules.</div>'}
            </section>
            <section class="screen-section">
              <div class="section-heading"><div><h2>Recent history</h2><p>Your latest completed sessions.</p></div><button class="text-button" type="button" data-action="open-history">View all</button></div>
              ${renderRecentSessions()}
            </section>
          </section>
        `;
      }

      function dashboardWeekEnd(weekStart) {
        const end = new Date(weekStart + "T00:00:00");
        end.setDate(end.getDate() + 7);
        return localDateIso(end);
      }

      function dashboardSessionsForWeek(weekStart) {
        const end = dashboardWeekEnd(weekStart);
        return activeHistorySessions()
          .filter((session) => session.date >= weekStart && session.date < end)
          .sort((a, b) => b.date.localeCompare(a.date) || String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
      }

      function sessionWorkoutFacts(session) {
        const exercises = data.exercises.filter((exercise) => exercise.sessionId === session.id).sort((a, b) => a.order - b.order);
        const exerciseIds = new Set(exercises.map((exercise) => exercise.id));
        const sets = data.sets.filter((set) => exerciseIds.has(set.exerciseId));
        const completed = sets.filter((set) => set.completed && isWorkingSet(set, "score"));
        const started = new Date(session.startedAt || session.createdAt || "").getTime();
        const ended = new Date(session.submittedAt || session.updatedAt || "").getTime();
        const measured = Number.isFinite(started) && Number.isFinite(ended) && ended > started ? Math.round((ended - started) / 60000) : 0;
        const durationMinutes = measured > 0 && measured < 720 ? measured : Math.max(1, Math.round(completed.length * 2.5));
        return { exercises, sets, completed, durationMinutes, estimatedDuration: !(measured > 0 && measured < 720), prs: session.prs || [] };
      }

      function renderFatigueFlagRow(flag) {
        const concern = flag.concern || "low";
        return '<button class="drilldown-item fatigue-' + concern + '" type="button" data-action="open-fatigue-flag" data-flag-id="' + escapeHtml(flag.id) + '" aria-label="Open ' + escapeHtml(flag.scope + ' ' + flag.name + ' fatigue flag') + '"><strong>' + escapeHtml(flag.scope + ': ' + flag.name) + '</strong><span class="fatigue-severity ' + concern + '">' + escapeHtml(concern.charAt(0).toUpperCase() + concern.slice(1) + ' concern') + '</span><span>' + escapeHtml(flag.reason) + '</span><small>' + escapeHtml(formatDate(flag.triggeredAt)) + '</small><span class="drilldown-chevron" aria-hidden="true">›</span></button>';
      }

      function renderDashboardDetailHeader(title, subtitle, nested = false, backAction = "") {
        return '<div class="dashboard-detail-header"><button type="button" data-action="' + (backAction || (nested ? 'dashboard-detail-parent' : 'close-dashboard-detail')) + '" aria-label="Back">‹</button><div><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(subtitle) + '</p></div></div>';
      }

      function renderWeeklyVolumeWarningDetail(flag, options = {}) {
        const detail = flag.volumeDetail;
        const formatSets = (value) => Number(value || 0).toFixed(Number(value || 0) % 1 ? 1 : 0);
        const sessionAction = options.sessionAction || "open-volume-session";
        return `<section class="view dashboard-detail-view">${renderDashboardDetailHeader(detail.muscle + " weekly volume", formatWeek(detail.weekStart), true, options.backAction || "")}
          <article class="volume-warning-detail ${flag.concern}">
            <div class="volume-warning-hero"><div><span class="fatigue-severity ${flag.concern}">${escapeHtml(flag.concern.charAt(0).toUpperCase() + flag.concern.slice(1))} concern</span><h2>${formatSets(detail.actual)} weighted sets</h2><p>${formatSets(detail.exceededBy)} above the planned ${detail.targetLow}-${detail.targetHigh} set range.</p></div></div>
            <div class="volume-warning-numbers"><div><span>Planned</span><strong>${detail.targetLow}-${detail.targetHigh}</strong></div><div><span>Weighted Stimulus</span><strong>${formatSets(detail.actual)}</strong></div><div><span>Direct Sets</span><strong>${formatSets(detail.directSets)}</strong></div><div><span>Fractional Contribution</span><strong>${formatSets(detail.indirectSets)}</strong></div></div>
            <p class="settings-note">Calculated with exercise–muscle taxonomy ${escapeHtml(prescriptionEvidenceStatus.researchVersion)}. Fractional contributions use exercise-specific weights. Isometric stabilization and incidental involvement affect fatigue where relevant but receive no hypertrophy-set credit.</p>
            <section><h3>What contributed</h3><div class="volume-session-groups">${(detail.sessionGroups || []).map((session) => '<section class="volume-session-group"><button class="volume-session-heading" type="button" data-action="' + sessionAction + '" data-session-id="' + session.id + '"><span><strong>' + escapeHtml(session.title) + '</strong><small>' + formatDate(session.date) + '</small></span><span>' + formatSets(session.sets) + ' sets &rsaquo;</span></button><div class="volume-exercise-rows">' + session.exercises.map((exercise) => '<div class="volume-exercise-row"><span><strong>' + escapeHtml(exercise.name) + '</strong><small>' + (exercise.volumeLoad > 0 ? Math.round(exercise.volumeLoad) + ' ' + data.settings.weightUnit + ' volume load' : 'Rep and effort contribution') + '</small></span><span class="volume-set-breakdown"><b>' + formatSets(exercise.sets) + ' sets</b><small>' + (exercise.directSets ? formatSets(exercise.directSets) + ' direct' : '') + (exercise.directSets && exercise.indirectSets ? ' · ' : '') + (exercise.indirectSets ? formatSets(exercise.indirectSets) + ' indirect' : '') + '</small></span></div>').join('') + '</div></section>').join('') || '<div class="empty-state">No submitted contributions found.</div>'}</div></section>
            <section><h3>Submitted workouts included</h3><div class="drilldown-list">${detail.sessions.map((session) => '<button class="drilldown-item compact" type="button" data-action="' + sessionAction + '" data-session-id="' + escapeHtml(session.id) + '"><strong>' + escapeHtml(session.title) + '</strong><span>' + formatDate(session.date) + '</span><span class="drilldown-chevron" aria-hidden="true">›</span></button>').join('') || '<div class="empty-state">No submitted workouts contributed.</div>'}</div></section>
            <section><h3>Deload handling</h3><p>${detail.excludedDeloadSessions.length ? detail.excludedDeloadSessions.length + ' explicitly marked deload workout' + (detail.excludedDeloadSessions.length === 1 ? ' was' : 's were') + ' excluded: ' + escapeHtml(detail.excludedDeloadSessions.map((session) => session.title + ' (' + formatDate(session.date) + ')').join(', ')) + '.' : 'No explicitly marked deload exercises were present in this week.'}</p></section>
            <section><h3>Rule used</h3><p>${escapeHtml(flag.rule)}</p></section>
            <section><h3>Recommended next step</h3><p>${escapeHtml(flag.recommendation)}</p></section>
          </article>
        </section>`;
      }

      function renderDashboardDetail() {
        const volumes = weeklyMuscleVolume(dashboardWeekStart);
        const flags = fatigueFlags(dashboardWeekStart);
        const sessions = dashboardSessionsForWeek(dashboardWeekStart);
        const period = formatWeek(dashboardWeekStart);
        if (dashboardDetail.type === "history") return renderHistory(true);
        if (dashboardDetail.type === "session") {
          const session = data.sessions.find((item) => item.id === dashboardDetail.id);
          if (!session) { dashboardDetail = { type: "sessions" }; return renderDashboardDetail(); }
          const facts = sessionWorkoutFacts(session);
          return `<section class="view dashboard-detail-view">${renderDashboardDetailHeader(session.title || "Workout", formatDate(session.date), true)}
            <div class="dashboard-summary-row"><div><strong>${facts.durationMinutes}m</strong><span>${facts.estimatedDuration ? "estimated duration" : "duration"}</span></div><div><strong>${facts.exercises.length}</strong><span>exercises</span></div><div><strong>${facts.completed.length}</strong><span>completed sets</span></div></div>
            ${renderCompletedWorkoutSummary(session, { history: true })}
            ${session.notes ? '<div class="inline-panel"><strong>Session notes</strong><p class="settings-note">' + escapeHtml(session.notes) + '</p></div>' : ''}
          </section>`;
        }
        if (dashboardDetail.type === "sessions") {
          return `<section class="view dashboard-detail-view">${renderDashboardDetailHeader("Logged sessions", period)}<div class="drilldown-list">${sessions.length ? sessions.map((session) => { const facts = sessionWorkoutFacts(session); return '<button class="drilldown-item" type="button" data-action="open-dashboard-session" data-session-id="' + session.id + '"><strong>' + escapeHtml(session.title || 'Workout') + '</strong><span>' + formatDate(session.date) + ' · ' + facts.durationMinutes + ' min' + (facts.estimatedDuration ? ' est.' : '') + ' · ' + facts.exercises.length + ' exercises</span><small>' + facts.completed.length + ' completed sets' + (facts.prs.length ? ' · ' + facts.prs.length + ' PR' + (facts.prs.length === 1 ? '' : 's') : '') + '</small><span class="drilldown-chevron" aria-hidden="true">›</span></button>'; }).join('') : '<div class="empty-state">No submitted workouts in this period.</div>'}</div></section>`;
        }
        if (dashboardDetail.type === "muscles") {
          const trained = volumes.filter((bucket) => bucket.sets > 0);
          return `<section class="view dashboard-detail-view">${renderDashboardDetailHeader("Trained muscles", period)}<div class="detail-facts">${trained.length ? trained.map((bucket) => { const sessionsCount = new Set(bucket.details.flatMap((detail) => detail.sessions.map((session) => session.title + session.date))).size; return '<div class="detail-fact"><strong>' + escapeHtml(bucket.muscle) + ' · ' + bucket.sets.toFixed(bucket.sets % 1 ? 1 : 0) + ' sets</strong><span>' + sessionsCount + ' session' + (sessionsCount === 1 ? '' : 's') + ' · ' + bucket.directSets.toFixed(bucket.directSets % 1 ? 1 : 0) + ' direct sets · ' + bucket.indirectSets.toFixed(bucket.indirectSets % 1 ? 1 : 0) + ' fractional secondary sets</span><span>' + escapeHtml(bucket.details.map((detail) => detail.name + ' (' + detail.sets.toFixed(detail.sets % 1 ? 1 : 0) + ')').join(', ')) + '</span></div>'; }).join('') : '<div class="empty-state">No muscle volume was logged in this period.</div>'}</div></section>`;
        }
        if (dashboardDetail.type === "fatigue-flag") {
          const flag = flags.find((item) => item.id === dashboardDetail.id);
          if (!flag) { dashboardDetail = { type: "fatigue" }; return renderDashboardDetail(); }
          if (flag.detailType === "weekly-volume" && flag.volumeDetail) return renderWeeklyVolumeWarningDetail(flag);
          return `<section class="view dashboard-detail-view">${renderDashboardDetailHeader(flag.scope + ": " + flag.name, formatDate(flag.triggeredAt), true)}<article class="fatigue-explanation ${flag.concern}"><span class="fatigue-severity ${flag.concern}">${escapeHtml(flag.concern.charAt(0).toUpperCase() + flag.concern.slice(1))} concern</span><h2>${escapeHtml(flag.reason)}</h2><div><strong>Data that triggered it</strong><ul>${flag.evidence.map((item) => '<li>' + escapeHtml(item) + '</li>').join('')}</ul></div><div><strong>Rule crossed</strong><p>${escapeHtml(flag.rule)}</p></div><div><strong>Recommended next step</strong><p>${escapeHtml(flag.recommendation)}</p></div><div><strong>What clears the flag</strong><p>${escapeHtml(flag.resolution)}</p></div></article></section>`;
        }
        return `<section class="view dashboard-detail-view">${renderDashboardDetailHeader("Fatigue flags", period)}<div class="drilldown-list">${flags.length ? flags.map(renderFatigueFlagRow).join('') : '<div class="empty-state">No fatigue flags were triggered in this period.</div>'}</div></section>`;
      }

      function renderVolumeDetails(bucket) {
        if (!bucket.details.length) return '<div class="volume-detail empty">No completed sets mapped to this muscle this week.</div>';
        const formatSets = (value) => Number(value || 0).toFixed(Number(value || 0) % 1 ? 1 : 0);
        const statusText = bucket.status === "over" ? formatSets(bucket.sets - bucket.targetHigh) + " sets above target" : bucket.status === "low" ? formatSets(bucket.targetLow - bucket.sets) + " sets below target" : "Inside target range";
        return `
          <div class="volume-detail">
            <div class="volume-detail-hero ${bucket.status}"><div><span>${escapeHtml(bucket.muscle)}</span><strong>${formatSets(bucket.sets)} hard sets</strong></div><div><span>Weekly target</span><strong>${bucket.targetLow}-${bucket.targetHigh}</strong></div><div><span>Status</span><strong>${statusText}</strong></div></div>
            <p class="volume-period-note">Monday-Sunday calendar week beginning ${formatDate(dashboardWeekStart)}. Submitted workouts only; explicitly marked deload work is excluded.</p>
            <div class="volume-session-groups">${bucket.sessionGroups.map((session) => `
              <section class="volume-session-group">
                <button class="volume-session-heading" type="button" data-action="open-volume-session" data-session-id="${session.id}"><span><strong>${escapeHtml(session.title)}</strong><small>${formatDate(session.date)}</small></span><span>${formatSets(session.sets)} sets &rsaquo;</span></button>
                <div class="volume-exercise-rows">${session.exercises.map((exercise) => '<button class="volume-exercise-row" type="button" data-action="open-volume-exercise" data-exercise-name="' + escapeHtml(exercise.name) + '"><span><strong>' + escapeHtml(exercise.name) + '</strong><small>' + (exercise.volumeLoad > 0 ? Math.round(exercise.volumeLoad) + ' ' + data.settings.weightUnit + ' volume load' : 'Rep and effort contribution') + '</small></span><span class="volume-set-breakdown"><b>' + formatSets(exercise.sets) + ' sets</b><small>' + (exercise.directSets ? formatSets(exercise.directSets) + ' direct' : '') + (exercise.directSets && exercise.indirectSets ? ' · ' : '') + (exercise.indirectSets ? formatSets(exercise.indirectSets) + ' indirect' : '') + '</small></span></button>').join('')}</div>
              </section>`).join('')}</div>
          </div>
        `;
      }

      function recentHistoryCardModel(session) {
        const workoutName = String(session?.title || "").trim() || "Workout";
        const rawCompletedDate = sessionCompletionDate(session);
        const parsedCompletedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawCompletedDate) ? new Date(rawCompletedDate + "T00:00:00") : null;
        const hasValidDate = Boolean(parsedCompletedDate && !Number.isNaN(parsedCompletedDate.getTime()));
        if (!hasValidDate && performanceDebugEnabled && !recentHistoryDataIssueIds.has(session?.id || "unknown")) {
          recentHistoryDataIssueIds.add(session?.id || "unknown");
          console.warn("[CF data] Recent History session has no valid completion date.", { sessionId: session?.id || "unknown" });
        }
        const analysis = session?.workoutAnalysis?.version === 1 ? session.workoutAnalysis : null;
        const supportedGrades = new Set(WORKOUT_GRADE_THRESHOLDS.map((threshold) => threshold.grade));
        const workoutGrade = supportedGrades.has(analysis?.grade) ? analysis.grade : "";
        const fallbackScore = WORKOUT_GRADE_THRESHOLDS.find((threshold) => threshold.grade === workoutGrade)?.minimum;
        const hasStoredScore = analysis?.internalScore != null && analysis.internalScore !== "" && Number.isFinite(Number(analysis.internalScore));
        const gradeScore = hasStoredScore ? Number(analysis.internalScore) : fallbackScore;
        return {
          workoutName,
          completedDate: hasValidDate ? rawCompletedDate : "",
          completedDateLabel: hasValidDate ? formatDate(rawCompletedDate) : "Date unavailable",
          workoutGrade,
          gradeTone: workoutGrade && Number.isFinite(gradeScore) ? workoutGradeScoreTone(gradeScore) : "score-unavailable"
        };
      }
      if (performanceDebugEnabled) window.__CF_TEST__ = { ...(window.__CF_TEST__ || {}), recentHistoryCardModel };

      function renderRecentSessions() {
        const sessions = activeHistorySessions().slice().sort((a, b) => sessionCompletionDate(b).localeCompare(sessionCompletionDate(a))).slice(0, 5);
        if (!sessions.length) return '<div class="empty-state">No saved workouts yet.</div>';
        return '<div class="recent-history-list">' + sessions.map((session) => {
          const record = recentHistoryCardModel(session);
          const dateMarkup = record.completedDate
            ? '<time class="recent-history-date" datetime="' + escapeHtml(record.completedDate) + '">' + escapeHtml(record.completedDateLabel) + '</time>'
            : '<span class="recent-history-date">' + escapeHtml(record.completedDateLabel) + '</span>';
          const gradeLabel = record.workoutGrade ? "workout grade " + record.workoutGrade : "workout grade unavailable";
          const gradeMarkup = record.workoutGrade ? escapeHtml(record.workoutGrade) : "&mdash;";
          const accessibleLabel = "Open " + record.workoutName + ", " + record.completedDateLabel + ", " + gradeLabel;
          return '<button class="recent-history-card" type="button" data-action="open-session" data-session-id="' + escapeHtml(session.id) + '" aria-label="' + escapeHtml(accessibleLabel) + '"><span class="recent-history-title">' + escapeHtml(record.workoutName) + '</span><span class="recent-history-meta">' + dateMarkup + '<span class="recent-history-grade grade-tone ' + record.gradeTone + '" aria-hidden="true">' + gradeMarkup + '</span></span></button>';
        }).join("") + '</div>';
      }

      function renderRecoveryPanel(session) {
        const recovery = sessionRecovery(session);
        const advice = recoveryRecommendationForSession(session);
        return `
          <section class="recovery-panel compact-recovery">
            <div class="row split">
              <h2>Recovery readiness</h2>
              <span class="section-kicker">Today</span>
            </div>
            <div class="recovery-status ${advice.decision}">
              <strong>${escapeHtml(advice.label)}</strong>
              <span>${escapeHtml(advice.action)}</span>
              <span>${escapeHtml(advice.evidence[0])}</span>
            </div>
            <div class="recovery-inputs">
              <label>Sleep hours<input type="number" min="0" max="14" step="0.25" value="${escapeHtml(recovery.sleepHours)}" data-action="recovery-sleep-hours" /></label>
              <label>Sleep quality<select data-action="recovery-sleep-quality"><option value="">-</option>${[1,2,3,4,5].map((value) => '<option value="' + value + '" ' + (String(recovery.sleepQuality) === String(value) ? "selected" : "") + '>' + value + '/5</option>').join("")}</select></label>
              <label>HRV<input type="number" min="0" step="1" value="${escapeHtml(recovery.hrv)}" data-action="recovery-hrv" /></label>
              <label>Resting HR<input type="number" min="0" step="1" value="${escapeHtml(recovery.restingHr)}" data-action="recovery-resting-hr" /></label>
              <label>Soreness<select data-action="recovery-soreness"><option value="">-</option>${[1,2,3,4,5].map((value) => '<option value="' + value + '" ' + (String(recovery.soreness) === String(value) ? "selected" : "") + '>' + value + '/5</option>').join("")}</select></label>
              <label>Nutrition today<select data-action="recovery-nutrition"><option value="" ${recovery.nutritionStatus === '' ? 'selected' : ''}>Not entered</option><option value="on_plan" ${recovery.nutritionStatus === 'on_plan' ? 'selected' : ''}>On plan</option><option value="below_plan" ${recovery.nutritionStatus === 'below_plan' ? 'selected' : ''}>Below planned intake</option><option value="low_energy" ${recovery.nutritionStatus === 'low_energy' ? 'selected' : ''}>Possible low energy availability</option></select></label>
              <label>Protein target<select data-action="recovery-protein"><option value="" ${recovery.proteinStatus === '' ? 'selected' : ''}>Not entered</option><option value="adequate" ${recovery.proteinStatus === 'adequate' ? 'selected' : ''}>Met</option><option value="below_target" ${recovery.proteinStatus === 'below_target' ? 'selected' : ''}>Below target</option></select></label>
              <label class="toggle-line"><input type="checkbox" data-action="recovery-illness" ${recovery.illness ? "checked" : ""} />Current illness</label>
              <label class="toggle-line"><input type="checkbox" data-action="recovery-pain" ${recovery.pain ? "checked" : ""} />Pain or injury affecting training</label>
              <label>Soreness / pain area<select data-action="recovery-affected-muscle"><option value="">Not specified</option>${muscleGroups.map((muscle) => '<option value="' + muscle + '" ' + (recovery.affectedMuscle === muscle ? 'selected' : '') + '>' + muscle + '</option>').join('')}</select></label>
            </div>
            <textarea data-action="recovery-outside-note" placeholder="Outside-band note, if today is meaningfully different" aria-label="Outside readiness band note">${escapeHtml(recovery.outsideBandNote)}</textarea>
          </section>
        `;
      }

      function renderQuickStartTemplates() {
        if (!data.templates.length) return "";
        const templates = data.templates;
        const running = activeWorkoutSession();
        const readinessContext = running || { id: "lift-home", date: todayIso(), recovery: defaultRecovery() };
        const recoveryAdvice = recoveryRecommendationForSession(readinessContext);
        return `
          <div class="quick-template-strip">
            <div class="section-kicker">Start from template</div>
            <div class="quick-template-list">
              ${templates.map((template) => {
                const isActiveTemplate = running?.templateId === template.id;
                const locked = Boolean(running && !isActiveTemplate);
                const advice = running ? null : cachedTemplateAdvice(template, recoveryAdvice, { recovery: sessionRecovery(readinessContext) });
                return `
                  <button class="quick-template-card ${isActiveTemplate ? "active-template" : locked ? "locked-template" : ""}" type="button" data-action="${isActiveTemplate ? "return-active-workout" : "start-template"}" data-template-id="${template.id}" ${locked ? 'disabled title="Finish or cancel your active workout first"' : ''}>
                    <strong>${escapeHtml(template.name)}</strong>
                    <small>${template.exercises.length} lifts · ${advice?.totalSets ?? templateExerciseCount(template)} prescribed sets</small>
                    <span>${isActiveTemplate ? "Resume workout" : locked ? "Start unavailable" : escapeHtml(advice.label)}</span>
                  </button>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }

      function openTemplateStart(templateId) {
        if (!data.templates.some((template) => template.id === templateId)) return;
        captureDialogFocusOrigin("template");
        if (hasActiveWorkout()) {
          templateStartFlow = { templateId, step: "active-conflict", draft: defaultRecovery() };
          render();
          return;
        }
        templateStartFlow = { templateId, step: "confirm", draft: defaultRecovery() };
        render();
      }

      function closeTemplateStart() {
        templateStartFlow = null;
        restoreFocusAfterDialog("template");
        render();
      }

      function patchTemplateStartDraft(patch, shouldRender = true) {
        if (!templateStartFlow) return;
        templateStartFlow = { ...templateStartFlow, draft: cleanRecovery({ ...templateStartFlow.draft, ...patch }) };
        if (shouldRender) render();
      }

      function renderTemplateStartSheet() {
        if (!templateStartFlow) return "";
        const template = data.templates.find((item) => item.id === templateStartFlow.templateId);
        if (!template) return "";
        if (templateStartFlow.step === "active-conflict") {
          const active = activeWorkoutSession();
          return `
            <div class="sheet-backdrop" data-action="cancel-template-start" role="presentation">
              <section class="bottom-sheet dialog-sheet" role="dialog" aria-modal="true" aria-labelledby="active-workout-title" data-sheet-content>
                <button class="sheet-close" type="button" data-action="cancel-template-start" aria-label="Close workout dialog">&times;</button>
                <div><div class="section-kicker">Workout in progress</div><h2 id="active-workout-title">You already have an active workout.</h2><p>${escapeHtml(active?.title || "Your current workout")} must be submitted or explicitly canceled before another template can begin.</p></div>
                <div class="sheet-actions stacked">
                  <button class="primary-action" type="button" data-action="return-active-workout">Return to Active Workout</button>
                  <button class="danger-button" type="button" data-action="request-cancel-workout-from-template">Cancel Current Workout</button>
                  <button class="mini-button" type="button" data-action="cancel-template-start">Keep browsing templates</button>
                </div>
              </section>
            </div>`;
        }
        if (templateStartFlow.step === "confirm") {
          return `
            <div class="sheet-backdrop" data-action="cancel-template-start" role="presentation">
              <section class="bottom-sheet dialog-sheet" role="dialog" aria-modal="true" aria-labelledby="template-start-title" data-sheet-content>
                <button class="sheet-close" type="button" data-action="cancel-template-start" aria-label="Close template setup">&times;</button>
                <h2 id="template-start-title">Start ${escapeHtml(template.name)}?</h2>
                <p>This will prepare today’s targets from your workout history. Your current workout will not change until you continue through readiness.</p>
                <div class="sheet-actions">
                  <button type="button" data-action="cancel-template-start">Cancel</button>
                  <button class="primary-action" type="button" data-action="continue-template-start">Continue</button>
                </div>
              </section>
            </div>
          `;
        }
        if (templateStartFlow.step === "readiness") {
          return `
            <div class="sheet-backdrop" data-action="cancel-template-start" role="presentation">
              <section class="bottom-sheet dialog-sheet" role="dialog" aria-modal="true" aria-labelledby="readiness-choice-title" data-sheet-content>
                <button class="sheet-close" type="button" data-action="cancel-template-start" aria-label="Close readiness setup">&times;</button>
                <h2 id="readiness-choice-title">Use your usual readiness?</h2>
                <p>Your saved baseline will be used unless you enter today’s objective or observable metrics.</p>
                <div class="sheet-actions stacked">
                  <button class="primary-action" type="button" data-action="use-usual-readiness">Use usual readiness</button>
                  <button type="button" data-action="log-today-readiness">Log today’s metrics</button>
                  <button class="mini-button" type="button" data-action="cancel-template-start">Cancel</button>
                </div>
              </section>
            </div>
          `;
        }
        const recovery = templateStartFlow.draft;
        const preview = recoveryRecommendationForSession({ id: "readiness-preview", date: todayIso(), recovery });
        if (templateStartFlow.step === "review") {
          const changes = templateReadinessPreview(template, recovery);
          const changed = changes.filter((item) => item.changed);
          const unchanged = changes.filter((item) => !item.changed);
          return `
            <div class="sheet-backdrop" data-action="cancel-template-start" role="presentation">
              <section class="bottom-sheet dialog-sheet readiness-review-sheet" role="dialog" aria-modal="true" aria-labelledby="readiness-review-title" data-sheet-content>
                <button class="sheet-close" type="button" data-action="cancel-template-start" aria-label="Close readiness review">&times;</button>
                <div><div class="section-kicker">Before training</div><h2 id="readiness-review-title">Todayâ€™s Readiness Adjustments</h2><p>${escapeHtml(preview.label)}. Every change below is tied only to a marker you entered.</p></div>
                <div class="readiness-change-list">${changed.length ? changed.map(renderReadableReadinessChange).join("") : '<div class="readiness-unchanged"><strong>No target changes</strong><span>Your entered markers remain within the normal band for this plan.</span></div>'}</div>
                ${unchanged.length ? '<details class="compact-disclosure"><summary>Exercises unchanged <span>' + unchanged.length + '</span></summary><div class="disclosure-body readiness-unchanged-list">' + unchanged.map((item) => '<div><strong>' + escapeHtml(item.name) + '</strong><span>' + escapeHtml(prescriptionLine(item.original)) + '</span></div>').join('') + '</div></details>' : ''}
                <div class="sheet-actions stacked">
                  <button class="primary-action" type="button" data-action="start-adjusted-workout">Start Adjusted Workout</button>
                  ${changed.length && !recovery.illness && !recovery.pain ? '<button type="button" data-action="start-original-workout">Use Original Targets</button>' : ''}
                  <button class="mini-button" type="button" data-action="edit-readiness-metrics">Review Changes</button>
                  <button class="mini-button" type="button" data-action="cancel-template-start">Cancel</button>
                </div>
              </section>
            </div>`;
        }
        return `
          <div class="sheet-backdrop" data-action="cancel-template-start" role="presentation">
            <section class="bottom-sheet dialog-sheet" role="dialog" aria-modal="true" aria-labelledby="daily-readiness-title" data-sheet-content>
              <button class="sheet-close" type="button" data-action="cancel-template-start" aria-label="Close daily readiness">&times;</button>
              <div><h2 id="daily-readiness-title">Today’s readiness</h2><p>${formatDate(todayIso())} · ${escapeHtml(preview.label)}. ${escapeHtml(preview.action)}</p></div>
              <div class="readiness-draft">
                <div class="recovery-inputs">
                  <label>Sleep hours<input type="number" min="0" max="14" step="0.25" value="${escapeHtml(recovery.sleepHours)}" data-action="template-readiness-sleep-hours" /></label>
                  <label>Sleep quality<select data-action="template-readiness-sleep-quality"><option value="">-</option>${[1,2,3,4,5].map((value) => '<option value="' + value + '" ' + (String(recovery.sleepQuality) === String(value) ? "selected" : "") + '>' + value + '/5</option>').join("")}</select></label>
                  <label>HRV<input type="number" min="0" step="1" value="${escapeHtml(recovery.hrv)}" data-action="template-readiness-hrv" /></label>
                  <label>Resting heart rate<input type="number" min="0" step="1" value="${escapeHtml(recovery.restingHr)}" data-action="template-readiness-resting-hr" /></label>
                  <label>Soreness<select data-action="template-readiness-soreness"><option value="">-</option>${[1,2,3,4,5].map((value) => '<option value="' + value + '" ' + (String(recovery.soreness) === String(value) ? "selected" : "") + '>' + value + '/5</option>').join("")}</select></label>
                  <label>Nutrition today<select data-action="template-readiness-nutrition"><option value="" ${recovery.nutritionStatus === '' ? 'selected' : ''}>Not entered</option><option value="on_plan" ${recovery.nutritionStatus === 'on_plan' ? 'selected' : ''}>On plan</option><option value="below_plan" ${recovery.nutritionStatus === 'below_plan' ? 'selected' : ''}>Below planned intake</option><option value="low_energy" ${recovery.nutritionStatus === 'low_energy' ? 'selected' : ''}>Possible low energy availability</option></select></label>
                  <label>Protein target<select data-action="template-readiness-protein"><option value="" ${recovery.proteinStatus === '' ? 'selected' : ''}>Not entered</option><option value="adequate" ${recovery.proteinStatus === 'adequate' ? 'selected' : ''}>Met</option><option value="below_target" ${recovery.proteinStatus === 'below_target' ? 'selected' : ''}>Below target</option></select></label>
                  <label class="toggle-line"><input type="checkbox" data-action="template-readiness-illness" ${recovery.illness ? "checked" : ""} />Current illness</label>
                  <label class="toggle-line"><input type="checkbox" data-action="template-readiness-pain" ${recovery.pain ? "checked" : ""} />Pain or injury affecting training</label>
                  <label>Affected area<select data-action="template-readiness-affected-muscle"><option value="">Not specified</option>${muscleGroups.map((muscle) => '<option value="' + muscle + '" ' + (recovery.affectedMuscle === muscle ? 'selected' : '') + '>' + muscle + '</option>').join('')}</select></label>
                </div>
                <textarea data-action="template-readiness-note" placeholder="Optional note if something is outside your normal band" aria-label="Optional outside-normal-band note">${escapeHtml(recovery.outsideBandNote)}</textarea>
              </div>
              <div class="sheet-actions">
                <button type="button" data-action="cancel-template-start">Cancel</button>
                <button class="primary-action" type="button" data-action="review-template-readiness">Review changes</button>
              </div>
            </section>
          </div>
        `;
      }

      function prescriptionLine(target) {
        return target.sets + " set" + (Number(target.sets) === 1 ? "" : "s") + " · " + formatResistance(target) + " × " + target.reps + " reps @ RPE " + target.rpe + (target.restSeconds ? " · " + target.restSeconds + "s rest" : "");
      }

      function renderReadinessChange(item) {
        return '<article class="readiness-change-card"><h3>' + escapeHtml(item.name) + '</h3><div class="readiness-comparison"><div><span>Original recommendation</span><strong>' + escapeHtml(prescriptionLine(item.original)) + '</strong></div><div class="today"><span>Todayâ€™s readiness</span><strong>' + escapeHtml(prescriptionLine(item.adjusted)) + '</strong></div></div><div class="readiness-why"><strong>Why this changed</strong><span>' + escapeHtml(item.reason) + '</span><small>Triggered by: ' + escapeHtml(item.triggers.join('; ')) + '</small></div></article>';
      }

      function renderReadableReadinessChange(item) {
        return '<article class="readiness-change-card"><h3>' + escapeHtml(item.name) + '</h3><div class="readiness-comparison"><div><span>Original recommendation</span><strong>' + escapeHtml(readablePrescriptionLine(item.original)) + '</strong></div><div class="today"><span>Today\'s readiness</span><strong>' + escapeHtml(readablePrescriptionLine(item.adjusted)) + '</strong></div></div><div class="readiness-why"><strong>Why this changed</strong><span>' + escapeHtml(item.reason) + '</span><small>Triggered by: ' + escapeHtml(item.triggers.join('; ')) + '</small></div></article>';
      }

      function requestCancelWorkout(source = "workout", requestedSessionId = "") {
        const requestedSession = data.sessions.find((item) => item.id === requestedSessionId);
        const session = sessionCanBeDiscarded(requestedSession)
          ? requestedSession
          : source === "template"
            ? activeWorkoutSession()
            : sessionCanBeDiscarded(activeSession()) ? activeSession() : activeWorkoutSession();
        if (!sessionCanBeDiscarded(session)) return;
        dialogFocusOrigins.cancel = source === "template"
          ? dialogFocusOrigins.template || focusDescriptorForElement(document.activeElement) || { kind: "main" }
          : focusDescriptorForElement(document.activeElement) || { kind: "main" };
        if (source === "template") dialogFocusOrigins.template = null;
        cancelWorkoutFlow = { sessionId: session.id, source };
        templateStartFlow = null;
        render();
      }

      function renderCancelWorkoutSheet() {
        if (!cancelWorkoutFlow) return "";
        const session = data.sessions.find((item) => item.id === cancelWorkoutFlow.sessionId);
        if (!session || isSessionSubmitted(session)) return "";
        return `
          <div class="sheet-backdrop" data-action="keep-workout" role="presentation">
            <section class="bottom-sheet dialog-sheet destructive-sheet" role="dialog" aria-modal="true" aria-labelledby="cancel-workout-title" data-sheet-content>
              <div class="cancel-hero"><span class="cancel-visual" aria-hidden="true">!</span><div><div class="section-kicker">Active session</div><h2 id="cancel-workout-title">Cancel this workout?</h2><p>Your unsaved sets, notes, timer state, and session progress will be discarded. This workout will not be added to your completed history.</p></div></div>
              <div class="cancel-impact"><div><b aria-hidden="true">-</b><div><strong>Only this draft is removed</strong><span>The workout timer, rest timer, scheduled alert, notes, and unsaved set entries will be cleared.</span></div></div><div><b aria-hidden="true">&#10003;</b><div><strong>Your history remains intact</strong><span>Submitted workouts, templates, personal records, charts, and settings stay unchanged.</span></div></div></div>
              <div class="sheet-actions cancel-sheet-actions">
                <button class="primary-action" type="button" data-action="keep-workout">Keep Workout</button>
                <button class="discard-workout-button" type="button" data-action="confirm-cancel-workout">Discard Workout</button>
              </div>
            </section>
          </div>`;
      }

      function closeCancelWorkout() {
        cancelWorkoutFlow = null;
        restoreFocusAfterDialog("cancel");
        render();
      }

      async function beginHistoryEdit() {
        if (historyEditStartPending || historyEditFlow) return false;
        const session = activeSession();
        if (!isSessionSubmitted(session)) return false;
        const editStartContext = {
          dataRevision: Number(data.dataRevision || 0),
          activeTab,
          activeSessionId,
          viewingHistorySessionId,
          sessionId: session.id
        };
        historyEditStartPending = true;
        let shouldRender = false;
        try {
          cancelPendingDataSave();
          const stableData = cloneAppData(data);
          const persisted = await persistStableAppDataSnapshot(stableData);
          const editContextChanged = Number(data.dataRevision || 0) !== editStartContext.dataRevision
            || activeTab !== editStartContext.activeTab
            || activeSessionId !== editStartContext.activeSessionId
            || viewingHistorySessionId !== editStartContext.viewingHistorySessionId
            || activeSession()?.id !== editStartContext.sessionId;
          if (editContextChanged) {
            const currentStableData = cloneAppData(data);
            const currentRevision = Number(data.dataRevision || 0);
            const currentPersisted = await persistStableAppDataSnapshot(currentStableData);
            const currentSnapshotStillCurrent = Number(data.dataRevision || 0) === currentRevision;
            if (currentPersisted && currentSnapshotStillCurrent) {
              showAppToast("The app changed while history editing was opening. Your current changes were saved; choose Edit History to try again.");
            } else {
              settingsMessage = "Current changes are not durable. Export a backup and retry saving before reloading.";
              showAppToast("History editing stayed closed because your current changes are not durable. Export a backup and retry saving before reloading.");
            }
            shouldRender = true;
            return false;
          }
          if (!persisted) {
            showAppToast("History editing could not start because the current app state could not be saved.");
            shouldRender = true;
            return false;
          }
          if (!isSessionSubmitted(activeSession())) return false;
          historyEditFlow = { sessionId: session.id, originalData: stableData, dirty: false };
          historyEditConfirm = "";
          shouldRender = true;
          return true;
        } catch {
          settingsMessage = "Current changes are not durable. Export a backup and retry saving before reloading.";
          showAppToast("History editing stayed closed because the current app state is not durable. Export a backup and retry saving before reloading.");
          shouldRender = true;
          return false;
        } finally {
          historyEditStartPending = false;
          if (shouldRender) render();
        }
      }

      function requestHistoryEditConfirmation(type, options = {}) {
        if (!isEditingHistorySession()) return;
        if (!options.preserveOrigin || !dialogFocusOrigins.history) captureDialogFocusOrigin("history");
        historyEditConfirm = type === "save" ? "save" : "cancel";
        render();
      }

      function renderHistoryEditConfirmSheet() {
        if (!historyEditConfirm || !isEditingHistorySession()) return "";
        const saving = historyEditConfirm === "save";
        return `
          <div class="sheet-backdrop" data-action="keep-history-editing" role="presentation">
            <section class="bottom-sheet dialog-sheet ${saving ? "" : "destructive-sheet"}" role="dialog" aria-modal="true" aria-labelledby="history-edit-confirm-title" data-sheet-content>
              <button class="sheet-close" type="button" data-action="keep-history-editing" aria-label="Close edit confirmation">&times;</button>
              <div class="cancel-hero ${saving ? "save" : ""}"><span class="cancel-visual" aria-hidden="true">${saving ? "&#10003;" : "!"}</span><div><div class="section-kicker">Logged workout</div><h2 id="history-edit-confirm-title">${saving ? "Save these history edits?" : "Cancel these edits?"}</h2><p>${saving ? "The revised workout will replace the saved version and recalculate charts, volume, fatigue, and coaching history." : "The original logged workout will be restored. None of the temporary changes will be saved."}</p></div></div>
              <div class="sheet-actions stacked">
                <button class="primary-action" type="button" data-action="keep-history-editing">Keep Editing</button>
                <button class="${saving ? "secondary-action" : "danger-button"}" type="button" data-action="${saving ? "confirm-save-history-edits" : "confirm-cancel-history-edits"}">${saving ? "Save Edits" : "Discard Edits"}</button>
              </div>
            </section>
          </div>`;
      }

      function closeHistoryEditConfirmation() {
        historyEditConfirm = "";
        restoreFocusAfterDialog("history");
        render();
      }

      function liftHomeSession() {
        const running = activeWorkoutSession();
        if (running) return running;
        const emptyDraft = data.sessions.find((session) => !isSessionSubmitted(session) && !session.workoutStarted && !session.templateId && !session.startedAt && !data.exercises.some((exercise) => exercise.sessionId === session.id));
        if (emptyDraft) return emptyDraft;
        const session = createSession();
        data = { ...data, sessions: [session, ...data.sessions] };
        return session;
      }

      function returnToLiftHome(message = "") {
        const home = liftHomeSession();
        activeSessionId = home.id;
        viewingHistorySessionId = "";
        pendingSubmitSessionId = "";
        completedSummarySessionId = "";
        historyEditConfirm = "";
        hypertrophyScoreExpanded = false;
        setActiveTab("lift", { replace: true, renderNow: false });
        saveData();
        if (message) showAppToast(message);
        render();
      }

      function saveHistoryEdits() {
        if (!isEditingHistorySession()) return;
        const sessionId = historyEditFlow.sessionId;
        const session = data.sessions.find((item) => item.id === sessionId);
        const prs = session ? submitWorkoutPrs(session) : [];
        const updatedSession = session ? { ...session, completedAt: session.date, prs, updatedAt: isoNow() } : null;
        const workoutAnalysis = updatedSession ? calculateWorkoutAnalysis(updatedSession, { prs }) : null;
        data = { ...data, sessions: data.sessions.map((item) => item.id === sessionId ? { ...updatedSession, workoutAnalysis } : item) };
        invalidateCompletedAnalysis();
        historyEditFlow = null;
        returnToLiftHome("History edits saved and workout grade recalculated.");
      }

      function cancelHistoryEdits() {
        if (!isEditingHistorySession()) return;
        data = historyEditFlow.originalData;
        entityStructureRevision += 1;
        entityIndexCache = null;
        invalidateCompletedAnalysis();
        historyEditFlow = null;
        applyTheme();
        returnToLiftHome("History edits canceled.");
      }

      function showAppToast(message) {
        appToast = message;
        window.setTimeout(() => {
          if (appToast !== message) return;
          appToast = "";
          render();
        }, 2800);
      }

      async function removeWorkoutFromSyncQueue(sessionId) {
        try {
          const queue = await readIndexedValue("sync-queue") || [];
          await writeIndexedValue("sync-queue", queue.filter((item) => item.sessionId !== sessionId));
        } catch {
          return;
        }
      }

      async function discardActiveWorkout() {
        const session = data.sessions.find((item) => item.id === cancelWorkoutFlow?.sessionId);
        if (!sessionCanBeDiscarded(session)) return;
        window.clearTimeout(saveTimer);
        const exerciseIds = new Set(data.exercises.filter((exercise) => exercise.sessionId === session.id).map((exercise) => exercise.id));
        if (timer && (timer.workoutId === session.id || exerciseIds.has(timer.exerciseId))) {
          const previousTimer = { ...timer };
          window.clearInterval(timerInterval);
          timerInterval = 0;
          releaseTimerWakeLock();
          timer = null;
          cancelRestPush(previousTimer, "workout-canceled");
        }
        await removeWorkoutFromSyncQueue(session.id);
        const discardedActiveWorkout = activeWorkoutId === session.id;
        if (discardedActiveWorkout) {
          activeWorkoutId = "";
          activeSetId = "";
          pendingNextSetId = "";
          activeSetAcknowledged = false;
          activeSetNotice = "";
          timerCompleteNotice = null;
          if (restNavigationState?.workoutId === session.id) restNavigationState = { ...restNavigationState, status: "canceled", updatedAt: isoNow() };
          clearActiveWorkoutDraft();
        }
        addExerciseDraft = "";
        addExercisePrimaryMuscle = "";
        addExerciseSecondaryMuscle = "";
        pendingSubmitSessionId = "";
        completedSummarySessionId = "";
        cancelWorkoutFlow = null;
        const remainingSessions = data.sessions.filter((item) => item.id !== session.id);
        let nextSession = remainingSessions.find((item) => item.id === activeWorkoutId)
          || remainingSessions.filter((item) => !isSessionSubmitted(item) && !data.exercises.some((exercise) => exercise.sessionId === item.id)).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0]
          || activeHistorySessions().filter((item) => item.id !== session.id).sort((a, b) => sessionCompletionDate(b).localeCompare(sessionCompletionDate(a)))[0];
        if (!nextSession) {
          nextSession = createSession();
          remainingSessions.unshift(nextSession);
        }
        activeSessionId = nextSession.id;
        setActiveTab("lift", { replace: true, renderNow: false });
        showAppToast("Workout canceled.");
        commit({ ...data, sessions: remainingSessions, exercises: data.exercises.filter((exercise) => exercise.sessionId !== session.id), sets: data.sets.filter((set) => !exerciseIds.has(set.exerciseId)) });
      }

      function renderActiveWorkoutAdvice() {
        const session = activeSession();
        if (!session?.templateId) return "";
        const snapshots = activeExercises().map((exercise) => exercise.recommendationSnapshot).filter(Boolean);
        const adjusted = snapshots.filter((snapshot) => snapshot.finalPrescription.readinessAdjustment?.changed);
        const type = ["full_program_deload", "muscle_group_deload", "exercise_deload", "rotate_exercise", "substitute", "light_session", "reduce_volume", "progress", "hold", "normal"].find((candidate) => snapshots.some((snapshot) => snapshot.finalPrescription.recommendationType === candidate)) || "normal";
        const items = activeExercises().map((exercise) => {
          const prescription = exercise.prescription || {};
          return { name: exercise.name, text: prescription.text || targetText(prescription, prescription.reason || "Use the saved target for this workout.") };
        });
        const detail = [adjusted.length ? `${adjusted.length} readiness adjustment${adjusted.length === 1 ? " is" : "s are"} temporary and do not alter the mesocycle.` : "No temporary readiness change was applied.", "This workout uses the versioned prescriptions saved when the session started; editing a set records an override and does not recalculate the full training history."].join(" ");
        return renderWorkoutAdvice({ label: recommendationLabel(type), detail, items });
      }

      function safetySubstituteContext(snapshot, options = {}) {
        const research = prescriptionEngine?.evidence?.research;
        const prescription = snapshot?.finalPrescription;
        const restriction = prescription?.safetyRestriction || null;
        const empty = (reason = "missing_safety_context", message = "The safety-substitute context is incomplete.") => ({
          allowedSafetySubstituteIds: [],
          exerciseCatalog: [],
          availableEquipment: [],
          excludedExerciseIds: [],
          preferred: null,
          resolvedValidation: { valid: false, reason, message }
        });
        if (!research?.substitutionsByExercise || !research?.exerciseById || !prescription || !restriction) return empty();

        const exercise = options.exercise || null;
        const session = options.session || (exercise?.sessionId ? sessionById(exercise.sessionId) : null);
        const referencedMesocycleId = session?.mesocycleId || snapshot.mesocycleId || "";
        const mesocycle = referencedMesocycleId ? data.mesocycles.find((item) => item.id === referencedMesocycleId) || null : null;
        const mesocycleReferenceValid = !referencedMesocycleId || Boolean(mesocycle);
        const constraints = mesocycle?.constraints || {};
        const mesocycleEquipmentSource = Object.prototype.hasOwnProperty.call(mesocycle || {}, "availableEquipment")
          ? mesocycle.availableEquipment
          : Object.prototype.hasOwnProperty.call(constraints, "availableEquipment")
            ? constraints.availableEquipment
            : undefined;
        const normalizeEquipment = (source) => Array.isArray(source)
          ? Array.from(new Set(source.map((item) => String(item || "").trim()).filter(Boolean)))
          : [];
        const currentEquipmentSource = data.settings.availableEquipment;
        const currentEquipment = Array.isArray(currentEquipmentSource) && currentEquipmentSource.length === 0
          ? ["all"]
          : normalizeEquipment(currentEquipmentSource);
        const mesocycleEquipment = mesocycleEquipmentSource === undefined ? null : normalizeEquipment(mesocycleEquipmentSource);
        const configuredEquipment = mesocycleEquipment === null
          ? currentEquipment
          : currentEquipment.includes("all")
            ? mesocycleEquipment
            : mesocycleEquipment.includes("all")
              ? currentEquipment
              : currentEquipment.filter((item) => mesocycleEquipment.includes(item));
        const equipmentInputValid = configuredEquipment.length > 0;
        const excludedExerciseIds = new Set([
          ...(Array.isArray(data.settings.excludedExerciseIds) ? data.settings.excludedExerciseIds : []),
          ...(Array.isArray(mesocycle?.excludedExerciseIds) ? mesocycle.excludedExerciseIds : []),
          ...(Array.isArray(constraints.excludedExerciseIds) ? constraints.excludedExerciseIds : [])
        ].map((item) => String(item || "").trim()).filter(Boolean));
        const scopedMuscleIds = Object.prototype.hasOwnProperty.call(mesocycle || {}, "includedMuscleGroupIds")
          ? mesocycle.includedMuscleGroupIds
          : Object.prototype.hasOwnProperty.call(constraints, "includedMuscleGroupIds") ? constraints.includedMuscleGroupIds : undefined;
        const muscleGroupId = normalizePrescriptionIdentity(snapshot.muscleGroupId || prescription.muscleGroupId || "");
        const scopeValid = scopedMuscleIds === undefined || (Array.isArray(scopedMuscleIds)
          && scopedMuscleIds.length > 0
          && scopedMuscleIds.some((item) => normalizePrescriptionIdentity(item) === muscleGroupId));

        const originalExerciseId = restriction.originalExerciseId
          || restriction.auditBaseTargets?.exerciseId
          || snapshot.basePrescription?.exerciseId
          || prescription.exerciseId;
        const originalResearchExerciseId = restriction.auditBaseTargets?.researchExerciseId
          || snapshot.basePrescription?.researchExerciseId
          || (research.exerciseById.has(originalExerciseId) ? originalExerciseId : "")
          || originalExerciseId;
        const substitutionRows = research.substitutionsByExercise.get(originalResearchExerciseId) || [];
        const mappedIds = Array.from(new Set(substitutionRows.map((item) => item.substitute_exercise_id || item.substituteExerciseId).filter(Boolean)));
        const originalIds = new Set([originalExerciseId, originalResearchExerciseId, restriction.auditBaseTargets?.exerciseId, restriction.auditBaseTargets?.researchExerciseId, snapshot.basePrescription?.exerciseId, snapshot.basePrescription?.researchExerciseId].filter(Boolean));
        let rankedById = new Map();
        if (mesocycleReferenceValid && equipmentInputValid && scopeValid && muscleGroupId) {
          try {
            const ranked = prescriptionEngine.rankExercisePool(muscleGroupId, {
              availableEquipment: configuredEquipment,
              excludedExerciseIds: Array.from(excludedExerciseIds),
              mesocycleType: mesocycle?.type,
              maxCandidates: 100
            });
            rankedById = new Map((ranked.candidates || []).map((candidate) => [candidate.exerciseId, candidate]));
          } catch { /* Invalid or incompatible current constraints fail closed below. */ }
        }
        const resolvedSubstituteId = restriction.substituteResearchExerciseId || restriction.substituteExerciseId || "";
        const resolved = restriction.status === "resolved_by_confirmed_substitute" && restriction.painFreeConfirmed === true;
        const eligibleSafetySubstituteIds = mappedIds.filter((exerciseId) => (
          research.exerciseById.has(exerciseId)
          && !originalIds.has(exerciseId)
          && !excludedExerciseIds.has(exerciseId)
          && rankedById.has(exerciseId)
        ));
        const allowedSafetySubstituteIds = resolved
          ? eligibleSafetySubstituteIds.filter((exerciseId) => exerciseId !== resolvedSubstituteId)
          : eligibleSafetySubstituteIds;
        const exerciseCatalog = allowedSafetySubstituteIds.map((exerciseId) => research.exerciseById.get(exerciseId)).filter(Boolean);
        const preferredId = allowedSafetySubstituteIds.includes(prescription.preferredReplacementExerciseId)
          ? prescription.preferredReplacementExerciseId
          : allowedSafetySubstituteIds[0] || "";
        const preferredRecord = preferredId ? research.exerciseById.get(preferredId) : null;

        const observedExerciseId = exercise?.name ? prescriptionExerciseIdentity(exercise.name) || "" : "";
        const declaredResolvedIds = [
          restriction.substituteExerciseId,
          restriction.substituteResearchExerciseId,
          prescription.exerciseId,
          prescription.researchExerciseId
        ].filter(Boolean).map((exerciseId) => {
          if (research.exerciseById.has(exerciseId)) return exerciseId;
          const reconciled = prescriptionEngine?.evidence?.personal?.reconciledIdentityByExerciseId?.get(exerciseId);
          return reconciled?.invalid ? "" : reconciled?.researchExerciseId || exerciseId;
        });
        const observedIdentityCoherent = !exercise
          || (Boolean(observedExerciseId) && observedExerciseId === resolvedSubstituteId);
        const identityCoherent = Boolean(resolvedSubstituteId)
          && declaredResolvedIds.length > 0
          && declaredResolvedIds.every((exerciseId) => exerciseId === resolvedSubstituteId)
          && observedIdentityCoherent
          && research.exerciseById.has(resolvedSubstituteId)
          && !originalIds.has(resolvedSubstituteId);
        let resolvedValidation = { valid: false, reason: "unresolved_safety_restriction", message: "The painful original exercise remains blocked until a distinct pain-free substitute is confirmed." };
        if (resolved) {
          if (!mesocycleReferenceValid) resolvedValidation = { valid: false, reason: "missing_mesocycle_context", message: "The saved substitute cannot be revalidated because its workout mesocycle no longer exists." };
          else if (!identityCoherent) resolvedValidation = { valid: false, reason: "substitute_identity_drift", message: "The confirmed substitute no longer retains one coherent current catalog identity." };
          else if (excludedExerciseIds.has(resolvedSubstituteId)) resolvedValidation = { valid: false, reason: "substitute_excluded", message: "The confirmed substitute is now excluded from this workout." };
          else if (!equipmentInputValid || !rankedById.has(resolvedSubstituteId)) resolvedValidation = { valid: false, reason: "unavailable_equipment", message: "The confirmed substitute is not compatible with the currently available equipment." };
          else if (!scopeValid) resolvedValidation = { valid: false, reason: "substitute_out_of_scope", message: "The confirmed substitute no longer satisfies the current mesocycle muscle scope." };
          else if (!mappedIds.includes(resolvedSubstituteId) || !eligibleSafetySubstituteIds.includes(resolvedSubstituteId)) resolvedValidation = { valid: false, reason: "substitute_not_allowed", message: "The confirmed substitute is no longer a valid evidence-linked alternative for the painful original exercise." };
          else resolvedValidation = { valid: true, reason: "confirmed_pain_free_substitute", message: "The confirmed substitute still satisfies current identity, equipment, exclusion, and program constraints." };
        }
        return {
          originalExerciseId,
          originalResearchExerciseId,
          allowedSafetySubstituteIds,
          exerciseCatalog,
          availableEquipment: configuredEquipment,
          excludedExerciseIds: Array.from(excludedExerciseIds),
          preferred: preferredRecord ? { exerciseId: preferredId, researchExerciseId: preferredId, exerciseName: preferredRecord.exercise_name } : null,
          resolvedValidation
        };
      }

      function renderPrescriptionOverrideControls(exercise, precomputedSafetyContext = null) {
        const snapshot = exercise.recommendationSnapshot;
        if (!snapshot || exercise.sessionId !== activeWorkoutId || isSessionSubmitted(activeSession())) return "";
        const prescription = snapshot.finalPrescription;
        const restriction = prescription.safetyRestriction || null;
        const hasSafetyRestriction = restriction?.status === "blocked" || restriction?.status === "resolved_by_confirmed_substitute";
        const currentSafetyContext = hasSafetyRestriction
          ? precomputedSafetyContext || safetySubstituteContext(snapshot, { exercise, session: sessionById(exercise.sessionId) })
          : null;
        const safetyLocked = prescription.executionBlocked === true
          || restriction?.status === "blocked"
          || (restriction?.status === "resolved_by_confirmed_substitute" && currentSafetyContext?.resolvedValidation?.valid !== true);
        const safetyContext = safetyLocked ? currentSafetyContext : null;
        const safetyListId = `safety-substitutes-${exercise.id}`;
        const safetyOptions = safetyContext?.exerciseCatalog.map((item) => `<option value="${escapeHtml(item.exercise_name)}"></option>`).join("") || "";
        const safetyNote = restriction?.status === "resolved_by_confirmed_substitute"
          ? "The previously confirmed substitute no longer satisfies current identity, equipment, exclusion, or program constraints. Choose a different current catalog-backed substitute and confirm it is pain-free before continuing."
          : "The original exercise remains blocked. Only a distinct, catalog-backed substitute allowed by the current equipment and exclusion settings can become executable after you explicitly confirm it is pain-free.";
        return `
          <details class="compact-disclosure prescription-override" data-override-form="${exercise.id}">
            <summary>${safetyLocked ? "Choose a pain-free substitute" : "Override this prescription"} <span>${safetyLocked ? 'Confirmation required' : snapshot.overrideLocked ? 'Locked for workout' : 'Optional'}</span></summary>
            <div class="disclosure-body">
              <p class="settings-note">${safetyLocked ? safetyNote : "Overrides are saved with the original recommendation and will not be undone during this workout. Later outcomes are used to evaluate the choice."}</p>
              <div class="override-grid">
                <label>Replacement exercise<input data-override-field="exercise" ${safetyLocked ? `list="${safetyListId}"` : ""} placeholder="${safetyLocked && safetyContext?.preferred ? escapeHtml(safetyContext.preferred.exerciseName) : `Keep ${escapeHtml(exercise.name)}`}" /></label>
                ${safetyLocked ? `<datalist id="${safetyListId}">${safetyOptions}</datalist><label class="toggle-line override-reason"><input type="checkbox" data-override-field="pain-free-confirmed" />I explicitly confirm this substitute is pain-free for today</label>` : ""}
                <label>Working sets<input type="number" min="1" max="12" value="${prescription.workingSets.target}" data-override-field="sets" /></label>
                <label>Rep minimum<input type="number" min="1" max="50" value="${prescription.repRange.min}" data-override-field="rep-min" /></label>
                <label>Rep maximum<input type="number" min="1" max="50" value="${prescription.repRange.max}" data-override-field="rep-max" /></label>
                <label>Load${prescription.prescribedLoad?.target ? '<input type="number" min="0" step="0.5" value="' + Number(prescription.prescribedLoad.target) + '" data-override-field="load" />' : '<input type="number" min="0" step="0.5" placeholder="No load target" data-override-field="load" />'}</label>
                <label>Set structure<select data-override-field="structure">${prescriptionApi.SET_STRUCTURES.map((structure) => '<option value="' + structure + '" ' + (structure === prescription.setStructure ? 'selected' : '') + '>' + structure.replaceAll('_', ' ') + '</option>').join('')}</select></label>
                <label>Deload decision<select data-override-field="deload"><option value="engine">Use engine decision</option><option value="normal">Override: no deload</option><option value="exercise_deload">Exercise deload</option><option value="muscle_group_deload">Muscle-group deload</option><option value="full_program_deload">Full-program deload</option></select></label>
                <label>Rotation decision<select data-override-field="rotation"><option value="engine">Use engine decision</option><option value="hold">Keep exercise</option><option value="rotate_exercise">Rotate next block</option><option value="substitute">Substitute now</option></select></label>
                <label>Mesocycle<select data-override-field="mesocycle"><option value="">Keep current</option>${data.mesocycles.map((mesocycle) => '<option value="' + mesocycle.id + '" ' + (snapshot.mesocycleId === mesocycle.id ? 'selected' : '') + '>' + escapeHtml(mesocycle.name + ' · ' + mesocycle.status) + '</option>').join('')}</select></label>
                <label class="override-reason">Reason<input data-override-field="reason" placeholder="Why are you changing it?" /></label>
              </div>
              <button class="primary-action" type="button" data-action="apply-prescription-override" data-exercise-id="${exercise.id}">Apply and log override</button>
            </div>
          </details>
        `;
      }

      function renderExercise(exercise) {
        const exerciseSets = setsForExercise(exercise.id);
        const restriction = exercise.safetyRestriction || exercise.finalPrescription?.safetyRestriction || exercise.recommendationSnapshot?.finalPrescription?.safetyRestriction || null;
        const resolvedSafetyContext = restriction?.status === "resolved_by_confirmed_substitute" && exercise.recommendationSnapshot
          ? safetySubstituteContext(exercise.recommendationSnapshot, { exercise, session: sessionById(exercise.sessionId) })
          : null;
        const substituteValidation = resolvedSafetyContext?.resolvedValidation;
        const addSetSafety = guardWorkoutMutation("add-set", { exercise, substituteValidation }, false);
        const addWarmupSafety = guardWorkoutMutation("add-warmup-set", { exercise, substituteValidation }, false);
        const duplicateSetSafety = guardWorkoutMutation("duplicate-set", { exercise, substituteValidation }, false);
        const substituteRecoveryHtml = restriction?.status === "resolved_by_confirmed_substitute" && substituteValidation?.valid !== true
          ? `<div class="program-warning blocking" data-safety-substitute-recovery="${exercise.id}" role="alert"><strong>Choose a pain-free substitute</strong><span>${escapeHtml(substituteValidation?.message || "The confirmed substitute no longer satisfies the current workout constraints.")}</span><small>Open Exercise options, choose a current catalog-backed replacement, and explicitly confirm it is pain-free before continuing.</small></div>`
          : "";
        const firstWorkSet = exerciseSets.find((set) => isWorkingSet(set, "score")) || exerciseSets[0];
        const restSeconds = Number(exercise.restSeconds || data.settings.defaultRestSeconds || 90);
        const previousSets = exerciseSets.some((set) => isWorkingSet(set, "progression")) ? measurePerformance("lift:previousPerformance", () => getMostRecentWorkoutSets(exercise.name, { excludeSessionId: exercise.sessionId }), { exerciseId: exercise.id }) : [];
        const warmupIds = exerciseSets.filter((set) => setTypeSemantics(set).isWarmup).map((set) => set.id);
        const renderContext = { restSeconds, previousSets, warmupIds, substituteValidation };
        const setHtml = measurePerformance("lift:setRows", () => exerciseSets.map((set) => renderSet(set, exercise, renderContext)).join(""), { exerciseId: exercise.id, count: exerciseSets.length });
        const optionsHtml = measurePerformance("lift:exerciseOptions", () => renderPlateCalculator(exercise, firstWorkSet) + renderMuscleSelectors(exercise) + renderExerciseGuidance(exercise) + renderPrescriptionOverrideControls(exercise, resolvedSafetyContext), { exerciseId: exercise.id });
        return `
          <article class="exercise-card">
            <div class="exercise-header">
              <textarea class="exercise-name exercise-name-field" rows="1" data-action="exercise-name" data-exercise-id="${exercise.id}" aria-label="Exercise name: ${escapeHtml(exercise.name)}" title="${escapeHtml(exercise.name)}">${escapeHtml(exercise.name)}</textarea>
              <div class="exercise-actions">
                <button class="icon-button exercise-order" type="button" data-action="move-exercise" data-direction="-1" data-exercise-id="${exercise.id}" title="Move exercise up" aria-label="Move ${escapeHtml(exercise.name)} up">Up</button>
                <button class="icon-button exercise-order" type="button" data-action="move-exercise" data-direction="1" data-exercise-id="${exercise.id}" title="Move exercise down" aria-label="Move ${escapeHtml(exercise.name)} down">Dn</button>
                <button class="icon-button danger" type="button" data-action="delete-exercise" data-exercise-id="${exercise.id}" title="Delete exercise" aria-label="Delete exercise ${escapeHtml(exercise.name)}">${icon.delete}</button>
              </div>
            </div>
            <div class="exercise-level-controls">
              <label class="deload-toggle ${exercise.isDeload ? "active" : ""}"><input type="checkbox" data-action="exercise-deload" data-exercise-id="${exercise.id}" ${exercise.isDeload ? "checked" : ""} />Deload this exercise <span>${exercise.isDeload ? "Marked" : ""}</span></label>
              <label class="resistance-type-control"><span>Resistance</span><select data-action="exercise-resistance-type" data-exercise-id="${exercise.id}" aria-label="Resistance type for ${escapeHtml(exercise.name)}">${resistanceTypeOptions(resistanceTypeFor(exercise))}</select></label>
            </div>
            ${renderPrescriptionDetails(exercise)}
            ${substituteRecoveryHtml}
            ${setHtml}
            <div class="row wrap">
              <button type="button" data-action="add-set" data-exercise-id="${exercise.id}" aria-label="Add working set to ${escapeHtml(exercise.name)}"${workoutSafetyDisabledAttributes(addSetSafety)}>${icon.add} Set</button>
              <button type="button" data-action="add-warmup-set" data-exercise-id="${exercise.id}" aria-label="Add warm-up set to ${escapeHtml(exercise.name)}"${workoutSafetyDisabledAttributes(addWarmupSafety)}>+ Warm-up</button>
              <button type="button" data-action="duplicate-set" data-exercise-id="${exercise.id}" aria-label="Duplicate set for ${escapeHtml(exercise.name)}"${workoutSafetyDisabledAttributes(duplicateSetSafety)}>${icon.duplicate} Duplicate</button>
            </div>
            <details class="exercise-options">
              <summary>Exercise options <span>${restSeconds}s rest</span></summary>
              <div class="disclosure-body">
                <label class="rest-control">Rest after this lift<input type="number" min="15" step="15" value="${restSeconds}" data-action="exercise-rest-seconds" data-exercise-id="${exercise.id}" /> sec</label>
                <p class="settings-note">${escapeHtml(exercise.prescription?.restReason || (restSeconds + " seconds is saved for this exercise. Adjust it here when equipment or session intent changes."))}</p>
                ${optionsHtml}
                ${activeSession()?.templateId ? '<button type="button" data-action="update-template-exercise" data-exercise-id="' + exercise.id + '">Update template from today</button><p class="settings-note">Edits stay in today’s workout unless you choose this button. Completed results—not the original target—drive future recommendations.</p>' : ""}
                <textarea data-action="exercise-notes" data-exercise-id="${exercise.id}" placeholder="Exercise notes" aria-label="Exercise notes">${escapeHtml(exercise.notes)}</textarea>
              </div>
            </details>
          </article>
        `;
      }

      function renderSet(set, exercise, context = {}) {
        const restSeconds = Number(context.restSeconds || exercise.restSeconds || data.settings.defaultRestSeconds || 90);
        const completionSafety = guardWorkoutMutation("toggle-set", { exercise, set, substituteValidation: context.substituteValidation }, false);
        const skipSafety = guardWorkoutMutation("toggle-skip-set", { exercise, set, substituteValidation: context.substituteValidation }, false);
        const timerSafety = guardWorkoutMutation("start-timer", { exercise, set, substituteValidation: context.substituteValidation }, false);
        const resistanceType = resistanceTypeFor(exercise, set);
        const visualState = setVisualState(set);
        const isNext = visualState === "current";
        const isResting = Boolean(timer?.isActive && timer.setId === set.id);
        const executionLabel = setExecutionLabel(set);
        const warmupIndex = setTypeSemantics(set).isWarmup ? (context.warmupIds || []).indexOf(set.id) : -1;
        const previousSets = !isWorkingSet(set, "progression") ? [] : (context.previousSets || []);
        const role = normalizeSetTypeCode(set.setType, set.isWarmup);
        const previous = set.previousComparableSet || previousComparableSetForRole(previousSets, role, set.setTypeIndex);
        const previousText = previous ? formatSetPerformance(previous, exercise) : "No comparable " + (setTypeLabels[role] || "working set").toLowerCase();
        const targetLoad = Number(set.targetWeight ?? set.weight ?? 0);
        const targetLoadText = formatResistance({ ...set, weight: targetLoad, addedLoad: resistanceType === "bodyweight_plus_load" ? targetLoad : set.addedLoad, assistanceLoad: resistanceType === "assisted_bodyweight" ? targetLoad : set.assistanceLoad, resistanceType });
        const targetRepText = targetRangeText(set.targetRepMin, set.targetRepMax || set.targetReps, " reps");
        const targetRpeText = targetRangeText(set.targetRpeMin, set.targetRpeMax || set.targetRpe, " RPE");
        const progressionReady = set.setPrescription?.progressionReady !== false;
        const nextIncrementText = set.setPrescription?.nextLoad != null
          ? progressionReady
            ? formatResistance({ ...set, weight: set.setPrescription.nextLoad, addedLoad: resistanceType === "bodyweight_plus_load" ? set.setPrescription.nextLoad : set.addedLoad, assistanceLoad: resistanceType === "assisted_bodyweight" ? set.setPrescription.nextLoad : set.assistanceLoad, resistanceType })
            : "Hold current " + targetLoadText
          : "Not configured";
        const progressionRule = set.setPrescription?.progressionRule || "Progress after reaching the top of the programmed range within the RPE target.";
        const performanceField = resistanceType === "duration"
          ? '<label class="set-field"><span>Seconds</span><input type="number" min="0" value="' + Number(set.durationSeconds || 0) + '" data-action="set-duration" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' seconds" /></label>'
          : resistanceType === "distance"
            ? '<label class="set-field"><span>Distance</span><input type="number" min="0" step="0.1" value="' + Number(set.distance || 0) + '" data-action="set-distance" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' distance" /></label>'
            : '<label class="set-field"><span>Reps</span><input type="number" min="0" value="' + set.reps + '" data-action="set-reps" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' reps" /></label>';
        const loadField = resistanceType === "bodyweight"
          ? '<div class="set-field"><span>Load</span><div class="resistance-readout">BW</div></div>'
          : resistanceType === "duration" || resistanceType === "distance"
            ? '<div class="set-field"><span>Load</span><div class="resistance-readout">—</div></div>'
            : '<label class="set-field"><span>' + (resistanceType === 'bodyweight_plus_load' ? 'Added' : resistanceType === 'assisted_bodyweight' ? 'Assist' : 'Load') + '</span><input type="number" min="0" step="' + (data.settings.weightUnit === 'lb' ? '0.5' : '0.001') + '" value="' + displayLoadNumber(resistanceLoad(set, resistanceType), set.weightUnit || data.settings.weightUnit) + '" data-action="set-weight" data-set-id="' + set.id + '" aria-label="Set ' + set.setNumber + ' ' + (resistanceType === 'bodyweight_plus_load' ? 'added load' : resistanceType === 'assisted_bodyweight' ? 'assistance load' : 'load') + '" /></label>';
        return `
          <div id="set-${set.id}" data-set-state="${visualState}" class="set-block ${visualState === "completed" ? "completed" : ""} ${isNext ? "next-set" : ""} ${isNext && activeSetAcknowledged ? "acknowledged" : ""} ${visualState === "edited" ? "edited-set" : ""} ${visualState === "skipped" ? "skipped-set" : ""} ${isResting ? "resting-set" : ""}">
            <div class="set-heading">
              <span class="set-type-badge type-${escapeHtml(role)}">${escapeHtml(executionLabel.toUpperCase())}${set.manualOverride ? " · CORRECTED" : ""}</span>
              ${set.validationWarning ? '<span class="set-validation-warning">Review prescription</span>' : ""}
            </div>
            <div class="set-row ${visualState === "completed" ? "completed" : "pending"} ${set.isWarmup ? "warmup" : ""}">
              <div class="set-field set-index"><span>Set</span><strong>${warmupIndex >= 0 ? "WU" + (warmupIndex + 1) : set.setNumber}</strong></div>
              ${performanceField}
              ${loadField}
              <label class="set-field"><span>RPE</span><input type="number" min="0" max="10" step="0.5" value="${set.rpe}" data-action="set-rpe" data-set-id="${set.id}" aria-label="Set ${set.setNumber} RPE" /></label>
              <div class="set-field set-status"><span>Status</span><button class="check-button ${set.completed ? "checked" : ""}" type="button" data-action="toggle-set" data-set-id="${set.id}" title="${set.completed ? "Completed" : "Mark set complete"}" aria-label="${set.completed ? "Set completed" : "Mark set complete"}" aria-pressed="${set.completed ? "true" : "false"}"${workoutSafetyDisabledAttributes(completionSafety)}>${icon.done}</button></div>
            </div>
            ${!setTypeSemantics(set).isWarmup ? '<div class="set-prescription-context"><div><span>Last time</span><strong>' + escapeHtml(previousText) + '</strong></div><div><span>Today</span><strong>' + escapeHtml(targetLoadText) + '</strong><small>' + escapeHtml(targetRepText + ' · ' + targetRpeText) + '</small></div><div><span>Next increment</span><strong>' + escapeHtml(nextIncrementText) + '</strong><small>' + escapeHtml(String(set.setPrescription?.confidence || set.prescriptionConfidence || 'low') + ' confidence') + '</small></div><div class="set-progress-rule"><span>Progress when</span><strong>' + escapeHtml(progressionRule) + '</strong></div></div>' : ""}
            ${isNext ? '<div class="next-set-banner"><span aria-hidden="true">&#10148;</span><span>' + escapeHtml(activeSetAcknowledged ? "Current set" : activeSetNotice || "Current set") + '</span></div>' : ""}
            <div class="set-actions">
              <button class="mini-button set-rest-button" type="button" data-action="start-timer" data-exercise-id="${exercise.id}" data-set-id="${set.id}"${workoutSafetyDisabledAttributes(timerSafety)}>${icon.clock} ${formatTimer(restSeconds)}</button>
              ${isEditingHistorySession() ? '<label class="set-type-editor"><span>Set type</span><select data-action="set-type-override" data-set-id="' + set.id + '">' + ['warmup','straight','top','backoff','drop'].map((type) => '<option value="' + type + '" ' + (normalizeSetTypeCode(set.setType, set.isWarmup) === type ? 'selected' : '') + '>' + escapeHtml(setTypeLabels[type]) + '</option>').join('') + '</select></label>' : ''}
              ${set.manualOverride && isEditingHistorySession() && set.classificationUndo ? '<button class="mini-button" type="button" data-action="undo-set-type-override" data-set-id="' + set.id + '">Undo type change</button>' : ''}
              <button class="mini-button set-skip-button ${set.skipped ? "active" : ""}" type="button" data-action="toggle-skip-set" data-set-id="${set.id}"${workoutSafetyDisabledAttributes(skipSafety)}>${set.skipped ? "Skipped" : "Skip"}</button>
              <button class="mini-button" type="button" data-action="delete-set" data-set-id="${set.id}">Remove</button>
              ${visualState === "edited" ? '<span class="edited-indicator">Edited, not completed</span>' : ""}
            </div>
            ${renderTimer(set.id)}
          </div>
        `;
      }

      function renderPrescriptionBrief(exercise) {
        const target = exercise.prescription;
        if (!target) return "";
        const label = target.isDeload ? "Deload prescription" : target.mode === "technique" ? "Technique prescription" : "Recommended";
        const original = exercise.originalPrescription;
        const changed = Boolean(target.adjusted && original);
        const summary = changed
          ? '<span class="prescription-tier"><span>Recommended</span><strong>' + escapeHtml(prescriptionLine(original)) + '</strong></span><span class="prescription-tier readiness-tier"><span>Today\'s readiness</span><strong>' + escapeHtml(prescriptionLine(target)) + '</strong></span><span class="why-link">Why this changed</span>'
          : '<span class="prescription-tier"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(prescriptionLine(target)) + '</strong></span><span class="why-link">Why This Recommendation</span>';
        return '<details class="prescription-brief ' + (target.isDeload ? 'deload' : '') + ' ' + (changed ? 'readiness-adjusted' : '') + '"><summary data-action="toggle-prescription-rationale" aria-label="' + (changed ? 'Why this changed' : 'Why this recommendation?') + '">' + summary + '</summary><span>' + escapeHtml(target.adjustmentReason || target.reason) + '</span><span>' + escapeHtml((target.confidence || 'low') + ' confidence · Rep range ' + target.repLow + '-' + target.repHigh + ' · Increment ' + target.increment + ' ' + data.settings.weightUnit) + '</span></details>';
      }

      function readablePrescriptionLine(target) {
        return target.sets + " set" + (Number(target.sets) === 1 ? "" : "s") + " | " + formatResistance(target) + " x " + target.reps + " reps @ RPE " + target.rpe + (target.restSeconds ? " | " + target.restSeconds + "s rest" : "");
      }

      function renderRolePrescriptionDetails(exercise) {
        const byRole = new Map();
        setsForExercise(exercise.id).filter((set) => isWorkingSet(set, "score")).forEach((set) => {
          const role = normalizeSetTypeCode(set.setType, set.isWarmup);
          if (!byRole.has(role)) byRole.set(role, set);
        });
        if (!byRole.size) return "";
        return '<div class="role-prescription-list">' + Array.from(byRole.entries()).map(([role, set]) => {
          const load = formatResistance({ ...set, weight: Number(set.targetWeight ?? set.weight ?? 0), addedLoad: set.resistanceType === "bodyweight_plus_load" ? Number(set.targetWeight ?? set.addedLoad ?? 0) : set.addedLoad, assistanceLoad: set.resistanceType === "assisted_bodyweight" ? Number(set.targetWeight ?? set.assistanceLoad ?? 0) : set.assistanceLoad });
          const reps = targetRangeText(set.targetRepMin, set.targetRepMax || set.targetReps, " reps");
          const rpe = targetRangeText(set.targetRpeMin, set.targetRpeMax || set.targetRpe, " RPE");
          const previous = set.previousComparableSet ? formatSetPerformance(set.previousComparableSet, exercise) : "No comparable " + (setTypeLabels[role] || "working set").toLowerCase();
          const nextIncrement = set.setPrescription?.nextLoad != null
            ? formatResistance({ ...set, weight: set.setPrescription.nextLoad, addedLoad: set.resistanceType === "bodyweight_plus_load" ? set.setPrescription.nextLoad : set.addedLoad, assistanceLoad: set.resistanceType === "assisted_bodyweight" ? set.setPrescription.nextLoad : set.assistanceLoad })
            : "Not configured";
          const confidence = String(set.setPrescription?.confidence || set.prescriptionConfidence || "low");
          const progressionRule = set.setPrescription?.progressionRule || "Reach the top of the programmed range without exceeding the RPE target.";
          return '<div class="role-prescription"><span>' + escapeHtml(setTypeLabels[role] || "Working set") + '</span><div class="role-performance-grid"><div><small>Last time</small><strong>' + escapeHtml(previous) + '</strong></div><div><small>Today</small><strong>' + escapeHtml(load) + '</strong><b>' + escapeHtml(reps + ' · ' + rpe) + '</b></div></div><div class="role-progression-facts"><div><small>Confidence</small><strong>' + escapeHtml(confidence.charAt(0).toUpperCase() + confidence.slice(1)) + '</strong></div><div><small>Target reps</small><strong>' + escapeHtml(reps) + '</strong></div><div><small>Next increment</small><strong>' + escapeHtml(nextIncrement) + '</strong></div></div><div class="role-progress-rule"><small>Progress when</small><strong>' + escapeHtml(progressionRule) + '</strong></div><p>' + escapeHtml(set.setPrescription?.reason || set.prescriptionReason || "This set follows its programmed role and comparable history.") + '</p></div>';
        }).join('') + '</div>';
      }

      function prescriptionMetric(value, suffix = "") {
        if (!value) return "—";
        const target = value.target !== undefined ? value.target : value.min === value.max ? value.min : null;
        return (target !== null ? target + " (" + value.min + "-" + value.max + ")" : value.min + "-" + value.max) + suffix;
      }

      function renderUnifiedEvidence(snapshot) {
        const prescription = snapshot.finalPrescription;
        const base = snapshot.basePrescription;
        const sourceUnit = prescription.prescribedLoad?.unit || data.settings.weightUnit;
        const previousLoad = Number(convertWeightValue(prescription.prescribedLoad?.previous || base.prescribedLoad?.previous || 0, sourceUnit, data.settings.weightUnit));
        const targetLoad = Number(convertWeightValue(prescription.prescribedLoad?.target || 0, sourceUnit, data.settings.weightUnit));
        const changes = [];
        if (base.workingSets.target !== prescription.workingSets.target) changes.push('Sets ' + base.workingSets.target + ' → ' + prescription.workingSets.target);
        if (base.repRange.target !== prescription.repRange.target) changes.push('Rep target ' + (base.repRange.target ?? base.repRange.min + '–' + base.repRange.max) + ' → ' + (prescription.repRange.target ?? prescription.repRange.min + '–' + prescription.repRange.max));
        if (previousLoad && targetLoad && previousLoad !== targetLoad) changes.push('Load ' + displayLoadNumber(previousLoad) + ' → ' + displayLoadNumber(targetLoad) + ' ' + data.settings.weightUnit);
        if (base.targetRpe.min !== prescription.targetRpe.min || base.targetRpe.max !== prescription.targetRpe.max) changes.push('RPE ' + base.targetRpe.min + '–' + base.targetRpe.max + ' → ' + prescription.targetRpe.min + '–' + prescription.targetRpe.max);
        const scores = [
          ["Personal evidence", Math.round(prescription.personalEvidenceWeight * 100) + "%"],
          ["Research evidence", Math.round(prescription.researchEvidenceWeight * 100) + "%"],
          ["Exercise score", Math.round(prescription.exerciseScore) + "/100"],
          ["Staleness", prescription.staleness?.label || "Insufficient evidence"],
          ["Deload scope", recommendationLabel(prescription.deloadStatus?.state || "normal")],
          ["Versions", `Rx ${snapshot.recommendationVersion} · personal ${snapshot.personalDataVersion} · research ${snapshot.researchDatabaseVersion}`]
        ];
        return '<div class="recommendation-rationale"><h4>Why This Recommendation</h4><p class="rationale-reason">' + escapeHtml(prescription.userExplanation) + '</p>' + (changes.length ? '<div class="prescription-change-list"><strong>What changed</strong><span>' + escapeHtml(changes.join(' · ')) + '</span></div>' : '') + '<div class="rationale-facts">' + scores.map(([label, value]) => '<div><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>').join('') + '</div><h4>Evidence</h4><ul>' + (prescription.evidenceSummary || []).map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul><p class="settings-note"><strong>What would change this:</strong> ' + escapeHtml(prescription.substitutionRule || prescription.regressionRule) + '</p></div>';
      }

      function renderUnifiedPrescriptionDetails(exercise, snapshot) {
        const base = snapshot.basePrescription;
        const final = snapshot.finalPrescription;
        const changed = Boolean(final.readinessAdjustment?.changed);
        const baseLine = `${base.workingSets.target} sets · ${base.repRange.min}-${base.repRange.max} reps · RPE ${base.targetRpe.min}-${base.targetRpe.max}`;
        const finalLine = `${final.workingSets.target} sets · ${final.repRange.min}-${final.repRange.max} reps · RPE ${final.targetRpe.min}-${final.targetRpe.max}`;
        const summary = changed
          ? '<span class="prescription-tier"><span>Base prescription</span><strong>' + escapeHtml(baseLine) + '</strong></span><span class="prescription-tier readiness-tier"><span>Today only</span><strong>' + escapeHtml(finalLine) + '</strong></span><span class="why-link">Why this changed</span>'
          : '<span class="prescription-tier"><span>' + escapeHtml(recommendationActionLabel(final)) + '</span><strong>' + escapeHtml(finalLine + ' · ' + final.setStructure.replaceAll('_', ' ')) + '</strong></span><span class="why-link">Why This Recommendation</span>';
        return '<details class="prescription-brief unified-prescription ' + (final.recommendationType.includes('deload') ? 'deload' : '') + ' ' + (changed ? 'readiness-adjusted' : '') + '"><summary data-action="toggle-prescription-rationale" aria-label="Why this recommendation?">' + summary + '</summary><div class="prescription-fact-grid"><div><span>Rest</span><strong>' + escapeHtml(prescriptionMetric(final.restSeconds, ' sec')) + '</strong></div><div><span>Frequency</span><strong>' + escapeHtml(prescriptionMetric(final.frequencyPerWeek, '/week')) + '</strong></div><div><span>Role</span><strong>' + escapeHtml(final.role.replaceAll('_', ' ')) + '</strong></div><div><span>Confidence</span><strong>' + escapeHtml(final.confidence) + '</strong></div></div><p class="prescription-action"><strong>Next action:</strong> ' + escapeHtml(final.progressionRule) + '</p>' + (changed ? '<p class="readiness-temporary"><strong>Temporary:</strong> ' + escapeHtml(final.readinessAdjustment.explanation + ' ' + final.readinessAdjustment.resumeRule) + '</p>' : '') + renderUnifiedEvidence(snapshot) + '</details>';
      }

      function renderPrescriptionDetails(exercise) {
        if (exercise.recommendationSnapshot) return renderUnifiedPrescriptionDetails(exercise, exercise.recommendationSnapshot);
        const target = exercise.prescription;
        if (!target) return "";
        const label = target.isDeload ? "Deload prescription" : target.mode === "technique" ? "Technique prescription" : "Recommended";
        const original = exercise.originalPrescription;
        const changed = Boolean(target.adjusted && original);
        const summary = changed
          ? '<span class="prescription-tier"><span>Recommended</span><strong>' + escapeHtml(readablePrescriptionLine(original)) + '</strong></span><span class="prescription-tier readiness-tier"><span>Today\'s readiness</span><strong>' + escapeHtml(readablePrescriptionLine(target)) + '</strong></span><span class="why-link">Why this changed</span>'
          : '<span class="prescription-tier"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(readablePrescriptionLine(target)) + '</strong></span><span class="why-link">Why This Recommendation</span>';
        const reason = target.adjustmentReason || target.reason || "This target follows the most comparable submitted performance and the programmed rep range.";
        const reasonParts = reason.split("Why these levers:");
        const reasonMarkup = reasonParts.length > 1
          ? '<div class="rationale-copy"><div><span>What triggered it</span><p class="rationale-reason">' + escapeHtml(reasonParts[0].trim()) + '</p></div><div><span>Why these changes</span><p class="rationale-reason">' + escapeHtml(reasonParts.slice(1).join("Why these levers:").trim()) + '</p></div></div>'
          : '<p class="rationale-reason">' + escapeHtml(reason) + '</p>';
        const rationale = '<div class="recommendation-rationale"><div class="rationale-heading"><span class="rationale-icon" aria-hidden="true">i</span><div><strong>' + (changed ? 'Why today\'s target changed' : 'Why this recommendation') + '</strong><span>Based on submitted history and programming rules</span></div></div>' + reasonMarkup + renderRolePrescriptionDetails(exercise) + '</div>';
        return '<details class="prescription-brief ' + (target.isDeload ? 'deload' : '') + ' ' + (changed ? 'readiness-adjusted' : '') + '"><summary data-action="toggle-prescription-rationale" aria-label="' + (changed ? 'Why this changed' : 'Why this recommendation?') + '">' + summary + '</summary>' + rationale + '</details>';
      }

      function renderPlateCalculator(exercise, set) {
        if (!set || resistanceTypeFor(exercise, set) !== "external" || !isBarbellExercise(exercise.name)) return "";
        const total = Number(set.weight || 0);
        const unit = set.weightUnit || data.settings.weightUnit;
        const bar = unit === "kg" ? 20 : 45;
        if (total <= 0) return '<div class="plate-calculator"><strong>Plate calculator</strong><span>Enter the total bar weight to see plates per side.</span></div>';
        if (total < bar) return '<div class="plate-calculator"><strong>Plate calculator</strong><span>Total load is below the standard ' + bar + ' ' + unit + ' bar.</span></div>';
        const available = unit === "kg" ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
        let remaining = Math.max(0, (total - bar) / 2);
        const plates = [];
        available.forEach((plate) => {
          const count = Math.floor((remaining + 0.001) / plate);
          if (count > 0) {
            plates.push(count + " × " + plate);
            remaining = Math.round((remaining - count * plate) * 100) / 100;
          }
        });
        const plateText = plates.length ? plates.join(" + ") : "empty bar";
        const remainder = remaining > 0.01 ? " · " + remaining + " " + unit + " per side cannot be made with standard plates" : "";
        return '<div class="plate-calculator"><strong>Plate calculator · ' + total + ' ' + unit + '</strong><span>Each side: ' + plateText + remainder + '</span></div>';
      }

      function isBarbellExercise(name) {
        const value = String(name || "").toLowerCase();
        return /barbell|bench press|back squat|front squat|deadlift|good morning|hip thrust/.test(value) && !/dumbbell|machine|cable|smith/.test(value);
      }

      function renderTimer(setId) {
        if (!timer || timer.setId !== setId) return "";
        const elapsed = Math.max(0, timer.durationSeconds - timer.remainingSeconds);
        const progress = timer.durationSeconds > 0 ? Math.min(100, Math.round((elapsed / timer.durationSeconds) * 100)) : 100;
        const notificationStatus = timer.notificationStatus === "scheduled" ? "Lock-screen alert scheduled" : timer.notificationStatus === "error" ? "Foreground alert only" : timer.notificationStatus === "paused" ? "Notification paused" : "Scheduling alert";
        const sourceExercise = exerciseById(timer.exerciseId);
        const nextSet = setById(timer.pendingNextSetId);
        const nextExercise = nextSet ? exerciseById(nextSet.exerciseId) : null;
        return `
          <div class="timer-bar" data-timer-id="${timer.id}">
            <div class="timer-heading-copy"><span>${timer.isPaused ? "Paused" : "Rest"}</span><strong data-timer-countdown>${formatTimer(timer.remainingSeconds)}</strong><small>${escapeHtml(notificationStatus)}</small></div>
            <div class="timer-secondary-controls"><button class="timer-control timer-pause" type="button" data-action="toggle-timer" title="${timer.isPaused ? "Resume timer" : "Pause timer"}" aria-label="${timer.isPaused ? "Resume timer" : "Pause timer"}">${timer.isPaused ? icon.play : icon.pause}</button><button class="timer-control timer-cancel" type="button" data-action="clear-timer" title="Cancel timer" aria-label="Cancel timer">${icon.delete}</button></div>
            <div class="timer-progress" role="progressbar" aria-label="Rest elapsed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" style="--timer-progress:${progress}%"><span></span><b data-timer-progress-label>${formatTimer(timer.remainingSeconds)} remaining</b></div>
            <div class="timer-primary-controls" aria-label="Rest timer adjustments">
              <button class="timer-adjust" type="button" data-action="adjust-timer" data-seconds="-15" title="Reduce rest by 15 seconds" aria-label="Reduce rest by 15 seconds">-15 sec</button>
              <button class="timer-adjust" type="button" data-action="adjust-timer" data-seconds="15" title="Add 15 seconds" aria-label="Add 15 seconds">+15 sec</button>
              <button class="timer-skip" type="button" data-action="skip-timer" title="Skip remaining rest">Skip</button>
            </div>
            <div class="timer-context">After ${escapeHtml(sourceExercise?.name || "this set")} ${nextSet ? "&#8226; Next: " + escapeHtml(nextExercise?.name || sourceExercise?.name || "Exercise") + " &#8226; " + escapeHtml(setExecutionLabel(nextSet)) : "&#8226; Final set"}</div>
          </div>
        `;
      }

      function renderTimerCompleteNotice() {
        const visibleNotice = restCompletionController?.getVisibleNotice() || timerCompleteNotice;
        if (!visibleNotice) return "";
        return `
          <div class="timer-complete-toast" role="alertdialog" aria-live="assertive" aria-label="Rest complete, ${escapeHtml(visibleNotice.setLabel || "next set")} ready">
            <span class="timer-complete-icon">&#10003;</span>
            <div><strong>Rest Complete</strong><span>${escapeHtml(visibleNotice.exerciseName)}${visibleNotice.setLabel ? " &#8226; " + escapeHtml(visibleNotice.setLabel) : ""}</span></div>
            <div class="timer-complete-actions"><button type="button" data-action="return-to-rest-workout">Return to Workout</button><button class="mini-button" type="button" data-action="dismiss-timer-notice" aria-label="Dismiss rest complete alert">Dismiss</button></div>
          </div>
        `;
      }

      function renderWorkoutAdvice(advice) {
        return `
          <article class="workout-advice">
            <h2>${escapeHtml(advice.label)}</h2>
            <p class="advice-detail">${escapeHtml(advice.detail)}</p>
            ${advice.items.length ? '<ul class="advice-list">' + advice.items.map((item) => '<li><strong>' + escapeHtml(item.name) + '</strong><span>' + escapeHtml(item.text) + '</span></li>').join("") + '</ul>' : ""}
          </article>
        `;
      }

      function mesocycleTypeLabel(type) {
        return ({
          primary_progression: "Primary progression",
          alternative_exercise: "Alternative exercises",
          lower_fatigue_resensitization: "Lower fatigue / resensitization",
          specialization: "Specialization"
        })[type] || type.replaceAll("_", " ");
      }

      const mesocycleEquipmentTaxonomy = Object.freeze([
        ["all", "All Equipment / Standard Gym"], ["bodyweight", "Bodyweight"], ["bands", "Bands"],
        ["dumbbell", "Dumbbells"], ["barbell", "Barbell"], ["rack", "Rack"], ["cable_station", "Cable Station"]
      ]);

      function mesocycleEquipmentSelection() {
        const selected = data.settings.availableEquipment || [];
        return !selected.length || selected.includes("all") ? ["all"] : selected;
      }

      function muscleGroupEducation(muscleGroupId) {
        const family = prescriptionApi?.muscleFamily?.(muscleGroupId) || String(muscleGroupId || "").replace(/^mg_/, "");
        const research = prescriptionEngine?.evidence?.research?.muscleGroupRecommendations || [];
        const functions = Array.from(new Set(research.filter((item) => prescriptionApi.muscleFamily(item.muscle_group_id || item.muscle_group) === family).map((item) => item.anatomical_function).filter(Boolean)));
        const consequences = {
          chest: "Direct training supports pressing strength and shoulder control across horizontal pushing.", lats: "Direct training supports shoulder extension and adduction used in climbing, pulling, and upper-body stability.", upper_back: "Direct training supports scapular retraction, posture under load, and balanced shoulder mechanics.",
          traps: "Direct training supports scapular elevation and upward rotation under carried or overhead loads.", front_delts: "Direct work supports shoulder flexion and pressing, though pressing may already provide meaningful indirect stimulus.", side_delts: "Direct work develops shoulder abduction and lateral shoulder capacity that presses only partly cover.", rear_delts: "Direct work supports shoulder horizontal abduction and balances repeated pressing.",
          biceps: "Direct work supports elbow flexion and supination; pulls contribute, but may not fully train every function.", triceps: "Direct work supports elbow extension and pressing lockout; overhead work can emphasize the long head.", forearms: "Direct work supports grip and wrist control when pulling and carries are insufficient or grip is a goal.",
          spinal_erectors: "Direct or strongly loaded hinge work supports spinal extension and trunk stiffness; omitting it reduces dedicated posterior-trunk capacity work.", abs: "Direct work supports spinal flexion and anti-extension; compound lifting alone is not counted as full direct abdominal training.", obliques: "Direct work supports rotation, lateral flexion, and resisting unwanted trunk rotation.",
          glutes: "Direct work supports hip extension, pelvic stability, walking and running mechanics, balance, squatting, hinging, and jumping.", quads: "Direct work supports knee extension for squatting, rising, climbing, running, and jumping.", hamstrings: "Direct work supports knee flexion and hip extension; omitting curls or hinges can leave one of those functions undertrained.",
          adductors: "Direct work supports hip adduction, pelvic control, and force production in wide or deep lower-body positions.", abductors: "Direct work moves the leg away from the body, stabilizes the pelvis in single-leg movement, and helps control knee and hip alignment.", calves: "Direct work supports ankle plantar flexion for walking, running, jumping, and lower-leg stiffness.", neck: "Direct work supports cervical flexion, extension, and stabilization; it is optional unless neck strength, resilience, or sport demands are goals."
        };
        return { functions, consequence: consequences[family] || "Direct training develops this muscle's documented joint actions and capacity; indirect work is not assumed to replace a dedicated slot." };
      }

      const presentationLabels = Object.freeze({
        research_default: "Research-Based Default", primary_progression_lift: "Primary Progression Lift",
        secondary_hypertrophy_lift: "Secondary Hypertrophy Lift", low_fatigue_accessory: "Fatigue-Efficient Accessory",
        maintenance_lift: "Maintenance Lift", deload_variation: "Deload Variation", chest_sternal: "Sternal Chest",
        chest_clavicular: "Upper Chest", front_delts: "Front Delts", side_delts: "Side Delts", rear_delts: "Rear Delts",
        upper_back: "Upper Back", spinal_erectors: "Spinal Erectors", lateral_neck_musculature: "Lateral Neck",
        straight_sets: "Straight Sets", top_set_backoff: "Top Set + Back-Off Sets", multiple_top_sets: "Multiple Top Sets"
      });

      function presentationLabel(value) {
        const key = String(value || "").trim().toLowerCase().replace(/^mg[_-]/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        if (!key) return "Not Available";
        return presentationLabels[key] || key.split("_").filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
      }

      function guidedDraft() {
        return data.mesocycles.find((item) => item.id === guidedMesocycleDraftId && item.builderMode === "guided") || data.mesocycles.find((item) => item.builderMode === "guided" && ["draft", "planned"].includes(item.status)) || null;
      }

      function guidedAvailableMuscles() {
        if (!prescriptionEngine || !prescriptionApi) return [];
        return Array.from(new Set(prescriptionApi.representedMuscleGroups(prescriptionEngine.evidence).map(prescriptionApi.muscleFamily))).filter(Boolean).sort();
      }

      function guidedTargetFor(muscleGroupId, draft = guidedDraft()) {
        const defaults = prescriptionApi?.aggregateMuscleResearchDefaults?.(prescriptionEngine?.evidence?.research, muscleGroupId);
        let result = defaults?.weeklySets ? { min: Number(defaults.weeklySets.min), target: Number(defaults.weeklySets.target), max: Number(defaults.weeklySets.max) } : { min: 6, target: 10, max: 14 };
        const priority = draft?.musclePriorities?.[muscleGroupId];
        if (priority === "maintenance") result = { min: Math.max(2, Math.round(result.min * .5)), target: Math.max(3, Math.round(result.target * .55)), max: Math.max(5, Math.round(result.max * .65)) };
        if (priority === "specialization") result = { min: result.min, target: Math.min(result.max, result.target + 2), max: result.max + 2 };
        return result;
      }

      function guidedMuscleStatuses(draft = guidedDraft()) {
        return draft ? guidedMesocycleApi.muscleTargetStatuses(draft, guidedLedger(draft), (muscle) => guidedTargetFor(muscle, draft)) : [];
      }

      function guidedStepIndex(step) { return guidedMesocycleApi.STEPS.indexOf(step); }
      function guidedStepUnlocked(draft, step) { return guidedStepIndex(step) <= guidedStepIndex(draft?.planningProgress?.highestUnlockedStep || (draft?.guidedDays?.length ? "build" : "guide")); }

      function setGuidedStep(step) {
        const draft = guidedDraft();
        if (step === "guide") { guidedMesocycleView = "guidelines"; render(); return; }
        if (step === "setup" && (!draft || guidedStepUnlocked(draft, "setup"))) {
          if (draft) {
            mesocycleDraftType = draft.type;
            mesocycleDurationDraft = String(draft.durationWeeks);
            mesocycleScopeDraft = new Set(draft.includedMuscleGroupIds || []);
            mesocycleSpecializationMuscle = draft.specializationMuscleGroups?.[0] || "";
          }
          guidedMesocycleView = "setup";
          render();
          requestAnimationFrame(() => {
            const objectiveSelect = document.querySelector('[data-action="mesocycle-type"]');
            if (objectiveSelect) objectiveSelect.value = mesocycleDraftType;
          });
          return;
        }
        if (!draft || !guidedStepUnlocked(draft, step)) return;
        guidedMesocycleView = step === "check" ? "viability" : "builder";
        guidedWeeklySummaryOpen = false;
        guidedGenerationReviewOpen = step === "create";
        render();
      }

      function guidedRelationships(assignment) {
        if (assignment.muscleRelationships?.length) return assignment.muscleRelationships.map((item) => ({ muscleGroupId: prescriptionApi.muscleFamily(item.muscle_group_id || item.muscleGroupId), relationshipType: item.relationship_type || item.relationshipType, setContribution: Number(item.fractional_set_credit ?? item.setContribution ?? (item.relationship_type === "direct_load" ? 1 : 0)) }));
        return prescriptionApi.calculateExerciseMuscleContributions(prescriptionEngine.evidence.research, assignment.researchExerciseId || assignment.exerciseId, 1).map((item) => ({ muscleGroupId: prescriptionApi.muscleFamily(item.muscleGroupId), relationshipType: item.relationshipType, setContribution: item.weightedHypertrophySets }));
      }

      function guidedLedger(draft = guidedDraft()) {
        return draft && guidedMesocycleApi ? guidedMesocycleApi.volumeLedger(draft, guidedRelationships) : { dayTotals: [], muscleTotals: [] };
      }

      function updateGuidedDraft(updated, options = {}) {
        guidedMesocycleDraftId = updated.id;
        commit({ ...data, mesocycles: data.mesocycles.map((item) => item.id === updated.id ? updated : item) }, options.render !== false);
      }

      function beginGuidedMesocycle() {
        guidedGenerationReviewOpen = false;
        const existing = guidedDraft();
        if (existing) {
          guidedMesocycleDraftId = existing.id;
          guidedSelectedDayId = existing.guidedDays?.[0]?.id || "";
          guidedMesocycleView = existing.creationResult ? "completion" : "builder";
        } else guidedMesocycleView = "guidelines";
        render();
      }

      function createGuidedMesocycleDraft() {
        const muscles = mesocycleScopeDraft ? Array.from(mesocycleScopeDraft) : guidedAvailableMuscles();
        const existing = guidedDraft();
        const trainingDays = Number(data.settings.trainingDaysPerWeek || 4);
        const baseOptions = { type: mesocycleDraftType, durationWeeks: Number(mesocycleDurationDraft || 6), trainingDays, availableEquipment: mesocycleEquipmentSelection(), includedMuscleGroupIds: muscles, specializationMuscleGroups: mesocycleSpecializationMuscle ? [mesocycleSpecializationMuscle] : [], musclePriorities: Object.fromEntries(muscles.map((muscle) => [muscle, existing?.musclePriorities?.[muscle] || (mesocycleSpecializationMuscle === muscle ? "specialization" : "normal")])) };
        let draft;
        if (existing) {
          const removedDays = existing.guidedDays.slice(trainingDays);
          if (removedDays.some((day) => day.assignments.length)) return showAppToast("Move or remove exercises from training days that would be removed before reducing the schedule.");
          const generated = guidedMesocycleApi.createDraft(baseOptions);
          const guidedDays = Array.from({ length: trainingDays }, (_, index) => existing.guidedDays[index] || generated.guidedDays[index]);
          draft = { ...existing, ...baseOptions, guidedDays, viabilityResult: null, viabilityStale: true, revision: Number(existing.revision || 0) + 1, planningProgress: { ...existing.planningProgress, highestUnlockedStep: "check", completedSteps: (existing.planningProgress?.completedSteps || []).filter((step) => !["check", "create"].includes(step)), setupRevision: Number(existing.planningProgress?.setupRevision || 0) + 1, viabilityRevision: null, createReadyRevision: null }, updatedAt: isoNow() };
        } else draft = guidedMesocycleApi.createDraft(baseOptions);
        draft = guidedMesocycleApi.unlockStep(draft, "build", "guide");
        draft = guidedMesocycleApi.unlockStep(draft, "build", "setup");
        guidedMesocycleDraftId = draft.id;
        guidedSelectedDayId = draft.guidedDays[0]?.id || "";
        guidedMesocycleView = "builder";
        commit({ ...data, mesocycles: existing ? data.mesocycles.map((item) => item.id === draft.id ? draft : item) : [draft, ...data.mesocycles] });
      }

      function guidedCandidatePool(muscleGroupId) {
        if (!prescriptionEngine || !muscleGroupId) return [];
        try { return prescriptionEngine.rankExercisePool(muscleGroupId, { maxCandidates: 20, availableEquipment: mesocycleEquipmentSelection(), mesocycleType: guidedDraft()?.type }).candidates || []; }
        catch { return []; }
      }

      function selectGuidedExercise(dayId, exerciseId, muscleGroupId) {
        const draft = guidedDraft();
        const candidate = guidedCandidatePool(muscleGroupId).find((item) => item.exerciseId === exerciseId);
        if (!draft || !candidate) return;
        const recommendation = candidate.recommendedSetRange ? null : unifiedPrescriptionSnapshot({ name: candidate.exerciseName }, { exerciseId: candidate.exerciseId, muscleGroupId, mesocycle: draft, fresh: true });
        const prescription = recommendation?.basePrescription;
        const assignment = {
          exerciseId: candidate.exerciseId, researchExerciseId: candidate.researchExerciseId, name: candidate.exerciseName, muscleGroupId,
          canonicalExerciseId: candidate.researchExerciseId || candidate.exerciseId, targetMuscleEffectiveness: Number(candidate.scores?.targetMuscleEffectiveness ?? candidate.scores?.muscleSpecificity ?? 0), confidence: candidate.personalDataConfidence || candidate.scores?.confidence || "research_default",
          primaryMuscles: candidate.primaryMuscles || [muscleGroupId], secondaryMuscles: candidate.secondaryMuscles || [], muscleRelationships: candidate.muscleRelationships || [],
          role: candidate.intendedRole || "secondary_hypertrophy_lift", movementPattern: candidate.movementPattern || candidate.jointActions?.join(" + ") || "",
          jointActions: candidate.jointActions || [], systemicFatigue: Number(candidate.scores?.systemicFatigue || candidate.scores?.fatigueCost || 0), localFatigue: Number(candidate.scores?.localFatigue || candidate.scores?.fatigueCost || 0), spinalLoad: Number(candidate.scores?.spinalLoad || 0), gripDemand: Number(candidate.scores?.gripDemand || 0), jointStress: Number(candidate.scores?.jointStress || 0), stabilityDemand: candidate.diversitySignature?.stability || "", stimulusToFatigue: Number(candidate.scores?.recoveryEfficiency || 0),
          equipmentRequirements: candidate.equipmentRequirements || [], workingSets: Number(candidate.recommendedSetRange?.target || prescription?.workingSets?.target || 3),
          repRange: candidate.recommendedRepRange || prescription?.repRange || { min: 8, target: 10, max: 12 }, targetRpe: candidate.recommendedRpe || prescription?.targetRpe || { min: 7, max: 8 }, targetRir: candidate.recommendedRir || prescription?.targetRir,
          setStructure: candidate.recommendedSetStructure || prescription?.setStructure || "straight_sets", restSeconds: Number(prescription?.restSeconds?.target || 120),
          progressionRule: candidate.progressionInstruction || prescription?.progressionRule || "Use double progression within the recommended rep range.", recommendationSnapshot: recommendation
        };
        guidedPendingAssignment = assignment;
        render();
        window.requestAnimationFrame(() => {
          const target = document.querySelector('[data-guided-configuration]');
          if (!target) return;
          target.scrollIntoView({ block: "center", behavior: preferredScrollBehavior() });
          target.focus({ preventScroll: true });
        });
      }

      function confirmGuidedExercise() {
        const draft = guidedDraft();
        const pending = guidedPendingAssignment;
        if (!draft || !pending || !guidedExerciseBrowserDayId) return;
        const updated = guidedMesocycleApi.addExercise(draft, guidedExerciseBrowserDayId, pending);
        if (updated.assignmentError) return showAppToast(updated.assignmentError.reason === "already_added_to_day" ? "This exercise is already assigned to this training day." : "The exercise could not be added.");
        guidedPendingAssignment = null;
        guidedReturnFocusToPicker = true;
        updateGuidedDraft(updated);
        window.requestAnimationFrame(() => {
          const picker = document.querySelector('[data-guided-exercise-picker]');
          picker?.scrollIntoView({ block: "start", behavior: preferredScrollBehavior() });
          picker?.focus({ preventScroll: true });
          guidedReturnFocusToPicker = false;
        });
      }

      function checkGuidedViability() {
        const draft = guidedDraft();
        if (!draft) return;
        const result = guidedMesocycleApi.viability(draft, { ledger: guidedLedger(draft), targetFor: (muscle) => guidedTargetFor(muscle, draft) });
        let updated = { ...draft, viabilityResult: result, viabilityStale: false, updatedAt: isoNow(), planningProgress: { ...draft.planningProgress, viabilityRevision: draft.planningProgress?.buildRevision || 0 } };
        updated = guidedMesocycleApi.unlockStep(updated, "check", "build");
        if (!result.blockingCount) {
          updated = guidedMesocycleApi.unlockStep(updated, "create", "check");
          updated.planningProgress = { ...updated.planningProgress, createReadyRevision: updated.planningProgress.buildRevision };
        }
        guidedMesocycleView = "viability";
        updateGuidedDraft(updated);
      }

      function guidedTemplatesForMesocycle(mesocycle) {
        return (mesocycle.guidedDays || []).filter((day) => day.assignments.length).map((day) => ({
          id: `guided-template-${mesocycle.id}-${day.id}`, planSessionId: day.id, name: `${mesocycle.name} · ${day.name}`, baseSessionIntent: "Mesocycle training day", notes: `Linked to guided mesocycle ${mesocycle.id}, revision ${mesocycle.revision}. Readiness may adjust today's prescription without changing the planned structure.`, createdAt: isoNow(), updatedAt: isoNow(), mesocycleId: mesocycle.id, mesocycleRevision: mesocycle.revision, linkedToMesocycle: true,
          exercises: day.assignments.map((assignment) => ({ id: id(), name: assignment.name, primaryMuscle: appMuscleFromPrescriptionGroup(assignment.muscleGroupId), secondaryMuscle: "", resistanceType: inferResistanceType(assignment.name, {}), isBodyweight: isBodyweightExerciseName(assignment.name), sets: assignment.workingSets, reps: Number(assignment.repRange?.target || assignment.repRange?.min || 10), repMin: Number(assignment.repRange?.min || 8), repMax: Number(assignment.repRange?.max || 12), targetRpe: Number(assignment.targetRpe?.max || 8), increment: progressionProfileForExercise(assignment.name).increment, restSeconds: Number(assignment.restSeconds || 120), role: assignment.role, setStructure: assignment.setStructure, setTypes: [], warmups: [], recommendationSnapshot: assignment.recommendationSnapshot || null, mesocycleAssignmentId: assignment.id }))
        }));
      }

      function createGuidedTemplates() {
        const draft = guidedDraft();
        if (guidedCreationPending) return;
        const finalResult = draft ? guidedMesocycleApi.viability(draft, { ledger: guidedLedger(draft), targetFor: (muscle) => guidedTargetFor(muscle, draft) }) : null;
        if (!draft?.viabilityResult || draft.viabilityStale || finalResult?.blockingCount) {
          const first = finalResult?.findings?.find((item) => !item.accepted && item.severity === 'blocking');
          guidedGenerationReviewOpen = false;
          guidedMesocycleView = 'builder';
          if (first?.dayId) guidedSelectedDayId = first.dayId;
          showAppToast(first ? `${first.title}. ${first.actions?.[0] || 'Correct this issue before creating templates.'}` : "Run Check Viability and resolve blocking issues first.");
          render();
          return;
        }
        guidedCreationPending = true;
        const templates = guidedTemplatesForMesocycle(draft);
        const existingIds = new Set(data.templates.filter((template) => template.mesocycleId === draft.id).map((template) => template.id));
        const createdCount = templates.filter((template) => !existingIds.has(template.id)).length;
        const updatedCount = templates.length - createdCount;
        const completedAt = isoNow();
        const creationResult = { operationId: `create-${draft.id}-${draft.revision}`, completedAt, createdCount, updatedCount, templateCount: templates.length, templateIds: templates.map((item) => item.id), acceptedWarningIds: draft.acceptedExceptions || [] };
        const updated = { ...draft, status: "planned", plannedAt: completedAt, linkedTemplateIds: templates.map((item) => item.id), viabilityResult: { ...finalResult }, creationResult, updatedAt: completedAt, planningProgress: { ...draft.planningProgress, highestUnlockedStep: 'create', completedSteps: Array.from(new Set([...(draft.planningProgress?.completedSteps || []), 'check', 'create'])) } };
        guidedMesocycleView = "completion";
        guidedGenerationReviewOpen = false;
        commit({ ...data, templates: [...templates, ...data.templates.filter((template) => template.mesocycleId !== draft.id)], mesocycles: data.mesocycles.map((item) => item.id === draft.id ? updated : item) });
        guidedCreationPending = false;
        showAppToast(`${templates.length} linked mesocycle templates ${updatedCount ? 'created or updated' : 'created'}.`);
      }

      function renderGuidedTemplateReview(draft, template) {
        const day = draft.guidedDays.find((item) => item.id === template.planSessionId);
        const dayTotal = guidedLedger(draft).dayTotals.find((item) => item.dayId === template.planSessionId) || { workingSets: 0, muscles: [] };
        const estimatedMinutes = Math.round((template.exercises.reduce((sum, item) => sum + Number(item.sets || 0) * (Number(item.restSeconds || 90) + 45), 0) + template.exercises.length * 90) / 60);
        return '<details class="guided-day guided-review-day"><summary><span><strong>' + escapeHtml(template.name) + '</strong><small>' + dayTotal.workingSets + ' working sets · ~' + estimatedMinutes + ' min</small></span><span>Review Day</span></summary><div class="guided-day-body"><ol class="guided-review-exercises">' + template.exercises.map((exercise, index) => { const assignment = day?.assignments[index] || {}; const relationships = guidedRelationships(assignment).filter((item) => item.setContribution > 0); return '<li><div><strong>' + escapeHtml(exercise.name) + '</strong><small>' + escapeHtml(presentationLabel(exercise.role)) + ' · ' + exercise.sets + ' sets · ' + exercise.repMin + '–' + exercise.repMax + ' reps · RPE ' + exercise.targetRpe + ' · ' + exercise.restSeconds + 's rest</small></div><small>' + escapeHtml(relationships.map((item) => presentationLabel(item.muscleGroupId) + ' +' + Number((exercise.sets * item.setContribution).toFixed(2))).join(' · ') || 'Muscle contribution unavailable') + '</small></li>'; }).join('') + '</ol><div class="guided-day-volume">' + dayTotal.muscles.filter((item) => item.direct + item.fractional > 0).map((item) => '<span>' + escapeHtml(presentationLabel(item.muscleGroupId)) + ': ' + Number((item.direct + item.fractional).toFixed(2)) + ' effective (' + item.direct + ' direct + ' + item.fractional + ' fractional)</span>').join('') + '</div><button type="button" data-action="edit-guided-day-from-review" data-day-id="' + escapeHtml(template.planSessionId) + '">Edit ' + escapeHtml(day?.name || 'Day') + '</button></div></details>';
      }

      function renderGuidedCompletion(draft, headerHtml) {
        const result = draft.creationResult || {};
        const action = result.createdCount && result.updatedCount ? 'created and updated' : result.updatedCount ? 'updated' : 'created';
        return '<section class="guided-builder guided-completion" role="status" aria-live="polite">' + headerHtml + '<div class="completion-mark" aria-hidden="true">✓</div><div class="section-heading"><div><div class="section-kicker">Mesocycle Completed</div><h2>Your workout templates were ' + action + ' successfully.</h2><p>' + Number(result.templateCount || 0) + ' workout template' + (Number(result.templateCount || 0) === 1 ? '' : 's') + ' for ' + draft.durationWeeks + ' weeks · ' + draft.trainingDays + ' training days per week.</p></div></div><div class="candidate-detail-grid"><div><span>Mesocycle</span><strong>' + escapeHtml(draft.name) + '</strong></div><div><span>Created</span><strong>' + Number(result.createdCount || 0) + '</strong></div><div><span>Updated</span><strong>' + Number(result.updatedCount || 0) + '</strong></div><div><span>Accepted Warnings</span><strong>' + Number(result.acceptedWarningIds?.length || 0) + '</strong></div></div><div class="row wrap"><button class="primary-action" type="button" data-action="view-created-templates">View Templates</button><button type="button" data-action="view-completed-mesocycle">View Mesocycle</button><button type="button" data-action="start-first-mesocycle-template">Start First Workout</button></div></section>';
      }

      function renderGuidedViabilityFindings(result) {
        const active = result.findings.filter((item) => !item.accepted);
        const groups = [
          ['Blocking Issues', active.filter((item) => item.severity === 'blocking')],
          ['Warnings', active.filter((item) => ['warning', 'strong_warning'].includes(item.severity))],
          ['Information', active.filter((item) => ['information', 'advisory'].includes(item.severity))]
        ];
        return groups.filter(([, findings]) => findings.length).map(([label, findings]) => '<section class="viability-group"><h3>' + label + ' · ' + findings.length + '</h3><div class="guideline-grid">' + findings.map((finding) => '<article class="finding ' + (finding.severity === 'blocking' ? 'blocking' : '') + '"><strong>' + escapeHtml(presentationLabel(finding.title)) + '</strong><p>' + escapeHtml(finding.why) + '</p><span>Recommended: ' + escapeHtml((finding.actions || []).join(' · ')) + '</span><div class="row wrap">' + (finding.dayId ? '<button type="button" data-action="edit-guided-finding" data-day-id="' + escapeHtml(finding.dayId) + '">Edit Affected Day</button>' : '') + (finding.severity !== 'blocking' ? '<button type="button" data-action="accept-guided-finding" data-finding-id="' + finding.id + '">Accept Exception</button>' : '') + '</div></article>').join('') + '</div></section>').join('') || '<div class="empty-state">No unresolved viability issues.</div>';
      }

      function mesocycleVolumeRange(value, target = 0) {
        return value || { min: Number(target || 0), target: Number(target || 0), max: Number(target || 0) };
      }

      function previewMesocyclePlan() {
        if (!prescriptionEngine || prescriptionEvidenceStatus.state === "error") return showAppToast("Training evidence is not available yet.");
        const currentProgramTemplates = data.activeMesocycleId ? data.templates.filter((template) => template.mesocycleId === data.activeMesocycleId) : [];
        const currentProgramExerciseIds = currentProgramTemplates.flatMap((template) => template.exercises.map((exercise) => prescriptionExerciseIdentity(exercise.name))).filter(Boolean);
        const recentCutoff = new Date();
        recentCutoff.setDate(recentCutoff.getDate() - 56);
        const recentSessionIds = new Set(data.sessions.filter((session) => isSessionSubmitted(session) && new Date(sessionCompletionDate(session)) >= recentCutoff).map((session) => session.id));
        const recentExerciseIds = Array.from(new Set(data.exercises.filter((exercise) => recentSessionIds.has(exercise.sessionId)).map((exercise) => prescriptionExerciseIdentity(exercise.name)).filter(Boolean)));
        const successfulExerciseIds = Array.from(new Set(prescriptionEngine.evidence.personal.exerciseScores.filter((score) => Number(score.comparable_exposures || score.session_count || 0) >= 3 && Number(score.progression_score || score.progressionScore || 0) >= 55).map((score) => score.exercise_id || score.exerciseId).filter(Boolean)));
        const durationWeeks = Number(mesocycleDurationDraft || 0);
        const mesocycle = prescriptionEngine.createMesocycle({
          type: mesocycleDraftType,
          durationWeeks: durationWeeks > 0 ? durationWeeks : undefined,
          trainingDays: Number(data.settings.trainingDaysPerWeek || 4),
          availableEquipment: data.settings.availableEquipment || [],
          currentExerciseIds: currentProgramExerciseIds,
          currentProgramExerciseIds,
          recentExerciseIds,
          successfulExerciseIds,
          includedMuscleGroupIds: mesocycleScopeDraft ? Array.from(mesocycleScopeDraft) : undefined,
          specializationMuscleGroups: mesocycleDraftType === "specialization" && mesocycleSpecializationMuscle ? [mesocycleSpecializationMuscle] : [],
          split: data.templates.map((template) => template.name)
        });
        selectedPrescriptionPoolMuscle = mesocycle.programSlots?.[0]?.muscleGroupId || Object.keys(mesocycle.pools)[0] || selectedPrescriptionPoolMuscle;
        mesocyclePlannerExpanded = true;
        commit({ ...data, mesocycles: [mesocycle, ...data.mesocycles] });
      }

      function confirmMesocycleScope(mesocycleId) {
        commit({ ...data, mesocycles: data.mesocycles.map((mesocycle) => mesocycle.id === mesocycleId ? { ...mesocycle, scopeConfirmed: true } : mesocycle) });
      }

      function regenerateMesocycleWithPracticalLimits(mesocycleId) {
        const mesocycle = data.mesocycles.find((item) => item.id === mesocycleId);
        if (!mesocycle || !prescriptionEngine) return;
        try {
          const updated = prescriptionEngine.refreshMesocycle(mesocycle, { autoFix: true });
          commit({ ...data, mesocycles: data.mesocycles.map((item) => item.id === mesocycleId ? updated : item) });
          showAppToast(updated.programReview?.blockingIssueCount ? "Sessions were rebuilt within hard limits. Remaining capacity conflicts need a schedule or scope change." : "Sessions were regenerated within the practical set, duplication, and recovery limits.");
        } catch (error) {
          showAppToast(error?.message || "The mesocycle could not be regenerated.");
        }
      }

      function addOmittedMuscleAndRebuild(mesocycleId, muscleGroupId) {
        const mesocycle = data.mesocycles.find((item) => item.id === mesocycleId);
        if (!mesocycle) return;
        mesocycleScopeDraft = new Set([...(mesocycle.includedMuscleGroupIds || []), muscleGroupId]);
        previewMesocyclePlan();
      }

      function appMuscleFromPrescriptionGroup(group) {
        const key = normalizePrescriptionIdentity(group);
        if (/chest/.test(key)) return "Chest";
        if (/lat|back|trap|spinal erector/.test(key)) return "Back";
        if (/quad/.test(key)) return "Quads";
        if (/hamstring/.test(key)) return "Hamstrings";
        if (/glute|abductor/.test(key)) return "Glutes";
        if (/adductor/.test(key)) return "Adductors";
        if (/delt|shoulder/.test(key)) return "Shoulders";
        if (/bicep/.test(key)) return "Biceps";
        if (/tricep/.test(key)) return "Triceps";
        if (/forearm/.test(key)) return "Forearms";
        if (/calf|soleus|gastroc/.test(key)) return "Calves";
        if (/abdominal|oblique|core/.test(key)) return "Core";
        if (/neck/.test(key)) return "Neck";
        return "";
      }

      function templatesForMesocycle(mesocycle) {
        if (mesocycle?.builderMode === "guided") return guidedTemplatesForMesocycle(mesocycle);
        const plannedSessions = mesocycle.sessions || [];
        if (!plannedSessions.length) return [];
        const days = plannedSessions.map((planned) => ({ id: id(), planSessionId: planned.id, name: `${mesocycle.name} · ${planned.name}`, baseSessionIntent: planned.baseSessionIntent, notes: `Generated from full-program mesocycle ${mesocycle.id}. Base Session Intent: ${planned.baseSessionIntent}. Today's readiness may modify load, sets, RPE, rest, or exercise selection before the workout begins.`, exercises: [], createdAt: isoNow(), updatedAt: isoNow(), mesocycleId: mesocycle.id }));
        plannedSessions.forEach((planned, sessionIndex) => planned.exercises.forEach((candidate) => {
          const targetDay = days[sessionIndex];
          const snapshot = unifiedPrescriptionSnapshot({ name: candidate.exerciseName }, { exerciseId: candidate.exerciseId, muscleGroupId: candidate.muscleGroupId, mesocycle, fresh: true, createdAt: isoNow() });
          const prescription = snapshot?.basePrescription;
          const target = snapshot ? legacyTargetFromSnapshot(snapshot, { name: candidate.exerciseName }) : null;
          const context = target ? unifiedTargetContext(target, targetDay, { name: candidate.exerciseName }) : null;
          targetDay.exercises.push({
            id: id(),
            name: candidate.exerciseName,
            primaryMuscle: appMuscleFromPrescriptionGroup(candidate.muscleGroupId),
            secondaryMuscle: "",
            resistanceType: inferResistanceType(candidate.exerciseName, {}),
            isBodyweight: isBodyweightExerciseName(candidate.exerciseName),
            sets: Number(candidate.plannedSets || prescription?.workingSets?.target || candidate.recommendedSetRange?.target || 3),
            reps: Number(prescription?.repRange?.target || candidate.recommendedRepRange?.target || 10),
            repMin: Number(prescription?.repRange?.min || candidate.recommendedRepRange?.min || 8),
            repMax: Number(prescription?.repRange?.max || candidate.recommendedRepRange?.max || 12),
            targetRpe: prescription?.targetRpe ? Number(((prescription.targetRpe.min + prescription.targetRpe.max) / 2).toFixed(1)) : 8,
            increment: progressionProfileForExercise(candidate.exerciseName).increment,
            restSeconds: Number(prescription?.restSeconds?.target || 120),
            role: candidate.intendedRole,
            setStructure: prescription?.setStructure || candidate.recommendedSetStructure,
            setTypes: context?.setTypes || [],
            warmups: [],
            recommendationSnapshot: snapshot
          });
        }));
        return days.filter((day) => day.exercises.length);
      }

      function transitionMesocyclePlan(mesocycleId, action) {
        const selected = data.mesocycles.find((mesocycle) => mesocycle.id === mesocycleId);
        if (!selected || !prescriptionEngine) return;
        if (action === "start" && data.activeMesocycleId && data.activeMesocycleId !== mesocycleId) {
          showAppToast("Complete the active mesocycle before starting another.");
          return;
        }
        try {
          if (action === "start" && Number(selected.programReview?.seriousWarningCount || 0) > 0) return showAppToast("Resolve the serious full-program warnings before activation.");
          const transitioned = prescriptionEngine.transitionMesocycle(selected, action, action === "complete" ? { outcome: { completedFromApp: true } } : action === "review" ? { review: { recommendationHistoryCount: data.recommendationHistory.filter((snapshot) => snapshot.mesocycleId === mesocycleId).length } } : {});
          const activeMesocycleId = transitioned.status === "active" ? transitioned.id : data.activeMesocycleId === transitioned.id && transitioned.status !== "active" ? "" : data.activeMesocycleId;
          const generatedTemplates = action === "start" ? templatesForMesocycle(transitioned) : [];
          const templates = generatedTemplates.length ? [...generatedTemplates, ...data.templates.filter((template) => template.mesocycleId !== transitioned.id)] : data.templates;
          commit({ ...data, activeMesocycleId, templates, mesocycles: data.mesocycles.map((mesocycle) => mesocycle.id === transitioned.id ? transitioned : mesocycle) });
        } catch (error) {
          showAppToast(error?.message || "Mesocycle status could not be changed.");
        }
      }

      function selectMesocycleCandidate(mesocycleId, slotId, exerciseId) {
        const mesocycle = data.mesocycles.find((item) => item.id === mesocycleId);
        const slot = mesocycle?.programSlots?.find((item) => item.id === slotId);
        if (!mesocycle || !slot || !prescriptionEngine) return;
        const selected = slot.selectionRequired === 1 ? [exerciseId] : Array.from(new Set([...slot.selectedExerciseIds, exerciseId])).slice(-slot.selectionRequired);
        try {
          const updated = prescriptionEngine.updateMesocycleSelection(mesocycle, slotId, selected);
          commit({ ...data, mesocycles: data.mesocycles.map((item) => item.id === mesocycleId ? updated : item) });
          showAppToast("Program portfolio updated and every session was rechecked.");
        } catch (error) {
          showAppToast(error?.message || "Exercise selection could not be updated.");
        }
      }

      function deleteMesocycleDraft(mesocycleId) {
        const mesocycle = data.mesocycles.find((item) => item.id === mesocycleId);
        if (!mesocycle || !prescriptionEngine?.canDeleteMesocycle(mesocycle)) return showAppToast("Completed or previously activated mesocycles are protected. Archive them instead.");
        commit({ ...data, mesocycles: data.mesocycles.filter((item) => item.id !== mesocycleId) });
        pendingDeleteMesocycleId = "";
      }

      function mesocycleRoleExplanation(role) {
        return ({
          primary_progression_lift: "Primary progression lift: placed early enough to track measurable load or repetition progress.",
          secondary_hypertrophy_lift: "Secondary hypertrophy lift: adds target-muscle work without competing with the primary progression role.",
          low_fatigue_accessory: "Lower-fatigue accessory: adds useful volume with less systemic, spinal, or grip cost.",
          maintenance_lift: "Maintenance lift: retains skill and stimulus with conservative volume.",
          deload_variation: "Deload variation: preserves the movement goal while reducing stress or staleness."
        })[role] || "This role defines how the exercise contributes to the complete program.";
      }

      function renderMesocycleCandidate(candidate, pool, slot, mesocycle) {
        const replacement = pool.candidates.find((item) => item.exerciseId === candidate.preferredReplacementExerciseId);
        const selected = slot.selectedExerciseIds.includes(candidate.exerciseId);
        const score = Math.round(candidate.scores.predictedProgramEffectiveness ?? candidate.scores.overallRecommendationStrength);
        const compared = mesocycleComparisonIds.includes(candidate.exerciseId);
        const alternatesExpanded = expandedMesocycleAlternateSlots.has(slot.id);
        if (!selected && !alternatesExpanded) return "";
        return `
          <article class="mesocycle-candidate ${candidate.rank === 1 ? "top-candidate" : ""} ${selected ? 'selected' : ''}">
            <div class="row split"><div class="candidate-heading"><span class="recommendation-badge">${selected ? 'Selected for Program' : candidate.rank === 1 ? 'Recommended for This Slot' : 'Alternative Replacement'}</span><strong>${escapeHtml(candidate.exerciseName)}</strong><div class="portfolio-badges"><span class="metadata-badge">${escapeHtml(presentationLabel(pool.muscleGroupId))}</span><span class="metadata-badge neutral">${escapeHtml(presentationLabel(candidate.intendedRole))}</span>${candidate.diversitySignature?.movement && candidate.diversitySignature.movement !== 'unknown' ? '<span class="metadata-badge neutral">' + escapeHtml(presentationLabel(candidate.diversitySignature.movement)) + '</span>' : ''}</div></div><div class="candidate-score" aria-label="Predicted Program Effectiveness ${score} out of 100"><strong>${score}</strong><span>/ 100</span><small>Predicted Program Effectiveness</small></div></div>
            <div class="candidate-actions"><button type="button" data-action="select-mesocycle-candidate" data-mesocycle-id="${mesocycle.id}" data-slot-id="${slot.id}" data-exercise-id="${candidate.exerciseId}" aria-pressed="${selected}">${selected ? 'Selected for Program' : 'Use as Replacement'}</button><button type="button" data-action="compare-mesocycle-candidate" data-exercise-id="${candidate.exerciseId}" aria-pressed="${compared}">${compared ? 'Remove from Comparison' : 'Compare Details'}</button>${selected && candidate.exerciseId === slot.selectedExerciseIds[0] ? '<button class="alternates-toggle" type="button" data-action="toggle-mesocycle-alternates" data-slot-id="' + slot.id + '" aria-expanded="' + alternatesExpanded + '">' + (alternatesExpanded ? 'Hide Alternates' : 'View Alternates (' + pool.candidates.filter((item) => !slot.selectedExerciseIds.includes(item.exerciseId)).length + ')') + '</button>' : ''}</div>
            <div class="candidate-detail-grid">
              <div><span>Full-program fit</span><strong>${Math.round(candidate.scores.fullProgramFit ?? 100)} / 100</strong></div>
              <div><span>Target-muscle effectiveness</span><strong>${Math.round(candidate.scores.targetMuscleEffectiveness ?? candidate.scores.overallRecommendationStrength)} / 100</strong></div>
              <div><span>Confidence</span><strong>${escapeHtml(presentationLabel(candidate.personalDataConfidence))}</strong></div>
              <div><span>Evidence</span><strong>${escapeHtml(candidate.sourceTrace?.explanation || candidate.scores.weightingReason)}</strong></div>
              <div><span>Target Muscles</span><strong>${escapeHtml([...candidate.primaryMuscles, ...candidate.secondaryMuscles].map(presentationLabel).join(', ') || presentationLabel(pool.muscleGroupId))}</strong></div>
              <div><span>Structure</span><strong>${escapeHtml(presentationLabel(candidate.recommendedSetStructure))}</strong></div>
              <div><span>Sets</span><strong>${escapeHtml(prescriptionMetric(candidate.recommendedSetRange))}</strong></div>
              <div><span>Reps</span><strong>${escapeHtml(prescriptionMetric(candidate.recommendedRepRange))}</strong></div>
              <div><span>Effort</span><strong>RPE ${escapeHtml(candidate.recommendedRpe.min + '-' + candidate.recommendedRpe.max)} · RIR ${escapeHtml(candidate.recommendedRir.min + '-' + candidate.recommendedRir.max)}</strong></div>
              <div><span>Frequency</span><strong>${escapeHtml(prescriptionMetric(candidate.recommendedFrequency, '/week'))}</strong></div>
              ${candidate.equipmentRequirements?.length ? '<div><span>Equipment</span><strong>' + escapeHtml(candidate.equipmentRequirements.map((option) => option.map(presentationLabel).join(' + ')).join(' or ')) + '</strong></div>' : ''}
              ${candidate.jointActions?.length ? '<div><span>Joint Actions</span><strong>' + escapeHtml(candidate.jointActions.map(presentationLabel).join(', ')) + '</strong></div>' : ''}
            </div>
            <div class="recommendation-details-body"><section class="recommendation-detail"><h4>Role in the Program</h4><p>${escapeHtml(mesocycleRoleExplanation(candidate.intendedRole))}</p></section><section class="recommendation-detail"><h4>Why It Belongs</h4><p>${escapeHtml(candidate.reasonForMesocycle)}</p></section><section class="recommendation-detail"><h4>Progression</h4><p>${escapeHtml(candidate.progressionInstruction)}</p></section><section class="recommendation-detail"><h4>Deload and Rotation Triggers</h4><p>${escapeHtml(candidate.deloadTrigger)} ${escapeHtml(candidate.rotationTrigger)}</p></section><section class="recommendation-detail"><h4>Preferred Replacement</h4><p>${escapeHtml(replacement?.exerciseName || (candidate.preferredReplacementExerciseId ? presentationLabel(candidate.preferredReplacementExerciseId) : 'Choose the next diversified same-function option'))}</p></section></div>
            <details class="score-explanation"><summary>Why the Score?</summary><div class="score-explanation-body"><div class="score-explanation-grid"><div><span>Mesocycle Objective</span><strong>${escapeHtml(mesocycleTypeLabel(mesocycle.type))}: ${escapeHtml(candidate.reasonForMesocycle)}</strong></div><div><span>Target-Muscle Fit</span><strong>${Math.round(candidate.scores.targetMuscleEffectiveness ?? candidate.scores.overallRecommendationStrength)} / 100 for ${escapeHtml(presentationLabel(pool.muscleGroupId))}</strong></div><div><span>Taxonomy Basis</span><strong>${escapeHtml((candidate.muscleRelationships || []).map((mapping) => presentationLabel(mapping.muscle_group_id) + ': ' + presentationLabel(mapping.relationship_type) + (Number(mapping.fractional_set_credit || 0) ? ' (' + Number(mapping.fractional_set_credit) + ' set credit)' : ' (fatigue only)')).join(' · ') || 'Comparable exercise-family evidence is incomplete; confidence is limited.')}</strong></div><div><span>Equipment Compatibility</span><strong>${escapeHtml(candidate.equipmentRequirements?.length ? candidate.equipmentRequirements.map((option) => option.map(presentationLabel).join(' + ')).join(' or ') : 'Verified requirements are incomplete; confidence is limited.')}</strong></div><div><span>Personal Evidence</span><strong>${escapeHtml(presentationLabel(candidate.personalDataConfidence))}: ${escapeHtml(candidate.scores.weightingReason)}</strong></div><div><span>Progression Potential</span><strong>${Math.round(candidate.scores.easeOfProgression || 0)} / 100 · ${escapeHtml(presentationLabel(candidate.progressionMethod))}</strong></div><div><span>Fatigue Cost</span><strong>Local ${Math.round(candidate.scores.fatigueCost || 0)} · systemic ${Math.round(candidate.scores.systemicFatigue || 0)} · spinal ${Math.round(candidate.scores.spinalLoad || 0)} · grip ${Math.round(candidate.scores.gripDemand || 0)}</strong></div><div><span>Program Redundancy</span><strong>${escapeHtml(candidate.scoreExplanation?.limitingFactors?.find((factor) => /redundan|overlap|already/i.test(factor)) || 'No confirmed mechanical duplication reduced this score.')}</strong></div><div><span>Stability and Technique</span><strong>Stability ${Math.round(candidate.scores.stability || 0)} / 100 · ${escapeHtml(candidate.setStructureReason)}</strong></div></div><div><strong>Factors that raised the score</strong><ul class="score-factor-list">${(candidate.scoreExplanation?.positiveFactors || [candidate.scores.weightingReason]).map((factor) => '<li>' + escapeHtml(factor) + '</li>').join('')}</ul></div>${candidate.scoreExplanation?.limitingFactors?.length ? '<div><strong>Factors that reduced or limit the score</strong><ul class="score-factor-list">' + candidate.scoreExplanation.limitingFactors.map((factor) => '<li>' + escapeHtml(factor) + '</li>').join('') + '</ul></div>' : ''}</div></details>
          </article>
        `;
      }

      function renderMesocycleCard(mesocycle) {
        const poolKeys = Object.keys(mesocycle.pools || {});
        const selectedMuscle = poolKeys.includes(selectedPrescriptionPoolMuscle) ? selectedPrescriptionPoolMuscle : poolKeys[0];
        const pool = mesocycle.pools?.[selectedMuscle];
        const slot = mesocycle.programSlots?.find((item) => item.muscleGroupId === selectedMuscle);
        const comparison = pool?.candidates.filter((candidate) => mesocycleComparisonIds.includes(candidate.exerciseId)).slice(0, 3) || [];
        const warnings = mesocycle.programReview?.warnings || [];
        const startDate = mesocycle.startedAt || "";
        const endDate = mesocycle.completedAt || mesocycle.abandonedAt || "";
        const primaryActions = [];
        const secondaryActions = [];
        const destructiveActions = [];
        if (["draft", "planned", "active"].includes(mesocycle.status)) secondaryActions.push('<button type="button" data-action="toggle-mesocycle-planner-review">Close Planner Review</button>');
        if (mesocycle.status === "draft") primaryActions.push('<button class="primary-action" type="button" data-action="mesocycle-transition" data-mesocycle-action="plan" data-mesocycle-id="' + mesocycle.id + '" ' + ((mesocycle.omittedMuscleGroups || []).length && !mesocycle.scopeConfirmed ? 'disabled title="Confirm omitted muscle groups first"' : '') + '>Use Draft</button>');
        if (mesocycle.status === "planned") primaryActions.push('<button class="primary-action" type="button" data-action="mesocycle-transition" data-mesocycle-action="start" data-mesocycle-id="' + mesocycle.id + '" ' + (mesocycle.programReview?.blockingIssueCount ? 'disabled title="Resolve blocking program issues first"' : '') + '>Activate Mesocycle</button>');
        if (mesocycle.status === "active") primaryActions.push('<button class="primary-action" type="button" data-action="mesocycle-transition" data-mesocycle-action="complete" data-mesocycle-id="' + mesocycle.id + '">Complete Mesocycle</button>');
        if (["completed", "abandoned"].includes(mesocycle.status)) secondaryActions.push('<button type="button" data-action="mesocycle-transition" data-mesocycle-action="archive" data-mesocycle-id="' + mesocycle.id + '">Archive</button>');
        if (["completed", "archived"].includes(mesocycle.status)) secondaryActions.push('<button type="button" data-action="mesocycle-transition" data-mesocycle-action="review" data-mesocycle-id="' + mesocycle.id + '">Review Outcomes</button>');
        if (["draft", "planned", "active"].includes(mesocycle.status)) destructiveActions.push('<button class="danger" type="button" data-action="mesocycle-transition" data-mesocycle-action="abandon" data-mesocycle-id="' + mesocycle.id + '">Abandon</button>');
        if (prescriptionEngine?.canDeleteMesocycle(mesocycle)) destructiveActions.push(pendingDeleteMesocycleId === mesocycle.id ? '<span><button class="danger" type="button" data-action="confirm-delete-mesocycle" data-mesocycle-id="' + mesocycle.id + '">Confirm Delete</button><button type="button" data-action="cancel-delete-mesocycle">Cancel</button></span>' : '<button class="danger" type="button" data-action="request-delete-mesocycle" data-mesocycle-id="' + mesocycle.id + '">Delete Unused Draft</button>');
        const slotAlternatesExpanded = slot ? expandedMesocycleAlternateSlots.has(slot.id) : false;
        const selectedCandidates = pool && slot ? pool.candidates.filter((candidate) => slot.selectedExerciseIds.includes(candidate.exerciseId)).sort((a, b) => b.scores.predictedProgramEffectiveness - a.scores.predictedProgramEffectiveness) : [];
        const alternateCandidates = pool && slot ? pool.candidates.filter((candidate) => !slot.selectedExerciseIds.includes(candidate.exerciseId)) : [];
        const muscleVolumeReview = '<section class="muscle-volume-review"><div class="section-heading"><div><h3>Weekly Muscle Volume</h3><p>Direct sets receive full credit. Exercise-specific fractional work contributes 0.25 or 0.5; incidental and isometric work are tracked separately from hypertrophy volume.</p></div></div><div class="session-plan-grid">' + (mesocycle.programReview?.musclePlans || []).map((plan) => { const range = mesocycleVolumeRange(plan.weeklyTargetRange, plan.weeklyTargetVolume); const status = plan.directSets < range.min ? 'Below Target' : plan.effectiveSets > range.max ? 'Above Target' : 'Within Target'; return '<article class="program-session volume-summary-card"><div class="row split"><div><strong>' + escapeHtml(presentationLabel(plan.muscleGroupId)) + '</strong><div class="muscle-volume-number">' + plan.directSets + '</div><small>Direct Weekly Sets</small></div><span class="status-pill ' + (status === 'Within Target' ? 'good' : 'deload') + '">' + status + '</span></div><div class="muscle-plan-metrics"><div><span>Fractional Contribution</span><strong>' + Number(plan.secondarySets ?? plan.indirectSets ?? 0) + '</strong></div><div><span>Weighted Stimulus</span><strong>' + plan.effectiveSets + '</strong></div><div><span>Isometric Exposure</span><strong>' + Number(plan.isometricExposure || 0) + '</strong></div><div><span>Target</span><strong>' + range.min + '–' + range.max + '</strong></div><div><span>Frequency</span><strong>' + plan.plannedFrequency + ' / Week</strong></div></div><small>Taxonomy ' + escapeHtml(plan.taxonomyVersion || prescriptionEvidenceStatus.researchVersion) + '</small></article>'; }).join('') + '</div></section>';
        const renderReviewFindings = (items) => items.map((warning) => '<article class="review-finding"><strong>' + escapeHtml(warning.conflict) + '</strong><span>' + escapeHtml(warning.why) + '</span><small>Recommended action: ' + escapeHtml(warning.recommendation) + '</small></article>').join('');
        const reviewCategories = [
          { key: 'blocking', label: 'Blocking Issues', className: 'blocking', items: warnings.filter((item) => item.severity === 'blocking'), open: true },
          { key: 'recommended', label: 'Recommended Changes', className: 'recommended', items: warnings.filter((item) => item.severity === 'serious') },
          { key: 'warnings', label: 'Warnings', className: '', items: warnings.filter((item) => ['warning', 'review'].includes(item.severity)) },
          { key: 'suggestions', label: 'Optional Suggestions', className: '', items: warnings.filter((item) => item.severity === 'informational' && item.correctiveAction) }
        ];
        const hasActionableFindings = reviewCategories.some((category) => category.items.length);
        const compactProgramReview = '<section class="compact-program-review"><div class="section-heading"><div><div class="section-kicker">Program Check</div><h3>Full Program Review</h3><p>Sessions first; only unresolved findings that affect the program are shown.</p></div><span class="status-pill ' + (mesocycle.programReview?.blockingIssueCount ? 'deload' : 'good') + '">' + (mesocycle.programReview?.blockingIssueCount || 0) + ' Blocking</span></div><div class="review-session-grid">' + (mesocycle.sessions || []).map((session) => '<article class="review-session-card"><header class="review-session-header"><div class="review-session-title"><strong>' + escapeHtml(session.name + ' · ' + (session.primaryPurpose || session.workoutType || 'Training')) + '</strong><span>' + session.exercises.length + ' exercises · ' + (session.workingSetCount ?? session.exercises.reduce((total, exercise) => total + Number(exercise.plannedSets || 0), 0)) + ' working sets</span></div><strong>~' + Math.round(session.estimatedDurationMinutes) + ' min</strong></header><ul class="review-session-exercises">' + session.exercises.map((exercise) => '<li><div><strong>' + escapeHtml(exercise.exerciseName) + '</strong><small>' + escapeHtml(exercise.targetMuscleGroupIds.map(presentationLabel).join(', ')) + '</small></div><div><span class="metadata-badge">' + escapeHtml(presentationLabel(exercise.intendedRole)) + '</span><small>' + escapeHtml(exercise.equipmentRequirements?.length ? exercise.equipmentRequirements.map((option) => option.map(presentationLabel).join(' + ')).join(' or ') : 'Equipment metadata pending') + '</small></div><strong>' + (exercise.plannedSets || 0) + ' × ' + escapeHtml(prescriptionMetric(exercise.recommendedRepRange)) + '</strong></li>').join('') + '</ul><div class="session-metrics"><span>Systemic ' + Math.round(session.systemicFatigue) + '</span><span>Spinal ' + Math.round(session.spinalLoad) + '</span><span>Grip ' + Math.round(session.gripDemand) + '</span><span>Joint ' + Math.round(session.jointStress) + '</span></div></article>').join('') + '</div>' + (hasActionableFindings ? '<div class="review-groups">' + reviewCategories.map((category) => category.items.length ? '<details class="review-group ' + category.className + '" ' + (category.open ? 'open' : '') + '><summary><span>' + category.label + '</span><span>' + category.items.length + '</span></summary><div class="review-group-body">' + renderReviewFindings(category.items) + '</div></details>' : '').join('') + '</div><button type="button" class="secondary-action" data-action="regenerate-mesocycle" data-mesocycle-id="' + mesocycle.id + '">Regenerate with Practical Limits</button><p class="settings-note">Rebuilds affected sessions while enforcing the 18-set daily maximum, two-exercise muscle limit, major-muscle priority, and recovery spacing. Schedule-capacity conflicts may still require more days or less scope.</p>' : '') + '</section>';
        return `
          <article class="mesocycle-card ${mesocycle.status === 'active' ? 'active-mesocycle' : ''}">
            <div class="row split"><div><div class="section-kicker">${escapeHtml(mesocycleTypeLabel(mesocycle.type))}</div><h2>${escapeHtml(mesocycle.name)}</h2></div><span class="status-pill ${mesocycle.status === 'active' ? 'good' : 'neutral'}">${escapeHtml(presentationLabel(mesocycle.status))}</span></div>
            <section class="mesocycle-summary-grid" aria-label="Mesocycle summary"><div class="mesocycle-summary-item"><span>Duration</span><strong>${mesocycle.durationWeeks} Weeks</strong></div><div class="mesocycle-summary-item"><span>Purpose</span><strong>${escapeHtml(mesocycleTypeLabel(mesocycle.type))}</strong></div><div class="mesocycle-summary-item"><span>Frequency</span><strong>${mesocycle.trainingDays} Days / Week</strong></div><div class="mesocycle-summary-item"><span>Program Size</span><strong>${mesocycle.selectedPortfolio?.length || mesocycle.activeExercises.length} Exercises</strong></div><div class="mesocycle-summary-item"><span>Calculated From</span><strong>${escapeHtml(mesocycle.durationBasis)}</strong></div><div class="mesocycle-summary-item"><span>Created</span><strong>${formatDate(mesocycle.createdAt)}</strong></div><div class="mesocycle-summary-item"><span>Start</span><strong>${startDate ? formatDate(startDate) : 'Not Started'}</strong></div><div class="mesocycle-summary-item"><span>End</span><strong>${endDate ? formatDate(endDate) : 'Not Ended'}</strong></div></section>
            ${(mesocycle.omittedMuscleGroups || []).length ? '<section class="scope-confirmation ' + (mesocycle.omittedMuscleGroups.some((item) => item.importance === "major") ? 'major' : '') + '"><div><div class="section-kicker">Training Scope</div><strong>Intentionally Omitted Muscle Groups</strong><p class="settings-note">These groups receive no dedicated slot. Review what each muscle contributes, then add it or confirm the exclusion.</p></div>' + mesocycle.omittedMuscleGroups.map((item) => { const education = muscleGroupEducation(item.muscleGroupId); return '<article class="omitted-muscle"><div class="row split"><strong>' + escapeHtml(presentationLabel(item.muscleGroupId)) + '</strong>' + (item.importance === 'major' ? '<span class="status-pill rest">Major Muscle Group</span>' : '<span class="status-pill neutral">Optional Scope</span>') + '</div><details><summary>Why Train This Muscle Group?</summary>' + (education.functions.length ? '<ul class="score-factor-list">' + education.functions.map((entry) => '<li>' + escapeHtml(entry) + '</li>').join('') + '</ul>' : '') + '<p>' + escapeHtml(education.consequence) + '</p></details><button class="mini-button" type="button" data-action="add-mesocycle-muscle" data-mesocycle-id="' + mesocycle.id + '" data-muscle-group-id="' + escapeHtml(item.muscleGroupId) + '">Add to Mesocycle</button></article>'; }).join('') + (!mesocycle.scopeConfirmed ? '<button class="secondary-action" type="button" data-action="confirm-mesocycle-scope" data-mesocycle-id="' + mesocycle.id + '">Keep These Exclusions and Continue</button>' : '<span class="status-pill good">Exclusions Confirmed</span>') + '</section>' : ''}
            <details class="compact-disclosure" open><summary>Selected Program-Wide Exercise Portfolio <span>${mesocycle.selectedPortfolio?.length || 0}</span></summary><div class="disclosure-body"><ul class="portfolio-list">${(mesocycle.selectedPortfolio || []).map((candidate) => '<li class="portfolio-item"><strong>' + escapeHtml(candidate.exerciseName) + '</strong><div class="portfolio-badges"><span class="metadata-badge">' + escapeHtml(candidate.targetMuscleGroupIds.map(presentationLabel).join(', ')) + '</span><span class="metadata-badge neutral">' + escapeHtml(presentationLabel(candidate.intendedRole)) + '</span><span class="metadata-badge neutral">' + escapeHtml(candidate.intendedRole === 'primary_progression_lift' ? 'Primary Movement' : 'Secondary Movement') + '</span></div>' + (candidate.selectionReason && !candidate.selectionReason.startsWith('Highest predicted effectiveness') ? '<small>' + escapeHtml(candidate.selectionReason) + '</small>' : '') + '</li>').join('')}</ul></div></details>
            <div class="mesocycle-actions"><div class="action-group">${primaryActions.join('')}${secondaryActions.join('')}</div>${destructiveActions.length ? '<div class="action-group destructive-actions">' + destructiveActions.join('') + '</div>' : ''}</div>
            <section class="exercise-assignment-section"><div class="section-heading"><div><div class="section-kicker">Exercise Portfolio</div><h3>Exercise Assignments</h3><p>Review where each selected exercise contributes, then open an assignment to compare or replace its exercise.</p></div></div><details class="program-slot-nav"><summary>Browse Exercise Assignments <span>${mesocycle.programSlots?.length || 0}</span></summary><div class="program-slot-nav-panel">${(mesocycle.programSlots || []).map((programSlot) => '<button class="program-slot-jump" type="button" data-action="jump-mesocycle-slot" data-muscle-group-id="' + escapeHtml(programSlot.muscleGroupId) + '" aria-current="' + (programSlot.muscleGroupId === selectedMuscle) + '"><span>' + escapeHtml(presentationLabel(programSlot.muscleGroupId)) + '</span><small>' + escapeHtml(presentationLabel(programSlot.role)) + '</small></button>').join('')}</div></details>
            ${pool && slot ? '<label class="candidate-muscle-select">Review Exercise Assignment<select data-action="mesocycle-pool-muscle">' + poolKeys.map((muscle) => '<option value="' + escapeHtml(muscle) + '" ' + (muscle === selectedMuscle ? 'selected' : '') + '>' + escapeHtml(presentationLabel(muscle)) + '</option>').join('') + '</select></label><section class="program-slot-summary"><div class="slot-summary-header"><div><div class="section-kicker">Exercise Assignment</div><h3>' + escapeHtml(presentationLabel(slot.muscleGroupId)) + '</h3></div><div class="portfolio-badges"><span class="metadata-badge">' + escapeHtml(presentationLabel(slot.role)) + '</span><span class="metadata-badge neutral">Choose ' + slot.selectionRequired + '</span><span class="metadata-badge neutral">' + slot.weeklyExposuresTarget + '× / Week</span></div></div><div class="slot-selection-grid"><div class="slot-selection-group"><span>Selected Exercises</span><div class="exercise-chip-list">' + (slot.selectedExerciseIds.map((id) => '<span class="exercise-chip">' + escapeHtml(pool.candidates.find((candidate) => candidate.exerciseId === id)?.exerciseName || presentationLabel(id)) + '</span>').join('') || '<span class="settings-note">Selection required</span>') + '</div></div><div class="slot-selection-group"><span>Assigned Sessions</span><div class="session-badge-list">' + (slot.plannedSessionIds.map((id) => '<span class="session-badge">' + escapeHtml(presentationLabel(id)) + '</span>').join('') || '<span class="settings-note">Assigned after selection</span>') + '</div></div></div><div class="portfolio-badges"><span class="metadata-badge neutral">' + mesocycleVolumeRange(slot.weeklySetsRange, slot.weeklySetsTarget).min + '–' + mesocycleVolumeRange(slot.weeklySetsRange, slot.weeklySetsTarget).max + ' Effective Sets</span><span class="metadata-badge neutral">' + slot.weeklyExposuresTarget + ' Weekly Exposures</span></div></section><div class="mesocycle-pool"><h3>Top Exercise Candidates</h3><p class="settings-note">Select the exercise you want to use for this role. Candidates are ranked using your performance history, program compatibility, fatigue cost, equipment, and research evidence. The remaining options are alternatives for substitutions or future mesocycles—you are not expected to perform all five.</p>' + pool.candidates.map((candidate) => renderMesocycleCandidate(candidate, pool, slot, mesocycle)).join('') + (pool.excludedCandidates?.length ? '<details><summary>Why Eligible Exercises Were Excluded</summary><ul class="score-factor-list">' + pool.excludedCandidates.map((item) => '<li><strong>' + escapeHtml(item.exerciseName) + ':</strong> ' + escapeHtml(item.explanation) + '</li>').join('') + '</ul></details>' : '') + '</div>' : ''}</section>
            ${comparison.length ? '<section class="candidate-comparison"><div class="section-heading"><div><h3>Candidate Comparison</h3><p>Compare mechanical role, equipment, fatigue, progression, and placement—not just the headline score.</p></div></div>' + comparison.map((candidate) => '<article class="comparison-card"><strong>' + escapeHtml(candidate.exerciseName) + '</strong><div class="candidate-detail-grid"><div><span>Effectiveness</span><strong>' + Math.round(candidate.scores.predictedProgramEffectiveness) + '/100</strong></div><div><span>Movement Pattern</span><strong>' + escapeHtml(candidate.diversitySignature?.movement && candidate.diversitySignature.movement !== 'unknown' ? presentationLabel(candidate.diversitySignature.movement) : 'Metadata Review Needed') + '</strong></div><div><span>Primary Muscles</span><strong>' + escapeHtml(candidate.primaryMuscles.map(presentationLabel).join(', ')) + '</strong></div><div><span>Equipment</span><strong>' + escapeHtml(candidate.equipmentRequirements?.length ? candidate.equipmentRequirements.map((option) => option.map(presentationLabel).join(' + ')).join(' or ') : 'Metadata Review Needed') + '</strong></div><div><span>Stability Demand</span><strong>' + escapeHtml(presentationLabel(candidate.diversitySignature?.stability)) + '</strong></div><div><span>Progression</span><strong>' + escapeHtml(presentationLabel(candidate.progressionMethod)) + '</strong></div><div><span>Systemic / Spinal / Grip</span><strong>' + Math.round(candidate.scores.systemicFatigue) + ' / ' + Math.round(candidate.scores.spinalLoad) + ' / ' + Math.round(candidate.scores.gripDemand) + '</strong></div><div><span>Program Placement</span><strong>' + escapeHtml((mesocycle.sessions || []).find((session) => session.exercises.some((item) => item.exerciseId === candidate.exerciseId))?.name || 'Alternative only') + '</strong></div></div>' + (candidate.scoreExplanation?.limitingFactors?.length ? '<small>' + escapeHtml(candidate.scoreExplanation.limitingFactors.join(' ')) + '</small>' : '') + '</article>').join('') + '</section>' : ''}
            <section class="program-review-grid"><div class="section-heading"><div><h3>Full Program Review</h3><p>Weekly volume, frequency, split coherence, recovery, and fatigue are validated before activation.</p></div><span class="status-pill ${mesocycle.programReview?.seriousWarningCount ? 'deload' : 'good'}">${mesocycle.programReview?.blockingIssueCount || 0} Blocking · ${mesocycle.programReview?.seriousWarningCount || 0} Total</span></div><div class="session-plan-grid">${(mesocycle.sessions || []).map((session) => '<article class="program-session"><div class="row split"><div><strong>' + escapeHtml(session.name) + '</strong><small>' + escapeHtml(session.primaryPurpose || session.baseSessionIntent) + '</small></div><span>~' + Math.round(session.estimatedDurationMinutes) + ' min</span></div><ol class="score-factor-list">' + session.exercises.map((exercise) => '<li><strong>' + escapeHtml(exercise.exerciseName) + '</strong> · ' + (exercise.plannedSets || 0) + ' sets · ' + escapeHtml(presentationLabel(exercise.intendedRole)) + ' · ' + escapeHtml(prescriptionMetric(exercise.recommendedRepRange)) + ' reps</li>').join('') + '</ol><small>Systemic ' + Math.round(session.systemicFatigue) + ' · Spinal ' + Math.round(session.spinalLoad) + ' · Grip ' + Math.round(session.gripDemand) + '</small></article>').join('')}</div><div class="session-plan-grid">${(mesocycle.programReview?.musclePlans || []).map((plan) => '<article class="muscle-plan"><div class="row split"><strong>' + escapeHtml(presentationLabel(plan.muscleGroupId)) + '</strong><span class="status-pill ' + (plan.targetMet ? 'good' : 'deload') + '">' + (plan.targetMet ? 'Target Met' : 'Needs Adjustment') + '</span></div><span>' + mesocycleVolumeRange(plan.weeklyTargetRange, plan.weeklyTargetVolume).min + '–' + mesocycleVolumeRange(plan.weeklyTargetRange, plan.weeklyTargetVolume).max + ' target sets · ' + plan.directSets + ' direct · ' + plan.indirectSets + ' indirect</span><small>' + plan.plannedFrequency + ' of ' + plan.targetFrequency + ' weekly exposures · ' + escapeHtml(plan.sessionIds.map(presentationLabel).join(', ')) + '</small></article>').join('')}</div>${warnings.map((warning) => '<article class="program-warning ' + warning.severity + '"><strong>' + escapeHtml(presentationLabel(warning.severity)) + ': ' + escapeHtml(warning.conflict) + '</strong><span>' + escapeHtml(warning.why) + '</span><small>Recommended resolution: ' + escapeHtml(warning.recommendation) + '</small></article>').join('') || '<div class="empty-state">No blocking volume, frequency, placement, fatigue, spinal-load, grip, redundancy, equipment, or duration conflict was found.</div>'}<details class="recommendation-details"><summary>Why This Mesocycle Fits Together</summary><div class="recommendation-details-body"><ul class="score-factor-list">${(mesocycle.programReview?.explanation || []).map((item) => '<li>' + escapeHtml(item) + '</li>').join('')}</ul></div></details></section>
            ${compactProgramReview}
            ${muscleVolumeReview}
          </article>
        `;
      }

      function renderGuidedMusclePrioritySummary(draft, compact = false) {
        const statuses = guidedMuscleStatuses(draft);
        const unresolved = statuses.filter((item) => item.overallStatus !== 'within');
        const completed = statuses.filter((item) => item.overallStatus === 'within');
        const visible = compact ? unresolved.slice(0, 6) : unresolved;
        const labelFor = (item, index) => item.overallStatus === 'above' ? 'Above Target' : item.overallStatus === 'needs_frequency' ? 'Needs Frequency' : item.overallStatus === 'needs_distribution' ? 'Needs Distribution' : (index === 0 ? 'Recommended · ' : '') + 'Below Target';
        const classFor = (item) => item.overallStatus === 'above' ? 'deload' : item.overallStatus === 'within' ? 'good' : 'rest';
        const rows = visible.length ? visible.map((item, index) => '<button type="button" data-action="choose-guided-muscle" data-muscle-group-id="' + escapeHtml(item.muscleGroupId) + '" class="guided-priority-row ' + item.overallStatus + '"><span><strong>' + escapeHtml(presentationLabel(item.muscleGroupId)) + '</strong><small>' + item.totalEffectiveSets + ' total effective sets · ' + item.directSets + ' direct + ' + item.fractionalSets + ' fractional · target ' + item.targetRange.min + '–' + item.targetRange.max + '</small></span><span><b>' + item.setsRemaining + '</b><small>effective sets to minimum</small></span><span class="status-pill ' + classFor(item) + '">' + labelFor(item, index) + '</span><small>Frequency ' + (item.frequencyTarget - item.frequencyRemaining) + ' of ' + item.frequencyTarget + '</small></button>').join('') : '<div class="empty-state">No unresolved muscle-group requirements.</div>';
        const completedPanel = completed.length ? '<details class="guided-completed-summary"><summary>Completed · ' + completed.length + ' muscle group' + (completed.length === 1 ? '' : 's') + '</summary><div class="guided-priority-list">' + completed.map((item) => '<button type="button" data-action="choose-guided-muscle" data-muscle-group-id="' + escapeHtml(item.muscleGroupId) + '" class="guided-priority-row within"><span><strong>' + escapeHtml(presentationLabel(item.muscleGroupId)) + '</strong><small>' + item.totalEffectiveSets + ' total effective sets · target ' + item.targetRange.min + '–' + item.targetRange.max + '</small></span><span class="status-pill good">Within Target</span><small>Frequency ' + item.frequencyTarget + ' of ' + item.frequencyTarget + '</small></button>').join('') + '</div></details>' : '';
        return '<section class="guided-priority-summary"><div class="row split"><div><div class="section-kicker">Volume Remaining</div><strong>Needs Attention</strong></div>' + (compact ? '<button type="button" data-action="open-guided-weekly">View All</button>' : '') + '</div><div class="guided-priority-list">' + rows + '</div>' + completedPanel + '</section>';
      }

      function renderGuidedExerciseWorkspace(draft, headerHtml) {
        const muscles = draft.includedMuscleGroupIds || [];
        const statuses = guidedMuscleStatuses(draft);
        guidedExerciseMuscleFilter = muscles.includes(guidedExerciseMuscleFilter) ? guidedExerciseMuscleFilter : statuses[0]?.muscleGroupId || muscles[0];
        const day = draft.guidedDays.find((item) => item.id === guidedExerciseBrowserDayId);
        const query = normalizePrescriptionIdentity(guidedExerciseSearch);
        const pool = guidedCandidatePool(guidedExerciseMuscleFilter).filter((item) => !query || normalizePrescriptionIdentity(item.exerciseName).includes(query));
        const targetStatus = statuses.find((item) => item.muscleGroupId === guidedExerciseMuscleFilter);
        const pending = guidedPendingAssignment;
        const dayLedger = guidedLedger(draft).dayTotals.find((item) => item.dayId === guidedExerciseBrowserDayId) || { workingSets: 0, muscles: [] };
        const sameMuscleExercises = day?.assignments.filter((item) => (item.primaryMuscles || [item.muscleGroupId]).map(prescriptionApi.muscleFamily).includes(prescriptionApi.muscleFamily(guidedExerciseMuscleFilter))).length || 0;
        const pendingWarnings = pending ? [
          dayLedger.workingSets + pending.workingSets > guidedMesocycleApi.PLANNING_RULES.maxWorkingSetsPerDay ? 'This addition would put the day above 18 working sets.' : '',
          sameMuscleExercises >= guidedMesocycleApi.PLANNING_RULES.maxExercisesPerMusclePerDay ? 'This day already has two exercises directly targeting this muscle.' : '',
          targetStatus && targetStatus.totalEffectiveSets + pending.workingSets > targetStatus.targetRange.max ? 'This addition would move the muscle above its total effective-set target range.' : '',
          targetStatus?.frequencyRemaining > targetStatus?.remainingTrainingDays ? 'Too few unprogrammed days remain to reach the default frequency without revising the schedule.' : ''
        ].filter(Boolean) : [];
        const pendingCard = pending ? '<section class="guided-active-config" data-guided-configuration tabindex="-1" aria-labelledby="guided-config-title"><div class="section-kicker">Configuring Now</div><h2 id="guided-config-title">' + escapeHtml(pending.name) + '</h2><div class="metadata-tags"><span class="metadata-tag">Target: ' + escapeHtml(presentationLabel(pending.muscleGroupId)) + '</span><span class="metadata-tag">' + Math.round(pending.targetMuscleEffectiveness || 0) + '/100 ' + escapeHtml(presentationLabel(pending.muscleGroupId)) + ' Effectiveness</span><span class="metadata-tag">' + escapeHtml(presentationLabel(pending.setStructure)) + '</span></div><div class="set-stepper"><button type="button" data-action="guided-pending-set-change" data-delta="-1" aria-label="Remove one planned working set">−</button><output>' + pending.workingSets + ' planned sets</output><button type="button" data-action="guided-pending-set-change" data-delta="1" aria-label="Add one planned working set">+</button></div><div class="candidate-detail-grid"><div><span>Rep Range</span><strong>' + pending.repRange.min + '–' + pending.repRange.max + '</strong></div><div><span>Effort</span><strong>' + (pending.targetRir ? 'RIR ' + pending.targetRir.min + '–' + pending.targetRir.max : 'RPE ' + pending.targetRpe.min + '–' + pending.targetRpe.max) + '</strong></div><div><span>Rest</span><strong>' + pending.restSeconds + ' sec</strong></div></div>' + pendingWarnings.map((warning) => '<div class="finding"><strong>Programming warning</strong><p>' + escapeHtml(warning) + '</p></div>').join('') + '<div class="row wrap"><button type="button" data-action="cancel-guided-pending">Cancel</button><button class="primary-action" type="button" data-action="confirm-guided-exercise">Add to ' + escapeHtml(day?.name || 'Training Day') + '</button></div></section>' : '';
        return '<section class="guided-builder">' + headerHtml + '<div data-guided-exercise-picker tabindex="-1">' + renderGuidedMusclePrioritySummary(draft, true) + '<div class="section-heading"><div><div class="section-kicker">Exercise Selection</div><h2>Add Exercise to ' + escapeHtml(day?.name || 'Training Day') + '</h2><p>Choose a muscle, then review the target-specific prescription before adding it.</p></div></div><label>Search<input type="search" data-action="guided-exercise-search" value="' + escapeHtml(guidedExerciseSearch) + '"></label><label>Target Muscle<select data-action="guided-exercise-muscle">' + statuses.map((item) => '<option value="' + item.muscleGroupId + '" ' + (item.muscleGroupId === guidedExerciseMuscleFilter ? 'selected' : '') + '>' + escapeHtml(presentationLabel(item.muscleGroupId)) + ' · ' + item.setsRemaining + ' sets remaining</option>').join('') + '</select></label></div>' + pendingCard + '<div class="exercise-browser-results">' + pool.map((candidate) => {
          const validation = guidedMesocycleApi.canAssignExercise(draft, guidedExerciseBrowserDayId, candidate);
          const score = Math.round(candidate.scores?.targetMuscleEffectiveness ?? candidate.scores?.muscleSpecificity ?? 0);
          return '<article class="exercise-browser-card"><div class="section-kicker">' + escapeHtml(presentationLabel(candidate.intendedRole)) + '</div><h3>' + escapeHtml(candidate.exerciseName) + '</h3><strong>' + escapeHtml(presentationLabel(guidedExerciseMuscleFilter)) + ' Effectiveness: ' + score + ' / 100</strong><span>Confidence: ' + escapeHtml(presentationLabel(candidate.personalDataConfidence || candidate.scores?.confidence || 'research_default')) + '</span><span>' + (candidate.recommendedSetRange?.target || 3) + ' sets · ' + (candidate.recommendedRepRange?.min || 8) + '–' + (candidate.recommendedRepRange?.max || 12) + ' reps</span><details><summary>Why for ' + escapeHtml(presentationLabel(guidedExerciseMuscleFilter)) + '?</summary><p>' + escapeHtml(candidate.reasonForMesocycle || 'Canonical target relationship, objective fit, evidence, fatigue, and available equipment inform this estimate.') + '</p></details><button type="button" class="primary-action" data-action="select-guided-exercise" data-day-id="' + guidedExerciseBrowserDayId + '" data-exercise-id="' + escapeHtml(candidate.exerciseId) + '" data-muscle-group-id="' + guidedExerciseMuscleFilter + '" ' + (!validation.allowed ? 'disabled' : '') + '>' + (validation.allowed ? 'Configure Exercise' : 'Already Added to ' + escapeHtml(day?.name || 'This Day')) + '</button></article>';
        }).join('') + '</div><div class="sr-only" aria-live="polite">' + (pending ? 'Configuring ' + escapeHtml(pending.name) : guidedReturnFocusToPicker ? 'Exercise added. Choose the next muscle or exercise.' : '') + '</div></section>';
      }

      function renderGuidedMesocycle() {
        const draft = guidedDraft();
        const progress = (activeIndex) => {
          const progressState = draft?.planningProgress;
          const transientUnlocked = draft ? guidedStepIndex(progressState?.highestUnlockedStep || (draft.guidedDays?.length ? 'build' : 'guide')) : Math.max(activeIndex, activeIndex === 1 ? 1 : 0);
          return '<nav class="guided-progress" aria-label="Mesocycle builder steps">' + guidedMesocycleApi.STEPS.map((step, index) => {
            const label = step.charAt(0).toUpperCase() + step.slice(1);
            const unlocked = index <= transientUnlocked;
            const completed = (progressState?.completedSteps || []).includes(step) || (!draft && index < activeIndex);
            return '<button type="button" class="' + (index === activeIndex ? 'current' : completed ? 'completed' : unlocked ? 'unlocked' : 'locked') + '" data-action="guided-step" data-step="' + step + '" ' + (!unlocked ? 'disabled' : '') + ' aria-current="' + (index === activeIndex ? 'step' : 'false') + '">' + (completed ? '<span aria-hidden="true">✓</span> ' : '') + label + '</button>';
          }).join('') + '</nav>';
        };
        const header = (step, backAction) => '<div class="guided-builder-header"><div class="row split"><button type="button" data-action="' + backAction + '">Back</button><button type="button" data-action="open-guided-guidelines">Programming Guide</button></div>' + progress(step) + '</div>';
        if (guidedMesocycleView === 'guidelines') return '<section class="guided-builder">' + header(0, 'close-guided-mesocycle') + '<div class="section-heading"><div><div class="section-kicker">Before You Build</div><h2>Plan with clear guardrails</h2><p>These practical defaults power the live feedback while you remain in control.</p></div></div><div class="guideline-grid">' + guidedMesocycleApi.PLANNING_RULES.guidelines.map((rule) => '<details class="guideline-card"><summary><strong>' + escapeHtml(rule.title) + '</strong><span>' + escapeHtml(rule.summary) + '</span></summary><p>' + escapeHtml(rule.detail) + '</p></details>').join('') + '</div><button class="primary-action" type="button" data-action="open-guided-setup">Start Planning</button></section>';
        if (guidedMesocycleView === 'setup') {
          const muscles = guidedAvailableMuscles();
          if (!mesocycleScopeDraft) mesocycleScopeDraft = new Set(muscles);
          return '<section class="guided-builder">' + header(1, 'guided-back-guidelines') + '<div class="section-heading"><div><div class="section-kicker">Setup</div><h2>Objective, Schedule, and Constraints</h2><p>These choices create empty training days and evidence-adjusted targets—not an automatic program.</p></div></div><div class="guided-setup-grid"><label>Objective<select data-action="mesocycle-type"><option value="primary_progression">Primary Progression</option><option value="alternative_exercise">Alternative Exercises</option><option value="lower_fatigue_resensitization">Lower Fatigue</option><option value="specialization">Specialization</option></select></label><label>Duration (weeks)<input type="number" min="2" max="12" value="' + escapeHtml(mesocycleDurationDraft || 6) + '" data-action="mesocycle-duration"></label><label>Training Days per Week<input type="number" min="1" max="7" value="' + Number(data.settings.trainingDaysPerWeek || 4) + '" data-action="mesocycle-training-days"></label></div><section class="equipment-picker" role="group" aria-label="Available Equipment"><strong>Available Equipment</strong><div class="equipment-chips">' + mesocycleEquipmentTaxonomy.map(([value,label]) => '<button class="equipment-chip choice-chip" type="button" data-action="toggle-mesocycle-equipment" data-value="' + value + '" aria-pressed="' + mesocycleEquipmentSelection().includes(value) + '">' + label + '</button>').join('') + '</div></section><section class="muscle-scope-panel" role="group" aria-label="Muscle Group Scope"><strong>Muscle Groups and Scope</strong><div class="muscle-scope-options">' + muscles.map((muscle) => '<label class="muscle-scope-option choice-tile"><input type="checkbox" data-action="mesocycle-muscle-scope" value="' + muscle + '" ' + (mesocycleScopeDraft.has(muscle) ? 'checked' : '') + '><span>' + escapeHtml(presentationLabel(muscle)) + '</span></label>').join('') + '</div></section><button class="primary-action" type="button" data-action="create-guided-draft">Create Empty Training Days</button></section>';
        }
        if (!draft) return '';
        if (guidedExerciseBrowserDayId) return renderGuidedExerciseWorkspace(draft, header(2, 'close-guided-exercise-browser'));
        const ledger = guidedLedger(draft);
        if (guidedMesocycleView === 'completion' && draft.creationResult) return renderGuidedCompletion(draft, header(4, 'close-guided-mesocycle'));
        if (guidedWeeklySummaryOpen) return '<section class="guided-builder">' + header(2, 'close-guided-weekly') + '<div class="section-heading"><div><div class="section-kicker">Weekly Review</div><h2>Weekly Muscle Volume</h2><p>Direct sets remain separate from fractional contribution; targets represent one normal training week.</p></div></div>' + renderGuidedMusclePrioritySummary(draft, false) + '<button class="primary-action" type="button" data-action="check-guided-viability">Check Viability</button></section>';
        if (guidedGenerationReviewOpen) { const templates = guidedTemplatesForMesocycle(draft); return '<section class="guided-builder">' + header(4, 'close-guided-generation-review') + '<div class="section-heading"><div><div class="section-kicker">Review Template Creation</div><h2>Review Every Training Day</h2><p>' + templates.length + ' linked templates will preserve exercise order, sets, research targets, and overrides. Expand each day before creating them.</p></div></div>' + templates.map((template) => renderGuidedTemplateReview(draft, template)).join('') + '<button class="primary-action" type="button" data-action="create-guided-templates" ' + (guidedCreationPending ? 'disabled' : '') + '>' + (guidedCreationPending ? 'Creating Templates…' : 'Create Mesocycle Templates') + '</button></section>'; }
        if (guidedMesocycleView === 'viability' && draft.viabilityResult) { const result = draft.viabilityResult; return '<section class="guided-builder">' + header(3, 'return-guided-builder') + '<div class="row split"><div><div class="section-kicker">Viability Check</div><h2>' + escapeHtml(result.grade) + '</h2><p>' + result.blockingCount + ' blocking · ' + result.warningCount + ' warnings · ' + Number(result.informationCount || 0) + ' information</p></div><div class="viability-score"><strong>' + result.score + '</strong><span>/ 100</span></div></div>' + renderGuidedViabilityFindings(result) + '<button class="primary-action" type="button" data-action="open-guided-generation-review" ' + (result.blockingCount ? 'disabled' : '') + '>Review Template Creation</button></section>'; }
        if (!guidedSelectedDayId) guidedSelectedDayId = draft.guidedDays[0]?.id || '';
        return '<section class="guided-builder">' + header(2, 'close-guided-mesocycle') + '<div><div class="section-kicker">Guided Mesocycle Builder</div><h2>' + escapeHtml(draft.name) + '</h2><p>' + draft.durationWeeks + ' weeks · ' + draft.trainingDays + ' training days</p></div>' + renderGuidedMusclePrioritySummary(draft, true) + '<div class="guided-day-list">' + draft.guidedDays.map((day) => { const total = ledger.dayTotals.find((item) => item.dayId === day.id) || {workingSets:0,exerciseCount:0}; const open = guidedSelectedDayId === day.id; return '<article class="guided-day"><div class="guided-day-header"><button type="button" data-action="toggle-guided-day" data-day-id="' + day.id + '"><strong>' + escapeHtml(day.name) + '</strong><span>' + total.workingSets + ' working sets · ' + total.exerciseCount + ' exercises</span></button></div>' + (open ? '<div class="guided-day-body">' + day.assignments.map((assignment) => '<article class="guided-exercise"><strong>' + escapeHtml(assignment.name) + '</strong><span>' + escapeHtml(presentationLabel(assignment.role)) + ' · ' + assignment.repRange.min + '–' + assignment.repRange.max + ' reps</span><div class="set-stepper"><button type="button" data-action="guided-set-change" data-day-id="' + day.id + '" data-assignment-id="' + assignment.id + '" data-delta="-1">−</button><output>' + assignment.workingSets + ' sets</output><button type="button" data-action="guided-set-change" data-day-id="' + day.id + '" data-assignment-id="' + assignment.id + '" data-delta="1">+</button></div><label>Move to day<select data-action="move-guided-exercise" data-day-id="' + day.id + '" data-assignment-id="' + assignment.id + '">' + draft.guidedDays.map((option) => '<option value="' + option.id + '" ' + (option.id === day.id ? 'selected' : '') + '>' + escapeHtml(option.name) + '</option>').join('') + '</select></label><button type="button" data-action="remove-guided-exercise" data-day-id="' + day.id + '" data-assignment-id="' + assignment.id + '">Remove</button></article>').join('') + '<button class="primary-action" type="button" data-action="open-guided-exercise-browser" data-day-id="' + day.id + '">Add Exercise</button></div>' : '') + '</article>'; }).join('') + '</div><button class="guided-summary-button primary-action" type="button" data-action="open-guided-weekly">Weekly Volume & Frequency</button><button type="button" data-action="check-guided-viability">Check Viability</button></section>';
      }

      function renderMesocyclePlanner() {
        if (guidedMesocycleView !== 'closed') return renderGuidedMesocycle();
        return `<section class="mesocycle-planner screen-section"><article class="guided-entry"><div><div class="section-kicker">Mesocycle Planning</div><h2>Plan Your Mesocycle</h2><p>Build a structured training block with research-informed volume, frequency, exercise-selection, and recovery guardrails.</p></div><button class="primary-action" type="button" data-action="begin-guided-mesocycle">${guidedDraft() ? 'Continue Planning' : 'Plan Your Mesocycle'}</button></article></section>`;
        const latest = data.mesocycles.find((mesocycle) => ["draft", "planned", "active"].includes(mesocycle.status)) || null;
        const availableMuscles = prescriptionEngine ? Array.from(new Set(prescriptionApi.representedMuscleGroups(prescriptionEngine.evidence).map(prescriptionApi.muscleFamily))).sort() : [];
        const selectedScope = mesocycleScopeDraft || new Set(availableMuscles);
        const equipmentSelection = mesocycleEquipmentSelection();
        const workflowStep = latest ? (latest.status === "active" || latest.status === "planned" ? 8 : Math.min(7, Math.max(4, latest.planningStep || 4))) : 1;
        return `
          <section class="mesocycle-planner screen-section">
            <div class="section-heading"><div><div class="section-kicker">Full-program design</div><h2>Mesocycle planner</h2><p>Choose a goal, select a complete exercise portfolio, distribute it across sessions, and review interactions before activation.</p></div></div>
            <div class="planner-steps" aria-label="Mesocycle planning steps">${['Objective & Schedule','Equipment','Training Scope','Exercise Portfolio','Exercise Assignments','Full Review','Confirm','Ready'].map((label, index) => '<div class="planner-step ' + (index + 1 < workflowStep ? 'complete' : index + 1 === workflowStep ? 'current' : '') + '"><b>' + (index + 1) + '</b><span>' + label + '</span></div>').join('')}</div>
            <div class="mesocycle-builder">
              <div class="planner-section-heading"><div class="section-kicker">Step 1</div><h3>Objective, Schedule, and Constraints</h3><p>Define what this block should accomplish and how much weekly training time is available.</p></div>
              <div class="mesocycle-type-picker" role="group" aria-label="Mesocycle type">${[['primary_progression','Primary Progression','Build measurable load or rep progress.'],['alternative_exercise','Exercise Rotation','Change stale patterns without needless churn.'],['lower_fatigue_resensitization','Fatigue Management','Reduce fatigue while retaining practice.'],['specialization','Specialization','Prioritize one muscle group.']].map(([value,label,description]) => '<button class="mesocycle-type-option" type="button" data-action="mesocycle-type-option" data-value="' + value + '" aria-pressed="' + (mesocycleDraftType === value) + '"><span>' + label + '</span><small>' + description + '</small></button>').join('')}</div>
              <div class="planner-compact-fields"><label class="planner-compact-field">Duration in Weeks<input type="number" inputmode="numeric" min="2" max="12" step="1" value="${escapeHtml(mesocycleDurationDraft)}" data-action="mesocycle-duration" placeholder="Auto" /></label><label class="planner-compact-field">Training Days per Week<input type="number" inputmode="numeric" min="1" max="7" step="1" value="${Number(data.settings.trainingDaysPerWeek || 4)}" data-action="mesocycle-training-days" /></label></div>
              <section class="equipment-picker" role="group" aria-label="Available Equipment"><div><div class="section-kicker">Step 2</div><strong>Available Equipment</strong><span class="settings-note">All Equipment includes the complete library. Choose individual items to limit every recommendation, alternate, and comparison to equipment you can actually use.</span></div><div class="equipment-chips">${mesocycleEquipmentTaxonomy.map(([value,label]) => '<button class="equipment-chip choice-chip" type="button" data-action="toggle-mesocycle-equipment" data-value="' + value + '" aria-pressed="' + equipmentSelection.includes(value) + '">' + label + '</button>').join('')}</div></section>
              <section class="muscle-scope-panel" role="group" aria-label="Muscle Group Scope"><div><strong>Muscle Groups in Scope</strong><p class="settings-note">Choose every muscle group this mesocycle should train. You may intentionally leave any group out; confirmation explains the tradeoff.</p></div><div class="muscle-scope-options">${availableMuscles.map((muscle) => '<label class="muscle-scope-option choice-tile"><input type="checkbox" data-action="mesocycle-muscle-scope" value="' + escapeHtml(muscle) + '" ' + (selectedScope.has(muscle) ? 'checked' : '') + ' /><span>' + escapeHtml(presentationLabel(muscle)) + '</span></label>').join('')}</div></section>
              ${mesocycleDraftType === 'specialization' ? '<label class="planner-field">Specialization Muscle<select data-action="mesocycle-specialization"><option value="">Choose a muscle group</option>' + availableMuscles.map((muscle) => '<option value="' + escapeHtml(muscle) + '" ' + (mesocycleSpecializationMuscle === muscle ? 'selected' : '') + '>' + escapeHtml(presentationLabel(muscle)) + '</option>').join('') + '</select></label>' : ''}
              <button class="primary-action" type="button" data-action="preview-mesocycle">Build full-program draft</button>
            </div>
            <p class="settings-note">${escapeHtml(prescriptionEvidenceStatus.message)}</p>
            ${latest ? (mesocyclePlannerExpanded ? renderMesocycleCard(latest) : '<article class="mesocycle-card"><div class="row split"><div><div class="section-kicker">' + escapeHtml(mesocycleTypeLabel(latest.type)) + '</div><h3>' + escapeHtml(latest.name) + '</h3></div><span class="status-pill neutral">' + escapeHtml(presentationLabel(latest.status)) + '</span></div><p>' + (latest.selectedPortfolio?.length || 0) + ' exercises · ' + (latest.sessions?.length || latest.trainingDays || 0) + ' sessions · ' + (latest.programReview?.blockingIssueCount || 0) + ' blocking issues</p><button type="button" data-action="toggle-mesocycle-planner-review">Open Planner Review</button></article>') : '<div class="empty-state">Build a draft to review program slots, selectable alternatives, the proposed portfolio, session placement, and full-program fatigue/volume checks.</div>'}
          </section>
        `;
      }

      function renderHistoricalMesocycles() {
        const current = data.mesocycles.find((mesocycle) => ["draft", "planned", "active"].includes(mesocycle.status));
        const historical = data.mesocycles.filter((mesocycle) => mesocycle.id !== current?.id);
        const historyActions = (mesocycle) => {
          const actions = [];
          if (["completed", "abandoned"].includes(mesocycle.status)) actions.push('<button type="button" data-action="mesocycle-transition" data-mesocycle-action="archive" data-mesocycle-id="' + mesocycle.id + '">Archive</button>');
          if (["completed", "archived"].includes(mesocycle.status)) actions.push('<button type="button" data-action="mesocycle-transition" data-mesocycle-action="review" data-mesocycle-id="' + mesocycle.id + '">Review outcomes</button>');
          if (prescriptionEngine?.canDeleteMesocycle(mesocycle)) actions.push(pendingDeleteMesocycleId === mesocycle.id ? '<span><button class="danger" type="button" data-action="confirm-delete-mesocycle" data-mesocycle-id="' + mesocycle.id + '">Confirm delete</button><button type="button" data-action="cancel-delete-mesocycle">Cancel</button></span>' : '<button class="danger" type="button" data-action="request-delete-mesocycle" data-mesocycle-id="' + mesocycle.id + '">Delete unused draft</button>');
          return actions.length ? '<div class="row wrap">' + actions.join('') + '</div>' : '';
        };
        return `<section class="screen-section mesocycle-history"><div class="section-heading"><div><div class="section-kicker">Template Management</div><h2>Historical Mesocycles</h2><p>Review completed, archived, abandoned, and earlier blocks.</p></div></div>${historical.length ? historical.map((mesocycle) => '<article class="mesocycle-card mesocycle-history-summary"><div class="row split"><div><strong>' + escapeHtml(mesocycle.name) + '</strong><small>' + escapeHtml(mesocycleTypeLabel(mesocycle.type)) + '</small></div><span class="status-pill neutral">' + escapeHtml(presentationLabel(mesocycle.status)) + '</span></div><div class="mesocycle-history-meta"><span>Created ' + formatDate(mesocycle.createdAt) + '</span><span>' + (mesocycle.startedAt ? 'Started ' + formatDate(mesocycle.startedAt) : 'Never activated') + '</span><span>' + (mesocycle.completedAt ? 'Completed ' + formatDate(mesocycle.completedAt) : mesocycle.abandonedAt ? 'Abandoned ' + formatDate(mesocycle.abandonedAt) : 'Not completed') + '</span><span>' + (mesocycle.selectedPortfolio?.length || 0) + ' exercises</span></div>' + historyActions(mesocycle) + '</article>').join('') : '<div class="empty-state">Completed and previous mesocycles will appear here.</div>'}</section>`;
      }

      function renderTemplates() {
        // Weekly fatigue analysis belongs to Dashboard and workout-start coaching. Keeping
        // it off this navigation path prevents the template library from recalculating
        // completed history merely to display its first frame.
        const volumeFlags = [];
        const running = activeWorkoutSession();
        if (guidedMesocycleView !== "closed") return `<section class="view templates-view">${renderMesocyclePlanner()}</section>`;
        if (planVolumeDetailId) {
          const selectedFlag = volumeFlags.find((flag) => flag.id === planVolumeDetailId);
          if (selectedFlag) return renderWeeklyVolumeWarningDetail(selectedFlag, { backAction: "close-plan-volume-detail", sessionAction: "open-session" });
          planVolumeDetailId = "";
        }
        return `
          <section class="view templates-view">
            <div class="screen-heading">
              <div><div class="section-kicker">Plan</div><h1>Templates</h1></div>
              <button class="icon-button" type="button" data-action="new-template" title="New template">${icon.add}</button>
            </div>
            <p class="screen-intro">Start a familiar workout in one tap. Open a row only when you want to edit its plan.</p>
            ${renderMesocyclePlanner()}
            ${running ? '<section class="active-workout-notice" id="active-workout-template-notice" role="status"><div><div class="section-kicker">Workout in progress</div><strong>' + escapeHtml(running.title || 'Active workout') + '</strong><span>Finish or cancel your current workout before starting another template.</span></div><div><button class="primary-action" type="button" data-action="return-active-workout">Return to Active Workout</button><button class="text-danger-action" type="button" data-action="request-cancel-workout-from-template">Manage Active Workout</button></div></section>' : ''}
            ${volumeFlags.length ? '<section class="plan-volume-alerts"><div class="section-heading"><div><h2>Weekly volume checks</h2><p>Review these before adding more work.</p></div></div><div class="drilldown-list">' + volumeFlags.map((flag) => '<button class="drilldown-item fatigue-' + flag.concern + '" type="button" data-action="open-plan-volume-warning" data-flag-id="' + escapeHtml(flag.id) + '"><strong>' + escapeHtml(flag.name + ': ' + flag.reason) + '</strong><span class="fatigue-severity ' + flag.concern + '">' + escapeHtml(flag.concern.charAt(0).toUpperCase() + flag.concern.slice(1)) + ' concern</span><small>' + escapeHtml(flag.evidence[0]) + ' · Tap for exact contributors</small><span class="drilldown-chevron" aria-hidden="true">›</span></button>').join('') + '</div></section>' : ''}
            <div class="template-library">${data.templates.length ? data.templates.map((template) => renderTemplateCard(template, running)).join("") : '<div class="empty-state">Create a leg day, push day, pull day, or any repeatable workout. Templates store exercises, sets, and target reps; you fill in weights during the workout.</div>'}</div>
            <button class="secondary-action full-width" type="button" data-action="save-template">Save current workout as a template</button>
            ${renderHistoricalMesocycles()}
          </section>
        `;
      }

      function templateNumericDraftKey(templateId, exerciseId, action) {
        return JSON.stringify([String(templateId || ""), String(exerciseId || ""), String(action || "")]);
      }

      function templateNumericAlertId(templateId) {
        return `template-validation-${String(templateId || "").replace(/[^A-Za-z0-9_-]/g, "-")}`;
      }

      function templateHasInvalidNumericDraft(templateId) {
        for (const draft of templateNumericDrafts.values()) if (draft.templateId === templateId && draft.invalid) return true;
        return false;
      }

      function renderTemplateNumericInput(template, exercise, action, modelValue, ariaLabel) {
        const config = templateNumericFields[action];
        const draft = templateNumericDrafts.get(templateNumericDraftKey(template.id, exercise.id, action));
        const invalid = Boolean(draft?.invalid);
        const value = draft ? draft.raw : modelValue;
        const describedBy = invalid ? ` aria-describedby="${templateNumericAlertId(template.id)}"` : "";
        return `<input type="number" required min="${config.min}" max="${config.max}" step="${config.step}" value="${escapeHtml(value)}" data-action="${action}" data-template-id="${template.id}" data-template-exercise-id="${exercise.id}" aria-label="${escapeHtml(ariaLabel)}"${invalid ? ' aria-invalid="true"' : ""}${describedBy} />`;
      }

      function renderTemplateNumericAlert(templateId) {
        return templateHasInvalidNumericDraft(templateId)
          ? `<p id="${templateNumericAlertId(templateId)}" class="template-validation-alert" role="alert">Invalid template values were not saved. Correct the highlighted fields to continue.</p>`
          : "";
      }

      function clearTemplateNumericDrafts(templateId, exerciseId = "") {
        for (const [key, draft] of templateNumericDrafts.entries()) {
          if (draft.templateId === templateId && (!exerciseId || draft.exerciseId === exerciseId)) templateNumericDrafts.delete(key);
        }
      }

      function syncTemplateNumericValidationDom(target) {
        const templateId = target.dataset.templateId || "";
        const key = templateNumericDraftKey(templateId, target.dataset.templateExerciseId, target.dataset.action);
        const draft = templateNumericDrafts.get(key);
        const alertId = templateNumericAlertId(templateId);
        if (draft?.invalid) {
          target.setAttribute("aria-invalid", "true");
          target.setAttribute("aria-describedby", alertId);
        } else {
          target.removeAttribute("aria-invalid");
          target.removeAttribute("aria-describedby");
        }
        const card = target.closest(".template-card");
        if (!card) return;
        let alert = card.querySelector(`#${CSS.escape(alertId)}`);
        if (templateHasInvalidNumericDraft(templateId)) {
          if (!alert) {
            alert = document.createElement("p");
            alert.id = alertId;
            alert.className = "template-validation-alert";
            alert.setAttribute("role", "alert");
            alert.textContent = "Invalid template values were not saved. Correct the highlighted fields to continue.";
            card.querySelector(".template-editor .disclosure-body")?.prepend(alert);
          }
        } else alert?.remove();
      }

      function templateNumericValueIsValid(rawValue, config, control) {
        if (rawValue === "") return false;
        const numeric = Number(rawValue);
        if (!Number.isFinite(numeric) || numeric < config.min || numeric > config.max) return false;
        if (config.integer && !Number.isInteger(numeric)) return false;
        const steps = (numeric - config.min) / config.step;
        if (Math.abs(steps - Math.round(steps)) > 1e-9) return false;
        return !control?.validity || control.validity.valid;
      }

      function handleTemplateNumericEdit(target) {
        const action = target?.dataset?.action || "";
        const config = templateNumericFields[action];
        if (!config) return false;
        const templateId = target.dataset.templateId || "";
        const exerciseId = target.dataset.templateExerciseId || "";
        const key = templateNumericDraftKey(templateId, exerciseId, action);
        const raw = target.value;
        if (!templateNumericValueIsValid(raw, config, target)) {
          templateNumericDrafts.set(key, { templateId, exerciseId, action, raw, invalid: true });
          syncTemplateNumericValidationDom(target);
          return true;
        }
        templateNumericDrafts.delete(key);
        syncTemplateNumericValidationDom(target);
        const numeric = Number(raw);
        const current = data.templates.find((template) => template.id === templateId)?.exercises.find((exercise) => exercise.id === exerciseId)?.[config.field];
        if (Number(current) === numeric) return true;
        patchTemplateExercise(templateId, exerciseId, { [config.field]: numeric }, false);
        return true;
      }

      function renderTemplateCard(template, running = activeWorkoutSession()) {
        const isActiveTemplate = running?.templateId === template.id;
        const locked = Boolean(running && !isActiveTemplate);
        const advice = null;
        const confirmingDelete = pendingDeleteTemplateId === template.id;
        const editorExpanded = expandedTemplateEditorIds.has(template.id);
        const prescribedSets = advice?.totalSets ?? templateExerciseCount(template);
        const duration = Math.max(15, Math.round(prescribedSets * 2.5));
        const coachLine = advice ? advice.detail.split(". ").slice(0, 2).join(". ") : "";
        return `
          <article class="template-card compact-template ${isActiveTemplate ? "active-template" : locked ? "locked-template" : ""}">
            <div class="template-topline">
              <div class="template-title">${usesLargeTextReflow()
                ? '<textarea class="exercise-name autosize-title-field" rows="1" data-action="template-name" data-template-id="' + template.id + '" aria-label="Template name">' + escapeHtml(template.name) + '</textarea>'
                : '<input class="exercise-name" value="' + escapeHtml(template.name) + '" data-action="template-name" data-template-id="' + template.id + '" aria-label="Template name" />'}<small>${template.exercises.length} lifts · ${prescribedSets} prescribed sets · ~${duration} min</small></div>
              <div class="template-card-actions">${isActiveTemplate ? '<button class="primary-action template-start" type="button" data-action="return-active-workout">Resume Workout</button>' : '<button class="primary-action template-start" type="button" data-action="start-template" data-template-id="' + template.id + '" ' + (locked ? 'disabled aria-describedby="active-workout-template-notice" title="Finish or cancel your active workout first"' : '') + '>Start</button>'}${isActiveTemplate
                ? '<button class="template-delete-button danger" type="button" disabled title="Finish or cancel the active workout before deleting this template" aria-label="Delete unavailable during active workout">' + icon.delete + '</button>'
                : confirmingDelete
                ? '<span class="template-delete-confirm"><button class="danger" type="button" data-action="confirm-delete-template" data-template-id="' + template.id + '">Delete</button><button type="button" data-action="cancel-delete-template">Cancel</button></span>'
                : '<button class="template-delete-button danger" type="button" data-action="request-delete-template" data-template-id="' + template.id + '" title="Delete template" aria-label="Delete ' + escapeHtml(template.name) + ' template">' + icon.delete + '</button>'}</div>
            </div>
            ${template.baseSessionIntent ? '<p class="template-coach"><strong>Base Session Intent</strong> ' + escapeHtml(template.baseSessionIntent) + '. Today’s readiness may modify load, sets, RPE, rest, or exercise selection before the workout begins.</p>' : ''}
            ${advice ? '<p class="template-coach"><strong>' + escapeHtml(advice.label) + '</strong> ' + escapeHtml(coachLine) + '</p>' : ''}
            <details class="compact-disclosure template-editor" ${editorExpanded ? 'open' : ''}>
              <summary data-action="toggle-template-editor" data-template-id="${template.id}">Edit template <span>${template.exercises.length} lifts</span></summary>
              ${editorExpanded ? `<div class="disclosure-body">
                ${renderTemplateNumericAlert(template.id)}
                <ul class="template-list">
                  ${template.exercises.map((exercise) => `
                    <li>
                      <input value="${escapeHtml(exercise.name)}" data-action="template-exercise-name" data-template-id="${template.id}" data-template-exercise-id="${exercise.id}" aria-label="Template exercise name" />
                      <div class="grid two">
                        <label class="template-meta">Sets${renderTemplateNumericInput(template, exercise, "template-exercise-sets", exercise.sets, "Template exercise sets")}</label>
                        <label class="template-meta">Reps${renderTemplateNumericInput(template, exercise, "template-exercise-reps", exercise.reps, "Template exercise repetitions")}</label>
                      </div>
                      <div class="grid two">
                        <label class="template-meta">Target RPE${renderTemplateNumericInput(template, exercise, "template-exercise-rpe", exercise.targetRpe || 8, "Template exercise target RPE")}</label>
                        <label class="template-meta">Load increment${renderTemplateNumericInput(template, exercise, "template-exercise-increment", exercise.increment || progressionProfileForExercise(exercise.name).increment, "Template exercise load increment")}</label>
                      </div>
                      <label class="template-meta">Resistance type<select data-action="template-exercise-resistance" data-template-id="${template.id}" data-template-exercise-id="${exercise.id}">${resistanceTypeOptions(exercise.resistanceType || inferResistanceType(exercise.name, exercise))}</select></label>
                      <label class="template-meta">Rest seconds${renderTemplateNumericInput(template, exercise, "template-exercise-rest", exercise.restSeconds || recommendedRestSeconds(exercise.name, { reps: exercise.reps }), "Template exercise rest seconds")}</label>
                      <div class="template-warmups"><strong>Warm-ups</strong>${(exercise.warmups || []).map((set, warmupIndex) => '<span>' + escapeHtml(set.reps + ' reps × ' + formatResistance(set, exercise)) + '</span><button class="mini-button" type="button" data-action="remove-template-warmup" data-template-id="' + template.id + '" data-template-exercise-id="' + exercise.id + '" data-warmup-index="' + warmupIndex + '">Remove</button>').join("") || '<span>None yet</span>'}<button class="mini-button" type="button" data-action="add-template-warmup" data-template-id="${template.id}" data-template-exercise-id="${exercise.id}">+ Warm-up</button></div>
                      <button class="mini-button danger" type="button" data-action="delete-template-exercise" data-template-id="${template.id}" data-template-exercise-id="${exercise.id}">Remove exercise</button>
                    </li>
                  `).join("")}
                </ul>
                <button type="button" data-action="add-template-exercise" data-template-id="${template.id}">${icon.add} Exercise</button>
              </div>` : ''}
            </details>
          </article>
        `;
      }

      function renderHistory(nested = false) {
        const activeHistory = activeHistorySessions();
        const activeIds = new Set(activeHistory.map((session) => session.id));
        const archived = data.sessions.filter((session) => isSessionSubmitted(session) && !activeIds.has(session.id)).sort((a, b) => b.date.localeCompare(a.date));
        const totalSessions = activeHistory.length;
        const sessions = [...activeHistory].sort((a, b) => sessionCompletionDate(b).localeCompare(sessionCompletionDate(a))).slice(0, 120);
        return `
          <section class="view history-view">
            <div class="screen-heading"><div><div class="section-kicker">History</div><h1>Training log</h1></div>${nested ? '<button class="text-button" type="button" data-action="close-dashboard-detail">Back</button>' : ''}</div>
            <details class="history-section" open>
              <summary>By session <span>${totalSessions} logged</span></summary>
              <div class="disclosure-body">
              ${totalSessions > sessions.length ? '<p class="settings-note">Showing the latest ' + sessions.length + ' sessions. Exercise review still uses the full imported history.</p>' : ""}
              ${sessions.length ? sessions.map((session) => {
              const exercises = (dataEntityIndex().exerciseIndicesBySession.get(session.id) || []).map((index) => data.exercises[index]);
              const analysis = session?.workoutAnalysis?.version === 1 ? session.workoutAnalysis : null;
              return `
                <button class="session-card" type="button" data-action="open-session" data-session-id="${session.id}">
                  <div class="row split"><strong>${escapeHtml(session.title || "Workout")}</strong><span>${analysis ? 'Grade ' + escapeHtml(analysis.grade) + ' - ' : ''}${formatDate(session.date)}</span></div>
                  <p>${session.isTravel ? "Travel" : "Home"}${exercises.some((exercise) => exercise.isDeload) ? " · Deload work" : ""}</p>
                  <small>${escapeHtml(exercises.map((exercise) => exercise.name + (exercise.isDeload ? " (Deload)" : "")).join(", ") || "No exercises yet")}</small>
                </button>
              `;
              }).join("") : '<div class="empty-state">Completed workouts will appear here.</div>'}
              </div>
            </details>
            <details class="history-section">
              <summary>By exercise <span>${getExerciseNames().length} lifts</span></summary>
              <div class="disclosure-body">${renderExerciseHistory()}</div>
            </details>
            ${archived.length ? '<details class="history-section"><summary>Retention archive <span>' + archived.length + ' recoverable</span></summary><div class="disclosure-body"><p class="settings-note">These completed workouts are older than the rolling six-calendar-month window. They remain in exports but do not affect charts, coaching, PRs, templates, or weekly volume.</p>' + archived.slice(0, 40).map((session) => '<div class="session-card"><div class="row split"><strong>' + escapeHtml(session.title || 'Workout') + '</strong><span>' + formatDate(sessionCompletionDate(session)) + '</span></div></div>').join('') + '</div></details>' : ''}
          </section>
        `;
      }

      function renderExerciseHistory() {
        const names = getExerciseNames();
        if (!names.length) return '<div class="empty-state">No exercise history yet.</div>';
        return names.map((name) => {
          const weeks = summarizeExerciseByWeek(name).slice(0, 4);
          return `
            <article class="history-exercise">
              <h2>${escapeHtml(name)}</h2>
              <div class="trend-table">
                <div class="trend-head"><span>Week</span><span>Top</span><span>Sets</span><span>RPE</span></div>
                ${weeks.map((week) => `
                  <div class="trend-row">
                    <span>${formatDate(week.weekStart)}${week.travelCount ? " - Travel" : ""}${week.isDeload ? " - Deload" : ""}</span>
                    <span>${week.topWeight}</span>
                    <span>${week.completedSets}/${week.completedSets + week.failedSets}</span>
                    <span>${week.averageRpe ? week.averageRpe.toFixed(1) : "-"}</span>
                  </div>
                `).join("")}
              </div>
            </article>
          `;
        }).join("");
      }

      // EXERCISE_TARGET_ENGINE_START
      const setTypeLabels = { top: "Top set", backoff: "Back-off set", straight: "Working set", drop: "Drop set", failure: "Failure set", warmup: "Warm-up set", amrap: "AMRAP set", technique: "Technique set", deload: "Deload set", unknown: "Review required" };

      function normalizeSetTypeCode(value, isWarmup = false) {
        return normalizeCanonicalSetType(value, isWarmup);
      }

      function targetRangeText(low, high, suffix = "") {
        const min = Number(low || 0);
        const max = Number(high || 0);
        if (!min && !max) return "Not configured";
        const value = min && max && min !== max ? formatLoadNumber(min) + "-" + formatLoadNumber(max) : formatLoadNumber(max || min);
        return value + suffix;
      }

      function resolveProgrammedRepRange(raw = {}, fallback = {}) {
        const exactReps = Boolean(raw.exactReps ?? fallback.exactReps);
        const rangeSource = raw.rangeSource || fallback.rangeSource || "program";
        let repMin = Number(raw.repMin ?? raw.lowerRep ?? fallback.repMin ?? fallback.lowerRep ?? 0);
        let repMax = Number(raw.repMax ?? raw.upperRep ?? raw.reps ?? fallback.repMax ?? fallback.upperRep ?? fallback.reps ?? repMin ?? 0);
        if (repMin > 0 && repMax > 0 && repMin > repMax) [repMin, repMax] = [repMax, repMin];
        const fallbackMin = Number(fallback.repMin ?? fallback.lowerRep ?? 0);
        const fallbackMax = Number(fallback.repMax ?? fallback.upperRep ?? fallback.reps ?? fallbackMin ?? 0);
        const fallbackIsRange = fallbackMin > 0 && fallbackMax > fallbackMin;
        const historyNarrow = /history|strong/i.test(rangeSource) && repMin > 0 && repMax - repMin < 2;
        const accidentalExact = repMin > 0 && repMin === repMax && !exactReps;
        if ((historyNarrow || accidentalExact) && fallbackIsRange) {
          repMin = fallbackMin;
          repMax = fallbackMax;
        } else if (accidentalExact) {
          repMin = Math.max(1, repMin - 1);
          repMax += 1;
        }
        return { repMin, repMax, exactReps, rangeSource, rangeAdjusted: accidentalExact || historyNarrow };
      }

      function normalizeTargetSetType(raw = {}, fallback = {}) {
        const type = normalizeSetTypeCode(raw.type || raw.setType || fallback.type, raw.isWarmup || fallback.isWarmup);
        const isWarmup = type === "warmup";
        const setCount = Math.max(0, Number(raw.setCount ?? raw.sets ?? fallback.setCount ?? fallback.sets ?? 0));
        const repRange = resolveProgrammedRepRange(raw, fallback);
        const repMin = repRange.repMin;
        const repMax = repRange.repMax;
        const rpeMin = Number(raw.rpeMin ?? fallback.rpeMin ?? 0);
        const rpeMax = Number(raw.rpeMax ?? fallback.rpeMax ?? raw.targetRpe ?? raw.rpe ?? fallback.targetRpe ?? fallback.rpe ?? rpeMin ?? 0);
        const restSeconds = Number(raw.restSeconds ?? fallback.restSeconds ?? 0);
        return {
          type,
          label: raw.label || setTypeLabels[type] || "Working set",
          setCount,
          repMin,
          repMax,
          exactReps: repRange.exactReps,
          rangeSource: repRange.rangeSource,
          rangeAdjusted: repRange.rangeAdjusted,
          rpeMin,
          rpeMax,
          rpeTolerance: Number(raw.rpeTolerance ?? fallback.rpeTolerance ?? 1),
          loadRule: raw.loadRule || fallback.loadRule || "",
          progressionRule: raw.progressionRule || fallback.progressionRule || "",
          increment: Number(raw.increment ?? fallback.increment ?? 0),
          loadReductionMin: Number(raw.loadReductionMin ?? raw.dropPercentMin ?? fallback.loadReductionMin ?? 0),
          loadReductionMax: Number(raw.loadReductionMax ?? raw.dropPercentMax ?? fallback.loadReductionMax ?? 0),
          restSeconds,
          countsTowardVolume: raw.countsTowardVolume != null ? Boolean(raw.countsTowardVolume) : !isWarmup,
          countsTowardScore: raw.countsTowardScore != null ? Boolean(raw.countsTowardScore) : !isWarmup,
          isWarmup
        };
      }

      function setRoleDefaultsForExercise(templateExercise, setType, profile, sessionType, targetRpe, restSeconds) {
        const type = normalizeSetTypeCode(setType);
        const role = ["top", "backoff", "drop"].includes(type) ? type : "straight";
        const range = profile.roleRanges?.[role] || [profile.lowerRep, profile.upperRep];
        const programmedRpe = Number(targetRpe || templateExercise.targetRpe || (profile.kind === "isolation" ? 8.5 : 8));
        const isReducedSession = ["deload", "light", "technique"].includes(sessionType) || ["deload", "technique"].includes(type);
        const rpeMax = isReducedSession ? Math.min(programmedRpe || 6.5, 6.5)
          : role === "backoff" ? Math.max(6, programmedRpe - 0.5)
            : programmedRpe;
        const rpeMin = Math.max(1, rpeMax - (role === "top" ? 0.5 : 1));
        const backoffReduction = profile.backoffReduction || (profile.kind === "isolation" ? [10, 20] : [8, 15]);
        const reduction = role === "drop" ? [20, 25] : role === "backoff" ? backoffReduction : [0, 0];
        const roleIncrement = Number(templateExercise.setRoleIncrements?.[role] || templateExercise.increment || profile.increment || 0);
        const loadRule = role === "backoff"
          ? "Reduce load " + reduction[0] + "-" + reduction[1] + "% from the top set, rounded to available equipment."
          : role === "drop" ? "Reduce load " + reduction[0] + "-" + reduction[1] + "% from the preceding working set."
            : role === "top" ? "Use the primary high-demand working load for this exercise."
              : "Use the programmed straight-set load across comparable working sets.";
        const roleProgressionRule = role === "top"
          ? "Add the next top-set increment after reaching " + Number(range[1] || range[0]) + " reps without exceeding RPE " + targetRangeText(rpeMin, rpeMax) + "."
          : role === "backoff"
            ? "Add the next back-off increment after every programmed back-off set reaches " + Number(range[1] || range[0]) + " reps without exceeding RPE " + targetRangeText(rpeMin, rpeMax) + "."
            : role === "drop"
              ? "Progress the drop set only after reaching " + Number(range[1] || range[0]) + " controlled reps within RPE " + targetRangeText(rpeMin, rpeMax) + "."
              : "Add the next increment after the programmed straight sets reach the top of their range within the RPE target.";
        return {
          type,
          repMin: Number(range[0] || profile.lowerRep || 0),
          repMax: Number(range[1] || profile.upperRep || range[0] || 0),
          rpeMin,
          rpeMax,
          rpeTolerance: 0.5,
          loadRule,
          progressionRule: templateExercise.setRoleProgressionRules?.[role] || templateExercise.progressionRule || roleProgressionRule,
          increment: roleIncrement,
          loadReductionMin: reduction[0],
          loadReductionMax: reduction[1],
          restSeconds: role === "drop" ? Math.min(Number(restSeconds || 60), 60) : Number(restSeconds || 0),
          countsTowardScore: type !== "warmup",
          countsTowardVolume: type !== "warmup"
        };
      }

      function progressionRuleForTargetSet(type) {
        const role = normalizeSetTypeCode(type.type || type.setType);
        const topReps = Number(type.repMax || type.repMin || 0);
        const rpe = targetRangeText(type.rpeMin, type.rpeMax);
        if (role === "top") return "Add the next top-set increment after reaching " + topReps + " reps without exceeding RPE " + rpe + ".";
        if (role === "backoff") return "Add the next back-off increment after every programmed back-off set reaches " + topReps + " reps without exceeding RPE " + rpe + ".";
        if (role === "drop") return "Progress the drop set only after reaching " + topReps + " controlled reps within RPE " + rpe + ".";
        return "Add the next increment after the programmed straight sets reach " + topReps + " reps within RPE " + rpe + ".";
      }

      function roundEquipmentLoad(value, increment) {
        const step = Math.max(0.01, Number(increment || 1));
        return roundLoadForUnit(Math.max(0, Math.round(Number(value || 0) / step) * step), data.settings.weightUnit, step);
      }

      function previousComparableSetForRole(previousSets, setType, setTypeIndex = 0) {
        const role = normalizeSetTypeCode(setType);
        const sameRole = (previousSets || []).filter((set) => normalizeSetTypeCode(set.setType, set.isWarmup) === role);
        return sameRole.find((set) => Number(set.setTypeIndex || 0) === Number(setTypeIndex || 0)) || sameRole[Number(setTypeIndex || 0)] || null;
      }

      function resolvedSetTypesForPrescription(context, target) {
        if (target?.executionBlocked === true || target?.finalPrescription?.executionBlocked === true || context?.executionBlocked === true) return [];
        const scored = (context?.setTypes || []).filter((type) => type.countsTowardScore && !type.isWarmup);
        const targetCount = Math.max(1, Number(target.sets || scored.reduce((sum, type) => sum + Number(type.setCount || 0), 0) || 1));
        if (["deload", "light", "technique"].includes(target.mode)) {
          const source = scored.find((type) => type.type === "straight") || scored[0] || {};
          const type = target.mode === "deload" ? "deload" : target.mode === "technique" ? "technique" : "straight";
          return [{ ...source, type, label: setTypeLabels[type], setCount: targetCount, rpeMin: Math.max(1, Number(target.rpe || 6.5) - 1), rpeMax: Number(target.rpe || 6.5), loadReductionMin: 0, loadReductionMax: 0, loadRule: target.mode === "deload" ? "Use the resolved deload load; no top set or intensification technique." : "Use lower-fatigue straight sets for this session." }];
        }
        if (!scored.length) return [];
        const baseCount = Math.max(1, scored.reduce((sum, type) => sum + Number(type.setCount || 0), 0));
        let remaining = targetCount;
        return scored.map((type, index) => {
          const count = index === scored.length - 1
            ? remaining
            : Math.min(remaining, Math.max(0, Math.round(Number(type.setCount || 0) * targetCount / baseCount)));
          remaining -= count;
          return { ...type, setCount: count };
        }).filter((type) => type.setCount > 0);
      }

      function setPrescriptionForRole(options = {}) {
        const { templateExercise, target, setType, setTypeIndex = 0, sequenceIndex = 0, previousSets = [] } = options;
        const role = normalizeSetTypeCode(setType.type || setType.setType);
        const increment = Number(setType.increment || target.increment || templateExercise.increment || progressionProfileForExercise(templateExercise.name).increment || 1);
        const resistanceType = target.resistanceType || templateExercise.resistanceType || "external";
        const reductionMin = Number(setType.loadReductionMin || 0);
        const reductionMax = Number(setType.loadReductionMax || reductionMin || 0);
        const reduction = (reductionMin + reductionMax) / 2;
        const assisted = resistanceType === "assisted_bodyweight";
        const multiplier = reduction > 0 ? (assisted ? 1 + reduction / 100 : 1 - reduction / 100) : 1;
        const targetLoad = roundEquipmentLoad(Number(target.weight || 0) * multiplier, increment);
        const roleDefaults = setRoleDefaultsForExercise(templateExercise, role, progressionProfileForExercise(templateExercise.name), target.mode || "normal", target.rpe, setType.restSeconds || target.restSeconds);
        const repRange = resolveProgrammedRepRange(setType, roleDefaults);
        const repMin = Number(repRange.repMin || target.repLow || 0);
        const repMax = Number(repRange.repMax || target.repHigh || repMin);
        const previousComparableSet = previousComparableSetForRole(previousSets, role, setTypeIndex);
        const previousReps = Number(previousComparableSet?.reps || 0);
        const comparableRoleSets = previousSets.filter((set) => normalizeSetTypeCode(set.setType, set.isWarmup) === role || (role === 'straight' && normalizeSetTypeCode(set.setType, set.isWarmup) === 'backoff'));
        const lowestPreviousReps = comparableRoleSets.length ? Math.min(...comparableRoleSets.map((set) => Number(set.reps || 0)).filter((value) => value > 0)) : 0;
        const repProgression = target.mode === 'rep-progression' || target.finalPrescription?.progressionAction === 'add_one_rep';
        const progressesThisSet = repProgression && previousReps > 0 && previousReps === lowestPreviousReps && setTypeIndex === comparableRoleSets.findIndex((set) => Number(set.reps || 0) === lowestPreviousReps);
        const rawTargetReps = target.mode === 'load-progression' ? Number(target.reps || repMin) : progressesThisSet ? previousReps + 1 : previousReps || Number(target.reps || repMax || repMin);
        const targetReps = Math.max(repMin, Math.min(repMax, rawTargetReps));
        const rpeMin = Number(setType.rpeMin || Math.max(1, Number(setType.rpeMax || target.rpe || 0) - 1));
        const rpeMax = Number(setType.rpeMax || target.rpe || rpeMin);
        const candidateNextLoad = resistanceType === "assisted_bodyweight"
          ? roundEquipmentLoad(Math.max(0, targetLoad - increment), increment)
          : roundEquipmentLoad(targetLoad + increment, increment);
        const expectedRoleCount = Math.max(1, Number(setType.setCount || 1));
        const qualifyingComparableSets = comparableRoleSets.length >= expectedRoleCount && comparableRoleSets.every((set) => {
          const reps = Number(set.reps || 0);
          const rpe = Number(set.rpe || 0);
          return reps >= repMax && rpe > 0 && rpe <= rpeMax;
        });
        const progressionReady = role === "backoff"
          ? qualifyingComparableSets
          : role === "top"
            ? previousComparableSet ? Number(previousComparableSet.reps || 0) >= repMax && Number(previousComparableSet.rpe || 0) > 0 && Number(previousComparableSet.rpe || 0) <= rpeMax : false
            : qualifyingComparableSets;
        const nextLoad = progressionReady ? candidateNextLoad : targetLoad;
        const progressionRule = setType.progressionRule || ("Progress after reaching " + repMax + " reps within RPE " + targetRangeText(rpeMin, rpeMax) + " on " + (role === "backoff" ? "the comparable back-off work" : role === "top" ? "the top set" : "the programmed sets") + ".");
        const roleName = setTypeLabels[role] || "Working set";
        const reason = role === "backoff"
          ? "Load is reduced " + formatLoadNumber(reductionMin) + "-" + formatLoadNumber(reductionMax) + "% from the top set so you can add productive volume inside " + repMin + "-" + repMax + " reps at RPE " + targetRangeText(rpeMin, rpeMax) + " without repeating top-set demand."
          : role === "drop"
            ? "Load is reduced " + formatLoadNumber(reductionMin) + "-" + formatLoadNumber(reductionMax) + "% for the programmed drop-set range while limiting additional fatigue."
            : role === "top"
              ? "This is the primary high-demand set. Its load, rep range, and RPE target are resolved from the active program and prior top-set performance."
              : "This is a straight working set. The programmed range allows normal rep decline across later sets without treating it as failure.";
        return { setType: role, sequenceIndex, setTypeIndex, targetLoad, targetReps, repMin, repMax, exactReps: repRange.exactReps, rangeSource: repRange.rangeSource, rpeMin, rpeMax, restSeconds: Number(setType.restSeconds || target.restSeconds || 0), increment, nextLoad, candidateNextLoad, progressionReady, loadRule: setType.loadRule || "", progressionRule, reductionPercent: reduction, previousComparableSet, progressionDelta: previousComparableSet ? { load: Number((targetLoad - resistanceLoad(previousComparableSet, resistanceType)).toFixed(4)), reps: targetReps - previousReps } : null, confidence: progressionReady ? target.confidence || "low" : "conditional", evidenceConfidence: target.confidence || "low", reason: roleName + ": " + reason };
      }

      function validateGeneratedSetPrescriptions(prescriptions, resistanceType) {
        const top = prescriptions.find((item) => item.setType === "top");
        return prescriptions.map((item) => {
          if (!top || item.setType !== "backoff") return item;
          if (Number(top.targetLoad || 0) <= 0) return item;
          const identical = item.targetLoad === top.targetLoad && item.repMin === top.repMin && item.repMax === top.repMax && item.rpeMin === top.rpeMin && item.rpeMax === top.rpeMax;
          if (identical) return { ...item, setType: "straight", reason: "Working set: This set intentionally repeats the same prescription, so it is classified as a straight working set rather than a back-off set." };
          const demandReduced = resistanceType === "assisted_bodyweight" ? item.targetLoad > top.targetLoad : item.targetLoad < top.targetLoad;
          return demandReduced ? item : { ...item, validationWarning: "Back-off demand was not lower than the top set." };
        });
      }

      function templateSetTypesFromHistory(sets, restSeconds = 0) {
        const grouped = new Map();
        sets.filter((set) => isWorkingSet(set, "progression")).forEach((set) => {
          const type = normalizeSetTypeCode(set.setType, set.isWarmup);
          const bucket = grouped.get(type) || [];
          bucket.push(set);
          grouped.set(type, bucket);
        });
        return Array.from(grouped.entries()).map(([type, bucket]) => {
          const reps = bucket.map((set) => Number(set.reps || 0)).filter((value) => value > 0);
          const rpes = bucket.map((set) => Number(set.rpe || 0)).filter((value) => value > 0);
          return normalizeTargetSetType({
            type,
            setCount: bucket.length,
            repMin: reps.length ? Math.min(...reps) : 0,
            repMax: reps.length ? Math.max(...reps) : 0,
            rpeMin: rpes.length ? Math.min(...rpes) : 0,
            rpeMax: rpes.length ? Math.max(...rpes) : 0,
            rangeSource: "workout-history",
            historySampleSize: bucket.length,
            restSeconds,
            loadReductionMin: type === "drop" ? 20 : 0,
            loadReductionMax: type === "drop" ? 25 : 0,
            countsTowardScore: true,
            countsTowardVolume: true
          });
        });
      }

      function defaultProgressionRule(templateExercise, profile) {
        if (templateExercise.progressionRule) return templateExercise.progressionRule;
        const increment = Number(templateExercise.increment || profile.increment || 0);
        if (profile.kind === "isolation") return "Add reps inside the programmed range first. Add the smallest available load increment after all working sets reach the top of the range at the target RPE.";
        return "Add " + formatLoadNumber(increment || 5) + " " + (data.settings.weightUnit || "lb") + " after the programmed working sets reach the top of the range without exceeding the RPE target.";
      }

      function exerciseTargetContext(template, templateExercise, overrides = {}) {
        if (!templateExercise) return null;
        const profile = progressionProfileForExercise(templateExercise.name);
        const sessionType = sessionTypeForTemplate(template);
        const targetRpe = Number(overrides.rpe ?? overrides.targetRpe ?? templateExercise.targetRpe ?? 0);
        const restSeconds = Number(overrides.restSeconds ?? templateExercise.restSeconds ?? recommendedRestSeconds(templateExercise.name, { reps: templateExercise.reps, rpe: targetRpe }));
        const explicitTypes = Array.isArray(templateExercise.setTypes) ? templateExercise.setTypes : [];
        let setTypes = explicitTypes.map((item) => {
          const defaults = setRoleDefaultsForExercise(templateExercise, item.type || item.setType, profile, sessionType, targetRpe, restSeconds);
          const strongDerived = /imported from strong/i.test(String(template?.notes || "")) || /strong/i.test(String(item.rangeSource || ""));
          const sourceItem = strongDerived && !item.userAuthoredTarget && !item.exactReps
            ? { ...item, repMin: defaults.repMin, repMax: defaults.repMax, rpeMin: defaults.rpeMin, rpeMax: defaults.rpeMax, rangeSource: "strong-history-fallback" }
            : item;
          const normalizedTarget = normalizeTargetSetType(sourceItem, defaults);
          const normalized = { ...normalizedTarget, progressionRule: item.progressionRule || templateExercise.setRoleProgressionRules?.[normalizedTarget.type] || templateExercise.progressionRule || progressionRuleForTargetSet(normalizedTarget) };
          const needsDemandReduction = ["backoff", "drop"].includes(normalized.type) && Number(normalized.loadReductionMax || normalized.loadReductionMin || 0) <= 0;
          return needsDemandReduction
            ? { ...normalized, loadReductionMin: defaults.loadReductionMin, loadReductionMax: defaults.loadReductionMax, loadRule: normalized.loadRule || defaults.loadRule }
            : normalized;
        });
        if (!setTypes.length) {
          const defaultType = sessionType === "deload" ? "deload" : sessionType === "technique" ? "technique" : "straight";
          const roleDefaults = setRoleDefaultsForExercise(templateExercise, defaultType, profile, sessionType, targetRpe, restSeconds);
          setTypes = [normalizeTargetSetType({
            type: defaultType,
            setCount: Number(overrides.sets ?? templateExercise.sets ?? 0),
            repMin: Number(templateExercise.repMin || roleDefaults.repMin || 0),
            repMax: Number(templateExercise.repMax || roleDefaults.repMax || templateExercise.reps || 0),
            rpeMin: Number(templateExercise.rpeMin || roleDefaults.rpeMin || 0),
            rpeMax: Number(templateExercise.rpeMax || roleDefaults.rpeMax || targetRpe || 0),
            rpeTolerance: roleDefaults.rpeTolerance,
            restSeconds,
            loadRule: templateExercise.loadRule || roleDefaults.loadRule,
            progressionRule: templateExercise.progressionRule || roleDefaults.progressionRule
          }, roleDefaults)];
        }
        const warmups = Array.isArray(templateExercise.warmups) ? templateExercise.warmups : [];
        if (warmups.length && !setTypes.some((item) => item.isWarmup)) {
          const warmupReps = warmups.map((set) => Number(set.reps || 0)).filter(Boolean);
          const warmupRpes = warmups.map((set) => Number(set.rpe || 0)).filter(Boolean);
          setTypes.push(normalizeTargetSetType({ type: "warmup", setCount: warmups.length, repMin: warmupReps.length ? Math.min(...warmupReps) : 0, repMax: warmupReps.length ? Math.max(...warmupReps) : 0, rpeMin: warmupRpes.length ? Math.min(...warmupRpes) : 0, rpeMax: warmupRpes.length ? Math.max(...warmupRpes) : 0, restSeconds: Math.min(restSeconds || 60, 90), countsTowardScore: false, countsTowardVolume: false }));
        }
        return {
          version: 1,
          id: (template?.id || "saved") + "|" + canonicalExerciseId(templateExercise.name),
          exerciseId: canonicalExerciseId(templateExercise.name),
          exerciseName: templateExercise.name,
          templateId: template?.id || "",
          templateName: template?.name || "Saved workout prescription",
          sessionType,
          role: sessionType === "normal" ? "Standard hypertrophy work" : sessionType.charAt(0).toUpperCase() + sessionType.slice(1) + " session",
          source: overrides.source || (template?.id ? "Current workout template" : "Saved workout prescription"),
          effectiveStartDate: overrides.effectiveStartDate || template?.updatedAt || template?.createdAt || "",
          effectiveEndDate: overrides.effectiveEndDate || "",
          setTypes,
          progressionRule: templateExercise.progressionRule || defaultProgressionRule(templateExercise, profile),
          resistanceType: templateExercise.resistanceType || inferResistanceType(templateExercise.name, templateExercise),
          confidence: overrides.confidence || "high"
        };
      }

      function currentExerciseTargetContexts(exerciseId) {
        return data.templates.flatMap((template) => (template.exercises || [])
          .filter((exercise) => canonicalExerciseId(exercise.name) === exerciseId)
          .map((exercise) => exerciseTargetContext(template, exercise)))
          .filter(Boolean)
          .sort((a, b) => String(b.effectiveStartDate || "").localeCompare(String(a.effectiveStartDate || "")) || a.templateName.localeCompare(b.templateName));
      }

      function savedExerciseTargetContext(session, exercise) {
        if (exercise.appliedTargetContext?.setTypes?.length) return exercise.appliedTargetContext;
        if (exercise.programTargetContext?.setTypes?.length) return exercise.programTargetContext;
        const prescription = exercise.prescription || {};
        if (!(prescription.repLow || prescription.repHigh || prescription.rpe || prescription.targetRpe || prescription.sets)) {
          const roleMap = new Map();
          setsForExercise(exercise.id).filter((set) => isWorkingSet(set, "score")).forEach((set) => {
            const type = normalizeSetTypeCode(set.setType, set.isWarmup);
            const hasTarget = Number(set.targetRepMin || set.targetRepMax || set.targetRpeMin || set.targetRpeMax || set.targetRpe || 0) > 0;
            if (!hasTarget) return;
            const role = roleMap.get(type) || { type, label: setTypeLabels[type] || "Working set", setCount: 0, repMin: Number(set.targetRepMin || 0), repMax: Number(set.targetRepMax || set.targetReps || 0), rpeMin: Number(set.targetRpeMin || 0), rpeMax: Number(set.targetRpeMax || set.targetRpe || 0), rpeTolerance: Number(set.targetRpeTolerance || 1), restSeconds: Number(set.targetRestSeconds || exercise.restSeconds || 0), countsTowardScore: true, countsTowardVolume: set.countsTowardVolume !== false };
            role.setCount += 1;
            roleMap.set(type, role);
          });
          if (!roleMap.size) return null;
          return { id: "saved-set-targets-" + exercise.id, exerciseId: canonicalExerciseId(exercise.name), exerciseName: exercise.name, templateId: session.templateId || "", templateName: session.title || "Saved workout", sessionType: session.sessionType || "normal", source: "Saved set targets", effectiveStartDate: session.date, effectiveEndDate: session.date, setTypes: Array.from(roleMap.values()), progressionRule: "Saved with the submitted workout.", confidence: "high" };
        }
        const template = { id: session.templateId || "", name: session.title || "Saved workout prescription", createdAt: session.date, updatedAt: session.date };
        const sourceExercise = {
          id: canonicalExerciseId(exercise.name),
          name: exercise.name,
          sets: Number(prescription.sets || data.sets.filter((set) => set.exerciseId === exercise.id && isWorkingSet(set, "score")).length || 0),
          reps: Number(prescription.reps || prescription.repHigh || 0),
          repMin: Number(prescription.repLow || 0),
          repMax: Number(prescription.repHigh || 0),
          targetRpe: Number(prescription.rpe || prescription.targetRpe || 0),
          restSeconds: Number(exercise.restSeconds || prescription.restSeconds || 0),
          resistanceType: exercise.resistanceType,
          progressionRule: prescription.progressionRule || ""
        };
        return exerciseTargetContext(template, sourceExercise, { source: "Saved workout prescription", effectiveStartDate: session.date, effectiveEndDate: session.date, confidence: "moderate" });
      }

      function resolveExerciseTargetContext(session, exercise, options = {}) {
        const cacheAvailable = typeof targetContextCache !== "undefined";
        const cacheKey = [typeof analysisRevision === "undefined" ? 0 : analysisRevision, session?.id || "", exercise?.id || "", options.allowCurrentFallback ? "current" : "historical"].join("|");
        if (cacheAvailable && targetContextCache.has(cacheKey)) return targetContextCache.get(cacheKey);
        const saved = savedExerciseTargetContext(session, exercise);
        if (saved) {
          const resolved = { ...saved, resolutionSource: saved.source || "historical" };
          if (cacheAvailable) targetContextCache.set(cacheKey, resolved);
          return resolved;
        }
        if (!options.allowCurrentFallback) {
          if (cacheAvailable) targetContextCache.set(cacheKey, null);
          return null;
        }
        const canonicalId = canonicalExerciseId(exercise.name);
        const contexts = currentExerciseTargetContexts(canonicalId);
        const preferred = contexts.find((context) => context.templateId === session.templateId) || contexts[0] || null;
        const resolved = preferred ? { ...preferred, resolutionSource: "current-fallback", confidence: "low" } : null;
        if (cacheAvailable) targetContextCache.set(cacheKey, resolved);
        return resolved;
      }

      function targetSetTypeForSet(context, set, workingIndex) {
        if (!context?.setTypes?.length) return null;
        const explicitType = normalizeSetTypeCode(set.setType, set.isWarmup);
        if (set.setType || set.isWarmup) return context.setTypes.find((item) => item.type === explicitType) || null;
        let cursor = 0;
        for (const type of context.setTypes.filter((item) => item.countsTowardScore)) {
          cursor += Number(type.setCount || 0);
          if (workingIndex < cursor) return type;
        }
        return context.setTypes.filter((item) => item.countsTowardScore).at(-1) || null;
      }

      function setProgramExpectation(session, exercise, set, workingIndex = 0, options = {}) {
        const semantics = setTypeSemantics(set);
        const context = resolveExerciseTargetContext(session, exercise, options);
        if (semantics.isWarmup || semantics.type === "unknown") return { isWarmup: semantics.isWarmup, countsTowardScore: false, countsTowardVolume: false, setType: semantics.type, context };
        const type = targetSetTypeForSet(context, set, workingIndex);
        const repMin = Number(set.targetRepMin ?? type?.repMin ?? exercise.prescription?.repLow ?? 0);
        const repMax = Number(set.targetRepMax ?? type?.repMax ?? exercise.prescription?.repHigh ?? 0);
        const rpeMin = Number(set.targetRpeMin ?? type?.rpeMin ?? 0);
        const rpeMax = Number(set.targetRpeMax ?? type?.rpeMax ?? set.targetRpe ?? exercise.prescription?.rpe ?? exercise.prescription?.targetRpe ?? 0);
        return {
          context,
          setType: type?.type || normalizeSetTypeCode(set.setType),
          label: type?.label || setTypeLabels[normalizeSetTypeCode(set.setType)] || "Working set",
          repMin,
          repMax,
          rpeMin,
          rpeMax,
          rpeTolerance: Number(type?.rpeTolerance ?? set.targetRpeTolerance ?? 1),
          restSeconds: Number(type?.restSeconds ?? exercise.restSeconds ?? 0),
          countsTowardScore: set.countsTowardScore != null ? Boolean(set.countsTowardScore) : type ? Boolean(type.countsTowardScore) : true,
          countsTowardVolume: set.countsTowardVolume != null ? Boolean(set.countsTowardVolume) : type ? Boolean(type.countsTowardVolume) : true,
          hasRepTarget: Boolean(repMin || repMax),
          hasRpeTarget: Boolean(rpeMin || rpeMax)
        };
      }

      function exerciseExpectationActuals(exerciseId, analysis) {
        const cacheAvailable = typeof actualExpectedCache !== "undefined";
        const cacheKey = [typeof analysisRevision === "undefined" ? 0 : analysisRevision, exerciseId, analysis.windowId || "", typeof hypertrophyWindowOffset === "undefined" ? 0 : hypertrophyWindowOffset].join("|");
        if (cacheAvailable && actualExpectedCache.has(cacheKey)) return actualExpectedCache.get(cacheKey);
        const includedWeeks = new Set((analysis.included || []).map((week) => week.weekStart));
        const sessionById = new Map(activeHistorySessions({ throughDate: analysis.windowEnd || todayIso() }).map((session) => [session.id, session]));
        const analysisIndex = typeof completedAnalysisIndex === "function" ? completedAnalysisIndex() : {
          exercisesByCanonical: new Map([[exerciseId, data.exercises.filter((exercise) => canonicalExerciseId(exercise.name) === exerciseId)]]),
          setsByExercise: new Map(data.exercises.map((exercise) => [exercise.id, data.sets.filter((set) => set.exerciseId === exercise.id)]))
        };
        const groups = new Map();
        (analysisIndex.exercisesByCanonical.get(exerciseId) || []).forEach((exercise) => {
          const session = sessionById.get(exercise.sessionId);
          if (!session || !includedWeeks.has(startOfWeekIso(session.date)) || exercise.isDeload) return;
          const allowCurrentFallback = (typeof hypertrophyWindowOffset === "undefined" ? 0 : hypertrophyWindowOffset) === 0;
          const context = resolveExerciseTargetContext(session, exercise, { allowCurrentFallback });
          const key = context ? context.id + "|" + JSON.stringify(context.setTypes) : "unconfigured";
          const group = groups.get(key) || { key, label: context?.templateName || "Historical target unavailable", sessionType: context?.sessionType || "unknown", sessions: new Set(), dates: [], plannedSets: 0, completedSets: 0, repTracked: 0, repHits: 0, rpeTracked: 0, rpeHits: 0, restTotal: 0, restCount: 0, roles: new Map(), context };
          group.sessions.add(session.id);
          group.dates.push(session.date);
          let workingIndex = 0;
          (analysisIndex.setsByExercise.get(exercise.id) || []).slice().sort((a, b) => canonicalSetSequence(a) - canonicalSetSequence(b)).forEach((set) => {
            const expectation = setProgramExpectation(session, exercise, set, workingIndex, { allowCurrentFallback });
            if (expectation.isWarmup || !expectation.countsTowardScore) return;
            workingIndex += 1;
            const roleKey = expectation.setType || "straight";
            const role = group.roles.get(roleKey) || { key: roleKey, label: expectation.label || setTypeLabels[roleKey] || "Working set", plannedSets: 0, completedSets: 0, repTracked: 0, repHits: 0, rpeTracked: 0, rpeHits: 0, repMin: expectation.repMin, repMax: expectation.repMax, rpeMin: expectation.rpeMin, rpeMax: expectation.rpeMax, restSeconds: expectation.restSeconds };
            group.plannedSets += 1;
            role.plannedSets += 1;
            if (!set.completed) { group.roles.set(roleKey, role); return; }
            group.completedSets += 1;
            role.completedSets += 1;
            if (expectation.hasRepTarget && !["duration", "distance"].includes(resistanceTypeFor(exercise, set))) {
              group.repTracked += 1;
              role.repTracked += 1;
              const reps = Number(set.reps || 0);
              if (reps >= (expectation.repMin || expectation.repMax) && reps <= (expectation.repMax || expectation.repMin)) { group.repHits += 1; role.repHits += 1; }
            }
            const rpe = Number(set.rpe || 0);
            if (rpe > 0 && expectation.hasRpeTarget) {
              group.rpeTracked += 1;
              role.rpeTracked += 1;
              const low = expectation.rpeMin || Math.max(0, expectation.rpeMax - expectation.rpeTolerance);
              const high = expectation.rpeMin ? expectation.rpeMax : expectation.rpeMax + expectation.rpeTolerance;
              if (rpe >= low && rpe <= high) { group.rpeHits += 1; role.rpeHits += 1; }
            }
            group.roles.set(roleKey, role);
          });
          if (Number(exercise.restSeconds) > 0) { group.restTotal += Number(exercise.restSeconds); group.restCount += 1; }
          groups.set(key, group);
        });
        const result = Array.from(groups.values()).map((group) => ({ ...group, sessionCount: group.sessions.size, dateStart: group.dates.slice().sort()[0] || "", dateEnd: group.dates.slice().sort().at(-1) || "", roles: Array.from(group.roles.values()), sessions: undefined, dates: undefined }));
        if (cacheAvailable) actualExpectedCache.set(cacheKey, result);
        return result;
      }
      // EXERCISE_TARGET_ENGINE_END

      // HYPERTROPHY_SCORE_ENGINE_START
      function selectHypertrophyWeeks(allWeeks, offset = 0, count = 6) {
        const sorted = [...allWeeks].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
        const included = [];
        const skippedDeloadWeeks = [];
        const incompleteWeeks = [];
        let qualifyingSeen = 0;
        let collecting = offset === 0;
        for (const week of sorted) {
          if (included.length >= count) break;
          if (week.isDeload) {
            if (collecting) skippedDeloadWeeks.push(week);
            continue;
          }
          if (!week.qualifies) {
            if (collecting && week.submittedSessions > 0) incompleteWeeks.push(week);
            continue;
          }
          if (qualifyingSeen < offset) {
            qualifyingSeen += 1;
            continue;
          }
          collecting = true;
          included.push(week);
          qualifyingSeen += 1;
        }
        return { included, skippedDeloadWeeks, incompleteWeeks, requestedWeeks: count, provisional: included.length < count };
      }

      function calculateHypertrophyScore(selection) {
        const weeks = selection.included || [];
        if (!weeks.length) return { score: null, interpretation: "Not enough data yet", confidence: "low", categories: [], positives: [], improvements: [], actions: [], ...selection };
        const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
        const average = (values, fallback = 0) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
        const roundPoint = (value) => Math.round(value * 10) / 10;
        const ratio = (value, total, fallback) => total > 0 ? clamp(value / total) : fallback;
        const repTargetsAvailable = weeks.some((week) => Number(week.repRangeTracked || 0) > 0);
        const rpeTargetsAvailable = weeks.some((week) => Number(week.rpeTargetTracked || 0) > 0);

        // Each qualifying week has equal influence. The six category maxima total 100.
        const progressionQuality = average(weeks.map((week) => {
          const comparable = Number(week.comparableComparisons || 0);
          if (!comparable) return 0.6;
          const wins = Math.min(comparable, Number(week.progressionWins || 0));
          const regressions = Math.min(comparable - wins, Number(week.regressions || 0));
          const neutral = Math.max(0, comparable - wins - regressions);
          return clamp((wins + neutral * 0.62 - regressions * 0.35) / comparable);
        }), 0.6);
        const repQuality = average(weeks.filter((week) => Number(week.repRangeTracked || 0) > 0).map((week) => ratio(week.repRangeHits, week.repRangeTracked, 1)), 1);
        const rpeQuality = average(weeks.filter((week) => Number(week.rpeTargetTracked || 0) > 0).map((week) => ratio(week.rpeOnTarget, week.rpeTargetTracked, 1)), 1);
        const volumeTargetQuality = average(weeks.map((week) => ratio(week.volumeTargetsHit, week.volumeTargetsTracked, 0.65)), 0.65);
        const volumeStability = average(weeks.map((week) => clamp(1 - Math.max(0, Number(week.volumeChangeRatio || 0) - 0.15) / 0.55)), 0.75);
        const completionQuality = average(weeks.map((week) => ratio(week.completedSets, week.plannedSets, 0.7)), 0.7);
        const fatigueQuality = average(weeks.map((week) => clamp(1 - Math.min(0.72, Number(week.fatigueHigh || 0) * 0.3 + Number(week.fatigueModerate || 0) * 0.12))), 1);

        const categories = [
          { key: "progression", label: "Progression quality", max: 25, quality: 0.35 + progressionQuality * 0.65, detail: Math.round(progressionQuality * 100) + "% of comparable lift trends improved or remained productive.", action: "Progress reps, load, or execution only after the programmed range is owned at the intended effort." },
          { key: "execution", label: "Rep-range execution", max: 20, excluded: !repTargetsAvailable, quality: 0.25 + repQuality * 0.75, detail: repTargetsAvailable ? Math.round(repQuality * 100) + "% of target-tracked working sets landed in their saved programmed rep range." : "No saved rep-range target exists in this analysis window, so this category is excluded.", action: "Keep working sets inside the prescribed range and progress load after repeated top-of-range performances." },
          { key: "rpe", label: "RPE management", max: 15, excluded: !rpeTargetsAvailable, quality: 0.25 + rpeQuality * 0.75, detail: rpeTargetsAvailable ? Math.round(rpeQuality * 100) + "% of target-tracked RPE logs stayed inside their saved session-specific effort band." : "No saved RPE target exists in this analysis window, so this category is excluded.", action: "Keep most hard sets near their target RPE; avoid turning routine hypertrophy work into maximal-effort sets." },
          { key: "volume", label: "Volume quality", max: 15, quality: 0.3 + (volumeTargetQuality * 0.7 + volumeStability * 0.3) * 0.7, detail: Math.round(volumeTargetQuality * 100) + "% target coverage with " + Math.round(volumeStability * 100) + "% week-to-week volume stability.", action: "Keep programmed muscle volume in range and avoid adding sets while performance is deteriorating." },
          { key: "consistency", label: "Training consistency", max: 15, quality: completionQuality, detail: Math.round(completionQuality * 100) + "% of planned working sets were completed across qualifying weeks.", action: "Complete the planned hard sets consistently before expanding the program or adding volume." },
          { key: "fatigue", label: "Fatigue management", max: 10, quality: fatigueQuality, detail: Math.round(fatigueQuality * 100) + "% fatigue-management quality after weighting moderate and high flags.", action: "Resolve high-concern flags first, then stabilize performance before progressing volume or load." }
        ].map((category) => ({ ...category, points: category.excluded ? null : roundPoint(category.max * clamp(category.quality)) }));

        const availableMaximum = categories.filter((category) => !category.excluded).reduce((sum, category) => sum + category.max, 0);
        const availablePoints = categories.filter((category) => !category.excluded).reduce((sum, category) => sum + Number(category.points || 0), 0);
        const score = availableMaximum ? Math.round(clamp(availablePoints / availableMaximum, 0, 1) * 100) : null;
        const interpretation = score >= 90 ? "Excellent hypertrophy-supportive training" : score >= 80 ? "Very good" : score >= 70 ? "Good, with identifiable improvements" : score >= 60 ? "Mixed" : score >= 40 ? "Significant issues are limiting progress" : "Training quality and consistency need attention";
        const completedSets = weeks.reduce((sum, week) => sum + Number(week.completedSets || 0), 0);
        const plannedSets = weeks.reduce((sum, week) => sum + Number(week.plannedSets || 0), 0);
        const repRangeTracked = weeks.reduce((sum, week) => sum + Number(week.repRangeTracked || 0), 0);
        const repRangeHits = weeks.reduce((sum, week) => sum + Number(week.repRangeHits || 0), 0);
        const rpeLogged = weeks.reduce((sum, week) => sum + Number(week.rpeLogged || 0), 0);
        const rpeTargetTracked = weeks.reduce((sum, week) => sum + Number(week.rpeTargetTracked || 0), 0);
        const rpeOnTarget = weeks.reduce((sum, week) => sum + Number(week.rpeOnTarget || 0), 0);
        const comparable = weeks.reduce((sum, week) => sum + Number(week.comparableComparisons || 0), 0);
        const regressions = weeks.reduce((sum, week) => sum + Number(week.regressions || 0), 0);
        const fatigueHigh = weeks.reduce((sum, week) => sum + Number(week.fatigueHigh || 0), 0);
        const fatigueModerate = weeks.reduce((sum, week) => sum + Number(week.fatigueModerate || 0), 0);
        const volumeTargetsTracked = weeks.reduce((sum, week) => sum + Number(week.volumeTargetsTracked || 0), 0);
        const volumeTargetsHit = weeks.reduce((sum, week) => sum + Number(week.volumeTargetsHit || 0), 0);
        const exerciseChangeRate = average(weeks.map((week) => Number(week.exerciseChangeRate || 0)), 0);
        const rpeCoverage = ratio(rpeLogged, completedSets, 0);
        const targetCoverage = ratio(repRangeTracked + rpeTargetTracked, completedSets * 2, 0);
        const confidence = weeks.length >= 6 && comparable >= 6 && rpeCoverage >= 0.65 && targetCoverage >= 0.65 && exerciseChangeRate <= 0.35 ? "high" : weeks.length >= 3 && completedSets >= 12 && targetCoverage >= 0.25 ? "moderate" : "low";

        const positives = [];
        if (progressionQuality >= 0.68) positives.push({ title: "Performance trends are moving productively", detail: Math.round(progressionQuality * 100) + "% of comparable outcomes improved or held with useful effort." });
        if (repQuality >= 0.9) positives.push({ title: "Rep ranges are being executed well", detail: repRangeHits + " of " + repRangeTracked + " tracked sets (" + Math.round(repQuality * 100) + "%) landed in range." });
        if (rpeTargetTracked > 0 && rpeQuality >= 0.9) positives.push({ title: "Effort is well managed", detail: rpeOnTarget + " of " + rpeTargetTracked + " target-tracked RPE values (" + Math.round(rpeQuality * 100) + "%) aligned with the saved prescription." });
        if (completionQuality >= 0.9) positives.push({ title: "Training is consistent", detail: Math.round(completionQuality * 100) + "% of planned working sets were completed." });
        if (!positives.length) positives.push({ title: "A usable baseline is established", detail: completedSets + " completed working sets provide a concrete starting point for the next block." });

        const categoryByKey = new Map(categories.map((category) => [category.key, category]));
        const improvements = [];
        const addImprovement = (key, detail, evidence, threshold, action) => {
          const category = categoryByKey.get(key);
          if (!category || category.excluded || category.points >= category.max) return;
          improvements.push({ key, title: category.label, detail, evidence, threshold, action, severity: 1 - category.points / category.max });
        };
        if (comparable >= 2 && (progressionQuality < 0.72 || regressions > 0)) {
          addImprovement("progression", "Comparable performance has not progressed reliably.", comparable + " comparable outcomes included " + regressions + " regression" + (regressions === 1 ? "" : "s") + "; productive trend rate was " + Math.round(progressionQuality * 100) + "%.", "Target: at least 72% productive comparable outcomes with no repeated regressions.", "Add a rep or the smallest available load only after the top of the programmed range is repeated at the intended RPE.");
        }
        if (repRangeTracked >= 3 && repQuality < 0.9) {
          addImprovement("execution", "A meaningful share of working sets fell outside the programmed rep range.", repRangeHits + " of " + repRangeTracked + " sets were in range (" + Math.round(repQuality * 100) + "%).", "Target: at least 90% of tracked working sets in range.", "Adjust load so the next comparable sets remain inside the prescribed rep range before progressing.");
        }
        if (completedSets >= 4 && rpeCoverage < 0.35) {
          addImprovement("rpe", "RPE coverage is too sparse to evaluate effort confidently.", rpeLogged + " of " + completedSets + " completed sets included RPE (" + Math.round(rpeCoverage * 100) + "%).", "Target: RPE logged for at least 35% of completed working sets.", "Log RPE on the final hard set of each exercise, then expand coverage when practical.");
        } else if (rpeLogged >= 3 && rpeQuality < 0.85) {
          addImprovement("rpe", "Logged effort repeatedly missed the intended RPE band.", rpeOnTarget + " of " + rpeLogged + " RPE entries were within one point of target (" + Math.round(rpeQuality * 100) + "%).", "Target: at least 85% of logged sets within one RPE point of the prescription.", "Hold or reduce the load slightly until most working sets finish inside the intended effort band.");
        }
        if (volumeTargetsTracked >= 2 && (volumeTargetQuality < 0.85 || (weeks.length >= 2 && volumeStability < 0.7))) {
          addImprovement("volume", "Weekly volume was outside target or changed too abruptly.", volumeTargetsHit + " of " + volumeTargetsTracked + " tracked targets were in range; volume stability was " + Math.round(volumeStability * 100) + "%.", "Target: at least 85% target coverage and 70% week-to-week stability.", "Return volume to the programmed range and stabilize it before adding more sets.");
        }
        if (plannedSets >= 4 && completionQuality < 0.9) {
          addImprovement("consistency", "Prescribed working sets were not completed consistently.", completedSets + " of " + plannedSets + " planned sets were completed (" + Math.round(completionQuality * 100) + "%).", "Target: at least 90% completion of planned working sets.", "Complete the existing prescription consistently before expanding volume or exercise count.");
        }
        if (fatigueHigh > 0 || fatigueModerate > 0) {
          addImprovement("fatigue", "Training data triggered unresolved fatigue signals.", fatigueHigh + " high-concern and " + fatigueModerate + " moderate fatigue signal" + (fatigueHigh + fatigueModerate === 1 ? " was" : "s were") + " recorded.", "Target: no unresolved high-concern flags and a downward trend in moderate flags.", "Resolve high-concern flags first, then hold load or volume until comparable performance stabilizes.");
        }
        improvements.sort((a, b) => b.severity - a.severity);
        const actions = improvements.slice(0, 3).map((item) => ({ title: item.action, detail: item.evidence, key: item.key }));
        const metrics = { completedSets, plannedSets, repRangeTracked, repRangeHits, rpeLogged, rpeTargetTracked, rpeOnTarget, comparable, regressions, fatigueHigh, fatigueModerate, volumeTargetsTracked, volumeTargetsHit };
        return { score, interpretation, confidence, categories, positives: positives.slice(0, 4), improvements, actions, metrics, rpeCoverage, targetCoverage, comparable, completedSets, ...selection };
      }
      // HYPERTROPHY_SCORE_ENGINE_END

      function buildHypertrophyWeekAggregates(scope = { type: "overall", exerciseId: "" }, options = {}) {
        const fallbackKey = Array.from(options.currentFallbackWeeks || []).sort().join(",");
        const cacheKey = [analysisRevision, scope.type, scope.exerciseId || "", fallbackKey].join("|");
        if (hypertrophyWeekCache.has(cacheKey)) return hypertrophyWeekCache.get(cacheKey);
        const analysisIndex = completedAnalysisIndex();
        const sessionById = analysisIndex.sessionById;
        const exercisesBySession = analysisIndex.exercisesBySession;
        const setsByExercise = analysisIndex.setsByExercise;
        const weekMap = new Map();
        sessionById.forEach((session) => {
          const relevantExercises = (exercisesBySession.get(session.id) || []).filter((exercise) => {
            if (scope.type === "exercise" && analysisIndex.canonicalByExerciseId.get(exercise.id) !== scope.exerciseId) return false;
            return (setsByExercise.get(exercise.id) || []).some((set) => isWorkingSet(set, "score"));
          });
          if (!relevantExercises.length) return;
          const weekStart = startOfWeekIso(session.date);
          const week = weekMap.get(weekStart) || {
            weekStart, submittedSessions: 0, plannedSets: 0, completedSets: 0, skippedSets: 0, missedSets: 0,
            repRangeTracked: 0, repRangeHits: 0, rpeLogged: 0, rpeTargetTracked: 0, rpeOnTarget: 0, volumeTotal: 0,
            exerciseCount: 0, deloadExerciseCount: 0, explicitSessionDeload: false, exerciseStats: new Map(),
            intendedMuscles: new Set(), muscleSets: new Map(), targetSignatures: new Set()
          };
          week.submittedSessions += 1;
          week.explicitSessionDeload ||= Boolean(session.isDeload || session.sessionType === "deload");
          relevantExercises.forEach((exercise) => {
            let workingIndex = 0;
            const workingSets = (setsByExercise.get(exercise.id) || [])
              .filter((set) => isWorkingSet(set, "score"))
              .map((set) => {
                const expectation = setProgramExpectation(session, exercise, set, workingIndex, { allowCurrentFallback: Boolean(options.currentFallbackWeeks?.has(weekStart)) });
                if (expectation.countsTowardScore) workingIndex += 1;
                return { set, expectation };
              })
              .filter((entry) => entry.expectation.countsTowardScore);
            if (!workingSets.length) return;
            week.exerciseCount += 1;
            if (exercise.isDeload) {
              week.deloadExerciseCount += 1;
              return;
            }
            const targetContext = workingSets.find((entry) => entry.expectation.context)?.expectation.context || null;
            if (targetContext) week.targetSignatures.add(targetContext.id + "|" + JSON.stringify(targetContext.setTypes));
            const canonicalId = analysisIndex.canonicalByExerciseId.get(exercise.id) || canonicalExerciseId(exercise.name);
            const stats = week.exerciseStats.get(canonicalId) || { name: exercise.name, completedSets: 0, failedSets: 0, bestEstimatedOneRepMax: 0, topWeight: 0, maxRepsAtTopWeight: 0, rpeSum: 0, rpeCount: 0 };
            const muscleAssignments = musclesForExercise(exercise);
            muscleAssignments.forEach(({ muscle }) => week.intendedMuscles.add(muscle));
            workingSets.forEach(({ set, expectation }) => {
              week.plannedSets += 1;
              if (set.skipped) week.skippedSets += 1;
              else if (!set.completed) { week.missedSets += 1; stats.failedSets += 1; }
              if (!set.completed) return;
              week.completedSets += 1;
              stats.completedSets += 1;
              const reps = Number(set.reps || 0);
              const load = Number(set.weight || 0);
              const resistanceType = resistanceTypeFor(exercise, set);
              if (expectation.hasRepTarget && !["duration", "distance"].includes(resistanceType)) {
                week.repRangeTracked += 1;
                if (reps >= (expectation.repMin || expectation.repMax) && reps <= (expectation.repMax || expectation.repMin)) week.repRangeHits += 1;
              }
              const actualRpe = Number(set.rpe || 0);
              if (actualRpe > 0) {
                week.rpeLogged += 1;
                stats.rpeSum += actualRpe;
                stats.rpeCount += 1;
                if (expectation.hasRpeTarget) {
                  week.rpeTargetTracked += 1;
                  const rpeLow = expectation.rpeMin || Math.max(0, expectation.rpeMax - expectation.rpeTolerance);
                  const rpeHigh = expectation.rpeMin ? expectation.rpeMax : expectation.rpeMax + expectation.rpeTolerance;
                  if (actualRpe >= rpeLow && actualRpe <= rpeHigh) week.rpeOnTarget += 1;
                }
              }
              if (expectation.countsTowardVolume && resistanceType === "external") week.volumeTotal += load * reps;
              const performanceValue = ["external", "bodyweight_plus_load"].includes(resistanceType) ? estimatedOneRepMax(set)
                : resistanceType === "assisted_bodyweight" ? Math.max(0, 10000 - resistanceLoad(set, resistanceType) * 10 + reps)
                  : resistanceType === "duration" ? Number(set.durationSeconds || 0)
                    : resistanceType === "distance" ? Number(set.distance || 0)
                      : reps;
              stats.bestEstimatedOneRepMax = Math.max(stats.bestEstimatedOneRepMax, performanceValue);
              if (load > stats.topWeight) { stats.topWeight = load; stats.maxRepsAtTopWeight = reps; }
              else if (load === stats.topWeight) stats.maxRepsAtTopWeight = Math.max(stats.maxRepsAtTopWeight, reps);
              if (expectation.countsTowardVolume) muscleAssignments.forEach(({ muscle, weight }) => week.muscleSets.set(muscle, (week.muscleSets.get(muscle) || 0) + weight));
            });
            week.exerciseStats.set(canonicalId, stats);
          });
          weekMap.set(weekStart, week);
        });

        const weeks = Array.from(weekMap.values()).map((week) => {
          const isDeload = week.explicitSessionDeload || (week.exerciseCount > 0 && week.deloadExerciseCount === week.exerciseCount);
          let volumeTargetsTracked = 0;
          let volumeTargetsHit = 0;
          if (scope.type === "exercise") {
            if (week.plannedSets > 0) {
              volumeTargetsTracked = 1;
              if (week.completedSets / week.plannedSets >= 0.8) volumeTargetsHit = 1;
            }
          } else {
            week.intendedMuscles.forEach((muscle) => {
              const target = targetRangeForMuscle(muscle);
              const sets = week.muscleSets.get(muscle) || 0;
              volumeTargetsTracked += 1;
              if (sets >= target.low && sets <= target.high) volumeTargetsHit += 1;
            });
          }
          const completionRatio = week.plannedSets > 0 ? week.completedSets / week.plannedSets : 0;
          const minimumSets = scope.type === "exercise" ? 2 : 3;
          return { ...week, isDeload, qualifies: !isDeload && week.completedSets >= minimumSets && completionRatio >= 0.5, volumeTargetsTracked, volumeTargetsHit, progressionWins: 0, regressions: 0, comparableComparisons: 0, exerciseChangeRate: 0, fatigueHigh: 0, fatigueModerate: 0, volumeChangeRatio: 0 };
        }).sort((a, b) => a.weekStart.localeCompare(b.weekStart));

        const previousByExercise = new Map();
        let previousVolume = 0;
        weeks.forEach((week) => {
          if (week.isDeload) return;
          if (previousVolume > 0) week.volumeChangeRatio = Math.abs(week.volumeTotal - previousVolume) / previousVolume;
          if (week.qualifies) previousVolume = week.volumeTotal || previousVolume;
          let newExercises = 0;
          week.exerciseStats.forEach((current, key) => {
            const previous = previousByExercise.get(key);
            const currentRpe = current.rpeCount ? current.rpeSum / current.rpeCount : 0;
            if (!previous) newExercises += 1;
            else {
              week.comparableComparisons += 1;
              const previousRpe = previous.rpeCount ? previous.rpeSum / previous.rpeCount : 0;
              const weightedProgress = current.bestEstimatedOneRepMax > 0 && previous.bestEstimatedOneRepMax > 0 && current.bestEstimatedOneRepMax >= previous.bestEstimatedOneRepMax * 1.015;
              const repProgress = current.topWeight === previous.topWeight && current.maxRepsAtTopWeight > previous.maxRepsAtTopWeight && (!currentRpe || !previousRpe || currentRpe <= previousRpe + 0.5);
              const effortProgress = current.bestEstimatedOneRepMax >= previous.bestEstimatedOneRepMax * 0.99 && currentRpe > 0 && previousRpe > 0 && currentRpe <= previousRpe - 0.5;
              const regression = current.bestEstimatedOneRepMax > 0 && previous.bestEstimatedOneRepMax > 0 && current.bestEstimatedOneRepMax < previous.bestEstimatedOneRepMax * 0.93;
              if (weightedProgress || repProgress || effortProgress) week.progressionWins += 1;
              else if (regression) week.regressions += 1;
              if (regression) week.fatigueModerate += 1;
            }
            const averageRpe = current.rpeCount ? current.rpeSum / current.rpeCount : 0;
            if (current.failedSets >= 2) week.fatigueHigh += 1;
            else if (averageRpe >= 9.2 && current.completedSets >= 2) week.fatigueModerate += 1;
            if (week.qualifies) previousByExercise.set(key, current);
          });
          week.exerciseChangeRate = week.exerciseStats.size ? newExercises / week.exerciseStats.size : 0;
          week.intendedMuscles.forEach((muscle) => {
            const target = targetRangeForMuscle(muscle);
            const sets = week.muscleSets.get(muscle) || 0;
            if (sets > target.high * 1.2) week.fatigueHigh += 1;
            else if (sets > target.high) week.fatigueModerate += 1;
          });
        });
        const sortedWeeks = weeks.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
        hypertrophyWeekCache.set(cacheKey, sortedWeeks);
        return sortedWeeks;
      }

      function hypertrophyWindowOptions(allWeeks) {
        const qualifyingCount = allWeeks.filter((week) => week.qualifies && !week.isDeload).length;
        const options = [];
        for (let offset = 0; offset < qualifyingCount && options.length < 6; offset += 6) {
          const selection = selectHypertrophyWeeks(allWeeks, offset, 6);
          if (!selection.included.length) break;
          options.push({ offset, selection });
        }
        return options;
      }

      function latestQualifyingFallbackWeekStarts(scope, count = 6) {
        const cacheKey = [analysisRevision, todayIso(), scope.type, scope.exerciseId || "", count].join("|");
        if (hypertrophyQualificationCache.has(cacheKey)) return hypertrophyQualificationCache.get(cacheKey);
        const analysisIndex = completedAnalysisIndex();
        const weeks = new Map();
        analysisIndex.sessionById.forEach((session) => {
          const weekStart = startOfWeekIso(session.date);
          const week = weeks.get(weekStart) || { completedSets: 0, plannedSets: 0, exerciseCount: 0, deloadExerciseCount: 0, explicitSessionDeload: false };
          week.explicitSessionDeload ||= Boolean(session.isDeload || session.sessionType === "deload");
          (analysisIndex.exercisesBySession.get(session.id) || []).forEach((exercise) => {
            if (scope.type === "exercise" && analysisIndex.canonicalByExerciseId.get(exercise.id) !== scope.exerciseId) return;
            const workingSets = (analysisIndex.setsByExercise.get(exercise.id) || []).filter((set) => isWorkingSet(set, "score"));
            if (!workingSets.length) return;
            week.exerciseCount += 1;
            if (exercise.isDeload) {
              week.deloadExerciseCount += 1;
              return;
            }
            week.plannedSets += workingSets.length;
            week.completedSets += workingSets.filter((set) => set.completed).length;
          });
          weeks.set(weekStart, week);
        });
        const minimumSets = scope.type === "exercise" ? 2 : 3;
        const result = new Set(Array.from(weeks.entries())
          .filter(([, week]) => {
            const isDeload = week.explicitSessionDeload || (week.exerciseCount > 0 && week.deloadExerciseCount === week.exerciseCount);
            return !isDeload && week.completedSets >= minimumSets && week.plannedSets > 0 && week.completedSets / week.plannedSets >= 0.5;
          })
          .sort((a, b) => b[0].localeCompare(a[0]))
          .slice(0, count)
          .map(([weekStart]) => weekStart));
        hypertrophyQualificationCache.set(cacheKey, result);
        return result;
      }

      function hypertrophyAnalysis(offset = hypertrophyWindowOffset, scopeType = "exercise", exerciseId = selectedExerciseId) {
        const scope = scopeType === "exercise" && exerciseId ? { type: "exercise", exerciseId } : { type: "overall", exerciseId: "" };
        const key = scope.type + "|" + scope.exerciseId + "|" + offset + "|" + SET_CLASSIFIER_VERSION + "|" + analysisRevision;
        if (hypertrophyScoreCache.has(key)) return hypertrophyScoreCache.get(key);
        const currentFallbackWeeks = offset === 0 ? latestQualifyingFallbackWeekStarts(scope, 6) : null;
        const allWeeks = buildHypertrophyWeekAggregates(scope, currentFallbackWeeks?.size ? { currentFallbackWeeks } : {});
        const selection = selectHypertrophyWeeks(allWeeks, offset, 6);
        const result = calculateHypertrophyScore(selection);
        const previousSelection = selectHypertrophyWeeks(allWeeks, offset + 6, 6);
        const previous = calculateHypertrophyScore(previousSelection);
        result.previousScore = previous.score;
        result.trend = result.score != null && previous.score != null ? result.score - previous.score : null;
        result.windowOptions = hypertrophyWindowOptions(allWeeks);
        result.allWeeks = allWeeks;
        result.scopeType = scope.type;
        result.scopeId = scope.exerciseId;
        result.scopeLabel = scope.type === "exercise" ? (exerciseCatalog().find((item) => item.id === scope.exerciseId)?.name || "Selected exercise") : "Overall program";
        result.scoreTitle = scope.type === "exercise" ? result.scopeLabel + " Hypertrophy Score" : "Overall Program Hypertrophy Score";
        const periodDescription = offset > 0 ? "the selected prior six-week qualifying non-deload window" : "the latest six qualifying non-deload weeks";
        result.scopeDescription = scope.type === "exercise"
          ? "Evaluates only submitted " + result.scopeLabel + " working sets from " + periodDescription + "."
          : "Evaluates training quality across all included muscle groups, exercises, and submitted working sets from " + periodDescription + ".";
        const includedStarts = result.included.map((week) => week.weekStart).sort();
        result.windowStart = includedStarts[0] || "";
        if (includedStarts.length) {
          const end = new Date(includedStarts.at(-1) + "T00:00:00");
          end.setDate(end.getDate() + 6);
          result.windowEnd = localDateIso(end);
        } else result.windowEnd = "";
        result.windowId = scope.type + ":" + scope.exerciseId + ":" + result.windowStart + ":" + result.windowEnd;
        result.qualifyingWeekIds = result.included.map((week) => week.weekStart);
        result.dataPointCount = result.included.reduce((sum, week) => sum + Number(week.completedSets || 0), 0);
        result.asOfDate = result.windowEnd || todayIso();
        hypertrophyScoreCache.set(key, result);
        return result;
      }

      function exerciseProgressSeries(exerciseName, options = {}) {
        const cacheKey = [analysisRevision, options.canonicalExerciseId || canonicalExerciseId(exerciseName), options.throughDate || todayIso(), (options.qualifyingWeekIds || []).join(","), options.resistanceType || ""].join("|");
        if (exerciseProgressCache.has(cacheKey)) return exerciseProgressCache.get(cacheKey);
        const scoped = getExerciseSets(exerciseName, { canonicalExerciseId: options.canonicalExerciseId });
        const exerciseById = new Map(scoped.exercises.map((exercise) => [exercise.id, exercise]));
        const allowedWeeks = options.qualifyingWeekIds ? new Set(options.qualifyingWeekIds) : null;
        const sessionById = new Map(activeHistorySessions({ asOfDate: options.retentionAsOfDate || todayIso(), throughDate: options.throughDate || todayIso() }).map((session) => [session.id, session]));
        const resistanceType = options.resistanceType || scoped.exercises.map((exercise) => resistanceTypeFor(exercise)).find(Boolean) || "external";
        const byWeek = new Map();
        scoped.sets.filter((set) => set.completed && isWorkingSet(set, "progression") && (set.reps > 0 || set.durationSeconds > 0 || set.distance > 0)).forEach((set) => {
          const exercise = exerciseById.get(set.exerciseId);
          const session = exercise ? sessionById.get(exercise.sessionId) : null;
          if (!session || (allowedWeeks && !allowedWeeks.has(startOfWeekIso(session.date)))) return;
          const week = session.date;
          const bucket = byWeek.get(week) || { week, primary: resistanceType === "assisted_bodyweight" ? Infinity : 0, secondary: 0, details: [] };
          const load = resistanceLoad(set, resistanceType);
          const primaryValue = resistanceType === "external" ? estimatedOneRepMax(set)
            : resistanceType === "bodyweight_plus_load" ? load
              : resistanceType === "assisted_bodyweight" ? load
                : resistanceType === "duration" ? Number(set.durationSeconds || 0)
                  : resistanceType === "distance" ? Number(set.distance || 0)
                    : Number(set.reps || 0);
          bucket.primary = resistanceType === "assisted_bodyweight" ? Math.min(bucket.primary, primaryValue || Infinity) : Math.max(bucket.primary, primaryValue);
          bucket.secondary += resistanceType === "external" ? load * set.reps : resistanceType === "duration" ? Number(set.durationSeconds || 0) : resistanceType === "distance" ? Number(set.distance || 0) : Number(set.reps || 0);
          bucket.details.push({ ...set, resistanceType, addedLoad: set.addedLoad, assistanceLoad: set.assistanceLoad, sessionTitle: session.title, sessionDate: session.date });
          byWeek.set(week, bucket);
        });
        const weeks = Array.from(byWeek.values()).sort((a, b) => a.week.localeCompare(b.week)).slice(-16);
        const labels = resistanceType === "external" ? { primaryTitle: "Estimated 1RM", secondaryTitle: "Volume load", primaryMetric: "e1rm", secondaryMetric: "conventional_volume", latestPrimary: "Latest e1RM", latestSecondary: "Latest volume" }
          : resistanceType === "bodyweight_plus_load" ? { primaryTitle: "Added load", secondaryTitle: "Completed reps", primaryMetric: "added_load", secondaryMetric: "completed_reps", latestPrimary: "Latest added load", latestSecondary: "Latest reps" }
            : resistanceType === "assisted_bodyweight" ? { primaryTitle: "Assistance load (lower is progress)", secondaryTitle: "Completed reps", primaryMetric: "assistance_load", secondaryMetric: "completed_reps", latestPrimary: "Latest assistance", latestSecondary: "Latest reps" }
              : resistanceType === "duration" ? { primaryTitle: "Best duration", secondaryTitle: "Total duration", primaryMetric: "duration", secondaryMetric: "duration_total", latestPrimary: "Best duration", latestSecondary: "Total duration" }
                : resistanceType === "distance" ? { primaryTitle: "Best distance", secondaryTitle: "Total distance", primaryMetric: "distance", secondaryMetric: "distance_total", latestPrimary: "Best distance", latestSecondary: "Total distance" }
                  : { primaryTitle: "Best set reps", secondaryTitle: "Completed reps", primaryMetric: "bodyweight_reps", secondaryMetric: "completed_reps", latestPrimary: "Best reps", latestSecondary: "Latest reps" };
        const result = {
          resistanceType,
          ...labels,
          e1rm: weeks.map((week) => ({ label: formatDate(week.week), date: week.week, value: Number.isFinite(week.primary) ? Math.round(week.primary * 10) / 10 : 0, metricType: labels.primaryMetric, details: week.details })),
          volume: weeks.map((week) => ({ label: formatDate(week.week), date: week.week, value: Math.round(week.secondary * 10) / 10, metricType: labels.secondaryMetric, details: week.details }))
        };
        exerciseProgressCache.set(cacheKey, result);
        return result;
      }

      function resetChartPointActivations() {
        chartPointActivations.clear();
        chartPointActivationEpoch += 1;
        chartPointActivationSequence = 0;
      }

      function registerChartPointActivation(chartKey, point, scope = {}) {
        const safeChartKey = chartKey === "e1rm" ? "e1rm" : "volume";
        chartPointActivationSequence += 1;
        const key = `cp_${chartPointActivationEpoch}_${chartPointActivationSequence}`;
        chartPointActivations.set(key, {
          chartKey: safeChartKey,
          exerciseId: scope.exerciseId || "",
          windowOffset: Number(scope.windowOffset || 0),
          throughDate: scope.throughDate || "",
          qualifyingWeekIds: Array.isArray(scope.qualifyingWeekIds) ? [...scope.qualifyingWeekIds] : [],
          resistanceType: scope.resistanceType || "",
          point
        });
        return key;
      }

      function renderChart(chartKey, title, points, emptyText, scope = {}) {
        const validPoints = points.filter((point) => point.value > 0);
        const values = validPoints.map((point) => point.value);
        if (!values.length) return '<div class="chart-card"><header><strong>' + escapeHtml(title) + '</strong></header><small>' + escapeHtml(emptyText) + '</small></div>';
        const rawMax = Math.max(...values);
        const rawMin = Math.min(...values);
        const spread = rawMax - rawMin;
        const padding = Math.max(spread * 0.14, rawMax * 0.045, chartKey === "volume" ? 10 : 1);
        const domainMin = Math.max(0, rawMin - padding);
        const domainMax = rawMax + padding;
        const domainSpread = Math.max(1, domainMax - domainMin);
        const width = 360;
        const height = 150;
        const plot = { left: 34, right: 22, top: 17, bottom: 25 };
        const plotWidth = width - plot.left - plot.right;
        const plotHeight = height - plot.top - plot.bottom;
        const chartPoints = validPoints.map((point, index) => ({
          ...point,
          x: validPoints.length === 1 ? plot.left + plotWidth / 2 : plot.left + (index / (validPoints.length - 1)) * plotWidth,
          y: plot.top + (1 - (point.value - domainMin) / domainSpread) * plotHeight
        }));
        const polyline = chartPoints.map((point) => point.x.toFixed(1) + "," + point.y.toFixed(1)).join(" ");
        const selected = chartDetailPoint?.chartKey === chartKey
          && chartDetailPoint?.exerciseId === (scope.exerciseId || "")
          && Number(chartDetailPoint?.windowOffset || 0) === Number(scope.windowOffset || 0)
          ? chartDetailPoint : null;
        const selectedIndex = selected ? chartPoints.findIndex((point) => point.date === selected.date && point.value === selected.value) : -1;
        const selectedPoint = selectedIndex >= 0 ? chartPoints[selectedIndex] : null;
        const grid = [0, 0.5, 1].map((ratio) => {
          const y = plot.top + ratio * plotHeight;
          const value = domainMax - ratio * domainSpread;
          return '<line class="chart-grid-line" x1="' + plot.left + '" y1="' + y.toFixed(1) + '" x2="' + (width - plot.right) + '" y2="' + y.toFixed(1) + '"></line><text class="chart-axis-label" x="' + (plot.left - 5) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + escapeHtml(formatChartAxisValue(value)) + '</text>';
        }).join("");
        const dateLabels = chartPoints.length === 1
          ? '<text class="chart-axis-label" x="' + chartPoints[0].x.toFixed(1) + '" y="' + (height - 7) + '" text-anchor="middle">' + escapeHtml(shortChartDate(chartPoints[0].date)) + '</text>'
          : '<text class="chart-axis-label" x="' + plot.left + '" y="' + (height - 7) + '">' + escapeHtml(shortChartDate(chartPoints[0].date)) + '</text><text class="chart-axis-label" x="' + (width - plot.right) + '" y="' + (height - 7) + '" text-anchor="end">' + escapeHtml(shortChartDate(chartPoints.at(-1).date)) + '</text>';
        return `
          <div class="chart-card" data-chart-key="${chartKey}">
            <header><strong>${escapeHtml(title)}</strong><span class="status-pill">${values.length} points</span></header>
            <div class="chart-svg">
              <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)} chart">
                <defs><clipPath id="chart-clip-${chartKey}"><rect x="${plot.left - 3}" y="${plot.top - 3}" width="${plotWidth + 6}" height="${plotHeight + 6}" rx="3"></rect></clipPath></defs>
                ${grid}
                <polyline class="chart-line" points="${polyline}" clip-path="url(#chart-clip-${chartKey})"></polyline>
                ${selectedPoint ? '<line class="chart-selected-guide" x1="' + selectedPoint.x.toFixed(1) + '" y1="' + selectedPoint.y.toFixed(1) + '" x2="' + selectedPoint.x.toFixed(1) + '" y2="' + (plot.top + plotHeight).toFixed(1) + '"></line>' : ""}
                ${chartPoints.map((point, index) => { const isSelected = index === selectedIndex; const activationKey = registerChartPointActivation(chartKey, point, scope); return '<g class="chart-point ' + (isSelected ? 'selected' : '') + '" role="button" tabindex="0" aria-pressed="' + (isSelected ? 'true' : 'false') + '" aria-label="' + escapeHtml(title + ': ' + point.value + ' on ' + formatDate(point.date)) + '" data-action="show-chart-point" data-chart-point-key="' + activationKey + '"><circle class="hit-area" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="17"></circle><circle class="selected-ring" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="9"></circle><circle class="visible-point" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="4.5"></circle></g>'; }).join("")}
                ${dateLabels}
              </svg>
            </div>
            ${selected ? renderChartPointDetail(chartKey, title, selected, validPoints) : ""}
          </div>
        `;
      }

      function formatChartAxisValue(value) {
        const absolute = Math.abs(value);
        if (absolute >= 1000) return (value / 1000).toFixed(absolute >= 10000 ? 0 : 1) + "k";
        return absolute >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
      }

      function shortChartDate(dateIso) {
        const date = new Date(dateIso + "T00:00:00");
        return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
      }

      function renderChartPointDetail(chartKey, title, point, points) {
        const exerciseName = selectedExerciseName();
        const exercise = selectedExerciseRecord();
        const index = points.findIndex((item) => item.date === point.date && item.value === point.value);
        const previous = index > 0 ? points[index - 1] : null;
        const comparison = previous && previous.value ? ((point.value - previous.value) / previous.value) * 100 : null;
        const close = '<button class="icon-button" type="button" data-action="close-chart-point" aria-label="Close chart detail">X</button>';
        if (chartKey === "e1rm") {
          if (point.metricType !== "e1rm") {
            const best = [...point.details].sort((a, b) => point.metricType === "assistance_load" ? Number(a.weight || 0) - Number(b.weight || 0) : Number(b.weight || 0) - Number(a.weight || 0) || Number(b.reps || 0) - Number(a.reps || 0))[0];
            const unitLabel = ["added_load", "assistance_load"].includes(point.metricType) ? " " + data.settings.weightUnit : point.metricType.includes("duration") ? " sec" : point.metricType.includes("distance") ? " m" : " reps";
            return '<article class="chart-detail" role="status"><div class="row split"><strong>' + escapeHtml(title + ' · ' + point.value + unitLabel) + '</strong>' + close + '</div><div class="chart-detail-facts"><div><span>Date</span><strong>' + formatDate(point.date) + '</strong></div><div><span>Exercise</span><strong>' + escapeHtml(exerciseName) + '</strong></div><div><span>Best set</span><strong>' + escapeHtml(best ? formatSetPerformance(best, exercise) : '-') + '</strong></div><div><span>Metric</span><strong>' + escapeHtml(title) + '</strong></div></div><small>Bodyweight resistance is tracked through reps, effort, and explicit added or assistance load. This is not treated as total system load.</small></article>';
          }
          const best = [...point.details].filter((set) => set.weight > 0).sort((a, b) => estimatedOneRepMax(b) - estimatedOneRepMax(a))[0];
          const priorMax = Math.max(0, ...points.slice(0, Math.max(0, index)).map((item) => item.value));
          const isPr = point.value > priorMax;
          return '<article class="chart-detail" role="status"><div class="row split"><strong>Estimated 1RM · ' + point.value + ' ' + data.settings.weightUnit + '</strong>' + close + '</div><div class="chart-detail-facts"><div><span>Date</span><strong>' + formatDate(point.date) + '</strong></div><div><span>Exercise</span><strong>' + escapeHtml(exerciseName) + '</strong></div><div><span>Load × reps</span><strong>' + escapeHtml(best ? best.weight + ' ' + data.settings.weightUnit + ' × ' + best.reps : '-') + '</strong></div><div><span>RPE</span><strong>' + escapeHtml(best?.rpe || '-') + '</strong></div></div><small>Epley estimate: load × (1 + reps ÷ 30).' + (isPr ? ' Personal record for the available history.' : '') + '</small></article>';
        }
        if (chartKey === "volume") {
          if (point.metricType !== "conventional_volume") {
            const contributing = point.details.slice().sort((a, b) => a.setNumber - b.setNumber);
            return '<article class="chart-detail volume-chart-detail" role="status"><div class="row split"><div><span class="section-kicker">Selected exercise work</span><strong>' + escapeHtml(title + ' · ' + point.value) + '</strong></div>' + close + '</div><div class="chart-detail-facts"><div><span>Date</span><strong>' + formatDate(point.date) + '</strong></div><div><span>Exercise</span><strong>' + escapeHtml(exerciseName) + '</strong></div><div><span>Sets included</span><strong>' + contributing.length + '</strong></div><div><span>Vs previous</span><strong>' + (comparison == null ? 'Baseline' : (comparison >= 0 ? '+' : '') + comparison.toFixed(1) + '%') + '</strong></div></div><div class="volume-set-list">' + contributing.map((set, index) => '<div class="volume-set-row"><strong>Set ' + (set.setNumber > 0 ? set.setNumber : index + 1) + '</strong><div class="volume-set-main"><strong>' + escapeHtml(formatSetPerformance(set, exercise)) + '</strong><span>' + resistanceTypeLabel(set.resistanceType) + '</span></div><div class="volume-set-total"><span>Contribution</span><strong>' + (point.metricType.includes('duration') ? Number(set.durationSeconds || 0) + ' sec' : point.metricType.includes('distance') ? Number(set.distance || 0) + ' m' : Number(set.reps || 0) + ' reps') + '</strong></div></div>').join('') + '</div><small>No unsupported bodyweight-based volume load is estimated.</small></article>';
          }
          const contributing = point.details.filter((set) => set.weight > 0).sort((a, b) => a.setNumber - b.setNumber);
          return '<article class="chart-detail volume-chart-detail" role="status"><div class="row split"><div><span class="section-kicker">Selected exercise volume</span><strong>Volume load · ' + point.value.toLocaleString() + ' ' + data.settings.weightUnit + '</strong></div>' + close + '</div><div class="chart-detail-facts"><div><span>Date</span><strong>' + formatDate(point.date) + '</strong></div><div><span>Exercise</span><strong>' + escapeHtml(exerciseName) + '</strong></div><div><span>Sets included</span><strong>' + contributing.length + '</strong></div><div><span>Vs previous</span><strong>' + (comparison == null ? 'Baseline' : (comparison >= 0 ? '+' : '') + comparison.toFixed(1) + '%') + '</strong></div></div><div class="volume-set-list">' + contributing.map((set, index) => { const setVolume = Number(set.weight || 0) * Number(set.reps || 0); return '<div class="volume-set-row"><strong>Set ' + (set.setNumber > 0 ? set.setNumber : index + 1) + '</strong><div class="volume-set-main"><strong>' + set.weight + ' ' + data.settings.weightUnit + ' × ' + set.reps + '</strong><span>' + (set.rpe ? 'RPE ' + set.rpe : 'RPE not recorded') + '</span></div><div class="volume-set-total"><span>Set volume</span><strong>' + setVolume.toLocaleString() + ' ' + data.settings.weightUnit + '</strong></div></div>'; }).join('') + '</div><small>' + escapeHtml(contributing[0]?.sessionTitle || '') + ' · Total reflects this exercise only.</small></article>';
        }
        return "";
      }

      function renderLiftProgressSummary(weeks, weekStart) {
        const index = weeks.findIndex((week) => week.weekStart === weekStart);
        const current = weeks[index >= 0 ? index : 0];
        const previous = weeks.slice((index >= 0 ? index : 0) + 1).find((week) => !week.isLikelyDeload);
        if (!current) return "";
        if (!previous) return '<div class="inline-panel"><strong>Baseline week</strong><p class="settings-note">' + current.completedSets + ' completed sets established the first comparison point for this lift.</p></div>';
        const e1rmChange = current.bestEstimatedOneRepMax - previous.bestEstimatedOneRepMax;
        const loadChange = current.topWeight - previous.topWeight;
        const volumeChange = current.completedSets - previous.completedSets;
        const direction = e1rmChange > 0.5 ? "improved" : e1rmChange < -0.5 ? "regressed" : "held steady";
        const details = [
          "Estimated 1RM " + direction + (Math.abs(e1rmChange) > 0.05 ? " by " + Math.abs(e1rmChange).toFixed(1) + " " + data.settings.weightUnit : ""),
          loadChange === 0 ? "top load held" : "top load " + (loadChange > 0 ? "rose " : "fell ") + Math.abs(loadChange) + " " + data.settings.weightUnit,
          volumeChange === 0 ? "working sets held" : Math.abs(volumeChange) + " " + (volumeChange > 0 ? "more" : "fewer") + " completed sets"
        ];
        return '<div class="inline-panel"><strong>' + formatDate(current.weekStart) + ' vs ' + formatDate(previous.weekStart) + '</strong><p class="settings-note">' + escapeHtml(details.join("; ")) + '. ' + (current.isDeload ? 'This week was marked as a deload, so it is not treated as a regression.' : 'Use this comparison with RPE and rep quality, not load alone.') + '</p></div>';
      }

      function hypertrophyWindowLabel(selection) {
        if (!selection?.included?.length) return "No qualifying weeks";
        const newestStart = selection.included[0].weekStart;
        const oldestStart = selection.included.at(-1).weekStart;
        const newestEndDate = new Date(newestStart + "T00:00:00");
        newestEndDate.setDate(newestEndDate.getDate() + 6);
        return formatDate(selection.windowStart || oldestStart) + " - " + formatDate(selection.windowEnd || localDateIso(newestEndDate));
      }

      function hypertrophyScoreTone(score) {
        const value = Number(score || 0);
        if (value >= 90) return "score-excellent";
        if (value >= 80) return "score-very-good";
        if (value >= 70) return "score-good";
        if (value >= 60) return "score-mixed";
        if (value >= 40) return "score-limiting";
        return "score-critical";
      }

      function hypertrophyLetterGrade(score) {
        const value = Number(score || 0);
        if (value >= 97) return "A+";
        if (value >= 93) return "A";
        if (value >= 90) return "A-";
        if (value >= 87) return "B+";
        if (value >= 83) return "B";
        if (value >= 80) return "B-";
        if (value >= 77) return "C+";
        if (value >= 73) return "C";
        if (value >= 70) return "C-";
        if (value >= 67) return "D+";
        if (value >= 63) return "D";
        if (value >= 60) return "D-";
        return "F";
      }

      function hypertrophyGradeLabel(grade) {
        return grade.replace("+", " plus").replace("-", " minus");
      }

      function renderHypertrophyScoreDetail(analysis) {
        const confidenceReason = analysis.confidence === "high"
          ? "Six qualifying weeks, strong saved-target coverage, consistent RPE logging, and several comparable lift exposures support this result."
          : analysis.confidence === "moderate"
            ? "The score is useful, but limited saved-target coverage, RPE logging, comparable sessions, or exercise continuity reduce precision."
            : "This is provisional. More submitted workouts with saved program targets, RPE entries, and comparable exercise exposures are needed.";
        return `<section class="hypertrophy-detail" aria-label="Hypertrophy Score explanation for ${escapeHtml(analysis.scopeLabel)}">
          <div><div class="section-kicker">${escapeHtml(analysis.scopeLabel)} · Score summary</div><h2>${analysis.score} / 100 · ${escapeHtml(analysis.interpretation)}</h2></div>
          <p>${escapeHtml(analysis.scopeDescription)} It evaluates past training quality and progression signals; it does not measure muscle gain or issue a second training prescription. Current decisions come from the versioned unified prescription cards.</p>
          <div><h3>Weeks analyzed</h3><div class="score-week-list">${analysis.included.map((week) => '<span class="score-week-chip">' + formatWeek(week.weekStart).replace('Week of ', '') + '</span>').join('')}</div></div>
          ${analysis.skippedDeloadWeeks.length ? '<div><h3>Skipped deload weeks</h3><div class="score-week-list">' + analysis.skippedDeloadWeeks.map((week) => '<span class="score-week-chip deload">' + formatWeek(week.weekStart).replace('Week of ', '') + ' · Deload</span>').join('') + '</div></div>' : ''}
          ${analysis.incompleteWeeks.length ? '<div><h3>Low-data weeks not counted</h3><div class="score-week-list">' + analysis.incompleteWeeks.map((week) => '<span class="score-week-chip">' + formatWeek(week.weekStart).replace('Week of ', '') + '</span>').join('') + '</div></div>' : ''}
          <div><h3>Category breakdown</h3><div class="score-category-list">${analysis.categories.map((category) => { const ratio = category.excluded ? 0 : category.points / category.max; const onTarget = !category.excluded && ratio >= 0.95; return '<details class="score-category ' + (category.excluded ? '' : hypertrophyScoreTone(ratio * 100)) + '"><summary><strong>' + escapeHtml(category.label) + '</strong><span>' + (category.excluded ? 'Not scored' : category.points.toFixed(1) + ' / ' + category.max) + '</span></summary><div><span>' + escapeHtml(category.detail) + '</span><strong>' + (category.excluded ? 'Program target needed' : onTarget ? 'Status' : 'How to improve') + '</strong><span>' + escapeHtml(category.excluded ? 'Set this target in a workout template. Historical sessions without a saved prescription are not retroactively judged.' : onTarget ? 'On target. Maintain this pattern.' : category.action) + '</span></div></details>'; }).join('')}</div></div>
          <div><h3>What is going well</h3><div class="score-findings">${analysis.positives.map((item) => '<div class="score-finding"><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.detail) + '</span></div>').join('')}</div></div>
          <div><h3>What could be improved</h3>${analysis.improvements.length ? '<div class="score-findings">' + analysis.improvements.slice(0, 3).map((item) => '<div class="score-finding improve"><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.detail) + '</span><span><strong>Observed:</strong> ' + escapeHtml(item.evidence) + '</span><span><strong>Expected:</strong> ' + escapeHtml(item.threshold) + '</span><span><strong>Retrospective cue:</strong> ' + escapeHtml(item.action) + '</span></div>').join('') + '</div>' : '<div class="score-no-weakness"><strong>No material weaknesses identified</strong><span>Maintain the current progression and execution pattern. The app will surface an opportunity when a recorded metric crosses its documented threshold.</span></div>'}</div>
          ${analysis.actions.length ? '<div><h3>How to improve this retrospective score</h3><div class="score-actions">' + analysis.actions.map((item) => '<div class="score-action"><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.detail) + '</span></div>').join('') + '</div></div>' : ''}
          <div class="inline-panel"><strong>${analysis.confidence.charAt(0).toUpperCase() + analysis.confidence.slice(1)} confidence</strong><p class="settings-note">${escapeHtml(confidenceReason)}</p></div>
        </section>`;
      }

      function renderHypertrophyScore(analysis, options = {}) {
        if (hypertrophyScoreLoading) return '<section class="hypertrophy-score-empty score-loading" role="status" aria-live="polite"><strong>Recalculating Hypertrophy Score...</strong><p>Loading the submitted history for the selected exercise.</p></section>';
        if (analysis.score == null) return '<section class="hypertrophy-score-empty"><strong>' + escapeHtml(analysis.scopeLabel) + ' · Not enough data yet</strong><p>' + (analysis.scopeType === 'exercise' ? 'Submit at least one qualifying week with two completed working sets for this exact exercise variation. The app will not substitute the overall-program score.' : 'Submit at least one week with three completed working sets and at least half of its planned work finished.') + '</p></section>';
        const trend = analysis.trend == null ? "No prior six-week window" : (analysis.trend >= 0 ? "+" : "") + analysis.trend + " vs prior window";
        const weekText = analysis.included.length + (analysis.included.length === 1 ? " qualifying week" : " qualifying weeks") + (analysis.provisional ? " · Provisional" : "");
        return `<div class="hypertrophy-score-wrap">
          <button class="hypertrophy-score-card ${hypertrophyScoreTone(analysis.score)}" type="button" data-action="toggle-hypertrophy-score" aria-expanded="${hypertrophyScoreExpanded ? 'true' : 'false'}" style="--score:${analysis.score}">
            <div><span class="hypertrophy-score-title">${escapeHtml(analysis.scoreTitle)}</span><strong class="hypertrophy-score-number">${analysis.score} <small>/ 100</small></strong><span class="hypertrophy-score-scope">${escapeHtml(analysis.scopeDescription)}</span></div>
            <span class="hypertrophy-score-grade" role="img" aria-label="Letter grade ${escapeHtml(hypertrophyGradeLabel(hypertrophyLetterGrade(analysis.score)))}">${hypertrophyLetterGrade(analysis.score)}</span>
            <div class="hypertrophy-score-bar"><span></span></div>
            <div class="hypertrophy-score-meta"><strong>${escapeHtml(analysis.interpretation)}</strong><span>${escapeHtml(hypertrophyWindowLabel(analysis))}</span><span>${escapeHtml(weekText)}</span><span>${escapeHtml(trend)}</span><span>${escapeHtml(analysis.confidence)} confidence</span><span>${hypertrophyScoreExpanded ? 'Hide analysis' : 'Open analysis'} ›</span></div>
          </button>
          ${hypertrophyScoreExpanded && !options.deferDetail ? renderHypertrophyScoreDetail(analysis) : ""}
        </div>`;
      }

      function renderTargetSetType(type) {
        const scoreLabel = type.isWarmup
          ? "Excluded from hypertrophy score, hard-set volume, and PR calculations"
          : (type.countsTowardScore ? "Included in hypertrophy score" : "Excluded from hypertrophy score") + " · " + (type.countsTowardVolume ? "Counts toward hard-set volume" : "Excluded from hard-set volume");
        const loadRule = type.type === "drop" && (type.loadReductionMin || type.loadReductionMax)
          ? targetRangeText(type.loadReductionMin, type.loadReductionMax, "% reduction from prior set")
          : type.loadRule || "No separate load rule";
        return `<div class="set-type-block" data-set-type="${escapeHtml(type.type)}">
          <div class="set-type-title"><strong>${escapeHtml(type.label)}</strong><span class="status-pill ${type.isWarmup ? '' : 'inside'}">${type.setCount} ${type.setCount === 1 ? 'set' : 'sets'}</span></div>
          <div class="expectation-grid">
            <div><span>Target reps</span><strong>${escapeHtml(targetRangeText(type.repMin, type.repMax))}</strong></div>
            <div><span>Target RPE</span><strong>${escapeHtml(targetRangeText(type.rpeMin, type.rpeMax))}</strong></div>
            <div><span>Rest</span><strong>${type.restSeconds ? escapeHtml(formatTimer(type.restSeconds)) : 'Not configured'}</strong></div>
            <div><span>${type.type === 'drop' ? 'Load reduction' : 'Load rule'}</span><strong>${escapeHtml(loadRule)}</strong></div>
          </div>
          <p class="expectation-note">${escapeHtml(scoreLabel)}.</p>
        </div>`;
      }

      function targetContextExpectationSummary(context) {
        if (!context) return { sets: "Not configured", reps: "Not configured", rpe: "Not configured", rest: "Not configured" };
        const scored = context.setTypes.filter((type) => type.countsTowardScore);
        const unique = (values) => Array.from(new Set(values.filter((value) => value && value !== "Not configured")));
        return {
          sets: scored.length ? String(scored.reduce((sum, type) => sum + Number(type.setCount || 0), 0)) + " per session" : "Not configured",
          reps: unique(scored.map((type) => targetRangeText(type.repMin, type.repMax))).join(" · ") || "Not configured",
          rpe: unique(scored.map((type) => targetRangeText(type.rpeMin, type.rpeMax))).join(" · ") || "Not configured",
          rest: unique(scored.map((type) => type.restSeconds ? formatTimer(type.restSeconds) : "")).join(" · ") || "Not configured"
        };
      }

      function renderExerciseExpectations(exerciseId, analysis) {
        const contexts = hypertrophyWindowOffset > 0 ? [] : currentExerciseTargetContexts(exerciseId);
        const actuals = exerciseExpectationActuals(exerciseId, analysis);
        const historicalConfigured = actuals.filter((group) => group.context).length;
        const historicalChanged = new Set(actuals.filter((group) => group.context).map((group) => group.context.id + "|" + JSON.stringify(group.context.setTypes))).size > 1;
        return `<section class="exercise-expectations" aria-label="Exercise Expectations">
          <div class="section-heading"><div><div class="section-kicker">Score standard</div><h2>Exercise Expectations</h2><p>These are the program targets used to interpret rep execution, effort, completion, and volume.</p></div></div>
          ${contexts.length ? contexts.map((context, index) => `<article class="expectation-context">
            <div class="expectation-context-head"><div><h3>${escapeHtml(context.templateName)}</h3><p>${escapeHtml(context.role)} · ${escapeHtml(context.source)}${index === 0 ? ' · Current' : ''}</p></div><span class="status-pill ${index === 0 ? 'inside' : ''}">${escapeHtml(context.sessionType)}</span></div>
            <div class="set-type-list">${context.setTypes.map(renderTargetSetType).join('')}</div>
            <details class="expectation-advanced"><summary>Progression and scoring rules</summary><p><strong>Progression:</strong> ${escapeHtml(context.progressionRule)}</p><p>Each submitted set is graded against the set type and prescription saved with that workout. Readiness adjustments remain temporary and do not overwrite this base template.</p></details>
          </article>`).join('') : hypertrophyWindowOffset > 0 ? '<div class="expectation-missing"><strong>Historical targets only</strong><span>Current template targets are intentionally hidden in this snapshot. The execution below uses only prescriptions saved with workouts inside the selected period.</span></div>' : '<div class="expectation-missing"><strong>No active program target</strong><span>Add this exercise to a workout template and configure sets, reps, RPE, and rest. Missing targets are excluded from compliance scoring rather than invented.</span></div>'}
          <div class="actual-expected"><h3>Actual vs Expected · analyzed window</h3>
            ${actuals.length ? actuals.map((group) => {
              const dateLabel = group.dateStart ? ' · ' + formatDate(group.dateStart) + (group.dateEnd && group.dateEnd !== group.dateStart ? ' to ' + formatDate(group.dateEnd) : '') : '';
              if (!group.context) return '<div class="actual-expected-context"><strong>Historical target unavailable' + dateLabel + '</strong><div class="expectation-missing"><span>The submitted sets remain visible, but this period has no effective-dated prescription. Compliance is excluded and confidence is reduced.</span></div></div>';
              const roles = group.roles || [];
              return '<div class="actual-expected-context"><strong>' + escapeHtml(group.label) + dateLabel + ' · ' + group.sessionCount + (group.sessionCount === 1 ? ' session' : ' sessions') + (group.context.resolutionSource === 'current-fallback' ? ' · current target fallback' : '') + '</strong><div class="actual-role-grid">'
                + roles.map((role) => {
                  const target = group.context.setTypes.find((type) => type.type === role.key) || {};
                  const expectedReps = target.repMin || target.repMax ? (target.repMin || target.repMax) + (target.repMax && target.repMax !== target.repMin ? '–' + target.repMax : '') + ' reps' : 'Not configured';
                  const expectedRpe = target.rpeMin || target.rpeMax ? (target.rpeMin || target.rpeMax) + (target.rpeMax && target.rpeMax !== target.rpeMin ? '–' + target.rpeMax : '') : 'Not configured';
                  const repActual = role.repTracked ? role.repHits + ' of ' + role.repTracked + ' in range · ' + Math.round(role.repHits / role.repTracked * 100) + '%' : (expectedReps === 'Not configured' ? 'Excluded from score' : 'No completed sets');
                  const rpeActual = role.rpeTracked ? role.rpeHits + ' of ' + role.rpeTracked + ' in range · ' + Math.round(role.rpeHits / role.rpeTracked * 100) + '%' : (expectedRpe === 'Not configured' ? 'Excluded from score' : 'No logged RPE');
                  const averageSets = group.sessionCount ? Math.round(role.completedSets / group.sessionCount * 10) / 10 : 0;
                  return '<div class="actual-role-card"><strong>' + escapeHtml(role.label) + '</strong><div class="actual-role-metric"><div><span>Expected sets</span><b>' + Number(target.setCount || 0) + ' per session</b></div><div><span>Actual sets</span><b>' + averageSets + ' average</b></div></div><div class="actual-role-metric"><div><span>Expected reps</span><b>' + escapeHtml(expectedReps) + '</b></div><div><span>Rep compliance</span><b>' + escapeHtml(repActual) + '</b></div></div><div class="actual-role-metric"><div><span>Expected RPE</span><b>' + escapeHtml(expectedRpe) + '</b></div><div><span>RPE compliance</span><b>' + escapeHtml(rpeActual) + '</b></div></div></div>';
                }).join('') + '</div></div>';
            }).join('') : '<div class="expectation-missing"><strong>No qualifying execution data</strong><span>Current program expectations are shown above. Submit this exercise to populate the six-week comparison.</span></div>'}
          </div>
          ${historicalChanged ? '<p class="expectation-note"><strong>Targets changed during this window.</strong> Each session was scored against the target saved on that date; current template settings were not applied retroactively.</p>' : ''}
          ${actuals.some((group) => !group.context) ? '<p class="expectation-note"><strong>Some historical targets are unknown.</strong> Those imported or legacy sets remain visible, but rep-range and RPE compliance are not scored without a saved prescription.</p>' : ''}
          ${contexts.length > 1 ? '<p class="expectation-note"><strong>Multiple program contexts.</strong> Heavy, light, technique, and other template uses remain separate above and in the actual-versus-expected comparison.</p>' : ''}
        </section>`;
      }

      function renderReview() {
        resetChartPointActivations();
        const catalog = exerciseCatalog();
        if ((!selectedExerciseId || !catalog.some((item) => item.id === selectedExerciseId)) && catalog[0]) {
          selectedExerciseId = catalog[0].id;
          chartExerciseDraft = catalog[0].name;
        }
        const pendingExercise = selectedExerciseRecord();
        if (hypertrophyScoreLoading && catalog.length) {
          return `<section class="view charts-view" aria-busy="true"><div class="screen-heading"><div><div class="section-kicker">Charts</div><h1>${escapeHtml(pendingExercise?.name || 'Exercise analysis')}</h1></div></div><div class="chart-control-panel"><div class="chart-viewing-summary"><div><span>Viewing</span><strong>${escapeHtml(pendingExercise?.name || 'Selected exercise')}</strong><span>Exercise analysis · recalculating every dependent value</span></div><span class="status-pill inside">Loading</span></div></div><div class="chart-recalculating" role="status"><strong>Recalculating analysis</strong><span>Charts, score, rationale, expectations, actual versus expected, recommendations, and selected-point details are cleared until the new scope is ready.</span></div></section>`;
        }
        const analysis = measurePerformance("charts:hypertrophyAnalysis", () => hypertrophyAnalysis(hypertrophyWindowOffset, "exercise", selectedExerciseId), { exerciseId: selectedExerciseId, windowOffset: hypertrophyWindowOffset });
        const exercise = selectedExerciseRecord();
        const selectedName = exercise?.name || "";
        const analysisOptions = { canonicalExerciseId: selectedExerciseId, throughDate: analysis.windowEnd || todayIso(), retentionAsOfDate: todayIso() };
        const allWeeks = selectedName ? measurePerformance("charts:summarizeExerciseByWeek", () => summarizeExerciseByWeek(selectedName, analysisOptions), { exerciseId: selectedExerciseId }) : [];
        const qualifyingWeekIds = new Set(analysis.qualifyingWeekIds || []);
        const weeks = allWeeks.filter((week) => qualifyingWeekIds.has(week.weekStart));
        const progress = selectedName ? measurePerformance("charts:exerciseProgressSeries", () => exerciseProgressSeries(selectedName, { ...analysisOptions, qualifyingWeekIds: analysis.qualifyingWeekIds, resistanceType: exercise?.resistanceType }), { exerciseId: selectedExerciseId }) : { e1rm: [], volume: [], primaryTitle: "Estimated 1RM", secondaryTitle: "Volume load", latestPrimary: "Latest e1RM", latestSecondary: "Latest volume", resistanceType: "external" };
        const latestReviewWeek = weeks[0]?.weekStart || "";
        const recommendation = selectedName && latestReviewWeek ? coachRecommendationForExercise(selectedName, { ...analysisOptions, weekStart: latestReviewWeek, historical: hypertrophyWindowOffset > 0 }) : null;
        if (catalog.length === 0) {
          return '<section class="view charts-view"><div class="screen-heading"><div><div class="section-kicker">Charts</div><h1>Lift progress</h1></div></div><div class="empty-state">Log an exercise, then this screen will show progression charts and next-step guidance.</div></section>';
        }
        const latestOneRm = progress.e1rm.filter((point) => point.value > 0).at(-1);
        const latestVolume = progress.volume.filter((point) => point.value > 0).at(-1);
        const chartPointScope = {
          exerciseId: selectedExerciseId,
          windowOffset: hypertrophyWindowOffset,
          throughDate: analysisOptions.throughDate,
          qualifyingWeekIds: analysis.qualifyingWeekIds,
          resistanceType: exercise?.resistanceType || progress.resistanceType
        };
        return `
          <section class="view charts-view">
            <div class="screen-heading"><div><div class="section-kicker">${hypertrophyWindowOffset > 0 ? 'Historical snapshot through ' + formatDate(analysis.windowEnd) : 'Selected lift'}</div><h1>${escapeHtml(selectedName)}</h1></div><span class="status-pill inside">${analysis.included.length} qualifying week${analysis.included.length === 1 ? '' : 's'} · ${analysis.dataPointCount} sets</span></div>
            <div class="chart-control-panel" aria-label="Selected lift controls">
              <div class="chart-viewing-summary"><div><span>Viewing</span><strong>${escapeHtml(selectedName)}</strong><span>Exercise analysis · ${formatDate(analysis.windowStart)} – ${formatDate(analysis.windowEnd)}</span></div><span class="status-pill inside">${analysis.included.length} qualifying · ${analysis.skippedDeloadWeeks.length} deload skipped</span></div>
              <div class="chart-control-field chart-control-lift"><label for="chart-exercise-search">Chart lift</label><div class="chart-search-input"><input id="chart-exercise-search" type="search" data-action="review-exercise-input" role="combobox" aria-autocomplete="list" aria-controls="chart-exercise-suggestions" aria-expanded="${chartExerciseSearchOpen ? 'true' : 'false'}" aria-label="Search or select exercise" autocomplete="off" value="${escapeHtml(chartExerciseDraft || selectedName)}" /><button class="chart-search-clear" type="button" data-action="clear-chart-exercise-search" aria-label="Clear exercise search">×</button></div><div id="chart-exercise-suggestions" class="exercise-suggestions" role="listbox" ${chartExerciseSearchOpen ? '' : 'hidden'}>${renderExerciseSuggestions()}</div><small class="exercise-search-error" role="status" ${chartExerciseSearchError ? '' : 'hidden'}>${escapeHtml(chartExerciseSearchError)}</small></div>
              <div class="chart-control-field analysis-period-control"><span>Analysis period</span><details class="analysis-period-menu"><summary>${escapeHtml((hypertrophyWindowOffset === 0 ? 'Latest qualifying period' : 'Historical period ' + hypertrophyWindowOffset) + ' · ' + hypertrophyWindowLabel(analysis))}<span aria-hidden="true">⌄</span></summary><div class="analysis-period-options">${analysis.windowOptions.length ? analysis.windowOptions.map((option, index) => '<button type="button" data-action="select-chart-period" data-period-offset="' + option.offset + '" aria-pressed="' + (option.offset === hypertrophyWindowOffset) + '"><strong>' + escapeHtml(index === 0 ? 'Latest 6 qualifying weeks' : 'Previous qualifying period ' + index) + '</strong><br><small>' + escapeHtml(hypertrophyWindowLabel(option.selection)) + '</small></button>').join('') : '<button type="button" aria-pressed="true">Latest qualifying period</button>'}</div></details></div>
              <p class="chart-control-context">Score, rationale, weeks, charts, and coaching use only submitted ${escapeHtml(selectedName)} history. Equipment and named variations remain separate.</p>
            </div>
            ${renderHypertrophyScore(analysis, { deferDetail: true })}
            ${renderExerciseExpectations(selectedExerciseId, analysis)}
            ${hypertrophyScoreExpanded ? renderHypertrophyScoreDetail(analysis) : ""}
            <div class="chart-metric-row"><div><span>${escapeHtml(progress.latestPrimary)}</span><strong>${latestOneRm ? latestOneRm.value : "-"}</strong></div><div><span>${escapeHtml(progress.latestSecondary)}</span><strong>${latestVolume ? latestVolume.value : "-"}</strong></div><div><span>Data points</span><strong>${analysis.dataPointCount}</strong></div></div>
            ${latestReviewWeek && progress.resistanceType === 'external' ? renderLiftProgressSummary(weeks, latestReviewWeek) : ''}
            ${recommendation ? '<section class="coach-recommendation-wrap"><div class="section-kicker">' + (hypertrophyWindowOffset > 0 ? 'Coach recommendation at the end of this period' : 'Coach Recommendation') + '</div>' + renderRecommendation(recommendation) + '</section>' : ""}
            <section class="screen-section">
              <div class="section-heading"><div><h2>Progress charts</h2><p>Tap a point to see its value, date, and session context.</p></div></div>
              <div class="chart-list">
                ${renderChart("e1rm", progress.primaryTitle, progress.e1rm, "No comparable completed sets yet.", chartPointScope)}
                ${renderChart("volume", progress.secondaryTitle, progress.volume, "No completed work is available for this metric yet.", chartPointScope)}
              </div>
            </section>
            <section class="screen-section trend-section"><div class="section-heading"><div><h2>Recent weeks</h2></div></div><div class="trend-table">
              <div class="trend-head"><span>Week</span><span>Top</span><span>Sets</span><span>RPE</span></div>
              ${weeks.map((week) => `
                <div class="trend-row">
                  <span>${formatDate(week.weekStart)}${week.travelCount ? " - Travel" : ""}${week.isDeload ? " - Deload" : ""}</span>
                  <span>${week.topWeight}</span>
                  <span>${week.completedSets}/${week.completedSets + week.failedSets}</span>
                  <span>${week.averageRpe ? week.averageRpe.toFixed(1) : "-"}</span>
                </div>
              `).join("")}
            </div></section>
          </section>
        `;
      }

      function renderRecommendation(recommendation) {
        if (recommendation.recommendationSnapshot) {
          const snapshot = recommendation.recommendationSnapshot;
          const base = snapshot.basePrescription;
          const prescription = snapshot.finalPrescription;
          const changed = Boolean(prescription.readinessAdjustment?.changed);
          const tone = prescription.recommendationType.includes("deload") ? "deload" : ["substitute", "rotate_exercise"].includes(prescription.recommendationType) ? "change" : prescription.recommendationType === "progress" ? "progress" : "hold";
          return `
            <article class="recommendation unified-recommendation ${tone}">
              <span>${escapeHtml(prescription.recommendationType.replaceAll('_', ' '))} · ${escapeHtml(prescription.confidence)} confidence</span>
              <h2>${escapeHtml(recommendationLabel(prescription.recommendationType))}</h2>
              <p><strong>${escapeHtml(recommendation.affectedExerciseName || prescription.exerciseId)}</strong></p>
              <div class="unified-recommendation-grid">
                <div><span>Sets</span><strong>${escapeHtml(prescriptionMetric(prescription.workingSets))}</strong></div>
                <div><span>Reps</span><strong>${escapeHtml(prescriptionMetric(prescription.repRange))}</strong></div>
                <div><span>Effort</span><strong>RPE ${escapeHtml(prescription.targetRpe.min + '-' + prescription.targetRpe.max)} · RIR ${escapeHtml(prescription.targetRir.min + '-' + prescription.targetRir.max)}</strong></div>
                <div><span>Set structure</span><strong>${escapeHtml(prescription.setStructure.replaceAll('_', ' '))}</strong></div>
                <div><span>Rest</span><strong>${escapeHtml(prescriptionMetric(prescription.restSeconds, ' sec'))}</strong></div>
                <div><span>Mesocycle role</span><strong>${escapeHtml(prescription.role.replaceAll('_', ' '))}</strong></div>
              </div>
              ${changed ? '<div class="readiness-temporary"><strong>Base:</strong> ' + escapeHtml(base.workingSets.target + ' sets · ' + base.repRange.min + '-' + base.repRange.max + ' reps · RPE ' + base.targetRpe.min + '-' + base.targetRpe.max) + '<br/><strong>Today:</strong> ' + escapeHtml(prescription.workingSets.target + ' sets · ' + prescription.repRange.min + '-' + prescription.repRange.max + ' reps · RPE ' + prescription.targetRpe.min + '-' + prescription.targetRpe.max) + '<br/>' + escapeHtml(prescription.readinessAdjustment.explanation) + '</div>' : ''}
              <p><strong>Next action:</strong> ${escapeHtml(prescription.progressionRule)}</p>
              <p><strong>Deload status:</strong> ${escapeHtml(recommendationLabel(prescription.deloadStatus?.state || 'normal'))}</p>
              <details class="compact-disclosure"><summary>Why This Recommendation <span>${prescription.evidenceSummary.length}</span></summary>${renderUnifiedEvidence(snapshot)}</details>
            </article>
          `;
        }
        const interventionLabels = { normal: recommendation.label || "Normal session", light: "Perform a Light Session", deload: "Deload", stop_modify: "Stop or Modify" };
        const intervention = recommendation.interventionType || (recommendation.decision === "deload" ? "deload" : "normal");
        const execution = [];
        if (recommendation.progressionAction === "increase_load" && Number(recommendation.targetLoad || 0) > 0) execution.push("Next resistance " + formatResistance({ weight: recommendation.targetLoad, addedLoad: recommendation.resistanceType === "bodyweight_plus_load" ? recommendation.targetLoad : 0, assistanceLoad: recommendation.resistanceType === "assisted_bodyweight" ? recommendation.targetLoad : 0, resistanceType: recommendation.resistanceType, weightUnit: data.settings.weightUnit }, { name: recommendation.affectedExerciseName, resistanceType: recommendation.resistanceType }));
        if (recommendation.progressionAction === "increase_reps" && Number(recommendation.targetReps || 0) > 0) execution.push("Next target " + recommendation.targetReps + " reps at the current resistance");
        if (recommendation.loadAdjustment) execution.push("Load " + Math.abs(Math.round(recommendation.loadAdjustment * 100)) + "% " + (recommendation.loadAdjustment < 0 ? "lower" : "higher"));
        if (recommendation.setAdjustment) execution.push(recommendation.setAdjustment < 0 && Math.abs(recommendation.setAdjustment) < 1 ? "Working sets reduced about " + Math.round(Math.abs(recommendation.setAdjustment) * 100) + "%" : "Working sets " + (recommendation.setAdjustment > 0 ? "+" : "") + recommendation.setAdjustment);
        if (recommendation.rpeTarget) execution.push("Target RPE " + recommendation.rpeTarget);
        if (recommendation.restAdjustment) execution.push("Rest +" + recommendation.restAdjustment + " sec");
        if (recommendation.removeIntensificationTechniques) execution.push("No drop sets or intensification work");
        return `
          <article class="recommendation ${intervention === 'deload' ? 'deload' : intervention === 'stop_modify' ? 'change' : intervention === 'light' ? 'hold' : recommendation.decision}">
            <span>${escapeHtml(intervention.replace('_', ' '))} · ${recommendation.confidence} confidence</span>
            <h2>${escapeHtml(interventionLabels[intervention] || recommendation.label)}</h2>
            <p><strong>${escapeHtml(recommendation.affectedExerciseName || '')}</strong></p>
            <p>${escapeHtml(recommendation.reason)}</p>
            <strong>${escapeHtml(recommendation.action)}</strong>
            ${execution.length ? '<div class="recommendation-execution"><b>Execution changes</b>' + execution.map((item) => '<span>' + escapeHtml(item) + '</span>').join('') + '</div>' : ''}
            ${recommendation.durationInSessions ? '<p><b>Duration:</b> ' + recommendation.durationInSessions + ' session' + (recommendation.durationInSessions === 1 ? '' : 's') + '.</p>' : ''}
            ${recommendation.returnToNormalCriteria ? '<p><b>Return to normal:</b> ' + escapeHtml(recommendation.returnToNormalCriteria) + '</p>' : ''}
            <ul>${recommendation.evidence.map((item) => "<li>" + escapeHtml(item) + "</li>").join("")}</ul>
          </article>
        `;
      }

      function restAlertState() {
        const notificationsSupported = "Notification" in window && "PushManager" in window && "serviceWorker" in navigator;
        const permissionStatus = notificationsSupported ? Notification.permission : "unsupported";
        const installedEligible = !isIosDevice() || isStandalonePwa();
        const notificationsEnabled = data.settings.timerNotifications !== false;
        const foregroundSoundEnabled = data.settings.timerSound !== false;
        const inAppAlertEnabled = data.settings.inAppRestAlerts !== false;
        const vibrationSupported = typeof navigator.vibrate === "function";
        const vibrationEnabled = data.settings.timerVibration !== false && vibrationSupported;
        const lockScreenReady = notificationsEnabled && notificationsSupported && installedEligible && permissionStatus === "granted" && pushIdentity?.status === "enabled";
        const foregroundActive = foregroundSoundEnabled || inAppAlertEnabled || vibrationEnabled;
        const anyPreference = notificationsEnabled || foregroundSoundEnabled || inAppAlertEnabled || data.settings.timerVibration !== false;
        const availableBehaviors = [notificationsSupported && installedEligible, true, true, vibrationSupported];
        const enabledBehaviors = [lockScreenReady, foregroundSoundEnabled, inAppAlertEnabled, vibrationEnabled];
        const allAvailableEnabled = availableBehaviors.every((available, index) => !available || enabledBehaviors[index]);
        let label = "Disabled";
        let className = "disabled";
        if (!anyPreference) {
          label = "Disabled";
        } else if (notificationsEnabled && permissionStatus === "denied") {
          label = "Permission denied";
          className = "denied";
        } else if (lockScreenReady && allAvailableEnabled) {
          label = "Fully enabled";
          className = "enabled";
        } else if (lockScreenReady || foregroundActive) {
          label = lockScreenReady ? "Enabled" : "Partially enabled";
          className = lockScreenReady ? "enabled" : "partial";
        } else if (notificationsEnabled && isIosDevice() && !installedEligible) {
          label = "Install app";
          className = "install";
        }
        return { label, className, notificationsSupported, installedEligible, permissionStatus, notificationsEnabled, foregroundSoundEnabled, soundConfirmed: Boolean(data.settings.setupSoundConfirmed), inAppAlertEnabled, vibrationSupported, vibrationEnabled, lockScreenReady, foregroundActive };
      }

      function notificationStatus() {
        return restAlertState();
      }

      function renderAlertSetting(action, label, detail, checked, options = {}) {
        const selected = Boolean(checked && !options.unavailable);
        const stateLabel = options.stateLabel || (selected ? "Enabled" : options.unavailable ? "Unavailable" : "Disabled");
        return '<label class="alert-setting-card ' + (selected ? 'selected' : '') + ' ' + (options.unavailable ? 'unavailable' : '') + '"><input type="checkbox" data-action="' + action + '" ' + (checked ? 'checked' : '') + ' ' + (options.unavailable ? 'disabled' : '') + ' /><span><strong>' + escapeHtml(label) + '</strong><small>' + escapeHtml(detail) + '</small></span><b>' + (selected ? '&#10003; ' : '') + escapeHtml(stateLabel) + '</b></label>';
      }

      function renderPwaSetup() {
        const installed = isStandalonePwa();
        const status = notificationStatus();
        const notificationsReady = status.lockScreenReady;
        const tested = Boolean(pushIdentity?.testedAt);
        const soundReady = Boolean(data.settings.setupSoundConfirmed);
        return `
          <div class="setup-flow">
            <div class="setup-step ${installed ? "complete" : ""}"><span class="setup-number">${installed ? "&#10003;" : "1"}</span><div><strong>Install the app</strong><p>${installed ? "Running as an installed Home Screen app." : "In Safari: Share > Add to Home Screen > Open as Web App > Add."}</p></div>${installed ? '<span class="status-pill enabled">Installed</span>' : '<button type="button" data-action="dismiss-install-guide">Instructions read</button>'}</div>
            <div class="setup-step ${notificationsReady ? "complete" : ""}"><span class="setup-number">${notificationsReady ? "&#10003;" : "2"}</span><div><strong>Enable notifications</strong><p>Alerts can arrive while the phone is locked or another app is open, subject to iPhone notification, Silent Mode, and Focus settings.</p></div><button class="${notificationsReady ? 'selected-control' : ''}" type="button" data-action="request-notifications">${notificationsReady ? "&#10003; Enabled" : "Enable"}</button></div>
            <div class="setup-step ${tested ? "complete" : ""}"><span class="setup-number">${tested ? "&#10003;" : "3"}</span><div><strong>Test notification</strong><p>Send a server push to verify this installation and its lock-screen permission.</p></div><button type="button" data-action="test-notification" ${notificationsReady ? "" : "disabled"}>Send test</button></div>
            <div class="setup-step ${soundReady ? "complete" : ""}"><span class="setup-number">${soundReady ? "&#10003;" : "4"}</span><div><strong>Confirm foreground sound</strong><p>Audio is primed by this tap so timer completion does not fail silently.</p></div><button class="${soundReady ? 'selected-control' : ''}" type="button" data-action="test-timer-sound">${soundReady ? "&#10003; Confirmed" : "Test sound"}</button></div>
          </div>
        `;
      }

      function renderSettings() {
        const baseline = readinessBaseline();
        const pushStatus = notificationStatus();
        const migration = data.migrationAudit?.at(-1);
        const reviewSets = data.sets.filter((set) => set.reviewRequired);
        const localClearBlock = localClearBlockReason();
        return `
          <section class="view settings-view">
            <div class="screen-heading"><div><div class="section-kicker">Settings</div><h1>Training setup</h1></div></div>
            ${appDataPersistenceConflict ? '<p class="settings-note persistence-conflict-note" role="status">' + escapeHtml(appDataPersistenceConflict.message) + '</p>' : ""}
            ${settingsMessage ? '<p class="settings-note persistence-status-note" role="status">' + escapeHtml(settingsMessage) + '</p>' : ""}
            <details class="settings-group" open><summary>Appearance and units <span>Display</span></summary><div class="disclosure-body settings-panel">
              <label>Weight unit
                <select data-action="weight-unit">
                  <option value="lb" ${data.settings.weightUnit === "lb" ? "selected" : ""}>Pounds</option>
                  <option value="kg" ${data.settings.weightUnit === "kg" ? "selected" : ""}>Kilograms</option>
                </select>
              </label>
              <label>Theme
                <select data-action="theme-mode">
                  <option value="dark" ${data.settings.theme !== "light" ? "selected" : ""}>Dark training sheet</option>
                  <option value="light" ${data.settings.theme === "light" ? "selected" : ""}>Light training sheet</option>
                </select>
              </label>
            </div></details>
            <details class="settings-group" open><summary>iPhone app setup <span class="status-pill ${pushStatus.className}">${pushStatus.label}</span></summary><div class="disclosure-body settings-panel">
              ${renderPwaSetup()}
              ${notificationMessage ? '<p class="settings-note">' + escapeHtml(notificationMessage) + '</p>' : ""}
            </div></details>
            <details class="settings-group"><summary>Training defaults <span>Goal</span></summary><div class="disclosure-body settings-panel">
              <label>Training goal
                <select data-action="training-goal">
                  <option value="" ${!data.settings.trainingGoal ? "selected" : ""}>Not specified (balanced default)</option>
                  <option value="strength" ${data.settings.trainingGoal === "strength" ? "selected" : ""}>Strength</option>
                  <option value="hypertrophy" ${data.settings.trainingGoal === "hypertrophy" ? "selected" : ""}>Hypertrophy</option>
                  <option value="muscular_endurance" ${data.settings.trainingGoal === "muscular_endurance" ? "selected" : ""}>Muscular endurance</option>
                  <option value="general_fitness" ${data.settings.trainingGoal === "general_fitness" ? "selected" : ""}>General fitness</option>
                </select>
              </label>
              <label>Nutrition phase
                <select data-action="nutrition-phase">
                  <option value="" ${!data.settings.nutritionPhase ? "selected" : ""}>Not specified</option>
                  <option value="deficit" ${data.settings.nutritionPhase === "deficit" ? "selected" : ""}>Energy deficit</option>
                  <option value="maintenance" ${data.settings.nutritionPhase === "maintenance" ? "selected" : ""}>Maintenance</option>
                  <option value="surplus" ${data.settings.nutritionPhase === "surplus" ? "selected" : ""}>Energy surplus</option>
                  <option value="recomposition" ${data.settings.nutritionPhase === "recomposition" ? "selected" : ""}>Body recomposition</option>
                </select>
              </label>
              <label>Training experience
                <select data-action="experience-level">
                  <option value="" ${!data.settings.experienceLevel ? "selected" : ""}>Not specified</option>
                  <option value="novice" ${data.settings.experienceLevel === "novice" ? "selected" : ""}>Novice</option>
                  <option value="intermediate" ${data.settings.experienceLevel === "intermediate" ? "selected" : ""}>Intermediate</option>
                  <option value="advanced" ${data.settings.experienceLevel === "advanced" ? "selected" : ""}>Advanced</option>
                </select>
              </label>
              <label>Returning after a training gap
                <select data-action="returning-after-gap">
                  <option value="" ${data.settings.returningAfterGap == null ? "selected" : ""}>Not specified</option>
                  <option value="true" ${data.settings.returningAfterGap === true ? "selected" : ""}>Yes</option>
                  <option value="false" ${data.settings.returningAfterGap === false ? "selected" : ""}>No</option>
                </select>
              </label>
              <p class="settings-note">Missing profile values stay disclosed as defaults. Nutrition phase is context only and never fabricates a training goal or changes dose without qualifying recovery or performance evidence.</p>
            </div></details>
            <details class="settings-group"><summary>Rest timer and alerts <span class="status-pill ${pushStatus.className}">${pushStatus.label}</span></summary><div class="disclosure-body settings-panel">
              <div class="alert-settings-list">
                ${renderAlertSetting("timer-notifications", "Lock-screen rest notifications", "Requires permission and an installed iPhone Home Screen app.", pushStatus.notificationsEnabled, { stateLabel: pushStatus.permissionStatus === "denied" ? "Permission denied" : pushStatus.lockScreenReady ? "Enabled" : "Needs setup" })}
                ${renderAlertSetting("in-app-rest-alerts", "In-app completion alert", "Shows the tappable Rest complete banner while using the app.", pushStatus.inAppAlertEnabled)}
                ${renderAlertSetting("timer-sound", "Foreground completion sound", "Respects browser audio restrictions and iPhone system controls.", pushStatus.foregroundSoundEnabled, { stateLabel: pushStatus.foregroundSoundEnabled ? (pushStatus.soundConfirmed ? "Confirmed" : "Not tested") : "Disabled" })}
                ${renderAlertSetting("timer-vibration", "Browser vibration", "Used only where the browser exposes vibration support.", data.settings.timerVibration !== false, { unavailable: !pushStatus.vibrationSupported, stateLabel: pushStatus.vibrationSupported ? "Enabled" : "Unsupported" })}
                ${renderAlertSetting("workout-completion-sound", "Workout and PR sound", "Plays only for workout completion and meaningful milestones.", data.settings.workoutCompletionSound !== false)}
              </div>
              <label>Rest-complete sound<select data-action="rest-complete-sound"><option value="sharp_two_tone" ${data.settings.restCompleteSound === "sharp_two_tone" ? "selected" : ""}>Sharp two-tone chime (default)</option><option value="clear_bell" ${data.settings.restCompleteSound === "clear_bell" ? "selected" : ""}>Clear bell</option><option value="whistle" ${data.settings.restCompleteSound === "whistle" ? "selected" : ""}>Whistle tone</option></select></label>
              <div class="row wrap"><label class="grow">Rest-complete volume<input type="range" min="0" max="1" step="0.05" value="${Number(data.settings.restCompleteSoundVolume ?? 0.85)}" data-action="rest-complete-volume" /></label><button type="button" data-action="preview-rest-complete-sound">Preview sound</button></div>
              <label>Alert auto-dismiss<input type="number" min="1" max="60" step="1" value="${Math.round(Number(data.settings.restCompleteAutoDismissMs || 5000) / 1000)}" data-action="rest-complete-dismiss-seconds" /> seconds</label>
              <label class="toggle-line"><input type="checkbox" data-action="rest-complete-auto-return" ${data.settings.restCompleteAutoReturnToWorkout === true ? "checked" : ""} />Return to the active workout automatically when the alert dismisses</label>
              <label class="toggle-line"><input type="checkbox" data-action="interaction-vibration" ${data.settings.interactionVibration !== false ? "checked" : ""} />Interaction vibration where supported</label>
              <label>Default rest duration<input type="number" min="15" max="900" step="15" value="${Number(data.settings.defaultRestSeconds || 90)}" data-action="default-rest-seconds" /></label>
              <label>Notification detail<select data-action="notification-detail"><option value="exercise-set" ${data.settings.notificationMessageDetail !== "private" ? "selected" : ""}>Exercise and upcoming set</option><option value="private" ${data.settings.notificationMessageDetail === "private" ? "selected" : ""}>Private: next set ready</option></select></label>
              <label class="toggle-line"><input type="checkbox" data-action="auto-start-rest" ${data.settings.autoStartRestTimer !== false ? "checked" : ""} />Start rest automatically after a completed set</label>
              <label class="toggle-line"><input type="checkbox" data-action="auto-highlight-next" ${data.settings.autoHighlightNextSet !== false ? "checked" : ""} />Highlight the next set after rest</label>
              <label class="toggle-line"><input type="checkbox" data-action="auto-scroll-next" ${data.settings.autoScrollNextSet !== false ? "checked" : ""} />Scroll the next set into view when needed</label>
              ${"Notification" in window && Notification.permission === "denied" ? '<div class="inline-panel"><strong>Permission denied</strong><p class="settings-note">Open iPhone Settings > Notifications > Comprehensive Fitness, then enable Allow Notifications, Sounds, and Lock Screen.</p></div>' : ""}
              <p class="settings-note">The selected foreground signal uses short Web Audio tones that mix with other audio instead of permanently taking it over. Lock-screen notifications use the operating system sound; browsers cannot guarantee the same custom tone or app volume, and Silent/Focus settings still apply. Turn sound off while leaving haptics on for haptic-only mode.</p>
            </div></details>
            <details class="settings-group"><summary>Readiness baseline <span>Your normal</span></summary><div class="disclosure-body settings-panel">
              <div class="inline-panel">
                <h2>Average readiness baseline</h2>
                <p class="settings-note">These are your normal averages. The app treats today as normal unless today leaves the band, repeats outside-band behavior, or you add an outside-band note.</p>
                <div class="recovery-inputs">
                  <label>Avg sleep hours<input type="number" min="0" max="14" step="0.25" value="${escapeHtml(baseline.sleepHours)}" data-action="baseline-sleep-hours" /></label>
                  <label>Avg sleep quality<input type="number" min="1" max="5" step="1" value="${escapeHtml(baseline.sleepQuality)}" data-action="baseline-sleep-quality" /></label>
                  <label>Avg HRV<input type="number" min="0" step="1" value="${escapeHtml(baseline.hrv)}" data-action="baseline-hrv" /></label>
                  <label>Avg resting HR<input type="number" min="0" step="1" value="${escapeHtml(baseline.restingHr)}" data-action="baseline-resting-hr" /></label>
                  <label>Avg soreness<input type="number" min="1" max="5" step="1" value="${escapeHtml(baseline.soreness)}" data-action="baseline-soreness" /></label>
                  <label>Band tolerance<input type="number" min="3" max="20" step="1" value="${escapeHtml(baseline.band)}" data-action="baseline-band" /></label>
                </div>
              </div>
            </div></details>
            <details class="settings-group"><summary>Data and backup <span>Import / export</span></summary><div class="disclosure-body settings-panel">
              ${renderAlertSetting("cloud-workout-sync-consent", "Optional workout cloud copy", "Default off. Stores submitted workout copies for up to 90 days; this is not restore or multi-device sync.", data.settings.cloudWorkoutSyncConsent === true, { stateLabel: data.settings.cloudWorkoutSyncConsent === true ? "Enabled" : "Local only" })}
              <div class="inline-panel"><strong>Explicitly optional and separate from notifications</strong><p class="settings-note">Enabling rest notifications never uploads workouts. Turning cloud copy off stops new uploads, clears pending uploads, and requests deletion of retained server workout copies. Keep your exported backup as the recovery source.</p></div>
              ${syncMessage ? '<p class="settings-note">' + escapeHtml(syncMessage) + '</p>' : ''}
              <p class="settings-note">Research basis: database ${escapeHtml(prescriptionEvidenceStatus.researchVersion)} with ${prescriptionEngine?.evidence?.research?.exerciseDatabase?.length || 0} exercises, ${prescriptionEngine?.evidence?.research?.muscleGroupRecommendations?.length || 0} muscle/subdivision prescriptions, ${prescriptionEngine?.evidence?.research?.progressionRules?.length || 0} progression rules, and ${prescriptionEngine?.evidence?.research?.nutritionStrategies?.length || 0} nutrition strategies. Exact ranges are selected per exercise and muscle rather than copied from one global rule.</p>
              <div class="inline-panel"><strong>Unified prescription evidence · ${escapeHtml(prescriptionEvidenceStatus.state)}</strong><p class="settings-note">${escapeHtml(prescriptionEvidenceStatus.message)}</p><p class="settings-note">Engine ${escapeHtml(prescriptionApi?.ENGINE_VERSION || 'unavailable')} · personal ${escapeHtml(prescriptionEvidenceStatus.personalVersion)} · research ${escapeHtml(prescriptionEvidenceStatus.researchVersion)} · ${data.recommendationHistory.length} immutable recommendation snapshot${data.recommendationHistory.length === 1 ? '' : 's'} · ${data.manualOverrides.length} override event${data.manualOverrides.length === 1 ? '' : 's'}.</p></div>
              <label class="import-button">${icon.upload} private personal evidence package<input type="file" accept=".json,application/json" data-action="import-personal-evidence" /></label>
              <p class="settings-note">The evidence package stays in this device's IndexedDB and exports. Protected personal analysis files are never included in the public deployment.</p>
              ${importAttempt ? '<p role="status" aria-live="polite" data-import-status data-import-state="' + escapeHtml(importStatus.state) + '" data-import-attempt="' + importAttempt + '">' + escapeHtml(importStatus.message) + '</p>' : ''}
              ${importInProgress ? '<p class="settings-note">Importing workout history. This can take a moment on iPhone, but navigation will recover automatically when it finishes.</p>' : ""}
              <button type="button" data-action="export-data">${icon.download} data</button>
              ${exportText ? '<textarea class="export-box" readonly aria-label="Exported backup JSON">' + escapeHtml(exportText) + '</textarea>' : ""}
              <label class="import-button">${icon.upload} ${importInProgress ? "importing..." : "backup or Strong CSV"}<input type="file" accept=".json,.csv,application/json,text/csv" data-action="import-data" ${importInProgress ? "disabled" : ""} /></label>
              ${migration ? '<div class="inline-panel"><strong>Strong data migration v' + escapeHtml(migration.version) + '</strong><p class="settings-note">Inspected ' + escapeHtml(migration.inspected) + ' sets; changed ' + escapeHtml(migration.changed) + '; preserved ' + escapeHtml(migration.manualOverridesPreserved) + ' manual corrections; identified ' + escapeHtml(migration.warmups) + ' warm-ups, ' + escapeHtml(migration.topSets) + ' top sets, ' + escapeHtml(migration.backoffSets) + ' back-off sets, and ' + escapeHtml(migration.dropSets) + ' drop sets. ' + escapeHtml(migration.ambiguous) + ' sets need review. ' + escapeHtml(migration.templatesReseeded || 0) + ' Strong templates were reseeded from active working sets.</p></div>' : ''}
              <div class="inline-panel"><strong>Recoverability</strong><p class="settings-note">${data.rawImports?.length || 0} raw Strong import${(data.rawImports?.length || 0) === 1 ? '' : 's'} retained. Older completed workouts remain in the retention archive and are included in exports, but excluded from current analysis.</p></div>
              ${reviewSets.length ? '<div class="inline-panel"><strong>Manual review queue · ' + reviewSets.length + '</strong><p class="settings-note">These imported sets could not be classified confidently. Open the submitted workout from History, choose Edit, then select the set type.</p></div>' : ''}
            </div></details>
            <details class="settings-group danger-zone"><summary>Danger Zone <span>High-risk actions</span></summary><div class="disclosure-body settings-panel">
              <div><strong>Clear All Local App Data</strong><p class="settings-note">Removes app data stored on this device. If optional workout cloud copy is enabled, the app first disables it and confirms deletion of retained server copies; active remote cleanup or an offline deletion must finish before local credentials can be cleared.</p></div>
              <button class="danger-button" type="button" data-action="clear-data" ${localClearBlock ? "disabled" : ""}>${icon.delete} Clear All Local App Data</button>
              ${localClearBlock ? '<p class="settings-note" role="status">' + escapeHtml(localClearBlock) + '</p>' : ''}
              <div><strong>Delete Remote Installation Data</strong><p class="settings-note">Revokes this installation and resumes bounded server cleanup until deletion is confirmed. Local workout data remains on this device.</p></div>
              <button class="danger-button" type="button" data-action="delete-remote-installation" ${pushIdentity?.token ? "" : "disabled"}>${icon.delete} ${pushIdentity?.deletion?.retryable ? "Retry Remote Deletion" : "Delete Remote Installation Data"}</button>
              ${pushIdentity?.deletion?.message ? '<p class="settings-note" role="status">' + escapeHtml(pushIdentity.deletion.message) + '</p>' : ''}
            </div></details>
            <details class="settings-group" id="support-guidance"><summary>Support and guidance <span>Privacy</span></summary><div class="disclosure-body settings-panel"><p class="settings-note">Progression guidance is informational fitness guidance, not medical advice. Stop if something hurts and use your own judgment.</p><p class="settings-links"><a href="./privacy.html">Privacy Policy</a><a href="./support.html">Support</a></p></div></details>
          </section>
        `;
      }

      async function inspectUnsynchronizedData() {
        let queue = [];
        const epoch = syncConsentEpoch;
        const syncConsented = workoutSyncConsentIsCurrent(epoch);
        if (syncConsented && workoutSyncConsentIsCurrent(epoch)) {
          try { queue = await readIndexedValue("sync-queue") || []; } catch { queue = []; }
          if (!workoutSyncConsentIsCurrent(epoch)) queue = [];
        }
        const draftSessions = data.sessions.filter((session) => !isSessionSubmitted(session) && data.exercises.some((exercise) => exercise.sessionId === session.id));
        const draftIds = new Set(draftSessions.map((session) => session.id));
        const draftExerciseIds = new Set(data.exercises.filter((exercise) => draftIds.has(exercise.sessionId)).map((exercise) => exercise.id));
        const unsavedSetChanges = data.sets.filter((set) => draftExerciseIds.has(set.exerciseId) && (set.edited || set.completed || Number(set.reps || 0) > 0 || Number(set.weight || 0) > 0)).length;
        const workoutIds = new Set([...queue.map((item) => item.sessionId), ...draftSessions.map((session) => session.id)]);
        return { queueCount: queue.length, workoutCount: workoutIds.size, setChanges: unsavedSetChanges, canSync: Boolean(workoutSyncConsentIsCurrent(epoch) && navigator.onLine && pushIdentity?.token && queue.length) };
      }

      async function requestClearLocalData() {
        const focusOrigin = focusDescriptorForElement(document.activeElement) || { kind: "main" };
        const remoteBlock = localClearBlockReason();
        if (remoteBlock) {
          settingsMessage = remoteBlock;
          render();
          return false;
        }
        const unsynced = await inspectUnsynchronizedData();
        dialogFocusOrigins.clear = focusOrigin;
        clearDataFlow = { open: true, acknowledged: false, phrase: "", unsynced };
        render();
        return true;
      }

      function closeClearDataFlow() {
        clearDataFlow = null;
        restoreFocusAfterDialog("clear");
        render();
      }

      function renderClearDataSheet() {
        if (!clearDataFlow?.open) return "";
        const unsynced = clearDataFlow.unsynced || { workoutCount: 0, setChanges: 0, queueCount: 0, canSync: false };
        const remoteBlock = localClearBlockReason();
        const blockedMessage = remoteBlock || clearDataFlow.blockedMessage || "";
        const unlocked = clearDataFlow.acknowledged && clearDataFlow.phrase === "CLEAR" && !blockedMessage;
        const risk = unsynced.workoutCount || unsynced.setChanges || unsynced.queueCount;
        return `
          <div class="sheet-backdrop" data-action="cancel-clear-data" role="presentation">
            <section class="bottom-sheet dialog-sheet destructive-sheet clear-data-sheet" role="dialog" aria-modal="true" aria-labelledby="clear-data-title" data-sheet-content>
              <div><div class="section-kicker">Danger Zone</div><h2 id="clear-data-title">Clear All Local App Data?</h2><p>This removes the active workout, unsaved sets, offline and cached workout data, cached templates and history, local preferences, app notification settings, IndexedDB records, local storage, service-worker caches, and pending sync operations from this device.</p></div>
              ${blockedMessage ? '<div class="destructive-warning" role="status"><strong>Local clearing is paused</strong><span>' + escapeHtml(blockedMessage) + '</span></div>' : ''}
              ${risk ? '<div class="destructive-warning"><strong>Unsynchronized data detected</strong><span>This device contains ' + unsynced.workoutCount + ' unsynchronized workout' + (unsynced.workoutCount === 1 ? '' : 's') + ' and ' + unsynced.setChanges + ' unsaved set change' + (unsynced.setChanges === 1 ? '' : 's') + '. Clearing now may permanently delete them.</span>' + (unsynced.canSync ? '<button type="button" data-action="sync-before-clear">Sync Now</button>' : '<small>Sync is unavailable or not configured. Export a backup before clearing if this data matters.</small>') + '</div>' : '<div class="inline-panel"><strong>No pending local workout changes were detected.</strong></div>'}
              <div class="clear-data-scope"><strong>Cloud deletion boundary</strong><span>Retained workout copies are deleted before local authorization is removed. The app stops here while offline rather than orphaning server data. Any data that exists only on this device will still be lost.</span></div>
              <label class="toggle-line destructive-ack"><input type="checkbox" data-action="clear-data-ack" ${clearDataFlow.acknowledged ? 'checked' : ''} />I understand that unsynchronized data may be permanently deleted</label>
              <label class="typed-confirmation">Type <strong>CLEAR</strong> to continue<input type="text" value="${escapeHtml(clearDataFlow.phrase)}" data-action="clear-data-phrase" autocomplete="off" autocapitalize="characters" aria-label="Type CLEAR to confirm local data deletion" /></label>
              <div class="sheet-actions stacked">
                <button class="primary-action" type="button" data-action="cancel-clear-data">Keep My Data</button>
                <button class="danger-button" type="button" data-action="confirm-clear-data" ${unlocked ? '' : 'disabled'}>Permanently Clear Local Data</button>
              </div>
            </section>
          </div>`;
      }

      function deleteFitnessDatabase() {
        return new Promise((resolve) => {
          try {
            const request = indexedDB.deleteDatabase(DB_NAME);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          } catch { resolve(); }
        });
      }

      function localClearBlockReason() {
        if (!pushIdentity?.token) return "";
        const deletionStatus = pushIdentity.deletion?.status || "";
        if (window.__cfRemoteDeletionInFlight || pushIdentity.status === "deleting" || deletionStatus === "deleting" || deletionStatus === "error" || pushIdentity.deletion?.retryable === true) return "Remote installation deletion is still in progress. Reconnect or reopen the app and wait for deletion to finish before clearing local data, so the cleanup authorization is not lost.";
        return "";
      }

      async function permanentlyClearLocalData() {
        if (!clearDataFlow?.acknowledged || clearDataFlow.phrase !== "CLEAR") return;
        const remoteBlock = localClearBlockReason();
        if (remoteBlock) {
          clearDataFlow = { ...clearDataFlow, blockedMessage: remoteBlock };
          settingsMessage = remoteBlock;
          render();
          return false;
        }
        if (data.settings.cloudWorkoutSyncConsent === true || pushIdentity?.syncRevocationPending) {
          const revoked = await setCloudWorkoutSyncConsent(false, { renderNow: false });
          if (!revoked) {
            const blockedMessage = "Server workout deletion is not confirmed yet. Reconnect and retry local clearing so cleanup authorization is preserved.";
            clearDataFlow = { ...clearDataFlow, blockedMessage };
            settingsMessage = blockedMessage;
            render();
            return false;
          }
        }
        if (pushIdentity?.token) {
          if (!navigator.onLine) {
            const blockedMessage = "Connect to the internet before clearing local data so retained server installation data can be deleted first.";
            clearDataFlow = { ...clearDataFlow, blockedMessage };
            settingsMessage = blockedMessage;
            render();
            return false;
          }
          const remoteDeletion = await deleteRemoteInstallationData({ scheduleRetry: false, automatic: true });
          if (remoteDeletion?.status !== "deleted") {
            const blockedMessage = "Remote installation deletion is not confirmed yet. Keep the app open and retry before clearing local authorization.";
            clearDataFlow = { ...clearDataFlow, blockedMessage };
            settingsMessage = blockedMessage;
            render();
            return false;
          }
        }
        if (timer) {
          const previous = { ...timer };
          const cancellationConfirmed = await cancelRestPush(previous, "local-data-cleared");
          if (!cancellationConfirmed) {
            const blockedMessage = "The active rest notification could not be canceled yet. Reconnect and retry local clearing; its durable cancellation record and installation authorization were preserved.";
            clearDataFlow = { ...clearDataFlow, blockedMessage };
            settingsMessage = blockedMessage;
            render();
            return false;
          }
          window.clearInterval(timerInterval);
          timerInterval = 0;
          releaseTimerWakeLock();
          timer = null;
        }
        cancelPendingDataSave();
        window.clearTimeout(draftSaveTimer);
        draftSaveTimer = 0;
        // `serviceWorker.ready` can remain pending forever when this tab has no
        // active registration. A destructive local clear must not be held
        // hostage by that unrelated lifecycle. Inspect only an already-known
        // registration and continue when none exists.
        try {
          const registration = await navigator.serviceWorker?.getRegistration?.();
          const subscription = await registration?.pushManager?.getSubscription?.();
          await subscription?.unsubscribe?.();
        } catch { /* Local cleanup continues. */ }
        try { for (const key of await caches.keys()) if (key.startsWith("comprehensive-fitness")) await caches.delete(key); } catch { /* Cache API is optional. */ }
        try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(RUNTIME_KEY); localStorage.removeItem(ACTIVE_DRAFT_KEY); localStorage.removeItem(IDENTITY_KEY); } catch { /* IndexedDB cleanup remains primary. */ }
        await deleteFitnessDatabase();
        appDataPersistenceConflict = null;
        data = emptyData();
        const session = createSession();
        data.sessions = [session];
        activeSessionId = session.id;
        activeWorkoutId = "";
        activeSetId = "";
        pendingNextSetId = "";
        activeSetNotice = "";
        activeSetAcknowledged = false;
        pushIdentity = null;
        clearDataFlow = null;
        cancelWorkoutFlow = null;
        templateStartFlow = null;
        templateNumericDrafts.clear();
        exportText = "";
        settingsMessage = "";
        applyTheme();
        try {
          await writeIndexedValue("app-data", data);
          persistenceReady = true;
          // Remove the conflict-preserved alternate again after the fresh
          // durable write so no concurrent/fallback path can resurrect it.
          try { localStorage.removeItem(STORAGE_KEY); } catch { /* Fresh IndexedDB defaults remain durable. */ }
        } catch {
          persistenceReady = false;
          settingsMessage = "Local workout data was removed, but fresh defaults could not be saved. Keep this tab open and retry Clear All Local App Data before relying on a reload.";
          setActiveTab("lift", { replace: true, renderNow: false });
          render();
          return false;
        }
        saveRuntime();
        setActiveTab("lift", { replace: true, renderNow: false });
        showAppToast("Local app data cleared.");
        render();
        return true;
      }

      function patchSession(patch, shouldRender = true) {
        const session = activeSession();
        if (shouldRender) {
          const draftMutation = session.id === activeWorkoutId && !isSessionSubmitted(session) && !isEditingHistorySession();
          commit({ ...data, sessions: data.sessions.map((item) => item.id === session.id ? { ...item, ...patch, updatedAt: isoNow() } : item) }, true, { invalidateAnalysis: !draftMutation, deferPersistence: draftMutation });
          return;
        }
        const index = dataEntityIndex().sessionIndexById.get(session.id) ?? -1;
        if (index >= 0) {
          data.sessions[index] = { ...data.sessions[index], ...patch, updatedAt: isoNow() };
          if (isEditingHistorySession()) historyEditFlow.dirty = true;
          else scheduleSave();
        }
      }

      function patchRecovery(patch, shouldRender = true) {
        const session = activeSession();
        patchSession({ recovery: { ...sessionRecovery(session), ...patch } }, shouldRender);
      }

      function patchReadinessBaseline(patch, shouldRender = true) {
        commit({ ...data, settings: { ...data.settings, readinessBaseline: { ...readinessBaseline(), ...patch } } }, shouldRender);
      }

      function exerciseNameForPrescriptionId(exerciseId, fallback) {
        const personal = prescriptionEngine?.evidence.personal;
        const research = prescriptionEngine?.evidence.research;
        const personalRecord = personal?.exerciseScores.find((item) => (item.exercise_id || item.exerciseId) === exerciseId)
          || personal?.exercisePrescriptions.find((item) => (item.exercise_id || item.exerciseId) === exerciseId)
          || personal?.exerciseMuscleScores.find((item) => (item.exercise_id || item.exerciseId) === exerciseId);
        const researchId = personal?.crosswalkByPersonalId.get(exerciseId) || exerciseId;
        return personalRecord?.exercise_name || personalRecord?.exerciseName || research?.exerciseById.get(researchId)?.exercise_name || fallback;
      }

      function expandedOverrideSetTypes(prescription) {
        if (prescription.setStructure === "top_set_backoff") return [
          ...Array.from({ length: Number(prescription.topSet?.count || 1) }, () => ({ type: "top", repRange: prescription.topSet?.repRange || prescription.repRange, rpe: prescription.topSet?.targetRpe || prescription.targetRpe.max, reduction: 0 })),
          ...Array.from({ length: Number(prescription.backoffSets?.count || Math.max(1, prescription.workingSets.target - 1)) }, () => ({ type: "backoff", repRange: prescription.backoffSets?.repRange || prescription.repRange, rpe: prescription.backoffSets?.targetRpe || prescription.targetRpe.max, reduction: Number(prescription.backoffSets?.loadReductionPercent?.target || 12) }))
        ];
        if (prescription.setStructure === "multiple_top_sets") return Array.from({ length: prescription.workingSets.target }, () => ({ type: "top", repRange: prescription.topSet?.repRange || prescription.repRange, rpe: prescription.topSet?.targetRpe || prescription.targetRpe.max, reduction: 0 }));
        const type = prescription.recommendationType.includes("deload") ? "deload" : "straight";
        return Array.from({ length: prescription.workingSets.target }, () => ({ type, repRange: prescription.repRange, rpe: prescription.targetRpe.max, reduction: 0 }));
      }

      function applyPrescriptionOverride(exerciseId, form) {
        const exercise = exerciseById(exerciseId);
        if (!exercise?.recommendationSnapshot || !prescriptionEngine || !form) return;
        const current = exercise.recommendationSnapshot.finalPrescription;
        const restriction = current.safetyRestriction || null;
        const currentSafetyContext = restriction
          ? safetySubstituteContext(exercise.recommendationSnapshot, { exercise, session: sessionById(exercise.sessionId) })
          : null;
        const safetyLocked = current.executionBlocked === true
          || restriction?.status === "blocked"
          || (restriction?.status === "resolved_by_confirmed_substitute" && currentSafetyContext?.resolvedValidation?.valid !== true);
        const safetyContext = safetyLocked ? currentSafetyContext : null;
        const read = (field) => form.querySelector(`[data-override-field="${field}"]`)?.value ?? "";
        const override = {};
        const replacementName = String(read("exercise")).trim();
        let replacementId = "";
        if (replacementName) {
          replacementId = prescriptionExerciseIdentity(replacementName) || "";
          if (!replacementId) return showAppToast("That replacement is not in the personal or research exercise database.");
          if (safetyLocked) {
            if (!safetyContext.allowedSafetySubstituteIds.includes(replacementId)) return showAppToast("That exercise is not an engine-confirmed substitute under the current equipment and exclusion settings.");
            const catalogRecord = safetyContext.exerciseCatalog.find((item) => item.exercise_id === replacementId);
            if (!catalogRecord) return showAppToast("That substitute does not retain a coherent public catalog identity.");
            override.exerciseId = replacementId;
            override.researchExerciseId = catalogRecord.exercise_id;
            override.painFreeConfirmed = form.querySelector('[data-override-field="pain-free-confirmed"]')?.checked === true;
          } else if (replacementId !== current.exerciseId) override.exerciseId = replacementId;
        }
        if (safetyLocked && !replacementName) return showAppToast("Choose a distinct engine-confirmed substitute before resolving this safety restriction.");
        if (!safetyLocked) {
          const sets = Number(read("sets"));
          if (sets && sets !== Number(current.workingSets.target)) override.setCount = sets;
          const repMin = Number(read("rep-min"));
          const repMax = Number(read("rep-max"));
          if (repMin && repMax && (repMin !== Number(current.repRange.min) || repMax !== Number(current.repRange.max))) override.repRange = { min: Math.min(repMin, repMax), max: Math.max(repMin, repMax) };
          const load = read("load") === "" ? null : Number(read("load"));
          if (load !== null && load !== Number(current.prescribedLoad?.target ?? 0)) override.load = load;
          const structure = read("structure");
          if (structure && structure !== current.setStructure) override.setStructure = structure;
          const deload = read("deload");
          if (deload && deload !== "engine") override.deloadRecommendation = deload;
          const rotation = read("rotation");
          if (rotation && rotation !== "engine") override.exerciseRotation = rotation;
          const mesocycleId = read("mesocycle");
          if (mesocycleId && mesocycleId !== exercise.recommendationSnapshot.mesocycleId) override.mesocycleId = mesocycleId;
        }
        const reason = String(read("reason")).trim() || "Intentional workout prescription override";
        if (override.deloadRecommendation && override.deloadRecommendation !== "normal" && !current.recommendationType.includes("deload")) {
          if (override.setCount === undefined) override.setCount = Math.max(1, Math.ceil(current.workingSets.target * 0.5));
          if (override.load === undefined && Number(current.prescribedLoad?.target || 0) > 0) override.load = Number((current.prescribedLoad.target * (override.deloadRecommendation === "full_program_deload" ? 0.85 : 0.9)).toFixed(2));
          override.setStructure = "straight_sets";
        }
        if (!Object.keys(override).length) return showAppToast("No prescription field changed.");
        let snapshot;
        try {
          snapshot = prescriptionEngine.applyManualOverride(exercise.recommendationSnapshot, override, {
            workoutId: exercise.sessionId,
            reason,
            createdAt: isoNow(),
            allowedSafetySubstituteIds: safetyContext?.allowedSafetySubstituteIds,
            exerciseCatalog: safetyContext?.exerciseCatalog,
            availableEquipment: safetyContext?.availableEquipment
          });
        } catch (error) {
          showAppToast(error?.message || "The override could not be applied.");
          return;
        }
        const prescription = snapshot.finalPrescription;
        const target = legacyTargetFromSnapshot(snapshot, { name: replacementName || exercise.name, resistanceType: exercise.resistanceType, increment: exercise.prescription?.increment });
        const completedWorking = setsForExercise(exerciseId).filter((set) => isWorkingSet(set, "score") && set.completed);
        const incompleteWorking = setsForExercise(exerciseId).filter((set) => isWorkingSet(set, "score") && !set.completed);
        const warmups = setsForExercise(exerciseId).filter((set) => setTypeSemantics(set).isWarmup);
        const desiredTypes = expandedOverrideSetTypes(prescription);
        const desiredIncomplete = desiredTypes.slice(Math.min(completedWorking.length, desiredTypes.length));
        const baseLoad = Number(prescription.prescribedLoad?.target || target.weight || 0);
        const rebuiltIncomplete = desiredIncomplete.map((role, index) => {
          const existing = incompleteWorking[index] || createSet(exerciseId, completedWorking.length + index + 1, {});
          const targetLoad = role.reduction && baseLoad > 0 ? roundEquipmentLoad(baseLoad * (1 - role.reduction / 100), Number(target.increment || 1), target.resistanceType) : baseLoad;
          return {
            ...existing,
            setNumber: completedWorking.length + index + 1,
            sequenceIndex: warmups.length + completedWorking.length + index,
            sequence: warmups.length + completedWorking.length + index,
            setTypeIndex: desiredTypes.slice(0, completedWorking.length + index).filter((item) => item.type === role.type).length,
            setType: role.type,
            isWarmup: false,
            reps: Math.round((Number(role.repRange.min) + Number(role.repRange.max)) / 2),
            weight: targetLoad,
            rpe: Number(role.rpe),
            targetReps: Math.round((Number(role.repRange.min) + Number(role.repRange.max)) / 2),
            targetRepMin: Number(role.repRange.min),
            targetRepMax: Number(role.repRange.max),
            targetWeight: targetLoad,
            targetRpe: Number(role.rpe),
            targetRpeMin: Math.max(5, Number(role.rpe) - 1),
            targetRpeMax: Number(role.rpe),
            targetRestSeconds: prescription.restSeconds.target,
            prescriptionReason: reason,
            prescriptionMode: target.mode,
            prescriptionConfidence: prescription.confidence,
            manualOverride: true,
            overrideId: snapshot.manualOverrides.at(-1)?.overrideId,
            edited: true,
            completed: false,
            skipped: false
          };
        });
        const replacedSetIds = new Set(incompleteWorking.map((set) => set.id));
        const nextName = replacementId ? exerciseNameForPrescriptionId(replacementId, replacementName) : exercise.name;
        const overrideEntry = { ...snapshot.manualOverrides.at(-1), recommendationId: snapshot.recommendationId, exerciseRuntimeId: exercise.id, sessionId: exercise.sessionId };
        const nextExercise = { ...exercise, name: nextName, recommendationSnapshot: snapshot, basePrescription: snapshot.basePrescription, finalPrescription: prescription, prescription: target, adjustmentReason: target.adjustmentReason || "", isDeload: prescription.recommendationType.includes("deload"), executionBlocked: Boolean(prescription.executionBlocked), safetyRestriction: prescription.safetyRestriction || null, manualOverrides: [...(exercise.manualOverrides || []), overrideEntry], overrideLocked: true, restSeconds: prescription.restSeconds.target };
        const session = sessionById(exercise.sessionId);
        const workoutRecommendations = session?.workoutPrescription?.recommendations || [];
        const workoutPrescription = session?.workoutPrescription ? {
          ...session.workoutPrescription,
          mesocycleId: snapshot.mesocycleId,
          recommendations: workoutRecommendations.some((item) => item.recommendationId === snapshot.recommendationId)
            ? workoutRecommendations.map((item) => item.recommendationId === snapshot.recommendationId ? snapshot : item)
            : [...workoutRecommendations, snapshot]
        } : session?.workoutPrescription;
        const recommendationHistory = data.recommendationHistory.some((item) => item.recommendationId === snapshot.recommendationId)
          ? data.recommendationHistory.map((item) => item.recommendationId === snapshot.recommendationId ? snapshot : item)
          : [...data.recommendationHistory, snapshot];
        commit({
          ...data,
          sessions: data.sessions.map((item) => item.id === exercise.sessionId ? { ...item, mesocycleId: snapshot.mesocycleId || item.mesocycleId, workoutPrescription } : item),
          exercises: data.exercises.map((item) => item.id === exercise.id ? nextExercise : item),
          sets: [...data.sets.filter((set) => !replacedSetIds.has(set.id)), ...rebuiltIncomplete],
          recommendationHistory,
          manualOverrides: [...data.manualOverrides, overrideEntry]
        }, true, { invalidateAnalysis: false, deferPersistence: true });
        showAppToast("Prescription override saved and locked for this workout.");
      }

      function patchExercise(exerciseId, patch, shouldRender = true) {
        if (shouldRender) {
          const exercise = exerciseById(exerciseId);
          const draftMutation = exercise?.sessionId === activeWorkoutId && !isEditingHistorySession();
          commit({ ...data, exercises: data.exercises.map((item) => item.id === exerciseId ? { ...item, ...patch } : item) }, true, { invalidateAnalysis: !draftMutation, deferPersistence: draftMutation });
          return;
        }
        const index = dataEntityIndex().exerciseIndexById.get(exerciseId) ?? -1;
        if (index >= 0) {
          data.exercises[index] = { ...data.exercises[index], ...patch };
          if (isEditingHistorySession()) historyEditFlow.dirty = true;
          else scheduleSave();
        }
      }

      function patchExerciseName(exerciseId, name, shouldRender = true) {
        const exercise = exerciseById(exerciseId);
        if (!exercise) return;
        if (!shouldRender) {
          patchExercise(exerciseId, { name }, false);
          return;
        }
        const firstSet = setsForExercise(exerciseId).find((set) => isWorkingSet(set, "score"));
        const previousAutoRest = recommendedRestSeconds(exercise.name, { reps: firstSet?.reps, rpe: firstSet?.rpe, excludeSessionId: exercise.sessionId });
        const restSeconds = !exercise.restSeconds || Number(exercise.restSeconds) === previousAutoRest
          ? recommendedRestSeconds(name, { reps: firstSet?.reps, rpe: firstSet?.rpe, excludeSessionId: exercise.sessionId })
          : exercise.restSeconds;
        patchExercise(exerciseId, { name, restSeconds }, shouldRender);
      }

      function patchTemplateExerciseName(templateId, exerciseId, name, shouldRender = true) {
        const template = data.templates.find((item) => item.id === templateId);
        const exercise = template?.exercises.find((item) => item.id === exerciseId);
        if (!exercise) return;
        if (!shouldRender) {
          patchTemplateExercise(templateId, exerciseId, { name }, false);
          return;
        }
        const previousAutoRest = recommendedRestSeconds(exercise.name, { reps: exercise.reps });
        const restSeconds = !exercise.restSeconds || Number(exercise.restSeconds) === previousAutoRest
          ? recommendedRestSeconds(name, { reps: exercise.reps })
          : exercise.restSeconds;
        patchTemplateExercise(templateId, exerciseId, { name, restSeconds }, shouldRender);
      }

      function patchSet(setId, patch, shouldRender = true) {
        if (shouldRender) {
          const set = setById(setId);
          const exercise = set ? exerciseById(set.exerciseId) : null;
          const draftMutation = exercise?.sessionId === activeWorkoutId && !isEditingHistorySession();
          commit({ ...data, sets: data.sets.map((item) => item.id === setId ? { ...item, ...patch } : item) }, true, { invalidateAnalysis: !draftMutation, deferPersistence: draftMutation });
          return;
        }
        const index = dataEntityIndex().setIndexById.get(setId) ?? -1;
        if (index >= 0) {
          const updatedSet = { ...data.sets[index], ...patch };
          if (isEditingHistorySession()) {
            const sets = data.sets.slice();
            sets[index] = updatedSet;
            data = { ...data, sets, dataRevision: Number(data.dataRevision || 0) + 1 };
            historyEditFlow.dirty = true;
            invalidateCompletedAnalysis();
          } else {
            data.sets[index] = updatedSet;
            scheduleSave();
          }
          updatePlanPreview(updatedSet.exerciseId);
        }
      }

      function setManualType(setId, requestedType) {
        const current = data.sets.find((set) => set.id === setId);
        if (!current) return;
        const setType = normalizeSetTypeCode(requestedType);
        logWorkoutOverride(exerciseById(current.exerciseId), "setStructure", normalizeSetTypeCode(current.setType, current.isWarmup), setType, { setId });
        const isWarmup = setType === "warmup";
        const semantics = setTypeSemantics({ ...current, setType, isWarmup, countsTowardScore: !isWarmup, countsTowardVolume: !isWarmup, countsTowardProgression: !isWarmup });
        patchSet(setId, {
          setType,
          isWarmup,
          countsTowardScore: semantics.countsTowardScore,
          countsTowardVolume: semantics.countsTowardVolume,
          countsTowardProgression: semantics.countsTowardProgression,
          classificationSource: "manual",
          classificationConfidence: 1,
          classifierVersion: SET_CLASSIFIER_VERSION,
          manualOverride: true,
          reviewRequired: false,
          classifiedAt: isoNow(),
          classificationUndo: current.classificationUndo || { setType: current.setType, isWarmup: current.isWarmup, countsTowardScore: current.countsTowardScore, countsTowardVolume: current.countsTowardVolume, countsTowardProgression: current.countsTowardProgression, classificationSource: current.classificationSource, classificationConfidence: current.classificationConfidence, manualOverride: current.manualOverride, reviewRequired: current.reviewRequired }
        });
        showAppToast("Set type updated. Analysis and template history will use the correction.");
      }

      function undoManualSetType(setId) {
        const current = data.sets.find((set) => set.id === setId);
        if (!current?.classificationUndo) return;
        patchSet(setId, { ...current.classificationUndo, classificationUndo: null, classifiedAt: isoNow() });
        showAppToast("Set type correction undone.");
      }

      function logWorkoutOverride(exercise, field, from, to, details = {}) {
        if (!exercise || exercise.sessionId !== activeWorkoutId || from === to) return null;
        const entry = {
          overrideId: `runtime_override_${id()}`,
          recommendationId: exercise.recommendationSnapshot?.recommendationId || null,
          sessionId: exercise.sessionId,
          exerciseRuntimeId: exercise.id,
          exerciseId: exercise.recommendationSnapshot?.exerciseId || prescriptionExerciseIdentity(exercise.name),
          field,
          from,
          to,
          createdAt: isoNow(),
          actor: "user",
          lockedForWorkout: true,
          ...details
        };
        data.manualOverrides = [...data.manualOverrides, entry];
        const exerciseIndex = dataEntityIndex().exerciseIndexById.get(exercise.id);
        if (exerciseIndex != null) data.exercises[exerciseIndex] = { ...data.exercises[exerciseIndex], manualOverrides: [...(data.exercises[exerciseIndex].manualOverrides || []), entry], overrideLocked: true };
        return entry;
      }

      function patchSetValue(setId, field, value, shouldRender = true) {
        const editingHistory = isEditingHistorySession();
        if (!editingHistory) acknowledgeActiveSet(setId);
        const set = setById(setId);
        const exercise = set ? exerciseById(set.exerciseId) : null;
        const resistanceType = resistanceTypeFor(exercise, set);
        const numeric = Number(value);
        if (editingHistory && Number(set?.[field]) === numeric) return;
        if (editingHistory) shouldRender = false;
        if (shouldRender) logWorkoutOverride(exercise, field === "weight" ? "load" : field, set?.[`target${field.charAt(0).toUpperCase() + field.slice(1)}`] ?? set?.[field], numeric, { setId });
        const patch = { [field]: numeric, edited: true };
        if (field === "weight" && resistanceType === "bodyweight_plus_load") patch.addedLoad = numeric;
        if (field === "weight" && resistanceType === "assisted_bodyweight") patch.assistanceLoad = numeric;
        patchSet(setId, patch, shouldRender);
      }

      function toggleSetCompletion(setId) {
        const interactionStartedAt = performanceNow();
        const authorization = guardWorkoutMutation("toggle-set", { setId });
        if (!authorization.allowed) return;
        const set = authorization.target.set;
        const completing = !set.completed;
        if (authorization.target.authorizationMode === "history_edit") {
          patchSet(set.id, { completed: completing, skipped: false, edited: true });
          return;
        }
        if (!completing) {
          if (timer?.setId === set.id) cancelTimer("set-reopened", false);
          setActiveSet(set.id, "Set " + (set.isWarmup ? "WU" : set.setNumber) + " is current", false);
          patchSet(set.id, { completed: false, skipped: false }, false);
          render();
          recordPerformance("interaction:reopenSet", interactionStartedAt, { setId });
          return;
        }

        const next = nextIncompleteSet(set.id);
        const exercise = exerciseById(set.exerciseId);
        patchSet(set.id, { completed: true, skipped: false }, false);
        applyCompletedSetVisual(set.id);
        if (next && data.settings.autoStartRestTimer !== false) {
          startTimer(exercise?.id || set.exerciseId, set.id, { pendingNextSetId: next.id, deferRender: true });
          recordPerformance("interaction:completeSet", interactionStartedAt, { setId, timerStarted: true });
          return;
        }
        setActiveSet(next?.id || "", next ? "Set " + (next.isWarmup ? "WU" : next.setNumber) + " is current" : "Workout sets complete", false);
        renderAfterInteractionFrame();
        recordPerformance("interaction:completeSet", interactionStartedAt, { setId, timerStarted: false });
        if (next && data.settings.autoScrollNextSet !== false) scheduleActiveSetScroll(next.id);
      }

      function toggleSetSkipped(setId) {
        const authorization = guardWorkoutMutation("toggle-skip-set", { setId });
        if (!authorization.allowed) return;
        const set = authorization.target.set;
        const skipped = !set.skipped;
        if (authorization.target.authorizationMode === "history_edit") {
          patchSet(set.id, { skipped, completed: false, edited: true });
          return;
        }
        if (timer?.setId === set.id || timer?.pendingNextSetId === set.id) cancelTimer("set-skipped", false);
        const next = skipped ? nextIncompleteSet(set.id) : set;
        setActiveSet(next?.id || "", next ? "Set " + (next.isWarmup ? "WU" : next.setNumber) + " is current" : "Workout sets complete", false);
        patchSet(set.id, { skipped, completed: false }, false);
        render();
      }

      function updateTemplateFromExercise(exerciseId) {
        const session = activeSession();
        const exercise = data.exercises.find((item) => item.id === exerciseId);
        const template = data.templates.find((item) => item.id === session?.templateId);
        if (!session || !exercise || !template) return;
        const templateExercise = template.exercises.find((item) => exerciseMatches(item.name, exercise.name));
        if (!templateExercise) return;
        const workSets = setsForExercise(exercise.id).filter((set) => isWorkingSet(set, "progression") && !set.skipped);
        const representative = workSets[0];
        if (!representative) return;
        const snapshot = exercise.recommendationSnapshot || null;
        const prescription = snapshot?.finalPrescription || null;
        patchTemplateExercise(template.id, templateExercise.id, {
          sets: workSets.length,
          reps: representative.reps,
          repMin: prescription?.repRange?.min || representative.targetRepMin || representative.reps,
          repMax: prescription?.repRange?.max || representative.targetRepMax || representative.reps,
          targetRpe: representative.rpe,
          restSeconds: exercise.restSeconds,
          setStructure: prescription?.setStructure || exercise.appliedTargetContext?.setTypes?.map((item) => item.type).join("+") || templateExercise.setStructure,
          setTypes: exercise.appliedTargetContext?.setTypes || templateExercise.setTypes || [],
          recommendationSnapshot: snapshot,
          recommendationId: snapshot?.recommendationId || null,
          recommendationVersion: snapshot?.recommendationVersion || null,
          personalDataVersion: snapshot?.personalDataVersion || null,
          researchDatabaseVersion: snapshot?.researchDatabaseVersion || null,
          mesocycleId: snapshot?.mesocycleId || session.mesocycleId || null,
          manualOverrides: snapshot?.manualOverrides || []
        });
        activeSetNotice = "Template updated from today’s targets";
      }

      function updatePlanPreview(exerciseId) {
        const exercise = data.exercises.find((item) => item.id === exerciseId);
        if (!exercise) return;
        const sets = setsForExercise(exerciseId);
        const first = sets[0] || createSet(exerciseId, 1);
        const loadText = first.weight > 0 ? first.weight + " " + (first.weightUnit || data.settings.weightUnit) : "BW/control";
        const count = document.querySelector('[data-plan-count="' + exerciseId + '"]');
        const reps = document.querySelector('[data-plan-reps="' + exerciseId + '"]');
        const load = document.querySelector('[data-plan-load="' + exerciseId + '"]');
        const rest = document.querySelector('[data-plan-rest="' + exerciseId + '"]');
        const meta = document.querySelector('[data-plan-meta="' + exerciseId + '"]');
        if (count) count.textContent = sets.length + " sets";
        if (reps) reps.textContent = (sets.length || 1) + " x " + (first.reps || 0);
        if (load) load.textContent = loadText;
        if (rest) rest.textContent = (exercise.restSeconds || data.settings.defaultRestSeconds || 90) + "s rest";
        if (meta) meta.textContent = "Aim RPE " + (first.rpe || 8) + ". " + (exercise.notes || "Use clean reps and stop when positions break.");
      }

      function addSession() {
        if (hasActiveWorkout()) {
          activeSessionId = activeWorkoutId;
          setActiveTab("lift", { replace: true, renderNow: false });
          showAppToast("You already have an active workout. Resume or cancel it before starting another.");
          render();
          return;
        }
        const session = createSession(undefined, { started: true });
        activeSessionId = session.id;
        activeWorkoutId = session.id;
        viewingHistorySessionId = "";
        activeSetId = "";
        activeSetAcknowledged = false;
        activeSetNotice = "";
        window.clearInterval(timerInterval);
        timer = null;
        setActiveTab("lift", { replace: true, renderNow: false });
        commit({ ...data, sessions: [session, ...data.sessions] });
      }

      function addExercise() {
        const name = addExerciseDraft;
        if (!name || !name.trim()) return;
        const authorization = guardWorkoutMutation("add-exercise");
        if (!authorization.allowed) return;
        const session = authorization.target.session;
        const historyCorrection = authorization.target.authorizationMode === "history_edit";
        if (isSessionSubmitted(session) && !historyCorrection) {
          showAppToast("Logged workouts cannot become active again. Start a new workout first.");
          return;
        }
        if (!historyCorrection && hasActiveWorkout() && session.id !== activeWorkoutId) {
          activeSessionId = activeWorkoutId;
          setActiveTab("lift", { replace: true, renderNow: false });
          showAppToast("You already have an active workout. Resume or cancel it before adding another.");
          render();
          return;
        }
        const resistanceType = inferResistanceType(name.trim());
        const exercise = { id: id(), sessionId: session.id, name: name.trim(), primaryMuscle: addExercisePrimaryMuscle, secondaryMuscle: addExerciseSecondaryMuscle, notes: "", order: data.exercises.filter((item) => item.sessionId === session.id).length, restSeconds: recommendedRestSeconds(name.trim()), resistanceType, isBodyweight: isBodyweightResistance(resistanceType), isDeload: false };
        addExerciseDraft = "";
        addExercisePrimaryMuscle = "";
        addExerciseSecondaryMuscle = "";
        if (!historyCorrection) {
          activeWorkoutId = session.id;
          session.workoutStarted = true;
          session.workoutState = "active";
          if (!session.startedAt) session.startedAt = isoNow();
        }
        commit({ ...data, sessions: data.sessions.map((item) => item.id === session.id ? { ...session, updatedAt: isoNow() } : item), exercises: [...data.exercises, exercise], sets: [...data.sets, createSet(exercise.id, 1, { resistanceType })] }, true, { invalidateAnalysis: historyCorrection, deferPersistence: !historyCorrection });
      }

      function addTemplate() {
        const template = { id: id(), name: "New Template", notes: "", exercises: [{ id: id(), name: "Exercise", sets: 3, reps: 8, targetRpe: 8, increment: progressionProfileForExercise("Exercise").increment, restSeconds: recommendedRestSeconds("Exercise"), resistanceType: "external", isBodyweight: false, warmups: [] }], createdAt: isoNow(), updatedAt: isoNow() };
        setActiveTab("plan", { renderNow: false });
        commit({ ...data, templates: [template, ...data.templates] });
      }

      function patchTemplate(templateId, patch, shouldRender = true) {
        commit({ ...data, templates: data.templates.map((template) => template.id === templateId ? { ...template, ...patch, updatedAt: isoNow() } : template) }, shouldRender);
      }

      function assertTemplateExerciseNumericDomain(patch) {
        Object.values(templateNumericFields).forEach((config) => {
          if (!Object.prototype.hasOwnProperty.call(patch, config.field)) return;
          const value = patch[config.field];
          const numeric = Number(value);
          const steps = (numeric - config.min) / config.step;
          if (!Number.isFinite(numeric)
            || numeric < config.min
            || numeric > config.max
            || (config.integer && !Number.isInteger(numeric))
            || Math.abs(steps - Math.round(steps)) > 1e-9) {
            throw new RangeError(`Template ${config.label} must be between ${config.min} and ${config.max} in ${config.step} increments.`);
          }
        });
      }

      function patchTemplateExercise(templateId, exerciseId, patch, shouldRender = true) {
        assertTemplateExerciseNumericDomain(patch);
        commit({
          ...data,
          templates: data.templates.map((template) => template.id === templateId
            ? { ...template, exercises: template.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, ...patch } : exercise), updatedAt: isoNow() }
            : template)
        }, shouldRender);
      }

      function addTemplateExercise(templateId) {
        commit({
          ...data,
          templates: data.templates.map((template) => template.id === templateId
              ? { ...template, exercises: [...template.exercises, { id: id(), name: "Exercise", sets: 3, reps: 8, targetRpe: 8, increment: progressionProfileForExercise("Exercise").increment, restSeconds: recommendedRestSeconds("Exercise"), resistanceType: "external", isBodyweight: false, warmups: [] }], updatedAt: isoNow() }
            : template)
        });
      }

      function saveActiveSessionAsTemplate() {
        const template = createTemplateFromSession(activeSessionId);
        if (!template || template.exercises.length === 0) {
          setActiveTab("plan", { renderNow: false });
          addTemplate();
          return;
        }
        setActiveTab("plan", { renderNow: false });
        commit({ ...data, templates: [template, ...data.templates] });
      }

      function startTemplate(templateId, recovery = defaultRecovery(), readinessMode = "usual", options = {}) {
        const template = data.templates.find((item) => item.id === templateId);
        if (!template) return;
        if (hasActiveWorkout()) {
          templateStartFlow = { templateId, step: "active-conflict", draft: cleanRecovery(recovery) };
          render();
          return;
        }
        const currentSession = activeSession();
        const replaceCurrent = currentSession && currentSession.date === todayIso() && currentSession.source !== "strong" && !isSessionSubmitted(currentSession);
        const session = replaceCurrent
          ? { ...currentSession, title: template.name, templateId: template.id, recovery: cleanRecovery(recovery), readinessMode, submitted: false, submittedAt: "", workoutStarted: true, workoutState: "active", prs: [], updatedAt: isoNow() }
          : createSession(template.name, { started: true });
        session.templateId = template.id;
        session.workoutStarted = true;
        session.workoutState = "active";
        session.recovery = cleanRecovery(recovery);
        session.readinessMode = readinessMode;
        const recoveryAdvice = recoveryRecommendationForSession(session);
        const exercises = [];
        const sets = [];
        const readinessAdjustments = [];
        const recommendationSnapshots = [];
        let adjustedLiftCount = 0;
        template.exercises.forEach((templateExercise, index) => {
          const templateResistanceType = templateExercise.resistanceType || inferResistanceType(templateExercise.name, templateExercise);
          const historyTarget = { ...coachTargetForTemplateExercise(templateExercise, { excludeSessionId: session.id, template }), resistanceType: templateResistanceType, isBodyweight: isBodyweightResistance(templateResistanceType) };
          historyTarget.restSeconds = Number(historyTarget.restSeconds || templateExercise.restSeconds || recommendedRestSeconds(templateExercise.name, { reps: historyTarget.reps, rpe: historyTarget.rpe, excludeSessionId: session.id }));
          const safetyRestricted = Boolean(recovery.illness || recovery.pain);
          const adjustedTarget = options.useOriginal && !safetyRestricted ? { ...historyTarget, adjusted: false, adjustmentReason: "", triggerLabels: [] } : adjustTargetForRecovery(historyTarget, recoveryAdvice, { recovery, exerciseName: templateExercise.name, template });
          const target = { ...adjustedTarget, resistanceType: adjustedTarget.resistanceType || templateResistanceType, isBodyweight: isBodyweightResistance(adjustedTarget.resistanceType || templateResistanceType) };
          const resolvedResistanceType = target.resistanceType || templateResistanceType;
          if (target.adjusted) adjustedLiftCount += 1;
          const restSeconds = Number(target.restSeconds || historyTarget.restSeconds);
          const programTargetContext = unifiedTargetContext(historyTarget, template, templateExercise) || exerciseTargetContext(template, templateExercise, { source: "Current workout template", effectiveStartDate: session.date });
          let appliedTargetContext = unifiedTargetContext(target, template, templateExercise) || exerciseTargetContext(template, { ...templateExercise, sets: target.sets }, { sets: target.sets, rpe: target.rpe, restSeconds, source: target.adjusted ? "Readiness-adjusted target" : target.isDeload ? "Deload prescription" : "Saved workout prescription", effectiveStartDate: session.date, effectiveEndDate: session.date, confidence: target.confidence });
          const baseTargetContext = appliedTargetContext || programTargetContext;
          const rpeShift = Number(target.rpe || 0) && Number(historyTarget.rpe || 0) ? Number(target.rpe) - Number(historyTarget.rpe) : 0;
          const effectiveRpeShift = ["deload", "light", "technique"].includes(target.mode) ? 0 : rpeShift;
          const resolvedTypes = resolvedSetTypesForPrescription(baseTargetContext, target).map((type) => ({
            ...type,
            rpeMin: type.rpeMin ? Math.max(1, type.rpeMin + effectiveRpeShift) : Math.max(1, Number(target.rpe || 0) - 1),
            rpeMax: type.rpeMax ? Math.max(1, type.rpeMax + effectiveRpeShift) : Number(target.rpe || 0),
            restSeconds: Number(target.restSeconds || type.restSeconds || restSeconds)
          }));
          appliedTargetContext = { ...appliedTargetContext, setTypes: [...(appliedTargetContext?.setTypes || []).filter((type) => type.isWarmup), ...resolvedTypes] };
          const exercise = { id: id(), sessionId: session.id, name: templateExercise.name, primaryMuscle: templateExercise.primaryMuscle || "", secondaryMuscle: templateExercise.secondaryMuscle || "", notes: "", originalPrescription: historyTarget, prescription: target, recommendationSnapshot: target.recommendationSnapshot || historyTarget.recommendationSnapshot || null, basePrescription: target.basePrescription || historyTarget.basePrescription || null, finalPrescription: target.finalPrescription || target.recommendationSnapshot?.finalPrescription || null, recommendationVersion: target.recommendationSnapshot?.recommendationVersion || null, personalDataVersion: target.recommendationSnapshot?.personalDataVersion || null, researchDatabaseVersion: target.recommendationSnapshot?.researchDatabaseVersion || null, programTargetContext, appliedTargetContext, adjustmentReason: target.adjustmentReason || "", manualOverrides: [], order: index, restSeconds, resistanceType: target.resistanceType || templateResistanceType, isBodyweight: isBodyweightResistance(resolvedResistanceType), isDeload: Boolean(target.isDeload), executionBlocked: Boolean(target.executionBlocked), safetyRestriction: target.safetyRestriction || null };
          exercises.push(exercise);
          if (exercise.recommendationSnapshot) recommendationSnapshots.push(exercise.recommendationSnapshot);
          readinessAdjustments.push({ exerciseId: exercise.id, name: exercise.name, original: historyTarget, adjusted: target, changed: Boolean(target.adjusted), reason: target.adjustmentReason || "No readiness change was required.", triggers: target.triggerLabels || [] });
          const configuredWarmups = target.executionBlocked ? [] : (templateExercise.warmups || []);
          configuredWarmups.forEach((warmup, warmupIndex) => {
            sets.push(createSet(exercise.id, warmupIndex + 1, { ...warmup, sequenceIndex: warmupIndex, sequence: warmupIndex, setTypeIndex: warmupIndex, sourceTemplateSetId: warmup.id || templateExercise.id + "-warmup-" + warmupIndex, resistanceType: target.resistanceType || templateResistanceType, completed: false, isWarmup: true, setType: "warmup", countsTowardScore: false, countsTowardVolume: false, countsTowardProgression: false }));
          });
          const previousRoleSets = getMostRecentWorkoutSets(templateExercise.name, { excludeSessionId: session.id });
          let setNumber = 0;
          let rolePrescriptions = [];
          resolvedTypes.forEach((setType) => {
            for (let typeSetIndex = 0; typeSetIndex < setType.setCount; typeSetIndex += 1) {
              setNumber += 1;
              rolePrescriptions.push(setPrescriptionForRole({ templateExercise, target, setType, setTypeIndex: typeSetIndex, sequenceIndex: configuredWarmups.length + setNumber - 1, previousSets: previousRoleSets }));
            }
          });
          rolePrescriptions = validateGeneratedSetPrescriptions(rolePrescriptions, resolvedResistanceType);
          const generatedRoleTypes = Array.from(new Set(rolePrescriptions.map((prescription) => prescription.setType))).map((role) => {
            const sourceType = resolvedTypes.find((type) => normalizeSetTypeCode(type.type) === role)
              || (role === "straight" ? resolvedTypes.find((type) => normalizeSetTypeCode(type.type) === "backoff") : null)
              || {};
            return { ...sourceType, type: role, label: setTypeLabels[role] || "Working set", setCount: rolePrescriptions.filter((prescription) => prescription.setType === role).length };
          });
          appliedTargetContext = { ...appliedTargetContext, setTypes: [...(appliedTargetContext?.setTypes || []).filter((type) => type.isWarmup), ...generatedRoleTypes] };
          exercise.appliedTargetContext = appliedTargetContext;
          rolePrescriptions.forEach((prescription, prescriptionIndex) => {
            const setNumber = prescriptionIndex + 1;
            const setType = resolvedTypes.find((type) => normalizeSetTypeCode(type.type) === prescription.setType) || resolvedTypes.find((type) => normalizeSetTypeCode(type.type) === "backoff" && prescription.setType === "straight") || {};
            const setWeight = prescription.targetLoad;
            const setRpe = prescription.rpeMax;
            sets.push(createSet(exercise.id, setNumber, { sequenceIndex: prescription.sequenceIndex, sequence: prescription.sequenceIndex, setTypeIndex: prescription.setTypeIndex, sourceTemplateSetId: setType.id || templateExercise.id + "-" + prescription.setType + "-" + prescription.setTypeIndex, reps: prescription.targetReps, weight: setWeight, weightUnit: target.weightUnit, resistanceType: target.resistanceType || templateResistanceType, isBodyweight: isBodyweightResistance(resolvedResistanceType), addedLoad: target.resistanceType === "bodyweight_plus_load" ? setWeight : target.addedLoad, assistanceLoad: target.resistanceType === "assisted_bodyweight" ? setWeight : target.assistanceLoad, rpe: setRpe, completed: false, isWarmup: false, setType: prescription.setType, countsTowardScore: setType.countsTowardScore !== false, countsTowardVolume: setType.countsTowardVolume !== false, targetReps: prescription.targetReps, targetRepMin: prescription.repMin, targetRepMax: prescription.repMax, targetWeight: setWeight, targetRpe: setRpe, targetRpeMin: prescription.rpeMin, targetRpeMax: prescription.rpeMax, targetRpeTolerance: setType.rpeTolerance, targetRestSeconds: prescription.restSeconds, originalTargetReps: historyTarget.reps, originalTargetWeight: historyTarget.weight, originalTargetRpe: historyTarget.rpe, setPrescription: prescription, previousComparableSet: prescription.previousComparableSet, prescriptionReason: prescription.reason + " " + (target.adjustmentReason || target.reason || ""), prescriptionMode: target.mode, prescriptionConfidence: target.confidence, validationWarning: prescription.validationWarning || "" }));
          });
        });
        session.adjustmentSummary = adjustedLiftCount ? adjustedLiftCount + " lift" + (adjustedLiftCount === 1 ? "" : "s") + " adjusted for recovery." : "No recovery adjustments — normal plan and history-based progression.";
        session.readinessAdjustments = readinessAdjustments;
        session.usedOriginalTargets = Boolean(options.useOriginal);
        session.mesocycleId = currentMesocycle()?.id || "";
        session.workoutPrescription = {
          schemaVersion: "workout-prescription/1.0.0",
          workoutPrescriptionId: `workout_rx_${session.id}`,
          createdAt: isoNow(),
          mesocycleId: session.mesocycleId || null,
          recommendationVersion: recommendationSnapshots[0]?.recommendationVersion || prescriptionApi?.PRESCRIPTION_SCHEMA_VERSION || "unknown",
          personalDataVersion: recommendationSnapshots[0]?.personalDataVersion || prescriptionEvidenceStatus.personalVersion,
          researchDatabaseVersion: recommendationSnapshots[0]?.researchDatabaseVersion || prescriptionEvidenceStatus.researchVersion,
          recommendations: recommendationSnapshots
        };
        session.startedAt = isoNow();
        activeSessionId = session.id;
        activeWorkoutId = session.id;
        viewingHistorySessionId = "";
        setActiveTab("lift", { renderNow: false });
        templateStartFlow = null;
        activeSetId = [...sets].sort((a, b) => canonicalSetSequence(a) - canonicalSetSequence(b)).find((set) => !set.completed && !set.skipped)?.id || "";
        activeSetAcknowledged = false;
        activeSetNotice = activeSetId ? "First set is ready" : "";
        if (replaceCurrent) {
          const oldExerciseIds = new Set(data.exercises.filter((exercise) => exercise.sessionId === session.id).map((exercise) => exercise.id));
          commit({
            ...data,
            sessions: data.sessions.map((item) => item.id === session.id ? session : item),
            exercises: [...data.exercises.filter((exercise) => exercise.sessionId !== session.id), ...exercises],
            sets: [...data.sets.filter((set) => !oldExerciseIds.has(set.exerciseId)), ...sets],
            recommendationHistory: [...data.recommendationHistory.filter((snapshot) => !recommendationSnapshots.some((candidate) => candidate.recommendationId === snapshot.recommendationId)), ...recommendationSnapshots]
          }, true, { invalidateAnalysis: false });
        } else {
          commit({ ...data, sessions: [session, ...data.sessions], exercises: [...data.exercises, ...exercises], sets: [...data.sets, ...sets], recommendationHistory: [...data.recommendationHistory, ...recommendationSnapshots.filter((snapshot) => !data.recommendationHistory.some((existing) => existing.recommendationId === snapshot.recommendationId))] }, true, { invalidateAnalysis: false });
        }
      }

      function addSet(exerciseId, duplicate) {
        const action = duplicate ? "duplicate-set" : "add-set";
        const authorization = guardWorkoutMutation(action, { exerciseId });
        if (!authorization.allowed) return;
        const exercise = authorization.target.exercise;
        const targetExerciseId = exercise.id;
        const sets = setsForExercise(targetExerciseId);
        logWorkoutOverride(exercise, "setCount", sets.filter((set) => isWorkingSet(set, "score")).length, sets.filter((set) => isWorkingSet(set, "score")).length + 1, { action: duplicate ? "duplicate_set" : "add_set" });
        const sequenceIndex = sets.length ? Math.max(...sets.map(canonicalSetSequence)) + 1 : 0;
        const previous = duplicate ? sets[sets.length - 1] : undefined;
        commit({ ...data, sets: [...data.sets, createSet(targetExerciseId, sets.filter((set) => !setTypeSemantics(set).isWarmup).length + 1, { ...(previous || {}), sequenceIndex, sequence: sequenceIndex, completed: false, skipped: false, edited: false })] }, true, { invalidateAnalysis: authorization.target.authorizationMode === "history_edit", deferPersistence: authorization.target.authorizationMode !== "history_edit" });
      }

      function addWarmupSet(exerciseId) {
        const authorization = guardWorkoutMutation("add-warmup-set", { exerciseId });
        if (!authorization.allowed) return;
        const targetExerciseId = authorization.target.exercise.id;
        const sets = setsForExercise(targetExerciseId);
        const warmups = sets.filter((set) => setTypeSemantics(set).isWarmup);
        const sequenceIndex = warmups.length;
        const priorWarmup = warmups.at(-1);
        const shifted = data.sets.map((set) => set.exerciseId === targetExerciseId && canonicalSetSequence(set) >= sequenceIndex ? { ...set, sequenceIndex: canonicalSetSequence(set) + 1, sequence: canonicalSetSequence(set) + 1 } : set);
        const warmupSet = createSet(targetExerciseId, warmups.length + 1, { ...(priorWarmup || {}), sequenceIndex, sequence: sequenceIndex, setTypeIndex: warmups.length, completed: false, skipped: false, edited: false, isWarmup: true, setType: "warmup", countsTowardScore: false, countsTowardVolume: false, countsTowardProgression: false, rpe: 5 });
        const current = data.sets.find((set) => set.id === activeSetId);
        const nextWarmup = warmups.find((set) => !set.completed && !set.skipped) || warmupSet;
        const nextWarmupIndex = nextWarmup.id === warmupSet.id ? warmups.length : warmups.findIndex((set) => set.id === nextWarmup.id);
        const shouldActivateWarmup = !sets.some((set) => set.completed || set.skipped) && (!current || !setTypeSemantics(current).isWarmup);
        if (shouldActivateWarmup) setActiveSet(nextWarmup.id, "Warm-Up " + (nextWarmupIndex + 1) + " of " + (warmups.length + 1) + " is ready", false);
        commit({ ...data, sets: [...shifted, warmupSet] }, true, { invalidateAnalysis: authorization.target.authorizationMode === "history_edit", deferPersistence: authorization.target.authorizationMode !== "history_edit" });
      }

      function moveExercise(exerciseId, direction) {
        const session = activeSession();
        const exercises = activeExercises();
        const index = exercises.findIndex((exercise) => exercise.id === exerciseId);
        const nextIndex = index + Number(direction);
        if (!session || index < 0 || nextIndex < 0 || nextIndex >= exercises.length) return;
        const reordered = [...exercises];
        const [moved] = reordered.splice(index, 1);
        reordered.splice(nextIndex, 0, moved);
        const orderMap = new Map(reordered.map((exercise, order) => [exercise.id, order]));
        entityStructureRevision += 1;
        entityIndexCache = null;
        commit({ ...data, exercises: data.exercises.map((exercise) => exercise.sessionId === session.id ? { ...exercise, order: orderMap.get(exercise.id) ?? exercise.order } : exercise) }, true, { invalidateAnalysis: false, deferPersistence: true });
      }

      function isStandalonePwa() {
        return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
      }

      function isIosDevice() {
        return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      }

      function validPushIdentityCandidate(candidate) {
        return Boolean(candidate && typeof candidate === "object" && !Array.isArray(candidate) && typeof candidate.installationId === "string" && candidate.installationId.trim());
      }

      function pushIdentityMetadataTime(candidate) {
        if (!validPushIdentityCandidate(candidate)) return 0;
        const values = [candidate.updatedAt, candidate.registeredAt, candidate.testedAt, candidate.deletion?.updatedAt, candidate.deletion?.completedAt];
        return values.reduce((newest, value) => {
          const parsed = typeof value === "string" ? Date.parse(value) : NaN;
          return Number.isFinite(parsed) ? Math.max(newest, parsed) : newest;
        }, 0);
      }

      function pushIdentityDeletionIsPending(candidate) {
        if (!validPushIdentityCandidate(candidate) || typeof candidate.token !== "string" || !candidate.token) return false;
        const deletionStatus = candidate.deletion?.status || "";
        return candidate.status === "deleting" || deletionStatus === "deleting" || deletionStatus === "error" || candidate.deletion?.retryable === true;
      }

      function pushIdentityHasActiveCredential(candidate) {
        if (!validPushIdentityCandidate(candidate) || typeof candidate.token !== "string" || !candidate.token) return false;
        return candidate.status !== "deleted" && candidate.deletion?.status !== "deleted";
      }

      function pushIdentityDeletionIsTerminal(candidate) {
        return validPushIdentityCandidate(candidate) && (candidate.status === "deleted" || candidate.deletion?.status === "deleted");
      }

      function selectRestoredPushIdentity(indexedCandidate, fallbackCandidate) {
        const indexed = validPushIdentityCandidate(indexedCandidate) ? indexedCandidate : null;
        const fallback = validPushIdentityCandidate(fallbackCandidate) ? fallbackCandidate : null;
        if (!indexed) return fallback;
        if (!fallback) return indexed;

        const indexedTime = pushIdentityMetadataTime(indexed);
        const fallbackTime = pushIdentityMetadataTime(fallback);
        if (indexed.installationId === fallback.installationId) {
          const indexedTerminal = pushIdentityDeletionIsTerminal(indexed);
          const fallbackTerminal = pushIdentityDeletionIsTerminal(fallback);
          if (indexedTerminal !== fallbackTerminal) {
            const terminal = indexedTerminal ? indexed : fallback;
            const terminalTime = indexedTerminal ? indexedTime : fallbackTime;
            const competingTime = indexedTerminal ? fallbackTime : indexedTime;
            if (terminalTime > competingTime) return terminal;
          }
        }

        const indexedPending = pushIdentityDeletionIsPending(indexed);
        const fallbackPending = pushIdentityDeletionIsPending(fallback);
        if (indexedPending !== fallbackPending) return indexedPending ? indexed : fallback;

        const indexedCredential = pushIdentityHasActiveCredential(indexed);
        const fallbackCredential = pushIdentityHasActiveCredential(fallback);
        if (indexedCredential !== fallbackCredential) return indexedCredential ? indexed : fallback;

        if (indexedTime !== fallbackTime) return indexedTime > fallbackTime ? indexed : fallback;

        // IndexedDB is authoritative only after equivalent lifecycle strength and
        // metadata freshness have been established. A failed-write journal with a
        // pending bearer already wins above and can never be replaced by a new ID.
        return indexed;
      }

      async function restorePushIdentity() {
        let indexedIdentity = null;
        let fallbackIdentity = null;
        let fallbackPresent = false;
        try { indexedIdentity = await readIndexedValue("push-identity"); } catch { indexedIdentity = null; }
        try {
          const fallbackText = localStorage.getItem(IDENTITY_KEY);
          fallbackPresent = fallbackText != null;
          fallbackIdentity = fallbackText ? JSON.parse(fallbackText) : null;
        } catch { fallbackIdentity = null; }
        pushIdentity = selectRestoredPushIdentity(indexedIdentity, fallbackIdentity);
        if (!pushIdentity?.installationId) {
          pushIdentity = { installationId: id(), deviceId: id(), token: "", status: "disabled" };
          await persistPushIdentity();
        } else if (fallbackPresent) {
          // Reconcile the selected state into IndexedDB before the recovery journal
          // may be removed. persistPushIdentity retains it if the write still fails.
          await persistPushIdentity();
        }
        return pushIdentity;
      }

      async function persistPushIdentity() {
        try {
          await writeIndexedValue("push-identity", pushIdentity);
          localStorage.removeItem(IDENTITY_KEY);
        } catch {
          try { localStorage.setItem(IDENTITY_KEY, JSON.stringify(pushIdentity)); } catch { return false; }
        }
        return true;
      }

      async function deleteRemoteInstallationData(options = {}) {
        const identity = pushIdentity;
        if (!identity?.installationId || !identity?.token) {
          const unavailable = { status: "unavailable", retryable: false, message: "No authorized remote installation is available to delete." };
          settingsMessage = unavailable.message;
          render();
          return unavailable;
        }
        if (window.__cfRemoteDeletionInFlight) return { status: "deleting", retryable: true, inFlight: true };
        window.__cfRemoteDeletionInFlight = true;
        const finish = (result) => {
          window.__cfRemoteDeletionInFlight = false;
          return result;
        };
        const retainedToken = identity.token;
        const retainedInstallationId = identity.installationId;
        const retainedDeviceId = identity.deviceId;
        const scheduleRetry = (delayMs = 5000) => {
          if (options.scheduleRetry === false || typeof window?.setTimeout !== "function") return;
          if (window.__cfRemoteDeletionRetryTimer) window.clearTimeout(window.__cfRemoteDeletionRetryTimer);
          window.__cfRemoteDeletionRetryTimer = window.setTimeout(() => {
            window.__cfRemoteDeletionRetryTimer = 0;
            deleteRemoteInstallationData({ automatic: true });
          }, Math.max(1000, Math.min(300000, Number(delayMs || 5000))));
        };
        try {
          const result = await pushApi("/api/install/delete", { installationId: retainedInstallationId });
          if (result?.status === "deleted") {
            pushIdentity = {
              ...identity,
              installationId: retainedInstallationId,
              deviceId: retainedDeviceId,
              token: "",
              status: "deleted",
              deletion: { status: "deleted", retryable: false, completedAt: isoNow(), message: "Remote installation data was deleted. Local workout data remains on this device." }
            };
            await persistPushIdentity();
            await writeIndexedValue("sync-queue", []).catch(() => undefined);
            settingsMessage = pushIdentity.deletion.message;
            render();
            if (window.__cfRemoteDeletionRetryTimer) window.clearTimeout(window.__cfRemoteDeletionRetryTimer);
            window.__cfRemoteDeletionRetryTimer = 0;
            return finish({ status: "deleted", retryable: false });
          }
          const deleting = {
            status: "deleting",
            retryable: true,
            phase: result?.phase || "cleanup",
            updatedAt: isoNow(),
            message: "Remote deletion is in progress. Authorization is retained only to resume cleanup."
          };
          pushIdentity = { ...identity, installationId: retainedInstallationId, deviceId: retainedDeviceId, token: retainedToken, status: "deleting", deletion: deleting };
          await persistPushIdentity();
          settingsMessage = deleting.message;
          render();
          scheduleRetry(result?.retryAfterMs);
          return finish({ status: "deleting", retryable: true, phase: deleting.phase });
        } catch (error) {
          const statusCode = Number(error?.status || 0);
          const retryable = !statusCode || statusCode === 429 || statusCode >= 500;
          const failed = {
            status: "error",
            retryable,
            updatedAt: isoNow(),
            message: retryable
              ? "Remote deletion was interrupted and will retry while this installation remains authorized."
              : "Remote deletion could not continue. Retry from Settings; local data was not changed."
          };
          pushIdentity = { ...identity, installationId: retainedInstallationId, deviceId: retainedDeviceId, token: retainedToken, status: retryable ? "deleting" : identity.status, deletion: failed };
          await persistPushIdentity();
          settingsMessage = failed.message;
          render();
          if (retryable) scheduleRetry(error?.retryAfterMs);
          return finish({ status: "error", retryable });
        }
      }

      async function fetchPushConfig(force = false) {
        if (pushConfig && !force) return pushConfig;
        try {
          const response = await fetch("/api/push/config", { headers: { Accept: "application/json" } });
          pushConfig = response.ok ? await response.json() : { configured: false, publicKey: "" };
        } catch {
          pushConfig = { configured: false, publicKey: "", offline: true };
        }
        return pushConfig;
      }

      function urlBase64ToUint8Array(value) {
        const padding = "=".repeat((4 - value.length % 4) % 4);
        const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
        const raw = atob(base64);
        return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
      }

      function pushAuthorizationHeaders() {
        return pushIdentity?.token ? { Authorization: "Bearer " + pushIdentity.token } : {};
      }

      async function pushApi(path, body, options = {}) {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...pushAuthorizationHeaders() },
          body: JSON.stringify(body),
          signal: options.signal
        });
        const payload = await response.json().catch(() => ({}));
        const retryAfterValue = String(response.headers?.get?.("Retry-After") || "").trim();
        let retryAfterMs = 0;
        if (/^\d+(?:\.\d+)?$/.test(retryAfterValue)) retryAfterMs = Math.ceil(Number(retryAfterValue) * 1000);
        else if (retryAfterValue) retryAfterMs = Math.max(0, Date.parse(retryAfterValue) - Date.now());
        if (!response.ok) {
          const error = new Error(payload.error || "Notification service request failed.");
          error.status = response.status;
          error.retryAfterMs = retryAfterMs;
          throw error;
        }
        return retryAfterMs ? { ...payload, retryAfterMs } : payload;
      }

      async function registerPushSubscription(subscription, retryWithNewId = true) {
        const body = {
          installationId: pushIdentity.installationId,
          deviceId: pushIdentity.deviceId,
          userId: pushIdentity.installationId,
          subscription: subscription.toJSON()
        };
        try {
          const result = await pushApi("/api/push/register", body);
          pushIdentity = { ...pushIdentity, token: result.token || pushIdentity.token, status: "enabled", registeredAt: isoNow() };
          await persistPushIdentity();
          return true;
        } catch (error) {
          if (retryWithNewId && error.status === 401 && !pushIdentity.token) {
            pushIdentity = { installationId: id(), deviceId: id(), token: "", status: "disabled" };
            await persistPushIdentity();
            return registerPushSubscription(subscription, false);
          }
          throw error;
        }
      }

      async function enablePushNotifications() {
        if (data.settings.timerNotifications === false) commit({ ...data, settings: { ...data.settings, timerNotifications: true } }, false);
        if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
          notificationMessage = "System notifications are unsupported in this browser.";
          render();
          return;
        }
        if (isIosDevice() && !isStandalonePwa()) {
          notificationMessage = "Install this app from Safari using Add to Home Screen before enabling iPhone notifications.";
          render();
          return;
        }
        if (Notification.permission === "denied") {
          notificationMessage = "Permission denied. Open iPhone Settings > Notifications > Comprehensive Fitness to enable Lock Screen and Sounds.";
          pushIdentity = { ...pushIdentity, status: "denied" };
          persistPushIdentity();
          render();
          return;
        }
        const config = await fetchPushConfig(true);
        if (!config.configured || !config.publicKey) {
          notificationMessage = config.offline ? "Connect to the internet to finish notification setup." : "The secure notification service still needs its Vercel environment variables.";
          render();
          return;
        }
        try {
          const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
          if (permission !== "granted") {
            pushIdentity = { ...pushIdentity, status: permission === "denied" ? "denied" : "disabled" };
            await persistPushIdentity();
            notificationMessage = "Notifications were not enabled. The app will not ask again automatically.";
            render();
            return;
          }
          const registration = await navigator.serviceWorker.ready;
          const existing = await registration.pushManager.getSubscription();
          const subscription = existing || await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(config.publicKey)
          });
          await registerPushSubscription(subscription);
          notificationMessage = "Rest notifications are enabled and scheduled securely.";
        } catch (error) {
          notificationMessage = String(error?.message || "Notification setup failed. Try again while online.");
        }
        render();
      }

      function restTimerScheduleKey(timerId, timerVersion = 1) {
        const idValue = String(timerId || "").slice(0, 160);
        const versionValue = Math.max(1, Math.floor(Number(timerVersion || 1)));
        return idValue ? `${idValue}::v${versionValue}` : "";
      }

      async function disablePushNotifications(options = {}) {
        const renderNow = options.renderNow !== false;
        data = { ...data, settings: { ...data.settings, timerNotifications: false, restCompleteLockScreenNotifications: false } };
        try {
          const registration = await navigator.serviceWorker?.ready;
          const subscription = await registration?.pushManager?.getSubscription?.();
          if (subscription) await subscription.unsubscribe();
        } catch { /* Server revocation remains authoritative when available. */ }
        if (!pushIdentity?.token) {
          notificationMessage = "Lock-screen rest notifications are disabled.";
          saveData();
          if (renderNow) render();
          return true;
        }
        if (!navigator.onLine) {
          pushIdentity = { ...pushIdentity, pushRevocationPending: true };
          await persistPushIdentity();
          notificationMessage = "Notifications are disabled locally. Reconnect to finish revoking the server subscription.";
          saveData();
          if (renderNow) render();
          return false;
        }
        try {
          const revokeAll = data.settings.workoutCloudSync !== true;
          await pushApi(revokeAll ? "/api/installation/revoke" : "/api/push/revoke", { installationId: pushIdentity.installationId });
          pushIdentity = revokeAll
            ? { installationId: pushIdentity.installationId, deviceId: pushIdentity.deviceId, token: "", status: "disabled", pushRevocationPending: false, syncRevokedAt: isoNow() }
            : { ...pushIdentity, status: "disabled", pushRevocationPending: false, pushRevokedAt: isoNow() };
          await persistPushIdentity();
          notificationMessage = revokeAll
            ? "Notifications are disabled and the installation credential plus retained cloud data were revoked."
            : "Notifications are disabled and the push subscription was revoked. Optional workout cloud copy remains independently enabled.";
          saveData();
          if (renderNow) render();
          return true;
        } catch (error) {
          pushIdentity = { ...pushIdentity, pushRevocationPending: true };
          await persistPushIdentity();
          notificationMessage = String(error?.message || "Server notification revocation could not be confirmed. Reconnect and try again.");
          saveData();
          if (renderNow) render();
          return false;
        }
      }

      async function reconcilePushRevocation() {
        if (!pushIdentity?.pushRevocationPending || data.settings.timerNotifications === true) return true;
        return disablePushNotifications({ renderNow: false });
      }

      async function scheduleRestPush(timerSnapshot) {
        if (!data.settings.timerNotifications || !pushIdentity?.token || Notification.permission !== "granted" || !navigator.onLine) return false;
        const session = sessionById(timerSnapshot.workoutId) || activeWorkoutSession();
        const exercise = exerciseById(timerSnapshot.exerciseId);
        const upcoming = setById(timerSnapshot.pendingNextSetId);
        try {
          const result = await pushApi("/api/push/schedule", {
            installationId: pushIdentity.installationId,
            notificationId: timerSnapshot.id,
            workoutId: timerSnapshot.workoutId || session?.id,
            exerciseId: upcoming?.exerciseId || timerSnapshot.exerciseId,
            setId: timerSnapshot.setId,
            upcomingSetId: upcoming?.id || "",
            upcomingSetNumber: upcoming?.isWarmup ? "WU" : upcoming?.setNumber || "",
            upcomingSetLabel: upcoming ? setExecutionLabel(upcoming) : "",
            timerVersion: Number(timerSnapshot.version || 1),
            exerciseName: exerciseById(upcoming?.exerciseId)?.name || exercise?.name || "Workout",
            messageDetail: data.settings.notificationMessageDetail,
            restEndTime: timerSnapshot.endsAt
          });
          if (timer?.id === timerSnapshot.id) {
            timer.notificationStatus = result.status;
            timer.serverNotificationId = result.notificationId;
            saveRuntime();
            syncTimerDom();
          }
          return true;
        } catch (error) {
          if (timer?.id === timerSnapshot.id) {
            timer.notificationStatus = navigator.onLine ? "error" : "pending";
            saveRuntime();
            syncTimerDom();
          }
          return false;
        }
      }

      function rememberCanceledRestSchedule(timerId, timerVersion = 1, now = Date.now()) {
        const key = restTimerScheduleKey(timerId, timerVersion);
        if (!key) return "";
        for (const [storedKey, expiresAt] of canceledRestScheduleKeys) if (expiresAt <= now) canceledRestScheduleKeys.delete(storedKey);
        canceledRestScheduleKeys.set(key, now + 26 * 60 * 60 * 1000);
        while (canceledRestScheduleKeys.size > 256) canceledRestScheduleKeys.delete(canceledRestScheduleKeys.keys().next().value);
        return key;
      }

      function restScheduleWasCanceled(timerId, timerVersion = 1, now = Date.now()) {
        const key = restTimerScheduleKey(timerId, timerVersion);
        const expiresAt = canceledRestScheduleKeys.get(key) || 0;
        if (expiresAt <= now) {
          canceledRestScheduleKeys.delete(key);
          return false;
        }
        return true;
      }

      function notifyServiceWorkerOfRestCancellation(timerId, timerVersion) {
        if (!timerId) return;
        navigator.serviceWorker?.controller?.postMessage({ type: "CANCEL_REST_TIMER", timerId, timerVersion: Number(timerVersion || 1) });
      }

      function queueDurableRestCancellation(operation) {
        const write = pushOperationWriteChain.catch(() => undefined).then(async () => {
          let pending = [];
          try { pending = await readIndexedValue("push-operations") || []; } catch { return false; }
          pending = pending.filter((item) => item.notificationId !== operation.notificationId || Number(item.timerVersion || 1) !== Number(operation.timerVersion || 1));
          pending.push(operation);
          try { await writeIndexedValue("push-operations", pending); } catch { return false; }
          return true;
        });
        pushOperationWriteChain = write.catch(() => false);
        return write;
      }

      async function performRestCancellation(operation) {
        if (!operation?.notificationId) return true;
        if (!pushIdentity?.token) return true;
        if (!navigator.onLine) {
          await queueDurableRestCancellation(operation);
          return false;
        }
        try {
          await pushApi("/api/push/cancel", operation);
          return true;
        } catch (error) {
          const statusCode = Number(error?.status || 0);
          if ([409, 410].includes(statusCode)) return true;
          await queueDurableRestCancellation(operation);
          return false;
        }
      }

      function scheduleRestPush(timerSnapshot) {
        const timerVersion = Number(timerSnapshot?.version || timerSnapshot?.timerVersion || 1);
        const scheduleKey = restTimerScheduleKey(timerSnapshot?.id, timerVersion);
        if (!timerSnapshot?.id || restScheduleWasCanceled(timerSnapshot.id, timerVersion)) return Promise.resolve(false);
        if (!data.settings.timerNotifications || !pushIdentity?.token || Notification.permission !== "granted" || !navigator.onLine) return Promise.resolve(false);
        if (restSchedulePromises.has(scheduleKey)) return restSchedulePromises.get(scheduleKey).then((outcome) => outcome.scheduled === true);
        const session = sessionById(timerSnapshot.workoutId) || activeWorkoutSession();
        const exercise = exerciseById(timerSnapshot.exerciseId);
        const upcoming = setById(timerSnapshot.pendingNextSetId);
        const lifecycle = (async () => {
          try {
            const result = await pushApi("/api/push/schedule", {
              installationId: pushIdentity.installationId,
              notificationId: timerSnapshot.id,
              workoutId: timerSnapshot.workoutId || session?.id,
              exerciseId: upcoming?.exerciseId || timerSnapshot.exerciseId,
              setId: timerSnapshot.setId,
              upcomingSetId: upcoming?.id || "",
              upcomingSetNumber: upcoming?.isWarmup ? "WU" : upcoming?.setNumber || "",
              upcomingSetLabel: upcoming ? setExecutionLabel(upcoming) : "",
              timerVersion,
              exerciseName: exerciseById(upcoming?.exerciseId)?.name || exercise?.name || "Workout",
              messageDetail: data.settings.notificationMessageDetail,
              restEndTime: timerSnapshot.endsAt
            });
            const authoritativeNotificationId = result.notificationId || timerSnapshot.id;
            if (restScheduleWasCanceled(timerSnapshot.id, timerVersion)) {
              rememberCanceledRestSchedule(authoritativeNotificationId, timerVersion);
              notifyServiceWorkerOfRestCancellation(authoritativeNotificationId, timerVersion);
              const cancellationConfirmed = await performRestCancellation({
                installationId: pushIdentity?.installationId,
                workoutId: timerSnapshot.workoutId || activeWorkoutId,
                notificationId: authoritativeNotificationId,
                timerVersion,
                reason: "canceled-before-schedule-completed"
              });
              return { scheduled: false, canceled: true, cancellationConfirmed, notificationId: authoritativeNotificationId };
            }
            if (timer?.id === timerSnapshot.id && Number(timer.version || 1) === timerVersion) {
              timer.notificationStatus = result.status;
              timer.serverNotificationId = authoritativeNotificationId;
              saveRuntime();
              syncTimerDom();
            }
            return { scheduled: true, canceled: false, cancellationConfirmed: false, notificationId: authoritativeNotificationId };
          } catch (error) {
            const canceledWhileScheduling = restScheduleWasCanceled(timerSnapshot.id, timerVersion);
            if (canceledWhileScheduling) {
              notifyServiceWorkerOfRestCancellation(timerSnapshot.id, timerVersion);
              await queueDurableRestCancellation({
                installationId: pushIdentity?.installationId,
                workoutId: timerSnapshot.workoutId || activeWorkoutId,
                notificationId: timerSnapshot.id,
                timerVersion,
                reason: "canceled-with-ambiguous-schedule-result"
              });
              return { scheduled: false, canceled: true, cancellationConfirmed: false, notificationId: timerSnapshot.id };
            }
            if (timer?.id === timerSnapshot.id && Number(timer.version || 1) === timerVersion) {
              timer.notificationStatus = navigator.onLine ? "error" : "pending";
              saveRuntime();
              syncTimerDom();
            }
            return { scheduled: false, canceled: false, cancellationConfirmed: false, notificationId: timerSnapshot.id };
          }
        })();
        restSchedulePromises.set(scheduleKey, lifecycle);
        lifecycle.finally(() => { if (restSchedulePromises.get(scheduleKey) === lifecycle) restSchedulePromises.delete(scheduleKey); }).catch(() => undefined);
        return lifecycle.then((outcome) => outcome.scheduled === true);
      }

      async function cancelRestPush(timerSnapshot, reason = "canceled") {
        if (!timerSnapshot?.id) return false;
        const timerVersion = Number(timerSnapshot.version || timerSnapshot.timerVersion || 1);
        const scheduleKey = typeof restTimerScheduleKey === "function" ? restTimerScheduleKey(timerSnapshot.id, timerVersion) : `${timerSnapshot.id}::v${timerVersion}`;
        if (typeof rememberCanceledRestSchedule === "function") rememberCanceledRestSchedule(timerSnapshot.id, timerVersion);
        navigator.serviceWorker?.controller?.postMessage({ type: "CANCEL_REST_TIMER", timerId: timerSnapshot.id, timerVersion });
        if (timerSnapshot.serverNotificationId && timerSnapshot.serverNotificationId !== timerSnapshot.id) navigator.serviceWorker?.controller?.postMessage({ type: "CANCEL_REST_TIMER", timerId: timerSnapshot.serverNotificationId, timerVersion });
        const sendCancellation = typeof performRestCancellation === "function" ? performRestCancellation : async (operation) => {
          if (!pushIdentity?.token) return true;
          if (!navigator.onLine) {
            let pending = [];
            try { pending = await readIndexedValue("push-operations") || []; } catch { return false; }
            pending = pending.filter((item) => item.notificationId !== operation.notificationId || Number(item.timerVersion || 1) !== operation.timerVersion);
            pending.push(operation);
            await writeIndexedValue("push-operations", pending).catch(() => undefined);
            return false;
          }
          try { await pushApi("/api/push/cancel", operation); return true; }
          catch (error) {
            const statusCode = Number(error?.status || 0);
            if ([409, 410].includes(statusCode)) return true;
            let pending = [];
            try { pending = await readIndexedValue("push-operations") || []; } catch { return false; }
            pending = pending.filter((item) => item.notificationId !== operation.notificationId || Number(item.timerVersion || 1) !== operation.timerVersion);
            pending.push(operation);
            await writeIndexedValue("push-operations", pending).catch(() => undefined);
            return false;
          }
        };
        const inFlightSchedule = typeof restSchedulePromises !== "undefined" ? restSchedulePromises.get(scheduleKey) : null;
        if (inFlightSchedule) {
          const outcome = await inFlightSchedule;
          if (outcome.canceled) return outcome.cancellationConfirmed;
          if (!outcome.scheduled) return true;
          const authoritativeNotificationId = outcome.notificationId || timerSnapshot.serverNotificationId || timerSnapshot.id;
          if (typeof rememberCanceledRestSchedule === "function") rememberCanceledRestSchedule(authoritativeNotificationId, timerVersion);
          navigator.serviceWorker?.controller?.postMessage({ type: "CANCEL_REST_TIMER", timerId: authoritativeNotificationId, timerVersion });
          return sendCancellation({ installationId: pushIdentity?.installationId, workoutId: timerSnapshot.workoutId || activeWorkoutId, notificationId: authoritativeNotificationId, timerVersion, reason });
        }
        return sendCancellation({
          installationId: pushIdentity?.installationId,
          workoutId: timerSnapshot.workoutId || activeWorkoutId,
          notificationId: timerSnapshot.serverNotificationId || timerSnapshot.id,
          timerVersion,
          reason
        });
      }

      async function flushPendingPushOperations() {
        if (!navigator.onLine || !pushIdentity?.token) return;
        let pending = [];
        try { pending = await readIndexedValue("push-operations") || []; } catch { return; }
        const remaining = [];
        for (const operation of pending) {
          try { await pushApi("/api/push/cancel", operation); }
          catch (error) {
            const statusCode = Number(error?.status || 0);
            if (!statusCode || statusCode === 429 || statusCode >= 500) remaining.push(operation);
          }
        }
        await writeIndexedValue("push-operations", remaining).catch(() => undefined);
      }

      async function sendTestPushNotification() {
        if (!pushIdentity?.token || Notification.permission !== "granted") {
          notificationMessage = "Enable rest notifications before sending a test.";
          render();
          return;
        }
        try {
          await pushApi("/api/push/test", { installationId: pushIdentity.installationId });
          pushIdentity = { ...pushIdentity, testedAt: isoNow() };
          await persistPushIdentity();
          notificationMessage = "Test sent. Lock the phone or switch apps to confirm delivery.";
        } catch (error) {
          notificationMessage = String(error?.message || "Test notification failed.");
        }
        render();
      }

      async function clearWorkoutSyncQueue() {
        await writeIndexedValue("sync-queue", []).catch(() => undefined);
        window.clearTimeout(syncFlushTimer);
        syncFlushTimer = 0;
      }

      async function ensureInstallationAuthorization() {
        if (pushIdentity?.token) return true;
        const result = await pushApi("/api/sync/authorize", {
          installationId: pushIdentity.installationId,
          deviceId: pushIdentity.deviceId
        });
        pushIdentity = { ...pushIdentity, token: result.token || "" };
        await persistPushIdentity();
        return Boolean(pushIdentity.token);
      }

      async function reconcileWorkoutSyncConsent() {
        if (data.settings.cloudWorkoutSyncConsent === true) return true;
        if (["deleting", "deleted"].includes(String(pushIdentity?.status || "")) || ["deleting", "deleted"].includes(String(pushIdentity?.deletion?.status || ""))) return true;
        if (!pushIdentity?.token || (pushIdentity.syncRevokedAt && !pushIdentity.syncRevocationPending)) return true;
        return setCloudWorkoutSyncConsent(false, { renderNow: false, reconcile: true });
      }

      function workoutSyncConsentIsCurrent(epoch = syncConsentEpoch) {
        return data.settings.cloudWorkoutSyncConsent === true && Number(epoch) === Number(syncConsentEpoch);
      }

      function trackWorkoutSyncOperation(operation) {
        activeWorkoutSyncOperations.add(operation);
        operation.finally(() => activeWorkoutSyncOperations.delete(operation)).catch(() => undefined);
        return operation;
      }

      function queueActiveWorkoutSync(expectedEpoch) {
        const epoch = Number(expectedEpoch ?? (typeof syncConsentEpoch === "number" ? syncConsentEpoch : 0));
        const consentIsCurrent = () => data.settings.cloudWorkoutSyncConsent === true && (typeof syncConsentEpoch !== "number" || Number(epoch) === Number(syncConsentEpoch));
        if (!consentIsCurrent()) return Promise.resolve(false);
        const operation = (async () => {
          if (!consentIsCurrent()) return false;
          const session = activeWorkoutSession() || (completedSummarySessionId ? data.sessions.find((item) => item.id === completedSummarySessionId) : null);
          if (!session || !consentIsCurrent()) return false;
          const index = dataEntityIndex();
          const exercises = (index.exerciseIndicesBySession.get(session.id) || []).map((exerciseIndex) => data.exercises[exerciseIndex]);
          const payload = {
            session,
            exercises,
            sets: exercises.flatMap((exercise) => (index.setIndicesByExercise.get(exercise.id) || []).map((setIndex) => data.sets[setIndex]))
          };
          if (!consentIsCurrent()) return false;
          let queue = [];
          try { queue = await readIndexedValue("sync-queue") || []; } catch { return false; }
          if (!consentIsCurrent()) return false;
          queue = queue.filter((item) => item.sessionId !== session.id);
          queue.push({ mutationId: id(), sessionId: session.id, revision: isoNow(), payload });
          if (!consentIsCurrent()) return false;
          try { await writeIndexedValue("sync-queue", queue); } catch { return false; }
          if (!consentIsCurrent()) return false;
          window.clearTimeout(syncFlushTimer);
          if (!consentIsCurrent()) return false;
          syncFlushTimer = window.setTimeout(() => {
            syncFlushTimer = 0;
            if (consentIsCurrent()) flushWorkoutSyncQueue(epoch);
          }, 900);
          if (!consentIsCurrent()) {
            window.clearTimeout(syncFlushTimer);
            syncFlushTimer = 0;
            return false;
          }
          return true;
        })();
        return typeof trackWorkoutSyncOperation === "function" ? trackWorkoutSyncOperation(operation) : operation;
      }

      function flushWorkoutSyncQueue(expectedEpoch) {
        const epoch = Number(expectedEpoch ?? (typeof syncConsentEpoch === "number" ? syncConsentEpoch : 0));
        const consentIsCurrent = () => data.settings.cloudWorkoutSyncConsent === true && (typeof syncConsentEpoch !== "number" || Number(epoch) === Number(syncConsentEpoch));
        if (!consentIsCurrent() || !navigator.onLine || !pushIdentity?.token) return Promise.resolve(false);
        const operation = (async () => {
          if (!consentIsCurrent()) return false;
          let queue = [];
          try { queue = await readIndexedValue("sync-queue") || []; } catch { return false; }
          if (!consentIsCurrent()) return false;
          const remaining = [];
          for (const mutation of queue) {
            if (!consentIsCurrent()) return false;
            const controller = typeof AbortController === "function" ? new AbortController() : null;
            if (controller && typeof activeWorkoutSyncAbortControllers !== "undefined") activeWorkoutSyncAbortControllers.add(controller);
            try {
              if (!consentIsCurrent()) {
                controller?.abort();
                return false;
              }
              await pushApi("/api/sync/workout", { installationId: pushIdentity.installationId, ...mutation }, { signal: controller?.signal });
              if (!consentIsCurrent()) return false;
            } catch (error) {
              if (!consentIsCurrent() || error?.name === "AbortError") return false;
              remaining.push(mutation);
            } finally {
              if (controller && typeof activeWorkoutSyncAbortControllers !== "undefined") activeWorkoutSyncAbortControllers.delete(controller);
            }
          }
          if (!consentIsCurrent()) return false;
          try { await writeIndexedValue("sync-queue", remaining); } catch { return false; }
          if (!consentIsCurrent()) return false;
          return true;
        })();
        return typeof trackWorkoutSyncOperation === "function" ? trackWorkoutSyncOperation(operation) : operation;
      }

      function setCloudWorkoutSyncConsent(consent, options = {}) {
        const requestedConsent = consent === true;
        syncConsentEpoch += 1;
        const epoch = syncConsentEpoch;
        window.clearTimeout(syncFlushTimer);
        syncFlushTimer = 0;
        activeWorkoutSyncAbortControllers.forEach((controller) => controller.abort());
        const commitConsent = (enabled) => commit({
          ...data,
          settings: {
            ...data.settings,
            cloudWorkoutSyncConsent: enabled,
            workoutCloudSync: enabled,
            workoutCloudSyncConsentVersion: enabled ? 1 : 0
          }
        }, options.renderNow !== false);
        if (!requestedConsent) commitConsent(false);
        const priorOperations = [...activeWorkoutSyncOperations];
        const transition = syncConsentTransition.catch(() => undefined).then(async () => {
          if (priorOperations.length) await Promise.allSettled(priorOperations);
          if (!requestedConsent) {
            try { await writeIndexedValue("app-data", data); }
            catch {
              settingsMessage = "Workout cloud copy is off in memory, but that choice could not be saved durably. Export a backup and retry before reloading.";
              if (options.renderNow !== false) render();
              return false;
            }
            try { await clearWorkoutSyncQueue(); }
            catch {
              settingsMessage = "Workout upload is off, but the pending upload queue could not be cleared. Keep the app open and try again before clearing local data.";
              if (options.renderNow !== false) render();
              return false;
            }
            if (!pushIdentity?.token) return true;
            if (!navigator.onLine) {
              pushIdentity = { ...pushIdentity, syncRevocationPending: true };
              await persistPushIdentity();
              settingsMessage = "Workout cloud copy is off on this device. Reconnect to finish deleting any retained server copy.";
              if (options.renderNow !== false) render();
              return false;
            }
            try {
              await pushApi("/api/sync/consent", { installationId: pushIdentity.installationId, enabled: false });
              pushIdentity = { ...pushIdentity, syncRevokedAt: isoNow(), syncRevocationPending: false };
              await persistPushIdentity();
              if (!options.reconcile) settingsMessage = "Workout cloud copy is off and retained workout copies were deleted.";
              if (options.renderNow !== false) render();
            } catch {
              pushIdentity = { ...pushIdentity, syncRevocationPending: true };
              await persistPushIdentity();
              settingsMessage = "Workout cloud copy is off locally, but server deletion is still pending. Reconnect and retry before clearing local data.";
              if (options.renderNow !== false) render();
              return false;
            }
            return true;
          }
          if (Number(epoch) !== Number(syncConsentEpoch)) return false;
          if (!navigator.onLine) {
            settingsMessage = "Connect to the internet to enable workout cloud copy.";
            if (options.renderNow !== false) render();
            return false;
          }
          try {
            await ensureInstallationAuthorization();
            if (Number(epoch) !== Number(syncConsentEpoch)) return false;
            await pushApi("/api/sync/consent", { installationId: pushIdentity.installationId, enabled: true });
          } catch (error) {
            commitConsent(false);
            settingsMessage = String(error?.message || "Workout cloud copy could not be enabled.");
            if (options.renderNow !== false) render();
            return false;
          }
          if (Number(epoch) !== Number(syncConsentEpoch)) return false;
          pushIdentity = { ...pushIdentity, syncRevokedAt: "", syncRevocationPending: false };
          await persistPushIdentity();
          commitConsent(true);
          try { await writeIndexedValue("app-data", data); }
          catch {
            commitConsent(false);
            settingsMessage = "Workout cloud copy consent could not be saved durably, so uploads remain off.";
            if (options.renderNow !== false) render();
            return false;
          }
          const queued = await queueActiveWorkoutSync(epoch);
          if (!workoutSyncConsentIsCurrent(epoch)) return false;
          settingsMessage = "Workout cloud copy is on. Active workout changes may now be uploaded.";
          if (options.renderNow !== false) render();
          return queued;
        });
        syncConsentTransition = transition.catch(() => false);
        return transition;
      }

      function restNavigationPayload(timerSnapshot, nextOverride = null) {
        const next = nextOverride || data.sets.find((set) => set.id === timerSnapshot?.pendingNextSetId) || null;
        return {
          navigationVersion: 1,
          timerId: timerSnapshot?.id || "",
          notificationId: timerSnapshot?.serverNotificationId || timerSnapshot?.id || "",
          timerVersion: Number(timerSnapshot?.version || 1),
          workoutId: timerSnapshot?.workoutId || activeWorkoutId || "",
          exerciseId: next?.exerciseId || timerSnapshot?.exerciseId || "",
          completedSetId: timerSnapshot?.setId || "",
          nextSetId: next?.id || "",
          endsAt: Number(timerSnapshot?.endsAt || 0)
        };
      }

      function restCompletionUrl(payload = {}) {
        const params = new URLSearchParams({
          rest: "complete",
          workoutId: payload.workoutId || "",
          exerciseId: payload.exerciseId || "",
          completedSetId: payload.completedSetId || "",
          nextSetId: payload.nextSetId || "",
          timerId: payload.timerId || "",
          notificationId: payload.notificationId || payload.timerId || "",
          timerVersion: String(payload.timerVersion || 1)
        });
        return "/?" + params.toString() + "#lift";
      }

      function setRestNavigationState(timerSnapshot, status, nextOverride = null) {
        restNavigationState = { ...restNavigationPayload(timerSnapshot, nextOverride), status, updatedAt: isoNow() };
        return restNavigationState;
      }

      function nextSetForRestPayload(payload) {
        const requested = data.sets.find((set) => set.id === payload?.nextSetId);
        const requestedExercise = requested && data.exercises.find((exercise) => exercise.id === requested.exerciseId);
        if (requested && requestedExercise?.sessionId === payload.workoutId && !requested.completed && !requested.skipped) return requested;
        const completed = data.sets.find((set) => set.id === payload?.completedSetId);
        if (completed) return nextIncompleteSet(completed.id);
        return orderedActiveSets().find((set) => !set.completed && !set.skipped) || null;
      }

      async function navigateToRestCompletion(payload = {}, options = {}) {
        const workout = data.sessions.find((session) => session.id === payload.workoutId);
        const stateMatches = restNavigationState && restNavigationState.timerId === payload.timerId && Number(restNavigationState.timerVersion || 1) === Number(payload.timerVersion || 1);
        if (!workout || isSessionSubmitted(workout) || workout.id !== activeWorkoutId || !sessionHasStarted(workout) || !stateMatches || restNavigationState.status === "canceled") {
          restCompletionController?.dismiss("stale_workout");
          timerCompleteNotice = null;
          saveRuntime();
          showAppToast("This workout is no longer active.");
          return false;
        }
        if (timer && timer.id === payload.timerId && Number(timer.version || 1) === Number(payload.timerVersion || 1) && Number(timer.endsAt || 0) <= Date.now()) {
          timer.remainingSeconds = 0;
          completeTimer({ suppressSystemAlert: true, suppressScroll: true });
        }
        const next = nextSetForRestPayload(payload);
        activeSessionId = workout.id;
        viewingHistorySessionId = "";
        pendingNextSetId = "";
        restCompletionController?.dismiss("navigated");
        timerCompleteNotice = null;
        if (next) setActiveSet(next.id, setExecutionLabel(next) + " is ready", false);
        else {
          activeSetId = "";
          activeSetNotice = "Workout sets complete";
          pendingSubmitSessionId = workout.id;
        }
        setActiveTab("lift", { replace: true, renderNow: false });
        saveRuntime();
        render();
        if (next && data.settings.autoScrollNextSet !== false) scheduleActiveSetScroll(next.id);
        if (!options.silent) showAppToast(next ? setExecutionLabel(next) + " is ready." : "All sets are complete.");
        return true;
      }

      function startTimer(exerciseId, setId, options = {}) {
        const authorization = guardWorkoutMutation("start-timer", { exerciseId, setId });
        if (!authorization.allowed) return false;
        const exercise = authorization.target.exercise;
        const set = authorization.target.set;
        const requestedNext = options.pendingNextSetId ? setById(options.pendingNextSetId) : null;
        const requestedNextExercise = requestedNext ? exerciseById(requestedNext.exerciseId) : null;
        if (options.pendingNextSetId && (!requestedNext || requestedNextExercise?.sessionId !== authorization.target.session.id)) return false;
        const previousTimer = timer ? { ...timer } : null;
        window.clearInterval(timerInterval);
        releaseTimerWakeLock();
        if (previousTimer) cancelRestPush(previousTimer, "replaced");
        const seconds = Number(options.seconds || exercise?.restSeconds || data.settings.defaultRestSeconds || 90);
        const next = requestedNext || (set?.completed || set?.skipped ? nextIncompleteSet(set.id) : set);
        restCompletionController?.dismiss("replaced_by_new_timer");
        timerCompleteNotice = null;
        measurePerformance("timer:primeAlerts", () => primeTimerAlerts());
        measurePerformance("timer:requestWakeLock", () => requestTimerWakeLock());
        pendingNextSetId = next?.id || "";
        if (pendingNextSetId) activeSetId = "";
        timer = {
          id: id(),
          version: Number(previousTimer?.version || 0) + 1,
          workoutId: activeWorkoutId || exercise?.sessionId || "",
          exerciseId: exercise.id,
          setId: set.id,
          pendingNextSetId,
          durationSeconds: seconds,
          remainingSeconds: seconds,
          endsAt: Date.now() + seconds * 1000,
          isActive: true,
          isPaused: false,
          notificationStatus: data.settings.timerNotifications ? "pending" : "disabled"
        };
        setRestNavigationState(timer, "active", next);
        startTimerInterval();
        measurePerformance("timer:saveRuntime", () => saveRuntime());
        if (options.deferRender) {
          measurePerformance("timer:updateDom", () => {
            const block = document.getElementById("set-" + setId);
            block?.classList.add("resting-set");
            if (block && !block.querySelector(".timer-bar")) block.insertAdjacentHTML("beforeend", renderTimer(setId));
            updateWorkoutStatusDom();
          });
        } else render();
        measurePerformance("timer:schedulePush", () => scheduleRestPush({ ...timer }));
      }

      function startTimerInterval() {
        window.clearInterval(timerInterval);
        timerInterval = window.setInterval(() => {
          if (!timer || timer.isPaused || !timer.isActive) return;
          timer.remainingSeconds = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
          if (timer.remainingSeconds === 0) {
            completeTimer();
            return;
          }
          updateTimerDisplay();
        }, 1000);
      }

      function updateTimerDisplay() {
        if (!timer) return;
        const selector = '.timer-bar[data-timer-id="' + CSS.escape(timer.id) + '"]';
        const bar = document.querySelector(selector);
        if (!bar) return;
        const countdown = bar.querySelector("[data-timer-countdown]");
        const progressLabel = bar.querySelector("[data-timer-progress-label]");
        const progress = bar.querySelector(".timer-progress");
        const elapsed = Math.max(0, timer.durationSeconds - timer.remainingSeconds);
        const percent = timer.durationSeconds > 0 ? Math.min(100, Math.round((elapsed / timer.durationSeconds) * 100)) : 100;
        if (countdown) countdown.textContent = formatTimer(timer.remainingSeconds);
        if (progressLabel) progressLabel.textContent = formatTimer(timer.remainingSeconds) + " remaining";
        if (progress) {
          progress.setAttribute("aria-valuenow", String(percent));
          progress.style.setProperty("--timer-progress", percent + "%");
        }
      }

      function toggleTimer() {
        if (!timer || timer.remainingSeconds === 0) return;
        timer.isPaused = !timer.isPaused;
        if (timer.isPaused) {
          timer.remainingSeconds = Math.max(1, Math.ceil((timer.endsAt - Date.now()) / 1000));
          cancelRestPush({ ...timer }, "paused");
          timer.notificationStatus = "paused";
          setRestNavigationState(timer, "paused");
          releaseTimerWakeLock();
        } else {
          primeTimerAlerts();
          requestTimerWakeLock();
          timer.id = id();
          timer.version = Number(timer.version || 1) + 1;
          timer.endsAt = Date.now() + timer.remainingSeconds * 1000;
          timer.notificationStatus = data.settings.timerNotifications ? "pending" : "disabled";
          startTimerInterval();
          scheduleRestPush({ ...timer });
          setRestNavigationState(timer, "active");
        }
        saveRuntime();
        syncTimerDom();
      }

      function adjustTimer(secondsDelta) {
        const interactionStartedAt = performanceNow();
        if (!timer || timer.isPaused) return;
        const previous = { ...timer };
        const remaining = Math.max(5, Math.ceil((timer.endsAt - Date.now()) / 1000) + Number(secondsDelta));
        cancelRestPush(previous, "adjusted");
        timer.id = id();
        timer.version = Number(timer.version || 1) + 1;
        timer.remainingSeconds = remaining;
        timer.durationSeconds = Math.max(timer.durationSeconds + Number(secondsDelta), remaining);
        timer.endsAt = Date.now() + remaining * 1000;
        timer.notificationStatus = data.settings.timerNotifications ? "pending" : "disabled";
        setRestNavigationState(timer, "active");
        saveRuntime();
        syncTimerDom();
        scheduleRestPush({ ...timer });
        recordPerformance("interaction:adjustTimer", interactionStartedAt, { secondsDelta });
      }

      function cancelTimer(reason = "canceled", advance = true) {
        if (!timer) return;
        const previous = { ...timer };
        window.clearInterval(timerInterval);
        timerInterval = 0;
        releaseTimerWakeLock();
        cancelRestPush(previous, reason);
        const next = setById(previous.pendingNextSetId);
        setRestNavigationState(previous, "canceled", next);
        timer = null;
        pendingNextSetId = "";
        if (advance && next && data.settings.autoHighlightNextSet !== false) {
          setActiveSet(next.id, reason === "skipped" ? "Rest skipped - " + setExecutionLabel(next) + " is ready" : setExecutionLabel(next) + " is ready", false);
          if (data.settings.autoScrollNextSet !== false) scheduleActiveSetScroll(next.id);
        } else {
          ensureActiveSet();
        }
        saveRuntime();
        removeTimerDom(previous);
        if (activeSetId) applyCurrentSetVisual(activeSetId, activeSetNotice || "Current set");
        else updateWorkoutStatusDom();
      }

      function completeTimer(options = {}) {
        if (!timer || timer.remainingSeconds > 0 || !timer.isActive) return;
        const completedTimer = { ...timer };
        window.clearInterval(timerInterval);
        timerInterval = 0;
        releaseTimerWakeLock();
        const exercise = data.exercises.find((item) => item.id === completedTimer.exerciseId);
        const next = data.sets.find((set) => set.id === completedTimer.pendingNextSetId) || nextIncompleteSet(completedTimer.setId);
        const nextExercise = next ? data.exercises.find((item) => item.id === next.exerciseId) : null;
        const readyText = next ? setExecutionLabel(next) + " is ready" : "Workout sets complete";
        pendingNextSetId = "";
        if (data.settings.autoHighlightNextSet !== false) setActiveSet(next?.id || "", readyText, false);
        else setActiveSet("", readyText, true);
        const navigation = setRestNavigationState(completedTimer, "completed", next);
        timer = null;
        const completionNotice = { title: "Rest complete", exerciseName: nextExercise?.name || exercise?.name || "Workout", setNumber: next?.setNumber || "", setLabel: next ? setExecutionLabel(next) : "", message: next ? readyText : "Time to finish the workout", payload: navigation };
        const systemSignalAlreadyDelivered = Boolean(options.systemSignalAlreadyDelivered || (completedTimer.backgroundedAt && completedTimer.endsAt <= Date.now() && completedTimer.notificationStatus === "scheduled"));
        if (restCompletionController) {
          restCompletionState = restCompletionController.complete(completedTimer, completionNotice, data.settings, {
            source: completedTimer.backgroundedAt ? "background" : "foreground",
            allowForegroundEffects: document.visibilityState === "visible" && !systemSignalAlreadyDelivered,
            requestSystemNotification: !options.suppressSystemAlert && completedTimer.notificationStatus !== "scheduled",
            systemSignalAlreadyDelivered
          });
          timerCompleteNotice = restCompletionState?.notice?.visible ? restCompletionState.notice : null;
        } else {
          timerCompleteNotice = data.settings.inAppRestAlerts !== false ? completionNotice : null;
          playTimerCompletionSound();
          if (data.settings.timerVibration && navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 450]);
          if (!options.suppressSystemAlert && completedTimer.notificationStatus !== "scheduled") sendRestTimerNotification(completionNotice, next?.id || "", nextExercise?.id || exercise?.id || "");
        }
        if (completedTimer.notificationStatus === "scheduled") cancelRestPush(completedTimer, "foreground-completed");
        saveRuntime();
        render();
        if (!options.suppressScroll && next && data.settings.autoScrollNextSet !== false) scheduleActiveSetScroll(next.id);
      }

      function scheduleActiveSetScroll(setId) {
        window.setTimeout(() => {
          const activeElement = document.activeElement;
          if (activeElement && /INPUT|TEXTAREA|SELECT/.test(activeElement.tagName)) return;
          const block = document.getElementById("set-" + setId);
          if (!block) return;
          const rect = block.getBoundingClientRect();
          if (rect.bottom > window.innerHeight - 110 || rect.top < 72) block.scrollIntoView({ behavior: preferredScrollBehavior(), block: "center" });
        }, 80);
      }

      function primeTimerAlerts(force = false) {
        if (!force && !data.settings.timerSound) return;
        restAudioSignal?.prime();
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (!AudioContextClass) return;
          if (!timerAudioContext) timerAudioContext = new AudioContextClass();
          if (timerAudioContext.state === "suspended") timerAudioContext.resume();
        } catch {
          timerAudioContext = null;
        }
      }

      function playTimerCompletionSound() {
        if (!data.settings.timerSound) return;
        if (restAudioSignal) {
          restAudioSignal.play({ settings: data.settings });
          return;
        }
        primeTimerAlerts(true);
        if (!timerAudioContext) return;
        try {
          const now = timerAudioContext.currentTime;
          [0, 0.22, 0.44].forEach((delay, index) => {
            const oscillator = timerAudioContext.createOscillator();
            const gain = timerAudioContext.createGain();
            oscillator.type = "sine";
            oscillator.frequency.value = index === 2 ? 1046 : 784;
            gain.gain.setValueAtTime(0.0001, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.24, now + delay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.17);
            oscillator.connect(gain);
            gain.connect(timerAudioContext.destination);
            oscillator.start(now + delay);
            oscillator.stop(now + delay + 0.18);
          });
        } catch {
          return;
        }
      }

      function playWorkoutCompletionSound(hasPr = false) {
        if (data.settings.workoutCompletionSound === false) return;
        primeTimerAlerts(true);
        if (!timerAudioContext) return;
        try {
          const now = timerAudioContext.currentTime;
          const notes = hasPr ? [523, 659, 784, 1046] : [523, 659, 784];
          notes.forEach((frequency, index) => {
            const delay = index * 0.13;
            const oscillator = timerAudioContext.createOscillator();
            const gain = timerAudioContext.createGain();
            oscillator.type = "sine";
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.16, now + delay + 0.018);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.16);
            oscillator.connect(gain);
            gain.connect(timerAudioContext.destination);
            oscillator.start(now + delay);
            oscillator.stop(now + delay + 0.17);
          });
        } catch {
          return;
        }
      }

      // WORKOUT_GRADING_ENGINE_START
      const WORKOUT_GRADE_THRESHOLDS = [
        { minimum: 97, grade: "A+" },
        { minimum: 93, grade: "A" },
        { minimum: 90, grade: "A-" },
        { minimum: 87, grade: "B+" },
        { minimum: 83, grade: "B" },
        { minimum: 80, grade: "B-" },
        { minimum: 77, grade: "C+" },
        { minimum: 73, grade: "C" },
        { minimum: 70, grade: "C-" },
        { minimum: 60, grade: "D" },
        { minimum: 0, grade: "F" }
      ];

      function workoutLetterGrade(score) {
        const value = Math.max(0, Math.min(100, Number(score || 0)));
        return WORKOUT_GRADE_THRESHOLDS.find((threshold) => value >= threshold.minimum)?.grade || "F";
      }

      function workoutGradeInterpretation(grade) {
        return ({
          "A+": "Exceptional session",
          "A": "Excellent session",
          "A-": "Very strong session",
          "B+": "Strong session",
          "B": "Good session",
          "B-": "Solid session with some improvement available",
          "C+": "Mixed but productive session",
          "C": "Acceptable session with clear limitations",
          "C-": "Below-plan execution",
          "D": "Poor session execution",
          "F": "Session failed to meet the minimum intended outcome"
        })[grade] || "Workout reviewed";
      }

      function workoutGradeScoreTone(score) {
        if (score >= 90) return "score-excellent";
        if (score >= 80) return "score-very-good";
        if (score >= 70) return "score-good";
        if (score >= 60) return "score-mixed";
        return "score-critical";
      }

      function clampWorkoutMetric(value, minimum = 0, maximum = 1) {
        return Math.max(minimum, Math.min(maximum, Number(value || 0)));
      }

      function averageWorkoutMetric(values, fallback = 0) {
        const clean = values.filter((value) => Number.isFinite(Number(value))).map(Number);
        return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : fallback;
      }

      function workoutSetPerformanceValue(set, resistanceType) {
        const load = resistanceLoad(set, resistanceType);
        if (["external", "bodyweight_plus_load"].includes(resistanceType)) return load > 0 ? load * (1 + Number(set.reps || 0) / 30) : Number(set.reps || 0);
        if (resistanceType === "assisted_bodyweight") return 10000 - load * 10 + Number(set.reps || 0);
        if (resistanceType === "duration") return Number(set.durationSeconds || set.reps || 0);
        if (resistanceType === "distance") return Number(set.distance || set.reps || 0);
        return Number(set.reps || 0);
      }

      function bestWorkoutSet(sets, resistanceType) {
        return [...sets].sort((left, right) => workoutSetPerformanceValue(right, resistanceType) - workoutSetPerformanceValue(left, resistanceType) || Number(left.rpe || 99) - Number(right.rpe || 99))[0] || null;
      }

      function sessionComesBefore(candidate, session) {
        if (String(candidate.date || "") !== String(session.date || "")) return String(candidate.date || "") < String(session.date || "");
        const candidateStamp = String(candidate.submittedAt || candidate.updatedAt || candidate.createdAt || "");
        const sessionStamp = String(session.submittedAt || session.updatedAt || session.createdAt || "");
        return candidateStamp < sessionStamp;
      }

      function priorComparableWorkoutSets(session, exercise, resistanceType) {
        const canonicalId = canonicalExerciseId(exercise.name);
        const priorSessionIds = new Set(activeHistorySessions({ throughDate: session.date }).filter((candidate) => candidate.id !== session.id && sessionComesBefore(candidate, session)).map((candidate) => candidate.id));
        const priorExerciseIds = new Set(data.exercises.filter((candidate) => priorSessionIds.has(candidate.sessionId) && !candidate.isDeload && canonicalExerciseId(candidate.name) === canonicalId && resistanceTypeFor(candidate) === resistanceType).map((candidate) => candidate.id));
        return data.sets.filter((set) => priorExerciseIds.has(set.exerciseId) && set.completed && isWorkingSet(set, "progression") && !set.skipped);
      }

      function compareWorkoutPerformance(currentSet, priorSet, resistanceType, repLow) {
        if (!currentSet) return { status: "incomplete", label: "No completed working set", change: "No completed working set was available for comparison." };
        if (!priorSet) return { status: "baseline", label: "Baseline established", change: "This is the first comparable submitted performance for this lift and resistance type." };
        const currentLoad = resistanceLoad(currentSet, resistanceType);
        const priorLoad = resistanceLoad(priorSet, resistanceType);
        const currentReps = Number(currentSet.reps || 0);
        const priorReps = Number(priorSet.reps || 0);
        const currentRpe = Number(currentSet.rpe || 0);
        const priorRpe = Number(priorSet.rpe || 0);
        const sameLoad = Math.abs(currentLoad - priorLoad) < 0.01;
        if (sameLoad && currentReps > priorReps) return { status: "progress", label: "Rep progression", change: "+" + (currentReps - priorReps) + " rep" + (currentReps - priorReps === 1 ? "" : "s") + " at the same resistance." };
        if (sameLoad && currentReps >= priorReps && currentRpe > 0 && priorRpe > 0 && currentRpe <= priorRpe - 0.5) return { status: "progress", label: "Improved efficiency", change: "Matched the prior load and reps at RPE " + currentRpe + " versus " + priorRpe + "." };
        if (resistanceType === "assisted_bodyweight" && currentLoad < priorLoad && currentReps >= repLow) return { status: "progress", label: "Assistance progression", change: formatLoadNumber(priorLoad - currentLoad) + " " + data.settings.weightUnit + " less assistance while staying in range." };
        if (!["bodyweight", "duration", "distance", "assisted_bodyweight"].includes(resistanceType) && currentLoad > priorLoad && currentReps >= repLow) return { status: "progress", label: "Load progression", change: "+" + formatLoadNumber(currentLoad - priorLoad) + " " + data.settings.weightUnit + " while remaining in the programmed rep range." };
        const currentValue = workoutSetPerformanceValue(currentSet, resistanceType);
        const priorValue = workoutSetPerformanceValue(priorSet, resistanceType);
        const changeRatio = priorValue > 0 ? (currentValue - priorValue) / priorValue : 0;
        if (changeRatio > 0.015) return { status: "progress", label: "Performance progression", change: "Estimated performance improved " + Math.round(changeRatio * 100) + "% versus the prior comparable best set." };
        if (changeRatio < -0.06) return { status: "regression", label: "Performance regression", change: "Estimated performance declined " + Math.abs(Math.round(changeRatio * 100)) + "% versus the prior comparable best set." };
        return { status: "stable", label: "Performance maintained", change: "Performance remained within 6% of the prior comparable best set." };
      }

      function workoutExerciseAnalysis(session, exercise, prs) {
        const allWorkingSets = setsForExercise(exercise.id).filter((set) => isWorkingSet(set, "score"));
        const completedSets = allWorkingSets.filter((set) => set.completed && !set.skipped);
        const resistanceType = resistanceTypeFor(exercise, completedSets[0]);
        const prescription = exercise.prescription || {};
        const profile = progressionProfileForExercise(exercise.name);
        const repLow = Number(prescription.repLow || profile.lowerRep || 1);
        const repHigh = Number(prescription.repHigh || profile.upperRep || Math.max(repLow, 20));
        const plannedSets = allWorkingSets.length;
        const rangeMatches = completedSets.filter((set) => Number(set.reps || 0) >= repLow && Number(set.reps || 0) <= repHigh).length;
        const targetRepSets = completedSets.filter((set) => Number(set.targetReps || 0) > 0);
        const targetRepMatches = targetRepSets.filter((set) => Number(set.reps || 0) >= Number(set.targetReps || 0) - 1 && Number(set.reps || 0) <= repHigh).length;
        const loadTargetSets = completedSets.filter((set) => Number(set.targetWeight ?? 0) > 0 || resistanceType === "bodyweight");
        const loadMatches = loadTargetSets.filter((set) => {
          if (resistanceType === "bodyweight") return true;
          const actual = resistanceLoad(set, resistanceType);
          const target = Number(set.targetWeight ?? prescription.weight ?? 0);
          const tolerance = Math.max(Number(prescription.increment || profile.increment || 0), target * 0.1);
          return target <= 0 || Math.abs(actual - target) <= tolerance;
        }).length;
        const loggedRpeSets = completedSets.filter((set) => Number(set.rpe || 0) > 0);
        const rpeMatches = loggedRpeSets.filter((set) => {
          const target = Number(set.targetRpe || prescription.rpe || 0);
          return target <= 0 || Math.abs(Number(set.rpe || 0) - target) <= 1;
        }).length;
        const firstSet = completedSets[0] || null;
        const lastSet = completedSets[completedSets.length - 1] || null;
        const comparableSetLoads = firstSet && lastSet ? Math.abs(resistanceLoad(firstSet, resistanceType) - resistanceLoad(lastSet, resistanceType)) <= Math.max(0.01, resistanceLoad(firstSet, resistanceType) * 0.03) : false;
        const repDropRatio = comparableSetLoads && Number(firstSet.reps || 0) > 0 ? Math.max(0, (Number(firstSet.reps) - Number(lastSet.reps || 0)) / Number(firstSet.reps)) : 0;
        const rpeRise = firstSet && lastSet && Number(firstSet.rpe || 0) > 0 && Number(lastSet.rpe || 0) > 0 ? Number(lastSet.rpe) - Number(firstSet.rpe) : 0;
        const bestSet = bestWorkoutSet(completedSets, resistanceType);
        const priorBestSet = bestWorkoutSet(priorComparableWorkoutSets(session, exercise, resistanceType), resistanceType);
        const comparison = compareWorkoutPerformance(bestSet, priorBestSet, resistanceType, repLow);
        const planRatios = [
          completedSets.length ? rangeMatches / completedSets.length : 0,
          targetRepSets.length ? targetRepMatches / targetRepSets.length : 0.9,
          loadTargetSets.length ? loadMatches / loadTargetSets.length : 0.9
        ];
        const planExecutionRatio = averageWorkoutMetric(planRatios, 0);
        const adjustment = (session.readinessAdjustments || []).find((item) => item.exerciseId === exercise.id || canonicalExerciseId(item.name) === canonicalExerciseId(exercise.name));
        const isReadinessAdjusted = Boolean(adjustment?.changed || prescription.adjusted);
        const isDeload = Boolean(exercise.isDeload || prescription.isDeload || prescription.mode === "deload");
        const intentional = isReadinessAdjusted || isDeload || ["light", "technique", "return", "return-from-deload"].includes(prescription.mode);
        const statusRatio = intentional && planExecutionRatio >= 0.8 ? 0.95 : ({ progress: 1, stable: 0.9, baseline: 0.82, regression: 0.55, incomplete: 0.25 })[comparison.status] || 0.7;
        const exercisePrs = prs.filter((pr) => canonicalExerciseId(pr.exercise) === canonicalExerciseId(exercise.name));
        const readinessTarget = adjustment?.adjusted || prescription;
        const averageRpe = averageWorkoutMetric(loggedRpeSets.map((set) => Number(set.rpe)), 0);
        const targetRpe = averageWorkoutMetric(completedSets.map((set) => Number(set.targetRpe || readinessTarget?.rpe || 0)).filter(Boolean), Number(readinessTarget?.rpe || 0));
        const fatigueWarning = repDropRatio > 0.3 && rpeRise >= 1
          ? "Reps fell " + Math.round(repDropRatio * 100) + "% while RPE rose " + formatLoadNumber(rpeRise) + " points across comparable working sets."
          : "";
        return {
          exerciseId: exercise.id,
          name: exercise.name,
          resistanceType,
          isDeload,
          isReadinessAdjusted,
          intent: isDeload ? "Planned deload" : isReadinessAdjusted ? "Readiness-adjusted target" : prescription.mode ? prescription.mode.replaceAll("-", " ") : "Programmed work",
          plannedSets,
          completedSets: completedSets.length,
          skippedSets: allWorkingSets.filter((set) => set.skipped).length,
          repLow,
          repHigh,
          rangeCompliance: completedSets.length ? rangeMatches / completedSets.length : 0,
          targetRepCompliance: targetRepSets.length ? targetRepMatches / targetRepSets.length : 0.9,
          loadCompliance: loadTargetSets.length ? loadMatches / loadTargetSets.length : 0.9,
          rpeLoggedRatio: completedSets.length ? loggedRpeSets.length / completedSets.length : 0,
          rpeCompliance: loggedRpeSets.length ? rpeMatches / loggedRpeSets.length : 0,
          averageRpe,
          targetRpe,
          repDropRatio,
          rpeRise,
          fatigueWarning,
          planExecutionRatio,
          progressionRatio: statusRatio,
          comparison,
          bestSet: bestSet ? { id: bestSet.id, text: formatSetPerformance(bestSet, exercise), reps: Number(bestSet.reps || 0), load: resistanceLoad(bestSet, resistanceType), rpe: Number(bestSet.rpe || 0) } : null,
          priorBestSet: priorBestSet ? { text: formatSetPerformance(priorBestSet, exercise), reps: Number(priorBestSet.reps || 0), load: resistanceLoad(priorBestSet, resistanceType), rpe: Number(priorBestSet.rpe || 0) } : null,
          prs: exercisePrs,
          readinessAdjustment: isReadinessAdjusted ? { original: adjustment?.original || exercise.originalPrescription || null, adjusted: adjustment?.adjusted || prescription, reason: adjustment?.reason || exercise.adjustmentReason || prescription.adjustmentReason || "Readiness-adjusted target was used.", triggers: adjustment?.triggers || prescription.triggerLabels || [] } : null
        };
      }

      function workoutSessionIntent(session, exerciseResults) {
        if (exerciseResults.length && exerciseResults.every((result) => result.isDeload)) return "Planned deload";
        if (exerciseResults.some((result) => result.isReadinessAdjusted)) return "Readiness-adjusted training";
        const template = data.templates.find((item) => item.id === session.templateId) || { name: session.title || "" };
        const type = sessionTypeForTemplate(template);
        return ({ heavy: "Heavy training", light: "Light training", technique: "Technique-focused training", deload: "Planned deload", normal: "Standard hypertrophy training" })[type] || "Standard hypertrophy training";
      }

      function scoreWorkoutGradeMetrics(metrics) {
        const {
          results, progressionRatio, programRatio, completedSets, plannedSets, loggedRpeCount,
          rpeComplianceWeighted, rpeLoggedRatio, completionRatio, stabilityRatio, adjustedResults,
          intentAdherence, severeFatigueSignals
        } = metrics;
        const progressedCount = results.filter((result) => result.comparison.status === "progress").length;
        const regressedCount = results.filter((result) => result.comparison.status === "regression").length;
        const categoryScores = [
          { key: "progression", label: "Progression quality", earned: Math.round(30 * clampWorkoutMetric(progressionRatio)), possible: 30, reason: progressedCount + " exercise" + (progressedCount === 1 ? "" : "s") + " progressed; " + regressedCount + " regressed versus prior comparable work." },
          { key: "execution", label: "Program execution", earned: Math.round(25 * clampWorkoutMetric(programRatio)), possible: 25, reason: Math.round(averageWorkoutMetric(results.map((result) => result.rangeCompliance), 0) * 100) + "% of completed working sets stayed inside their programmed rep ranges; prescribed load and rep targets were assessed separately." },
          { key: "rpe", label: "RPE management", earned: Math.round(20 * clampWorkoutMetric(rpeComplianceWeighted * rpeLoggedRatio + 0.65 * (1 - rpeLoggedRatio))), possible: 20, reason: loggedRpeCount + " of " + completedSets + " completed working sets included RPE; " + Math.round(rpeComplianceWeighted * 100) + "% of logged RPE values were within one point of target." },
          { key: "completion", label: "Set completion and consistency", earned: Math.round(15 * clampWorkoutMetric(completionRatio * 0.8 + stabilityRatio * 0.2)), possible: 15, reason: completedSets + " of " + plannedSets + " prescribed working sets were completed; set-to-set stability contributed only within this category." },
          { key: "fatigue", label: "Fatigue management", earned: Math.round(10 * clampWorkoutMetric(intentAdherence - severeFatigueSignals * 0.12)), possible: 10, reason: adjustedResults.length ? Math.round(intentAdherence * 100) + "% adherence to readiness or deload intent; " + severeFatigueSignals + " severe fatigue pattern" + (severeFatigueSignals === 1 ? "" : "s") + " detected." : severeFatigueSignals ? severeFatigueSignals + " severe rep-loss-plus-RPE-rise pattern" + (severeFatigueSignals === 1 ? " was" : "s were") + " detected." : "No readiness, deload, or severe within-session fatigue rule was violated." }
        ];
        const internalScore = Math.max(0, Math.min(100, categoryScores.reduce((sum, category) => sum + category.earned, 0)));
        return { categoryScores, internalScore, grade: workoutLetterGrade(internalScore) };
      }

      function calculateWorkoutAnalysis(session, options = {}) {
        const prs = options.prs || session.prs || [];
        const exercises = data.exercises.filter((exercise) => exercise.sessionId === session.id).sort((left, right) => left.order - right.order);
        const results = exercises.map((exercise) => workoutExerciseAnalysis(session, exercise, prs));
        const plannedSets = results.reduce((sum, result) => sum + result.plannedSets, 0);
        const completedSets = results.reduce((sum, result) => sum + result.completedSets, 0);
        if (!plannedSets && !completedSets) return null;
        const completionRatio = plannedSets ? completedSets / plannedSets : 0;
        const progressionRatio = averageWorkoutMetric(results.map((result) => result.progressionRatio), 0);
        const programRatio = averageWorkoutMetric(results.map((result) => result.planExecutionRatio), 0);
        const loggedRpeCount = results.reduce((sum, result) => sum + Math.round(result.rpeLoggedRatio * result.completedSets), 0);
        const rpeComplianceWeighted = completedSets ? results.reduce((sum, result) => sum + result.rpeCompliance * Math.round(result.rpeLoggedRatio * result.completedSets), 0) / Math.max(1, loggedRpeCount) : 0;
        const rpeLoggedRatio = completedSets ? loggedRpeCount / completedSets : 0;
        const stabilityRatio = averageWorkoutMetric(results.map((result) => result.repDropRatio <= 0.15 ? 1 : result.repDropRatio <= 0.25 ? 0.8 : result.repDropRatio <= 0.4 ? 0.55 : 0.3), 1);
        const adjustedResults = results.filter((result) => result.isReadinessAdjusted || result.isDeload);
        const intentAdherence = adjustedResults.length ? averageWorkoutMetric(adjustedResults.map((result) => {
          const rpeOk = !result.targetRpe || !result.averageRpe || result.averageRpe <= result.targetRpe + 1;
          return result.planExecutionRatio >= 0.8 && rpeOk ? 1 : result.planExecutionRatio >= 0.65 ? 0.7 : 0.35;
        }), 1) : 1;
        const severeFatigueSignals = results.filter((result) => result.fatigueWarning).length;
        const scored = scoreWorkoutGradeMetrics({ results, progressionRatio, programRatio, completedSets, plannedSets, loggedRpeCount, rpeComplianceWeighted, rpeLoggedRatio, completionRatio, stabilityRatio, adjustedResults, intentAdherence, severeFatigueSignals });
        const { categoryScores, internalScore, grade } = scored;
        const progressResults = results.filter((result) => result.comparison.status === "progress");
        const regressionResults = results.filter((result) => result.comparison.status === "regression");
        const highlights = [];
        const highlightedExercises = new Set();
        results.forEach((result) => {
          const preferredPr = [...result.prs].sort((left, right) => /estimated/i.test(right.type) - /estimated/i.test(left.type) || /load/i.test(right.type) - /load/i.test(left.type))[0];
          if (preferredPr && !highlightedExercises.has(result.exerciseId)) {
            highlights.push({ type: "pr", exerciseId: result.exerciseId, title: result.name + " - " + preferredPr.type, detail: preferredPr.value + (result.priorBestSet ? ". Previous comparable best: " + result.priorBestSet.text + "." : ". First comparable submitted benchmark.") });
            highlightedExercises.add(result.exerciseId);
          } else if (result.comparison.status === "progress") {
            highlights.push({ type: "progress", exerciseId: result.exerciseId, title: result.name + " - " + result.comparison.label, detail: (result.bestSet?.text || "Completed work") + ". " + result.comparison.change });
            highlightedExercises.add(result.exerciseId);
          }
        });
        if (completionRatio === 1) highlights.push({ type: "execution", title: "Every prescribed working set completed", detail: completedSets + " of " + plannedSets + " working sets were completed; warm-up sets were excluded." });
        const averageRangeCompliance = averageWorkoutMetric(results.map((result) => result.rangeCompliance), 0);
        if (completedSets && averageRangeCompliance >= 0.98) highlights.push({ type: "execution", title: "Rep ranges executed cleanly", detail: "All completed working sets stayed inside their exercise-specific programmed ranges." });
        if (loggedRpeCount === completedSets && rpeComplianceWeighted >= 0.95) highlights.push({ type: "effort", title: "Effort stayed on target", detail: "All " + loggedRpeCount + " logged working-set RPE values stayed within one point of their prescribed targets." });
        if (adjustedResults.length && intentAdherence >= 0.9) highlights.push({ type: "readiness", title: "Readiness plan executed well", detail: adjustedResults.length + " adjusted exercise" + (adjustedResults.length === 1 ? " was" : "s were") + " completed against today's targets instead of being penalized against the original plan." });
        if (results.length && results.every((result) => result.isDeload) && intentAdherence >= 0.9) highlights.push({ type: "deload", title: "Deload intent protected", detail: "Reduced loading and effort were treated as successful recovery work, not performance regression." });
        const improvements = [];
        if (completionRatio < 0.9) improvements.push({ key: "completion", title: "Complete more of the prescribed work", metric: completedSets + " of " + plannedSets + " working sets completed", expected: "At least 90% completion", detail: "Skipped or unfinished work reduced the intended stimulus. Next time, reduce optional work first or adjust the plan before starting rather than leaving prescribed sets incomplete." });
        if (averageRangeCompliance < 0.85) improvements.push({ key: "rep-range", title: "Keep working sets inside their rep ranges", metric: Math.round(averageRangeCompliance * 100) + "% in range", expected: "At least 85% in range", detail: "Repeated misses make load progression less comparable. Use a load that keeps the majority of sets inside the programmed range." });
        if (rpeLoggedRatio < 0.5) improvements.push({ key: "rpe-logging", title: "Log enough RPE data to judge effort", metric: loggedRpeCount + " of " + completedSets + " working sets logged", expected: "RPE on at least half of working sets", detail: "Missing effort data lowers confidence. Log RPE on the first and final working set at minimum." });
        else if (rpeComplianceWeighted < 0.75) improvements.push({ key: "rpe", title: "Bring effort closer to target", metric: Math.round(rpeComplianceWeighted * 100) + "% of logged sets within target", expected: "At least 75% within one RPE point", detail: "Repeated overshooting adds fatigue, while undershooting may reduce stimulus. Adjust load or reps before the next set when effort moves outside the target band." });
        const worstDrop = [...results].sort((left, right) => right.repDropRatio - left.repDropRatio)[0];
        if (worstDrop?.repDropRatio > 0.25) improvements.push({ key: "consistency", exerciseId: worstDrop.exerciseId, title: "Reduce late-set rep loss on " + worstDrop.name, metric: Math.round(worstDrop.repDropRatio * 100) + "% rep drop across comparable sets", expected: "No more than 25% drop", detail: "A large decline can indicate insufficient rest or an overly aggressive first set. Add rest time or leave one more rep in reserve early." });
        regressionResults.slice(0, 2).forEach((result) => improvements.push({ key: "progression", exerciseId: result.exerciseId, title: "Review " + result.name + " regression evidence", metric: result.comparison.change, expected: "Maintain or improve comparable performance", detail: "This result is added to the next unified prescription calculation. Use that versioned prescription—not this retrospective grade—for the next load, reps, volume, deload, or rotation decision." }));
        if (adjustedResults.length && intentAdherence < 0.75) improvements.push({ key: "readiness", title: "Follow the readiness-adjusted target", metric: Math.round(intentAdherence * 100) + "% adjusted-plan adherence", expected: "At least 75% adherence", detail: "The reduced prescription was chosen from today's recorded recovery markers. Following the adjusted load, sets, and RPE protects training quality without grading the session against the original target." });
        const uniqueImprovements = improvements.filter((item, index, all) => all.findIndex((other) => other.key === item.key && other.exerciseId === item.exerciseId) === index).slice(0, 4);
        const strengthParts = [];
        if (completionRatio >= 0.9) strengthParts.push("completed " + completedSets + " of " + plannedSets + " prescribed working sets");
        if (progressResults.length) strengthParts.push("improved on " + progressResults.length + " exercise" + (progressResults.length === 1 ? "" : "s"));
        if (averageRangeCompliance >= 0.85) strengthParts.push("kept " + Math.round(averageRangeCompliance * 100) + "% of completed sets in range");
        if (adjustedResults.length && intentAdherence >= 0.8) strengthParts.push("executed the readiness-adjusted plan as intended");
        const rationaleLead = strengthParts.length ? "You " + strengthParts.slice(0, 3).join(", ") + "." : "The session fell short of several prescribed execution targets.";
        const rationaleLimit = uniqueImprovements.length ? " The grade was limited most by " + uniqueImprovements[0].title.toLowerCase() + " (" + uniqueImprovements[0].metric + ")." : " No major execution issue was identified in the submitted data.";
        const confidence = completedSets >= 8 && rpeLoggedRatio >= 0.75 && results.filter((result) => result.priorBestSet).length >= Math.min(2, results.length) ? "high" : completedSets >= 3 ? "moderate" : "low";
        return {
          version: 1,
          calculatedAt: isoNow(),
          grade,
          internalScore,
          interpretation: workoutGradeInterpretation(grade),
          rationale: rationaleLead + rationaleLimit,
          intent: workoutSessionIntent(session, results),
          categoryScores,
          highlights: highlights.slice(0, 6),
          improvements: uniqueImprovements,
          exerciseResults: results,
          prs,
          readinessContext: { mode: session.readinessMode || "usual", recovery: sessionRecovery(session), adjustments: results.filter((result) => result.isReadinessAdjusted).length, adherence: intentAdherence },
          deloadContext: { isDeload: results.length > 0 && results.every((result) => result.isDeload), deloadExercises: results.filter((result) => result.isDeload).map((result) => result.name) },
          confidence,
          metrics: { plannedSets, completedSets, completionRatio, averageRangeCompliance, rpeLoggedRatio, rpeCompliance: rpeComplianceWeighted, progressedExercises: progressResults.length, regressedExercises: regressionResults.length, severeFatigueSignals }
        };
      }

      function workoutAnalysisForSession(session) {
        return session?.workoutAnalysis?.version === 1 ? session.workoutAnalysis : calculateWorkoutAnalysis(session, { prs: session?.prs || [] });
      }
      // WORKOUT_GRADING_ENGINE_END

      async function requestRestNotificationPermission() {
        if (!("Notification" in window)) {
          notificationMessage = "Lock-screen notifications are not available in this browser.";
          render();
          return;
        }
        if (Notification.permission === "denied") {
          notificationMessage = "Notifications are blocked. On iPhone, open Settings > Notifications > Comprehensive Fitness and enable Allow Notifications, Sounds, and Lock Screen.";
          render();
          return;
        }
        if (Notification.permission === "granted") {
          notificationMessage = "Lock-screen rest alerts are enabled.";
          render();
          return;
        }
        try {
          const permission = await Notification.requestPermission();
          notificationMessage = permission === "granted"
            ? "Lock-screen rest alerts are enabled."
            : "Notifications were not enabled. The app will not ask again automatically; use iPhone Settings > Notifications > Comprehensive Fitness if you change your mind.";
        } catch {
          notificationMessage = "Notification permission could not be requested. Install the app to your iPhone Home Screen, then try again.";
        }
        render();
      }

      async function sendRestTimerNotification(notice, setId, exerciseId) {
        if (!data.settings.timerNotifications || !("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
        try {
          const registration = await navigator.serviceWorker.ready;
          const payload = notice.payload || restNavigationState || {};
          const url = restCompletionUrl(payload);
          await registration.showNotification("Rest complete", {
            body: data.settings.notificationMessageDetail === "private" ? "Your next set is ready." : notice.exerciseName + (notice.setLabel ? " - " + notice.setLabel : notice.setNumber ? " - Set " + notice.setNumber : "") + " is ready.",
            tag: "comprehensive-fitness-rest-timer",
            renotify: true,
            requireInteraction: true,
            icon: "/resources/icon-192.png",
            badge: "/resources/icon-192.png",
            data: { ...payload, url },
            vibrate: data.settings.timerVibration ? [250, 120, 250, 120, 450] : []
          });
        } catch {
          notificationMessage = "The in-app timer alert fired, but the operating system notification could not be delivered.";
        }
      }

      async function requestTimerWakeLock() {
        if (!navigator.wakeLock?.request || document.visibilityState !== "visible") return;
        try {
          if (!timerWakeLock || timerWakeLock.released) timerWakeLock = await navigator.wakeLock.request("screen");
        } catch {
          timerWakeLock = null;
        }
      }

      function releaseTimerWakeLock() {
        if (!timerWakeLock) return;
        timerWakeLock.release().catch(() => undefined);
        timerWakeLock = null;
      }

      function formatTimer(seconds) {
        const minutes = Math.floor(seconds / 60);
        return minutes + ":" + String(seconds % 60).padStart(2, "0");
      }

      function submitWorkoutPrs(session) {
        const sessionExercises = data.exercises.filter((exercise) => exercise.sessionId === session.id);
        const priorSessionIds = new Set(activeHistorySessions({ throughDate: session.date }).filter((item) => item.id !== session.id).map((item) => item.id));
        const prs = [];
        sessionExercises.forEach((exercise) => {
          const resistanceType = resistanceTypeFor(exercise);
          const currentSets = setsForExercise(exercise.id).filter((set) => set.completed && isWorkingSet(set, "pr") && set.reps > 0);
          if (!currentSets.length) return;
          const priorSets = data.sets.filter((set) => {
            const priorExercise = data.exercises.find((item) => item.id === set.exerciseId);
            return set.completed && isWorkingSet(set, "pr") && priorExercise && priorSessionIds.has(priorExercise.sessionId) && exerciseMatches(priorExercise.name, exercise.name) && resistanceTypeFor(priorExercise, set) === resistanceType;
          });
          if (["external", "bodyweight_plus_load"].includes(resistanceType)) {
            const maxWeight = Math.max(...currentSets.map((set) => resistanceLoad(set, resistanceType)));
            const previousMaxWeight = Math.max(0, ...priorSets.map((set) => resistanceLoad(set, resistanceType)));
            if (maxWeight > previousMaxWeight && maxWeight > 0) prs.push({ exercise: exercise.name, type: resistanceType === "bodyweight_plus_load" ? "Heaviest added load" : "Heaviest load", value: formatResistance({ ...currentSets.find((set) => resistanceLoad(set, resistanceType) === maxWeight), resistanceType }, exercise) });
            currentSets.forEach((set) => {
              const load = resistanceLoad(set, resistanceType);
              const previousRepsAtLoad = Math.max(0, ...priorSets.filter((prior) => resistanceLoad(prior, resistanceType) === load).map((prior) => prior.reps));
              if (load > 0 && set.reps > previousRepsAtLoad) prs.push({ exercise: exercise.name, type: resistanceType === "bodyweight_plus_load" ? "Most reps at added load" : "Most reps at load", value: formatSetPerformance(set, exercise) });
            });
          } else if (resistanceType === "assisted_bodyweight") {
            const currentAssistance = Math.min(...currentSets.map((set) => resistanceLoad(set, resistanceType)).filter((value) => value > 0));
            const previousAssistance = Math.min(...priorSets.map((set) => resistanceLoad(set, resistanceType)).filter((value) => value > 0));
            if (Number.isFinite(currentAssistance) && (!Number.isFinite(previousAssistance) || currentAssistance < previousAssistance)) prs.push({ exercise: exercise.name, type: "Least assistance", value: "BW - " + currentAssistance + " " + data.settings.weightUnit + " assistance" });
          } else {
            const currentBest = Math.max(...currentSets.map((set) => resistanceType === "duration" ? set.durationSeconds : resistanceType === "distance" ? set.distance : set.reps));
            const previousBest = Math.max(0, ...priorSets.map((set) => resistanceType === "duration" ? set.durationSeconds : resistanceType === "distance" ? set.distance : set.reps));
            if (currentBest > previousBest) prs.push({ exercise: exercise.name, type: resistanceType === "duration" ? "Longest duration" : resistanceType === "distance" ? "Longest distance" : "Most reps", value: formatResistance(currentSets.find((set) => (resistanceType === "duration" ? set.durationSeconds : resistanceType === "distance" ? set.distance : set.reps) === currentBest), exercise) });
          }
          if (resistanceType === "external") {
            const currentE1rm = Math.max(...currentSets.map(estimatedOneRepMax));
            const previousE1rm = Math.max(0, ...priorSets.map(estimatedOneRepMax));
            if (currentE1rm > previousE1rm && currentE1rm > 0) prs.push({ exercise: exercise.name, type: "Best estimated performance", value: currentE1rm.toFixed(1) + " e1RM" });
          }
        });
        return prs.filter((pr, index, all) => all.findIndex((other) => other.exercise === pr.exercise && other.type === pr.type) === index);
      }

      function evaluateWorkoutOverrideOutcomes(session, workoutAnalysis) {
        const results = workoutAnalysis?.exerciseResults || [];
        const evaluatedByRecommendation = new Map();
        const exercises = data.exercises.map((exercise) => {
          if (exercise.sessionId !== session.id || !exercise.recommendationSnapshot?.manualOverrides?.length || !prescriptionEngine) return exercise;
          const result = results.find((item) => item.exerciseId === exercise.id || canonicalExerciseId(item.name) === canonicalExerciseId(exercise.name));
          const outcome = {
            completed: Boolean(result && result.completedSets >= Math.max(1, result.plannedSets * 0.8)),
            adherence: Number(result?.planExecutionRatio || 0),
            progressed: result?.comparison?.status === "progress",
            progressionPercent: result?.comparison?.status === "progress" ? 2 : result?.comparison?.status === "regression" ? -2 : 0,
            recoveryCost: result?.fatigueWarning ? 75 : 30,
            pain: false,
            completedAt: isoNow()
          };
          try {
            const evaluated = prescriptionEngine.evaluateOverride(exercise.recommendationSnapshot, outcome);
            evaluatedByRecommendation.set(evaluated.recommendationId, evaluated);
            return { ...exercise, recommendationSnapshot: evaluated, finalPrescription: evaluated.finalPrescription, manualOverrides: evaluated.manualOverrides };
          } catch {
            return exercise;
          }
        });
        const recommendationHistory = data.recommendationHistory.map((snapshot) => evaluatedByRecommendation.get(snapshot.recommendationId) || snapshot);
        const manualOverrides = data.manualOverrides.map((entry) => {
          const evaluated = evaluatedByRecommendation.get(entry.recommendationId);
          const matching = evaluated?.manualOverrides?.find((item) => item.overrideId === entry.overrideId);
          if (matching?.outcomeEvaluation) return { ...entry, outcome: matching.outcome, outcomeEvaluation: matching.outcomeEvaluation };
          if (entry.sessionId === session.id && !entry.outcomeEvaluation) {
            const result = results.find((item) => item.exerciseId === entry.exerciseRuntimeId);
            return { ...entry, outcomeEvaluation: { result: result?.comparison?.status === "progress" ? "override_outperformed_or_supported" : result?.comparison?.status === "regression" ? "engine_recommendation_likely_preferred" : "inconclusive", evaluatedAt: isoNow(), explanation: "Evaluated from the completed workout; comparable confirmation is still required before this becomes strong personal evidence." } };
          }
          return entry;
        });
        return { exercises, recommendationHistory, manualOverrides, evaluatedByRecommendation };
      }

      function workoutSubmissionIsAccepted(sessionId) {
        const session = data.sessions.find((item) => item.id === sessionId);
        return Boolean(session && !session.submitted && !workoutSubmissionsInProgress.has(sessionId));
      }

      function submitWorkout(sessionId) {
        if (!workoutSubmissionIsAccepted(sessionId)) return;
        const session = data.sessions.find((item) => item.id === sessionId);
        workoutSubmissionsInProgress.add(sessionId);
        try {
          if (timer) cancelTimer("workout-ended", false);
          timerCompleteNotice = null;
          if (restNavigationState?.workoutId === sessionId) restNavigationState = { ...restNavigationState, status: "submitted", updatedAt: isoNow() };
          const prs = submitWorkoutPrs(session);
          const submittedAt = isoNow();
          const completedSession = { ...session, submitted: true, workoutStarted: false, workoutState: "completed", completedAt: session.date, submittedAt, prs, updatedAt: submittedAt };
          const workoutAnalysis = calculateWorkoutAnalysis(completedSession, { prs });
          const overrideOutcomes = evaluateWorkoutOverrideOutcomes(completedSession, workoutAnalysis);
          if (completedSession.workoutPrescription?.recommendations?.length) completedSession.workoutPrescription = { ...completedSession.workoutPrescription, recommendations: completedSession.workoutPrescription.recommendations.map((snapshot) => overrideOutcomes.evaluatedByRecommendation.get(snapshot.recommendationId) || snapshot) };
          pendingSubmitSessionId = "";
          completedSummarySessionId = session.id;
          if (activeWorkoutId === session.id) {
            activeWorkoutId = "";
            clearActiveWorkoutDraft();
          }
          commit({ ...data, sessions: data.sessions.map((item) => item.id === session.id ? { ...completedSession, workoutAnalysis } : item), exercises: overrideOutcomes.exercises, recommendationHistory: overrideOutcomes.recommendationHistory, manualOverrides: overrideOutcomes.manualOverrides });
          playWorkoutCompletionSound(prs.length > 0 || ["A+", "A"].includes(workoutAnalysis?.grade));
          if (["A+", "A", "A-"].includes(workoutAnalysis?.grade) || prs.length > 1) performInteractionFeedback("success");
        } finally {
          workoutSubmissionsInProgress.delete(sessionId);
        }
      }

      function renderSubmitConfirmation(session) {
        const completed = data.sets.filter((set) => {
          const exercise = data.exercises.find((item) => item.id === set.exerciseId);
          return exercise?.sessionId === session.id && set.completed && isWorkingSet(set, "score");
        }).length;
        return '<section class="submit-confirmation"><strong>Log this workout as completed?</strong><span>' + completed + ' completed working sets will update history, charts, volume, and PRs.</span><div class="row"><button class="primary-action" type="button" data-action="confirm-submit-workout">Log workout</button><button type="button" data-action="cancel-submit-workout">Keep editing</button></div></section>';
      }

      function renderWorkoutExerciseResult(result) {
        const readiness = result.readinessAdjustment;
        const readinessDetail = readiness
          ? '<div><span>Readiness adjustment</span><strong>Original: ' + escapeHtml(readablePrescriptionLine(readiness.original || {})) + '</strong><p>Today: ' + escapeHtml(readablePrescriptionLine(readiness.adjusted || {})) + '. ' + escapeHtml(readiness.reason) + '</p></div>'
          : '';
        const prDetail = result.prs?.length ? '<div><span>Personal records</span><strong>' + result.prs.map((pr) => escapeHtml(pr.type + ': ' + pr.value)).join('<br>') + '</strong></div>' : '';
        return '<details class="workout-exercise-result"><summary><strong>' + escapeHtml(result.name) + '</strong><span>' + result.completedSets + '/' + result.plannedSets + ' working sets - ' + escapeHtml(result.intent) + '</span><b>' + escapeHtml(result.comparison.label) + ' &rsaquo;</b></summary><div class="workout-exercise-detail">'
          + '<div><span>Best set</span><strong>' + escapeHtml(result.bestSet?.text || 'No completed working set') + '</strong></div>'
          + '<div><span>Previous comparable best</span><strong>' + escapeHtml(result.priorBestSet?.text || 'No prior comparable submitted set') + '</strong></div>'
          + '<div><span>Change</span><p>' + escapeHtml(result.comparison.change) + '</p></div>'
          + '<div><span>Target versus actual RPE</span><strong>' + (result.targetRpe ? 'Target ' + formatLoadNumber(result.targetRpe) : 'No programmed target') + ' - ' + (result.averageRpe ? 'average actual ' + formatLoadNumber(result.averageRpe) : 'actual RPE not logged') + '</strong></div>'
          + readinessDetail + prDetail
          + (result.fatigueWarning ? '<div><span>Fatigue warning</span><p>' + escapeHtml(result.fatigueWarning) + '</p></div>' : '')
          + '</div></details>';
      }

      function renderCompletedWorkoutSummary(session, options = {}) {
        const analysis = workoutAnalysisForSession(session);
        if (!analysis) return '<section class="completed-summary score-critical"><div class="section-kicker">Workout logged</div><div class="summary-muted">Not enough completed or prescribed working-set data was available to assign a defensible workout grade.</div>' + (options.history ? '' : '<button type="button" data-action="close-completed-summary">Return to Lift Home</button>') + '</section>';
        const tone = workoutGradeScoreTone(analysis.internalScore);
        const highlights = analysis.highlights.length
          ? analysis.highlights.map((item) => '<div class="workout-highlight"><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.detail) + '</span></div>').join('')
          : '<div class="summary-muted">No distinct progression event was identified, but repeatable plan execution still contributes to the grade.</div>';
        const improvements = analysis.improvements.length
          ? analysis.improvements.map((item) => '<div class="workout-improvement"><strong>' + escapeHtml(item.title) + '</strong><span><b>Observed:</b> ' + escapeHtml(item.metric) + '. <b>Target:</b> ' + escapeHtml(item.expected) + '.</span><span>' + escapeHtml(item.detail) + '</span></div>').join('')
          : '<div class="summary-muted">No major execution issues were identified. Continue the current progression plan.</div>';
        return '<section class="completed-summary ' + tone + '" aria-label="Post-workout grade and analysis">'
          + '<div class="workout-grade-hero"><div class="workout-grade-copy"><div class="section-kicker">' + (options.history ? 'Saved workout review' : 'Workout logged') + '</div><h2>Workout Grade: ' + escapeHtml(analysis.grade) + '</h2><span class="workout-grade-intent">' + escapeHtml(analysis.intent) + '</span><p>' + escapeHtml(analysis.interpretation) + '. ' + escapeHtml(analysis.rationale) + '</p></div><div class="workout-grade-mark" role="img" aria-label="Workout grade ' + escapeHtml(hypertrophyGradeLabel(analysis.grade)) + '">' + escapeHtml(analysis.grade) + '</div></div>'
          + '<section class="workout-summary-section"><h3>Category breakdown</h3><div class="workout-category-list">' + analysis.categoryScores.map((category) => '<div class="workout-category"><strong>' + escapeHtml(category.label) + '</strong><b>' + category.earned + ' / ' + category.possible + '</b><span>' + escapeHtml(category.reason) + '</span></div>').join('') + '</div></section>'
          + '<section class="workout-summary-section"><h3>Workout Highlights</h3><div class="workout-highlight-list">' + highlights + '</div></section>'
          + '<section class="workout-summary-section"><h3>Retrospective Session Review</h3><p class="settings-note">These observations explain execution and data quality. The unified prescription cards remain the sole source for the next training decision.</p><div class="workout-improvement-list">' + improvements + '</div></section>'
          + '<section class="workout-summary-section"><h3>Exercise results</h3><div class="workout-exercise-list">' + analysis.exerciseResults.map(renderWorkoutExerciseResult).join('') + '</div></section>'
          + '<div class="workout-confidence"><strong>' + escapeHtml(analysis.confidence.charAt(0).toUpperCase() + analysis.confidence.slice(1)) + ' confidence.</strong> Based on ' + analysis.metrics.completedSets + ' completed working sets, ' + Math.round(analysis.metrics.rpeLoggedRatio * 100) + '% RPE coverage, and available prior comparable sessions. Warm-ups were excluded.</div>'
          + (options.history ? '' : '<button class="primary-action" type="button" data-action="close-completed-summary">Done</button>')
          + '</section>';
      }

      function exportData() {
        const backup = window.FitnessBackupContract.createBackupExport(data);
        exportText = JSON.stringify(backup, null, 2);
        if (appDataPersistenceConflict) {
          settingsMessage = "Backup exported from the currently selected app-data copy only. The conflicting alternate local fallback copy remains preserved on this device and is not included in the download.";
        }
        const blob = new Blob([exportText], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "comprehensive-fitness-" + todayIso() + ".json";
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        window.setTimeout(() => {
          anchor.remove();
          URL.revokeObjectURL(url);
        }, 1000);
        render();
      }

      function parseCsv(text) {
        const rows = [];
        let row = [];
        let cell = "";
        let quoted = false;
        for (let index = 0; index < text.length; index += 1) {
          const char = text[index];
          const next = text[index + 1];
          if (char === '"' && quoted && next === '"') {
            cell += '"';
            index += 1;
          } else if (char === '"') {
            quoted = !quoted;
          } else if (char === "," && !quoted) {
            row.push(cell);
            cell = "";
          } else if ((char === "\n" || char === "\r") && !quoted) {
            if (char === "\r" && next === "\n") index += 1;
            row.push(cell);
            if (row.some((value) => value !== "")) rows.push(row);
            row = [];
            cell = "";
          } else {
            cell += char;
          }
        }
        row.push(cell);
        if (row.some((value) => value !== "")) rows.push(row);
        const headers = rows.shift()?.map((header) => header.trim()) || [];
        return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
      }

      function numberFrom(value, fallback = 0) {
        if (value === "" || value == null) return fallback;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      }

      const muscleTargets = {
        novice: { low: 8, high: 12 },
        intermediate: { low: 10, high: 18 },
        advanced: { low: 12, high: 22 }
      };

      const muscleGroups = ["Chest", "Back", "Quads", "Hamstrings", "Glutes", "Adductors", "Shoulders", "Biceps", "Triceps", "Forearms", "Calves", "Core", "Neck"];

      function targetRangeForMuscle(muscle) {
        if (prescriptionEngine?.evidence?.research?.muscleGroupRecommendations?.length) {
          const engineGroup = ({ Back: "upper_back", Shoulders: "front_delts", Core: "abdominals", Neck: "neck_flexors", Quads: "quadriceps" })[muscle] || normalizePrescriptionIdentity(muscle);
          const defaults = prescriptionApi.aggregateMuscleResearchDefaults(prescriptionEngine.evidence.research, engineGroup);
          if (defaults.recommendations?.length) return { low: Math.max(1, Math.round(defaults.weeklySets.min)), high: Math.max(Math.round(defaults.weeklySets.min), Math.round(defaults.weeklySets.max)) };
        }
        const base = muscleTargets[data.settings.experienceLevel] || muscleTargets.intermediate;
        if (muscle === "Neck") return { low: Math.max(2, Math.round(base.low * 0.35)), high: Math.max(6, Math.round(base.high * 0.45)) };
        if (muscle === "Adductors") return { low: Math.max(4, Math.round(base.low * 0.45)), high: Math.max(8, Math.round(base.high * 0.6)) };
        if (muscle === "Forearms" || muscle === "Calves") return { low: Math.max(4, Math.round(base.low * 0.55)), high: Math.max(10, Math.round(base.high * 0.7)) };
        return base;
      }

      const exerciseMuscleRules = [
        { match: /neck curl|neck flexion|neck extension|neck harness|neck lateral/, muscles: [["Neck", 1]] },
        { match: /side plank/, muscles: [["Core", 1], ["Glutes", 0.25]] },
        { match: /calf|soleus|gastroc|heel raise/, muscles: [["Calves", 1]] },
        { match: /hip adduction|adductor/, muscles: [["Adductors", 1]] },
        { match: /hip abduction|abductor|clamshell|lateral leg raise|side lying leg raise/, muscles: [["Glutes", 1]] },
        { match: /seated leg curl|lying leg curl|standing leg curl|nordic curl|hamstring curl|leg curl|glute ham raise|ghr/, muscles: [["Hamstrings", 1]] },
        { match: /leg extension|sissy squat/, muscles: [["Quads", 1]] },
        { match: /wrist curl|wrist extension|forearm curl|grip|gripper|farmer|carry/, muscles: [["Forearms", 1], ["Core", 0.25]] },
        { match: /reverse curl|hammer curl/, muscles: [["Biceps", 1], ["Forearms", 0.5]] },
        { match: /preacher curl|incline curl|cable curl|ez bar curl|barbell curl|dumbbell curl|db curl|bicep curl|biceps curl|\bcurl\b/, muscles: [["Biceps", 1]] },
        { match: /tricep|triceps|pushdown|skull crusher|skullcrusher|french press|overhead extension|close grip bench|close-grip bench/, muscles: [["Triceps", 1], ["Chest", 0.25]] },
        { match: /upright row|lateral raise|front raise/, muscles: [["Shoulders", 1]] },
        { match: /rear delt|reverse fly|face pull/, muscles: [["Shoulders", 1], ["Back", 0.25]] },
        { match: /overhead press|shoulder press|military press|arnold press/, muscles: [["Shoulders", 1], ["Triceps", 0.5]] },
        { match: /bench|chest press|push up|pushup|dip|chest fly|pec deck|cable fly|incline press|decline press/, muscles: [["Chest", 1], ["Triceps", 0.5], ["Shoulders", 0.25]] },
        { match: /pullover/, muscles: [["Back", 1], ["Chest", 0.5]] },
        { match: /pull up|pullup|chin up|chinup|pulldown|lat pulldown|row|t-bar|t bar|seated cable row|chest supported row/, muscles: [["Back", 1], ["Biceps", 0.5]] },
        { match: /shrug/, muscles: [["Back", 1], ["Shoulders", 0.25]] },
        { match: /hip thrust|glute bridge|glute kickback|cable kickback|abductor/, muscles: [["Glutes", 1], ["Hamstrings", 0.25]] },
        { match: /romanian|\brdl\b|stiff leg|good morning|deadlift|hinge|back extension|hyperextension/, muscles: [["Hamstrings", 1], ["Glutes", 0.5], ["Back", 0.25]] },
        { match: /squat|leg press|hack squat|pendulum squat|belt squat|lunge|split squat|step up|step-up|bulgarian/, muscles: [["Quads", 1], ["Glutes", 0.5]] },
        { match: /plank|crunch|sit up|sit-up|leg raise|hanging raise|knee raise|ab wheel|pallof|woodchop|core|dead bug|bird dog/, muscles: [["Core", 1]] }
      ];

      function normalizeMuscleMatches(matches) {
        const merged = new Map();
        matches.forEach(([muscle, weight]) => {
          if (!muscleGroups.includes(muscle) || weight <= 0) return;
          merged.set(muscle, Math.max(merged.get(muscle) || 0, weight));
        });
        return Array.from(merged.entries()).map(([muscle, weight]) => ({ muscle, weight }));
      }

      function automaticMusclesForName(name) {
        const key = exerciseKey(name);
        const rule = exerciseMuscleRules.find((item) => item.match.test(key));
        return rule ? normalizeMuscleMatches(rule.muscles) : [];
      }

      function displayMuscleForTaxonomyId(muscleId) {
        const family = prescriptionApi?.muscleFamily ? prescriptionApi.muscleFamily(muscleId) : normalizePrescriptionIdentity(muscleId);
        return ({ chest: "Chest", upper_back: "Back", lats: "Back", traps: "Back", spinal_erectors: "Back", quadriceps: "Quads", hamstrings: "Hamstrings", glutes: "Glutes", adductors: "Adductors", abductors: "Glutes", front_delts: "Shoulders", side_delts: "Shoulders", rear_delts: "Shoulders", biceps: "Biceps", triceps: "Triceps", forearms: "Forearms", calves: "Calves", abdominals: "Core", obliques: "Core", neck: "Neck" })[family] || null;
      }

      function taxonomyMusclesForExercise(exercise) {
        const research = prescriptionEngine?.evidence?.research;
        if (!research?.muscleMapsByExercise || !research?.exerciseById) return [];
        const identity = resolvePrescriptionExerciseIdentity(exercise);
        const canonicalId = identity.status === "resolved" && research.exerciseById.has(identity.exerciseId) ? identity.exerciseId : "";
        if (!canonicalId) return [];
        return normalizeMuscleMatches((research.muscleMapsByExercise.get(canonicalId) || [])
          .filter((mapping) => Number(mapping.fractional_set_credit || 0) > 0)
          .map((mapping) => [displayMuscleForTaxonomyId(mapping.programming_family_id || mapping.muscle_group_id), Number(mapping.fractional_set_credit || 0)]))
          .map((item) => ({ ...item, canonicalExerciseId: canonicalId, taxonomyVersion: research.version }));
      }

      function musclesForExercise(exerciseOrName, options = {}) {
        const exercise = typeof exerciseOrName === "string" ? { name: exerciseOrName } : (exerciseOrName || {});
        const cacheKey = [exercise.name || "", exercise.primaryMuscle || "", exercise.secondaryMuscle || "", options.ignoreManual ? "automatic" : "resolved"].join("|");
        if (muscleAssignmentCache.has(cacheKey)) return muscleAssignmentCache.get(cacheKey);
        let result;
        const canonicalId = canonicalExerciseId(exercise.name);
        const evidence = prescriptionEngine?.evidence;
        const normalizedName = normalizePrescriptionIdentity(exercise.name);
        const publicResearchId = evidence?.research?.exerciseIdByAlias?.get(normalizedName)
          || evidence?.research?.exerciseDatabase?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalizedName)?.exercise_id;
        const personalRecord = !publicResearchId && (typeof personalExerciseRecordForName === "function"
          ? personalExerciseRecordForName(exercise.name, evidence)
          : evidence?.personal?.exerciseScores?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalizedName)
            || evidence?.personal?.exercisePrescriptions?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalizedName)
            || evidence?.personal?.exerciseMuscleScores?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalizedName));
        const personalId = personalRecord?.exercise_id || personalRecord?.exerciseId || "";
        const invalidReconciledIdentity = Boolean(personalId && evidence?.personal?.reconciledIdentityByExerciseId?.get(personalId)?.invalid);
        const customOrUnmappedExercise = !canonicalId || /^(?:custom|user)(?::|_)/.test(canonicalId);
        const taxonomy = taxonomyMusclesForExercise(exercise);
        if (invalidReconciledIdentity) {
          result = [];
        } else if (taxonomy.length) {
          result = taxonomy;
        } else if (!customOrUnmappedExercise) {
          result = [];
        } else if (!options.ignoreManual && exercise.primaryMuscle) {
          const manual = [[exercise.primaryMuscle, 1]];
          if (exercise.secondaryMuscle && exercise.secondaryMuscle !== exercise.primaryMuscle) manual.push([exercise.secondaryMuscle, 0.5]);
          result = normalizeMuscleMatches(manual);
        } else {
          // Regex inference is deliberately limited to explicit custom or otherwise unmapped exercises.
          const automatic = automaticMusclesForName(exercise.name);
          result = !options.ignoreManual && exercise.secondaryMuscle && !automatic.some((item) => item.muscle === exercise.secondaryMuscle)
            ? normalizeMuscleMatches([...automatic.map((item) => [item.muscle, item.weight]), [exercise.secondaryMuscle, 0.5]])
            : automatic;
        }
        muscleAssignmentCache.set(cacheKey, result);
        return result;
      }

      function completedWorkoutEntries() {
        if (completedEntriesCache?.revision === analysisRevision) return completedEntriesCache.entries;
        const index = completedAnalysisIndex();
        const entries = data.sets
          .map((set) => {
            const exercise = index.exerciseById.get(set.exerciseId);
            const session = exercise ? index.sessionById.get(exercise.sessionId) : null;
            return exercise && session ? { set, exercise, session } : null;
          })
          .filter((entry) => entry && entry.set.completed && isWorkingSet(entry.set, "volume") && (entry.set.reps > 0 || entry.set.durationSeconds > 0 || entry.set.distance > 0));
        completedEntriesCache = { revision: analysisRevision, entries };
        return entries;
      }

      function weeklyMuscleVolume(weekStart = startOfWeekIso(todayIso())) {
        const taxonomyVersion = prescriptionEngine?.evidence?.research?.version || "legacy_fallback";
        const cacheKey = analysisRevision + "|" + taxonomyVersion + "|" + weekStart;
        if (weeklyVolumeCache.has(cacheKey)) return weeklyVolumeCache.get(cacheKey);
        const activeSessionIds = activeHistorySessionIds();
        const buckets = new Map(muscleGroups.map((muscle) => [muscle, { muscle, sets: 0, directSets: 0, indirectSets: 0, highRpeSets: 0, failedSets: 0, exercises: new Set(), exerciseDetails: new Map(), sessionDetails: new Map(), submittedSessions: new Map(), excludedDeloadSessions: new Map() }]));
        const end = new Date(weekStart + "T00:00:00");
        end.setDate(end.getDate() + 7);
        const endIso = localDateIso(end);
        completedWorkoutEntries().forEach((entry) => {
          if (entry.session.date < weekStart || entry.session.date >= endIso) return;
          if (entry.exercise.isDeload) {
            musclesForExercise(entry.exercise).forEach(({ muscle }) => buckets.get(muscle)?.excludedDeloadSessions.set(entry.session.id, { id: entry.session.id, title: entry.session.title || "Workout", date: entry.session.date }));
            return;
          }
          musclesForExercise(entry.exercise).forEach(({ muscle, weight }) => {
            const bucket = buckets.get(muscle);
            if (!bucket) return;
            bucket.sets += weight;
            if (weight >= 1) bucket.directSets += weight;
            else bucket.indirectSets += weight;
            if (entry.set.rpe >= 9) bucket.highRpeSets += weight;
            bucket.exercises.add(entry.exercise.name);
            bucket.submittedSessions.set(entry.session.id, { id: entry.session.id, title: entry.session.title || "Workout", date: entry.session.date });
            const detail = bucket.exerciseDetails.get(entry.exercise.name) || { name: entry.exercise.name, sets: 0, directSets: 0, indirectSets: 0, volumeLoad: 0, sessions: new Map() };
            detail.sets += weight;
            if (weight >= 1) detail.directSets += weight;
            else detail.indirectSets += weight;
            if (resistanceTypeFor(entry.exercise, entry.set) === "external") detail.volumeLoad += Number(entry.set.weight || 0) * Number(entry.set.reps || 0) * weight;
            detail.sessions.set(entry.session.id, { id: entry.session.id, title: entry.session.title || "Workout", date: entry.session.date });
            bucket.exerciseDetails.set(entry.exercise.name, detail);
            const sessionDetail = bucket.sessionDetails.get(entry.session.id) || { id: entry.session.id, title: entry.session.title || "Workout", date: entry.session.date, sets: 0, directSets: 0, indirectSets: 0, exercises: new Map() };
            sessionDetail.sets += weight;
            if (weight >= 1) sessionDetail.directSets += weight;
            else sessionDetail.indirectSets += weight;
            const sessionExercise = sessionDetail.exercises.get(entry.exercise.id) || { id: entry.exercise.id, name: entry.exercise.name, sets: 0, directSets: 0, indirectSets: 0, volumeLoad: 0 };
            sessionExercise.sets += weight;
            if (weight >= 1) sessionExercise.directSets += weight;
            else sessionExercise.indirectSets += weight;
            if (resistanceTypeFor(entry.exercise, entry.set) === "external") sessionExercise.volumeLoad += Number(entry.set.weight || 0) * Number(entry.set.reps || 0) * weight;
            sessionDetail.exercises.set(entry.exercise.id, sessionExercise);
            bucket.sessionDetails.set(entry.session.id, sessionDetail);
          });
        });
        data.sets.filter((set) => !set.completed && !set.skipped && isWorkingSet(set, "volume")).forEach((set) => {
          const exercise = data.exercises.find((item) => item.id === set.exerciseId);
          const session = exercise ? data.sessions.find((item) => item.id === exercise.sessionId) : null;
          if (!exercise || !session || !activeSessionIds.has(session.id) || exercise.isDeload || session.date < weekStart || session.date >= endIso) return;
          musclesForExercise(exercise).forEach(({ muscle, weight }) => {
            const bucket = buckets.get(muscle);
            if (bucket) bucket.failedSets += weight;
          });
        });
        const result = Array.from(buckets.values()).map((bucket) => {
          const target = targetRangeForMuscle(bucket.muscle);
          const status = bucket.sets < target.low ? "low" : bucket.sets > target.high ? "over" : "good";
          const details = Array.from(bucket.exerciseDetails.values()).map((detail) => ({
            name: detail.name,
            sets: detail.sets,
            directSets: detail.directSets,
            indirectSets: detail.indirectSets,
            volumeLoad: detail.volumeLoad,
            sessions: Array.from(detail.sessions.values()).sort((a, b) => a.date.localeCompare(b.date))
          })).sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
          const sessionGroups = Array.from(bucket.sessionDetails.values()).map((session) => ({ ...session, exercises: Array.from(session.exercises.values()).sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name)) })).sort((a, b) => a.date.localeCompare(b.date));
          return { ...bucket, taxonomyVersion, details, sessionGroups, sessions: Array.from(bucket.submittedSessions.values()).sort((a, b) => a.date.localeCompare(b.date)), excludedDeloadSessions: Array.from(bucket.excludedDeloadSessions.values()).sort((a, b) => a.date.localeCompare(b.date)), exerciseCount: bucket.exercises.size, targetLow: target.low, targetHigh: target.high, status };
        });
        weeklyVolumeCache.set(cacheKey, result);
        return result;
      }

      function unifiedSnapshotForFatigueFlag(flag, weekStart) {
        if (!prescriptionEngine || !["Lift", "Muscle"].includes(flag.scope)) return null;
        const weekEnd = new Date(`${weekStart}T12:00:00`);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const throughDate = localDateIso(weekEnd) > todayIso() ? todayIso() : localDateIso(weekEnd);
        const names = flag.scope === "Lift"
          ? [flag.name]
          : getExerciseNames().filter((name) => musclesForExercise({ name }).some((item) => item.muscle === flag.name)).slice(0, 8);
        if (!names.length) return null;
        const template = { id: `fatigue-${flag.id}`, exercises: names.map((name) => ({ name })) };
        const priority = { full_program_deload: 9, muscle_group_deload: 8, exercise_deload: 7, rotate_exercise: 6, substitute: 6, reduce_volume: 5, light_session: 4, hold: 3, normal: 2, progress: 1 };
        const snapshots = names.map((name) => unifiedPrescriptionSnapshot({ name }, { throughDate, historical: true, template, mesocycle: null, fresh: true }));
        const engineFailure = snapshots.find((snapshot) => (snapshot?.type || snapshot?.kind) === "engine_failure");
        if (engineFailure) return engineFailure;
        return snapshots.filter((snapshot) => snapshot?.finalPrescription
          && snapshot.hardConstraint !== true
          && snapshot.type !== "hard_constraint_rejection"
          && snapshot.kind !== "hard_constraint_rejection")
          .sort((a, b) => Number(priority[b.finalPrescription.recommendationType] || 0) - Number(priority[a.finalPrescription.recommendationType] || 0))[0] || null;
      }

      function fatigueFlags(weekStart = startOfWeekIso(todayIso())) {
        const cacheKey = analysisRevision + "|" + weekStart;
        if (fatigueFlagCache.has(cacheKey)) return fatigueFlagCache.get(cacheKey);
        const flags = [];
        getExerciseNames().forEach((name) => {
          const weeks = summarizeExerciseByWeek(name);
          const current = weeks.find((week) => week.weekStart === weekStart);
          const previous = weeks.find((week) => week.weekStart < weekStart && !week.isLikelyDeload && !week.intentionalReduction);
          if (!current) return;
          const drop = previous && current.bestEstimatedOneRepMax > 0 && current.bestEstimatedOneRepMax < previous.bestEstimatedOneRepMax * 0.93;
          if (current.failedSets >= 2) flags.push({ id: "lift-" + exerciseKey(name) + "-misses", scope: "Lift", name, level: "over", concern: "high", triggeredAt: current.weekStart, reason: "Two or more planned sets were missed or left incomplete.", evidence: [current.failedSets + " missed sets this week", current.completedSets + " completed sets", current.averageRpe ? "Average completed-set RPE " + current.averageRpe.toFixed(1) : "No reliable RPE average"], rule: "The lift flag activates at 2 or more missed working sets in the selected week.", recommendation: "Hold load or reduce it 5-10%, complete the programmed reps with clean technique, and avoid adding sets this week.", resolution: "Complete a comparable session with fewer than 2 misses and without another performance decline." });
          else if (current.averageRpe >= 9.2 && current.completedSets >= 2) flags.push({ id: "lift-" + exerciseKey(name) + "-rpe", scope: "Lift", name, level: "caution", concern: "moderate", triggeredAt: current.weekStart, reason: "Target effort was exceeded repeatedly.", evidence: ["Average RPE " + current.averageRpe.toFixed(1), current.completedSets + " completed working sets", "Caution threshold: average RPE 9.2"], rule: "The lift flag activates when at least 2 completed sets average RPE 9.2 or higher.", recommendation: "Repeat the load and stop 1-2 reps earlier, or reduce the next load increment if the equipment jump is large.", resolution: "Log a comparable session averaging below RPE 9.2 with stable reps and no repeated misses." });
          else if (drop && !current.intentionalReduction) {
            const change = ((current.bestEstimatedOneRepMax / previous.bestEstimatedOneRepMax - 1) * 100).toFixed(1);
            flags.push({ id: "lift-" + exerciseKey(name) + "-performance", scope: "Lift", name, level: "caution", concern: "moderate", triggeredAt: current.weekStart, reason: "Estimated performance declined versus the prior comparable week.", evidence: ["Estimated 1RM change " + change + "%", "Current " + current.bestEstimatedOneRepMax.toFixed(1) + " vs prior " + previous.bestEstimatedOneRepMax.toFixed(1) + " " + data.settings.weightUnit, "Deload weeks are excluded from the comparison"], rule: "The lift flag activates after a greater than 7% estimated 1RM decline versus the prior non-deload week.", recommendation: "Hold the prior successful load, check technique and recovery, and use a smaller progression only after reps stabilize.", resolution: "Return within 7% of the prior comparable estimated performance without high-RPE or missed-set warnings." });
          }
        });
        weeklyMuscleVolume(weekStart).forEach((bucket) => {
          if (bucket.sets > bucket.targetHigh) flags.push({ id: "muscle-" + bucket.muscle.toLowerCase() + "-volume", scope: "Muscle", name: bucket.muscle, level: "over", concern: bucket.sets > bucket.targetHigh * 1.2 ? "high" : "moderate", triggeredAt: weekStart, reason: "Weekly volume exceeded the planned range.", evidence: [bucket.sets.toFixed(bucket.sets % 1 ? 1 : 0) + " weighted sets logged", "Target range " + bucket.targetLow + "-" + bucket.targetHigh + " sets", bucket.directSets.toFixed(bucket.directSets % 1 ? 1 : 0) + " direct and " + bucket.indirectSets.toFixed(bucket.indirectSets % 1 ? 1 : 0) + " indirect sets"], rule: "The flag uses the Monday-Sunday calendar week and activates when completed weighted sets exceed the configured upper target. Direct sets count as 1; mapped secondary work counts fractionally. Only submitted workouts are included, and explicitly marked deload exercises are excluded.", recommendation: "Do not add more volume this week. Keep remaining work easy or move it to the next training week.", resolution: "Return weekly volume to the target range and avoid a simultaneous decline in reps or recovery.", detailType: "weekly-volume", volumeDetail: { muscle: bucket.muscle, weekStart, targetLow: bucket.targetLow, targetHigh: bucket.targetHigh, actual: bucket.sets, exceededBy: bucket.sets - bucket.targetHigh, directSets: bucket.directSets, indirectSets: bucket.indirectSets, contributions: bucket.details, sessionGroups: bucket.sessionGroups, sessions: bucket.sessions, excludedDeloadSessions: bucket.excludedDeloadSessions } });
          else if (bucket.highRpeSets >= 4) flags.push({ id: "muscle-" + bucket.muscle.toLowerCase() + "-rpe", scope: "Muscle", name: bucket.muscle, level: "caution", concern: "moderate", triggeredAt: weekStart, reason: "Several sets for this muscle were performed at RPE 9 or higher.", evidence: [bucket.highRpeSets.toFixed(bucket.highRpeSets % 1 ? 1 : 0) + " high-RPE weighted sets", bucket.sets.toFixed(bucket.sets % 1 ? 1 : 0) + " total weighted sets", "Caution threshold: 4 high-RPE sets"], rule: "The muscle flag activates at 4 or more weighted sets logged at RPE 9+ in one week.", recommendation: "Keep the next exposure 1-2 reps in reserve and avoid increasing both load and volume.", resolution: "Complete the next week with fewer than 4 high-RPE sets and stable performance." });
          else if (bucket.failedSets >= 2) flags.push({ id: "muscle-" + bucket.muscle.toLowerCase() + "-misses", scope: "Muscle", name: bucket.muscle, level: "caution", concern: "moderate", triggeredAt: weekStart, reason: "Multiple planned sets for this muscle were not completed.", evidence: [bucket.failedSets.toFixed(bucket.failedSets % 1 ? 1 : 0) + " weighted missed sets", bucket.sets.toFixed(bucket.sets % 1 ? 1 : 0) + " completed weighted sets", "Caution threshold: 2 missed sets"], rule: "The muscle flag activates at 2 or more weighted missed sets in the selected week.", recommendation: "Hold or reduce volume for this muscle and repeat the last successful loading pattern.", resolution: "Complete the next exposure with fewer than 2 misses and no further rep decline." });
        });
        const recoveryAlerts = dashboardSessionsForWeek(weekStart).map((session) => ({ session, advice: recoveryRecommendationForSession(session) })).filter((item) => ["rest", "deload", "light_session"].includes(item.advice.decision));
        if (recoveryAlerts.length) {
          const highest = recoveryAlerts.find((item) => item.advice.decision === "rest") || recoveryAlerts[0];
          flags.push({ id: "recovery-" + weekStart, scope: "Recovery", name: "Readiness", level: highest.advice.decision === "rest" ? "over" : "caution", concern: highest.advice.decision === "rest" ? "high" : "moderate", triggeredAt: highest.session.date, reason: recoveryAlerts.length + " session" + (recoveryAlerts.length === 1 ? "" : "s") + " started outside the normal low-readiness band.", evidence: recoveryAlerts.slice(0, 4).map((item) => formatDate(item.session.date) + ": " + item.advice.label), rule: "Recovery flags use the personal readiness baseline and band; low out-of-band days that call for deload or rest are included.", recommendation: highest.advice.action, resolution: "Return inside the personal readiness band or record a clear note explaining a temporary outside-band result." });
        }
        const unifiedFlags = flags.map((flag) => {
          const snapshot = unifiedSnapshotForFatigueFlag(flag, weekStart);
          if (!snapshot) return flag;
          if ((snapshot.type || snapshot.kind) === "engine_failure") {
            const unavailableMessage = "Recommendation guidance is unavailable because the prescription engine could not generate a recommendation.";
            return {
              ...flag,
              recommendation: unavailableMessage,
              recommendationUnavailable: true,
              recommendationStatus: "unavailable",
              recommendationType: "engine_failure",
              recommendationId: null,
              engineFailure: { type: "engine_failure", code: snapshot.code || "PRESCRIPTION_ENGINE_FAILURE", status: "unavailable", message: unavailableMessage },
              evidence: [...flag.evidence, "Unified prescription guidance was unavailable for this retrospective flag."],
              rule: `${flag.rule} The retrospective flag remains visible, but no executable recommendation was generated.`
            };
          }
          const prescription = snapshot.finalPrescription;
          return {
            ...flag,
            recommendation: prescription.progressionRule,
            recommendationType: prescription.recommendationType,
            recommendationId: snapshot.recommendationId,
            prescriptionConfidence: prescription.confidence,
            evidence: [...flag.evidence, ...prescription.evidenceSummary.slice(0, 2)],
            rule: `${flag.rule} This flag is retrospective evidence; the action above comes from unified prescription ${snapshot.recommendationId}.`,
            resolution: prescription.holdRule
          };
        });
        fatigueFlagCache.set(cacheKey, unifiedFlags);
        return unifiedFlags;
      }

      function readinessBaseline() {
        return cleanReadinessBaseline(data.settings.readinessBaseline || {});
      }

      function recoveryRecommendationForSession(session) {
        const recovery = sessionRecovery(session);
        if (recovery.illness) {
          return { decision: "rest", label: "Rest recommended", action: "Current illness blocks the whole workout. Resume only after the acute restriction resolves; seek qualified guidance for severe, unexplained, or persistent symptoms.", score: 0, evidence: ["Current illness was explicitly reported."], evaluation: null };
        }
        if (recovery.pain) {
          const affected = recovery.affectedMuscle ? ` affecting ${recovery.affectedMuscle}` : " without a specified affected area";
          return { decision: "rest", label: "Stop affected work", action: "Do not test a painful movement at a lower load. Use only a distinct, explicitly confirmed pain-free alternative, or stop the affected work and seek qualified evaluation when pain is severe, unexplained, or persistent.", score: 0, evidence: [`Pain or injury was explicitly reported${affected}.`], evaluation: null };
        }
        if (prescriptionEngine) {
          const evaluation = prescriptionEngine.evaluateReadiness(prescriptionReadiness(recovery, []));
          const evidence = evaluation.signals.map((signal) => signal.explanation);
          if (!evaluation.signals.length) evidence.push("No independent adverse readiness domain was detected; use the base prescription.");
          if (evaluation.signalCount < 2) {
            if (evaluation.signalCount === 1) evidence.push("One isolated HRV, resting-heart-rate, sleep, soreness, or nutrition marker is monitored but cannot trigger a deload by itself.");
            return { decision: "hold", label: evaluation.signalCount ? "Monitor one readiness marker" : "Go as planned", action: "Use the base prescription. Adjust only if another independent marker, warm-up performance, pain, or comparable-set regression also worsens.", score: evaluation.severity, evidence, evaluation };
          }
          return { decision: "light_session", label: "Temporary readiness adjustment", action: "Use today's adjusted prescription with fewer sets and/or lower load and effort. This does not rewrite the mesocycle or count as an exercise deload.", score: evaluation.severity, evidence, evaluation };
        }
        return { decision: "hold", label: "Go as planned", action: "The readiness engine is unavailable, so keep the base prescription and use warm-ups, pain, and technique to decide whether to stop or modify work.", score: 0, evidence: ["Readiness engine unavailable; no automatic adjustment was applied."], evaluation: null };
      }

      function enteredReadinessTriggers(recoveryInput) {
        const recovery = cleanRecovery(recoveryInput);
        const baseline = readinessBaseline();
        const triggers = [];
        if (recovery.sleepHours !== "" && Number(recovery.sleepHours) <= Number(baseline.sleepHours) - 1) triggers.push({ key: "sleep", label: "Sleep " + recovery.sleepHours + "h vs " + baseline.sleepHours + "h baseline", systemic: true });
        if (recovery.sleepQuality !== "" && Number(recovery.sleepQuality) <= Number(baseline.sleepQuality) - 1) triggers.push({ key: "sleep-quality", label: "Sleep quality " + recovery.sleepQuality + "/5 vs " + baseline.sleepQuality + "/5 baseline", systemic: true });
        if (recovery.hrv !== "" && Number(baseline.hrv) > 0 && Number(recovery.hrv) < Number(baseline.hrv) * 0.85) triggers.push({ key: "hrv", label: "HRV " + recovery.hrv + " vs " + baseline.hrv + " baseline", systemic: true });
        if (recovery.restingHr !== "" && Number(baseline.restingHr) > 0 && Number(recovery.restingHr) >= Number(baseline.restingHr) + 5) triggers.push({ key: "resting-hr", label: "Resting HR " + recovery.restingHr + " vs " + baseline.restingHr + " baseline", systemic: true });
        if (recovery.soreness !== "" && Number(recovery.soreness) >= 4) triggers.push({ key: "soreness", label: "Soreness " + recovery.soreness + "/5" + (recovery.affectedMuscle ? " in " + recovery.affectedMuscle : " across the body"), systemic: !recovery.affectedMuscle, muscle: recovery.affectedMuscle });
        if (recovery.illness) triggers.push({ key: "illness", label: "Current illness", systemic: true });
        if (recovery.pain) triggers.push({ key: "pain", label: recovery.affectedMuscle ? "Pain or injury affecting " + recovery.affectedMuscle : "Pain or injury with no affected area specified", systemic: !recovery.affectedMuscle, muscle: recovery.affectedMuscle });
        return triggers;
      }

      function triggerAppliesToExercise(trigger, exerciseName) {
        if (trigger.systemic || !trigger.muscle) return true;
        return musclesForExercise(exerciseName).some((item) => normalizePrescriptionIdentity(item.muscle) === normalizePrescriptionIdentity(trigger.muscle));
      }

      function targetWasAdjusted(original, adjusted) {
        return ["sets", "reps", "weight", "rpe", "restSeconds"].some((key) => Number(original[key] || 0) !== Number(adjusted[key] || 0));
      }

      function describeReadinessTargetChanges(original, adjusted) {
        const changes = [];
        if (Number(original.weight || 0) !== Number(adjusted.weight || 0)) changes.push("resistance changed from " + formatResistance(original) + " to " + formatResistance(adjusted));
        if (Number(original.sets || 0) !== Number(adjusted.sets || 0)) changes.push("working sets changed from " + original.sets + " to " + adjusted.sets);
        if (Number(original.reps || 0) !== Number(adjusted.reps || 0)) changes.push("reps changed from " + original.reps + " to " + adjusted.reps);
        if (Number(original.rpe || 0) !== Number(adjusted.rpe || 0)) changes.push("target RPE changed from " + original.rpe + " to " + adjusted.rpe);
        if (Number(original.restSeconds || 0) !== Number(adjusted.restSeconds || 0)) changes.push("rest changed from " + original.restSeconds + "s to " + adjusted.restSeconds + "s");
        const description = changes.length ? changes.join(", ") : "the original target was preserved";
        return description.charAt(0).toUpperCase() + description.slice(1);
      }

      function explainReadinessAdjustmentChoice(original, adjusted, triggers) {
        const explanations = [];
        const systemic = triggers.some((trigger) => trigger.systemic && ["sleep", "sleep-quality", "hrv", "resting-hr", "illness", "pain"].includes(trigger.key));
        const local = triggers.some((trigger) => !trigger.systemic && ["soreness", "pain"].includes(trigger.key));
        if (Number(adjusted.weight || 0) < Number(original.weight || 0)) {
          explanations.push("Load was reduced before changing the rep target so the exercise can stay in its programmed hypertrophy range with less risk of overshooting effort or missing later reps.");
        } else if (!(original.weight > 0) && Number(adjusted.sets || 0) < Number(original.sets || 0)) {
          explanations.push("This movement has no adjustable external load, so the rule reduces total sets instead of inventing a lighter resistance target.");
        }
        if (Number(adjusted.reps || 0) < Number(original.reps || 0)) {
          explanations.push("Reps were lowered because preserving the original rep count at the adjusted effort would still create too much fatigue; the new target remains inside the programmed range.");
        } else if (Number(adjusted.reps || 0) === Number(original.reps || 0)) {
          explanations.push("Reps were preserved because they remain inside the intended range; recovery is managed through load, sets, effort, and rest instead of removing useful practice reps.");
        }
        if (Number(adjusted.sets || 0) < Number(original.sets || 0)) explanations.push("Working sets were reduced to lower total fatigue exposure while retaining enough quality work to practice the lift.");
        if (Number(adjusted.rpe || 0) < Number(original.rpe || 0)) explanations.push("Target RPE was lowered to leave more repetitions in reserve, matching the reduced recovery capacity indicated by today's markers.");
        if (Number(adjusted.restSeconds || 0) > Number(original.restSeconds || 0)) explanations.push("Rest was increased to protect performance quality between the remaining sets.");
        if (local) explanations.push("The soreness or pain marker is local, so this adjustment applies only to exercises that train the affected muscle group.");
        else if (systemic) explanations.push("Sleep, HRV, resting heart rate, illness, and pain without a specified area are systemic markers, so the rule can adjust all applicable exercises rather than one muscle group.");
        return explanations.join(" ");
      }

      function adjustTargetForRecovery(target, recoveryAdvice, context = {}) {
        const recovery = cleanRecovery(context.recovery || {});
        if (target?.recommendationSnapshot && typeof unifiedPrescriptionSnapshot === "function") {
          const sourceSnapshot = target.recommendationSnapshot;
          const adjustedSnapshot = unifiedPrescriptionSnapshot({ name: context.exerciseName || sourceSnapshot.exerciseId }, {
            exerciseId: sourceSnapshot.exerciseId,
            muscleGroupId: sourceSnapshot.muscleGroupId,
            throughDate: String(sourceSnapshot.createdAt || todayIso()).slice(0, 10),
            recovery,
            template: context.template,
            mesocycle: currentMesocycle(),
            createdAt: sourceSnapshot.createdAt
          });
          if (adjustedSnapshot) return legacyTargetFromSnapshot(adjustedSnapshot, { name: context.exerciseName || sourceSnapshot.exerciseId, resistanceType: target.resistanceType, increment: target.increment });
        }
        const applicableTriggers = enteredReadinessTriggers(recovery).filter((trigger) => triggerAppliesToExercise(trigger, context.exerciseName || ""));
        const targetedConcern = applicableTriggers.some((trigger) => ["soreness", "pain"].includes(trigger.key));
        const severeConcern = applicableTriggers.some((trigger) => ["illness", "pain"].includes(trigger.key));
        const reducedWeight = (multiplier) => {
          if (!(target.weight > 0)) return 0;
          const increment = Number(target.increment || (data.settings.weightUnit === "kg" ? 2.5 : 5));
          if (target.resistanceType === "assisted_bodyweight") return roundToIncrement(target.weight * (2 - multiplier), increment);
          return Math.min(target.weight, roundToIncrement(target.weight * multiplier, increment));
        };
        if (!applicableTriggers.length || (!["rest", "deload"].includes(recoveryAdvice.decision) && !targetedConcern)) {
          if (recoveryAdvice.decision === "progress") {
            const reason = "High readiness did not add work beyond the conservative progression supported by your lift history.";
            return { ...target, reason, adjusted: false, adjustmentReason: "", triggerLabels: [], text: targetText(target, reason) };
          }
          return { ...target, adjusted: false, adjustmentReason: "", triggerLabels: [], text: target.text || targetText(target, "Inside your normal band: use the normal plan and planned progression.") };
        }
        const triggerText = applicableTriggers.map((trigger) => trigger.label).join("; ");
        if (severeConcern) {
          const illness = applicableTriggers.some((trigger) => trigger.key === "illness");
          const reason = (context.exerciseName ? context.exerciseName + " is blocked because " : "Blocked because ") + triggerText + ". " + (illness ? "This restriction applies to the whole workout." : "Do not test the affected movement at a lower load; use only a distinct, explicitly confirmed pain-free alternative or stop that work.");
          const blocked = {
            ...target,
            decision: illness ? "hold" : "substitute",
            mode: "stop-modify",
            interventionType: "stop_modify",
            executionBlocked: true,
            safetyAdjustment: true,
            sets: 0,
            reps: 0,
            repLow: 0,
            repHigh: 0,
            weight: 0,
            addedLoad: 0,
            assistanceLoad: 0,
            rpe: 0,
            restSeconds: 0,
            warmups: [],
            executableActions: [],
            safetyRestriction: {
              schemaVersion: "hard-safety/1.0.0",
              status: "blocked",
              scope: illness ? "workout" : "exercise",
              reason: illness ? "illness" : "pain",
              resumeCriteria: illness ? "Resume only after the acute illness restriction resolves." : "Resume the affected movement only when it is pain-free."
            },
            adjusted: true,
            adjustmentReason: reason,
            triggerLabels: applicableTriggers.map((trigger) => trigger.label)
          };
          return { ...blocked, reason, text: targetText(blocked, reason) };
        }
        if (recoveryAdvice.decision === "rest") {
          const weight = reducedWeight(0.85);
          const adjusted = { ...target, mode: "stop-modify", interventionType: "stop_modify", safetyAdjustment: true, baseInterventionType: target.coachRecommendation?.interventionType || target.mode || "normal", sets: Math.max(1, Math.ceil(target.sets * 0.5)), weight, addedLoad: target.resistanceType === "bodyweight_plus_load" ? weight : 0, assistanceLoad: target.resistanceType === "assisted_bodyweight" ? weight : 0, rpe: 6, restSeconds: Math.max(Number(target.restSeconds || 0), Number(target.restSeconds || 0) + 15), isDeload: Boolean(target.isDeload) };
          const reason = (context.exerciseName ? context.exerciseName + " was adjusted because " : "Adjusted because ") + triggerText + ". " + describeReadinessTargetChanges(target, adjusted) + ". Why these levers: " + explainReadinessAdjustmentChoice(target, adjusted, applicableTriggers);
          return { ...adjusted, reason, adjusted: targetWasAdjusted(target, adjusted), adjustmentReason: reason, triggerLabels: applicableTriggers.map((trigger) => trigger.label), text: targetText(adjusted, reason) };
        }
        if (recoveryAdvice.decision === "deload" || targetedConcern) {
          const weight = reducedWeight(0.9);
          const adjusted = { ...target, mode: targetedConcern ? "readiness-adjusted" : "deload", interventionType: target.isDeload ? "deload" : targetedConcern ? "readiness_adjusted" : "deload", baseInterventionType: target.coachRecommendation?.interventionType || target.mode || "normal", sets: Math.max(1, Math.ceil(target.sets * 0.65)), weight, addedLoad: target.resistanceType === "bodyweight_plus_load" ? weight : 0, assistanceLoad: target.resistanceType === "assisted_bodyweight" ? weight : 0, rpe: 6.5, restSeconds: Math.max(Number(target.restSeconds || 0), Number(target.restSeconds || 0) + 15), isDeload: Boolean(target.isDeload || (recoveryAdvice.decision === "deload" && !targetedConcern)) };
          const reason = (context.exerciseName ? context.exerciseName + " was adjusted because " : "Adjusted because ") + triggerText + ". " + describeReadinessTargetChanges(target, adjusted) + ". Why these levers: " + explainReadinessAdjustmentChoice(target, adjusted, applicableTriggers);
          return { ...adjusted, reason, adjusted: targetWasAdjusted(target, adjusted), adjustmentReason: reason, triggerLabels: applicableTriggers.map((trigger) => trigger.label), text: targetText(adjusted, reason) };
        }
        return { ...target, adjusted: false, adjustmentReason: "", triggerLabels: [], text: target.text || targetText(target, "Use the normal plan.") };
      }

      function templateReadinessPreview(template, recovery) {
        const advice = recoveryRecommendationForSession({ id: "readiness-preview", date: todayIso(), recovery });
        return template.exercises.map((templateExercise) => {
          const resistanceType = templateExercise.resistanceType || inferResistanceType(templateExercise.name, templateExercise);
          const original = { ...coachTargetForTemplateExercise(templateExercise, { template }), resistanceType, isBodyweight: isBodyweightResistance(resistanceType), restSeconds: Number(templateExercise.restSeconds || recommendedRestSeconds(templateExercise.name)) };
          const adjusted = adjustTargetForRecovery(original, advice, { recovery, exerciseName: templateExercise.name, template });
          return { name: templateExercise.name, original, adjusted, changed: Boolean(adjusted.adjusted), reason: adjusted.adjustmentReason || "No readiness change was required.", triggers: adjusted.triggerLabels || [] };
        });
      }

      function createTemplatesFromStrongSessions(importedSessions, importedExercises, importedSets) {
        const existingTemplateNames = new Set(data.templates.map((template) => template.name.trim().toLowerCase()));
        const activeImportedSessionIds = new Set(activeCompletedWorkoutHistory({ sessions: importedSessions }, { asOfDate: todayIso() }).map((session) => session.id));
        const exercisesBySession = new Map();
        const setsByExercise = new Map();
        importedExercises.forEach((exercise) => {
          if (!exercisesBySession.has(exercise.sessionId)) exercisesBySession.set(exercise.sessionId, []);
          exercisesBySession.get(exercise.sessionId).push(exercise);
        });
        importedSets.forEach((set) => {
          if (!setsByExercise.has(set.exerciseId)) setsByExercise.set(set.exerciseId, []);
          setsByExercise.get(set.exerciseId).push(set);
        });
        const sessionsByWorkoutName = new Map();
        importedSessions.forEach((session) => {
          if (!activeImportedSessionIds.has(session.id)) return;
          const name = (session.title || "Strong Workout").trim() || "Strong Workout";
          const current = sessionsByWorkoutName.get(name);
          if (!current || session.date > current.date) sessionsByWorkoutName.set(name, session);
        });
        return Array.from(sessionsByWorkoutName.entries()).map(([name, session]) => {
          if (existingTemplateNames.has(name.toLowerCase())) return null;
          existingTemplateNames.add(name.toLowerCase());
          const sessionExercises = (exercisesBySession.get(session.id) || []).slice().sort((a, b) => a.order - b.order);
          const templateExercises = sessionExercises.map((exercise) => {
            const exerciseSets = (setsByExercise.get(exercise.id) || []).slice().sort((a, b) => a.setNumber - b.setNumber);
            const completedSets = exerciseSets.filter((set) => set.completed && set.reps > 0 && isWorkingSet(set, "progression"));
            const resistanceType = inferResistanceType(exercise.name, exercise, completedSets);
            const representativeReps = completedSets.length
              ? Math.round(completedSets.reduce((sum, set) => sum + set.reps, 0) / completedSets.length)
              : 8;
            return {
              id: id(),
              name: exercise.name,
              primaryMuscle: exercise.primaryMuscle || "",
              secondaryMuscle: exercise.secondaryMuscle || "",
              resistanceType,
              isBodyweight: isBodyweightResistance(resistanceType),
              sets: Math.max(completedSets.length, 1),
              reps: Math.max(representativeReps, 1),
              targetRpe: completedSets.some((set) => Number(set.rpe) > 0) ? Math.round((completedSets.filter((set) => Number(set.rpe) > 0).reduce((sum, set) => sum + Number(set.rpe), 0) / completedSets.filter((set) => Number(set.rpe) > 0).length) * 2) / 2 : "",
              increment: progressionProfileForExercise(exercise.name).increment,
              restSeconds: exercise.restSeconds || recommendedRestSeconds(exercise.name, { reps: representativeReps }),
              setTypes: templateSetTypesFromHistory(completedSets, exercise.restSeconds || recommendedRestSeconds(exercise.name, { reps: representativeReps })),
              warmups: exerciseSets.filter((set) => setTypeSemantics(set).isWarmup).map((set) => ({ reps: set.reps, weight: set.weight, weightUnit: set.weightUnit, resistanceType: set.resistanceType, isBodyweight: set.isBodyweight, addedLoad: set.addedLoad, assistanceLoad: set.assistanceLoad, rpe: set.rpe }))
            };
          });
          if (!templateExercises.length) return null;
          return { id: id(), name, notes: "Imported from Strong workout name.", exercises: templateExercises, createdAt: isoNow(), updatedAt: isoNow() };
        }).filter(Boolean);
      }

      function parseStrongDate(rawDate) {
        const trimmed = String(rawDate || "").trim();
        const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
        if (match) {
          const month = Number(match[1]) - 1;
          const day = Number(match[2]);
          const year = Number(match[3]);
          const hour = Number(match[4] || 0);
          const minute = Number(match[5] || 0);
          const parsed = new Date(year, month, day, hour, minute);
          if (!Number.isNaN(parsed.getTime())) {
            return { date: localDateIso(parsed), createdAt: parsed.toISOString() };
          }
        }
        const parsed = new Date(trimmed.replace(" ", "T"));
        if (!Number.isNaN(parsed.getTime())) return { date: localDateIso(parsed), createdAt: parsed.toISOString() };
        return { date: todayIso(), createdAt: isoNow() };
      }

      function isStrongWorkSet(row) {
        const setOrder = String(row["Set Order"] || "").trim().toLowerCase();
        if (!setOrder || setOrder.includes("rest")) return false;
        return numberFrom(row.Reps) > 0 || numberFrom(row.Weight) > 0 || numberFrom(row.Distance) > 0 || numberFrom(row.Seconds) > 0;
      }

      function importStrongCsv(text) {
        const rows = parseCsv(text).filter((row) => row.Date && row["Exercise Name"] && isStrongWorkSet(row));
        if (!rows.length) throw new Error("No Strong workout rows found.");
        const existingSessionIds = new Set(data.sessions.map((session) => session.externalId).filter(Boolean));
        const sessions = [];
        const exercises = [];
        const sets = [];
        const sessionMap = new Map();
        const exerciseMap = new Map();
        const setCountsByExercise = new Map();
        const exerciseCountsBySession = new Map();
        const importStamp = Date.now().toString(36);
        let importCounter = 0;
        const importedId = (prefix) => prefix + importStamp + (importCounter += 1).toString(36);

        rows.forEach((row) => {
          const rawDate = row.Date.trim();
          const workoutName = (row["Workout Name"] || "Strong Workout").trim() || "Strong Workout";
          const sessionExternalId = "strong:" + rawDate + "|" + workoutName;
          if (existingSessionIds.has(sessionExternalId)) return;
          let session = sessionMap.get(sessionExternalId);
          if (!session) {
            const parsedDate = parseStrongDate(rawDate);
            session = {
              id: importedId("s"),
              externalId: sessionExternalId,
              source: "strong",
              date: parsedDate.date,
              title: workoutName,
              isTravel: false,
              notes: row["Workout Notes"] || "",
              submitted: true,
              workoutState: "completed",
              completedAt: parsedDate.date,
              createdAt: parsedDate.createdAt,
              updatedAt: isoNow()
            };
            sessionMap.set(sessionExternalId, session);
            sessions.push(session);
            exerciseCountsBySession.set(session.id, 0);
          }
          const exerciseName = (row["Exercise Name"] || "Exercise").trim() || "Exercise";
          const exerciseExternalId = sessionExternalId + "|" + exerciseName;
          let exercise = exerciseMap.get(exerciseExternalId);
          if (!exercise) {
            const exerciseOrder = exerciseCountsBySession.get(session.id) || 0;
            const resistanceType = inferResistanceType(exerciseName);
            exercise = { id: importedId("e"), externalId: exerciseExternalId, source: "strong", sessionId: session.id, name: exerciseName, primaryMuscle: "", secondaryMuscle: "", notes: row.Notes || "", order: exerciseOrder, restSeconds: recommendedRestSeconds(exerciseName), resistanceType, isBodyweight: isBodyweightResistance(resistanceType) };
            exerciseMap.set(exerciseExternalId, exercise);
            exercises.push(exercise);
            exerciseCountsBySession.set(session.id, exerciseOrder + 1);
            setCountsByExercise.set(exercise.id, 0);
          } else if (!exercise.notes && row.Notes) {
            exercise.notes = row.Notes;
          }
          const reps = numberFrom(row.Reps);
          const weight = numberFrom(row.Weight);
          const resistanceType = exercise.resistanceType === "assisted_bodyweight" ? "assisted_bodyweight" : isBodyweightExerciseName(exerciseName) ? (weight > 0 ? "bodyweight_plus_load" : "bodyweight") : exercise.resistanceType || "external";
          if (resistanceType === "bodyweight_plus_load") { exercise.resistanceType = resistanceType; exercise.isBodyweight = true; }
          const nextSetNumber = (setCountsByExercise.get(exercise.id) || 0) + 1;
          setCountsByExercise.set(exercise.id, nextSetNumber);
          sets.push({
            id: importedId("t"),
            exerciseId: exercise.id,
            setNumber: numberFrom(row["Set Order"], nextSetNumber),
            sequenceIndex: nextSetNumber - 1,
            sequence: nextSetNumber,
            sourceSetOrder: String(row["Set Order"] || ""),
            reps,
            weight,
            weightUnit: data.settings.weightUnit,
            resistanceType,
            isBodyweight: isBodyweightResistance(resistanceType),
            addedLoad: resistanceType === "bodyweight_plus_load" ? weight : 0,
            assistanceLoad: resistanceType === "assisted_bodyweight" ? weight : 0,
            rpe: numberFrom(row.RPE),
            completed: true,
            originalImportedValue: { setOrder: String(row["Set Order"] || ""), weight: row.Weight, reps: row.Reps, rpe: row.RPE, distance: row.Distance, seconds: row.Seconds }
          });
        });

        if (!sessions.length) {
          const templates = createTemplatesFromStrongSessions(
            data.sessions.filter((session) => session.source === "strong"),
            data.exercises.filter((exercise) => exercise.source === "strong"),
            data.sets
          );
          const backupAlreadyStored = (data.rawImports || []).some((item) => item.source === "strong" && item.originalText === text);
          commit({ ...data, templates: [...templates, ...data.templates], rawImports: backupAlreadyStored ? data.rawImports : [...(data.rawImports || []), { id: "strong-backup-" + importStamp, source: "strong", importedAt: isoNow(), originalText: text, sessionExternalIds: [] }] }, false);
          settingsMessage = "Strong CSV already imported." + (templates.length ? " Added " + templates.length + " templates from active workout names." : "") + (backupAlreadyStored ? "" : " Raw source backup retained.");
          render();
          return;
        }
        const setsByImportedExercise = new Map();
        sets.forEach((set) => {
          if (!setsByImportedExercise.has(set.exerciseId)) setsByImportedExercise.set(set.exerciseId, []);
          setsByImportedExercise.get(set.exerciseId).push(set);
        });
        setsByImportedExercise.forEach((exerciseSets, exerciseId) => {
          const exercise = exercises.find((item) => item.id === exerciseId);
          classifyImportedExerciseSets(exerciseSets, exercise?.resistanceType || "external").forEach((classification) => {
            const targetSet = sets.find((set) => set.id === classification.set.id);
            if (!targetSet) return;
            const semantics = setTypeSemantics({ ...targetSet, setType: classification.type, isWarmup: classification.type === "warmup" });
            Object.assign(targetSet, {
              sequenceIndex: classification.set.sequenceIndex ?? classification.set.sequence,
              sequence: classification.set.sequenceIndex ?? classification.set.sequence,
              setType: classification.type,
              isWarmup: semantics.isWarmup,
              countsTowardScore: semantics.countsTowardScore,
              countsTowardVolume: semantics.countsTowardVolume,
              countsTowardProgression: semantics.countsTowardProgression,
              classificationSource: classification.source,
              classificationConfidence: classification.confidence,
              classifierVersion: SET_CLASSIFIER_VERSION,
              manualOverride: false,
              reviewRequired: classification.reviewRequired,
              classifiedAt: isoNow()
            });
          });
        });
        const templates = createTemplatesFromStrongSessions(sessions, exercises, sets);
        commit({
          ...data,
          sessions: [...sessions, ...data.sessions],
          exercises: [...data.exercises, ...exercises],
          sets: [...data.sets, ...sets],
          templates: [...templates, ...data.templates],
          rawImports: [...(data.rawImports || []), { id: "strong-" + importStamp, source: "strong", importedAt: isoNow(), originalText: text, sessionExternalIds: sessions.map((session) => session.externalId) }]
        }, false);
        activeSessionId = sessions.sort((a, b) => b.date.localeCompare(a.date))[0]?.id || activeSessionId;
        settingsMessage = "Imported " + sessions.length + " Strong workouts, " + exercises.length + " exercises, " + sets.length + " sets, and " + templates.length + " templates.";
        render();
      }

      function validateBackupJsonShape(value, options = {}) {
        // The next gate, validateImportedAppData, applies VALID_ID_PATTERN checks,
        // MAX_SESSIONS / MAX_EXERCISES / MAX_SETS / MAX_TEMPLATES bounds,
        // seenIds duplicate rejection, and sessionIds/exerciseIds orphan reference checks.
        const maxDepth = Number(options.maxDepth ?? options.maxJsonDepth ?? BACKUP_IMPORT_LIMITS.maxJsonDepth);
        const maxObjectKeys = Number(options.maxObjectKeys ?? BACKUP_IMPORT_LIMITS.maxObjectKeys);
        const forbiddenEventKey = /^on/i;
        if (!Number.isInteger(maxDepth) || maxDepth < 1 || !Number.isInteger(maxObjectKeys) || maxObjectKeys < 1) throw new Error("Invalid JSON shape limits.");
        const stack = [{ value, depth: value && typeof value === "object" ? 1 : 0 }];
        while (stack.length) {
          const current = stack.pop();
          if (!current.value || typeof current.value !== "object") continue;
          if (current.depth > maxDepth) throw new Error(`JSON shape exceeds the maximum depth limit of ${maxDepth}.`);
          const keys = Object.keys(current.value);
          if (!Array.isArray(current.value) && keys.length > maxObjectKeys) throw new Error(`JSON object width exceeds the ${maxObjectKeys}-key limit.`);
          for (const key of keys) {
            if (key === "__proto__" || key === "prototype" || key === "constructor" || forbiddenEventKey.test(key)) throw new Error(`JSON contains a forbidden executable or prototype key: ${key}.`);
            const child = current.value[key];
            if (child && typeof child === "object") stack.push({ value: child, depth: current.depth + 1 });
          }
        }
        return true;
      }

      function validateImportedAppData(imported, limits = BACKUP_IMPORT_LIMITS) {
        validateBackupJsonShape(imported, { maxDepth: limits.maxJsonDepth, maxObjectKeys: limits.maxObjectKeys });
        if (!imported || typeof imported !== "object" || Array.isArray(imported)) throw new Error("Backup root must be a JSON object.");
        const templateNumericDomain = typeof templateNumericFields === "object" ? templateNumericFields : {
          "template-exercise-sets": { min: 1, max: 100, step: 1, integer: true },
          "template-exercise-reps": { min: 1, max: 1000, step: 1, integer: true },
          "template-exercise-rpe": { min: 5, max: 10, step: 0.5, integer: false },
          "template-exercise-increment": { min: 0.5, max: 10000, step: 0.5, integer: false },
          "template-exercise-rest": { min: 15, max: 3600, step: 15, integer: true }
        };
        if (Object.prototype.hasOwnProperty.call(imported, "dataRevision")
          && (!Number.isSafeInteger(imported.dataRevision) || imported.dataRevision < 0)) {
          throw new Error("Backup dataRevision must be omitted or a non-negative safe integer.");
        }
        const allowedTopLevelFields = new Set(["appDataVersion", "domainMigrationVersion", "sessions", "exercises", "sets", "templates", "mesocycles", "activeMesocycleId", "recommendationHistory", "manualOverrides", "personalEvidencePackage", "rawImports", "migrationAudit", "dataRevision", "settings"]);
        const allowedSessionFields = new Set(["id", "externalId", "source", "date", "title", "isTravel", "notes", "submitted", "workoutStarted", "workoutState", "completedAt", "submittedAt", "startedAt", "createdAt", "updatedAt", "templateId", "recovery", "prs", "workoutAnalysis", "workoutPrescription", "adjustmentSummary", "deletedAt", "trashed", "canceledAt"]);
        const allowedExerciseFields = new Set(["id", "externalId", "source", "sessionId", "name", "notes", "order", "primaryMuscle", "secondaryMuscle", "restSeconds", "resistanceType", "isBodyweight", "isDeload", "recommendationSnapshot", "basePrescription", "finalPrescription", "coachRecommendation", "executionBlocked", "safetyRestriction", "manualOverrides", "adjusted", "adjustmentReason", "triggerLabels", "canonicalExerciseId", "researchExerciseId", "originalPrescription", "prescription", "recommendationVersion", "personalDataVersion", "researchDatabaseVersion", "programTargetContext", "appliedTargetContext", "overrideLocked"]);
        const allowedSetFields = new Set(["id", "exerciseId", "setNumber", "sequenceIndex", "sequence", "setTypeIndex", "setType", "reps", "weight", "weightUnit", "resistanceType", "rpe", "completed", "skipped", "edited", "isWarmup", "countsTowardScore", "countsTowardVolume", "countsTowardProgression", "addedLoad", "assistanceLoad", "durationSeconds", "distance", "distanceUnit", "targetReps", "targetRepMin", "targetRepMax", "targetWeight", "targetRpe", "targetRpeMin", "targetRpeMax", "targetRpeTolerance", "targetRestSeconds", "setPrescription", "previousComparableSet", "prescriptionReason", "prescriptionMode", "prescriptionConfidence", "validationWarning", "classificationSource", "classificationConfidence", "classifierVersion", "manualOverride", "reviewRequired", "classifiedAt", "sourceSetOrder", "originalImportedValue"]);
        const allowedTemplateFields = new Set(["id", "name", "notes", "createdAt", "updatedAt", "exercises", "mesocycleId", "mesocycleRevision", "trainingDayId", "source"]);
        const allowedTemplateExerciseFields = new Set(["id", "name", "notes", "sets", "reps", "targetRpe", "increment", "restSeconds", "resistanceType", "isBodyweight", "primaryMuscle", "secondaryMuscle", "warmups", "setTypes", "canonicalExerciseId", "researchExerciseId", "mesocycleSlotId", "assignmentId", "recommendationSnapshot"]);
        const allowedSettingsFields = new Set(["weightUnit", "trainingGoal", "trainingGoalSource", "trainingGoalDisclosure", "nutritionPhase", "experienceLevel", "returningAfterGap", "trainingDaysPerWeek", "availableEquipment", "excludedExerciseIds", "theme", "timerSound", "workoutCompletionSound", "timerVibration", "interactionVibration", "timerNotifications", "inAppRestAlerts", "restCompleteSound", "restCompleteSoundVolume", "restCompleteAutoDismissMs", "restCompleteLockScreenNotifications", "restCompleteAutoReturnToWorkout", "defaultRestSeconds", "notificationMessageDetail", "autoStartRestTimer", "autoHighlightNextSet", "autoScrollNextSet", "installGuideDismissed", "setupSoundConfirmed", "cloudWorkoutSyncConsent", "workoutCloudSync", "workoutCloudSyncConsentVersion", "readinessBaseline", "goal", "trainingStatus"]);
        const allowedMesocycleFields = new Set(["id", "schemaVersion", "builderMode", "rulesVersion", "type", "name", "status", "createdAt", "updatedAt", "durationWeeks", "durationBasis", "specializationMuscleGroups", "trainingDays", "split", "availableEquipment", "constraints", "exclusionResolution", "programmingContext", "planningStep", "availableMuscleGroupIds", "includedMuscleGroupIds", "equipmentUnavailableMuscleGroupIds", "omittedMuscleGroups", "scopeConfirmed", "currentProgramExerciseIds", "recentExerciseWindowDays", "pools", "activeExercises", "selectedPortfolio", "programSlots", "sessions", "programReview", "preservedProductiveExerciseIds", "versions", "lifecycle", "startedAt", "completedAt", "outcome", "reviewedAt", "review", "musclePriorities", "planningProgress", "guidedDays", "acceptedExceptions", "viabilityResult", "viabilityStale", "linkedTemplateIds", "creationResult", "revision"]);
        const allowedRecommendationFields = new Set(["recommendationId", "schemaVersion", "recommendationVersion", "engineVersion", "personalDataVersion", "researchDatabaseVersion", "mesocycleId", "exerciseId", "muscleGroupId", "exerciseScore", "muscleSpecificScore", "personalEvidenceWeight", "researchEvidenceWeight", "readinessAdjustment", "basePrescription", "finalPrescription", "explanation", "evidenceSummary", "confidence", "createdAt", "manualOverrides", "overrideLocked", "checksum", "request", "scores", "versions"]);
        const allowedOverrideFields = new Set(["overrideId", "recommendationId", "sessionId", "workoutId", "exerciseRuntimeId", "exerciseId", "setId", "field", "from", "to", "createdAt", "actor", "reason", "lockedForWorkout", "changes", "previousFinalPrescription", "outcome", "outcomeEvaluation", "action"]);
        const allowedRawImportFields = new Set(["id", "source", "importedAt", "originalText", "sessionExternalIds"]);
        const allowedMigrationFields = new Set(["version", "startedAt", "completedAt", "inspected", "changed", "explicitRetained", "manualOverridesPreserved", "warmups", "topSets", "backoffSets", "dropSets", "ambiguous", "templatesReseeded", "changes"]);
        const allowedMigrationChangeFields = new Set(["setId", "exerciseId", "from", "to", "reason", "confidence"]);
        const VALID_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
        const MAX_SESSIONS = limits.maxSessions;
        const MAX_EXERCISES = limits.maxExercises;
        const MAX_SETS = limits.maxSets;
        const MAX_TEMPLATES = limits.maxTemplates;
        const assertAllowed = (record, allowedFields, label) => {
          if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`${label} must be an object.`);
          const unknown = Object.keys(record).find((key) => !allowedFields.has(key));
          if (unknown) throw new Error(`${label} contains an unknown field: ${unknown}.`);
        };
        const assertId = (value, label) => {
          if (typeof value !== "string" || !VALID_ID_PATTERN.test(value)) throw new Error(`${label} has an invalid id; identifiers must be 1-128 safe characters.`);
          return value;
        };
        const assertName = (value, label) => {
          if (value != null && (typeof value !== "string" || value.length > 256)) throw new Error(`${label} name exceeds the 256-character limit.`);
        };
        const assertText = (value, label) => {
          if (value != null && (typeof value !== "string" || value.length > 4096)) throw new Error(`${label} text exceeds the 4096-character limit.`);
        };
        const cloneJsonValue = (value) => {
          if (Array.isArray(value)) return value.map(cloneJsonValue);
          if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneJsonValue(child)]));
          return value;
        };
        const copyAllowed = (record, allowedFields) => Object.fromEntries(Object.entries(record).filter(([key]) => allowedFields.has(key)).map(([key, value]) => [key, cloneJsonValue(value)]));
        const assertTemplateNumericValue = (value, action, label) => {
          const config = templateNumericDomain[action];
          const numeric = Number(value);
          const steps = (numeric - config.min) / config.step;
          if (!Number.isFinite(numeric)
            || numeric < config.min
            || numeric > config.max
            || (config.integer && !Number.isInteger(numeric))
            || Math.abs(steps - Math.round(steps)) > 1e-9) {
            throw new Error(`${label} must be between ${config.min} and ${config.max} in ${config.step} increments.`);
          }
          return numeric;
        };

        const unknownTopLevel = Object.keys(imported).find((key) => !allowedTopLevelFields.has(key));
        if (unknownTopLevel) throw new Error(`Backup contains an unknown top-level field: ${unknownTopLevel}.`);
        const appDataVersion = imported.appDataVersion;
        if (!Number.isInteger(appDataVersion) || ![1, 2].includes(appDataVersion)) throw new Error("Unsupported or malformed appDataVersion; only version 1 legacy migration and version 2 are supported.");
        for (const collection of ["sessions", "exercises", "sets", "templates"]) if (!Array.isArray(imported[collection])) throw new Error(`Import must include a ${collection} array.`);
        if (imported.sessions.length > MAX_SESSIONS) throw new Error(`Session count exceeds the ${MAX_SESSIONS} limit.`);
        if (imported.exercises.length > MAX_EXERCISES) throw new Error(`Exercise count exceeds the ${MAX_EXERCISES} limit.`);
        if (imported.sets.length > MAX_SETS) throw new Error(`Set count exceeds the ${MAX_SETS} limit.`);
        if (imported.templates.length > MAX_TEMPLATES) throw new Error(`Template count exceeds the ${MAX_TEMPLATES} limit.`);
        const seenIds = (records, label) => {
          const ids = new Set();
          records.forEach((record, index) => {
            const recordId = assertId(record.id, `${label} ${index + 1}`);
            if (ids.has(recordId)) throw new Error(`Duplicate ${label} id: ${recordId}.`);
            ids.add(recordId);
          });
          return ids;
        };

        const sessions = imported.sessions.map((record, index) => {
          assertAllowed(record, allowedSessionFields, `Session ${index + 1}`);
          assertName(record.title, `Session ${index + 1}`);
          assertText(record.notes, `Session ${index + 1} notes`);
          for (const field of ["submitted", "workoutStarted", "isTravel", "trashed"]) if (record[field] != null && typeof record[field] !== "boolean") throw new Error(`Session ${index + 1} ${field} must be boolean.`);
          return copyAllowed(record, allowedSessionFields);
        });
        const exercises = imported.exercises.map((record, index) => {
          assertAllowed(record, allowedExerciseFields, `Exercise ${index + 1}`);
          assertName(record.name, `Exercise ${index + 1}`);
          assertText(record.notes, `Exercise ${index + 1} notes`);
          assertId(record.sessionId, `Exercise ${index + 1} session reference`);
          if (record.order != null && (!Number.isInteger(Number(record.order)) || Number(record.order) < 0)) throw new Error(`Exercise ${index + 1} order must be a non-negative integer.`);
          if (record.restSeconds != null && (!Number.isFinite(Number(record.restSeconds)) || Number(record.restSeconds) < 0 || Number(record.restSeconds) > 3600)) throw new Error(`Exercise ${index + 1} restSeconds is invalid.`);
          for (const field of ["isBodyweight", "isDeload", "executionBlocked", "adjusted", "overrideLocked"]) if (record[field] != null && typeof record[field] !== "boolean") throw new Error(`Exercise ${index + 1} ${field} must be boolean.`);
          return copyAllowed(record, allowedExerciseFields);
        });
        const sets = imported.sets.map((record, index) => {
          assertAllowed(record, allowedSetFields, `Set ${index + 1}`);
          assertId(record.exerciseId, `Set ${index + 1} exercise reference`);
          for (const field of ["setNumber", "sequenceIndex", "sequence", "setTypeIndex", "reps", "weight", "rpe", "addedLoad", "assistanceLoad", "durationSeconds", "distance", "targetReps", "targetRepMin", "targetRepMax", "targetWeight", "targetRpe", "targetRpeMin", "targetRpeMax", "targetRpeTolerance", "targetRestSeconds", "classificationConfidence", "classifierVersion"]) if (record[field] != null && record[field] !== "" && !Number.isFinite(Number(record[field]))) throw new Error(`Set ${index + 1} ${field} must be numeric.`);
          for (const field of ["completed", "skipped", "edited", "isWarmup", "countsTowardScore", "countsTowardVolume", "countsTowardProgression", "manualOverride", "reviewRequired"]) if (record[field] != null && typeof record[field] !== "boolean") throw new Error(`Set ${index + 1} ${field} must be boolean.`);
          return copyAllowed(record, allowedSetFields);
        });
        const templateExerciseIds = new Set();
        const templates = imported.templates.map((record, index) => {
          assertAllowed(record, allowedTemplateFields, `Template ${index + 1}`);
          assertName(record.name, `Template ${index + 1}`);
          assertText(record.notes, `Template ${index + 1} notes`);
          if (!Array.isArray(record.exercises)) throw new Error(`Template ${index + 1} must contain an exercises array.`);
          const template = copyAllowed(record, allowedTemplateFields);
          template.exercises = record.exercises.map((exercise, exerciseIndex) => {
            assertAllowed(exercise, allowedTemplateExerciseFields, `Template ${index + 1} exercise ${exerciseIndex + 1}`);
            const exerciseId = assertId(exercise.id, `Template ${index + 1} exercise ${exerciseIndex + 1}`);
            if (templateExerciseIds.has(exerciseId)) throw new Error(`Duplicate template exercise id: ${exerciseId}.`);
            templateExerciseIds.add(exerciseId);
            assertName(exercise.name, `Template ${index + 1} exercise ${exerciseIndex + 1}`);
            assertText(exercise.notes, `Template ${index + 1} exercise ${exerciseIndex + 1} notes`);
            const copiedExercise = copyAllowed(exercise, allowedTemplateExerciseFields);
            const numericActions = {
              sets: "template-exercise-sets",
              reps: "template-exercise-reps",
              targetRpe: "template-exercise-rpe",
              increment: "template-exercise-increment",
              restSeconds: "template-exercise-rest"
            };
            Object.entries(numericActions).forEach(([field, action]) => {
              if (exercise[field] == null) return;
              copiedExercise[field] = assertTemplateNumericValue(exercise[field], action, `Template ${index + 1} exercise ${exerciseIndex + 1} ${field}`);
            });
            return copiedExercise;
          });
          return template;
        });
        const sessionIds = seenIds(sessions, "session");
        const exerciseIds = seenIds(exercises, "exercise");
        seenIds(sets, "set");
        const templateIds = seenIds(templates, "template");
        exercises.forEach((exercise) => { if (!sessionIds.has(exercise.sessionId)) throw new Error(`Orphan exercise reference: ${exercise.id} -> ${exercise.sessionId}.`); });
        sets.forEach((set) => { if (!exerciseIds.has(set.exerciseId)) throw new Error(`Orphan set reference: ${set.id} -> ${set.exerciseId}.`); });
        sessions.forEach((session) => { if (session.templateId && !templateIds.has(session.templateId)) throw new Error(`Orphan template reference: ${session.templateId}.`); });
        if (imported.mesocycles != null && !Array.isArray(imported.mesocycles)) throw new Error("Mesocycles must be an array.");
        const mesocycles = (imported.mesocycles || []).map((record, index) => {
          assertAllowed(record, allowedMesocycleFields, `Mesocycle ${index + 1}`);
          assertName(record.name, `Mesocycle ${index + 1}`);
          return copyAllowed(record, allowedMesocycleFields);
        });
        if (mesocycles.length > MAX_TEMPLATES) throw new Error(`Mesocycle count exceeds the ${MAX_TEMPLATES} limit.`);
        const mesocycleIds = seenIds(mesocycles, "mesocycle");
        const activeMesocycleId = imported.activeMesocycleId || "";
        if (activeMesocycleId) {
          assertId(activeMesocycleId, "Active mesocycle reference");
          if (!mesocycleIds.has(activeMesocycleId)) throw new Error(`Orphan active mesocycle reference: ${activeMesocycleId}.`);
        }
        const settings = imported.settings == null ? {} : imported.settings;
        assertAllowed(settings, allowedSettingsFields, "Settings");
        if (settings.weightUnit != null && !["lb", "kg"].includes(settings.weightUnit)) throw new Error("Settings weightUnit must be lb or kg.");
        if (settings.trainingGoal != null && !["", "strength", "hypertrophy", "muscular_endurance", "general_fitness"].includes(settings.trainingGoal)) throw new Error("Settings trainingGoal is invalid.");
        if (settings.nutritionPhase != null && !["", "deficit", "maintenance", "surplus", "recomposition"].includes(settings.nutritionPhase)) throw new Error("Settings nutritionPhase is invalid.");
        if (settings.experienceLevel != null && !["", "novice", "intermediate", "advanced"].includes(settings.experienceLevel)) throw new Error("Settings experienceLevel is invalid.");
        if (settings.theme != null && !["light", "dark"].includes(settings.theme)) throw new Error("Settings theme is invalid.");
        if (settings.trainingDaysPerWeek != null && (!Number.isInteger(Number(settings.trainingDaysPerWeek)) || Number(settings.trainingDaysPerWeek) < 1 || Number(settings.trainingDaysPerWeek) > 7)) throw new Error("Settings trainingDaysPerWeek must be between 1 and 7.");
        if (settings.availableEquipment != null && (!Array.isArray(settings.availableEquipment) || settings.availableEquipment.length > 128 || settings.availableEquipment.some((value) => typeof value !== "string" || !value || value.length > 128))) throw new Error("Settings availableEquipment is invalid or exceeds its limit.");
        if (settings.excludedExerciseIds != null && (!Array.isArray(settings.excludedExerciseIds) || settings.excludedExerciseIds.length > MAX_EXERCISES)) throw new Error("Settings excludedExerciseIds is invalid or exceeds its limit.");
        if (Array.isArray(settings.excludedExerciseIds)) settings.excludedExerciseIds.forEach((value, index) => assertId(value, `Excluded exercise ${index + 1}`));
        const booleanSettingFields = ["timerSound", "workoutCompletionSound", "timerVibration", "interactionVibration", "timerNotifications", "inAppRestAlerts", "restCompleteLockScreenNotifications", "restCompleteAutoReturnToWorkout", "autoStartRestTimer", "autoHighlightNextSet", "autoScrollNextSet", "installGuideDismissed", "setupSoundConfirmed", "cloudWorkoutSyncConsent"];
        booleanSettingFields.forEach((field) => { if (settings[field] != null && typeof settings[field] !== "boolean") throw new Error(`Settings ${field} must be boolean.`); });
        if (settings.returningAfterGap != null && typeof settings.returningAfterGap !== "boolean") throw new Error("Settings returningAfterGap must be boolean or null.");
        if (settings.restCompleteSoundVolume != null && (!Number.isFinite(Number(settings.restCompleteSoundVolume)) || Number(settings.restCompleteSoundVolume) < 0 || Number(settings.restCompleteSoundVolume) > 1)) throw new Error("Settings restCompleteSoundVolume must be between 0 and 1.");
        if (settings.restCompleteAutoDismissMs != null && (!Number.isFinite(Number(settings.restCompleteAutoDismissMs)) || Number(settings.restCompleteAutoDismissMs) < 1000 || Number(settings.restCompleteAutoDismissMs) > 60000)) throw new Error("Settings restCompleteAutoDismissMs must be between 1000 and 60000.");
        if (settings.defaultRestSeconds != null && (!Number.isFinite(Number(settings.defaultRestSeconds)) || Number(settings.defaultRestSeconds) < 15 || Number(settings.defaultRestSeconds) > 900)) throw new Error("Settings defaultRestSeconds must be between 15 and 900.");
        if (settings.readinessBaseline != null) {
          const allowedBaselineFields = new Set(["sleepHours", "sleepQuality", "hrv", "restingHr", "soreness", "band"]);
          assertAllowed(settings.readinessBaseline, allowedBaselineFields, "Settings readinessBaseline");
          Object.entries(settings.readinessBaseline).forEach(([field, value]) => { if (value !== "" && value != null && !Number.isFinite(Number(value))) throw new Error(`Settings readinessBaseline ${field} must be numeric or empty.`); });
        }
        const boundedRecords = (value, label, maximum, allowedFields) => {
          if (value == null) return [];
          if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} collection exceeds the ${maximum}-record limit.`);
          return value.map((record, index) => {
            assertAllowed(record, allowedFields, `${label} ${index + 1}`);
            return copyAllowed(record, allowedFields);
          });
        };
        const recommendationHistory = boundedRecords(imported.recommendationHistory, "Recommendation history", MAX_SETS, allowedRecommendationFields);
        recommendationHistory.forEach((record, index) => assertId(record.recommendationId, `Recommendation history ${index + 1}`));
        const manualOverrides = boundedRecords(imported.manualOverrides, "Manual override", MAX_SETS, allowedOverrideFields);
        manualOverrides.forEach((record, index) => assertId(record.overrideId, `Manual override ${index + 1}`));
        const rawImports = boundedRecords(imported.rawImports, "Raw import", 128, allowedRawImportFields);
        rawImports.forEach((record, index) => {
          assertId(record.id, `Raw import ${index + 1}`);
          if (typeof record.source !== "string" || !record.source || record.source.length > 128) throw new Error(`Raw import ${index + 1} source is invalid.`);
          if (typeof record.originalText !== "string" || new TextEncoder().encode(record.originalText).byteLength > limits.maxFileBytes) throw new Error(`Raw import ${index + 1} source text exceeds the file limit.`);
          if (!Array.isArray(record.sessionExternalIds) || record.sessionExternalIds.length > MAX_SESSIONS || record.sessionExternalIds.some((value) => typeof value !== "string" || value.length > 128)) throw new Error(`Raw import ${index + 1} session references are invalid.`);
        });
        const migrationAudit = boundedRecords(imported.migrationAudit, "Migration audit", 128, allowedMigrationFields);
        migrationAudit.forEach((record, index) => {
          const label = `Migration audit ${index + 1}`;
          if (!Number.isInteger(record.version) || record.version < 1 || record.version > 10000) throw new Error(`${label} version must be an integer between 1 and 10000.`);
          for (const field of ["startedAt", "completedAt"]) {
            if (record[field] != null && (typeof record[field] !== "string" || !record[field] || record[field].length > 64 || !Number.isFinite(Date.parse(record[field])))) throw new Error(`${label} ${field} must be a valid timestamp of at most 64 characters.`);
          }
          for (const field of ["inspected", "changed", "explicitRetained", "manualOverridesPreserved", "warmups", "topSets", "backoffSets", "dropSets", "ambiguous"]) {
            if (record[field] != null && (!Number.isInteger(record[field]) || record[field] < 0 || record[field] > MAX_SETS)) throw new Error(`${label} ${field} must be a non-negative integer within the set limit.`);
          }
          if (record.templatesReseeded != null && (!Number.isInteger(record.templatesReseeded) || record.templatesReseeded < 0 || record.templatesReseeded > MAX_TEMPLATES)) throw new Error(`${label} templatesReseeded must be a non-negative integer within the template limit.`);
          if (record.changes != null && (!Array.isArray(record.changes) || record.changes.length > MAX_SETS)) throw new Error(`${label} changes must be an array within the set limit.`);
          record.changes = (record.changes || []).map((change, changeIndex) => {
            const changeLabel = `${label} change ${changeIndex + 1}`;
            assertAllowed(change, allowedMigrationChangeFields, changeLabel);
            if (change.setId != null) assertId(change.setId, `${changeLabel} set`);
            if (change.exerciseId != null) assertId(change.exerciseId, `${changeLabel} exercise`);
            for (const field of ["from", "to"]) if (change[field] != null && (typeof change[field] !== "string" || change[field].length > 128)) throw new Error(`${changeLabel} ${field} must be a string of at most 128 characters.`);
            assertText(change.reason, `${changeLabel} reason`);
            if (change.confidence != null && (typeof change.confidence !== "number" || !Number.isFinite(change.confidence) || change.confidence < 0 || change.confidence > 1)) throw new Error(`${changeLabel} confidence must be a number between 0 and 1.`);
            return copyAllowed(change, allowedMigrationChangeFields);
          });
        });
        const result = {
          appDataVersion,
          sessions,
          exercises,
          sets,
          templates,
          mesocycles,
          activeMesocycleId,
          recommendationHistory,
          manualOverrides,
          personalEvidencePackage: imported.personalEvidencePackage == null ? null : cloneJsonValue(imported.personalEvidencePackage),
          rawImports,
          migrationAudit,
          // Imported ordering metadata is validated above for auditability but
          // never becomes the local dual-store ordering authority.
          dataRevision: 0,
          settings: copyAllowed(settings, allowedSettingsFields)
        };
        if (Number.isInteger(imported.domainMigrationVersion)) result.domainMigrationVersion = imported.domainMigrationVersion;
        return result;
      }

      function validatePersonalEvidenceJsonShape(value, options = {}) {
        return validateBackupJsonShape(value, {
          maxDepth: options.maxDepth ?? options.maxJsonDepth ?? PERSONAL_EVIDENCE_IMPORT_LIMITS.maxJsonDepth,
          maxObjectKeys: options.maxObjectKeys ?? PERSONAL_EVIDENCE_IMPORT_LIMITS.maxObjectKeys
        });
      }

      function validatePersonalEvidencePackage(parsed) {
        validatePersonalEvidenceJsonShape(parsed);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Personal evidence package must be a JSON object.");
        const allowedPackageFields = new Set(["schemaVersion", "createdAt", "personalDataVersion", "researchDatabaseVersion", "privacy", "personalData", "personal_data", "importedAt"]);
        const unknownPackageField = Object.keys(parsed).find((key) => !allowedPackageFields.has(key));
        if (unknownPackageField) throw new Error(`Personal evidence package contains an unknown field: ${unknownPackageField}.`);
        if (parsed.schemaVersion !== "personal-evidence-package/1.0.0") throw new Error(`Unsupported personal evidence package schema version: ${parsed.schemaVersion || "missing"}.`);
        if (parsed.privacy !== "private_local_only_do_not_deploy") throw new Error("Personal evidence package privacy classification is missing or invalid.");
        const personalData = parsed.personalData || parsed.personal_data;
        if (!personalData || typeof personalData !== "object" || Array.isArray(personalData)) throw new Error("Personal evidence package is missing personalData.");
        const allowedPersonalFields = new Set(["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores", "exerciseSessionMetrics", "weeklyMuscleVolumeResponse", "recoveryRules", "muscleGroupSweetSpots", "metadata", "exercise_prescriptions", "exercise_scores", "exercise_muscle_scores", "exercise_session_metrics", "weekly_muscle_volume_response", "recovery_rules", "muscle_group_sweet_spots"]);
        const unknownPersonalField = Object.keys(personalData).find((key) => !allowedPersonalFields.has(key));
        if (unknownPersonalField) throw new Error(`Personal evidence data contains an unknown collection or field: ${unknownPersonalField}.`);
        const canonical = {
          exercisePrescriptions: personalData.exercisePrescriptions || personalData.exercise_prescriptions,
          exerciseScores: personalData.exerciseScores || personalData.exercise_scores,
          exerciseMuscleScores: personalData.exerciseMuscleScores || personalData.exercise_muscle_scores,
          exerciseSessionMetrics: personalData.exerciseSessionMetrics || personalData.exercise_session_metrics || [],
          weeklyMuscleVolumeResponse: personalData.weeklyMuscleVolumeResponse || personalData.weekly_muscle_volume_response || [],
          recoveryRules: personalData.recoveryRules || personalData.recovery_rules || [],
          muscleGroupSweetSpots: personalData.muscleGroupSweetSpots || personalData.muscle_group_sweet_spots || [],
          metadata: personalData.metadata || {}
        };
        for (const collection of ["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores"]) {
          if (!Array.isArray(canonical[collection])) throw new Error(`Personal evidence package is missing the required ${collection} collection.`);
          if (!canonical[collection].length) throw new Error(`Personal evidence ${collection} collection must contain at least one record.`);
          if (canonical[collection].length > PERSONAL_EVIDENCE_IMPORT_LIMITS.maxCoreCollectionItems) throw new Error(`Personal evidence ${collection} collection exceeds the 1024-record limit.`);
        }
        for (const collection of ["exerciseSessionMetrics", "weeklyMuscleVolumeResponse", "recoveryRules", "muscleGroupSweetSpots"]) {
          if (!Array.isArray(canonical[collection])) throw new Error(`Personal evidence ${collection} must be an array.`);
          if (canonical[collection].length > PERSONAL_EVIDENCE_IMPORT_LIMITS.maxCoreCollectionItems) throw new Error(`Personal evidence ${collection} collection exceeds the 1024-record limit.`);
        }
        const numericFields = new Set(["sample_size", "session_count", "comparable_session_count", "overall_personal_exercise_score", "progression_score", "recovery_efficiency_score", "contribution_weight", "muscle_specific_effectiveness_score", "comparable_sessions", "source_row"]);
        const stack = [{ value: canonical, key: "personalData" }];
        while (stack.length) {
          const current = stack.pop();
          if (!current.value || typeof current.value !== "object") continue;
          for (const [key, value] of Object.entries(current.value)) {
            if (numericFields.has(key) && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`Personal evidence ${key} must be a finite number.`);
            if (typeof value === "string") {
              if (/(?:^|_)(?:id|ids)$|Id$/.test(key)) {
                if (!value || value.length > PERSONAL_EVIDENCE_IMPORT_LIMITS.maxStableIdChars || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) throw new Error(`Personal evidence identifier ${key} exceeds the 128-character safe ID limit.`);
              } else if (/name/i.test(key)) {
                if (value.length > PERSONAL_EVIDENCE_IMPORT_LIMITS.maxNameChars) throw new Error(`Personal evidence name ${key} exceeds the 256-character limit.`);
              } else if (value.length > PERSONAL_EVIDENCE_IMPORT_LIMITS.maxTextChars) {
                throw new Error(`Personal evidence text ${key} exceeds the 4096-character limit.`);
              }
            } else if (value && typeof value === "object") stack.push({ value, key });
          }
        }
        const canonicalPackage = {
          schemaVersion: parsed.schemaVersion,
          createdAt: parsed.createdAt,
          personalDataVersion: parsed.personalDataVersion,
          researchDatabaseVersion: parsed.researchDatabaseVersion,
          privacy: parsed.privacy,
          personalData: canonical
        };
        if (typeof canonicalPackage.createdAt !== "string" || !canonicalPackage.createdAt) throw new Error("Personal evidence package createdAt is required.");
        if (typeof canonicalPackage.personalDataVersion !== "string" || !canonicalPackage.personalDataVersion || canonicalPackage.personalDataVersion.length > 128) throw new Error("Personal evidence personalDataVersion is missing or invalid.");
        if (typeof canonicalPackage.researchDatabaseVersion !== "string" || !canonicalPackage.researchDatabaseVersion || canonicalPackage.researchDatabaseVersion.length > 128) throw new Error("Personal evidence researchDatabaseVersion is missing or invalid.");
        return canonicalPackage;
      }

      function personalEvidenceBundleForImport(personalData) {
        if (!prescriptionApi || !prescriptionEngine?.evidence?.research) throw new Error("The research engine is unavailable; personal evidence was not imported.");
        const bundle = prescriptionApi.normalizeEvidenceBundle({ personalData, research: prescriptionEngine.evidence.research });
        const invalidIdentities = [...(bundle.personal.reconciledIdentityByExerciseId || new Map()).entries()].filter(([, identity]) => identity?.invalid);
        if (invalidIdentities.length) throw new Error(`Personal evidence identity reconciliation conflict for ${invalidIdentities.map(([exerciseId]) => exerciseId).join(", ")}.`);
        const expectedCounts = [personalData.exercisePrescriptions.length, personalData.exerciseScores.length, personalData.exerciseMuscleScores.length];
        const normalizedCounts = [bundle.personal.exercisePrescriptions.length, bundle.personal.exerciseScores.length, bundle.personal.exerciseMuscleScores.length];
        if (expectedCounts.some((count, index) => count !== normalizedCounts[index])) throw new Error("Personal evidence engine validation rejected one or more aggregate rows.");
        const engine = prescriptionApi.createPrescriptionEngine(bundle);
        if (!(engine?.evidence?.personal?.reconciledIdentityByExerciseId instanceof Map)) throw new Error("Personal evidence engine construction did not preserve canonical identity reconciliation.");
        return { bundle, engine };
      }

      function researchOnlyBundleForImport() {
        if (!prescriptionApi || !prescriptionEngine?.evidence?.research) throw new Error("The research engine is unavailable; the backup was not imported.");
        const bundle = prescriptionApi.normalizeEvidenceBundle({ personalData: {}, research: prescriptionEngine.evidence.research });
        return { bundle, engine: prescriptionApi.createPrescriptionEngine(bundle) };
      }

      function installPreparedEvidence(prepared, sourceLabel) {
        prescriptionEngine = prepared.engine;
        const personalRecords = prepared.bundle.personal.exercisePrescriptions.length + prepared.bundle.personal.exerciseScores.length + prepared.bundle.personal.exerciseMuscleScores.length;
        prescriptionEvidenceStatus = {
          state: prepared.bundle.research.exerciseDatabase.length ? "ready" : "research_unavailable",
          source: sourceLabel,
          personalRecords,
          researchExercises: prepared.bundle.research.exerciseDatabase.length,
          personalVersion: prepared.bundle.versions.personal,
          researchVersion: prepared.bundle.versions.research,
          message: personalRecords
            ? `Unified engine loaded ${personalRecords} personal prescription/score records and ${prepared.bundle.research.exerciseDatabase.length} research exercises from ${sourceLabel}.`
            : `Unified engine loaded ${prepared.bundle.research.exerciseDatabase.length} research exercises. Import the private personal evidence package to add local aggregates.`
        };
        return personalRecords;
      }

      function validateExecutableRecommendationSnapshot(snapshot, engine, hostExercise, label) {
        if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error(`${label} must be a recommendation snapshot object.`);
        if (!prescriptionApi?.serializeRecommendationSnapshot) throw new Error("Recommendation snapshot validation is unavailable; the backup was not imported.");
        prescriptionApi.serializeRecommendationSnapshot(snapshot);
        const identity = engine.resolveExerciseIdentity(snapshot.exerciseId);
        const reconciledCustom = engine.evidence?.personal?.reconciledIdentityByExerciseId?.get(snapshot.exerciseId);
        const trustedCustom = /^(?:custom|user)(?::|_)/.test(snapshot.exerciseId || "")
          && reconciledCustom && !reconciledCustom.invalid && !reconciledCustom.researchExerciseId;
        if (identity?.status !== "resolved" && !trustedCustom) throw new Error(identity?.reason || "unknown_exercise_identity");
        const canonicalExerciseId = identity?.status === "resolved" ? identity.exerciseId : snapshot.exerciseId;
        if (canonicalExerciseId !== snapshot.exerciseId) throw new Error("Snapshot exercise identity is not the canonical reconciled identity.");

        const snapshotMuscleGroupId = String(snapshot.muscleGroupId || "").trim();
        if (!snapshotMuscleGroupId) throw new Error("Snapshot muscle-group target is missing.");
        for (const prescription of [snapshot.basePrescription, snapshot.finalPrescription]) {
          if (prescription?.muscleGroupId && prescription.muscleGroupId !== snapshotMuscleGroupId) {
            throw new Error("Snapshot prescription target does not match its top-level muscle-group target.");
          }
        }
        if (identity?.status === "resolved") {
          const target = engine.resolveDefaultPrescriptionTarget(canonicalExerciseId);
          if (target?.status !== "resolved" || target.exerciseId !== canonicalExerciseId || target.muscleGroupId !== snapshotMuscleGroupId) {
            throw new Error(target?.reason || "Snapshot exercise and canonical direct target do not match.");
          }
        } else {
          const personalRows = [
            ...(engine.evidence?.personal?.prescriptionsFor?.(canonicalExerciseId) || []),
            ...(engine.evidence?.personal?.muscleScoresFor?.(canonicalExerciseId) || [])
          ];
          const trustedMuscleGroups = new Set(personalRows.map((record) => String(record?.muscle_group_id || record?.muscleGroupId || "").trim()).filter(Boolean));
          if (!trustedMuscleGroups.has(snapshotMuscleGroupId)) throw new Error("Trusted custom snapshot target is not supported by reconciled personal evidence.");
        }

        if (hostExercise && typeof hostExercise === "object") {
          const hostIdentityInput = hostExercise.canonicalExerciseId || hostExercise.researchExerciseId || hostExercise.name || "";
          const hostIdentity = hostIdentityInput ? engine.resolveExerciseIdentity(hostIdentityInput) : null;
          if (hostIdentity?.status === "resolved" && hostIdentity.exerciseId !== canonicalExerciseId) {
            throw new Error("Host exercise identity does not match its executable recommendation snapshot.");
          }
          if (hostIdentity?.status !== "resolved") {
            const explicitHostId = String(hostExercise.canonicalExerciseId || hostExercise.researchExerciseId || "").trim();
            if (explicitHostId && explicitHostId !== canonicalExerciseId) throw new Error("Host exercise identity does not match its executable recommendation snapshot.");
            if (!trustedCustom) throw new Error(hostIdentity?.reason || "Host exercise identity could not be reconciled.");
          }
        }
        return true;
      }

      function validateImportedExecutableRecommendationSnapshot(snapshot, engine, label, hostExercise = null) {
        try {
          return validateExecutableRecommendationSnapshot(snapshot, engine, hostExercise, label);
        } catch (error) {
          throw new Error(`${label} failed schema, checksum, identity, or taxonomy validation: ${error?.message || error}.`);
        }
      }

      function validateImportedExecutableRecommendationSnapshots(candidate, engine) {
        const sessionById = new Map(candidate.sessions.map((session) => [session.id, session]));
        candidate.exercises.forEach((exercise, index) => {
          if (!exercise.recommendationSnapshot) return;
          const session = sessionById.get(exercise.sessionId);
          const historical = session?.submitted === true || session?.workoutState === "completed";
          if (!historical) validateImportedExecutableRecommendationSnapshot(exercise.recommendationSnapshot, engine, `Active exercise ${index + 1} recommendationSnapshot`, exercise);
        });
        candidate.sessions.forEach((session, sessionIndex) => {
          if (session.submitted === true || session.workoutState === "completed") return;
          const recommendations = session.workoutPrescription?.recommendations;
          if (recommendations == null) return;
          if (!Array.isArray(recommendations)) throw new Error(`Active session ${sessionIndex + 1} workoutPrescription recommendations must be an array.`);
          recommendations.forEach((snapshot, snapshotIndex) => validateImportedExecutableRecommendationSnapshot(snapshot, engine, `Active session ${sessionIndex + 1} workout recommendation ${snapshotIndex + 1}`));
        });
        candidate.templates.forEach((template, templateIndex) => {
          template.exercises.forEach((exercise, exerciseIndex) => {
            if (exercise.recommendationSnapshot) validateImportedExecutableRecommendationSnapshot(exercise.recommendationSnapshot, engine, `Template ${templateIndex + 1} exercise ${exerciseIndex + 1} recommendationSnapshot`, exercise);
          });
        });
        return true;
      }

      function nextMonotonicImportRevision() {
        const current = Number(data?.dataRevision || 0);
        if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) throw new Error("Local data revision is exhausted or invalid; export the selected copy and clear local data before importing.");
        return current + 1;
      }

      async function importDataFile(file) {
        if (importInProgress) return;
        importInProgress = true;
        importAttempt += 1;
        importStatus = { state: "importing", message: `Importing ${file.name}...` };
        settingsMessage = importStatus.message;
        render();
        try {
          if (appDataPersistenceConflict) {
            throw new Error("Import is blocked because two valid saved app-data copies disagree and neither may be discarded automatically. Export downloads only the currently selected copy; the preserved alternate is excluded. Review the export, then use confirmed Clear All Local App Data before importing a replacement.");
          }
          if (Number(file.size || 0) > BACKUP_IMPORT_LIMITS.maxFileBytes) throw new Error("Backup file is too large; the maximum size is 8 MiB.");
          const text = await file.text();
          if (new TextEncoder().encode(text).byteLength > BACKUP_IMPORT_LIMITS.maxFileBytes) throw new Error("Backup file is too large; the maximum size is 8 MiB.");
          if (file.name.toLowerCase().endsWith(".csv") || text.startsWith("Date,Workout Name,Duration,Exercise Name")) {
            importStrongCsv(text);
            importStatus = { state: "accepted", message: settingsMessage || "Strong import complete." };
            return;
          }
          let parsed;
          try { parsed = JSON.parse(text); }
          catch { throw new Error("Backup is not valid JSON."); }
          const envelope = window.FitnessBackupContract.validateAndSanitizeBackup(parsed, { byteLength: new TextEncoder().encode(text).byteLength });
          const { backupSchemaVersion: _validatedBackupSchemaVersion, ...imported } = envelope;
          const validated = validateImportedAppData(imported, BACKUP_IMPORT_LIMITS);
          let preparedEvidence;
          if (validated.personalEvidencePackage) {
            const importedPackage = validated.personalEvidencePackage;
            validated.personalEvidencePackage = { ...validatePersonalEvidencePackage(importedPackage), importedAt: importedPackage.importedAt || isoNow() };
            preparedEvidence = personalEvidenceBundleForImport(validated.personalEvidencePackage.personalData);
          } else {
            preparedEvidence = researchOnlyBundleForImport();
          }
          const candidate = normalizeLoadedData(validated);
          candidate.dataRevision = nextMonotonicImportRevision();
          validateImportedExecutableRecommendationSnapshots(candidate, preparedEvidence.engine);
          await writeIndexedValue("app-data", candidate);
          try { localStorage.removeItem(STORAGE_KEY); } catch { /* The imported IndexedDB copy has the higher monotonic revision. */ }
          data = candidate;
          templateNumericDrafts.clear();
          installPreparedEvidence(preparedEvidence, candidate.personalEvidencePackage ? "imported backup evidence" : "research defaults");
          entityStructureRevision += 1;
          entityIndexCache = null;
          invalidateCompletedAnalysis();
          activeSessionId = data.sessions[0]?.id || "";
          activeWorkoutId = data.sessions.find((session) => sessionHasStarted(session) && !isSessionSubmitted(session))?.id || "";
          settingsMessage = "Import complete.";
          importStatus = { state: "accepted", message: settingsMessage };
          saveRuntime();
        } catch (error) {
          settingsMessage = error instanceof Error ? error.message : "Import failed.";
          importStatus = { state: "rejected", message: settingsMessage };
        } finally {
          importInProgress = false;
          render();
        }
      }

      async function importPersonalEvidenceFile(file) {
        try {
          window.clearTimeout(saveTimer);
          if (idleSaveHandle && "cancelIdleCallback" in window) window.cancelIdleCallback(idleSaveHandle);
          idleSaveHandle = 0;
          if (Number(file?.size || 0) > PERSONAL_EVIDENCE_IMPORT_LIMITS.maxFileBytes) throw new Error("Personal evidence file is too large; the maximum size is 8 MiB.");
          let parsed;
          const text = await file.text();
          if (new TextEncoder().encode(text).byteLength > PERSONAL_EVIDENCE_IMPORT_LIMITS.maxFileBytes) throw new Error("Personal evidence file is too large; the maximum size is 8 MiB.");
          try { parsed = JSON.parse(text); }
          catch { throw new Error("Personal evidence file is not valid JSON."); }
          const validated = validatePersonalEvidencePackage(parsed);
          const prepared = personalEvidenceBundleForImport(validated.personalData);
          const canonicalPackage = { ...validated, importedAt: isoNow() };
          const candidateData = { ...data, personalEvidencePackage: canonicalPackage, dataRevision: Number(data.dataRevision || 0) + 1 };
          await writeIndexedValue("app-data", candidateData);
          data = candidateData;
          const personalRecords = installPreparedEvidence(prepared, "imported local evidence");
          invalidateCompletedAnalysis();
          settingsMessage = `Private evidence imported: ${personalRecords} aggregate records, personal version ${prescriptionEvidenceStatus.personalVersion}.`;
          render();
        } catch (error) {
          settingsMessage = error?.message || "The personal evidence package could not be imported.";
          render();
        }
      }

      function isNumericEditAction(action) {
        return ["set-reps", "set-weight", "set-rpe", "set-duration", "set-distance", "template-exercise-sets", "template-exercise-reps", "template-exercise-rpe", "template-exercise-increment", "template-exercise-rest", "exercise-rest-seconds", "recovery-sleep-hours", "recovery-hrv", "recovery-resting-hr", "template-readiness-sleep-hours", "template-readiness-hrv", "template-readiness-resting-hr", "baseline-sleep-hours", "baseline-sleep-quality", "baseline-hrv", "baseline-resting-hr", "baseline-soreness", "baseline-band"].includes(action);
      }

      let lastInteractionFeedbackAt = 0;

      function feedbackLevelForAction(action, target) {
        if (!action) return "none";
        if (["confirm-submit-workout", "confirm-save-history-edits"].includes(action)) return "success";
        if (["confirm-delete-template", "confirm-clear-data", "confirm-cancel-workout", "confirm-cancel-history-edits", "delete-exercise", "delete-set", "delete-template-exercise"].includes(action)) return "warning";
        if (action === "toggle-set") {
          const set = data.sets.find((item) => item.id === target?.dataset?.setId);
          if (!set || set.completed) return "light";
          const remainingInExercise = data.sets.filter((item) => item.exerciseId === set.exerciseId && !item.isWarmup && !item.completed && !item.skipped && item.id !== set.id).length;
          return remainingInExercise === 0 ? "success" : "medium";
        }
        if (["start-timer", "skip-timer", "start-template", "start-template-with-metrics", "use-usual-readiness", "request-submit-workout", "request-save-history-edits", "begin-history-edit", "save-template", "update-template-exercise", "add-set", "add-warmup-set", "duplicate-set"].includes(action)) return "medium";
        if (["request-delete-template", "request-cancel-workout", "request-cancel-workout-from-template", "request-cancel-history-edits", "clear-data", "toggle-skip-set"].includes(action)) return "warning";
        if (["set-tab", "adjust-timer", "select-chart-exercise", "show-chart-point", "toggle-prescription-rationale", "open-fatigue-flag", "open-plan-volume-warning", "exercise-deload", "exercise-resistance-type", "exercise-bodyweight", "set-warmup", "timer-sound", "timer-vibration", "workout-completion-sound", "interaction-vibration", "timer-notifications", "in-app-rest-alerts", "toggle-rest-notifications", "preview-rest-complete-sound", "rest-complete-auto-return"].includes(action)) return "light";
        return "none";
      }

      function isHistoryWorkoutMutation(action) {
        return [
          "add-exercise", "move-exercise", "delete-exercise", "add-set", "add-warmup-set", "duplicate-set", "delete-set", "toggle-set", "toggle-skip-set", "start-timer",
          "session-title", "session-date", "session-travel", "session-notes",
          "exercise-name", "exercise-notes", "exercise-primary-muscle", "exercise-secondary-muscle", "exercise-deload", "exercise-resistance-type", "exercise-bodyweight", "exercise-rest-seconds",
          "set-reps", "set-weight", "set-rpe", "set-duration", "set-distance", "set-warmup",
          "recovery-sleep-hours", "recovery-sleep-quality", "recovery-hrv", "recovery-resting-hr", "recovery-soreness", "recovery-nutrition", "recovery-protein", "recovery-illness", "recovery-pain", "recovery-affected-muscle", "recovery-outside-note"
        ].includes(action);
      }

      function historyMutationIsLocked(action) {
        return isSessionSubmitted(activeSession()) && !isEditingHistorySession() && isHistoryWorkoutMutation(action);
      }

      function performInteractionFeedback(level) {
        if (!level || level === "none" || data.settings.interactionVibration === false || typeof navigator.vibrate !== "function") return;
        const now = Date.now();
        if (now - lastInteractionFeedbackAt < 90) return;
        lastInteractionFeedbackAt = now;
        const pattern = ({ light: 10, medium: 22, success: [24, 28, 42], warning: [28, 32, 28], error: [45, 35, 70] })[level];
        if (pattern) {
          try { navigator.vibrate(pattern); } catch { /* Visual feedback remains the fallback. */ }
        }
      }

      root.addEventListener("pointerdown", (event) => {
        const target = event.target.closest("button, select, summary[data-action], label.toggle-line, .alert-setting-card, .volume-card");
        if (!target || target.hasAttribute("disabled")) return;
        const actionTarget = event.target.closest("[data-action]") || target.querySelector?.("[data-action]");
        const level = feedbackLevelForAction(actionTarget?.dataset?.action || target.dataset.action, actionTarget || target);
        target.classList.add("is-pressing", "feedback-" + level);
        window.setTimeout(() => target.isConnected && target.classList.remove("is-pressing", "feedback-" + level), 180);
      });

      root.addEventListener("click", async (event) => {
        const target = event.target.closest("[data-action]");
        if (!target) return;
        const action = target.dataset.action;
        const executableWorkoutMutationActions = ["add-exercise", "add-set", "add-warmup-set", "duplicate-set", "toggle-set", "toggle-skip-set", "start-timer"];
        if (executableWorkoutMutationActions.includes(action) && !guardWorkoutMutation(action, { exerciseId: target.dataset.exerciseId, setId: target.dataset.setId }).allowed) {
          event.preventDefault();
          return;
        }
        if (historyMutationIsLocked(action)) {
          showAppToast("Choose Edit History before changing a logged workout.");
          render();
          return;
        }
        const interactionAccepted = action !== "confirm-submit-workout" || workoutSubmissionIsAccepted(activeSessionId);
        if (interactionAccepted) performInteractionFeedback(feedbackLevelForAction(action, target));
        if (action === "skip-content") {
          event.preventDefault();
          const mainContent = document.getElementById("main-content");
          if (mainContent) mainContent.focus({ preventScroll: false });
          return;
        }
        if (target.classList.contains("sheet-backdrop") && event.target !== target) return;
        if (target.tagName === "INPUT" && isNumericEditAction(action)) {
          target.dataset.replaceOnNextInput = "true";
          target.dataset.previousValue = target.value;
          target.select();
        }
        if (action === "set-tab") {
          if (target.dataset.tab === "lift" && viewingHistorySessionId && !historyEditFlow) {
            returnToLiftHome();
            return;
          }
          if (target.dataset.tab === "lift" && hasActiveWorkout()) activeSessionId = activeWorkoutId;
          if (historyEditFlow && target.dataset.tab !== "lift") {
            dialogFocusOrigins.history = focusDescriptorForElement(target) || { kind: "main" };
          }
          setActiveTab(target.dataset.tab);
        }
        if (action === "open-history") openDashboardDetailView({ type: "history" }, target);
        if (action === "toggle-theme") commit({ ...data, settings: { ...data.settings, theme: data.settings.theme === "light" ? "dark" : "light" } });
        if (action === "toggle-unit") commit(convertAppWeightUnit(data, data.settings.weightUnit === "lb" ? "kg" : "lb"));
        if (action === "request-notifications") enablePushNotifications();
        if (action === "toggle-rest-notifications") {
          const alerts = restAlertState();
          if (alerts.lockScreenReady) {
            await disablePushNotifications();
          } else {
            commit({ ...data, settings: { ...data.settings, timerNotifications: true, restCompleteLockScreenNotifications: true } }, false);
            await enablePushNotifications();
          }
        }
        if (action === "test-notification") sendTestPushNotification();
        if (action === "test-timer-sound") { primeTimerAlerts(); playTimerCompletionSound(); notificationMessage = "Foreground completion sound confirmed. Silent Mode and browser restrictions still apply."; commit({ ...data, settings: { ...data.settings, timerSound: true, setupSoundConfirmed: true } }); }
        if (action === "preview-rest-complete-sound") {
          restAudioSignal?.prime();
          restAudioSignal?.preview({ settings: { ...data.settings, timerSound: true, restCompleteSoundEnabled: true } });
          notificationMessage = "Played the selected foreground rest-complete sound once.";
          render();
        }
        if (action === "dismiss-install-guide") commit({ ...data, settings: { ...data.settings, installGuideDismissed: true } });
        if (action === "apply-update") applyPwaUpdate();
        if (action === "select-chart-exercise") selectChartExercise(target.dataset.exerciseId);
        if (action === "clear-chart-exercise-search") {
          chartExerciseDraft = "";
          chartExerciseSearchError = "";
          chartExerciseSearchOpen = true;
          chartExerciseHighlight = 0;
          const input = root.querySelector('[data-action="review-exercise-input"]');
          if (input) { input.value = ""; input.focus(); }
          updateExerciseSuggestionList();
        }
        if (action === "show-chart-point") {
          const activationKey = String(target.dataset.chartPointKey || "");
          const activation = /^cp_\d+_\d+$/.test(activationKey) ? chartPointActivations.get(activationKey) : null;
          const stillCurrent = activation
            && activation.exerciseId === selectedExerciseId
            && Number(activation.windowOffset || 0) === Number(hypertrophyWindowOffset || 0);
          chartDetailPoint = stillCurrent ? {
            ...activation.point,
            chartKey: activation.chartKey,
            exerciseId: activation.exerciseId,
            windowOffset: activation.windowOffset,
            throughDate: activation.throughDate,
            qualifyingWeekIds: activation.qualifyingWeekIds,
            resistanceType: activation.resistanceType,
            date: activation.point.date || activation.point.label
          } : null;
          render();
        }
        if (action === "close-chart-point") { chartDetailPoint = null; render(); }
        if (action === "toggle-hypertrophy-score") { hypertrophyScoreExpanded = !hypertrophyScoreExpanded; render(); }
        if (action === "select-chart-period") {
          hypertrophyWindowOffset = Math.max(0, Number(target.dataset.periodOffset || 0));
          hypertrophyScoreExpanded = false;
          chartDetailPoint = null;
          hypertrophyScoreLoading = true;
          render();
          window.setTimeout(() => { hypertrophyScoreLoading = false; render(); }, 80);
        }
        if (action === "new-session") addSession();
        if (action === "new-template") addTemplate();
        if (action === "begin-guided-mesocycle") beginGuidedMesocycle();
        if (action === "guided-step") setGuidedStep(target.dataset.step);
        if (action === "close-guided-mesocycle") { guidedMesocycleView = "closed"; guidedExerciseBrowserDayId = ""; guidedWeeklySummaryOpen = false; render(); }
        if (action === "open-guided-guidelines" || action === "guided-back-guidelines") { guidedMesocycleView = "guidelines"; guidedExerciseBrowserDayId = ""; guidedWeeklySummaryOpen = false; render(); }
        if (action === "open-guided-setup") setGuidedStep("setup");
        if (action === "create-guided-draft") createGuidedMesocycleDraft();
        if (action === "toggle-guided-day") { guidedSelectedDayId = target.dataset.dayId; render(); }
        if (action === "open-guided-exercise-browser") { guidedExerciseBrowserDayId = target.dataset.dayId; guidedExerciseSearch = ""; guidedPendingAssignment = null; render(); }
        if (action === "close-guided-exercise-browser") { guidedExerciseBrowserDayId = ""; guidedPendingAssignment = null; render(); }
        if (action === "choose-guided-muscle") { guidedExerciseMuscleFilter = target.dataset.muscleGroupId; if (!guidedExerciseBrowserDayId) guidedExerciseBrowserDayId = guidedSelectedDayId || guidedDraft()?.guidedDays?.[0]?.id || ""; guidedPendingAssignment = null; render(); }
        if (action === "select-guided-exercise") selectGuidedExercise(target.dataset.dayId, target.dataset.exerciseId, target.dataset.muscleGroupId);
        if (action === "guided-pending-set-change") { if (guidedPendingAssignment) { guidedPendingAssignment = { ...guidedPendingAssignment, workingSets: Math.max(1, Math.min(10, Number(guidedPendingAssignment.workingSets) + Number(target.dataset.delta))) }; render(); } }
        if (action === "cancel-guided-pending") { guidedPendingAssignment = null; render(); }
        if (action === "confirm-guided-exercise") confirmGuidedExercise();
        if (action === "guided-set-change") { const draft = guidedDraft(); const day = draft?.guidedDays.find((item) => item.id === target.dataset.dayId); const assignment = day?.assignments.find((item) => item.id === target.dataset.assignmentId); if (draft && assignment) updateGuidedDraft(guidedMesocycleApi.patchAssignment(draft, day.id, assignment.id, { workingSets: Math.max(1, Math.min(10, Number(assignment.workingSets) + Number(target.dataset.delta))) })); }
        if (action === "remove-guided-exercise") { const draft = guidedDraft(); if (draft) updateGuidedDraft(guidedMesocycleApi.removeAssignment(draft, target.dataset.dayId, target.dataset.assignmentId)); }
        if (action === "open-guided-weekly") { guidedWeeklySummaryOpen = true; render(); }
        if (action === "close-guided-weekly") { guidedWeeklySummaryOpen = false; render(); }
        if (action === "check-guided-viability") { guidedWeeklySummaryOpen = false; checkGuidedViability(); }
        if (action === "return-guided-builder") { guidedMesocycleView = "builder"; render(); }
        if (action === "accept-guided-finding") { const draft = guidedDraft(); if (draft) { const acceptedExceptions = Array.from(new Set([...(draft.acceptedExceptions || []), target.dataset.findingId])); const viabilityResult = { ...draft.viabilityResult, findings: draft.viabilityResult.findings.map((item) => item.id === target.dataset.findingId ? { ...item, accepted: true } : item) }; viabilityResult.blockingCount = viabilityResult.findings.filter((item) => !item.accepted && item.severity === 'blocking').length; updateGuidedDraft({ ...draft, acceptedExceptions, viabilityResult, viabilityStale: false, updatedAt: isoNow() }); } }
        if (action === "edit-guided-finding") { guidedSelectedDayId = target.dataset.dayId; guidedMesocycleView = "builder"; guidedGenerationReviewOpen = false; render(); }
        if (action === "open-guided-generation-review") { if (guidedStepUnlocked(guidedDraft(), "create")) { guidedGenerationReviewOpen = true; render(); } }
        if (action === "close-guided-generation-review") { guidedGenerationReviewOpen = false; render(); }
        if (action === "create-guided-templates") createGuidedTemplates();
        if (action === "edit-guided-day-from-review") { guidedSelectedDayId = target.dataset.dayId; guidedGenerationReviewOpen = false; guidedMesocycleView = "builder"; render(); }
        if (action === "view-created-templates") { guidedMesocycleView = "closed"; setActiveTab("plan"); }
        if (action === "view-completed-mesocycle") { guidedMesocycleView = "completion"; render(); }
        if (action === "start-first-mesocycle-template") { const draft = guidedDraft(); const templateId = draft?.creationResult?.templateIds?.[0] || draft?.linkedTemplateIds?.[0]; if (templateId) openTemplateStart(templateId); }
        if (action === "toggle-template-editor") {
          const templateId = target.dataset.templateId;
          if (expandedTemplateEditorIds.has(templateId)) expandedTemplateEditorIds.delete(templateId); else expandedTemplateEditorIds.add(templateId);
          render();
        }
        if (action === "preview-mesocycle") previewMesocyclePlan();
        if (action === "regenerate-mesocycle") regenerateMesocycleWithPracticalLimits(target.dataset.mesocycleId);
        if (action === "mesocycle-type-option") { mesocycleDraftType = target.dataset.value; render(); }
        if (action === "toggle-mesocycle-equipment") {
          const value = target.dataset.value;
          const current = new Set(mesocycleEquipmentSelection());
          if (value === "all") {
            current.clear();
            current.add("all");
          } else {
            current.delete("all");
            if (current.has(value)) current.delete(value); else current.add(value);
            if (!current.size) current.add("all");
          }
          commit({ ...data, settings: { ...data.settings, availableEquipment: Array.from(current) } });
        }
        if (action === "jump-mesocycle-slot") { selectedPrescriptionPoolMuscle = target.dataset.muscleGroupId; render(); }
        if (action === "toggle-mesocycle-alternates") {
          const slotId = target.dataset.slotId;
          if (expandedMesocycleAlternateSlots.has(slotId)) expandedMesocycleAlternateSlots.delete(slotId); else expandedMesocycleAlternateSlots.add(slotId);
          render();
        }
        if (action === "toggle-mesocycle-planner-review") { mesocyclePlannerExpanded = !mesocyclePlannerExpanded; render(); }
        if (action === "mesocycle-transition") transitionMesocyclePlan(target.dataset.mesocycleId, target.dataset.mesocycleAction);
        if (action === "confirm-mesocycle-scope") confirmMesocycleScope(target.dataset.mesocycleId);
        if (action === "add-mesocycle-muscle") addOmittedMuscleAndRebuild(target.dataset.mesocycleId, target.dataset.muscleGroupId);
        if (action === "select-mesocycle-candidate") selectMesocycleCandidate(target.dataset.mesocycleId, target.dataset.slotId, target.dataset.exerciseId);
        if (action === "compare-mesocycle-candidate") {
          const exerciseId = target.dataset.exerciseId;
          mesocycleComparisonIds = mesocycleComparisonIds.includes(exerciseId) ? mesocycleComparisonIds.filter((id) => id !== exerciseId) : [...mesocycleComparisonIds, exerciseId].slice(-3);
          render();
        }
        if (action === "request-delete-mesocycle") { pendingDeleteMesocycleId = target.dataset.mesocycleId; render(); }
        if (action === "cancel-delete-mesocycle") { pendingDeleteMesocycleId = ""; render(); }
        if (action === "confirm-delete-mesocycle") deleteMesocycleDraft(target.dataset.mesocycleId);
        if (action === "apply-prescription-override") applyPrescriptionOverride(target.dataset.exerciseId, target.closest("[data-override-form]"));
        if (action === "save-template") saveActiveSessionAsTemplate();
        if (action === "start-template") openTemplateStart(target.dataset.templateId);
        if (action === "return-active-workout") { templateStartFlow = null; activeSessionId = activeWorkoutId; setActiveTab("lift"); }
        if (action === "request-cancel-workout") requestCancelWorkout("workout", target.dataset.sessionId || "");
        if (action === "request-cancel-workout-from-template") requestCancelWorkout("template", activeWorkoutId);
        if (action === "keep-workout") closeCancelWorkout();
        if (action === "confirm-cancel-workout") discardActiveWorkout();
        if (action === "cancel-template-start") closeTemplateStart();
        if (action === "continue-template-start" && templateStartFlow) { templateStartFlow = { ...templateStartFlow, step: "readiness" }; render(); }
        if (action === "use-usual-readiness" && templateStartFlow) startTemplate(templateStartFlow.templateId, defaultRecovery(), "usual");
        if (action === "log-today-readiness" && templateStartFlow) { templateStartFlow = { ...templateStartFlow, step: "metrics" }; render(); }
        if (action === "review-template-readiness" && templateStartFlow) { templateStartFlow = { ...templateStartFlow, step: "review" }; render(); }
        if (action === "edit-readiness-metrics" && templateStartFlow) { templateStartFlow = { ...templateStartFlow, step: "metrics" }; render(); }
        if (action === "start-adjusted-workout" && templateStartFlow) startTemplate(templateStartFlow.templateId, templateStartFlow.draft, "daily");
        if (action === "start-original-workout" && templateStartFlow) startTemplate(templateStartFlow.templateId, templateStartFlow.draft, "daily-original", { useOriginal: true });
        if (action === "add-template-exercise") addTemplateExercise(target.dataset.templateId);
        if (action === "toggle-volume-muscle") {
          expandedVolumeMuscle = expandedVolumeMuscle === target.dataset.muscle ? "" : target.dataset.muscle;
          render();
        }
        if (action === "dashboard-week") {
          const date = new Date(dashboardWeekStart + "T00:00:00");
          date.setDate(date.getDate() + Number(target.dataset.direction || 0) * 7);
          dashboardWeekStart = localDateIso(date) > startOfWeekIso(todayIso()) ? startOfWeekIso(todayIso()) : localDateIso(date);
          dashboardDetail = null;
          dashboardFocusStack.length = 0;
          expandedVolumeMuscle = "";
          render();
        }
        if (action === "open-dashboard-detail") {
          openDashboardDetailView({ type: target.dataset.detail }, target);
        }
        if (action === "close-dashboard-detail") closeDashboardDetailView();
        if (action === "open-dashboard-session") openDashboardDetailView({ type: "session", id: target.dataset.sessionId }, target);
        if (action === "open-volume-session") openDashboardDetailView({ type: "session", id: target.dataset.sessionId, parent: "volume" }, target);
        if (action === "open-volume-exercise") {
          const exerciseId = canonicalExerciseId(target.dataset.exerciseName);
          if (exerciseCatalog().some((item) => item.id === exerciseId)) selectChartExercise(exerciseId);
          setActiveTab("charts");
        }
        if (action === "open-fatigue-flag") openDashboardDetailView({ type: "fatigue-flag", id: target.dataset.flagId }, target);
        if (action === "open-plan-volume-warning") { planVolumeDetailId = target.dataset.flagId; render(); window.scrollTo({ top: 0, behavior: preferredScrollBehavior() }); }
        if (action === "close-plan-volume-detail") { planVolumeDetailId = ""; render(); window.scrollTo({ top: 0, behavior: preferredScrollBehavior() }); }
        if (action === "dashboard-detail-parent") {
          closeDashboardDetailView();
        }
        if (action === "request-delete-template") {
          pendingDeleteTemplateId = target.dataset.templateId;
          render();
        }
        if (action === "cancel-delete-template") {
          pendingDeleteTemplateId = "";
          render();
        }
        if (action === "confirm-delete-template") {
          const templateId = target.dataset.templateId;
          pendingDeleteTemplateId = "";
          clearTemplateNumericDrafts(templateId);
          commit({ ...data, templates: data.templates.filter((template) => template.id !== templateId) });
        }
        if (action === "delete-template-exercise") {
          clearTemplateNumericDrafts(target.dataset.templateId, target.dataset.templateExerciseId);
          commit({
            ...data,
            templates: data.templates.map((template) => template.id === target.dataset.templateId
              ? { ...template, exercises: template.exercises.filter((exercise) => exercise.id !== target.dataset.templateExerciseId), updatedAt: isoNow() }
              : template)
          });
        }
        if (action === "add-exercise") addExercise();
        if (action === "move-exercise") moveExercise(target.dataset.exerciseId, target.dataset.direction);
        if (action === "delete-exercise") {
          if (timer?.exerciseId === target.dataset.exerciseId) cancelTimer("exercise-deleted", false);
          commit({ ...data, exercises: data.exercises.filter((exercise) => exercise.id !== target.dataset.exerciseId), sets: data.sets.filter((set) => set.exerciseId !== target.dataset.exerciseId) }, true, { invalidateAnalysis: false, deferPersistence: true });
          ensureActiveSet();
        }
        if (action === "add-set") addSet(target.dataset.exerciseId, false);
        if (action === "add-warmup-set") addWarmupSet(target.dataset.exerciseId);
        if (action === "duplicate-set") addSet(target.dataset.exerciseId, true);
        if (action === "delete-set") {
          if (timer?.setId === target.dataset.setId || timer?.pendingNextSetId === target.dataset.setId) cancelTimer("set-deleted", false);
          const removedSet = setById(target.dataset.setId);
          if (removedSet && isWorkingSet(removedSet, "score")) {
            const exercise = exerciseById(removedSet.exerciseId);
            const count = setsForExercise(removedSet.exerciseId).filter((set) => isWorkingSet(set, "score")).length;
            logWorkoutOverride(exercise, "setCount", count, Math.max(0, count - 1), { action: "delete_set", setId: removedSet.id });
          }
          commit({ ...data, sets: data.sets.filter((set) => set.id !== target.dataset.setId) }, true, { invalidateAnalysis: false, deferPersistence: true });
          ensureActiveSet();
        }
        if (action === "undo-set-type-override") undoManualSetType(target.dataset.setId);
        if (action === "toggle-set") toggleSetCompletion(target.dataset.setId);
        if (action === "toggle-skip-set") toggleSetSkipped(target.dataset.setId);
        if (action === "update-template-exercise") updateTemplateFromExercise(target.dataset.exerciseId);
        if (action === "request-submit-workout") { pendingSubmitSessionId = activeSessionId; render(); }
        if (action === "cancel-submit-workout") { pendingSubmitSessionId = ""; render(); }
        if (action === "confirm-submit-workout") submitWorkout(activeSessionId);
        if (action === "close-completed-summary") returnToLiftHome("Workout saved.");
        if (action === "begin-history-edit") await beginHistoryEdit();
        if (action === "request-save-history-edits") requestHistoryEditConfirmation("save");
        if (action === "request-cancel-history-edits") requestHistoryEditConfirmation("cancel");
        if (action === "keep-history-editing") closeHistoryEditConfirmation();
        if (action === "confirm-save-history-edits") saveHistoryEdits();
        if (action === "confirm-cancel-history-edits") cancelHistoryEdits();
        if (action === "return-lift-home") returnToLiftHome();
        if (action === "add-template-warmup") {
          const template = data.templates.find((item) => item.id === target.dataset.templateId);
          const exercise = template?.exercises.find((item) => item.id === target.dataset.templateExerciseId);
          const resistanceType = exercise?.resistanceType || inferResistanceType(exercise?.name || "", exercise || {});
          const warmups = [...(exercise?.warmups || []), { reps: 10, weight: 0, weightUnit: data.settings.weightUnit, resistanceType, isBodyweight: isBodyweightResistance(resistanceType), addedLoad: 0, assistanceLoad: 0, rpe: 5 }];
          patchTemplateExercise(target.dataset.templateId, target.dataset.templateExerciseId, { warmups });
        }
        if (action === "remove-template-warmup") {
          const template = data.templates.find((item) => item.id === target.dataset.templateId);
          const exercise = template?.exercises.find((item) => item.id === target.dataset.templateExerciseId);
          const warmups = (exercise?.warmups || []).filter((_, index) => index !== Number(target.dataset.warmupIndex));
          patchTemplateExercise(target.dataset.templateId, target.dataset.templateExerciseId, { warmups });
        }
        if (action === "start-timer") startTimer(target.dataset.exerciseId, target.dataset.setId);
        if (action === "toggle-timer") toggleTimer();
        if (action === "adjust-timer") adjustTimer(Number(target.dataset.seconds || 0));
        if (action === "skip-timer") cancelTimer("skipped", true);
        if (action === "clear-timer") cancelTimer("canceled", true);
        if (action === "return-to-rest-workout") {
          if (!restCompletionController?.returnToWorkout()) await navigateToRestCompletion(timerCompleteNotice?.payload || restNavigationState || {});
        }
        if (action === "dismiss-timer-notice") {
          if (!restCompletionController?.dismiss("manual")) { timerCompleteNotice = null; saveRuntime(); render(); }
        }
        if (action === "open-session") {
          const requestedSession = data.sessions.find((session) => session.id === target.dataset.sessionId);
          if (!requestedSession || (!isSessionSubmitted(requestedSession) && requestedSession.id !== activeWorkoutId)) {
            showAppToast("That draft is not the active workout.");
            return;
          }
          if (historyEditFlow && requestedSession.id !== historyEditFlow.sessionId) {
            historyEditConfirm = "cancel";
            render();
            return;
          }
          historyEditFlow = null;
          historyEditConfirm = "";
          activeSessionId = requestedSession.id;
          viewingHistorySessionId = isSessionSubmitted(requestedSession) ? requestedSession.id : "";
          planVolumeDetailId = "";
          setActiveTab("lift");
        }
        if (action === "export-data") exportData();
        if (action === "delete-remote-installation") await deleteRemoteInstallationData();
        if (action === "clear-data") await requestClearLocalData();
        if (action === "cancel-clear-data") closeClearDataFlow();
        if (action === "sync-before-clear") { await flushWorkoutSyncQueue(); clearDataFlow = { ...clearDataFlow, unsynced: await inspectUnsynchronizedData() }; render(); }
        if (action === "confirm-clear-data") await permanentlyClearLocalData();
      });

      root.addEventListener("change", async (event) => {
        const target = event.target.closest("[data-action]");
        if (!target) return;
        const action = target.dataset.action;
        if (historyMutationIsLocked(action)) return;
        if (templateNumericFields[action]) {
          handleTemplateNumericEdit(target);
          return;
        }
        if (action === "change-session") {
          const requestedSession = data.sessions.find((session) => session.id === target.value);
          if (!requestedSession || (!isSessionSubmitted(requestedSession) && requestedSession.id !== activeWorkoutId)) {
            activeSessionId = activeWorkoutId || activeSessionId;
            showAppToast("Only the active workout can be resumed. Finish or cancel it before starting another.");
            render();
            return;
          }
          activeSessionId = requestedSession.id;
          viewingHistorySessionId = isSessionSubmitted(requestedSession) ? requestedSession.id : "";
          render();
        }
        if (action === "session-date") patchSession({ date: target.value });
        if (action === "session-travel") patchSession({ isTravel: target.checked });
        if (action === "add-exercise-primary") addExercisePrimaryMuscle = target.value;
        if (action === "add-exercise-secondary") addExerciseSecondaryMuscle = target.value;
        if (action === "exercise-primary-muscle") patchExercise(target.dataset.exerciseId, { primaryMuscle: target.value });
        if (action === "exercise-secondary-muscle") patchExercise(target.dataset.exerciseId, { secondaryMuscle: target.value });
        if (action === "exercise-deload") {
          const exercise = exerciseById(target.dataset.exerciseId);
          const form = root.querySelector(`[data-override-form="${CSS.escape(target.dataset.exerciseId)}"]`);
          if (exercise?.recommendationSnapshot && form && exercise.sessionId === activeWorkoutId) {
            const deloadSelect = form.querySelector('[data-override-field="deload"]');
            const reasonInput = form.querySelector('[data-override-field="reason"]');
            if (deloadSelect) deloadSelect.value = target.checked ? "exercise_deload" : "normal";
            if (reasonInput) reasonInput.value = target.checked ? "Manual exercise-specific deload" : "Manual decision to resume normal exercise loading";
            applyPrescriptionOverride(exercise.id, form);
          } else patchExercise(target.dataset.exerciseId, { isDeload: target.checked });
        }
        if (action === "exercise-resistance-type") {
          const resistanceType = resistanceTypeValues.includes(target.value) ? target.value : "external";
          commit({
            ...data,
            exercises: data.exercises.map((exercise) => {
              if (exercise.id !== target.dataset.exerciseId) return exercise;
              const prescriptionWeight = ["bodyweight", "duration", "distance"].includes(resistanceType) ? 0 : Number(exercise.prescription?.weight || 0);
              const prescription = exercise.prescription ? { ...exercise.prescription, resistanceType, isBodyweight: isBodyweightResistance(resistanceType), weight: prescriptionWeight, addedLoad: resistanceType === "bodyweight_plus_load" ? prescriptionWeight : 0, assistanceLoad: resistanceType === "assisted_bodyweight" ? prescriptionWeight : 0 } : exercise.prescription;
              return { ...exercise, resistanceType, isBodyweight: isBodyweightResistance(resistanceType), prescription };
            }),
            sets: data.sets.map((set) => set.exerciseId === target.dataset.exerciseId ? normalizeResistanceSet({ ...set, weight: ["bodyweight", "duration", "distance"].includes(resistanceType) ? 0 : set.weight }, resistanceType) : set)
          });
        }
        if (action === "exercise-bodyweight") {
          const resistanceType = target.checked ? "bodyweight" : "external";
          commit({ ...data, exercises: data.exercises.map((exercise) => exercise.id === target.dataset.exerciseId ? { ...exercise, resistanceType, isBodyweight: target.checked } : exercise), sets: data.sets.map((set) => set.exerciseId === target.dataset.exerciseId ? normalizeResistanceSet(set, resistanceType) : set) });
        }
        if (action === "set-warmup") setManualType(target.dataset.setId, target.checked ? "warmup" : "straight");
        if (action === "set-type-override") setManualType(target.dataset.setId, target.value);
        if (action === "set-reps") patchSetValue(target.dataset.setId, "reps", target.value);
        if (action === "set-weight") patchSetValue(target.dataset.setId, "weight", target.value);
        if (action === "set-rpe") patchSetValue(target.dataset.setId, "rpe", target.value);
        if (action === "set-duration") patchSetValue(target.dataset.setId, "durationSeconds", target.value);
        if (action === "set-distance") patchSetValue(target.dataset.setId, "distance", target.value);
        if (action === "exercise-rest-seconds") patchExercise(target.dataset.exerciseId, { restSeconds: Number(target.value) });
        if (action === "template-exercise-resistance") { const resistanceType = resistanceTypeValues.includes(target.value) ? target.value : "external"; patchTemplateExercise(target.dataset.templateId, target.dataset.templateExerciseId, { resistanceType, isBodyweight: isBodyweightResistance(resistanceType) }); }
        if (action === "hypertrophy-window") {
          hypertrophyWindowOffset = Math.max(0, Number(target.value || 0));
          hypertrophyScoreExpanded = false;
          chartDetailPoint = null;
          hypertrophyScoreLoading = true;
          render();
          window.setTimeout(() => { hypertrophyScoreLoading = false; render(); }, 60);
        }
        if (action === "weight-unit") commit(convertAppWeightUnit(data, target.value));
        if (action === "theme-mode") commit({ ...data, settings: { ...data.settings, theme: target.value } });
        if (action === "training-goal") commit({ ...data, settings: { ...data.settings, trainingGoal: target.value } });
        if (action === "nutrition-phase") commit({ ...data, settings: { ...data.settings, nutritionPhase: target.value } });
        if (action === "experience-level") commit({ ...data, settings: { ...data.settings, experienceLevel: target.value } });
        if (action === "returning-after-gap") commit({ ...data, settings: { ...data.settings, returningAfterGap: target.value === "" ? null : target.value === "true" } });
        if (action === "cloud-workout-sync-consent") {
          await setCloudWorkoutSyncConsent(target.checked === true);
        }
        if (action === "mesocycle-type") { mesocycleDraftType = target.value; render(); }
        if (action === "mesocycle-specialization") { mesocycleSpecializationMuscle = target.value; render(); }
        if (action === "guided-exercise-muscle") { guidedExerciseMuscleFilter = target.value; guidedPendingAssignment = null; render(); }
        if (action === "guided-exercise-search") { guidedExerciseSearch = target.value; render(); }
        if (action === "move-guided-exercise") { const draft = guidedDraft(); if (draft) { const updated = guidedMesocycleApi.moveAssignment(draft, target.dataset.dayId, target.value, target.dataset.assignmentId); if (updated.assignmentError) { target.value = target.dataset.dayId; showAppToast("That exercise is already assigned to the selected day. Merge sets with the existing assignment instead."); } else updateGuidedDraft(updated); } }
        if (action === "mesocycle-muscle-scope") {
          const available = prescriptionEngine ? Array.from(new Set(prescriptionApi.representedMuscleGroups(prescriptionEngine.evidence).map(prescriptionApi.muscleFamily))) : [];
          if (!mesocycleScopeDraft) mesocycleScopeDraft = new Set(available);
          if (target.checked) mesocycleScopeDraft.add(target.value); else mesocycleScopeDraft.delete(target.value);
        }
        if (action === "mesocycle-pool-muscle") { selectedPrescriptionPoolMuscle = target.value; render(); }
        if (action === "mesocycle-training-days") commit({ ...data, settings: { ...data.settings, trainingDaysPerWeek: Math.max(1, Math.min(7, Number(target.value || 4))) } });
        if (action === "mesocycle-equipment") commit({ ...data, settings: { ...data.settings, availableEquipment: String(target.value || "").split(",").map((item) => item.trim()).filter(Boolean) } });
        if (action === "timer-sound") commit({ ...data, settings: { ...data.settings, timerSound: target.checked, setupSoundConfirmed: target.checked ? data.settings.setupSoundConfirmed : false } });
        if (action === "rest-complete-sound") commit({ ...data, settings: { ...data.settings, restCompleteSound: target.value } });
        if (action === "rest-complete-volume") commit({ ...data, settings: { ...data.settings, restCompleteSoundVolume: Math.max(0, Math.min(1, Number(target.value ?? 0.85))) } });
        if (action === "rest-complete-dismiss-seconds") commit({ ...data, settings: { ...data.settings, restCompleteAutoDismissMs: Math.max(1000, Math.min(60000, Math.round(Number(target.value || 5) * 1000))) } });
        if (action === "rest-complete-auto-return") commit({ ...data, settings: { ...data.settings, restCompleteAutoReturnToWorkout: target.checked } });
        if (action === "workout-completion-sound") commit({ ...data, settings: { ...data.settings, workoutCompletionSound: target.checked } });
        if (action === "timer-vibration") commit({ ...data, settings: { ...data.settings, timerVibration: target.checked } });
        if (action === "interaction-vibration") commit({ ...data, settings: { ...data.settings, interactionVibration: target.checked } });
        if (action === "timer-notifications") {
          if (target.checked) {
            commit({ ...data, settings: { ...data.settings, timerNotifications: true, restCompleteLockScreenNotifications: true } }, false);
            enablePushNotifications();
          } else {
            await disablePushNotifications();
          }
        }
        if (action === "in-app-rest-alerts") commit({ ...data, settings: { ...data.settings, inAppRestAlerts: target.checked } });
        if (action === "default-rest-seconds") commit({ ...data, settings: { ...data.settings, defaultRestSeconds: Math.max(15, Number(target.value || 90)) } });
        if (action === "notification-detail") commit({ ...data, settings: { ...data.settings, notificationMessageDetail: target.value } });
        if (action === "auto-start-rest") commit({ ...data, settings: { ...data.settings, autoStartRestTimer: target.checked } });
        if (action === "auto-highlight-next") commit({ ...data, settings: { ...data.settings, autoHighlightNextSet: target.checked } });
        if (action === "auto-scroll-next") commit({ ...data, settings: { ...data.settings, autoScrollNextSet: target.checked } });
        if (action === "recovery-sleep-quality") patchRecovery({ sleepQuality: target.value });
        if (action === "recovery-soreness") patchRecovery({ soreness: target.value });
        if (action === "recovery-nutrition") patchRecovery({ nutritionStatus: target.value });
        if (action === "recovery-protein") patchRecovery({ proteinStatus: target.value });
        if (action === "recovery-illness") patchRecovery({ illness: target.checked });
        if (action === "recovery-pain") patchRecovery({ pain: target.checked });
        if (action === "recovery-affected-muscle") patchRecovery({ affectedMuscle: target.value });
        if (action === "recovery-outside-note") patchRecovery({ outsideBandNote: target.value });
        if (action === "recovery-sleep-hours") patchRecovery({ sleepHours: target.value });
        if (action === "recovery-hrv") patchRecovery({ hrv: target.value });
        if (action === "recovery-resting-hr") patchRecovery({ restingHr: target.value });
        if (action === "baseline-sleep-hours") patchReadinessBaseline({ sleepHours: target.value });
        if (action === "baseline-sleep-quality") patchReadinessBaseline({ sleepQuality: target.value });
        if (action === "baseline-hrv") patchReadinessBaseline({ hrv: target.value });
        if (action === "baseline-resting-hr") patchReadinessBaseline({ restingHr: target.value });
        if (action === "baseline-soreness") patchReadinessBaseline({ soreness: target.value });
        if (action === "baseline-band") patchReadinessBaseline({ band: target.value });
        if (action === "template-readiness-sleep-quality") patchTemplateStartDraft({ sleepQuality: target.value }, false);
        if (action === "template-readiness-soreness") patchTemplateStartDraft({ soreness: target.value }, false);
        if (action === "template-readiness-nutrition") patchTemplateStartDraft({ nutritionStatus: target.value }, false);
        if (action === "template-readiness-protein") patchTemplateStartDraft({ proteinStatus: target.value }, false);
        if (action === "template-readiness-illness") patchTemplateStartDraft({ illness: target.checked }, false);
        if (action === "template-readiness-pain") patchTemplateStartDraft({ pain: target.checked }, false);
        if (action === "template-readiness-affected-muscle") patchTemplateStartDraft({ affectedMuscle: target.value }, false);
        if (action === "template-readiness-sleep-hours") patchTemplateStartDraft({ sleepHours: target.value }, false);
        if (action === "template-readiness-hrv") patchTemplateStartDraft({ hrv: target.value }, false);
        if (action === "template-readiness-resting-hr") patchTemplateStartDraft({ restingHr: target.value }, false);
        if (action === "clear-data-ack" && clearDataFlow) { clearDataFlow = { ...clearDataFlow, acknowledged: target.checked }; render(); }
        if (action === "import-data" && target.files[0]) importDataFile(target.files[0]);
        if (action === "import-personal-evidence" && target.files[0]) importPersonalEvidenceFile(target.files[0]);
      });

      root.addEventListener("focusin", (event) => {
        const target = event.target.closest("[data-action]");
        if (!target || target.tagName !== "INPUT") return;
        if (target.dataset.action === "review-exercise-input") {
          chartExerciseDraft = target.value;
          chartExerciseSearchError = "";
          chartExerciseSearchOpen = true;
          chartExerciseHighlight = 0;
          target.select();
          target.setAttribute("aria-expanded", "true");
          updateExerciseSuggestionList();
          return;
        }
        if (isNumericEditAction(target.dataset.action)) {
          target.dataset.replaceOnNextInput = "true";
          target.dataset.previousValue = target.value;
          target.select();
        }
      });

      root.addEventListener("focusout", (event) => {
        const target = event.target.closest("[data-action]");
        if (target?.dataset.action === "review-exercise-input") {
          if (event.relatedTarget?.closest?.('[data-action="select-chart-exercise"]')) return;
          window.setTimeout(() => {
            chartExerciseSearchOpen = false;
            const input = root.querySelector('[data-action="review-exercise-input"]');
            if (input) {
              input.value = selectedExerciseName();
              input.setAttribute("aria-expanded", "false");
            }
            updateExerciseSuggestionList();
          }, 0);
          return;
        }
        if (!target || target.tagName !== "INPUT" || !isNumericEditAction(target.dataset.action)) return;
        if (templateNumericFields[target.dataset.action]) {
          handleTemplateNumericEdit(target);
          return;
        }
        const nextTarget = event.relatedTarget?.closest?.("[data-action]");
        if (nextTarget && isNumericEditAction(nextTarget.dataset.action)) return;
        const action = target.dataset.action;
        if (action === "set-reps") patchSetValue(target.dataset.setId, "reps", target.value);
        if (action === "set-weight") patchSetValue(target.dataset.setId, "weight", target.value);
        if (action === "set-rpe") patchSetValue(target.dataset.setId, "rpe", target.value);
        if (action === "set-duration") patchSetValue(target.dataset.setId, "durationSeconds", target.value);
        if (action === "set-distance") patchSetValue(target.dataset.setId, "distance", target.value);
        if (action === "recovery-sleep-hours") patchRecovery({ sleepHours: target.value });
        if (action === "recovery-hrv") patchRecovery({ hrv: target.value });
        if (action === "recovery-resting-hr") patchRecovery({ restingHr: target.value });
        if (action === "baseline-sleep-hours") patchReadinessBaseline({ sleepHours: target.value });
        if (action === "baseline-sleep-quality") patchReadinessBaseline({ sleepQuality: target.value });
        if (action === "baseline-hrv") patchReadinessBaseline({ hrv: target.value });
        if (action === "baseline-resting-hr") patchReadinessBaseline({ restingHr: target.value });
        if (action === "baseline-soreness") patchReadinessBaseline({ soreness: target.value });
        if (action === "baseline-band") patchReadinessBaseline({ band: target.value });
        if (action === "template-readiness-sleep-hours") patchTemplateStartDraft({ sleepHours: target.value });
        if (action === "template-readiness-hrv") patchTemplateStartDraft({ hrv: target.value });
        if (action === "template-readiness-resting-hr") patchTemplateStartDraft({ restingHr: target.value });
      });

      root.addEventListener("beforeinput", (event) => {
        const target = event.target.closest("[data-action]");
        if (!target || target.tagName !== "INPUT" || !isNumericEditAction(target.dataset.action)) return;
        if (target.dataset.replaceOnNextInput === "true" && event.inputType && event.inputType.startsWith("insert")) {
          event.preventDefault();
          target.value = event.data || "";
          target.dataset.replaceOnNextInput = "false";
          target.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          target.dataset.replaceOnNextInput = "false";
        }
      });

      root.addEventListener("keydown", (event) => {
        const target = event.target.closest("[data-action]");
        if (target?.dataset.action === "return-to-rest-workout" && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          navigateToRestCompletion(timerCompleteNotice?.payload || restNavigationState || {});
          return;
        }
        if (event.key === "Escape" && (templateStartFlow || cancelWorkoutFlow || historyEditConfirm || clearDataFlow?.open)) {
          event.preventDefault();
          if (templateStartFlow) closeTemplateStart();
          else if (cancelWorkoutFlow) closeCancelWorkout();
          else if (historyEditConfirm) closeHistoryEditConfirmation();
          else closeClearDataFlow();
          return;
        }
        if (event.key === "Tab" && (templateStartFlow || cancelWorkoutFlow || historyEditConfirm || clearDataFlow?.open)) {
          const activeDialog = root.querySelector('[role="dialog"][aria-modal="true"]');
          const focusable = visibleEnabledFocusableElements(activeDialog);
          if (focusable.length) {
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!activeDialog.contains(document.activeElement)) { event.preventDefault(); focusVisibleEnabledElement(first); return; }
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); focusVisibleEnabledElement(last); return; }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); focusVisibleEnabledElement(first); return; }
          }
        }
        if (target?.dataset.action === "review-exercise-input") {
          const matches = matchingChartExercises(chartExerciseDraft);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            chartExerciseSearchOpen = true;
            chartExerciseHighlight = matches.length ? (chartExerciseHighlight + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length : 0;
            updateExerciseSuggestionList();
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            if (confirmChartExerciseDraft()) return;
            chartExerciseDraft = selectedExerciseName();
            chartExerciseSearchOpen = false;
            chartExerciseSearchError = "No logged exercise matched. The previous lift remains selected.";
            performInteractionFeedback("error");
            target.value = chartExerciseDraft;
            target.setAttribute("aria-expanded", "false");
            updateExerciseSuggestionList();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            chartExerciseDraft = selectedExerciseName();
            chartExerciseSearchOpen = false;
            target.value = chartExerciseDraft;
            target.setAttribute("aria-expanded", "false");
            updateExerciseSuggestionList();
            target.blur();
            return;
          }
        }
        if (target?.dataset.action === "show-chart-point" && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); target.dispatchEvent(new MouseEvent("click", { bubbles: true })); return; }
        if (!target || target.tagName !== "INPUT" || !isNumericEditAction(target.dataset.action)) return;
        if (target.dataset.replaceOnNextInput !== "true") return;
        if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 || !/[\d.]/.test(event.key)) {
          target.dataset.replaceOnNextInput = "false";
          return;
        }
        event.preventDefault();
        target.value = event.key;
        target.dataset.replaceOnNextInput = "false";
        target.dispatchEvent(new Event("input", { bubbles: true }));
      });

      root.addEventListener("input", (event) => {
        const inputStartedAt = performanceNow();
        const target = event.target.closest("[data-action]");
        if (!target) return;
        const action = target.dataset.action;
        if (historyMutationIsLocked(action)) return;
        if (target.tagName === "INPUT" && isNumericEditAction(action) && target.dataset.replaceOnNextInput === "true") {
          const previousValue = target.dataset.previousValue || "";
          let replacement = target.value;
          const inserted = typeof event.data === "string" ? event.data : "";
          if (previousValue && inserted.length === 1 && replacement === previousValue + inserted) replacement = inserted;
          target.value = replacement;
          target.dataset.replaceOnNextInput = "false";
        }
        if (templateNumericFields[action]) {
          handleTemplateNumericEdit(target);
          return;
        }
        if (action === "add-exercise-draft") {
          addExerciseDraft = target.value;
          const addButton = root.querySelector('[data-action="add-exercise"]');
          const safety = guardWorkoutMutation("add-exercise", {}, false);
          if (addButton) {
            addButton.disabled = !safety.allowed;
            addButton.setAttribute("aria-disabled", safety.allowed ? "false" : "true");
            if (safety.allowed) addButton.removeAttribute("data-safety-reason");
            else addButton.dataset.safetyReason = safety.message || "Blocked by the current workout safety restriction";
          }
        }
        if (action === "mesocycle-duration") mesocycleDurationDraft = target.value;
        if (action === "review-exercise-input") {
          chartExerciseDraft = target.value;
          chartExerciseSearchOpen = true;
          chartExerciseHighlight = 0;
          chartExerciseSearchError = "";
          target.setAttribute("aria-expanded", "true");
          updateExerciseSuggestionList();
          return;
        }
        if (action === "session-title") patchSession({ title: target.value }, false);
        if (action === "session-notes") patchSession({ notes: target.value }, false);
        if (action === "exercise-name") { target.style.height = "auto"; target.style.height = Math.max(38, target.scrollHeight) + "px"; patchExerciseName(target.dataset.exerciseId, target.value, false); }
        if (action === "exercise-notes") patchExercise(target.dataset.exerciseId, { notes: target.value }, false);
        if (action === "set-reps") patchSetValue(target.dataset.setId, "reps", target.value, false);
        if (action === "set-weight") patchSetValue(target.dataset.setId, "weight", target.value, false);
        if (action === "set-rpe") patchSetValue(target.dataset.setId, "rpe", target.value, false);
        if (action === "set-duration") patchSetValue(target.dataset.setId, "durationSeconds", target.value, false);
        if (action === "set-distance") patchSetValue(target.dataset.setId, "distance", target.value, false);
        if (action === "exercise-rest-seconds") patchExercise(target.dataset.exerciseId, { restSeconds: Number(target.value) }, false);
        if (action === "template-name") patchTemplate(target.dataset.templateId, { name: target.value }, false);
        if (action === "template-exercise-name") patchTemplateExerciseName(target.dataset.templateId, target.dataset.templateExerciseId, target.value, false);
        if (action === "recovery-sleep-hours") patchRecovery({ sleepHours: target.value }, false);
        if (action === "recovery-hrv") patchRecovery({ hrv: target.value }, false);
        if (action === "recovery-resting-hr") patchRecovery({ restingHr: target.value }, false);
        if (action === "recovery-outside-note") patchRecovery({ outsideBandNote: target.value }, false);
        if (action === "baseline-sleep-hours") patchReadinessBaseline({ sleepHours: target.value }, false);
        if (action === "baseline-sleep-quality") patchReadinessBaseline({ sleepQuality: target.value }, false);
        if (action === "baseline-hrv") patchReadinessBaseline({ hrv: target.value }, false);
        if (action === "baseline-resting-hr") patchReadinessBaseline({ restingHr: target.value }, false);
        if (action === "baseline-soreness") patchReadinessBaseline({ soreness: target.value }, false);
        if (action === "baseline-band") patchReadinessBaseline({ band: target.value }, false);
        if (action === "template-readiness-sleep-hours") patchTemplateStartDraft({ sleepHours: target.value }, false);
        if (action === "template-readiness-hrv") patchTemplateStartDraft({ hrv: target.value }, false);
        if (action === "template-readiness-resting-hr") patchTemplateStartDraft({ restingHr: target.value }, false);
        if (action === "template-readiness-note") patchTemplateStartDraft({ outsideBandNote: target.value }, false);
        if (action === "clear-data-phrase" && clearDataFlow) {
          clearDataFlow.phrase = target.value;
          const finalButton = root.querySelector('[data-action="confirm-clear-data"]');
          if (finalButton) finalButton.disabled = !(clearDataFlow.acknowledged && clearDataFlow.phrase === "CLEAR");
        }
        if (action.startsWith("set-") || action === "exercise-notes" || action === "session-notes") {
          recordPerformance("input:" + action, inputStartedAt, { setId: target.dataset.setId || "", exerciseId: target.dataset.exerciseId || "" });
        }
      });

      async function applyWorkoutDeepLink() {
        const params = new URLSearchParams(window.location.search);
        if (params.get("view") === "settings") {
          setActiveTab("data", { replace: true, renderNow: false });
          return;
        }
        if (params.get("rest") === "complete") {
          await navigateToRestCompletion({
            navigationVersion: 1,
            workoutId: params.get("workoutId") || "",
            exerciseId: params.get("exerciseId") || "",
            completedSetId: params.get("completedSetId") || "",
            nextSetId: params.get("nextSetId") || "",
            timerId: params.get("timerId") || "",
            notificationId: params.get("notificationId") || "",
            timerVersion: Number(params.get("timerVersion") || 1)
          }, { silent: true });
          window.history.replaceState({ ...(window.history.state || {}), tab: "lift" }, "", tabUrl("lift"));
          return;
        }
        if (params.get("workout") !== "active") return;
        const setId = params.get("set") || "";
        const exerciseId = params.get("exercise") || "";
        const exercise = data.exercises.find((item) => item.id === exerciseId);
        if (exercise && data.sessions.some((session) => session.id === exercise.sessionId)) {
          const session = data.sessions.find((item) => item.id === exercise.sessionId);
          if (session && ((!isSessionSubmitted(session) && session.id === activeWorkoutId) || isSessionSubmitted(session))) activeSessionId = exercise.sessionId;
        } else if (activeWorkoutId) activeSessionId = activeWorkoutId;
        if (data.sets.some((set) => set.id === setId)) setActiveSet(setId, "Set is ready", false);
        setActiveTab("lift", { replace: true, renderNow: false });
        window.setTimeout(() => scheduleActiveSetScroll(setId), 120);
      }

      async function registerPwaServiceWorker() {
        if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
        try {
          const registration = await navigator.serviceWorker.register("/sw.js");
          updateRegistration = registration;
          if (registration.waiting) {
            updateAvailable = true;
            render();
          }
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                updateAvailable = true;
                render();
              }
            });
          });
          navigator.serviceWorker.addEventListener("message", (event) => {
            if (event.data?.type === "REST_NOTIFICATION_CLICK") {
              navigateToRestCompletion(event.data.payload || {});
              return;
            }
            if (event.data?.type === "REST_PUSH_RECEIVED" && timer && timer.endsAt <= Date.now()) {
              timer.remainingSeconds = 0;
              completeTimer();
            }
          });
          let refreshing = false;
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshing) return;
            if (historyEditFlow || historyEditStartPending) {
              pendingControllerReload = true;
              updateAvailable = true;
              render();
              return;
            }
            refreshing = true;
            window.location.reload();
          });
        } catch {
          settingsMessage = "Offline support could not be initialized. Reopen the app while online and try again.";
        }
      }

      async function applyPwaUpdate() {
        if (historyEditFlow || historyEditStartPending) {
          if (historyEditFlow) requestHistoryEditConfirmation("cancel");
          updateAvailable = true;
          return false;
        }
        const stableData = cloneAppData(data);
        const persisted = await persistStableAppDataSnapshot(stableData);
        if (!persisted) {
          updateAvailable = true;
          showAppToast("The update was not applied because the current app state could not be saved.");
          render();
          return false;
        }
        saveRuntime();
        if (historyEditFlow || historyEditStartPending) {
          updateAvailable = true;
          return false;
        }
        if (pendingControllerReload) {
          pendingControllerReload = false;
          updateAvailable = false;
          window.location.reload();
          return true;
        }
        const registration = updateRegistration || await navigator.serviceWorker?.getRegistration?.();
        registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
        return true;
      }

      async function boot() {
        await loadData();
        await initializePrescriptionEvidence();
        installDevelopmentPerformanceFixture();
        await applyWorkoutDeepLink();
        if (!primaryTabIds.includes(window.location.hash.replace(/^#/, ""))) window.history.replaceState({ ...(window.history.state || {}), tab: activeTab }, "", tabUrl(activeTab));
        render();
        scheduleSave();
        registerPwaServiceWorker();
        fetchPushConfig();
        reconcileWorkoutSyncConsent();
        reconcilePushRevocation();
        flushWorkoutSyncQueue();
        flushPendingPushOperations();
        if (pushIdentity?.token && (pushIdentity.status === "deleting" || pushIdentity.deletion?.retryable === true) && navigator.onLine) deleteRemoteInstallationData({ automatic: true });
      }

      boot();

      function persistBeforeSuspend() {
        if (historyEditFlow) {
          cancelPendingDataSave();
          saveRuntime();
          return;
        }
        if (hasActiveWorkout()) persistActiveWorkoutDraft();
        else saveData();
        saveRuntime();
      }

      window.addEventListener("pagehide", persistBeforeSuspend);
      window.addEventListener("beforeunload", persistBeforeSuspend);
      window.addEventListener("popstate", () => {
        const nextTab = tabFromLocation();
        if (historyEditFlow && nextTab !== "lift") {
          activeTab = "lift";
          window.history.pushState({ ...(window.history.state || {}), tab: "lift" }, "", tabUrl("lift"));
          requestHistoryEditConfirmation("cancel", { preserveOrigin: true });
          return;
        }
        if (nextTab === activeTab) return;
        tabScrollPositions.set(activeTab, window.scrollY);
        activeTab = nextTab;
        queuePostRenderFocus({ kind: "main" });
        render();
        window.setTimeout(() => window.scrollTo({ top: tabScrollPositions.get(activeTab) || 0, behavior: "auto" }), 0);
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && hasActiveWorkout()) persistActiveWorkoutDraft();
        if (document.visibilityState === "visible") restCompletionController?.sync();
        if (!timer || timer.isPaused || !timer.isActive) return;
        if (document.visibilityState === "hidden") timer.backgroundedAt = Date.now();
        timer.remainingSeconds = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
        if (timer.remainingSeconds === 0) completeTimer();
        else if (document.visibilityState === "visible") {
          timer.backgroundedAt = 0;
          requestTimerWakeLock();
          render();
        }
      });
      window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPromptEvent = event; });
      window.addEventListener("online", () => {
        reconcileWorkoutSyncConsent();
        reconcilePushRevocation();
        flushWorkoutSyncQueue();
        flushPendingPushOperations();
        if (pushIdentity?.token && (pushIdentity.status === "deleting" || pushIdentity.deletion?.retryable === true)) deleteRemoteInstallationData({ automatic: true });
        if (timer?.isActive && !timer.isPaused && timer.endsAt > Date.now() && timer.notificationStatus !== "scheduled") scheduleRestPush({ ...timer });
      });
