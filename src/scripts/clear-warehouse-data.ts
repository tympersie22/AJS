import { prisma } from "../data/prisma";

async function main() {
  const movementIds = (await prisma.movement.findMany({ select: { id: true } })).map((movement) => movement.id);
  const extensionIds = (await prisma.extension.findMany({ select: { id: true } })).map((extension) => extension.id);
  const invoiceIds = (await prisma.invoice.findMany({ select: { id: true } })).map((invoice) => invoice.id);
  const referenceIds = [...movementIds, ...extensionIds, ...invoiceIds];

  if (referenceIds.length === 0) {
    console.log("Warehouse is already empty.");
    return;
  }

  const watchedItems = await prisma.watchedItem.findMany({
    where: {
      subsidiary: "warehouse",
      reference_id: { in: referenceIds },
    },
    select: { id: true },
  });
  const watchedItemIds = watchedItems.map((item) => item.id);

  await prisma.$transaction(async (tx) => {
    if (watchedItemIds.length > 0) {
      await tx.alert.updateMany({
        where: { watched_item_id: { in: watchedItemIds }, status: "open" },
        data: { status: "resolved" },
      });
    }
    await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await tx.extension.deleteMany({ where: { id: { in: extensionIds } } });
    if (watchedItemIds.length > 0) {
      const retainedWatchedItems = await tx.watchedItem.findMany({
        where: { id: { in: watchedItemIds }, alerts: { some: {} } },
        select: { id: true },
      });
      const retainedIds = new Set(retainedWatchedItems.map((item) => item.id));
      await tx.watchedItem.deleteMany({ where: { id: { in: watchedItemIds.filter((id) => !retainedIds.has(id)) } } });
    }
    await tx.movement.deleteMany({ where: { id: { in: movementIds } } });
  });

  console.log(`Cleared Warehouse data: movements=${movementIds.length}, extensions=${extensionIds.length}, invoices=${invoiceIds.length}, watched_items=${watchedItemIds.length}.`);
  console.log("Existing audited alert rows were preserved; any open Warehouse alerts linked to cleared data were marked resolved.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
