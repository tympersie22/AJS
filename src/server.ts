import express from "express";
import { issueToken } from "./auth/tokens";
import { verifyPassword } from "./auth/passwords";
import { runAlertEngine, scheduleAlertEngine } from "./alerts/engine";
import { getEngineHealth } from "./alerts/heartbeat";
import { listOpenAlerts } from "./alerts/queries";
import { findUserByEmail } from "./data/store";
import { Subsidiary } from "@prisma/client";
import { requireAuth, requireRole, AuthenticatedRequest } from "./http/auth-middleware";
import {
  createDriver,
  createMaintenanceRecord,
  createPermit,
  createTrip,
  createVehicle,
  updateDriver,
  updateMaintenanceRecord,
  updatePermit,
  updateTrip,
} from "./logistics/service";
import {
  createExtension,
  createInvoice,
  createMovement,
  updateMovement,
  updateExtension,
  updateInvoice,
} from "./warehouse/service";
import { createMachine, updateMachine } from "./machinery/service";
import { canAccessSubsidiary, getDriverPortal, getScopedOverview, scopedSubsidiary } from "./access/service";
import { acknowledgeAlert, resolveAlert } from "./alerts/actions";
import { prisma } from "./data/prisma";
import { loginRateLimit } from "./http/login-rate-limit";
import { errorHandler, notFoundHandler } from "./http/error-handler";
import { streamCsv } from "./reports/csv";
import { buildAlertsCsv, buildInvoicesCsv, buildMovementsCsv, ReportValidationError } from "./reports/service";
import { createManagedUser, deactivateManagedUser, listManagedUsers, UserManagementError } from "./users/service";
import { getRecordDetail, RecordDetailError } from "./records/service";
import { parseEatDateOnlyEnd, parseEatDateOnlyStart, parseEatDateTime } from "./time/eat";
import { listAlertThresholdSettings, updateAlertThreshold } from "./alerts/thresholds";
import { buildComplianceSummary } from "./compliance/service";
import { scheduleWeeklyDigest } from "./digest/service";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";
const allowedWebOrigins = new Set([
  process.env.WEB_ORIGIN ?? "http://127.0.0.1:3010",
  "http://127.0.0.1:3010",
  "http://localhost:3010",
]);

app.use(express.json());
app.use((req, res, next) => {
  const origin = req.header("origin");
  if (origin && allowedWebOrigins.has(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.get("/.well-known/appspecific/com.chrome.devtools.json", (_req, res) => {
  res.json({});
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ajs-api" });
});

async function engineHealthHandler(_req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    res.json(await getEngineHealth());
  } catch (error) {
    next(error);
  }
}

app.get("/health/engine", engineHealthHandler);
app.get("/api/health/engine", engineHealthHandler);

app.post("/auth/login", loginRateLimit, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const user = await findUserByEmail(email);

  if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = issueToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    subsidiary: user.subsidiary,
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      subsidiary: user.subsidiary,
    },
  });
});

app.get("/me", requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    subsidiary: user.subsidiary,
  });
});

app.get(
  "/protected/director-summary",
  requireAuth,
  requireRole(["director", "gm"]),
  (req: AuthenticatedRequest, res) => {
    res.json({
      message: `Welcome ${req.user!.name}. Phase 0 protected route is working.`,
      visibleSubsidiaries: ["logistics", "warehouse", "machinery"],
    });
  }
);

const requireUserAdministrator = requireRole(["director", "gm"]);

function userManagementError(error: unknown, res: express.Response, next: express.NextFunction) {
  if (error instanceof UserManagementError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  next(error);
}

app.get("/admin/users", requireAuth, requireUserAdministrator, async (_req, res, next) => {
  try {
    res.json(await listManagedUsers());
  } catch (error) {
    userManagementError(error, res, next);
  }
});

app.post("/admin/users", requireAuth, requireUserAdministrator, async (req, res, next) => {
  try {
    res.status(201).json({ user: await createManagedUser(req.body) });
  } catch (error) {
    userManagementError(error, res, next);
  }
});

app.patch("/admin/users/:id/deactivate", requireAuth, requireUserAdministrator, async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json({ user: await deactivateManagedUser(req.params.id, req.user!.id) });
  } catch (error) {
    userManagementError(error, res, next);
  }
});

