"use strict";

const { test, expect } = require("@playwright/test");
const {
  BACKUP_BOUNDARIES,
  IDS,
  entityScopedUniquenessState,
  hostileCases,
  legacyState,
  safetyWorkoutState,
  validFullState
} = require("../fixtures/synthetic-app-backups");

const PRIVATE_EVIDENCE_PATH = /^\/(?:private-personal-data|personal_fitness_data)\//;
const RESEARCH_JSON_PATH = /^(?:\/resources\/[^/]+|\/research_database\/exports\/json\/[^/]+)\.json$/;
const IDENTITY_CATALOG_PATH = "/resources/exercise_database.json";
const IMPORT_VALIDATION_MAP_PATH = "/resources/exercise_muscle_map.json";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.__HOSTILE_BACKUP_EXECUTED__ = 0;
  });
  await page.goto("/");
  await page.waitForLoadState("load");
});

async function installEvidenceFetchAudit(page) {
  await page.addInitScript(() => {
    const nativeSimulation = new URL(globalThis.location.href).searchParams.get("__simulate_native_evidence__") === "1";
    if (nativeSimulation) {
      globalThis.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => "android"
      };
    }
    const nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.__PERSONAL_EVIDENCE_FETCH_AUDIT__ = [];
    globalThis.fetch = (input, init = {}) => {
      const request = typeof Request === "function" && input instanceof Request ? input : null;
      const raw = request?.url || (input instanceof URL ? input.href : String(input));
      const resolved = new URL(raw, globalThis.location.href);
      globalThis.__PERSONAL_EVIDENCE_FETCH_AUDIT__.push({
        href: resolved.href,
        origin: resolved.origin,
        pathname: resolved.pathname,
        credentials: init.credentials || request?.credentials || "",
        cache: init.cache || request?.cache || ""
      });
      return nativeFetch(input, init);
    };
  });
}

async function proxyHostedOriginToSource(page, hostedOrigin, sourceOrigin) {
  await page.route(`${hostedOrigin}/**`, async (route) => {
    const requested = new URL(route.request().url());
    const sourceUrl = new URL(`${requested.pathname}${requested.search}`, sourceOrigin);
    const response = await route.fetch({ url: sourceUrl.href });
    await route.fulfill({ response });
  });
}

async function navigateWithEvidenceFetchAudit(page, url) {
  await page.goto(url);
  await page.waitForLoadState("load");
  await expect.poll(() => page.evaluate(() => Boolean(
    prescriptionEngine?.evidence?.research?.exerciseById?.has("ex_barbell_bench_press")
  )), {
    message: `${url} must initialize the exercise identity catalog`,
    timeout: 30_000
  }).toBe(true);
  return page.evaluate(() => ({
    pageOrigin: globalThis.location.origin,
    identityReady: Boolean(
      prescriptionEngine?.evidence?.research?.exerciseById?.has("ex_barbell_bench_press")
    ),
    fetches: (globalThis.__PERSONAL_EVIDENCE_FETCH_AUDIT__ || []).map((entry) => ({ ...entry }))
  }));
}

