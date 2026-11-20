"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { errMsg, finGet, FinAccount } from "./fin-api";

export const control = "app-control w-full";

export type PayAccount = {
  id: string;
  name: string;
  type: "CASH" | "BANK" | "MOBILE_MONEY" | "PROVIDER";
  provider: string | null;
  bankName: string | null;
  accountNumber: string | null;
  isActive: boolean;
  notes: string | null;
  reconcileFrom: string | null;
  reconciledThrough: string | null;
  balance: string;
  ledgerAccount: { id: string; code: string; name: string };
};

export const TYPE_NAME: Record<PayAccount["type"], string> = { CASH: "Cash", BANK: "Bank", MOBILE_MONEY: "Mobile money", PROVIDER: "Payment provider" };
export const PROVIDER_NAME: Record<string, string> = { MTN_MOMO: "MTN MoMo", TELECEL_CASH: "Telecel Cash", AT_MONEY: "AT Money", OTHER: "Other" };

const TABS = [
  { href: "/fin/banking", label: "Accounts", exact: true },
  { href: "/fin/banking/payments", label: "Payments" },
  { href: "/fin/banking/transfers", label: "Transfers" },
  { href: "/fin/banking/online", label: "Online payments" },
  { href: "/fin/banking/reconcile", label: "Reconcile" }
];

/** The strip of links across the top of every banking screen. */
export function BankingTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1 print:hidden" aria-label="Banking sections">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link key={t.href} href={t.href} className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${active ? "bg-brand text-white" : "text-ink/65 hover:bg-field hover:text-ink"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Payment accounts (with live balances); reload by changing `reload`. */
export function usePayAccounts(reload = 0) {
  const [accounts, setAccounts] = useState<PayAccount[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    finGet<PayAccount[]>("/banking/accounts")
      .then((r) => { setAccounts(r.data); setError(""); })
      .catch((e) => setError(errMsg(e, "Could not load the accounts.")))
      .finally(() => setLoading(false));
  }, [reload]);
  return { accounts, error, loading };
}

/** Postable ledger accounts of the given types (for "charge this to…" drop-downs). */
export function useLedgerAccounts(types: FinAccount["type"][]) {
  const [rows, setRows] = useState<FinAccount[]>([]);
  useEffect(() => {
    finGet<FinAccount[]>("/accounting/accounts")
      .then((r) => setRows(r.data.filter((a) => a.isPostable && a.isActive && types.includes(a.type))))
      .catch(() => setRows([]));
  }, []);
  return rows;
}

export function PaymentAccountSelect({ value, onChange, accounts, exclude, label = "Account" }: { value: string; onChange: (id: string) => void; accounts: PayAccount[]; exclude?: string; label?: string }) {
  return (
    <select className={control} value={value} onChange={(e) => onChange(e.target.value)} required aria-label={label}>
      <option value="">Choose an account…</option>
      {accounts.filter((a) => a.isActive && a.id !== exclude).map((a) => (
        <option key={a.id} value={a.id}>{a.name} ({TYPE_NAME[a.type]}) · {Number(a.balance).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</option>
      ))}
    </select>
  );
}

export function usePaged<T>(path: string, deps: unknown[] = []) {
  const [rows, setRows] = useState<T[]>([]);
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const take = 50;
  useEffect(() => {
    setLoading(true);
    const sep = path.includes("?") ? "&" : "?";
    finGet<T[]>(`${path}${sep}page=${page}&take=${take}`)
      .then((r) => { setRows(r.data); setTotal(r.meta?.total ?? 0); setMeta((r.meta ?? {}) as Record<string, unknown>); setError(""); })
      .catch((e) => setError(errMsg(e, "Could not load the list.")))
      .finally(() => setLoading(false));
  }, [path, page, reload, ...deps]);
  return { rows, meta, total, page, setPage, error, loading, refresh: () => setReload((n) => n + 1), pages: Math.max(1, Math.ceil(total / take)) };
}

export function Pager({ page, pages, setPage }: { page: number; pages: number; setPage: (fn: (p: number) => number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <button className="app-button-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
      <span className="text-ink/60">Page {page} of {pages}</span>
      <button className="app-button-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
    </div>
  );
}

export const METHODS = [["CASH", "Cash"], ["MOBILE_MONEY", "Mobile money"], ["BANK_TRANSFER", "Bank transfer"], ["CHEQUE", "Cheque"], ["CARD", "Card"]] as const;
