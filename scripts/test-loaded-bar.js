const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const loadedBar = require("../loaded-bar.js");
const {
  EQUIPMENT_CLASSES, DEFAULT_BAR_WEIGHT, DEFAULT_PLATES, CLASS_NAMES,
  deriveEquipmentClass, loadBarbell, plateChange, perSideText, formatLoad,
  dumbbellLabel, renderDefs, renderEquipment
} = loadedBar;

function testConstantsAndDerivation() {
  assert.deepEqual(EQUIPMENT_CLASSES, ["barbell", "dumbbell", "stack", "plate_loaded", "bodyweight", "generic"]);
  assert.deepEqual(DEFAULT_BAR_WEIGHT, { lb: 45, kg: 20 });
  assert.deepEqual(DEFAULT_PLATES, { lb: [45, 35, 25, 10, 5, 2.5], kg: [25, 20, 15, 10, 5, 2.5, 1.25] });
  for (const value of [loadedBar, EQUIPMENT_CLASSES, DEFAULT_BAR_WEIGHT, DEFAULT_PLATES,
    DEFAULT_PLATES.lb, DEFAULT_PLATES.kg, CLASS_NAMES]) assert.equal(Object.isFrozen(value), true);
  assert.equal(new Set(CLASS_NAMES).size, CLASS_NAMES.length);

  function derived(input, equipmentClass, source) {
    assert.deepEqual(deriveEquipmentClass(input), { equipmentClass, source, correctable: source !== "saved" });
  }
  for (const savedClass of EQUIPMENT_CLASSES) {
    derived({ savedClass, exerciseName: "Press (Dumbbell)", catalogEquipment: "barbell" }, savedClass, "saved");
  }
  const suffixes = {
    Barbell: "barbell", "Smith Machine": "barbell", Dumbbell: "dumbbell",
    Cable: "stack", Machine: "stack", Bodyweight: "bodyweight", Assisted: "bodyweight"
  };
  for (const [suffix, equipmentClass] of Object.entries(suffixes)) {
    derived({ exerciseName: `Lift (Earlier group) (  ${suffix.toUpperCase()}  )  `, catalogEquipment: "unknown" }, equipmentClass, "name_suffix");
  }
  derived({ savedClass: "unknown", exerciseName: "Press (narrow grip) ( sMiTh   mAcHiNe )", catalogEquipment: "dumbbell" }, "barbell", "name_suffix");
  derived({ exerciseName: "Lift (Barbell) (Other)", catalogEquipment: "cable" }, "stack", "catalog");
  derived({ exerciseName: "Lift (Barbell) (Other)" }, "generic", "default");
  const catalogs = {
    "barbell, Olympic": "barbell", " DUMBBELLS ": "dumbbell", "cable pulley": "stack",
    machine: "stack", "bodyweight exercise": "bodyweight"
  };
  for (const [catalogEquipment, equipmentClass] of Object.entries(catalogs)) {
    derived({ exerciseName: "Lift (Unknown)", catalogEquipment }, equipmentClass, "catalog");
  }
  assert.equal(deriveEquipmentClass({ catalogEquipment: "machine" }).correctable, true, "Machine inference remains correctable to plate_loaded");
  for (const catalogEquipment of ["barbell / dumbbell", "dumbbell and cable", "cable or machine", "bodyweight with dumbbells", "machine / barbell"]) {
    assert.equal(deriveEquipmentClass({ catalogEquipment }).equipmentClass, "generic", `Ambiguous catalog value: ${catalogEquipment}`);
  }
  for (const catalogEquipment of ["unknown", "machines", "kettlebell", "", null, 12, {}]) {
    derived({ catalogEquipment }, "generic", "default");
  }
  for (const input of [undefined, null, false, 13, "barbell", [], Symbol("odd"), Object.create(null),
    { savedClass: {}, exerciseName: {}, catalogEquipment: [] }]) {
    derived(input, "generic", "default");
  }
}

