import cron from "node-cron";
import nodemailer from "nodemailer";
import { User } from "@prisma/client";
import { prisma } from "../data/prisma";
import { addEatCalendarDaysPreservingTime } from "../time/eat";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BONDED_STORAGE_DAYS = 180;

export interface DigestResult {
  body: string;
  subject: string;
  recipients: Array<Pick<User, "id" | "email" | "name">>;
  attempted: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}

function money(value: number) {
  return new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "Africa/Dar_es_Salaam", year: "numeric" }).format(value);
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function displaySubsidiary(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function weeklyDigestData(now: Date) {
  const since = new Date(now.getTime() - WEEK_MS);
  const [openAlerts, createdAlerts, resolvedEvents, movements] = await Promise.all([
    prisma.alert.groupBy({
      by: ["subsidiary", "priority"],
      where: { status: "open" },
      _count: { _all: true },
      orderBy: [{ subsidiary: "asc" }, { priority: "asc" }],
    }),
    prisma.alert.count({ where: { created_at: { gte: since, lte: now } } }),
    prisma.alertEvent.groupBy({
      by: ["event_type"],
      where: { event_type: { in: ["resolved", "auto_resolved"] }, created_at: { gte: since, lte: now } },
      _count: { _all: true },
    }),
    prisma.movement.findMany({
      where: { type: "carry_in", exit_date: null },
      orderBy: [{ entry_date: "asc" }, { id: "asc" }],
    }),
  ]);

  const openByPriority = { high: 0, medium: 0, low: 0 };
  const openBySubsidiary: Record<string, { high: number; medium: number; low: number; total: number }> = {};
  for (const row of openAlerts) {
    openByPriority[row.priority] += row._count._all;
    openBySubsidiary[row.subsidiary] ??= { high: 0, medium: 0, low: 0, total: 0 };
    openBySubsidiary[row.subsidiary][row.priority] += row._count._all;
    openBySubsidiary[row.subsidiary].total += row._count._all;
  }

  let overLimitCount = 0;
  let overLimitBondValue = 0;
  const crossedThisWeek = [];
  for (const movement of movements) {
    const crossingDate = addEatCalendarDaysPreservingTime(movement.entry_date, BONDED_STORAGE_DAYS);
    if (crossingDate <= now) {
      overLimitCount += 1;
      overLimitBondValue += Number(movement.bond_value_tzs ?? 0);
    }
    if (crossingDate >= since && crossingDate <= now) {
      crossedThisWeek.push({
        reference_number: movement.reference_number,
        chassis_number: movement.chassis_number,
        vehicle_description: movement.vehicle_description,
        bond_value_tzs: Number(movement.bond_value_tzs ?? 0),
        crossing_date: crossingDate,
      });
    }
  }

  const humanResolved = resolvedEvents.find((row) => row.event_type === "resolved")?._count._all ?? 0;
  const systemResolved = resolvedEvents.find((row) => row.event_type === "auto_resolved")?._count._all ?? 0;
  return { since, openByPriority, openBySubsidiary, createdAlerts, humanResolved, systemResolved, overLimitCount, overLimitBondValue, crossedThisWeek };
}

export async function renderWeeklyDigest(now = new Date()) {
  const data = await weeklyDigestData(now);
  const totalOpen = data.openByPriority.high + data.openByPriority.medium + data.openByPriority.low;
  const subsidiaryLines = Object.entries(data.openBySubsidiary).map(([subsidiary, counts]) => (
    `- ${displaySubsidiary(subsidiary)}: ${counts.total} open (${counts.high} high, ${counts.medium} medium, ${counts.low} low)`
  ));
  const crossedLines = data.crossedThisWeek.length
    ? data.crossedThisWeek.map((item) => `- ${item.reference_number} / ${item.chassis_number ?? "no chassis"}: crossed ${formatDate(item.crossing_date)}, ${money(item.bond_value_tzs)}, ${item.vehicle_description ?? "no description"}`)
    : ["- None"];

  const body = [
    "AJS Weekly Digest",
    "",
    `${data.overLimitCount} bonded warehouse items are over the 180-day limit (${money(data.overLimitBondValue)} exposure).`,
    `${totalOpen} alerts are currently open: ${data.openByPriority.high} high, ${data.openByPriority.medium} medium, ${data.openByPriority.low} low.`,
    "",
    `Period: ${formatDate(data.since)} to ${formatDate(now)} (Africa/Dar_es_Salaam)`,
    "",
    "Open alerts by subsidiary:",
    ...(subsidiaryLines.length ? subsidiaryLines : ["- None"]),
    "",
    "Alert movement in the past 7 days:",
    `- Created: ${countLabel(data.createdAlerts, "alert")}`,
    `- Resolved by system: ${countLabel(data.systemResolved, "alert")}`,
    `- Resolved by people: ${countLabel(data.humanResolved, "alert")}`,
    "",
    "Bonded storage items that crossed the 180-day limit this week:",
    ...crossedLines,
    "",
    "Log in to the AJS dashboard for details: Compliance and Alerts Dashboard.",
  ].join("\n");

  return {
    subject: `[AJS WEEKLY DIGEST] ${data.overLimitCount} bonded items over limit`,
    body,
  };
}

async function writeDigestLog(recipientId: string, status: "sent" | "failed", failure?: string) {
  await prisma.notificationLog.create({
    data: {
      alert_id: null,
      channel: "digest",
      recipient_user_id: recipientId,
      status,
      error_message: failure,
    },
  });
}

async function sendDigestEmail(recipient: Pick<User, "id" | "email" | "name">, subject: string, body: string) {
  if (!emailConfigured()) {
    const failure = "SMTP is not configured";
    console.warn(`[digest] ${failure}; email skipped for ${recipient.email}`);
    await writeDigestLog(recipient.id, "failed", failure);
    return;
  }
  try {
    const port = Number(process.env.SMTP_PORT);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: recipient.email,
      subject,
      text: body,
    });
    await writeDigestLog(recipient.id, "sent");
  } catch (error) {
    const failure = errorMessage(error);
    console.warn(`[digest] email delivery failed for ${recipient.email}: ${failure}`);
    await writeDigestLog(recipient.id, "failed", failure);
  }
}

