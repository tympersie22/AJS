import { prisma } from "../data/prisma";
import { runAlertEngine } from "../alerts/engine";

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

  const watchedItems = await prisma.watchedItem.createManyAndReturn({
    data: [
      {
        subsidiary: "logistics",
        item_type: "permit",
        reference_id: "phase1-permit-001",
        title: "Truck TZ123ABC - Import Permit",
        status: "active",
        due_at: addDays(now, 1),
        owner_user_id: director.id,
      },
      {
        subsidiary: "logistics",
        item_type: "trip",
        reference_id: "phase1-trip-001",
        title: "Dar es Salaam to Arusha - Trip",
        status: "in_progress",
        due_at: addDays(now, -1),
        owner_user_id: director.id,
      },
      {
        subsidiary: "warehouse",
        item_type: "extension",
        reference_id: "phase1-extension-001",
        title: "Bonded Movement EXT-455",
        status: "pending",
        due_at: addDays(now, 4),
        owner_user_id: director.id,
      },
      {
        subsidiary: "warehouse",
        item_type: "invoice",
        reference_id: "phase1-invoice-001",
        title: "Warehouse Invoice INV-1008",
        status: "unpaid",
        due_at: addDays(now, -8),
        owner_user_id: director.id,
      },
      {
        subsidiary: "machinery",
        item_type: "machine_status",
        reference_id: "phase1-machine-001",
        title: "Excavator EX-22",
        status: "idle",
        threshold_value: 6,
        owner_user_id: director.id,
      },
      {
        subsidiary: "logistics",
        item_type: "permit",
        reference_id: "phase1-permit-002",
        title: "Truck TZ987XYZ - Transit Permit",
        status: "active",
        due_at: addDays(now, 20),
        owner_user_id: director.id,
      },
    ],
  });

  console.log("Seeded Phase 1 watched_items:");
  for (const item of watchedItems) {
    console.log(
      `- ${item.id} | ${item.subsidiary} | ${item.item_type} | ${item.title} | status=${item.status}`
    );
  }

  const createdCount = await runAlertEngine(now);
  console.log(`Alert engine created ${createdCount} alerts on first run.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
