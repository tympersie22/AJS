CREATE TABLE "movements" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "item_category" TEXT NOT NULL,
    "reference_number" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "exit_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    CONSTRAINT "movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "extensions" (
    "id" TEXT NOT NULL,
    "movement_id" TEXT NOT NULL,
    "requested_date" TIMESTAMP(3) NOT NULL,
    "extended_until" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "extensions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "movement_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "issued_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "movements_reference_number_key" ON "movements"("reference_number");
CREATE INDEX "movements_status_idx" ON "movements"("status");
CREATE INDEX "extensions_movement_id_idx" ON "extensions"("movement_id");
CREATE INDEX "extensions_status_idx" ON "extensions"("status");
CREATE INDEX "invoices_movement_id_idx" ON "invoices"("movement_id");
CREATE INDEX "invoices_status_idx" ON "invoices"("status");
ALTER TABLE "extensions" ADD CONSTRAINT "extensions_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
