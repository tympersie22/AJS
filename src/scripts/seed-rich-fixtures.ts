import { runAlertEngine } from "../alerts/engine";
import { prisma } from "../data/prisma";
import { createMachine } from "../machinery/service";
import { createExtension, createInvoice, createMovement } from "../warehouse/service";

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function main() {
  const director = await prisma.user.findUniqueOrThrow({ where: { email: "director@ajs.local" } });
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.alert.deleteMany({ where: { subsidiary: { in: ["warehouse", "machinery"] } } });
    await tx.watchedItem.deleteMany({ where: { subsidiary: { in: ["warehouse", "machinery"] } } });
    await tx.invoice.deleteMany();
    await tx.extension.deleteMany();
    await tx.movement.deleteMany();
    await tx.machine.deleteMany();
  });

  const movementDefinitions = [
    { type: "carry_in", item_category: "car", reference_number: "BW-RICH-001", entry_date: addDays(now, -20), exit_date: null, status: "in_storage" },
    { type: "carry_out", item_category: "machine", reference_number: "BW-RICH-002", entry_date: addDays(now, -30), exit_date: addDays(now, -2), status: "released" },
    { type: "carry_in", item_category: "truck", reference_number: "BW-RICH-003", entry_date: addDays(now, -12), exit_date: null, status: "in_storage" },
    { type: "carry_out", item_category: "car", reference_number: "BW-RICH-004", entry_date: addDays(now, -18), exit_date: addDays(now, -1), status: "released" },
    { type: "carry_in", item_category: "machine", reference_number: "BW-RICH-005", entry_date: addDays(now, -179), exit_date: null, status: "in_storage" },
  ];
  const movements = [];
  for (const definition of movementDefinitions) movements.push(await createMovement(definition, director.id));

  await createExtension({ movement_id: movements[0].id, requested_date: addDays(now, -2), extended_until: addDays(now, 1), status: "pending" }, director.id);
  await createExtension({ movement_id: movements[2].id, requested_date: now, extended_until: addDays(now, 10), status: "approved" }, director.id);
  await createInvoice({ movement_id: movements[0].id, amount: "3500000.00", issued_date: addDays(now, -20), due_date: addDays(now, -10), paid_date: null, status: "overdue" }, director.id);
  await createInvoice({ movement_id: movements[1].id, amount: "1800000.00", issued_date: addDays(now, -12), due_date: addDays(now, -3), paid_date: null, status: "overdue" }, director.id);
  await createInvoice({ movement_id: movements[4].id, amount: "925000.00", issued_date: now, due_date: addDays(now, 5), paid_date: null, status: "issued" }, director.id);

  const machineDefinitions = [
    { name: "Forklift Alpha", asset_tag: "MCH-RICH-001", subsidiary_location: "Kurasini Warehouse", status: "idle" as const, last_status_change_at: addDays(now, -3) },
    { name: "Crane Bravo", asset_tag: "MCH-RICH-002", subsidiary_location: "Dar Yard", status: "idle" as const, last_status_change_at: addDays(now, -6) },
    { name: "Loader Charlie", asset_tag: "MCH-RICH-003", subsidiary_location: "Kurasini Warehouse", status: "waiting" as const, last_status_change_at: addDays(now, -8) },
    { name: "Excavator Delta", asset_tag: "MCH-RICH-004", subsidiary_location: "Dar Yard", status: "successful" as const, last_status_change_at: addDays(now, -4) },
    { name: "Generator Echo", asset_tag: "MCH-RICH-005", subsidiary_location: "Kurasini Warehouse", status: "unsuccessful" as const, last_status_change_at: addDays(now, -7) },
  ];
  for (const definition of machineDefinitions) await createMachine(definition, director.id, now);

  console.log("Seeded Warehouse: 5 movements, 2 extensions, 3 invoices");
  console.log("Seeded Machinery: 5 machines across waiting/successful/unsuccessful/idle");
  console.log(`Alert engine created ${await runAlertEngine(now)} alerts.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
