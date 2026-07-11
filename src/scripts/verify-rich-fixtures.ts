import { listOpenAlerts } from "../alerts/queries";
import { prisma } from "../data/prisma";
import { runAlertEngine } from "../alerts/engine";

const priorityRank = { high: 1, medium: 2, low: 3 } as const;

async function main() {
  const [movements, extensions, invoices, machines] = await Promise.all([
    prisma.movement.findMany({ orderBy: { reference_number: "asc" } }),
    prisma.extension.findMany({ include: { movement: true }, orderBy: { extended_until: "asc" } }),
    prisma.invoice.findMany({ include: { movement: true }, orderBy: { due_date: "asc" } }),
    prisma.machine.findMany({ orderBy: { asset_tag: "asc" } }),
  ]);

  console.log("Warehouse fixtures:");
  for (const movement of movements) console.log(`- movement ${movement.reference_number} | ${movement.type} | ${movement.item_category} | ${movement.status}`);
  for (const extension of extensions) console.log(`- extension ${extension.movement.reference_number} | ${extension.status} | due=${extension.extended_until.toISOString()}`);
  for (const invoice of invoices) console.log(`- invoice ${invoice.movement.reference_number} | ${invoice.status} | due=${invoice.due_date.toISOString()} | amount=${invoice.amount}`);
  console.log("Machinery fixtures:");
  for (const machine of machines) console.log(`- ${machine.asset_tag} | ${machine.status} | since=${machine.last_status_change_at.toISOString()}`);

  const allAlerts = await listOpenAlerts();
  const logisticsAlerts = await listOpenAlerts("logistics");
  const warehouseAlerts = await listOpenAlerts("warehouse");
  const machineryAlerts = await listOpenAlerts("machinery");
  console.log("Full open alert set (query sorted high -> medium -> low):");
  for (const alert of allAlerts) console.log(`- ${alert.priority} | ${alert.subsidiary} | ${alert.message}`);
  console.log(`filter_counts logistics=${logisticsAlerts.length} warehouse=${warehouseAlerts.length} machinery=${machineryAlerts.length}`);

  if (movements.length !== 5 || extensions.length !== 2 || invoices.length !== 3 || machines.length !== 5) throw new Error("Rich fixture counts are incorrect");
  if (allAlerts.length !== 6 || logisticsAlerts.length !== 0 || warehouseAlerts.length !== 4 || machineryAlerts.length !== 2) throw new Error("Alert/filter counts are incorrect");
  if (warehouseAlerts.filter((alert) => alert.priority === "high").length !== 3 || warehouseAlerts.filter((alert) => alert.priority === "medium").length !== 1) throw new Error("Warehouse priorities are incorrect");
  if (!warehouseAlerts.some((alert) => alert.message.includes("Bonded Storage Limit — BW-RICH-005 (machine)"))) throw new Error("180-day movement deadline did not alert");
  if (machineryAlerts.filter((alert) => alert.priority === "high").length !== 1 || machineryAlerts.filter((alert) => alert.priority === "medium").length !== 1) throw new Error("Machinery priorities are incorrect");
  for (let index = 1; index < allAlerts.length; index += 1) {
    if (priorityRank[allAlerts[index - 1].priority] > priorityRank[allAlerts[index].priority]) throw new Error("Global alert query is not priority sorted");
  }

  const beforeSecondRun = await prisma.alert.count();
  const secondRunCreated = await runAlertEngine();
  const afterSecondRun = await prisma.alert.count();
  console.log(`second_run_created=${secondRunCreated} | alert_rows_before=${beforeSecondRun} | alert_rows_after=${afterSecondRun}`);
  if (secondRunCreated !== 0 || beforeSecondRun !== afterSecondRun) throw new Error("Rich fixture alert deduplication failed");
  console.log("Rich fixture verification passed: query sorting, subsidiary filtering, and deduplication remain correct.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
