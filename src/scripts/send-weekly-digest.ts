import { prisma } from "../data/prisma";
import { sendWeeklyDigest } from "../digest/service";

async function main() {
  const result = await sendWeeklyDigest(new Date());
  console.log("Weekly digest manual trigger complete.");
  console.log(`recipients=${result.recipients.length} | attempted=${result.attempted}`);
  for (const recipient of result.recipients) console.log(`- ${recipient.email} (${recipient.id})`);
  console.log("\n--- SUBJECT ---");
  console.log(result.subject);
  console.log("\n--- BODY ---");
  console.log(result.body);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
