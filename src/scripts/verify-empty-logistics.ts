import { AddressInfo } from "net";
import app from "../server";
import { prisma } from "../data/prisma";

async function main() {
  const counts = await Promise.all([prisma.driver.count(), prisma.vehicle.count(), prisma.trip.count(), prisma.permit.count(), prisma.maintenanceRecord.count(), prisma.watchedItem.count({ where: { subsidiary: "logistics" } }), prisma.alert.count({ where: { subsidiary: "logistics" } })]);
  console.log(`empty_logistics_counts=${counts.join(",")}`);
  if (counts.some(Boolean)) throw new Error("Logistics data is not empty");

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    async function token(email: string) {
      const response = await fetch(`${baseUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "Password123!" }) });
      return (await response.json() as { token: string }).token;
    }
    const directorToken = await token("director@ajs.local");
    const driverToken = await token("driver.neema@ajs.local");
    const overview = await fetch(`${baseUrl}/scope/overview`, { headers: { authorization: `Bearer ${directorToken}` } }).then((response) => response.json()) as any;
    const alerts = await fetch(`${baseUrl}/alerts?subsidiary=logistics`, { headers: { authorization: `Bearer ${directorToken}` } }).then((response) => response.json()) as any;
    const portalResponse = await fetch(`${baseUrl}/driver/portal`, { headers: { authorization: `Bearer ${driverToken}` } });
    const portal = await portalResponse.json() as any;
    console.log(`overview_logistics=${JSON.stringify(overview.overview.logistics)} | alerts=${alerts.alerts.length} | portal_status=${portalResponse.status} | portal_trips=${portal.trips.length}`);
    if (alerts.alerts.length || portalResponse.status !== 200 || portal.driver !== null || portal.trips.length) throw new Error("Empty-state APIs failed");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  console.log("Empty Logistics verification passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
