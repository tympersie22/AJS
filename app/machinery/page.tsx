"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../shell";
import { apiFetch, daysBetween, formatDate } from "../lib";
import { AlertMark, Badge, EmptyState, SkeletonRows, inputClass, panelClass } from "../ui";
import { RecordDetailModal } from "../record-detail-modal";

interface Machine { id: string; name: string; asset_tag: string; subsidiary_location: string; status: string; last_status_change_at: string; active_alert: boolean }
const statuses = ["waiting", "successful", "unsuccessful", "idle"];

export default function MachineryPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => apiFetch<{ machines: Machine[] }>("/machinery").then((data) => setMachines(data.machines)).catch((caught) => setError(caught.message)).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  async function updateStatus(machine: Machine, status: string) { await apiFetch(`/machinery/machines/${machine.id}`, { method: "PATCH", body: JSON.stringify({ status, last_status_change_at: new Date().toISOString() }) }); await load(); }
  const filtered = machines.filter((machine) => `${machine.name} ${machine.asset_tag} ${machine.subsidiary_location}`.toLowerCase().includes(search.toLowerCase()));
  const activate = (event: React.KeyboardEvent, id: string) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(id); } };

  return <AppShell eyebrow="Asset readiness" title="Machinery"><section className={panelClass}>
    <div className="flex flex-col gap-4 border-b border-ajs-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-ajs-secondary">Machine state board</p><h2 className="mt-1 font-bold">Live equipment status</h2></div><input aria-label="Search machinery" className={`${inputClass} sm:w-72`} placeholder="Search machines…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    {error ? <p className="m-4 text-red-300">{error}</p> : null}{loading ? <SkeletonRows /> : !filtered.length ? <div className="p-5"><EmptyState title="No machinery records" detail="Machines will appear here when assets are added." /></div> : <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm tabular-nums"><thead className="bg-ajs-bg/60 text-[11px] uppercase tracking-wider text-ajs-secondary"><tr><th className="px-5 py-3">Machine</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last change</th><th className="px-4 py-3">Days in state</th><th className="px-5 py-3">Alert</th></tr></thead><tbody>{filtered.map((machine) => { const days = daysBetween(machine.last_status_change_at); return <tr className="cursor-pointer border-t border-ajs-border transition-colors hover:bg-ajs-border/25" key={machine.id} onClick={() => setSelectedId(machine.id)} onKeyDown={(event) => activate(event, machine.id)} tabIndex={0}><td className="px-5 py-4"><strong className="block">{machine.name}</strong><span className="text-xs text-ajs-secondary">{machine.asset_tag}</span></td><td className="px-4 py-4">{machine.subsidiary_location}</td><td className="px-4 py-4"><select aria-label={`Update ${machine.name} status`} className={`${inputClass} min-h-9 w-40 py-1`} value={machine.status} onClick={(event) => event.stopPropagation()} onChange={(event) => updateStatus(machine, event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></td><td className="px-4 py-4 text-ajs-secondary">{formatDate(machine.last_status_change_at)}</td><td className="px-4 py-4">{days} days</td><td className="px-5 py-4"><AlertMark active={machine.active_alert} /></td></tr>; })}</tbody></table></div><div className="grid gap-3 p-3 md:hidden">{filtered.map((machine) => <article className="cursor-pointer rounded-lg border border-ajs-border bg-ajs-bg/40 p-4 transition-colors hover:bg-ajs-border/25" key={machine.id} onClick={() => setSelectedId(machine.id)} onKeyDown={(event) => activate(event, machine.id)} role="button" tabIndex={0}><div className="flex items-start justify-between"><div><h3 className="font-bold">{machine.name}</h3><p className="text-xs text-ajs-secondary">{machine.asset_tag} · {machine.subsidiary_location}</p></div><AlertMark active={machine.active_alert} /></div><div className="mt-4 flex items-center justify-between"><span className="text-xs text-ajs-secondary">{daysBetween(machine.last_status_change_at)} days in state</span><Badge value={machine.status} /></div><select className={`${inputClass} mt-4`} value={machine.status} onClick={(event) => event.stopPropagation()} onChange={(event) => updateStatus(machine, event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></article>)}</div></>}
  </section>{selectedId ? <RecordDetailModal recordId={selectedId} type="machine" onChanged={load} onClose={() => setSelectedId(null)} /> : null}</AppShell>;
}
