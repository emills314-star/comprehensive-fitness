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
      const SET_CLASSIFIER_VERSION = 3;
      const DOMAIN_MIGRATION_VERSION = 4;
      const WORKOUT_DURATION_SEMANTICS_VERSION = "comprehensive-fitness-workout-duration/1.0.0";
      const READINESS_DEVIATIONS = new Set(["", "usual", "unusually_good", "meaningfully_poor"]);
      const BACKUP_IMPORT_LIMITS = Object.freeze({
        maxFileBytes: 50 * 1024 * 1024,
        maxRawImportBytes: 10 * 1024 * 1024,
        maxJsonDepth: 32,
        maxObjectKeys: 128,
        maxSessions: 100000,
        maxExercises: 100000,
        maxSets: 100000,
        maxTemplates: 100000
      });
      const root = document.getElementById("root");
      const defaultSettings = {
        weightUnit: "lb",
        timerSound: true,
        timerVibration: true,
        timerNotifications: true,
        inAppRestAlerts: true,
        restCompleteSound: "sharp_two_tone",
        restCompleteSoundVolume: 0.85,
        restCompleteAutoDismissMs: 5000,
        restCompleteAutoReturnToWorkout: false,
        defaultRestSeconds: 90,
        notificationMessageDetail: "exercise-set",
        autoStartRestTimer: true,
        autoHighlightNextSet: true,
        installGuideDismissed: false,
        setupSoundConfirmed: false,
        expectedTemplateId: ""
      };
      let data = emptyData();
      const primaryTabIds = ["today", "progress"];
      const currentDestinationIds = ["today", "progress", "workout", "routines", "settings"];
      const focusActionAllowlist = new Set([
        "set-tab", "start-template", "start-next-template", "toggle-set", "set-weight", "set-reps", "set-rpe", "set-duration", "set-distance", "reconcile-apply", "reconcile-dismiss", "session-menu", "request-submit-workout", "request-cancel-workout", "request-save-history-edits", "request-cancel-history-edits", "clear-data",
        "resume-active-workout", "finish-active-workout", "discard-active-workout", "log-template-readiness", "log-workout-readiness", "start-workout-with-readiness", "save-workout-readiness",
        "set-expected-template", "toggle-workout-pause", "handle-resolved-action",
        "open-routines", "open-settings", "close-secondary-context", "close-workout-context",
        "keep-workout", "keep-history-editing", "cancel-clear-data",
        "open-history", "open-progress", "retry-view-render", "focus-workout-exercise",
        "show-chart-point", "close-chart-point",
        "cancel-template-start",
        "template-readiness-deviation", "template-readiness-illness",
        "template-readiness-pain", "template-readiness-affected-muscle", "template-readiness-note",
        "adjust-default-rest",
        "clear-data-ack", "clear-data-phrase", "export-data", "export-before-clear", "confirm-clear-data", "confirm-cancel-workout",
        "confirm-save-history-edits", "confirm-cancel-history-edits"
      ]);
      const focusDescriptorDataKeys = ["tab", "templateId", "sessionId", "exerciseId", "setId", "field", "chartKey", "chartDate"];
      const focusableCandidateSelector = 'button, input, select, textarea, a[href], summary, [tabindex]';
      let activeTab = tabFromLocation();
      const tabScrollPositions = new Map();
      let activeSessionId = "";
      let activeWorkoutId = "";
      let workoutFocusExerciseId = "";
      let historyReturnExerciseId = "";
      let viewRenderError = null;
      let timer = null;
      let activeDraftSequence = 0;
      let timerInterval = 0;
      let workoutDurationInterval = 0;
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
      let pushIdentity = null;
      let pushConfig = null;
      let installPromptEvent = null;
      let updateRegistration = null;
      let updateAvailable = false;
      let pendingControllerReload = false;
      let persistenceReady = false;
      let storagePersistenceStatus = "unsupported";
      const restSchedulePromises = new Map();
      const canceledRestScheduleKeys = new Map();
      let pushOperationWriteChain = Promise.resolve();
      let selectedExerciseId = "";
      let chartExerciseDraft = "";
      let chartExerciseSearchOpen = false;
      let chartExerciseSearchError = "";
      let progressDateWindow = "recent";
      let chartExerciseHighlight = 0;
      let recentChartExerciseIds = [];
      const chartPointActivations = new Map();
      let chartPointActivationEpoch = 0;
      let chartPointActivationSequence = 0;
      let addExerciseDraft = "";
      let addExercisePrimaryMuscle = "";
      let addExerciseSecondaryMuscle = "";
      let addExerciseSetCount = 1;
      let addExerciseRepMin = 8;
      let addExerciseRepMax = 12;
      let addExerciseTargetRpe = 8;
      let addExerciseRestSeconds = 0;
      let exportText = "";
      let clearDataFlow = null;
      let cancelWorkoutFlow = null;
      let historyEditFlow = null;
      let historyEditStartPending = false;
      let historyEditConfirm = "";
      let viewingHistorySessionId = "";
      let appToast = null;
      const appToastQueue = [];
      let appToastTimer = 0;
      const openDisclosureIds = new Set();
      const knownDisclosureIds = new Set();
      let pendingDeleteTemplateId = "";
      let settingsMessage = "";
      let appDataPersistenceConflict = null;

      async function readStoragePersistenceStatus() {
        if (typeof navigator === "undefined" || typeof navigator.storage?.persisted !== "function") return "unsupported";
        try {
          return await navigator.storage.persisted() ? "granted" : "not-granted";
        } catch {
          return "unsupported";
        }
      }
      let importInProgress = false;
      let importAttempt = 0;
      let importStatus = { state: "idle", message: "" };
      let strongImportWeightUnit = "";
      let saveTimer = 0;
      let draftSaveTimer = 0;
      let idleSaveHandle = 0;
      let interactionRenderFrame = 0;
      let pendingFocusDescriptor = null;
      let renderedDialogKey = "";
      const dialogFocusOrigins = { template: null, readiness: null, cancel: null, history: null, clear: null };
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
          const gradeScore = recentHistoryScores[dayOffset] ?? 78 + (dayOffset % 18);
          const letter = gradeScore >= 90 ? "A" : gradeScore >= 80 ? "B" : gradeScore >= 70 ? "C" : gradeScore >= 60 ? "D" : "F";
          sessions.push({ id: sessionId, date: dateIso, completedAt: dateIso, submitted: true, workoutState: "completed", title: recentHistoryTitles[dayOffset] || (dayOffset % 2 ? "Tuesday - Heavy Push + Calves + Light Quads" : "Sunday - Light Upper + Posterior Chain"), createdAt: dateIso + "T12:00:00.000Z", updatedAt: dateIso + "T13:00:00.000Z", workoutAnalysis: { contractVersion: "comprehensive-fitness-workout-grade/2.0.0", algorithmVersion: "actual-work-rubric/1.0.0", letter, reasons: [{ code: "actual_work", text: names.length * 4 + " valid working sets recorded." }, { code: "logging_validity", text: "Load, repetitions, and RPE are complete for every recorded working set." }], sourceSessionId: sessionId, resolvedActionDecisionIds: [], createdAt: dateIso + "T13:00:00.000Z" } });
          names.forEach((name, exerciseIndex) => {
            const exerciseId = sessionId + "-exercise-" + exerciseIndex;
            exercises.push({ id: exerciseId, sessionId, name, order: exerciseIndex, resistanceType: "external", restSeconds: 90, primaryMuscle: "", secondaryMuscle: "" });
            for (let setIndex = 0; setIndex < 4; setIndex += 1) {
              sets.push({ id: exerciseId + "-set-" + setIndex, exerciseId, setNumber: setIndex + 1, sequenceIndex: setIndex, sequence: setIndex, setType: setIndex === 0 ? "top" : "backoff", reps: 8 + (setIndex % 2), weight: 50 + exerciseIndex * 10 + Math.floor(dayOffset / 30) * 2.5, weightUnit: "lb", resistanceType: "external", rpe: 7.5 + (setIndex % 3) * 0.5, completed: true, skipped: false, edited: false, countsTowardProgression: true, targetReps: 9, targetRepMin: 8, targetRepMax: 12, targetRpe: 8, targetRpeMin: 7, targetRpeMax: 9 });
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
      let analysisRevision = 0;
      let entityStructureRevision = 0;
      let entityIndexCache = null;
      let completedAnalysisIndexCache = null;
      let exerciseCatalogCache = null;
      const activeHistoryCache = new Map();
      const activeHistoryIdCache = new Map();
      const previousPerformanceCache = new Map();
      const submittedPerformanceIndexCache = new Map();
      const exerciseProgressCache = new Map();
      const prescriptionIdentityResolutionCache = new Map();
      let prescriptionIdentityCacheEngine = null;
      let prescriptionIdentityCacheResolver = null;
      const templateNumericDrafts = new Map();
      const templateNumericFields = Object.freeze({
        "template-exercise-sets": Object.freeze({ field: "sets", label: "sets", min: 1, max: 100, step: 1, integer: true }),
        "template-exercise-rep-min": Object.freeze({ field: "repMin", label: "minimum repetitions", min: 1, max: 100, step: 1, integer: true }),
        "template-exercise-rep-max": Object.freeze({ field: "repMax", label: "maximum repetitions", min: 1, max: 100, step: 1, integer: true }),
        "template-exercise-rpe": Object.freeze({ field: "targetRpe", label: "target RPE", min: 5, max: 10, step: 0.5, integer: false }),
        "template-exercise-rest": Object.freeze({ field: "restSeconds", label: "rest seconds", min: 15, max: 3600, step: 15, integer: true })
      });
      const recentHistoryDataIssueIds = new Set();
      let templateStartFlow = null;
      let optionalReadinessFlow = null;
      const prescriptionApi = window.ComprehensiveFitnessPrescriptionEngine || null;
      const exceptionResolverApi = window.FitnessExceptionResolver || null;
      let prescriptionEngine = prescriptionApi?.createPrescriptionEngine({}) || null;
      let exerciseIdentityCatalogPromise = null;
      let importValidationResearchPromise = null;
      const expandedTemplateEditorIds = new Set();

      const svgIcon = (paths, viewBox = "0 0 24 24") => '<svg class="ui-icon" viewBox="' + viewBox + '" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + paths + '</svg>';
      const icon = {
        workout: svgIcon('<path d="M4 9.5v5M7.5 5.5v13M16.5 5.5v13M20 9.5v5M7.5 12h9"/>'),
        templates: svgIcon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>'),
        review: svgIcon('<path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/>'),
        settings: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.37.7.68.95.3.25.7.4 1.1.4H21v4h-.1c-.4 0-.8.14-1.1.4-.2.08-.3.16-.4.25Z"/>'),
        add: svgIcon('<path d="M12 5v14M5 12h14"/>'),
        clock: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
        done: svgIcon('<path d="m5 12 4 4L19 6"/>'),
        delete: svgIcon('<path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7m3 4v5m4-5v5"/>'),
        pause: svgIcon('<path d="M9 7v10M15 7v10"/>'),
        play: svgIcon('<path d="m9 6 9 6-9 6Z"/>'),
        duplicate: svgIcon('<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
        download: svgIcon('<path d="M12 3v12m-4-4 4 4 4-4M5 20h14"/>'),
        upload: svgIcon('<path d="M12 15V3m-4 4 4-4 4 4M5 20h14"/>'),
        grip: svgIcon('<circle cx="8" cy="7" r=".7" fill="currentColor" stroke="none"/><circle cx="16" cy="7" r=".7" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r=".7" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r=".7" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r=".7" fill="currentColor" stroke="none"/><circle cx="16" cy="17" r=".7" fill="currentColor" stroke="none"/>'),
        more: svgIcon('<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>'),
        up: svgIcon('<path d="m6 14 6-6 6 6"/>'),
        down: svgIcon('<path d="m6 10 6 6 6-6"/>'),
        info: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
        warning: svgIcon('<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17h.01"/>'),
        left: svgIcon('<path d="m15 18-6-6 6-6"/>'),
        right: svgIcon('<path d="m9 6 6 6-6 6"/>'),
        close: svgIcon('<path d="m6 6 12 12M18 6 6 18"/>')
      };

      function emptyData() {
        return { appDataVersion: 3, sessions: [], exercises: [], sets: [], templates: [], rawImports: [], migrationAudit: [], dataRevision: 0, settings: { ...defaultSettings } };
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
        const key = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
        if (["w", "warmup", "warmupset"].includes(key)) return "warmup";
        if (["working", "work", "workingset", "workset", "straight", "straightset"].includes(key)) return "straight";
        if (["top", "topset"].includes(key)) return "top";
        if (["backoff", "backoffset"].includes(key)) return "backoff";
        if (["d", "drop", "dropset"].includes(key)) return "drop";
        if (["f", "failure", "failureset"].includes(key)) return "failure";
        if (["amrap", "amrapset"].includes(key)) return "amrap";
        if (["technique", "techniqueset"].includes(key)) return "technique";
        if (["deload", "deloadset"].includes(key)) return "deload";
        if (["unknown", "review", "reviewrequired"].includes(key)) return "unknown";
        return "unknown";
      }

      function setTypeSemantics(set) {
        const type = normalizeCanonicalSetType(set?.setType, set?.isWarmup);
        const isWarmup = type === "warmup";
        return {
          type,
          isWarmup,
          countsTowardProgression: !isWarmup
            && type !== "unknown"
            && (set?.countsTowardProgression != null ? Boolean(set.countsTowardProgression) : true)
        };
      }

      function isWorkingSet(set, purpose = "actual") {
        const semantics = setTypeSemantics(set);
        if (semantics.isWarmup || semantics.type === "unknown") return false;
        if (purpose === "progression" || purpose === "pr") return semantics.countsTowardProgression;
        return true;
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
            result.confidence = result.type === "unknown" ? 0 : 1;
            result.reviewRequired = result.type === "unknown";
            result.reason = result.type === "unknown" ? "Manual classification is missing or unrecognized and requires review." : "Manual correction preserved.";
            return;
          }
          if (source !== "strong") {
            const original = set.originalImportedValue && typeof set.originalImportedValue === "object"
              ? set.originalImportedValue
              : null;
            const rawType = original && Object.prototype.hasOwnProperty.call(original, "setType")
              ? original.setType
              : set.setType;
            const rawWarmup = original && Object.prototype.hasOwnProperty.call(original, "isWarmup")
              ? original.isWarmup
              : set.isWarmup;
            result.type = normalizeCanonicalSetType(rawType, rawWarmup);
            result.source = set.classificationSource || (result.type === "unknown" ? "recorded" : "app-explicit");
            result.confidence = result.type === "unknown" ? 0 : Number(set.classificationConfidence || 1);
            result.reviewRequired = result.type === "unknown";
            result.reason = result.type === "unknown"
              ? "Recorded set role is missing or unrecognized and requires review."
              : "App-created classification preserved.";
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
            result.confidence = result.type === "unknown" ? 0 : Number(set.classificationConfidence || 0.95);
            result.reviewRequired = result.type === "unknown";
            result.reason = result.type === "unknown"
              ? "Existing set role is unrecognized and requires review."
              : "Existing explicit app classification preserved.";
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
            const changed = original.setType !== classification.type
              || Boolean(original.isWarmup) !== semantics.isWarmup
              || Boolean(original.reviewRequired) !== classification.reviewRequired
              || Number(original.sequenceIndex ?? original.sequence ?? -1) !== Number(classification.set.sequenceIndex ?? classification.set.sequence);
            const migrated = {
              ...original,
              sequenceIndex: classification.set.sequenceIndex ?? classification.set.sequence,
              sequence: classification.set.sequenceIndex ?? classification.set.sequence,
              setType: classification.type,
              isWarmup: semantics.isWarmup,
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
              targetRpe: workingSets.length ? Number(workingSets[0].targetRpe ?? workingSets[0].targetRpeMax) || (rpeSets.length ? Math.round(rpeSets.reduce((sum, set) => sum + Number(set.rpe || 0), 0) / rpeSets.length * 2) / 2 : Number(existing.targetRpe) || 8) : existing.targetRpe || "",
              restSeconds: exercise.restSeconds || existing.restSeconds || 90,
              setTypes: templateSetTypesFromHistory(workingSets, exercise.restSeconds || existing.restSeconds || 90),
              warmups: exerciseSets.filter((set) => setTypeSemantics(set).isWarmup).map((set) => ({ reps: set.reps, targetRepMin: set.targetRepMin, targetRepMax: set.targetRepMax, targetRpe: set.targetRpe, targetRpeMin: set.targetRpeMin, targetRpeMax: set.targetRpeMax, targetRestSeconds: set.targetRestSeconds, weight: set.weight, weightUnit: set.weightUnit, resistanceType: set.resistanceType, addedLoad: set.addedLoad, assistanceLoad: set.assistanceLoad, rpe: set.rpe }))
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

      async function writeIndexedValuesAtomically(entries) {
        if (!Array.isArray(entries) || !entries.length) throw new Error("At least one IndexedDB value is required.");
        const normalizedEntries = entries.map((entry) => {
          if (!entry || typeof entry.key !== "string" || !entry.key) throw new Error("Every IndexedDB value requires a key.");
          return { key: entry.key, value: entry.value };
        });
        const db = await openFitnessDb();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(DB_STORE, "readwrite");
          const store = transaction.objectStore(DB_STORE);
          const updatedAt = isoNow();
          normalizedEntries.forEach((entry) => store.put({ ...entry, updatedAt }));
          transaction.oncomplete = () => { db.close(); resolve(true); };
          transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Atomic IndexedDB write failed.")); };
          transaction.onabort = () => { db.close(); reject(transaction.error || new Error("Atomic IndexedDB write was aborted.")); };
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
        const retainedFields = ["sleepHours", "sleepQuality", "hrv", "restingHr", "soreness"];
        return Object.fromEntries(retainedFields
          .filter((field) => Object.prototype.hasOwnProperty.call(source, field))
          .map((field) => [field, source[field]]));
      }

      function cleanRecovery(source = {}) {
        const hasExplicitPain = typeof source.pain === "boolean";
        const readinessDeviation = READINESS_DEVIATIONS.has(String(source.readinessDeviation || ""))
          ? String(source.readinessDeviation || "")
          : "";
        return {
          readinessDeviation,
          sleepHours: source.sleepHours ?? "",
          sleepQuality: source.sleepQuality ?? "",
          hrv: source.hrv ?? "",
          restingHr: source.restingHr ?? "",
          soreness: source.soreness ?? "",
          nutritionStatus: source.nutritionStatus ?? "",
          proteinStatus: source.proteinStatus ?? "",
          outsideBandNote: source.outsideBandNote ?? "",
          illness: Boolean(source.illness),
          ...(hasExplicitPain ? { pain: Boolean(source.pain) } : {}),
          affectedMuscle: source.affectedMuscle ?? ""
        };
      }

      function expectedWorkoutTemplate(model = data) {
        const templates = Array.isArray(model?.templates) ? model.templates : [];
        const expectedTemplateId = String(model?.settings?.expectedTemplateId || "");
        return templates.find((template) => template.id === expectedTemplateId) || null;
      }

      function workoutDurationTimestamp(value) {
        const timestamp = Date.parse(String(value || ""));
        return Number.isFinite(timestamp) ? timestamp : null;
      }

      function legacyDraftKnownActiveDurationMs(snapshot, savedAt, session) {
        const sourceSession = { ...(session || {}), ...(snapshot?.session || {}) };
        const hasRecordedDuration = sourceSession.durationSeconds != null
          || sourceSession.durationSemanticsVersion != null
          || sourceSession.activeDurationMs != null
          || sourceSession.activeDurationStartedAt != null
          || sourceSession.workoutPausedAt != null;
        if (hasRecordedDuration) return null;
        const startedAt = workoutDurationTimestamp(sourceSession.startedAt || session?.startedAt);
        const knownBoundary = Number.isFinite(savedAt)
          ? savedAt
          : workoutDurationTimestamp(snapshot?.savedAt || sourceSession.updatedAt || session?.updatedAt);
        if (startedAt == null || knownBoundary == null) return null;
        return Math.max(0, Math.floor(knownBoundary - startedAt));
      }

      function workoutActiveDurationMs(session, now = Date.now()) {
        if (session?.durationSemanticsVersion !== WORKOUT_DURATION_SEMANTICS_VERSION) return null;
        const accumulated = Number(session.activeDurationMs);
        if (!Number.isSafeInteger(accumulated) || accumulated < 0) return null;
        const activeSince = workoutDurationTimestamp(session.activeDurationStartedAt);
        if (activeSince == null || session.workoutPausedAt) return accumulated;
        return accumulated + Math.max(0, Math.floor(Number(now) - activeSince));
      }

      function startWorkoutDuration(session, nowIso = isoNow()) {
        if (!session || isSessionSubmitted(session)) return session;
        const startedAt = new Date(nowIso).toISOString();
        if (session.durationSemanticsVersion !== WORKOUT_DURATION_SEMANTICS_VERSION) {
          const retainedLegacyDurationMs = Number.isFinite(Number(session.durationSeconds))
            ? Math.max(0, Math.round(Number(session.durationSeconds) * 1000))
            : 0;
          return {
            ...session,
            durationSemanticsVersion: WORKOUT_DURATION_SEMANTICS_VERSION,
            activeDurationMs: retainedLegacyDurationMs,
            activeDurationStartedAt: startedAt,
            workoutPausedAt: ""
          };
        }
        if (session.activeDurationStartedAt && !session.workoutPausedAt) return session;
        return {
          ...session,
          activeDurationMs: Math.max(0, Number(session.activeDurationMs || 0)),
          activeDurationStartedAt: startedAt,
          workoutPausedAt: ""
        };
      }

      function pauseWorkoutDuration(session, nowIso = isoNow()) {
        if (!session || session.durationSemanticsVersion !== WORKOUT_DURATION_SEMANTICS_VERSION) return session;
        const pausedAt = new Date(nowIso).toISOString();
        const accumulated = workoutActiveDurationMs(session, Date.parse(pausedAt));
        return {
          ...session,
          activeDurationMs: Math.max(0, Number(accumulated || 0)),
          activeDurationStartedAt: "",
          workoutPausedAt: pausedAt
        };
      }

      function finalizeWorkoutDurationSession(session, nowIso = isoNow()) {
        if (!session || session.durationSemanticsVersion !== WORKOUT_DURATION_SEMANTICS_VERSION) return session;
        const finalized = pauseWorkoutDuration(session, nowIso);
        return {
          ...finalized,
          durationSeconds: Math.max(0, Math.round(Number(finalized.activeDurationMs || 0) / 1000))
        };
      }

      function passedExceptionQualification() {
        return Object.fromEntries((exceptionResolverApi?.QUALIFICATION_FIELDS || []).map((field) => [field, true]));
      }

      function explicitSafetyCandidate(session, recoveryInput) {
        if (!exceptionResolverApi) return null;
        const source = recoveryInput && typeof recoveryInput === "object" ? recoveryInput : {};
        const hasDirectPain = Object.prototype.hasOwnProperty.call(source, "pain") && source.pain === true;
        const legacyInferredPain = !Object.prototype.hasOwnProperty.call(source, "pain")
          && source.illness === true
          && Boolean(String(source.affectedMuscle || "").trim());
        const hasDirectIllness = source.illness === true && !legacyInferredPain;
        if (!hasDirectIllness && !hasDirectPain) return null;
        const evaluatedAt = isoNow();
        const recordedInputs = [
          ...(hasDirectIllness ? [{ field: "illness", reasonCode: "explicit_illness" }] : []),
          ...(hasDirectPain ? [{ field: "pain", reasonCode: "explicit_pain_or_injury" }] : [])
        ].map((input) => ({
          ...input,
          sourceReference: `session:${session.id}:recovery.${input.field}`
        }));
        const priorDecisions = Array.isArray(session.resolvedActions) ? session.resolvedActions : [];
        const clearedBoundaryIndex = priorDecisions.findIndex((decision) => decision?.outcome === "no_action");
        const priorCurrentSegment = priorDecisions
          .slice(0, clearedBoundaryIndex < 0 ? priorDecisions.length : clearedBoundaryIndex)
          .filter((decision) => decision?.outcome === "action");
        const prior = priorCurrentSegment.find((decision) =>
          decision?.outcome === "action"
          && decision.category === "pain_or_illness"
          && decision.sourceReferences?.some((reference) => recordedInputs.some((input) => input.sourceReference === reference))
        );
        return {
          candidateVersion: exceptionResolverApi.CANDIDATE_VERSION,
          candidateId: `candidate-${session.id}-${recordedInputs.map((input) => input.field).join("-")}`,
          detector: {
            id: "explicit-safety-input",
            version: "comprehensive-fitness-explicit-safety-input/1.1.0",
            ruleVersion: "explicit-recorded-input/1.1.0"
          },
          evaluatedAt,
          effectiveAt: prior?.effectiveAt || evaluatedAt,
          expiresAt: null,
          returnCondition: { type: "input_cleared_or_workout_ended" },
          category: "pain_or_illness",
          explicitSafetyInput: true,
          scope: { type: "session" },
          action: { code: "stop_or_skip_work", parameters: { mode: "stop_or_skip" } },
          reasonCodes: recordedInputs.map((input) => input.reasonCode),
          sourceReferences: recordedInputs.map((input) => input.sourceReference),
          evidence: recordedInputs.map((input) => ({ sourceReference: input.sourceReference, provenance: "recorded", required: true })),
          qualification: passedExceptionQualification()
        };
      }

      function reportExceptionResolverEngineeringError(record) {
        const code = ["detector_error", "candidate_normalization_error"].includes(record?.code)
          ? record.code
          : "candidate_normalization_error";
        console.error("[CF exception resolver]", Object.freeze({
          code,
          module: "exception-resolver",
          ruleVersion: "candidate-normalization/1.0.0"
        }));
      }

      function resolveWorkoutExceptions(session, recoveryInput) {
        if (!exceptionResolverApi) return [];
        const safetyCandidate = explicitSafetyCandidate(session, recoveryInput);
        const evaluatedAt = safetyCandidate?.evaluatedAt || isoNow();
        const sourceReference = safetyCandidate?.sourceReferences?.[0] || "";
        const result = exceptionResolverApi.resolveExceptionCandidates({
          evaluatedAt,
          candidates: [safetyCandidate].filter(Boolean),
          priorDecisions: Array.isArray(session.resolvedActions) ? session.resolvedActions : [],
          explicitSafetyObservation: safetyCandidate ? {
            explicit: true,
            observedAt: evaluatedAt,
            sourceReference,
            scope: { type: "session" }
          } : null,
          onEngineeringError: reportExceptionResolverEngineeringError
        });
        return Array.isArray(result?.decisions) ? result.decisions : [];
      }

      function mergeResolvedDecisionHistory(priorDecisions, currentDecisions) {
        const current = Array.isArray(currentDecisions) ? currentDecisions : [];
        const currentIds = new Set(current.map((decision) => decision?.decisionId).filter(Boolean));
        return [
          ...current,
          ...(Array.isArray(priorDecisions) ? priorDecisions : []).filter((decision) => !currentIds.has(decision?.decisionId))
        ].slice(0, 64);
      }

      function resolvedActionForVariant(resolvedActions, exerciseVariantId) {
        const decisions = Array.isArray(resolvedActions) ? resolvedActions : [];
        if (decisions[0]?.outcome === "no_action") return null;
        const actions = decisions.filter((decision) => decision?.outcome === "action");
        return actions.find((decision) => decision.scope?.type === "exercise" && decision.scope.exerciseVariantId === exerciseVariantId)
          || actions.find((decision) => decision.scope?.type === "session")
          || null;
      }

      function applyResolvedActionToStableTarget(stableTarget, resolvedAction) {
        if (!resolvedAction || resolvedAction.outcome !== "action") return { ...stableTarget };
        const code = resolvedAction.action?.code || "";
        const parameters = resolvedAction.action?.parameters || {};
        if (["stop_or_skip_work", "skip_exercise", "address_plateau"].includes(code)) {
          return {
            ...stableTarget,
            resolvedActionId: resolvedAction.decisionId,
            resolvedActionCode: code,
            adjustmentReason: resolvedAction.reasonCodes?.join(", ") || resolvedAction.category
          };
        }
        const loadReductionPercent = Number(parameters.loadReductionPercent || 0);
        const setReductionCount = Number(parameters.setReductionCount || 0);
        const rpeCeiling = Number(parameters.rpeCeiling || 0);
        const adjustedSets = setReductionCount > 0 ? Math.max(1, Number(stableTarget.sets || 1) - setReductionCount) : Number(stableTarget.sets || 1);
        const adjustedRpe = rpeCeiling > 0 ? Math.min(Number(stableTarget.rpe || rpeCeiling), rpeCeiling) : Number(stableTarget.rpe || 0);
        return {
          ...stableTarget,
          sets: adjustedSets,
          rpe: adjustedRpe,
          adjusted: loadReductionPercent > 0 || setReductionCount > 0 || (rpeCeiling > 0 && adjustedRpe < Number(stableTarget.rpe || 0)),
          mode: code === "time_bounded_deload" ? "deload" : "readiness-adjusted",
          isDeload: code === "time_bounded_deload",
          loadReductionPercent,
          resolvedActionId: resolvedAction.decisionId,
          resolvedActionCode: code,
          adjustmentReason: resolvedAction.reasonCodes?.join(", ") || resolvedAction.category,
          triggerLabels: resolvedAction.reasonCodes || []
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
          if (!set.completed || set.skipped) return failure("timer_requires_completed_set", "Rest can start only after a completed set.");
          return { authorized: true, authorizationMode: "active_workout", action: normalizedAction, exercise, set, session };
        }
        if (exactHistoryEdit) return { authorized: true, authorizationMode: "history_edit", action: normalizedAction, exercise, set, session };
        if (exactActiveWorkout || newWorkoutExercise) return { authorized: true, authorizationMode: exactActiveWorkout ? "active_workout" : "new_workout", action: normalizedAction, exercise, set, session };
        return failure("unauthorized_workout_target", "This action does not belong to the exact active workout or history-edit session.");
      }

      function workoutMutationSafetyDecision(action, context = {}) {
        const executableActions = ["add-exercise", "add-set", "add-warmup-set", "duplicate-set", "toggle-set", "toggle-skip-set", "start-timer"];
        if (!executableActions.includes(String(action || ""))) return { allowed: true, scope: "none", reason: "not_executable" };
        const block = (scope, reason, message) => ({ allowed: false, scope, reason, message });
        if (context.authorization?.authorized === false) {
          return block("workout", context.authorization.reason || "unauthorized_workout_target", context.authorization.message || "This action is not authorized for the requested workout.");
        }
        if (context.authorization?.authorizationMode === "history_edit") {
          return { allowed: true, scope: "history", reason: "authorized_history_correction" };
        }
        const recovery = context.recovery || {};
        const hasRecordedSafetyAction = recovery.illness === true || recovery.pain === true;
        return {
          allowed: true,
          scope: hasRecordedSafetyAction ? "workout" : "none",
          reason: hasRecordedSafetyAction ? "recorded_safety_action_is_advisory" : "no_safety_restriction"
        };
      }

      function workoutMutationSafetyContext(action, identifiers = {}, authorization = resolveWorkoutMutationTarget(action, identifiers)) {
        const exercise = authorization.exercise
          || (action === "add-exercise" && addExerciseDraft.trim() ? { name: addExerciseDraft.trim(), primaryMuscle: addExercisePrimaryMuscle, secondaryMuscle: addExerciseSecondaryMuscle } : null);
        const session = authorization.session;
        return {
          authorization,
          recovery: authorization.authorized && authorization.authorizationMode !== "history_edit" && session ? cleanRecovery(session.recovery || {}) : cleanRecovery({}),
          exercise
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

      const customExerciseProfileVersion = "custom-exercise-profile/1.0.0";
      const customExerciseStyles = new Set(["multi_joint", "single_joint", "isometric", "carry_locomotion"]);
      const customProgressionMetrics = new Set(["load_and_reps", "reps_only", "assistance", "duration", "distance"]);
      const executionQualityValues = new Set(["controlled", "breakdown", "not_assessed"]);

      function canonicalCustomMuscleGroup(value) {
        const source = String(value || "").trim();
        const key = source.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        return ({
          back: "upper_back", shoulders: "front_delts", quads: "quadriceps",
          core: "abdominals", neck: "neck_flexors"
        })[key] || key;
      }

      function appMuscleFromCustomGroup(value) {
        const canonical = canonicalCustomMuscleGroup(value);
        return muscleGroups.find((muscle) => canonicalCustomMuscleGroup(muscle) === canonical) || "";
      }

      function normalizeCustomExerciseProfile(profile) {
        if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
        const primaryMuscleGroupId = canonicalCustomMuscleGroup(profile.primaryMuscleGroupId);
        const secondaryMuscleGroupId = canonicalCustomMuscleGroup(profile.secondaryMuscleGroupId);
        const resistanceType = resistanceTypeValues.includes(profile.resistanceType) ? profile.resistanceType : "";
        const exerciseStyle = customExerciseStyles.has(profile.exerciseStyle) ? profile.exerciseStyle : "";
        const progressionMetric = customProgressionMetrics.has(profile.progressionMetric) ? profile.progressionMetric : "";
        const smallestIncrement = profile.smallestIncrement === "" || profile.smallestIncrement == null ? null : Number(profile.smallestIncrement);
        const incrementRequired = ["load_and_reps", "assistance"].includes(progressionMetric);
        const complete = Boolean(primaryMuscleGroupId && resistanceType && exerciseStyle && progressionMetric && (!incrementRequired || (Number.isFinite(smallestIncrement) && smallestIncrement > 0)));
        return {
          schemaVersion: customExerciseProfileVersion,
          status: complete ? "complete" : "incomplete",
          primaryMuscleGroupId,
          secondaryMuscleGroupId,
          resistanceType,
          exerciseStyle,
          progressionMetric,
          smallestIncrement: Number.isFinite(smallestIncrement) && smallestIncrement > 0 ? smallestIncrement : null,
          confirmedAt: complete && typeof profile.confirmedAt === "string" ? profile.confirmedAt : ""
        };
      }

      function missingCustomExerciseMetrics(profile) {
        const normalized = normalizeCustomExerciseProfile(profile) || {};
        const missing = [];
        if (!normalized.primaryMuscleGroupId) missing.push("Primary muscle group");
        if (!normalized.resistanceType) missing.push("Resistance mode");
        if (!normalized.exerciseStyle) missing.push("Exercise style");
        if (!normalized.progressionMetric) missing.push("Progression metric");
        if (["load_and_reps", "assistance"].includes(normalized.progressionMetric) && !normalized.smallestIncrement) missing.push("Smallest available increment");
        return missing;
      }

      function normalizeStableTemplateExercise(exercise = {}) {
        const profile = typeof progressionProfileForExercise === "function"
          ? progressionProfileForExercise(exercise.name || "")
          : { lowerRep: 8, upperRep: 12, increment: 5 };
        const numeric = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
        const legacyRoles = exercise.standardRoleWorkload && typeof exercise.standardRoleWorkload === "object"
          ? exercise.standardRoleWorkload
          : null;
        const legacyRoleTypes = legacyRoles?.topSet
          ? [
              {
                type: "top",
                setCount: legacyRoles.topSet.count,
                repMin: legacyRoles.topSet.repRange?.min,
                repMax: legacyRoles.topSet.repRange?.max
              },
              ...(legacyRoles.setStructure === "top_set_backoff" && legacyRoles.backoffSets ? [{
                type: "backoff",
                setCount: legacyRoles.backoffSets.count,
                repMin: legacyRoles.backoffSets.repRange?.min,
                repMax: legacyRoles.backoffSets.repRange?.max
              }] : [])
            ]
          : [];
        const sourceTypes = legacyRoleTypes.length
          ? legacyRoleTypes
          : Array.isArray(exercise.setTypes) ? exercise.setTypes.filter((item) => item && item.countsTowardProgression !== false && !item.isWarmup && normalizeSetTypeCode(item.type || item.setType) !== "warmup") : [];
        const aggregateSetCount = sourceTypes.reduce((sum, item) => sum + Math.max(0, Number(item.setCount || 0)), 0);
        const requestedSetCount = Math.max(1, Math.round(numeric(exercise.sets, aggregateSetCount || 3)));
        const sourceRepMins = sourceTypes.map((item) => Number(item.repMin || 0)).filter((value) => value > 0);
        const sourceRepMaxes = sourceTypes.map((item) => Number(item.repMax || item.repMin || 0)).filter((value) => value > 0);
        const legacyExactReps = sourceTypes.length === 0
          && Number(exercise.reps) > 0
          && !Object.prototype.hasOwnProperty.call(exercise, "repMin")
          && !Object.prototype.hasOwnProperty.call(exercise, "repMax");
        const stableRepMin = Math.max(1, Math.round(numeric(exercise.repMin, sourceRepMins.length ? Math.min(...sourceRepMins) : numeric(exercise.reps, profile.lowerRep || 8))));
        const stableRepMax = Math.max(stableRepMin, Math.round(numeric(exercise.repMax, sourceRepMaxes.length ? Math.max(...sourceRepMaxes) : numeric(exercise.reps, profile.upperRep || stableRepMin))));
        const sourceRpes = sourceTypes.flatMap((item) => [Number(item.rpeMax || item.targetRpe || 0), Number(item.rpeMin || 0)]).filter((value) => value > 0);
        const stableTargetRpe = Math.max(1, Math.min(10, numeric(exercise.targetRpe, sourceRpes.length ? Math.max(...sourceRpes) : 8)));
        const stableRestSeconds = Math.max(15, Math.round(numeric(exercise.restSeconds, Number(data?.settings?.defaultRestSeconds || 90))));
        const normalizeType = (item, index) => {
          const fallback = {
            id: item.id || `${exercise.id || "exercise"}-stable-${index + 1}`,
            type: item.type || item.setType || "straight",
            setCount: Number(item.setCount || 1),
            repMin: stableRepMin,
            repMax: stableRepMax,
            rpeMin: Math.max(1, stableTargetRpe - 1),
            rpeMax: stableTargetRpe,
            restSeconds: stableRestSeconds,
            countsTowardProgression: true
          };
          const normalized = typeof normalizeTargetSetType === "function"
            ? normalizeTargetSetType(item, fallback)
            : { ...fallback, ...item };
          return {
            ...normalized,
            id: normalized.id || fallback.id,
            setCount: Math.max(1, Math.round(Number(normalized.setCount || 1))),
            repMin: Math.max(1, Math.round(Number(normalized.repMin || stableRepMin))),
            repMax: Math.max(Math.max(1, Math.round(Number(normalized.repMin || stableRepMin))), Math.round(Number(normalized.repMax || stableRepMax))),
            rpeMin: Math.max(1, Math.min(10, Number(normalized.rpeMin || Math.max(1, stableTargetRpe - 1)))),
            rpeMax: Math.max(1, Math.min(10, Number(normalized.rpeMax || stableTargetRpe))),
            restSeconds: stableRestSeconds,
            countsTowardProgression: normalized.countsTowardProgression !== false,
            isWarmup: false
          };
        };
        const setTypes = (sourceTypes.length ? sourceTypes : [{
          id: `${exercise.id || "exercise"}-stable-1`,
          type: "straight",
          setCount: requestedSetCount,
          repMin: stableRepMin,
          repMax: stableRepMax,
          exactReps: legacyExactReps,
          rangeSource: legacyExactReps ? "legacy-exact" : "program",
          rpeMin: Math.max(1, stableTargetRpe - 1),
          rpeMax: stableTargetRpe,
          restSeconds: stableRestSeconds,
          countsTowardProgression: true
        }]).map(normalizeType);
        const stableSetCount = setTypes.reduce((sum, item) => sum + Number(item.setCount || 0), 0);
        const explicitRoutineReps = numeric(exercise.reps, Math.round((stableRepMin + stableRepMax) / 2));
        const {
          standardWorkloadOverride,
          standardRoleWorkload,
          recommendationSnapshot,
          basePrescription,
          finalPrescription,
          originalPrescription,
          prescription,
          setPrescription,
          coachRecommendation,
          executionBlocked,
          safetyRestriction,
          prescriptionConfidence,
          recommendationVersion,
          personalDataVersion,
          researchDatabaseVersion,
          programTargetContext,
          appliedTargetContext,
          ...retained
        } = exercise;
        return {
          ...retained,
          sets: stableSetCount,
          reps: Math.max(stableRepMin, Math.min(stableRepMax, Math.round(explicitRoutineReps))),
          repMin: stableRepMin,
          repMax: stableRepMax,
          targetRpe: stableTargetRpe,
          increment: numeric(exercise.increment, profile.increment || 5),
          restSeconds: stableRestSeconds,
          setTypes
        };
      }

      function normalizeLoadedData(model) {
        const sourceAppDataVersion = Number(model.appDataVersion || 0);
        const sourceTemplates = Array.isArray(model.templates) ? model.templates : [];
        const sourceTemplateExercises = sourceTemplates.flatMap((template) => Array.isArray(template.exercises) ? template.exercises : []);
        const legacyStableTargetCount = sourceTemplateExercises.filter((exercise) => exercise.standardWorkloadOverride != null || exercise.standardRoleWorkload != null || !Number(exercise.sets) || !Number(exercise.repMin || exercise.reps) || !Number(exercise.repMax || exercise.reps) || !Number(exercise.targetRpe) || !Number(exercise.restSeconds)).length;
        const legacyEquipmentPreferencePresent = Object.prototype.hasOwnProperty.call(model.settings || {}, "availableEquipment");
        const storedSettings = model.settings || {};
        const safeSettings = {
          weightUnit: storedSettings.weightUnit,
          timerSound: storedSettings.timerSound,
          timerVibration: storedSettings.timerVibration,
          timerNotifications: storedSettings.timerNotifications,
          inAppRestAlerts: storedSettings.inAppRestAlerts,
          restCompleteSound: storedSettings.restCompleteSound,
          restCompleteSoundVolume: storedSettings.restCompleteSoundVolume,
          restCompleteAutoDismissMs: storedSettings.restCompleteAutoDismissMs,
          restCompleteAutoReturnToWorkout: storedSettings.restCompleteAutoReturnToWorkout,
          defaultRestSeconds: storedSettings.defaultRestSeconds,
          notificationMessageDetail: storedSettings.notificationMessageDetail,
          autoStartRestTimer: storedSettings.autoStartRestTimer,
          autoHighlightNextSet: storedSettings.autoHighlightNextSet,
          installGuideDismissed: storedSettings.installGuideDismissed,
          setupSoundConfirmed: storedSettings.setupSoundConfirmed,
          expectedTemplateId: storedSettings.expectedTemplateId
        };
        model.settings = { ...defaultSettings, ...Object.fromEntries(Object.entries(safeSettings).filter(([, value]) => value != null)) };
        if (storedSettings.readinessBaseline && typeof storedSettings.readinessBaseline === "object" && !Array.isArray(storedSettings.readinessBaseline)) {
          const compatibilityBaseline = cleanReadinessBaseline(storedSettings.readinessBaseline);
          if (Object.keys(compatibilityBaseline).length) model.settings.readinessBaseline = compatibilityBaseline;
        }
        delete model.settings.availableEquipment;
        delete model.settings.goal;
        delete model.settings.trainingStatus;
        delete model.settings.cloudWorkoutSyncConsent;
        delete model.settings.workoutCloudSync;
        delete model.settings.workoutCloudSyncConsentVersion;
        model.sessions = (Array.isArray(model.sessions) ? model.sessions : []).map((session) => {
          const resolvedActions = (Array.isArray(session.resolvedActions) ? session.resolvedActions : []).filter((action) => {
            if (window.FitnessExceptionResolver?.validateResolvedAction) return window.FitnessExceptionResolver.validateResolvedAction(action)?.valid === true;
            return action?.contractVersion === "comprehensive-fitness-resolved-action/1.0.0"
              && ["no_action", "action"].includes(action.outcome)
              && ["session", "exercise"].includes(action.scope?.type);
          });
          const normalizedSession = {
            ...session,
            resolvedActions,
            submitted: session.source === "strong" && session.submitted == null ? true : session.submitted,
            workoutState: session.source === "strong" && !session.workoutState ? "completed" : session.workoutState,
            completedAt: session.completedAt || session.submittedAt || (session.source === "strong" ? session.date : ""),
            recovery: cleanRecovery(session.recovery || {})
          };
          if (!isSessionSubmitted(normalizedSession)) delete normalizedSession.exerciseQualityAnswers;
          return normalizedSession;
        });
        model.exercises = Array.isArray(model.exercises) ? model.exercises : [];
        model.sets = Array.isArray(model.sets) ? model.sets : [];
        model.sets = model.sets.map((set) => ({ ...set, skipped: Boolean(set.skipped), edited: Boolean(set.edited) }));
        const submittedSessionIds = new Set(model.sessions.filter((session) => isSessionSubmitted(session)).map((session) => session.id));
        const setsByExercise = new Map();
        model.sets.forEach((set) => {
          if (!setsByExercise.has(set.exerciseId)) setsByExercise.set(set.exerciseId, []);
          setsByExercise.get(set.exerciseId).push(set);
        });
        model.exercises = model.exercises.map((exercise) => {
          const exerciseSets = setsByExercise.get(exercise.id) || [];
          const legacyBodyweight = exerciseSets.length > 0 && exerciseSets.every((set) => Boolean(set.isBodyweight)) && isBodyweightExerciseName(exercise.name);
          const resistanceType = inferResistanceType(exercise.name, { ...exercise, isBodyweight: exercise.isBodyweight ?? legacyBodyweight }, exerciseSets);
          const customExerciseProfile = typeof normalizeCustomExerciseProfile === "function" ? normalizeCustomExerciseProfile(exercise.customExerciseProfile) : null;
          const submittedExercise = submittedSessionIds.has(exercise.sessionId);
          const executionQualityAssessment = submittedExercise
            && typeof executionQualityValues !== "undefined"
            && executionQualityValues.has(exercise.executionQualityAssessment)
            ? exercise.executionQualityAssessment
            : undefined;
          let retainedExercise = { ...exercise };
          if (!submittedExercise) {
            delete retainedExercise.executionQualityAssessment;
            delete retainedExercise.executionBlocked;
            delete retainedExercise.safetyRestriction;
          }
          return {
            ...retainedExercise,
            ...(customExerciseProfile ? { customExerciseProfile } : {}),
            ...(executionQualityAssessment ? { executionQualityAssessment } : {}),
            resistanceType,
            isBodyweight: isBodyweightResistance(resistanceType)
          };
        });
        const normalizedExerciseById = new Map(model.exercises.map((exercise) => [exercise.id, exercise]));
        model.sets = model.sets.map((set) => {
          const exercise = normalizedExerciseById.get(set.exerciseId);
          const resistanceType = resistanceTypeValues.includes(exercise?.resistanceType) ? exercise.resistanceType : resistanceTypeValues.includes(set.resistanceType) ? set.resistanceType : inferResistanceType(exercise?.name || "", set, [set]);
          return normalizeResistanceSet(set, resistanceType);
        });
        model.templates = (Array.isArray(model.templates) ? model.templates : []).map((template) => ({
          ...template,
          exercises: (Array.isArray(template.exercises) ? template.exercises : []).map((exercise) => {
            const stable = normalizeStableTemplateExercise(exercise);
            const resistanceType = inferResistanceType(stable.name, stable);
            const customExerciseProfile = typeof normalizeCustomExerciseProfile === "function" ? normalizeCustomExerciseProfile(stable.customExerciseProfile) : null;
            return { ...stable, ...(customExerciseProfile ? { customExerciseProfile } : {}), resistanceType, isBodyweight: isBodyweightResistance(resistanceType) };
          })
        }));
        if (!model.templates.some((template) => template.id === model.settings.expectedTemplateId)) {
          model.settings.expectedTemplateId = model.templates[0]?.id || "";
        }
        model.appDataVersion = Math.max(3, Number(model.appDataVersion || 0));
        delete model.recommendationHistory;
        delete model.manualOverrides;
        delete model.personalEvidencePackage;
        model.rawImports = Array.isArray(model.rawImports) ? model.rawImports : [];
        model.migrationAudit = Array.isArray(model.migrationAudit) ? model.migrationAudit : [];
        model.dataRevision = Number(model.dataRevision || 0);
        model = migrateDomainData(model);
        if (sourceAppDataVersion < 3 && !model.migrationAudit.some((record) => Number(record.version) === 4)) {
          const migratedAt = isoNow();
          model.migrationAudit.push({
            version: 4,
            startedAt: migratedAt,
            completedAt: migratedAt,
            inspected: sourceTemplateExercises.length,
            changed: legacyStableTargetCount + (legacyEquipmentPreferencePresent ? 1 : 0),
            explicitRetained: Math.max(0, sourceTemplateExercises.length - legacyStableTargetCount),
            changes: []
          });
          model.dataRevision += 1;
        }
        return model;
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
        const collectionKeys = ["sessions", "exercises", "sets", "templates", "recommendationHistory", "rawImports", "migrationAudit"];
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
        const stored = selectedCandidate?.value
          ? window.FitnessBackupContract?.discardObsoletePlanningState?.(selectedCandidate.value) || selectedCandidate.value
          : null;
        const invalidStoredSource = Boolean((indexedStored !== null && !indexedCandidate) || (localStoragePresent && !localCandidate));
        data = stored ? { ...emptyData(), ...stored, settings: { ...defaultSettings, ...stored.settings } } : emptyData();
        const needsDomainRecalculation = Number(data.domainMigrationVersion || 0) < DOMAIN_MIGRATION_VERSION;
        data = normalizeLoadedData(data);
        analysisRevision = Number(data.dataRevision || 0);
        entityStructureRevision += 1;
        entityIndexCache = null;
        if (needsDomainRecalculation) {
          // Submitted source observations and stored grade versions are immutable.
          // Migration may rebuild transient indexes, but it never assigns a newer
          // grade or PR record to an older workout that did not store one.
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

      async function fetchIdentityCompatibilityRecords(url, label) {
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`Unable to load ${label} (${response.status}).`);
        const records = await response.json();
        if (!Array.isArray(records)) throw new Error(`${label} must be an array.`);
        return records;
      }

      function loadExerciseIdentityCatalog() {
        if (!exerciseIdentityCatalogPromise) {
          exerciseIdentityCatalogPromise = fetchIdentityCompatibilityRecords(
            "./research_database/exports/json/exercise_database.json",
            "the exercise identity catalog"
          ).catch((error) => {
            exerciseIdentityCatalogPromise = null;
            throw error;
          });
        }
        return exerciseIdentityCatalogPromise;
      }

      function loadImportValidationResearch() {
        if (!importValidationResearchPromise) {
          importValidationResearchPromise = Promise.all([
            loadExerciseIdentityCatalog(),
            fetchIdentityCompatibilityRecords(
              "./research_database/exports/json/exercise_muscle_map.json",
              "the legacy snapshot validation map"
            )
          ]).then(([exerciseDatabase, exerciseMuscleMap]) => ({ exerciseDatabase, exerciseMuscleMap }))
            .catch((error) => {
              importValidationResearchPromise = null;
              throw error;
            });
        }
        return importValidationResearchPromise;
      }

      function installExerciseIdentityCompatibility(exerciseDatabase, preparedEngine = null) {
        if (!prescriptionApi || !Array.isArray(exerciseDatabase)) return false;
        prescriptionEngine = preparedEngine || prescriptionApi.createPrescriptionEngine({ personalData: {}, researchData: { exerciseDatabase } });
        return true;
      }

      async function initializeExerciseIdentityCompatibility() {
        if (!prescriptionApi) return false;
        try {
          return installExerciseIdentityCompatibility(await loadExerciseIdentityCatalog());
        } catch {
          prescriptionEngine = prescriptionApi.createPrescriptionEngine({});
          return false;
        }
      }

      function normalizePrescriptionIdentity(value) {
        return String(value || "").toLowerCase().replace(/^ex_/, "").replace(/[^a-z0-9]+/g, " ").trim();
      }

      function exactResearchCatalogIdentity(value, records = prescriptionEngine?.evidence?.research?.exerciseDatabase) {
        const requested = normalizePrescriptionIdentity(value);
        if (!requested || !Array.isArray(records)) return null;
        const matches = Array.from(new Set(records.filter((record) => (
          normalizePrescriptionIdentity(record?.exercise_name || record?.exerciseName) === requested
          || normalizePrescriptionIdentity(record?.exercise_id || record?.exerciseId) === requested
        )).map((record) => String(record?.exercise_id || record?.exerciseId || "").trim()).filter(Boolean)));
        return matches.length === 1 ? matches[0] : null;
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
        if (reconciled && !reconciled.invalid && !reconciled.publicIdentityCollision && reconciled.researchExerciseId) {
          return { status: "resolved", exerciseId: reconciled.researchExerciseId, performanceExerciseId: personalId, source: "trusted_personal_research_crosswalk" };
        }
        if (personalId && reconciled && !reconciled.invalid && !reconciled.publicIdentityCollision) {
          return { status: "resolved", exerciseId: personalId, performanceExerciseId: personalId, source: "trusted_personal_evidence", custom: true };
        }
        return { status: "unresolved", ...(resolved.exerciseId ? { exerciseId: resolved.exerciseId } : {}), reason: resolved.reason || "unknown_exercise_identity" };
      }

      function stableCustomPerformanceExerciseId(name) {
        const exactVariantKey = String(name || "").normalize("NFKC").trim().toLowerCase();
        if (!exactVariantKey) return "";
        const slug = normalizePrescriptionIdentity(name).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 112) || "variant";
        let fingerprint = 2166136261;
        for (let index = 0; index < exactVariantKey.length; index += 1) {
          fingerprint ^= exactVariantKey.charCodeAt(index);
          fingerprint = Math.imul(fingerprint, 16777619);
        }
        return `custom_${slug}_${(fingerprint >>> 0).toString(16).padStart(8, "0")}`;
      }

      function resolveExerciseIdentityProfile(exerciseOrName) {
        const exercise = typeof exerciseOrName === "string" ? { name: exerciseOrName } : (exerciseOrName || {});
        const name = String(exercise.name || exercise.exerciseName || "").trim();
        const evidence = prescriptionEngine?.evidence;
        const explicitPerformanceId = String(exercise.performanceExerciseId || exercise.performance_exercise_id || exercise.personalExerciseId || exercise.personal_exercise_id || "").trim();
        const explicitResearchId = String(exercise.researchExerciseId || exercise.research_exercise_id || "").trim();
        const explicitIdentitySource = String(exercise.identitySource || exercise.identity_source || "").trim();
        const directPublicIdentity = !explicitPerformanceId && name && typeof prescriptionEngine?.resolveExerciseIdentity === "function"
          ? prescriptionEngine.resolveExerciseIdentity(name)
          : null;
        const personalRecord = personalExerciseRecordForName(name || explicitPerformanceId, evidence);
        const personalId = explicitPerformanceId || personalRecord?.exercise_id || personalRecord?.exerciseId || "";
        const reconciled = personalId ? evidence?.personal?.reconciledIdentityByExerciseId?.get(personalId) : null;
        if (directPublicIdentity?.status === "resolved" && evidence?.research?.exerciseById?.has(directPublicIdentity.exerciseId)) {
          if (reconciled && !reconciled.invalid && !reconciled.publicIdentityCollision && reconciled.researchIdentitySource === "explicit_crosswalk" && reconciled.researchExerciseId === directPublicIdentity.exerciseId) {
            return { status: "resolved", performanceExerciseId: personalId, researchExerciseId: directPublicIdentity.exerciseId, identitySource: "personal_research_crosswalk", identityVersion: "exercise-identity/2.1.0", executable: true };
          }
          const aliasPerformanceId = directPublicIdentity.source === "research_alias"
            ? `alias_${normalizePrescriptionIdentity(name).replace(/\s+/g, "_")}`
            : directPublicIdentity.exerciseId;
          return { status: "resolved", performanceExerciseId: aliasPerformanceId, researchExerciseId: directPublicIdentity.exerciseId, identitySource: directPublicIdentity.source === "research_alias" ? "research_alias" : "research_identity", identityVersion: "exercise-identity/2.1.0", executable: true };
        }
        if (reconciled?.invalid || reconciled?.publicIdentityCollision) {
          return { status: "unresolved", performanceExerciseId: personalId || null, researchExerciseId: null, reason: reconciled.invalid ? "invalid_reconciled_identity" : "personal_public_identity_collision", identitySource: "reconciled_personal_evidence", identityVersion: "exercise-identity/2.0.0" };
        }
        const prescriptionIdentity = resolvePrescriptionExerciseIdentity(exercise);
        const researchExerciseId = explicitResearchId
          || reconciled?.researchExerciseId
          || (prescriptionIdentity.status === "resolved" && !prescriptionIdentity.custom ? prescriptionIdentity.exerciseId : "")
          || "";
        const performanceExerciseId = personalId || researchExerciseId || stableCustomPerformanceExerciseId(name);
        if (!performanceExerciseId) return { status: "unresolved", performanceExerciseId: null, researchExerciseId: researchExerciseId || null, reason: prescriptionIdentity.reason || "unknown_exercise_identity", identitySource: "unresolved", identityVersion: "exercise-identity/2.0.0" };
        return {
          status: "resolved",
          performanceExerciseId,
          researchExerciseId: researchExerciseId || null,
          identitySource: explicitIdentitySource === "research_alias" ? "research_alias" : personalId ? (reconciled?.researchExerciseId ? "personal_research_crosswalk" : "personal_evidence") : researchExerciseId ? "research_identity" : "reporting_fallback",
          identityVersion: "exercise-identity/2.0.0",
          executable: prescriptionIdentity.status === "resolved"
        };
      }

      function exerciseIdentityFields(exerciseOrName) {
        const explicit = typeof exerciseOrName === "object" && exerciseOrName?.identitySource === "user_declared_custom" && String(exerciseOrName.performanceExerciseId || "").trim()
          ? { performanceExerciseId: String(exerciseOrName.performanceExerciseId), researchExerciseId: "", identitySource: "user_declared_custom", identityVersion: exerciseOrName.identityVersion || "exercise-identity/2.1.0" }
          : null;
        if (explicit) return explicit;
        const profile = resolveExerciseIdentityProfile(exerciseOrName);
        return profile.status === "resolved" ? {
          performanceExerciseId: profile.performanceExerciseId,
          researchExerciseId: profile.researchExerciseId || "",
          identitySource: profile.identitySource,
          identityVersion: profile.identityVersion
        } : {};
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

      function activeWorkoutDraftSnapshot(options = {}) {
        const session = activeWorkoutSession();
        if (!session) return null;
        const index = dataEntityIndex();
        const exercises = (index.exerciseIndicesBySession.get(session.id) || []).map((exerciseIndex) => data.exercises[exerciseIndex]);
        const sets = exercises.flatMap((exercise) => (index.setIndicesByExercise.get(exercise.id) || []).map((setIndex) => data.sets[setIndex]));
        const draftSequence = options.incrementSequence === false ? activeDraftSequence : ++activeDraftSequence;
        return {
          contractVersion: "comprehensive-fitness-active-draft/2.0.0",
          version: 2,
          workoutId: session.id,
          savedAt: isoNow(),
          dataRevision: Number(data.dataRevision || 0),
          draftSequence,
          session,
          exercises,
          sets,
          timer: timer?.workoutId === session.id ? timer : null,
          resolvedActions: Array.isArray(session.resolvedActions) ? session.resolvedActions : []
        };
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

      function validateActiveWorkoutDraftEnvelope(snapshot, baseData = data, options = {}) {
        const isV2 = snapshot?.contractVersion === "comprehensive-fitness-active-draft/2.0.0" && Number(snapshot.version) === 2;
        const isLegacyV1 = options.allowLegacyV1 !== false && snapshot && snapshot.contractVersion == null && Number(snapshot.version) === 1;
        if (!isV2 && !isLegacyV1) return null;
        const savedAt = new Date(snapshot.savedAt || "").getTime();
        if (!Number.isFinite(savedAt) || savedAt > Date.now() + 5 * 60 * 1000) return null;
        const existingSession = baseData.sessions.find((item) => item.id === snapshot.workoutId);
        const session = existingSession || snapshot.session;
        if (!session || (existingSession && isSessionSubmitted(existingSession))
          || session.deletedAt || session.trashed || session.canceledAt || session.workoutState === "canceled"
          || !snapshot.session || snapshot.session.id !== session.id || isSessionSubmitted(snapshot.session)
          || snapshot.session.deletedAt || snapshot.session.trashed || snapshot.session.canceledAt || snapshot.session.workoutState === "canceled") return null;
        if ((snapshot.session.title != null && (typeof snapshot.session.title !== "string" || snapshot.session.title.length > 256))
          || (snapshot.session.notes != null && (typeof snapshot.session.notes !== "string" || snapshot.session.notes.length > 4096))) return null;
        if (snapshot.session.durationSemanticsVersion != null) {
          const activeStartedAt = snapshot.session.activeDurationStartedAt
            ? workoutDurationTimestamp(snapshot.session.activeDurationStartedAt)
            : null;
          const pausedAt = snapshot.session.workoutPausedAt
            ? workoutDurationTimestamp(snapshot.session.workoutPausedAt)
            : null;
          if (snapshot.session.durationSemanticsVersion !== WORKOUT_DURATION_SEMANTICS_VERSION
            || !Number.isSafeInteger(snapshot.session.activeDurationMs)
            || snapshot.session.activeDurationMs < 0
            || (snapshot.session.activeDurationStartedAt && activeStartedAt == null)
            || (snapshot.session.workoutPausedAt && pausedAt == null)
            || (snapshot.session.activeDurationStartedAt && snapshot.session.workoutPausedAt)) return null;
        }
        const sourceRevision = isV2 && Number.isSafeInteger(snapshot.dataRevision) && snapshot.dataRevision >= 0 ? snapshot.dataRevision : null;
        const currentRevision = Number(baseData.dataRevision || 0);
        const currentUpdatedAt = Date.parse(session.updatedAt || session.startedAt || "");
        if (!options.ignoreSourceRevision && sourceRevision != null && sourceRevision < currentRevision) return null;
        if (!options.ignoreSourceRevision && sourceRevision == null && Number.isFinite(currentUpdatedAt) && savedAt < currentUpdatedAt) return null;
        if (!Array.isArray(snapshot.exercises) || !snapshot.exercises.length || snapshot.exercises.length > 500 || !Array.isArray(snapshot.sets) || snapshot.sets.length > 10000) return null;
        const currentExercises = baseData.exercises.filter((exercise) => exercise.sessionId === session.id);
        const currentExerciseIds = new Set(currentExercises.map((exercise) => exercise.id));
        const currentSetCount = baseData.sets.filter((set) => currentExerciseIds.has(set.exerciseId)).length;
        if (!options.ignoreSourceRevision && sourceRevision === currentRevision && (snapshot.exercises.length < currentExercises.length || snapshot.sets.length < currentSetCount)) return null;
        const validId = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
        const exerciseIds = new Set();
        const preparedExercises = [];
        for (const exercise of snapshot.exercises) {
          if (!exercise || !validId(exercise.id) || exerciseIds.has(exercise.id) || exercise.sessionId !== session.id || typeof exercise.name !== "string" || !exercise.name.trim() || exercise.name.length > 256) return null;
          if (exercise.notes != null && (typeof exercise.notes !== "string" || exercise.notes.length > 4096)) return null;
          if (exercise.order != null && (!Number.isInteger(Number(exercise.order)) || Number(exercise.order) < 0)) return null;
          if (exercise.resistanceType != null && !resistanceTypeValues.includes(exercise.resistanceType)) return null;
          if (exercise.isBodyweight != null && typeof exercise.isBodyweight !== "boolean") return null;
          for (const identityField of ["performanceExerciseId", "researchExerciseId", "canonicalExerciseId"]) {
            if (exercise[identityField] != null && exercise[identityField] !== "" && !validId(exercise[identityField])) return null;
          }
          exerciseIds.add(exercise.id);
          preparedExercises.push({ ...exercise });
        }
        const setIds = new Set();
        const preparedSets = [];
        const numericSetDomains = {
          setNumber: { min: 0, integer: true },
          sequenceIndex: { min: 0, integer: true },
          sequence: { min: 0, integer: true },
          setTypeIndex: { min: 0, integer: true },
          reps: { min: 0, integer: true },
          weight: { min: 0 },
          addedLoad: { min: 0 },
          assistanceLoad: { min: 0 },
          durationSeconds: { min: 0, integer: true },
          distance: { min: 0 },
          rpe: { min: 0, max: 10, step: 0.5 },
          targetReps: { min: 0, integer: true },
          targetRepMin: { min: 0, integer: true },
          targetRepMax: { min: 0, integer: true },
          targetWeight: { min: 0 },
          targetRpe: { min: 0, max: 10, step: 0.5 },
          targetRpeMin: { min: 0, max: 10, step: 0.5 },
          targetRpeMax: { min: 0, max: 10, step: 0.5 },
          targetRpeTolerance: { min: 0, max: 10, step: 0.5 },
          targetRestSeconds: { min: 0, max: 3600, integer: true },
          originalTargetReps: { min: 0, integer: true },
          originalTargetWeight: { min: 0 },
          originalTargetRpe: { min: 0, max: 10, step: 0.5 }
        };
        const validSetTypes = new Set(["warmup", "straight", "working", "top", "backoff", "drop", "failure", "amrap", "technique", "deload", "unknown"]);
        const validClassificationSources = new Set(["manual", "app-explicit", "strong-explicit", "inferred", "recorded"]);
        const validUndoFields = new Set(["setType", "isWarmup", "countsTowardScore", "countsTowardVolume", "countsTowardProgression", "classificationSource", "classificationConfidence", "manualOverride", "reviewRequired"]);
        for (const set of snapshot.sets) {
          if (!set || !validId(set.id) || setIds.has(set.id) || !exerciseIds.has(set.exerciseId)) return null;
          for (const [field, domain] of Object.entries(numericSetDomains)) {
            if (set[field] == null || set[field] === "") continue;
            const numeric = Number(set[field]);
            const steps = domain.step == null ? 0 : (numeric - domain.min) / domain.step;
            if (!Number.isFinite(numeric)
              || numeric < domain.min
              || (domain.max != null && numeric > domain.max)
              || (domain.integer && !Number.isInteger(numeric))
              || (domain.step != null && Math.abs(steps - Math.round(steps)) > 1e-9)) return null;
          }
          if (set.setNumber == null || set.setNumber === "") return null;
          if (set.targetRepMin != null && set.targetRepMax != null && Number(set.targetRepMin) > Number(set.targetRepMax)) return null;
          if (set.targetRpeMin != null && set.targetRpeMax != null && Number(set.targetRpeMin) > Number(set.targetRpeMax)) return null;
          if (set.setType != null && !validSetTypes.has(set.setType)) return null;
          if (set.classificationSource != null && !validClassificationSources.has(set.classificationSource)) return null;
          for (const field of ["completed", "skipped", "edited", "isWarmup", "isBodyweight", "countsTowardScore", "countsTowardVolume", "countsTowardProgression", "manualOverride", "reviewRequired"]) {
            if (set[field] != null && typeof set[field] !== "boolean") return null;
          }
          if (set.classificationConfidence != null && (!Number.isFinite(Number(set.classificationConfidence)) || Number(set.classificationConfidence) < 0 || Number(set.classificationConfidence) > 1)) return null;
          if (set.classifierVersion != null && (!Number.isInteger(Number(set.classifierVersion)) || Number(set.classifierVersion) < 1)) return null;
          if (set.classificationUndo != null) {
            if (!set.classificationUndo || typeof set.classificationUndo !== "object" || Array.isArray(set.classificationUndo) || Object.keys(set.classificationUndo).some((field) => !validUndoFields.has(field))) return null;
            if (set.classificationUndo.setType != null && !validSetTypes.has(set.classificationUndo.setType)) return null;
            if (set.classificationUndo.classificationSource != null && !validClassificationSources.has(set.classificationUndo.classificationSource)) return null;
            if (set.classificationUndo.classificationConfidence != null && (!Number.isFinite(Number(set.classificationUndo.classificationConfidence)) || Number(set.classificationUndo.classificationConfidence) < 0 || Number(set.classificationUndo.classificationConfidence) > 1)) return null;
            for (const field of ["isWarmup", "countsTowardScore", "countsTowardVolume", "countsTowardProgression", "manualOverride", "reviewRequired"]) {
              if (set.classificationUndo[field] != null && typeof set.classificationUndo[field] !== "boolean") return null;
            }
          }
          const canonicalSetType = set.setType === "working" ? "straight" : set.setType;
          const semantics = setTypeSemantics({ ...set, setType: canonicalSetType });
          setIds.add(set.id);
          preparedSets.push({
            ...set,
            setType: semantics.type,
            ...(set.classificationUndo ? { classificationUndo: { ...set.classificationUndo, setType: set.classificationUndo.setType === "working" ? "straight" : set.classificationUndo.setType } } : {}),
            isWarmup: semantics.isWarmup,
            countsTowardProgression: semantics.isWarmup ? false : semantics.countsTowardProgression
          });
        }
        let timerSnapshot = null;
        if (isV2 && snapshot.timer != null) {
          const source = snapshot.timer;
          if (!source || source.workoutId !== session.id || !setIds.has(source.setId) || !exerciseIds.has(source.exerciseId)) return null;
          if (source.pendingNextSetId && !setIds.has(source.pendingNextSetId)) return null;
          const durationSeconds = Number(source.durationSeconds);
          const endsAt = Number(source.endsAt);
          const version = Number(source.version || 1);
          const remainingSeconds = Number(source.remainingSeconds || 0);
          const overtimeSeconds = Number(source.overtimeSeconds || 0);
          const backgroundedAt = Number(source.backgroundedAt || 0);
          const ownerSet = preparedSets.find((set) => set.id === source.setId);
          const pendingSet = source.pendingNextSetId ? preparedSets.find((set) => set.id === source.pendingNextSetId) : null;
          if (!ownerSet || ownerSet.exerciseId !== source.exerciseId
            || (pendingSet && !exerciseIds.has(pendingSet.exerciseId))
            || !Number.isSafeInteger(version) || version < 1
            || !Number.isFinite(durationSeconds) || durationSeconds < 5 || durationSeconds > 3600
            || !Number.isFinite(endsAt)
            || !Number.isFinite(remainingSeconds) || remainingSeconds < 0 || remainingSeconds > durationSeconds
            || !Number.isFinite(overtimeSeconds) || overtimeSeconds < 0
            || !Number.isFinite(backgroundedAt) || backgroundedAt < 0) return null;
          timerSnapshot = {
            id: typeof source.id === "string" && source.id ? source.id : id(),
            version,
            workoutId: session.id,
            exerciseId: source.exerciseId,
            setId: source.setId,
            pendingNextSetId: source.pendingNextSetId || "",
            durationSeconds,
            remainingSeconds,
            endsAt,
            isActive: source.isActive !== false,
            isPaused: source.isPaused === true,
            isOvertime: source.isOvertime === true,
            overtimeSeconds,
            notificationStatus: String(source.notificationStatus || "disabled").slice(0, 32),
            serverNotificationId: String(source.serverNotificationId || "").slice(0, 160),
            backgroundedAt
          };
        }
        const normalized = normalizeLoadedData({
          ...emptyData(),
          sessions: [{ ...session, ...snapshot.session, id: session.id, workoutStarted: true, workoutState: "active", submitted: false }],
          exercises: preparedExercises,
          sets: preparedSets,
          settings: baseData.settings
        });
        if (normalized.exercises.length !== snapshot.exercises.length || normalized.sets.length !== snapshot.sets.length) return null;
        const draftSequence = Number.isSafeInteger(snapshot.draftSequence) && snapshot.draftSequence >= 0 ? snapshot.draftSequence : 0;
        const legacyActiveDurationMs = legacyDraftKnownActiveDurationMs(snapshot, savedAt, session);
        return { snapshot, savedAt, sourceRevision, draftSequence, legacy: isLegacyV1, legacyActiveDurationMs, session: normalized.sessions[0], exercises: normalized.exercises, sets: normalized.sets, timer: timerSnapshot };
      }

      async function restoreActiveWorkoutDraft() {
        let indexed = null;
        let local = null;
        try { indexed = await readIndexedValue("active-workout-draft"); } catch { /* Fall back below. */ }
        try { local = JSON.parse(localStorage.getItem(ACTIVE_DRAFT_KEY) || "null"); } catch { local = null; }
        const candidate = [[indexed, "indexed"], [local, "local"]]
          .map(([snapshot, source]) => {
            const validated = validateActiveWorkoutDraftEnvelope(snapshot, data);
            return validated ? { ...validated, source } : null;
          })
          .filter(Boolean)
          .sort((a, b) => b.savedAt - a.savedAt || b.draftSequence - a.draftSequence || (b.source === "local" ? 1 : -1))[0];
        if (!candidate) return false;
        const snapshot = candidate.snapshot;
        const existingExerciseIds = new Set(data.exercises.filter((exercise) => exercise.sessionId === snapshot.workoutId).map((exercise) => exercise.id));
        const restoredResolvedActions = (Array.isArray(snapshot.resolvedActions)
          ? snapshot.resolvedActions
          : Array.isArray(snapshot.session?.resolvedActions) ? snapshot.session.resolvedActions : [])
          .filter((action) => exceptionResolverApi?.validateResolvedAction(action)?.valid === true);
        const loadedSession = data.sessions.find((item) => item.id === snapshot.workoutId);
        const restoredCandidateSession = { ...(loadedSession || {}), ...candidate.session, resolvedActions: restoredResolvedActions, workoutStarted: true, workoutState: "active", submitted: false };
        const durationSeededSession = candidate.legacyActiveDurationMs != null
          && restoredCandidateSession.durationSemanticsVersion !== WORKOUT_DURATION_SEMANTICS_VERSION
          ? {
              ...restoredCandidateSession,
              durationSemanticsVersion: WORKOUT_DURATION_SEMANTICS_VERSION,
              activeDurationMs: candidate.legacyActiveDurationMs,
              activeDurationStartedAt: "",
              workoutPausedAt: ""
            }
          : restoredCandidateSession;
        const restoredSession = durationSeededSession.durationSemanticsVersion === WORKOUT_DURATION_SEMANTICS_VERSION
          && candidate.legacyActiveDurationMs == null
          ? durationSeededSession
          : startWorkoutDuration(durationSeededSession);
        data.sessions = data.sessions.some((item) => item.id === snapshot.workoutId)
          ? data.sessions.map((item) => item.id === snapshot.workoutId ? restoredSession : item)
          : [restoredSession, ...data.sessions];
        data.exercises = [...data.exercises.filter((exercise) => exercise.sessionId !== snapshot.workoutId), ...candidate.exercises];
        data.sets = [...data.sets.filter((set) => !existingExerciseIds.has(set.exerciseId)), ...candidate.sets];
        data.dataRevision = Math.max(Number(data.dataRevision || 0), Number(candidate.sourceRevision || 0)) + 1;
        if (candidate.timer) timer = candidate.timer;
        activeWorkoutId = snapshot.workoutId;
        activeSessionId = snapshot.workoutId;
        activeDraftSequence = Math.max(activeDraftSequence, candidate.draftSequence);
        entityStructureRevision += 1;
        entityIndexCache = null;
        scheduleSave();
        if (candidate.legacy) persistActiveWorkoutDraft();
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
        } catch { /* The local fallback is inspected below. */ }
        if (!runtime) {
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
        if (runtime.timer && data.sets.some((set) => set.id === runtime.timer.setId) && (!runtime.timer.workoutId || runtime.timer.workoutId === activeWorkoutId)) {
          timer = { id: runtime.timer.id || id(), pendingNextSetId: runtime.timer.pendingNextSetId || runtime.pendingNextSetId || "", ...runtime.timer };
        }
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
            if (timer.isOvertime) {
              timer.remainingSeconds = 0;
              timer.overtimeSeconds = Math.max(0, Math.floor((Date.now() - Number(timer.endsAt || Date.now())) / 1000));
              startTimerInterval();
            } else {
              timer.remainingSeconds = Math.max(0, Math.ceil((Number(timer.endsAt || 0) - Date.now()) / 1000));
              if (timer.remainingSeconds > 0) startTimerInterval();
              else window.setTimeout(completeTimer, 0);
            }
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
        document.documentElement.removeAttribute("data-theme");
        document.documentElement.removeAttribute("data-color-package");
      }

      function createSession(title, options = {}) {
        const now = isoNow();
        const sameDayCount = data.sessions.filter((session) => session.date === todayIso()).length + 1;
        return { id: id(), date: todayIso(), title: title || "Workout " + sameDayCount, isTravel: false, notes: "", recovery: defaultRecovery(), submitted: false, workoutStarted: Boolean(options.started), workoutState: options.started ? "active" : "idle", startedAt: options.started ? now : "", createdAt: now, updatedAt: now };
      }

      function defaultRecovery() {
        return cleanRecovery({ illness: false, pain: false });
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
          reps: previous?.reps ?? "",
          weight,
          weightUnit: previous?.weightUnit ?? data.settings.weightUnit,
          resistanceType,
          isBodyweight: isBodyweightResistance(resistanceType),
          addedLoad: resistanceType === "bodyweight_plus_load" ? Number(previous?.addedLoad ?? weight) : Number(previous?.addedLoad || 0),
          assistanceLoad: resistanceType === "assisted_bodyweight" ? Number(previous?.assistanceLoad ?? weight) : Number(previous?.assistanceLoad || 0),
          durationSeconds: Number(previous?.durationSeconds || 0),
          distance: Number(previous?.distance || 0),
          distanceUnit: previous?.distanceUnit || "m",
          rpe: previous?.rpe ?? "",
          completed: previous?.completed ?? false,
          isWarmup: previous?.isWarmup ?? false,
          setType: normalizeSetTypeCode(previous?.setType, previous?.isWarmup),
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
          originalTargetReps: previous?.originalTargetReps ?? previous?.targetReps ?? previous?.reps,
          originalTargetWeight: previous?.originalTargetWeight ?? previous?.targetWeight ?? previous?.weight,
          originalTargetRpe: previous?.originalTargetRpe ?? previous?.targetRpe ?? previous?.rpe,
          previousComparableSet: previous?.previousComparableSet ? { ...previous.previousComparableSet } : null
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
        previousPerformanceCache.clear();
        submittedPerformanceIndexCache.clear();
        exerciseProgressCache.clear();
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
          const canonicalId = canonicalExerciseId(exercise);
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

      function submittedPerformanceIndex(throughDate = todayIso()) {
        const date = String(throughDate || todayIso()).slice(0, 10);
        const cacheKey = analysisRevision + "|" + date;
        if (submittedPerformanceIndexCache.has(cacheKey)) return submittedPerformanceIndexCache.get(cacheKey);
        const sessionById = new Map(data.sessions.filter((session) => {
          const completionDate = sessionCompletionDate(session);
          return isCompletedWorkout(session) && completionDate && completionDate <= date;
        }).map((session) => [session.id, session]));
        const exercisesByCanonical = new Map();
        const strongExercisesByExactName = new Map();
        data.exercises.forEach((exercise) => {
          const session = sessionById.get(exercise.sessionId);
          if (!session) return;
          const canonicalId = canonicalExerciseId(exercise);
          if (canonicalId) {
            const canonicalExercises = exercisesByCanonical.get(canonicalId) || [];
            canonicalExercises.push(exercise);
            exercisesByCanonical.set(canonicalId, canonicalExercises);
          }
          if (session.source === "strong") {
            const exactName = normalizePrescriptionIdentity(exercise.name);
            if (exactName) {
              const exactExercises = strongExercisesByExactName.get(exactName) || [];
              exactExercises.push(exercise);
              strongExercisesByExactName.set(exactName, exactExercises);
            }
          }
        });
        const index = { sessionById, exercisesByCanonical, strongExercisesByExactName };
        submittedPerformanceIndexCache.set(cacheKey, index);
        return index;
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
          activeSetId = timer.pendingNextSetId || "";
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
        if (next?.exerciseId) workoutFocusExerciseId = next.exerciseId;
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
        const focusedSet = data.sets.find((set) => set.id === activeSetId);
        if (focusedSet?.exerciseId) workoutFocusExerciseId = focusedSet.exerciseId;
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
        const reps = Number(set?.reps || 0);
        const load = resistanceLoadInUnit(set, "external");
        if (load <= 0 || reps < 1 || reps > 12) return 0;
        return load * (1 + reps / 30);
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

      function canonicalExerciseId(exerciseOrName) {
        const exercise = typeof exerciseOrName === "string" ? { name: exerciseOrName } : (exerciseOrName || {});
        const name = exercise.name || exercise.exerciseName || "";
        const normalized = normalizePrescriptionIdentity(name);
        if (!normalized) return "";
        if (typeof resolveExerciseIdentityProfile === "function") {
          const profile = resolveExerciseIdentityProfile(exercise);
          if (profile.status === "resolved") return profile.performanceExerciseId;
          if (profile.reason && profile.reason !== "unknown_exercise_identity") return null;
        } else {
          const evidence = prescriptionEngine?.evidence;
          const researchId = evidence?.research?.exerciseIdByAlias?.get(normalized)
            || evidence?.research?.exerciseDatabase?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalized)?.exercise_id;
          if (researchId) return researchId;
          const personalRecord = evidence?.personal?.exerciseScores?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalized)
            || evidence?.personal?.exercisePrescriptions?.find((item) => normalizePrescriptionIdentity(item.exercise_name || item.exerciseName || item.exercise_id) === normalized);
          const personalId = personalRecord?.exercise_id || personalRecord?.exerciseId || "";
          if (/^(?:custom|user)(?::|_)/.test(personalId)) return personalId;
        }
        return stableCustomPerformanceExerciseId(name);
      }

      function samePerformanceExercise(left, right) {
        const leftExercise = typeof left === "string" ? { name: left } : (left || {});
        const rightExercise = typeof right === "string" ? { name: right } : (right || {});
        const leftPerformanceId = String(leftExercise.performanceExerciseId || "").trim();
        const rightPerformanceId = String(rightExercise.performanceExerciseId || "").trim();
        if (leftPerformanceId && rightPerformanceId) return leftPerformanceId === rightPerformanceId;
        const leftResearchId = String(leftExercise.researchExerciseId || "").trim();
        const rightResearchId = String(rightExercise.researchExerciseId || "").trim();
        if (leftResearchId && rightResearchId) return leftResearchId === rightResearchId;
        return exerciseMatches(leftExercise.name || "", rightExercise.name || "");
      }

      function exerciseCatalog() {
        if (exerciseCatalogCache?.revision === analysisRevision) return exerciseCatalogCache.items;
        const sessions = new Map(data.sessions.filter((session) => isSessionSubmitted(session)).map((session) => [session.id, session]));
        const catalog = new Map();
        data.exercises.forEach((exercise) => {
          const canonicalId = canonicalExerciseId(exercise);
          const name = String(exercise?.name || "").trim();
          if (!canonicalId || !name) return;
          const session = sessions.get(exercise.sessionId);
          if (!session) return;
          const resistanceType = resistanceTypeFor(exercise);
          const selectionId = canonicalId + "::resistance::" + resistanceType;
          const current = catalog.get(selectionId) || { id: selectionId, canonicalId, name, resistanceType, lastDate: "", submittedUses: 0 };
          current.submittedUses += 1;
          if (!current.lastDate || session.date >= current.lastDate) { current.lastDate = session.date; current.name = name; }
          catalog.set(selectionId, current);
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
          .map((exercise) => ({ ...exercise, lexicalName: normalizeChartSearch(exercise.name), lexicalId: normalizeChartSearch(exercise.canonicalId) }))
          .filter((exercise) => !lexicalQuery || exercise.lexicalName.includes(lexicalQuery) || exercise.lexicalId.includes(lexicalQuery) || exercise.canonicalId === exactStructuredId)
          .sort((a, b) => {
            const aExact = a.canonicalId === exactStructuredId || a.lexicalName === lexicalQuery ? 0 : a.lexicalName.startsWith(lexicalQuery) || a.lexicalId.startsWith(lexicalQuery) ? 1 : 2;
            const bExact = b.canonicalId === exactStructuredId || b.lexicalName === lexicalQuery ? 0 : b.lexicalName.startsWith(lexicalQuery) || b.lexicalId.startsWith(lexicalQuery) ? 1 : 2;
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
        return matches.map((exercise, index) => '<button class="exercise-suggestion ' + (index === chartExerciseHighlight ? 'highlighted' : '') + '" type="button" data-action="select-chart-exercise" data-exercise-id="' + escapeHtml(exercise.id) + '"><strong>' + escapeHtml(exercise.name) + '</strong><span>' + escapeHtml(resistanceTypeLabel(exercise.resistanceType)) + ' · ' + exercise.submittedUses + ' submitted workout' + (exercise.submittedUses === 1 ? '' : 's') + (exercise.lastDate ? ' · Last ' + formatDate(exercise.lastDate) : '') + '</span></button>').join('');
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
        chartExerciseSearchOpen = false;
        chartExerciseSearchError = "";
        chartExerciseHighlight = 0;
        recentChartExerciseIds = [exercise.id, ...recentChartExerciseIds.filter((id) => id !== exercise.id)].slice(0, 8);
        chartDetailPoint = null;
        render();
        return true;
      }

      function confirmChartExerciseDraft() {
        const matches = matchingChartExercises(chartExerciseDraft);
        const exactStructuredId = exactStructuredChartExerciseId(chartExerciseDraft);
        const lexicalQuery = normalizeChartSearch(chartExerciseDraft);
        const exact = matches.find((exercise) => exercise.canonicalId === exactStructuredId || normalizeChartSearch(exercise.name) === lexicalQuery);
        return selectChartExercise((exact || matches[chartExerciseHighlight] || matches[0])?.id || "");
      }

      function exerciseMatches(storedName, requestedName) {
        return normalizePrescriptionIdentity(storedName) === normalizePrescriptionIdentity(requestedName);
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

      function storedResistanceLoad(set, type) {
        if (type === "bodyweight_plus_load") return Number(set?.addedLoad ?? set?.weight ?? 0);
        if (type === "assisted_bodyweight") return Number(set?.assistanceLoad ?? set?.weight ?? 0);
        return Number(set?.weight || 0);
      }

      function resistanceLoad(set, type, toUnit = data.settings.weightUnit) {
        const load = storedResistanceLoad(set, type);
        const fromUnit = set?.weightUnit === "kg" || set?.weightUnit === "lb" ? set.weightUnit : data.settings.weightUnit;
        return Number(convertWeightValue(load, fromUnit, toUnit));
      }

      function formatLoadNumber(value) {
        return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
      }

      function roundLoadForUnit(value, unit = data.settings.weightUnit, increment = 0) {
        const numeric = Number(value || 0);
        if (!Number.isFinite(numeric)) return 0;
        const displayUnit = Number(increment) > 0 ? unit : data.settings.weightUnit;
        if (displayUnit === "lb") return Math.round(numeric * 2) / 2;
        if (Number(increment) > 0) return Number((Math.round(numeric / Number(increment)) * Number(increment)).toFixed(3));
        return Number(numeric.toFixed(3));
      }

      function displayLoadNumber(value, unit = data.settings.weightUnit) {
        return formatLoadNumber(roundLoadForUnit(value, unit));
      }

      function formatResistance(value, exercise = null) {
        const type = inferResistanceType(exercise?.name || "", value || exercise || {}, value ? [value] : []);
        const unit = data.settings.weightUnit;
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

      function convertWeightValue(value, fromUnit, toUnit) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || fromUnit === toUnit) return value;
        const converted = fromUnit === "lb" && toUnit === "kg" ? numeric / 2.2046226218 : numeric * 2.2046226218;
        return toUnit === "lb" ? Math.round(converted * 2) / 2 : Number(converted.toFixed(3));
      }

      function resistanceLoadInUnit(set, type, toUnit = data.settings.weightUnit) {
        return resistanceLoad(set, type, toUnit);
      }

      function setAppWeightUnitPreference(model, toUnit) {
        if (!model || !["lb", "kg"].includes(toUnit) || model.settings?.weightUnit === toUnit) return model;
        return { ...model, settings: { ...model.settings, weightUnit: toUnit } };
      }
      // RESISTANCE_MODEL_END

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
        return Math.max(60, Math.min(300, Math.round(seconds / 15) * 15));
      }

      function templateExerciseCount(template) {
        return template.exercises.reduce((sum, exercise) => sum + Number(exercise.sets || 0), 0);
      }

      function getMostRecentWorkoutPerformance(exerciseName, options = {}) {
        const requestedResistanceType = options.resistanceType || "";
        const requestedCanonicalId = options.canonicalExerciseId || canonicalExerciseId(exerciseName);
        const requestedExactName = normalizePrescriptionIdentity(exerciseName);
        const cacheKey = ["performance", analysisRevision, requestedCanonicalId, requestedExactName, requestedResistanceType, options.throughDate || options.asOfDate || todayIso(), options.excludeSessionId || "", options.includeDeloads ? 1 : 0].join("|");
        if (previousPerformanceCache.has(cacheKey)) return previousPerformanceCache.get(cacheKey);
        const throughDate = String(options.throughDate || options.asOfDate || todayIso()).slice(0, 10);
        const performanceIndex = submittedPerformanceIndex(throughDate);
        const sessionById = performanceIndex.sessionById;
        const scopedExercises = Array.from(new Map([
          ...(performanceIndex.exercisesByCanonical.get(requestedCanonicalId) || []),
          ...(performanceIndex.strongExercisesByExactName.get(requestedExactName) || [])
        ].map((exercise) => [exercise.id, exercise])).values());
        const exerciseById = new Map(scopedExercises.map((exercise) => [exercise.id, exercise]));
        const scopedSets = scopedExercises.flatMap((exercise) => (dataEntityIndex().setIndicesByExercise.get(exercise.id) || []).map((index) => data.sets[index]));
        const deloadWeeks = options.includeDeloads ? new Set() : new Set(scopedExercises.filter((exercise) => {
          const session = sessionById.get(exercise.sessionId);
          return exercise.isDeload || session?.isDeload || session?.sessionType === "deload";
        }).map((exercise) => startOfWeekIso(sessionById.get(exercise.sessionId)?.date || todayIso())));
        const completed = scopedSets
          .filter((set) => set.completed && !set.skipped)
          .map((set) => {
            const exercise = exerciseById.get(set.exerciseId);
            const session = exercise ? sessionById.get(exercise.sessionId) : null;
            return session ? { set, session, exercise } : null;
          })
          .filter(Boolean)
          .filter((entry) => isWorkingSet(entry.set, "progression"))
          .filter((entry) => !options.excludeSessionId || entry.session.id !== options.excludeSessionId)
          .filter((entry) => !deloadWeeks.has(startOfWeekIso(entry.session.date)))
          .filter((entry) => !requestedResistanceType || resistanceTypeFor(entry.exercise, entry.set) === requestedResistanceType)
          .sort((a, b) => b.session.date.localeCompare(a.session.date)
            || String(b.session.completedAt || b.session.submittedAt || b.session.createdAt || "").localeCompare(String(a.session.completedAt || a.session.submittedAt || a.session.createdAt || ""))
            || Number(a.set.sequenceIndex ?? a.set.sequence ?? a.set.setNumber) - Number(b.set.sequenceIndex ?? b.set.sequence ?? b.set.setNumber));
        const latest = completed[0];
        const result = latest ? {
          canonicalExerciseId: requestedCanonicalId,
          resistanceType: resistanceTypeFor(latest.exercise, latest.set),
          session: latest.session,
          exercise: latest.exercise,
          sets: completed
            .filter((entry) => entry.session.id === latest.session.id && entry.exercise.id === latest.exercise.id)
            .map((entry) => ({ ...entry.set, priorSessionId: entry.session.id, priorSessionDate: entry.session.date, priorExerciseId: entry.exercise.id, priorExerciseName: entry.exercise.name, priorResistanceType: resistanceTypeFor(entry.exercise, entry.set) }))
        } : null;
        previousPerformanceCache.set(cacheKey, result);
        return result;
      }

      function getLastCompletedSet(exerciseName, options = {}) {
        const performance = getMostRecentWorkoutPerformance(exerciseName, options);
        return performance?.sets[0] ? { set: performance.sets[0], session: performance.session, exercise: performance.exercise } : null;
      }

      function getMostRecentWorkoutSets(exerciseName, options = {}) {
        return getMostRecentWorkoutPerformance(exerciseName, options)?.sets || [];
      }

      function stableTargetForTemplateExercise(templateExercise, options = {}) {
        const stable = normalizeStableTemplateExercise(templateExercise);
        const workingTypes = (stable.setTypes || []).filter((type) => type.countsTowardProgression !== false && !type.isWarmup);
        const primaryType = workingTypes.find((type) => normalizeSetTypeCode(type.type) === "top")
          || workingTypes.find((type) => normalizeSetTypeCode(type.type) === "straight")
          || workingTypes[0]
          || {};
        const repLow = Math.max(1, Number(primaryType.repMin || stable.repMin || stable.reps || 1));
        const repHigh = Math.max(repLow, Number(primaryType.repMax || stable.repMax || stable.reps || repLow));
        const targetRpe = Math.max(1, Number(primaryType.rpeMax || stable.targetRpe || 8));
        const sets = Math.max(1, workingTypes.reduce((sum, type) => sum + Number(type.setCount || 0), 0) || Number(stable.sets || 1));
        const resistanceType = stable.resistanceType || options.resistanceType || inferResistanceType(stable.name, stable);
        return {
          decision: "stable_target",
          mode: "stable-target",
          sets,
          reps: Math.max(repLow, Math.min(repHigh, Number(stable.reps || repLow))),
          repLow,
          repHigh,
          rpe: targetRpe,
          restSeconds: Math.max(0, Number(stable.restSeconds || defaultSettings.defaultRestSeconds || 90)),
          increment: Math.max(0.01, Number(stable.increment || 1)),
          weight: Math.max(0, Number(stable.defaultLoad ?? stable.targetLoad ?? stable.weight ?? 0)),
          addedLoad: 0,
          assistanceLoad: 0,
          weightUnit: data.settings.weightUnit,
          resistanceType,
          isBodyweight: isBodyweightResistance(resistanceType),
          adjusted: false,
          adjustmentReason: "",
          triggerLabels: [],
          stableTarget: true
        };
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

      function muscleOptions(selectedValue, includeAuto = false, autoLabel = "Auto") {
        const selected = selectedValue || "";
        const options = includeAuto ? ['<option value="" ' + (selected === "" ? "selected" : "") + ">" + escapeHtml(autoLabel) + "</option>"] : [];
        return options.concat(muscleGroups.map((muscle) => '<option value="' + escapeHtml(muscle) + '" ' + (selected === muscle ? "selected" : "") + ">" + escapeHtml(muscle) + "</option>")).join("");
      }

      function renderMuscleSelectors(exercise) {
        return `
          <div class="muscle-select-grid">
            <label>Primary muscle
              <select data-action="exercise-primary-muscle" data-exercise-id="${exercise.id}" aria-label="Primary muscle for ${escapeHtml(exercise.name)}">
                ${muscleOptions(exercise.primaryMuscle || "", true, "Not specified")}
              </select>
            </label>
            <label>Secondary muscle
              <select data-action="exercise-secondary-muscle" data-exercise-id="${exercise.id}" aria-label="Secondary muscle for ${escapeHtml(exercise.name)}">
                ${muscleOptions(exercise.secondaryMuscle || "", true, "None")}
              </select>
            </label>
          </div>
        `;
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
            const repMins = workingSets.map((set) => Number(set.targetRepMin || set.targetReps || set.reps || 0)).filter((value) => value > 0);
            const repMaxes = workingSets.map((set) => Number(set.targetRepMax || set.targetReps || set.reps || 0)).filter((value) => value > 0);
            return {
              id: id(),
              name: exercise.name || "Exercise",
              ...(typeof exerciseIdentityFields === "function" ? exerciseIdentityFields(exercise) : {}),
              primaryMuscle: exercise.primaryMuscle || "",
              secondaryMuscle: exercise.secondaryMuscle || "",
              ...(exercise.customExerciseProfile ? { customExerciseProfile: normalizeCustomExerciseProfile(exercise.customExerciseProfile) } : {}),
              resistanceType: resistanceTypeFor(exercise),
              isBodyweight: isBodyweightResistance(resistanceTypeFor(exercise)),
              sets: Math.max(workingSets.length, 1),
              reps: representative?.reps || 8,
              repMin: repMins.length ? Math.min(...repMins) : representative?.reps || 8,
              repMax: repMaxes.length ? Math.max(...repMaxes) : representative?.reps || 8,
              targetRpe: Number(representative?.targetRpe ?? representative?.targetRpeMax) || Number(representative?.rpe) || 8,
              increment: progressionProfileForExercise(exercise.name).increment,
              restSeconds: exercise.restSeconds || recommendedRestSeconds(exercise.name, { reps: representative?.reps || 8 }),
              setTypes: templateSetTypesFromHistory(workingSets, exercise.restSeconds),
              warmups: sets.filter((set) => setTypeSemantics(set).isWarmup).map((set) => ({ reps: set.reps, targetRepMin: set.targetRepMin, targetRepMax: set.targetRepMax, targetRpe: set.targetRpe, targetRpeMin: set.targetRpeMin, targetRpeMax: set.targetRpeMax, targetRestSeconds: set.targetRestSeconds, weight: set.weight, weightUnit: set.weightUnit, resistanceType: set.resistanceType, isBodyweight: set.isBodyweight, addedLoad: set.addedLoad, assistanceLoad: set.assistanceLoad, rpe: set.rpe }))
            };
          });
        return { id: id(), name: (session.title || "Workout") + " Template", notes: "", exercises, createdAt: isoNow(), updatedAt: isoNow() };
      }

      function tabFromLocation() {
        const hash = window.location.hash.replace(/^#/, "").toLowerCase();
        return currentDestinationIds.includes(hash) ? hash : "today";
      }

      function tabUrl(tab) {
        const url = new URL(window.location.href);
        ["view", "rest", "workout", "set", "exercise", "workoutId", "exerciseId", "completedSetId", "nextSetId", "timerId", "notificationId", "timerVersion"].forEach((key) => url.searchParams.delete(key));
        url.hash = tab;
        return url.pathname + url.search + url.hash;
      }

      function normalizedDestination(tab) {
        return currentDestinationIds.includes(tab) ? tab : "today";
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
        if (!(element instanceof HTMLElement || element instanceof SVGElement) || !element.matches(focusableCandidateSelector)) return false;
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
        if (target) {
          const closedAncestors = [];
          for (let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement) {
            if (ancestor instanceof HTMLDetailsElement && !ancestor.open) closedAncestors.push(ancestor);
          }
          closedAncestors.reverse().forEach((details) => { details.open = true; });
        }
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
        if (optionalReadinessFlow) return `readiness:${optionalReadinessFlow.templateId || optionalReadinessFlow.sessionId}`;
        if (cancelWorkoutFlow) return `cancel:${cancelWorkoutFlow.sessionId}`;
        if (historyEditConfirm) return `history:${historyEditConfirm}`;
        if (clearDataFlow?.open) return "clear";
        return "";
      }

      function activeDialogInitialFocusDescriptor() {
        if (templateStartFlow) {
          return actionFocusDescriptor("resume-active-workout");
        }
        if (optionalReadinessFlow) return actionFocusDescriptor("template-readiness-deviation");
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

      function setActiveTab(nextTab, options = {}) {
        const next = normalizedDestination(nextTab);
        if (historyEditFlow && next !== "workout" && !options.allowHistoryExit) {
          requestHistoryEditConfirmation("cancel", { preserveOrigin: true });
          return;
        }
        const previous = activeTab;
        if (previous === next && !options.force) {
          if (options.focus !== false) {
            const mainContent = document.getElementById("main-content");
            if (mainContent && document.activeElement !== mainContent) mainContent.focus({ preventScroll: true });
          }
          return;
        }
        tabScrollPositions.set(previous, window.scrollY);
        activeTab = next;
        viewRenderError = null;
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
