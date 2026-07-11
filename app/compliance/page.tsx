"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../shell";
import { apiFetch, downloadCsv, formatDate } from "../lib";
import { Badge, SkeletonRows, buttonClass, panelClass } from "../ui";

type StorageFlag = "OK" | "NEAR_LIMIT" | "OVER_LIMIT";
interface FlagSummary { count: number; bond_value_tzs: number }
interface RiskItem {
  id: string;
  reference_number: string;
  chassis_number: string | null;
  vehicle_description: string | null;
  item_category: string;
  bond_value_tzs: number;
  entry_date: string;
  days_in_storage: number;
  storage_flag: StorageFlag;
  status: string;
}
interface TrendRow { month: string; count: number }
interface ComplianceSummary {
  total_bond_value_tzs: number;
  by_flag: Record<StorageFlag, FlagSummary>;
  risk_items: RiskItem[];
  crossing_trend: TrendRow[];
}

const money = new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 });
const flags: StorageFlag[] = ["OVER_LIMIT", "NEAR_LIMIT", "OK"];

export default function CompliancePage() {
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ compliance: ComplianceSummary }>("/compliance")
      .then((data) => setSummary(data.compliance))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load compliance summary"))
      .finally(() => setLoading(false));
  }, []);

  async function exportMovements() {
    setExporting(true);
    setError("");
    try {
      await downloadCsv("/reports/movements.csv", "ajs-bonded-storage-compliance.csv");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to export compliance report");
    } finally {
      setExporting(false);
    }
  }

  return <AppShell eyebrow="Director review" title="Compliance">
    {loading ? <section className={panelClass}><SkeletonRows /></section> : error && !summary ? <section className={`${panelClass} p-6`}><p className="text-sm text-red-300">{error}</p></section> : summary ? <ComplianceContent exporting={exporting} onExport={exportMovements} summary={summary} /> : null}
  </AppShell>;
}

function ComplianceContent({ summary, exporting, onExport }: { summary: ComplianceSummary; exporting: boolean; onExport: () => void }) {
  const overLimit = summary.by_flag.OVER_LIMIT;
  const nearLimit = summary.by_flag.NEAR_LIMIT;
  return <div className="space-y-6">
    <section className={`${panelClass} overflow-hidden`}>
      <div className="grid gap-px bg-ajs-border lg:grid-cols-[1.4fr_1fr_1fr]">
        <MetricCard label="Total Bond Value In Storage" value={money.format(summary.total_bond_value_tzs)} />
        <MetricCard critical label="Over-Limit Exposure" value={money.format(overLimit.bond_value_tzs)} detail={`${overLimit.count} item${overLimit.count === 1 ? "" : "s"} past 180 days`} />
        <MetricCard label="Near-Limit Watch" value={money.format(nearLimit.bond_value_tzs)} detail={`${nearLimit.count} item${nearLimit.count === 1 ? "" : "s"} between 171-179 days`} />
      </div>
    </section>

    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-ajs-secondary">Storage health</p>
          <h2 className="mt-1 text-lg font-bold">Bond Value By Storage Flag</h2>
        </div>
        <button className={buttonClass} disabled={exporting} onClick={onExport}>{exporting ? "Exporting…" : "Export CSV"}</button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">{flags.map((flag) => <FlagCard flag={flag} key={flag} summary={summary.by_flag[flag]} />)}</div>
    </section>

    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-ajs-secondary">Worst first</p>
          <h2 className="mt-1 text-lg font-bold">Over-Limit & Near-Limit Items</h2>
        </div>
        <p className="text-xs text-ajs-secondary">{summary.risk_items.length} compliance-risk item{summary.risk_items.length === 1 ? "" : "s"}</p>
      </div>
      {summary.risk_items.length ? <RiskTable rows={summary.risk_items} /> : <p className="mt-6 text-sm text-ajs-secondary">No over-limit or near-limit items right now.</p>}
    </section>

    <section className={`${panelClass} p-5`}>
      <p className="text-xs font-bold uppercase tracking-[.16em] text-ajs-secondary">180-day crossings</p>
      <h2 className="mt-1 text-lg font-bold">Items Crossing Limit By Month</h2>
      <TrendChart rows={summary.crossing_trend} />
    </section>
  </div>;
}

