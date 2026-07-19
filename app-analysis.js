
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
            <section class="quiet-coach-hero templates-coach app-module"><div class="section-kicker">Planning principle</div><h2>Build the base plan. Let today's readiness shape the execution.</h2><p>Start a familiar workout in one tap. Planning, editing, and evidence stay available as separate modules so they do not compete with the next action.</p></section>
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
            <section class="quiet-coach-hero charts-coach app-module"><div class="section-kicker">Progress focus</div><h2>${latestOneRm ? escapeHtml(progress.latestPrimary) + ': ' + escapeHtml(latestOneRm.value) : 'Build the first reliable comparison point.'}</h2><p>One primary trend leads this view. Scope, volume, expectations, and recommendation evidence remain available in the modules below.</p></section>
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
            <section class="quiet-coach-hero settings-coach app-module"><div class="section-kicker">Local-first setup</div><h2>Your training preferences stay organized and under your control.</h2><p>Common display choices lead. Training, readiness, alerts, data, and high-risk actions remain separated into focused modules.</p></section>
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
