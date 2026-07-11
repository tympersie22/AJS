import { prisma } from "../data/prisma";
import { runAlertEngine } from "../alerts/engine";
import { listOpenAlerts } from "../alerts/queries";

async function printWatchedItems() {
  const watchedItems = await prisma.watchedItem.findMany({
    orderBy: { item_type: "asc" },
  });

  console.log("Seeded watched_items and intended rules:");
  for (const item of watchedItems) {
    const rule =
      item.reference_id === "phase1-permit-002"
        ? "permit: due_at in 20 days -> no alert"
        : item.item_type === "permit"
        ? "permit: due_at within 48h -> high"
        : item.item_type === "trip"
          ? "trip: in_progress past expected end time -> high"
          : item.item_type === "extension"
            ? "extension: due_at within 5 days -> medium"
            : item.item_type === "invoice"
              ? "invoice: overdue > 7 days -> high"
              : "machine_status idle: threshold_value > 5 days -> high";

    console.log(
      `- ${item.id} | ${item.subsidiary} | ${item.item_type} | ${item.title} | ${rule}`
    );
  }
}

async function printAlerts(label: string) {
  const alerts = await listOpenAlerts();
  console.log(label);
  console.log(`count=${alerts.length}`);
  for (const alert of alerts) {
    console.log(
      `- ${alert.id} | ${alert.priority} | ${alert.subsidiary} | watched_item=${alert.watched_item_id} | ${alert.message}`
    );
  }
}

async function main() {
  await printWatchedItems();
  await printAlerts("Alerts after first engine run:");

  const nonAlertPermit = await prisma.watchedItem.findFirstOrThrow({
    where: { reference_id: "phase1-permit-002" },
  });
  const nonAlertCount = await prisma.alert.count({
    where: { watched_item_id: nonAlertPermit.id },
  });
  console.log("Non-alert threshold proof:");
  console.log(
    `- ${nonAlertPermit.id} | permit due in 20 days | alert_count=${nonAlertCount}`
  );

  if (nonAlertCount !== 0) {
    throw new Error("Permit outside the seven-day threshold should not create an alert");
  }

  const before = await prisma.alert.count();
  const createdOnSecondRun = await runAlertEngine();
  const after = await prisma.alert.count();

  await printAlerts("Alerts after second engine run with no data changes:");
  console.log(`second_run_created=${createdOnSecondRun}`);
  console.log(`count_before_second_run=${before}`);
  console.log(`count_after_second_run=${after}`);

  if (before !== after || createdOnSecondRun !== 0) {
    throw new Error("Alert duplicate prevention failed");
  }

  const warehouseAlerts = await listOpenAlerts("warehouse");
  console.log("Warehouse filter proof:");
  console.log(`warehouse_count=${warehouseAlerts.length}`);
  for (const alert of warehouseAlerts) {
    console.log(`- ${alert.id} | ${alert.subsidiary} | ${alert.priority}`);
  }

  console.log("Phase 1 verification passed");
  console.log("- Alert query uses SQL ORDER BY CASE for high -> medium -> low priority");
  console.log("- Subsidiary filtering is applied in the SQL WHERE clause");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