function MetricCard({ label, value, detail, critical = false }: { label: string; value: string; detail?: string; critical?: boolean }) {
  return <article className="bg-ajs-surface p-6">
    <p className="text-[11px] font-bold uppercase tracking-[.16em] text-ajs-secondary">{label}</p>
    <p className={`mt-3 break-words text-3xl font-black tracking-tight ${critical ? "text-ajs-high" : "text-ajs-primary"}`}>{value}</p>
    {detail ? <p className="mt-2 text-sm text-ajs-secondary">{detail}</p> : null}
  </article>;
}

function FlagCard({ flag, summary }: { flag: StorageFlag; summary: FlagSummary }) {
  const tone = flag === "OVER_LIMIT" ? "text-ajs-high" : flag === "NEAR_LIMIT" ? "text-ajs-medium" : "text-ajs-success";
  return <article className="rounded-xl border border-ajs-border bg-ajs-bg/35 p-4">
    <div className="flex items-center justify-between gap-3"><Badge value={flag} /><span className={`text-sm font-bold ${tone}`}>{summary.count} items</span></div>
    <p className={`mt-4 text-2xl font-black ${tone}`}>{money.format(summary.bond_value_tzs)}</p>
  </article>;
}

function RiskTable({ rows }: { rows: RiskItem[] }) {
  return <div className="-mx-5 mt-5 overflow-x-auto">
    <table className="min-w-[920px] w-full text-left text-sm">
      <thead className="text-[11px] uppercase tracking-wider text-ajs-secondary"><tr><th className="px-5 py-3">Days</th><th className="px-4 py-3">TANSAD</th><th className="px-4 py-3">Chassis</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Bond Value</th><th className="px-5 py-3">Flag</th></tr></thead>
      <tbody>{rows.map((row) => <tr className="border-t border-ajs-border align-top hover:bg-ajs-bg/35" key={row.id}><td className="px-5 py-4"><strong className={row.storage_flag === "OVER_LIMIT" ? "text-ajs-high" : "text-ajs-medium"}>{row.days_in_storage}</strong><span className="ml-1 text-xs text-ajs-secondary">days</span><p className="mt-1 text-xs text-ajs-secondary">In {formatDate(row.entry_date)}</p></td><td className="px-4 py-4"><Link className="font-semibold text-blue-300 hover:text-blue-200" href={`/warehouse/movements/${row.id}`}>{row.reference_number}</Link><p className="mt-1 text-xs text-ajs-secondary">{titleCase(row.item_category)}</p></td><td className="px-4 py-4 font-mono text-xs">{row.chassis_number ?? "—"}</td><td className="max-w-xs px-4 py-4 text-ajs-primary/90">{row.vehicle_description ?? "No description"}</td><td className="px-4 py-4 text-right font-semibold tabular-nums">{money.format(row.bond_value_tzs)}</td><td className="px-5 py-4"><Badge value={row.storage_flag} /></td></tr>)}</tbody>
    </table>
  </div>;
}

function TrendChart({ rows }: { rows: TrendRow[] }) {
  const max = useMemo(() => Math.max(1, ...rows.map((row) => row.count)), [rows]);
  return <div className="mt-5 space-y-3">
    {rows.length ? rows.map((row) => <div className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-3" key={row.month}><span className="text-xs text-ajs-secondary">{row.month}</span><div className="h-8 rounded bg-ajs-bg"><div className="h-8 rounded bg-ajs-accent/70" style={{ width: `${Math.max(6, (row.count / max) * 100)}%` }} /></div><span className="text-right text-sm font-bold tabular-nums">{row.count}</span></div>) : <p className="text-sm text-ajs-secondary">No crossing trend data yet.</p>}
  </div>;
}

function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
