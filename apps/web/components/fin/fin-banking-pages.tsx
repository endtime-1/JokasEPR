"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, Landmark, Plus, Smartphone, Wallet } from "lucide-react";
import { FormField } from "../form-field";
import { Badge, Modal, Spinner } from "../ui";
import { errMsg, finGet, finSend, today, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { BankingTabs, METHODS, PROVIDER_NAME, PayAccount, PaymentAccountSelect, Pager, TYPE_NAME, control, useLedgerAccounts, usePayAccounts, usePaged } from "./fin-banking-parts";
import { VoidModal } from "./fin-sales-invoice-pages";
import { money } from "./fin-sales-parts";
import { useFinHeader } from "./fin-shell";

const ICON = { CASH: Wallet, BANK: Landmark, MOBILE_MONEY: Smartphone, PROVIDER: Banknote } as const;
const HEADER: [string, string] = ["Banking", "Cash, bank and mobile money accounts, payments, transfers and reconciliation"];

// ─── accounts ────────────────────────────────────────────────────────────────

export function FinBankAccountsPage() {
  useFinHeader(...HEADER);
  const canCreate = useFinPermission("fin.banking.create");
  const [reload, setReload] = useState(0);
  const { accounts, error, loading } = usePayAccounts(reload);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState("");
  const total = accounts.filter((a) => a.isActive && a.type !== "PROVIDER").reduce((s, a) => s + Math.round(Number(a.balance) * 100), 0) / 100;

  async function setActive(a: PayAccount, isActive: boolean) {
    setMsg("");
    try {
      await finSend("PATCH", `/banking/accounts/${a.id}`, { isActive });
      setReload((n) => n + 1);
    } catch (e) {
      setMsg(errMsg(e));
    }
  }

  return (
    <FinGuard permission="fin.banking.view">
      <BankingTabs />
      <div className="space-y-4">
        <ErrorNote message={error || msg} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink/55">Money you hold (cash, bank, mobile money): <b className="tabular-nums text-ink">{money(total)}</b></span>
          <div className="flex-1" />
          {canCreate && <button className="app-button-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden /> Add account</button>}
        </div>
        {loading && accounts.length === 0 && <div className="py-10 text-center"><Spinner /></div>}
        {!loading && accounts.length === 0 && <div className="app-card px-6 py-10 text-center text-ink/55">No payment accounts yet. Add your cash box, bank account and mobile money wallets.</div>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => {
            const Icon = ICON[a.type];
            return (
              <div key={a.id} className={`app-card flex flex-col gap-3 p-5 ${a.isActive ? "" : "opacity-60"}`}>
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10"><Icon className="h-5 w-5 text-brand" aria-hidden /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-ink">{a.name}</p>
                    <p className="text-xs text-ink/55">{TYPE_NAME[a.type]}{a.provider ? ` · ${PROVIDER_NAME[a.provider] ?? a.provider}` : ""}{a.bankName ? ` · ${a.bankName}` : ""}{a.accountNumber ? ` · ${a.accountNumber}` : ""}</p>
                  </div>
                  {!a.isActive && <Badge variant="neutral">Off</Badge>}
                </div>
                <p className="text-2xl font-extrabold tabular-nums">{money(a.balance)}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/55">
                  <Link href={`/fin/accounting/ledger/${a.ledgerAccount.id}`} className="hover:text-brand hover:underline">Ledger {a.ledgerAccount.code} {a.ledgerAccount.name}</Link>
                  <span>{a.reconciledThrough ? `Reconciled to ${a.reconciledThrough}` : "Not reconciled yet"}</span>
                </div>
                {canCreate && (
                  <div className="flex gap-3 border-t border-line pt-2 text-xs font-semibold">
                    <Link href={`/fin/banking/reconcile?account=${a.id}`} className="text-brand hover:underline">Reconcile</Link>
                    {a.isActive ? <button className="text-ink/55 hover:underline" onClick={() => setActive(a, false)}>Switch off</button> : <button className="text-brand hover:underline" onClick={() => setActive(a, true)}>Switch on</button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <AddAccountModal open={adding} onClose={() => setAdding(false)} onDone={() => { setAdding(false); setReload((n) => n + 1); }} />
      </div>
    </FinGuard>
  );
}

function AddAccountModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PayAccount["type"]>("BANK");
  const [provider, setProvider] = useState("MTN_MOMO");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [from, setFrom] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setName(""); setType("BANK"); setBankName(""); setAccountNumber(""); setFrom(""); setError(""); }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await finSend("POST", "/banking/accounts", {
        name: name.trim(), type, createLedgerAccount: true,
        ...(type === "MOBILE_MONEY" ? { provider } : {}),
        ...(type === "BANK" ? { bankName: bankName.trim() || undefined, accountNumber: accountNumber.trim() || undefined } : {}),
        ...(from ? { reconcileFrom: from } : {})
      });
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not add the account."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add a payment account" size="md">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name" required><input className={control} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="GCB current account" required /></FormField>
          <FormField label="Kind" required>
            <select className={control} value={type} onChange={(e) => setType(e.target.value as PayAccount["type"])}>
              {(Object.keys(TYPE_NAME) as PayAccount["type"][]).map((t) => <option key={t} value={t}>{TYPE_NAME[t]}</option>)}
            </select>
          </FormField>
        </div>
        {type === "MOBILE_MONEY" && <FormField label="Network"><select className={control} value={provider} onChange={(e) => setProvider(e.target.value)}>{Object.entries(PROVIDER_NAME).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></FormField>}
        {type === "BANK" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Bank"><input className={control} value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={100} /></FormField>
            <FormField label="Account number"><input className={control} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} maxLength={40} /></FormField>
          </div>
        )}
        {type === "PROVIDER" && <p className="text-sm text-ink/60">Use this for the money Paystack or Hubtel is holding for you before it is paid out. It uses the “Online payments clearing” account.</p>}
        <FormField label="Reconcile from (optional)" hint="The date of your first statement line. Books before this date are treated as the opening balance."><input type="date" className={control} value={from} onChange={(e) => setFrom(e.target.value)} /></FormField>
        <p className="text-xs text-ink/55">A ledger account is created for it automatically. Put its opening balance in with a journal dated before you start.</p>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={busy || name.trim().length < 2}>{busy ? <Spinner size="xs" /> : null} Add account</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── payments out ────────────────────────────────────────────────────────────

type Payment = { id: string; number: string; payeeName: string; paymentDate: string; amount: string; method: string; reference: string | null; notes: string | null; status: "POSTED" | "VOID" };

export function FinBankPaymentsPage() {
  useFinHeader(...HEADER);
  const canPost = useFinPermission("fin.banking.post");
  const canVoid = useFinPermission("fin.banking.void");
  const [account, setAccount] = useState("");
  const { accounts } = usePayAccounts();
  const list = usePaged<Payment>(`/banking/payments${account ? `?paymentAccountId=${account}` : ""}`);
  const [making, setMaking] = useState(false);
  const [voiding, setVoiding] = useState<Payment | null>(null);

  return (
    <FinGuard permission="fin.banking.view">
      <BankingTabs />
      <div className="space-y-4">
        <ErrorNote message={list.error} />
        <div className="flex flex-wrap items-center gap-3">
          <select className="app-control" value={account} onChange={(e) => { list.setPage(() => 1); setAccount(e.target.value); }} aria-label="Account">
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <span className="text-sm text-ink/55">Paid out (excluding void): <b className="tabular-nums text-ink">{money(String(list.meta.totals && (list.meta.totals as { paid?: string }).paid || "0"))}</b></span>
          <div className="flex-1" />
          {canPost && <button className="app-button-primary" onClick={() => setMaking(true)}><Plus className="h-4 w-4" aria-hidden /> Make payment</button>}
        </div>
        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">Number</th><th className="px-4 py-3">Paid to</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Paid by</th><th className="px-4 py-3 text-right">Amount</th><th className="w-20" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.rows.map((p) => (
                <tr key={p.id} className={p.status === "VOID" ? "opacity-55" : ""}>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold">{p.number}{p.status === "VOID" && <Badge variant="neutral" className="ml-2">Void</Badge>}</td>
                  <td className="px-4 py-2.5">{p.payeeName}{p.notes && <span className="block text-xs text-ink/50">{p.notes}</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{p.paymentDate}</td>
                  <td className="px-4 py-2.5">{METHODS.find(([v]) => v === p.method)?.[1]}{p.reference ? ` · ${p.reference}` : ""}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(p.amount)}</td>
                  <td className="px-2">{p.status === "POSTED" && canVoid && <button className="text-xs font-semibold text-red-600 hover:underline" onClick={() => setVoiding(p)}>Void</button>}</td>
                </tr>
              ))}
              {list.loading && list.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center"><Spinner /></td></tr>}
              {!list.loading && list.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink/50">No payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={list.page} pages={list.pages} setPage={list.setPage} />
        <MakePaymentModal open={making} accounts={accounts} onClose={() => setMaking(false)} onDone={() => { setMaking(false); list.refresh(); }} />
        <VoidModal open={voiding !== null} title={`Void payment ${voiding?.number ?? ""}`} text="The payment is reversed in the books and the money goes back into the account." path={`/banking/payments/${voiding?.id}/void`} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); list.refresh(); }} />
      </div>
    </FinGuard>
  );
}

function MakePaymentModal({ open, accounts, onClose, onDone }: { open: boolean; accounts: PayAccount[]; onClose: () => void; onDone: () => void }) {
  const ledger = useLedgerAccounts(["EXPENSE", "ASSET", "LIABILITY", "EQUITY"]);
  const [payee, setPayee] = useState("");
  const [from, setFrom] = useState("");
  const [charge, setCharge] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setPayee(""); setAmount(""); setDate(today()); setReference(""); setNotes(""); setCharge(""); setError(""); }
  }, [open]);
  const fromAccount = accounts.find((a) => a.id === from);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await finSend("POST", "/banking/payments", { payeeName: payee.trim(), paymentDate: date, amount: amount.trim(), method, paidFromPaymentAccountId: from, debitAccountId: charge, reference: reference.trim() || undefined, notes: notes.trim() || undefined });
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not record the payment."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Make a payment" size="lg">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Paid to" required><input className={control} value={payee} onChange={(e) => setPayee(e.target.value)} maxLength={160} placeholder="ECG, a supplier, a person…" required /></FormField>
          <FormField label="Paid from" required><PaymentAccountSelect value={from} onChange={setFrom} accounts={accounts} label="Paid from" /></FormField>
        </div>
        <FormField label="What it is for (charged to)" required>
          <select className={control} value={charge} onChange={(e) => setCharge(e.target.value)} required>
            <option value="">Choose an account…</option>
            {ledger.filter((a) => a.id !== fromAccount?.ledgerAccount.id).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Amount" required><input className={`${control} text-right tabular-nums`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></FormField>
          <FormField label="Date" required><input type="date" className={control} value={date} onChange={(e) => setDate(e.target.value)} required /></FormField>
          <FormField label="Paid by"><select className={control} value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Reference"><input className={control} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} placeholder="Cheque no., MoMo ID…" /></FormField>
          <FormField label="Note"><input className={control} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></FormField>
        </div>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={busy || !from || !charge || !payee.trim() || !amount.trim()}>{busy ? <Spinner size="xs" /> : null} Record payment</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── transfers ───────────────────────────────────────────────────────────────

type Transfer = { id: string; number: string; transferDate: string; amount: string; chargeAmount: string; reference: string | null; fromName: string; toName: string; status: "POSTED" | "VOID" };

export function FinTransfersPage() {
  useFinHeader(...HEADER);
  const canPost = useFinPermission("fin.banking.post");
  const canVoid = useFinPermission("fin.banking.void");
  const { accounts } = usePayAccounts();
  const list = usePaged<Transfer>("/banking/transfers");
  const [making, setMaking] = useState(false);
  const [voiding, setVoiding] = useState<Transfer | null>(null);
  return (
    <FinGuard permission="fin.banking.view">
      <BankingTabs />
      <div className="space-y-4">
        <ErrorNote message={list.error} />
        <div className="flex items-center">
          <p className="text-sm text-ink/55">Moving money between your own accounts. It is not income or expense, apart from any charge.</p>
          <div className="flex-1" />
          {canPost && <button className="app-button-primary" onClick={() => setMaking(true)}><Plus className="h-4 w-4" aria-hidden /> New transfer</button>}
        </div>
        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">Number</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">From</th><th className="px-4 py-3">To</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Charge</th><th className="w-20" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.rows.map((t) => (
                <tr key={t.id} className={t.status === "VOID" ? "opacity-55" : ""}>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold">{t.number}{t.status === "VOID" && <Badge variant="neutral" className="ml-2">Void</Badge>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{t.transferDate}</td>
                  <td className="px-4 py-2.5">{t.fromName}</td>
                  <td className="px-4 py-2.5">{t.toName}{t.reference ? <span className="block text-xs text-ink/50">{t.reference}</span> : null}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(t.amount)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{Number(t.chargeAmount) ? money(t.chargeAmount) : ""}</td>
                  <td className="px-2">{t.status === "POSTED" && canVoid && <button className="text-xs font-semibold text-red-600 hover:underline" onClick={() => setVoiding(t)}>Void</button>}</td>
                </tr>
              ))}
              {list.loading && list.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center"><Spinner /></td></tr>}
              {!list.loading && list.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-ink/50">No transfers yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={list.page} pages={list.pages} setPage={list.setPage} />
        <TransferModal open={making} accounts={accounts} onClose={() => setMaking(false)} onDone={() => { setMaking(false); list.refresh(); }} />
        <VoidModal open={voiding !== null} title={`Void transfer ${voiding?.number ?? ""}`} text="The transfer and its charge are reversed in the books." path={`/banking/transfers/${voiding?.id}/void`} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); list.refresh(); }} />
      </div>
    </FinGuard>
  );
}