async function expectPersonalEvidenceUiAbsent(page) {
  const settingsTrigger = page.locator('[data-action="open-settings"]');
  if (await settingsTrigger.count()) await settingsTrigger.click();
  else await page.goto("/#settings");
  await expect(page).toHaveURL(/#settings$/);
  const group = page.locator("details.settings-group").filter({ has: page.locator("summary", { hasText: "Data and backup" }) });
  if (!(await group.evaluate((element) => element.open))) await group.locator("summary").click();
  await expect(
    group.locator('[data-action="import-personal-evidence"]'),
    "Settings must not expose the deleted private analytical-evidence importer"
  ).toHaveCount(0);
}

test("cold boot loads only the public identity catalog and never probes private or analytical evidence", async ({ page }) => {
  test.setTimeout(90_000);
  const sourceUrl = page.url();
  const sourceOrigin = new URL(sourceUrl).origin;
  const hostedOrigins = ["https://fitness.example", "https://localhost.evil.example"];
  await installEvidenceFetchAudit(page);
  for (const hostedOrigin of hostedOrigins) await proxyHostedOriginToSource(page, hostedOrigin, sourceOrigin);

  const privateFetches = (audit) => audit.fetches.filter((entry) => PRIVATE_EVIDENCE_PATH.test(entry.pathname));
  const researchFetches = (audit) => audit.fetches.filter((entry) => RESEARCH_JSON_PATH.test(entry.pathname));
  const expectIdentityOnlyBoot = (audit, label) => {
    expect.soft(audit.identityReady, `${label} must initialize public identity resolution`).toBe(true);
    expect.soft(privateFetches(audit), `${label} must not probe optional private paths`).toEqual([]);
    expect.soft(researchFetches(audit).map((entry) => entry.pathname), `${label} startup must fetch only the identity catalog`).toEqual([
      IDENTITY_CATALOG_PATH
    ]);
    expect.soft(
      researchFetches(audit).some((entry) => entry.pathname === IMPORT_VALIDATION_MAP_PATH),
      `${label} must defer the legacy snapshot validation map until an import needs it`
    ).toBe(false);
  };
  for (const hostedOrigin of hostedOrigins) {
    const audit = await navigateWithEvidenceFetchAudit(page, `${hostedOrigin}/`);
    expectIdentityOnlyBoot(audit, hostedOrigin);
  }

  const localAudit = await navigateWithEvidenceFetchAudit(page, sourceUrl);
  const nativeAudit = await navigateWithEvidenceFetchAudit(page, `${hostedOrigins[0]}/?__simulate_native_evidence__=1`);
  for (const [label, audit] of [["loopback", localAudit], ["native", nativeAudit]]) {
    expectIdentityOnlyBoot(audit, label);
    expect.soft(
      researchFetches(audit).filter((entry) => entry.origin !== audit.pageOrigin),
      `${label} identity loading must remain on the active app origin`
    ).toEqual([]);
    expect.soft(
      researchFetches(audit).filter((entry) => entry.credentials !== "same-origin"),
      `${label} identity loading must use same-origin credentials`
    ).toEqual([]);
  }
});

test("Settings omits the deleted private analytical-evidence importer", async ({ page }) => {
  await expectPersonalEvidenceUiAbsent(page);
});

async function seedApplicationState(page, state) {
  const seeded = await page.evaluate((model) => {
    data = model;
    entityStructureRevision += 1;
    entityIndexCache = null;
    activeSessionId = model.sessions[0].id;
    activeWorkoutId = model.sessions[0].id;
    viewingHistorySessionId = "";
    completedSummarySessionId = "";
    activeSetId = model.sets[0]?.id || "";
    timer = null;
    activeTab = "workout";
    history.replaceState(history.state, "", "#workout");
    render();
    return {
      activeSessionId,
      activeWorkoutId,
      exerciseCount: data.exercises.length,
      title: data.sessions[0].title
    };
  }, state);
  expect(seeded).toMatchObject({
    activeSessionId: state.sessions[0].id,
    activeWorkoutId: state.sessions[0].id,
    exerciseCount: state.exercises.length,
    title: "Synthetic Safety Workout"
  });
  await expect(page.getByRole("heading", { name: "Synthetic Safety Workout" })).toBeVisible();
}

async function runtimeWorkoutState(page) {
  return page.evaluate(() => ({
    sets: data.sets.map((item) => ({
      id: item.id,
      exerciseId: item.exerciseId,
      completed: item.completed,
      skipped: item.skipped,
      isWarmup: item.isWarmup
    }))
  }));
}

async function dispatchForgedWorkoutAction(page, action, identifiers = {}) {
  const attempt = await page.evaluate(({ requestedAction, ids }) => {
    if (requestedAction === "add-exercise") addExerciseDraft = "Synthetic Forbidden Exercise";
    const control = document.createElement("button");
    control.type = "button";
    control.dataset.action = requestedAction;
    if (ids.exerciseId) control.dataset.exerciseId = ids.exerciseId;
    if (ids.setId) control.dataset.setId = ids.setId;
    let observedAfterDelegatedHandler = 0;
    const observe = (event) => {
      if (event.target === control) observedAfterDelegatedHandler += 1;
    };
    root.addEventListener("click", observe, { once: true });
    root.appendChild(control);
    const dispatched = control.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    control.remove();
    return { dispatched, observedAfterDelegatedHandler };
  }, { requestedAction: action, ids: identifiers });
  expect(attempt.observedAfterDelegatedHandler, `${action} must traverse the delegated Lift click handler before state is asserted`).toBe(1);
  return attempt;
}

async function openBackupSettings(page) {
  if (!(await page.locator(".settings-view").isVisible().catch(() => false))) {
    const settingsTrigger = page.locator('[data-action="open-settings"]');
    if (await settingsTrigger.count()) await settingsTrigger.click();
    else await page.goto("/#settings");
  }
  await expect(page).toHaveURL(/#settings$/);
  const group = page.locator("details.settings-group").filter({ has: page.locator("summary", { hasText: "Data and backup" }) });
  if (!(await group.evaluate((element) => element.open))) await group.locator("summary").click();
  return group;
}

async function armImportLifecycleObserver(page) {
  return page.evaluate(() => {
    const key = `import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.__APP_TEST_IMPORT_LIFECYCLES__ ||= {};
    const initialStatus = document.querySelector("[data-import-status]");
    const state = {
      started: false,
      completed: false,
      initialAttempt: Number(initialStatus?.getAttribute("data-import-attempt") || 0),
      terminalAttempt: 0,
      terminalState: "",
      terminalText: ""
    };
    const inspect = () => {
      const input = document.querySelector('[data-action="import-data"]');
      const group = input?.closest("details.settings-group");
      const status = group?.querySelector("[data-import-status]");
      const text = String(group?.innerText || "");
      const attempt = Number(status?.getAttribute("data-import-attempt") || 0);
      const statusState = String(status?.getAttribute("data-import-state") || "");
      const importing = Boolean(input?.disabled) || /\bimporting\b/i.test(text) || statusState === "importing";
      if (importing || attempt > state.initialAttempt) state.started = true;
      const terminalMarker = attempt > state.initialAttempt && /^(?:accepted|rejected|canceled)$/.test(statusState);
      const terminalControlState = terminalMarker && state.started && input && !input.disabled && !/\bimporting\b/i.test(text);
      if (terminalMarker || terminalControlState) {
        state.completed = true;
        state.terminalAttempt = attempt;
        state.terminalState = statusState;
        state.terminalText = String(status?.textContent || text).trim();
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(inspect);
    state.observer = observer;
    window.__APP_TEST_IMPORT_LIFECYCLES__[key] = state;
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-import-attempt", "data-import-state", "disabled"],
      childList: true,
      subtree: true
    });
    inspect();
    return key;
  });
}

async function waitForImportLifecycle(page, lifecycleKey, name) {
  const lifecycleValue = (field) => page.evaluate(({ key, property }) => (
    window.__APP_TEST_IMPORT_LIFECYCLES__?.[key]?.[property]
  ), { key: lifecycleKey, property: field });
  await expect.poll(() => lifecycleValue("started"), {
    message: `${name} must enter an observable importing or attempt state`,
    timeout: 15_000
  }).toBe(true);
  await expect.poll(() => lifecycleValue("completed"), {
    message: `${name} must return to an enabled, non-Importing terminal state`,
    timeout: 15_000
  }).toBe(true);
  return page.evaluate((key) => {
    const state = window.__APP_TEST_IMPORT_LIFECYCLES__?.[key] || {};
    const result = {
      started: Boolean(state.started),
      completed: Boolean(state.completed),
      initialAttempt: Number(state.initialAttempt || 0),
      terminalAttempt: Number(state.terminalAttempt || 0),
      terminalState: String(state.terminalState || ""),
      terminalText: String(state.terminalText || "")
    };
    delete window.__APP_TEST_IMPORT_LIFECYCLES__?.[key];
    return result;
  }, lifecycleKey);
}

async function importBackup(page, group, value, name = "synthetic-backup.json") {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const input = group.locator('[data-action="import-data"]');
  const lifecycleKey = await armImportLifecycleObserver(page);
  await input.setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(raw, "utf8")
  });
  await expect.poll(() => group.locator("[data-import-status]").getAttribute("data-import-state"), { timeout: 15_000 }).toMatch(/^(?:preview|rejected)$/);
  if (await group.locator("[data-import-status]").getAttribute("data-import-state") === "preview") {
    await group.getByRole("button", { name: "Apply import" }).click();
  }
  const lifecycle = await waitForImportLifecycle(page, lifecycleKey, name);
  await expect(input).toBeEnabled();
  return lifecycle;
}

async function importBackupWithClaimedSize(page, group, value, claimedBytes, name) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const input = group.locator('[data-action="import-data"]');
  const lifecycleKey = await armImportLifecycleObserver(page);
  await input.evaluate((node, fileInit) => {
    const file = new File([fileInit.raw], fileInit.name, { type: "application/json" });
    Object.defineProperty(file, "size", { configurable: true, value: fileInit.claimedBytes });
    const nativeText = file.text.bind(file);
    window.__APP_TEST_SIZED_IMPORT__ = { name: fileInit.name, observedSize: 0, textReads: 0 };
    Object.defineProperty(file, "text", {
      configurable: true,
      value: () => {
        window.__APP_TEST_SIZED_IMPORT__.textReads += 1;
        return nativeText();
      }
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    node.files = transfer.files;
    window.__APP_TEST_SIZED_IMPORT__.observedSize = Number(node.files[0]?.size || 0);
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, { claimedBytes, name, raw });
  await expect.poll(() => group.locator("[data-import-status]").getAttribute("data-import-state"), { timeout: 15_000 }).toMatch(/^(?:preview|rejected)$/);
  if (await group.locator("[data-import-status]").getAttribute("data-import-state") === "preview") {
    await group.getByRole("button", { name: "Apply import" }).click();
  }
  const lifecycle = await waitForImportLifecycle(page, lifecycleKey, name);
  await expect(input).toBeEnabled();
  const instrumentation = await page.evaluate(() => ({ ...window.__APP_TEST_SIZED_IMPORT__ }));
  return { instrumentation, lifecycle };
}

async function exportedBackup(group) {
  if (!(await group.evaluate((element) => element.open))) await group.locator("summary").click();
  await group.locator('[data-action="export-data"]').click();
  return JSON.parse(await group.getByLabel("Exported backup JSON").inputValue());
}

test("pain, illness, and unresolved taxonomy never prevent recording actual work", async ({ page }) => {
  test.setTimeout(90_000);

  await test.step("illness leaves the logger writable", async () => {
    const fixture = safetyWorkoutState({ illness: true, pain: false, affectedMuscle: "" });
    await seedApplicationState(page, fixture.state);
    const before = await runtimeWorkoutState(page);
    await dispatchForgedWorkoutAction(page, "add-set", { exerciseId: fixture.exerciseIds.bench });
    const after = await runtimeWorkoutState(page);
    expect(
      after.sets.filter((item) => item.exerciseId === fixture.exerciseIds.bench),
      "An illness warning must not block a set that the user actually records"
    ).toHaveLength(before.sets.filter((item) => item.exerciseId === fixture.exerciseIds.bench).length + 1);
  });

  await test.step("pain without an affected area leaves the logger writable", async () => {
    const fixture = safetyWorkoutState({ illness: false, pain: true, affectedMuscle: "" });
    await seedApplicationState(page, fixture.state);
    const before = await runtimeWorkoutState(page);
    await dispatchForgedWorkoutAction(page, "add-set", { exerciseId: fixture.exerciseIds.legPress });
    const after = await runtimeWorkoutState(page);
    expect(after.sets.filter((item) => item.exerciseId === fixture.exerciseIds.legPress)).toHaveLength(
      before.sets.filter((item) => item.exerciseId === fixture.exerciseIds.legPress).length + 1
    );
  });

  await test.step("localized pain and unresolved identity still preserve explicit logging choice", async () => {
    const fixture = safetyWorkoutState({ illness: false, pain: true, affectedMuscle: "Chest" });
    await seedApplicationState(page, fixture.state);
    const before = await runtimeWorkoutState(page);
    await dispatchForgedWorkoutAction(page, "add-set", { exerciseId: fixture.exerciseIds.bench });
    await dispatchForgedWorkoutAction(page, "add-set", { exerciseId: fixture.exerciseIds.unknown });
    await dispatchForgedWorkoutAction(page, "add-set", { exerciseId: fixture.exerciseIds.legPress });
    const afterAllowed = await runtimeWorkoutState(page);
    for (const exerciseId of [fixture.exerciseIds.bench, fixture.exerciseIds.unknown, fixture.exerciseIds.legPress]) {
      expect(
        afterAllowed.sets.filter((item) => item.exerciseId === exerciseId),
        `The explicit logging path must remain usable for ${exerciseId}`
      ).toHaveLength(before.sets.filter((item) => item.exerciseId === exerciseId).length + 1);
    }
  });
});

test("an explicit pain resolver action preserves its immutable source record while actual logging remains available", async ({ page }) => {
  const fixture = safetyWorkoutState({ illness: false, pain: false, affectedMuscle: "" });
  await seedApplicationState(page, fixture.state);
  const resolved = await page.evaluate((sessionId) => {
    patchRecovery({ pain: true, affectedMuscle: "Chest" }, false);
    const session = data.sessions.find((item) => item.id === sessionId);
    return {
      recovery: structuredClone(session.recovery),
      action: structuredClone(session.resolvedActions?.[0] || null)
    };
  }, fixture.state.sessions[0].id);
  expect.soft(resolved.recovery).toMatchObject({ illness: false, pain: true, affectedMuscle: "Chest" });
  expect.soft(resolved.action).toMatchObject({
    contractVersion: "comprehensive-fitness-resolved-action/1.0.0",
    outcome: "action",
    category: "pain_or_illness",
    scope: { type: "session" },
    action: { code: "stop_or_skip_work", parameters: { mode: "stop_or_skip" } },
    reasonCodes: ["explicit_pain_or_injury"],
    sourceReferences: [`session:${fixture.state.sessions[0].id}:recovery.pain`],
    handling: "pending"
  });
  const sourceJson = JSON.stringify(resolved.action);
  const before = await runtimeWorkoutState(page);

  await dispatchForgedWorkoutAction(page, "add-set", { exerciseId: fixture.exerciseIds.bench });
  const after = await runtimeWorkoutState(page);
  expect(after.sets.filter((item) => item.exerciseId === fixture.exerciseIds.bench)).toHaveLength(
    before.sets.filter((item) => item.exerciseId === fixture.exerciseIds.bench).length + 1
  );
  const preservedSourceJson = await page.evaluate((decisionId) => {
    const session = data.sessions.find((item) => item.resolvedActions?.some((action) => action.decisionId === decisionId));
    return JSON.stringify(session?.resolvedActions?.find((action) => action.decisionId === decisionId) || null);
  }, resolved.action.decisionId);
  expect.soft(preservedSourceJson, "Logging actual work must not rewrite the recorded resolver decision").toBe(sourceJson);
});

test("every exercise exposes shared defaults plus per-set reps, RPE, types, and rest", async ({ page }) => {
  test.setTimeout(60_000);
  const fixture = safetyWorkoutState({ illness: false, pain: false });
  await seedApplicationState(page, fixture.state);

  const card = page.locator(`.exercise-card:has([data-exercise-id="${fixture.exerciseIds.bench}"])`).first();
  const exerciseDetails = card.locator("details.exercise-details");
  await exerciseDetails.locator(":scope > summary").click();
  await card.getByRole("button", { name: "Add warm-up set to Barbell Bench Press" }).click();
  if (!await exerciseDetails.evaluate((node) => node.open)) await exerciseDetails.locator(":scope > summary").click();
  const collapseCue = await exerciseDetails.locator(":scope > summary").evaluate((summary) => {
    const style = getComputedStyle(summary, "::after");
    return { content: style.content, background: style.backgroundColor };
  });
  expect(collapseCue.content).toContain("⌄");
  expect(collapseCue.background).not.toBe("rgba(0, 0, 0, 0)");
  await expect(card.locator(".guidance-benchmark-strip"), "Deleted program-benchmark presentation must stay absent").toHaveCount(0);
  const editor = card.locator('[data-standard-workload-form]');
  await expect(editor.getByText("Sets, reps, RPE & rest", { exact: true })).toBeVisible();
  await expect(editor.locator('[data-default-field="sets"]')).toBeVisible();
  await expect(editor.locator('[data-default-field="target-rpe-min"]')).toBeVisible();
  await expect(editor.locator('[data-default-field="target-rpe-max"]')).toBeVisible();
  const workingSetInput = editor.locator('[data-default-field="sets"]');
  const initialWorkingSets = await workingSetInput.inputValue();
  await editor.getByRole("button", { name: "Increase Default working set count" }).click();
  await expect(workingSetInput).toHaveValue(String(Number(initialWorkingSets) + 1));
  await editor.getByRole("button", { name: "Decrease Default working set count" }).click();
  await expect(workingSetInput).toHaveValue(initialWorkingSets);
  await editor.locator("[data-individual-set-disclosure] > summary").click();
  await expect.poll(() => editor.locator("[data-individual-set-disclosure]").evaluate((node) => node.open)).toBe(true);
  await expect(editor.locator('[data-set-default-field="type"]')).toHaveCount(20);
  const warmupRow = editor.locator('[data-set-default-row][data-set-scope="warmup"]');
  await expect(warmupRow).toHaveCount(1);
  const compactStepperGeometry = await warmupRow.locator("[data-numeric-stepper]").first().evaluate((stepper) => {
    const input = stepper.querySelector("input");
    const buttons = [...stepper.querySelectorAll("button")];
    return {
      inputWidth: input?.getBoundingClientRect().width || 0,
      buttonWidths: buttons.map((button) => button.getBoundingClientRect().width)
    };
  });
  expect(compactStepperGeometry.inputWidth).toBeGreaterThanOrEqual(52);
  expect(compactStepperGeometry.buttonWidths).toHaveLength(2);
  for (const width of compactStepperGeometry.buttonWidths) expect(width).toBeLessThanOrEqual(36.5);
  await warmupRow.locator('[data-set-default-field="target-rpe-min"]').fill("3.5");
  await warmupRow.locator('[data-set-default-field="target-rpe-max"]').fill("4.5");
  await warmupRow.locator('[data-set-default-field="rest"]').fill("60");

  const straightCard = page.locator(`.exercise-card:has([data-exercise-id="${fixture.exerciseIds.legPress}"])`).first();
  await straightCard.locator("details.exercise-details > summary").click();
  const straightEditor = straightCard.locator('[data-standard-workload-form]');
  await expect.poll(() => straightEditor.locator("[data-individual-set-disclosure]").evaluate((node) => node.open)).toBe(false);
  await expect(straightEditor.locator('[data-default-field="working-rest"]')).toBeVisible();
  await expect(straightEditor.locator('[data-default-field="warmup-rest"]')).toBeVisible();
  await expect(straightEditor.locator('[data-default-field="target-rpe-min"]')).toBeVisible();
  await expect(straightEditor.locator('[data-default-field="target-rpe-max"]')).toBeVisible();

  await editor.locator('[data-default-field="sets"]').fill("5");
  const rows = editor.locator('[data-set-default-row][data-set-scope="working"]:not([hidden])');
  await expect(rows).toHaveCount(5);
  const targets = [
    ["top", "5", "6", "7.5", "8.5", "90"],
    ["top", "5", "6", "8", "9", "150"],
    ["backoff", "8", "10", "7", "8", "120"],
    ["drop", "12", "15", "8.5", "9.5", "45"],
    ["backoff", "8", "10", "7", "8", "120"]
  ];
  for (let index = 0; index < targets.length; index += 1) {
    const row = rows.nth(index);
    await row.locator('[data-set-default-field="type"]').selectOption(targets[index][0]);
    await row.locator('[data-set-default-field="rep-min"]').fill(targets[index][1]);
    await row.locator('[data-set-default-field="rep-max"]').fill(targets[index][2]);
    await row.locator('[data-set-default-field="target-rpe-min"]').fill(targets[index][3]);
    await row.locator('[data-set-default-field="target-rpe-max"]').fill(targets[index][4]);
    await row.locator('[data-set-default-field="rest"]').fill(targets[index][5]);
  }
  await editor.locator('[data-action="apply-standard-workload"]').click();
  await expect.poll(() => page.evaluate((exerciseRuntimeId) => {
    return data.sets.filter((set) => set.exerciseId === exerciseRuntimeId && !set.isWarmup && !set.completed).length;
  }, fixture.exerciseIds.bench), { message: "The individual working-set count must persist through rerender" }).toBe(5);

  const result = await page.evaluate((exerciseRuntimeId) => {
    const exercise = data.exercises.find((item) => item.id === exerciseRuntimeId);
    const warmupSet = data.sets.find((set) => set.exerciseId === exerciseRuntimeId && set.isWarmup);
    const workingSets = data.sets.filter((set) => set.exerciseId === exerciseRuntimeId && !set.isWarmup && !set.completed);
    return {
      setTypes: workingSets.map((set) => set.setType),
      setRanges: workingSets.map((set) => [set.targetRepMin, set.targetRepMax]),
      setRpeRanges: workingSets.map((set) => [set.targetRpeMin, set.targetRpeMax]),
      setRests: workingSets.map((set) => set.targetRestSeconds),
      warmupRpeRange: [warmupSet.targetRpeMin, warmupSet.targetRpeMax],
      warmupRest: warmupSet.targetRestSeconds,
      overrideAction: exercise.manualOverrides.at(-1)?.action
    };
  }, fixture.exerciseIds.bench);
  expect(result.setTypes).toEqual(["top", "top", "backoff", "drop", "backoff"]);
  expect(result.setRanges).toEqual([[5, 6], [5, 6], [8, 10], [12, 15], [8, 10]]);
  expect(result.setRpeRanges).toEqual([[7.5, 8.5], [8, 9], [7, 8], [8.5, 9.5], [7, 8]]);
  expect(result.setRests).toEqual([90, 150, 120, 45, 120]);
  expect(result.warmupRpeRange).toEqual([3.5, 4.5]);
  expect(result.warmupRest).toBe(60);
  expect(result.overrideAction).toBe("exercise_default_targets");
  if (await exerciseDetails.evaluate((node) => node.open)) await exerciseDetails.locator(":scope > summary").click();
  await expect.poll(() => exerciseDetails.evaluate((node) => node.open)).toBe(false);
});

test("an exercise without research or historical guidance still has editable defaults", async ({ page }) => {
  const fixture = safetyWorkoutState({ illness: false, pain: false });
  await seedApplicationState(page, fixture.state);
  const customId = await page.evaluate((sessionId) => {
    const exerciseId = "custom-without-guidance";
    const exercise = {
      id: exerciseId,
      sessionId,
      name: "My Cable Variation",
      order: 99,
      restSeconds: 75,
      resistanceType: "external",
      executionQualityAssessment: "not_assessed"
    };
    const set = {
      ...data.sets[0],
      id: "custom-without-guidance-set",
      exerciseId,
      setNumber: 1,
      sequenceIndex: 0,
      sequence: 0,
      setTypeIndex: 0,
      setType: "straight",
      isWarmup: false,
      reps: 8,
      targetReps: 10,
      targetRepMin: 8,
      targetRepMax: 12,
      targetRestSeconds: 75,
      completed: false,
      skipped: false
    };
    commit({ ...data, exercises: [...data.exercises, exercise], sets: [...data.sets, set] });
    return exerciseId;
  }, fixture.state.sessions[0].id);
  const card = page.locator(`.exercise-card:has([data-exercise-id="${customId}"])`).first();
  await card.locator("details.exercise-details > summary").click();
  const editor = card.locator("[data-standard-workload-form]");
  await expect(editor.locator('[data-default-field="sets"]'), "An unresolved exercise must retain editable set targets").toBeVisible();
  await editor.locator('[data-default-field="sets"]').fill("3");
  await editor.locator('[data-default-field="rep-min"]').fill("10");
  await editor.locator('[data-default-field="rep-max"]').fill("14");
  await editor.locator('[data-default-field="target-rpe-min"]').fill("8");
  await editor.locator('[data-default-field="target-rpe-max"]').fill("9");
  await editor.locator('[data-default-field="working-rest"]').fill("105");
  await editor.locator('[data-action="apply-standard-workload"]').click();
  await expect.poll(() => page.evaluate((exerciseId) => data.sets
    .filter((set) => set.exerciseId === exerciseId && !set.isWarmup)
    .map((set) => [set.targetRepMin, set.targetRepMax, set.targetRpeMin, set.targetRpeMax, set.targetRestSeconds]), customId)).toEqual([[10, 14, 8, 9, 105], [10, 14, 8, 9, 105], [10, 14, 8, 9, 105]]);
});

test("primary navigation exposes a skip target and moves focus into the selected view", async ({ page }) => {
  const skipLink = page.getByRole("link", { name: /skip.*content/i });
  await expect(skipLink).toHaveAttribute("href", "#main-content");
  await skipLink.focus();
  await expect(skipLink).toBeFocused();

  const progress = page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /Progress$/ });
  await progress.click();
  await expect(page.locator(".charts-view")).toBeVisible();
  await expect(page.locator(".progress-switcher, [data-action='set-progress-view']")).toHaveCount(0);
  const focusIsInView = await page.evaluate(() => {
    const active = document.activeElement;
    const main = document.querySelector("#main-content");
    return Boolean(active && main && (active === main || main.contains(active)) && active !== document.body);
  });
  expect(focusIsInView, "Selecting a primary tab must place focus in the new main view").toBe(true);
});

test("one quick-start interaction opens the full-screen logger without a confirmation dialog", async ({ page }) => {
  await page.getByRole("button", { name: "Routines", exact: true }).click();
  await expect(page).toHaveURL(/#routines$/);
  await page.locator('[data-action="new-template"]').click();
  await page.locator('[data-action="close-secondary-context"]').click();
  await expect(page).toHaveURL(/#today$/);

  const quickStart = page.locator('[data-action="start-next-template"]').first();
  await expect(quickStart).toBeVisible();
  await quickStart.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/#workout$/);
  await expect(page.locator(".workout-view")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
});

test("closing a factual Progress chart point restores focus to the originating point", async ({ page }) => {
  await page.evaluate((model) => {
    data = model;
    entityStructureRevision += 1;
    entityIndexCache = null;
    activeSessionId = "";
    activeWorkoutId = "";
    viewingHistorySessionId = "";
    completedSummarySessionId = "";
    activeSetId = "";
    timer = null;
    render();
  }, validFullState());
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: /Progress$/ }).click();
  const origin = page.locator('.chart-card[data-chart-key="performance"] [data-action="show-chart-point"]').first();
  await expect(origin).toBeVisible();
  await origin.focus();
  await origin.press("Enter");
  await expect(page.locator(".chart-detail")).toBeVisible();
  await page.getByRole("button", { name: "Close chart detail" }).click();
  await expect(origin).toBeFocused();
});

test("settings expose notification privacy without a workout-cloud consent path", async ({ page }) => {
  await page.locator('[data-action="open-settings"]').click();
  await expect(page).toHaveURL(/#settings$/);
  const dataGroup = page.locator("details.settings-group").filter({ has: page.locator("summary", { hasText: "Data and backup" }) });
  await dataGroup.locator("summary").click();
  await expect(page.locator('[data-action="cloud-workout-sync-consent"]')).toHaveCount(0);
  await expect(dataGroup).toContainText("Workout data stays local");
  await expect(dataGroup).toContainText("The app does not upload workout history");
  const alertsGroup = page.locator("details.settings-group").filter({ has: page.locator("summary", { hasText: "Rest timer and alerts" }) });
  await alertsGroup.locator("summary").click();
  await expect(alertsGroup).toContainText("Private changes the visible notification body only");
});

test("a complete synthetic backup round-trips relationships and approved current settings", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, validFullState());
  const exported = await exportedBackup(group);

  expect(exported.sessions.map((item) => item.id)).toContain(IDS.session);
  expect(exported.exercises.find((item) => item.id === IDS.exercise)?.sessionId).toBe(IDS.session);
  expect(exported.sets.find((item) => item.id === IDS.set)?.exerciseId).toBe(IDS.exercise);
  expect(exported.templates.find((item) => item.id === IDS.template)?.exercises[0].id).toBe(IDS.templateExercise);
  expect(exported.settings).not.toHaveProperty("colorPackage");
  expect(exported.settings).not.toHaveProperty("theme");
  for (const obsolete of [
    "cloudWorkoutSyncConsent",
    "workoutCloudSync",
    "workoutCloudSyncConsentVersion",
    "trainingGoal",
    "trainingGoalSource",
    "trainingGoalDisclosure",
    "nutritionPhase",
    "experienceLevel",
    "returningAfterGap"
  ]) {
    expect(exported.settings[obsolete], `${obsolete} is legacy planning state and must not re-enter a current backup`).toBeUndefined();
  }
});

test("complete export restores the independent active draft and timer after local clearing", async ({ page }) => {
  test.setTimeout(120_000);
  await page.evaluate(async () => {
    const session = {
      id: "public-draft-session",
      title: "Public Draft Resume",
      date: todayIso(),
      workoutStarted: true,
      workoutState: "active",
      submitted: false,
      createdAt: isoNow(),
      updatedAt: isoNow()
    };
    const exercise = {
      id: "public-draft-exercise",
      sessionId: session.id,
      name: "Barbell Bench Press",
      order: 0,
      resistanceType: "external",
      isBodyweight: false,
      notes: "draft note"
    };
    const set = {
      id: "public-draft-set",
      exerciseId: exercise.id,
      setNumber: 1,
      sequenceIndex: 0,
      reps: 5,
      weight: 100,
      weightUnit: "lb",
      rpe: 8,
      completed: true,
      setType: "straight"
    };
    data = normalizeLoadedData({ ...emptyData(), sessions: [session], exercises: [exercise], sets: [set] });
    data.dataRevision = 9;
    activeWorkoutId = session.id;
    activeSessionId = session.id;
    timer = {
      id: "public-draft-timer",
      version: 1,
      workoutId: session.id,
      exerciseId: exercise.id,
      setId: set.id,
      pendingNextSetId: "",
      durationSeconds: 120,
      remainingSeconds: 75,
      endsAt: Date.now() + 75_000,
      isActive: true,
      isPaused: false,
      isOvertime: false,
      overtimeSeconds: 0,
      notificationStatus: "disabled",
      serverNotificationId: "",
      backgroundedAt: 0
    };
    entityStructureRevision += 1;
    entityIndexCache = null;
    await writeIndexedValuesAtomically([
      { key: "app-data", value: data },
      { key: "active-workout-draft", value: activeWorkoutDraftSnapshot({ incrementSequence: false }) }
    ]);
    setActiveTab("settings", { force: true });
  });
  const group = await openBackupSettings(page);
  await group.locator('[data-action="export-data"]').click();
  const exported = JSON.parse(await group.getByLabel("Exported backup JSON").inputValue());
  expect(exported.activeWorkoutDraft).toMatchObject({
    contractVersion: "comprehensive-fitness-active-draft/2.0.0",
    workoutId: "public-draft-session",
    timer: { id: "public-draft-timer", remainingSeconds: 75 }
  });

  await page.evaluate(async () => {
    data = emptyData();
    const clearedSession = createSession();
    data.sessions = [clearedSession];
    data.dataRevision = 10;
    activeWorkoutId = "";
    activeSessionId = clearedSession.id;
    timer = null;
    await writeIndexedValuesAtomically([
      { key: "app-data", value: data },
      { key: "active-workout-draft", value: null }
    ]);
    localStorage.removeItem(ACTIVE_DRAFT_KEY);
    entityStructureRevision += 1;
    entityIndexCache = null;
    render();
  });
  const lifecycle = await importBackup(page, group, exported, "public-active-draft-round-trip.json");
  expect(lifecycle.terminalState).toBe("accepted");
  await expect.poll(() => page.evaluate(() => ({
    activeWorkoutId,
    activeSessionId,
    timerId: timer?.id || "",
    remainingSeconds: timer?.remainingSeconds || 0
  }))).toMatchObject({
    activeWorkoutId: "public-draft-session",
    activeSessionId: "public-draft-session",
    timerId: "public-draft-timer"
  });
  await expect.poll(() => page.evaluate(async () => (await readIndexedValue("active-workout-draft"))?.timer?.id || "")).toBe("public-draft-timer");
});

test("applying a backup without a draft clears stale independent draft recovery", async ({ page }) => {
  const group = await openBackupSettings(page);
  await page.evaluate(async () => {
    const stale = {
      contractVersion: "comprehensive-fitness-active-draft/2.0.0",
      version: 2,
      workoutId: "stale-workout",
      savedAt: isoNow(),
      dataRevision: 1,
      draftSequence: 1,
      session: { id: "stale-workout", title: "Stale", workoutStarted: true, workoutState: "active", submitted: false },
      exercises: [{ id: "stale-exercise", sessionId: "stale-workout", name: "Stale Exercise", order: 0 }],
      sets: [{ id: "stale-set", exerciseId: "stale-exercise", setNumber: 1, reps: 1, weight: 1, rpe: 1 }],
      timer: null,
      resolvedActions: []
    };
    await writeIndexedValue("active-workout-draft", stale);
    localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(stale));
  });
  const lifecycle = await importBackup(page, group, validFullState(), "public-no-draft-replacement.json");
  expect(lifecycle.terminalState).toBe("accepted");
  await expect.poll(() => page.evaluate(async () => ({
    indexed: await readIndexedValue("active-workout-draft"),
    local: localStorage.getItem(ACTIVE_DRAFT_KEY)
  }))).toEqual({ indexed: null, local: null });
});

test("backup import publishes an attempt-scoped accessible terminal status", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, validFullState(), "synthetic-status-contract.json");
  const status = group.locator('[data-import-status]');
  const marker = await status.evaluateAll((nodes) => nodes[0] ? ({
    role: nodes[0].getAttribute("role"),
    state: nodes[0].getAttribute("data-import-state"),
    attempt: Number(nodes[0].getAttribute("data-import-attempt") || 0)
  }) : null);
  expect.soft(marker, "Import results need a dedicated product status marker").not.toBeNull();
  expect.soft(marker?.role || "").toBe("status");
  expect.soft(marker?.state || "").toBe("accepted");
  expect.soft(Number(marker?.attempt || 0), "Each terminal import result needs a monotonically increasing attempt marker").toBeGreaterThan(0);
});

test("a supported legacy backup discards obsolete planning settings without changing relationships", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, legacyState(), "synthetic-legacy-backup.json");
  const exported = await exportedBackup(group);

  expect(exported.exercises.find((item) => item.id === IDS.exercise)?.sessionId).toBe(IDS.session);
  expect(exported.sets.find((item) => item.id === IDS.set)?.exerciseId).toBe(IDS.exercise);
  for (const obsolete of [
    "trainingGoal",
    "trainingGoalSource",
    "trainingGoalDisclosure",
    "nutritionPhase",
    "experienceLevel",
    "returningAfterGap",
    "goal",
    "trainingStatus"
  ]) {
    expect.soft(exported.settings[obsolete], `${obsolete} must be accepted for migration but omitted from active/current exports`).toBeUndefined();
  }
});

test("backup uniqueness is entity-scoped rather than globally conflating typed IDs", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, entityScopedUniquenessState(), "synthetic-entity-scoped-ids.json");
  const exported = await exportedBackup(group);
  expect(exported.exercises.some((item) => item.id === IDS.exercise)).toBe(true);
  expect(exported.templates[0].exercises.some((item) => item.id === IDS.exercise)).toBe(true);
});

test("backup file-size enforcement accepts the exact boundary and rejects overflow before reading", async ({ page }) => {
  test.setTimeout(60_000);
  const group = await openBackupSettings(page);
  const boundary = validFullState();
  boundary.sessions[0].title = "Synthetic file size at boundary";
  const accepted = await importBackupWithClaimedSize(page, group, boundary, BACKUP_BOUNDARIES.fileBytes, "file-size-at-boundary.json");
  expect.soft(accepted.instrumentation.observedSize).toBe(BACKUP_BOUNDARIES.fileBytes);
  expect.soft(accepted.instrumentation.textReads, "An at-boundary file must be read exactly once").toBe(1);
  expect.soft((await exportedBackup(group)).sessions.some((item) => item.title === boundary.sessions[0].title)).toBe(true);

  await importBackup(page, group, validFullState(), "baseline-file-size-overflow.json");
  const overflow = validFullState();
  overflow.sessions[0].title = "Synthetic file size over boundary";
  const rejected = await importBackupWithClaimedSize(page, group, overflow, BACKUP_BOUNDARIES.fileBytes + 1, "file-size-over-boundary.json");
  const exported = await exportedBackup(group);
  expect.soft(rejected.instrumentation.observedSize).toBe(BACKUP_BOUNDARIES.fileBytes + 1);
  expect.soft(rejected.instrumentation.textReads, "An oversized file must be rejected before file.text() is called").toBe(0);
  expect.soft(exported.sessions.some((item) => item.id === IDS.session && item.title === "Synthetic Round Trip"), "Oversized input must preserve the baseline").toBe(true);
  expect.soft(exported.sessions.some((item) => item.title === overflow.sessions[0].title), "Oversized input must not enter state").toBe(false);
});

test("bounded backup validation rejects duplicate IDs, malformed versions, orphans, executable keys, and prototype keys", async ({ page }) => {
  test.setTimeout(120_000);
  const group = await openBackupSettings(page);
  const baseline = validFullState();

  for (const hostile of hostileCases().filter((item) => item.name !== "orphan-active-mesocycle")) {
    await test.step(hostile.name, async () => {
      await importBackup(page, group, baseline, `baseline-${hostile.name}.json`);
      const payload = hostile.raw || JSON.stringify(hostile.value);
      await importBackup(page, group, payload, `${hostile.name}.json`);
      const exported = await exportedBackup(group);
      expect.soft(
        exported.sessions.some((item) => item.id === IDS.session && item.title === "Synthetic Round Trip"),
        `${hostile.name} must not replace the validated baseline`
      ).toBe(true);
      expect.soft(exported.sessions.length, `${hostile.name} must not change the session count`).toBe(baseline.sessions.length);
      expect.soft(exported.exercises.length, `${hostile.name} must not change the exercise count`).toBe(baseline.exercises.length);
      expect.soft(exported.sets.length, `${hostile.name} must not change the set count`).toBe(baseline.sets.length);
      expect.soft(exported.templates.length, `${hostile.name} must not change the template count`).toBe(baseline.templates.length);
      if (hostile.name === "prototype-key") {
        expect.soft(Object.prototype.hasOwnProperty.call(exported, "__proto__"), "Prototype keys must not survive import").toBe(false);
        expect.soft(Object.prototype.hasOwnProperty.call(exported, "constructor"), "Constructor keys must not survive import").toBe(false);
      }
      expect.soft(await page.evaluate(() => Object.prototype.polluted), `${hostile.name} must not pollute object prototypes`).toBeUndefined();
      expect.soft(await page.evaluate(() => window.__HOSTILE_BACKUP_EXECUTED__), `${hostile.name} must not execute imported fields`).toBe(0);
    });
  }
});

test("backup migration removes the obsolete active mesocycle pointer without discarding workout records", async ({ page }) => {
  const group = await openBackupSettings(page);
  const obsolete = hostileCases().find((item) => item.name === "orphan-active-mesocycle")?.value;
  expect(obsolete).toBeTruthy();
  await importBackup(page, group, obsolete, "obsolete-active-mesocycle.json");
  const exported = await exportedBackup(group);
  expect(exported.sessions.some((item) => item.id === IDS.session && item.title === "Orphan Active Mesocycle Attempt")).toBe(true);
  expect(exported.sessions).toHaveLength(obsolete.sessions.length);
  expect(exported.exercises).toHaveLength(obsolete.exercises.length);
  expect(exported.sets).toHaveLength(obsolete.sets.length);
  expect(exported.activeMesocycleId, "The deleted planning pointer must not survive migration").toBeUndefined();
});

test("hostile backup IDs and executable-looking fields are rejected before DOM rendering", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, validFullState(), "baseline-hostile-id.json");

  const safeSessionId = "11111111-1111-4111-8111-111111111111";
  const hostileExerciseId = 'evil" autofocus onfocus="window.__HOSTILE_BACKUP_EXECUTED__=1';
  const backup = {
    appDataVersion: 2,
    sessions: [{
      id: safeSessionId,
      date: "2026-07-12",
      title: "Hostile Backup",
      submitted: false,
      workoutStarted: true,
      workoutState: "active",
      recovery: {}
    }],
    exercises: [{
      id: hostileExerciseId,
      sessionId: safeSessionId,
      name: "Synthetic Exercise",
      order: 0,
      resistanceType: "external",
      onfocus: "window.__HOSTILE_BACKUP_EXECUTED__=1"
    }],
    sets: [{
      id: "33333333-3333-4333-8333-333333333333",
      exerciseId: hostileExerciseId,
      setNumber: 1,
      reps: 8,
      weight: 50,
      completed: false,
      onclick: "window.__HOSTILE_BACKUP_EXECUTED__=1"
    }],
    templates: [],
    settings: {}
  };

  await importBackup(page, group, backup, "synthetic-hostile-backup.json");
  const exported = await exportedBackup(group);

  expect.soft(exported.sessions.some((item) => item.id === IDS.session && item.title === "Synthetic Round Trip"), "The invalid backup must not replace local state").toBe(true);
  expect.soft(exported.sessions.some((item) => item.title === "Hostile Backup"), "The hostile backup must not enter persisted state").toBe(false);
  expect.soft(await page.locator("[onerror], [onload], [onclick], [onfocus], [onpointerenter]").count(), "Imported data must never create executable DOM attributes").toBe(0);
  expect.soft(await page.evaluate(() => window.__HOSTILE_BACKUP_EXECUTED__), "No imported field may execute").toBe(0);
});
