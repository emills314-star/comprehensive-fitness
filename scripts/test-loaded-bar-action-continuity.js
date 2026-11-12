"use strict";

const assert = require("node:assert/strict");
const { runtime, factualModel, start, activeRows } = require("./test-loaded-bar-table");

function fixture(action, options = {}) {
  const app = runtime();
  start(app, factualModel(app));
  app.run("activeTab='workout'");
  const row = activeRows(app)[0];
  const queued = [];
  const nodes = [];
  let renders = 0;
  let buttonClicks = 0;
  let blurs = 0;
  class Element {
    constructor(tagName, dataset, value = "") {
      this.tagName = tagName;
      this.dataset = { ...dataset };
      this.value = value;
      this.disabled = false;
      this.visible = true;
      this.inert = false;
      this.tabIndex = 0;
      this.isConnected = true;
      this.classList = { add() {}, remove() {}, contains() { return false; } };
    }
    matches(selector) {
      if (selector === ":disabled") return this.disabled;
      if (selector.includes(".workout-view")) return this.tagName === "INPUT";
      return ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"].includes(this.tagName);
    }
    closest(selector) {
      if (selector.includes("[inert]")) return this.inert ? this : null;
      if (selector === "[data-action]") return this.dataset.action ? this : null;
      if (selector === "button") return this.tagName === "BUTTON" ? this : null;
      if (selector.startsWith("button, select")) return ["BUTTON", "SELECT", "SUMMARY"].includes(this.tagName) ? this : null;
      return null;
    }
    hasAttribute(name) { return name === "disabled" && this.disabled; }
    getAttribute(name) { return name === "aria-disabled" && this.disabled ? "true" : null; }
    getClientRects() { return this.visible ? [{}] : []; }
    querySelector() { return null; }
    focus() { app.context.document.activeElement = this; }
    blur() {
      blurs += 1;
      app.context.document.activeElement = null;
      app.events.get("focusout")({ target: this, relatedTarget: null });
    }
    click() {
      buttonClicks += 1;
      return app.events.get("click")({ target: this, isTrusted: false, preventDefault() {} });
    }
  }
  const input = new Element("INPUT", { action: options.inputAction || "set-rpe", setId: row.id }, "7.5");
  const buttonData = { action, ...(options.setId === false ? {} : { setId: row.id }) };
  let button = new Element(options.tagName || "BUTTON", buttonData);
  const replace = () => {
    renders += 1;
    button.isConnected = false;
    button = new Element(options.tagName || "BUTTON", buttonData);
    button.visible = !options.hideReplacement;
    button.disabled = Boolean(options.disableReplacement);
    button.inert = Boolean(options.inertReplacement);
    nodes.splice(0, nodes.length, button);
  };
  nodes.push(input, button);
  app.context.HTMLElement = Element;
  app.context.SVGElement = Element;
  app.context.testNodes = nodes;
  app.context.testReplaceDom = replace;
  app.context.getComputedStyle = () => ({ display: "block", visibility: "visible" });
  app.context.setTimeout = (callback, delay) => { if (delay === 0) queued.push(callback); return queued.length + 1; };
  app.run("root.querySelectorAll=()=>testNodes;render=()=>testReplaceDom()");
  app.context.document.activeElement = input;
  if (action === "close-set-sheet") app.run(`loadedBarSheet={setId:${JSON.stringify(row.id)},mode:'rpe'}`);
  const pointer = { target: button, pointerId: 1, button: options.pointerButton ?? 0, clientX: 100, clientY: 100, prevented: false,
    preventDefault() { this.prevented = true; } };
  const originalClick = () => app.events.get("click")({ target: button, pointerId: 1, detail: 1, isTrusted: true, preventDefault() {} });
  return { app, row, pointer, originalClick, input, get button() { return button; },
    flush() { while (queued.length) queued.shift()(); },
    counts: () => ({ renders, buttonClicks, blurs }),
    pointerdown() { app.events.get("pointerdown")(pointer); },
    release({ target = button, clientX = 100, clientY = 100 } = {}) {
      app.run("releaseNumericEntryPointer")({ target, pointerId: 1, clientX, clientY, preventDefault() {} });
    },
    move(clientX, clientY) { app.run("moveNumericEntryPointer")({ pointerId: 1, clientX, clientY }); },
    cancel() { app.run("cancelNumericEntryPointer")({ pointerId: 1 }); }
  };
}

