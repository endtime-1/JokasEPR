"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, BadgeDollarSign, BookOpen, Building2, CheckCircle, DollarSign, FileBarChart, FileText, PiggyBank, Users, Wallet, XCircle } from "lucide-react";
import { AppShell } from "./app-shell";
import { DataTable } from "./data-table";
import { FormField } from "./form-field";
import { ApiEnvelope, apiFetch } from "../lib/api";

// ─── Shared Types ────────────────────────────────────────────────────────────

type Option = { id: string; name?: string; code?: string; accountName?: string; bankName?: string; accountType?: string };

type FinanceOptions = {
  branches: Option[];
  bankAccounts: Option[];
  expenseCategories: Option[];
  accounts: Option[];
};

const inputClass = "min-h-11 rounded-md border border-line px-3 text-sm";
const selectClass = "min-h-11 rounded-md border border-line px-3 text-sm bg-white";
const btnPrimary = "inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50";
const btnSecondary = "inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-field";

function useFinanceOptions() {
  const [options, setOptions] = useState<FinanceOptions>({ branches: [], bankAccounts: [], expenseCategories: [], accounts: [] });
  useEffect(() => {
    apiFetch<ApiEnvelope<FinanceOptions>>("/finance/options")
      .then((r) => setOptions(r.data))
      .catch(() => undefined);
  }, []);
  return options;
}

function money(v: unknown) {
  return `GHS ${Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(v: unknown) {
  return `${Number(v ?? 0).toFixed(1)}%`;
}

function fmt(d: unknown) {
  if (!d) return "—";
  return new Date(d as string).toLocaleDateString("en-GB");
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    PENDING_APPROVAL: "bg-orange-100 text-orange-800",
    APPROVED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    CANCELLED: "bg-gray-100 text-gray-600",
    DRAFT: "bg-blue-100 text-blue-800",
    POSTED: "bg-green-100 text-green-800",
    REVERSED: "bg-purple-100 text-purple-800",
    PAID: "bg-emerald-100 text-emerald-800",
    FUNDING: "bg-green-100 text-green-800",
    DISBURSEMENT: "bg-red-100 text-red-800",
    REPLENISHMENT: "bg-blue-100 text-blue-800"
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-600"}`}>{status.replace(/_/g, " ")}</span>;
}

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: string; icon: React.ElementType; sub?: string }) {
  return (
    <article className="rounded-md border border-line bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink/65">{label}</p>
        <Icon className="h-5 w-5 text-brand/60" aria-hidden />
      </div>
      <strong className="mt-3 block text-2xl font-semibold">{value}</strong>
      {sub && <p className="mt-1 text-xs text-ink/50">{sub}</p>}
    </article>
  );
}

function FinanceNav() {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {[
        ["/finance", "Dashboard"],
        ["/finance/expenses", "Expenses"],
        ["/finance/revenue", "Revenue"],
        ["/finance/customer-payments", "Customer Payments"],
        ["/finance/supplier-payments", "Supplier Payments"],
        ["/finance/petty-cash", "Petty Cash"],
        ["/finance/payroll", "Payroll"],
        ["/finance/bank-accounts", "Bank Accounts"],
        ["/finance/journal-entries", "Journal Entries"],
        ["/finance/reports/profit-loss", "P&L Report"],
        ["/finance/reports/cash-flow", "Cash Flow"],
        ["/finance/reports/product-profitability", "Product P&L"],
        ["/finance/reports/batch-profitability", "Batch P&L"]
      ].map(([href, label]) => (
        <Link key={href} href={href} className={btnSecondary}>{label}</Link>
      ))}
    </div>
  );
}

// ─── Finance Dashboard ────────────────────────────────────────────────────────

export function FinanceDashboardPage() {
  const [dash, setDash] = useState<Record<string, unknown> | null>(null);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>>>(`/finance/dashboard?startDate=${startDate}&endDate=${endDate}`)
      .then((r) => setDash(r.data))
      .catch(() => undefined);
  }, [startDate, endDate]);

  const bankAccounts = (dash?.bankAccounts as Array<Record<string, unknown>>) ?? [];
  const recentExpenses = (dash?.recentExpenses as Array<Record<string, unknown>>) ?? [];
  const recentRevenue = (dash?.recentRevenue as Array<Record<string, unknown>>) ?? [];

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Finance Dashboard</h2>
          <p className="text-sm text-ink/65">Financial performance, expenses, revenue, payroll, and cash position.</p>
        </div>
        <div className="flex gap-2">
          <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <FinanceNav />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Revenue" value={money(dash?.totalRevenue)} icon={ArrowUpCircle} />
        <StatCard label="Total Expenses" value={money(dash?.totalExpenses)} icon={ArrowDownCircle} />
        <StatCard label="Net Profit" value={money(dash?.netProfit)} icon={DollarSign} sub={Number(dash?.totalRevenue ?? 0) > 0 ? pct((Number(dash?.netProfit ?? 0) / Number(dash?.totalRevenue ?? 1)) * 100) + " margin" : undefined} />
        <StatCard label="Pending Approvals" value={String(dash?.pendingApprovals ?? 0)} icon={AlertCircle} sub="Large expenses awaiting approval" />
      </section>
      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <StatCard label="Customer Payments Received" value={money(dash?.totalCustomerPayments)} icon={Users} />
        <StatCard label="Supplier Payments Made" value={money(dash?.totalSupplierPayments)} icon={Building2} />
      </section>

      {bankAccounts.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-3 text-lg font-semibold">Bank Accounts</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {bankAccounts.map((a) => (
              <div key={a.id as string} className="rounded-md border border-line bg-white p-4">
                <p className="text-sm font-medium">{a.accountName as string}</p>
                <p className="text-xs text-ink/60">{a.bankName as string}</p>
                <strong className="mt-2 block text-xl font-semibold text-brand">{money(a.currentBalance)}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Recent Expenses</h3>
            <Link href="/finance/expenses" className="text-sm text-brand hover:underline">View all</Link>
          </div>
          <DataTable
            columns={[{ key: "reference", label: "Ref" }, { key: "description", label: "Description" }, { key: "amount", label: "Amount", render: (r) => money(r.amount) }, { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> }]}
            rows={recentExpenses}
            empty="No expenses recorded."
          />
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Recent Revenue</h3>
            <Link href="/finance/revenue" className="text-sm text-brand hover:underline">View all</Link>
          </div>
          <DataTable
            columns={[{ key: "reference", label: "Ref" }, { key: "description", label: "Description" }, { key: "amount", label: "Amount", render: (r) => money(r.amount) }, { key: "source", label: "Source" }]}
            rows={recentRevenue}
            empty="No revenue recorded."
          />
        </section>
      </div>
    </AppShell>
  );
}

