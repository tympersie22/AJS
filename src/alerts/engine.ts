import cron from "node-cron";
import { prisma } from "../data/prisma";
import { refreshMachineWatchedItems } from "../machinery/service";
import { refreshBondedStorageWatchedItems } from "../warehouse/service";
import { evaluateWatchedItem } from "./rules";
import { appendAlertEvent } from "./lifecycle";
import { dispatchCreatedAlert } from "../notifications/delivery";
import { ALERT_ENGINE_INTERVAL_MINUTES, EngineRunStats, recordEngineHeartbeat } from "./heartbeat";
import { getAlertThresholdValues } from "./thresholds";

interface RunAlertEngineOptions {
  forceFailure?: boolean;
}

async function executeAlertEngine(stats: EngineRunStats, now = new Date(), options: RunAlertEngineOptions = {}): Promise<EngineRunStats> {
  if (options.forceFailure) {
    throw new Error("Forced alert engine failure for heartbeat verification");
  }

  const thresholds = await getAlertThresholdValues();
  await refreshMachineWatchedItems(now);
  await refreshBondedStorageWatchedItems(now, thresholds.bonded_storage_days);
  const watchedItems = await prisma.watchedItem.findMany();

  for (const item of watchedItems) {
    stats.itemsProcessed += 1;
    const result = evaluateWatchedItem(item, now, thresholds);

    if (!result) {
      const openAlerts = await prisma.alert.findMany({ where: { watched_item_id: item.id, status: "open" } });
      await prisma.$transaction(async (tx) => {
        for (const alert of openAlerts) {
          await tx.alert.update({ where: { id: alert.id }, data: { status: "resolved" } });
          await appendAlertEvent(tx, alert.id, "auto_resolved", "system", now);
        }
      });
      continue;
    }

    const existingActiveAlert = await prisma.alert.findFirst({
      where: {
        watched_item_id: item.id,
        status: { in: ["open", "acknowledged"] },
      },
    });

    if (existingActiveAlert) {
      continue;
    }

    const latestResolvedAlert = await prisma.alert.findFirst({
      where: { watched_item_id: item.id, status: "resolved" },
      orderBy: { created_at: "desc" },
    });
    if (latestResolvedAlert) {
      await prisma.$transaction(async (tx) => {
        await tx.alert.update({ where: { id: latestResolvedAlert.id }, data: { status: "open", priority: result.priority, message: result.message } });
        await appendAlertEvent(tx, latestResolvedAlert.id, "reopened", "system", now);
      });
      continue;
    }

    const alert = await prisma.alert.create({
      data: {
        watched_item_id: item.id,
        subsidiary: item.subsidiary,
        priority: result.priority,
        message: result.message,
      },
    });
    stats.alertsCreated += 1;
    await dispatchCreatedAlert(alert.id);
  }

  return stats;
}

export async function runAlertEngine(now = new Date(), options: RunAlertEngineOptions = {}): Promise<number> {
  let stats: EngineRunStats = { alertsCreated: 0, itemsProcessed: 0 };
  try {
    stats = await executeAlertEngine(stats, now, options);
    await recordEngineHeartbeat({
      runAt: now,
      status: "success",
      itemsProcessed: stats.itemsProcessed,
      alertsCreated: stats.alertsCreated,
    });
    return stats.alertsCreated;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordEngineHeartbeat({
      runAt: now,
      status: "failed",
      errorMessage: message,
      itemsProcessed: stats.itemsProcessed,
      alertsCreated: stats.alertsCreated,
    }).catch((heartbeatError) => {
      console.error("Failed to record alert engine heartbeat", heartbeatError);
    });
    console.error("Alert engine sweep failed", error);
    return 0;
  }
}

export function scheduleAlertEngine(): void {
  cron.schedule(`*/${ALERT_ENGINE_INTERVAL_MINUTES} * * * *`, () => {
    void runAlertEngine();
  });
}