app.get("/admin/alert-thresholds", requireAuth, requireUserAdministrator, async (_req, res, next) => {
  try {
    res.json({ thresholds: await listAlertThresholdSettings() });
  } catch (error) {
    next(error);
  }
});

app.patch("/admin/alert-thresholds/:ruleKey", requireAuth, requireUserAdministrator, async (req: AuthenticatedRequest, res, next) => {
  try {
    const value = Number(req.body.value);
    const threshold = await updateAlertThreshold(req.params.ruleKey, value, req.user!.id);
    res.json({ threshold });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

app.get("/alerts", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user!.role === "driver") {
    res.status(403).json({ error: "Drivers do not have alert access" });
    return;
  }
  const subsidiary = req.query.subsidiary;
  const allowedSubsidiaries = ["logistics", "warehouse", "machinery"];

  if (typeof subsidiary === "string" && !allowedSubsidiaries.includes(subsidiary)) {
    res.status(400).json({ error: "Invalid subsidiary filter" });
    return;
  }

  const userScope = scopedSubsidiary(req.user!);
  if (userScope && subsidiary && subsidiary !== userScope) {
    res.status(403).json({ error: "Subsidiary is outside your scope" });
    return;
  }
  const alerts = await listOpenAlerts(userScope ?? subsidiary as Subsidiary | undefined);
  const watchedItems = await prisma.watchedItem.findMany({
    where: { id: { in: alerts.map((alert) => alert.watched_item_id) } },
    select: { id: true, item_type: true, title: true, due_at: true },
  });
  const watchedById = new Map(watchedItems.map((item) => [item.id, item]));
  res.json({ alerts: alerts.map((alert) => ({ ...alert, watched_item: watchedById.get(alert.watched_item_id) })) });
});

app.get("/alerts/summary", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user!.role === "driver") {
    res.status(403).json({ error: "Drivers do not have alert access" });
    return;
  }
  const scope = scopedSubsidiary(req.user!);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const baseWhere = scope ? { subsidiary: scope } : {};
  const [totalOpen, high, medium, resolvedToday] = await Promise.all([
    prisma.alert.count({ where: { ...baseWhere, status: "open" } }),
    prisma.alert.count({ where: { ...baseWhere, status: "open", priority: "high" } }),
    prisma.alert.count({ where: { ...baseWhere, status: "open", priority: "medium" } }),
    prisma.alertEvent.count({
      where: {
        event_type: { in: ["resolved", "auto_resolved"] },
        created_at: { gte: startOfToday },
        alert: scope ? { subsidiary: scope } : undefined,
      },
    }),
  ]);
  res.json({ totalOpen, high, medium, resolvedToday });
});

async function alertRecordLink(itemType: string, referenceId: string | null) {
  if (!referenceId) return null;
  if (itemType === "trip") {
    const trip = await prisma.trip.findUnique({ where: { id: referenceId }, select: { id: true } });
    return trip ? { label: "View Trip Record", href: `/logistics/trips/${trip.id}` } : null;
  }
  if (itemType === "extension") {
    const movement = await prisma.movement.findUnique({ where: { id: referenceId }, select: { id: true } });
    return movement ? { label: "View Movement Record", href: `/warehouse/movements/${movement.id}` } : null;
  }
  if (itemType === "permit") {
    const driver = await prisma.driver.findUnique({ where: { id: referenceId }, select: { id: true } });
    return driver ? { label: "View Driver Record", href: `/logistics/drivers/${driver.id}` } : null;
  }
  return null;
}

app.get("/alerts/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user!.role === "driver") {
    res.status(403).json({ error: "Drivers do not have alert access" });
    return;
  }
  const alert = await prisma.alert.findUnique({
    where: { id: req.params.id },
    include: {
      watched_item: { select: { item_type: true, reference_id: true, title: true } },
      events: { orderBy: [{ created_at: "asc" }, { id: "asc" }] },
    },
  });
  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  if (!canAccessSubsidiary(req.user!, alert.subsidiary)) {
    res.status(403).json({ error: "Alert is outside your scope" });
    return;
  }
  const actorIds = [...new Set(alert.events.map((event) => event.actor).filter((actor) => actor !== "system"))];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));
  const canAcknowledge = ["director", "gm", "manager", "accountant", "hr"].includes(req.user!.role);
  res.json({
    alert: {
      ...alert,
      events: alert.events.map((event) => ({ ...event, actor_name: event.actor === "system" ? "system" : actorNames.get(event.actor) ?? event.actor })),
      can_acknowledge: canAcknowledge && alert.status === "open",
      record_link: await alertRecordLink(alert.watched_item.item_type, alert.watched_item.reference_id),
    },
  });
});

