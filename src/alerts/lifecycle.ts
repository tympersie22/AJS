import { Alert, AlertEventType, Prisma } from "@prisma/client";
import { prisma } from "../data/prisma";

type TransactionClient = Prisma.TransactionClient;

export function appendAlertEvent(
  tx: TransactionClient,
  alertId: string,
  eventType: Exclude<AlertEventType, "created">,
  actor: string,
  createdAt: Date,
  note?: string
) {
  return tx.alertEvent.create({
    data: {
      alert_id: alertId,
      event_type: eventType,
      actor,
      created_at: createdAt,
      note,
    },
  });
}

export async function alertWithLatestEvents(alert: Alert) {
  const events = await prisma.alertEvent.findMany({
    where: { alert_id: alert.id },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
  });
  const acknowledged = events.find((event) => event.event_type === "acknowledged");
  const resolved = events.find((event) => event.event_type === "resolved" || event.event_type === "auto_resolved");
  return {
    ...alert,
    acknowledged_by: acknowledged?.actor ?? null,
    acknowledged_at: acknowledged?.created_at ?? null,
    resolved_by: resolved?.actor ?? null,
    resolved_at: resolved?.created_at ?? null,
  };
}
