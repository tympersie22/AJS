import { Prisma } from "@prisma/client";
import { prisma } from "../data/prisma";
import { appendAlertEvent } from "../alerts/lifecycle";
import { addEatCalendarDaysPreservingTime } from "../time/eat";
import { getAlertThresholdValues } from "../alerts/thresholds";

type TransactionClient = Prisma.TransactionClient;

// TRA/EAC bonded warehouse permitted storage period — 6 months per AJS operations
export const BONDED_STORAGE_DAYS = 180;

function watchedItemUpsert(
  tx: TransactionClient,
  data: {
    item_type: "extension" | "invoice";
    reference_id: string;
    title: string;
    status: string;
    due_at: Date;
    owner_user_id: string;
  }
) {
  return tx.watchedItem.upsert({
    where: {
      item_type_reference_id: {
        item_type: data.item_type,
        reference_id: data.reference_id,
      },
    },
    create: { subsidiary: "warehouse", ...data },
    update: {
      title: data.title,
      status: data.status,
      due_at: data.due_at,
      owner_user_id: data.owner_user_id,
    },
  });
}

function bondedStorageDeadline(entryDate: Date, bondedStorageDays = BONDED_STORAGE_DAYS): Date {
  // Alert windows are based on completed EAT storage days. The deadline instant is
  // the start of the day after the permitted storage period, preventing a
  // movement at 175 days + 23 hours from entering the 5-day alert window early.
  return addEatCalendarDaysPreservingTime(entryDate, bondedStorageDays + 1);
}

export async function createMovement(
  data: Prisma.MovementCreateInput,
  ownerUserId: string,
  now = new Date()
) {
  const thresholds = await getAlertThresholdValues();
  return prisma.$transaction(async (tx) => {
    const movement = await tx.movement.create({ data });
    await syncMovementWatchedItem(tx, movement, ownerUserId, now, thresholds.bonded_storage_days);
    return movement;
  });
}

export async function updateMovement(
  id: string,
  data: Prisma.MovementUpdateInput,
  ownerUserId: string,
  now = new Date()
) {
  const thresholds = await getAlertThresholdValues();
  return prisma.$transaction(async (tx) => {
    const movement = await tx.movement.update({ where: { id }, data });
    await syncMovementWatchedItem(tx, movement, ownerUserId, now, thresholds.bonded_storage_days);
    return movement;
  });
}

export async function upsertMovementByChassis(
  data: Prisma.MovementUncheckedCreateInput & { chassis_number: string },
  ownerUserId: string,
  now = new Date()
) {
  const thresholds = await getAlertThresholdValues();
  return prisma.$transaction(async (tx) => {
    const movement = await tx.movement.upsert({
      where: { chassis_number: data.chassis_number },
      create: data,
      update: data,
    });
    await syncMovementWatchedItem(tx, movement, ownerUserId, now, thresholds.bonded_storage_days);
    return movement;
  });
}

async function syncMovementWatchedItem(
  tx: TransactionClient,
  movement: { id: string; reference_number: string; item_category: string; type: string; status: string; entry_date: Date; exit_date: Date | null; chassis_number?: string | null },
  ownerUserId: string,
  now = new Date(),
  bondedStorageDays = BONDED_STORAGE_DAYS
) {
  const identifier = movement.chassis_number ? `${movement.reference_number} / ${movement.chassis_number}` : movement.reference_number;
  const title = `Bonded Storage Limit — ${identifier} (${movement.item_category})`;
  const activeCarryIn = movement.type === "carry_in" && movement.exit_date === null;

  if (activeCarryIn) {
    await watchedItemUpsert(tx, {
      item_type: "extension",
      reference_id: movement.id,
      title,
      status: movement.status,
      due_at: bondedStorageDeadline(movement.entry_date, bondedStorageDays),
      owner_user_id: ownerUserId,
    });
    return;
  }

  const watchedItem = await tx.watchedItem.findUnique({
    where: {
      item_type_reference_id: {
        item_type: "extension",
        reference_id: movement.id,
      },
    },
  });

  if (!watchedItem) return;

  await tx.watchedItem.update({
    where: { id: watchedItem.id },
    data: { title, status: "released", due_at: bondedStorageDeadline(movement.entry_date, bondedStorageDays) },
  });
  const openAlerts = await tx.alert.findMany({ where: { watched_item_id: watchedItem.id, status: "open" } });
  for (const alert of openAlerts) {
    await tx.alert.update({ where: { id: alert.id }, data: { status: "resolved" } });
    await appendAlertEvent(tx, alert.id, "auto_resolved", "system", now);
  }
}