function testBarbellLoading() {
  function exact(target, perSide, options = {}) {
    const result = loadBarbell({ target, ...options });
    assert.deepEqual(result, {
      target, unit: options.unit || "lb", barWeight: options.barWeight === undefined ? (options.unit === "kg" ? 20 : 45) : options.barWeight,
      perSide, loaded: target, exact: true, note: null
    });
    return result;
  }
  exact(135, [45]);
  exact(185, [45, 25]);
  exact(180, [45, 10, 10, 2.5]);
  exact(45, []);
  exact(100, [25, 15], { unit: "kg" });
  exact(102.5, [25, 15, 1.25], { unit: "kg" });
  exact(22.5, [1.25], { unit: "kg" });
  exact(20, [], { unit: "kg" });
  exact(145, [25, 25], { plates: [45, 25, 10] });
  exact(69, [6, 6], { plates: [9, 6] });
  exact(61, [4, 4], { plates: [6, 4, 1] });
  exact(185, [45, 25], { plates: [25, 45, 35, 25, 0, -5, NaN, "10"] });
  exact(0.6, [0.2, 0.1], { barWeight: 0, plates: [0.1, 0.2] });
  assert.deepEqual(loadBarbell({ target: 182.5 }), {
    target: 182.5, unit: "lb", barWeight: 45, perSide: [45, 10, 10, 2.5],
    loaded: 180, exact: false, note: "can't load 182.5 exactly"
  });
  assert.deepEqual(loadBarbell({ target: 71, plates: [8, 6] }).perSide, [6, 6], "Nearest lower search must also beat greedy's 8");
  assert.equal(loadBarbell({ target: 71, plates: [8, 6] }).loaded, 69);
  assert.deepEqual(loadBarbell({ target: 40 }), {
    target: 40, unit: "lb", barWeight: 45, perSide: [], loaded: 45, exact: false, note: "lighter than the bar"
  });
  assert.equal(loadBarbell({ target: 45.01 }).loaded, 45, "A half-hundredth per side must never round the load upward");
  assert.equal(loadBarbell({ target: 45.01 }).exact, false);
  assert.deepEqual(loadBarbell({ target: 135, plates: [] }).perSide, []);
  assert.equal(loadBarbell({ target: 135, plates: [] }).loaded, 45);
  assert.equal(loadBarbell({ target: 135, barWeight: NaN }).barWeight, 45);
  const floatingTarget = 0.1 + 0.2;
  const floating = loadBarbell({ target: floatingTarget, barWeight: 0.1, plates: [0.1] });
  assert.equal(floating.target, floatingTarget, "Input target is retained even when integer hundredths absorb binary arithmetic noise");
  assert.deepEqual(floating.perSide, [0.1]);
  assert.equal(floating.loaded, 0.3);
  assert.equal(floating.exact, true);
  const subcent = loadBarbell({ target: 0.001, barWeight: 0 });
  assert.equal(subcent.target, 0.001);
  assert.equal(subcent.loaded, 0);
  assert.equal(subcent.exact, false, "Sub-hundredth targets must not become exact zero loads");
  const tiny = loadBarbell({ target: 1e-17, barWeight: 0 });
  assert.equal(tiny.target, 1e-17);
  assert.equal(tiny.loaded, 0);
  assert.equal(tiny.exact, false, "Relative floating tolerance must not erase a tiny positive target");
  assert.equal(tiny.note, "can't load 0.00000000000000001 exactly");
  const belowGrid = loadBarbell({ target: 179.999 });
  assert.equal(belowGrid.target, 179.999);
  assert.equal(belowGrid.loaded, 175, "Rounding a target must not load more than the requested weight");
  assert.deepEqual(belowGrid.perSide, [45, 10, 10]);
  assert.equal(belowGrid.exact, false);
  assert.equal(belowGrid.note, "can't load 179.999 exactly");
  exact(2e300, [1e300], { barWeight: 0, plates: [1e300] });
  assert.equal(loadBarbell({ target: 1e20 }).tooHeavyToDraw, true, "Oversized decoration falls back without throwing or inventing a load");
  assert.deepEqual(loadBarbell({ target: 135, unit: "stone" }), loadBarbell({ target: 135 }), "Unknown units default to lb");
  for (const target of [undefined, null, 0, -1, NaN, Infinity, -Infinity, "185", {}, Symbol("odd")]) assert.equal(loadBarbell({ target }), null);
  assert.equal(loadBarbell(null), null);
  assert.equal(loadBarbell(), null);
}

