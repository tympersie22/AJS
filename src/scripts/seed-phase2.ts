import { runAlertEngine } from "../alerts/engine";
import { prisma } from "../data/prisma";
import {
  createDriver,
  createMaintenanceRecord,
  createPermit,
  createTrip,
  createVehicle,
} from "../logistics/service";

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

async function main() {
  const director = await prisma.user.findUniqueOrThrow({
    where: { email: "director@ajs.local" },
  });
  const now = new Date();

  await prisma.alert.deleteMany();
  await prisma.watchedItem.deleteMany();
  await prisma.maintenanceRecord.deleteMany();
  await prisma.permit.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.driver.deleteMany();

  const driver = await createDriver({
    name: "Neema Mushi",
    license_number: "TZ-DL-2048",
    license_expiry: addDays(now, 365),
    phone: "+255700000001",
    status: "active",
  }, director.id);

  const vehicle = await createVehicle({
    plate_number: "TZ123ABC",
    type: "truck",
    subsidiary_owned: true,
    status: "active",
  });

  const trip = await createTrip(
    {
      driver_id: driver.id,
      vehicle_id: vehicle.id,
      origin: "Dar es Salaam",
      destination: "Arusha",
      start_time: addDays(now, -2),
      expected_end_time: addDays(now, -1),
      actual_end_time: null,
      gps_status: "placeholder",
      status: "in_progress",
    },
    director.id
  );

  const permit = await createPermit(
    {
      vehicle_id: vehicle.id,
      permit_type: "Import Permit",
      issue_date: addDays(now, -30),
      expiry_date: addDays(now, 1),
      status: "active",
    },
    director.id
  );

  const maintenanceRecord = await createMaintenanceRecord(
    {
      vehicle_id: vehicle.id,
      type: "inspection",
      scheduled_date: addDays(now, 1),
      completed_date: null,
      status: "scheduled",
      notes: "Phase 2 acceptance inspection",
    },
    director.id
  );

  console.log("Seeded Phase 2 Logistics records:");
  console.log(`- driver=${driver.id} | ${driver.name} | ${driver.license_number}`);
  console.log(`- vehicle=${vehicle.id} | ${vehicle.plate_number} | ${vehicle.type}`);
  console.log(`- trip=${trip.id} | overdue in_progress`);
  console.log(`- permit=${permit.id} | expires within 24h`);
  console.log(`- maintenance=${maintenanceRecord.id} | scheduled tomorrow`);

  const createdCount = await runAlertEngine(now);
  console.log(`Alert engine created ${createdCount} Phase 2 alerts.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
