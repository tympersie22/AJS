import { AlertPriority, WatchedItem } from "@prisma/client";
import { AlertThresholdValues, DEFAULT_ALERT_THRESHOLDS } from "./thresholds";

export interface AlertRuleResult {
  priority: AlertPriority;
  message: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Deadlines are stored in UTC instants, with date-only business deadlines normalized
// to 23:59:59.999 Africa/Dar_es_Salaam before reaching the rule engine.
function hoursUntilDeadline(dueAt: Date, now: Date): number {
  return (dueAt.getTime() - now.getTime()) / HOUR_MS;
}

function daysOverdue(dueAt: Date, now: Date): number {
  return (now.getTime() - dueAt.getTime()) / DAY_MS;
}

function deadlineMessage(item: WatchedItem, label: string, priority: AlertPriority): string {
  return `${item.title}: ${label} requires ${priority} attention.`;
}

// Permit deadlines are operationally urgent once inside the seven-day window.
export function evaluatePermit(
  item: WatchedItem,
  now: Date,
  deadlineType = "permit",
  thresholds: AlertThresholdValues = DEFAULT_ALERT_THRESHOLDS
): AlertRuleResult | null {
  if (!item.due_at) return null;

  const remainingHours = hoursUntilDeadline(item.due_at, now);

  if (remainingHours <= thresholds.permit_high_hours) {
    return {
      priority: "high",
      message: deadlineMessage(item, `${deadlineType} deadline within ${thresholds.permit_high_hours} hours`, "high"),
    };
  }

  if (remainingHours <= thresholds.permit_medium_days * 24) {
    return {
      priority: "medium",
      message: deadlineMessage(item, `${deadlineType} deadline within ${thresholds.permit_medium_days} days`, "medium"),
    };
  }

  return null;
}

// Trips become high-priority once they are still in progress after expected end time.
export function evaluateTrip(item: WatchedItem, now: Date): AlertRuleResult | null {
  if (item.status !== "in_progress" || !item.due_at || item.due_at.getTime() > now.getTime()) {
    return null;
  }

  return { priority: "high", message: `${item.title}: trip is in progress after expected end time.` };
}

// Warehouse extensions need escalation earlier than permits because they affect bonded storage deadlines.
export function evaluateExtension(
  item: WatchedItem,
  now: Date,
  thresholds: AlertThresholdValues = DEFAULT_ALERT_THRESHOLDS
): AlertRuleResult | null {
  if (item.status === "released") return null;
  if (!item.due_at) return null;

  const remainingHours = hoursUntilDeadline(item.due_at, now);

  if (remainingHours <= thresholds.extension_high_days * 24) {
    return {
      priority: "high",
      message: deadlineMessage(item, `extension deadline within ${thresholds.extension_high_days} days`, "high"),
    };
  }

  if (remainingHours <= thresholds.extension_medium_days * 24) {
    return {
      priority: "medium",
      message: deadlineMessage(item, `extension deadline within ${thresholds.extension_medium_days} days`, "medium"),
    };
  }

  return null;
}

// Invoices escalate only after the due date has passed.
export function evaluateInvoice(
  item: WatchedItem,
  now: Date,
  thresholds: AlertThresholdValues = DEFAULT_ALERT_THRESHOLDS
): AlertRuleResult | null {
  if (!item.due_at) return null;

  const overdueDays = daysOverdue(item.due_at, now);

  if (overdueDays > thresholds.invoice_high_overdue_days) {
    return { priority: "high", message: `${item.title}: invoice is overdue by more than ${thresholds.invoice_high_overdue_days} days.` };
  }

  if (overdueDays >= thresholds.invoice_medium_overdue_days) {
    return { priority: "medium", message: `${item.title}: invoice is overdue by at least ${thresholds.invoice_medium_overdue_days} day(s).` };
  }

  return null;
}

// Machine status uses threshold_value as days idle until Phase 4 wires real machine records.
export function evaluateMachineStatus(
  item: WatchedItem,
  thresholds: AlertThresholdValues = DEFAULT_ALERT_THRESHOLDS
): AlertRuleResult | null {
  const daysIdle = item.threshold_value ?? 0;

  if (item.status !== "idle") {
    return null;
  }

  if (daysIdle > thresholds.machine_idle_high_days) {
    return { priority: "high", message: `${item.title}: machine has been idle for more than ${thresholds.machine_idle_high_days} days.` };
  }

  if (daysIdle > thresholds.machine_idle_medium_days) {
    return { priority: "medium", message: `${item.title}: machine has been idle for more than ${thresholds.machine_idle_medium_days} days.` };
  }

  return null;
}

export function evaluateWatchedItem(
  item: WatchedItem,
  now = new Date(),
  thresholds: AlertThresholdValues = DEFAULT_ALERT_THRESHOLDS
): AlertRuleResult | null {
  switch (item.item_type) {
    case "permit":
      return evaluatePermit(item, now, "permit", thresholds);
    case "trip":
      return evaluateTrip(item, now);
    case "extension":
      return evaluateExtension(item, now, thresholds);
    case "invoice":
      return evaluateInvoice(item, now, thresholds);
    case "machine_status":
      return evaluateMachineStatus(item, thresholds);
    case "maintenance":
      return evaluatePermit(item, now, "maintenance", thresholds);
    default:
      return null;
  }
}
