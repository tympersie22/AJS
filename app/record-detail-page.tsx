"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "./shell";
import { apiFetch, formatDate, formatTime, timeAgo } from "./lib";
import { Badge, SkeletonRows, buttonClass, panelClass } from "./ui";

type RecordType = "driver" | "trip" | "movement";
interface AlertEventRow { id: string; event_type: string; actor_name: string; note: string | null; created_at: string }
interface AlertHistoryRow { id: string; priority: "high" | "medium" | "low"; status: string; message: string; title: string; item_type: string; created_at: string; events: AlertEventRow[] }
interface ActiveAlert { id: string; priority: "high" | "medium" | "low"; title: string; message: string; status: string }
interface RecordDetail {
  type: RecordType;
  subsidiary: "logistics" | "warehouse";
  record: any;
  assigned_vehicle?: any;
  alerts: ActiveAlert[];
  alert_history: AlertHistoryRow[];
  days_in_storage?: number;
  storage_flag?: "OK" | "NEAR_LIMIT" | "OVER_LIMIT";
}

const tzs = new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 });

export function RecordDetailPage({ type }: { type: RecordType }) {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDetail((await apiFetch<{ detail: RecordDetail }>(`/records/${type}/${params.id}`)).detail);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load record");
    } finally {
      setLoading(false);
    }
  }, [params.id, type]);

  useEffect(() => { load(); }, [load]);

  const shell = pageShell(type);
  return <AppShell eyebrow={shell.eyebrow} title={shell.title}>
    {loading ? <section className={panelClass}><SkeletonRows /></section> : error ? <section className={`${panelClass} p-6`}><p className="text-sm text-red-300">{error}</p><Link className={`${buttonClass} mt-5`} href={shell.backHref}>Back to {shell.backLabel}</Link></section> : detail ? <DetailContent detail={detail} /> : null}
  </AppShell>;
}

