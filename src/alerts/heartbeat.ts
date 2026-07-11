import { prisma } from "../data/prisma";

export const ALERT_ENGINE_INTERVAL_MINUTES = 5;
export const ALERT_ENGINE_STALE_AFTER_MINUTES = ALERT_ENGINE_INTERVAL_MINUTES * 2;

export interface EngineRunStats {
  itemsProcessed: number;
  alertsCreated: number;
}

export async function recordEngineHeartbeat({
  runAt,
  status,
  errorMessage = null,
  itemsProcessed,
  alertsCreated,
}: {
  runAt: Date;
  status: "success" | "failed";
  errorMessage?: string | null;
  itemsProcessed: number;
  alertsCreated: number;
}) {
  return prisma.engineHeartbeat.create({
    data: {
      run_at: runAt,
      status,
      error_message: errorMessage,
      items_processed: itemsProcessed,
      alerts_created: alertsCreated,
    },
  });
}

export async function getEngineHealth(now = new Date()) {
  const [latestHeartbeat, latestSuccessfulHeartbeat] = await Promise.all([
    prisma.engineHeartbeat.findFirst({ orderBy: { run_at: "desc" } }),
    prisma.engineHeartbeat.findFirst({ where: { status: "success" }, orderBy: { run_at: "desc" } }),
  ]);
  const staleAfterMs = ALERT_ENGINE_STALE_AFTER_MINUTES * 60_000;
  const stale = !latestSuccessfulHeartbeat || now.getTime() - latestSuccessfulHeartbeat.run_at.getTime() > staleAfterMs;

  return {
    expected_interval_minutes: ALERT_ENGINE_INTERVAL_MINUTES,
    stale_after_minutes: ALERT_ENGINE_STALE_AFTER_MINUTES,
    stale,
    latest: latestHeartbeat,
    latest_success: latestSuccessfulHeartbeat,
  };
}
