"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiBaseUrl } from "../lib";
import { buttonClass, inputClass } from "../ui";

function loginErrorMessage(status: number, fallback?: string) {
  if (status === 401) return "Incorrect email or password";
  if (status === 429) return "Too many attempts. Please wait 15 minutes and try again.";
  if (status === 400) return fallback || "Enter your email and password to continue.";
  return "Unable to sign in right now. Please try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) throw new Error(loginErrorMessage(response.status, data.error));
      localStorage.setItem("ajs_token", data.token); localStorage.setItem("ajs_user", JSON.stringify(data.user));
      router.push(data.user.role === "driver" ? "/driver" : "/dashboard");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to reach AJS Control. Check your connection and try again."); }
    finally { setIsSubmitting(false); }
  }

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <main className="grid min-h-screen bg-ajs-bg lg:grid-cols-[1.2fr_.8fr]">
      <section className="hidden border-r border-ajs-border bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,.2),transparent_32%)] p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-ajs-accent font-black">AJS</span>
          <div>
            <strong className="block tracking-wider">AJS CONTROL</strong>
            <span className="text-xs uppercase tracking-[.2em] text-ajs-secondary">Operations system</span>
          </div>
        </div>
        <div className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-400">One operational picture</p>
          <h1 className="mt-4 text-5xl font-bold leading-tight tracking-tight">Logistics, warehouse, and machinery—under control.</h1>
          <p className="mt-5 text-lg leading-8 text-ajs-secondary">A high-clarity command surface for urgent decisions, compliance deadlines, and daily movement.</p>
        </div>
        <p className="text-xs text-ajs-secondary">AJS INTERNAL · AUTHORIZED PERSONNEL ONLY</p>
      </section>

      <section className="flex items-center justify-center p-5 sm:p-10">
        <form className="w-full max-w-md rounded-xl border border-ajs-border bg-ajs-surface p-6 shadow-panel sm:p-8" onSubmit={handleSubmit}>
          <div className="mb-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-ajs-accent font-black text-white shadow-[0_0_28px_rgba(37,99,235,.25)]">A</div>
            <p className="mt-3 text-xs font-bold uppercase tracking-[.24em] text-ajs-secondary">AJS Control</p>
            <p className="mt-1 text-xs text-ajs-secondary">Logistics · Bonded Warehouse · Machinery</p>
          </div>

          <p className="text-xs font-bold uppercase tracking-[.18em] text-ajs-secondary">Secure access</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Sign in to AJS Control</h2>
          <p className="mt-2 text-sm text-ajs-secondary">Use your assigned AJS operations account.</p>

          <div className="mt-7 space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ajs-secondary" htmlFor="email">Email</label>
              <input className={`${inputClass} mt-2 min-h-12 text-[16px]`} id="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={submitOnEnter} type="email" autoComplete="email" inputMode="email" required disabled={isSubmitting} />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ajs-secondary" htmlFor="password">Password</label>
              <div className="relative mt-2">
                <input className={`${inputClass} min-h-12 pr-20 text-[16px]`} id="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={submitOnEnter} type={showPassword ? "text" : "password"} autoComplete="current-password" required disabled={isSubmitting} />
                <button aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 min-w-16 rounded-r-lg px-3 text-sm font-bold text-ajs-secondary transition hover:bg-ajs-border/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" onClick={() => setShowPassword((current) => !current)} type="button">{showPassword ? "Hide" : "Show"}</button>
              </div>
            </div>
          </div>

          {error ? <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">{error}</p> : null}

          <button className={`${buttonClass} mt-6 w-full min-h-12 gap-2 text-base`} disabled={isSubmitting} type="submit">
            {isSubmitting ? <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white motion-reduce:animate-none" aria-hidden="true" />
              Signing in…
            </> : "Enter AJS Control"}
          </button>
          <p className="mt-5 text-center text-sm text-ajs-secondary">Can&apos;t access your account? Contact your administrator.</p>
        </form>
      </section>
    </main>
  );
}
