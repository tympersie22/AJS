import { evaluateWatchedItem } from "../alerts/rules";
import { prisma } from "../data/prisma";
import { runAlertEngine } from "../alerts/engine";

async function main() {
  const movement = await prisma.movement.findFirstOrThrow({ include: { extensions: true, invoices: true } });
  const watchedItems = await prisma.watchedItem.findMany({ where: { subsidiary: "warehouse", reference_id: { not: null } }, orderBy: { item_type: "asc" } });
  const alertsBefore = await prisma.alert.findMany({ where: { subsidiary: "warehouse", watched_item_id: { in: watchedItems.map((item) => item.id) } }, orderBy: { priority: "asc" } });

  console.log(`Movement: ${movement.reference_number} | ${movement.type} | ${movement.item_category} | ${movement.status}`);
  console.log("Warehouse watched_items and existing Phase 1 rule results:");
  for (const item of watchedItems) console.log(`- ${item.item_type} | reference_id=${item.reference_id} | due=${item.due_at?.toISOString()} | priority=${evaluateWatchedItem(item)?.priority}`);
  console.log("Warehouse alerts after first engine run:");
  for (const alert of alertsBefore) console.log(`- ${alert.priority} | ${alert.message} | status=${alert.status}`);

  const beforeSecondRun = await prisma.alert.count({ where: { subsidiary: "warehouse" } });
  const secondRunCreated = await runAlertEngine();
  const afterSecondRun = await prisma.alert.count({ where: { subsidiary: "warehouse" } });
  console.log(`second_run_created=${secondRunCreated}`);
  console.log(`warehouse_alert_count_before_second_run=${beforeSecondRun}`);
  console.log(`warehouse_alert_count_after_second_run=${afterSecondRun}`);

  if (movement.extensions.length !== 1 || movement.invoices.length !== 1) throw new Error("Expected one extension and invoice");
  if (watchedItems.length !== 2 || alertsBefore.length !== 2) throw new Error("Expected two warehouse watched items and alerts");
  if (!alertsBefore.every((alert) => alert.priority === "high")) throw new Error("Expected high priority extension and invoice alerts");
  if (secondRunCreated !== 0 || beforeSecondRun !== afterSecondRun) throw new Error("Duplicate warehouse alerts created");
  console.log("Phase 3 verification passed: real warehouse records feed the existing extension and invoice rules with no new alert logic.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
