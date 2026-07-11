import { acknowledgeAlert } from "../alerts/actions";
import { runAlertEngine } from "../alerts/engine";
import { prisma } from "../data/prisma";
import { User } from "../data/types";

const HOUR_MS = 60 * 60 * 1000;

async function history(alertId: string) {
  return prisma.alertEvent.findMany({
    where: { alert_id: alertId },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });
}

async function main() {
  const now = new Date();
  const suffix = now.getTime().toString();
  const director = await prisma.user.findUniqueOrThrow({ where: { email: "director@ajs.local" } });
  const directorActor = director as User;

  const autoItem = await prisma.watchedItem.create({
    data: {
      subsidiary: "logistics",
      item_type: "permit",
      reference_id: `AUDIT-AUTO-${suffix}`,
      title: `Audit auto-resolution test ${suffix}`,
      status: "active",
      due_at: new Date(now.getTime() + HOUR_MS),
      owner_user_id: director.id,
    },
  });
  await runAlertEngine(now);
  const autoAlert = await prisma.alert.findFirstOrThrow({ where: { watched_item_id: autoItem.id } });
  const createdHistory = await history(autoAlert.id);
  if (createdHistory.length !== 1 || createdHistory[0].event_type !== "created" || createdHistory[0].actor !== "system") {
    throw new Error("Created alert event was not written automatically");
  }

  await prisma.watchedItem.update({
    where: { id: autoItem.id },
    data: { due_at: new Date(now.getTime() + 90 * 24 * HOUR_MS) },
  });
  await runAlertEngine(new Date(now.getTime() + 1000));
  const resolvedAutoAlert = await prisma.alert.findUniqueOrThrow({ where: { id: autoAlert.id } });
  const autoHistory = await history(autoAlert.id);
  if (resolvedAutoAlert.status !== "resolved" || !autoHistory.some((event) => event.event_type === "auto_resolved" && event.actor === "system")) {
    throw new Error("Auto-resolution audit event was not written");
  }

  const manualItem = await prisma.watchedItem.create({
    data: {
      subsidiary: "logistics",
      item_type: "permit",
      reference_id: `AUDIT-MANUAL-${suffix}`,
      title: `Audit manual acknowledgment test ${suffix}`,
      status: "active",
      due_at: new Date(now.getTime() + HOUR_MS),
      owner_user_id: director.id,
    },
  });
  await runAlertEngine(new Date(now.getTime() + 2000));
  const manualAlert = await prisma.alert.findFirstOrThrow({ where: { watched_item_id: manualItem.id } });
  await acknowledgeAlert(manualAlert.id, directorActor);
  const acknowledgedAlert = await prisma.alert.findUniqueOrThrow({ where: { id: manualAlert.id } });
  const manualHistory = await history(manualAlert.id);
  if (acknowledgedAlert.status !== "acknowledged" || !manualHistory.some((event) => event.event_type === "acknowledged" && event.actor === director.id)) {
    throw new Error("Director acknowledgment audit event was not written");
  }

  let updateBlocked = false;
  let deleteBlocked = false;
  try {
    await prisma.alertEvent.update({ where: { id: autoHistory[0].id }, data: { note: "mutation attempt" } });
  } catch {
    updateBlocked = true;
  }
  try {
    await prisma.alertEvent.delete({ where: { id: autoHistory[0].id } });
  } catch {
    deleteBlocked = true;
  }
  if (!updateBlocked || !deleteBlocked) throw new Error("Database did not enforce append-only alert events");

  console.log("AUTO-RESOLVED ALERT HISTORY");
  for (const event of autoHistory) console.log(`${event.created_at.toISOString()} | ${event.event_type} | actor=${event.actor} | note=${event.note ?? "null"}`);
  console.log("MANUALLY ACKNOWLEDGED ALERT HISTORY");
  for (const event of manualHistory) console.log(`${event.created_at.toISOString()} | ${event.event_type} | actor=${event.actor} | note=${event.note ?? "null"}`);
  console.log(`immutability_update_blocked=${updateBlocked} | immutability_delete_blocked=${deleteBlocked}`);
  console.log(`auto_alert=${autoAlert.id} | status=${resolvedAutoAlert.status}`);
  console.log(`manual_alert=${manualAlert.id} | status=${acknowledgedAlert.status} | director=${director.id}`);
  console.log("Alert audit verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
