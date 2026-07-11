"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  addDays,
  dateOnly,
  dateRange,
  groupBy,
  mean,
  parseAppleDate,
  readCsv,
  round,
  sortedUnique,
  stableId,
  sum,
  toNumber
} = require("./utils");

const NUTRIENT_FIELDS = {
  HKQuantityTypeIdentifierDietaryEnergyConsumed: { field: "calories", unit: "kcal" },
  HKQuantityTypeIdentifierDietaryProtein: { field: "protein_g", unit: "g" },
  HKQuantityTypeIdentifierDietaryCarbohydrates: { field: "carbohydrates_g", unit: "g" },
  HKQuantityTypeIdentifierDietaryFatTotal: { field: "fat_g", unit: "g" },
  HKQuantityTypeIdentifierDietaryFiber: { field: "fiber_g", unit: "g" },
  HKQuantityTypeIdentifierDietarySugar: { field: "sugar_g", unit: "g" },
  HKQuantityTypeIdentifierDietaryFatSaturated: { field: "saturated_fat_g", unit: "g" },
  HKQuantityTypeIdentifierDietaryFatMonounsaturated: { field: "monounsaturated_fat_g", unit: "g" },
  HKQuantityTypeIdentifierDietaryFatPolyunsaturated: { field: "polyunsaturated_fat_g", unit: "g" },
  HKQuantityTypeIdentifierDietaryCalcium: { field: "calcium_mg", unit: "mg" },
  HKQuantityTypeIdentifierDietaryCholesterol: { field: "cholesterol_mg", unit: "mg" },
  HKQuantityTypeIdentifierDietaryIron: { field: "iron_mg", unit: "mg" },
  HKQuantityTypeIdentifierDietaryPotassium: { field: "potassium_mg", unit: "mg" },
  HKQuantityTypeIdentifierDietarySodium: { field: "sodium_mg", unit: "mg" },
  HKQuantityTypeIdentifierDietaryVitaminA: { field: "vitamin_a_mcg", unit: "mcg" },
  HKQuantityTypeIdentifierDietaryVitaminC: { field: "vitamin_c_mg", unit: "mg" },
  HKQuantityTypeIdentifierDietaryVitaminD: { field: "vitamin_d_mcg", unit: "mcg" }
};

const FITBIT_NUTRIENT_FIELDS = {
  PROTEIN: "protein_g",
  CARBOHYDRATES: "carbohydrates_g",
  TOTAL_FAT: "fat_g",
  DIETARY_FIBER: "fiber_g",
  SUGAR: "sugar_g",
  SATURATED_FAT: "saturated_fat_g",
  CHOLESTEROL: "cholesterol_mg",
  SODIUM: "sodium_mg",
  POTASSIUM: "potassium_mg",
  CALCIUM: "calcium_mg",
  IRON: "iron_mg",
  VITAMIN_A: "vitamin_a_mcg",
  VITAMIN_C: "vitamin_c_mg",
  VITAMIN_D: "vitamin_d_mcg",
  CALORIES: "calories",
  ENERGY: "calories"
};

const MAIN_FIELDS = [
  "calories",
  "protein_g",
  "carbohydrates_g",
  "fat_g",
  "fiber_g",
  "sugar_g",
  "saturated_fat_g",
  "monounsaturated_fat_g",
  "polyunsaturated_fat_g",
  "calcium_mg",
  "cholesterol_mg",
  "iron_mg",
  "potassium_mg",
  "sodium_mg",
  "vitamin_a_mcg",
  "vitamin_c_mg",
  "vitamin_d_mcg"
];

function emptyNutrients() {
  return Object.fromEntries(MAIN_FIELDS.map((field) => [field, null]));
}

function addNutrient(target, field, value) {
  if (!Number.isFinite(value)) return;
  target[field] = round((Number(target[field]) || 0) + value, 4);
}

function sourceRelative(rawRoot, filePath) {
  return path.relative(rawRoot, filePath).replace(/\\/g, "/");
}

function normalizedMealLabel(row) {
  return String(row.meal || row.Meal || row["meal__2"] || row["Meal__2"] || "unspecified").trim() || "unspecified";
}

function parseFitbitNutrients(value) {
  const parsed = {};
  String(value || "").split(/;\s*/).forEach((part) => {
    const match = part.match(/^([A-Z0-9_]+):\s*([-+]?\d+(?:\.\d+)?|N\/A)\s*([A-Z]+)?$/i);
    if (!match) return;
    const [, rawName, rawValue] = match;
    const field = FITBIT_NUTRIENT_FIELDS[rawName.toUpperCase()];
    const numeric = toNumber(rawValue);
    if (field && Number.isFinite(numeric)) parsed[field] = numeric;
  });
  return parsed;
}

