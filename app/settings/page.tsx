"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "../shell";
import { apiFetch, formatDate, formatTime, timeAgo } from "../lib";
import { Badge, EmptyState, SkeletonRows, buttonClass, inputClass, panelClass } from "../ui";

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  subsidiary: string | null;
  is_active: boolean;
  driver_profile?: { id: string; name: string; license_number: string } | null;
}

interface DriverOption { id: string; name: string; license_number: string; status: string }
interface UserManagementData { users: ManagedUser[]; availableDrivers: DriverOption[]; roles: string[]; subsidiaries: string[] }
interface EngineHeartbeat {
  id: string;
  run_at: string;
  status: "success" | "failed";
  error_message: string | null;
  items_processed: number;
  alerts_created: number;
}
interface EngineHealth {
  expected_interval_minutes: number;
  stale_after_minutes: number;
  stale: boolean;
  latest: EngineHeartbeat | null;
  latest_success: EngineHeartbeat | null;
}
interface AlertThreshold {
  rule_key: string;
  label: string;
  unit: string;
  description: string;
  value: number;
  default_value: number;
  updated_by: string | null;
  updated_at: string | null;
}

const initialForm = { name: "", email: "", role: "manager", subsidiary: "warehouse", phone: "", password: "", driver_id: "" };
const roleLabels: Record<string, string> = {
  director: "Director",
  gm: "General Manager",
  manager: "Manager",
  accountant: "Accountant",
  hr: "HR",
  driver: "Driver",
  staff: "Staff",
};
const subsidiaryLabels: Record<string, string> = {
  logistics: "Logistics",
  warehouse: "Warehouse",
  machinery: "Machinery",
};
const unscopedRoles = new Set(["director", "gm"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const thresholdText: Record<string, { module: "Logistics" | "Warehouse" | "Machinery"; title: string; description: string; unit: string }> = {
  permit_high_hours: { module: "Logistics", title: "Permit — High Priority", description: "Alert when permit, driver license, or maintenance expiry is within this urgent window.", unit: "hours" },
  permit_medium_days: { module: "Logistics", title: "Permit — Medium Priority", description: "Alert when permit, driver license, or maintenance expiry is approaching.", unit: "days" },
  extension_high_days: { module: "Warehouse", title: "Extension — High Priority", description: "Alert when a warehouse extension or bonded storage deadline is within this urgent window.", unit: "days" },
  extension_medium_days: { module: "Warehouse", title: "Extension — Medium Priority", description: "Alert when a warehouse extension or bonded storage deadline is approaching.", unit: "days" },
  invoice_medium_overdue_days: { module: "Warehouse", title: "Invoice — Medium Priority", description: "Alert when an unpaid warehouse invoice has been overdue for this many days.", unit: "days overdue" },
  invoice_high_overdue_days: { module: "Warehouse", title: "Invoice — High Priority", description: "Alert when an unpaid warehouse invoice has been overdue long enough to become urgent.", unit: "days overdue" },
  bonded_storage_days: { module: "Warehouse", title: "Bonded Storage Limit", description: "Maximum TRA/EAC bonded storage period before compliance deadline alerts begin.", unit: "days" },
  machine_idle_medium_days: { module: "Machinery", title: "Machine Idle — Medium Priority", description: "Alert when a machine has remained idle for this many days.", unit: "days idle" },
  machine_idle_high_days: { module: "Machinery", title: "Machine Idle — High Priority", description: "Alert when a machine has remained idle long enough to become urgent.", unit: "days idle" },
};

function displayRole(role: string) {
  return roleLabels[role] ?? titleCase(role);
}

function displaySubsidiary(subsidiary: string) {
  return subsidiaryLabels[subsidiary] ?? titleCase(subsidiary);
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function SettingsPage() {
  const [data, setData] = useState<UserManagementData | null>(null);
  const [engineHealth, setEngineHealth] = useState<EngineHealth | null>(null);
  const [thresholds, setThresholds] = useState<AlertThreshold[]>([]);
  const [thresholdValues, setThresholdValues] = useState<Record<string, string>>({});
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formError, setFormError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [thresholdError, setThresholdError] = useState("");
  const [thresholdSuccess, setThresholdSuccess] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [users, health] = await Promise.all([
        apiFetch<UserManagementData>("/admin/users"),
        apiFetch<EngineHealth>("/api/health/engine"),
      ]);
      const thresholdData = await apiFetch<{ thresholds: AlertThreshold[] }>("/admin/alert-thresholds");
      setData(users);
      setEngineHealth(health);
      setThresholds(thresholdData.thresholds);
      setThresholdValues(Object.fromEntries(thresholdData.thresholds.map((threshold) => [threshold.rule_key, String(threshold.value)])));
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load users"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateField(name: keyof typeof form, value: string) {
    setFormError("");
    if (name === "email") setEmailError("");
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "role" && unscopedRoles.has(value)) next.subsidiary = "";
      if (name === "role" && value === "driver") next.subsidiary = "logistics";
      if (name === "role" && value !== "driver") next.driver_id = "";
      return next;
    });
  }

  async function addUser(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess(""); setFormError(""); setEmailError("");
    const email = form.email.trim();
    if (!emailPattern.test(email)) {
      setEmailError("Enter a valid email address, for example name@ajs.co.tz.");
      setSaving(false);
      return;
    }
    try {
      await apiFetch("/admin/users", { method: "POST", body: JSON.stringify({ ...form, email, subsidiary: form.subsidiary || null, driver_id: form.driver_id || null }) });
      setSuccess(`${form.name} can now sign in with the initial password you set.`);
      setForm(initialForm);
      await load();
    } catch (caught) { setFormError(caught instanceof Error ? caught.message : "Unable to add user"); }
    finally { setSaving(false); }
  }

  async function deactivate(user: ManagedUser) {
    if (!window.confirm(`Deactivate ${user.name}? They will no longer be able to sign in.`)) return;
    setError(""); setSuccess("");
    try { await apiFetch(`/admin/users/${user.id}/deactivate`, { method: "PATCH" }); setSuccess(`${user.name} was deactivated. Audit history remains intact.`); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to deactivate user"); }
  }

  async function saveThresholds() {
    setThresholdError(""); setThresholdSuccess(""); setError("");
    const invalid = thresholds.find((threshold) => {
      const value = Number(thresholdValues[threshold.rule_key]);
      return !Number.isInteger(value) || value <= 0;
    });
    if (invalid) {
      const text = thresholdText[invalid.rule_key];
      setThresholdError(`${text?.title ?? invalid.label} must be a whole number greater than zero.`);
      return;
    }
    try {
      await Promise.all(thresholds.map((threshold) => apiFetch(`/admin/alert-thresholds/${threshold.rule_key}`, { method: "PATCH", body: JSON.stringify({ value: Number(thresholdValues[threshold.rule_key]) }) })));
      setThresholdSuccess("Saved. The next alert engine run will use these thresholds.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update threshold"); }
  }

  const unscopedRole = unscopedRoles.has(form.role);
  return <AppShell eyebrow="System controls" title="Settings">
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className={`${panelClass} overflow-hidden`}>
        <div className="border-b border-ajs-border p-5"><p className="text-xs font-bold uppercase tracking-wider text-ajs-secondary">Access control</p><h2 className="mt-1 text-xl font-bold">Users</h2><p className="mt-1 text-sm text-ajs-secondary">Accounts are deactivated rather than deleted to preserve attribution in the audit history.</p></div>
        {error ? <p className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}
        {success ? <p className="m-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{success}</p> : null}
        {loading ? <SkeletonRows /> : !data?.users.length ? <div className="p-5"><EmptyState title="No users found" detail="Add the first operational account using the form." /></div> : <UserTable users={data.users} onDeactivate={deactivate} />}
      </section>
      <div className="space-y-6">
        <SystemStatus health={engineHealth} />
        <ThresholdSettings error={thresholdError} success={thresholdSuccess} thresholds={thresholds} values={thresholdValues} onChange={(ruleKey, value) => { setThresholdError(""); setThresholdSuccess(""); setThresholdValues((current) => ({ ...current, [ruleKey]: value })); }} onSave={saveThresholds} />
        <section className={`${panelClass} h-fit p-5`}>
          <p className="text-xs font-bold uppercase tracking-wider text-ajs-secondary">Director/GM only</p><h2 className="mt-1 text-xl font-bold">Add user</h2>
          <form className="mt-5 space-y-4" noValidate onSubmit={addUser}>
            <Field label="Full name"><input className={inputClass} required value={form.name} onChange={(event) => updateField("name", event.target.value)} /></Field>
            <Field error={emailError} label="Email"><input className={inputClass} required type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} /></Field>
            <Field label="Role"><select className={inputClass} value={form.role} onChange={(event) => updateField("role", event.target.value)}>{data?.roles.map((role) => <option key={role} value={role}>{displayRole(role)}</option>)}</select></Field>
            {!unscopedRole ? <Field label="Subsidiary"><select className={inputClass} value={form.subsidiary} onChange={(event) => updateField("subsidiary", event.target.value)}>{data?.subsidiaries.map((subsidiary) => <option key={subsidiary} value={subsidiary}>{displaySubsidiary(subsidiary)}</option>)}</select></Field> : <p className="rounded-lg border border-ajs-border bg-ajs-bg/35 p-3 text-xs leading-5 text-ajs-secondary">Directors and General Managers can see all subsidiaries, so no subsidiary selection is needed.</p>}
            {form.role === "driver" ? <Field label="Link driver record"><select className={inputClass} required value={form.driver_id} onChange={(event) => updateField("driver_id", event.target.value)}><option value="">Select an unlinked driver</option>{data?.availableDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name} · {driver.license_number}</option>)}</select></Field> : null}
            <Field helper="Used for SMS alerts when notification delivery is configured." label="Phone for SMS Alerts"><input className={inputClass} placeholder="+255..." type="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} /></Field>
            <Field label="Initial password"><input className={inputClass} minLength={8} required type="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} /><span className="mt-1 block text-xs text-ajs-secondary">Set directly and share securely with the user.</span></Field>
            {formError ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">{formError}</p> : null}
            <button className={`${buttonClass} w-full`} disabled={saving} type="submit">{saving ? "Adding user…" : "Add user"}</button>
          </form>
        </section>
      </div>
    </div>
  </AppShell>;
}

