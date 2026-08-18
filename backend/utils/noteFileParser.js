const fs = require("fs");
const path = require("path");
const { parse: parseCsvSync } = require("csv-parse/sync");
const XLSX = require("xlsx");

const parseTxt = (text) => {
  const blocks = text
    .split(/\r?\n-----\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const lines = block.split(/\r?\n/);
    const firstLine = lines[0] || "";
    const titleMatch = firstLine.match(/^Title:\s*(.*)$/i);

    if (titleMatch) {
      return {
        title: titleMatch[1].trim(),
        content: lines.slice(1).join("\n").trim(),
      };
    }

    return {
      title: firstLine.trim(),
      content: lines.slice(1).join("\n").trim(),
    };
  });
};

const parseCsv = (text) => {
  const records = parseCsvSync(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((row) => ({
    title: row.title || row.Title || "",
    content: row.content || row.Content || "",
  }));
};

const parseXlsx = (filePath) => {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  return rows.map((row) => ({
    title: String(row.title || row.Title || ""),
    content: String(row.content || row.Content || ""),
  }));
};


const parseImportFile = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".xlsx" || ext === ".xls") {
    return parseXlsx(filePath);
  }

  const text = fs.readFileSync(filePath, "utf-8");

  if (ext === ".csv") {
    return parseCsv(text);
  }

  if (ext === ".txt") {
    return parseTxt(text);
  }

  throw new Error(`Unsupported file extension: ${ext}`);
};

module.exports = { parseImportFile };