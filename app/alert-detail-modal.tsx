"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, timeAgo } from "./lib";
import { SkeletonRows, buttonClass } from "./ui";

interface AlertEventRow { id: string; event_type: string; actor: string; actor_name: string; note: string | null; created_at: string }
interface AlertDetail {
  id: string;
  subsidiary: string;
  priority: "high" | "medium" | "low";
  message: string;
  status: string;
  can_acknowledge: boolean;
  watched_item: { item_type: string; title: string };
  record_link: { label: string; href: string } | null;
  events: AlertEventRow[];
}

export function AlertDetailModal({ alertId, onClose, onAcknowledged }: { alertId: string; onClose: () => void; onAcknowledged?: (alertId: string) => void }) {
  const [alert, setAlert] = useState<AlertDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setAlert((await apiFetch<{ alert: AlertDetail }>(`/alerts/${alertId}`)).alert); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load alert"); }
    finally { setLoading(false); }
  }, [alertId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function acknowledge() {
    setSaving(true); setError("");
    try {
      await apiFetch(`/alerts/${alertId}/acknowledge`, { method: "PATCH" });
      window.dispatchEvent(new Event("ajs:alerts-changed"));
      onAcknowledged?.(alertId);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to acknowledge alert"); }
    finally { setSaving(false); }
  }

  const priorityColor = alert?.priority === "high" ? "text-ajs-high" : alert?.priority === "medium" ? "text-ajs-medium" : "text-ajs-low";
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" data-testid="alert-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-labelledby="alert-modal-title" aria-modal="true" className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-ajs-border bg-ajs-surface shadow-2xl" data-testid="alert-modal" role="dialog">
      <div className="flex items-start justify-between gap-5 border-b border-ajs-border px-6 py-5"><div>{alert ? <p className={`text-xs font-bold uppercase tracking-[.14em] ${priorityColor}`}>{titleCase(alert.priority)} priority</p> : null}</div><button aria-label="Close alert details" className="grid h-8 w-8 place-items-center rounded-lg text-xl text-ajs-secondary hover:bg-ajs-border/60 hover:text-white" onClick={onClose}>×</button></div>
      {loading ? <SkeletonRows /> : error && !alert ? <p className="p-6 text-sm text-red-300">{error}</p> : alert ? <div className="p-6">
        <h2 className="text-xl font-bold tracking-tight" id="alert-modal-title">{alert.watched_item.title}</h2>
        <p className="mt-2 text-xs text-ajs-secondary">{titleCase(alert.subsidiary)} · {titleCase(alert.watched_item.item_type)}</p>
        <p className="mt-6 text-sm leading-6 text-ajs-primary/90">{alert.message}</p>
        <div className="mt-8"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-ajs-secondary">Timeline</p><ol className="mt-4 space-y-0">{alert.events.map((event, index) => <li className="relative flex gap-3 pb-5 last:pb-0" key={event.id}><span className="relative z-10 mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ajs-secondary" aria-hidden />{index < alert.events.length - 1 ? <span className="absolute bottom-0 left-[3px] top-3 w-px bg-ajs-border" aria-hidden /> : null}<div><p className="text-sm">{eventLabel(event.event_type)} by {event.actor_name}</p><p className="mt-1 text-xs text-ajs-secondary">{timeAgo(event.created_at)}{event.note ? ` · ${event.note}` : ""}</p></div></li>)}</ol></div>
        {error ? <p className="mt-5 text-sm text-red-300">{error}</p> : null}
        <div className="mt-8 grid gap-3">
          {alert.record_link ? <Link className={`${buttonClass} bg-ajs-border hover:bg-ajs-border/80`} href={alert.record_link.href}>{alert.record_link.label}</Link> : null}
          {alert.can_acknowledge ? <button className={buttonClass} disabled={saving} onClick={acknowledge}>{saving ? "Acknowledging…" : "Acknowledge"}</button> : <p className="text-center text-xs text-ajs-secondary">Status: {titleCase(alert.status)}</p>}
        </div>
      </div> : null}
    </section>
  </div>;
}

function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function eventLabel(value: string) { return value === "auto_resolved" ? "Automatically resolved" : titleCase(value); }