function testBoundedDecorativeWork() {
  for (const target of [1e12, 1e20, Number.MAX_VALUE]) {
    const input = Object.freeze({ target, unit: "lb", equipmentClass: "barbell" });
    assert.deepEqual(loadBarbell(input), { target, unit: "lb", barWeight: 45, perSide: [], loaded: null,
      exact: false, note: "too heavy to draw", tooHeavyToDraw: true });
    for (const equipmentClass of ["barbell", "plate_loaded"]) {
      const markup = renderEquipment({ ...input, equipmentClass });
      const nodes = parseSvg(markup);
      assert.match(nodes[0].attributes["aria-label"], /too heavy to draw/);
      const numericLabel = nodes.find((node) => node.text === formatLoad(target) + " lb");
      assert.ok(numericLabel, "Numeric fallback retains the original value");
      assert.equal(numericLabel.attributes.textLength, "50", "Long numeric labels stay inside the block");
      assert.equal(numericLabel.attributes.lengthAdjust, "spacingAndGlyphs");
      assert.equal(nodes.filter((node) => hasClass(node, "pl")).length, 0);
      assert.ok(nodes.some((node) => hasClass(node, "eq-block")), "Oversized bar draws the generic block");
    }
    assert.equal(input.target, target, "Decorative fallback cannot clamp the observation");
  }
  const boundary = loadBarbell({ target: 2745, plates: [45] });
  assert.equal(boundary.perSide.length, 30);
  assert.equal(boundary.exact, true);
  const justAbove = loadBarbell({ target: 2747.5, plates: [45] });
  assert.equal(justAbove.perSide.length, 30, "A proven nearest lower load with 30 plates stays drawable");
  assert.equal(justAbove.loaded, 2745);
  assert.equal(justAbove.exact, false);
  assert.equal(loadBarbell({ target: 2835, plates: [45] }).tooHeavyToDraw, true, "A required 31st plate uses fallback");
  assert.equal(loadBarbell({ target: 2750 }).tooHeavyToDraw, true, "A small extra plate cannot exceed the total count budget");
  assert.equal(loadBarbell({ target: 0.6, barWeight: 0, plates: [0.01] }).perSide.length, 30);
  assert.equal(loadBarbell({ target: 0.62, barWeight: 0, plates: [0.01] }).tooHeavyToDraw, true, "Fractional denominations share the count cap");
  const expensiveInventory = Array.from({ length: 64 }, (_, index) => 100.01 + index / 100);
  const exhausted = loadBarbell({ target: 2000, barWeight: 0, plates: expensiveInventory });
  assert.equal(exhausted.tooHeavyToDraw, true, "Combinatorial searches stop at their own work budget");
  assert.equal(exhausted.loaded, null, "An incomplete search never claims a nearest lower load");
  assert.deepEqual(exhausted.perSide, []);
  const oversized = new Array(1000000000);
  assert.equal(loadBarbell({ target: 185, plates: oversized }).tooHeavyToDraw, true, "Oversized inventories are rejected before scanning");
  assert.deepEqual(plateChange(oversized, [45]), { kind: "none", remove: [], add: [], text: null });
  assert.equal(perSideText(oversized), "");
  const markup = renderEquipment({ equipmentClass: "barbell", target: 185, previousPerSide: oversized });
  assert.equal(parseSvg(markup).filter((node) => hasClass(node, "pl")).length, 2, "Oversized previous lists do not affect current equipment");
  for (const target of [12345, 123456]) {
    const nodes = parseSvg(renderEquipment({ equipmentClass: "generic", target }));
    const numericLabel = nodes.find((node) => node.text === target + " lb");
    assert.equal(numericLabel.attributes.textLength, target === 12345 ? undefined : "50", "Only labels longer than eight characters are constrained");
    assert.equal(nodes[0].attributes["aria-label"], target + " pounds", "Accessible values are never abbreviated");
  }
}

