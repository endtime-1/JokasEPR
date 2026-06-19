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
  CRITICAL: { label: "Critical", color: "border-red-200 bg-red-50 text-red-700", Icon: AlertCircle },
  HIGH: { label: "High", color: "border-orange-200 bg-orange-50 text-orange-700", Icon: AlertTriangle },
  MEDIUM: { label: "Medium", color: "border-yellow-200 bg-yellow-50 text-yellow-700", Icon: AlertTriangle },
  LOW: { label: "Low", color: "border-blue-200 bg-blue-50 text-blue-700", Icon: Info }
};

const STATUS_CONFIG = {
  UNREAD: { label: "Unread", color: "text-brand" },
  ACKNOWLEDGED: { label: "Acknowledged", color: "text-amber-700" },
  RESOLVED: { label: "Resolved", color: "text-emerald-700" }
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
  const severity = SEVERITY_CONFIG[alert.severity];
  const StatusIcon = severity.Icon;
  const location = alert.farm?.name ?? alert.warehouse?.name ?? alert.productionSite?.name ?? alert.branch?.name ?? "Company wide";

  return (
    <article className={`overflow-hidden rounded-lg border shadow-sm ${severity.color}`}>
      <button className="w-full text-left" onClick={() => setExpanded((value) => !value)}>
        <div className="flex items-start gap-3 px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/85">
            <StatusIcon aria-hidden className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-bold">{alert.title}</span>
              <span className={`shrink-0 text-xs font-bold ${STATUS_CONFIG[alert.status].color}`}>{STATUS_CONFIG[alert.status].label}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-80">
              <span>{CATEGORY_LABELS[alert.category] ?? alert.category}</span>
              <span>{severity.label}</span>
              <span>{location}</span>
              <span>{new Date(alert.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          <ChevronDown aria-hidden className={`mt-2 h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-current/15 bg-white/45 px-4 py-3 text-sm">
          <p className="leading-6">{alert.message}</p>
          {(alert.acknowledgedBy || alert.resolvedBy) ? (
            <div className="mt-3 space-y-1 text-xs opacity-75">
              {alert.acknowledgedBy ? <p>Acknowledged by {alert.acknowledgedBy.fullName}</p> : null}
              {alert.resolvedBy ? <p>Resolved by {alert.resolvedBy.fullName}</p> : null}
            </div>
          ) : null}
          {canManage && alert.status !== "RESOLVED" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {alert.status === "UNREAD" ? (
                <button onClick={() => onAcknowledge(alert.id)} className="app-button-secondary min-h-9 px-3 text-xs">
                  <Bell aria-hidden className="h-3.5 w-3.5" />
                  Acknowledge
                </button>
              ) : null}
              <button onClick={() => onResolve(alert.id)} className="app-button-secondary min-h-9 px-3 text-xs">
                <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                Resolve
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
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
      .then((response) => setCanManage(response.data.permissions.includes("alerts.manage")))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [filterCategory, filterSeverity, filterStatus]);

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const response = await apiFetch<ApiEnvelope<{ generated: number }>>("/alerts/generate", { method: "POST" });
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

  const unread = alerts.filter((alert) => alert.status === "UNREAD").length;
  const critical = alerts.filter((alert) => alert.severity === "CRITICAL").length;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="app-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="app-kicker">AI decision support</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">Alerts and Forecasting</h1>
              <p className="mt-2 text-sm leading-6 text-ink/62">Anomaly detection, operational predictions, risk alerts, and forecast signals for scoped business areas.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void load()} className="app-button-secondary">
                <RefreshCw aria-hidden className="h-4 w-4" />
                Refresh
              </button>
              <button onClick={() => downloadReport(reportPath, "ai-alert-report.csv").catch(() => setError("Failed to export alert report."))} className="app-button-secondary">
                <Download aria-hidden className="h-4 w-4" />
                Report
              </button>
              {canManage ? (
                <button onClick={() => void generate()} disabled={generating} className="app-button-primary">
                  {generating ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Zap aria-hidden className="h-4 w-4" />}
                  Run Detection
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Total", value: total, Icon: Bell, color: "text-ink" },
            { label: "Unread", value: unread, Icon: BellOff, color: "text-brand" },
            { label: "Critical", value: critical, Icon: AlertCircle, color: "text-red-600" },
            { label: "Forecasts", value: forecasts.length, Icon: TrendingUp, color: "text-ink/65" }
          ].map(({ label, value, Icon, color }) => (
            <article key={label} className="app-card p-4">
              <div className="flex items-center gap-2">
                <Icon aria-hidden className={`h-4 w-4 ${color}`} />
                <span className="text-xs font-semibold uppercase text-ink/50">{label}</span>
              </div>
              <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
            </article>
          ))}
        </section>

        <section className="app-card flex flex-wrap gap-2 p-4">
          <select value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)} className="app-control">
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select value={filterSeverity} onChange={(event) => setFilterSeverity(event.target.value)} className="app-control">
            <option value="">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="app-control">
            <option value="">All statuses</option>
            <option value="UNREAD">Unread</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </section>

        {error ? <p className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">{error}</p> : null}

        <section className="app-card p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold">Forecast Signals</h2>
            <TrendingUp aria-hidden className="h-4 w-4 text-brand" />
          </div>
          {forecasts.length === 0 ? (
            <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-ink/55">No forecasts generated yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {forecasts.slice(0, 12).map((forecast) => (
                <article key={forecast.id} className="rounded-lg border border-line bg-field/70 p-4">
                  <p className="text-xs font-bold uppercase text-ink/45">{CATEGORY_LABELS[forecast.category] ?? forecast.category}</p>
                  <h3 className="mt-2 text-sm font-bold">{forecast.entityName}</h3>
                  <p className="mt-2 text-2xl font-bold text-brand">{formatForecast(forecast)}</p>
                  <p className="mt-2 text-xs text-ink/55">
                    {new Date(forecast.forecastDate).toLocaleDateString()} | Confidence {Math.round(forecast.confidence * 100)}%
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 aria-hidden className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="app-card flex flex-col items-center justify-center py-16 text-center">
              <Bell aria-hidden className="mb-3 h-10 w-10 text-ink/20" />
              <p className="text-sm font-semibold text-ink/60">No alerts found</p>
              {canManage ? <p className="mt-1 text-xs text-ink/40">Run detection to scan for anomalies.</p> : null}
            </div>
          ) : (
            alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} onAcknowledge={acknowledge} onResolve={resolve} canManage={canManage} />
            ))
          )}
        </section>
      </div>
    </AppShell>
  );
}
