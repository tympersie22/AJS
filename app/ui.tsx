"use client";

import { ReactNode, useEffect } from "react";

const badgeStyles: Record<string, string> = {
  high: "bg-red-500/15 text-red-300 ring-red-500/30",
  medium: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  low: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
  active: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  success: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  successful: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  resolved: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  completed: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  paid: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  idle: "bg-red-500/15 text-red-300 ring-red-500/30",
  unsuccessful: "bg-red-500/15 text-red-300 ring-red-500/30",
  expired: "bg-red-500/15 text-red-300 ring-red-500/30",
  overdue: "bg-red-500/15 text-red-300 ring-red-500/30",
  failed: "bg-red-500/15 text-red-300 ring-red-500/30",
  stale: "bg-red-500/15 text-red-300 ring-red-500/30",
  suspended: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  waiting: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  pending: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  in_progress: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
  in_storage: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
  approved: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
};

export function Badge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${badgeStyles[normalized] ?? "bg-slate-500/15 text-slate-300 ring-slate-500/30"}`}>{value.replace(/_/g, " ")}</span>;
}

export function AlertMark({ active, priority = "high" }: { active: boolean; priority?: string }) {
  if (!active) return <span className="text-xs text-ajs-secondary">Clear</span>;
  const color = priority === "medium" ? "bg-ajs-medium" : priority === "low" ? "bg-ajs-low" : "bg-ajs-high";
  return <span className="inline-flex items-center gap-2 text-xs font-semibold text-ajs-primary"><span className={`h-2 w-2 rounded-full ${color}`} />Alert</span>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-ajs-border bg-ajs-bg/35 px-6 text-center"><span className="mb-4 h-2.5 w-2.5 rounded-full bg-ajs-success shadow-[0_0_18px_rgba(16,185,129,.5)]" /><h3 className="font-bold text-ajs-primary">{title}</h3><p className="mt-2 max-w-md text-sm text-ajs-secondary">{detail}</p></div>;
}

export function SkeletonRows() {
  return <div className="space-y-3 p-5" aria-label="Loading section">{[1, 2, 3].map((row) => <div className="h-12 animate-pulse rounded bg-ajs-border/60 motion-reduce:animate-none" key={row} />)}</div>;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section aria-modal="true" role="dialog" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-ajs-border bg-ajs-surface p-5 shadow-panel"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button aria-label="Close modal" className="grid h-10 w-10 place-items-center rounded-lg border border-ajs-border text-xl text-ajs-secondary hover:text-white" onClick={onClose}>×</button></div>{children}</section></div>;
}

export const inputClass = "min-h-11 w-full rounded-lg border border-ajs-border bg-ajs-bg px-3 text-sm text-ajs-primary outline-none placeholder:text-ajs-secondary focus:border-ajs-accent focus:ring-2 focus:ring-blue-500/20";
export const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-lg bg-ajs-accent px-4 text-sm font-bold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-ajs-bg motion-reduce:transition-none disabled:opacity-50";
export const panelClass = "rounded-xl border border-ajs-border bg-ajs-surface shadow-panel";
