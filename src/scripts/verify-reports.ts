import { AddressInfo } from "net";
import app from "../server";
import { prisma } from "../data/prisma";

const password = "Password123!";

function csvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = csv.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  return rows;
}

async function main() {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function login(email: string) {
    const response = await fetch(`${baseUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (!response.ok) throw new Error(`Login failed for ${email}: ${response.status}`);
    return (await response.json() as { token: string }).token;
  }

  async function exportReport(path: string, token: string) {
    const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, type: response.headers.get("content-type"), disposition: response.headers.get("content-disposition"), text: await response.text() };
  }

  try {
    const director = await login("director@ajs.local");
    const accountant = await login("accountant.warehouse@ajs.local");
    const driver = await login("driver.neema@ajs.local");
    const today = new Date();
    const from = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    const to = today.toISOString().slice(0, 10);

    const alerts = await exportReport(`/reports/alerts.csv?subsidiary=warehouse&from=${from}&to=${to}`, director);
    const alertRows = csvRows(alerts.text);
    const alertHeaders = ["subsidiary", "item_type", "title", "priority", "status", "created_at", "resolved_at", "resolved_by"];
    if (alerts.status !== 200 || alerts.type !== "text/csv; charset=utf-8" || alertRows[0]?.join() !== alertHeaders.join() || alertRows.slice(1).some((row) => row[0] !== "warehouse")) throw new Error("Warehouse alerts export failed");
    console.log(`Alerts export: status=${alerts.status} | range=${from}..${to} | rows=${alertRows.length - 1}`);
    console.log(`Alerts columns: ${alertRows[0].join(", ")}`);

    const fullAlerts = await exportReport("/reports/alerts.csv", director);
    const fullAlertRows = csvRows(fullAlerts.text);
    const expectedAlertCount = await prisma.alert.count();
    const exportedSubsidiaries = [...new Set(fullAlertRows.slice(1).map((row) => row[0]))].sort();
    if (fullAlerts.status !== 200 || fullAlertRows.length - 1 !== expectedAlertCount) throw new Error("Full director alerts export does not match the database");
    console.log(`Director full alerts export: status=${fullAlerts.status} | rows=${fullAlertRows.length - 1}/${expectedAlertCount} | subsidiaries=${exportedSubsidiaries.join(",")}`);

    const movements = await exportReport("/reports/movements.csv", director);
    const movementRows = csvRows(movements.text);
    const movementHeaders = movementRows[0];
    const nearLimit = movementRows.slice(1).find((row) => row[movementHeaders.indexOf("reference_number")] === "BW-RICH-005");
    if (movements.status !== 200) throw new Error("Movements export failed");
    if (nearLimit) {
      const days = Number(nearLimit[movementHeaders.indexOf("days_in_storage")]);
      const flag = nearLimit[movementHeaders.indexOf("storage_flag")];
      const expectedFlag = days >= 180 ? "OVER_LIMIT" : days > 170 ? "NEAR_LIMIT" : "OK";
      if (flag !== expectedFlag) throw new Error("Bonded-storage movement is not accurately flagged");
      console.log(`Movements compliance: BW-RICH-005 | days_in_storage=${days} | storage_flag=${flag}`);

      const movement = await prisma.movement.findFirstOrThrow({ where: { reference_number: "BW-RICH-005" } });
      const watchedItem = await prisma.watchedItem.findUniqueOrThrow({
        where: { item_type_reference_id: { item_type: "extension", reference_id: movement.id } },
        include: { alerts: { include: { events: { orderBy: { created_at: "asc" } } }, orderBy: { created_at: "desc" } } },
      });
      const activeAlert = watchedItem.alerts.find((alert) => alert.status === "open" || alert.status === "acknowledged");
      console.log(`BW-RICH-005 alert: watched_status=${watchedItem.status} | due_at=${watchedItem.due_at?.toISOString()} | active_status=${activeAlert?.status ?? "none"} | priority=${activeAlert?.priority ?? "none"} | events=${activeAlert?.events.map((event) => event.event_type).join(",") ?? "none"}`);
      if (!activeAlert || activeAlert.priority !== "high") throw new Error("BW-RICH-005 lacks an active high-priority compliance alert");
    } else {
      console.log("Movements compliance: BW-RICH-005 fixture is no longer present; no test record was inserted.");
    }

    const accountantInvoices = await exportReport("/reports/invoices.csv", accountant);
    const accountantMovements = await exportReport("/reports/movements.csv", accountant);
    const accountantAlerts = await exportReport("/reports/alerts.csv", accountant);
    if (accountantInvoices.status !== 200 || accountantMovements.status !== 200 || accountantAlerts.status !== 403) throw new Error("Accountant report permissions failed");
    console.log(`Accountant permissions: invoices=${accountantInvoices.status} | movements=${accountantMovements.status} | alerts=${accountantAlerts.status}`);

    const driverStatuses = await Promise.all(["alerts", "invoices", "movements"].map(async (report) => (await exportReport(`/reports/${report}.csv`, driver)).status));
    if (driverStatuses.some((status) => status !== 403)) throw new Error("Driver report permissions failed");
    console.log(`Driver permissions: alerts=${driverStatuses[0]} | invoices=${driverStatuses[1]} | movements=${driverStatuses[2]}`);
    console.log("Reports and exports verification passed.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
