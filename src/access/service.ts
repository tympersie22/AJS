import { Subsidiary } from "@prisma/client";
import { User } from "../data/types";
import { prisma } from "../data/prisma";

export function scopedSubsidiary(user: User): Subsidiary | undefined {
  if (user.role === "director" || user.role === "gm") return undefined;
  if (!user.subsidiary || !["logistics", "warehouse", "machinery"].includes(user.subsidiary)) return undefined;
  return user.subsidiary as Subsidiary;
}

export function canAccessSubsidiary(user: User, subsidiary: Subsidiary): boolean {
  const scope = scopedSubsidiary(user);
  return scope === undefined ? user.role === "director" || user.role === "gm" : scope === subsidiary;
}

export async function getScopedOverview(user: User) {
  const scope = scopedSubsidiary(user);
  const subsidiaries = scope ? [scope] : ["logistics", "warehouse", "machinery"] as Subsidiary[];
  const overview: Record<string, Record<string, number>> = {};

  for (const subsidiary of subsidiaries) {
    if (subsidiary === "logistics") {
      const [trips, permits, maintenance] = await Promise.all([prisma.trip.count(), prisma.permit.count(), prisma.maintenanceRecord.count()]);
      overview.logistics = { trips, permits, maintenance };
    }
    if (subsidiary === "warehouse") {
      const [movements, extensions, invoices] = await Promise.all([prisma.movement.count(), prisma.extension.count(), prisma.invoice.count()]);
      overview.warehouse = { movements, extensions, invoices };
    }
    if (subsidiary === "machinery") {
      overview.machinery = { machines: await prisma.machine.count() };
    }
  }

  return overview;
}

export async function getDriverPortal(userId: string) {
  const driver = await prisma.driver.findUnique({
    where: { user_id: userId },
    include: {
      trips: {
        include: { vehicle: true },
        orderBy: { start_time: "desc" },
      },
    },
  });
  if (!driver) return { driver: null, trips: [] };
  return {
    driver: {
      id: driver.id,
      name: driver.name,
      status: driver.status,
      license_expiry: driver.license_expiry,
    },
    trips: driver.trips.map((trip) => ({
      id: trip.id,
      origin: trip.origin,
      destination: trip.destination,
      status: trip.status,
      start_time: trip.start_time,
      expected_end_time: trip.expected_end_time,
      actual_end_time: trip.actual_end_time,
      vehicle: { id: trip.vehicle.id, plate_number: trip.vehicle.plate_number, status: trip.vehicle.status },
    })),
  };
}
