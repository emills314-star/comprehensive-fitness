
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
            <div class="screen-heading plan-heading">
              <div><div class="section-kicker">Reusable training sheets</div><h1>Your plan</h1><p>Choose a template, then let readiness shape only today’s execution.</p></div>
              <button class="icon-button" type="button" data-action="new-template" title="New template">${icon.add}</button>
            </div>
            <section class="coach-lead templates-coach"><div class="section-kicker">Planning principle</div><h2>The sheet is stable; today can still adapt.</h2><p>Choose the repeatable workout that fits today. Readiness can adjust the session without rewriting the template.</p></section>
            ${running ? '<section class="active-workout-notice" id="active-workout-template-notice" role="status"><div><div class="section-kicker">Workout in progress</div><strong>' + escapeHtml(running.title || 'Active workout') + '</strong><span>Finish or cancel your current workout before starting another template.</span></div><div><button class="primary-action" type="button" data-action="return-active-workout">Return to Active Workout</button><button class="text-danger-action" type="button" data-action="request-cancel-workout-from-template">Manage Active Workout</button></div></section>' : ''}
            ${volumeFlags.length ? '<section class="plan-volume-alerts"><div class="section-heading"><div><h2>Weekly volume checks</h2><p>Review these before adding more work.</p></div></div><div class="drilldown-list">' + volumeFlags.map((flag) => '<button class="drilldown-item fatigue-' + flag.concern + '" type="button" data-action="open-plan-volume-warning" data-flag-id="' + escapeHtml(flag.id) + '"><strong>' + escapeHtml(flag.name + ': ' + flag.reason) + '</strong><span class="fatigue-severity ' + flag.concern + '">' + escapeHtml(flag.concern.charAt(0).toUpperCase() + flag.concern.slice(1)) + ' concern</span><small>' + escapeHtml(flag.evidence[0]) + ' · Tap for exact contributors</small><span class="drilldown-chevron" aria-hidden="true">' + icon.right + '</span></button>').join('') + '</div></section>' : ''}
            <div class="template-library">${data.templates.length ? data.templates.map((template) => renderTemplateCard(template, running)).join("") : '<div class="empty-state">Create a leg day, push day, pull day, or any repeatable workout. Templates store exercises, sets, and target reps; you fill in weights during the workout.</div>'}</div>
            <button class="secondary-action full-width" type="button" data-action="save-template">Save current workout as a template</button>
            ${renderMesocyclePlanner()}
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
        const emptyTemplate = !Array.isArray(template.exercises) || template.exercises.length === 0;
        const emptyTemplateDescriptionId = "empty-template-" + template.id;
        const startDisabledAttributes = locked
          ? 'disabled aria-describedby="active-workout-template-notice" title="Finish or cancel your active workout first"'
          : emptyTemplate
            ? 'disabled aria-describedby="' + escapeHtml(emptyTemplateDescriptionId) + '" title="Add at least one exercise before starting this template"'
            : '';
        const advice = null;
        const confirmingDelete = pendingDeleteTemplateId === template.id;
        const editorExpanded = expandedTemplateEditorIds.has(template.id);
        const prescribedSets = advice?.totalSets ?? templateExerciseCount(template);
        const duration = Math.max(15, Math.round(prescribedSets * 2.5));
        const coachLine = advice ? advice.detail.split(". ").slice(0, 2).join(". ") : "";
        return `
          <article class="template-card compact-template plan-template-card ex-block ${isActiveTemplate ? "active-template" : locked ? "locked-template" : ""}">
            <div class="template-topline">
              <div class="template-title">${usesLargeTextReflow()
                ? '<textarea class="exercise-name autosize-title-field" rows="1" data-action="template-name" data-template-id="' + template.id + '" aria-label="Template name">' + escapeHtml(template.name) + '</textarea>'
                : '<input class="exercise-name" value="' + escapeHtml(template.name) + '" data-action="template-name" data-template-id="' + template.id + '" aria-label="Template name" />'}<small>${template.exercises.length} lifts · ${prescribedSets} prescribed sets · ~${duration} min</small></div>
              <div class="template-card-actions">${isActiveTemplate ? '<button class="primary-action template-start" type="button" data-action="return-active-workout">Resume Workout</button>' : '<button class="primary-action template-start" type="button" data-action="start-template" data-template-id="' + template.id + '" ' + startDisabledAttributes + '>Start</button>'}${isActiveTemplate
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

      function renderHistory(nested = false) {
        const activeHistory = activeHistorySessions();
        const activeIds = new Set(activeHistory.map((session) => session.id));
        const archived = data.sessions.filter((session) => isSessionSubmitted(session) && !activeIds.has(session.id)).sort((a, b) => b.date.localeCompare(a.date));
        const totalSessions = activeHistory.length;
        const sessions = [...activeHistory].sort((a, b) => sessionCompletionDate(b).localeCompare(sessionCompletionDate(a))).slice(0, 120);
        const sessionModels = sessions.map((session) => {
          const facts = sessionWorkoutFacts(session);
          const analysis = workoutAnalysisForSession(session);
          const plannedSets = Number(analysis?.metrics?.plannedSets ?? facts.sets.filter((set) => isWorkingSet(set, "score")).length);
          const completedSets = Number(analysis?.metrics?.completedSets ?? facts.completed.length);
          const completionRatio = plannedSets > 0 ? completedSets / plannedSets : null;
          const completionDelta = completionRatio == null
            ? { tone: "none", text: "—" }
            : completedSets === plannedSets ? { tone: "on", text: "100%" }
              : completedSets < plannedSets ? { tone: "under", text: "−" + (plannedSets - completedSets) }
                : { tone: "over", text: "+" + (completedSets - plannedSets) };
          return { session, facts, analysis, plannedSets, completedSets, completionRatio, completionDelta };
        });
        const totals = sessionModels.reduce((sum, item) => ({
          completed: sum.completed + item.completedSets,
          planned: sum.planned + item.plannedSets,
          score: sum.score + (Number.isFinite(Number(item.analysis?.internalScore)) ? Number(item.analysis.internalScore) : 0),
          scored: sum.scored + (Number.isFinite(Number(item.analysis?.internalScore)) ? 1 : 0)
        }), { completed: 0, planned: 0, score: 0, scored: 0 });
        const completion = totals.planned ? Math.round(totals.completed / totals.planned * 100) + "%" : "—";
        const meanScore = totals.scored ? Math.round(totals.score / totals.scored) : null;
        const meanGrade = meanScore == null ? "—" : workoutLetterGrade(meanScore);
        const groups = new Map();
        sessionModels.forEach((item) => {
          const weekStart = startOfWeekIso(sessionCompletionDate(item.session));
          const group = groups.get(weekStart) || [];
          group.push(item);
          groups.set(weekStart, group);
        });
        const currentWeek = startOfWeekIso(todayIso());
        const renderSession = (item) => {
          const { session, facts, analysis, plannedSets, completedSets, completionDelta } = item;
          const grade = analysis?.grade || "";
          return '<button class="row-item history-session-row" type="button" data-action="open-session" data-session-id="' + escapeHtml(session.id) + '"><span class="ri-copy"><b>' + escapeHtml(session.title || "Workout") + '</b><span>' + formatDate(sessionCompletionDate(session)) + ' · ' + completedSets + (plannedSets ? ' of ' + plannedSets : '') + ' sets · ' + facts.durationMinutes + ' min' + (facts.estimatedDuration ? ' est.' : '') + (facts.exercises.some((exercise) => exercise.isDeload) ? ' · deload work' : '') + '</span></span><span class="d ' + completionDelta.tone + '">' + escapeHtml(completionDelta.text) + '</span><span class="ri-val" aria-label="' + (grade ? 'Workout grade ' + escapeHtml(grade) : 'Workout grade unavailable') + '">' + (grade ? escapeHtml(grade) : noData("Workout grade unavailable")) + '</span></button>';
        };
        return `
          <section class="view history-view">
            <div class="screen-heading"><div><div class="section-kicker">Progress · History</div><h1>Training log.</h1></div>${nested ? '<button class="text-button" type="button" data-action="close-dashboard-detail">Back</button>' : ''}</div>
            <div class="rollup history-rollup" aria-label="Submitted history summary"><span class="ru"><b>${totalSessions}</b><span>sessions</span></span><span class="ru"><b>${escapeHtml(completion)}</b><span>set completion</span></span><span class="ru"><b>${escapeHtml(meanGrade)}</b><span>mean grade</span></span></div>
            ${totalSessions > sessions.length ? '<p class="settings-note">Showing the latest ' + sessions.length + ' sessions. Exercise review still uses the full imported history.</p>' : ""}
            <div class="history-session-groups">${sessionModels.length ? Array.from(groups.entries()).map(([weekStart, items]) => '<section><div class="m-label"><span>' + (weekStart === currentWeek ? 'This week' : escapeHtml(formatWeek(weekStart))) + '</span><span>completion · grade</span></div><div class="history-session-list">' + items.map(renderSession).join("") + '</div></section>').join("") : '<div class="empty-state">Completed workouts will appear here.</div>'}</div>
            <details class="history-section history-by-exercise">
              <summary>Review by exercise <span>${getExerciseNames().length} lifts</span></summary>
              <div class="disclosure-body">${renderExerciseHistory()}</div>
            </details>
            ${archived.length ? '<details class="history-section"><summary>Retention archive <span>' + archived.length + ' recoverable</span></summary><div class="disclosure-body"><p class="settings-note">These completed workouts are older than the rolling six-calendar-month primary history window. They remain in exports and in the full submitted archive, where they can still supply long-range comparisons and fallback coaching evidence. Current-period volume uses the selected week.</p>' + archived.slice(0, 40).map((session) => '<div class="session-card"><div class="history-session-heading"><strong class="history-session-title">' + escapeHtml(session.title || 'Workout') + '</strong><span class="history-session-meta">' + formatDate(sessionCompletionDate(session)) + '</span></div></div>').join('') + '</div></details>' : ''}
          </section>
        `;
      }

      function exerciseDeloadPresentation(week) {
        if (week?.isDeload) return { confidence: 4, label: "Recorded deload", note: "Explicitly marked and excluded from scoring." };
        if (week?.isLikelyDeload) return { confidence: 2, label: "Possible deload", note: "Inferred from the available history; not presented as a recorded fact." };
        return null;
      }

      function renderExerciseHistory() {
        const names = getExerciseNames();
        if (!names.length) return '<div class="empty-state">No exercise history yet.</div>';
        return names.map((name) => {
          const weeks = summarizeExerciseByWeek(name).slice(0, 6);
          const summaryWeeks = weeks.filter((week) => !week.isLikelyDeload).slice(0, 4);
          const plannedSets = summaryWeeks.reduce((sum, week) => sum + Number(week.plannedSets || week.completedSets + week.failedSets || 0), 0);
          const completedSets = summaryWeeks.reduce((sum, week) => sum + Number(week.completedSets || 0), 0);
          const setDelta = completedSets === plannedSets
            ? { tone: "on", text: "on" }
            : completedSets < plannedSets ? { tone: "under", text: "−" + (plannedSets - completedSets) }
              : { tone: "out", text: "+" + (completedSets - plannedSets) };
          const deloadNotes = weeks.map((week) => ({ week, presentation: exerciseDeloadPresentation(week) })).filter((item) => item.presentation);
          return `
            <details class="history-exercise">
              <summary class="ex-head"><span><b>${escapeHtml(name)}</b><span class="sets">${weeks.length} recent week${weeks.length === 1 ? '' : 's'}</span></span><span aria-hidden="true">${icon.right}</span></summary>
              <div class="disclosure-body">
              <div class="m-label"><span>Recent weeks</span><span>top · sets · RPE</span></div>
              <div class="vol">
                <div class="vol-head"><span>Week</span><span>Top set</span><span>Sets</span><span>RPE</span><span>Status</span><span>Trend</span></div>
                ${weeks.map((week, index) => `
                  <div class="vol-row">
                    <span>${formatDate(week.weekStart)}${week.travelCount ? " · Travel" : ""}</span>
                    <span>${week.topWeight > 0 ? week.topWeight + ' × ' + (week.maxRepsAtTopWeight || noData("Repetitions unavailable")) : noData("Top set unavailable")}</span>
                    <span>${week.completedSets}/${Number(week.plannedSets || week.completedSets + week.failedSets)}</span>
                    <span>${week.averageRpe ? week.averageRpe.toFixed(1) : noData("Mean RPE unavailable")}</span>
                    <span>${(() => { const deload = exerciseDeloadPresentation(week); return deload ? '<span class="chip deload-history-chip" data-conf="' + deload.confidence + '">' + escapeHtml(deload.label) + '</span>' : noData("No deload classification"); })()}</span>
                    <span>${sparkline(weeks.slice(index).reverse().map((item) => Number(item.topWeight || 0)), { label: "Top-set trend" })}</span>
                  </div>
                `).join("")}
              </div>
              <div class="m-label"><span>Four-week summary</span><span>plan → completed</span></div>
              <div class="diff exercise-history-diff"><div class="drow dhead"><span class="plan">Prescribed</span><span class="act">Completed</span><span class="dlt">Δ</span></div><div class="drow"><span class="plan"><span class="lbl">Working sets</span><span class="val big">${plannedSets}</span></span><span class="act"><span class="lbl">Non-deload weeks</span><span class="val big">${completedSets}</span></span><span class="dlt"><span class="d ${setDelta.tone}">${escapeHtml(setDelta.text)}</span></span></div></div>
              ${deloadNotes.map(({ week, presentation }) => '<div class="callout ' + (presentation.confidence === 4 ? 'info' : 'provisional') + '"><b>' + escapeHtml(formatDate(week.weekStart) + ' · ' + presentation.label) + '</b><span>' + escapeHtml(presentation.note) + '</span></div>').join("")}
              </div>
            </details>
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
        const exceptionLoad = temporaryException ? Number(target.weight || 0) : 0;
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
        return { setType: role, sequenceIndex, setTypeIndex, targetLoad, targetReps, prefillRpe, repMin, repMax, programmedRepMin: repMin, programmedRepMax: repMax, exactReps: repRange.exactReps, rangeSource: repRange.rangeSource, rpeMin, rpeMax, restSeconds: Number(setType.restSeconds || templateExercise.restSeconds || 0), increment, nextLoad, candidateNextLoad, progressionReady, loadRule: setType.loadRule || "", progressionRule, reductionPercent: reduction, previousComparableSet, prefillSource, progressionDelta: previousComparableSet ? { load: Number((targetLoad - resistanceLoad(previousComparableSet, resistanceType)).toFixed(4)), reps: targetReps - previousReps } : null, confidence: previousComparableSet ? "high" : routineDefaultLoad > 0 || routineDefaultReps > 0 ? "high" : "low", evidenceConfidence: target.confidence || "low", reason: roleName + ": " + reason };
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
          const normalizedTarget = normalizeTargetSetType(item, defaults);
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
        const sourceTarget = set.sourceTemplateSetId
          ? context.setTypes.find((item) => item.id === set.sourceTemplateSetId)
          : null;
        if (sourceTarget) return sourceTarget;
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
          restSeconds: Number(set.targetRestSeconds ?? type?.restSeconds ?? exercise.restSeconds ?? 0),
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
          const group = groups.get(key) || { key, label: context?.templateName || "Historical target unavailable", sessionType: context?.sessionType || "unknown", sessions: new Set(), dates: [], plannedSets: 0, completedSets: 0, repTracked: 0, repHits: 0, repTotal: 0, rpeTracked: 0, rpeHits: 0, rpeTotal: 0, restTotal: 0, restCount: 0, roles: new Map(), context };
          group.sessions.add(session.id);
          group.dates.push(session.date);
          let workingIndex = 0;
          (analysisIndex.setsByExercise.get(exercise.id) || []).slice().sort((a, b) => canonicalSetSequence(a) - canonicalSetSequence(b)).forEach((set) => {
            const expectation = setProgramExpectation(session, exercise, set, workingIndex, { allowCurrentFallback });
            if (expectation.isWarmup || !expectation.countsTowardScore) return;
            workingIndex += 1;
            const roleKey = expectation.setType || "straight";
            const role = group.roles.get(roleKey) || { key: roleKey, label: expectation.label || setTypeLabels[roleKey] || "Working set", plannedSets: 0, completedSets: 0, repTracked: 0, repHits: 0, repTotal: 0, rpeTracked: 0, rpeHits: 0, rpeTotal: 0, repMin: expectation.repMin, repMax: expectation.repMax, rpeMin: expectation.rpeMin, rpeMax: expectation.rpeMax, restSeconds: expectation.restSeconds };
            group.plannedSets += 1;
            role.plannedSets += 1;
            if (!set.completed) { group.roles.set(roleKey, role); return; }
            group.completedSets += 1;
            role.completedSets += 1;
            if (expectation.hasRepTarget && !["duration", "distance"].includes(resistanceTypeFor(exercise, set))) {
              group.repTracked += 1;
              role.repTracked += 1;
              const reps = Number(set.reps || 0);
              group.repTotal += reps;
              role.repTotal += reps;
              if (reps >= (expectation.repMin || expectation.repMax) && reps <= (expectation.repMax || expectation.repMin)) { group.repHits += 1; role.repHits += 1; }
            }
            const rpe = Number(set.rpe || 0);
            if (rpe > 0 && expectation.hasRpeTarget) {
              group.rpeTracked += 1;
              role.rpeTracked += 1;
              group.rpeTotal += rpe;
              role.rpeTotal += rpe;
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
        const weekClassifications = Array.isArray(options.weekClassifications) ? options.weekClassifications : [];
        const classificationSignature = weekClassifications.map((week) => [
          week.weekStart,
          Number(week.completedSets || 0),
          Boolean(week.qualifies),
          Boolean(week.isDeload)
        ].join(":")).join(",");
        const cacheKey = [analysisRevision, options.canonicalExerciseId || canonicalExerciseId(exerciseName), options.throughDate || todayIso(), (options.qualifyingWeekIds || []).join(","), classificationSignature, options.resistanceType || ""].join("|");
        if (exerciseProgressCache.has(cacheKey)) return exerciseProgressCache.get(cacheKey);
        const scoped = getExerciseSets(exerciseName, { canonicalExerciseId: options.canonicalExerciseId });
        const exerciseById = new Map(scoped.exercises.map((exercise) => [exercise.id, exercise]));
        const allowedWeeks = options.qualifyingWeekIds ? new Set(options.qualifyingWeekIds) : null;
        const classificationByWeek = new Map(weekClassifications.map((week) => [week.weekStart, {
          weekStart: week.weekStart,
          completedSets: Number(week.completedSets || 0),
          qualifies: Boolean(week.qualifies),
          isDeload: Boolean(week.isDeload)
        }]));
        const sessionById = new Map(activeHistorySessions({ asOfDate: options.retentionAsOfDate || todayIso(), throughDate: options.throughDate || todayIso() }).map((session) => [session.id, session]));
        const resistanceType = options.resistanceType || scoped.exercises.map((exercise) => resistanceTypeFor(exercise)).find(Boolean) || "external";
        const byWeek = new Map();
        scoped.sets.filter((set) => set.completed && isWorkingSet(set, "progression") && (set.reps > 0 || set.durationSeconds > 0 || set.distance > 0)).forEach((set) => {
          const exercise = exerciseById.get(set.exerciseId);
          const session = exercise ? sessionById.get(exercise.sessionId) : null;
          if (!session) return;
          const weekStart = startOfWeekIso(session.date);
          const classification = classificationByWeek.get(weekStart);
          // The score selection remains authoritative. The chart may additionally retain
          // non-deload low-data weeks, but never derives sufficiency from the plotted value.
          if (classificationByWeek.size) {
            if (!classification || classification.isDeload) return;
          } else if (allowedWeeks && !allowedWeeks.has(weekStart)) return;
          const week = session.date;
          const bucket = byWeek.get(week) || {
            week,
            weekStart,
            completedSets: classification?.completedSets ?? 0,
            qualifies: classification?.qualifies ?? true,
            isDeload: classification?.isDeload ?? false,
            primary: resistanceType === "assisted_bodyweight" ? Infinity : 0,
            secondary: 0,
            details: []
          };
          const load = resistanceLoad(set, resistanceType);
          const primaryValue = resistanceType === "external" ? estimatedOneRepMax(set)
            : resistanceType === "bodyweight_plus_load" ? load
              : resistanceType === "assisted_bodyweight" ? load
                : resistanceType === "duration" ? Number(set.durationSeconds || 0)
                  : resistanceType === "distance" ? Number(set.distance || 0)
                    : Number(set.reps || 0);
          bucket.primary = resistanceType === "assisted_bodyweight" ? Math.min(bucket.primary, primaryValue || Infinity) : Math.max(bucket.primary, primaryValue);
          bucket.secondary += resistanceType === "external" ? load * set.reps : resistanceType === "duration" ? Number(set.durationSeconds || 0) : resistanceType === "distance" ? Number(set.distance || 0) : Number(set.reps || 0);
          bucket.details.push({ ...set, resistanceType, addedLoad: set.addedLoad, assistanceLoad: set.assistanceLoad, sessionId: session.id, sessionTitle: session.title, sessionDate: session.date });
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
          e1rm: weeks.map((week) => ({ label: formatDate(week.week), date: week.week, weekStart: week.weekStart, completedSets: week.completedSets, qualifies: week.qualifies, isDeload: week.isDeload, value: Number.isFinite(week.primary) ? Math.round(week.primary * 10) / 10 : 0, metricType: labels.primaryMetric, details: week.details })),
          volume: weeks.map((week) => ({ label: formatDate(week.week), date: week.week, weekStart: week.weekStart, completedSets: week.completedSets, qualifies: week.qualifies, isDeload: week.isDeload, value: Math.round(week.secondary * 10) / 10, metricType: labels.secondaryMetric, details: week.details }))
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
          isPr: chartKey === "e1rm" && point.qualifies && point.value > Math.max(0, ...validPoints.slice(0, index).filter((item) => item.qualifies).map((item) => item.value)),
          x: validPoints.length === 1 ? plot.left + plotWidth / 2 : plot.left + (index / (validPoints.length - 1)) * plotWidth,
          y: plot.top + (1 - (point.value - domainMin) / domainSpread) * plotHeight
        }));
        const evidencedArea = chartPoints.slice(1).map((point, index) => {
          const previous = chartPoints[index];
          if (!previous.qualifies || !point.qualifies) return "";
          const floor = plot.top + plotHeight;
          return '<polygon class="chart-area" points="' + previous.x.toFixed(1) + ',' + floor.toFixed(1) + ' ' + previous.x.toFixed(1) + ',' + previous.y.toFixed(1) + ' ' + point.x.toFixed(1) + ',' + point.y.toFixed(1) + ' ' + point.x.toFixed(1) + ',' + floor.toFixed(1) + '" clip-path="url(#chart-clip-' + chartKey + ')"></polygon>';
        }).join("");
        const chartSegments = chartPoints.slice(1).map((point, index) => {
          const previous = chartPoints[index];
          const evidenced = Boolean(previous.qualifies && point.qualifies);
          return '<polyline class="chart-line ' + (evidenced ? 'evidenced' : 'thin') + '" data-evidence="' + (evidenced ? 'evidenced' : 'provisional') + '" points="' + previous.x.toFixed(1) + ',' + previous.y.toFixed(1) + ' ' + point.x.toFixed(1) + ',' + point.y.toFixed(1) + '" clip-path="url(#chart-clip-' + chartKey + ')"></polyline>';
        }).join("");
        const evidencedCount = chartPoints.filter((point) => point.qualifies).length;
        const provisionalCount = chartPoints.length - evidencedCount;
        const pointCaption = [
          evidencedCount + " evidenced point" + (evidencedCount === 1 ? "" : "s"),
          provisionalCount ? provisionalCount + " provisional point" + (provisionalCount === 1 ? "" : "s") : ""
        ].filter(Boolean).join(" · ");
        const selected = chartDetailPoint?.chartKey === chartKey
          && chartDetailPoint?.exerciseId === (scope.exerciseId || "")
          && Number(chartDetailPoint?.windowOffset || 0) === Number(scope.windowOffset || 0)
          ? chartDetailPoint : null;
        const selectedIndex = selected ? chartPoints.findIndex((point) => point.date === selected.date && point.value === selected.value) : -1;
        const selectedPoint = selectedIndex >= 0 ? chartPoints[selectedIndex] : null;
        const grid = [0, 1 / 3, 2 / 3, 1].map((ratio) => {
          const y = plot.top + ratio * plotHeight;
          const value = domainMax - ratio * domainSpread;
          return '<line class="chart-grid-line" x1="' + plot.left + '" y1="' + y.toFixed(1) + '" x2="' + (width - plot.right) + '" y2="' + y.toFixed(1) + '"></line><text class="chart-axis-label" x="' + (plot.left - 5) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + escapeHtml(formatChartAxisValue(value)) + '</text>';
        }).join("");
        const dateLabels = chartPoints.length === 1
          ? '<text class="chart-axis-label" x="' + chartPoints[0].x.toFixed(1) + '" y="' + (height - 7) + '" text-anchor="middle">' + escapeHtml(shortChartDate(chartPoints[0].date)) + '</text>'
          : '<text class="chart-axis-label" x="' + plot.left + '" y="' + (height - 7) + '">' + escapeHtml(shortChartDate(chartPoints[0].date)) + '</text><text class="chart-axis-label" x="' + chartPoints[Math.floor((chartPoints.length - 1) / 2)].x.toFixed(1) + '" y="' + (height - 7) + '" text-anchor="middle">' + escapeHtml(shortChartDate(chartPoints[Math.floor((chartPoints.length - 1) / 2)].date)) + '</text><text class="chart-axis-label" x="' + (width - plot.right) + '" y="' + (height - 7) + '" text-anchor="end">' + escapeHtml(shortChartDate(chartPoints.at(-1).date)) + '</text>';
        return `
          <div class="chart-card evidence-chart" data-chart-key="${chartKey}">
            <header><strong>${escapeHtml(title)}</strong><span class="status-pill">${escapeHtml(pointCaption)}</span></header>
            <div class="chart-svg">
              <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)} chart">
                <defs><clipPath id="chart-clip-${chartKey}"><rect x="${plot.left - 3}" y="${plot.top - 3}" width="${plotWidth + 6}" height="${plotHeight + 6}" rx="3"></rect></clipPath></defs>
                ${grid}
                ${evidencedArea}
                ${chartSegments}
                ${selectedPoint ? '<line class="chart-selected-guide" x1="' + selectedPoint.x.toFixed(1) + '" y1="' + selectedPoint.y.toFixed(1) + '" x2="' + selectedPoint.x.toFixed(1) + '" y2="' + (plot.top + plotHeight).toFixed(1) + '"></line>' : ""}
                ${chartPoints.map((point, index) => { const isSelected = index === selectedIndex; const activationKey = registerChartPointActivation(chartKey, point, scope); const evidenceLabel = point.qualifies ? 'evidenced' : 'provisional, ' + point.completedSets + ' completed set' + (point.completedSets === 1 ? '' : 's') + ' that week'; return '<g class="chart-point ' + (point.qualifies ? 'evidenced ' : 'thin ') + (point.isPr ? 'pr ' : '') + (isSelected ? 'selected' : '') + '" role="button" tabindex="0" aria-pressed="' + (isSelected ? 'true' : 'false') + '" aria-label="' + escapeHtml(title + ': ' + point.value + ' on ' + formatDate(point.date) + ', ' + evidenceLabel + (point.isPr ? ', personal record' : '')) + '" data-action="show-chart-point" data-chart-key="' + chartKey + '" data-chart-date="' + escapeHtml(point.date) + '" data-chart-point-key="' + activationKey + '"><circle class="hit-area" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="34"></circle><circle class="selected-ring" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="9"></circle><circle class="visible-point" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="4.5"></circle>' + (point.isPr ? '<path class="chart-pr-marker" d="M' + point.x.toFixed(1) + ' ' + (point.y - 13).toFixed(1) + 'l2.2 4.4 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8-3.5-3.4 4.8-.7Z"></path>' : '') + '</g>'; }).join("")}
                ${dateLabels}
              </svg>
            </div>
            ${provisionalCount ? '<div class="chart-key" aria-label="Chart evidence legend"><span><i></i>evidenced</span><span><i class="thin"></i>provisional week</span></div>' : ""}
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

      function chartPointSetComparison(set, workingIndex = 0) {
        const exercise = data.exercises.find((item) => item.id === set.exerciseId) || selectedExerciseRecord();
        const session = data.sessions.find((item) => item.id === (set.sessionId || exercise?.sessionId));
        const expectation = session && exercise
          ? setProgramExpectation(session, exercise, set, workingIndex, { allowCurrentFallback: false })
          : null;
        const resistanceType = resistanceTypeFor(exercise, set);
        const targetLoad = Number(set.targetWeight ?? 0);
        const targetLoadText = targetLoad > 0
          ? formatResistance({ ...set, weight: targetLoad, resistanceType }, exercise)
          : "";
        const repMin = Number(expectation?.repMin || set.targetRepMin || set.targetReps || 0);
        const repMax = Number(expectation?.repMax || set.targetRepMax || set.targetReps || repMin || 0);
        const rpeMin = Number(expectation?.rpeMin || set.targetRpeMin || 0);
        const rpeMax = Number(expectation?.rpeMax || set.targetRpeMax || set.targetRpe || rpeMin || 0);
        const actualReps = Number(set.reps || 0);
        const actualRpe = Number(set.rpe || 0);
        const hasRepTarget = repMin > 0 || repMax > 0;
        const hasRpeTarget = rpeMin > 0 || rpeMax > 0;
        const repLow = repMin || repMax;
        const repHigh = repMax || repMin;
        const rpeLow = rpeMin || Math.max(0, rpeMax - Number(expectation?.rpeTolerance || set.targetRpeTolerance || 1));
        const rpeHigh = rpeMax || rpeMin;
        let delta = { tone: "none", text: "no comparison" };
        if (hasRepTarget) {
          if (actualReps < repLow) delta = { tone: "under", text: "−" + formatLoadNumber(repLow - actualReps) + " rep" + (Math.abs(repLow - actualReps) === 1 ? "" : "s") };
          else if (actualReps > repHigh) delta = { tone: "out", text: "+" + formatLoadNumber(actualReps - repHigh) + " rep" + (Math.abs(actualReps - repHigh) === 1 ? "" : "s") };
          else if (hasRpeTarget && actualRpe > 0 && actualRpe > rpeHigh) delta = { tone: "out", text: "+" + formatLoadNumber(actualRpe - rpeHigh) + " RPE" };
          else if (hasRpeTarget && actualRpe > 0 && actualRpe < rpeLow) delta = { tone: "under", text: "−" + formatLoadNumber(rpeLow - actualRpe) + " RPE" };
          else if (!hasRpeTarget || actualRpe > 0) delta = { tone: "on", text: "on" };
        }
        const planParts = [
          targetLoadText,
          hasRepTarget ? targetRangeText(repLow, repHigh, " reps") : "",
          hasRpeTarget ? targetRangeText(rpeLow, rpeHigh, " RPE") : ""
        ].filter(Boolean);
        return {
          actual: formatSetPerformance(set, exercise),
          delta,
          plan: planParts.join(" · ") || "Saved target unavailable"
        };
      }

      function renderChartPointSetGroups(point) {
        const groups = chartPointSessionGroups(point);
        const multipleSessions = groups.length > 1;
        return (multipleSessions ? '<div class="callout info"><b>' + groups.length + ' sessions contributed on this date</b><span>The chart point is a date bucket. Sets remain grouped under the workout that produced them.</span></div>' : '')
          + groups.map((group) => '<section class="chart-session-group"><div class="m-label"><span>' + escapeHtml(group.title) + '</span><span>' + formatDate(group.date) + '</span></div><div class="diff chart-set-diff">'
            + group.sets.map((set, index) => {
              const comparison = chartPointSetComparison(set, index);
              return '<div class="drow"><span class="plan"><span class="lbl">Set ' + (Number(set.setNumber) || index + 1) + ' target</span><span class="val">' + escapeHtml(comparison.plan) + '</span></span><span class="act"><span class="lbl">Performed</span><span class="val">' + escapeHtml(comparison.actual) + '</span></span><span class="dlt"><span class="d ' + comparison.delta.tone + '">' + escapeHtml(comparison.delta.text) + '</span></span></div>';
            }).join("") + '</div></section>').join("");
      }

      function renderChartPointDetail(chartKey, title, point, points) {
        const exerciseName = selectedExerciseName();
        const exercise = selectedExerciseRecord();
        const index = points.findIndex((item) => item.date === point.date && item.value === point.value);
        const previous = index > 0 ? points[index - 1] : null;
        const comparison = previous && previous.value ? ((point.value - previous.value) / previous.value) * 100 : null;
        const best = [...(point.details || [])].sort((left, right) => {
          if (point.metricType === "assistance_load") return Number(left.weight || 0) - Number(right.weight || 0);
          if (point.metricType === "e1rm") return estimatedOneRepMax(right) - estimatedOneRepMax(left);
          return Number(right.weight || 0) - Number(left.weight || 0) || Number(right.reps || 0) - Number(left.reps || 0);
        })[0];
        const unitLabel = ["e1rm", "added_load", "assistance_load", "conventional_volume"].includes(point.metricType)
          ? " " + data.settings.weightUnit
          : point.metricType.includes("duration") ? " sec"
            : point.metricType.includes("distance") ? " m"
              : " reps";
        const metricValue = point.metricType === "conventional_volume" ? point.value.toLocaleString() : point.value;
        const close = '<button class="icon-button" type="button" data-action="close-chart-point" aria-label="Close chart detail">' + icon.close + '</button>';
        const priorMax = chartKey === "e1rm" ? Math.max(0, ...points.slice(0, Math.max(0, index)).map((item) => item.value)) : 0;
        const isPr = chartKey === "e1rm" && point.value > priorMax;
        const evidence = point.qualifies
          ? '<span class="chip" data-conf="4">Evidenced · ' + point.completedSets + ' sets that week</span>'
          : '<span class="chip" data-conf="1">Provisional · ' + point.completedSets + ' set' + (point.completedSets === 1 ? '' : 's') + ' that week</span>';
        const note = point.metricType === "e1rm"
          ? 'Epley estimate: load × (1 + reps ÷ 30).' + (isPr ? ' Personal record for the available history.' : '')
          : point.metricType === "conventional_volume"
            ? 'Volume load reflects this exercise on the selected date only.'
            : 'Bodyweight resistance uses recorded reps, duration, distance, and explicit added or assistance load; unsupported total-system load is not estimated.';
        return '<article class="chart-detail" role="status"><div class="row split"><div><span class="section-kicker">Selected date · ' + formatDate(point.date) + '</span><strong>' + escapeHtml(title + ' · ' + metricValue + unitLabel) + '</strong><span class="chart-detail-exercise">' + escapeHtml(exerciseName) + '</span></div>' + close + '</div>'
          + evidence
          + '<div class="rollup chart-point-rollup"><span class="ru"><b>' + (best ? escapeHtml(formatResistance(best, exercise)) : noData("Top load unavailable")) + '</b><span>top load</span></span><span class="ru"><b>' + (best?.reps ? escapeHtml(best.reps) : noData("Repetitions unavailable")) + '</b><span>reps</span></span><span class="ru"><b>' + (best?.rpe ? escapeHtml(best.rpe) : noData("RPE unavailable")) + '</b><span>RPE</span></span></div>'
          + '<div><div class="m-label"><span>Sets on ' + formatDate(point.date) + '</span><span>target → performed</span></div>' + renderChartPointSetGroups(point) + '</div>'
          + '<div class="callout ' + (comparison == null ? 'provisional' : comparison >= 0 ? 'good' : 'warn') + '"><b>Against the previous chart point</b><span>' + (comparison == null ? 'This date establishes the comparison baseline.' : '<em>' + (comparison >= 0 ? '+' : '') + comparison.toFixed(1) + '%</em> for this metric.') + '</span></div>'
          + '<small>' + escapeHtml(note) + '</small></article>';
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
        const deltaChip = (label, value, suffix, positiveGood = true) => {
          const tone = Math.abs(value) < 0.05 ? "on" : value > 0 ? (positiveGood ? "over" : "out") : "under";
          return '<span class="d ' + tone + '"><b>' + escapeHtml(label) + '</b> ' + (value > 0 ? '+' : '') + escapeHtml(formatLoadNumber(value) + suffix) + '</span>';
        };
        return '<div class="inline-panel lift-progress-summary"><strong>' + formatDate(current.weekStart) + ' vs ' + formatDate(previous.weekStart) + '</strong><div class="delta-chip-row">' + deltaChip('Estimated 1RM', e1rmChange, ' ' + data.settings.weightUnit) + deltaChip('Top load', loadChange, ' ' + data.settings.weightUnit) + deltaChip('Working sets', volumeChange, '') + '</div><p class="settings-note">' + (current.isDeload ? 'This week was marked as a deload, so it is not treated as a regression.' : 'Use this comparison with RPE and rep quality, not load alone.') + '</p></div>';
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
        if (hypertrophyScoreLoading) return '<section class="hypertrophy-score-empty score-loading" role="status" aria-live="polite"><span class="skeleton skeleton-kicker" aria-hidden="true"></span><span class="skeleton skeleton-title" aria-hidden="true"></span><span class="skeleton skeleton-panel" aria-hidden="true"></span><span class="visually-hidden">Recalculating Hypertrophy Score from submitted history.</span></section>';
        if (analysis.score == null) return '<section class="hypertrophy-score-empty"><strong>' + escapeHtml(analysis.scopeLabel) + ' · Not enough data yet</strong><p>' + (analysis.scopeType === 'exercise' ? 'Submit at least one qualifying week with two completed working sets for this exact exercise variation. The app will not substitute the overall-program score.' : 'Submit at least one week with three completed working sets and at least half of its planned work finished.') + '</p></section>';
        const trend = analysis.trend == null ? "No prior six-week window" : (analysis.trend >= 0 ? "+" : "") + analysis.trend + " vs prior window";
        const weekText = analysis.included.length + (analysis.included.length === 1 ? " qualifying week" : " qualifying weeks") + (analysis.provisional ? " · Provisional" : "");
        const confidenceLevel = analysis.confidence === "high" ? 4 : analysis.confidence === "moderate" ? 3 : 2;
        const limiting = analysis.improvements[0]?.detail || analysis.interpretation;
        const filledSegments = Math.max(0, Math.min(10, Math.round(Number(analysis.score || 0) / 10)));
        const confidenceAccounting = analysis.included.length + " qualifying week" + (analysis.included.length === 1 ? "" : "s")
          + ", " + analysis.skippedDeloadWeeks.length + " skipped as deload" + (analysis.skippedDeloadWeeks.length === 1 ? "" : "s")
          + ", " + analysis.incompleteWeeks.length + " below the data floor.";
        return `<div class="hypertrophy-score-wrap">
          <button class="hypertrophy-score-card analysis-score-card" type="button" data-action="toggle-hypertrophy-score" aria-expanded="${hypertrophyScoreExpanded ? 'true' : 'false'}">
            <span class="score-hero-copy"><span class="hypertrophy-score-title">Hypertrophy score</span><strong>${escapeHtml(limiting)}</strong><span>${escapeHtml(trend)} · ${escapeHtml(weekText)}</span></span>
            <span class="score-hero-number"><b>${analysis.score}</b><span class="hypertrophy-score-grade" role="img" aria-label="Letter grade ${escapeHtml(hypertrophyGradeLabel(hypertrophyLetterGrade(analysis.score)))}">${hypertrophyLetterGrade(analysis.score)} · ${escapeHtml(analysis.confidence)}</span></span>
            <span class="track" aria-label="${analysis.score} out of 100">${Array.from({ length: 10 }, (_, index) => '<i class="seg ' + (index < filledSegments ? 'filled' : '') + '"></i>').join("")}</span>
            <span class="hypertrophy-score-meta"><span>${escapeHtml(hypertrophyWindowLabel(analysis))}</span><span>${hypertrophyScoreExpanded ? 'Hide full score accounting' : 'Open full score accounting'} ${icon.right}</span></span>
          </button>
          <div class="callout info analysis-confidence"><span class="meter lg" data-conf="${confidenceLevel}" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span><b>${escapeHtml(analysis.confidence.charAt(0).toUpperCase() + analysis.confidence.slice(1))} confidence</b><span>${escapeHtml(confidenceAccounting)}</span></span></div>
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

      function renderExerciseExpectations(exerciseId, analysis) {
        const contexts = hypertrophyWindowOffset > 0 ? [] : currentExerciseTargetContexts(exerciseId);
        const actuals = exerciseExpectationActuals(exerciseId, analysis);
        const historicalConfigured = actuals.filter((group) => group.context).length;
        const historicalChanged = new Set(actuals.filter((group) => group.context).map((group) => group.context.id + "|" + JSON.stringify(group.context.setTypes))).size > 1;
        const comparisonDelta = (actual, low, high, unit = "") => {
          if (!Number.isFinite(actual) || !Number.isFinite(low) || !Number.isFinite(high) || high <= 0) return { tone: "none", text: "—" };
          if (actual < low) return { tone: "under", text: "−" + formatLoadNumber(low - actual) + unit };
          if (actual > high) return { tone: "out", text: "+" + formatLoadNumber(actual - high) + unit };
          return { tone: "on", text: "on" };
        };
        const renderRoleDiff = (group, role) => {
          const target = group.context.setTypes.find((type) => type.type === role.key) || {};
          const expectedSets = Number(target.setCount || 0);
          const actualSets = group.sessionCount ? Math.round(role.completedSets / group.sessionCount * 10) / 10 : 0;
          const setDelta = comparisonDelta(actualSets, expectedSets, expectedSets, "");
          const repLow = Number(target.repMin || target.repMax || 0);
          const repHigh = Number(target.repMax || target.repMin || 0);
          const averageReps = role.repTracked ? Math.round(role.repTotal / role.repTracked * 10) / 10 : null;
          const repDelta = comparisonDelta(averageReps, repLow, repHigh, " r");
          const rpeLow = Number(target.rpeMin || target.rpeMax || 0);
          const rpeHigh = Number(target.rpeMax || target.rpeMin || 0);
          const averageRpe = role.rpeTracked ? Math.round(role.rpeTotal / role.rpeTracked * 10) / 10 : null;
          const rpeDelta = comparisonDelta(averageRpe, rpeLow, rpeHigh, " RPE");
          const repCompliance = role.repTracked ? Math.round(role.repHits / role.repTracked * 100) + "% compliance" : "Not scored";
          const rpeCompliance = role.rpeTracked ? Math.round(role.rpeHits / role.rpeTracked * 100) + "% compliance" : "Not scored";
          return '<section class="expectation-role-diff"><div class="m-label bare"><span>' + escapeHtml(role.label) + '</span><span>' + group.sessionCount + (group.sessionCount === 1 ? ' session' : ' sessions') + '</span></div><div class="diff"><div class="drow dhead"><span class="plan">Expected</span><span class="act">Actual</span><span class="dlt">Δ</span></div>'
            + '<div class="drow"><span class="plan"><span class="lbl">Working sets</span><span class="val big">' + expectedSets + '</span></span><span class="act"><span class="lbl">Average per session</span><span class="val big">' + actualSets + '</span></span><span class="dlt"><span class="d ' + setDelta.tone + '">' + escapeHtml(setDelta.text) + '</span></span></div>'
            + '<div class="drow"><span class="plan"><span class="lbl">Reps</span><span class="val big">' + escapeHtml(targetRangeText(repLow, repHigh)) + '</span></span><span class="act"><span class="lbl">' + escapeHtml(repCompliance) + '</span><span class="val big">' + (averageReps == null ? noData("Mean repetitions unavailable") : averageReps) + '</span></span><span class="dlt"><span class="d ' + repDelta.tone + '">' + escapeHtml(repDelta.text) + '</span></span></div>'
            + '<div class="drow"><span class="plan"><span class="lbl">Effort</span><span class="val big">' + escapeHtml(targetRangeText(rpeLow, rpeHigh)) + '</span></span><span class="act"><span class="lbl">' + escapeHtml(rpeCompliance) + '</span><span class="val big">' + (averageRpe == null ? noData("Mean RPE unavailable") : averageRpe) + '</span></span><span class="dlt"><span class="d ' + rpeDelta.tone + '">' + escapeHtml(rpeDelta.text) + '</span></span></div>'
            + '</div></section>';
        };
        return `<section class="exercise-expectations" aria-label="Exercise Expectations">
          <div class="section-heading"><div><div class="section-kicker">Actual vs expected · analyzed window</div><h2>Execution against the saved plan</h2><p>Every period is judged against the prescription stored with it. Missing targets remain unscored.</p></div></div>
          <div class="actual-expected">
            ${actuals.length ? actuals.map((group) => {
              const dateLabel = group.dateStart ? ' · ' + formatDate(group.dateStart) + (group.dateEnd && group.dateEnd !== group.dateStart ? ' to ' + formatDate(group.dateEnd) : '') : '';
              if (!group.context) return '<div class="actual-expected-context"><strong>Historical target unavailable' + dateLabel + '</strong><div class="expectation-missing"><span>The submitted sets remain visible, but this period has no effective-dated prescription. Compliance is excluded and confidence is reduced.</span></div></div>';
              const roles = group.roles || [];
              return '<div class="actual-expected-context"><strong>' + escapeHtml(group.label) + dateLabel + (group.context.resolutionSource === 'current-fallback' ? ' · current target fallback' : '') + '</strong><div class="actual-role-grid">' + roles.map((role) => renderRoleDiff(group, role)).join('') + '</div></div>';
            }).join('') : '<div class="expectation-missing"><strong>No qualifying execution data</strong><span>Current program expectations are shown above. Submit this exercise to populate the six-week comparison.</span></div>'}
          </div>
          <details class="expectation-context-library"><summary>Program targets used for this comparison <span>${contexts.length || historicalConfigured} context${(contexts.length || historicalConfigured) === 1 ? '' : 's'}</span></summary><div class="disclosure-body">
            ${contexts.length ? contexts.map((context, index) => `<article class="expectation-context">
              <div class="expectation-context-head"><div><h3>${escapeHtml(context.templateName)}</h3><p>${escapeHtml(context.role)} · ${escapeHtml(context.source)}${index === 0 ? ' · Current' : ''}</p></div><span class="status-pill ${index === 0 ? 'inside' : ''}">${escapeHtml(context.sessionType)}</span></div>
              <div class="set-type-list">${context.setTypes.map(renderTargetSetType).join('')}</div>
              <details class="expectation-advanced"><summary>Progression and scoring rules</summary><p><strong>Progression:</strong> ${escapeHtml(context.progressionRule)}</p><p>Each submitted set is graded against the set type and prescription saved with that workout. Readiness adjustments remain temporary and do not overwrite this base template.</p></details>
            </article>`).join('') : hypertrophyWindowOffset > 0 ? '<div class="expectation-missing"><strong>Historical targets only</strong><span>Current template targets are intentionally hidden in this snapshot. The execution above uses only prescriptions saved with workouts inside the selected period.</span></div>' : '<div class="expectation-missing"><strong>No active program target</strong><span>Add this exercise to a workout template and configure sets, reps, RPE, and rest. Missing targets are excluded from compliance scoring rather than invented.</span></div>'}
          </div></details>
          ${historicalChanged ? '<p class="expectation-note"><strong>Targets changed during this window.</strong> Each session was scored against the target saved on that date; current template settings were not applied retroactively.</p>' : ''}
          ${actuals.some((group) => !group.context) ? '<p class="expectation-note"><strong>Some historical targets are unknown.</strong> Those imported or legacy sets remain visible, but rep-range and RPE compliance are not scored without a saved prescription.</p>' : ''}
          ${contexts.length > 1 ? '<p class="expectation-note"><strong>Multiple program contexts.</strong> Heavy, light, technique, and other template uses remain separate above and in the actual-versus-expected comparison.</p>' : ''}
        </section>`;
      }

      function renderLiftProgress() {
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
        const selectedWeekStarts = (analysis.included || []).map((week) => week.weekStart).sort();
        const oldestSelectedWeek = selectedWeekStarts[0] || "";
        const newestSelectedWeek = selectedWeekStarts.at(-1) || "";
        const chartWeekClassifications = (analysis.allWeeks || [])
          .filter((week) => oldestSelectedWeek && newestSelectedWeek && week.weekStart >= oldestSelectedWeek && week.weekStart <= newestSelectedWeek)
          .map((week) => ({
            weekStart: week.weekStart,
            completedSets: Number(week.completedSets || 0),
            qualifies: Boolean(week.qualifies),
            isDeload: Boolean(week.isDeload)
          }));
        const progress = selectedName ? measurePerformance("charts:exerciseProgressSeries", () => exerciseProgressSeries(selectedName, { ...analysisOptions, qualifyingWeekIds: analysis.qualifyingWeekIds, weekClassifications: chartWeekClassifications, resistanceType: exercise?.resistanceType }), { exerciseId: selectedExerciseId }) : { e1rm: [], volume: [], primaryTitle: "Estimated 1RM", secondaryTitle: "Volume load", latestPrimary: "Latest e1RM", latestSecondary: "Latest volume", resistanceType: "external" };
        const latestReviewWeek = weeks[0]?.weekStart || "";
        const recommendation = selectedName && latestReviewWeek ? coachRecommendationForExercise(selectedName, { ...analysisOptions, weekStart: latestReviewWeek, historical: hypertrophyWindowOffset > 0 }) : null;
        if (catalog.length === 0) {
          return '<section class="view charts-view"><div class="screen-heading"><div><div class="section-kicker">Charts</div><h1>Lift progress</h1></div></div><div class="empty-state">Log an exercise, then this screen will show progression charts and next-step guidance.</div></section>';
        }
        const latestOneRm = progress.e1rm.filter((point) => point.value > 0).at(-1);
        const latestVolume = progress.volume.filter((point) => point.value > 0).at(-1);
        const previousOneRm = progress.e1rm.filter((point) => point.value > 0).at(-2);
        const primaryChange = latestOneRm && previousOneRm ? Math.round((latestOneRm.value - previousOneRm.value) * 10) / 10 : null;
        const primaryHeadline = latestOneRm
          ? formatLoadNumber(latestOneRm.value) + (progress.resistanceType === "external" ? " " + data.settings.weightUnit : "") + (primaryChange == null ? " establishes the current baseline." : ", " + (primaryChange >= 0 ? "up " : "down ") + formatLoadNumber(Math.abs(primaryChange)) + " from the prior point.")
          : "Build the first reliable comparison point.";
        const chartPointScope = {
          exerciseId: selectedExerciseId,
          windowOffset: hypertrophyWindowOffset,
          throughDate: analysisOptions.throughDate,
          qualifyingWeekIds: analysis.qualifyingWeekIds,
          resistanceType: exercise?.resistanceType || progress.resistanceType
        };
        return `
          <section class="view charts-view">
            <div class="screen-heading"><div><div class="section-kicker">${hypertrophyWindowOffset > 0 ? 'Progress · Lifts · Historical snapshot through ' + formatDate(analysis.windowEnd) : 'Progress · Lifts'}</div><h1>${escapeHtml(selectedName)}</h1></div><span class="status-pill inside">${analysis.included.length} qualifying week${analysis.included.length === 1 ? '' : 's'} · ${analysis.dataPointCount} sets</span></div>
            <section class="m-head analysis-lead"><div class="eyebrow">${escapeHtml(progress.primaryTitle)} · ${analysis.included.length} qualifying week${analysis.included.length === 1 ? '' : 's'}</div><h2>${escapeHtml(primaryHeadline)}</h2></section>
            <div class="chart-control-panel" aria-label="Selected lift controls">
              <div class="chart-viewing-summary"><div><span>Viewing</span><strong>${escapeHtml(selectedName)}</strong><span>Exercise analysis · ${formatDate(analysis.windowStart)} – ${formatDate(analysis.windowEnd)}</span></div><span class="status-pill inside">${analysis.included.length} qualifying · ${analysis.skippedDeloadWeeks.length} deload skipped</span></div>
              <div class="chart-control-field chart-control-lift"><label for="chart-exercise-search">Chart lift</label><div class="chart-search-input"><input id="chart-exercise-search" type="search" data-action="review-exercise-input" role="combobox" aria-autocomplete="list" aria-controls="chart-exercise-suggestions" aria-expanded="${chartExerciseSearchOpen ? 'true' : 'false'}" aria-label="Search or select exercise" autocomplete="off" value="${escapeHtml(chartExerciseDraft || selectedName)}" /><button class="chart-search-clear" type="button" data-action="clear-chart-exercise-search" aria-label="Clear exercise search">×</button></div><div id="chart-exercise-suggestions" class="exercise-suggestions" role="listbox" ${chartExerciseSearchOpen ? '' : 'hidden'}>${renderExerciseSuggestions()}</div><small class="exercise-search-error" role="status" ${chartExerciseSearchError ? '' : 'hidden'}>${escapeHtml(chartExerciseSearchError)}</small></div>
              <div class="chart-control-field analysis-period-control"><span>Analysis period</span><details class="analysis-period-menu"><summary>${escapeHtml((hypertrophyWindowOffset === 0 ? 'Latest qualifying period' : 'Historical period ' + hypertrophyWindowOffset) + ' · ' + hypertrophyWindowLabel(analysis))}<span aria-hidden="true">⌄</span></summary><div class="analysis-period-options">${analysis.windowOptions.length ? analysis.windowOptions.map((option, index) => '<button type="button" data-action="select-chart-period" data-period-offset="' + option.offset + '" aria-pressed="' + (option.offset === hypertrophyWindowOffset) + '"><strong>' + escapeHtml(index === 0 ? 'Latest 6 qualifying weeks' : 'Previous qualifying period ' + index) + '</strong><br><small>' + escapeHtml(hypertrophyWindowLabel(option.selection)) + '</small></button>').join('') : '<button type="button" aria-pressed="true">Latest qualifying period</button>'}</div></details></div>
              <p class="chart-control-context">Score, rationale, weeks, charts, and coaching use only submitted ${escapeHtml(selectedName)} history. Equipment and named variations remain separate.</p>
            </div>
            <section class="screen-section primary-analysis-chart">
              <div class="m-label"><span>Primary trend</span><span>solid evidenced · dashed provisional</span></div>
              ${renderChart("e1rm", progress.primaryTitle, progress.e1rm, "No comparable completed sets yet.", chartPointScope)}
            </section>
            ${renderHypertrophyScore(analysis, { deferDetail: true })}
            ${renderExerciseExpectations(selectedExerciseId, analysis)}
            ${hypertrophyScoreExpanded ? renderHypertrophyScoreDetail(analysis) : ""}
            <div class="chart-metric-row"><div><span>${escapeHtml(progress.latestPrimary)}</span><strong>${latestOneRm ? latestOneRm.value : "-"}</strong>${sparkline(progress.e1rm.map((point) => Number(point.value || 0)), { label: progress.latestPrimary + " trend" })}<span class="d ${progress.e1rm.length > 1 && Number(progress.e1rm.at(-1).value) >= Number(progress.e1rm.at(-2).value) ? "over" : "under"}">${progress.e1rm.length > 1 ? formatLoadNumber(Number(progress.e1rm.at(-1).value) - Number(progress.e1rm.at(-2).value)) : "—"}</span></div><div><span>${escapeHtml(progress.latestSecondary)}</span><strong>${latestVolume ? latestVolume.value : "-"}</strong>${sparkline(progress.volume.map((point) => Number(point.value || 0)), { label: progress.latestSecondary + " trend" })}<span class="d ${progress.volume.length > 1 && Number(progress.volume.at(-1).value) >= Number(progress.volume.at(-2).value) ? "over" : "under"}">${progress.volume.length > 1 ? formatLoadNumber(Number(progress.volume.at(-1).value) - Number(progress.volume.at(-2).value)) : "—"}</span></div><div><span>Data points</span><strong>${analysis.dataPointCount}</strong>${pips(Math.min(analysis.dataPointCount, 6), 6, analysis.dataPointCount + " data points")}</div></div>
            ${latestReviewWeek && progress.resistanceType === 'external' ? renderLiftProgressSummary(weeks, latestReviewWeek) : ''}
            ${recommendation ? '<section class="coach-recommendation-wrap"><div class="section-kicker">' + (hypertrophyWindowOffset > 0 ? 'Coach recommendation at the end of this period' : 'Coach Recommendation') + '</div>' + renderRecommendation(recommendation) + '</section>' : ""}
            <section class="screen-section">
              <div class="section-heading"><div><h2>Supporting volume</h2><p>Activate a point to inspect the selected date and its contributing sets.</p></div></div>
              <div class="chart-list supporting-chart-list">
                ${renderChart("volume", progress.secondaryTitle, progress.volume, "No completed work is available for this metric yet.", chartPointScope)}
              </div>
            </section>
            <section class="screen-section trend-section"><div class="section-heading"><div><h2>Recent weeks</h2></div></div><div class="trend-table">
              <div class="trend-head"><span>Week</span><span>Top</span><span>Sets</span><span>RPE</span><span>Trend</span></div>
              ${weeks.map((week, index) => `
                <div class="trend-row">
                  <span>${formatDate(week.weekStart)}${week.travelCount ? " - Travel" : ""}${week.isDeload ? " - Deload" : ""}</span>
                  <span>${week.topWeight}</span>
                  <span>${week.completedSets}/${week.completedSets + week.failedSets}</span>
                  <span>${week.averageRpe ? week.averageRpe.toFixed(1) : "-"}</span>
                  <span>${sparkline(weeks.slice(index).reverse().map((item) => Number(item.topWeight || 0)), { label: "Top-set trend" })}</span>
                </div>
              `).join("")}
            </div></section>
          </section>
        `;
      }

      function renderRecommendation(recommendation) {
        if (recommendation?.reason === "unavailable_equipment") return "";
        if (recommendation?.executionBlocked === true && recommendation?.executable === false) {
          const reason = String(recommendation.message || recommendation.reason || "The recommendation is unavailable for the current workout constraints.");
          return `
            <article class="recommendation change blocked-recommendation" role="alert">
              <span>Recommendation unavailable</span>
              <h2>Exercise is not currently executable</h2>
              <p>${escapeHtml(reason)}</p>
            </article>
          `;
        }
        if (recommendation.recommendationSnapshot) {
          const snapshot = recommendationSnapshotForDisplay(recommendation.recommendationSnapshot);
          if (!snapshot) {
            return '<article class="recommendation change blocked-recommendation" role="alert"><span>Recommendation unavailable</span><h2>Saved recommendation needs to be rebuilt</h2><p>The lift history remains available, but this recommendation cannot be displayed safely.</p></article>';
          }
          const prescription = snapshot.finalPrescription;
          const tone = prescription.recommendationType.includes("deload") ? "deload" : ["substitute", "rotate_exercise"].includes(prescription.recommendationType) ? "change" : prescription.recommendationType === "progress" ? "progress" : "hold";
          return `
            <article class="recommendation unified-recommendation recommendation-card-v2 ${tone}">
              ${renderRecommendationHead(snapshot)}
              ${renderUnifiedEvidence(snapshot, { idPrefix: "analysis-" + (recommendation.affectedExerciseName || prescription.exerciseId) })}
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
            <ul>${(Array.isArray(recommendation.evidence) ? recommendation.evidence : []).map((item) => "<li>" + escapeHtml(item) + "</li>").join("")}</ul>
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
        const sourceCount = Number(prescriptionEngine?.evidence?.research?.manifest?.tables?.research_library?.record_count || 0);
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
        const training = `
          <label class="field"><span class="f-top"><span class="f-name">Training goal</span><span class="f-help">Sets the disclosed programming objective</span></span><select data-action="training-goal"><option value="" ${!data.settings.trainingGoal ? "selected" : ""}>Not specified (balanced default)</option><option value="strength" ${data.settings.trainingGoal === "strength" ? "selected" : ""}>Strength</option><option value="hypertrophy" ${data.settings.trainingGoal === "hypertrophy" ? "selected" : ""}>Hypertrophy</option><option value="muscular_endurance" ${data.settings.trainingGoal === "muscular_endurance" ? "selected" : ""}>Muscular endurance</option><option value="general_fitness" ${data.settings.trainingGoal === "general_fitness" ? "selected" : ""}>General fitness</option></select></label>
          <label class="field"><span class="f-top"><span class="f-name">Nutrition phase</span><span class="f-help">Context, not a fabricated goal</span></span><select data-action="nutrition-phase"><option value="" ${!data.settings.nutritionPhase ? "selected" : ""}>Not specified</option><option value="deficit" ${data.settings.nutritionPhase === "deficit" ? "selected" : ""}>Energy deficit</option><option value="maintenance" ${data.settings.nutritionPhase === "maintenance" ? "selected" : ""}>Maintenance</option><option value="surplus" ${data.settings.nutritionPhase === "surplus" ? "selected" : ""}>Energy surplus</option><option value="recomposition" ${data.settings.nutritionPhase === "recomposition" ? "selected" : ""}>Body recomposition</option></select></label>
          <label class="field"><span class="f-top"><span class="f-name">Training experience</span></span><select data-action="experience-level"><option value="" ${!data.settings.experienceLevel ? "selected" : ""}>Not specified</option><option value="novice" ${data.settings.experienceLevel === "novice" ? "selected" : ""}>Novice</option><option value="intermediate" ${data.settings.experienceLevel === "intermediate" ? "selected" : ""}>Intermediate</option><option value="advanced" ${data.settings.experienceLevel === "advanced" ? "selected" : ""}>Advanced</option></select></label>
          <label class="field"><span class="f-top"><span class="f-name">Returning after a training gap</span></span><select data-action="returning-after-gap"><option value="" ${data.settings.returningAfterGap == null ? "selected" : ""}>Not specified</option><option value="true" ${data.settings.returningAfterGap === true ? "selected" : ""}>Yes</option><option value="false" ${data.settings.returningAfterGap === false ? "selected" : ""}>No</option></select></label>
          <p class="settings-note">Missing profile values remain disclosed as defaults. Nutrition phase never invents a training goal or changes dose without qualifying recovery or performance evidence.</p>`;
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
          <div class="callout info privacy-boundary"><b>Local by default</b><span>Workout history, templates, mesocycles, settings, readiness and imported personal evidence stay in this browser unless you explicitly export them or enable the workout cloud copy. Public research files ship with the app.</span></div>
          ${renderAlertSetting("cloud-workout-sync-consent", "Optional workout cloud copy", "Default off. When enabled, the app may transmit the full current session—including an active, unsubmitted workout—and every associated exercise and set object. Server copies expire after 90 days, are write-only, and cannot be restored in the app.", cloudEnabled, { stateLabel: cloudEnabled ? "Enabled" : "Local only" })}
          <div class="callout bad cloud-not-backup"><b>Cloud copy is not a backup</b><span>There is no cloud-history or restore endpoint. A downloaded app-data export is the only implemented copy that can be imported to recover these records. ${cloudEnabled ? "Cloud copy is currently enabled, but it still cannot restore this app." : "Cloud copy is currently off."}</span></div>
          <div class="recoverability-list"><div class="m-label"><span>Recoverability</span><span>verified facts</span></div>${renderStoragePersistenceFact()}<div class="row-item"><span class="ri-copy"><b>Recoverable copy</b><span>The app does not record when you last exported. Create and retain a downloaded export yourself.</span></span><span class="ri-val">Export only</span></div></div>
          ${syncMessage ? '<p class="settings-note">' + escapeHtml(syncMessage) + '</p>' : ''}
          <div class="research-basis"><div class="m-label"><span>Research basis</span><span>public database</span></div><div class="row-item"><span class="ri-copy"><b>${sourceCount ? sourceCount + " research source records" : "Public research database"}</b><span>${prescriptionEngine?.evidence?.research?.exerciseDatabase?.length || 0} exercises · ${prescriptionEngine?.evidence?.research?.muscleGroupRecommendations?.length || 0} muscle prescriptions · ${prescriptionEngine?.evidence?.research?.progressionRules?.length || 0} progression rules · ${prescriptionEngine?.evidence?.research?.nutritionStrategies?.length || 0} nutrition strategies</span></span><span class="ri-val">${escapeHtml(prescriptionEvidenceStatus.researchVersion)}</span></div></div>
          <div class="row-item"><span class="ri-copy"><b>Unified prescription evidence · ${escapeHtml(prescriptionEvidenceStatus.state)}</b><span>${escapeHtml(prescriptionEvidenceStatus.message)} Engine ${escapeHtml(prescriptionApi?.ENGINE_VERSION || 'unavailable')} · personal ${escapeHtml(prescriptionEvidenceStatus.personalVersion)} · ${data.recommendationHistory.length} recommendation snapshots · ${data.manualOverrides.length} override events.</span></span></div>
          <label class="import-button">${icon.upload} private personal evidence package<input type="file" accept=".json,application/json" data-action="import-personal-evidence" /></label>
          <p class="settings-note">The imported aggregate evidence package stays in this device's IndexedDB and in exported app backups. Protected source files are never part of the public deployment.</p>
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
            <div class="screen-heading"><div><div class="section-kicker">Settings</div><h1>Training setup.</h1><p>Six groups contain every current app setting, data action and destructive control.</p></div></div>
            ${appDataPersistenceConflict ? '<p class="settings-note persistence-conflict-note" role="status">' + escapeHtml(appDataPersistenceConflict.message) + '</p>' : ""}
            ${settingsMessage ? '<p class="settings-note persistence-status-note" role="status">' + escapeHtml(settingsMessage) + '</p>' : ""}
            ${renderSettingsGroup("Appearance and units", "Display", appearance, { open: true })}
            ${renderSettingsGroup("Training defaults", "Goal and context", training)}
            ${renderSettingsGroup("Rest timer and alerts", pushStatus.label, alerts)}
            ${renderSettingsGroup("Readiness baseline", "Your usual", readiness)}
            ${renderSettingsGroup("Data and backup", "Privacy and recovery", dataAndBackup)}
            <div id="support-guidance" class="settings-support-anchor">
              ${renderSettingsGroup("Danger Zone", "Support and high-risk actions", danger, { className: "danger-zone", open: false })}
            </div>
          </section>
        `;
      }
