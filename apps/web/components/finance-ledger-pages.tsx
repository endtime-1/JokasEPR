"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiEnvelope, apiFetch } from "../lib/api";
import { useFinancePageHeader } from "./finance-shell";
import { DataTable } from "./data-table";
import { ConfirmModal } from "./ui";

const money = (v: unknown) => Number(v ?? 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const startOfYear = () => `${new Date().getFullYear()}-01-01`;
const inputCls = "app-control";

function Balanced({ ok, label }: { ok: boolean; label?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{ok ? (label ?? "Balanced") : "Out of balance"}</span>;
}

function useReport<T>(path: string, params: Record<string, string>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true); setError("");
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    apiFetch<ApiEnvelope<T>>(`${path}?${q}`)
      .then((r) => { if (live) setData(r.data); })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, deps);
  return { data, error, loading };
}

const Intro = ({ children }: { children: React.ReactNode }) => <p className="mb-4 rounded-xl bg-brand/5 px-4 py-3 text-sm text-ink/70">{children}</p>;

// ─── Trial balance ──────────────────────────────────────────────────────────

type TB = { rows: { accountId: string; code: string; name: string; type: string; debit: number; credit: number; balanceDebit: number; balanceCredit: number }[]; totalDebit: number; totalCredit: number; balanced: boolean };

