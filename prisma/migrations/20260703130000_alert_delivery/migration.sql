CREATE TYPE "NotificationChannel" AS ENUM ('email', 'sms');
CREATE TYPE "NotificationStatus" AS ENUM ('sent', 'failed');

ALTER TABLE "users" ADD COLUMN "phone" TEXT;

CREATE TABLE "notification_log" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_log_alert_id_channel_recipient_user_id_key" ON "notification_log"("alert_id", "channel", "recipient_user_id");
CREATE INDEX "notification_log_alert_id_idx" ON "notification_log"("alert_id");
CREATE INDEX "notification_log_recipient_user_id_idx" ON "notification_log"("recipient_user_id");
CREATE INDEX "notification_log_status_idx" ON "notification_log"("status");

ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
