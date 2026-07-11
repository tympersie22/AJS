"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../shell";
import { CurrentUser, apiFetch, downloadCsv, formatDate, formatTime, timeAgo } from "../lib";
import { SkeletonRows, buttonClass, inputClass } from "../ui";
import { AlertDetailModal } from "../alert-detail-modal";

type Subsidiary = "logistics" | "warehouse" | "machinery";
type Priority = "low" | "medium" | "high";
type Filter = "all" | Subsidiary;

interface AlertRow {
  id: string;
  subsidiary: Subsidiary;
  priority: Priority;
  message: string;
  status: string;
  created_at: string;
  watched_item?: { item_type: string; title: string; due_at: string | null };
}

const subsidiaries: Subsidiary[] = ["logistics", "warehouse", "machinery"];
const priorityRank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export default function DashboardPage() {
  return <Suspense fallback={<AppShell eyebrow="Cross-subsidiary command" title="Alerts Dashboard"><SkeletonRows /></AppShell>}><DashboardContent /></Suspense>;
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("open");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [alertData, currentUser] = await Promise.all([apiFetch<{ alerts: AlertRow[] }>("/alerts"), apiFetch<CurrentUser>("/me")]);
      setAlerts(alertData.alerts);
      setUser(currentUser);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load dashboard"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const alertId = searchParams.get("alert");
    if (alertId) setSelectedAlertId(alertId);
  }, [searchParams]);

  const visibleSubsidiaries = useMemo(() => {
    if (!user) return [];
    if (user.role === "director" || user.role === "gm") return subsidiaries;
    return subsidiaries.includes(user.subsidiary as Subsidiary) ? [user.subsidiary as Subsidiary] : [];
  }, [user]);

  const requestedFilter = searchParams.get("subsidiary");
  const selected: Filter = requestedFilter && visibleSubsidiaries.includes(requestedFilter as Subsidiary) ? requestedFilter as Subsidiary : "all";
  const sortedAlerts = useMemo(() => [...alerts].sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority] || new Date(right.created_at).getTime() - new Date(left.created_at).getTime()), [alerts]);
  const filteredAlerts = selected === "all" ? sortedAlerts : sortedAlerts.filter((alert) => alert.subsidiary === selected);

  function selectSubsidiary(next: Filter) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("subsidiary"); else params.set("subsidiary", next);
    router.replace(params.size ? `/dashboard?${params}` : "/dashboard", { scroll: false });
  }

  async function exportAlerts() {
    setExporting(true); setError("");
    try {
      const params = new URLSearchParams();
      if (selected !== "all") params.set("subsidiary", selected);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (priority) params.set("priority", priority);
      if (status) params.set("status", status);
      await downloadCsv(`/reports/alerts.csv?${params}`, "ajs-alerts.csv");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to export alerts"); }
    finally { setExporting(false); }
  }

  const cardFilters: Filter[] = ["all", ...visibleSubsidiaries];
  return <AppShell eyebrow="Cross-subsidiary command" title="Alerts Dashboard">
    {loading ? <SkeletonRows /> : <>
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" data-testid="subsidiary-strip">
        <div className="flex min-w-max gap-3" role="tablist" aria-label="Filter alerts by subsidiary">
          {cardFilters.map((filter) => {
            const cardAlerts = filter === "all" ? sortedAlerts : sortedAlerts.filter((alert) => alert.subsidiary === filter);
            const worstPriority = cardAlerts[0]?.priority;
            const active = selected === filter;
            return <button aria-selected={active} className={`min-w-[156px] rounded-xl px-5 py-4 text-left transition-colors sm:min-w-[180px] lg:flex-1 ${active ? "bg-ajs-surface shadow-panel ring-1 ring-ajs-border" : "bg-transparent hover:bg-ajs-surface/45"}`} data-filter={filter} key={filter} onClick={() => selectSubsidiary(filter)} role="tab">
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-ajs-secondary"><PriorityDot priority={worstPriority} />{filter === "all" ? "All" : titleCase(filter)}</span>
              <strong className="mt-3 block text-3xl font-semibold tabular-nums tracking-tight">{cardAlerts.length}</strong>
              <span className="mt-1 block text-xs text-ajs-secondary">Open alerts</span>
            </button>;
          })}
        </div>
      </div>

      <section className="mt-8" aria-live="polite">
        <div className="flex items-center justify-between gap-4 pb-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-ajs-secondary">Live operational queue</p><h2 className="mt-1 text-lg font-bold">{selected === "all" ? "All open alerts" : `${titleCase(selected)} alerts`}</h2></div><details className="relative"><summary className={`${buttonClass} cursor-pointer list-none text-xs`}>Export CSV</summary><div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-xl border border-ajs-border bg-ajs-surface p-4 shadow-panel"><div className="grid grid-cols-2 gap-2"><label className="text-xs text-ajs-secondary">From<input className={`${inputClass} mt-1`} type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label className="text-xs text-ajs-secondary">To<input className={`${inputClass} mt-1`} type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></div><label className="block text-xs text-ajs-secondary">Priority<select className={`${inputClass} mt-1`} value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label><label className="block text-xs text-ajs-secondary">Status<select className={`${inputClass} mt-1`} value={status} onChange={(event) => setStatus(event.target.value)}><option value="open">Open</option><option value="resolved">Resolved</option><option value="">All</option></select></label><button className={`${buttonClass} w-full`} disabled={exporting} onClick={exportAlerts}>{exporting ? "Exporting…" : "Download CSV"}</button></div></details></div>
        {error ? <p className="my-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}
        {filteredAlerts.length === 0 ? <div className="grid min-h-48 place-items-center text-sm text-ajs-secondary" data-testid="alerts-empty">No open alerts here</div> : <div data-testid="alert-list">{filteredAlerts.map((alert) => <AlertListRow alert={alert} key={alert.id} onOpen={setSelectedAlertId} />)}</div>}
      </section>
      {selectedAlertId ? <AlertDetailModal alertId={selectedAlertId} onAcknowledged={(id) => setAlerts((current) => current.filter((alert) => alert.id !== id))} onClose={() => setSelectedAlertId(null)} /> : null}
    </>}
  </AppShell>;
}

function AlertListRow({ alert, onOpen }: { alert: AlertRow; onOpen: (id: string) => void }) {
  const color = alert.priority === "high" ? "text-ajs-high" : alert.priority === "medium" ? "text-ajs-medium" : "text-ajs-low";
  const bar = alert.priority === "high" ? "bg-ajs-high" : alert.priority === "medium" ? "bg-ajs-medium" : "bg-ajs-low";
  return <button className="group relative flex w-full items-center gap-4 border-b border-ajs-border/60 py-4 pl-4 text-left transition-colors first:border-t first:border-ajs-border/60 hover:bg-ajs-surface/40" data-subsidiary={alert.subsidiary} onClick={() => onOpen(alert.id)}>
    <span className={`absolute inset-y-4 left-0 w-0.5 rounded-full ${bar}`} aria-hidden />
    <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-ajs-primary sm:text-[15px]">{alert.watched_item?.title ?? alert.message}</h3><p className="mt-1 text-xs text-ajs-secondary">{titleCase(alert.subsidiary)} · {titleCase(alert.status)} · {timeAgo(alert.created_at)}{alert.watched_item?.due_at ? ` · Deadline ${formatDate(alert.watched_item.due_at)} ${formatTime(alert.watched_item.due_at)} EAT` : ""}</p></div>
    <span className={`shrink-0 text-xs font-semibold capitalize ${color}`}>{alert.priority}</span>
  </button>;
}

function PriorityDot({ priority }: { priority?: Priority }) {
  const color = priority === "high" ? "bg-ajs-high" : priority === "medium" ? "bg-ajs-medium" : "bg-ajs-low/60";
  return <span className={`h-1.5 w-1.5 rounded-full ${color}`} aria-hidden />;
}

function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " "); }