app.get("/scope/overview", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user!.role === "driver") {
    res.status(403).json({ error: "Use the driver portal for driver-specific information" });
    return;
  }
  res.json({ overview: await getScopedOverview(req.user!) });
});

app.get("/compliance", requireAuth, requireRole(["director", "gm"]), async (_req, res, next) => {
  try {
    res.json({ compliance: await buildComplianceSummary() });
  } catch (error) {
    next(error);
  }
});

app.get("/driver/portal", requireAuth, requireRole(["driver"]), async (req: AuthenticatedRequest, res) => {
  const portal = await getDriverPortal(req.user!.id);
  res.json(portal);
});

app.get("/records/:type/:id", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  if (req.user!.role === "driver") {
    res.status(403).json({ error: "Record details are unavailable in the driver portal" });
    return;
  }
  try {
    const detail = await getRecordDetail(req.params.type, req.params.id);
    if (!canAccessSubsidiary(req.user!, detail.subsidiary)) {
      res.status(403).json({ error: "Record is outside your scope" });
      return;
    }
    res.json({ detail });
  } catch (error) {
    if (error instanceof RecordDetailError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    next(error);
  }
});

app.get("/logistics", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!canAccessSubsidiary(req.user!, "logistics")) {
    res.status(403).json({ error: "Logistics is outside your scope" });
    return;
  }
  const [drivers, vehicles, trips, permits, maintenanceRecords, watchedItems] = await Promise.all([
    prisma.driver.findMany({ orderBy: { name: "asc" } }),
    prisma.vehicle.findMany({ orderBy: { plate_number: "asc" } }),
    prisma.trip.findMany({ include: { driver: true, vehicle: true }, orderBy: { start_time: "desc" } }),
    prisma.permit.findMany({ include: { driver: true, vehicle: true }, orderBy: { expiry_date: "asc" } }),
    prisma.maintenanceRecord.findMany({ include: { vehicle: true }, orderBy: { scheduled_date: "asc" } }),
    prisma.watchedItem.findMany({ where: { subsidiary: "logistics", alerts: { some: { status: "open" } } }, select: { reference_id: true, alerts: { where: { status: "open" }, select: { id: true }, take: 1 } } }),
  ]);
  const activeAlerts = new Map(watchedItems.map((item) => [item.reference_id, item.alerts[0]?.id]));
  res.json({
    drivers: drivers.map((driver) => ({ ...driver, active_alert: activeAlerts.has(driver.id), active_alert_id: activeAlerts.get(driver.id) ?? null })),
    vehicles: vehicles.map((vehicle) => ({ ...vehicle, active_alert: activeAlerts.has(vehicle.id), active_alert_id: activeAlerts.get(vehicle.id) ?? null })),
    trips: trips.map((trip) => ({ ...trip, active_alert: activeAlerts.has(trip.id), active_alert_id: activeAlerts.get(trip.id) ?? null })),
    permits: permits.map((permit) => ({ ...permit, active_alert: activeAlerts.has(permit.id), active_alert_id: activeAlerts.get(permit.id) ?? null })),
    maintenance_records: maintenanceRecords.map((maintenance) => ({ ...maintenance, active_alert: activeAlerts.has(maintenance.id), active_alert_id: activeAlerts.get(maintenance.id) ?? null })),
  });
});

app.get("/warehouse", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!canAccessSubsidiary(req.user!, "warehouse")) {
    res.status(403).json({ error: "Warehouse is outside your scope" });
    return;
  }
  const [movements, extensions, invoices, watchedItems] = await Promise.all([
    prisma.movement.findMany({ orderBy: { entry_date: "desc" } }),
    prisma.extension.findMany({ include: { movement: true }, orderBy: { extended_until: "asc" } }),
    prisma.invoice.findMany({ include: { movement: true }, orderBy: { due_date: "asc" } }),
    prisma.watchedItem.findMany({ where: { subsidiary: "warehouse", alerts: { some: { status: "open" } } }, select: { reference_id: true, alerts: { where: { status: "open" }, select: { id: true }, take: 1 } } }),
  ]);
  const activeAlerts = new Map(watchedItems.map((item) => [item.reference_id, item.alerts[0]?.id]));
  res.json({
    movements: movements.map((movement) => ({ ...movement, active_alert: activeAlerts.has(movement.id), active_alert_id: activeAlerts.get(movement.id) ?? null })),
    extensions: extensions.map((extension) => ({ ...extension, active_alert: activeAlerts.has(extension.id), active_alert_id: activeAlerts.get(extension.id) ?? null })),
    invoices: invoices.map((invoice) => ({ ...invoice, active_alert: activeAlerts.has(invoice.id), active_alert_id: activeAlerts.get(invoice.id) ?? null })),
  });
});

