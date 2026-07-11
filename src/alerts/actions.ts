import { User } from "../data/types";
import { prisma } from "../data/prisma";
import { canAccessSubsidiary } from "../access/service";
import { alertWithLatestEvents, appendAlertEvent } from "./lifecycle";

export async function acknowledgeAlert(alertId: string, user: User) {
  const alert = await prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
  if (!canAccessSubsidiary(user, alert.subsidiary)) return null;
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.alert.update({ where: { id: alertId }, data: { status: "acknowledged" } });
    await appendAlertEvent(tx, alertId, "acknowledged", user.id, now);
    return result;
  });
  return alertWithLatestEvents(updated);
}

export async function resolveAlert(alertId: string, user: User) {
  const alert = await prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
  if (!canAccessSubsidiary(user, alert.subsidiary)) return null;
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.alert.update({ where: { id: alertId }, data: { status: "resolved" } });
    await appendAlertEvent(tx, alertId, "resolved", user.id, now);
    return result;
  });
  return alertWithLatestEvents(updated);
}
