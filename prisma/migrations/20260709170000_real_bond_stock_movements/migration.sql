ALTER TABLE "movements"
  ADD COLUMN "chassis_number" TEXT,
  ADD COLUMN "bond_value_tzs" DECIMAL(18, 2),
  ADD COLUMN "vehicle_description" TEXT;

DROP INDEX IF EXISTS "movements_reference_number_key";

CREATE UNIQUE INDEX "movements_chassis_number_key" ON "movements"("chassis_number");
CREATE INDEX "movements_item_category_idx" ON "movements"("item_category");
