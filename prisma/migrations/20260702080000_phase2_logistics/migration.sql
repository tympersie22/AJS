CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "license_expiry" TIMESTAMP(3) NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "plate_number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subsidiary_owned" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "expected_end_time" TIMESTAMP(3) NOT NULL,
    "actual_end_time" TIMESTAMP(3),
    "gps_status" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permits" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "driver_id" TEXT,
    "permit_type" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "permits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "maintenance_records" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "completed_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "notes" TEXT,
    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "drivers_license_number_key" ON "drivers"("license_number");
CREATE UNIQUE INDEX "vehicles_plate_number_key" ON "vehicles"("plate_number");
CREATE INDEX "trips_driver_id_idx" ON "trips"("driver_id");
CREATE INDEX "trips_vehicle_id_idx" ON "trips"("vehicle_id");
CREATE INDEX "trips_status_idx" ON "trips"("status");
CREATE INDEX "permits_vehicle_id_idx" ON "permits"("vehicle_id");
CREATE INDEX "permits_driver_id_idx" ON "permits"("driver_id");
CREATE INDEX "permits_status_idx" ON "permits"("status");
CREATE INDEX "maintenance_records_vehicle_id_idx" ON "maintenance_records"("vehicle_id");
CREATE INDEX "maintenance_records_status_idx" ON "maintenance_records"("status");
CREATE UNIQUE INDEX "watched_items_item_type_reference_id_key" ON "watched_items"("item_type", "reference_id");

ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "permits" ADD CONSTRAINT "permits_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "permits" ADD CONSTRAINT "permits_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