export async function sendWeeklyDigest(now = new Date()): Promise<DigestResult> {
  const startedAt = now;
  let recipientsProcessed = 0;
  let deliveriesAttempted = 0;
  try {
    const [{ subject, body }, recipients] = await Promise.all([
      renderWeeklyDigest(now),
      prisma.user.findMany({
        where: { is_active: true, role: { in: ["director", "gm"] } },
        select: { id: true, email: true, name: true },
        orderBy: { email: "asc" },
      }),
    ]);

    for (const recipient of recipients) {
      recipientsProcessed += 1;
      deliveriesAttempted += 1;
      await sendDigestEmail(recipient, subject, body);
    }

    await prisma.digestHeartbeat.create({
      data: {
        run_at: startedAt,
        status: "success",
        recipients_processed: recipientsProcessed,
        deliveries_attempted: deliveriesAttempted,
      },
    });
    return { body, subject, recipients, attempted: deliveriesAttempted };
  } catch (error) {
    const message = errorMessage(error);
    await prisma.digestHeartbeat.create({
      data: {
        run_at: startedAt,
        status: "failed",
        error_message: message,
        recipients_processed: recipientsProcessed,
        deliveries_attempted: deliveriesAttempted,
      },
    }).catch((heartbeatError) => {
      console.error("Failed to record digest heartbeat", heartbeatError);
    });
    throw error;
  }
}

export function scheduleWeeklyDigest(): void {
  cron.schedule("0 8 * * 1", () => {
    void sendWeeklyDigest().catch((error) => console.error("Weekly digest failed", error));
  }, { timezone: "Africa/Dar_es_Salaam" });
}
