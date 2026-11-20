"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { BookOpen, Calculator, ChartBar, Landmark, ListTree, Lock, Receipt, ShoppingCart, Store, Users } from "lucide-react";
import { FinGuard, FinPlaceholder } from "./fin-common";
import { FinJournalDetailPage } from "./fin-journal-pages";
import { FinAccountLedgerPage } from "./fin-report-pages";
import { useFinHeader } from "./fin-shell";

// Thin wrappers so the app/ route files stay one line each.

export function JournalDetailRoute() {
  const params = useParams<{ id: string }>();
  return <FinJournalDetailPage id={params.id} />;
}

export function AccountLedgerRoute() {
  const params = useParams<{ accountId: string }>();
  return (
    <Suspense fallback={null}>
      <LedgerWithQuery accountId={params.accountId} />
    </Suspense>
  );
}

function LedgerWithQuery({ accountId }: { accountId: string }) {
  const sp = useSearchParams();
  return <FinAccountLedgerPage accountId={accountId} initialFrom={sp.get("from") ?? undefined} initialTo={sp.get("to") ?? undefined} />;
}

export const SalesPlaceholder = () => <FinPlaceholder title="Sales" permission="fin.sales.view" icon={Receipt} description="Invoices, quotes, credit notes and customer receipts will live here. They will post to the ledger through the same single posting service." />;
export const PurchasesPlaceholder = () => <FinPlaceholder title="Purchases" permission="fin.purchases.view" icon={ShoppingCart} description="Supplier bills, purchase orders and supplier payments will live here." />;
export const BankingPlaceholder = () => <FinPlaceholder title="Banking" permission="fin.banking.view" icon={Landmark} description="Bank and mobile money accounts, transfers and reconciliation will live here." />;
export const PosPlaceholder = () => <FinPlaceholder title="POS" permission="fin.pos.view" icon={Store} description="Point-of-sale tills, shifts and cash-up will live here." />;
export const PayrollPlaceholder = () => <FinPlaceholder title="Payroll" permission="fin.payroll.view" icon={Users} description="Pay runs, PAYE and SSNIT will live here, with their rates kept in dated settings tables." />;
export const ReportsPlaceholder = () => <FinPlaceholder title="Reports" permission="fin.reports.view" icon={ChartBar} description="Profit and loss, balance sheet and cash flow will live here. The trial balance is already available under Accounting." />;

const CARDS = [
  { href: "/fin/accounting/chart-of-accounts", title: "Chart of Accounts", text: "The accounts every transaction is posted to. Start from the poultry & feed template.", icon: ListTree },
  { href: "/fin/accounting/journals", title: "Journals", text: "Create manual journals and see everything posted to the ledger.", icon: BookOpen },
  { href: "/fin/accounting/trial-balance", title: "Trial Balance", text: "Check that total debits equal total credits, and drill into any account.", icon: Calculator },
  { href: "/fin/accounting/periods", title: "Periods", text: "Close finished periods so their numbers can no longer change.", icon: Lock }
];

export function AccountingHome() {
  useFinHeader("Accounting", "Chart of accounts, journals, periods and the trial balance");
  return (
    <FinGuard permission="fin.accounting.view">
      <div className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="app-card flex gap-4 p-5 transition hover:border-brand/40">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10"><c.icon className="h-5 w-5 text-brand" aria-hidden /></div>
            <div>
              <p className="font-bold text-ink">{c.title}</p>
              <p className="mt-1 text-sm text-ink/60">{c.text}</p>
            </div>
          </Link>
        ))}
      </div>
    </FinGuard>
  );
}
