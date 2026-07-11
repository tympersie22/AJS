import { prisma } from "../data/prisma";

export const DEFAULT_ALERT_THRESHOLDS = {
  permit_high_hours: 48,
  permit_medium_days: 7,
  extension_high_days: 2,
  extension_medium_days: 5,
  invoice_medium_overdue_days: 1,
  invoice_high_overdue_days: 7,
  machine_idle_medium_days: 2,
  machine_idle_high_days: 5,
  bonded_storage_days: 180,
} as const;

export type AlertThresholdKey = keyof typeof DEFAULT_ALERT_THRESHOLDS;
export type AlertThresholdValues = Record<AlertThresholdKey, number>;

export const ALERT_THRESHOLD_DEFINITIONS: Array<{
  rule_key: AlertThresholdKey;
  label: string;
  unit: string;
  description: string;
}> = [
  { rule_key: "permit_high_hours", label: "Permit high priority", unit: "hours", description: "Permit, driver license, and maintenance deadlines become high priority inside this window." },
  { rule_key: "permit_medium_days", label: "Permit medium priority", unit: "days", description: "Permit, driver license, and maintenance deadlines become medium priority inside this window." },
  { rule_key: "extension_high_days", label: "Extension high priority", unit: "days", description: "Warehouse extension and bonded storage deadlines become high priority inside this window." },
  { rule_key: "extension_medium_days", label: "Extension medium priority", unit: "days", description: "Warehouse extension and bonded storage deadlines become medium priority inside this window." },
  { rule_key: "invoice_medium_overdue_days", label: "Invoice medium priority", unit: "days overdue", description: "Warehouse invoices become medium priority after this many overdue days." },
  { rule_key: "invoice_high_overdue_days", label: "Invoice high priority", unit: "days overdue", description: "Warehouse invoices become high priority after this many overdue days." },
  { rule_key: "machine_idle_medium_days", label: "Machine idle medium", unit: "days idle", description: "Idle machinery becomes medium priority after this many days." },
  { rule_key: "machine_idle_high_days", label: "Machine idle high", unit: "days idle", description: "Idle machinery becomes high priority after this many days." },
  { rule_key: "bonded_storage_days", label: "Bonded storage period", unit: "days", description: "TRA/EAC bonded warehouse permitted storage period — 6 months per AJS operations." },
];

function isThresholdKey(value: string): value is AlertThresholdKey {
  return Object.prototype.hasOwnProperty.call(DEFAULT_ALERT_THRESHOLDS, value);
}

export async function getAlertThresholdValues(): Promise<AlertThresholdValues> {
  const rows = await prisma.alertThreshold.findMany();
  const values: AlertThresholdValues = { ...DEFAULT_ALERT_THRESHOLDS };
  for (const row of rows) {
    if (isThresholdKey(row.rule_key)) values[row.rule_key] = row.value;
  }
  return values;
}

export async function listAlertThresholdSettings() {
  const rows = await prisma.alertThreshold.findMany({ orderBy: { rule_key: "asc" } });
  const values = new Map(rows.map((row) => [row.rule_key, row]));
  return ALERT_THRESHOLD_DEFINITIONS.map((definition) => {
    const row = values.get(definition.rule_key);
    return {
      ...definition,
      value: row?.value ?? DEFAULT_ALERT_THRESHOLDS[definition.rule_key],
      default_value: DEFAULT_ALERT_THRESHOLDS[definition.rule_key],
      updated_by: row?.updated_by ?? null,
      updated_at: row?.updated_at ?? null,
    };
  });
}

export async function updateAlertThreshold(ruleKey: string, value: number, userId: string) {
  if (!isThresholdKey(ruleKey)) {
    throw new Error("Unknown alert threshold");
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Threshold value must be a positive integer");
  }
  return prisma.alertThreshold.upsert({
    where: { rule_key: ruleKey },
    create: { rule_key: ruleKey, value, updated_by: userId },
    update: { value, updated_by: userId },
  });
}
