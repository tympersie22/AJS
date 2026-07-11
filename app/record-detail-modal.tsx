"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertDetailModal } from "./alert-detail-modal";
import { apiFetch, formatDate, formatTime } from "./lib";
import { Badge, SkeletonRows, inputClass } from "./ui";

type RecordType = "driver" | "vehicle" | "trip" | "permit" | "maintenance" | "movement" | "extension" | "invoice" | "machine";
interface ActiveAlert { id: string; priority: "high" | "medium" | "low"; title: string; message: string; status: string }
interface RecordDetail { type: RecordType; record: any; alerts: ActiveAlert[]; assigned_vehicle?: any; reference?: string; days_in_storage?: number; storage_flag?: string; days_overdue?: number; days_in_status?: number }
interface DetailField { label: string; value: React.ReactNode; tone?: string }
interface DetailConfig { icon: string; title: string; subtitle: string; fields: DetailField[]; fallback: string }
const tzs = new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 });

export function RecordDetailModal({ type, recordId, onClose, onChanged }: { type: RecordType; recordId: string; onClose: () => void; onChanged?: () => void }) {
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setDetail((await apiFetch<{ detail: RecordDetail }>(`/records/${type}/${recordId}`)).detail); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load record"); }
    finally { setLoading(false); }
  }, [recordId, type]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (selectedAlertId) return;
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, selectedAlertId]);

  async function updateMachineStatus(status: string) {
    await apiFetch(`/machinery/machines/${recordId}`, { method: "PATCH", body: JSON.stringify({ status, last_status_change_at: new Date().toISOString() }) });
    window.dispatchEvent(new Event("ajs:alerts-changed"));
    onChanged?.();
    await load();
  }

  return <><div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" data-testid="record-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-modal="true" className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-ajs-border bg-ajs-surface shadow-2xl" data-testid="record-modal" role="dialog">
      <div className="flex items-start justify-between gap-5 border-b border-ajs-border px-6 py-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-ajs-secondary">{titleCase(type)} details</p><button aria-label="Close record details" className="grid h-8 w-8 place-items-center rounded-lg text-xl text-ajs-secondary hover:bg-ajs-border/60 hover:text-white" onClick={onClose}>×</button></div>
      {loading ? <SkeletonRows /> : error && !detail ? <p className="p-6 text-sm text-red-300">{error}</p> : detail ? <RecordContent detail={detail} onAlert={setSelectedAlertId} onMachineStatus={updateMachineStatus} /> : null}
    </section>
  </div>{selectedAlertId ? <AlertDetailModal alertId={selectedAlertId} onAcknowledged={() => { load(); onChanged?.(); }} onClose={() => setSelectedAlertId(null)} /> : null}</>;
}