app.get("/machinery", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!canAccessSubsidiary(req.user!, "machinery")) {
    res.status(403).json({ error: "Machinery is outside your scope" });
    return;
  }
  const [machines, watchedItems] = await Promise.all([
    prisma.machine.findMany({ orderBy: { name: "asc" } }),
    prisma.watchedItem.findMany({ where: { subsidiary: "machinery", alerts: { some: { status: "open" } } }, select: { reference_id: true, alerts: { where: { status: "open" }, select: { id: true }, take: 1 } } }),
  ]);
  const activeAlerts = new Map(watchedItems.map((item) => [item.reference_id, item.alerts[0]?.id]));
  res.json({ machines: machines.map((machine) => ({ ...machine, active_alert: activeAlerts.has(machine.id), active_alert_id: activeAlerts.get(machine.id) ?? null })) });
});

app.get("/accounting/invoices", requireAuth, requireRole(["director", "gm", "accountant"]), async (req: AuthenticatedRequest, res) => {
  if (req.user!.role === "accountant" && req.user!.subsidiary !== "warehouse") {
    res.json({ invoices: [] });
    return;
  }
  const invoices = await prisma.invoice.findMany({ include: { movement: true }, orderBy: { due_date: "asc" } });
  res.json({ invoices });
});

function reportFilters(query: AuthenticatedRequest["query"]) {
  return Object.fromEntries(Object.entries(query).map(([key, value]) => [key, typeof value === "string" ? value : undefined]));
}

