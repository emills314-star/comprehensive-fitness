
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

      function renderTemplateNumericInput(template, exercise, action, modelValue, fieldLabel) {
        const config = templateNumericFields[action];
        const draft = templateNumericDrafts.get(templateNumericDraftKey(template.id, exercise.id, action));
        const invalid = Boolean(draft?.invalid);
        const value = draft ? draft.raw : modelValue;
        const describedBy = invalid ? ` aria-describedby="${templateNumericAlertId(template.id)}"` : "";
        const ariaLabel = `${fieldLabel} for ${exercise.name}`;
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
        const exercise = data.templates.find((template) => template.id === templateId)?.exercises.find((item) => item.id === exerciseId);
        const current = exercise?.[config.field];
        if (Number(current) === numeric) return true;
        const nextRepMin = config.field === "repMin" ? numeric : Number(exercise?.repMin || exercise?.reps || 0);
        const nextRepMax = config.field === "repMax" ? numeric : Number(exercise?.repMax || exercise?.reps || 0);
        if (nextRepMin > nextRepMax) {
          templateNumericDrafts.set(key, { templateId, exerciseId, action, raw, invalid: true });
          syncTemplateNumericValidationDom(target);
          return true;
        }
        const patch = { [config.field]: numeric };
        patchTemplateExercise(templateId, exerciseId, patch, false);
        return true;
      }

      function renderTemplateCard(template, running = activeWorkoutSession()) {
        const isActiveTemplate = running?.templateId === template.id;
        const isExpectedTemplate = data.settings.expectedTemplateId === template.id;
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
                ? '<textarea class="exercise-name autosize-title-field" rows="1" maxlength="256" data-action="template-name" data-template-id="' + template.id + '" aria-label="Template name">' + escapeHtml(template.name) + '</textarea>'
                : '<input class="exercise-name" value="' + escapeHtml(template.name) + '" maxlength="256" data-action="template-name" data-template-id="' + template.id + '" aria-label="Template name" />'}<small>${template.exercises.length} lifts · ${prescribedSets} prescribed sets · ~${duration} min</small></div>
              <div class="template-card-actions">${isActiveTemplate ? '<button class="primary-action template-start" type="button" data-action="resume-active-workout">Resume</button>' : '<button class="primary-action template-start" type="button" data-action="start-template" data-template-id="' + template.id + '" ' + startDisabledAttributes + '>Start</button>'}<button class="secondary-action" type="button" data-action="set-expected-template" data-template-id="${template.id}" aria-pressed="${isExpectedTemplate ? "true" : "false"}" ${isExpectedTemplate ? "disabled" : ""}>${isExpectedTemplate ? "Expected workout" : "Set as expected"}</button><button class="icon-button" type="button" data-action="duplicate-template" data-template-id="${template.id}" title="Duplicate routine" aria-label="Duplicate ${escapeHtml(template.name)} routine">${icon.duplicate}</button>${isActiveTemplate
                ? '<button class="template-delete-button danger" type="button" disabled title="Finish or cancel the active workout before deleting this template" aria-label="Delete unavailable during active workout">' + icon.delete + '</button>'
                : confirmingDelete
                ? '<span class="template-delete-confirm"><button class="danger" type="button" data-action="confirm-delete-template" data-template-id="' + template.id + '">Delete</button><button type="button" data-action="cancel-delete-template">Cancel</button></span>'
                : '<button class="template-delete-button danger" type="button" data-action="request-delete-template" data-template-id="' + template.id + '" title="Delete template" aria-label="Delete ' + escapeHtml(template.name) + ' template">' + icon.delete + '</button>'}</div>
            </div>
            ${emptyTemplate ? '<p class="template-coach" id="' + escapeHtml(emptyTemplateDescriptionId) + '"><strong>Template needs an exercise.</strong> Add at least one exercise before starting this template.</p>' : ''}
            ${advice ? '<p class="template-coach"><strong>' + escapeHtml(advice.label) + '</strong> ' + escapeHtml(coachLine) + '</p>' : ''}
            <fieldset class="template-weekdays"><legend>Scheduled days</legend><div class="weekday-options">${weekdayKeys.map((day) => '<label><input type="checkbox" data-action="template-scheduled-weekday" data-template-id="' + template.id + '" value="' + day + '" ' + (normalizeScheduledWeekdays(template.scheduledWeekdays).includes(day) ? 'checked' : '') + ' /><span>' + day.slice(0, 3) + '</span></label>').join('')}</div></fieldset>
            <details class="compact-disclosure template-editor" ${editorExpanded ? 'open' : ''}>
              <summary data-action="toggle-template-editor" data-template-id="${template.id}">Edit template <span>${template.exercises.length} lifts</span></summary>
              ${editorExpanded ? `<div class="disclosure-body">
                ${renderTemplateNumericAlert(template.id)}
                <ul class="template-list">
                  ${template.exercises.map((exercise, exerciseIndex) => `
                    <li data-template-exercise-id="${exercise.id}">
                      <input value="${escapeHtml(exercise.name)}" data-action="template-exercise-name" data-template-id="${template.id}" data-template-exercise-id="${exercise.id}" aria-label="Exercise name for ${escapeHtml(exercise.name)}" maxlength="256" />
                      <div class="grid two">
                        <label class="template-meta">Sets${renderTemplateNumericInput(template, exercise, "template-exercise-sets", exercise.sets, "Sets")}</label>
                        <label class="template-meta">Rep minimum${renderTemplateNumericInput(template, exercise, "template-exercise-rep-min", exercise.repMin || exercise.reps, "Minimum repetitions")}</label>
                      </div>
                      <div class="grid two">
                        <label class="template-meta">Rep maximum${renderTemplateNumericInput(template, exercise, "template-exercise-rep-max", exercise.repMax || exercise.reps, "Maximum repetitions")}</label>
                        <label class="template-meta">Target RPE${renderTemplateNumericInput(template, exercise, "template-exercise-rpe", exercise.targetRpe || 8, "Target RPE")}</label>
                      </div>
                      <label class="template-meta">Rest seconds${renderTemplateNumericInput(template, exercise, "template-exercise-rest", exercise.restSeconds || recommendedRestSeconds(exercise.name, { reps: exercise.reps }), "Rest seconds")}</label>
                      <div class="template-card-actions template-exercise-actions"><button class="mini-button" type="button" data-action="move-template-exercise" data-direction="up" data-template-id="${template.id}" data-template-exercise-id="${exercise.id}" ${exerciseIndex === 0 ? "disabled" : ""} aria-label="Move ${escapeHtml(exercise.name)} earlier">Move up</button><button class="mini-button" type="button" data-action="move-template-exercise" data-direction="down" data-template-id="${template.id}" data-template-exercise-id="${exercise.id}" ${exerciseIndex === template.exercises.length - 1 ? "disabled" : ""} aria-label="Move ${escapeHtml(exercise.name)} later">Move down</button><button class="mini-button danger" type="button" data-action="delete-template-exercise" data-template-id="${template.id}" data-template-exercise-id="${exercise.id}" aria-label="Remove ${escapeHtml(exercise.name)}">Remove exercise</button></div>
                    </li>
                  `).join("")}
                </ul>
                <button type="button" data-action="add-template-exercise" data-template-id="${template.id}" aria-label="Add exercise to ${escapeHtml(template.name)}">${icon.add} Exercise</button>
              </div>` : ''}
            </details>
          </article>
        `;
      }

      function renderHistory() {
        const sessions = data.sessions.filter((session) => isSessionSubmitted(session));
        const entries = sessions.map((session) => ({ session, date: sessionCompletionDate(session), timestamp: session.submittedAt || session.updatedAt || "" }))
          .concat((data.skippedSessions || []).filter((skip) => skip.reason === "injury").map((skip) => ({ skip, date: skip.date, timestamp: skip.createdAt || "" })))
          .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")) || String(right.timestamp).localeCompare(String(left.timestamp)));
        const renderSessionCard = (session) => {
          const facts = sessionWorkoutFacts(session);
          const projection = storedWorkoutGradeProjection(session);
          const storedGrade = projection?.grade || "";
          const gradeBand = storedGrade ? storedGrade.charAt(0).toLowerCase() : "unavailable";
          const details = [formatDate(sessionCompletionDate(session)), facts.durationMinutes ? facts.durationMinutes + " min" : "duration not recorded", facts.exercises.length + " exercise" + (facts.exercises.length === 1 ? "" : "s")];
          const reason = projection?.gradeReasons?.[0] || "Stored completed-session facts";
          const firstPr = visibleStoredSessionPrs(session)[0];
          const notable = firstPr ? "New PR · " + firstPr.exercise + " · " + firstPr.value : "";
          const isDeload = isDeloadExposure(session, null, []) || facts.exercises.some((exercise) => isDeloadExposure(session, exercise, setsForExercise(exercise.id)));
          const tag = isDeload ? '<span class="s4a-deload-tag">Deload</span>' : '';
          return '<button class="history-session-card" type="button" data-action="open-session" data-session-id="' + escapeHtml(session.id) + '" aria-label="Open ' + escapeHtml(session.title || 'completed session') + (storedGrade ? ', grade ' + escapeHtml(storedGrade) : '') + (isDeload ? ', Deload' : '') + '"><span class="history-session-copy"><strong>' + escapeHtml(session.title || "Workout") + ' ' + tag + '</strong><span class="history-session-facts">' + escapeHtml(details.join(" · ")) + '</span><small>' + escapeHtml(notable || reason) + '</small></span>' + (storedGrade ? '<span class="history-grade grade-' + gradeBand + '" aria-label="Stored workout grade ' + escapeHtml(storedGrade) + '">' + escapeHtml(storedGrade) + '</span>' : '<span class="history-grade grade-unavailable" aria-label="Grade unavailable">—</span>') + '<span class="progress-chevron" aria-hidden="true">›</span></button>';
        };
        const renderEntry = (entry) => entry.session ? renderSessionCard(entry.session)
          : '<div class="history-skip-card"><span class="history-session-copy"><strong>' + escapeHtml(entry.skip.routineName || "Workout") + '</strong><span class="history-session-facts">' + escapeHtml(formatDate(entry.date)) + ' · Skipped – injured</span></span></div>';
        const grouped = entries.reduce((groups, entry) => {
          const date = entry.date;
          const key = String(date || "unknown").slice(0, 7);
          const group = groups.get(key) || { key, date, entries: [] };
          group.entries.push(entry);
          groups.set(key, group);
          return groups;
        }, new Map());
        const rows = Array.from(grouped.values()).map((group) => {
          const parsed = new Date(String(group.date || todayIso()).slice(0, 10) + "T12:00:00");
          const label = Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(parsed) : "Date unavailable";
          return '<section class="history-month-group" aria-labelledby="history-month-' + escapeHtml(group.key) + '"><h2 class="history-month-heading" id="history-month-' + escapeHtml(group.key) + '">' + escapeHtml(label) + '</h2><div class="history-month-cards">' + group.entries.map(renderEntry).join("") + '</div></section>';
        }).join("");
        return `
          <section class="history-view" aria-label="Session history">
            <p class="history-contract">Every submitted session remains available in chronological order.</p>
            <div class="history-total"><span>${sessions.length} total</span><span>Chronological order</span></div>
            <div class="history-session-list">${rows || '<div class="empty-state">Completed sessions will appear here.</div>'}</div>
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
          ...Object.fromEntries(["incrementUnit", "defaultLoad", "targetLoad", "defaultReps", "weight", "weightUnit", "reps"].filter((field) =>
            Object.prototype.hasOwnProperty.call(raw, field) || Object.prototype.hasOwnProperty.call(fallback, field)
          ).map((field) => [field, Object.prototype.hasOwnProperty.call(raw, field) ? raw[field] : fallback[field]])),
          loadReductionMin: Number(raw.loadReductionMin ?? raw.dropPercentMin ?? fallback.loadReductionMin ?? 0),
          loadReductionMax: Number(raw.loadReductionMax ?? raw.dropPercentMax ?? fallback.loadReductionMax ?? 0),
          restSeconds,
          countsTowardProgression: raw.countsTowardProgression != null ? Boolean(raw.countsTowardProgression) : !isWarmup,
          isWarmup,
          ...Object.fromEntries(["reviewRequired", "ambiguous"].filter((field) =>
            typeof (Object.prototype.hasOwnProperty.call(raw, field) ? raw[field] : fallback[field]) === "boolean"
          ).map((field) => [field, Object.prototype.hasOwnProperty.call(raw, field) ? raw[field] : fallback[field]]))
        };
      }

      function previousComparableSetForRole(previousSets, setType, setTypeIndex = 0, workingSetIndex = 0) {
        const role = normalizeSetTypeCode(setType);
        const sameRole = (previousSets || []).filter((set) => normalizeSetTypeCode(set.setType, set.isWarmup) === role);
        const workingSets = (previousSets || []).filter((set) => normalizeSetTypeCode(set.setType, set.isWarmup) !== "warmup");
        const ordinalFallback = role === "warmup" ? null : workingSets[Number(workingSetIndex || 0)];
        return sameRole.find((set) => Number(set.setTypeIndex || 0) === Number(setTypeIndex || 0))
          || sameRole[Number(setTypeIndex || 0)]
          || ordinalFallback
          || null;
      }

      function templateSetTypesFromHistory(sets, restSeconds = 0) {
        const grouped = new Map();
        sets.filter((set) => isWorkingSet(set, "progression")).forEach((set) => {
          const type = normalizeSetTypeCode(set.setType, set.isWarmup);
          const repMin = Number(set.targetRepMin || set.targetReps || set.reps || 0);
          const repMax = Number(set.targetRepMax || set.targetReps || set.reps || repMin);
          const targetRpe = Number(set.targetRpe ?? set.targetRpeMax ?? set.rpe ?? 0);
          const setRestSeconds = Number(set.targetRestSeconds ?? restSeconds ?? 0);
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
            restSeconds: Number(first.targetRestSeconds ?? restSeconds ?? 0),
            loadReductionMin: type === "drop" ? 20 : 0,
            loadReductionMax: type === "drop" ? 25 : 0,
            countsTowardProgression: true
          });
        });
      }

      // EXERCISE_TARGET_ENGINE_END

      function exercisePerformanceSeries(exerciseName, options = {}) {
        const canonicalId = options.canonicalExerciseId || canonicalExerciseId(exerciseName);
        const cacheKey = [analysisRevision, canonicalId, options.resistanceType || ""].join("|");
        if (exerciseProgressCache.has(cacheKey)) return exerciseProgressCache.get(cacheKey);
        const sessionById = new Map(data.sessions.filter((session) => isSessionSubmitted(session)).map((session) => [session.id, session]));
        const identityScopedExercises = data.exercises.filter((exercise) =>
          sessionById.has(exercise.sessionId)
          && canonicalExerciseId(exercise) === canonicalId
        );
        const resistanceType = options.resistanceType || identityScopedExercises
          .slice()
          .sort((left, right) => sessionCompletionDate(sessionById.get(right.sessionId)).localeCompare(sessionCompletionDate(sessionById.get(left.sessionId))))
          .map((exercise) => resistanceTypeFor(exercise))
          .find(Boolean) || "external";
        const scopedExercises = identityScopedExercises.filter((exercise) => resistanceTypeFor(exercise) === resistanceType);
        const scopedExerciseIds = new Set(scopedExercises.map((exercise) => exercise.id));
        const setsByExercise = new Map();
        data.sets.forEach((set) => {
          if (!scopedExerciseIds.has(set.exerciseId)) return;
          const sets = setsByExercise.get(set.exerciseId) || [];
          sets.push(set);
          setsByExercise.set(set.exerciseId, sets);
        });
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
        const metricValue = (set) => {
          const load = resistanceLoadInUnit(set, resistanceType);
          return ["external", "bodyweight_plus_load", "assisted_bodyweight"].includes(resistanceType)
            ? load
            : resistanceType === "duration"
              ? Number(set.durationSeconds || 0)
              : resistanceType === "distance"
                ? Number(set.distance || 0)
                : Number(set.reps || 0);
        };
        const newestComparableExercise = scopedExercises.filter((exercise) => !isDeloadExposure(sessionById.get(exercise.sessionId), exercise, setsByExercise.get(exercise.id) || [])).sort((left, right) =>
          sessionCompletionDate(sessionById.get(right.sessionId)).localeCompare(sessionCompletionDate(sessionById.get(left.sessionId)))
        )[0];
        const newestComparableSets = newestComparableExercise
          ? (setsByExercise.get(newestComparableExercise.id) || []).filter((set) => set.completed && !set.skipped && isWorkingSet(set, "progression"))
          : [];
        const newestRepresentativeSet = newestComparableSets.slice().sort((left, right) =>
          resistanceType === "assisted_bodyweight"
            ? metricValue(left) - metricValue(right) || Number(right.reps || 0) - Number(left.reps || 0)
            : metricValue(right) - metricValue(left) || Number(right.reps || 0) - Number(left.reps || 0)
        )[0];
        const comparisonRole = newestRepresentativeSet ? normalizeSetTypeCode(newestRepresentativeSet.setType, newestRepresentativeSet.isWarmup) : "";
        const points = scopedExercises.flatMap((exercise) => {
          const session = sessionById.get(exercise.sessionId);
          if (!session) return [];
          const exposureSets = setsByExercise.get(exercise.id) || [];
          const isDeload = isDeloadExposure(session, exercise, exposureSets);
          const completedSets = exposureSets.filter((set) =>
            set.completed
            && !set.skipped
            && isWorkingSet(set, isDeload ? "actual" : "progression")
            && (isDeload || !comparisonRole || normalizeSetTypeCode(set.setType, set.isWarmup) === comparisonRole)
          );
          const measured = completedSets.map((set) => {
            const value = metricValue(set);
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
            sessionNotes: String(session.notes || ""),
            exerciseNotes: String(exercise.notes || ""),
            source: String(best.set.source || exercise.source || session.source || "Source not recorded"),
            comparisonRole,
            isDeload,
            value: Math.round(best.value * 10) / 10,
            metricType: labels.metricType,
            bestSet: best.set,
            details: completedSets.map((set) => ({
              ...set,
              resistanceType,
              sessionId: session.id,
              sessionTitle: session.title || "Workout",
              sessionDate: completedDate,
              exerciseName: exercise.name,
              exerciseNotes: String(exercise.notes || ""),
              sessionNotes: String(session.notes || ""),
              source: String(set.source || exercise.source || session.source || "Source not recorded")
            }))
          }];
        }).sort((left, right) => left.date.localeCompare(right.date)
          || String(left.sessionId).localeCompare(String(right.sessionId)));
        const result = { resistanceType, comparisonRole, ...labels, points };
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
        const trendPoints = chartPoints.filter((point) => !point.isDeload);
        const chartSegments = trendPoints.slice(1).map((point, index) => {
          const previous = trendPoints[index];
          return '<polyline class="chart-line evidenced" points="' + previous.x.toFixed(1) + ',' + previous.y.toFixed(1) + ' ' + point.x.toFixed(1) + ',' + point.y.toFixed(1) + '" clip-path="url(#chart-clip-' + chartKey + ')"></polyline>';
        }).join("");
        const selected = chartDetailPoint?.chartKey === chartKey
          && chartDetailPoint?.exerciseId === (scope.exerciseId || "")
          ? chartDetailPoint : null;
        const selectedIndex = selected ? chartPoints.findIndex((point) => point.sessionId === selected.sessionId && point.value === selected.value) : -1;
        const selectedPoint = selectedIndex >= 0 ? chartPoints[selectedIndex] : null;
        const keyboardPointIndex = selectedIndex >= 0 ? selectedIndex : chartPoints.length - 1;
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
            ${scope.helperText ? '<p class="chart-helper">' + escapeHtml(scope.helperText) + '</p>' : ""}
            ${chartPoints.some((point) => point.isDeload) ? '<p class="chart-helper"><span class="s4a-deload-tag">Deload</span> Hollow points are excluded from trends and records.</p>' : ''}
            <div class="chart-svg">
              <svg viewBox="0 0 ${width} ${height}" role="group" aria-label="${escapeHtml(title)} chart. Use Left and Right Arrow keys to review sessions.">
                <defs><clipPath id="chart-clip-${chartKey}"><rect x="${plot.left - 3}" y="${plot.top - 3}" width="${plotWidth + 6}" height="${plotHeight + 6}" rx="3"></rect></clipPath></defs>
                ${grid}
                ${chartSegments}
                ${selectedPoint ? '<line class="chart-selected-guide" x1="' + selectedPoint.x.toFixed(1) + '" y1="' + selectedPoint.y.toFixed(1) + '" x2="' + selectedPoint.x.toFixed(1) + '" y2="' + (plot.top + plotHeight).toFixed(1) + '"></line>' : ""}
                ${chartPoints.map((point, index) => { const isSelected = index === selectedIndex; const activationKey = registerChartPointActivation(chartKey, point, scope); return '<g class="chart-point evidenced ' + (isSelected ? 'selected' : '') + (point.isDeload ? ' deload' : '') + '" role="button" tabindex="' + (index === keyboardPointIndex ? '0' : '-1') + '" aria-pressed="' + (isSelected ? 'true' : 'false') + '" aria-label="' + escapeHtml(title + ': ' + point.value + ' on ' + formatDate(point.date) + ' in ' + point.sessionTitle + (point.isDeload ? ', Deload' : '')) + '" data-action="show-chart-point" data-chart-key="' + chartKey + '" data-chart-date="' + escapeHtml(point.date) + '" data-chart-point-key="' + activationKey + '"><circle class="hit-area" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="34"></circle><circle class="selected-ring" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="9"></circle><circle class="visible-point" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="4.5"></circle></g>'; }).join("")}
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

      function recentProgressWindowStart(points) {
        const latestDate = String(points.at(-1)?.date || "");
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(latestDate);
        if (!match) return "";
        const latestYear = Number(match[1]);
        const latestMonth = Number(match[2]) - 1;
        const latestDay = Number(match[3]);
        const monthIndex = latestYear * 12 + latestMonth - 6;
        const startYear = Math.floor(monthIndex / 12);
        const startMonth = ((monthIndex % 12) + 12) % 12;
        const daysInStartMonth = new Date(Date.UTC(startYear, startMonth + 1, 0)).getUTCDate();
        return [
          String(startYear).padStart(4, "0"),
          String(startMonth + 1).padStart(2, "0"),
          String(Math.min(latestDay, daysInStartMonth)).padStart(2, "0")
        ].join("-");
      }

      function progressPointsForDateWindow(points, windowName = progressDateWindow) {
        if (windowName === "all") return points;
        const cutoff = recentProgressWindowStart(points);
        return cutoff ? points.filter((point) => point.date >= cutoff) : points;
      }

      function originalImportedLoadFact(set) {
        const original = set?.originalImportedValue;
        if (!original || !Object.prototype.hasOwnProperty.call(original, "weight")) return "";
        const rawWeight = String(original.weight ?? "").trim();
        const weightUnit = String(original.weightUnit || "").trim().toLowerCase();
        if (!rawWeight || !Number.isFinite(Number(rawWeight)) || !["lb", "kg"].includes(weightUnit)) return "";
        return `Imported: ${rawWeight} ${weightUnit}`;
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
            const importedLoad = originalImportedLoadFact(set);
            const facts = [
              resistance || "load not recorded",
              Number(set.reps || 0) > 0 ? formatLoadNumber(set.reps) + " reps" : "reps not recorded",
              Number(set.rpe || 0) > 0 ? "RPE " + formatLoadNumber(set.rpe) : "RPE not recorded",
              importedLoad
            ].filter(Boolean);
            return '<div class="row-item chart-set-fact"><span class="ri-copy"><b>Set ' + (Number(set.setNumber) || index + 1) + ' · ' + escapeHtml(role) + '</b><span>' + escapeHtml(facts.join(" · ")) + '</span></span></div>';
          }).join("") + '</div></section>').join("");
      }

      function renderChartPointDetail(chartKey, title, point, points) {
        const exerciseName = selectedExerciseName();
        const exercise = selectedExerciseRecord();
        const best = point.bestSet || point.details?.[0] || null;
        const unitLabel = ["load", "added_load", "assistance_load"].includes(point.metricType)
          ? " " + data.settings.weightUnit
          : point.metricType === "estimated_one_rep_max" ? " " + data.settings.weightUnit
          : point.metricType.includes("duration") ? " sec"
            : point.metricType.includes("distance") ? " m"
              : " reps";
        const close = '<button class="icon-button" type="button" data-action="close-chart-point" aria-label="Close chart detail">' + icon.close + '</button>';
        const role = best ? setTypeLabels[setTypeSemantics(best).type] || (best.isWarmup ? "Warm-up set" : "Working set") : "";
        const importedLoad = originalImportedLoadFact(best);
        const notes = [
          point.exerciseNotes ? '<div class="chart-source-note"><strong>Exercise note</strong><span>' + escapeHtml(point.exerciseNotes) + '</span></div>' : "",
          point.sessionNotes ? '<div class="chart-source-note"><strong>Session note</strong><span>' + escapeHtml(point.sessionNotes) + '</span></div>' : "",
          '<div class="chart-source-note"><strong>Source</strong><span>' + escapeHtml(point.source || "Source not recorded") + '</span></div>'
        ].join("");
        return '<article class="chart-detail" role="status"><div class="row split"><div><span class="section-kicker">Selected session · ' + formatDate(point.date) + '</span><strong>' + escapeHtml(title + ' · ' + point.value + unitLabel) + '</strong><span class="chart-detail-exercise">' + escapeHtml(exerciseName) + ' · ' + escapeHtml(point.sessionTitle || "Workout") + (point.isDeload ? ' <span class="s4a-deload-tag">Deload</span>' : '') + '</span></div>' + close + '</div>'
          + '<div class="rollup chart-point-rollup"><span class="ru"><b>' + (best ? escapeHtml(formatResistance(best, exercise)) : noData("Load unavailable")) + '</b><span>load</span>' + (importedLoad ? '<span class="imported-source-value">' + escapeHtml(importedLoad) + '</span>' : '') + '</span><span class="ru"><b>' + (best?.reps ? escapeHtml(best.reps) : noData("Repetitions unavailable")) + '</b><span>reps</span></span><span class="ru"><b>' + (best?.rpe ? escapeHtml(best.rpe) : noData("RPE unavailable")) + '</b><span>RPE</span></span><span class="ru"><b>' + (role ? escapeHtml(role) : noData("Role unavailable")) + '</b><span>role</span></span></div>'
          + '<div class="chart-source-facts">' + notes + '</div>'
          + '<div><div class="m-label"><span>Recorded sets</span><span>source facts</span></div>' + renderChartPointSetGroups(point) + '</div></article>';
      }

      // The restored hypertrophy calculation preserves the app's former six-category
      // 0–100 formula. The rolling selector changes only the source window: the ten
      // latest completed sessions, with distinct exact lift variants averaged equally.
      function rollingCompletedSessions(limit = 10) {
        return data.sessions
          .filter((session) => isSessionSubmitted(session))
          .sort((left, right) => sessionCompletionDate(right).localeCompare(sessionCompletionDate(left))
            || String(right.submittedAt || right.updatedAt || right.id).localeCompare(String(left.submittedAt || left.updatedAt || left.id)))
          .slice(0, limit);
      }

      function calculateCanonicalHypertrophyScore(selection) {
        const weeks = selection.included || [];
        if (!weeks.length) return { score: null, categories: [], ...selection };
        const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
        const average = (values, fallback = 0) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
        const ratio = (value, total, fallback) => total > 0 ? clamp(value / total) : fallback;
        const repTargetsAvailable = weeks.some((week) => Number(week.repRangeTracked || 0) > 0);
        const rpeTargetsAvailable = weeks.some((week) => Number(week.rpeTargetTracked || 0) > 0);
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
          { key: "progression", max: 25, quality: 0.35 + progressionQuality * 0.65 },
          { key: "execution", max: 20, excluded: !repTargetsAvailable, quality: 0.25 + repQuality * 0.75 },
          { key: "rpe", max: 15, excluded: !rpeTargetsAvailable, quality: 0.25 + rpeQuality * 0.75 },
          { key: "volume", max: 15, quality: 0.3 + (volumeTargetQuality * 0.7 + volumeStability * 0.3) * 0.7 },
          { key: "consistency", max: 15, quality: completionQuality },
          { key: "fatigue", max: 10, quality: fatigueQuality }
        ].map((category) => ({ ...category, points: category.excluded ? null : Math.round(category.max * clamp(category.quality) * 10) / 10 }));
        const availableMaximum = categories.filter((category) => !category.excluded).reduce((sum, category) => sum + category.max, 0);
        const availablePoints = categories.filter((category) => !category.excluded).reduce((sum, category) => sum + Number(category.points || 0), 0);
        return { score: availableMaximum ? Math.round(clamp(availablePoints / availableMaximum) * 100) : null, categories, ...selection };
      }

      function hypertrophyPerformanceValue(set, exercise, resistanceType) {
        if (["external", "bodyweight_plus_load"].includes(resistanceType)) return estimatedOneRepMax(set);
        if (resistanceType === "assisted_bodyweight") return Math.max(0, 10000 - resistanceLoad(set, resistanceType) * 10 + Number(set.reps || 0));
        if (resistanceType === "duration") return Number(set.durationSeconds || 0);
        if (resistanceType === "distance") return Number(set.distance || 0);
        return Number(set.reps || 0);
      }

      function exerciseHypertrophyScore(catalogExercise, sessions = rollingCompletedSessions()) {
        if (!catalogExercise || !sessions.length) return null;
        const sessionIds = new Set(sessions.map((session) => session.id));
        const cacheKey = ["hypertrophy", analysisRevision, catalogExercise.id, ...sessionIds].join("|");
        if (hypertrophyScoreCache.has(cacheKey)) return hypertrophyScoreCache.get(cacheKey);
        const sessionById = new Map(sessions.map((session) => [session.id, session]));
        const weekMap = new Map();
        data.exercises.filter((exercise) => sessionIds.has(exercise.sessionId)
          && canonicalExerciseId(exercise) === catalogExercise.canonicalId
          && resistanceTypeFor(exercise) === catalogExercise.resistanceType).forEach((exercise) => {
          const session = sessionById.get(exercise.sessionId);
          const exposureSets = setsForExercise(exercise.id);
          if (isDeloadExposure(session, exercise, exposureSets)) return;
          const weekStart = startOfWeekIso(sessionCompletionDate(session));
          const week = weekMap.get(weekStart) || { weekStart, plannedSets: 0, completedSets: 0, repRangeTracked: 0, repRangeHits: 0, rpeTargetTracked: 0, rpeOnTarget: 0, volumeTotal: 0, bestPerformance: 0, rpeSum: 0, rpeCount: 0, failedSets: 0, isDeload: false, volumeTargetsTracked: 1, volumeTargetsHit: 0, comparableComparisons: 0, progressionWins: 0, regressions: 0, fatigueHigh: 0, fatigueModerate: 0, volumeChangeRatio: 0 };
          exposureSets.filter((set) => isWorkingSet(set, "score")).forEach((set) => {
            week.plannedSets += 1;
            if (!set.completed || set.skipped) { if (!set.skipped) week.failedSets += 1; return; }
            week.completedSets += 1;
            const reps = Number(set.reps || 0);
            const repMin = Number(set.targetRepMin || set.targetReps || 0);
            const repMax = Number(set.targetRepMax || set.targetReps || repMin);
            if (repMin > 0 && repMax > 0 && !["duration", "distance"].includes(catalogExercise.resistanceType)) {
              week.repRangeTracked += 1;
              if (reps >= repMin && reps <= repMax) week.repRangeHits += 1;
            }
            const rpe = Number(set.rpe || 0);
            const rpeMin = Number(set.targetRpeMin || 0);
            const rpeMax = Number(set.targetRpeMax || set.targetRpe || rpeMin);
            if (rpe > 0) {
              week.rpeSum += rpe;
              week.rpeCount += 1;
              if (rpeMin > 0 || rpeMax > 0) {
                week.rpeTargetTracked += 1;
                const low = rpeMin || Math.max(0, rpeMax - Number(set.targetRpeTolerance || 0.5));
                const high = rpeMin ? rpeMax : rpeMax + Number(set.targetRpeTolerance || 0.5);
                if (rpe >= low && rpe <= high) week.rpeOnTarget += 1;
              }
            }
            if (catalogExercise.resistanceType === "external") week.volumeTotal += resistanceLoadInUnit(set, catalogExercise.resistanceType) * reps;
            week.bestPerformance = Math.max(week.bestPerformance, hypertrophyPerformanceValue(set, exercise, catalogExercise.resistanceType));
          });
          weekMap.set(weekStart, week);
        });
        const weeks = Array.from(weekMap.values()).sort((left, right) => left.weekStart.localeCompare(right.weekStart));
        let previousPerformance = 0;
        let previousVolume = 0;
        weeks.forEach((week) => {
          const completionRatio = week.plannedSets ? week.completedSets / week.plannedSets : 0;
          week.qualifies = !week.isDeload && week.completedSets >= 2 && completionRatio >= 0.5;
          week.volumeTargetsHit = completionRatio >= 0.8 ? 1 : 0;
          if (previousVolume > 0 && week.volumeTotal > 0) week.volumeChangeRatio = Math.abs(week.volumeTotal - previousVolume) / previousVolume;
          if (previousPerformance > 0 && week.bestPerformance > 0) {
            week.comparableComparisons = 1;
            if (week.bestPerformance >= previousPerformance * 1.015) week.progressionWins = 1;
            else if (week.bestPerformance < previousPerformance * 0.93) { week.regressions = 1; week.fatigueModerate += 1; }
          }
          const averageRpe = week.rpeCount ? week.rpeSum / week.rpeCount : 0;
          if (week.failedSets >= 2) week.fatigueHigh += 1;
          else if (averageRpe >= 9.2 && week.completedSets >= 2) week.fatigueModerate += 1;
          if (week.qualifies) {
            previousPerformance = week.bestPerformance || previousPerformance;
            previousVolume = week.volumeTotal || previousVolume;
          }
        });
        const selection = { included: weeks.filter((week) => week.qualifies), skippedDeloadWeeks: weeks.filter((week) => week.isDeload), incompleteWeeks: weeks.filter((week) => !week.isDeload && !week.qualifies), requestedWeeks: weeks.length, provisional: weeks.filter((week) => week.qualifies).length < 6 };
        const result = calculateCanonicalHypertrophyScore(selection);
        hypertrophyScoreCache.set(cacheKey, result);
        return result;
      }

      function rollingHypertrophySummary(limit = 10) {
        const sessions = rollingCompletedSessions(limit);
        const sessionIds = new Set(sessions.map((session) => session.id));
        const representedIds = new Set(data.exercises.filter((exercise) => sessionIds.has(exercise.sessionId)).map((exercise) => canonicalExerciseId(exercise) + "::resistance::" + resistanceTypeFor(exercise)));
        const liftScores = exerciseCatalog().filter((exercise) => representedIds.has(exercise.id)).map((exercise) => ({ exercise, score: exerciseHypertrophyScore(exercise, sessions)?.score })).filter((item) => Number.isFinite(item.score));
        return { score: liftScores.length ? Math.round(liftScores.reduce((sum, item) => sum + item.score, 0) / liftScores.length) : null, sessionCount: sessions.length, liftCount: liftScores.length, liftScores };
      }

      function exerciseE1rmRecord(catalogExercise) {
        if (!catalogExercise || catalogExercise.resistanceType !== "external") return { applicable: false };
        const cacheKey = ["e1rm", analysisRevision, catalogExercise.id].join("|");
        if (exerciseRecordCache.has(cacheKey)) return exerciseRecordCache.get(cacheKey);
        const sessionById = new Map(data.sessions.filter((session) => isSessionSubmitted(session)).map((session) => [session.id, session]));
        const candidates = data.exercises.filter((exercise) => sessionById.has(exercise.sessionId) && canonicalExerciseId(exercise) === catalogExercise.canonicalId && resistanceTypeFor(exercise) === "external" && !isDeloadExposure(sessionById.get(exercise.sessionId), exercise, setsForExercise(exercise.id))).flatMap((exercise) => setsForExercise(exercise.id).filter((set) => set.completed && !set.skipped && isWorkingSet(set, "progression") && estimatedOneRepMax(set) > 0).map((set) => ({ set, exercise, session: sessionById.get(exercise.sessionId), e1rm: estimatedOneRepMax(set) })));
        candidates.sort((left, right) => right.e1rm - left.e1rm
          || sessionCompletionDate(right.session).localeCompare(sessionCompletionDate(left.session))
          || String(right.session.id).localeCompare(String(left.session.id))
          || canonicalSetSequence(left.set) - canonicalSetSequence(right.set));
        const best = candidates[0];
        if (!best) { const empty = { applicable: true, record: null }; exerciseRecordCache.set(cacheKey, empty); return empty; }
        const configuredIncrement = data.templates.flatMap((template) => template.exercises || []).filter((exercise) => canonicalExerciseId(exercise) === catalogExercise.canonicalId && (exercise.resistanceType || inferResistanceType(exercise.name, exercise)) === "external").map((exercise) => Number(exercise.increment || 0)).filter((value) => value > 0).sort((a, b) => a - b)[0] || progressionProfileForExercise(catalogExercise.name).increment;
        const load = resistanceLoadInUnit(best.set, "external");
        const reps = Number(best.set.reps || 0);
        const repCandidate = reps < 12 ? { weight: load, reps: reps + 1 } : null;
        const loadCandidate = { weight: roundToIncrement(load + configuredIncrement, configuredIncrement), reps };
        const nextTarget = repCandidate && repCandidate.weight * (1 + repCandidate.reps / 30) > best.e1rm ? repCandidate : loadCandidate;
        const result = { applicable: true, record: { ...best, load, reps, increment: configuredIncrement, nextTarget } };
        exerciseRecordCache.set(cacheKey, result);
        return result;
      }

      function exerciseE1rmSeries(catalogExercise, options = {}) {
        if (catalogExercise?.resistanceType !== "external") return null;
        const sessionById = new Map(data.sessions.filter((session) => isSessionSubmitted(session)).map((session) => [session.id, session]));
        const points = data.exercises.filter((exercise) => sessionById.has(exercise.sessionId) && canonicalExerciseId(exercise) === catalogExercise.canonicalId && resistanceTypeFor(exercise) === "external").flatMap((exercise) => {
          const session = sessionById.get(exercise.sessionId);
          const exposureSets = setsForExercise(exercise.id);
          const isDeload = isDeloadExposure(session, exercise, exposureSets);
          if (isDeload && !options.includeDeload) return [];
          const candidates = exposureSets.filter((set) => set.completed && !set.skipped && isWorkingSet(set, isDeload ? "actual" : "progression") && estimatedOneRepMax(set) > 0).sort((left, right) => estimatedOneRepMax(right) - estimatedOneRepMax(left) || canonicalSetSequence(left) - canonicalSetSequence(right));
          const bestSet = candidates[0];
          return bestSet ? [{ label: formatDate(sessionCompletionDate(session)), date: sessionCompletionDate(session), sessionId: session.id, sessionTitle: session.title || "Workout", sessionNotes: String(session.notes || ""), exerciseNotes: String(exercise.notes || ""), source: String(bestSet.source || exercise.source || session.source || "Source not recorded"), isDeload, comparisonRole: normalizeSetTypeCode(bestSet.setType, bestSet.isWarmup), value: Math.round(estimatedOneRepMax(bestSet) * 10) / 10, metricType: "estimated_one_rep_max", bestSet, details: candidates.map((set) => ({ ...set, sessionId: session.id, sessionTitle: session.title || "Workout", sessionDate: sessionCompletionDate(session), exerciseName: exercise.name })) }] : [];
        }).sort((left, right) => left.date.localeCompare(right.date) || String(left.sessionId).localeCompare(String(right.sessionId)));
        return { title: "Estimated 1RM trend", unit: data.settings.weightUnit, resistanceType: "external", points };
      }

      function renderLiftProgress() {
        resetChartPointActivations();
        const catalog = exerciseCatalog();
        if (progressExerciseDetailId) {
          const routedExercise = catalog.find((item) => item.id === progressExerciseDetailId);
          if (routedExercise) {
            selectedExerciseId = routedExercise.id;
            chartExerciseDraft = routedExercise.name;
            return renderExerciseProgressDetail(routedExercise);
          }
          progressExerciseDetailId = "";
        }
        return progressMode === "exercises" ? renderProgressExercises() : renderProgressSessions();
      }

      function renderProgressModeSwitch(activeMode) {
        return '<div class="progress-mode-switch" role="tablist" aria-label="Progress view"><button type="button" role="tab" data-action="set-progress-mode" data-mode="sessions" aria-selected="' + (activeMode === 'sessions') + '" class="' + (activeMode === 'sessions' ? 'active' : '') + '">Sessions</button><button type="button" role="tab" data-action="set-progress-mode" data-mode="exercises" aria-selected="' + (activeMode === 'exercises') + '" class="' + (activeMode === 'exercises' ? 'active' : '') + '">Exercises</button></div>';
      }

      function renderProgressSessions() {
        return '<section class="view progress-sessions-view"><div class="screen-heading"><div><div class="section-kicker">Progress</div><h1>Completed sessions</h1><p>Grades and notable performance at a glance.</p></div></div>' + renderProgressModeSwitch('sessions') + renderHistory() + '</section>';
      }

      function progressExerciseSparkline(exercise) {
        const series = exerciseE1rmSeries(exercise) || exercisePerformanceSeries(exercise.name, { canonicalExerciseId: exercise.canonicalId, resistanceType: exercise.resistanceType });
        const values = series.points.filter((point) => !point.isDeload).slice(-6).map((point) => Number(point.value)).filter((value) => Number.isFinite(value));
        if (!values.length) return '<span class="progress-sparkline-empty" aria-label="No recent trend">—</span>';
        const min = Math.min(...values);
        const max = Math.max(...values);
        const spread = Math.max(1, max - min);
        const points = values.map((value, index) => (4 + index * (82 / Math.max(1, values.length - 1))).toFixed(1) + ',' + (27 - (value - min) / spread * 22).toFixed(1)).join(' ');
        return '<svg class="progress-sparkline" viewBox="0 0 90 32" role="img" aria-label="Recent ' + escapeHtml(values.at(-1) >= values[0] ? 'rising or stable' : 'declining') + ' trend"><path d="M3 28H87"></path><polyline points="' + points + '"></polyline><circle cx="' + (4 + (values.length - 1) * (82 / Math.max(1, values.length - 1))).toFixed(1) + '" cy="' + (27 - (values.at(-1) - min) / spread * 22).toFixed(1) + '" r="3"></circle></svg>';
      }

      function renderProgressExerciseRows() {
        const sessions = rollingCompletedSessions();
        const query = normalizeChartSearch(progressExerciseSearchQuery);
        const rows = exerciseCatalog().filter((exercise) => !query || normalizeChartSearch(exercise.name).includes(query) || normalizeChartSearch(exercise.canonicalId).includes(query)).map((exercise) => {
          const score = exerciseHypertrophyScore(exercise, sessions)?.score;
          const series = exercisePerformanceSeries(exercise.name, { canonicalExerciseId: exercise.canonicalId, resistanceType: exercise.resistanceType });
          const latest = series.points.at(-1);
          const record = exerciseE1rmRecord(exercise);
          const facts = [Number.isFinite(score) ? '<span class="exercise-score-chip">Hypertrophy ' + score + '</span>' : '', latest?.bestSet ? '<span>Latest ' + escapeHtml(formatSetPerformance(latest.bestSet, exercise)) + (latest.isDeload ? ' <span class="s4a-deload-tag">Deload</span>' : '') + '</span>' : '<span>No completed performance</span>', record.record ? '<span>Best ' + escapeHtml(formatLoadNumber(record.record.e1rm)) + ' ' + data.settings.weightUnit + ' e1RM</span>' : record.applicable ? '<span>No qualifying e1RM</span>' : '<span>e1RM not applicable</span>'].filter(Boolean).join('');
          return '<button class="progress-exercise-row" type="button" data-action="open-progress-exercise" data-exercise-id="' + escapeHtml(exercise.id) + '"><span class="progress-exercise-facts"><strong>' + escapeHtml(exercise.name) + '</strong><span>' + facts + '</span></span>' + progressExerciseSparkline(exercise) + '<span class="progress-chevron" aria-hidden="true">›</span></button>';
        }).join('');
        return rows || '<div class="empty-state">No exercises match this search.</div>';
      }

      function renderProgressExercises() {
        const count = exerciseCatalog().length;
        return '<section class="view progress-exercises-view"><div class="screen-heading"><div><div class="section-kicker">Progress</div><h1>Exercises</h1><p>Compare exact exercise variants.</p></div></div>' + renderProgressModeSwitch('exercises') + '<label class="progress-exercise-search"><span class="visually-hidden">Search exercises</span><input type="search" data-action="filter-progress-exercises" value="' + escapeHtml(progressExerciseSearchQuery) + '" placeholder="Search exercises" aria-label="Search exercises"><span aria-hidden="true">⌕</span></label><p class="progress-index-caption">' + count + ' exercise' + (count === 1 ? '' : 's') + ' in retained history</p><div class="progress-exercise-list" data-progress-exercise-list>' + renderProgressExerciseRows() + '</div></section>';
      }

      function renderExerciseRecordCard(exercise, recordResult) {
        if (!recordResult.applicable) return '<section class="exercise-record-card record-not-applicable"><div class="section-kicker">Estimated 1RM</div><h2>Not applicable</h2><p>This exercise uses ' + escapeHtml(resistanceTypeLabel(exercise.resistanceType).toLowerCase()) + ', so the app does not invent a load-based e1RM or PR target.</p></section>';
        const record = recordResult.record;
        if (!record) return '<section class="exercise-record-card record-not-applicable"><div class="section-kicker">Estimated 1RM</div><h2>No qualifying record</h2><p>A completed external-load set of 1–12 repetitions is required.</p></section>';
        const source = formatLoadNumber(record.load) + ' ' + data.settings.weightUnit + ' × ' + record.reps;
        const target = formatLoadNumber(record.nextTarget.weight) + ' ' + data.settings.weightUnit + ' × ' + record.nextTarget.reps;
        return '<section class="exercise-record-card" aria-labelledby="exercise-record-heading"><div class="section-kicker">Best e1RM</div><div class="exercise-record-value"><h2 id="exercise-record-heading">' + escapeHtml(formatLoadNumber(record.e1rm)) + '</h2><span>' + escapeHtml(data.settings.weightUnit) + ' est. 1RM</span></div><p class="exercise-record-source">' + escapeHtml(source) + ' · ' + escapeHtml(formatDate(sessionCompletionDate(record.session))) + '<br>' + escapeHtml(record.session.title || 'Completed session') + '</p><button class="record-source-action" type="button" data-action="open-session" data-session-id="' + escapeHtml(record.session.id) + '"><span>Open exact source set</span><span aria-hidden="true">›</span></button><hr><div class="exercise-next-target"><span><span class="section-kicker">Next mathematical target</span><strong>' + escapeHtml(target) + '</strong></span><span class="rolling-info" aria-hidden="true">i</span></div><p class="record-helper">The next practical set whose Epley estimate exceeds this record—not a promise of performance.</p></section>';
      }

      function renderExerciseProgressDetail(exercise) {
        const e1rmSeries = exerciseE1rmSeries(exercise, { includeDeload: true });
        const progress = e1rmSeries?.points?.length
          ? e1rmSeries
          : exercisePerformanceSeries(exercise.name, { canonicalExerciseId: exercise.canonicalId, resistanceType: exercise.resistanceType });
        const visiblePoints = progressPointsForDateWindow(progress.points);
        const latestPoint = visiblePoints.at(-1);
        const latestFact = latestPoint?.bestSet ? formatSetPerformance(latestPoint.bestSet, exercise) : 'No comparable completed working set yet.';
        const backAction = exerciseHistoryReturnState ? '<button class="exercise-detail-back" type="button" data-action="return-to-active-exercise">← Back to workout</button>' : '<button class="exercise-detail-back" type="button" data-action="close-progress-exercise">← Back to Exercises</button>';
        return '<section class="view charts-view exercise-detail-view"><div class="exercise-detail-toolbar">' + backAction + '<span>Read-only history</span></div><div class="exercise-detail-hero"><div class="section-kicker">Performance · exercise history</div><h1>' + escapeHtml(exercise.name) + '</h1><strong>Latest qualifying set · ' + escapeHtml(latestFact) + (latestPoint?.isDeload ? ' <span class="s4a-deload-tag">Deload</span>' : '') + '</strong><span>' + visiblePoints.length + ' recorded session' + (visiblePoints.length === 1 ? '' : 's') + ' · exact exercise variant</span></div><div class="exercise-detail-grid"><div class="primary-analysis-chart">' + renderChart('performance', progress.title, visiblePoints, 'No comparable completed sets in this date range.', { exerciseId: exercise.id, resistanceType: exercise.resistanceType, helperText: 'Tap a point for its source load, reps, RPE, role, and session.' }) + '</div>' + renderExerciseRecordCard(exercise, exerciseE1rmRecord(exercise)) + '</div><details class="exercise-detail-method"><summary>Method and retained-history notes</summary><p>Named variants and resistance types remain separate. Estimated 1RM uses the existing Epley formula and only completed external-load sets of 1–12 repetitions.</p></details></section>';
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
        const pushStatus = notificationStatus();
        const migration = data.migrationAudit?.at(-1);
        const reviewSets = data.sets.filter((set) => set.reviewRequired);
        const localClearBlock = localClearBlockReason();
        const units = `
          <div class="field"><div class="f-top"><span class="f-name">Weight unit</span><span class="f-help">Display preference; recorded sets keep their stored unit</span></div>${renderSegmentedSetting("weight-unit", "settings-weight-unit", data.settings.weightUnit, [["lb", "Pounds"], ["kg", "Kilograms"]])}</div>`;
        const alerts = `
          <div class="alert-settings-list">
            ${renderAlertSetting("timer-notifications", "Lock-screen rest notifications", "Requires permission and an installed Home Screen app.", pushStatus.notificationsEnabled, { stateLabel: pushStatus.permissionStatus === "denied" ? "Permission denied" : pushStatus.lockScreenReady ? "Enabled" : "Needs setup" })}
            ${renderAlertSetting("in-app-rest-alerts", "In-app completion alert", "Shows the tappable Rest complete banner while using the app.", pushStatus.inAppAlertEnabled)}
            ${renderAlertSetting("timer-sound", "Foreground completion sound", "Respects browser audio restrictions and system controls.", pushStatus.foregroundSoundEnabled, { stateLabel: pushStatus.foregroundSoundEnabled ? (pushStatus.soundConfirmed ? "Confirmed" : "Not tested") : "Disabled" })}
            ${renderAlertSetting("timer-vibration", "Browser vibration", "Used only where the browser exposes vibration support.", data.settings.timerVibration !== false, { unavailable: !pushStatus.vibrationSupported, stateLabel: pushStatus.vibrationSupported ? "Enabled" : "Unsupported" })}
          </div>
          <label class="field"><span class="f-top"><span class="f-name">Rest-complete sound</span></span><select data-action="rest-complete-sound"><option value="sharp_two_tone" ${data.settings.restCompleteSound === "sharp_two_tone" ? "selected" : ""}>Sharp two-tone chime (default)</option><option value="clear_bell" ${data.settings.restCompleteSound === "clear_bell" ? "selected" : ""}>Clear bell</option><option value="whistle" ${data.settings.restCompleteSound === "whistle" ? "selected" : ""}>Whistle tone</option></select></label>
          <div class="field"><div class="f-top"><span class="f-name">Rest-complete volume</span><button type="button" data-action="preview-rest-complete-sound">Preview sound</button></div><input type="range" min="0" max="1" step="0.05" value="${Number(data.settings.restCompleteSoundVolume ?? 0.85)}" data-action="rest-complete-volume" aria-label="Rest-complete volume" /></div>
          <label class="field"><span class="f-top"><span class="f-name">Alert auto-dismiss</span><span class="f-help">Seconds</span></span><input type="number" min="1" max="60" step="1" value="${Math.round(Number(data.settings.restCompleteAutoDismissMs || 5000) / 1000)}" data-action="rest-complete-dismiss-seconds" /></label>
          ${renderAlertSetting("rest-complete-auto-return", "Return after alert", "Return to the active workout automatically when the in-app alert dismisses.", data.settings.restCompleteAutoReturnToWorkout === true)}
          <div class="field"><div class="f-top"><span class="f-name">Default rest duration</span><span class="f-help">Seconds · per-exercise and per-set targets override this</span></div><div class="stepper settings-rest-stepper"><button class="sb" type="button" data-action="adjust-default-rest" data-delta="-15" aria-label="Reduce default rest by 15 seconds">&minus;</button><input class="sv" type="number" min="15" max="900" step="15" value="${Number(data.settings.defaultRestSeconds || 90)}" data-action="default-rest-seconds" aria-label="Default rest duration in seconds" /><button class="sb" type="button" data-action="adjust-default-rest" data-delta="15" aria-label="Increase default rest by 15 seconds">+</button></div></div>
          <div class="field"><div class="f-top"><span class="f-name">Notification detail</span><span class="f-help">Visible lock-screen wording only</span></div>${renderSegmentedSetting("notification-detail", "settings-notification-detail", data.settings.notificationMessageDetail === "private" ? "private" : "exercise-set", [["exercise-set", "Exercise and set"], ["private", "Private body"]])}</div>
          <div class="callout warn notification-privacy-boundary"><b>Private changes the visible notification body only</b><span>The notification service still receives installation and timer identifiers, workout, exercise and set identifiers, the exercise name, the upcoming-set label or number, and the completion time. Private body mode hides those workout details from the visible alert; it does not keep them off the server-side timer record.</span></div>
          ${renderAlertSetting("auto-start-rest", "Start rest automatically", "Starts the prescribed rest after a set is completed.", data.settings.autoStartRestTimer !== false)}
          ${renderAlertSetting("auto-highlight-next", "Highlight the next set", "Marks the next planned set when rest ends.", data.settings.autoHighlightNextSet !== false)}
          ${"Notification" in window && Notification.permission === "denied" ? '<div class="callout bad"><b>Notification permission denied</b><span>Open system notification settings for Comprehensive Fitness, then enable alerts, sounds, and lock-screen delivery.</span></div>' : ""}
          <div class="m-label"><span>Installed app setup</span><span>${escapeHtml(pushStatus.label)}</span></div>${renderPwaSetup()}
          ${notificationMessage ? '<p class="settings-note">' + escapeHtml(notificationMessage) + '</p>' : ""}`;
        const pendingPreview = pendingImport?.preview || null;
        const pendingCounts = pendingPreview?.counts || {};
        const pendingImportPanel = pendingPreview ? `
          <div class="callout info import-preview" data-import-preview role="region" aria-labelledby="import-preview-title">
            <b id="import-preview-title">${escapeHtml(pendingPreview.title)}</b>
            <span>${escapeHtml(pendingPreview.mode)} · ${escapeHtml(pendingPreview.version)} · ${escapeHtml(pendingPreview.sourceBytes)} bytes${pendingPreview.sourceUnit ? " · source weights " + escapeHtml(pendingPreview.sourceUnit) : ""}</span>
            <span data-import-preview-counts>${escapeHtml(pendingCounts.sessions || 0)} workout${Number(pendingCounts.sessions || 0) === 1 ? "" : "s"} · ${escapeHtml(pendingCounts.exercises || 0)} exercise${Number(pendingCounts.exercises || 0) === 1 ? "" : "s"} · ${escapeHtml(pendingCounts.sets || 0)} set${Number(pendingCounts.sets || 0) === 1 ? "" : "s"} · ${escapeHtml(pendingCounts.templates || 0)} routine${Number(pendingCounts.templates || 0) === 1 ? "" : "s"}</span>
            <span>${escapeHtml(pendingPreview.reviewRequired || 0)} set classification${Number(pendingPreview.reviewRequired || 0) === 1 ? "" : "s"} require review.</span>
            <ul>${(pendingPreview.facts || []).slice(0, 5).map((fact) => "<li>" + escapeHtml(fact) + "</li>").join("")}</ul>
            <span><strong>No data has changed.</strong> Apply uses one durable replacement and restores the prior local copy if finalization fails.</span>
            <div class="row"><button class="primary-action" type="button" data-action="apply-pending-import" ${importInProgress ? "disabled" : ""}>${pendingImport.noChanges ? "Confirm no changes" : "Apply import"}</button><button type="button" data-action="cancel-pending-import" ${importInProgress ? "disabled" : ""}>Cancel</button></div>
          </div>` : "";
        const dataAndBackup = `
          <div class="callout info privacy-boundary"><b>Workout data stays local</b><span>Workout history, routines, settings, readiness, and imports stay in this browser unless you explicitly export them. Server-assisted rest notifications retain only their disclosed notification and navigation fields.</span></div>
          <div class="callout bad cloud-not-backup"><b>Export is the recoverable copy</b><span>The app does not upload workout history and has no cloud-history or restore endpoint. A downloaded app-data export is the only implemented copy that can be imported to recover these records.</span></div>
          <div class="recoverability-list"><div class="m-label"><span>Recoverability</span><span>verified facts</span></div>${renderStoragePersistenceFact()}<div class="row-item"><span class="ri-copy"><b>Recoverable copy</b><span>The app does not record when you last exported. Create and retain a downloaded export yourself.</span></span><span class="ri-val">Export only</span></div></div>
          ${importAttempt ? '<p role="status" aria-live="polite" data-import-status data-import-state="' + escapeHtml(importStatus.state) + '" data-import-attempt="' + importAttempt + '">' + escapeHtml(importStatus.message) + '</p>' : ''}
          ${importInProgress ? '<div class="state-skeleton import-skeleton" role="status" aria-live="polite"><span class="skeleton skeleton-kicker" aria-hidden="true"></span><span class="skeleton skeleton-title" aria-hidden="true"></span><span class="skeleton skeleton-panel" aria-hidden="true"></span><span class="visually-hidden">Validating or applying workout history. Navigation will recover automatically when it finishes.</span></div>' : ""}
          ${pendingImportPanel}
          <button class="primary-action" type="button" data-action="export-data">${icon.download} Export all app data</button>
          ${exportText ? '<textarea class="export-box" readonly aria-label="Exported backup JSON">' + escapeHtml(exportText) + '</textarea>' : ""}
          <label class="field"><span class="f-top"><span class="f-name">Strong CSV source weight unit</span><span class="f-help">Does not change the display unit</span></span><select data-action="strong-import-weight-unit"><option value="" ${!strongImportWeightUnit ? "selected" : ""}>Choose the unit used in the CSV</option><option value="lb" ${strongImportWeightUnit === "lb" ? "selected" : ""}>Pounds (lb)</option><option value="kg" ${strongImportWeightUnit === "kg" ? "selected" : ""}>Kilograms (kg)</option></select></label>
          <label class="import-button">${icon.upload} ${importInProgress ? "importing..." : "Import backup or Strong CSV"}<input type="file" accept=".json,.csv,application/json,text/csv" data-action="import-data" ${importInProgress ? "disabled" : ""} /></label>
          ${migration ? '<div class="callout info"><b>Strong data migration v' + escapeHtml(migration.version) + '</b><span>Inspected ' + escapeHtml(migration.inspected) + ' sets; changed ' + escapeHtml(migration.changed) + '; preserved ' + escapeHtml(migration.manualOverridesPreserved) + ' manual corrections; ' + escapeHtml(migration.ambiguous) + ' sets need review.</span></div>' : ''}
          <div class="row-item"><span class="ri-copy"><b>Retained source material</b><span>${data.rawImports?.length || 0} raw Strong import${(data.rawImports?.length || 0) === 1 ? '' : 's'} retained. Every completed workout remains available in Progress and exports; recent engine windows do not remove source history.</span></span></div>
          ${reviewSets.length ? '<div class="callout warn"><b>Manual review queue · ' + reviewSets.length + '</b><span>Open the submitted workout from History, choose Edit, then select the set type.</span></div>' : ''}`;
        const danger = `
          <div class="callout bad"><b>High-risk actions</b><span>These actions change or delete stored records. Each destructive path names its scope and requires confirmation.</span></div>
          <div class="row-item"><span class="ri-copy"><b>Clear All Local App Data</b><span>Removes local app records. Retained server records are deleted first; clearing pauses offline or while remote cleanup is unresolved.</span></span><button class="danger-button" type="button" data-action="clear-data" ${localClearBlock ? "disabled" : ""}>Clear All Local App Data</button></div>
          ${localClearBlock ? '<p class="settings-note" role="status">' + escapeHtml(localClearBlock) + '</p>' : ''}
          <div class="row-item"><span class="ri-copy"><b>Delete Remote Installation Data</b><span>Revokes this installation and removes its remote notification records plus any legacy workout-copy records. Local workouts remain.</span></span><button class="danger-button" type="button" data-action="delete-remote-installation" ${pushIdentity?.token ? "" : "disabled"}>${pushIdentity?.deletion?.retryable ? "Retry Remote Deletion" : "Delete Remote Installation Data"}</button></div>
          ${pushIdentity?.deletion?.message ? '<p class="settings-note" role="status">' + escapeHtml(pushIdentity.deletion.message) + '</p>' : ''}
          <div class="m-label"><span>Support</span><span>guidance</span></div><p class="settings-note">Progression guidance is informational fitness guidance, not medical advice. Stop if something hurts and use your own judgment.</p><p class="settings-links"><a href="./privacy.html">Privacy Policy</a><a href="./support.html">Support</a></p>`;
        return `
          <section class="view settings-view">
            <div class="screen-heading"><div><div class="section-kicker">Settings</div><h1>App settings.</h1><p>Timer behavior, privacy, and data controls.</p></div><button type="button" data-action="open-routines">Routines</button></div>
            ${appDataPersistenceConflict ? '<p class="settings-note persistence-conflict-note" role="status">' + escapeHtml(appDataPersistenceConflict.message) + '</p>' : ""}
            ${settingsMessage ? '<p class="settings-note persistence-status-note" role="status">' + escapeHtml(settingsMessage) + '</p>' : ""}
            ${renderSettingsGroup("Weight unit", "Display", units, { open: true })}
            ${renderSettingsGroup("Rest timer and alerts", pushStatus.label, alerts)}
            ${renderSettingsGroup("Data and backup", "Privacy and recovery", dataAndBackup, { open: Boolean(pendingImport || importInProgress || importAttempt) })}
            <div id="support-guidance" class="settings-support-anchor">
              ${renderSettingsGroup("Danger Zone", "Support and high-risk actions", danger, { className: "danger-zone", open: false })}
            </div>
          </section>
        `;
      }
