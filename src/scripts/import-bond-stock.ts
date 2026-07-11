import { readFile } from "fs/promises";
import { parseCsv } from "../imports/csv";
import { prisma } from "../data/prisma";
import { parseEatDateOnlyEnd, parseEatDateOnlyStart } from "../time/eat";
import { upsertMovementByChassis } from "../warehouse/service";

const REQUIRED_HEADERS = ["reference_number", "item_category", "type", "entry_date", "exit_date", "status", "chassis_number", "bond_value_tzs", "vehicle_description"];
const ITEM_CATEGORIES = ["car", "machine", "truck", "bus"] as const;
const MOVEMENT_TYPES = ["carry_in", "carry_out"] as const;
const MOVEMENT_STATUSES = ["in_storage", "released", "pending", "completed"] as const;
const eatDate = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Africa/Dar_es_Salaam", year: "numeric" });

interface ParsedMovement {
  reference_number: string;
  item_category: string;
  type: string;
  entry_date: Date;
  exit_date: Date | null;
  status: string;
  chassis_number: string;
  bond_value_tzs: string | null;
  vehicle_description: string | null;
}

interface RejectedRow {
  row: number;
  reason: string;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(row: Record<string, string>, field: string, rowNumber: number): string {
  const value = row[field]?.trim();
  if (!value) throw new Error(`${field} is required`);
  return value;
}

function optional(row: Record<string, string>, field: string): string | null {
  return row[field]?.trim() || null;
}

function parseDate(value: string, rowNumber: number, field: string, endOfDay = false) {
  const parsed = endOfDay ? parseEatDateOnlyEnd(value) : parseEatDateOnlyStart(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be ISO date YYYY-MM-DD`);
  return parsed;
}

function parseBondValue(value: string | null) {
  if (!value) return null;
  const normalized = value.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("bond_value_tzs must be a positive number with up to 2 decimals");
  return normalized;
}

function validateHeaders(rows: Array<Record<string, string>>) {
  const first = rows[0];
  if (!first) return;
  const headers = Object.keys(first);
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) throw new Error(`CSV is missing required column(s): ${missing.join(", ")}`);
}

function parseMovement(row: Record<string, string>, index: number): ParsedMovement {
  const rowNumber = index + 2;
  const item_category = required(row, "item_category", rowNumber).toLowerCase();
  if (!ITEM_CATEGORIES.includes(item_category as typeof ITEM_CATEGORIES[number])) {
    throw new Error(`item_category must be one of: ${ITEM_CATEGORIES.join(", ")}`);
  }
  const type = required(row, "type", rowNumber).toLowerCase();
  if (!MOVEMENT_TYPES.includes(type as typeof MOVEMENT_TYPES[number])) {
    throw new Error(`type must be one of: ${MOVEMENT_TYPES.join(", ")}`);
  }
  const status = required(row, "status", rowNumber).toLowerCase();
  if (!MOVEMENT_STATUSES.includes(status as typeof MOVEMENT_STATUSES[number])) {
    throw new Error(`status must be one of: ${MOVEMENT_STATUSES.join(", ")}`);
  }
  const entry_date = parseDate(required(row, "entry_date", rowNumber), rowNumber, "entry_date");
  const exitValue = optional(row, "exit_date");
  const exit_date = exitValue ? parseDate(exitValue, rowNumber, "exit_date", true) : null;
  const chassis_number = required(row, "chassis_number", rowNumber).toUpperCase();
  return {
    reference_number: required(row, "reference_number", rowNumber),
    item_category,
    type,
    entry_date,
    exit_date,
    status,
    chassis_number,
    bond_value_tzs: parseBondValue(optional(row, "bond_value_tzs")),
    vehicle_description: optional(row, "vehicle_description"),
  };
}

async function main() {
  const filePath = argument("--file") ?? "imports/movements_bond_stock_2026-06-30.csv";
  const dryRun = process.argv.includes("--dry-run");
  const rows = parseCsv(await readFile(filePath, "utf8"));
  validateHeaders(rows);

  const parsed: ParsedMovement[] = [];
  const rejected: RejectedRow[] = [];
  const seenChassis = new Map<string, number>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    try {
      const movement = parseMovement(row, index);
      const previousRow = seenChassis.get(movement.chassis_number);
      if (previousRow) throw new Error(`duplicate chassis_number also seen on row ${previousRow}`);
      seenChassis.set(movement.chassis_number, rowNumber);
      parsed.push(movement);
    } catch (error) {
      rejected.push({ row: rowNumber, reason: error instanceof Error ? error.message : String(error) });
    }
  });

  const categoryBreakdown = parsed.reduce<Record<string, number>>((totals, row) => {
    totals[row.item_category] = (totals[row.item_category] ?? 0) + 1;
    return totals;
  }, {});

  console.log(`Bond stock import ${dryRun ? "dry run" : "commit"} summary`);
  console.log(`Total rows parsed: ${rows.length}`);
  console.log(`Accepted rows: ${parsed.length}`);
  console.log(`Rejected rows: ${rejected.length}`);
  console.log(`Category breakdown: ${JSON.stringify(categoryBreakdown)}`);
  if (rejected.length > 0) {
    console.log("Rejected row details:");
    for (const rejection of rejected) console.log(`- row ${rejection.row}: ${rejection.reason}`);
  }
  console.log("Preview:");
  for (const movement of parsed.slice(0, 10)) {
    console.log(`- ${movement.chassis_number} | ${movement.reference_number} | ${movement.item_category} | ${eatDate.format(movement.entry_date)} | ${movement.bond_value_tzs ?? "no bond value"} | ${movement.vehicle_description ?? "no description"}`);
  }

  if (dryRun || rejected.length > 0) return;

  const owner = await prisma.user.findFirstOrThrow({
    where: { role: { in: ["director", "gm", "manager"] } },
    orderBy: { created_at: "asc" },
  });
  for (const movement of parsed) await upsertMovementByChassis(movement, owner.id);
  console.log(`Committed ${parsed.length} bond stock movements.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
