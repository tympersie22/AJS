export const apiBaseUrl = process.env.NEXT_PUBLIC_AJS_API_URL ?? "http://localhost:4000";
export const businessTimeZone = "Africa/Dar_es_Salaam";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  subsidiary: string | null;
}

export function authHeaders() {
  const token = window.localStorage.getItem("ajs_token");
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export async function downloadCsv(path: string, filename: string) {
  const response = await fetch(`${apiBaseUrl}${path}`, { headers: authHeaders() });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? "Export failed");
  }
  const url = window.URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: businessTimeZone, year: "numeric" }).format(new Date(value));
}

export function formatTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: businessTimeZone }).format(new Date(value));
}

export function daysBetween(from: string, to = new Date()) {
  return Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000);
}

export function timeAgo(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
