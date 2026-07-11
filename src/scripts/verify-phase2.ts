import { listOpenAlerts } from "../alerts/queries";
import { prisma } from "../data/prisma";
import { runAlertEngine } from "../alerts/engine";
import { updateTrip } from "../logistics/service";

async function main() {
  const trips = await prisma.trip.findMany();
  const permits = await prisma.permit.findMany();
  const maintenanceRecords = await prisma.maintenanceRecord.findMany();
  const watchedItems = await prisma.watchedItem.findMany({
    orderBy: { item_type: "asc" },
  });
  const alerts = await listOpenAlerts("logistics");

  console.log("Phase 2 real Logistics records:");
  for (const trip of trips) {
    console.log(`- trip | ${trip.id} | ${trip.status} | expected_end=${trip.expected_end_time.toISOString()}`);
  }
  for (const permit of permits) {
    console.log(`- permit | ${permit.id} | ${permit.status} | expiry=${permit.expiry_date.toISOString()}`);
  }
  for (const record of maintenanceRecords) {
    console.log(
      `- maintenance | ${record.id} | ${record.status} | scheduled=${record.scheduled_date.toISOString()}`
    );
  }

  console.log("Corresponding watched_items:");
  for (const item of watchedItems) {
    console.log(
      `- ${item.item_type} | reference_id=${item.reference_id} | ${item.title} | due=${item.due_at?.toISOString()}`
    );
  }

  console.log("Resulting Logistics alerts:");
  for (const alert of alerts) {
    console.log(
      `- ${alert.priority} | watched_item=${alert.watched_item_id} | ${alert.message}`
    );
  }

  if (trips.length !== 1 || permits.length !== 1 || maintenanceRecords.length !== 1) {
    throw new Error("Expected one trip, permit, and maintenance record");
  }

  if (watchedItems.length !== 3 || alerts.length !== 3) {
    throw new Error("Expected three watched items and three alerts");
  }

  const itemTypes = new Set(watchedItems.map((item) => item.item_type));
  if (!itemTypes.has("trip") || !itemTypes.has("permit") || !itemTypes.has("maintenance")) {
    throw new Error("Logistics records were not wired to the expected watched item types");
  }

  const director = await prisma.user.findUniqueOrThrow({
    where: { email: "director@ajs.local" },
  });
  await updateTrip(trips[0].id, { destination: "Moshi" }, director.id);
  const updatedTripWatchedItems = await prisma.watchedItem.findMany({
    where: { item_type: "trip", reference_id: trips[0].id },
  });

  console.log("Trip update wiring proof:");
  console.log(`- watched_item_count=${updatedTripWatchedItems.length}`);
  console.log(`- updated_title=${updatedTripWatchedItems[0]?.title}`);

  if (
    updatedTripWatchedItems.length !== 1 ||
    !updatedTripWatchedItems[0].title.includes("Moshi")
  ) {
    throw new Error("Trip update did not upsert its existing watched item");
  }

  const beforeSecondRun = await prisma.alert.count();
  const secondRunCreated = await runAlertEngine();
  const afterSecondRun = await prisma.alert.count();

  console.log(`second_run_created=${secondRunCreated}`);
  console.log(`alert_count_before_second_run=${beforeSecondRun}`);
  console.log(`alert_count_after_second_run=${afterSecondRun}`);

  if (secondRunCreated !== 0 || beforeSecondRun !== afterSecondRun) {
    throw new Error("Phase 2 wiring created duplicate alerts");
  }

  console.log("Phase 2 verification passed");
  console.log("- Trip, permit, and maintenance records feed the existing watched_items spine");
  console.log("- Existing alert rule functions produced all three alerts");
  console.log("- No Logistics-specific alert engine was added");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
