
      function renderTemplates() {
        const running = activeWorkoutSession();
        return `
          <section class="view templates-view">
            <div class="screen-heading plan-heading">
              <div><div class="section-kicker">Reusable workouts</div><h1>Routines</h1><p>Edit the workouts you return to. Starting one never replaces an existing draft.</p></div>
              <button class="icon-button" type="button" data-action="new-template" title="New template">${icon.add}</button>
            </div>
            ${running ? '<section class="active-workout-notice" id="active-workout-template-notice" role="status"><div><div class="section-kicker">Workout in progress</div><strong>' + escapeHtml(running.title || 'Active workout') + '</strong><span>Your draft is saved. Starting another routine will ask whether to resume, finish, or discard it.</span></div><div><button class="primary-action" type="button" data-action="resume-active-workout">Resume</button></div></section>' : ''}
            <div class="template-library">${data.templates.length ? data.templates.map((template) => renderTemplateCard(template, running)).join("") : '<div class="empty-state">Create a leg day, push day, pull day, or any repeatable workout. Templates store exercises, sets, and target reps; you fill in weights during the workout.</div>'}</div>
            <button class="secondary-action full-width" type="button" data-action="save-template">Save current workout as a template</button>
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
        const patch = config.field === "reps"
          ? { reps: numeric, repMin: numeric, repMax: numeric }
          : { [config.field]: numeric };
        patchTemplateExercise(templateId, exerciseId, patch, false);
        return true;
      }

      function renderTemplateCard(template, running = activeWorkoutSession()) {
        const isActiveTemplate = running?.templateId === template.id;
        const emptyTemplate = !Array.isArray(template.exercises) || template.exercises.length === 0;
        const emptyTemplateDescriptionId = "empty-template-" + template.id;
        const startDisabledAttributes = emptyTemplate
            ? 'disabled aria-describedby="' + escapeHtml(emptyTemplateDescriptionId) + '" title="Add at least one exercise before starting this template"'
            : '';
        const advice = null;
        const confirmingDelete = pendingDeleteTemplateId === template.id;
        const editorExpanded = expandedTemplateEditorIds.has(template.id);
        const prescribedSets = advice?.totalSets ?? templateExerciseCount(template);
        const duration = Math.max(15, Math.round(prescribedSets * 2.5));
        const coachLine = advice ? advice.detail.split(". ").slice(0, 2).join(". ") : "";
        return `
          <article class="template-card compact-template plan-template-card ex-block ${isActiveTemplate ? "active-template" : ""}">
            <div class="template-topline">
              <div class="template-title">${usesLargeTextReflow()
                ? '<textarea class="exercise-name autosize-title-field" rows="1" data-action="template-name" data-template-id="' + template.id + '" aria-label="Template name">' + escapeHtml(template.name) + '</textarea>'
                : '<input class="exercise-name" value="' + escapeHtml(template.name) + '" data-action="template-name" data-template-id="' + template.id + '" aria-label="Template name" />'}<small>${template.exercises.length} lifts · ${prescribedSets} prescribed sets · ~${duration} min</small></div>
              <div class="template-card-actions">${isActiveTemplate ? '<button class="primary-action template-start" type="button" data-action="resume-active-workout">Resume</button>' : '<button class="primary-action template-start" type="button" data-action="start-template" data-template-id="' + template.id + '" ' + startDisabledAttributes + '>Start</button>'}${isActiveTemplate
                ? '<button class="template-delete-button danger" type="button" disabled title="Finish or cancel the active workout before deleting this template" aria-label="Delete unavailable during active workout">' + icon.delete + '</button>'
                : confirmingDelete
                ? '<span class="template-delete-confirm"><button class="danger" type="button" data-action="confirm-delete-template" data-template-id="' + template.id + '">Delete</button><button type="button" data-action="cancel-delete-template">Cancel</button></span>'
                : '<button class="template-delete-button danger" type="button" data-action="request-delete-template" data-template-id="' + template.id + '" title="Delete template" aria-label="Delete ' + escapeHtml(template.name) + ' template">' + icon.delete + '</button>'}</div>
            </div>
            ${template.baseSessionIntent ? '<p class="template-coach"><strong>Base Session Intent</strong> ' + escapeHtml(template.baseSessionIntent) + '. Today’s readiness may modify load, sets, RPE, rest, or exercise selection before the workout begins.</p>' : ''}
            ${emptyTemplate ? '<p class="template-coach" id="' + escapeHtml(emptyTemplateDescriptionId) + '"><strong>Template needs an exercise.</strong> Add at least one exercise before starting this template.</p>' : ''}
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

      function renderHistory() {
        const sessions = data.sessions
          .filter((session) => isSessionSubmitted(session))
          .sort((left, right) => sessionCompletionDate(right).localeCompare(sessionCompletionDate(left))
            || String(right.submittedAt || right.updatedAt || "").localeCompare(String(left.submittedAt || left.updatedAt || "")));
        const rows = sessions.map((session) => {
          const facts = sessionWorkoutFacts(session);
          const storedGrade = typeof session.workoutAnalysis?.grade === "string" ? session.workoutAnalysis.grade : "";
          const details = [
            formatDate(sessionCompletionDate(session)),
            facts.exercises.length + " exercise" + (facts.exercises.length === 1 ? "" : "s"),
            facts.completed.length + " completed set" + (facts.completed.length === 1 ? "" : "s"),
            facts.durationMinutes ? facts.durationMinutes + " min" : "duration not recorded"
          ];
          return '<button class="row-item history-session-row" type="button" data-action="open-session" data-session-id="' + escapeHtml(session.id) + '"><span class="ri-copy"><b>' + escapeHtml(session.title || "Workout") + '</b><span>' + escapeHtml(details.join(" · ")) + '</span></span>' + (storedGrade ? '<span class="ri-val" aria-label="Stored workout grade ' + escapeHtml(storedGrade) + '">' + escapeHtml(storedGrade) + '</span>' : '') + '</button>';
        }).join("");
        return `
          <section class="screen-section history-view" aria-labelledby="completed-workouts-heading">
            <div class="section-heading"><div><h2 id="completed-workouts-heading">Completed workouts</h2><p>Every submitted workout remains available in chronological order.</p></div><span>${sessions.length}</span></div>
            <div class="history-session-list">${rows || '<div class="empty-state">Completed workouts will appear here.</div>'}</div>
          </section>
        `;
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
          id: raw.id || fallback.id || "",
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

      function previousComparableSetForRole(previousSets, setType, setTypeIndex = 0, workingSetIndex = 0) {
        const role = normalizeSetTypeCode(setType);
        const sameRole = (previousSets || []).filter((set) => normalizeSetTypeCode(set.setType, set.isWarmup) === role);
        return sameRole.find((set) => Number(set.setTypeIndex || 0) === Number(setTypeIndex || 0))
          || sameRole[Number(setTypeIndex || 0)]
          || null;
      }

      function resolvedSetTypesForPrescription(context, target, templateExercise = {}) {
        if (target?.executionBlocked === true || target?.finalPrescription?.executionBlocked === true || context?.executionBlocked === true) return [];
        const contextTypes = (context?.setTypes || []).filter((type) => type.countsTowardScore && !type.isWarmup);
        const savedTypes = (templateExercise.setTypes || []).filter((type) => type.countsTowardScore !== false && !type.isWarmup);
        const scored = contextTypes.length ? contextTypes : savedTypes;
        const stableCount = Math.max(1, Number(templateExercise.sets || scored.reduce((sum, type) => sum + Number(type.setCount || 0), 0) || 1));
        const temporaryException = target?.adjusted === true
          || target?.safetyAdjustment === true
          || target?.isDeload === true
          || ["deload", "light", "technique", "readiness-adjusted", "return", "stop-modify"].includes(String(target?.mode || ""));
        const requestedExceptionCount = Math.max(1, Number(target.sets || stableCount));
        const targetCount = temporaryException ? Math.min(stableCount, requestedExceptionCount) : stableCount;
        if ((!target.finalPrescription || typeof target.finalPrescription !== "object") && ["deload", "light", "technique"].includes(target.mode)) {
          const source = scored.find((type) => type.type === "straight") || scored[0] || {};
          const type = target.mode === "deload" ? "deload" : target.mode === "technique" ? "technique" : "straight";
          return [{ ...source, type, label: setTypeLabels[type], setCount: targetCount, rpeMin: Math.max(1, Number(target.rpe || 6.5) - 1), rpeMax: Number(target.rpe || 6.5), loadReductionMin: 0, loadReductionMax: 0, loadRule: target.mode === "deload" ? "Use the resolved deload load; no top set or intensification technique." : "Use lower-fatigue straight sets for this session." }];
        }
        if (!scored.length) {
          const defaults = setRoleDefaultsForExercise(templateExercise, "straight", progressionProfileForExercise(templateExercise.name), target.mode || "normal", target.rpe, target.restSeconds);
          return [{ ...defaults, type: "straight", label: setTypeLabels.straight, setCount: targetCount, countsTowardScore: true, countsTowardVolume: true }];
        }
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
        const { templateExercise, target, setType, setTypeIndex = 0, sequenceIndex = 0, workingSetIndex = 0, previousSets = [] } = options;
        const role = normalizeSetTypeCode(setType.type || setType.setType);
        const increment = Number(setType.increment || target.increment || templateExercise.increment || progressionProfileForExercise(templateExercise.name).increment || 1);
        const resistanceType = target.resistanceType || templateExercise.resistanceType || "external";
        const reductionMin = Number(setType.loadReductionMin || 0);
        const reductionMax = Number(setType.loadReductionMax || reductionMin || 0);
        const reduction = (reductionMin + reductionMax) / 2;
        const assisted = resistanceType === "assisted_bodyweight";
        const multiplier = reduction > 0 ? (assisted ? 1 + reduction / 100 : 1 - reduction / 100) : 1;
        const routineDefaultLoad = Number(setType.defaultLoad ?? setType.targetLoad ?? templateExercise.defaultLoad ?? templateExercise.targetLoad ?? templateExercise.weight ?? 0);
        const plannedTargetLoad = routineDefaultLoad > 0 ? roundEquipmentLoad(routineDefaultLoad * multiplier, increment) : 0;
        const roleDefaults = setRoleDefaultsForExercise(templateExercise, role, progressionProfileForExercise(templateExercise.name), target.mode || "normal", target.rpe, setType.restSeconds || target.restSeconds);
        const repRange = resolveProgrammedRepRange(setType, roleDefaults);
        const repMin = Number(repRange.repMin || target.repLow || 0);
        const repMax = Number(repRange.repMax || target.repHigh || repMin);
        const previousComparableSet = previousComparableSetForRole(previousSets, role, setTypeIndex, workingSetIndex);
        const previousReps = Number(previousComparableSet?.reps || 0);
        const comparableRoleSets = previousSets.filter((set) => normalizeSetTypeCode(set.setType, set.isWarmup) === role);
        const routineDefaultReps = Number(setType.defaultReps ?? templateExercise.defaultReps ?? templateExercise.reps ?? 0);
        const programmedTargetReps = previousReps || routineDefaultReps || 0;
        const stableRpeMin = Number(setType.rpeMin || Math.max(1, Number(setType.rpeMax || templateExercise.targetRpe || 0) - 1));
        const stableRpeMax = Number(setType.rpeMax || templateExercise.targetRpe || stableRpeMin);
        const previousRpe = Number(previousComparableSet?.rpe || 0);
        const routineDefaultRpe = Number(setType.defaultRpe ?? templateExercise.defaultRpe ?? stableRpeMax);
        const factualRpe = previousRpe > 0 ? previousRpe : routineDefaultRpe > 0 ? routineDefaultRpe : "";
        const temporaryException = target?.adjusted === true
          || target?.safetyAdjustment === true
          || target?.isDeload === true
          || ["deload", "light", "technique", "readiness-adjusted", "return", "stop-modify"].includes(String(target?.mode || ""));
        const exceptionRpe = temporaryException ? Number(target.rpe || 0) : 0;
        const prefillRpe = exceptionRpe > 0 && Number(factualRpe || 0) > 0 ? Math.min(Number(factualRpe), exceptionRpe) : factualRpe;
        const rpeMax = exceptionRpe > 0 ? Math.min(stableRpeMax, exceptionRpe) : stableRpeMax;
        const rpeMin = exceptionRpe > 0 ? Math.min(stableRpeMin, Math.max(1, exceptionRpe - 1)) : stableRpeMin;
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
        const previousLoad = previousComparableSet ? resistanceLoad(previousComparableSet, resistanceType) : 0;
        const factualLoad = previousLoad || plannedTargetLoad;
        const loadReductionPercent = temporaryException ? Math.max(0, Math.min(100, Number(target.loadReductionPercent || 0))) : 0;
        const reducedFactualLoad = factualLoad > 0 && loadReductionPercent > 0
          ? roundEquipmentLoad(factualLoad * (resistanceType === "assisted_bodyweight" ? 1 + loadReductionPercent / 100 : 1 - loadReductionPercent / 100), increment)
          : 0;
        const exceptionLoad = temporaryException ? Number(reducedFactualLoad || target.weight || 0) : 0;
        const targetLoad = exceptionLoad > 0
          ? factualLoad > 0
            ? resistanceType === "assisted_bodyweight" ? Math.max(factualLoad, exceptionLoad) : Math.min(factualLoad, exceptionLoad)
            : exceptionLoad
          : factualLoad;
        const targetReps = programmedTargetReps;
        const candidateNextLoad = resistanceType === "assisted_bodyweight"
          ? roundEquipmentLoad(Math.max(0, targetLoad - increment), increment)
          : roundEquipmentLoad(targetLoad + increment, increment);
        const nextLoad = progressionReady ? candidateNextLoad : targetLoad;
        const progressionRule = setType.progressionRule || ("Progress after reaching " + repMax + " reps within RPE " + targetRangeText(rpeMin, rpeMax) + " on " + (role === "backoff" ? "the comparable back-off work" : role === "top" ? "the top set" : "the programmed sets") + ".");
        const roleName = setTypeLabels[role] || "Working set";
        const prefillSource = previousComparableSet
          ? "prior_comparable_set"
          : routineDefaultLoad > 0 || routineDefaultReps > 0
            ? "routine_default"
            : temporaryException && exceptionLoad > 0 ? "temporary_exception" : "blank";
        const reason = prefillSource === "prior_comparable_set"
          ? "Prefilled from the corresponding " + roleName.toLowerCase() + " in the most recent comparable workout."
          : prefillSource === "routine_default"
            ? "Prefilled from the exercise variant's explicit routine default."
            : prefillSource === "temporary_exception"
              ? "Prefilled only with the active temporary exception's lower-demand load."
              : "No comparable prior set or explicit routine default is available, so input remains blank.";
        return { setType: role, sequenceIndex, setTypeIndex, targetLoad, targetReps, prefillRpe, repMin, repMax, programmedRepMin: repMin, programmedRepMax: repMax, exactReps: repRange.exactReps, rangeSource: repRange.rangeSource, rpeMin, rpeMax, restSeconds: Number(setType.restSeconds || templateExercise.restSeconds || 0), increment, nextLoad, candidateNextLoad, progressionReady, loadRule: setType.loadRule || "", progressionRule, reductionPercent: Math.max(reduction, loadReductionPercent), previousComparableSet, prefillSource, progressionDelta: previousComparableSet ? { load: Number((targetLoad - resistanceLoad(previousComparableSet, resistanceType)).toFixed(4)), reps: targetReps - previousReps } : null, confidence: previousComparableSet ? "high" : routineDefaultLoad > 0 || routineDefaultReps > 0 ? "high" : "low", evidenceConfidence: target.confidence || "low", reason: roleName + ": " + reason };
      }

      function validateGeneratedSetPrescriptions(prescriptions, resistanceType) {
        const top = prescriptions.find((item) => item.setType === "top");
        return prescriptions.map((item) => {
          if (!top || item.setType !== "backoff") return item;
          if (Number(top.targetLoad || 0) <= 0) return item;
          const identical = item.targetLoad === top.targetLoad && item.repMin === top.repMin && item.repMax === top.repMax && item.rpeMin === top.rpeMin && item.rpeMax === top.rpeMax;
          if (identical) return { ...item, validationWarning: "The preserved back-off role currently has the same factual prefill and stable target as the top set." };
          const demandReduced = resistanceType === "assisted_bodyweight" ? item.targetLoad > top.targetLoad : item.targetLoad < top.targetLoad;
          return demandReduced ? item : { ...item, validationWarning: "Back-off demand was not lower than the top set." };
        });
      }

      function templateSetTypesFromHistory(sets, restSeconds = 0) {
        const grouped = new Map();
        sets.filter((set) => isWorkingSet(set, "progression")).forEach((set) => {
          const type = normalizeSetTypeCode(set.setType, set.isWarmup);
          const repMin = Number(set.targetRepMin || set.targetReps || set.reps || 0);
          const repMax = Number(set.targetRepMax || set.targetReps || set.reps || repMin);
          const targetRpe = Number(set.targetRpe ?? set.targetRpeMax ?? set.rpe ?? 0);
          const setRestSeconds = Number(set.targetRestSeconds || restSeconds || 0);
          const key = [type, repMin, repMax, targetRpe, setRestSeconds].join("|");
          const bucket = grouped.get(key) || [];
          bucket.push(set);
          grouped.set(key, bucket);
        });
        return Array.from(grouped.values()).map((bucket, groupIndex) => {
          const first = bucket[0] || {};
          const type = normalizeSetTypeCode(first.setType, first.isWarmup);
          const repMins = bucket.map((set) => Number(set.targetRepMin || set.targetReps || set.reps || 0)).filter((value) => value > 0);
          const repMaxes = bucket.map((set) => Number(set.targetRepMax || set.targetReps || set.reps || 0)).filter((value) => value > 0);
          const targetRpes = bucket.map((set) => Number(set.targetRpe ?? set.targetRpeMax ?? set.rpe ?? 0)).filter((value) => value > 0);
          return normalizeTargetSetType({
            id: first.sourceTemplateSetId || `saved-set-target-${groupIndex + 1}`,
            type,
            setCount: bucket.length,
            repMin: repMins.length ? Math.min(...repMins) : 0,
            repMax: repMaxes.length ? Math.max(...repMaxes) : 0,
            rpeMin: targetRpes.length ? Math.max(1, Math.min(...targetRpes) - 1) : 0,
            rpeMax: targetRpes.length ? Math.max(...targetRpes) : 0,
            rangeSource: "saved-set-targets",
            historySampleSize: bucket.length,
            restSeconds: Number(first.targetRestSeconds || restSeconds || 0),
            loadReductionMin: type === "drop" ? 20 : 0,
            loadReductionMax: type === "drop" ? 25 : 0,
            countsTowardScore: true,
            countsTowardVolume: true
          });
        });
      }

      // EXERCISE_TARGET_ENGINE_END

      function exercisePerformanceSeries(exerciseName, options = {}) {
        const canonicalId = options.canonicalExerciseId || canonicalExerciseId(exerciseName);
        const cacheKey = [analysisRevision, canonicalId, options.resistanceType || ""].join("|");
        if (exerciseProgressCache.has(cacheKey)) return exerciseProgressCache.get(cacheKey);
        const sessionById = new Map(data.sessions.filter((session) => isSessionSubmitted(session)).map((session) => [session.id, session]));
        const scopedExercises = data.exercises.filter((exercise) =>
          sessionById.has(exercise.sessionId)
          && canonicalExerciseId(exercise) === canonicalId
        );
        const scopedExerciseIds = new Set(scopedExercises.map((exercise) => exercise.id));
        const setsByExercise = new Map();
        data.sets.forEach((set) => {
          if (!scopedExerciseIds.has(set.exerciseId)) return;
          const sets = setsByExercise.get(set.exerciseId) || [];
          sets.push(set);
          setsByExercise.set(set.exerciseId, sets);
        });
        const resistanceType = options.resistanceType || scopedExercises.map((exercise) => resistanceTypeFor(exercise)).find(Boolean) || "external";
        const labels = resistanceType === "external"
          ? { title: "Best completed load", metricType: "load", unit: data.settings.weightUnit }
          : resistanceType === "bodyweight_plus_load"
            ? { title: "Best added load", metricType: "added_load", unit: data.settings.weightUnit }
            : resistanceType === "assisted_bodyweight"
              ? { title: "Lowest assistance load", metricType: "assistance_load", unit: data.settings.weightUnit }
              : resistanceType === "duration"
                ? { title: "Best completed duration", metricType: "duration", unit: "sec" }
                : resistanceType === "distance"
                  ? { title: "Best completed distance", metricType: "distance", unit: "m" }
                  : { title: "Best completed reps", metricType: "reps", unit: "reps" };
        const points = scopedExercises.flatMap((exercise) => {
          const session = sessionById.get(exercise.sessionId);
          if (!session) return [];
          const completedSets = (setsByExercise.get(exercise.id) || []).filter((set) =>
            set.completed
            && !set.skipped
            && isWorkingSet(set, "progression")
          );
          const measured = completedSets.map((set) => {
            const load = resistanceLoad(set, resistanceType);
            const value = ["external", "bodyweight_plus_load", "assisted_bodyweight"].includes(resistanceType)
              ? load
              : resistanceType === "duration"
                ? Number(set.durationSeconds || 0)
                : resistanceType === "distance"
                  ? Number(set.distance || 0)
                  : Number(set.reps || 0);
            return { set, value };
          }).filter((item) => Number.isFinite(item.value) && item.value > 0);
          if (!measured.length) return [];
          measured.sort((left, right) => resistanceType === "assisted_bodyweight"
            ? left.value - right.value || Number(right.set.reps || 0) - Number(left.set.reps || 0)
            : right.value - left.value || Number(right.set.reps || 0) - Number(left.set.reps || 0));
          const best = measured[0];
          const completedDate = sessionCompletionDate(session);
          return [{
            label: formatDate(completedDate),
            date: completedDate,
            sessionId: session.id,
            sessionTitle: session.title || "Workout",
            value: Math.round(best.value * 10) / 10,
            metricType: labels.metricType,
            bestSet: best.set,
            details: completedSets.map((set) => ({
              ...set,
              resistanceType,
              sessionId: session.id,
              sessionTitle: session.title || "Workout",
              sessionDate: completedDate,
              exerciseName: exercise.name
            }))
          }];
        }).sort((left, right) => left.date.localeCompare(right.date)
          || String(left.sessionId).localeCompare(String(right.sessionId)));
        const result = { resistanceType, ...labels, points };
        exerciseProgressCache.set(cacheKey, result);
        return result;
      }

      function resetChartPointActivations() {
        chartPointActivations.clear();
        chartPointActivationEpoch += 1;
        chartPointActivationSequence = 0;
      }

      function registerChartPointActivation(chartKey, point, scope = {}) {
        chartPointActivationSequence += 1;
        const key = `cp_${chartPointActivationEpoch}_${chartPointActivationSequence}`;
        chartPointActivations.set(key, {
          chartKey: "performance",
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
        const padding = Math.max(spread * 0.14, rawMax * 0.045, 1);
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
        const chartSegments = chartPoints.slice(1).map((point, index) => {
          const previous = chartPoints[index];
          return '<polyline class="chart-line evidenced" points="' + previous.x.toFixed(1) + ',' + previous.y.toFixed(1) + ' ' + point.x.toFixed(1) + ',' + point.y.toFixed(1) + '" clip-path="url(#chart-clip-' + chartKey + ')"></polyline>';
        }).join("");
        const selected = chartDetailPoint?.chartKey === chartKey
          && chartDetailPoint?.exerciseId === (scope.exerciseId || "")
          ? chartDetailPoint : null;
        const selectedIndex = selected ? chartPoints.findIndex((point) => point.sessionId === selected.sessionId && point.value === selected.value) : -1;
        const selectedPoint = selectedIndex >= 0 ? chartPoints[selectedIndex] : null;
        const grid = [0, 1 / 3, 2 / 3, 1].map((ratio) => {
          const y = plot.top + ratio * plotHeight;
          const value = domainMax - ratio * domainSpread;
          return '<line class="chart-grid-line" x1="' + plot.left + '" y1="' + y.toFixed(1) + '" x2="' + (width - plot.right) + '" y2="' + y.toFixed(1) + '"></line><text class="chart-axis-label" x="' + (plot.left - 5) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + escapeHtml(formatChartAxisValue(value)) + '</text>';
        }).join("");
        const firstDateLabel = '<text class="chart-axis-label" x="' + plot.left + '" y="' + (height - 7) + '">' + escapeHtml(shortChartDate(chartPoints[0].date)) + '</text>';
        const lastDateLabel = '<text class="chart-axis-label" x="' + (width - plot.right) + '" y="' + (height - 7) + '" text-anchor="end">' + escapeHtml(shortChartDate(chartPoints.at(-1).date)) + '</text>';
        const middleIndex = Math.floor((chartPoints.length - 1) / 2);
        const middleDateLabel = chartPoints.length > 2
          ? '<text class="chart-axis-label" x="' + chartPoints[middleIndex].x.toFixed(1) + '" y="' + (height - 7) + '" text-anchor="middle">' + escapeHtml(shortChartDate(chartPoints[middleIndex].date)) + '</text>'
          : "";
        const dateLabels = chartPoints.length === 1
          ? '<text class="chart-axis-label" x="' + chartPoints[0].x.toFixed(1) + '" y="' + (height - 7) + '" text-anchor="middle">' + escapeHtml(shortChartDate(chartPoints[0].date)) + '</text>'
          : firstDateLabel + middleDateLabel + lastDateLabel;
        return `
          <div class="chart-card" data-chart-key="${chartKey}">
            <header><strong>${escapeHtml(title)}</strong><span>${chartPoints.length} session${chartPoints.length === 1 ? "" : "s"}</span></header>
            <div class="chart-svg">
              <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)} chart">
                <defs><clipPath id="chart-clip-${chartKey}"><rect x="${plot.left - 3}" y="${plot.top - 3}" width="${plotWidth + 6}" height="${plotHeight + 6}" rx="3"></rect></clipPath></defs>
                ${grid}
                ${chartSegments}
                ${selectedPoint ? '<line class="chart-selected-guide" x1="' + selectedPoint.x.toFixed(1) + '" y1="' + selectedPoint.y.toFixed(1) + '" x2="' + selectedPoint.x.toFixed(1) + '" y2="' + (plot.top + plotHeight).toFixed(1) + '"></line>' : ""}
                ${chartPoints.map((point, index) => { const isSelected = index === selectedIndex; const activationKey = registerChartPointActivation(chartKey, point, scope); return '<g class="chart-point evidenced ' + (isSelected ? 'selected' : '') + '" role="button" tabindex="0" aria-pressed="' + (isSelected ? 'true' : 'false') + '" aria-label="' + escapeHtml(title + ': ' + point.value + ' on ' + formatDate(point.date) + ' in ' + point.sessionTitle) + '" data-action="show-chart-point" data-chart-key="' + chartKey + '" data-chart-date="' + escapeHtml(point.date) + '" data-chart-point-key="' + activationKey + '"><circle class="hit-area" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="34"></circle><circle class="selected-ring" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="9"></circle><circle class="visible-point" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="4.5"></circle></g>'; }).join("")}
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

      function chartPointSessionGroups(point) {
        const groups = new Map();
        (point.details || []).forEach((set) => {
          const key = set.sessionId || set.sessionTitle || point.date;
          const group = groups.get(key) || {
            id: set.sessionId || "",
            title: set.sessionTitle || "Workout on " + formatDate(point.date),
            date: set.sessionDate || point.date,
            sets: []
          };
          group.sets.push(set);
          groups.set(key, group);
        });
        return Array.from(groups.values()).map((group) => ({
          ...group,
          sets: group.sets.slice().sort((left, right) => canonicalSetSequence(left) - canonicalSetSequence(right))
        }));
      }

      function renderChartPointSetGroups(point) {
        const groups = chartPointSessionGroups(point);
        return groups.map((group) => '<section class="chart-session-group"><button class="row-item" type="button" data-action="open-session" data-session-id="' + escapeHtml(group.id) + '"><span class="ri-copy"><b>' + escapeHtml(group.title) + '</b><span>' + formatDate(group.date) + '</span></span><span class="ri-val">Open</span></button><div class="chart-set-facts">'
          + group.sets.map((set, index) => {
            const exercise = data.exercises.find((item) => item.id === set.exerciseId) || selectedExerciseRecord();
            const semantics = setTypeSemantics(set);
            const role = setTypeLabels[semantics.type] || (semantics.isWarmup ? "Warm-up set" : "Working set");
            const resistance = formatResistance(set, exercise);
            const facts = [
              resistance || "load not recorded",
              Number(set.reps || 0) > 0 ? formatLoadNumber(set.reps) + " reps" : "reps not recorded",
              Number(set.rpe || 0) > 0 ? "RPE " + formatLoadNumber(set.rpe) : "RPE not recorded"
            ];
            return '<div class="row-item chart-set-fact"><span class="ri-copy"><b>Set ' + (Number(set.setNumber) || index + 1) + ' · ' + escapeHtml(role) + '</b><span>' + escapeHtml(facts.join(" · ")) + '</span></span></div>';
          }).join("") + '</div></section>').join("");
      }

      function renderChartPointDetail(chartKey, title, point, points) {
        const exerciseName = selectedExerciseName();
        const exercise = selectedExerciseRecord();
        const best = point.bestSet || point.details?.[0] || null;
        const unitLabel = ["load", "added_load", "assistance_load"].includes(point.metricType)
          ? " " + data.settings.weightUnit
          : point.metricType.includes("duration") ? " sec"
            : point.metricType.includes("distance") ? " m"
              : " reps";
        const close = '<button class="icon-button" type="button" data-action="close-chart-point" aria-label="Close chart detail">' + icon.close + '</button>';
        const role = best ? setTypeLabels[setTypeSemantics(best).type] || (best.isWarmup ? "Warm-up set" : "Working set") : "";
        return '<article class="chart-detail" role="status"><div class="row split"><div><span class="section-kicker">Selected session · ' + formatDate(point.date) + '</span><strong>' + escapeHtml(title + ' · ' + point.value + unitLabel) + '</strong><span class="chart-detail-exercise">' + escapeHtml(exerciseName) + ' · ' + escapeHtml(point.sessionTitle || "Workout") + '</span></div>' + close + '</div>'
          + '<div class="rollup chart-point-rollup"><span class="ru"><b>' + (best ? escapeHtml(formatResistance(best, exercise)) : noData("Load unavailable")) + '</b><span>load</span></span><span class="ru"><b>' + (best?.reps ? escapeHtml(best.reps) : noData("Repetitions unavailable")) + '</b><span>reps</span></span><span class="ru"><b>' + (best?.rpe ? escapeHtml(best.rpe) : noData("RPE unavailable")) + '</b><span>RPE</span></span><span class="ru"><b>' + (role ? escapeHtml(role) : noData("Role unavailable")) + '</b><span>role</span></span></div>'
          + '<div><div class="m-label"><span>Recorded sets</span><span>source facts</span></div>' + renderChartPointSetGroups(point) + '</div></article>';
      }

      function renderLiftProgress() {
        resetChartPointActivations();
        const catalog = exerciseCatalog();
        if ((!selectedExerciseId || !catalog.some((item) => item.id === selectedExerciseId)) && catalog[0]) {
          selectedExerciseId = catalog[0].id;
          chartExerciseDraft = catalog[0].name;
        }
        const exercise = selectedExerciseRecord();
        const selectedName = exercise?.name || "";
        const progress = selectedName
          ? measurePerformance("charts:exercisePerformanceSeries", () => exercisePerformanceSeries(selectedName, { canonicalExerciseId: selectedExerciseId, resistanceType: exercise?.resistanceType }), { exerciseId: selectedExerciseId })
          : { points: [], title: "Performance", unit: "", resistanceType: "external" };
        if (catalog.length === 0) {
          return '<section class="view charts-view"><div class="screen-heading"><div><div class="section-kicker">Progress</div><h1>Training history</h1></div></div><div class="empty-state">Complete a workout to add exercise history.</div>' + renderHistory() + '</section>';
        }
        const latestPoint = progress.points.at(-1);
        const latestFact = latestPoint?.bestSet
          ? formatSetPerformance(latestPoint.bestSet, exercise) + " · " + formatDate(latestPoint.date)
          : "No comparable completed working set yet.";
        const chartPointScope = {
          exerciseId: selectedExerciseId,
          resistanceType: exercise?.resistanceType || progress.resistanceType
        };
        return `
          <section class="view charts-view">
            <div class="screen-heading"><div><div class="section-kicker">Progress</div><h1>Training history</h1></div></div>
            <div class="chart-control-panel" aria-label="Selected lift controls">
              <div class="chart-viewing-summary"><div><span>Exercise or variant</span><strong>${escapeHtml(selectedName)}</strong><span>${escapeHtml(latestFact)}</span></div><span class="status-pill inside">${progress.points.length} session${progress.points.length === 1 ? "" : "s"}</span></div>
              <div class="chart-control-field chart-control-lift"><label for="chart-exercise-search">Chart lift</label><div class="chart-search-input"><input id="chart-exercise-search" type="search" data-action="review-exercise-input" role="combobox" aria-autocomplete="list" aria-controls="chart-exercise-suggestions" aria-expanded="${chartExerciseSearchOpen ? 'true' : 'false'}" aria-label="Search or select exercise" autocomplete="off" value="${escapeHtml(chartExerciseDraft || selectedName)}" /><button class="chart-search-clear" type="button" data-action="clear-chart-exercise-search" aria-label="Clear exercise search">×</button></div><div id="chart-exercise-suggestions" class="exercise-suggestions" role="listbox" ${chartExerciseSearchOpen ? '' : 'hidden'}>${renderExerciseSuggestions()}</div><small class="exercise-search-error" role="status" ${chartExerciseSearchError ? '' : 'hidden'}>${escapeHtml(chartExerciseSearchError)}</small></div>
              <p class="chart-control-context">The chart uses recorded completed working sets from submitted workouts. Named variants remain separate.</p>
            </div>
            <section class="screen-section primary-analysis-chart">
              <div class="section-heading"><div><h2>Performance trend</h2><p>Tap a point for its date, load, reps, RPE, role, and workout.</p></div></div>
              ${renderChart("performance", progress.title, progress.points, "No comparable completed sets yet.", chartPointScope)}
            </section>
            ${renderHistory()}
          </section>
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
        return '<label class="field alert-setting-field ' + (options.unavailable ? 'unavailable' : '') + '"><span class="f-top"><span class="f-name">' + escapeHtml(label) + '</span><span class="toggle ' + (selected ? 'on' : '') + '"><input type="checkbox" data-action="' + action + '" ' + (checked ? 'checked' : '') + ' ' + (options.unavailable ? 'disabled' : '') + ' aria-label="' + escapeHtml(label) + '" /><i aria-hidden="true"></i></span></span><span class="f-help">' + escapeHtml(detail) + ' <b class="setting-state">' + escapeHtml(stateLabel) + '.</b></span></label>';
      }

      function renderPwaSetup() {
        const installed = isStandalonePwa();
        const status = notificationStatus();
        const notificationsReady = status.lockScreenReady;
        const tested = Boolean(pushIdentity?.testedAt);
        const soundReady = Boolean(data.settings.setupSoundConfirmed);
        return `
          <div class="setup-flow">
            <div class="row-item setup-step ${installed ? "complete" : ""}"><span class="ri-copy"><b>Install the app</b><span>${installed ? "Running as an installed Home Screen app." : "In Safari: Share > Add to Home Screen > Open as Web App > Add."}</span></span>${installed ? '<span class="ri-val">Installed</span>' : '<button type="button" data-action="dismiss-install-guide">Instructions read</button>'}</div>
            <div class="row-item setup-step ${notificationsReady ? "complete" : ""}"><span class="ri-copy"><b>Enable notifications</b><span>Alerts can arrive while the phone is locked or another app is open, subject to system notification, Silent Mode, and Focus settings.</span></span><button class="${notificationsReady ? 'selected-control' : ''}" type="button" data-action="request-notifications">${notificationsReady ? "Enabled" : "Enable"}</button></div>
            <div class="row-item setup-step ${tested ? "complete" : ""}"><span class="ri-copy"><b>Test notification</b><span>Send a server push to verify this installation and its lock-screen permission.</span></span><button type="button" data-action="test-notification" ${notificationsReady ? "" : "disabled"}>Send test</button></div>
            <div class="row-item setup-step ${soundReady ? "complete" : ""}"><span class="ri-copy"><b>Confirm foreground sound</b><span>Audio is primed by this tap so timer completion does not fail silently.</span></span><button class="${soundReady ? 'selected-control' : ''}" type="button" data-action="test-timer-sound">${soundReady ? "Confirmed" : "Test sound"}</button></div>
          </div>
        `;
      }

      function renderSettingsGroup(title, meta, content, options = {}) {
        return `<details class="group settings-group ${options.className || ""}" ${options.id ? 'id="' + escapeHtml(options.id) + '"' : ""} ${options.open ? "open" : ""}><summary><span class="g-top"><span class="g-name">${escapeHtml(title)}</span><span class="g-meta">${escapeHtml(meta)}</span></span></summary><div class="settings-panel">${content}</div></details>`;
      }

      function renderSegmentedSetting(action, name, currentValue, options) {
        return '<div class="segmented">' + options.map(([value, label]) => '<label><input type="radio" name="' + escapeHtml(name) + '" value="' + escapeHtml(value) + '" data-action="' + escapeHtml(action) + '" ' + (currentValue === value ? 'checked' : '') + ' /><span>' + escapeHtml(label) + '</span></label>').join('') + '</div>';
      }

      function renderStoragePersistenceFact() {
        const presentation = storagePersistenceStatus === "granted"
          ? { detail: "Granted by this browser.", value: "granted" }
          : storagePersistenceStatus === "not-granted"
            ? { detail: "Not granted. Local data can still be stored, but the browser may evict it under storage pressure.", value: "not granted" }
            : { detail: "This browser does not expose storage-persistence status.", value: "unsupported" };
        return '<div class="row-item storage-persistence-fact"><span class="ri-copy"><b>Storage persistence</b><span>' + escapeHtml(presentation.detail) + '</span></span><span class="ri-val settings-fact">' + escapeHtml(presentation.value) + '</span></div>';
      }

      function renderSettings() {
        const baseline = readinessBaseline();
        const pushStatus = notificationStatus();
        const migration = data.migrationAudit?.at(-1);
        const reviewSets = data.sets.filter((set) => set.reviewRequired);
        const localClearBlock = localClearBlockReason();
        const cloudEnabled = data.settings.cloudWorkoutSyncConsent === true;
        const colorPackages = [
          ["heritage-atlas", "Heritage Atlas"], ["signal-garden", "Signal Garden"], ["alpine-ledger", "Alpine Ledger"],
          ["training-hall", "Training Hall"], ["harbor-pulse", "Harbor Pulse"], ["prairie-electric", "Prairie Electric"],
          ["redwood-circuit", "Redwood Circuit"], ["mediterranean-set", "Mediterranean Set"], ["modern-primary", "Modern Primary"],
          ["night-stadium", "Night Stadium"]
        ];
        const appearance = `
          <div class="field"><div class="f-top"><span class="f-name">Weight unit</span><span class="f-help">Converts load-bearing app data</span></div>${renderSegmentedSetting("weight-unit", "settings-weight-unit", data.settings.weightUnit, [["lb", "Pounds"], ["kg", "Kilograms"]])}</div>
          <div class="field"><div class="f-top"><span class="f-name">Theme</span><span class="f-help">Display only</span></div>${renderSegmentedSetting("theme-mode", "settings-theme", data.settings.theme, [["light", "Light"], ["dark", "Dark"]])}</div>
          <div class="field"><div class="f-top"><span class="f-name">Colour package</span><span class="f-help">10 available</span></div><div class="chiprow color-package-picks">${colorPackages.map(([value, label]) => '<label class="pick" data-color-package="' + value + '"><input type="radio" name="settings-color-package" value="' + value + '" data-action="color-package" ' + (data.settings.colorPackage === value ? 'checked' : '') + ' /><span class="package-swatches" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>' + label + '</span></label>').join('')}</div><span class="f-help">Changes semantic surfaces and state colours without changing training logic.</span></div>`;
        const alerts = `
          <div class="alert-settings-list">
            ${renderAlertSetting("timer-notifications", "Lock-screen rest notifications", "Requires permission and an installed Home Screen app.", pushStatus.notificationsEnabled, { stateLabel: pushStatus.permissionStatus === "denied" ? "Permission denied" : pushStatus.lockScreenReady ? "Enabled" : "Needs setup" })}
            ${renderAlertSetting("in-app-rest-alerts", "In-app completion alert", "Shows the tappable Rest complete banner while using the app.", pushStatus.inAppAlertEnabled)}
            ${renderAlertSetting("timer-sound", "Foreground completion sound", "Respects browser audio restrictions and system controls.", pushStatus.foregroundSoundEnabled, { stateLabel: pushStatus.foregroundSoundEnabled ? (pushStatus.soundConfirmed ? "Confirmed" : "Not tested") : "Disabled" })}
            ${renderAlertSetting("timer-vibration", "Browser vibration", "Used only where the browser exposes vibration support.", data.settings.timerVibration !== false, { unavailable: !pushStatus.vibrationSupported, stateLabel: pushStatus.vibrationSupported ? "Enabled" : "Unsupported" })}
            ${renderAlertSetting("workout-completion-sound", "Workout and PR sound", "Plays only for workout completion and meaningful milestones.", data.settings.workoutCompletionSound !== false)}
          </div>
          <label class="field"><span class="f-top"><span class="f-name">Rest-complete sound</span></span><select data-action="rest-complete-sound"><option value="sharp_two_tone" ${data.settings.restCompleteSound === "sharp_two_tone" ? "selected" : ""}>Sharp two-tone chime (default)</option><option value="clear_bell" ${data.settings.restCompleteSound === "clear_bell" ? "selected" : ""}>Clear bell</option><option value="whistle" ${data.settings.restCompleteSound === "whistle" ? "selected" : ""}>Whistle tone</option></select></label>
          <div class="field"><div class="f-top"><span class="f-name">Rest-complete volume</span><button type="button" data-action="preview-rest-complete-sound">Preview sound</button></div><input type="range" min="0" max="1" step="0.05" value="${Number(data.settings.restCompleteSoundVolume ?? 0.85)}" data-action="rest-complete-volume" aria-label="Rest-complete volume" /></div>
          <label class="field"><span class="f-top"><span class="f-name">Alert auto-dismiss</span><span class="f-help">Seconds</span></span><input type="number" min="1" max="60" step="1" value="${Math.round(Number(data.settings.restCompleteAutoDismissMs || 5000) / 1000)}" data-action="rest-complete-dismiss-seconds" /></label>
          ${renderAlertSetting("rest-complete-auto-return", "Return after alert", "Return to the active workout automatically when the in-app alert dismisses.", data.settings.restCompleteAutoReturnToWorkout === true)}
          ${renderAlertSetting("interaction-vibration", "Interaction vibration", "Used only where the browser exposes vibration support.", data.settings.interactionVibration !== false)}
          <div class="field"><div class="f-top"><span class="f-name">Default rest duration</span><span class="f-help">Seconds · per-exercise and per-set targets override this</span></div><div class="stepper settings-rest-stepper"><button class="sb" type="button" data-action="adjust-default-rest" data-delta="-15" aria-label="Reduce default rest by 15 seconds">&minus;</button><input class="sv" type="number" min="15" max="900" step="15" value="${Number(data.settings.defaultRestSeconds || 90)}" data-action="default-rest-seconds" aria-label="Default rest duration in seconds" /><button class="sb" type="button" data-action="adjust-default-rest" data-delta="15" aria-label="Increase default rest by 15 seconds">+</button></div></div>
          <div class="field"><div class="f-top"><span class="f-name">Notification detail</span><span class="f-help">Visible lock-screen wording only</span></div>${renderSegmentedSetting("notification-detail", "settings-notification-detail", data.settings.notificationMessageDetail === "private" ? "private" : "exercise-set", [["exercise-set", "Exercise and set"], ["private", "Private body"]])}</div>
          <div class="callout warn notification-privacy-boundary"><b>Private changes the visible notification body only</b><span>The notification service still receives installation and timer identifiers, workout, exercise and set identifiers, the exercise name, the upcoming-set label or number, and the completion time. Private body mode hides those workout details from the visible alert; it does not keep them off the server-side timer record.</span></div>
          ${renderAlertSetting("auto-start-rest", "Start rest automatically", "Starts the prescribed rest after a set is completed.", data.settings.autoStartRestTimer !== false)}
          ${renderAlertSetting("auto-highlight-next", "Highlight the next set", "Marks the next planned set when rest ends.", data.settings.autoHighlightNextSet !== false)}
          ${"Notification" in window && Notification.permission === "denied" ? '<div class="callout bad"><b>Notification permission denied</b><span>Open system notification settings for Comprehensive Fitness, then enable alerts, sounds, and lock-screen delivery.</span></div>' : ""}
          <div class="m-label"><span>Installed app setup</span><span>${escapeHtml(pushStatus.label)}</span></div>${renderPwaSetup()}
          ${notificationMessage ? '<p class="settings-note">' + escapeHtml(notificationMessage) + '</p>' : ""}`;
        const readiness = `
          <div class="callout provisional"><b>Your usual range</b><span>These values are your stored normal averages. Blank metrics remain missing; they are never treated as zero.</span></div>
          <div class="recovery-inputs">
            <label class="field"><span class="f-name">Average sleep hours</span><input type="number" min="0" max="14" step="0.25" value="${escapeHtml(baseline.sleepHours)}" data-action="baseline-sleep-hours" /></label>
            <label class="field"><span class="f-name">Average sleep quality</span><input type="number" min="1" max="5" step="1" value="${escapeHtml(baseline.sleepQuality)}" data-action="baseline-sleep-quality" /></label>
            <label class="field"><span class="f-name">Average HRV</span><input type="number" min="0" step="1" value="${escapeHtml(baseline.hrv)}" data-action="baseline-hrv" /></label>
            <label class="field"><span class="f-name">Average resting HR</span><input type="number" min="0" step="1" value="${escapeHtml(baseline.restingHr)}" data-action="baseline-resting-hr" /></label>
            <label class="field"><span class="f-name">Average soreness</span><input type="number" min="1" max="5" step="1" value="${escapeHtml(baseline.soreness)}" data-action="baseline-soreness" /></label>
            <label class="field"><span class="f-name">Band tolerance</span><input type="number" min="3" max="20" step="1" value="${escapeHtml(baseline.band)}" data-action="baseline-band" /></label>
          </div>`;
        const dataAndBackup = `
          <div class="callout info privacy-boundary"><b>Local by default</b><span>Workout history, templates, settings, readiness, and imported personal evidence stay in this browser unless you explicitly export them or enable the workout cloud copy.</span></div>
          ${renderAlertSetting("cloud-workout-sync-consent", "Optional workout cloud copy", "Default off. When enabled, the app may transmit the full current session—including an active, unsubmitted workout—and every associated exercise and set object. Server copies expire after 90 days, are write-only, and cannot be restored in the app.", cloudEnabled, { stateLabel: cloudEnabled ? "Enabled" : "Local only" })}
          <div class="callout bad cloud-not-backup"><b>Cloud copy is not a backup</b><span>There is no cloud-history or restore endpoint. A downloaded app-data export is the only implemented copy that can be imported to recover these records. ${cloudEnabled ? "Cloud copy is currently enabled, but it still cannot restore this app." : "Cloud copy is currently off."}</span></div>
          <div class="recoverability-list"><div class="m-label"><span>Recoverability</span><span>verified facts</span></div>${renderStoragePersistenceFact()}<div class="row-item"><span class="ri-copy"><b>Recoverable copy</b><span>The app does not record when you last exported. Create and retain a downloaded export yourself.</span></span><span class="ri-val">Export only</span></div></div>
          ${syncMessage ? '<p class="settings-note">' + escapeHtml(syncMessage) + '</p>' : ''}
          ${importAttempt ? '<p role="status" aria-live="polite" data-import-status data-import-state="' + escapeHtml(importStatus.state) + '" data-import-attempt="' + importAttempt + '">' + escapeHtml(importStatus.message) + '</p>' : ''}
          ${importInProgress ? '<div class="state-skeleton import-skeleton" role="status" aria-live="polite"><span class="skeleton skeleton-kicker" aria-hidden="true"></span><span class="skeleton skeleton-title" aria-hidden="true"></span><span class="skeleton skeleton-panel" aria-hidden="true"></span><span class="visually-hidden">Importing workout history. Navigation will recover automatically when it finishes.</span></div>' : ""}
          <button class="primary-action" type="button" data-action="export-data">${icon.download} Export all app data</button>
          ${exportText ? '<textarea class="export-box" readonly aria-label="Exported backup JSON">' + escapeHtml(exportText) + '</textarea>' : ""}
          <label class="field"><span class="f-top"><span class="f-name">Strong CSV source weight unit</span><span class="f-help">Does not change the display unit</span></span><select data-action="strong-import-weight-unit"><option value="" ${!strongImportWeightUnit ? "selected" : ""}>Choose the unit used in the CSV</option><option value="lb" ${strongImportWeightUnit === "lb" ? "selected" : ""}>Pounds (lb)</option><option value="kg" ${strongImportWeightUnit === "kg" ? "selected" : ""}>Kilograms (kg)</option></select></label>
          <label class="import-button">${icon.upload} ${importInProgress ? "importing..." : "Import backup or Strong CSV"}<input type="file" accept=".json,.csv,application/json,text/csv" data-action="import-data" ${importInProgress ? "disabled" : ""} /></label>
          ${migration ? '<div class="callout info"><b>Strong data migration v' + escapeHtml(migration.version) + '</b><span>Inspected ' + escapeHtml(migration.inspected) + ' sets; changed ' + escapeHtml(migration.changed) + '; preserved ' + escapeHtml(migration.manualOverridesPreserved) + ' manual corrections; ' + escapeHtml(migration.ambiguous) + ' sets need review.</span></div>' : ''}
          <div class="row-item"><span class="ri-copy"><b>Retained source material</b><span>${data.rawImports?.length || 0} raw Strong import${(data.rawImports?.length || 0) === 1 ? '' : 's'} retained. Older completed workouts remain in the retention archive and exports, but outside current analysis.</span></span></div>
          ${reviewSets.length ? '<div class="callout warn"><b>Manual review queue · ' + reviewSets.length + '</b><span>Open the submitted workout from History, choose Edit, then select the set type.</span></div>' : ''}`;
        const danger = `
          <div class="callout bad"><b>High-risk actions</b><span>These actions change or delete stored records. Each destructive path names its scope and requires confirmation.</span></div>
          <div class="row-item"><span class="ri-copy"><b>Clear All Local App Data</b><span>Removes local app records. Retained server records are deleted first; clearing pauses offline or while remote cleanup is unresolved.</span></span><button class="danger-button" type="button" data-action="clear-data" ${localClearBlock ? "disabled" : ""}>Clear All Local App Data</button></div>
          ${localClearBlock ? '<p class="settings-note" role="status">' + escapeHtml(localClearBlock) + '</p>' : ''}
          <div class="row-item"><span class="ri-copy"><b>Delete Remote Installation Data</b><span>Revokes this installation and removes its remote notification and workout-copy records. Local workouts remain.</span></span><button class="danger-button" type="button" data-action="delete-remote-installation" ${pushIdentity?.token ? "" : "disabled"}>${pushIdentity?.deletion?.retryable ? "Retry Remote Deletion" : "Delete Remote Installation Data"}</button></div>
          ${pushIdentity?.deletion?.message ? '<p class="settings-note" role="status">' + escapeHtml(pushIdentity.deletion.message) + '</p>' : ''}
          <div class="m-label"><span>Support</span><span>guidance</span></div><p class="settings-note">Progression guidance is informational fitness guidance, not medical advice. Stop if something hurts and use your own judgment.</p><p class="settings-links"><a href="./privacy.html">Privacy Policy</a><a href="./support.html">Support</a></p>`;
        return `
          <section class="view settings-view">
            <div class="screen-heading"><div><div class="section-kicker">Settings</div><h1>App settings.</h1><p>Timer behavior, readiness defaults, privacy, and data controls.</p></div><button type="button" data-action="open-routines">Routines</button></div>
            ${appDataPersistenceConflict ? '<p class="settings-note persistence-conflict-note" role="status">' + escapeHtml(appDataPersistenceConflict.message) + '</p>' : ""}
            ${settingsMessage ? '<p class="settings-note persistence-status-note" role="status">' + escapeHtml(settingsMessage) + '</p>' : ""}
            ${renderSettingsGroup("Appearance and units", "Display", appearance, { open: true })}
            ${renderSettingsGroup("Rest timer and alerts", pushStatus.label, alerts)}
            ${renderSettingsGroup("Readiness baseline", "Your usual", readiness)}
            ${renderSettingsGroup("Data and backup", "Privacy and recovery", dataAndBackup)}
            <div id="support-guidance" class="settings-support-anchor">
              ${renderSettingsGroup("Danger Zone", "Support and high-risk actions", danger, { className: "danger-zone", open: false })}
            </div>
          </section>
        `;
      }
