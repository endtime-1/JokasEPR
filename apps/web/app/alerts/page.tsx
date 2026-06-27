"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronDown,
  Download,
  Info,
  Loader2,
  RefreshCw,
  TrendingUp,
  Zap
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { apiFetch, ApiEnvelope, downloadReport } from "../../lib/api";

type AiAlert = {
  id: string;
  category: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "UNREAD" | "ACKNOWLEDGED" | "RESOLVED";
  title: string;
  message: string;
  entityName: string | null;
  entityType: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  farm: { name: string } | null;
  branch: { name: string } | null;
  warehouse: { name: string } | null;
  productionSite: { name: string } | null;
  acknowledgedBy: { fullName: string } | null;
  resolvedBy: { fullName: string } | null;
};

type AiForecast = {
  id: string;
  category: string;
  entityType: string;
  entityName: string;
  forecastDate: string;
  forecastValue: number;
  unit: string | null;
  confidence: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  MORTALITY_ANOMALY: "Mortality",
  EGG_PRODUCTION_DROP: "Egg Drop",
  FEED_CONSUMPTION_ANOMALY: "Feed Anomaly",
  LOW_STOCK_PREDICTION: "Low Stock",
  FEED_DEMAND_FORECAST: "Feed Forecast",
  SALES_FORECAST: "Sales Forecast",
  CUSTOMER_REORDER_PREDICTION: "Reorder",
  SMART_PRICING: "Pricing",
  SOYA_YIELD_ANOMALY: "Soya Yield",
  MACHINE_MAINTENANCE: "Maintenance",
  CUSTOMER_DEBT_RISK: "Debt Risk",
  SUPPLIER_DELAY_RISK: "Supplier Delay"
};

const SEVERITY_CONFIG = {
  CRITICAL: {
    label: "Critical",
    border: "border-l-red-500",
    badge: "bg-red-100 text-red-700",
    icon: "bg-red-100 text-red-600",
    Icon: AlertCircle
  },
  HIGH: {
    label: "High",
    border: "border-l-orange-500",
    badge: "bg-orange-100 text-orange-700",
    icon: "bg-orange-100 text-orange-600",
    Icon: AlertTriangle
  },
  MEDIUM: {
    label: "Medium",
    border: "border-l-yellow-400",
    badge: "bg-yellow-100 text-yellow-700",
    icon: "bg-yellow-100 text-yellow-600",
    Icon: AlertTriangle
  },
  LOW: {
    label: "Low",
    border: "border-l-blue-400",
    badge: "bg-blue-100 text-blue-700",
    icon: "bg-blue-100 text-blue-600",
    Icon: Info
  }
};

const STATUS_CONFIG = {
  UNREAD: { label: "Unread", color: "bg-brand/10 text-brand" },
  ACKNOWLEDGED: { label: "Acknowledged", color: "bg-amber-100 text-amber-700" },
  RESOLVED: { label: "Resolved", color: "bg-emerald-100 text-emerald-700" }
};

function formatForecast(forecast: AiForecast) {
  if (forecast.unit === "probability") return `${Math.round(forecast.forecastValue * 100)}%`;
  if (forecast.unit === "GHS") return `GHS ${Number(forecast.forecastValue).toLocaleString()}`;
  return `${Number(forecast.forecastValue).toLocaleString()}${forecast.unit ? ` ${forecast.unit}` : ""}`;
}

