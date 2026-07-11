"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { CurrentUser, apiFetch } from "./lib";

type Subsidiary = "logistics" | "warehouse" | "machinery";
type Priority = "high" | "medium" | "low";
interface NavigationAlert { subsidiary: Subsidiary; priority: Priority }

const moduleNavigation: Array<{ href: string; label: string; icon: string; subsidiary?: Subsidiary; executiveOnly?: boolean }> = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/compliance", label: "Compliance", icon: "◫", executiveOnly: true },
  { href: "/logistics", label: "Logistics", icon: "⇄", subsidiary: "logistics" },
  { href: "/warehouse", label: "Warehouse", icon: "▤", subsidiary: "warehouse" },
  { href: "/machinery", label: "Machinery", icon: "⚙", subsidiary: "machinery" },
];

export function AppShell({ children, title, eyebrow }: { children: ReactNode; title: string; eyebrow: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [alerts, setAlerts] = useState<NavigationAlert[]>([]);

  const loadAlerts = useCallback(async () => {
    try { setAlerts((await apiFetch<{ alerts: NavigationAlert[] }>("/alerts")).alerts); }
    catch { setAlerts([]); }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("ajs_token")) { router.replace("/login"); return; }
    apiFetch<CurrentUser>("/me").then((currentUser) => {
      if (currentUser.role === "driver") { router.replace("/driver"); return; }
      setUser(currentUser);
      loadAlerts();
    }).catch(() => router.replace("/login"));
  }, [loadAlerts, router]);

  useEffect(() => {
    window.addEventListener("ajs:alerts-changed", loadAlerts);
    return () => window.removeEventListener("ajs:alerts-changed", loadAlerts);
  }, [loadAlerts]);

  const navigation = useMemo(() => moduleNavigation.filter((item) => {
    if (!user) return true;
    if (item.executiveOnly) return user.role === "director" || user.role === "gm";
    if (!item.subsidiary) return true;
    return user.role === "director" || user.role === "gm" || user.subsidiary === item.subsidiary;
  }), [user]);

  function navAlerts(subsidiary?: Subsidiary) { return subsidiary ? alerts.filter((alert) => alert.subsidiary === subsidiary) : alerts; }
  function logout() { localStorage.removeItem("ajs_token"); localStorage.removeItem("ajs_user"); router.push("/login"); }

  return <div className="min-h-screen bg-ajs-bg">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col border-r border-ajs-border bg-ajs-surface md:flex">
      <div className="flex h-20 items-center gap-3 px-5"><span className="grid h-8 w-8 place-items-center rounded-md bg-ajs-accent text-sm font-black">A</span><div><strong className="block text-sm tracking-[.12em]">AJS</strong><span className="text-[10px] uppercase tracking-[.16em] text-ajs-secondary">Operations</span></div></div>
      <nav className="px-3" aria-label="Primary navigation">{navigation.map((item) => <NavigationLink active={pathname === item.href} alerts={navAlerts(item.subsidiary)} item={item} key={item.href} />)}<div className="my-3 border-t border-ajs-border/70" /><Link className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${pathname === "/settings" ? "bg-ajs-border/60 text-white" : "text-ajs-secondary hover:bg-ajs-border/35 hover:text-white"}`} href="/settings"><span aria-hidden>⚙</span>Settings</Link></nav>
      <button className="mx-3 mb-3 mt-auto rounded-lg px-3 py-3 text-left text-xs text-ajs-secondary hover:bg-ajs-border/35" onClick={logout}><span className="block font-semibold text-ajs-primary">{user?.name ?? "Loading access…"}</span>{user?.role ?? ""} · Sign out</button>
    </aside>
    <main className="min-h-screen pb-24 md:ml-[220px] md:pb-0"><header className="border-b border-ajs-border px-4 py-5 sm:px-6 lg:px-8"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-ajs-secondary">{eyebrow}</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1></header><div className="p-4 sm:p-6 lg:p-8">{children}</div></main>
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-ajs-border bg-ajs-surface/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">{navigation.map((item) => <Link className={`relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${pathname === item.href ? "text-blue-400" : "text-ajs-secondary"}`} href={item.href} key={item.href}><span className="text-lg" aria-hidden>{item.icon}</span>{item.label}<CountBadge alerts={navAlerts(item.subsidiary)} compact /></Link>)}</nav>
  </div>;
}

function NavigationLink({ active, alerts, item }: { active: boolean; alerts: NavigationAlert[]; item: { href: string; label: string; icon: string } }) {
  return <Link className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${active ? "bg-ajs-border/60 text-white" : "text-ajs-secondary hover:bg-ajs-border/35 hover:text-white"}`} href={item.href}><span aria-hidden>{item.icon}</span><span className="flex-1">{item.label}</span><CountBadge alerts={alerts} /></Link>;
}

function CountBadge({ alerts, compact = false }: { alerts: NavigationAlert[]; compact?: boolean }) {
  const worst = alerts.some((alert) => alert.priority === "high") ? "high" : alerts.some((alert) => alert.priority === "medium") ? "medium" : "low";
  const colors = worst === "high" ? "bg-ajs-high/15 text-ajs-high" : worst === "medium" ? "bg-ajs-medium/15 text-ajs-medium" : "bg-ajs-border text-ajs-secondary";
  return <span className={`${compact ? "absolute right-2 top-2 min-w-4 px-1 text-[9px]" : "min-w-6 px-1.5 text-[10px]"} rounded-full py-0.5 text-center font-bold tabular-nums ${colors}`}>{alerts.length}</span>;
}
