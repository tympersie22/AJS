import { Subsidiary } from "@prisma/client";
import { prisma } from "../data/prisma";

const DAY_MS = 86_400_000;
const BONDED_STORAGE_DAYS = 180;

export class RecordDetailError extends Error {
  constructor(message: string, readonly status = 404) { super(message); }
}

async function activeAlerts(referenceIds: string[]) {
  if (!referenceIds.length) return [];
  const items = await prisma.watchedItem.findMany({
    where: { reference_id: { in: referenceIds }, alerts: { some: { status: "open" } } },
    include: { alerts: { where: { status: "open" }, orderBy: { created_at: "asc" } } },
  });
  return items.flatMap((item) => item.alerts.map((alert) => ({ id: alert.id, priority: alert.priority, title: item.title, message: alert.message, status: alert.status })));
}

async function alertHistory(referenceIds: string[]) {
  if (!referenceIds.length) return [];
  const items = await prisma.watchedItem.findMany({
    where: { reference_id: { in: referenceIds }, alerts: { some: {} } },
    include: {
      alerts: {
        include: { events: { orderBy: [{ created_at: "asc" }, { id: "asc" }] } },
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
      },
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });
  const events = items.flatMap((item) => item.alerts.flatMap((alert) => alert.events));
  const actorIds = [...new Set(events.map((event) => event.actor).filter((actor) => actor !== "system"))];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));
  return items.flatMap((item) => item.alerts.map((alert) => ({
    id: alert.id,
    priority: alert.priority,
    status: alert.status,
    message: alert.message,
    created_at: alert.created_at,
    title: item.title,
    item_type: item.item_type,
    events: alert.events.map((event) => ({
      ...event,
      actor_name: event.actor === "system" ? "system" : actorNames.get(event.actor) ?? event.actor,
    })),
  })));
}

function daysBetween(from: Date, to = new Date()) { return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS)); }

export async function getRecordDetail(type: string, id: string) {
  if (type === "driver") {
    const record = await prisma.driver.findUnique({ where: { id }, include: { trips: { include: { vehicle: true }, orderBy: { start_time: "desc" } }, permits: true } });
    if (!record) throw new RecordDetailError("Driver not found");
    const assignedTrip = record.trips.find((trip) => trip.status === "in_progress" || trip.status === "scheduled");
    const referenceIds = [record.id, ...record.trips.map((trip) => trip.id), ...record.permits.map((permit) => permit.id)];
    return { subsidiary: Subsidiary.logistics, type, record, assigned_vehicle: assignedTrip?.vehicle ?? null, alerts: await activeAlerts(referenceIds), alert_history: await alertHistory(referenceIds) };
  }
  if (type === "vehicle") {
    const record = await prisma.vehicle.findUnique({ where: { id }, include: { trips: true, permits: true, maintenance_records: true } });
    if (!record) throw new RecordDetailError("Vehicle not found");
    const referenceIds = [record.id, ...record.trips.map((trip) => trip.id), ...record.permits.map((permit) => permit.id), ...record.maintenance_records.map((maintenance) => maintenance.id)];
    return { subsidiary: Subsidiary.logistics, type, record, alerts: await activeAlerts(referenceIds), alert_history: await alertHistory(referenceIds) };
  }
  if (type === "trip") {
    const record = await prisma.trip.findUnique({ where: { id }, include: { driver: true, vehicle: true } });
    if (!record) throw new RecordDetailError("Trip not found");
    return { subsidiary: Subsidiary.logistics, type, record, alerts: await activeAlerts([record.id]), alert_history: await alertHistory([record.id]) };
  }
  if (type === "permit") {
    const record = await prisma.permit.findUnique({ where: { id }, include: { driver: true, vehicle: true } });
    if (!record) throw new RecordDetailError("Permit not found");
    return { subsidiary: Subsidiary.logistics, type, record, reference: record.id.slice(0, 8).toUpperCase(), alerts: await activeAlerts([record.id]), alert_history: await alertHistory([record.id]) };
  }
  if (type === "maintenance") {
    const record = await prisma.maintenanceRecord.findUnique({ where: { id }, include: { vehicle: true } });
    if (!record) throw new RecordDetailError("Maintenance record not found");
    return { subsidiary: Subsidiary.logistics, type, record, alerts: await activeAlerts([record.id]), alert_history: await alertHistory([record.id]) };
  }
  if (type === "movement") {
    const record = await prisma.movement.findUnique({ where: { id } });
    if (!record) throw new RecordDetailError("Movement not found");
    const days_in_storage = daysBetween(record.entry_date, record.exit_date ?? new Date());
    const storage_flag = days_in_storage >= BONDED_STORAGE_DAYS ? "OVER_LIMIT" : days_in_storage > 170 ? "NEAR_LIMIT" : "OK";
    return { subsidiary: Subsidiary.warehouse, type, record, days_in_storage, storage_flag, alerts: await activeAlerts([record.id]), alert_history: await alertHistory([record.id]) };
  }
  if (type === "extension") {
    const record = await prisma.extension.findUnique({ where: { id }, include: { movement: true } });
    if (!record) throw new RecordDetailError("Extension not found");
    return { subsidiary: Subsidiary.warehouse, type, record, alerts: await activeAlerts([record.id]), alert_history: await alertHistory([record.id]) };
  }
  if (type === "invoice") {
    const record = await prisma.invoice.findUnique({ where: { id }, include: { movement: true } });
    if (!record) throw new RecordDetailError("Invoice not found");
    const days_overdue = Math.max(0, daysBetween(record.due_date, record.paid_date ?? new Date()));
    return { subsidiary: Subsidiary.warehouse, type, record, days_overdue, alerts: await activeAlerts([record.id]), alert_history: await alertHistory([record.id]) };
  }
  if (type === "machine") {
    const record = await prisma.machine.findUnique({ where: { id } });
    if (!record) throw new RecordDetailError("Machine not found");
    return { subsidiary: Subsidiary.machinery, type, record, days_in_status: daysBetween(record.last_status_change_at), alerts: await activeAlerts([record.id]), alert_history: await alertHistory([record.id]) };
  }
  throw new RecordDetailError("Unsupported record type", 400);
}