function DetailContent({ detail }: { detail: RecordDetail }) {
  const config = useMemo(() => detailConfig(detail), [detail]);
  return <div className="space-y-6">
    <section className={`${panelClass} p-6`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ajs-accent text-base font-black text-white">{detail.type === "driver" ? initials(detail.record.name) : config.icon}</span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-ajs-secondary">{config.kicker}</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">{config.title}</h2>
            <p className="mt-2 text-sm text-ajs-secondary">{config.subtitle}</p>
          </div>
        </div>
        {detail.type === "movement" ? <StorageSummary detail={detail} /> : <Badge value={detail.record.status} />}
      </div>
      <dl className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">{config.fields.map((field) => <div key={field.label}><dt className="text-[11px] font-bold uppercase tracking-[.12em] text-ajs-secondary">{field.label}</dt><dd className={`mt-1.5 text-sm ${field.tone ?? "text-ajs-primary"}`}>{field.value || "—"}</dd></div>)}</dl>
    </section>
    <section className={`${panelClass} p-6`}>
      <SectionTitle>Active Alerts</SectionTitle>
      {detail.alerts.length ? <div className="mt-4 grid gap-3">{detail.alerts.map((alert) => <AlertCard alert={alert} key={alert.id} />)}</div> : <p className="mt-4 text-sm text-ajs-secondary">No active alerts</p>}
    </section>
    <section className={`${panelClass} p-6`}>
      <SectionTitle>Full Alert History</SectionTitle>
      {detail.alert_history.length ? <div className="mt-5 space-y-5">{detail.alert_history.map((alert) => <HistoryCard alert={alert} key={alert.id} />)}</div> : <p className="mt-4 text-sm text-ajs-secondary">No alerts have been raised for this record.</p>}
    </section>
  </div>;
}

function StorageSummary({ detail }: { detail: RecordDetail }) {
  const flag = detail.storage_flag ?? "OK";
  const tone = flag === "OVER_LIMIT" ? "text-ajs-high" : flag === "NEAR_LIMIT" ? "text-ajs-medium" : "text-ajs-success";
  return <div className="rounded-xl border border-ajs-border bg-ajs-bg/50 px-5 py-4 text-right">
    <p className="text-[11px] font-bold uppercase tracking-[.14em] text-ajs-secondary">Storage Exposure</p>
    <p className={`mt-1 text-3xl font-black ${tone}`}>{detail.days_in_storage ?? 0} days</p>
    <p className={`mt-1 text-xs font-bold uppercase tracking-wide ${tone}`}>{flag.replace(/_/g, " ")}</p>
  </div>;
}

function AlertCard({ alert }: { alert: ActiveAlert }) {
  const border = alert.priority === "high" ? "border-l-ajs-high" : alert.priority === "medium" ? "border-l-ajs-medium" : "border-l-ajs-low";
  return <Link className={`block border-l-2 ${border} bg-ajs-bg/35 px-4 py-3 transition-colors hover:bg-ajs-border/30`} href={`/dashboard?alert=${alert.id}`}>
    <span className="block text-sm font-semibold">{alert.title}</span>
    <span className="mt-1 block text-xs text-ajs-secondary">{titleCase(alert.priority)} priority · {titleCase(alert.status)}</span>
  </Link>;
}

function HistoryCard({ alert }: { alert: AlertHistoryRow }) {
  const color = alert.priority === "high" ? "text-ajs-high" : alert.priority === "medium" ? "text-ajs-medium" : "text-ajs-low";
  return <article className="rounded-xl border border-ajs-border bg-ajs-bg/35 p-5">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div><p className={`text-xs font-bold uppercase tracking-[.14em] ${color}`}>{titleCase(alert.priority)} priority</p><h3 className="mt-1 font-semibold">{alert.title}</h3><p className="mt-2 text-sm leading-6 text-ajs-primary/85">{alert.message}</p></div>
      <Badge value={alert.status} />
    </div>
    <ol className="mt-5 space-y-0">{alert.events.map((event, index) => <li className="relative flex gap-3 pb-4 last:pb-0" key={event.id}><span className="relative z-10 mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ajs-secondary" aria-hidden />{index < alert.events.length - 1 ? <span className="absolute bottom-0 left-[3px] top-3 w-px bg-ajs-border" aria-hidden /> : null}<div><p className="text-sm">{eventLabel(event.event_type)} by {event.actor_name}</p><p className="mt-1 text-xs text-ajs-secondary">{timeAgo(event.created_at)}{event.note ? ` · ${event.note}` : ""}</p></div></li>)}</ol>
  </article>;
}

function detailConfig(detail: RecordDetail) {
  const record = detail.record;
  const expiryTone = record.license_expiry && new Date(record.license_expiry).getTime() - Date.now() <= 7 * 86_400_000 ? "text-ajs-high" : undefined;
  if (detail.type === "driver") return {
    icon: "",
    kicker: "Driver record",
    title: record.name,
    subtitle: `${titleCase(record.status)} · ${record.phone}`,
    fields: [
      { label: "License number", value: record.license_number },
      { label: "License expiry", value: formatDate(record.license_expiry), tone: expiryTone },
      { label: "Phone", value: record.phone },
      { label: "Assigned vehicle", value: detail.assigned_vehicle?.plate_number ?? "No assigned vehicle" },
      { label: "Trips on file", value: `${record.trips?.length ?? 0}` },
      { label: "Permits on file", value: `${record.permits?.length ?? 0}` },
    ],
  };
  if (detail.type === "trip") return {
    icon: "⇄",
    kicker: "Trip record",
    title: `${record.origin} → ${record.destination}`,
    subtitle: `${record.driver.name} · ${record.vehicle.plate_number}`,
    fields: [
      { label: "Driver", value: record.driver.name },
      { label: "Vehicle", value: record.vehicle.plate_number },
      { label: "Start time", value: `${formatDate(record.start_time)} ${formatTime(record.start_time)}` },
      { label: "Expected end", value: `${formatDate(record.expected_end_time)} ${formatTime(record.expected_end_time)}` },
      { label: "Actual end", value: record.actual_end_time ? `${formatDate(record.actual_end_time)} ${formatTime(record.actual_end_time)}` : "Not completed" },
      { label: "GPS status", value: titleCase(record.gps_status) },
      { label: "Status", value: titleCase(record.status) },
    ],
  };
  return {
    icon: "▤",
    kicker: "Movement record",
    title: record.reference_number,
    subtitle: `${titleCase(record.item_category)} · ${record.chassis_number ?? "No chassis"}`,
    fields: [
      { label: "TANSAD", value: record.reference_number },
      { label: "Chassis number", value: record.chassis_number ?? "No chassis number" },
      { label: "Vehicle description", value: record.vehicle_description ?? "No description" },
      { label: "Bond value", value: record.bond_value_tzs ? tzs.format(Number(record.bond_value_tzs)) : "No bond value" },
      { label: "Category", value: titleCase(record.item_category) },
      { label: "Movement", value: titleCase(record.type) },
      { label: "Entry date", value: formatDate(record.entry_date) },
      { label: "Exit date", value: record.exit_date ? formatDate(record.exit_date) : "Still in storage" },
      { label: "Status", value: titleCase(record.status) },
    ],
  };
}

function pageShell(type: RecordType) {
  if (type === "movement") return { eyebrow: "Warehouse detail", title: "Movement Record", backHref: "/warehouse", backLabel: "Warehouse" };
  if (type === "trip") return { eyebrow: "Logistics detail", title: "Trip Record", backHref: "/logistics", backLabel: "Logistics" };
  return { eyebrow: "Logistics detail", title: "Driver Record", backHref: "/logistics", backLabel: "Logistics" };
}

function SectionTitle({ children }: { children: React.ReactNode }) { return <h3 className="text-[11px] font-bold uppercase tracking-[.16em] text-ajs-secondary">{children}</h3>; }
function initials(name: string) { const words = name.trim().split(/\s+/); return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase(); }
function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function eventLabel(value: string) { return value === "auto_resolved" ? "Automatically resolved" : titleCase(value); }
