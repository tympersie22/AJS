"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../shell";
import { apiFetch, formatDate, formatTime } from "../lib";
import { AlertMark, Badge, EmptyState, Modal, SkeletonRows, buttonClass, inputClass, panelClass } from "../ui";
import { RecordDetailModal } from "../record-detail-modal";

interface AlertState { active_alert: boolean; active_alert_id: string | null }
interface Driver extends AlertState { id: string; name: string; license_number: string; license_expiry: string; phone: string; status: string }
interface Vehicle extends AlertState { id: string; plate_number: string; type: string; subsidiary_owned: boolean; status: string }
interface Trip extends AlertState { id: string; origin: string; destination: string; start_time: string; expected_end_time: string; status: string; driver: Driver; vehicle: Vehicle }
interface Permit extends AlertState { id: string; permit_type: string; issue_date: string; expiry_date: string; status: string; driver: Driver | null; vehicle: Vehicle | null }
interface Maintenance extends AlertState { id: string; type: string; scheduled_date: string; completed_date: string | null; status: string; notes: string | null; vehicle: Vehicle }
interface LogisticsData { drivers: Driver[]; vehicles: Vehicle[]; trips: Trip[]; permits: Permit[]; maintenance_records: Maintenance[] }
type Tab = "Drivers" | "Vehicles" | "Trips" | "Permits" | "Maintenance";
type RecordType = "driver" | "vehicle" | "trip" | "permit" | "maintenance";
const tabs: Tab[] = ["Drivers", "Vehicles", "Trips", "Permits", "Maintenance"];
const singular: Record<Tab, string> = { Drivers: "Driver", Vehicles: "Vehicle", Trips: "Trip", Permits: "Permit", Maintenance: "Maintenance" };

export default function LogisticsPage() {
  const [data, setData] = useState<LogisticsData>({ drivers: [], vehicles: [], trips: [], permits: [], maintenance_records: [] });
  const [tab, setTab] = useState<Tab>("Drivers");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<{ type: RecordType; id: string } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setData(await apiFetch<LogisticsData>("/logistics")); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load logistics"); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const query = search.toLowerCase();
  const filtered = useMemo(() => ({
    Drivers: data.drivers.filter((row) => `${row.name} ${row.license_number} ${row.phone}`.toLowerCase().includes(query)),
    Vehicles: data.vehicles.filter((row) => `${row.plate_number} ${row.type} ${row.status}`.toLowerCase().includes(query)),
    Trips: data.trips.filter((row) => `${row.driver.name} ${row.vehicle.plate_number} ${row.origin} ${row.destination}`.toLowerCase().includes(query)),
    Permits: data.permits.filter((row) => `${row.permit_type} ${row.driver?.name ?? ""} ${row.vehicle?.plate_number ?? ""}`.toLowerCase().includes(query)),
    Maintenance: data.maintenance_records.filter((row) => `${row.type} ${row.vehicle.plate_number} ${row.notes ?? ""}`.toLowerCase().includes(query)),
  }), [data, query]);

  async function addRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const raw = Object.fromEntries(new FormData(event.currentTarget).entries());
    const paths: Record<Tab, string> = { Drivers: "/logistics/drivers", Vehicles: "/logistics/vehicles", Trips: "/logistics/trips", Permits: "/logistics/permits", Maintenance: "/logistics/maintenance-records" };
    const payload = tab === "Vehicles" ? { ...raw, subsidiary_owned: raw.subsidiary_owned === "true" } : raw;
    await apiFetch(paths[tab], { method: "POST", body: JSON.stringify(payload) }); setAddOpen(false); await load();
  }

  const rows = tableRows(tab, filtered, setSelected);
  return <AppShell eyebrow="Fleet and movement" title="Logistics"><section className={panelClass}>
    <div className="flex flex-col gap-4 border-b border-ajs-border p-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex overflow-x-auto rounded-lg border border-ajs-border bg-ajs-bg p-1">{tabs.map((name) => <button className={`min-h-10 whitespace-nowrap rounded-md px-4 text-xs font-bold ${tab === name ? "bg-ajs-accent text-white" : "text-ajs-secondary hover:text-white"}`} onClick={() => setTab(name)} key={name}>{name}</button>)}</div><div className="flex gap-2"><input aria-label={`Search ${tab}`} className={`${inputClass} min-w-0 sm:w-72`} placeholder={`Search ${tab.toLowerCase()}…`} value={search} onChange={(event) => setSearch(event.target.value)} /><button className={`${buttonClass} shrink-0`} onClick={() => setAddOpen(true)}>+ Add {singular[tab]}</button></div></div>
    {error ? <p className="m-4 text-sm text-red-300">{error}</p> : null}{loading ? <SkeletonRows /> : rows.rows.length ? <ResponsiveRows {...rows} /> : <div className="p-5"><EmptyState title={`No ${tab.toLowerCase()} found`} detail="Add a record or adjust your search." /></div>}
  </section>
  {addOpen ? <Modal title={`Add ${singular[tab]}`} onClose={() => setAddOpen(false)}><form className="grid gap-4 sm:grid-cols-2" onSubmit={addRecord}><AddFields tab={tab} data={data} /><button className={`${buttonClass} sm:col-span-2`} type="submit">Create {singular[tab]}</button></form></Modal> : null}
  {selected ? <RecordDetailModal recordId={selected.id} type={selected.type} onChanged={load} onClose={() => setSelected(null)} /> : null}</AppShell>;
}

