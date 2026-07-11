import { runAlertEngine } from "../alerts/engine";
import { prisma } from "../data/prisma";
import { createExtension, createInvoice, createMovement } from "../warehouse/service";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function main() {
  const director = await prisma.user.findUniqueOrThrow({ where: { email: "director@ajs.local" } });
  const now = new Date();

  await prisma.alert.deleteMany({ where: { subsidiary: "warehouse" } });
  await prisma.watchedItem.deleteMany({ where: { subsidiary: "warehouse" } });
  await prisma.invoice.deleteMany();
  await prisma.extension.deleteMany();
  await prisma.movement.deleteMany();

  const movement = await createMovement({
    type: "carry_in",
    item_category: "truck",
    reference_number: "BW-2026-0001",
    entry_date: addDays(now, -20),
    exit_date: null,
    status: "in_storage",
  }, director.id);
  const extension = await createExtension({ movement_id: movement.id, requested_date: now, extended_until: addDays(now, 1), status: "pending" }, director.id);
  const invoice = await createInvoice({ movement_id: movement.id, amount: "2750000.00", issued_date: addDays(now, -20), due_date: addDays(now, -8), paid_date: null, status: "overdue" }, director.id);

  console.log(`Seeded movement=${movement.id} reference=${movement.reference_number}`);
  console.log(`Seeded extension=${extension.id} deadline=within 1 day`);
  console.log(`Seeded invoice=${invoice.id} overdue=8 days`);
  console.log(`Alert engine created ${await runAlertEngine(now)} Phase 3 alerts.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
