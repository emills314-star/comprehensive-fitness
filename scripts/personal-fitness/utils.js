"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline");

const MISSING_TOKENS = new Set(["", "na", "n/a", "null", "undefined", "nan"]);

function cleanText(value) {
  if (value == null) return "";
  return String(value).replace(/^\uFEFF/, "").trim();
}

function nullableText(value) {
  const text = cleanText(value);
  return MISSING_TOKENS.has(text.toLowerCase()) ? null : text;
}

function toNumber(value) {
  const text = cleanText(value).replace(/^\s+|\s+$/g, "");
  if (MISSING_TOKENS.has(text.toLowerCase())) return null;
  const number = Number(text.replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value)));
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function sum(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((total, value) => total + value, 0) : null;
}

function median(values) {
  return quantile(values, 0.5);
}

function quantile(values, probability) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const position = clamp(probability, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function standardDeviation(values, sample = true) {
  const finite = values.filter(Number.isFinite);
  if (finite.length < (sample ? 2 : 1)) return null;
  const average = mean(finite);
  const divisor = sample ? finite.length - 1 : finite.length;
  return Math.sqrt(finite.reduce((total, value) => total + ((value - average) ** 2), 0) / divisor);
}

function coefficientOfVariation(values) {
  const average = mean(values);
  const sd = standardDeviation(values);
  return Number.isFinite(average) && average !== 0 && Number.isFinite(sd) ? Math.abs(sd / average) : null;
}

function linearSlope(values) {
  const points = values
    .map((value, index) => ({ x: index, y: value }))
    .filter((point) => Number.isFinite(point.y));
  if (points.length < 2) return null;
  const meanX = mean(points.map((point) => point.x));
  const meanY = mean(points.map((point) => point.y));
  const denominator = points.reduce((total, point) => total + ((point.x - meanX) ** 2), 0);
  if (!denominator) return null;
  return points.reduce((total, point) => total + ((point.x - meanX) * (point.y - meanY)), 0) / denominator;
}

function mode(values) {
  const counts = new Map();
  values.filter((value) => value != null && value !== "").forEach((value) => counts.set(String(value), (counts.get(String(value)) || 0) + 1));
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function weightedAverage(parts) {
  const available = parts.filter((part) => Number.isFinite(part.value) && Number.isFinite(part.weight) && part.weight > 0);
  const totalWeight = available.reduce((total, part) => total + part.weight, 0);
  if (!totalWeight) return null;
  return available.reduce((total, part) => total + (part.value * part.weight), 0) / totalWeight;
}

function stableId(prefix, ...parts) {
  const digest = crypto.createHash("sha256").update(parts.map((part) => part == null ? "" : String(part)).join("\u241f")).digest("hex").slice(0, 20);
  return `${prefix}_${digest}`;
}

function slugify(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvLine(line, delimiter = ",") {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

function uniqueHeaders(headers) {
  const counts = new Map();
  return headers.map((header, index) => {
    const base = cleanText(header) || `column_${index + 1}`;
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}__${count}`;
  });
}

async function readCsv(filePath, onRow, options = {}) {
  const stream = fs.createReadStream(filePath, { encoding: options.encoding || "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers = null;
  let rowNumber = 0;
  let physicalLine = 0;
  for await (const rawLine of lines) {
    physicalLine += 1;
    const line = rawLine.replace(/\r$/, "");
    if (!headers && /^sep=.$/i.test(line.trim())) continue;
    if (!headers) {
      headers = uniqueHeaders(parseCsvLine(line, options.delimiter || ","));
      if (options.headers) headers = options.headers;
      continue;
    }
    if (!line && options.skipBlank !== false) continue;
    rowNumber += 1;
    const cells = parseCsvLine(line, options.delimiter || ",");
    const row = {};
    headers.forEach((header, index) => { row[header] = cells[index] == null ? "" : cells[index]; });
    if (cells.length > headers.length) row.__extra = cells.slice(headers.length);
    await onRow(row, { rowNumber, physicalLine, headers, cellCount: cells.length, rawLine: line });
  }
  return { headers: headers || [], rowCount: rowNumber };
}

async function readCsvRows(filePath, options = {}) {
  const rows = [];
  const result = await readCsv(filePath, (row, meta) => rows.push(options.withMeta ? { ...row, __rowNumber: meta.rowNumber } : row), options);
  return { ...result, rows };
}

function csvEscape(value) {
  if (value == null) return "";
  const text = Array.isArray(value) || (typeof value === "object" && value !== null) ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function writeCsvAtomic(filePath, rows, columns = null) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const keys = columns || [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const body = [keys.map(csvEscape).join(","), ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(","))].join("\n") + "\n";
  await writeFileAtomic(filePath, body);
}

function assertJsonSafe(value, pointer = "$") {
  if (value === undefined) throw new Error(`Undefined value at ${pointer}`);
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Non-finite number at ${pointer}`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSafe(item, `${pointer}[${index}]`));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => assertJsonSafe(item, `${pointer}.${key}`));
  }
  return value;
}

async function writeJsonAtomic(filePath, value) {
  assertJsonSafe(value);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeFileAtomic(filePath, content) {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await fsp.writeFile(tempPath, content, "utf8");
  await fsp.rename(tempPath, filePath);
}

function parseStrongDate(value) {
  const text = cleanText(value);
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (isoMatch) {
    const [, year, month, day, hour, minute, second = "0"] = isoMatch;
    const date = `${year}-${month}-${day}`;
    const time = `${String(hour).padStart(2, "0")}:${minute}:${String(second).padStart(2, "0")}`;
    return { date, time, localDateTime: `${date}T${time}` };
  }
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, month, day, year, hour, minute, second = "0"] = match;
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const time = `${String(hour).padStart(2, "0")}:${minute}:${String(second).padStart(2, "0")}`;
  return { date, time, localDateTime: `${date}T${time}` };
}

function parseAppleDate(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, offset] = match;
  const offsetIso = `${offset.slice(0, 3)}:${offset.slice(3)}`;
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}:${second}`,
    offset: offsetIso,
    timestamp: `${year}-${month}-${day}T${hour}:${minute}:${second}${offsetIso}`
  };
}

function parseFitbitShortDate(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?$/);
  if (!match) return null;
  const [, month, day, shortYear, hour = "0", minute = "0", second = "0"] = match;
  const year = Number(shortYear) >= 70 ? `19${shortYear}` : `20${shortYear}`;
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { date, localDateTime: `${date}T${String(hour).padStart(2, "0")}:${minute}:${second}` };
}

function dateOnly(value) {
  const text = cleanText(value);
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const short = parseFitbitShortDate(text.split(" ")[0]);
  return short ? short.date : null;
}

function addDays(date, days) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + Number(days));
  return parsed.toISOString().slice(0, 10);
}

function daysBetween(earlier, later) {
  const left = new Date(`${earlier}T12:00:00Z`).getTime();
  const right = new Date(`${later}T12:00:00Z`).getTime();
  return Number.isFinite(left) && Number.isFinite(right) ? Math.round((right - left) / 86400000) : null;
}

function mondayOfWeek(date) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = parsed.getUTCDay();
  parsed.setUTCDate(parsed.getUTCDate() - (day === 0 ? 6 : day - 1));
  return parsed.toISOString().slice(0, 10);
}

function dateRange(records, field = "date") {
  const dates = records.map((record) => record[field]).filter(Boolean).sort();
  return { start: dates[0] || null, end: dates.at(-1) || null };
}

function groupBy(values, keySelector) {
  const groups = new Map();
  values.forEach((value, index) => {
    const key = typeof keySelector === "function" ? keySelector(value, index) : value[keySelector];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  });
  return groups;
}

function sortedUnique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ""))].sort();
}

function parseDurationMinutes(value) {
  const text = cleanText(value).toLowerCase();
  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*h/)?.[1] || 0);
  const minutes = Number(text.match(/(\d+(?:\.\d+)?)\s*m/)?.[1] || 0);
  const seconds = Number(text.match(/(\d+(?:\.\d+)?)\s*s/)?.[1] || 0);
  const total = (hours * 60) + minutes + (seconds / 60);
  return total > 0 ? round(total, 2) : null;
}

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.0+$/, "") : "NA";
}

module.exports = {
  addDays,
  assertJsonSafe,
  clamp,
  cleanText,
  coefficientOfVariation,
  dateOnly,
  dateRange,
  daysBetween,
  formatNumber,
  groupBy,
  linearSlope,
  mean,
  median,
  mode,
  mondayOfWeek,
  nullableText,
  parseAppleDate,
  parseCsvLine,
  parseDurationMinutes,
  parseFitbitShortDate,
  parseStrongDate,
  quantile,
  readCsv,
  readCsvRows,
  round,
  slugify,
  sortedUnique,
  stableId,
  standardDeviation,
  sum,
  toNumber,
  weightedAverage,
  writeCsvAtomic,
  writeFileAtomic,
  writeJsonAtomic
};
