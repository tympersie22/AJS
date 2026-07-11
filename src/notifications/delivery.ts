import AfricasTalking from "africastalking";
import nodemailer from "nodemailer";
import { NotificationChannel, User } from "@prisma/client";
import { prisma } from "../data/prisma";

const SMS_MAX_LENGTH = 160;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}

function smsConfigured(): boolean {
  return Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME && process.env.AT_SENDER_ID);
}

function smsMessage(priority: string, title: string, message: string): string {
  const prefix = `[AJS ALERT — ${priority.toUpperCase()}] `;
  const suffix = " Log in to dashboard.";
  const detail = message.startsWith(`${title}:`) ? message.slice(title.length + 1).trim() : message;
  const available = SMS_MAX_LENGTH - prefix.length - suffix.length;
  const content = `${title} ${detail}`.replace(/\s+/g, " ").trim().slice(0, available).trimEnd();
  return `${prefix}${content}${suffix}`;
}

async function writeLog(alertId: string, channel: NotificationChannel, recipientId: string, status: "sent" | "failed", failure?: string) {
  await prisma.notificationLog.create({
    data: {
      alert_id: alertId,
      channel,
      recipient_user_id: recipientId,
      status,
      error_message: failure,
    },
  });
}

async function alreadyAttempted(alertId: string, channel: NotificationChannel, recipientId: string): Promise<boolean> {
  return Boolean(await prisma.notificationLog.findUnique({
    where: { alert_id_channel_recipient_user_id: { alert_id: alertId, channel, recipient_user_id: recipientId } },
    select: { id: true },
  }));
}

async function deliverEmail(alert: Awaited<ReturnType<typeof loadAlert>>, recipient: User) {
  if (await alreadyAttempted(alert.id, "email", recipient.id)) return;
  if (!emailConfigured()) {
    const failure = "SMTP is not configured";
    console.warn(`[notifications] ${failure}; email skipped for ${recipient.email}`);
    await writeLog(alert.id, "email", recipient.id, "failed", failure);
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
    const body = [
      `Priority: ${alert.priority.toUpperCase()}`,
      `Subsidiary: ${alert.subsidiary}`,
      `Item type: ${alert.watched_item.item_type}`,
      `Title: ${alert.watched_item.title}`,
      `Message: ${alert.message}`,
      `Timestamp: ${alert.created_at.toISOString()}`,
      "",
      "Log in to the AJS dashboard to acknowledge this alert.",
    ].join("\n");
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: recipient.email,
      subject: `[AJS ALERT — ${alert.priority.toUpperCase()}] ${alert.watched_item.title}`,
      text: body,
    });
    await writeLog(alert.id, "email", recipient.id, "sent");
  } catch (error) {
    const failure = errorMessage(error);
    console.warn(`[notifications] email delivery failed for ${recipient.email}: ${failure}`);
    await writeLog(alert.id, "email", recipient.id, "failed", failure);
  }
}

async function deliverSms(alert: Awaited<ReturnType<typeof loadAlert>>, recipient: User) {
  if (!recipient.phone || await alreadyAttempted(alert.id, "sms", recipient.id)) return;
  if (!smsConfigured()) {
    const failure = "Africa's Talking is not configured";
    console.warn(`[notifications] ${failure}; SMS skipped for ${recipient.phone}`);
    await writeLog(alert.id, "sms", recipient.id, "failed", failure);
    return;
  }

  try {
    const client = AfricasTalking({ apiKey: process.env.AT_API_KEY!, username: process.env.AT_USERNAME! });
    await client.SMS.send({
      to: [recipient.phone],
      senderId: process.env.AT_SENDER_ID,
      message: smsMessage(alert.priority, alert.watched_item.title, alert.message),
    });
    await writeLog(alert.id, "sms", recipient.id, "sent");
  } catch (error) {
    const failure = errorMessage(error);
    console.warn(`[notifications] SMS delivery failed for ${recipient.phone}: ${failure}`);
    await writeLog(alert.id, "sms", recipient.id, "failed", failure);
  }
}

function loadAlert(alertId: string) {
  return prisma.alert.findUniqueOrThrow({ where: { id: alertId }, include: { watched_item: true } });
}

export async function dispatchCreatedAlert(alertId: string): Promise<void> {
  try {
    const [alert, createdEvent] = await Promise.all([
      loadAlert(alertId),
      prisma.alertEvent.findFirst({ where: { alert_id: alertId, event_type: "created" }, select: { id: true } }),
    ]);
    if (!createdEvent || alert.priority === "low") return;

    const recipients = await prisma.user.findMany({
      where: {
        is_active: true,
        OR: [{ id: alert.watched_item.owner_user_id }, { role: { in: ["director", "gm"] } }],
      },
    });
    for (const recipient of recipients) {
      await deliverEmail(alert, recipient);
      await deliverSms(alert, recipient);
    }
  } catch (error) {
    console.warn(`[notifications] alert ${alertId} delivery pipeline failed: ${errorMessage(error)}`);
  }
}

export const notificationFormatting = { smsMessage };