function tableRows(tab: Tab, data: Record<Tab, any[]>, open: (value: { type: RecordType; id: string }) => void) {
  if (tab === "Drivers") return { headers: ["Driver", "License", "Expiry", "Phone", "Status", "Alert"], rows: (data.Drivers as Driver[]).map((row) => ({ id: row.id, type: "driver" as const, cells: [row.name, row.license_number, <span className={new Date(row.license_expiry).getTime() - Date.now() <= 7 * 86_400_000 ? "font-bold text-ajs-high" : ""}>{formatDate(row.license_expiry)}</span>, row.phone, <Badge value={row.status} />, <AlertMark active={row.active_alert} />] })), open };
  if (tab === "Vehicles") return { headers: ["Plate", "Type", "Ownership", "Status", "Alert"], rows: (data.Vehicles as Vehicle[]).map((row) => ({ id: row.id, type: "vehicle" as const, cells: [<strong>{row.plate_number}</strong>, <Badge value={row.type} />, row.subsidiary_owned ? "Company-owned" : "Hired", <Badge value={row.status} />, <AlertMark active={row.active_alert} />] })), open };
  if (tab === "Trips") return { headers: ["Driver", "Vehicle", "Route", "Start", "Expected end", "Status", "Alert"], rows: (data.Trips as Trip[]).map((row) => ({ id: row.id, type: "trip" as const, cells: [row.driver.name, <strong>{row.vehicle.plate_number}</strong>, `${row.origin} → ${row.destination}`, `${formatDate(row.start_time)} ${formatTime(row.start_time)}`, `${formatDate(row.expected_end_time)} ${formatTime(row.expected_end_time)}`, <Badge value={row.status} />, <AlertMark active={row.active_alert} />] })), open };
  if (tab === "Permits") return { headers: ["Permit", "Linked to", "Issued", "Expires", "Status", "Alert"], rows: (data.Permits as Permit[]).map((row) => ({ id: row.id, type: "permit" as const, cells: [<strong>{row.permit_type}</strong>, row.driver?.name ?? row.vehicle?.plate_number ?? "Unlinked", formatDate(row.issue_date), formatDate(row.expiry_date), <Badge value={row.status} />, <AlertMark active={row.active_alert} />] })), open };
  return { headers: ["Type", "Vehicle", "Scheduled", "Completed", "Status", "Alert"], rows: (data.Maintenance as Maintenance[]).map((row) => ({ id: row.id, type: "maintenance" as const, cells: [<strong>{row.type}</strong>, row.vehicle.plate_number, formatDate(row.scheduled_date), formatDate(row.completed_date), <Badge value={row.status} />, <AlertMark active={row.active_alert} />] })), open };
}

