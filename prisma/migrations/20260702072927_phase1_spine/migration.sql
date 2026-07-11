-- CreateEnum
CREATE TYPE "Subsidiary" AS ENUM ('logistics', 'warehouse', 'machinery');

-- CreateEnum
CREATE TYPE "AlertPriority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('open', 'acknowledged', 'resolved');

-- CreateTable
CREATE TABLE "watched_items" (
    "id" TEXT NOT NULL,
    "subsidiary" "Subsidiary" NOT NULL,
    "item_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "threshold_value" DOUBLE PRECISION,
    "owner_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watched_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "watched_item_id" TEXT NOT NULL,
    "subsidiary" "Subsidiary" NOT NULL,
    "priority" "AlertPriority" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_by" TEXT,
    "acknowledged_at" TIMESTAMP(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "watched_items_subsidiary_idx" ON "watched_items"("subsidiary");

-- CreateIndex
CREATE INDEX "watched_items_item_type_idx" ON "watched_items"("item_type");

-- CreateIndex
CREATE INDEX "watched_items_status_idx" ON "watched_items"("status");

-- CreateIndex
CREATE INDEX "alerts_status_idx" ON "alerts"("status");

-- CreateIndex
CREATE INDEX "alerts_subsidiary_idx" ON "alerts"("subsidiary");

-- CreateIndex
CREATE INDEX "alerts_priority_idx" ON "alerts"("priority");

-- AddForeignKey
ALTER TABLE "watched_items" ADD CONSTRAINT "watched_items_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_watched_item_id_fkey" FOREIGN KEY ("watched_item_id") REFERENCES "watched_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