function applyRollingSevenDay(records) {
  const daily = records.filter((record) => record.record_type === "daily_total" && record.is_daily_primary);
  const byDate = new Map(daily.map((record) => [record.date, record]));
  daily.forEach((record) => {
    const window = [];
    for (let offset = -6; offset <= 0; offset += 1) {
      const candidate = byDate.get(addDays(record.date, offset));
      if (candidate) window.push(candidate);
    }
    MAIN_FIELDS.slice(0, 7).forEach((field) => {
      const values = window.map((item) => item[field]).filter(Number.isFinite);
      record[`rolling_7d_${field}`] = values.length >= 5 ? round(mean(values), 3) : null;
    });
    record.rolling_7d_observed_days = window.length;
  });
}

async function normalizeNutrition({ rawRoot, config, personalContext, analysisDate, methodologyVersion }) {
  const mealsDirectory = path.join(rawRoot, "meals");
  const physicalDirectory = path.join(rawRoot, "Takeout", "Google Health", "Physical Activity_GoogleData");
  const fileNames = (await fs.readdir(mealsDirectory)).filter((name) => /^HKQuantityTypeIdentifierDietary.*\.csv$/i.test(name));
  const rawNutrients = [];
  const sourceSchemas = [];
  const invalidValues = [];

  for (const fileName of fileNames) {
    const filePath = path.join(mealsDirectory, fileName);
    let detectedType = null;
    let sourceRangeStart = null;
    let sourceRangeEnd = null;
    const exactRows = new Set();
    let exactDuplicateCount = 0;
    const result = await readCsv(filePath, (row, meta) => {
      const nutrientType = String(row.type || "").trim();
      const mapping = NUTRIENT_FIELDS[nutrientType];
      if (!mapping) return;
      detectedType = nutrientType;
      const parsedDate = parseAppleDate(row.startDate);
      const numeric = toNumber(row.value);
      if (!parsedDate || !Number.isFinite(numeric)) {
        invalidValues.push({ source_file: sourceRelative(rawRoot, filePath), source_row: meta.rowNumber, field: !parsedDate ? "startDate" : "value", raw_value: !parsedDate ? row.startDate : row.value });
        return;
      }
      const signature = JSON.stringify(row);
      if (exactRows.has(signature)) {
        exactDuplicateCount += 1;
        return;
      }
      exactRows.add(signature);
      sourceRangeStart = !sourceRangeStart || parsedDate.date < sourceRangeStart ? parsedDate.date : sourceRangeStart;
      sourceRangeEnd = !sourceRangeEnd || parsedDate.date > sourceRangeEnd ? parsedDate.date : sourceRangeEnd;
      rawNutrients.push({
        date: parsedDate.date,
        source_entry_timestamp: parsedDate.timestamp,
        source_entry_timestamp_raw: row.startDate,
        source_name: String(row.sourceName || "unknown").trim() || "unknown",
        meal_label: normalizedMealLabel(row),
        food_description: String(row.HKFoodType || "").trim() || null,
        field: mapping.field,
        value: numeric,
        source_unit: String(row.unit || mapping.unit).trim(),
        canonical_unit: mapping.unit,
        source_file: sourceRelative(rawRoot, filePath),
        source_row: meta.rowNumber
      });
    });
    sourceSchemas.push({
      dataset: detectedType || fileName,
      file: sourceRelative(rawRoot, filePath),
      row_count: result.rowCount,
      columns: result.headers,
      date_range: { start: sourceRangeStart, end: sourceRangeEnd },
      exact_duplicates_removed: exactDuplicateCount,
      timestamp_semantics: "HealthKit entry or sync time; not assumed to be consumption time"
    });
  }

  const groupedMeals = groupBy(rawNutrients, (row) => `${row.date}|${row.source_name}|${row.meal_label}`);
  const records = [];
  for (const rows of groupedMeals.values()) {
    const first = rows[0];
    const nutrients = emptyNutrients();
    rows.forEach((row) => addNutrient(nutrients, row.field, row.value));
    const sourceFiles = sortedUnique(rows.map((row) => row.source_file));
    const descriptions = sortedUnique(rows.map((row) => row.food_description));
    const entryTimes = sortedUnique(rows.map((row) => row.source_entry_timestamp));
    records.push({
      nutrition_id: stableId("nut", first.date, first.source_name, first.meal_label, "meal"),
      record_type: "meal",
      date: first.date,
      period_id: null,
      meal_label: first.meal_label,
      meal_time: null,
      meal_time_status: "unavailable_entry_timestamp_not_consumption_time",
      source_entry_timestamp_first: entryTimes[0] || null,
      source_entry_timestamp_last: entryTimes.at(-1) || null,
      food_or_meal_description: descriptions.length ? descriptions.join(" | ") : `${first.meal_label} summary`,
      ...nutrients,
      hydration_ml: null,
      supplements: null,
      caffeine_mg: null,
      alcohol_g: null,
      pre_workout_meal: null,
      post_workout_meal: null,
      source_name: first.source_name,
      is_daily_primary: false,
      data_completeness: nutrients.calories != null && nutrients.protein_g != null && nutrients.carbohydrates_g != null && nutrients.fat_g != null ? "core_macros_complete" : "partial",
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: rows.length,
      confidence_level: "moderate",
      missing_data_flags: "meal_time;supplements;caffeine;alcohol;hydration",
      source_references: sourceFiles.join(";"),
      notes: "Meal time intentionally left blank because HealthKit/Carbon timestamps often represent sync time."
    });
  }

  const fitbitNutritionFile = path.join(physicalDirectory, "nutrition_log.csv");
  if (await fs.stat(fitbitNutritionFile).then(() => true, () => false)) {
    const exactRows = new Set();
    let duplicates = 0;
    const fitbitResult = await readCsv(fitbitNutritionFile, (row, meta) => {
      const date = dateOnly(row["start time"]);
      if (!date) return;
      const signature = JSON.stringify(row);
      if (exactRows.has(signature)) {
        duplicates += 1;
        return;
      }
      exactRows.add(signature);
      const nutrients = { ...emptyNutrients(), ...parseFitbitNutrients(row.nutrients) };
      records.push({
        nutrition_id: stableId("nut", "fitbit", date, row["food name"], row["meal type"], meta.rowNumber),
        record_type: "meal",
        date,
        period_id: null,
        meal_label: String(row["meal type"] || "unspecified").toLowerCase(),
        meal_time: null,
        meal_time_status: "unavailable_midnight_or_entry_timestamp",
        source_entry_timestamp_first: row["start time"] || null,
        source_entry_timestamp_last: row["end time"] || null,
        food_or_meal_description: row["food name"] || null,
        ...nutrients,
        hydration_ml: null,
        supplements: null,
        caffeine_mg: null,
        alcohol_g: null,
        pre_workout_meal: null,
        post_workout_meal: null,
        source_name: row["data source"] || row["brand name"] || "Fitbit nutrition log",
        is_daily_primary: false,
        data_completeness: nutrients.calories == null ? "partial_no_calories" : "partial",
        analysis_date: analysisDate,
        methodology_version: methodologyVersion,
        sample_size: 1,
        confidence_level: "low",
        missing_data_flags: "meal_time;calories;carbohydrates;fat;supplements;caffeine;alcohol;hydration",
        source_references: sourceRelative(rawRoot, fitbitNutritionFile),
        notes: "Sparse Fitbit nutrition record; midnight-like timestamp is not treated as meal time."
      });
    });
    sourceSchemas.push({ dataset: "fitbit_nutrition_log", file: sourceRelative(rawRoot, fitbitNutritionFile), row_count: fitbitResult.rowCount, columns: fitbitResult.headers, exact_duplicates_removed: duplicates, timestamp_semantics: "local wall time mislabeled UTC; usually midnight and not reliable meal time" });
  }

  const hydrationFiles = (await fs.readdir(physicalDirectory)).filter((name) => /^hydration_log.*\.csv$/i.test(name));
  const hydrationByDate = new Map();
  for (const fileName of hydrationFiles) {
    const filePath = path.join(physicalDirectory, fileName);
    await readCsv(filePath, (row) => {
      const date = dateOnly(row["start time"]);
      const amount = toNumber(String(row["amount consumed"] || "").split(/\s+/)[0]);
      if (date && Number.isFinite(amount)) hydrationByDate.set(date, (hydrationByDate.get(date) || 0) + amount);
    });
  }

  const mealRecords = records.filter((record) => record.record_type === "meal");
  const byDateSource = groupBy(mealRecords, (record) => `${record.date}|${record.source_name}`);
  const sourcePriority = (sourceName) => /carbon/i.test(sourceName) ? 3 : /myfitnesspal/i.test(sourceName) ? 2 : 1;
  const candidatesByDate = new Map();
  for (const rows of byDateSource.values()) {
    const first = rows[0];
    const nutrients = emptyNutrients();
    MAIN_FIELDS.forEach((field) => { nutrients[field] = round(sum(rows.map((row) => row[field])), 3); });
    const hasCore = ["calories", "protein_g", "carbohydrates_g", "fat_g"].filter((field) => Number.isFinite(nutrients[field])).length;
    const dailyRecord = {
      nutrition_id: stableId("nut", first.date, first.source_name, "daily"),
      record_type: "daily_total",
      date: first.date,
      period_id: null,
      meal_label: "daily_total",
      meal_time: null,
      meal_time_status: "not_applicable",
      source_entry_timestamp_first: sortedUnique(rows.map((row) => row.source_entry_timestamp_first))[0] || null,
      source_entry_timestamp_last: sortedUnique(rows.map((row) => row.source_entry_timestamp_last)).at(-1) || null,
      food_or_meal_description: `${rows.length} recorded meal bucket(s)`,
      ...nutrients,
      hydration_ml: round(hydrationByDate.get(first.date), 1),
      supplements: null,
      caffeine_mg: null,
      alcohol_g: null,
      pre_workout_meal: null,
      post_workout_meal: null,
      source_name: first.source_name,
      is_daily_primary: false,
      data_completeness: hasCore === 4 ? "core_macros_complete" : hasCore > 0 ? "partial" : "insufficient",
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: rows.length,
      confidence_level: hasCore === 4 ? "moderate" : "low",
      missing_data_flags: ["meal_time", "supplements", "caffeine", "alcohol", hasCore < 4 ? "core_macros" : null].filter(Boolean).join(";"),
      source_references: sortedUnique(rows.flatMap((row) => String(row.source_references || "").split(";").filter(Boolean))).join(";"),
      notes: "Daily total is source-specific; overlapping nutrition sources are not summed together."
    };
    if (!candidatesByDate.has(first.date)) candidatesByDate.set(first.date, []);
    candidatesByDate.get(first.date).push(dailyRecord);
    records.push(dailyRecord);
  }
  for (const candidates of candidatesByDate.values()) {
    candidates.sort((left, right) => {
      const completenessDifference = ["insufficient", "partial", "core_macros_complete"].indexOf(right.data_completeness) - ["insufficient", "partial", "core_macros_complete"].indexOf(left.data_completeness);
      return completenessDifference || sourcePriority(right.source_name) - sourcePriority(left.source_name);
    });
    candidates[0].is_daily_primary = true;
    candidates[0].notes += " Selected as the daily representative by completeness and source priority."
  }

  for (const period of personalContext.nutrition_period_context || []) {
    const definition = (config.periods || []).find((item) => item.period_id === period.period_id);
    records.push({
      nutrition_id: stableId("nutctx", period.period_id),
      record_type: "period_target_context",
      date: definition?.start || null,
      period_id: period.period_id,
      meal_label: null,
      meal_time: null,
      meal_time_status: "not_applicable",
      source_entry_timestamp_first: null,
      source_entry_timestamp_last: null,
      food_or_meal_description: period.oats_and_rice_relative_note || null,
      ...emptyNutrients(),
      calories: period.daily_calorie_target,
      hydration_ml: null,
      supplements: null,
      caffeine_mg: null,
      alcohol_g: null,
      pre_workout_meal: null,
      post_workout_meal: null,
      source_name: "user_provided_context",
      is_daily_primary: false,
      data_completeness: "context_target_not_observed_intake",
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: 0,
      confidence_level: "low",
      missing_data_flags: "observed_daily_intake;meal_timing;daily_macros",
      source_references: "config/personal_context.json",
      notes: "Calorie target is user-reported period context and must not be interpreted as measured intake."
    });
  }

  applyRollingSevenDay(records);
  records.sort((left, right) => String(left.date).localeCompare(String(right.date)) || left.record_type.localeCompare(right.record_type) || String(left.source_name).localeCompare(String(right.source_name)));
  const primaryDaily = records.filter((record) => record.record_type === "daily_total" && record.is_daily_primary);
  const primaryRange = dateRange(primaryDaily);
  const measuredCalorieDates2026 = primaryDaily.filter((record) => record.date?.startsWith("2026-") && Number.isFinite(record.calories)).length;
  return {
    records,
    primaryDaily,
    dailyMap: new Map(primaryDaily.map((record) => [record.date, record])),
    quality: {
      normalized_records: records.length,
      meal_records: mealRecords.length,
      daily_total_records: records.filter((record) => record.record_type === "daily_total").length,
      primary_daily_records: primaryDaily.length,
      primary_source_date_range: primaryRange,
      invalid_source_values: invalidValues.length,
      measured_calorie_dates_2026: measuredCalorieDates2026,
      workout_period_calorie_overlap: 0,
      trustworthy_meal_timestamps: 0,
      key_findings: [
        "Detailed calorie and macro records end in September 2025 and do not overlap Strong workout history.",
        "Sparse 2026 Fitbit nutrition records contain protein but no usable calorie, carbohydrate, or total-fat series.",
        "HealthKit and Fitbit entry timestamps are not treated as consumption times.",
        "User-reported April-June 2026 calorie values are stored as context targets, not observed intake."
      ],
      invalid_values: invalidValues.slice(0, 100)
    },
    sourceSchemas
  };
}

module.exports = { MAIN_FIELDS, normalizeNutrition, parseFitbitNutrients };
