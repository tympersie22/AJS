import { prisma } from "../data/prisma";
import { runAlertEngine } from "../alerts/engine";
import { updateMachine } from "../machinery/service";

async function main() {
  const director = await prisma.user.findUniqueOrThrow({ where: { email: "director@ajs.local" } });
  const machines = await prisma.machine.findMany({ orderBy: { asset_tag: "asc" } });
  const watchedItems = await prisma.watchedItem.findMany({ where: { subsidiary: "machinery" }, orderBy: { threshold_value: "asc" } });
  const firstAlerts = await prisma.alert.findMany({ where: { subsidiary: "machinery" }, orderBy: { priority: "asc" } });

  console.log("Phase 4 initial machine_status wiring:");
  for (const item of watchedItems) {
    const alert = firstAlerts.find((candidate) => candidate.watched_item_id === item.id);
    console.log(`- ${item.title} | status=${item.status} | days_idle=${item.threshold_value?.toFixed(2)} | alert=${alert?.priority}:${alert?.status}`);
  }

  if (machines.length !== 2 || watchedItems.length !== 2 || firstAlerts.length !== 2) throw new Error("Expected two machines, watched items, and alerts");
  if (!firstAlerts.some((alert) => alert.priority === "medium") || !firstAlerts.some((alert) => alert.priority === "high")) throw new Error("Expected medium and high idle alerts");

  const duplicateRunCreated = await runAlertEngine();
  const countAfterDuplicateRun = await prisma.alert.count({ where: { subsidiary: "machinery" } });
  console.log(`duplicate_run_created=${duplicateRunCreated} | alert_count=${countAfterDuplicateRun}`);
  if (duplicateRunCreated !== 0 || countAfterDuplicateRun !== 2) throw new Error("Machine alert deduplication failed");

  const mediumMachine = machines.find((machine) => machine.asset_tag === "MCH-0001")!;
  await updateMachine(mediumMachine.id, { status: "successful", last_status_change_at: new Date() }, director.id);
  await runAlertEngine();
  const clearedItem = await prisma.watchedItem.findUniqueOrThrow({ where: { item_type_reference_id: { item_type: "machine_status", reference_id: mediumMachine.id } } });
  const clearedAlert = await prisma.alert.findFirstOrThrow({ where: { watched_item_id: clearedItem.id }, include: { events: { orderBy: { created_at: "asc" } } } });
  const autoResolution = clearedAlert.events.find((event) => event.event_type === "auto_resolved");
  console.log(`Status-change resolution: ${mediumMachine.asset_tag} | watched_status=${clearedItem.status} | alert_status=${clearedAlert.status} | resolved_by=${autoResolution?.actor} | resolved_at=${autoResolution?.created_at.toISOString()}`);
  if (clearedItem.status !== "successful" || clearedAlert.status !== "resolved" || autoResolution?.actor !== "system") throw new Error("Machine alert did not auto-resolve after leaving idle");
  console.log("Phase 4 verification passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
