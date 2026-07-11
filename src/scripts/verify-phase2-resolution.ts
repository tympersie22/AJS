import { evaluateWatchedItem } from "../alerts/rules";
import { prisma } from "../data/prisma";
import { runAlertEngine } from "../alerts/engine";
import { updatePermit, updateTrip } from "../logistics/service";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function main() {
  const director = await prisma.user.findUniqueOrThrow({ where: { email: "director@ajs.local" } });
  const trip = await prisma.trip.findFirstOrThrow({ where: { status: "in_progress" } });
  const permit = await prisma.permit.findFirstOrThrow({ where: { status: "active" } });
  const watchedItemsBefore = await prisma.watchedItem.findMany({
    where: { OR: [{ item_type: "trip", reference_id: trip.id }, { item_type: "permit", reference_id: permit.id }] },
  });
  const watchedItemIds = watchedItemsBefore.map((item) => item.id);
  const alertsBefore = await prisma.alert.findMany({ where: { watched_item_id: { in: watchedItemIds } } });

  console.log("Phase 2 resolution path before updates:");
  for (const item of watchedItemsBefore) {
    console.log(`- ${item.item_type} | status=${item.status} | due=${item.due_at?.toISOString()} | rule=${evaluateWatchedItem(item) ? "triggered" : "clear"}`);
  }
  console.log(`- alert_count=${alertsBefore.length} | statuses=${alertsBefore.map((alert) => alert.status).join(",")}`);

  const now = new Date();
  await updateTrip(trip.id, { status: "completed", actual_end_time: now }, director.id);
  await updatePermit(permit.id, { expiry_date: addDays(now, 90), status: "active" }, director.id);

  const watchedItemsAfter = await prisma.watchedItem.findMany({ where: { id: { in: watchedItemIds } } });
  const countBeforeEngine = await prisma.alert.count({ where: { watched_item_id: { in: watchedItemIds } } });
  const createdCount = await runAlertEngine(now);
  const alertsAfter = await prisma.alert.findMany({ where: { watched_item_id: { in: watchedItemIds } } });

  console.log("Phase 2 resolution path after updates:");
  for (const item of watchedItemsAfter) {
    console.log(`- ${item.item_type} | status=${item.status} | due=${item.due_at?.toISOString()} | rule=${evaluateWatchedItem(item, now) ? "triggered" : "clear"}`);
  }
  console.log(`- engine_created=${createdCount}`);
  console.log(`- alert_count_before_engine=${countBeforeEngine}`);
  console.log(`- alert_count_after_engine=${alertsAfter.length}`);
  console.log(`- alert_statuses_after_engine=${alertsAfter.map((alert) => `${alert.watched_item_id}:${alert.status}`).join(",")}`);

  if (watchedItemsAfter.some((item) => evaluateWatchedItem(item, now))) throw new Error("A cleared Logistics item still triggers a rule");
  if (countBeforeEngine !== alertsAfter.length) throw new Error("Engine generated an alert after conditions cleared");
  if (alertsAfter.some((alert) => alert.status !== "open")) throw new Error("Unexpected automatic status transition");

  console.log("Resolution behavior confirmed: watched items clear, no new alerts are generated, existing alerts remain open for manual handling.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
