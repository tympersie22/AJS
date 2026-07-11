ALTER TABLE "alerts" ADD COLUMN "resolved_by" TEXT;
ALTER TABLE "alerts" ADD COLUMN "resolved_at" TIMESTAMP(3);

CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "asset_tag" TEXT NOT NULL,
    "subsidiary_location" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "last_status_change_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "machines_asset_tag_key" ON "machines"("asset_tag");
CREATE INDEX "machines_status_idx" ON "machines"("status");
