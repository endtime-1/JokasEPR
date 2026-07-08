"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, ArrowRight, Building2, ShieldCheck } from "lucide-react";
import { BrandLogo } from "../../components/brand-logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!response.ok) {
        let message = "Sign in failed. Please check your credentials.";
        try {
          const body = await response.json();
          if (response.status === 429) {
            message = "Too many sign-in attempts. Please wait 15 minutes and try again.";
          } else if (response.status === 401) {
            message =
              body.message === "Account is locked"
                ? "Your account is locked after too many failed attempts. Contact your administrator."
                : "Invalid email or password. Please try again.";
          } else if (response.status === 400) {
            message = body.message ?? message;
          }
        } catch {
          // ignore parse errors
        }
        setError(message);
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-field text-ink lg:grid lg:grid-cols-[minmax(360px,0.9fr)_minmax(420px,1.1fr)]">
      {/* ── Brand panel ──────────────────────────────────────────────────── */}
      <section className="relative hidden overflow-hidden bg-brand px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BrandLogo className="h-14 w-14 rounded-xl bg-white shadow-soft" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-white/75">AKOKO SOLUTIONS ERP</p>
              <h1 className="text-2xl font-bold tracking-tight">Agribusiness Command Center</h1>
            </div>
          </div>

          <div className="mt-16 max-w-xl">
            <p className="text-4xl font-bold leading-tight tracking-tight">
              Poultry, feed mill, soya, inventory, sales, and finance — one secure workspace.
            </p>
            <div className="mt-10 grid gap-3">
              {[
                [
                  "Multi-site scope",
                  "Company, branch, farm, warehouse, and production-site access controls"
                ],
                [
                  "Permission-first access",
                  "Role and permission checks enforced across every sensitive operation"
                ],
                [
                  "Operational intelligence",
                  "Executive dashboards, AI alerts, exports, and immutable audit trails"
                ]
              ].map(([title, copy]) => (
                <div
                  key={title}
                  className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur"
                >
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-white/75">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            ["12+", "Modules"],
            ["RBAC", "Protected"],
            ["Audit", "Tracked"]
          ].map(([val, label]) => (
            <div key={label} className="rounded-xl border border-white/15 bg-white/10 p-4">
              <p className="text-2xl font-bold">{val}</p>
              <p className="text-white/70">{label}</p>
            </div>
          ))}
        </div>

      </section>

      {/* ── Login form ───────────────────────────────────────────────────── */}
      <section className="grid min-h-screen place-items-center px-5 py-10">
        <form
          onSubmit={submit}
          className="w-full max-w-[460px] rounded-2xl border border-line bg-white p-8 shadow-panel"
          noValidate
        >
          <div className="mb-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <BrandLogo className="h-14 w-14 rounded-xl shadow-soft" />
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-field px-3 py-1 text-xs font-semibold text-ink/65">
                <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-brand" />
                Secure access
              </span>
            </div>
            <p className="app-kicker">AKOKO SOLUTIONS</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Sign in to your workspace
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/60">
              Use your admin-created account to access farm, production, inventory, sales,
              finance, and management records.
            </p>
          </div>

          <div className="mb-4 grid gap-1.5">
            <label htmlFor="email" className="text-sm font-semibold">
              Email address
            </label>
            <input
              id="email"
              className="app-control min-h-12"
              value={email}
              type="email"
              autoComplete="email"
              required
              aria-required="true"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="mb-5 grid gap-1.5">
            <label htmlFor="password" className="text-sm font-semibold">
              Password
            </label>
            <input
              id="password"
              className="app-control min-h-12"
              value={password}
              type="password"
              autoComplete="current-password"
              required
              aria-required="true"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="app-button-primary min-h-12 w-full"
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Signing in...
              </>
            ) : (
              <>
                Sign in
                <ArrowRight aria-hidden className="h-4 w-4" />
              </>
            )}
          </button>

          <div className="mt-6 flex items-center justify-between border-t border-line pt-5 text-xs text-ink/50">
            <span className="inline-flex items-center gap-1.5">
              <Building2 aria-hidden className="h-3.5 w-3.5 text-brand" />
              Multi-branch ERP
            </span>
            <span>JWT · HttpOnly cookies</span>
          </div>
        </form>
      </section>
    </main>
  );
}
