"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity, AlertCircle, ArrowRight, CheckCircle, Clock, Cloud, CloudOff, RefreshCw, Settings,
  Unlink, Webhook, XCircle, Zap
} from "lucide-react";
import { AppShell } from "./app-shell";
import { apiFetch } from "../lib/api";

// ─── Shared Styles ────────────────────────────────────────────────────────────

const btnPrimary = "inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50";
const btnSecondary = "inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-field";
const btnDanger = "inline-flex min-h-10 items-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50";
const cardClass = "rounded-md border border-line bg-white p-4 shadow-panel";
const inputClass = "min-h-11 w-full rounded-md border border-line px-3 text-sm";
const selectClass = "min-h-11 w-full rounded-md border border-line px-3 text-sm bg-white";

function QBNav() {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {[
        ["/quickbooks", "Connection"],
        ["/quickbooks/sync-logs", "Sync Logs"],
        ["/quickbooks/webhook-events", "Webhook Events"],
        ["/quickbooks/mapping", "Account Mapping"]
      ].map(([href, label]) => (
        <Link key={href} href={href} className={btnSecondary}>{label}</Link>
      ))}
    </div>
  );
}

function SyncBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    NOT_SYNCED: "bg-gray-100 text-gray-600",
    PENDING: "bg-yellow-100 text-yellow-800",
    SYNCED: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
    SKIPPED: "bg-blue-100 text-blue-800"
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-600"}`}>{status.replace(/_/g, " ")}</span>;
}

