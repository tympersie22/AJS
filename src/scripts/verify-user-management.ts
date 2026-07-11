import { AddressInfo } from "net";
import app from "../server";
import { prisma } from "../data/prisma";

const directorPassword = "Password123!";
const initialPassword = "TempPass947!";

async function main() {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function request(path: string, token?: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init?.headers },
    });
    return { status: response.status, body: await response.json().catch(() => ({})) as any };
  }

  async function login(email: string, password: string) {
    return request("/auth/login", undefined, { method: "POST", body: JSON.stringify({ email, password }) });
  }

  try {
    const directorLogin = await login("director@ajs.local", directorPassword);
    if (directorLogin.status !== 200) throw new Error("Director login failed");
    const directorToken = directorLogin.body.token as string;
    const suffix = Date.now();

    const managerEmail = `warehouse.manager.${suffix}@ajs.local`;
    const managerCreate = await request("/admin/users", directorToken, {
      method: "POST",
      body: JSON.stringify({ name: "Warehouse Verification Manager", email: managerEmail, role: "manager", subsidiary: "warehouse", phone: "+255700009401", password: initialPassword }),
    });
    if (managerCreate.status !== 201) throw new Error(`Manager creation failed: ${JSON.stringify(managerCreate.body)}`);
    const managerId = managerCreate.body.user.id as string;
    const managerLogin = await login(managerEmail, initialPassword);
    if (managerLogin.status !== 200) throw new Error("New manager login failed");
    const managerToken = managerLogin.body.token as string;
    const [warehouse, logistics, managerAlerts, forbiddenAdmin] = await Promise.all([
      request("/warehouse", managerToken),
      request("/logistics", managerToken),
      request("/alerts", managerToken),
      request("/admin/users", managerToken),
    ]);
    if (warehouse.status !== 200 || logistics.status !== 403 || forbiddenAdmin.status !== 403 || managerAlerts.body.alerts.some((alert: any) => alert.subsidiary !== "warehouse")) throw new Error("Warehouse manager scope failed");
    console.log(`Manager: created=${managerCreate.status} | login=${managerLogin.status} | warehouse=${warehouse.status} | logistics=${logistics.status} | admin=${forbiddenAdmin.status} | alert_scope=warehouse`);

    let management = await request("/admin/users", directorToken);
    let availableDriver = management.body.availableDrivers[0];
    if (!availableDriver) {
      const driverRecord = await request("/logistics/drivers", directorToken, {
        method: "POST",
        body: JSON.stringify({ name: "User Management Test Driver", license_number: `UM-${suffix}`, license_expiry: "2027-12-31", phone: "+255700009402", status: "active" }),
      });
      if (driverRecord.status !== 201) throw new Error(`Unable to create an unlinked driver record: ${JSON.stringify(driverRecord.body)}`);
      management = await request("/admin/users", directorToken);
      availableDriver = management.body.availableDrivers.find((driver: any) => driver.id === driverRecord.body.driver.id);
    }
    if (!availableDriver) throw new Error("New driver record was not available for linking");
    const driverEmail = `portal.driver.${suffix}@ajs.local`;
    const driverCreate = await request("/admin/users", directorToken, {
      method: "POST",
      body: JSON.stringify({ name: availableDriver.name, email: driverEmail, role: "driver", subsidiary: "logistics", phone: "+255700009402", password: initialPassword, driver_id: availableDriver.id }),
    });
    if (driverCreate.status !== 201) throw new Error(`Driver creation failed: ${JSON.stringify(driverCreate.body)}`);
    const driverLogin = await login(driverEmail, initialPassword);
    const driverPortal = await request("/driver/portal", driverLogin.body.token);
    if (driverLogin.status !== 200 || driverPortal.status !== 200 || driverPortal.body.driver?.id !== availableDriver.id) throw new Error("Linked driver portal failed");
    console.log(`Driver: created=${driverCreate.status} | login=${driverLogin.status} | linked_driver=${driverPortal.body.driver.name} (${availableDriver.license_number}) | trips=${driverPortal.body.trips.length}`);

    const openWarehouseAlert = await prisma.alert.findFirst({ where: { subsidiary: "warehouse", status: "open" }, orderBy: { created_at: "desc" } });
    if (!openWarehouseAlert) throw new Error("No open Warehouse alert is available for audit attribution verification");
    const acknowledgment = await request(`/alerts/${openWarehouseAlert.id}/acknowledge`, managerToken, { method: "PATCH" });
    if (acknowledgment.status !== 200) throw new Error("Manager acknowledgment failed");
    const deactivate = await request(`/admin/users/${managerId}/deactivate`, directorToken, { method: "PATCH" });
    const blockedLogin = await login(managerEmail, initialPassword);
    const event = await prisma.alertEvent.findFirstOrThrow({ where: { alert_id: openWarehouseAlert.id, event_type: "acknowledged", actor: managerId }, orderBy: { created_at: "desc" } });
    const retainedUser = await prisma.user.findUniqueOrThrow({ where: { id: event.actor } });
    const refreshedManagement = await request("/admin/users", directorToken);
    const displayedUser = refreshedManagement.body.users.find((user: any) => user.id === managerId);
    if (deactivate.status !== 200 || blockedLogin.status !== 401 || retainedUser.is_active || displayedUser?.name !== retainedUser.name || displayedUser?.is_active !== false) throw new Error("Soft deactivation or audit retention failed");
    console.log(`Deactivation: api=${deactivate.status} | login_after=${blockedLogin.status} | user_retained=${retainedUser.id} | active=${retainedUser.is_active}`);
    console.log(`Audit attribution: event=${event.event_type} | actor_uuid=${event.actor} | actor_name=${retainedUser.name} | Settings_status=inactive`);
    console.log("User management verification passed.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
