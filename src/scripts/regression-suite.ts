import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { AlertPriority, Subsidiary, WatchedItem } from "@prisma/client";
import app from "../server";
import { issueToken } from "../auth/tokens";
import { hashPassword } from "../auth/passwords";
import { prisma } from "../data/prisma";
import { runAlertEngine } from "../alerts/engine";
import { evaluateWatchedItem } from "../alerts/rules";
import { DEFAULT_ALERT_THRESHOLDS } from "../alerts/thresholds";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const now = new Date("2026-07-09T09:00:00.000Z");

type ExpectedPriority = AlertPriority | null;

function dateFromNow(ms: number) {
  return new Date(now.getTime() + ms);
}

function watchedItem(input: Partial<WatchedItem> & Pick<WatchedItem, "item_type" | "title">): WatchedItem {
  return {
    id: input.id ?? `test-${Math.random()}`,
    subsidiary: input.subsidiary ?? Subsidiary.logistics,
    item_type: input.item_type,
    reference_id: input.reference_id ?? null,
    title: input.title,
    status: input.status ?? "active",
    due_at: input.due_at ?? null,
    threshold_value: input.threshold_value ?? null,
    owner_user_id: input.owner_user_id ?? "test-owner",
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? now,
  };
}

function expectPriority(label: string, item: WatchedItem, expected: ExpectedPriority) {
  const result = evaluateWatchedItem(item, now, DEFAULT_ALERT_THRESHOLDS);
  assert.equal(result?.priority ?? null, expected, label);
}

function testAlertRules() {
  expectPriority("permit no alert", watchedItem({ item_type: "permit", title: "Permit no", due_at: dateFromNow(8 * DAY_MS) }), null);
  expectPriority("permit medium", watchedItem({ item_type: "permit", title: "Permit medium", due_at: dateFromNow(5 * DAY_MS) }), "medium");
  expectPriority("permit high", watchedItem({ item_type: "permit", title: "Permit high", due_at: dateFromNow(2 * HOUR_MS) }), "high");

  expectPriority("trip no alert", watchedItem({ item_type: "trip", title: "Trip no", status: "scheduled", due_at: dateFromNow(-HOUR_MS) }), null);
  expectPriority("trip future no alert", watchedItem({ item_type: "trip", title: "Trip future", status: "in_progress", due_at: dateFromNow(HOUR_MS) }), null);
  expectPriority("trip high", watchedItem({ item_type: "trip", title: "Trip high", status: "in_progress", due_at: dateFromNow(-HOUR_MS) }), "high");

  expectPriority("extension no alert", watchedItem({ item_type: "extension", title: "Extension no", due_at: dateFromNow(6 * DAY_MS) }), null);
  expectPriority("extension medium", watchedItem({ item_type: "extension", title: "Extension medium", due_at: dateFromNow(4 * DAY_MS) }), "medium");
  expectPriority("extension high", watchedItem({ item_type: "extension", title: "Extension high", due_at: dateFromNow(DAY_MS) }), "high");

  expectPriority("invoice no alert", watchedItem({ item_type: "invoice", title: "Invoice no", due_at: dateFromNow(DAY_MS) }), null);
  expectPriority("invoice medium", watchedItem({ item_type: "invoice", title: "Invoice medium", due_at: dateFromNow(-2 * DAY_MS) }), "medium");
  expectPriority("invoice high", watchedItem({ item_type: "invoice", title: "Invoice high", due_at: dateFromNow(-8 * DAY_MS) }), "high");

  expectPriority("machine idle no alert", watchedItem({ item_type: "machine_status", title: "Machine no", status: "successful", threshold_value: 10 }), null);
  expectPriority("machine idle medium", watchedItem({ item_type: "machine_status", title: "Machine medium", status: "idle", threshold_value: 3 }), "medium");
  expectPriority("machine idle high", watchedItem({ item_type: "machine_status", title: "Machine high", status: "idle", threshold_value: 6 }), "high");

  expectPriority("driver license no alert", watchedItem({ item_type: "permit", title: "Driver License no", due_at: dateFromNow(8 * DAY_MS) }), null);
  expectPriority("driver license medium", watchedItem({ item_type: "permit", title: "Driver License medium", due_at: dateFromNow(5 * DAY_MS) }), "medium");
  expectPriority("driver license high", watchedItem({ item_type: "permit", title: "Driver License high", due_at: dateFromNow(2 * HOUR_MS) }), "high");

  expectPriority("bonded storage no alert", watchedItem({ item_type: "extension", title: "Bonded Storage Limit no", due_at: dateFromNow(6 * DAY_MS), subsidiary: Subsidiary.warehouse }), null);
  expectPriority("bonded storage medium", watchedItem({ item_type: "extension", title: "Bonded Storage Limit medium", due_at: dateFromNow(4 * DAY_MS), subsidiary: Subsidiary.warehouse }), "medium");
  expectPriority("bonded storage high", watchedItem({ item_type: "extension", title: "Bonded Storage Limit high", due_at: dateFromNow(DAY_MS), subsidiary: Subsidiary.warehouse }), "high");

  expectPriority("maintenance no alert", watchedItem({ item_type: "maintenance", title: "Maintenance no", due_at: dateFromNow(8 * DAY_MS) }), null);
  expectPriority("maintenance medium", watchedItem({ item_type: "maintenance", title: "Maintenance medium", due_at: dateFromNow(5 * DAY_MS) }), "medium");
  expectPriority("maintenance high", watchedItem({ item_type: "maintenance", title: "Maintenance high", due_at: dateFromNow(2 * HOUR_MS) }), "high");
}