function reportError(error: unknown, res: express.Response, next: express.NextFunction) {
  if (error instanceof ReportValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  next(error);
}

app.get("/reports/alerts.csv", requireAuth, requireRole(["director", "gm"]), async (req: AuthenticatedRequest, res, next) => {
  try {
    const report = await buildAlertsCsv(reportFilters(req.query));
    streamCsv(res, "ajs-alerts.csv", report.csv);
  } catch (error) {
    reportError(error, res, next);
  }
});

const requireWarehouseReporter = requireRole(["director", "gm", "accountant"]);

app.get("/reports/invoices.csv", requireAuth, requireWarehouseReporter, async (req: AuthenticatedRequest, res, next) => {
  if (req.user!.role === "accountant" && req.user!.subsidiary !== "warehouse") {
    res.status(403).json({ error: "Warehouse reports are outside your scope" });
    return;
  }
  try {
    const report = await buildInvoicesCsv(reportFilters(req.query));
    streamCsv(res, "ajs-warehouse-invoices.csv", report.csv);
  } catch (error) {
    reportError(error, res, next);
  }
});

app.get("/reports/movements.csv", requireAuth, requireWarehouseReporter, async (req: AuthenticatedRequest, res, next) => {
  if (req.user!.role === "accountant" && req.user!.subsidiary !== "warehouse") {
    res.status(403).json({ error: "Warehouse reports are outside your scope" });
    return;
  }
  try {
    const report = await buildMovementsCsv(reportFilters(req.query));
    streamCsv(res, "ajs-warehouse-movements.csv", report.csv);
  } catch (error) {
    reportError(error, res, next);
  }
});

const requireAlertManager = requireRole(["director", "gm", "manager", "accountant", "hr"]);

app.patch("/alerts/:id/acknowledge", requireAuth, requireAlertManager, async (req: AuthenticatedRequest, res) => {
  const alert = await acknowledgeAlert(req.params.id, req.user!);
  if (!alert) {
    res.status(403).json({ error: "Alert is outside your scope" });
    return;
  }
  res.json({ alert });
});

app.patch("/alerts/:id/resolve", requireAuth, requireAlertManager, async (req: AuthenticatedRequest, res) => {
  const alert = await resolveAlert(req.params.id, req.user!);
  if (!alert) {
    res.status(403).json({ error: "Alert is outside your scope" });
    return;
  }
  res.json({ alert });
});

app.post(
  "/alerts/run-engine",
  requireAuth,
  requireRole(["director", "gm", "manager"]),
  async (_req, res) => {
    const createdCount = await runAlertEngine();
    res.json({ createdCount });
  }
);

const requireLogisticsManager = requireRole(["director", "gm", "manager"]);

app.post("/logistics/drivers", requireAuth, requireLogisticsManager, async (req: AuthenticatedRequest, res) => {
  const driver = await createDriver({ ...req.body, license_expiry: parseEatDateOnlyEnd(req.body.license_expiry) }, req.user!.id);
  res.status(201).json({ driver });
});

app.patch("/logistics/drivers/:id", requireAuth, requireLogisticsManager, async (req: AuthenticatedRequest, res) => {
  const driver = await updateDriver(req.params.id, { ...req.body, license_expiry: req.body.license_expiry ? parseEatDateOnlyEnd(req.body.license_expiry) : undefined }, req.user!.id);
  res.json({ driver });
});

app.post("/logistics/vehicles", requireAuth, requireLogisticsManager, async (req, res) => {
  const vehicle = await createVehicle(req.body);
  res.status(201).json({ vehicle });
});

app.post("/logistics/trips", requireAuth, requireLogisticsManager, async (req: AuthenticatedRequest, res) => {
  const trip = await createTrip(
    {
      ...req.body,
      start_time: parseEatDateTime(req.body.start_time),
      expected_end_time: parseEatDateTime(req.body.expected_end_time),
      actual_end_time: req.body.actual_end_time ? parseEatDateTime(req.body.actual_end_time) : null,
    },
    req.user!.id
  );
  res.status(201).json({ trip });
});

app.patch(
  "/logistics/trips/:id",
  requireAuth,
  requireLogisticsManager,
  async (req: AuthenticatedRequest, res) => {
    const trip = await updateTrip(
      req.params.id,
      {
        ...req.body,
        start_time: req.body.start_time ? parseEatDateTime(req.body.start_time) : undefined,
        expected_end_time: req.body.expected_end_time
          ? parseEatDateTime(req.body.expected_end_time)
          : undefined,
        actual_end_time: req.body.actual_end_time ? parseEatDateTime(req.body.actual_end_time) : undefined,
      },
      req.user!.id
    );
    res.json({ trip });
  }
);

const requireWarehouseManager = requireRole(["director", "gm", "manager"]);

app.post("/warehouse/movements", requireAuth, requireWarehouseManager, async (req: AuthenticatedRequest, res) => {
  const movement = await createMovement({
    ...req.body,
    entry_date: parseEatDateOnlyStart(req.body.entry_date),
    exit_date: req.body.exit_date ? parseEatDateOnlyEnd(req.body.exit_date) : null,
  }, req.user!.id);
  res.status(201).json({ movement });
});

app.patch("/warehouse/movements/:id", requireAuth, requireWarehouseManager, async (req: AuthenticatedRequest, res) => {
  const movement = await updateMovement(req.params.id, { ...req.body, entry_date: req.body.entry_date ? parseEatDateOnlyStart(req.body.entry_date) : undefined, exit_date: req.body.exit_date ? parseEatDateOnlyEnd(req.body.exit_date) : undefined }, req.user!.id);
  res.json({ movement });
});

app.post("/warehouse/extensions", requireAuth, requireWarehouseManager, async (req: AuthenticatedRequest, res) => {
  const extension = await createExtension({ ...req.body, requested_date: parseEatDateOnlyStart(req.body.requested_date), extended_until: parseEatDateOnlyEnd(req.body.extended_until) }, req.user!.id);
  res.status(201).json({ extension });
});

app.patch("/warehouse/extensions/:id", requireAuth, requireWarehouseManager, async (req: AuthenticatedRequest, res) => {
  const extension = await updateExtension(req.params.id, { ...req.body, requested_date: req.body.requested_date ? parseEatDateOnlyStart(req.body.requested_date) : undefined, extended_until: req.body.extended_until ? parseEatDateOnlyEnd(req.body.extended_until) : undefined }, req.user!.id);
  res.json({ extension });
});

app.post("/warehouse/invoices", requireAuth, requireWarehouseManager, async (req: AuthenticatedRequest, res) => {
  const invoice = await createInvoice({ ...req.body, issued_date: parseEatDateOnlyStart(req.body.issued_date), due_date: parseEatDateOnlyEnd(req.body.due_date), paid_date: req.body.paid_date ? parseEatDateOnlyEnd(req.body.paid_date) : null }, req.user!.id);
  res.status(201).json({ invoice });
});

app.patch("/warehouse/invoices/:id", requireAuth, requireWarehouseManager, async (req: AuthenticatedRequest, res) => {
  const invoice = await updateInvoice(req.params.id, { ...req.body, issued_date: req.body.issued_date ? parseEatDateOnlyStart(req.body.issued_date) : undefined, due_date: req.body.due_date ? parseEatDateOnlyEnd(req.body.due_date) : undefined, paid_date: req.body.paid_date ? parseEatDateOnlyEnd(req.body.paid_date) : undefined }, req.user!.id);
  res.json({ invoice });
});

const requireMachineryManager = requireRole(["director", "gm", "manager"]);

app.post("/machinery/machines", requireAuth, requireMachineryManager, async (req: AuthenticatedRequest, res) => {
  const machine = await createMachine({ ...req.body, last_status_change_at: parseEatDateTime(req.body.last_status_change_at) }, req.user!.id);
  res.status(201).json({ machine });
});

app.patch("/machinery/machines/:id", requireAuth, requireMachineryManager, async (req: AuthenticatedRequest, res) => {
  const machine = await updateMachine(req.params.id, { ...req.body, last_status_change_at: req.body.last_status_change_at ? parseEatDateTime(req.body.last_status_change_at) : undefined }, req.user!.id);
  res.json({ machine });
});

app.post(
  "/logistics/permits",
  requireAuth,
  requireLogisticsManager,
  async (req: AuthenticatedRequest, res) => {
    const permit = await createPermit(
      {
        ...req.body,
        issue_date: parseEatDateOnlyStart(req.body.issue_date),
        expiry_date: parseEatDateOnlyEnd(req.body.expiry_date),
      },
      req.user!.id
    );
    res.status(201).json({ permit });
  }
);

app.patch(
  "/logistics/permits/:id",
  requireAuth,
  requireLogisticsManager,
  async (req: AuthenticatedRequest, res) => {
    const permit = await updatePermit(
      req.params.id,
      {
        ...req.body,
        issue_date: req.body.issue_date ? parseEatDateOnlyStart(req.body.issue_date) : undefined,
        expiry_date: req.body.expiry_date ? parseEatDateOnlyEnd(req.body.expiry_date) : undefined,
      },
      req.user!.id
    );
    res.json({ permit });
  }
);

app.post(
  "/logistics/maintenance-records",
  requireAuth,
  requireLogisticsManager,
  async (req: AuthenticatedRequest, res) => {
    const maintenanceRecord = await createMaintenanceRecord(
      {
        ...req.body,
        scheduled_date: parseEatDateOnlyEnd(req.body.scheduled_date),
        completed_date: req.body.completed_date ? parseEatDateOnlyEnd(req.body.completed_date) : null,
      },
      req.user!.id
    );
    res.status(201).json({ maintenanceRecord });
  }
);

app.patch(
  "/logistics/maintenance-records/:id",
  requireAuth,
  requireLogisticsManager,
  async (req: AuthenticatedRequest, res) => {
    const maintenanceRecord = await updateMaintenanceRecord(
      req.params.id,
      {
        ...req.body,
        scheduled_date: req.body.scheduled_date ? parseEatDateOnlyEnd(req.body.scheduled_date) : undefined,
        completed_date: req.body.completed_date ? parseEatDateOnlyEnd(req.body.completed_date) : undefined,
      },
      req.user!.id
    );
    res.json({ maintenanceRecord });
  }
);

app.use(notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
  if (process.env.DISABLE_ALERT_CRON !== "true") {
    scheduleAlertEngine();
  }
  if (process.env.DISABLE_DIGEST_CRON !== "true") {
    scheduleWeeklyDigest();
  }

  app.listen(port, host, () => {
    console.log(`AJS API listening on http://${host}:${port}`);
  });
}

export default app;
