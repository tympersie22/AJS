import { prisma } from "../data/prisma";
import { runAlertEngine } from "../alerts/engine";

async function main() {
  const watchedItems = await prisma.watchedItem.findMany({
    where: { item_type: { in: ["trip", "permit"] }, reference_id: { not: null } },
  });
  const watchedItemIds = watchedItems.map((item) => item.id);
  const before = await prisma.alert.findMany({
    where: { watched_item_id: { in: watchedItemIds } },
    include: { events: { orderBy: { created_at: "asc" } } },
    orderBy: { created_at: "asc" },
  });

  console.log("Cleared Logistics alerts before auto-resolution sweep:");
  for (const item of watchedItems) {
    const alert = before.find((candidate) => candidate.watched_item_id === item.id);
    console.log(`- ${item.item_type} | watched_status=${item.status} | alert_status=${alert?.status} | events=${alert?.events.map((event) => event.event_type).join(",")}`);
  }

  const createdCount = await runAlertEngine();
  const after = await prisma.alert.findMany({ where: { watched_item_id: { in: watchedItemIds } }, include: { events: { orderBy: { created_at: "asc" } } } });

  console.log(`engine_created=${createdCount}`);
  console.log("Cleared Logistics alerts after auto-resolution sweep:");
  for (const item of watchedItems) {
    const alert = after.find((candidate) => candidate.watched_item_id === item.id);
    const resolution = alert?.events.find((event) => event.event_type === "auto_resolved");
    console.log(`- ${item.item_type} | alert_status=${alert?.status} | resolved_by=${resolution?.actor} | resolved_at=${resolution?.created_at.toISOString()}`);
  }

  if (before.length !== 2 || before.some((alert) => alert.status !== "open")) throw new Error("Expected two existing open Logistics alerts");
  if (after.length !== 2 || after.some((alert) => alert.status !== "resolved" || !alert.events.some((event) => event.event_type === "auto_resolved" && event.actor === "system"))) throw new Error("System auto-resolution failed");
  if (after.some((alert) => alert.events.some((event) => event.event_type === "acknowledged"))) throw new Error("Auto-resolution incorrectly used human acknowledgment events");
  console.log("Auto-resolution verification passed without human acknowledgment.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