// ─── Expense List ─────────────────────────────────────────────────────────────

export function ExpenseListPage() {
  const [expenses, setExpenses] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  function load() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>(`/finance/expenses?${params}`)
      .then((r) => setExpenses(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, [status, startDate, endDate]);

  async function handleApprove(id: string) {
    await apiFetch(`/finance/expenses/${id}/approve`, { method: "PATCH", body: JSON.stringify({}) });
    load();
  }

  async function handleReject(id: string) {
    const reason = prompt("Rejection reason:");
    if (!reason) return;
    await apiFetch(`/finance/expenses/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) });
    load();
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Expenses</h2>
          <p className="text-sm text-ink/65">All business expenses and approval queue.</p>
        </div>
        <Link href="/finance/expenses/create" className={btnPrimary}><BadgeDollarSign className="h-4 w-4" /> Record Expense</Link>
      </div>
      <FinanceNav />
      <div className="mb-4 flex flex-wrap gap-3">
        <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {["PENDING", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="From" />
        <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="To" />
      </div>
      <DataTable
        columns={[
          { key: "reference", label: "Reference" },
          { key: "expenseDate", label: "Date", render: (r) => fmt(r.expenseDate) },
          { key: "description", label: "Description" },
          { key: "category", label: "Category", render: (r) => (r.category as Record<string, unknown>)?.name as string },
          { key: "vendorName", label: "Vendor" },
          { key: "amount", label: "Amount", render: (r) => money(r.amount) },
          { key: "paymentMethod", label: "Method" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
          {
            key: "actions", label: "", render: (r) =>
              r.status === "PENDING_APPROVAL" ? (
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(r.id as string)} className="text-xs text-green-700 hover:underline">Approve</button>
                  <button onClick={() => handleReject(r.id as string)} className="text-xs text-red-600 hover:underline">Reject</button>
                </div>
              ) : null
          }
        ]}
        rows={expenses}
        empty="No expenses found."
      />
    </AppShell>
  );
}

// ─── Create Expense ───────────────────────────────────────────────────────────

export function CreateExpensePage() {
  const options = useFinanceOptions();
  const [form, setForm] = useState({ categoryId: "", description: "", amount: "", expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: "CASH", vendorName: "", receiptRef: "", branchId: "", bankAccountId: "", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!form.categoryId || !form.amount || !form.description) { setError("Category, amount and description are required."); return; }
    setLoading(true);
    try {
      const res = await apiFetch<ApiEnvelope<Record<string, unknown>>>("/finance/expenses", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      const ref = res.data.reference as string;
      const status = res.data.status as string;
      setSuccess(`Expense ${ref} recorded. Status: ${status.replace(/_/g, " ")}. ${status === "PENDING_APPROVAL" ? "Large expense — awaiting manager approval." : ""}`);
      setForm((f) => ({ ...f, description: "", amount: "", vendorName: "", receiptRef: "", notes: "" }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create expense");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold">Record Expense</h2>
        <p className="text-sm text-ink/65">Expenses above GHS 5,000 require manager approval.</p>
      </div>
      <FinanceNav />
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-4 rounded-md border border-line bg-white p-6 shadow-panel">
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {success && <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Category *">
            <select className={selectClass} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} required>
              <option value="">Select category</option>
              {options.expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Expense Date *">
            <input type="date" className={inputClass} value={form.expenseDate} onChange={(e) => set("expenseDate", e.target.value)} required />
          </FormField>
        </div>
        <FormField label="Description *">
          <input className={inputClass} value={form.description} onChange={(e) => set("description", e.target.value)} required maxLength={240} />
        </FormField>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Amount (GHS) *">
            <input type="number" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} min="0.01" step="0.01" required />
          </FormField>
          <FormField label="Payment Method *">
            <select className={selectClass} value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
              {["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "CREDIT_NOTE"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
            </select>
          </FormField>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Vendor Name">
            <input className={inputClass} value={form.vendorName} onChange={(e) => set("vendorName", e.target.value)} maxLength={160} />
          </FormField>
          <FormField label="Receipt Reference">
            <input className={inputClass} value={form.receiptRef} onChange={(e) => set("receiptRef", e.target.value)} maxLength={120} />
          </FormField>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Branch">
            <select className={selectClass} value={form.branchId} onChange={(e) => set("branchId", e.target.value)}>
              <option value="">All Branches</option>
              {options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </FormField>
          <FormField label="Bank Account">
            <select className={selectClass} value={form.bankAccountId} onChange={(e) => set("bankAccountId", e.target.value)}>
              <option value="">Not applicable</option>
              {options.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.accountName} — {b.bankName}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Notes">
          <textarea className={inputClass + " min-h-20"} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
        </FormField>
        {Number(form.amount) >= 5000 && (
          <p className="flex items-center gap-2 rounded-md bg-orange-50 p-3 text-sm text-orange-700">
            <AlertCircle className="h-4 w-4" /> This expense exceeds GHS 5,000 and will require manager approval.
          </p>
        )}
        <button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Record Expense"}</button>
      </form>
    </AppShell>
  );
}

// ─── Revenue Page ─────────────────────────────────────────────────────────────

export function RevenuePage() {
  const options = useFinanceOptions();
  const [revenues, setRevenues] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ source: "PRODUCT_SALES", description: "", amount: "", revenueDate: new Date().toISOString().slice(0, 10), paymentMethod: "CASH", customerName: "", invoiceRef: "", branchId: "", bankAccountId: "", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/revenue")
      .then((r) => setRevenues(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/revenue", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record revenue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Revenue Records</h2>
          <p className="text-sm text-ink/65">Track all income and revenue sources.</p>
        </div>
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><ArrowUpCircle className="h-4 w-4" /> {showForm ? "Cancel" : "Record Revenue"}</button>
      </div>
      <FinanceNav />
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">New Revenue Entry</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Source *">
              <select className={selectClass} value={form.source} onChange={(e) => set("source", e.target.value)}>
                {["PRODUCT_SALES", "SERVICE_FEES", "RENTAL_INCOME", "INVESTMENT_INCOME", "OTHER"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </FormField>
            <FormField label="Date *">
              <input type="date" className={inputClass} value={form.revenueDate} onChange={(e) => set("revenueDate", e.target.value)} required />
            </FormField>
            <FormField label="Amount (GHS) *">
              <input type="number" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} min="0.01" step="0.01" required />
            </FormField>
          </div>
          <FormField label="Description *"><input className={inputClass} value={form.description} onChange={(e) => set("description", e.target.value)} required /></FormField>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Payment Method">
              <select className={selectClass} value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
                {["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
              </select>
            </FormField>
            <FormField label="Customer Name"><input className={inputClass} value={form.customerName} onChange={(e) => set("customerName", e.target.value)} /></FormField>
            <FormField label="Invoice Reference"><input className={inputClass} value={form.invoiceRef} onChange={(e) => set("invoiceRef", e.target.value)} /></FormField>
            <FormField label="Bank Account">
              <select className={selectClass} value={form.bankAccountId} onChange={(e) => set("bankAccountId", e.target.value)}>
                <option value="">None</option>
                {options.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.accountName}</option>)}
              </select>
            </FormField>
          </div>
          <div className="mt-4">
            <button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Record Revenue"}</button>
          </div>
        </form>
      )}
      <DataTable
        columns={[
          { key: "reference", label: "Reference" },
          { key: "revenueDate", label: "Date", render: (r) => fmt(r.revenueDate) },
          { key: "source", label: "Source", render: (r) => String(r.source).replace(/_/g, " ") },
          { key: "description", label: "Description" },
          { key: "customerName", label: "Customer" },
          { key: "amount", label: "Amount", render: (r) => money(r.amount) },
          { key: "paymentMethod", label: "Method", render: (r) => String(r.paymentMethod ?? "").replace(/_/g, " ") }
        ]}
        rows={revenues}
        empty="No revenue records found."
      />
    </AppShell>
  );
}

// ─── Customer Payments ────────────────────────────────────────────────────────

export function CustomerPaymentsPage() {
  const options = useFinanceOptions();
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerName: "", amount: "", paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: "CASH", description: "", invoiceRef: "", bankAccountId: "", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/customer-payments")
      .then((r) => setPayments(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/customer-payments", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h2 className="text-2xl font-semibold">Customer Payments</h2><p className="text-sm text-ink/65">Payments received from customers.</p></div>
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><Users className="h-4 w-4" /> {showForm ? "Cancel" : "Record Payment"}</button>
      </div>
      <FinanceNav />
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">New Customer Payment</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Customer Name *"><input className={inputClass} value={form.customerName} onChange={(e) => set("customerName", e.target.value)} required /></FormField>
            <FormField label="Amount (GHS) *"><input type="number" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} min="0.01" step="0.01" required /></FormField>
            <FormField label="Payment Date *"><input type="date" className={inputClass} value={form.paymentDate} onChange={(e) => set("paymentDate", e.target.value)} required /></FormField>
            <FormField label="Payment Method"><select className={selectClass} value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>{["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}</select></FormField>
            <FormField label="Invoice Reference"><input className={inputClass} value={form.invoiceRef} onChange={(e) => set("invoiceRef", e.target.value)} /></FormField>
            <FormField label="Bank Account"><select className={selectClass} value={form.bankAccountId} onChange={(e) => set("bankAccountId", e.target.value)}><option value="">None</option>{options.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.accountName}</option>)}</select></FormField>
          </div>
          <div className="mt-4"><FormField label="Description *"><input className={inputClass} value={form.description} onChange={(e) => set("description", e.target.value)} required /></FormField></div>
          <div className="mt-4"><button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Record Payment"}</button></div>
        </form>
      )}
      <DataTable
        columns={[
          { key: "reference", label: "Reference" },
          { key: "paymentDate", label: "Date", render: (r) => fmt(r.paymentDate) },
          { key: "customerName", label: "Customer" },
          { key: "description", label: "Description" },
          { key: "invoiceRef", label: "Invoice Ref" },
          { key: "amount", label: "Amount", render: (r) => money(r.amount) },
          { key: "paymentMethod", label: "Method", render: (r) => String(r.paymentMethod ?? "").replace(/_/g, " ") }
        ]}
        rows={payments}
        empty="No customer payments recorded."
      />
    </AppShell>
  );
}

// ─── Supplier Payments ────────────────────────────────────────────────────────

export function SupplierPaymentsPage() {
  const options = useFinanceOptions();
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ supplierName: "", amount: "", paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: "BANK_TRANSFER", description: "", purchaseOrderRef: "", bankAccountId: "", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/supplier-payments")
      .then((r) => setPayments(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/supplier-payments", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h2 className="text-2xl font-semibold">Supplier Payments</h2><p className="text-sm text-ink/65">Payments made to suppliers and vendors.</p></div>
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><Building2 className="h-4 w-4" /> {showForm ? "Cancel" : "Record Payment"}</button>
      </div>
      <FinanceNav />
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">New Supplier Payment</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Supplier Name *"><input className={inputClass} value={form.supplierName} onChange={(e) => set("supplierName", e.target.value)} required /></FormField>
            <FormField label="Amount (GHS) *"><input type="number" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} min="0.01" step="0.01" required /></FormField>
            <FormField label="Payment Date *"><input type="date" className={inputClass} value={form.paymentDate} onChange={(e) => set("paymentDate", e.target.value)} required /></FormField>
            <FormField label="Payment Method"><select className={selectClass} value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>{["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}</select></FormField>
            <FormField label="Purchase Order Ref"><input className={inputClass} value={form.purchaseOrderRef} onChange={(e) => set("purchaseOrderRef", e.target.value)} /></FormField>
            <FormField label="Bank Account"><select className={selectClass} value={form.bankAccountId} onChange={(e) => set("bankAccountId", e.target.value)}><option value="">None</option>{options.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.accountName}</option>)}</select></FormField>
          </div>
          <div className="mt-4"><FormField label="Description *"><input className={inputClass} value={form.description} onChange={(e) => set("description", e.target.value)} required /></FormField></div>
          <div className="mt-4"><button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Record Payment"}</button></div>
        </form>
      )}
      <DataTable
        columns={[
          { key: "reference", label: "Reference" },
          { key: "paymentDate", label: "Date", render: (r) => fmt(r.paymentDate) },
          { key: "supplierName", label: "Supplier" },
          { key: "description", label: "Description" },
          { key: "purchaseOrderRef", label: "PO Ref" },
          { key: "amount", label: "Amount", render: (r) => money(r.amount) },
          { key: "paymentMethod", label: "Method", render: (r) => String(r.paymentMethod ?? "").replace(/_/g, " ") }
        ]}
        rows={payments}
        empty="No supplier payments recorded."
      />
    </AppShell>
  );
}

// ─── Petty Cash ───────────────────────────────────────────────────────────────

export function PettyCashPage() {
  const options = useFinanceOptions();
  const [transactions, setTransactions] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "DISBURSEMENT", amount: "", description: "", transactionDate: new Date().toISOString().slice(0, 10), categoryId: "", branchId: "", receiptRef: "", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/petty-cash")
      .then((r) => setTransactions(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/petty-cash", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  const currentBalance = transactions.length > 0 ? Number(transactions[0].balance ?? 0) : 0;

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Petty Cash</h2>
          <p className="text-sm text-ink/65">Current balance: <strong className="text-brand">{money(currentBalance)}</strong></p>
        </div>
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><PiggyBank className="h-4 w-4" /> {showForm ? "Cancel" : "New Transaction"}</button>
      </div>
      <FinanceNav />
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">New Petty Cash Transaction</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Type *">
              <select className={selectClass} value={form.type} onChange={(e) => set("type", e.target.value)}>
                <option value="FUNDING">Funding (add cash)</option>
                <option value="DISBURSEMENT">Disbursement (pay out)</option>
                <option value="REPLENISHMENT">Replenishment</option>
              </select>
            </FormField>
            <FormField label="Amount (GHS) *"><input type="number" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} min="0.01" step="0.01" required /></FormField>
            <FormField label="Date *"><input type="date" className={inputClass} value={form.transactionDate} onChange={(e) => set("transactionDate", e.target.value)} required /></FormField>
            <FormField label="Category">
              <select className={selectClass} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">None</option>
                {options.expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Branch">
              <select className={selectClass} value={form.branchId} onChange={(e) => set("branchId", e.target.value)}>
                <option value="">All Branches</option>
                {options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </FormField>
            <FormField label="Receipt Ref"><input className={inputClass} value={form.receiptRef} onChange={(e) => set("receiptRef", e.target.value)} /></FormField>
          </div>
          <div className="mt-4"><FormField label="Description *"><input className={inputClass} value={form.description} onChange={(e) => set("description", e.target.value)} required /></FormField></div>
          <div className="mt-4"><button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Save Transaction"}</button></div>
        </form>
      )}
      <DataTable
        columns={[
          { key: "reference", label: "Reference" },
          { key: "transactionDate", label: "Date", render: (r) => fmt(r.transactionDate) },
          { key: "type", label: "Type", render: (r) => <StatusBadge status={r.type as string} /> },
          { key: "description", label: "Description" },
          { key: "category", label: "Category", render: (r) => (r.category as Record<string, unknown>)?.name as string },
          { key: "amount", label: "Amount", render: (r) => money(r.amount) },
          { key: "balance", label: "Balance", render: (r) => money(r.balance) }
        ]}
        rows={transactions}
        empty="No petty cash transactions."
      />
    </AppShell>
  );
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

export function PayrollPage() {
  const options = useFinanceOptions();
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ period: new Date().toISOString().slice(0, 7), periodStart: "", periodEnd: "", employeeName: "", employeeCode: "", basicSalary: "", allowances: "0", deductions: "0", taxDeduction: "0", ssnit: "0", branchId: "", bankAccountId: "", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/payroll")
      .then((r) => setRecords(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  const grossPay = (Number(form.basicSalary) || 0) + (Number(form.allowances) || 0) - (Number(form.deductions) || 0);
  const netPay = grossPay - (Number(form.taxDeduction) || 0) - (Number(form.ssnit) || 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/payroll", { method: "POST", body: JSON.stringify({ ...form, basicSalary: Number(form.basicSalary), allowances: Number(form.allowances), deductions: Number(form.deductions), taxDeduction: Number(form.taxDeduction), ssnit: Number(form.ssnit) }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: string) {
    await apiFetch(`/finance/payroll/${id}/approve`, { method: "PATCH", body: JSON.stringify({}) });
    load();
  }

  async function handleMarkPaid(id: string) {
    await apiFetch(`/finance/payroll/${id}/mark-paid`, { method: "PATCH", body: JSON.stringify({}) });
    load();
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h2 className="text-2xl font-semibold">Payroll Records</h2><p className="text-sm text-ink/65">Employee salaries, deductions, and payment tracking.</p></div>
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><Wallet className="h-4 w-4" /> {showForm ? "Cancel" : "Add Payroll Record"}</button>
      </div>
      <FinanceNav />
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">New Payroll Record</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Period (YYYY-MM) *"><input className={inputClass} value={form.period} onChange={(e) => set("period", e.target.value)} placeholder="2024-01" required /></FormField>
            <FormField label="Period Start *"><input type="date" className={inputClass} value={form.periodStart} onChange={(e) => set("periodStart", e.target.value)} required /></FormField>
            <FormField label="Period End *"><input type="date" className={inputClass} value={form.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} required /></FormField>
            <FormField label="Employee Name *"><input className={inputClass} value={form.employeeName} onChange={(e) => set("employeeName", e.target.value)} required /></FormField>
            <FormField label="Employee Code"><input className={inputClass} value={form.employeeCode} onChange={(e) => set("employeeCode", e.target.value)} /></FormField>
            <FormField label="Branch"><select className={selectClass} value={form.branchId} onChange={(e) => set("branchId", e.target.value)}><option value="">None</option>{options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></FormField>
            <FormField label="Basic Salary (GHS) *"><input type="number" className={inputClass} value={form.basicSalary} onChange={(e) => set("basicSalary", e.target.value)} min="0" step="0.01" required /></FormField>
            <FormField label="Allowances (GHS)"><input type="number" className={inputClass} value={form.allowances} onChange={(e) => set("allowances", e.target.value)} min="0" step="0.01" /></FormField>
            <FormField label="Deductions (GHS)"><input type="number" className={inputClass} value={form.deductions} onChange={(e) => set("deductions", e.target.value)} min="0" step="0.01" /></FormField>
            <FormField label="Tax Deduction (GHS)"><input type="number" className={inputClass} value={form.taxDeduction} onChange={(e) => set("taxDeduction", e.target.value)} min="0" step="0.01" /></FormField>
            <FormField label="SSNIT (GHS)"><input type="number" className={inputClass} value={form.ssnit} onChange={(e) => set("ssnit", e.target.value)} min="0" step="0.01" /></FormField>
            <FormField label="Bank Account"><select className={selectClass} value={form.bankAccountId} onChange={(e) => set("bankAccountId", e.target.value)}><option value="">None</option>{options.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.accountName}</option>)}</select></FormField>
          </div>
          <div className="mt-4 rounded-md bg-field p-3 text-sm">
            <span className="font-medium">Gross Pay:</span> {money(grossPay)} &nbsp;|&nbsp; <span className="font-medium">Net Pay:</span> {money(netPay)}
          </div>
          <div className="mt-4"><button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Save Payroll Record"}</button></div>
        </form>
      )}
      <DataTable
        columns={[
          { key: "reference", label: "Reference" },
          { key: "period", label: "Period" },
          { key: "employeeName", label: "Employee" },
          { key: "grossPay", label: "Gross", render: (r) => money(r.grossPay) },
          { key: "netPay", label: "Net Pay", render: (r) => money(r.netPay) },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
          {
            key: "actions", label: "", render: (r) => (
              <div className="flex gap-2">
                {r.status === "DRAFT" && <button onClick={() => handleApprove(r.id as string)} className="text-xs text-brand hover:underline">Approve</button>}
                {r.status === "APPROVED" && <button onClick={() => handleMarkPaid(r.id as string)} className="text-xs text-green-700 hover:underline">Mark Paid</button>}
              </div>
            )
          }
        ]}
        rows={records}
        empty="No payroll records found."
      />
    </AppShell>
  );
}

// ─── Bank Accounts ────────────────────────────────────────────────────────────

export function BankAccountsPage() {
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ accountName: "", accountNumber: "", bankName: "", branchName: "", accountType: "CURRENT", openingBalance: "0", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/bank-accounts")
      .then((r) => setAccounts(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/bank-accounts", { method: "POST", body: JSON.stringify({ ...form, openingBalance: Number(form.openingBalance) }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h2 className="text-2xl font-semibold">Bank Accounts</h2><p className="text-sm text-ink/65">Company bank accounts and balances.</p></div>
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><Building2 className="h-4 w-4" /> {showForm ? "Cancel" : "Add Bank Account"}</button>
      </div>
      <FinanceNav />
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">New Bank Account</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Account Name *"><input className={inputClass} value={form.accountName} onChange={(e) => set("accountName", e.target.value)} required /></FormField>
            <FormField label="Account Number *"><input className={inputClass} value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} required /></FormField>
            <FormField label="Bank Name *"><input className={inputClass} value={form.bankName} onChange={(e) => set("bankName", e.target.value)} required /></FormField>
            <FormField label="Branch Name"><input className={inputClass} value={form.branchName} onChange={(e) => set("branchName", e.target.value)} /></FormField>
            <FormField label="Account Type">
              <select className={selectClass} value={form.accountType} onChange={(e) => set("accountType", e.target.value)}>
                {["CURRENT", "SAVINGS", "FIXED_DEPOSIT", "MOBILE_MONEY"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </FormField>
            <FormField label="Opening Balance (GHS)"><input type="number" className={inputClass} value={form.openingBalance} onChange={(e) => set("openingBalance", e.target.value)} min="0" step="0.01" /></FormField>
          </div>
          <div className="mt-4"><FormField label="Notes"><textarea className={inputClass + " min-h-16"} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></FormField></div>
          <div className="mt-4"><button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Save Account"}</button></div>
        </form>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <div key={a.id as string} className="rounded-md border border-line bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{a.accountName as string}</p>
                <p className="text-sm text-ink/60">{a.bankName as string} {a.branchName ? `— ${a.branchName}` : ""}</p>
                <p className="mt-1 text-xs text-ink/50">{String(a.accountType).replace(/_/g, " ")} · {a.accountNumber as string}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${(a.isActive as boolean) ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>{(a.isActive as boolean) ? "Active" : "Inactive"}</span>
            </div>
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-xs text-ink/60">Current Balance</p>
              <strong className="text-2xl font-semibold text-brand">{money(a.currentBalance)}</strong>
            </div>
          </div>
        ))}
        {accounts.length === 0 && <p className="col-span-full py-8 text-center text-sm text-ink/50">No bank accounts configured.</p>}
      </div>
    </AppShell>
  );
}

// ─── Journal Entries ──────────────────────────────────────────────────────────

export function JournalEntriesPage() {
  const options = useFinanceOptions();
  const [entries, setEntries] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ entryDate: new Date().toISOString().slice(0, 10), description: "", type: "STANDARD", notes: "" });
  const [lines, setLines] = useState([{ accountId: "", description: "", debit: "", credit: "", sequence: 1 }]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/journal-entries")
      .then((r) => setEntries(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  function addLine() { setLines((l) => [...l, { accountId: "", description: "", debit: "", credit: "", sequence: l.length + 1 }]); }
  function setLine(i: number, k: string, v: string) { setLines((l) => l.map((line, idx) => idx === i ? { ...line, [k]: v } : line)); }
  function removeLine(i: number) { setLines((l) => l.filter((_, idx) => idx !== i).map((line, idx) => ({ ...line, sequence: idx + 1 }))); }

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!balanced) { setError("Debits must equal credits."); return; }
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/journal-entries", {
        method: "POST",
        body: JSON.stringify({ ...form, lines: lines.map((l) => ({ accountId: l.accountId, description: l.description, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, sequence: l.sequence })) })
      });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function handlePost(id: string) {
    await apiFetch(`/finance/journal-entries/${id}/post`, { method: "PATCH", body: JSON.stringify({}) });
    load();
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h2 className="text-2xl font-semibold">Journal Entries</h2><p className="text-sm text-ink/65">Double-entry bookkeeping journal entries.</p></div>
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><BookOpen className="h-4 w-4" /> {showForm ? "Cancel" : "New Journal Entry"}</button>
      </div>
      <FinanceNav />
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">New Journal Entry</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-3">
            <FormField label="Entry Date *"><input type="date" className={inputClass} value={form.entryDate} onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))} required /></FormField>
            <FormField label="Type"><select className={selectClass} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>{["STANDARD", "OPENING", "CLOSING", "ADJUSTMENT", "REVERSAL"].map((t) => <option key={t} value={t}>{t}</option>)}</select></FormField>
            <FormField label="Description *"><input className={inputClass} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required /></FormField>
          </div>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-medium">Lines</h4>
              <button type="button" onClick={addLine} className={btnSecondary + " text-xs"}>Add Line</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-xs font-semibold uppercase text-ink/50">{["#", "Account", "Description", "Debit", "Credit", ""].map((h) => <th key={h} className="pb-2 pr-3">{h}</th>)}</tr></thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-b border-line/50">
                      <td className="py-2 pr-3 text-ink/50">{i + 1}</td>
                      <td className="py-2 pr-3"><select className={selectClass + " w-48"} value={line.accountId} onChange={(e) => setLine(i, "accountId", e.target.value)} required><option value="">Select account</option>{options.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></td>
                      <td className="py-2 pr-3"><input className={inputClass + " w-40"} value={line.description} onChange={(e) => setLine(i, "description", e.target.value)} /></td>
                      <td className="py-2 pr-3"><input type="number" className={inputClass + " w-28"} value={line.debit} onChange={(e) => setLine(i, "debit", e.target.value)} min="0" step="0.01" /></td>
                      <td className="py-2 pr-3"><input type="number" className={inputClass + " w-28"} value={line.credit} onChange={(e) => setLine(i, "credit", e.target.value)} min="0" step="0.01" /></td>
                      <td className="py-2"><button type="button" onClick={() => removeLine(i)} className="text-red-500 hover:underline text-xs">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td colSpan={3} className="pt-3 text-right text-sm text-ink/60">Totals</td>
                    <td className={`pt-3 pr-3 ${balanced ? "text-green-700" : "text-red-600"}`}>{money(totalDebit)}</td>
                    <td className={`pt-3 ${balanced ? "text-green-700" : "text-red-600"}`}>{money(totalCredit)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            {!balanced && <p className="mt-2 text-xs text-red-600">Debits and credits must be equal.</p>}
          </div>
          <div className="mt-4"><button type="submit" className={btnPrimary} disabled={loading || !balanced}>{loading ? "Saving…" : "Save Journal Entry"}</button></div>
        </form>
      )}
      <DataTable
        columns={[
          { key: "reference", label: "Reference" },
          { key: "entryDate", label: "Date", render: (r) => fmt(r.entryDate) },
          { key: "type", label: "Type" },
          { key: "description", label: "Description" },
          { key: "totalDebit", label: "Debit", render: (r) => money(r.totalDebit) },
          { key: "totalCredit", label: "Credit", render: (r) => money(r.totalCredit) },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
          {
            key: "actions", label: "", render: (r) =>
              r.status === "DRAFT" ? <button onClick={() => handlePost(r.id as string)} className="text-xs text-brand hover:underline">Post</button> : null
          }
        ]}
        rows={entries}
        empty="No journal entries."
      />
    </AppShell>
  );
}

// ─── Profit & Loss Report ─────────────────────────────────────────────────────

export function ProfitLossReportPage() {
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [current, setCurrent] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/reports/profit-loss")
      .then((r) => setReports(r.data))
      .catch(() => undefined);
  }, []);

  async function generate() {
    setLoading(true);
    try {
      const res = await apiFetch<ApiEnvelope<Record<string, unknown>>>("/finance/reports/profit-loss", { method: "POST", body: JSON.stringify({ startDate, endDate }) });
      setCurrent(res.data);
      apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/reports/profit-loss").then((r) => setReports(r.data)).catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h2 className="text-2xl font-semibold">Profit & Loss Report</h2><p className="text-sm text-ink/65">Revenue vs expenses for a period.</p></div>
        <div className="flex gap-2">
          <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <button className={btnPrimary} onClick={generate} disabled={loading}><FileBarChart className="h-4 w-4" /> {loading ? "Generating…" : "Generate"}</button>
        </div>
      </div>
      <FinanceNav />
      {current && (
        <section className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">{current.title as string}</h3>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Revenue" value={money(current.totalRevenue)} icon={ArrowUpCircle} />
            <StatCard label="Total Expenses" value={money(current.totalExpenses)} icon={ArrowDownCircle} />
            <StatCard label="Gross Profit" value={money(current.grossProfit)} icon={DollarSign} />
            <StatCard label="Net Profit" value={money(current.netProfit)} icon={CheckCircle} />
          </div>
        </section>
      )}
      <h3 className="mb-3 text-lg font-semibold">Saved Reports</h3>
      <DataTable
        columns={[
          { key: "title", label: "Title" },
          { key: "periodStart", label: "From", render: (r) => fmt(r.periodStart) },
          { key: "periodEnd", label: "To", render: (r) => fmt(r.periodEnd) },
          { key: "totalRevenue", label: "Revenue", render: (r) => money(r.totalRevenue) },
          { key: "totalExpenses", label: "Expenses", render: (r) => money(r.totalExpenses) },
          { key: "netProfit", label: "Net Profit", render: (r) => <span className={Number(r.netProfit) >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{money(r.netProfit)}</span> },
          { key: "createdAt", label: "Generated", render: (r) => fmt(r.createdAt) }
        ]}
        rows={reports}
        empty="No P&L reports generated yet."
      />
    </AppShell>
  );
}

// ─── Cash Flow Report ─────────────────────────────────────────────────────────

export function CashFlowReportPage() {
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [current, setCurrent] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/reports/cash-flow")
      .then((r) => setReports(r.data))
      .catch(() => undefined);
  }, []);

  async function generate() {
    setLoading(true);
    try {
      const res = await apiFetch<ApiEnvelope<Record<string, unknown>>>("/finance/reports/cash-flow", { method: "POST", body: JSON.stringify({ startDate, endDate }) });
      setCurrent(res.data);
      apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/reports/cash-flow").then((r) => setReports(r.data)).catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }

  const reportData = current?.reportData as Record<string, unknown> | undefined;

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h2 className="text-2xl font-semibold">Cash Flow Report</h2><p className="text-sm text-ink/65">Cash inflows and outflows for a period.</p></div>
        <div className="flex gap-2">
          <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <button className={btnPrimary} onClick={generate} disabled={loading}><FileText className="h-4 w-4" /> {loading ? "Generating…" : "Generate"}</button>
        </div>
      </div>
      <FinanceNav />
      {current && (
        <section className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">{current.title as string}</h3>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Operating Cash Flow" value={money(current.operatingCashFlow)} icon={DollarSign} />
            <StatCard label="Net Cash Flow" value={money(current.netCashFlow)} icon={ArrowUpCircle} />
            <StatCard label="Closing Balance" value={money(current.closingBalance)} icon={Wallet} />
          </div>
          {reportData && (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-md bg-green-50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-green-800">Inflows</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Revenue</span><span className="font-medium">{money(reportData.inflows)}</span></div>
                  <div className="flex justify-between"><span>Customer Payments</span><span className="font-medium">{money(reportData.customerPayments)}</span></div>
                </div>
              </div>
              <div className="rounded-md bg-red-50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-red-800">Outflows</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Expenses</span><span className="font-medium">{money(reportData.expenses)}</span></div>
                  <div className="flex justify-between"><span>Supplier Payments</span><span className="font-medium">{money(reportData.supplierPayments)}</span></div>
                  <div className="flex justify-between"><span>Payroll</span><span className="font-medium">{money(reportData.payroll)}</span></div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
      <h3 className="mb-3 text-lg font-semibold">Saved Reports</h3>
      <DataTable
        columns={[
          { key: "title", label: "Title" },
          { key: "periodStart", label: "From", render: (r) => fmt(r.periodStart) },
          { key: "periodEnd", label: "To", render: (r) => fmt(r.periodEnd) },
          { key: "operatingCashFlow", label: "Operating CF", render: (r) => money(r.operatingCashFlow) },
          { key: "netCashFlow", label: "Net CF", render: (r) => <span className={Number(r.netCashFlow) >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{money(r.netCashFlow)}</span> },
          { key: "closingBalance", label: "Closing Balance", render: (r) => money(r.closingBalance) }
        ]}
        rows={reports}
        empty="No cash flow reports yet."
      />
    </AppShell>
  );
}

// ─── Product Profitability ────────────────────────────────────────────────────

export function ProductProfitabilityPage() {
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/reports/product-profitability")
      .then((r) => setRecords(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  async function generate() {
    setLoading(true);
    try {
      await apiFetch("/finance/reports/product-profitability", { method: "POST", body: JSON.stringify({ startDate, endDate }) });
      load();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h2 className="text-2xl font-semibold">Product Profitability</h2><p className="text-sm text-ink/65">Revenue, cost, and margin by product.</p></div>
        <div className="flex gap-2">
          <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <button className={btnPrimary} onClick={generate} disabled={loading}><FileBarChart className="h-4 w-4" /> {loading ? "Generating…" : "Analyse"}</button>
        </div>
      </div>
      <FinanceNav />
      <DataTable
        columns={[
          { key: "productName", label: "Product" },
          { key: "productCode", label: "Code" },
          { key: "periodStart", label: "From", render: (r) => fmt(r.periodStart) },
          { key: "periodEnd", label: "To", render: (r) => fmt(r.periodEnd) },
          { key: "unitsSold", label: "Units" },
          { key: "totalRevenue", label: "Revenue", render: (r) => money(r.totalRevenue) },
          { key: "totalCost", label: "Cost", render: (r) => money(r.totalCost) },
          { key: "grossProfit", label: "Gross Profit", render: (r) => <span className={Number(r.grossProfit) >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{money(r.grossProfit)}</span> },
          { key: "margin", label: "Margin", render: (r) => pct(r.margin) }
        ]}
        rows={records}
        empty="No product profitability records. Click Analyse to generate."
      />
    </AppShell>
  );
}

// ─── Batch Profitability ──────────────────────────────────────────────────────

export function BatchProfitabilityPage() {
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [batchTypeFilter, setBatchTypeFilter] = useState("");
  const [form, setForm] = useState({ batchType: "FLOCK", batchId: "", batchReference: "", batchName: "", periodStart: "", periodEnd: "", totalRevenue: "", totalCost: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    const params = batchTypeFilter ? `?status=${batchTypeFilter}` : "";
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>(`/finance/reports/batch-profitability${params}`)
      .then((r) => setRecords(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, [batchTypeFilter]);
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/reports/batch-profitability", { method: "POST", body: JSON.stringify({ ...form, totalRevenue: Number(form.totalRevenue), totalCost: Number(form.totalCost) }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h2 className="text-2xl font-semibold">Batch Profitability</h2><p className="text-sm text-ink/65">Profitability of flock, feed, and soya processing batches.</p></div>
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><FileBarChart className="h-4 w-4" /> {showForm ? "Cancel" : "Record Batch P&L"}</button>
      </div>
      <FinanceNav />
      <div className="mb-4 flex gap-3">
        <select className={selectClass} value={batchTypeFilter} onChange={(e) => setBatchTypeFilter(e.target.value)}>
          <option value="">All Batch Types</option>
          <option value="FLOCK">Flock</option>
          <option value="FEED_PRODUCTION">Feed Production</option>
          <option value="SOYA_PROCESSING">Soya Processing</option>
        </select>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">Record Batch Profitability</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Batch Type *">
              <select className={selectClass} value={form.batchType} onChange={(e) => set("batchType", e.target.value)}>
                <option value="FLOCK">Flock</option>
                <option value="FEED_PRODUCTION">Feed Production</option>
                <option value="SOYA_PROCESSING">Soya Processing</option>
              </select>
            </FormField>
            <FormField label="Batch Reference *"><input className={inputClass} value={form.batchReference} onChange={(e) => set("batchReference", e.target.value)} required /></FormField>
            <FormField label="Batch Name *"><input className={inputClass} value={form.batchName} onChange={(e) => set("batchName", e.target.value)} required /></FormField>
            <FormField label="Batch ID *"><input className={inputClass} value={form.batchId} onChange={(e) => set("batchId", e.target.value)} required /></FormField>
            <FormField label="Period Start *"><input type="date" className={inputClass} value={form.periodStart} onChange={(e) => set("periodStart", e.target.value)} required /></FormField>
            <FormField label="Period End *"><input type="date" className={inputClass} value={form.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} required /></FormField>
            <FormField label="Total Revenue (GHS) *"><input type="number" className={inputClass} value={form.totalRevenue} onChange={(e) => set("totalRevenue", e.target.value)} min="0" step="0.01" required /></FormField>
            <FormField label="Total Cost (GHS) *"><input type="number" className={inputClass} value={form.totalCost} onChange={(e) => set("totalCost", e.target.value)} min="0" step="0.01" required /></FormField>
            {form.totalRevenue && form.totalCost && (
              <div className="flex flex-col justify-end">
                <p className="text-sm text-ink/60">Gross Profit</p>
                <strong className={`text-xl font-semibold ${Number(form.totalRevenue) - Number(form.totalCost) >= 0 ? "text-green-700" : "text-red-600"}`}>{money(Number(form.totalRevenue) - Number(form.totalCost))}</strong>
              </div>
            )}
          </div>
          <div className="mt-4"><button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Save Record"}</button></div>
        </form>
      )}
      <DataTable
        columns={[
          { key: "batchReference", label: "Reference" },
          { key: "batchName", label: "Batch Name" },
          { key: "batchType", label: "Type", render: (r) => String(r.batchType).replace(/_/g, " ") },
          { key: "periodStart", label: "From", render: (r) => fmt(r.periodStart) },
          { key: "periodEnd", label: "To", render: (r) => fmt(r.periodEnd) },
          { key: "totalRevenue", label: "Revenue", render: (r) => money(r.totalRevenue) },
          { key: "totalCost", label: "Cost", render: (r) => money(r.totalCost) },
          { key: "grossProfit", label: "Gross Profit", render: (r) => <span className={Number(r.grossProfit) >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{money(r.grossProfit)}</span> },
          { key: "margin", label: "Margin", render: (r) => pct(r.margin) }
        ]}
        rows={records}
        empty="No batch profitability records."
      />
    </AppShell>
  );
}