function ThresholdSettings({
  error,
  success,
  thresholds,
  values,
  onChange,
  onSave,
}: {
  error: string;
  success: string;
  thresholds: AlertThreshold[];
  values: Record<string, string>;
  onChange: (ruleKey: string, value: string) => void;
  onSave: () => void;
}) {
  const groups = (["Logistics", "Warehouse", "Machinery"] as const).map((module) => ({
    module,
    thresholds: thresholds.filter((threshold) => thresholdText[threshold.rule_key]?.module === module),
  })).filter((group) => group.thresholds.length > 0);

  return <section className={`${panelClass} p-5`}>
    <p className="text-xs font-bold uppercase tracking-wider text-ajs-secondary">Director/GM only</p><h2 className="mt-1 text-xl font-bold">Alert Thresholds</h2>
    <p className="mt-2 text-sm text-ajs-secondary">Changes apply on the next alert engine run. Defaults remain available if a database row is missing.</p>
    {error ? <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">{error}</p> : null}
    {success ? <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{success}</p> : null}
    <div className="mt-5 space-y-5">
      {groups.map((group) => <div key={group.module}>
        <h3 className="text-xs font-bold uppercase tracking-[.16em] text-ajs-secondary">{group.module}</h3>
        <div className="mt-3 space-y-3">
          {group.thresholds.map((threshold) => {
            const text = thresholdText[threshold.rule_key] ?? { title: threshold.label, description: threshold.description, unit: threshold.unit };
            const value = values[threshold.rule_key] ?? String(threshold.value);
            const invalid = value !== "" && (!Number.isInteger(Number(value)) || Number(value) <= 0);
            return <div className="rounded-lg border border-ajs-border bg-ajs-bg/35 p-3" key={threshold.rule_key}>
              <div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-bold">{text.title}</h4><p className="mt-1 text-xs leading-5 text-ajs-secondary">{text.description}</p></div><span className="shrink-0 text-[11px] text-ajs-secondary">Default {threshold.default_value} {text.unit}</span></div>
              <div className="mt-3 flex items-center gap-2">
                <input aria-label={text.title} className={`${inputClass} ${invalid ? "border-red-500/70 focus:border-red-400" : ""}`} min={1} step={1} type="number" value={value} onChange={(event) => onChange(threshold.rule_key, event.target.value)} />
                <span className="min-w-24 text-xs font-semibold text-ajs-secondary">{text.unit}</span>
              </div>
              {invalid ? <p className="mt-2 text-xs text-red-300">Enter a whole number greater than zero.</p> : null}
            </div>;
          })}
        </div>
      </div>)}
    </div>
    <button className={`${buttonClass} mt-5 w-full`} onClick={onSave}>Save Changes</button>
  </section>;
}

function SystemStatus({ health }: { health: EngineHealth | null }) {
  const latest = health?.latest;
  const label = health?.stale ? "stale" : latest?.status ?? "unknown";
  const detail = latest ? `${formatDate(latest.run_at)} at ${formatTime(latest.run_at)} · ${timeAgo(latest.run_at)}` : "No engine heartbeat has been recorded yet.";
  return <section className={`${panelClass} p-5`}>
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-wider text-ajs-secondary">System status</p><h2 className="mt-1 text-xl font-bold">Alert engine</h2><p className="mt-2 text-sm text-ajs-secondary">{detail}</p></div>
      <Badge value={label} />
    </div>
    {latest ? <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
      <div className="rounded-lg border border-ajs-border bg-ajs-bg/40 p-3"><dt className="text-xs text-ajs-secondary">Items processed</dt><dd className="mt-1 font-bold">{latest.items_processed}</dd></div>
      <div className="rounded-lg border border-ajs-border bg-ajs-bg/40 p-3"><dt className="text-xs text-ajs-secondary">Alerts created</dt><dd className="mt-1 font-bold">{latest.alerts_created}</dd></div>
      <div className="rounded-lg border border-ajs-border bg-ajs-bg/40 p-3"><dt className="text-xs text-ajs-secondary">Expected interval</dt><dd className="mt-1 font-bold">{health?.expected_interval_minutes ?? 5} min</dd></div>
      <div className="rounded-lg border border-ajs-border bg-ajs-bg/40 p-3"><dt className="text-xs text-ajs-secondary">Stale after</dt><dd className="mt-1 font-bold">{health?.stale_after_minutes ?? 10} min</dd></div>
    </dl> : null}
    {latest?.error_message ? <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{latest.error_message}</p> : null}
  </section>;
}

function Field({ children, error, helper, label }: { children: React.ReactNode; error?: string; helper?: string; label: string }) {
  return <label className="block text-xs font-semibold text-ajs-secondary"><span className="mb-1.5 block">{label}</span>{children}{helper ? <span className="mt-1 block leading-5">{helper}</span> : null}{error ? <span className="mt-1 block text-red-300">{error}</span> : null}</label>;
}

function UserTable({ users, onDeactivate }: { users: ManagedUser[]; onDeactivate: (user: ManagedUser) => void }) {
  return <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="bg-ajs-bg/60 text-[11px] uppercase tracking-wider text-ajs-secondary"><tr><th className="px-5 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Subsidiary</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody>{users.map((user) => <tr className="border-t border-ajs-border" key={user.id}><td className="px-5 py-4"><strong className="block">{user.name}</strong><span className="text-xs text-ajs-secondary">{user.email}{user.driver_profile ? ` · ${user.driver_profile.license_number}` : ""}</span></td><td className="px-4 py-4"><Badge value={displayRole(user.role)} /></td><td className="px-4 py-4">{user.subsidiary ? <Badge value={displaySubsidiary(user.subsidiary)} /> : <span className="text-ajs-secondary">All</span>}</td><td className="px-4 py-4"><Badge value={user.is_active ? "Active" : "Inactive"} /></td><td className="px-5 py-4 text-right">{user.is_active ? <button className={`${buttonClass} min-h-9 px-3 text-xs`} onClick={() => onDeactivate(user)}>Deactivate</button> : <span className="text-xs text-ajs-secondary">Audit retained</span>}</td></tr>)}</tbody></table></div><div className="grid gap-3 p-3 md:hidden">{users.map((user) => <article className="rounded-lg border border-ajs-border bg-ajs-bg/40 p-4" key={user.id}><div className="flex items-start justify-between gap-3"><div><strong>{user.name}</strong><p className="mt-1 text-xs text-ajs-secondary">{user.email}</p></div><Badge value={user.is_active ? "Active" : "Inactive"} /></div><div className="mt-4 flex gap-2"><Badge value={displayRole(user.role)} />{user.subsidiary ? <Badge value={displaySubsidiary(user.subsidiary)} /> : null}</div>{user.is_active ? <button className={`${buttonClass} mt-4 w-full`} onClick={() => onDeactivate(user)}>Deactivate</button> : null}</article>)}</div></>;
}
