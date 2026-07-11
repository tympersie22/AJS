import { runAlertEngine } from "../alerts/engine";
import { prisma } from "../data/prisma";
import { createMachine } from "../machinery/service";

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function main() {
  const director = await prisma.user.findUniqueOrThrow({ where: { email: "director@ajs.local" } });
  const now = new Date();
  await prisma.alert.deleteMany({ where: { subsidiary: "machinery" } });
  await prisma.watchedItem.deleteMany({ where: { subsidiary: "machinery" } });
  await prisma.machine.deleteMany();

  const mediumMachine = await createMachine({ name: "Forklift Alpha", asset_tag: "MCH-0001", subsidiary_location: "Dar es Salaam Yard", status: "idle", last_status_change_at: addDays(now, -3) }, director.id, now);
  const highMachine = await createMachine({ name: "Crane Bravo", asset_tag: "MCH-0002", subsidiary_location: "Kurasini Yard", status: "idle", last_status_change_at: addDays(now, -6) }, director.id, now);
  console.log(`Seeded ${mediumMachine.asset_tag}: idle 3 days -> medium`);
  console.log(`Seeded ${highMachine.asset_tag}: idle 6 days -> high`);
  console.log(`Alert engine created ${await runAlertEngine(now)} Phase 4 alerts.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