export async function createExtension(
  data: Prisma.ExtensionUncheckedCreateInput,
  ownerUserId: string
) {
  const thresholds = await getAlertThresholdValues();
  return prisma.$transaction(async (tx) => {
    const extension = await tx.extension.create({
      data,
      include: { movement: true },
    });
    await syncExtensionWatchedItem(tx, extension, ownerUserId);
    await syncMovementWatchedItem(tx, extension.movement, ownerUserId, new Date(), thresholds.bonded_storage_days);
    return extension;
  });
}

export async function updateExtension(
  id: string,
  data: Prisma.ExtensionUncheckedUpdateInput,
  ownerUserId: string
) {
  const thresholds = await getAlertThresholdValues();
  return prisma.$transaction(async (tx) => {
    const extension = await tx.extension.update({
      where: { id },
      data,
      include: { movement: true },
    });
    await syncExtensionWatchedItem(tx, extension, ownerUserId);
    await syncMovementWatchedItem(tx, extension.movement, ownerUserId, new Date(), thresholds.bonded_storage_days);
    return extension;
  });
}

export async function refreshBondedStorageWatchedItems(now = new Date(), bondedStorageDays = BONDED_STORAGE_DAYS): Promise<void> {
  const movements = await prisma.movement.findMany({ where: { type: "carry_in" } });
  if (movements.length === 0) return;

  const existingItems = await prisma.watchedItem.findMany({
    where: { item_type: "extension", reference_id: { in: movements.map((movement) => movement.id) } },
    select: { reference_id: true, owner_user_id: true },
  });
  const ownersByReference = new Map(existingItems.map((item) => [item.reference_id, item.owner_user_id]));
  const fallbackOwner = await prisma.user.findFirstOrThrow({
    where: { role: { in: ["director", "gm", "manager"] } },
    orderBy: { created_at: "asc" },
  });

  await prisma.$transaction(async (tx) => {
    for (const movement of movements) {
      await syncMovementWatchedItem(
        tx,
        movement,
        ownersByReference.get(movement.id) ?? fallbackOwner.id,
        now,
        bondedStorageDays
      );
    }
  });
}

async function syncExtensionWatchedItem(
  tx: TransactionClient,
  extension: Prisma.ExtensionGetPayload<{ include: { movement: true } }>,
  ownerUserId: string
) {
  await watchedItemUpsert(tx, {
    item_type: "extension",
    reference_id: extension.id,
    title: `${extension.movement.reference_number} - bonded storage extension`,
    status: extension.status,
    due_at: extension.extended_until,
    owner_user_id: ownerUserId,
  });
}

export async function createInvoice(
  data: Prisma.InvoiceUncheckedCreateInput,
  ownerUserId: string
) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data,
      include: { movement: true },
    });
    await syncInvoiceWatchedItem(tx, invoice, ownerUserId);
    return invoice;
  });
}

export async function updateInvoice(
  id: string,
  data: Prisma.InvoiceUncheckedUpdateInput,
  ownerUserId: string
) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.update({
      where: { id },
      data,
      include: { movement: true },
    });
    await syncInvoiceWatchedItem(tx, invoice, ownerUserId);
    return invoice;
  });
}

async function syncInvoiceWatchedItem(
  tx: TransactionClient,
  invoice: Prisma.InvoiceGetPayload<{ include: { movement: true } }>,
  ownerUserId: string
) {
  await watchedItemUpsert(tx, {
    item_type: "invoice",
    reference_id: invoice.id,
    title: `${invoice.movement.reference_number} - warehouse invoice`,
    status: invoice.status,
    due_at: invoice.due_date,
    owner_user_id: ownerUserId,
  });
}