async function main() {
  for (const action of ["request-submit-workout", "close-set-sheet", "set-type-sheet"]) {
    const inputAction = action === "request-submit-workout" ? "set-weight" : "set-rpe";
    const run = fixture(action, { setId: action !== "request-submit-workout", inputAction });
    run.pointerdown();
    assert.equal(run.pointer.prevented, true, action);
    assert.equal(run.counts().blurs, 1, action);
    assert.equal(run.counts().buttonClicks, 0, action);
    run.flush();
    assert.equal(run.counts().buttonClicks, 0, action + " must wait for pointer release");
    run.release();
    assert.equal(run.counts().buttonClicks, 1, action);
    const field = inputAction === "set-weight" ? "weight" : "rpe";
    assert.equal(run.app.get().sets.find((row) => row.id === run.row.id)[field], 7.5, action);
    if (action === "request-submit-workout") assert.equal(run.app.run("pendingSubmitSessionId"), run.app.run("activeWorkoutId"));
    if (action === "close-set-sheet") assert.equal(run.app.run("loadedBarSheet"), null);
    if (action === "set-type-sheet") {
      assert.equal(run.app.run("loadedBarSheet.mode"), "type");
      assert.equal(run.app.run("dialogFocusOrigins.loadedBar.action"), "set-type-sheet");
    }
    await run.originalClick();
    assert.equal(run.counts().buttonClicks, 1, action + " must not replay the original pointer click");
  }

  // A completion must happen once if a native click arrives before the synthetic
  // click during release focus or afterward in the normal pointer sequence.
  for (const originalFirst of [false, true]) {
    const run = fixture("toggle-set");
    run.pointerdown();
    run.flush();
    assert.equal(run.app.get().sets.find((row) => row.id === run.row.id).completed, false);
    if (originalFirst) {
      run.button.focus = () => { run.app.context.document.activeElement = run.button; run.originalClick(); };
    }
    run.release();
    if (!originalFirst) await run.originalClick();
    assert.equal(run.app.get().sets.find((row) => row.id === run.row.id).completed, true);
    assert.equal(run.counts().buttonClicks, 1);
  }

  for (const option of ["hideReplacement", "disableReplacement", "inertReplacement"]) {
    const run = fixture("request-submit-workout", { [option]: true });
    run.pointerdown();
    run.flush();
    run.release();
    assert.equal(run.counts().buttonClicks, 0, option);
    assert.equal(run.app.run("pendingSubmitSessionId"), "", option);
  }

  for (const gesture of ["cancel", "drag-away", "move-away-and-back"]) {
    const run = fixture("toggle-set");
    run.pointerdown();
    run.flush();
    if (gesture === "cancel") run.cancel();
    if (gesture === "move-away-and-back") run.move(140, 100);
    run.release(gesture === "drag-away" ? { target: { closest: () => null } } : {});
    run.flush();
    // Canceled/dragged releases must not become a native button activation.
    if (gesture !== "cancel") await run.originalClick();
    assert.equal(run.counts().buttonClicks, 0, gesture);
    assert.equal(run.app.get().sets.find((row) => row.id === run.row.id).completed, false, gesture);
  }

  const keyboard = fixture("request-submit-workout", { setId: false });
  keyboard.pointerdown();
  keyboard.flush();
  await keyboard.app.events.get("click")({ target: keyboard.button, pointerId: -1, detail: 0, isTrusted: true, preventDefault() {} });
  assert.equal(keyboard.app.run("pendingSubmitSessionId"), keyboard.app.run("activeWorkoutId"));
  keyboard.cancel();

  for (const options of [{ tagName: "SELECT" }, { tagName: "INPUT" }, { pointerButton: 2 }]) {
    const run = fixture("set-type-sheet", options);
    run.pointerdown();
    run.flush();
    assert.equal(run.pointer.prevented, false);
    assert.equal(run.counts().blurs, 0);
    assert.equal(run.counts().buttonClicks, 0);
  }

  const unavailable = fixture("unregistered-action");
  unavailable.pointerdown();
  unavailable.flush();
  assert.equal(unavailable.pointer.prevented, false);
  assert.equal(unavailable.counts().blurs, 0);
  console.log("Loaded Bar numeric-entry action continuity passed (release-only Finish/Done/type, canceled gestures, one completion, and native/visibility guards).");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