export function TrialBalancePage() {
  useFinancePageHeader("Trial Balance", "Every account's balance from the general ledger.");
  const [asOf, setAsOf] = useState(today());
  const { data, error, loading } = useReport<TB>("/finance/ledger/trial-balance", { asOf }, [asOf]);
  return (
    <div className="space-y-4">
      <Intro>This is the starting point of the accounts. Total debits must equal total credits. Click an account to see every entry behind its balance.</Intro>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold">As of<input type="date" className={`${inputCls} mt-1 block`} value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
        {data && <Balanced ok={data.balanced} />}
      </div>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <DataTable
        columns={[
          { key: "code", label: "Code" },
          { key: "name", label: "Account", render: (r) => <Link className="font-medium text-brand hover:underline" href={`/finance/ledger/general-ledger?accountId=${r.accountId}`}>{r.name as string}</Link> },
          { key: "type", label: "Type" },
          { key: "balanceDebit", label: "Debit", render: (r) => (Number(r.balanceDebit) ? money(r.balanceDebit) : "") },
          { key: "balanceCredit", label: "Credit", render: (r) => (Number(r.balanceCredit) ? money(r.balanceCredit) : "") },
        ]}
        rows={(data?.rows ?? []) as unknown as Record<string, unknown>[]}
        loading={loading}
        empty="No ledger entries yet. Open Ledger Setup to post your existing records."
        csvFilename="trial-balance"
      />
      {data && (
        <div className="flex justify-end gap-8 rounded-xl border border-line bg-field px-5 py-3 text-sm font-bold">
          <span>Total debit: {money(data.totalDebit)}</span><span>Total credit: {money(data.totalCredit)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Income statement ───────────────────────────────────────────────────────

type IS = { revenue: { code: string; name: string; amount: number }[]; expenses: { code: string; name: string; amount: number }[]; totalRevenue: number; totalExpenses: number; netProfit: number };

function StatementTable({ title, rows, total, totalLabel }: { title: string; rows: { code: string; name: string; amount: number }[]; total: number; totalLabel: string }) {
  return (
    <section className="app-card overflow-hidden">
      <h3 className="border-b border-line bg-field px-5 py-3 text-sm font-bold uppercase tracking-wide text-ink/70">{title}</h3>
      <table className="w-full text-sm">
        <tbody>
          {rows.length === 0 && <tr><td className="px-5 py-4 text-ink/50">Nothing recorded.</td></tr>}
          {rows.map((r) => (<tr key={r.code} className="border-t border-line/60"><td className="px-5 py-2.5 text-ink/50">{r.code}</td><td className="py-2.5">{r.name}</td><td className="px-5 py-2.5 text-right tabular-nums">{money(r.amount)}</td></tr>))}
          <tr className="border-t border-line bg-field font-bold"><td className="px-5 py-3" colSpan={2}>{totalLabel}</td><td className="px-5 py-3 text-right tabular-nums">{money(total)}</td></tr>
        </tbody>
      </table>
    </section>
  );
}

export function IncomeStatementPage() {
  useFinancePageHeader("Income Statement", "Profit and loss from the ledger, income counted when invoiced.");
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const { data, error } = useReport<IS>("/finance/ledger/income-statement", { from, to }, [from, to]);
  return (
    <div className="space-y-4">
      <Intro>Sales are counted on the day they are invoiced, and costs on the day they are incurred, whether or not the cash has moved yet. Stock bought but not yet used appears here as Purchases, and the period-end stock figure adjusts it.</Intro>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold">From<input type="date" className={`${inputCls} mt-1 block`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs font-semibold">To<input type="date" className={`${inputCls} mt-1 block`} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {data && (
        <>
          <StatementTable title="Revenue" rows={data.revenue} total={data.totalRevenue} totalLabel="Total revenue" />
          <StatementTable title="Expenses" rows={data.expenses} total={data.totalExpenses} totalLabel="Total expenses" />
          <div className={`rounded-2xl border p-5 text-lg font-extrabold ${data.netProfit >= 0 ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
            {data.netProfit >= 0 ? "Net profit" : "Net loss"}: GHS {money(Math.abs(data.netProfit))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Balance sheet ──────────────────────────────────────────────────────────

type BS = { assets: { code: string; name: string; amount: number }[]; liabilities: { code: string; name: string; amount: number }[]; equity: { code: string; name: string; amount: number }[]; currentEarnings: number; totalAssets: number; totalLiabilities: number; totalEquity: number; balanced: boolean };

export function BalanceSheetPage() {
  useFinancePageHeader("Balance Sheet", "What the business owns, owes and is worth.");
  const [asOf, setAsOf] = useState(today());
  const { data, error } = useReport<BS>("/finance/ledger/balance-sheet", { asOf }, [asOf]);
  return (
    <div className="space-y-4">
      <Intro>Assets equal liabilities plus equity. Equity includes this year&apos;s profit so far. Stock on hand is brought in by the period-end stock adjustment.</Intro>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold">As of<input type="date" className={`${inputCls} mt-1 block`} value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
        {data && <Balanced ok={data.balanced} />}
      </div>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <StatementTable title="Assets" rows={data.assets} total={data.totalAssets} totalLabel="Total assets" />
          <div className="space-y-4">
            <StatementTable title="Liabilities" rows={data.liabilities} total={data.totalLiabilities} totalLabel="Total liabilities" />
            <StatementTable title="Equity" rows={[...data.equity, { code: "", name: "Profit this period (not yet closed)", amount: data.currentEarnings }]} total={data.totalEquity} totalLabel="Total equity" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── General ledger (one account) ───────────────────────────────────────────

type GL = { account: { id: string; code: string; name: string; type: string }; openingBalance: number; closingBalance: number; truncated: boolean; rows: { date: string; reference: string; description: string; source: string | null; debit: number; credit: number; balance: number }[] };

export function GeneralLedgerPage() {
  useFinancePageHeader("General Ledger", "Every entry on one account, with a running balance.");
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<GL | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<ApiEnvelope<{ accounts: { id: string; code: string; name: string }[] }>>("/finance/options").then((r) => setAccounts(r.data.accounts ?? [])).catch(() => undefined);
    const fromUrl = new URLSearchParams(window.location.search).get("accountId");
    if (fromUrl) setAccountId(fromUrl);
  }, []);

  useEffect(() => {
    if (!accountId) { setData(null); return; }
    let live = true;
    setError("");
    const q = new URLSearchParams({ accountId, from, to });
    apiFetch<ApiEnvelope<GL>>(`/finance/ledger/account?${q}`).then((r) => { if (live) setData(r.data); }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : "Failed to load"); });
    return () => { live = false; };
  }, [accountId, from, to]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-64 text-xs font-semibold">Account
          <select className={`${inputCls} mt-1 block w-full`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Choose an account…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">From<input type="date" className={`${inputCls} mt-1 block`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs font-semibold">To<input type="date" className={`${inputCls} mt-1 block`} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {data && (
        <>
          <p className="text-sm text-ink/60">Opening balance <b className="text-ink">{money(data.openingBalance)}</b> · Closing balance <b className="text-ink">{money(data.closingBalance)}</b>{data.truncated && " · showing the first 2,000 lines, narrow the dates to see the rest"}</p>
          <DataTable
            columns={[
              { key: "date", label: "Date", render: (r) => new Date(r.date as string).toLocaleDateString("en-GB") },
              { key: "reference", label: "Entry" },
              { key: "description", label: "Description" },
              { key: "source", label: "From", render: (r) => (r.source ? String(r.source).replace(/_/g, " ").toLowerCase() : "manual") },
              { key: "debit", label: "Debit", render: (r) => (Number(r.debit) ? money(r.debit) : "") },
              { key: "credit", label: "Credit", render: (r) => (Number(r.credit) ? money(r.credit) : "") },
              { key: "balance", label: "Balance", render: (r) => money(r.balance) },
            ]}
            rows={data.rows as unknown as Record<string, unknown>[]}
            empty="No entries on this account in that period."
            csvFilename={`ledger-${data.account.code}`}
          />
        </>
      )}
    </div>
  );
}

// ─── Ledger setup: health, closing the books, posting existing records ──────

type Health = { trialBalanceBalanced: boolean; receivables: { ledger: number; subledger: number; difference: number }; payables: { ledger: number; subledger: number; difference: number }; postedBySource: Record<string, number>; standardAccounts: { code: string; expectedName: string; expectedType: string; name: string | null; type: string | null; status: string }[] };
type Backfill = { committed: boolean; total: number; errors: string[]; sources: { source: string; found: number; alreadyPosted: number; toPost: number; posted: number; blocked: number; failed: number }[] };

export function LedgerSetupPage() {
  useFinancePageHeader("Ledger Setup", "Check the books, close a period, and post your existing records.");
  const [health, setHealth] = useState<Health | null>(null);
  const [lockedThrough, setLockedThrough] = useState("");
  const [lockInput, setLockInput] = useState("");
  const [preview, setPreview] = useState<Backfill | null>(null);
  const [result, setResult] = useState<Backfill | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmPost, setConfirmPost] = useState(false);

  const loadAll = useCallback(async () => {
    const [h, s] = await Promise.all([
      apiFetch<ApiEnvelope<Health>>("/finance/ledger/health"),
      apiFetch<ApiEnvelope<{ lockedThrough: string | null }>>("/finance/ledger/settings"),
    ]);
    setHealth(h.data);
    setLockedThrough(s.data.lockedThrough ?? "");
    setLockInput(s.data.lockedThrough ?? "");
  }, []);
  useEffect(() => { loadAll().catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load")); }, [loadAll]);

  async function saveLock(value: string | null) {
    setBusy("lock"); setError(""); setNotice("");
    try {
      await apiFetch("/finance/ledger/settings", { method: "PATCH", body: JSON.stringify({ lockedThrough: value }) });
      setNotice(value ? `Books closed through ${value}. Nothing dated on or before that day can be changed.` : "All periods are open.");
      await loadAll();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(""); }
  }

  async function runBackfill(commit: boolean) {
    setBusy(commit ? "post" : "preview"); setError(""); setNotice("");
    try {
      const r = await apiFetch<ApiEnvelope<Backfill>>("/finance/ledger/backfill", { method: "POST", body: JSON.stringify({ commit }) });
      if (commit) { setResult(r.data); setPreview(null); await loadAll(); } else { setPreview(r.data); setResult(null); }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(""); setConfirmPost(false); }
  }

  const shown = result ?? preview;
  return (
    <div className="space-y-6">
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

      <section className="app-card p-5">
        <h3 className="mb-1 text-base font-bold">Is the ledger healthy?</h3>
        <p className="mb-4 text-xs text-ink/55">The ledger should agree with the invoices customers owe and the bills you owe. A difference usually means some history has not been posted yet.</p>
        {health ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-field p-4"><p className="text-xs font-semibold uppercase text-ink/50">Trial balance</p><div className="mt-2"><Balanced ok={health.trialBalanceBalanced} /></div></div>
            {([["Customers owe us", health.receivables], ["We owe suppliers", health.payables]] as const).map(([label, v]) => (
              <div key={label} className="rounded-xl border border-line bg-field p-4">
                <p className="text-xs font-semibold uppercase text-ink/50">{label}</p>
                <p className="mt-1 text-sm">Ledger <b>{money(v.ledger)}</b> · Documents <b>{money(v.subledger)}</b></p>
                <div className="mt-2"><Balanced ok={v.difference === 0} label="Agrees" /> {v.difference !== 0 && <span className="text-xs text-red-700">difference {money(v.difference)}</span>}</div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-ink/50">Loading…</p>}
        {health && health.standardAccounts.some((a) => a.status === "WRONG_TYPE") && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">Fix these accounts before posting anything.</p>
            <p className="mt-1 text-xs">Automatic postings use fixed account codes. These codes already exist in your chart of accounts as a different kind of account, so entries would land in the wrong place. Change the code of your own account (Chart of Accounts), and the standard one will be created for you.</p>
            <ul className="mt-2 list-disc pl-5">
              {health.standardAccounts.filter((a) => a.status === "WRONG_TYPE").map((a) => <li key={a.code}>{a.code} is &quot;{a.name}&quot; ({a.type?.toLowerCase()}), but must be {a.expectedName} ({a.expectedType.toLowerCase()})</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="app-card p-5">
        <h3 className="mb-1 text-base font-bold">Close the books</h3>
        <p className="mb-4 text-xs text-ink/55">Once a month is reported, close it. Nothing dated on or before the closing date can be added, changed or reversed, so reported figures stay fixed.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold">Closed through<input type="date" className={`${inputCls} mt-1 block`} value={lockInput} max={today()} onChange={(e) => setLockInput(e.target.value)} /></label>
          <button className="app-button-primary" disabled={busy === "lock" || !lockInput} onClick={() => saveLock(lockInput)}>Close through this date</button>
          {lockedThrough && <button className="app-button-secondary" disabled={busy === "lock"} onClick={() => saveLock(null)}>Reopen all periods</button>}
        </div>
        <p className="mt-3 text-sm">{lockedThrough ? <>Currently closed through <b>{lockedThrough}</b>.</> : "No period is closed."}</p>
      </section>

      <section className="app-card p-5">
        <h3 className="mb-1 text-base font-bold">Post existing records into the ledger</h3>
        <p className="mb-4 text-xs text-ink/55">Invoices, payments, supplier bills, expenses, payroll and petty cash recorded before the ledger existed. New records post themselves automatically. This is safe to run more than once: each record is posted a single time. Preview first.</p>
        <div className="flex flex-wrap gap-2">
          <button className="app-button-secondary" disabled={!!busy} onClick={() => runBackfill(false)}>{busy === "preview" ? "Checking…" : "Preview"}</button>
          <button className="app-button-primary" disabled={!!busy || !preview || preview.total === 0} onClick={() => setConfirmPost(true)}>Post {preview?.total ?? 0} entries</button>
        </div>
        {shown && (
          <div className="mt-4 overflow-x-auto">
            <p className="mb-2 text-sm font-semibold">{shown.committed ? `Posted ${shown.total} entries.` : `${shown.total} entries would be posted.`}</p>
            <table className="w-full text-sm">
              <thead className="bg-field text-left text-xs uppercase text-ink/55"><tr><th className="px-3 py-2">Source</th><th className="px-3 py-2">Found</th><th className="px-3 py-2">Already in ledger</th><th className="px-3 py-2">{shown.committed ? "Posted" : "To post"}</th><th className="px-3 py-2">In closed periods</th><th className="px-3 py-2">Failed</th></tr></thead>
              <tbody>
                {shown.sources.map((s) => (
                  <tr key={s.source} className="border-t border-line"><td className="px-3 py-2 font-medium">{s.source.replace(/_/g, " ").toLowerCase()}</td><td className="px-3 py-2">{s.found}</td><td className="px-3 py-2">{s.alreadyPosted}</td><td className="px-3 py-2">{shown.committed ? s.posted : s.toPost}</td><td className="px-3 py-2">{s.blocked}</td><td className="px-3 py-2">{s.failed}</td></tr>
                ))}
              </tbody>
            </table>
            {shown.errors.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-red-700">{shown.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          </div>
        )}
      </section>

      <p className="text-xs text-ink/50">Reports: <Link className="text-brand hover:underline" href="/finance/ledger/trial-balance">Trial balance</Link> · <Link className="text-brand hover:underline" href="/finance/ledger/income-statement">Income statement</Link> · <Link className="text-brand hover:underline" href="/finance/ledger/balance-sheet">Balance sheet</Link> · <Link className="text-brand hover:underline" href="/finance/ledger/general-ledger">General ledger</Link></p>

      <ConfirmModal open={confirmPost} onClose={() => setConfirmPost(false)} onConfirm={() => runBackfill(true)} loading={busy === "post"} title="Post existing records?" message={`This adds ${preview?.total ?? 0} entries to the ledger. Each record is posted once, and you can reverse any entry afterwards.`} confirmLabel="Post them" variant="primary" />
    </div>
  );
}
