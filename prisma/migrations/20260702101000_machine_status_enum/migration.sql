CREATE TYPE "MachineStatus" AS ENUM ('waiting', 'successful', 'unsuccessful', 'idle');
ALTER TABLE "machines" ALTER COLUMN "status" TYPE "MachineStatus" USING ("status"::"MachineStatus");
