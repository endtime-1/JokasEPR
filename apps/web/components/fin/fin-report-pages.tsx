"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Download, Lock, Printer } from "lucide-react";
import { downloadRowsAsCsv } from "../../lib/api";
import { FormField } from "../form-field";
import { Badge, Spinner } from "../ui";
import { ACCOUNT_TYPES, AccountType, TYPE_LABEL, amount, amountOrBlank, errMsg, finGet, finSend, today, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { useFinHeader } from "./fin-shell";

const control = "app-control w-full";

// ─── Periods ─────────────────────────────────────────────────────────────────

type PeriodStatus = { lockedThrough: string | null; history: { id: string; lockedThrough: string | null; reason: string; createdAt: string }[] };

export function FinPeriodsPage() {
  useFinHeader("Periods", "Close a finished period so its numbers can no longer change");
  const canEdit = useFinPermission("fin.accounting.settings");
  const [status, setStatus] = useState<PeriodStatus | null>(null);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    finGet<PeriodStatus>("/accounting/periods").then((r) => setStatus(r.data)).catch((e) => setError(errMsg(e, "Could not load the periods.")));
  }, []);
  useEffect(load, [load]);

  async function save(lockedThrough: string | null) {
    setSaving(true);
    setError("");
    try {
      await finSend("POST", "/accounting/periods/lock", { lockedThrough, reason: reason.trim() });
      setReason("");
      setDate("");
      load();
    } catch (e) {
      setError(errMsg(e, "Could not change the period lock."));
    } finally {
      setSaving(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void save(date);
  }

  return (
    <FinGuard permission="fin.accounting.view">
      <div className="mx-auto max-w-3xl space-y-6">
        <ErrorNote message={error} />
        {!status && !error && <div className="flex justify-center py-16"><Spinner /></div>}
        {status && (
          <>
            <div className="app-card flex items-center gap-4 p-5">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-field"><Lock className="h-5 w-5 text-ink/60" aria-hidden /></div>
              <div>
                <p className="text-sm text-ink/55">Books are closed through</p>
                <p className="text-xl font-bold text-ink">{status.lockedThrough ?? "Nothing is closed yet"}</p>
              </div>
            </div>

            {canEdit && (
              <form onSubmit={submit} className="app-card space-y-4 p-5">
                <h2 className="text-base font-bold text-ink">Close or reopen periods</h2>
                <p className="text-sm text-ink/55">No entry can be posted, edited or reversed with a date on or before the closing date. Every change here is recorded.</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField label="Close the books through" required>
                    <input type="date" className={control} value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
                  </FormField>
                  <div className="sm:col-span-2">
                    <FormField label="Reason" required>
                      <input className={control} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={300} placeholder="e.g. October reviewed and signed off" />
                    </FormField>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="app-button-primary" disabled={saving || !date || reason.trim().length < 3}>{saving ? <Spinner size="xs" /> : null} Close through this date</button>
                  <button type="button" className="app-button-secondary" disabled={saving || reason.trim().length < 3 || !status.lockedThrough} onClick={() => save(null)}>Reopen everything</button>
                </div>
              </form>
            )}

            <div className="app-card overflow-x-auto">
              <h2 className="border-b border-line px-5 py-3 text-sm font-bold text-ink">History</h2>
              <table className="w-full min-w-[520px] text-left text-sm">
                <tbody className="divide-y divide-line">
                  {status.history.map((h) => (
                    <tr key={h.id}>
                      <td className="whitespace-nowrap px-5 py-2.5 text-ink/60">{new Date(h.createdAt).toLocaleString("en-GH")}</td>
                      <td className="px-3 py-2.5 font-medium">{h.lockedThrough ? `Closed through ${h.lockedThrough}` : "Reopened"}</td>
                      <td className="px-3 py-2.5 text-ink/65">{h.reason}</td>
                    </tr>
                  ))}
                  {status.history.length === 0 && <tr><td className="px-5 py-8 text-center text-ink/50">No changes yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </FinGuard>
  );
}

// ─── Trial balance ───────────────────────────────────────────────────────────

type TbRow = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  openingDebit: number;
  openingCredit: number;
  debit: number;
  credit: number;
  closingDebit: number;
  closingCredit: number;
};
type Tb = {
  from: string | null;
  to: string;
  rows: TbRow[];
  totals: Record<"openingDebit" | "openingCredit" | "debit" | "credit" | "closingDebit" | "closingCredit", number>;
  balanced: boolean;
};

export function FinTrialBalancePage() {
  useFinHeader("Trial Balance", "Every account's balance; total debits must equal total credits");
  const canExport = useFinPermission("fin.reports.export");
  const [mode, setMode] = useState<"asof" | "range">("asof");
  const [asOf, setAsOf] = useState(today());
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(today());
  const [includeZero, setIncludeZero] = useState(false);
  const [data, setData] = useState<Tb | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams(mode === "asof" ? { asOf } : { from, to });
    if (includeZero) q.set("includeZero", "true");
    finGet<Tb>(`/accounting/reports/trial-balance?${q.toString()}`)
      .then((r) => {
        setData(r.data);
        setError("");
      })
      .catch((e) => setError(errMsg(e, "Could not load the trial balance.")))
      .finally(() => setLoading(false));
  }, [mode, asOf, from, to, includeZero]);

  const range = mode === "range";
  const ledgerQuery = range ? `?from=${from}&to=${to}` : `?to=${asOf}`;

  function exportCsv() {
    if (!data) return;
    const cols = range
      ? [
          { key: "code", label: "Code" }, { key: "name", label: "Account" }, { key: "openingDebit", label: "Opening debit" }, { key: "openingCredit", label: "Opening credit" },
          { key: "debit", label: "Debit" }, { key: "credit", label: "Credit" }, { key: "closingDebit", label: "Closing debit" }, { key: "closingCredit", label: "Closing credit" }
        ]
      : [{ key: "code", label: "Code" }, { key: "name", label: "Account" }, { key: "closingDebit", label: "Debit" }, { key: "closingCredit", label: "Credit" }];
    downloadRowsAsCsv(`trial-balance-${data.to}.csv`, cols, data.rows as unknown as Record<string, unknown>[]);
  }

  return (
    <FinGuard permission="fin.accounting.view">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <div className="inline-flex overflow-hidden rounded-lg border border-line text-sm">
            <button className={`px-3 py-2 ${mode === "asof" ? "bg-brand text-white" : "bg-surface text-ink"}`} onClick={() => setMode("asof")}>As at a date</button>
            <button className={`px-3 py-2 ${mode === "range" ? "bg-brand text-white" : "bg-surface text-ink"}`} onClick={() => setMode("range")}>Date range</button>
          </div>
          {mode === "asof" ? (
            <label className="grid gap-1 text-xs text-ink/55">As at<input type="date" className="app-control" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} /></label>
          ) : (
            <>
              <label className="grid gap-1 text-xs text-ink/55">From<input type="date" className="app-control" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
              <label className="grid gap-1 text-xs text-ink/55">To<input type="date" className="app-control" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
            </>
          )}
          <label className="flex items-center gap-2 pb-2 text-sm text-ink"><input type="checkbox" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} /> Show empty accounts</label>
          <div className="flex-1" />
          {canExport && <button className="app-button-secondary" onClick={exportCsv} disabled={!data}><Download className="h-4 w-4" aria-hidden /> CSV</button>}
          <button className="app-button-secondary" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> Print</button>
        </div>
        <ErrorNote message={error} />

        {loading && !data && <div className="flex justify-center py-16"><Spinner /></div>}
        {data && (
          <div className="app-card overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <p className="text-sm font-bold text-ink">{range ? `${data.from ?? "Start"} to ${data.to}` : `As at ${data.to}`}</p>
              {data.balanced ? (
                <Badge variant="success"><CircleCheck className="mr-1 inline h-3.5 w-3.5" aria-hidden />Balanced</Badge>
              ) : (
                <Badge variant="danger"><CircleAlert className="mr-1 inline h-3.5 w-3.5" aria-hidden />Out of balance</Badge>
              )}
            </div>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Account</th>
                  {range && <><th className="px-3 py-3 text-right">Opening Dr</th><th className="px-3 py-3 text-right">Opening Cr</th><th className="px-3 py-3 text-right">Debit</th><th className="px-3 py-3 text-right">Credit</th></>}
                  <th className="px-3 py-3 text-right">{range ? "Closing Dr" : "Debit"}</th>
                  <th className="px-3 py-3 text-right">{range ? "Closing Cr" : "Credit"}</th>
                </tr>
              </thead>
              <tbody>
                {ACCOUNT_TYPES.map((t) => {
                  const rows = data.rows.filter((r) => r.type === t);
                  if (rows.length === 0) return null;
                  return (
                    <FragmentGroup key={t} label={TYPE_LABEL[t]} cols={range ? 8 : 4}>
                      {rows.map((r) => (
                        <tr key={r.accountId} className="border-t border-line/60">
                          <td className="px-4 py-2 font-mono text-xs text-ink/55">{r.code}</td>
                          <td className="px-4 py-2"><Link className="hover:text-brand hover:underline" href={`/fin/accounting/ledger/${r.accountId}${ledgerQuery}`}>{r.name}</Link></td>
                          {range && <><td className="px-3 py-2 text-right tabular-nums">{amountOrBlank(r.openingDebit)}</td><td className="px-3 py-2 text-right tabular-nums">{amountOrBlank(r.openingCredit)}</td><td className="px-3 py-2 text-right tabular-nums">{amountOrBlank(r.debit)}</td><td className="px-3 py-2 text-right tabular-nums">{amountOrBlank(r.credit)}</td></>}
                          <td className="px-3 py-2 text-right tabular-nums">{amountOrBlank(r.closingDebit)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{amountOrBlank(r.closingCredit)}</td>
                        </tr>
                      ))}
                    </FragmentGroup>
                  );
                })}
                {data.rows.length === 0 && <tr><td colSpan={range ? 8 : 4} className="px-4 py-10 text-center text-ink/50">Nothing has been posted in this period.</td></tr>}
              </tbody>
              <tfoot className="border-t-2 border-line bg-field/50 font-bold">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>Total</td>
                  {range && <><td className="px-3 py-3 text-right tabular-nums">{amount(data.totals.openingDebit)}</td><td className="px-3 py-3 text-right tabular-nums">{amount(data.totals.openingCredit)}</td><td className="px-3 py-3 text-right tabular-nums">{amount(data.totals.debit)}</td><td className="px-3 py-3 text-right tabular-nums">{amount(data.totals.credit)}</td></>}
                  <td className="px-3 py-3 text-right tabular-nums">{amount(data.totals.closingDebit)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{amount(data.totals.closingCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </FinGuard>
  );
}

function FragmentGroup({ label, cols, children }: { label: string; cols: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-field/40">
        <td colSpan={cols} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-ink/55">{label}</td>
      </tr>
      {children}
    </>
  );
}

// ─── Account ledger ──────────────────────────────────────────────────────────

type LedgerData = {
  account: { id: string; code: string; name: string; type: AccountType };
  from: string | null;
  to: string | null;
  openingBalance: number;
  closingBalance: number;
  rows: { entryId: string; reference: string; date: string; description: string; entryStatus: string; debit: number; credit: number; balance: number }[];
};

export function FinAccountLedgerPage({ accountId, initialFrom, initialTo }: { accountId: string; initialFrom?: string; initialTo?: string }) {
  const [from, setFrom] = useState(initialFrom ?? "");
  const [to, setTo] = useState(initialTo ?? "");
  const [data, setData] = useState<LedgerData | null>(null);
  const [error, setError] = useState("");
  useFinHeader(data ? `${data.account.code} ${data.account.name}` : "Account ledger", "Every posted line with a running balance (debit positive)");

  useEffect(() => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    finGet<LedgerData>(`/accounting/reports/account-ledger/${accountId}?${q.toString()}`)
      .then((r) => {
        setData(r.data);
        setError("");
      })
      .catch((e) => setError(errMsg(e, "Could not load the ledger.")));
  }, [accountId, from, to]);

  return (
    <FinGuard permission="fin.accounting.view">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <label className="grid gap-1 text-xs text-ink/55">From<input type="date" className="app-control" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="grid gap-1 text-xs text-ink/55">To<input type="date" className="app-control" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <div className="flex-1" />
          <Link href="/fin/accounting/trial-balance" className="text-sm text-ink/60 hover:underline">Back to trial balance</Link>
        </div>
        <ErrorNote message={error} />
        {!data && !error && <div className="flex justify-center py-16"><Spinner /></div>}
        {data && (
          <div className="app-card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-3 py-3 text-right">Debit</th>
                  <th className="px-3 py-3 text-right">Credit</th>
                  <th className="px-3 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {from && (
                  <tr className="bg-field/40"><td className="px-4 py-2" colSpan={5}>Opening balance</td><td className="px-3 py-2 text-right tabular-nums font-semibold">{amount(data.openingBalance)}</td></tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={`${r.entryId}-${i}`}>
                    <td className="whitespace-nowrap px-4 py-2">{r.date}</td>
                    <td className="px-4 py-2 font-mono text-xs"><Link className="text-brand hover:underline" href={`/fin/accounting/journals/${r.entryId}`}>{r.reference}</Link></td>
                    <td className="px-4 py-2">{r.description}{r.entryStatus === "REVERSED" && <span className="ml-2 text-xs text-ink/45">(reversed)</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{amountOrBlank(r.debit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{amountOrBlank(r.credit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{amount(r.balance)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink/50">No postings in this period.</td></tr>}
              </tbody>
              <tfoot className="border-t-2 border-line bg-field/50 font-bold">
                <tr><td className="px-4 py-3" colSpan={5}>Closing balance</td><td className="px-3 py-3 text-right tabular-nums">{amount(data.closingBalance)}</td></tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </FinGuard>
  );
}
