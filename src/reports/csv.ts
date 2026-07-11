import { Response } from "express";

export type CsvValue = string | number | boolean | Date | null | undefined;

function neutralizeFormula(text: string) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function escapeCsv(value: CsvValue) {
  const text = neutralizeFormula(value instanceof Date ? value.toISOString() : value == null ? "" : String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function createCsv(headers: string[], rows: CsvValue[][]) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n")}\r\n`;
}

export function streamCsv(response: Response, filename: string, csv: string) {
  response.status(200);
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  response.setHeader("Cache-Control", "no-store");
  response.write(csv);
  response.end();
}
