import { prisma } from "../data/prisma";

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const alerts = await tx.alert.deleteMany({ where: { subsidiary: "logistics" } });
    const watchedItems = await tx.watchedItem.deleteMany({ where: { subsidiary: "logistics" } });
    const maintenance = await tx.maintenanceRecord.deleteMany();
    const permits = await tx.permit.deleteMany();
    const trips = await tx.trip.deleteMany();
    const vehicles = await tx.vehicle.deleteMany();
    const drivers = await tx.driver.deleteMany();
    return { alerts: alerts.count, watchedItems: watchedItems.count, maintenance: maintenance.count, permits: permits.count, trips: trips.count, vehicles: vehicles.count, drivers: drivers.count };
  });
  console.log(`Cleared fake Logistics data: ${JSON.stringify(result)}`);
  console.log(`Remaining users=${await prisma.user.count()}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
