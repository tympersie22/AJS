import { prisma } from "../data/prisma";
import { runAlertEngine } from "../alerts/engine";

async function main() {
  const createdCount = await runAlertEngine();
  const drivers = await prisma.driver.findMany({ orderBy: { name: "asc" } });
  const watchedItems = await prisma.watchedItem.findMany({
    where: { item_type: "permit", reference_id: { in: drivers.map((driver) => driver.id) } },
  });
  const alerts = await prisma.alert.findMany({
    where: { watched_item_id: { in: watchedItems.map((item) => item.id) } },
  });

  console.log(`engine_created=${createdCount}`);
  console.log("Driver license watch results:");
  for (const driver of drivers) {
    const watchedItem = watchedItems.find((item) => item.reference_id === driver.id);
    const driverAlerts = alerts.filter((alert) => alert.watched_item_id === watchedItem?.id);
    console.log(`- ${driver.name} | expiry=${driver.license_expiry.toISOString().slice(0, 10)} | driver_status=${driver.status} | watched=${Boolean(watchedItem)} | alerts=${driverAlerts.length}${driverAlerts[0] ? ` | ${driverAlerts[0].priority}:${driverAlerts[0].status}` : ""}`);
  }

  const rashid = drivers.find((driver) => driver.name === "Rashid Omar Juma");
  const rashidWatch = watchedItems.find((item) => item.reference_id === rashid?.id);
  const rashidAlerts = alerts.filter((alert) => alert.watched_item_id === rashidWatch?.id);
  const otherDriverIds = new Set(drivers.filter((driver) => driver.id !== rashid?.id).map((driver) => driver.id));
  const otherWatchIds = watchedItems.filter((item) => item.reference_id && otherDriverIds.has(item.reference_id)).map((item) => item.id);
  if (watchedItems.length !== 5) throw new Error("Expected five driver license watched items");
  if (rashidAlerts.length !== 1 || rashidAlerts[0].priority !== "high" || rashidAlerts[0].status !== "open") throw new Error("Rashid's expired license did not produce one open high alert");
  if (alerts.some((alert) => otherWatchIds.includes(alert.watched_item_id))) throw new Error("A non-expiring driver license produced an alert");

  const allAlerts = await prisma.alert.groupBy({ by: ["subsidiary", "status"], _count: { _all: true } });
  const totalAlerts = await prisma.alert.count();
  const openAlerts = await prisma.alert.count({ where: { status: "open" } });
  console.log(`all_system_alert_rows=${totalAlerts} | open_alerts=${openAlerts}`);
  for (const group of allAlerts) console.log(`- ${group.subsidiary} | ${group.status} | ${group._count._all}`);
  console.log("Driver license alert verification passed using the existing permit rule.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
