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
      const programmingFamilyApi = window.ComprehensiveFitnessProgrammingFamilyLedger || null;
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
