import { AlertPriority, AlertStatus, Subsidiary } from "@prisma/client";
import { prisma } from "../data/prisma";
import { createCsv } from "./csv";

const DAY_MS = 86_400_000;
const NEAR_STORAGE_LIMIT_DAYS = 170;
const BONDED_STORAGE_DAYS = 180;

export class ReportValidationError extends Error {}

interface CommonFilters {
  from?: string;
  to?: string;
  search?: string;
}

export interface AlertReportFilters extends CommonFilters {
  subsidiary?: string;
  priority?: string;
  status?: string;
}

export interface InvoiceReportFilters extends CommonFilters {
  payment?: string;
}

function parseDate(value: string | undefined, label: string, endOfDay = false) {
  if (!value) return undefined;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) throw new ReportValidationError(`${label} must be a valid date`);
  if (dateOnly && endOfDay) parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed;
}

function dateRange(from?: string, to?: string) {
  const gte = parseDate(from, "from");
  const lt = parseDate(to, "to", true);
  if (gte && lt && gte >= lt) throw new ReportValidationError("The start date must be before or equal to the end date");
  return gte || lt ? { gte, lt } : undefined;
}

function dateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function elapsedDays(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

function validateEnum<T extends string>(value: string | undefined, allowed: readonly T[], label: string) {
  if (!value) return undefined;
  if (!allowed.includes(value as T)) throw new ReportValidationError(`${label.charAt(0).toUpperCase() + label.slice(1)} must be one of: ${allowed.join(", ")}`);
  return value as T;
}

export async function buildAlertsCsv(filters: AlertReportFilters) {
  const subsidiary = validateEnum(filters.subsidiary, Object.values(Subsidiary), "subsidiary");
  const priority = validateEnum(filters.priority, Object.values(AlertPriority), "priority");
  const status = validateEnum(filters.status, [AlertStatus.open, AlertStatus.resolved], "status");
  const alerts = await prisma.alert.findMany({
    where: {
      subsidiary,
      priority,
      status,
      created_at: dateRange(filters.from, filters.to),
    },
    include: {
      watched_item: { select: { item_type: true, title: true } },
      events: {
        where: { event_type: { in: ["resolved", "auto_resolved"] } },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 1,
      },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
  });
  const headers = ["subsidiary", "item_type", "title", "priority", "status", "created_at", "resolved_at", "resolved_by"];
  return {
    count: alerts.length,
    csv: createCsv(headers, alerts.map((alert) => {
      const resolution = alert.events[0];
      return [alert.subsidiary, alert.watched_item.item_type, alert.watched_item.title, alert.priority, alert.status, alert.created_at, resolution?.created_at, resolution?.actor];
    })),
  };
}

export async function buildInvoicesCsv(filters: InvoiceReportFilters) {
  const payment = validateEnum(filters.payment, ["paid", "unpaid"], "payment");
  const invoices = await prisma.invoice.findMany({
    where: {
      issued_date: dateRange(filters.from, filters.to),
      paid_date: payment === "paid" ? { not: null } : payment === "unpaid" ? null : undefined,
      movement: filters.search ? { reference_number: { contains: filters.search, mode: "insensitive" } } : undefined,
    },
    include: { movement: { select: { reference_number: true } } },
    orderBy: [{ issued_date: "desc" }, { id: "desc" }],
  });
  const now = new Date();
  const headers = ["movement_reference", "amount", "issued_date", "due_date", "paid_date", "status", "days_overdue"];
  return {
    count: invoices.length,
    csv: createCsv(headers, invoices.map((invoice) => [
      invoice.movement.reference_number,
      invoice.amount.toString(),
      dateOnly(invoice.issued_date),
      dateOnly(invoice.due_date),
      dateOnly(invoice.paid_date),
      invoice.status,
      elapsedDays(invoice.due_date, invoice.paid_date ?? now),
    ])),
  };
}

export async function buildMovementsCsv(filters: CommonFilters) {
  const movements = await prisma.movement.findMany({
    where: {
      entry_date: dateRange(filters.from, filters.to),
      OR: filters.search ? [
        { reference_number: { contains: filters.search, mode: "insensitive" } },
        { item_category: { contains: filters.search, mode: "insensitive" } },
        { type: { contains: filters.search, mode: "insensitive" } },
        { chassis_number: { contains: filters.search, mode: "insensitive" } },
        { vehicle_description: { contains: filters.search, mode: "insensitive" } },
      ] : undefined,
    },
    orderBy: [{ entry_date: "desc" }, { id: "desc" }],
  });
  const now = new Date();
  const headers = ["reference_number", "chassis_number", "vehicle_description", "bond_value_tzs", "item_category", "movement_type", "entry_date", "exit_date", "days_in_storage", "storage_flag", "status"];
  return {
    count: movements.length,
    csv: createCsv(headers, movements.map((movement) => {
      const days = elapsedDays(movement.entry_date, movement.exit_date ?? now);
      const flag = days >= BONDED_STORAGE_DAYS ? "OVER_LIMIT" : days > NEAR_STORAGE_LIMIT_DAYS ? "NEAR_LIMIT" : "OK";
      return [movement.reference_number, movement.chassis_number, movement.vehicle_description, movement.bond_value_tzs?.toString(), movement.item_category, movement.type, dateOnly(movement.entry_date), dateOnly(movement.exit_date), days, flag, movement.status];
    })),
  };
}
