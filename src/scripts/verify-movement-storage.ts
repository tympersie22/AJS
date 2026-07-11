import { runAlertEngine } from "../alerts/engine";
import { listOpenAlerts } from "../alerts/queries";
import { prisma } from "../data/prisma";
import { BONDED_STORAGE_DAYS, createMovement, updateMovement } from "../warehouse/service";

const DAY_MS = 24 * 60 * 60 * 1000;
const TEST_REFERENCES = ["BW-STORAGE-179", "BW-STORAGE-176", "BW-STORAGE-090"];

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * DAY_MS);
}

async function clearPreviousTestRows() {
  const movements = await prisma.movement.findMany({
    where: { reference_number: { in: TEST_REFERENCES } },
    select: { id: true },
  });
  const movementIds = movements.map(({ id }) => id);
  if (movementIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    const watchedItems = await tx.watchedItem.findMany({
      where: { item_type: "extension", reference_id: { in: movementIds } },
      select: { id: true },
    });
    await tx.alert.deleteMany({ where: { watched_item_id: { in: watchedItems.map(({ id }) => id) } } });
    await tx.watchedItem.deleteMany({ where: { id: { in: watchedItems.map(({ id }) => id) } } });
    await tx.movement.deleteMany({ where: { id: { in: movementIds } } });
  });
}

async function main() {
  const now = new Date();
  const director = await prisma.user.findUniqueOrThrow({ where: { email: "director@ajs.local" } });
  await clearPreviousTestRows();

  const definitions = [
    { reference_number: TEST_REFERENCES[0], item_category: "car", daysAgo: 179 },
    { reference_number: TEST_REFERENCES[1], item_category: "truck", daysAgo: 176 },
    { reference_number: TEST_REFERENCES[2], item_category: "machine", daysAgo: 90 },
  ];
  const movements = [];
  for (const definition of definitions) {
    movements.push(await createMovement({
      type: "carry_in",
      item_category: definition.item_category,
      reference_number: definition.reference_number,
      entry_date: daysBefore(now, definition.daysAgo),
      exit_date: null,
      status: "in_storage",
    }, director.id, now));
  }

  await runAlertEngine(now);
  const watchedItems = await prisma.watchedItem.findMany({
    where: { item_type: "extension", reference_id: { in: movements.map(({ id }) => id) } },
    include: { alerts: { orderBy: { created_at: "asc" } } },
    orderBy: { due_at: "asc" },
  });

  console.log(`BONDED_STORAGE_DAYS=${BONDED_STORAGE_DAYS}`);
  console.log("Initial movement storage results:");
  for (const item of watchedItems) {
    const alert = item.alerts.find(({ status }) => status === "open");
    console.log(`- ${item.title} | due=${item.due_at?.toISOString()} | alert=${alert?.priority ?? "none"}`);
  }

  const expected = new Map([
    [movements[0].id, "high"],
    [movements[1].id, "medium"],
    [movements[2].id, "none"],
  ]);
  for (const item of watchedItems) {
    const actual = item.alerts.find(({ status }) => status === "open")?.priority ?? "none";
    if (actual !== expected.get(item.reference_id ?? "")) {
      throw new Error(`${item.title} expected ${expected.get(item.reference_id ?? "")} but got ${actual}`);
    }
  }

  await updateMovement(movements[0].id, { exit_date: now, status: "released" }, director.id, now);
  await runAlertEngine(now);
  const exitedWatch = await prisma.watchedItem.findUniqueOrThrow({
    where: { item_type_reference_id: { item_type: "extension", reference_id: movements[0].id } },
    include: { alerts: { orderBy: { created_at: "asc" }, include: { events: { orderBy: { created_at: "asc" } } } } },
  });
  const exitedAlert = exitedWatch.alerts.at(-1);
  const autoResolution = exitedAlert?.events.find((event) => event.event_type === "auto_resolved");
  console.log("Exited movement resolution:");
  console.log(`- ${exitedWatch.title} | watch_status=${exitedWatch.status} | alert_status=${exitedAlert?.status} | resolved_by=${autoResolution?.actor} | resolved_at=${autoResolution?.created_at.toISOString()}`);
  if (exitedWatch.status !== "released" || exitedAlert?.status !== "resolved" || autoResolution?.actor !== "system") {
    throw new Error("Exited carry-in did not system-resolve its watched item and alert");
  }

  const [allAlerts, logisticsAlerts, warehouseAlerts, machineryAlerts] = await Promise.all([
    listOpenAlerts(),
    listOpenAlerts("logistics"),
    listOpenAlerts("warehouse"),
    listOpenAlerts("machinery"),
  ]);
  console.log("Full open alert set (query sorted high -> medium -> low):");
  for (const alert of allAlerts) console.log(`- ${alert.priority} | ${alert.subsidiary} | ${alert.message}`);
  console.log(`filter_counts logistics=${logisticsAlerts.length} warehouse=${warehouseAlerts.length} machinery=${machineryAlerts.length}`);
  console.log("Movement storage verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
