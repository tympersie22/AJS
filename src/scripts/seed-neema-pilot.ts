import { runAlertEngine } from "../alerts/engine";
import { hashPassword } from "../auth/passwords";
import { prisma } from "../data/prisma";
import { upsertUser } from "../data/store";
import { createDriver, createTrip, updateDriver, updateTrip } from "../logistics/service";

const HOUR_MS = 60 * 60 * 1000;

async function main() {
  const now = new Date();
  const director = await prisma.user.findUniqueOrThrow({ where: { email: "director@ajs.local" } });
  const neemaUser = await upsertUser({
    name: "Neema Peter Kileo",
    email: "driver.neema@ajs.local",
    password_hash: hashPassword("Password123!"),
    role: "driver",
    subsidiary: "logistics",
  });
  await prisma.driver.updateMany({ where: { user_id: neemaUser.id }, data: { user_id: null } });

  const existingDriver = await prisma.driver.findUnique({ where: { license_number: "NEEMA-PILOT-001" } });
  const driver = existingDriver
    ? await updateDriver(existingDriver.id, {
        name: "Neema Peter Kileo",
        license_expiry: new Date(now.getTime() + 365 * 24 * HOUR_MS),
        phone: "+255700000001",
        status: "active",
        user: { connect: { id: neemaUser.id } },
      }, director.id)
    : await createDriver({
        name: "Neema Peter Kileo",
        license_number: "NEEMA-PILOT-001",
        license_expiry: new Date(now.getTime() + 365 * 24 * HOUR_MS),
        phone: "+255700000001",
        status: "active",
        user: { connect: { id: neemaUser.id } },
      }, director.id);

  const vehicle = await prisma.vehicle.upsert({
    where: { plate_number: "T456 DEF" },
    create: { plate_number: "T456 DEF", type: "truck", subsidiary_owned: true, status: "active" },
    update: { type: "truck", subsidiary_owned: true, status: "active" },
  });

  const existingTrip = await prisma.trip.findFirst({
    where: { driver_id: driver.id, vehicle_id: vehicle.id, destination: "Zanzibar Ferry Terminal" },
  });
  const tripData = {
    driver_id: driver.id,
    vehicle_id: vehicle.id,
    origin: "Dar es Salaam",
    destination: "Zanzibar Ferry Terminal",
    start_time: new Date(now.getTime() - 2 * HOUR_MS),
    expected_end_time: new Date(now.getTime() - HOUR_MS),
    actual_end_time: null,
    gps_status: "active",
    status: "in_progress",
  };
  const trip = existingTrip
    ? await updateTrip(existingTrip.id, tripData, director.id)
    : await createTrip(tripData, director.id);

  const createdAlerts = await runAlertEngine(now);
  const watchedItem = await prisma.watchedItem.findUniqueOrThrow({
    where: { item_type_reference_id: { item_type: "trip", reference_id: trip.id } },
    include: { alerts: { where: { status: "open" } } },
  });
  const alert = watchedItem.alerts[0];
  if (!alert || alert.priority !== "high") throw new Error("Neema's overdue trip did not produce a high alert");

  console.log(`driver=${driver.name} | user=${neemaUser.email}`);
  console.log(`vehicle=${vehicle.plate_number} | status=${vehicle.status}`);
  console.log(`trip=${trip.origin} -> ${trip.destination} | status=${trip.status}`);
  console.log(`start=${trip.start_time.toISOString()} | expected_end=${trip.expected_end_time.toISOString()}`);
  console.log(`engine_created=${createdAlerts} | alert_priority=${alert.priority} | alert_status=${alert.status}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
