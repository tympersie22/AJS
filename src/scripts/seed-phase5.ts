import { hashPassword } from "../auth/passwords";
import { runAlertEngine } from "../alerts/engine";
import { prisma } from "../data/prisma";
import { upsertUser } from "../data/store";
import { createTrip, updateMaintenanceRecord } from "../logistics/service";

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function main() {
  const now = new Date();
  const passwordHash = hashPassword("Password123!");
  const manager = await upsertUser({ name: "Logistics Manager", email: "manager.logistics@ajs.local", password_hash: passwordHash, role: "manager", subsidiary: "logistics" });
  const accountant = await upsertUser({ name: "Warehouse Accountant", email: "accountant.warehouse@ajs.local", password_hash: passwordHash, role: "accountant", subsidiary: "warehouse" });
  const driverUser = await upsertUser({ name: "Neema Driver", email: "driver.neema@ajs.local", password_hash: passwordHash, role: "driver", subsidiary: "logistics" });

  const primaryDriver = await prisma.driver.findUniqueOrThrow({ where: { license_number: "TZ-DL-2048" } });
  await prisma.driver.update({ where: { id: primaryDriver.id }, data: { user_id: driverUser.id } });

  const otherDriver = await prisma.driver.upsert({
    where: { license_number: "TZ-DL-4096" },
    create: { name: "Juma Kweka", license_number: "TZ-DL-4096", license_expiry: addDays(now, 300), phone: "+255700000002", status: "active" },
    update: { name: "Juma Kweka", status: "active" },
  });
  const otherVehicle = await prisma.vehicle.upsert({
    where: { plate_number: "TZ987XYZ" },
    create: { plate_number: "TZ987XYZ", type: "truck", subsidiary_owned: true, status: "active" },
    update: { status: "active" },
  });
  const existingOtherTrip = await prisma.trip.findFirst({ where: { driver_id: otherDriver.id, destination: "Tanga" } });
  const otherTrip = existingOtherTrip ?? await createTrip({ driver_id: otherDriver.id, vehicle_id: otherVehicle.id, origin: "Dar es Salaam", destination: "Tanga", start_time: now, expected_end_time: addDays(now, 1), actual_end_time: null, gps_status: "placeholder", status: "scheduled" }, manager.id);

  const maintenance = await prisma.maintenanceRecord.findFirst();
  if (maintenance) await updateMaintenanceRecord(maintenance.id, { scheduled_date: addDays(now, 1), status: "scheduled", completed_date: null }, manager.id);
  await runAlertEngine(now);

  console.log("Seeded Phase 5 users (password: Password123!):");
  console.log(`- manager=${manager.id} | ${manager.email} | subsidiary=logistics`);
  console.log(`- accountant=${accountant.id} | ${accountant.email} | subsidiary=warehouse`);
  console.log(`- driver_user=${driverUser.id} | ${driverUser.email} | linked_driver=${primaryDriver.id}`);
  console.log(`- other_driver=${otherDriver.id} | unlinked | excluded_trip=${otherTrip.id}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
