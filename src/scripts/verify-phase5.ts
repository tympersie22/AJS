import { AddressInfo } from "net";
import app from "../server";
import { prisma } from "../data/prisma";

const password = "Password123!";

async function main() {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function login(email: string) {
    const response = await fetch(`${baseUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (!response.ok) throw new Error(`Login failed for ${email}`);
    return response.json() as Promise<{ token: string; user: { id: string; role: string; subsidiary: string | null } }>;
  }
  async function get(path: string, token: string) {
    const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() as any };
  }

  try {
    const director = await login("director@ajs.local");
    const manager = await login("manager.logistics@ajs.local");
    const driver = await login("driver.neema@ajs.local");
    const accountant = await login("accountant.warehouse@ajs.local");

    const directorOverview = await get("/scope/overview", director.token);
    console.log(`Director login: role=${director.user.role} | visible=${Object.keys(directorOverview.body.overview).join(",")}`);
    if (Object.keys(directorOverview.body.overview).length !== 3) throw new Error("Director lacks full visibility");

    const managerAlerts = await get("/alerts", manager.token);
    const managerOverview = await get("/scope/overview", manager.token);
    const managerCrossScope = await get("/alerts?subsidiary=warehouse", manager.token);
    console.log(`Manager login: role=${manager.user.role} | alert_subsidiaries=${[...new Set(managerAlerts.body.alerts.map((alert: any) => alert.subsidiary))].join(",")} | data_sections=${Object.keys(managerOverview.body.overview).join(",")} | warehouse_attempt=${managerCrossScope.status}`);
    if (managerAlerts.body.alerts.some((alert: any) => alert.subsidiary !== "logistics") || Object.keys(managerOverview.body.overview).join() !== "logistics" || managerCrossScope.status !== 403) throw new Error("Manager scope failed");

    const driverPortal = await get("/driver/portal", driver.token);
    const driverAlerts = await get("/alerts", driver.token);
    const otherDriver = await prisma.driver.findUniqueOrThrow({ where: { license_number: "TZ-DL-4096" }, include: { trips: true } });
    const visibleTripIds = driverPortal.body.trips.map((trip: any) => trip.id);
    const excludedTripIds = otherDriver.trips.map((trip) => trip.id);
    console.log(`Driver login: linked_driver=${driverPortal.body.driver.id} | visible_trips=${visibleTripIds.join(",")} | other_driver_trip=${excludedTripIds.join(",")} | other_visible=${excludedTripIds.some((id) => visibleTripIds.includes(id))} | alerts_access=${driverAlerts.status}`);
    if (excludedTripIds.some((id) => visibleTripIds.includes(id)) || driverAlerts.status !== 403) throw new Error("Driver isolation failed");

    const accountantAlerts = await get("/alerts", accountant.token);
    const accountantOverview = await get("/scope/overview", accountant.token);
    const accountantInvoices = await get("/accounting/invoices", accountant.token);
    const accountantCrossScope = await get("/alerts?subsidiary=logistics", accountant.token);
    console.log(`Accountant login: alert_subsidiaries=${[...new Set(accountantAlerts.body.alerts.map((alert: any) => alert.subsidiary))].join(",")} | data_sections=${Object.keys(accountantOverview.body.overview).join(",")} | invoices=${accountantInvoices.body.invoices.length} | logistics_attempt=${accountantCrossScope.status}`);
    if (accountantAlerts.body.alerts.some((alert: any) => alert.subsidiary !== "warehouse") || Object.keys(accountantOverview.body.overview).join() !== "warehouse" || accountantInvoices.body.invoices.length < 1 || accountantCrossScope.status !== 403) throw new Error("Accountant scope failed");

    const alertId = managerAlerts.body.alerts[0]?.id;
    if (!alertId) throw new Error("Expected an open Logistics alert for human audit verification");
    const acknowledgeResponse = await fetch(`${baseUrl}/alerts/${alertId}/acknowledge`, { method: "PATCH", headers: { authorization: `Bearer ${manager.token}` } });
    const acknowledged = await acknowledgeResponse.json() as any;
    const resolveResponse = await fetch(`${baseUrl}/alerts/${alertId}/resolve`, { method: "PATCH", headers: { authorization: `Bearer ${manager.token}` } });
    const resolved = await resolveResponse.json() as any;
    console.log(`Human alert audit: status=${resolved.alert.status} | acknowledged_by=${acknowledged.alert.acknowledged_by} | resolved_by=${resolved.alert.resolved_by} | system_marker=${resolved.alert.resolved_by === "system"}`);
    if (acknowledged.alert.acknowledged_by !== manager.user.id || resolved.alert.resolved_by !== manager.user.id || resolved.alert.resolved_by === "system") throw new Error("Human alert audit path failed");

    console.log("Phase 5 verification passed across director, manager, driver, and accountant logins.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