function TransferModal({ open, accounts, onClose, onDone }: { open: boolean; accounts: PayAccount[]; onClose: () => void; onDone: () => void }) {
  const expenses = useLedgerAccounts(["EXPENSE"]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [feeAccount, setFeeAccount] = useState("");
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setFrom(""); setTo(""); setAmount(""); setFee(""); setFeeAccount(""); setDate(today()); setReference(""); setError(""); }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await finSend("POST", "/banking/transfers", { transferDate: date, fromPaymentAccountId: from, toPaymentAccountId: to, amount: amount.trim(), ...(fee.trim() ? { chargeAmount: fee.trim() } : {}), ...(feeAccount ? { chargeAccountId: feeAccount } : {}), reference: reference.trim() || undefined });
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not record the transfer."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Transfer between accounts" size="lg">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="From" required><PaymentAccountSelect value={from} onChange={setFrom} accounts={accounts} exclude={to} label="From" /></FormField>
          <FormField label="To" required><PaymentAccountSelect value={to} onChange={setTo} accounts={accounts} exclude={from} label="To" /></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Amount" required><input className={`${control} text-right tabular-nums`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></FormField>
          <FormField label="Charge (optional)" hint="Taken from the source account on top"><input className={`${control} text-right tabular-nums`} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0.00" /></FormField>
          <FormField label="Date" required><input type="date" className={control} value={date} onChange={(e) => setDate(e.target.value)} required /></FormField>
        </div>
        {fee.trim() && (
          <FormField label="Charge goes to"><select className={control} value={feeAccount} onChange={(e) => setFeeAccount(e.target.value)}><option value="">Bank and transfer charges (default)</option>{expenses.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></FormField>
        )}
        <FormField label="Reference"><input className={control} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} /></FormField>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={busy || !from || !to || !amount.trim()}>{busy ? <Spinner size="xs" /> : null} Transfer</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── online payments ─────────────────────────────────────────────────────────

type Online = { id: string; provider: string; reference: string; invoiceId: string; invoiceNumber: string | null; customer: string; amount: string; amountPaid: string | null; fee: string; channel: string | null; status: "PENDING" | "PAID" | "FAILED" | "REVIEW"; failureReason: string | null; receiptId: string | null; createdAt: string; paidAt: string | null };
const ONLINE_VARIANT = { PENDING: "info", PAID: "success", FAILED: "neutral", REVIEW: "danger" } as const;

export function FinOnlinePaymentsPage() {
  useFinHeader(...HEADER);
  const canPost = useFinPermission("fin.banking.post");
  const [status, setStatus] = useState("all");
  const list = usePaged<Online>(`/banking/online?status=${status}`);
  const [config, setConfig] = useState<{ enabled: boolean; provider: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState("");
  useEffect(() => {
    finGet<{ enabled: boolean; provider: string }>("/banking/online/config").then((r) => setConfig(r.data)).catch(() => undefined);
  }, []);
  const totals = (list.meta.totals ?? {}) as { received?: string; fees?: string };

  async function retry(o: Online) {
    setBusyId(o.id);
    setMsg("");
    try {
      const r = await finSend<{ status: string }>("POST", `/banking/online/${o.id}/retry`);
      setMsg(`${o.reference}: ${r.data.status.replace(/_/g, " ").toLowerCase()}.`);
      list.refresh();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusyId("");
    }
  }

  return (
    <FinGuard permission="fin.banking.view">
      <BankingTabs />
      <div className="space-y-4">
        <ErrorNote message={list.error} />
        {config && !config.enabled && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Online payments are switched off. Add your provider key (<code>PAYSTACK_SECRET_KEY</code>) to the server settings and the “Pay now” button appears on invoices.</div>}
        {config?.enabled && <p className="text-sm text-ink/55">Provider: <b className="text-ink">{config.provider}</b>. Set the webhook address in the provider dashboard to <code className="text-xs">…/api/v1/fin/webhooks/{config.provider}</code>.</p>}
        {msg && <p className="text-sm text-ink/70">{msg}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <select className="app-control" value={status} onChange={(e) => { list.setPage(() => 1); setStatus(e.target.value); }} aria-label="Status">
            <option value="all">All</option><option value="PAID">Paid</option><option value="PENDING">Waiting</option><option value="REVIEW">Needs review</option><option value="FAILED">Failed</option>
          </select>
          <span className="text-sm text-ink/55">Received: <b className="tabular-nums text-ink">{money(totals.received ?? "0")}</b> · Provider fees: <b className="tabular-nums text-ink">{money(totals.fees ?? "0")}</b></span>
        </div>
        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">Started</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Fee</th><th className="w-20" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.rows.map((o) => (
                <tr key={o.id}>
                  <td className="whitespace-nowrap px-4 py-2.5">{o.createdAt.slice(0, 16).replace("T", " ")}<span className="block font-mono text-[10px] text-ink/40">{o.reference}</span></td>
                  <td className="px-4 py-2.5 font-mono text-xs">{o.invoiceNumber}</td>
                  <td className="px-4 py-2.5">{o.customer}{o.channel ? <span className="block text-xs text-ink/50">{o.channel.replace(/_/g, " ")}</span> : null}</td>
                  <td className="px-4 py-2.5"><Badge variant={ONLINE_VARIANT[o.status]}>{o.status === "REVIEW" ? "Needs review" : o.status === "PENDING" ? "Waiting" : o.status === "PAID" ? "Paid" : "Failed"}</Badge>{o.failureReason && <span className="mt-1 block max-w-xs text-xs text-ink/55">{o.failureReason}</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(o.amountPaid ?? o.amount)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{Number(o.fee) ? money(o.fee) : ""}</td>
                  <td className="px-2">{canPost && (o.status === "REVIEW" || o.status === "PENDING") && <button className="text-xs font-semibold text-brand hover:underline disabled:opacity-50" disabled={busyId === o.id} onClick={() => retry(o)}>Check again</button>}</td>
                </tr>
              ))}
              {list.loading && list.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center"><Spinner /></td></tr>}
              {!list.loading && list.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-ink/50">No online payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={list.page} pages={list.pages} setPage={list.setPage} />
      </div>
    </FinGuard>
  );
}
