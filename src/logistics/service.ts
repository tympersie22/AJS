import { Prisma } from "@prisma/client";
import { prisma } from "../data/prisma";

type TransactionClient = Prisma.TransactionClient;

function watchedItemUpsert(
  tx: TransactionClient,
  data: {
    item_type: string;
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
    create: {
      subsidiary: "logistics",
      ...data,
    },
    update: {
      title: data.title,
      status: data.status,
      due_at: data.due_at,
      owner_user_id: data.owner_user_id,
    },
  });
}

export async function createDriver(data: Prisma.DriverCreateInput, ownerUserId: string) {
  return prisma.$transaction(async (tx) => {
    const driver = await tx.driver.create({ data });
    await syncDriverLicenseWatchedItem(tx, driver, ownerUserId);
    return driver;
  });
}

export async function updateDriver(
  id: string,
  data: Prisma.DriverUpdateInput,
  ownerUserId: string
) {
  return prisma.$transaction(async (tx) => {
    const driver = await tx.driver.update({ where: { id }, data });
    await syncDriverLicenseWatchedItem(tx, driver, ownerUserId);
    return driver;
  });
}

export async function upsertDriverByLicense(
  data: Prisma.DriverCreateInput,
  ownerUserId: string
) {
  return prisma.$transaction(async (tx) => {
    const driver = await tx.driver.upsert({
      where: { license_number: data.license_number },
      create: data,
      update: data,
    });
    await syncDriverLicenseWatchedItem(tx, driver, ownerUserId);
    return driver;
  });
}

async function syncDriverLicenseWatchedItem(
  tx: TransactionClient,
  driver: { id: string; name: string; license_number: string; license_expiry: Date; status: string },
  ownerUserId: string
) {
  await watchedItemUpsert(tx, {
    item_type: "permit",
    reference_id: driver.id,
    title: `${driver.name} - Driver License ${driver.license_number}`,
    status: driver.status,
    due_at: driver.license_expiry,
    owner_user_id: ownerUserId,
  });
}

export function createVehicle(data: Prisma.VehicleCreateInput) {
  return prisma.vehicle.create({ data });
}

export async function createTrip(
  data: Prisma.TripUncheckedCreateInput,
  ownerUserId: string
) {
  return prisma.$transaction(async (tx) => {
    const trip = await tx.trip.create({
      data,
      include: { driver: true, vehicle: true },
    });

    await watchedItemUpsert(tx, {
      item_type: "trip",
      reference_id: trip.id,
      title: `${trip.vehicle.plate_number} - ${trip.origin} to ${trip.destination}`,
      status: trip.status,
      due_at: trip.expected_end_time,
      owner_user_id: ownerUserId,
    });

    return trip;
  });
}

export async function updateTrip(
  id: string,
  data: Prisma.TripUncheckedUpdateInput,
  ownerUserId: string
) {
  return prisma.$transaction(async (tx) => {
    const trip = await tx.trip.update({
      where: { id },
      data,
      include: { driver: true, vehicle: true },
    });

    await watchedItemUpsert(tx, {
      item_type: "trip",
      reference_id: trip.id,
      title: `${trip.vehicle.plate_number} - ${trip.origin} to ${trip.destination}`,
      status: trip.status,
      due_at: trip.expected_end_time,
      owner_user_id: ownerUserId,
    });

    return trip;
  });
}

export async function createPermit(
  data: Prisma.PermitUncheckedCreateInput,
  ownerUserId: string
) {
  return prisma.$transaction(async (tx) => {
    const permit = await tx.permit.create({
      data,
      include: { driver: true, vehicle: true },
    });

    await syncPermitWatchedItem(tx, permit, ownerUserId);
    return permit;
  });
}

export async function updatePermit(
  id: string,
  data: Prisma.PermitUncheckedUpdateInput,
  ownerUserId: string
) {
  return prisma.$transaction(async (tx) => {
    const permit = await tx.permit.update({
      where: { id },
      data,
      include: { driver: true, vehicle: true },
    });

    await syncPermitWatchedItem(tx, permit, ownerUserId);
    return permit;
  });
}

async function syncPermitWatchedItem(
  tx: TransactionClient,
  permit: Prisma.PermitGetPayload<{ include: { driver: true; vehicle: true } }>,
  ownerUserId: string
) {
  const subject = permit.vehicle?.plate_number ?? permit.driver?.name ?? "Unassigned";

  await watchedItemUpsert(tx, {
    item_type: "permit",
    reference_id: permit.id,
    title: `${subject} - ${permit.permit_type}`,
    status: permit.status,
    due_at: permit.expiry_date,
    owner_user_id: ownerUserId,
  });
}

export async function createMaintenanceRecord(
  data: Prisma.MaintenanceRecordUncheckedCreateInput,
  ownerUserId: string
) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.maintenanceRecord.create({
      data,
      include: { vehicle: true },
    });

    await syncMaintenanceWatchedItem(tx, record, ownerUserId);
    return record;
  });
}

export async function updateMaintenanceRecord(
  id: string,
  data: Prisma.MaintenanceRecordUncheckedUpdateInput,
  ownerUserId: string
) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.maintenanceRecord.update({
      where: { id },
      data,
      include: { vehicle: true },
    });

    await syncMaintenanceWatchedItem(tx, record, ownerUserId);
    return record;
  });
}

async function syncMaintenanceWatchedItem(
  tx: TransactionClient,
  record: Prisma.MaintenanceRecordGetPayload<{ include: { vehicle: true } }>,
  ownerUserId: string
) {
  await watchedItemUpsert(tx, {
    item_type: "maintenance",
    reference_id: record.id,
    title: `${record.vehicle.plate_number} - ${record.type}`,
    status: record.status,
    due_at: record.scheduled_date,
    owner_user_id: ownerUserId,
  });
}