function RecordContent({ detail, onAlert, onMachineStatus }: { detail: RecordDetail; onAlert: (id: string) => void; onMachineStatus: (status: string) => void }) {
  const record = detail.record;
  const config = recordConfig(detail);
  const fullRecordPath = fullRecordHref(detail.type, record.id);
  return <div className="p-6">
    <div className="flex items-center gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ajs-accent text-sm font-bold text-white">{detail.type === "driver" ? initials(record.name) : config.icon}</span><div className="min-w-0"><h2 className="truncate text-xl font-bold tracking-tight">{config.title}</h2><div className="mt-1 flex items-center gap-2"><Badge value={record.status} />{config.subtitle ? <span className="text-xs text-ajs-secondary">{config.subtitle}</span> : null}</div></div></div>
    <dl className="mt-7 grid gap-x-8 gap-y-5 sm:grid-cols-2">{config.fields.map((field) => <div key={field.label}><dt className="text-[11px] font-bold uppercase tracking-[.12em] text-ajs-secondary">{field.label}</dt><dd className={`mt-1.5 text-sm ${field.tone ?? "text-ajs-primary"}`}>{field.value || "—"}</dd></div>)}</dl>
    {fullRecordPath ? <Link className="mt-7 inline-flex text-sm font-bold text-blue-300 hover:text-blue-200" href={fullRecordPath}>View full record →</Link> : null}
    {detail.type === "machine" ? <label className="mt-6 block text-[11px] font-bold uppercase tracking-[.12em] text-ajs-secondary">Change status<select className={`${inputClass} mt-2`} value={record.status} onChange={(event) => onMachineStatus(event.target.value)}>{["waiting", "successful", "unsuccessful", "idle"].map((status) => <option key={status}>{status}</option>)}</select></label> : null}
    {detail.type === "maintenance" ? <section className="mt-8"><SectionTitle>Notes</SectionTitle><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ajs-primary/90">{record.notes || "No notes"}</p></section> : null}
    <section className="mt-8"><SectionTitle>Active Alerts</SectionTitle>{detail.alerts.length ? <div className="mt-3 space-y-2">{detail.alerts.map((alert) => { const border = alert.priority === "high" ? "border-l-ajs-high" : alert.priority === "medium" ? "border-l-ajs-medium" : "border-l-ajs-low"; return <button className={`w-full border-l-2 ${border} bg-ajs-bg/35 px-4 py-3 text-left transition-colors hover:bg-ajs-border/30`} key={alert.id} onClick={() => onAlert(alert.id)}><span className="block text-sm font-semibold">{alert.title}</span><span className="mt-1 block text-xs text-ajs-secondary">{titleCase(alert.priority)} priority</span></button>; })}</div> : <p className="mt-3 text-sm text-ajs-secondary">No active alerts</p>}</section>
    {errorFallback(config.fallback)}
  </div>;
}

function recordConfig(detail: RecordDetail): DetailConfig {
  const record = detail.record;
  const expiryTone = record.license_expiry && new Date(record.license_expiry).getTime() - Date.now() <= 7 * 86_400_000 ? "text-ajs-high" : undefined;
  if (detail.type === "driver") return { icon: "", title: record.name, subtitle: "Driver", fields: [{ label: "License number", value: record.license_number }, { label: "License expiry", value: formatDate(record.license_expiry), tone: expiryTone }, { label: "Phone", value: record.phone }, { label: "Assigned vehicle", value: detail.assigned_vehicle?.plate_number ?? "No assigned vehicle" }], fallback: "" };
  if (detail.type === "vehicle") return { icon: record.type === "truck" ? "▰" : record.type === "car" ? "◆" : "⚙", title: record.plate_number, subtitle: titleCase(record.type), fields: [{ label: "Type", value: titleCase(record.type) }, { label: "Ownership", value: record.subsidiary_owned ? "Company-owned" : "Hired" }, { label: "Status", value: titleCase(record.status) }], fallback: "" };
  if (detail.type === "trip") return { icon: "⇄", title: `${record.origin} → ${record.destination}`, subtitle: `${record.driver.name} · ${record.vehicle.plate_number}`, fields: [{ label: "Driver", value: record.driver.name }, { label: "Vehicle", value: record.vehicle.plate_number }, { label: "Start time", value: `${formatDate(record.start_time)} ${formatTime(record.start_time)}` }, { label: "Expected end", value: `${formatDate(record.expected_end_time)} ${formatTime(record.expected_end_time)}` }, { label: "Actual end", value: record.actual_end_time ? `${formatDate(record.actual_end_time)} ${formatTime(record.actual_end_time)}` : "Not completed" }, { label: "GPS status", value: titleCase(record.gps_status) }], fallback: "" };
  if (detail.type === "permit") return { icon: "◇", title: `${titleCase(record.permit_type)} · ${detail.reference}`, subtitle: record.driver?.name ?? record.vehicle?.plate_number ?? "Unlinked", fields: [{ label: "Issue date", value: formatDate(record.issue_date) }, { label: "Expiry date", value: formatDate(record.expiry_date) }, { label: "Linked driver", value: record.driver?.name ?? "No linked driver" }, { label: "Linked vehicle", value: record.vehicle?.plate_number ?? "No linked vehicle" }], fallback: "" };
  if (detail.type === "maintenance") return { icon: "⌁", title: `${titleCase(record.type)} · ${record.vehicle.plate_number}`, subtitle: "Maintenance", fields: [{ label: "Vehicle", value: record.vehicle.plate_number }, { label: "Scheduled date", value: formatDate(record.scheduled_date) }, { label: "Completed date", value: record.completed_date ? formatDate(record.completed_date) : "Not completed" }, { label: "Status", value: titleCase(record.status) }], fallback: "" };
  if (detail.type === "movement") return { icon: "▤", title: record.reference_number, subtitle: `${titleCase(record.item_category)} · ${titleCase(record.type)}`, fields: [{ label: "Chassis number", value: record.chassis_number ?? "No chassis number" }, { label: "Bond value", value: record.bond_value_tzs ? tzs.format(Number(record.bond_value_tzs)) : "No bond value" }, { label: "Vehicle description", value: record.vehicle_description ?? "No description" }, { label: "Category", value: titleCase(record.item_category) }, { label: "Movement", value: titleCase(record.type) }, { label: "Entry date", value: formatDate(record.entry_date) }, { label: "Exit date", value: record.exit_date ? formatDate(record.exit_date) : "Still in storage" }, { label: "Days in storage", value: `${detail.days_in_storage} days` }, { label: "Storage flag", value: detail.storage_flag, tone: detail.storage_flag === "OK" ? "text-ajs-success" : detail.storage_flag === "NEAR_LIMIT" ? "text-ajs-medium" : "text-ajs-high" }], fallback: "" };
  if (detail.type === "extension") return { icon: "+", title: record.movement.reference_number, subtitle: "Bonded extension", fields: [{ label: "Requested date", value: formatDate(record.requested_date) }, { label: "Extended until", value: formatDate(record.extended_until) }, { label: "Status", value: titleCase(record.status) }], fallback: "" };
  if (detail.type === "invoice") return { icon: "$", title: record.movement.reference_number, subtitle: "Warehouse invoice", fields: [{ label: "Amount", value: new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS" }).format(Number(record.amount)) }, { label: "Issued date", value: formatDate(record.issued_date) }, { label: "Due date", value: formatDate(record.due_date) }, { label: "Paid date", value: record.paid_date ? formatDate(record.paid_date) : "Unpaid" }, { label: "Days overdue", value: `${detail.days_overdue} days` }, { label: "Status", value: titleCase(record.status) }], fallback: "" };
  return { icon: "⚙", title: `${record.name} · ${record.asset_tag}`, subtitle: record.subsidiary_location, fields: [{ label: "Location", value: record.subsidiary_location }, { label: "Status", value: titleCase(record.status) }, { label: "Last status change", value: formatDate(record.last_status_change_at) }, { label: "Days in status", value: `${detail.days_in_status} days` }], fallback: "" };
}

function SectionTitle({ children }: { children: React.ReactNode }) { return <h3 className="text-[11px] font-bold uppercase tracking-[.16em] text-ajs-secondary">{children}</h3>; }
function initials(name: string) { const words = name.trim().split(/\s+/); return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase(); }
function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function errorFallback(value: string) { return value ? <p className="mt-6 text-sm text-ajs-secondary">{value}</p> : null; }
function fullRecordHref(type: RecordType, id: string) {
  if (type === "movement") return `/warehouse/movements/${id}`;
  if (type === "driver") return `/logistics/drivers/${id}`;
  if (type === "trip") return `/logistics/trips/${id}`;
  return null;
}
