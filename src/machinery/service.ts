import { Prisma } from "@prisma/client";
import { prisma } from "../data/prisma";

type TransactionClient = Prisma.TransactionClient;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(date: Date, now: Date): number {
  return Math.max(0, (now.getTime() - date.getTime()) / DAY_MS);
}

function syncMachineWatchedItem(
  tx: TransactionClient,
  machine: { id: string; name: string; asset_tag: string; status: string; last_status_change_at: Date },
  ownerUserId: string,
  now: Date
) {
  return tx.watchedItem.upsert({
    where: {
      item_type_reference_id: {
        item_type: "machine_status",
        reference_id: machine.id,
      },
    },
    create: {
      subsidiary: "machinery",
      item_type: "machine_status",
      reference_id: machine.id,
      title: `${machine.name} (${machine.asset_tag})`,
      status: machine.status,
      threshold_value: daysSince(machine.last_status_change_at, now),
      owner_user_id: ownerUserId,
    },
    update: {
      title: `${machine.name} (${machine.asset_tag})`,
      status: machine.status,
      threshold_value: daysSince(machine.last_status_change_at, now),
      owner_user_id: ownerUserId,
    },
  });
}

export async function createMachine(
  data: Prisma.MachineCreateInput,
  ownerUserId: string,
  now = new Date()
) {
  return prisma.$transaction(async (tx) => {
    const machine = await tx.machine.create({ data });
    await syncMachineWatchedItem(tx, machine, ownerUserId, now);
    return machine;
  });
}

export async function updateMachine(
  id: string,
  data: Prisma.MachineUpdateInput,
  ownerUserId: string,
  now = new Date()
) {
  return prisma.$transaction(async (tx) => {
    const machine = await tx.machine.update({ where: { id }, data });
    await syncMachineWatchedItem(tx, machine, ownerUserId, now);
    return machine;
  });
}

export async function refreshMachineWatchedItems(now = new Date()): Promise<void> {
  const machines = await prisma.machine.findMany();

  if (machines.length === 0) return;

  const existingItems = await prisma.watchedItem.findMany({
    where: { item_type: "machine_status", reference_id: { not: null } },
    select: { reference_id: true, owner_user_id: true },
  });
  const ownersByReference = new Map(existingItems.map((item) => [item.reference_id, item.owner_user_id]));
  const fallbackOwner = await prisma.user.findFirstOrThrow({
    where: { role: { in: ["director", "gm", "manager"] } },
    orderBy: { created_at: "asc" },
  });

  await prisma.$transaction(
    machines.map((machine) =>
      syncMachineWatchedItem(
        prisma,
        machine,
        ownersByReference.get(machine.id) ?? fallbackOwner.id,
        now
      )
    )
  );
}
