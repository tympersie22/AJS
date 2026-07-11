CREATE TABLE "alert_thresholds" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "rule_key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updated_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "alert_thresholds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "alert_thresholds_rule_key_key" ON "alert_thresholds"("rule_key");
CREATE INDEX "alert_thresholds_rule_key_idx" ON "alert_thresholds"("rule_key");

ALTER TABLE "alert_thresholds" ADD CONSTRAINT "alert_thresholds_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