function ResponsiveRows({ headers, rows, open }: { headers: string[]; rows: Array<{ id: string; type: RecordType; cells: React.ReactNode[] }>; open: (value: { type: RecordType; id: string }) => void }) {
  const activate = (event: React.KeyboardEvent, row: { type: RecordType; id: string }) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(row); } };
  return <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm tabular-nums"><thead className="bg-ajs-bg/60 text-[11px] uppercase tracking-wider text-ajs-secondary"><tr>{headers.map((header) => <th className="px-4 py-3" key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr className="cursor-pointer border-t border-ajs-border transition-colors hover:bg-ajs-border/25" key={row.id} onClick={() => open(row)} onKeyDown={(event) => activate(event, row)} tabIndex={0}>{row.cells.map((cell, index) => <td className="px-4 py-4" key={index}>{cell}</td>)}</tr>)}</tbody></table></div><div className="grid gap-3 p-3 md:hidden">{rows.map((row) => <article className="cursor-pointer rounded-lg border border-ajs-border bg-ajs-bg/40 p-4 transition-colors hover:bg-ajs-border/25" key={row.id} onClick={() => open(row)} onKeyDown={(event) => activate(event, row)} role="button" tabIndex={0}>{row.cells.map((cell, index) => <div className="flex justify-between gap-5 border-b border-ajs-border/70 py-2 last:border-0" key={index}><span className="text-xs text-ajs-secondary">{headers[index]}</span><span className="text-right text-sm">{cell}</span></div>)}</article>)}</div></>;
}

function Field({ label, name, type = "text", children }: { label: string; name: string; type?: string; children?: React.ReactNode }) { return <label className="text-xs font-bold uppercase tracking-wide text-ajs-secondary">{label}{children ?? <input className={`${inputClass} mt-2`} name={name} type={type} required />}</label>; }
function AddFields({ tab, data }: { tab: Tab; data: LogisticsData }) {
  if (tab === "Drivers") return <><Field label="Full name" name="name" /><Field label="License number" name="license_number" /><Field label="License expiry" name="license_expiry" type="date" /><Field label="Phone" name="phone" /><StatusField values={["active", "inactive", "suspended", "expired"]} /></>;
  if (tab === "Vehicles") return <><Field label="Plate number" name="plate_number" /><Field label="Type" name="type"><select className={`${inputClass} mt-2`} name="type"><option>truck</option><option>car</option><option>machine</option></select></Field><Field label="Ownership" name="subsidiary_owned"><select className={`${inputClass} mt-2`} name="subsidiary_owned"><option value="true">Company-owned</option><option value="false">Hired</option></select></Field><StatusField values={["active", "inactive", "suspended", "maintenance"]} /></>;
  if (tab === "Trips") return <><SelectField label="Driver" name="driver_id" options={data.drivers.map((row) => [row.id, row.name])} /><SelectField label="Vehicle" name="vehicle_id" options={data.vehicles.map((row) => [row.id, row.plate_number])} /><Field label="Origin" name="origin" /><Field label="Destination" name="destination" /><Field label="Start time" name="start_time" type="datetime-local" /><Field label="Expected end" name="expected_end_time" type="datetime-local" /><StatusField values={["scheduled", "in_progress", "completed"]} /></>;
  if (tab === "Permits") return <><Field label="Permit type" name="permit_type" /><Field label="Issue date" name="issue_date" type="date" /><Field label="Expiry date" name="expiry_date" type="date" /><SelectField label="Vehicle" name="vehicle_id" options={data.vehicles.map((row) => [row.id, row.plate_number])} /><StatusField values={["active", "expired", "renewed"]} /></>;
  return <><Field label="Maintenance type" name="type" /><SelectField label="Vehicle" name="vehicle_id" options={data.vehicles.map((row) => [row.id, row.plate_number])} /><Field label="Scheduled date" name="scheduled_date" type="date" /><Field label="Notes" name="notes" /><StatusField values={["scheduled", "in_progress", "completed"]} /></>;
}
function SelectField({ label, name, options }: { label: string; name: string; options: string[][] }) { return <Field label={label} name={name}><select className={`${inputClass} mt-2`} name={name} required>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>; }
function StatusField({ values }: { values: string[] }) { return <Field label="Status" name="status"><select className={`${inputClass} mt-2`} name="status">{values.map((value) => <option key={value}>{value}</option>)}</select></Field>; }