function AlertCard({
  alert,
  onAcknowledge,
  onResolve,
  canManage
}: {
  alert: AiAlert;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
  canManage: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[alert.severity];
  const StatusIcon = cfg.Icon;
  const status = STATUS_CONFIG[alert.status];
  const location =
    alert.farm?.name ??
    alert.warehouse?.name ??
    alert.productionSite?.name ??
    alert.branch?.name ??
    "Company wide";

  return (
    <article
      className={`overflow-hidden rounded-xl border border-line border-l-[3px] bg-white shadow-card ${cfg.border}`}
    >
      <button className="w-full text-left" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-start gap-3 px-4 py-3.5">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${cfg.icon}`}>
            <StatusIcon aria-hidden className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-bold text-ink leading-snug">{alert.title}</span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.color}`}
              >
                {status.label}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.badge}`}>
                {cfg.label}
              </span>
              <span className="text-xs text-ink/45">
                {CATEGORY_LABELS[alert.category] ?? alert.category}
              </span>
              <span className="text-xs text-ink/45">{location}</span>
              <span className="text-xs text-ink/35">
                {new Date(alert.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <ChevronDown
            aria-hidden
            className={`mt-2 h-4 w-4 shrink-0 text-ink/30 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-line bg-field/50 px-4 py-4 text-sm">
          <p className="leading-6 text-ink/75">{alert.message}</p>
          {alert.acknowledgedBy || alert.resolvedBy ? (
            <div className="mt-3 space-y-1 text-xs text-ink/45">
              {alert.acknowledgedBy ? (
                <p>Acknowledged by {alert.acknowledgedBy.fullName}</p>
              ) : null}
              {alert.resolvedBy ? <p>Resolved by {alert.resolvedBy.fullName}</p> : null}
            </div>
          ) : null}
          {canManage && alert.status !== "RESOLVED" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {alert.status === "UNREAD" ? (
                <button
                  onClick={() => onAcknowledge(alert.id)}
                  className="app-button-secondary min-h-9 px-3 text-xs"
                >
                  <Bell aria-hidden className="h-3.5 w-3.5" />
                  Acknowledge
                </button>
              ) : null}
              <button
                onClick={() => onResolve(alert.id)}
                className="app-button-secondary min-h-9 px-3 text-xs"
              >
                <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                Resolve
              </button>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AiAlert[]>([]);
  const [forecasts, setForecasts] = useState<AiForecast[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [canManage, setCanManage] = useState(false);

  const reportPath = useMemo(() => {
    const params = new URLSearchParams();
    if (filterCategory) params.set("category", filterCategory);
    if (filterSeverity) params.set("severity", filterSeverity);
    if (filterStatus) params.set("status", filterStatus);
    const query = params.toString();
    return `/alerts/report.csv${query ? `?${query}` : ""}`;
  }, [filterCategory, filterSeverity, filterStatus]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterCategory) params.set("category", filterCategory);
      if (filterSeverity) params.set("severity", filterSeverity);
      if (filterStatus) params.set("status", filterStatus);
      params.set("limit", "100");

      const [alertResponse, forecastResponse] = await Promise.all([
        apiFetch<ApiEnvelope<AiAlert[]>>(`/alerts?${params}`),
        apiFetch<ApiEnvelope<AiForecast[]>>("/alerts/forecasts?limit=100")
      ]);

      setAlerts(alertResponse.data ?? []);
      setTotal(Number(alertResponse.meta?.total ?? alertResponse.data?.length ?? 0));
      setForecasts(forecastResponse.data ?? []);
    } catch {
      setError("Failed to load AI alerts and forecasts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    apiFetch<ApiEnvelope<{ permissions: string[] }>>("/auth/me")
      .then((r) => setCanManage(r.data.permissions.includes("alerts.manage")))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [filterCategory, filterSeverity, filterStatus]);

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const response = await apiFetch<ApiEnvelope<{ generated: number }>>("/alerts/generate", {
        method: "POST"
      });
      await load();
      if (response.data.generated === 0) {
        setError("No new alerts detected. All thresholds are within normal range.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to generate alerts.");
    } finally {
      setGenerating(false);
    }
  }

  async function acknowledge(id: string) {
    try {
      await apiFetch(`/alerts/${id}/acknowledge`, { method: "PATCH" });
      await load();
    } catch {
      setError("Failed to acknowledge alert.");
    }
  }

  async function resolve(id: string) {
    try {
      await apiFetch(`/alerts/${id}/resolve`, { method: "PATCH" });
      await load();
    } catch {
      setError("Failed to resolve alert.");
    }
  }

  const unread = alerts.filter((a) => a.status === "UNREAD").length;
  const critical = alerts.filter((a) => a.severity === "CRITICAL").length;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Page hero */}
        <section className="overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
            <div className="max-w-2xl">
              <p className="app-kicker flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                AI decision support
              </p>
              <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-ink">
                Alerts & Forecasting
              </h1>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/55">
                Anomaly detection, operational predictions, risk alerts, and forecast signals
                for scoped business areas.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void load()}
                className="app-button-secondary"
              >
                <RefreshCw aria-hidden className="h-4 w-4" />
                Refresh
              </button>
              <button
                onClick={() =>
                  downloadReport(reportPath, "ai-alert-report.csv").catch(() =>
                    setError("Failed to export alert report.")
                  )
                }
                className="app-button-secondary"
              >
                <Download aria-hidden className="h-4 w-4" />
                Export
              </button>
              {canManage ? (
                <button
                  onClick={() => void generate()}
                  disabled={generating}
                  className="app-button-primary"
                >
                  {generating ? (
                    <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap aria-hidden className="h-4 w-4" />
                  )}
                  Run Detection
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {/* Stats row */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            {
              label: "Total alerts",
              value: total,
              Icon: Bell,
              iconStyle: "bg-brand/10 text-brand",
              valStyle: "text-ink"
            },
            {
              label: "Unread",
              value: unread,
              Icon: BellOff,
              iconStyle: "bg-brand/10 text-brand",
              valStyle: "text-brand"
            },
            {
              label: "Critical",
              value: critical,
              Icon: AlertCircle,
              iconStyle: "bg-red-100 text-red-600",
              valStyle: "text-red-600"
            },
            {
              label: "Forecasts",
              value: forecasts.length,
              Icon: TrendingUp,
              iconStyle: "bg-emerald-100 text-emerald-600",
              valStyle: "text-ink"
            }
          ].map(({ label, value, Icon, iconStyle, valStyle }) => (
            <article
              key={label}
              className="rounded-2xl border border-line bg-gradient-to-b from-white to-field/60 p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
            >
              <div className={`grid h-10 w-10 place-items-center rounded-xl shadow-sm ${iconStyle}`}>
                <Icon aria-hidden className="h-5 w-5" />
              </div>
              <strong className={`mt-4 block text-[28px] font-extrabold leading-none ${valStyle}`}>
                {value}
              </strong>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-ink/45">
                {label}
              </p>
            </article>
          ))}
        </section>

        {/* Filters */}
        <section className="app-card flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-wide text-ink/40 mr-1">Filter</span>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="app-control min-w-[160px] text-sm"
          >
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="app-control min-w-[140px] text-sm"
          >
            <option value="">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="app-control min-w-[140px] text-sm"
          >
            <option value="">All statuses</option>
            <option value="UNREAD">Unread</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </section>

        {error ? (
          <div className="app-alert-warning">{error}</div>
        ) : null}

        {/* Forecast signals */}
        <section className="app-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-sm font-bold text-ink">Forecast Signals</h2>
              <p className="mt-0.5 text-xs text-ink/45">AI-generated predictions with confidence scores</p>
            </div>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100">
              <TrendingUp aria-hidden className="h-3.5 w-3.5 text-emerald-600" />
            </span>
          </div>
          <div className="p-5">
            {forecasts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <TrendingUp className="mb-2 h-8 w-8 text-ink/15" />
                <p className="text-sm text-ink/40">No forecasts generated yet.</p>
                {canManage && (
                  <p className="mt-1 text-xs text-ink/30">Run detection to generate forecast signals.</p>
                )}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {forecasts.slice(0, 12).map((forecast) => (
                  <article
                    key={forecast.id}
                    className="rounded-xl border border-line bg-gradient-to-br from-white to-field/60 p-4 shadow-card"
                  >
                    <span className="inline-block rounded-md bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                      {CATEGORY_LABELS[forecast.category] ?? forecast.category}
                    </span>
                    <h3 className="mt-2.5 text-sm font-bold text-ink">{forecast.entityName}</h3>
                    <p className="mt-1 text-2xl font-extrabold text-brand">
                      {formatForecast(forecast)}
                    </p>
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-[10px] text-ink/40">
                        <span>Confidence</span>
                        <span className="font-bold">{Math.round(forecast.confidence * 100)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-1.5 rounded-full bg-brand transition-all duration-700"
                          style={{ width: `${Math.round(forecast.confidence * 100)}%` }}
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-ink/35">
                      {new Date(forecast.forecastDate).toLocaleDateString()}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Alert list */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">
              Active Alerts
              {alerts.length > 0 && (
                <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand">
                  {alerts.length}
                </span>
              )}
            </h2>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 aria-hidden className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="app-card flex flex-col items-center justify-center py-16 text-center">
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-field">
                <Bell aria-hidden className="h-6 w-6 text-ink/20" />
              </span>
              <p className="text-sm font-semibold text-ink/50">No alerts found</p>
              {canManage ? (
                <p className="mt-1 text-xs text-ink/35">Run detection to scan for anomalies.</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onAcknowledge={acknowledge}
                  onResolve={resolve}
                  canManage={canManage}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
