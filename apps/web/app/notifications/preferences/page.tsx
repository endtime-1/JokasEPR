"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, Save } from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { apiFetch, ApiEnvelope } from "../../../lib/api";

type Preference = {
  notificationType: string;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
};

const TYPE_LABELS: Record<string, { label: string; description: string }> = {
  LOW_STOCK_ALERT: { label: "Low Stock Alert", description: "When inventory falls below reorder level" },
  EXPIRY_ALERT: { label: "Expiry Alert", description: "When stock batches are approaching expiry" },
  VACCINATION_REMINDER: { label: "Vaccination Reminder", description: "Scheduled flock vaccination due dates" },
  MEDICATION_REMINDER: { label: "Medication Reminder", description: "Scheduled flock medication due dates" },
  PRODUCTION_ORDER_COMPLETED: { label: "Production Order Completed", description: "When a feed or soya production run finishes" },
  PURCHASE_APPROVAL_NEEDED: { label: "Purchase Approval Needed", description: "Purchase requests awaiting your approval" },
  CUSTOMER_PAYMENT_OVERDUE: { label: "Customer Payment Overdue", description: "Customer invoices past due date" },
  SUPPLIER_PAYMENT_DUE: { label: "Supplier Payment Due", description: "Supplier invoices due for payment" },
  MACHINE_MAINTENANCE_DUE: { label: "Machine Maintenance Due", description: "Scheduled machine maintenance approaching" },
  AI_RISK_ALERT: { label: "AI Risk Alert", description: "AI-detected anomalies and risk signals" },
  TASK_ASSIGNED: { label: "Task Assigned", description: "When a task is assigned to you" },
  QUALITY_BATCH_REJECTED: { label: "Quality Batch Rejected", description: "When a quality check rejects a batch" },
  STOCK_TRANSFER_REQUEST: { label: "Stock Transfer Request", description: "Inter-warehouse stock transfer requests" }
};

const CHANNEL_LABELS = [
  { key: "inApp", label: "In-App" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" }
] as const;

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<ApiEnvelope<Preference[]>>("/notifications/preferences")
      .then((res) => setPrefs(res.data))
      .finally(() => setLoading(false));
  }, []);

  function toggle(type: string, channel: keyof Omit<Preference, "notificationType">) {
    setPrefs((prev) =>
      prev.map((p) => (p.notificationType === type ? { ...p, [channel]: !p[channel] } : p))
    );
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify({ preferences: prefs })
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/notifications" className="flex items-center gap-1 text-sm text-ink/55 hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
            Notifications
          </Link>
          <h1 className="text-xl font-bold">Notification Preferences</h1>
        </div>

        <p className="mb-6 text-sm text-ink/55">
          Choose how you want to receive each type of notification. Email, SMS, and WhatsApp channels are only active when configured by your admin.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <LoaderCircle className="h-6 w-6 animate-spin text-ink/40" />
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-line bg-white">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_repeat(4,_48px)] items-center border-b border-line px-5 py-3">
                <span className="text-xs font-bold uppercase tracking-wide text-ink/45">Notification Type</span>
                {CHANNEL_LABELS.map((c) => (
                  <span key={c.key} className="text-center text-[10px] font-bold uppercase tracking-wide text-ink/45">{c.label}</span>
                ))}
              </div>

              <ul className="divide-y divide-line">
                {prefs.map((p) => {
                  const meta = TYPE_LABELS[p.notificationType];
                  return (
                    <li key={p.notificationType} className="grid grid-cols-[1fr_repeat(4,_48px)] items-center gap-2 px-5 py-3.5 hover:bg-field/40">
                      <div>
                        <p className="text-sm font-medium">{meta?.label ?? p.notificationType}</p>
                        <p className="text-xs text-ink/45">{meta?.description}</p>
                      </div>
                      {CHANNEL_LABELS.map((c) => (
                        <div key={c.key} className="flex justify-center">
                          <button
                            role="checkbox"
                            aria-checked={p[c.key]}
                            onClick={() => toggle(p.notificationType, c.key)}
                            className={`h-5 w-5 rounded border-2 transition ${
                              p[c.key]
                                ? "border-brand bg-brand text-white"
                                : "border-line bg-white hover:border-brand/50"
                            }`}
                          >
                            {p[c.key] && (
                              <svg viewBox="0 0 10 8" className="mx-auto h-2.5 w-2.5">
                                <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        </div>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              {saved && <span className="text-sm font-medium text-emerald-600">Saved!</span>}
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
              >
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Preferences
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