function ResultBadge({ result }: { result: string }) {
  const map: Record<string, string> = {
    SUCCESS: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
    PARTIAL: "bg-orange-100 text-orange-800",
    SKIPPED: "bg-gray-100 text-gray-600"
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[result] ?? "bg-gray-100 text-gray-600"}`}>{result}</span>;
}

function fmt(d: unknown) {
  if (!d) return "—";
  return new Date(d as string).toLocaleString("en-GB");
}

// ─── Connection Page ─────────────────────────────────────────────────────────

type QBStatus = {
  connection: { id: string; realmId: string; environment: string; connectedAt: string; isActive: boolean } | null;
  stats: Record<string, Record<string, number>> | null;
};

export function QuickBooksConnectionPage() {
  const [status, setStatus] = useState<QBStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<{ connection: QBStatus["connection"]; stats: QBStatus["stats"] }>("/quickbooks/status")
      .then((r) => setStatus(r))
      .catch(() => setError("Failed to load QuickBooks status"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function connect() {
    try {
      const r = await apiFetch<{ authorizationUrl: string }>("/quickbooks/oauth/initiate", { method: "POST" });
      window.location.href = r.authorizationUrl;
    } catch {
      setError("Failed to initiate QuickBooks connection");
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect from QuickBooks? All sync status will be preserved but no new syncs will run.")) return;
    try {
      await apiFetch("/quickbooks/disconnect", { method: "DELETE" });
      setMsg("Disconnected successfully");
      load();
    } catch {
      setError("Failed to disconnect");
    }
  }

  async function syncAll() {
    setSyncing(true);
    setMsg("");
    try {
      await apiFetch("/quickbooks/sync", { method: "POST" });
      setMsg("Full sync started in background. Check Sync Logs for progress.");
    } catch {
      setError("Failed to start sync");
    } finally {
      setSyncing(false);
    }
  }

  const conn = status?.connection;
  const stats = status?.stats;

  return (
    <AppShell>
      <QBNav />

      {error && <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}
      {msg && <div className="mb-4 flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700"><CheckCircle className="h-4 w-4" />{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Connection status */}
        <div className={cardClass}>
          <h2 className="mb-4 font-semibold">Connection Status</h2>
          {loading ? (
            <p className="text-sm text-ink/50">Loading…</p>
          ) : conn?.isActive ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-700">
                <Cloud className="h-5 w-5" />
                <span className="font-semibold">Connected</span>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs">{conn.environment}</span>
              </div>
              <p className="text-sm text-ink/65">Realm ID: <code className="font-mono text-xs">{conn.realmId}</code></p>
              <p className="text-sm text-ink/65">Connected: {fmt(conn.connectedAt)}</p>
              <div className="flex gap-2 pt-2">
                <button className={btnPrimary} onClick={syncAll} disabled={syncing}>
                  <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Starting…" : "Sync All"}
                </button>
                <button className={btnDanger} onClick={disconnect}><Unlink className="h-4 w-4" />Disconnect</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-600">
                <CloudOff className="h-5 w-5" />
                <span className="font-semibold">Not Connected</span>
              </div>
              <p className="text-sm text-ink/65">Connect your QuickBooks Online account to start syncing financial data.</p>
              <p className="text-sm text-yellow-700 bg-yellow-50 rounded-md p-2">Using sandbox mode. Configure QB_ENVIRONMENT=production to go live.</p>
              <button className={btnPrimary} onClick={connect}><ArrowRight className="h-4 w-4" />Connect QuickBooks</button>
            </div>
          )}
        </div>

        {/* Quick sync actions */}
        {conn?.isActive && (
          <div className={cardClass}>
            <h2 className="mb-4 font-semibold">Sync by Entity</h2>
            <div className="grid grid-cols-2 gap-2">
              {["customers", "vendors", "items", "invoices", "payments", "bills", "expenses"].map((entity) => (
                <button
                  key={entity}
                  className={btnSecondary}
                  onClick={async () => {
                    try {
                      await apiFetch(`/quickbooks/sync/${entity}`, { method: "POST" });
                      setMsg(`${entity} sync started`);
                    } catch {
                      setError(`Failed to start ${entity} sync`);
                    }
                  }}
                >
                  <Zap className="h-3 w-3" />
                  {entity.charAt(0).toUpperCase() + entity.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sync stats */}
      {stats && (
        <div className={`${cardClass} mt-6`}>
          <h2 className="mb-4 font-semibold">Sync Status Overview</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink/65">
                  <th className="pb-2">Entity</th>
                  <th className="pb-2">Not Synced</th>
                  <th className="pb-2">Pending</th>
                  <th className="pb-2">Synced</th>
                  <th className="pb-2">Failed</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats).map(([entity, counts]) => (
                  <tr key={entity} className="border-b border-line/50 last:border-0">
                    <td className="py-2 font-medium capitalize">{entity}</td>
                    <td className="py-2 text-gray-500">{counts.NOT_SYNCED ?? 0}</td>
                    <td className="py-2 text-yellow-600">{counts.PENDING ?? 0}</td>
                    <td className="py-2 text-green-600">{counts.SYNCED ?? 0}</td>
                    <td className="py-2 text-red-600">{counts.FAILED ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ─── Sync Logs Page ──────────────────────────────────────────────────────────

type SyncLog = {
  id: string;
  operation: string;
  result: string;
  entityType: string | null;
  entityId: string | null;
  qbEntityId: string | null;
  recordsProcessed: number;
  recordsSucceeded: number;
  recordsFailed: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  triggeredBy: { fullName: string } | null;
};

export function QuickBooksSyncLogsPage() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ operation: "", result: "" });
  const [selected, setSelected] = useState<SyncLog | null>(null);

  function load() {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100", ...(filter.operation && { operation: filter.operation }), ...(filter.result && { result: filter.result }) });
    apiFetch<{ data: SyncLog[] }>(`/quickbooks/logs?${params}`)
      .then((r) => setLogs(r.data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [filter]);

  return (
    <AppShell>
      <QBNav />
      <div className="mb-4 flex flex-wrap gap-3">
        <select className={`${selectClass} w-48`} value={filter.operation} onChange={(e) => setFilter((f) => ({ ...f, operation: e.target.value }))}>
          <option value="">All Operations</option>
          {["CUSTOMER_SYNC","VENDOR_SYNC","ITEM_SYNC","INVOICE_SYNC","PAYMENT_SYNC","BILL_SYNC","EXPENSE_SYNC","FULL_SYNC","MANUAL_SYNC","SCHEDULED_SYNC"].map((o) => (
            <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select className={`${selectClass} w-36`} value={filter.result} onChange={(e) => setFilter((f) => ({ ...f, result: e.target.value }))}>
          <option value="">All Results</option>
          {["SUCCESS","FAILED","PARTIAL","SKIPPED"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-ink/50">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-field text-left text-ink/65 text-xs">
                <th className="p-3">Operation</th>
                <th className="p-3">Result</th>
                <th className="p-3">Entity</th>
                <th className="p-3">Records</th>
                <th className="p-3">Started</th>
                <th className="p-3">Duration</th>
                <th className="p-3">Triggered By</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-ink/50">No sync logs yet</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="border-b border-line/50 hover:bg-field/50 last:border-0">
                  <td className="p-3 font-medium">{log.operation.replace(/_/g, " ")}</td>
                  <td className="p-3"><ResultBadge result={log.result} /></td>
                  <td className="p-3 text-ink/65">{log.entityType ?? "—"}</td>
                  <td className="p-3">{log.recordsSucceeded}<span className="text-ink/50">/{log.recordsProcessed}</span></td>
                  <td className="p-3 text-ink/65 whitespace-nowrap">{fmt(log.startedAt)}</td>
                  <td className="p-3 text-ink/65">{log.durationMs ? `${log.durationMs}ms` : "—"}</td>
                  <td className="p-3 text-ink/65">{log.triggeredBy?.fullName ?? "Scheduler"}</td>
                  <td className="p-3">
                    {log.errorMessage && (
                      <button className="text-xs text-red-600 underline" onClick={() => setSelected(log)}>View error</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelected(null)}>
          <div className={`${cardClass} max-w-lg w-full mx-4`} onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 font-semibold">Sync Error</h3>
            <p className="text-xs text-ink/65 mb-2">{selected.operation} — {fmt(selected.startedAt)}</p>
            <pre className="rounded-md bg-red-50 p-3 text-xs text-red-700 overflow-auto max-h-48 whitespace-pre-wrap">{selected.errorMessage}</pre>
            <button className="mt-3 text-sm text-ink/50 underline" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ─── Webhook Events Page ─────────────────────────────────────────────────────

type WebhookEvent = {
  id: string;
  realmId: string;
  entityType: string;
  entityId: string;
  operation: string;
  eventDate: string;
  status: string;
  processedAt: string | null;
  errorMessage: string | null;
  retryCount: number;
  receivedAt: string;
};

export function QuickBooksWebhookEventsPage() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  function load() {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100", ...(statusFilter && { status: statusFilter }) });
    apiFetch<{ data: WebhookEvent[] }>(`/quickbooks/webhook-events?${params}`)
      .then((r) => setEvents(r.data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [statusFilter]);

  return (
    <AppShell>
      <QBNav />
      <div className="mb-4 flex gap-3">
        <select className={`${selectClass} w-40`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {["PENDING","PROCESSING","PROCESSED","FAILED","IGNORED"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className={btnSecondary} onClick={load}><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      {loading ? (
        <p className="text-sm text-ink/50">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-field text-left text-ink/65 text-xs">
                <th className="p-3">Entity</th>
                <th className="p-3">Entity ID</th>
                <th className="p-3">Operation</th>
                <th className="p-3">Status</th>
                <th className="p-3">Event Date</th>
                <th className="p-3">Received</th>
                <th className="p-3">Retries</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-ink/50">No webhook events yet</td></tr>
              ) : events.map((ev) => (
                <tr key={ev.id} className="border-b border-line/50 last:border-0">
                  <td className="p-3 font-medium">{ev.entityType}</td>
                  <td className="p-3 font-mono text-xs text-ink/65">{ev.entityId}</td>
                  <td className="p-3">{ev.operation}</td>
                  <td className="p-3"><SyncBadge status={ev.status} /></td>
                  <td className="p-3 text-ink/65 whitespace-nowrap">{fmt(ev.eventDate)}</td>
                  <td className="p-3 text-ink/65 whitespace-nowrap">{fmt(ev.receivedAt)}</td>
                  <td className="p-3">{ev.retryCount > 0 ? <span className="text-orange-600">{ev.retryCount}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

// ─── Mapping Page ────────────────────────────────────────────────────────────

type QBAccount = { id: string; name: string; type: string; subType: string };
type QBMapping = { id: string; mappingType: string; erpEntityId: string | null; erpEntityName: string; qbEntityId: string; qbEntityName: string };

export function QuickBooksMappingPage() {
  const [qbAccounts, setQbAccounts] = useState<QBAccount[]>([]);
  const [mappings, setMappings] = useState<QBMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ mappingType: "INCOME_ACCOUNT", erpEntityId: "", erpEntityName: "", qbEntityId: "", qbEntityName: "" });
  const [expenseCategories, setExpenseCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch<{ data: QBAccount[] }>("/quickbooks/accounts"),
      apiFetch<{ data: QBMapping[] }>("/quickbooks/mappings"),
      apiFetch<{ data: { id: string; name: string }[] }>("/finance/expense-categories")
    ])
      .then(([accts, maps, cats]) => {
        setQbAccounts(accts.data);
        setMappings(maps.data);
        setExpenseCategories(cats.data);
      })
      .catch(() => setError("Failed to load data — ensure QuickBooks is connected"))
      .finally(() => setLoading(false));
  }, []);

  async function saveMapping(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const selectedAccount = qbAccounts.find((a) => a.id === form.qbEntityId);
      await apiFetch("/quickbooks/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, qbEntityName: selectedAccount?.name ?? form.qbEntityName })
      });
      setMsg("Mapping saved");
      const maps = await apiFetch<{ data: QBMapping[] }>("/quickbooks/mappings");
      setMappings(maps.data);
      setForm({ mappingType: "INCOME_ACCOUNT", erpEntityId: "", erpEntityName: "", qbEntityId: "", qbEntityName: "" });
    } catch {
      setError("Failed to save mapping");
    }
  }

  async function deleteMapping(id: string) {
    if (!confirm("Delete this mapping?")) return;
    await apiFetch(`/quickbooks/mappings/${id}`, { method: "DELETE" });
    setMappings((m) => m.filter((x) => x.id !== id));
  }

  const mappingTypes = ["INCOME_ACCOUNT", "EXPENSE_ACCOUNT", "ASSET_ACCOUNT", "BANK_ACCOUNT", "EXPENSE_CATEGORY"];

  return (
    <AppShell>
      <QBNav />

      {error && <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}
      {msg && <div className="mb-4 flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700"><CheckCircle className="h-4 w-4" />{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={cardClass}>
          <h2 className="mb-4 font-semibold">Add Mapping</h2>
          <form onSubmit={saveMapping} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold">Mapping Type</label>
              <select className={selectClass} value={form.mappingType} onChange={(e) => setForm((f) => ({ ...f, mappingType: e.target.value }))}>
                {mappingTypes.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </div>

            {form.mappingType === "EXPENSE_CATEGORY" ? (
              <div>
                <label className="mb-1 block text-xs font-semibold">Expense Category</label>
                <select className={selectClass} value={form.erpEntityId} onChange={(e) => {
                  const cat = expenseCategories.find((c) => c.id === e.target.value);
                  setForm((f) => ({ ...f, erpEntityId: e.target.value, erpEntityName: cat?.name ?? "" }));
                }}>
                  <option value="">Select category…</option>
                  {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-semibold">ERP Entity Name (optional)</label>
                <input className={inputClass} value={form.erpEntityName} onChange={(e) => setForm((f) => ({ ...f, erpEntityName: e.target.value }))} placeholder="e.g. Default Income Account" />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold">QuickBooks Account</label>
              <select className={selectClass} value={form.qbEntityId} onChange={(e) => setForm((f) => ({ ...f, qbEntityId: e.target.value }))}>
                <option value="">Select QB account…</option>
                {qbAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
              </select>
            </div>

            <button type="submit" className={btnPrimary} disabled={!form.qbEntityId || loading}>Save Mapping</button>
          </form>
        </div>

        <div className={cardClass}>
          <h2 className="mb-4 font-semibold">Current Mappings</h2>
          {loading ? (
            <p className="text-sm text-ink/50">Loading…</p>
          ) : mappings.length === 0 ? (
            <p className="text-sm text-ink/50">No mappings configured yet</p>
          ) : (
            <div className="space-y-2">
              {mappings.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border border-line p-3 text-sm">
                  <div>
                    <span className="font-medium">{m.erpEntityName || "Default"}</span>
                    <span className="mx-2 text-ink/40">→</span>
                    <span className="text-ink/65">{m.qbEntityName}</span>
                    <span className="ml-2 rounded-full bg-field px-2 py-0.5 text-xs text-ink/50">{m.mappingType.replace(/_/g, " ")}</span>
                  </div>
                  <button className="text-red-500 hover:text-red-700 text-xs" onClick={() => deleteMapping(m.id)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
