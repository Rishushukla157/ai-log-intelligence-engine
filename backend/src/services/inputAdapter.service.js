const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

const { parseLogsFromText } = require("./logParser.service");

function detectFileFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".csv") return "csv";
  if (ext === ".json") return "json";
  if (ext === ".log" || ext === ".txt") return "apache";

  return "unknown";
}

function normalizeCsvRows(rows) {
  return rows.map((row, index) => {
    const timestamp =
      row.timestamp ||
      row.Timestamp ||
      row.time ||
      row.Time ||
      row.date ||
      row.Date ||
      null;

    const level =
      row.level ||
      row.Level ||
      row.severity ||
      row.Severity ||
      "unknown";

    const message =
      row.message ||
      row.Message ||
      row.raw ||
      row.Raw ||
      row.log ||
      row.Log ||
      Object.values(row).join(" ");

    return {
      id: index + 1,
      raw: `[${timestamp || "Unknown"}] [${level}] ${message}`,
      timestamp,
      level,
      ruleCategory: "Unknown"
    };
  });
}

function normalizeJsonRows(data) {
  const rows = Array.isArray(data) ? data : data.logs || data.data || [];

  return rows.map((row, index) => {
    if (typeof row === "string") {
      return {
        id: index + 1,
        raw: row,
        timestamp: null,
        level: "unknown",
        ruleCategory: "Unknown"
      };
    }

    const timestamp = row.timestamp || row.time || row.date || null;
    const level = row.level || row.severity || "unknown";
    const message = row.message || row.raw || row.log || JSON.stringify(row);

    return {
      id: index + 1,
      raw: `[${timestamp || "Unknown"}] [${level}] ${message}`,
      timestamp,
      level,
      ruleCategory: "Unknown"
    };
  });
}

function loadLogsFromUploadedFile(filePath) {
  const format = detectFileFormat(filePath);
  const content = fs.readFileSync(filePath, "utf-8");

  if (format === "apache") {
    return parseLogsFromText(content);
  }

  if (format === "csv") {
    const rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    return normalizeCsvRows(rows);
  }

  if (format === "json") {
    const data = JSON.parse(content);
    return normalizeJsonRows(data);
  }

  throw new Error("Unsupported file format. Please upload .log, .txt, .csv, or .json");
}

module.exports = {
  loadLogsFromUploadedFile
};