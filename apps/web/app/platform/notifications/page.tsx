"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Mail, MessageCircle, Save, Smartphone } from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { apiFetch, ApiEnvelope } from "../../../lib/api";

type NotificationConfig = {
  emailEnabled: boolean;
  emailFromAddress: string | null;
  emailFromName: string | null;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
};

export default function NotificationConfigPage() {
  const [config, setConfig] = useState<NotificationConfig>({
    emailEnabled: false,
    emailFromAddress: "",
    emailFromName: "",
    smsEnabled: false,
    whatsappEnabled: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<ApiEnvelope<NotificationConfig>>("/notifications/config")
      .then((res) => setConfig({
        emailEnabled: res.data.emailEnabled ?? false,
        emailFromAddress: res.data.emailFromAddress ?? "",
        emailFromName: res.data.emailFromName ?? "",
        smsEnabled: res.data.smsEnabled ?? false,
        whatsappEnabled: res.data.whatsappEnabled ?? false
      }))
      .catch((e) => setError(e?.message ?? "Failed to load config"))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await apiFetch("/notifications/config", {
        method: "PUT",
        body: JSON.stringify(config)
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/platform" className="flex items-center gap-1 text-sm text-ink/55 hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
            Platform
          </Link>
          <h1 className="text-xl font-bold">Notification Configuration</h1>
        </div>

        <p className="mb-6 text-sm text-ink/55">
          Configure outbound channels for your company. Credentials for SMTP, Twilio, and WhatsApp should be set as environment variables on your server. Toggle channels on/off here to activate them for your team.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-ink/40" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Email */}
            <div className="rounded-xl border border-line bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-600">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">Email (SMTP)</p>
                    <p className="text-sm text-ink/50">Configured via SMTP_HOST, SMTP_USER, SMTP_PASS env vars</p>
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={config.emailEnabled}
                  onClick={() => setConfig((c) => ({ ...c, emailEnabled: !c.emailEnabled }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${config.emailEnabled ? "bg-brand" : "bg-line"}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${config.emailEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>

              {config.emailEnabled && (
                <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink/60">From Address</label>
                    <input
                      type="email"
                      value={config.emailFromAddress ?? ""}
                      onChange={(e) => setConfig((c) => ({ ...c, emailFromAddress: e.target.value }))}
                      placeholder="noreply@yourdomain.com"
                      className="w-full rounded-md border border-line bg-field/40 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink/60">From Name</label>
                    <input
                      type="text"
                      value={config.emailFromName ?? ""}
                      onChange={(e) => setConfig((c) => ({ ...c, emailFromName: e.target.value }))}
                      placeholder="AKOKO SOLUTIONS ERP"
                      className="w-full rounded-md border border-line bg-field/40 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* SMS */}
            <div className="rounded-xl border border-line bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-green-50 text-green-600">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">SMS (Twilio)</p>
                    <p className="text-sm text-ink/50">Configured via TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER</p>
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={config.smsEnabled}
                  onClick={() => setConfig((c) => ({ ...c, smsEnabled: !c.smsEnabled }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${config.smsEnabled ? "bg-brand" : "bg-line"}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${config.smsEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
              <p className="mt-3 text-xs text-ink/40">Users must have a phone number saved in their profile to receive SMS.</p>
            </div>

            {/* WhatsApp */}
            <div className="rounded-xl border border-line bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                    <MessageCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">WhatsApp (Meta Cloud API)</p>
                    <p className="text-sm text-ink/50">Configured via WHATSAPP_API_URL, WHATSAPP_API_TOKEN, WHATSAPP_FROM_NUMBER</p>
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={config.whatsappEnabled}
                  onClick={() => setConfig((c) => ({ ...c, whatsappEnabled: !c.whatsappEnabled }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${config.whatsappEnabled ? "bg-brand" : "bg-line"}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${config.whatsappEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
              <p className="mt-3 text-xs text-ink/40">Users must have a phone number saved in their profile to receive WhatsApp messages.</p>
            </div>

            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}

            <div className="flex items-center justify-end gap-3 pt-2">
              {saved && (
                <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Configuration
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