async function seedUser(email: string, role: "director" | "manager", subsidiary: string | null) {
  return prisma.user.upsert({
    where: { email },
    create: {
      name: `Regression ${role}`,
      email,
      password_hash: hashPassword("Password123!"),
      role,
      subsidiary,
      is_active: true,
    },
    update: {
      role,
      subsidiary,
      is_active: true,
    },
  });
}

async function testEngineLifecycle(suffix: string, ownerUserId: string) {
  const referenceId = `regression-duplicate-${suffix}`;
  const item = await prisma.watchedItem.create({
    data: {
      subsidiary: "logistics",
      item_type: "permit",
      reference_id: referenceId,
      title: `Regression duplicate ${suffix}`,
      status: "active",
      due_at: dateFromNow(HOUR_MS),
      owner_user_id: ownerUserId,
    },
  });

  await runAlertEngine(now);
  await runAlertEngine(now);

  const activeAlerts = await prisma.alert.findMany({
    where: { watched_item_id: item.id, status: { in: ["open", "acknowledged"] } },
  });
  assert.equal(activeAlerts.length, 1, "running the engine twice must not create duplicate active alerts");

  await prisma.watchedItem.update({
    where: { id: item.id },
    data: { due_at: dateFromNow(30 * DAY_MS) },
  });
  await runAlertEngine(now);

  const resolvedAlert = await prisma.alert.findUniqueOrThrow({
    where: { id: activeAlerts[0].id },
    include: { events: true },
  });
  assert.equal(resolvedAlert.status, "resolved", "clearing a watched condition should resolve the alert");
  assert.ok(
    resolvedAlert.events.some((event) => event.event_type === "auto_resolved" && event.actor === "system"),
    "auto-resolved alert should write a system audit event"
  );
}

async function startServer() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function request(baseUrl: string, path: string, token: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function testRoleScoping(suffix: string) {
  const warehouseManager = await seedUser(`regression.warehouse.${suffix}@ajs.local`, "manager", "warehouse");
  const logisticsDriver = await prisma.driver.create({
    data: {
      name: `Regression Driver ${suffix}`,
      license_number: `REG-${suffix}`,
      license_expiry: dateFromNow(365 * DAY_MS),
      phone: "+255700000000",
      status: "active",
    },
  });
  const token = issueToken({
    sub: warehouseManager.id,
    email: warehouseManager.email,
    role: warehouseManager.role,
    subsidiary: warehouseManager.subsidiary,
  });
  const { server, baseUrl } = await startServer();
  try {
    const checks = [
      ["/logistics", 403],
      ["/machinery", 403],
      ["/alerts?subsidiary=logistics", 403],
      [`/records/driver/${logisticsDriver.id}`, 403],
    ] as const;
    for (const [path, expectedStatus] of checks) {
      const response = await request(baseUrl, path, token);
      assert.equal(response.status, expectedStatus, `${path} should reject out-of-scope warehouse manager access`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function main() {
  console.log("WARNING: regression-suite seeds persistent fixture data and does not clean it up.");
  console.log("Run only against a local/staging/test database, never against real production data.");

  const suffix = Date.now().toString();
  const director = await seedUser(`regression.director.${suffix}@ajs.local`, "director", null);

  testAlertRules();
  console.log("✓ alert rule thresholds: permit, trip, extension, invoice, machine idle, driver license, bonded storage, maintenance");

  await testEngineLifecycle(suffix, director.id);
  console.log("✓ duplicate prevention and auto-resolve lifecycle");

  await testRoleScoping(suffix);
  console.log("✓ role scoping: logistics, machinery, alerts filter, and record detail endpoints reject out-of-scope access");

  console.log("Regression suite passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