// Independent exhaustive combinations verify the optimizer's objectives rather
// than repeating its search implementation. Inputs stay deliberately small.
function testLoadingAgainstCombinationOracle() {
  function oracle(plates, limit) {
    let best = [];
    let bestSum = 0;
    function consider(candidate) {
      const sum = candidate.reduce((total, plate) => total + plate, 0);
      if (sum > limit) return;
      const heavier = candidate.findIndex((plate, index) => plate !== best[index]);
      if (sum > bestSum || (sum === bestSum && (candidate.length < best.length ||
        (candidate.length === best.length && heavier >= 0 && candidate[heavier] > best[heavier])))) {
        best = candidate.slice();
        bestSum = sum;
      }
    }
    function enumerate(index, candidate) {
      if (index === plates.length) return consider(candidate);
      for (let count = 0; count <= Math.floor(limit / plates[index]); count += 1) {
        enumerate(index + 1, candidate.concat(Array(count).fill(plates[index])));
      }
    }
    enumerate(0, []);
    return { perSide: best, loaded: bestSum * 2 };
  }
  for (const plates of [[9, 6], [8, 6, 3], [6, 4, 1], [7, 5, 3], [9, 7, 5, 2]]) {
    for (let perSide = 0; perSide <= 24; perSide += 1) {
      const expected = oracle(plates, perSide);
      const actual = loadBarbell({ target: 2 + perSide * 2, barWeight: 2, plates });
      assert.deepEqual(actual.perSide, expected.perSide, `${plates}: each side ${perSide}`);
      assert.equal(actual.loaded, expected.loaded + 2);
      assert.equal(actual.exact, actual.loaded === actual.target);
    }
  }
}

function testPlateChangesAndLabels() {
  const cases = [
    [[45, 25], [25, 45], "none", [], [], null],
    [[45], [45, 2.5], "add", [], [2.5], "Add a 2.5 each side"],
    [[45], [2.5, 45, 10], "add", [], [10, 2.5], "Add 10 + 2.5 each side"],
    [[45, 2.5], [45], "remove", [2.5], [], "Take a 2.5 off each side"],
    [[2.5, 10, 45], [45], "remove", [10, 2.5], [], "Take 10 + 2.5 off each side"],
    [[45, 25], [45, 10, 10, 2.5], "swap", [25], [10, 10, 2.5], "Swap each 25 for 10 + 10 + 2.5"],
    [[45, 25, 10], [35, 45], "swap", [25, 10], [35], "Swap each 25 + 10 for 35"],
    [[45, 10], [45, 10, 10], "add", [], [10], "Add a 10 each side"],
    [[45, 10, 10], [45, 10], "remove", [10], [], "Take a 10 off each side"],
    [[], [], "none", [], [], null]
  ];
  for (const [from, to, kind, remove, add, text] of cases) assert.deepEqual(plateChange(from, to), { kind, remove, add, text });
  assert.equal(perSideText([45, 25]), "45 + 25");
  assert.equal(perSideText([10, 10, 2.5]), "10 + 10 + 2.5");
  assert.equal(perSideText([]), "");
  for (const [input, text] of [[185, "185"], [182.5, "182.5"], [1.25, "1.25"], [0, "0"], [-0, "0"], [12345, "12345"]]) assert.equal(formatLoad(input), text);
  assert.equal(formatLoad(0.1 + 0.2), "0.3");
  assert.equal(formatLoad(1e-17), "0.00000000000000001");
  for (const [input, text] of [[179.999, "179.999"], [0.001, "0.001"], [-1.25, "-1.25"], [1e21, "1000000000000000000000"]]) assert.equal(formatLoad(input), text);
  for (const input of [undefined, null, NaN, Infinity, -Infinity, "185", {}, Symbol("odd")]) assert.equal(formatLoad(input), "");
  assert.equal(dumbbellLabel(55), "55s");
  assert.equal(dumbbellLabel(12.5), "12.5s");
  assert.equal(dumbbellLabel(1e-17), "0.00000000000000001s");
  for (const value of [undefined, null, -5, 0, NaN, Infinity, "55", {}]) assert.equal(dumbbellLabel(value), null);
}

