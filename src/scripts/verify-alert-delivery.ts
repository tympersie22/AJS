import { runAlertEngine } from "../alerts/engine";
import { prisma } from "../data/prisma";
import { dispatchCreatedAlert, notificationFormatting } from "../notifications/delivery";

const HOUR_MS = 60 * 60 * 1000;
const credentialKeys = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "AT_API_KEY",
  "AT_USERNAME",
  "AT_SENDER_ID",
] as const;

async function main() {
  const now = new Date();
  const suffix = now.getTime().toString();
  const savedCredentials = new Map(credentialKeys.map((key) => [key, process.env[key]]));
  for (const key of credentialKeys) delete process.env[key];

  const director = await prisma.user.findUniqueOrThrow({ where: { email: "director@ajs.local" } });
  const inactiveGm = await prisma.user.findUnique({ where: { email: "gm.threshold.1783549686389@ajs.local" } });
  const originalPhone = director.phone;
  await prisma.user.update({ where: { id: director.id }, data: { phone: "+255700000099" } });

  try {
    const highItem = await prisma.watchedItem.create({
      data: {
        subsidiary: "logistics",
        item_type: "permit",
        reference_id: `DELIVERY-HIGH-${suffix}`,
        title: "Truck TZ123ABC — Import Permit",
        status: "active",
        due_at: new Date(now.getTime() + HOUR_MS),
        owner_user_id: director.id,
      },
    });
    const mediumItem = await prisma.watchedItem.create({
      data: {
        subsidiary: "logistics",
        item_type: "permit",
        reference_id: `DELIVERY-MEDIUM-${suffix}`,
        title: "Truck TZ456DEF — Transit Permit",
        status: "active",
        due_at: new Date(now.getTime() + 4 * 24 * HOUR_MS),
        owner_user_id: director.id,
      },
    });

    const firstCreated = await runAlertEngine(now);
    const [highAlert, mediumAlert] = await Promise.all([
      prisma.alert.findFirstOrThrow({ where: { watched_item_id: highItem.id } }),
      prisma.alert.findFirstOrThrow({ where: { watched_item_id: mediumItem.id } }),
    ]);
    if (highAlert.priority !== "high" || mediumAlert.priority !== "medium") throw new Error("Seed alerts have incorrect priorities");

    const lowItem = await prisma.watchedItem.create({
      data: {
        subsidiary: "logistics",
        item_type: "notification_test_low",
        reference_id: `DELIVERY-LOW-${suffix}`,
        title: "Low-priority dashboard-only test",
        status: "active",
        owner_user_id: director.id,
      },
    });
    const lowAlert = await prisma.alert.create({
      data: {
        watched_item_id: lowItem.id,
        subsidiary: "logistics",
        priority: "low",
        message: "Low-priority dashboard-only test alert.",
      },
    });
    await dispatchCreatedAlert(lowAlert.id);

    const testAlertIds = [highAlert.id, mediumAlert.id, lowAlert.id];
    const firstLogs = await prisma.notificationLog.findMany({
      where: { alert_id: { in: testAlertIds } },
      orderBy: [{ alert_id: "asc" }, { channel: "asc" }, { recipient_user_id: "asc" }],
    });
    const highLogs = firstLogs.filter((log) => log.alert_id === highAlert.id);
    const mediumLogs = firstLogs.filter((log) => log.alert_id === mediumAlert.id);
    const lowLogs = firstLogs.filter((log) => log.alert_id === lowAlert.id);
    for (const [label, logs] of [["high", highLogs], ["medium", mediumLogs]] as const) {
      if (!logs.some((log) => log.channel === "email" && log.recipient_user_id === director.id && log.status === "failed")) throw new Error(`${label} email attempt was not logged`);
      if (!logs.some((log) => log.channel === "sms" && log.recipient_user_id === director.id && log.status === "failed")) throw new Error(`${label} SMS attempt was not logged`);
    }
    if (lowLogs.length !== 0) throw new Error("Low-priority alert generated notification attempts");
    if (inactiveGm?.is_active === false && firstLogs.some((log) => log.recipient_user_id === inactiveGm.id)) {
      throw new Error("Inactive GM received a notification attempt");
    }

    const beforeSecondRun = firstLogs.length;
    const secondCreated = await runAlertEngine(new Date(now.getTime() + 1000));
    const afterSecondRun = await prisma.notificationLog.count({ where: { alert_id: { in: testAlertIds } } });
    if (secondCreated !== 0 || afterSecondRun !== beforeSecondRun) throw new Error("Second engine run duplicated notification attempts");

    const sampleSms = notificationFormatting.smsMessage(highAlert.priority, highItem.title, highAlert.message);
    if (sampleSms.length > 160) throw new Error("SMS formatter exceeded 160 characters");

    console.log(`engine_first_created=${firstCreated} | engine_second_created=${secondCreated}`);
    console.log(`high_alert=${highAlert.id} | priority=${highAlert.priority} | attempts=${highLogs.length}`);
    console.log(`medium_alert=${mediumAlert.id} | priority=${mediumAlert.priority} | attempts=${mediumLogs.length}`);
    console.log(`low_alert=${lowAlert.id} | priority=${lowAlert.priority} | attempts=${lowLogs.length}`);
    if (inactiveGm) console.log(`inactive_gm=${inactiveGm.id} | active=${inactiveGm.is_active} | notification_attempted=${firstLogs.some((log) => log.recipient_user_id === inactiveGm.id)}`);
    for (const log of firstLogs) console.log(`${log.alert_id} | ${log.channel} | recipient=${log.recipient_user_id} | ${log.status} | ${log.error_message}`);
    console.log(`notification_rows_before_second=${beforeSecondRun} | notification_rows_after_second=${afterSecondRun}`);
    console.log(`sample_sms_length=${sampleSms.length} | ${sampleSms}`);
    console.log("Alert delivery verification passed without provider credentials.");
  } finally {
    await prisma.user.update({ where: { id: director.id }, data: { phone: originalPhone } });
    for (const key of credentialKeys) {
      const value = savedCredentials.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
