import { readFile } from "fs/promises";
import { parseCsv } from "../imports/csv";
import { prisma } from "../data/prisma";
import { upsertDriverByLicense } from "../logistics/service";
import { parseEatDateOnlyEnd } from "../time/eat";

const DRIVER_STATUSES = ["active", "inactive", "suspended", "expired"] as const;
const VEHICLE_TYPES = ["truck", "car", "machine"] as const;
const VEHICLE_STATUSES = ["active", "inactive", "suspended", "maintenance"] as const;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(row: Record<string, string>, field: string, rowNumber: number): string {
  const value = row[field]?.trim();
  if (!value) throw new Error(`Row ${rowNumber}: ${field} is required`);
  return value;
}

async function main() {
  const driversPath = argument("--drivers");
  const vehiclesPath = argument("--vehicles");
  const dryRun = process.argv.includes("--dry-run");
  if (!driversPath && !vehiclesPath) throw new Error("Provide --drivers <csv>, --vehicles <csv>, or both");

  const driverRows = driversPath ? parseCsv(await readFile(driversPath, "utf8")) : [];
  const vehicleRows = vehiclesPath ? parseCsv(await readFile(vehiclesPath, "utf8")) : [];
  const drivers = driverRows.map((row, index) => {
    const licenseExpiry = parseEatDateOnlyEnd(required(row, "license_expiry", index + 2));
    if (Number.isNaN(licenseExpiry.getTime())) throw new Error(`Row ${index + 2}: license_expiry must be ISO date YYYY-MM-DD`);
    const status = required(row, "status", index + 2).toLowerCase();
    if (!DRIVER_STATUSES.includes(status as typeof DRIVER_STATUSES[number])) {
      throw new Error(`Row ${index + 2}: status must be one of: ${DRIVER_STATUSES.join(", ")}`);
    }
    return { name: required(row, "name", index + 2), license_number: required(row, "license_number", index + 2), license_expiry: licenseExpiry, phone: required(row, "phone", index + 2), status };
  });
  const vehicles = vehicleRows.map((row, index) => {
    const owned = required(row, "subsidiary_owned", index + 2).toLowerCase();
    if (!["true", "false"].includes(owned)) throw new Error(`Row ${index + 2}: subsidiary_owned must be true or false`);
    const type = required(row, "type", index + 2).toLowerCase();
    if (!VEHICLE_TYPES.includes(type as typeof VEHICLE_TYPES[number])) {
      throw new Error(`Row ${index + 2}: type must be one of: ${VEHICLE_TYPES.join(", ")}`);
    }
    const status = required(row, "status", index + 2).toLowerCase();
    if (!VEHICLE_STATUSES.includes(status as typeof VEHICLE_STATUSES[number])) {
      throw new Error(`Row ${index + 2}: status must be one of: ${VEHICLE_STATUSES.join(", ")}`);
    }
    return { plate_number: required(row, "plate_number", index + 2), type, subsidiary_owned: owned === "true", status };
  });

  console.log(`Validated drivers=${drivers.length} vehicles=${vehicles.length} dry_run=${dryRun}`);
  if (dryRun) return;
  const owner = await prisma.user.findFirstOrThrow({
    where: { role: { in: ["director", "gm", "manager"] } },
    orderBy: { created_at: "asc" },
  });
  for (const driver of drivers) await upsertDriverByLicense(driver, owner.id);
  await prisma.$transaction(vehicles.map((vehicle) => prisma.vehicle.upsert({ where: { plate_number: vehicle.plate_number }, create: vehicle, update: vehicle })));
  console.log("Logistics CSV import completed.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
