CREATE TYPE "EngineHeartbeatStatus" AS ENUM ('success', 'failed');

CREATE TABLE "engine_heartbeats" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EngineHeartbeatStatus" NOT NULL,
    "error_message" TEXT,
    "items_processed" INTEGER NOT NULL,
    "alerts_created" INTEGER NOT NULL,
    CONSTRAINT "engine_heartbeats_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "engine_heartbeats_run_at_idx" ON "engine_heartbeats"("run_at");
CREATE INDEX "engine_heartbeats_status_run_at_idx" ON "engine_heartbeats"("status", "run_at");
