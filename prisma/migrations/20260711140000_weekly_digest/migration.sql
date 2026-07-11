ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'digest';

ALTER TABLE "notification_log" ALTER COLUMN "alert_id" DROP NOT NULL;

CREATE TABLE "digest_heartbeats" (
    "id" TEXT NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EngineHeartbeatStatus" NOT NULL,
    "error_message" TEXT,
    "recipients_processed" INTEGER NOT NULL,
    "deliveries_attempted" INTEGER NOT NULL,
    CONSTRAINT "digest_heartbeats_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "digest_heartbeats_run_at_idx" ON "digest_heartbeats"("run_at");
CREATE INDEX "digest_heartbeats_status_run_at_idx" ON "digest_heartbeats"("status", "run_at");
