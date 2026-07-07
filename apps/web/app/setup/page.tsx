"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, Settings2 } from "lucide-react";
import { BrandLogo } from "../../components/brand-logo";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((body: { setupRequired?: boolean }) => {
        if (!body.setupRequired) {
          router.replace("/login");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyName, adminName, email, password }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 403) {
          setError("Setup has already been completed. Please sign in.");
        } else {
          setError(body.message ?? "Setup failed. Please try again.");
        }
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="grid min-h-screen place-items-center bg-field">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </main>
    );
  }

  if (done) {
    return (
      <main className="grid min-h-screen place-items-center bg-field px-5">
        <div className="w-full max-w-[460px] rounded-2xl border border-line bg-white p-10 text-center shadow-panel">
          <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-green-500" />
          <h2 className="text-2xl font-bold tracking-tight">Setup complete!</h2>
          <p className="mt-3 text-sm text-ink/60">
            Your admin account has been created. Redirecting to sign-in…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-field text-ink lg:grid lg:grid-cols-[minmax(360px,0.9fr)_minmax(420px,1.1fr)]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-brand px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BrandLogo className="h-14 w-14 rounded-xl bg-white shadow-soft" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-white/75">JOKAS AGRIBUSINESS ERP</p>
              <h1 className="text-2xl font-bold tracking-tight">First-time Setup</h1>
            </div>
          </div>
          <div className="mt-16 max-w-xl">
            <p className="text-4xl font-bold leading-tight tracking-tight">
              Create your company and administrator account to get started.
            </p>
            <div className="mt-10 grid gap-3">
              {[
                ["Step 1 — Company", "Enter your company name. You can update details later from Settings."],
                ["Step 2 — Admin account", "This account gets full Super Admin access to all modules."],
                ["Step 3 — Sign in", "After setup, sign in and invite your team from Identity Management."],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-white/75">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-4 text-sm">
          <Settings2 className="h-5 w-5 shrink-0 text-white/70" />
          <span className="text-white/80">This page is only accessible on a fresh installation with no existing users.</span>
        </div>
      </section>

      {/* Setup form */}
      <section className="grid min-h-screen place-items-center px-5 py-10">
        <form
          onSubmit={submit}
          className="w-full max-w-[460px] rounded-2xl border border-line bg-white p-8 shadow-panel"
          noValidate
        >
          <div className="mb-7">
            <div className="mb-5 flex items-center justify-between gap-3">
              <BrandLogo className="h-14 w-14 rounded-xl shadow-soft" />
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-field px-3 py-1 text-xs font-semibold text-ink/65">
                <Settings2 aria-hidden className="h-3.5 w-3.5 text-brand" />
                One-time setup
              </span>
            </div>
            <p className="app-kicker">JOKAS AGRIBUSINESS ERP</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Set up your workspace</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/60">
              Enter your company details and create the Super Admin account. This form is only shown once.
            </p>
          </div>

          <div className="mb-4 grid gap-1.5">
            <label htmlFor="companyName" className="text-sm font-semibold">
              Company name
            </label>
            <input
              id="companyName"
              className="app-control min-h-12"
              value={companyName}
              type="text"
              placeholder="e.g. Jokas Agribusiness Ltd"
              autoComplete="organization"
              required
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          <div className="mb-4 grid gap-1.5">
            <label htmlFor="adminName" className="text-sm font-semibold">
              Your full name
            </label>
            <input
              id="adminName"
              className="app-control min-h-12"
              value={adminName}
              type="text"
              placeholder="e.g. Gabriel Kusi"
              autoComplete="name"
              required
              onChange={(e) => setAdminName(e.target.value)}
            />
          </div>

          <div className="mb-4 grid gap-1.5">
            <label htmlFor="email" className="text-sm font-semibold">
              Admin email address
            </label>
            <input
              id="email"
              className="app-control min-h-12"
              value={email}
              type="email"
              placeholder="e.g. admin@jokasfarms.com"
              autoComplete="email"
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="mb-4 grid gap-1.5">
            <label htmlFor="password" className="text-sm font-semibold">
              Password
            </label>
            <input
              id="password"
              className="app-control min-h-12"
              value={password}
              type="password"
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="mb-5 grid gap-1.5">
            <label htmlFor="confirmPassword" className="text-sm font-semibold">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              className="app-control min-h-12"
              value={confirmPassword}
              type="password"
              autoComplete="new-password"
              required
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
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
                Creating account…
              </>
            ) : (
              <>
                Create admin account
                <ArrowRight aria-hidden className="h-4 w-4" />
              </>
            )}
          </button>

          <p className="mt-5 text-center text-xs text-ink/50">
            Already set up?{" "}
            <a href="/login" className="text-brand hover:underline font-medium">
              Sign in
            </a>
          </p>
        </form>
      </section>
    </main>
  );
}
