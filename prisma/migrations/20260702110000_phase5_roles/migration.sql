ALTER TABLE "drivers" ADD COLUMN "user_id" TEXT;
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
