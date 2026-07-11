CREATE TYPE "AlertEventType" AS ENUM ('created', 'acknowledged', 'resolved', 'reopened', 'auto_resolved');

CREATE TABLE "alert_events" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "event_type" "AlertEventType" NOT NULL,
    "actor" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "alert_events_alert_id_created_at_idx" ON "alert_events"("alert_id", "created_at");
CREATE INDEX "alert_events_event_type_idx" ON "alert_events"("event_type");

INSERT INTO "alert_events" ("id", "alert_id", "event_type", "actor", "created_at")
SELECT gen_random_uuid()::text, "id", 'created'::"AlertEventType", 'system', "created_at"
FROM "alerts";

INSERT INTO "alert_events" ("id", "alert_id", "event_type", "actor", "created_at")
SELECT gen_random_uuid()::text, "id", 'acknowledged'::"AlertEventType", "acknowledged_by", "acknowledged_at"
FROM "alerts"
WHERE "acknowledged_by" IS NOT NULL AND "acknowledged_at" IS NOT NULL;

INSERT INTO "alert_events" ("id", "alert_id", "event_type", "actor", "created_at")
SELECT gen_random_uuid()::text,
       "id",
       CASE WHEN "resolved_by" = 'system' THEN 'auto_resolved'::"AlertEventType" ELSE 'resolved'::"AlertEventType" END,
       "resolved_by",
       "resolved_at"
FROM "alerts"
WHERE "resolved_by" IS NOT NULL AND "resolved_at" IS NOT NULL;

ALTER TABLE "alerts" DROP CONSTRAINT IF EXISTS "alerts_acknowledged_by_fkey";
ALTER TABLE "alerts" DROP COLUMN "acknowledged_by", DROP COLUMN "acknowledged_at", DROP COLUMN "resolved_by", DROP COLUMN "resolved_at";
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_watched_item_id_fkey";
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_watched_item_id_fkey" FOREIGN KEY ("watched_item_id") REFERENCES "watched_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION create_alert_created_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "alert_events" ("id", "alert_id", "event_type", "actor", "created_at")
  VALUES (gen_random_uuid()::text, NEW."id", 'created', 'system', NEW."created_at");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER alerts_created_audit
AFTER INSERT ON "alerts"
FOR EACH ROW EXECUTE FUNCTION create_alert_created_event();

CREATE OR REPLACE FUNCTION prevent_alert_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'alert_events is append-only; % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER alert_events_append_only
BEFORE UPDATE OR DELETE ON "alert_events"
FOR EACH ROW EXECUTE FUNCTION prevent_alert_event_mutation();