function decodeEntities(text) {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (entity) => ({
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'"
  })[entity]);
}

// Strict scanner for the generated XML subset: balances tags, validates quoted
// attributes/entities, and retains nodes for semantic checks without a DOM library.
function parseSvg(markup) {
  assert.equal(typeof markup, "string");
  const stack = [];
  const nodes = [];
  let cursor = 0;
  function validText(text) {
    assert.doesNotMatch(text, /[<>]/, "Text is escaped");
    assert.doesNotMatch(text, /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/, "Entities are valid XML");
  }
  for (const match of markup.matchAll(/<(\/?)([A-Za-z][\w:-]*)([^<>]*?)>/g)) {
    const text = markup.slice(cursor, match.index);
    validText(text);
    if (stack.length) stack[stack.length - 1].text += decodeEntities(text);
    else assert.equal(text.trim(), "");
    cursor = match.index + match[0].length;
    const [, closing, tag, rawAttributes] = match;
    if (closing) {
      assert.equal(rawAttributes.trim(), "");
      assert.equal(stack.pop()?.tag, tag, `Balanced closing tag ${tag}`);
      continue;
    }
    const selfClosing = /\/\s*$/.test(rawAttributes);
    let remainder = rawAttributes.replace(/\/\s*$/, "").trim();
    const attributes = {};
    while (remainder) {
      const attribute = /^([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(remainder);
      assert.ok(attribute, `Quoted attribute: ${remainder}`);
      const value = attribute[2] === undefined ? attribute[3] : attribute[2];
      validText(value);
      assert.equal(Object.hasOwn(attributes, attribute[1]), false, "No duplicate attributes");
      attributes[attribute[1]] = decodeEntities(value);
      remainder = remainder.slice(attribute[0].length).trim();
    }
    const node = { tag, attributes, parent: stack[stack.length - 1] || null, text: "" };
    nodes.push(node);
    if (!selfClosing) stack.push(node);
  }
  validText(markup.slice(cursor));
  assert.equal(markup.slice(cursor).trim(), "");
  assert.equal(stack.length, 0, "All tags close");
  assert.equal(nodes.filter((node) => !node.parent).length, 1, "One root SVG");
  assert.equal(nodes[0].tag, "svg");
  return nodes;
}

function hasClass(node, name) {
  return (node.attributes.class || "").split(/\s+/).includes(name);
}

function testSvgRendering() {
  const definitions = renderDefs();
  const definitionNodes = parseSvg(definitions);
  assert.equal(definitionNodes[0].attributes.width, "0");
  assert.equal(definitionNodes[0].attributes.height, "0");
  assert.equal(definitionNodes[0].attributes["aria-hidden"], "true");
  assert.equal(definitionNodes[0].attributes.focusable, "false");
  assert.equal(definitionNodes.filter((node) => node.tag === "defs").length, 1);
  const ids = definitionNodes.map((node) => node.attributes.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  for (const name of ["lb-gSteel", "lb-gSteelD", "lb-knurl"]) assert.ok(ids.includes(name));
  assert.ok(ids.every((id) => id.startsWith("lb-")), "Shared identifiers are prefixed");
  const rendered = [definitions];
  const dimensions = { hero: [358, 114], row: [92, 50], history: [74, 40] };
  const examples = {
    barbell: [185, "Barbell loaded to 185 pounds, each side 45 + 25"],
    dumbbell: [55, "Dumbbells, 55 pounds each"], stack: [140, "Weight stack pinned at 140 pounds"],
    plate_loaded: [230, null], bodyweight: [null, "Bodyweight"], generic: [40, "40 pounds"]
  };
  for (const equipmentClass of EQUIPMENT_CLASSES) {
    for (const [size, [width, height]] of Object.entries(dimensions)) {
      const [target, expectedLabel] = examples[equipmentClass];
      const options = { equipmentClass, size, target, unit: "lb" };
      const markup = renderEquipment(options);
      rendered.push(markup);
      assert.equal(markup, renderEquipment(options), "Identical input renders identical markup");
      const nodes = parseSvg(markup);
      const root = nodes[0].attributes;
      assert.equal(root.role, "img");
      assert.equal(root.viewBox, `0 0 ${width} ${height}`);
      assert.equal(root.width, String(width));
      assert.equal(root.height, String(height));
      if (expectedLabel) assert.equal(root["aria-label"], expectedLabel);
      else assert.match(root["aria-label"], /230 pounds/);
      if (equipmentClass === "dumbbell") assert.ok(nodes.some((node) => node.text === "55s"));
      if (equipmentClass === "stack") assert.ok(nodes.some((node) => /140\s*lb/.test(node.text)), "Pinned plate carries actual target and unit");
      if (equipmentClass === "generic") assert.ok(nodes.some((node) => node.text === "40 lb"));
    }
  }
  for (const [target, note] of [[182.5, "can't load 182.5 exactly"], [40, "lighter than the bar"]]) {
    const markup = renderEquipment({ equipmentClass: "barbell", target });
    const label = parseSvg(markup)[0].attributes["aria-label"];
    assert.ok(label.endsWith(note));
    assert.match(label, new RegExp(`loaded to ${target === 40 ? 45 : 180} pounds`));
    rendered.push(markup);
  }
  const kilograms = renderEquipment({ equipmentClass: "barbell", target: 100, unit: "kg" });
  assert.equal(parseSvg(kilograms)[0].attributes["aria-label"], "Barbell loaded to 100 kilograms, each side 25 + 15");
  rendered.push(kilograms);
  const empty = renderEquipment({ equipmentClass: "generic", target: null });
  assert.equal(parseSvg(empty).filter((node) => node.tag === "text").length, 0, "Unknown target is an empty block, never zero");
  rendered.push(empty);

  for (const size of Object.keys(dimensions)) {
    function plates(options) {
      const markup = renderEquipment({ equipmentClass: "barbell", size, target: 180, ...options });
      rendered.push(markup);
      return parseSvg(markup).filter((node) => hasClass(node, "pl"));
    }
    assert.equal(plates({}).filter((node) => hasClass(node, "new")).length, 0);
    assert.equal(plates({ previousPerSide: [45, 10, 10, 2.5] }).filter((node) => hasClass(node, "new")).length, 0);
    const revised = plates({ previousPerSide: [45, 25] });
    assert.equal(revised.filter((node) => hasClass(node, "new")).length, 3);
    assert.equal(revised.filter((node) => hasClass(node, "p45") && hasClass(node, "new")).length, 0);
    assert.equal(plates({ previousPerSide: [45, 10, 2.5] }).filter((node) => hasClass(node, "new")).length, 1, "Repeated denominations use multiset counts");
    const flagged = renderEquipment({ equipmentClass: "barbell", size, target: 180, previousPerSide: [45, 25], collar: "flag" });
    rendered.push(flagged);
    const flaggedNodes = parseSvg(flagged);
    assert.equal(flaggedNodes.filter((node) => hasClass(node, "new")).length, 3);
    assert.equal(flaggedNodes.filter((node) => hasClass(node, "pl-halo")).length, 3);
    assert.ok(flaggedNodes.some((node) => hasClass(node, "flag")));
    assert.ok(flaggedNodes.some((node) => node.tag === "path" && /cord/.test(node.attributes.class || "")), "Flag has hanging cord");
    assert.ok(flaggedNodes.some((node) => node.tag === "ellipse" && /cord/.test(node.attributes.class || "")), "Cord loops around collar");
    assert.ok(flaggedNodes.some((node) => node.tag === "circle" && /knot/.test(node.attributes.class || "")), "Cord ends in knot");
  }
  const dangerous = 'Bench <img src=x onerror="alert(1)"> & "quoted"';
  const escaped = renderEquipment({ equipmentClass: "generic", target: 185, label: dangerous });
  assert.ok(parseSvg(escaped)[0].attributes["aria-label"].includes("185 pounds"));
  assert.doesNotMatch(escaped, /<img|onerror="alert/);
  assert.match(escaped, /&lt;img/);
  rendered.push(escaped);
  for (const markup of rendered) {
    assert.doesNotMatch(markup, /\bstyle\s*=/i, "SVG presentation is class based");
    assert.doesNotMatch(markup, /(?:fill|stroke|stop-color|color)\s*=\s*["'](?!url\(#lb-)[^"']+["']/i, "No inline color values");
    for (const node of parseSvg(markup)) {
      for (const className of (node.attributes.class || "").split(/\s+/).filter(Boolean)) assert.ok(CLASS_NAMES.includes(className), `Undeclared CSS class: ${className}`);
    }
    for (const reference of markup.matchAll(/url\(#([^)]*)\)/g)) assert.ok(ids.includes(reference[1]), "Every paint reference resolves to shared defs");
  }
}

function testPurityAndClassicScript() {
  const options = Object.freeze({ equipmentClass: "barbell", size: "hero", target: 180, unit: "lb",
    barWeight: 45, plates: Object.freeze([2.5, 10, 45, 25, 35, 5]), previousPerSide: Object.freeze([25, 45]), collar: "flag" });
  const before = JSON.stringify(options);
  renderEquipment(options);
  loadBarbell(options);
  plateChange(options.previousPerSide, options.plates);
  perSideText(options.previousPerSide);
  deriveEquipmentClass(options);
  assert.equal(JSON.stringify(options), before, "Frozen caller data remains unchanged");
  const first = loadBarbell(options);
  first.perSide.push(999);
  assert.deepEqual(loadBarbell(options).perSide, [45, 10, 10, 2.5], "Returned arrays cannot poison later calls");

  const filename = path.join(__dirname, "..", "loaded-bar.js");
  const source = fs.readFileSync(filename, "utf8");
  const scope = {};
  const forbidden = () => { throw new Error("Pure renderer accessed an ambient capability"); };
  for (const name of ["document", "localStorage", "sessionStorage", "fetch", "XMLHttpRequest", "Date"]) Object.defineProperty(scope, name, { get: forbidden });
  const context = vm.createContext(scope);
  vm.runInContext("Math.random = function () { throw new Error('Unexpected randomness'); };", context);
  vm.runInContext(source, context, { filename });
  const browserApi = context.ComprehensiveFitnessLoadedBar;
  assert.ok(browserApi, "Classic script attaches ComprehensiveFitnessLoadedBar without CommonJS or DOM");
  assert.equal(Object.isFrozen(browserApi), true);
  assert.equal(browserApi.renderEquipment(options), renderEquipment(options));
  assert.equal(browserApi.renderDefs(), renderDefs());
  assert.deepEqual(JSON.parse(JSON.stringify(browserApi.loadBarbell(options))), loadBarbell(options));
  assert.deepEqual(Object.keys(scope), ["ComprehensiveFitnessLoadedBar"], "Classic script exposes only its intended global");
}

testConstantsAndDerivation();
testBarbellLoading();
testBoundedDecorativeWork();
testLoadingAgainstCombinationOracle();
testPlateChangesAndLabels();
testSvgRendering();
testPurityAndClassicScript();

console.log("Loaded Bar tests passed: equipment derivation, exact plate search and tie-breaks, plate changes, SVG accessibility and classes, determinism, purity, and classic-script global.");
