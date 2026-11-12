/** Pure equipment derivation, loading arithmetic and SVG presentation. Insert renderDefs once per page. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ComprehensiveFitnessLoadedBar = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EQUIPMENT_CLASSES = Object.freeze(["barbell", "dumbbell", "stack", "plate_loaded", "bodyweight", "generic"]);
  const DEFAULT_BAR_WEIGHT = Object.freeze({ lb: 45, kg: 20 });
  const DEFAULT_PLATES = Object.freeze({
    lb: Object.freeze([45, 35, 25, 10, 5, 2.5]),
    kg: Object.freeze([25, 20, 15, 10, 5, 2.5, 1.25])
  });
  const MAX_PLATES_PER_SIDE = 30;
  const MAX_PLATE_DENOMINATIONS = 64;
  const MAX_SEARCH_NODES = 10000;
  const CLASS_NAMES = Object.freeze([
    "defs", "gs0", "gs1", "gs2", "gs3", "gd0", "gd1", "kn",
    "bar", "shaft", "sleeve", "cap", "knurl", "ring", "sh",
    "pl", "p45", "p35", "p25", "p10", "p5", "p2", "new",
    "pl-b", "pl-rim", "pl-hi", "pl-n", "pl-l", "pl-halo",
    "col", "steel", "flag", "col-lever", "col-b", "col-hi", "col-pin", "acord", "aknot",
    "eqa", "eq-h", "eq-g", "eq-rod", "eq-slab", "lift", "eq-pin", "eq-pinhead",
    "eq-cable", "eq-label", "eq-stack-label", "eq-figure", "eq-block"
  ]);
  const positive = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
  const object = (value) => value !== null && typeof value === "object" ? value : {};
  const normalizedText = (value) => typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
  const unitOf = (unit) => unit === "kg" ? "kg" : "lb";
  // Parse decimal/exponent notation into integer hundredths without overflowing Number.
  function cents(n) {
    const [mantissa, exponent = "0"] = String(n).toLowerCase().split("e");
    const [whole, fraction = ""] = mantissa.split(".");
    const digits = whole + fraction;
    const shift = Number(exponent) - fraction.length + 2;
    if (shift >= 0) return BigInt(digits) * 10n ** BigInt(shift);
    const cutoff = digits.length + shift;
    if (cutoff < 0) return 0n;
    return BigInt(digits.slice(0, cutoff) || "0") + ((digits[cutoff] || "0") >= "5" ? 1n : 0n);
  }
  const weight = (n) => Number(n / 100n) + Number(n % 100n) / 100;
  const descending = (a, b) => a > b ? -1 : a < b ? 1 : 0;
  const ceiling = (a, b) => (a + b - 1n) / b;

  function deriveEquipmentClass(input) {
    const source = object(input);
    if (EQUIPMENT_CLASSES.includes(source.savedClass)) {
      return { equipmentClass: source.savedClass, source: "saved", correctable: false };
    }
    const groups = typeof source.exerciseName === "string" ? [...source.exerciseName.matchAll(/\(([^()]*)\)/g)] : [];
    const suffix = groups.length ? normalizedText(groups[groups.length - 1][1]) : "";
    const suffixClasses = {
      barbell: "barbell", "smith machine": "barbell", dumbbell: "dumbbell",
      cable: "stack", machine: "stack", bodyweight: "bodyweight", assisted: "bodyweight"
    };
    if (Object.prototype.hasOwnProperty.call(suffixClasses, suffix)) {
      return { equipmentClass: suffixClasses[suffix], source: "name_suffix", correctable: true };
    }
    const catalog = normalizedText(source.catalogEquipment);
    const kinds = new Set(catalog.match(/barbell|dumbbell|cable|machine|bodyweight|kettlebell|band|plate[ _-]*loaded/g) || []);
    const ambiguous = kinds.size > 1 || /[;/+&|]|\b(?:and|or)\b/.test(catalog);
    let equipmentClass;
    if (!ambiguous) {
      if (catalog.startsWith("barbell")) equipmentClass = "barbell";
      else if (catalog.startsWith("dumbbell")) equipmentClass = "dumbbell";
      else if (catalog.startsWith("cable") || catalog === "machine") equipmentClass = "stack";
      else if (catalog.startsWith("bodyweight")) equipmentClass = "bodyweight";
    }
    return equipmentClass
      ? { equipmentClass, source: "catalog", correctable: true }
      : { equipmentClass: "generic", source: "default", correctable: true };
  }

  function formatLoad(n) {
    if (typeof n !== "number" || !Number.isFinite(n)) return "";
    // Remove only hundredth-grid floating point noise; retain real precision and expand exponent notation.
    const rounded = Math.round(n * 100) / 100;
    const nearGrid = Math.abs(n) <= Number.MAX_SAFE_INTEGER / 100 && Math.abs(n - rounded) <= Number.EPSILON * Math.abs(n) * 4;
    const text = String(nearGrid ? rounded : n);
    if (!/[eE]/.test(text)) return text;
    const [mantissa, exponentText] = text.toLowerCase().split("e");
    const sign = mantissa.startsWith("-") ? "-" : "";
    const parts = mantissa.replace("-", "").split(".");
    const digits = parts.join("");
    const point = parts[0].length + Number(exponentText);
    return sign + (point <= 0 ? "0." + "0".repeat(-point) + digits
      : point >= digits.length ? digits + "0".repeat(point - digits.length)
        : digits.slice(0, point) + "." + digits.slice(point));
  }

  function cleanPlates(plates) {
    return Array.isArray(plates) ? plates.filter(positive).map(cents).filter((n) => n > 0n) : [];
  }

  function gcd(a, b) {
    while (b) [a, b] = [b, a % b];
    return a;
  }

  // Decorative search is bounded independently of observations and their magnitude.
  // A null result means the optimum cannot be established within the drawing budget.
  // Larger counts of heavier plates come first, so equal-count ties keep the lexicographically heavier list.
  function selectPlates(limit, inventory) {
    const coins = [...new Set(inventory)].filter((n) => n <= limit).sort(descending);
    if (!coins.length) return [];
    const maxCount = BigInt(MAX_PLATES_PER_SIDE);
    // If 31 of the heaviest available plate fit, no optimal drawing can use 30.
    if (limit / coins[0] > maxCount) return null;
    const divisors = coins.map(() => 0n);
    for (let i = coins.length - 1; i >= 0; i -= 1) divisors[i] = gcd(coins[i], divisors[i + 1] || 0n);
    const capacity = limit - limit % divisors[0];
    let bestWeight = -1n;
    let bestCount = null;
    let best = [];
    const counts = coins.map(() => 0n);
    let skippedUpper = -1n;
    let visits = 0;
    let exhausted = false;

    function visit(index, remaining, count) {
      if (++visits > MAX_SEARCH_NODES) { exhausted = true; return; }
      const loaded = capacity - remaining;
      const upper = loaded + remaining - remaining % divisors[index];
      if (upper < bestWeight) return;
      if (upper === bestWeight && count + ceiling(bestWeight - loaded, coins[index]) >= bestCount) return;
      const unrestrictedMaximum = remaining / coins[index];
      const available = maxCount - count;
      if (unrestrictedMaximum > available && upper > skippedUpper) skippedUpper = upper;
      const maximum = unrestrictedMaximum < available ? unrestrictedMaximum : available;
      if (index === coins.length - 1) {
        const weight = loaded + maximum * coins[index];
        if (weight > bestWeight || (weight === bestWeight && (bestCount === null || count + maximum < bestCount))) {
          counts[index] = maximum;
          bestWeight = weight;
          bestCount = count + maximum;
          best = counts.slice();
        }
        return;
      }
      for (let quantity = maximum; quantity >= 0n; quantity -= 1n) {
        if (exhausted) return;
        const rest = remaining - quantity * coins[index];
        if (bestWeight === capacity && count + quantity + ceiling(rest, coins[index + 1]) >= bestCount) break;
        counts[index] = quantity;
        visit(index + 1, rest, count + quantity);
      }
    }
    visit(0, capacity, 0n);
    // Never present a partial search as the nearest loadable result. A skipped
    // over-cap combination may be ignored only when its weight cannot win.
    if (exhausted || skippedUpper > bestWeight) return null;
    return coins.flatMap((coin, index) => Array(Number(best[index])).fill(weight(coin)));
  }

  function loadBarbell(input) {
    const source = object(input);
    const target = source.target;
    if (!positive(target)) return null;
    const unit = unitOf(source.unit);
    const barWeight = typeof source.barWeight === "number" && Number.isFinite(source.barWeight) && source.barWeight >= 0
      ? weight(cents(source.barWeight)) : DEFAULT_BAR_WEIGHT[unit];
    const roundedTarget = cents(target);
    const onGrid = Math.abs(target - weight(roundedTarget)) <= Number.EPSILON * target * 4;
    // Off-grid targets round downward; ordinary binary float noise can still represent exact hundredths.
    const targetCents = !onGrid && target < weight(roundedTarget) ? roundedTarget - 1n : roundedTarget;
    const barCents = cents(barWeight);
    const tooHeavy = () => ({ target, unit, barWeight, perSide: [], loaded: null, exact: false,
      note: "too heavy to draw", tooHeavyToDraw: true });
    if (Array.isArray(source.plates) && source.plates.length > MAX_PLATE_DENOMINATIONS) return tooHeavy();
    const inventory = cleanPlates(Array.isArray(source.plates) ? source.plates : DEFAULT_PLATES[unit]);
    const perSide = target >= barWeight ? selectPlates((targetCents - barCents) / 2n, inventory) : [];
    if (perSide === null) return tooHeavy();
    const loadedCents = barCents + 2n * perSide.reduce((sum, plate) => sum + cents(plate), 0n);
    const exact = target >= barWeight && onGrid && loadedCents === targetCents;
    return {
      target, unit, barWeight, perSide, loaded: weight(loadedCents), exact,
      note: exact ? null : target < barWeight ? "lighter than the bar" : "can't load " + formatLoad(target) + " exactly"
    };
  }

  function plateChange(fromPerSide, toPerSide) {
    if ((Array.isArray(fromPerSide) && fromPerSide.length > MAX_PLATES_PER_SIDE)
      || (Array.isArray(toPerSide) && toPerSide.length > MAX_PLATES_PER_SIDE)) {
      return { kind: "none", remove: [], add: [], text: null };
    }
    const from = cleanPlates(fromPerSide).sort(descending);
    const to = cleanPlates(toPerSide).sort(descending);
    const remaining = from.slice();
    const add = [];
    to.forEach((plate) => {
      const index = remaining.indexOf(plate);
      if (index >= 0) remaining.splice(index, 1);
      else add.push(weight(plate));
    });
    const remove = remaining.map(weight);
    const kind = remove.length ? add.length ? "swap" : "remove" : add.length ? "add" : "none";
    let text = null;
    if (kind === "swap") text = "Swap each " + perSideText(remove) + " for " + perSideText(add);
    else if (kind === "add") text = "Add " + (add.length === 1 ? "a " : "") + perSideText(add) + " each side";
    else if (kind === "remove") text = "Take " + (remove.length === 1 ? "a " : "") + perSideText(remove) + " off each side";
    return { kind, remove, add, text };
  }

  function perSideText(perSide) {
    if (Array.isArray(perSide) && perSide.length > MAX_PLATES_PER_SIDE) return "";
    return cleanPlates(perSide).sort(descending).map((n) => formatLoad(weight(n))).join(" + ");
  }

  function dumbbellLabel(load) {
    return positive(load) ? formatLoad(load) + "s" : null;
  }

  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  // All paints (including gradient/pattern references) belong to the host's equipment CSS.
  function renderDefs() {
    return '<svg xmlns="http://www.w3.org/2000/svg" class="defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>'
      + '<linearGradient id="lb-gSteel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="gs0"/><stop offset=".3" class="gs1"/><stop offset=".62" class="gs2"/><stop offset="1" class="gs3"/></linearGradient>'
      + '<linearGradient id="lb-gSteelD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="gd0"/><stop offset="1" class="gd1"/></linearGradient>'
      + '<pattern id="lb-knurl" width="4.2" height="4.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 .5H4.2M.5 0V4.2" class="kn"/></pattern>'
      + '</defs></svg>';
  }

  // Anchors: denomination, hero width/height, row width/height, history height.
  const PLATE_GEOMETRY = [
    [2.5, 8, 33, 7, 14, 12], [10, 15, 62, 10, 24, 20],
    [25, 20, 86, 14, 33, 28], [45, 23, 107, 16, 41, 34]
  ];
  const SIZES = { hero: [358, 114], row: [92, 50], history: [74, 40] };
  const geometryNumber = (n) => Math.round(n * 100) / 100;

  function plateGeometry(plate, unit, size) {
    // A 25 kg plate matches the largest 45 lb plate; other kg sizes interpolate on that scale.
    const equivalent = unit === "kg" ? plate * 45 / 25 : plate;
    const value = Math.max(2.5, Math.min(45, equivalent));
    let index = 1;
    while (index < PLATE_GEOMETRY.length - 1 && value > PLATE_GEOMETRY[index][0]) index += 1;
    const low = PLATE_GEOMETRY[index - 1];
    const high = PLATE_GEOMETRY[index];
    const fraction = (value - low[0]) / (high[0] - low[0]);
    const at = (column) => geometryNumber(low[column] + fraction * (high[column] - low[column]));
    const band = equivalent >= 40 ? "p45" : equivalent >= 30 ? "p35" : equivalent >= 15 ? "p25" : equivalent >= 7.5 ? "p10" : equivalent >= 4 ? "p5" : "p2";
    return { width: at(size === "hero" ? 1 : 3), height: at(size === "hero" ? 2 : size === "row" ? 4 : 5), band, large: value >= 25 };
  }

  function rect(className, x, y, width, height, radius) {
    return '<rect class="' + className + '" x="' + geometryNumber(x) + '" y="' + geometryNumber(y)
      + '" width="' + geometryNumber(width) + '" height="' + geometryNumber(height) + '" rx="' + radius + '"/>';
  }

  function renderPlate(plate, geometry, x, center, hero, isNew) {
    const { width, height, band, large } = geometry;
    const y = center - height / 2;
    let svg = '<g class="pl ' + band + (isNew ? ' new' : '') + '">';
    if (isNew) svg += rect("pl-halo", x - 3.5, y - 3.5, width + 7, height + 7, 5);
    svg += rect("pl-b", x, y, width, height, 3)
      + rect("pl-rim", x + 2.5, y + 3, Math.max(1, width - 5), height - 6, 2)
      + rect("pl-hi", x + 1.8, y + 5, 2, height - 10, 1);
    if (hero && large) {
      svg += '<text class="pl-n" font-size="' + (band === "p45" ? 21 : 18) + '" text-anchor="middle" transform="translate('
        + geometryNumber(x + width * .82) + ' ' + geometryNumber(y + height * .2173) + ') rotate(-90)">' + escapeText(formatLoad(plate)) + '</text>';
    } else {
      svg += '<text class="pl-l" font-size="13" text-anchor="middle" x="' + geometryNumber(x + width / 2) + '" y="' + geometryNumber(y - 5) + '">' + escapeText(formatLoad(plate)) + '</text>';
    }
    return svg + '</g>';
  }

  function renderBar(source, load, size, dimensions) {
    const hero = size === "hero";
    const [width, height] = dimensions;
    const center = height / 2;
    const plates = load ? load.perSide : [];
    const geometries = plates.map((plate) => plateGeometry(plate, unitOf(source.unit), size));
    const stackWidth = geometries.reduce((sum, geometry) => sum + geometry.width + 2, 0);
    const collarX = width - (hero ? 30 : 23);
    const firstPlate = collarX - 3 - stackWidth;
    const shoulder = firstPlate - (hero ? 11 : 9);
    // Long custom inventories scale the assembly horizontally to keep every plate visible.
    const extension = Math.max(0, (hero ? 60 : 4) - shoulder);
    const sh = shoulder + extension;
    const shaftHeight = hero ? 9 : 7;
    const sleeveHeight = hero ? 16 : 12;
    const knurlStart = hero ? 22 : size === "row" ? 6 : 4;
    const knurlEnd = hero ? sh - 38 : Math.min(size === "row" ? 28 : 22, sh);
    let svg = '<g transform="scale(' + geometryNumber(width / (width + extension)) + ' 1)">'
      + rect("shaft", hero ? -16 : -2, center - shaftHeight / 2, sh + (hero ? 16 : 2), shaftHeight, 0)
      + rect("knurl", knurlStart, center - shaftHeight / 2, Math.max(0, knurlEnd - knurlStart), shaftHeight, 0);
    [knurlStart, knurlEnd].forEach((x) => {
      svg += '<line class="ring" x1="' + geometryNumber(x) + '" x2="' + geometryNumber(x) + '" y1="' + (center - shaftHeight / 2) + '" y2="' + (center + shaftHeight / 2) + '"/>';
    });
    svg += rect("sleeve", sh, center - sleeveHeight / 2, width + extension - sh, sleeveHeight, 2)
      + rect("cap", width + extension - (hero ? 11 : 8), center - (hero ? 7 : 5), hero ? 11 : 8, hero ? 14 : 10, hero ? 5 : 4)
      + rect("sh", sh, center - (hero ? 13 : size === "row" ? 10 : 9.5), hero ? 8 : 6, hero ? 26 : size === "row" ? 20 : 19, 2.5);
    const previous = Array.isArray(source.previousPerSide) && source.previousPerSide.length <= MAX_PLATES_PER_SIDE
      ? cleanPlates(source.previousPerSide) : null;
    let x = firstPlate + extension;
    plates.forEach((plate, index) => {
      const oldIndex = previous ? previous.indexOf(cents(plate)) : -1;
      const isNew = previous !== null && oldIndex < 0;
      if (oldIndex >= 0) previous.splice(oldIndex, 1);
      svg += renderPlate(plate, geometries[index], x, center, hero, isNew);
      x += geometries[index].width + 2;
    });
    const collarWidth = hero ? 13 : 10;
    const collarHeight = hero ? 39 : size === "row" ? 30 : 29;
    const cx = collarX + extension;
    const cy = center - collarHeight / 2;
    svg += '<g class="col ' + (source.collar === "flag" ? "flag" : "steel") + '">'
      + rect("col-lever", cx + collarWidth * .18, cy - collarHeight * .2, collarWidth * .64, collarHeight * .3, 2.5)
      + rect("col-b", cx, cy, collarWidth, collarHeight, 3.5)
      + rect("col-hi", cx + 2, cy + 4, 2, collarHeight - 8, 1)
      + '<circle class="col-pin" cx="' + (cx + collarWidth / 2) + '" cy="' + geometryNumber(cy + collarHeight * .1) + '" r="1.6"/></g>';
    if (source.collar === "flag") {
      const cordX = cx + collarWidth / 2;
      const bottom = center + collarHeight / 2;
      const end = height + (hero ? 12 : 6);
      svg += '<path class="acord" d="M' + cordX + ' ' + bottom + ' C ' + cordX + ' ' + geometryNumber((bottom + end) / 2) + ' ' + cordX + ' ' + (end - 8) + ' ' + cordX + ' ' + end + '"/>'
        + '<ellipse class="acord" cx="' + cordX + '" cy="' + center + '" rx="3.2" ry="11.5"/>'
        + '<circle class="aknot" cx="' + cordX + '" cy="' + end + '" r="3.4"/>';
    }
    return svg + '</g>';
  }

  function renderGlyph(equipmentClass, target, unit, dimensions) {
    let svg = '';
    if (equipmentClass === "dumbbell") {
      [[5, 3], [39, 3], [11, 21], [45, 21]].forEach(([x, y]) => { svg += rect("eq-h", x, y, 11, 16, 3); });
      svg += rect("eq-g", 16, 9, 23, 4, 1.5) + rect("eq-g", 22, 27, 23, 4, 1.5);
      if (dumbbellLabel(target)) svg += '<text class="eq-label" x="32" y="51" font-size="13" text-anchor="middle">' + escapeText(dumbbellLabel(target)) + '</text>';
    } else if (equipmentClass === "stack") {
      // Schematic ten-unit plates; expand the range when needed. The selected slab carries the exact target.
      const count = Math.max(16, Math.min(24, Math.ceil((positive(target) ? target : 0) / 10)));
      const step = Math.max(10, (positive(target) ? target : 0) / count);
      const pinned = positive(target) ? Math.min(count - 1, Math.max(0, Math.ceil(target / step) - 1)) : -1;
      svg += '<line class="eq-rod" x1="8" x2="8" y1="1" y2="44"/><line class="eq-rod" x1="56" x2="56" y1="1" y2="44"/>';
      const spacing = (40 - (pinned >= 0 ? 9.1 : 0)) / (count - (pinned >= 0 ? 1 : 0));
      let pinnedY = 0;
      for (let i = 0; i < count; i += 1) {
        const y = 2 + i * spacing + (pinned >= 0 && i > pinned ? 9.1 - spacing : 0);
        svg += rect("eq-slab" + (i <= pinned ? " lift" : ""), 10, y, 44, i === pinned ? 8 : spacing - 1.1, 1);
        if (i === pinned) pinnedY = geometryNumber(y + 4);
      }
      if (pinned >= 0) {
        svg += '<line class="eq-pin" x1="52" x2="61" y1="' + pinnedY + '" y2="' + pinnedY + '"/><circle class="eq-pinhead" cx="61" cy="' + pinnedY + '" r="2.5"/>';
        svg += '<text class="eq-stack-label" x="32" y="' + pinnedY + '" dominant-baseline="central" font-size="6.5" text-anchor="middle">' + escapeText(formatLoad(target) + unit) + '</text>';
      }
      svg += '<path class="eq-cable" d="M32 2V0"/>';
    } else if (equipmentClass === "bodyweight") {
      svg += '<circle class="eq-figure" cx="32" cy="8" r="5"/><path class="eq-figure" d="M32 14V29M18 20L32 17L46 20M32 29L21 43M32 29L43 43"/>';
    } else {
      svg += rect("eq-block", 3, 9, 58, 35, 4) + rect("eq-block", 24, 3, 16, 6, 2);
      if (typeof target === "number" && Number.isFinite(target)) {
        const label = formatLoad(target) + " " + unit;
        svg += '<text class="eq-label" x="32" y="31" font-size="12" text-anchor="middle"'
          + (label.length > 8 ? ' textLength="50" lengthAdjust="spacingAndGlyphs"' : '') + '>' + escapeText(label) + '</text>';
      }
    }
    const scale = Math.min(dimensions[0] / 64, dimensions[1] / 56);
    return '<g transform="translate(' + geometryNumber((dimensions[0] - 64 * scale) / 2) + ' 0) scale(' + geometryNumber(scale) + ')">' + svg + '</g>';
  }

  function renderEquipment(input) {
    const source = object(input);
    const equipmentClass = EQUIPMENT_CLASSES.includes(source.equipmentClass) ? source.equipmentClass : "generic";
    const size = Object.prototype.hasOwnProperty.call(SIZES, source.size) ? source.size : "hero";
    const dimensions = SIZES[size];
    const unit = unitOf(source.unit);
    const words = unit === "kg" ? "kilograms" : "pounds";
    const barEquipment = equipmentClass === "barbell" || equipmentClass === "plate_loaded";
    const load = barEquipment ? loadBarbell(source) : null;
    const bar = barEquipment && !load?.tooHeavyToDraw;
    let description;
    if (bar) {
      description = equipmentClass === "barbell" ? "Barbell" : "Plate-loaded equipment";
      if (load) description += " loaded to " + formatLoad(load.loaded) + " " + words + ", each side " + (perSideText(load.perSide) || "no plates") + (load.note ? "; " + load.note : "");
      else description += ", no target";
    } else if (load?.tooHeavyToDraw) description = formatLoad(source.target) + " " + words + "; too heavy to draw";
    else if (equipmentClass === "dumbbell") description = "Dumbbells" + (positive(source.target) ? ", " + formatLoad(source.target) + " " + words + " each" : ", no target");
    else if (equipmentClass === "stack") description = "Weight stack" + (positive(source.target) ? " pinned at " + formatLoad(source.target) + " " + words : ", no target");
    else if (equipmentClass === "bodyweight") description = "Bodyweight";
    else description = typeof source.target === "number" && Number.isFinite(source.target) ? formatLoad(source.target) + " " + words : "Weight block, no target";
    if (typeof source.label === "string" && source.label.trim()) description = source.label.trim() + ": " + description;
    return '<svg xmlns="http://www.w3.org/2000/svg" class="' + (bar ? "bar" : "eqa") + '" viewBox="0 0 ' + dimensions.join(" ")
      + '" width="' + dimensions[0] + '" height="' + dimensions[1] + '" role="img" aria-label="' + escapeText(description) + '">'
      + (bar ? renderBar(source, load, size, dimensions) : renderGlyph(load?.tooHeavyToDraw ? "generic" : equipmentClass, source.target, unit, dimensions)) + '</svg>';
  }

  return Object.freeze({
    EQUIPMENT_CLASSES, DEFAULT_BAR_WEIGHT, DEFAULT_PLATES, CLASS_NAMES,
    deriveEquipmentClass, loadBarbell, plateChange, perSideText, formatLoad, dumbbellLabel, renderDefs, renderEquipment
  });
});
