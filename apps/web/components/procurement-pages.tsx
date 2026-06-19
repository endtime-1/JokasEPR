"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiEnvelope, apiFetch } from "../lib/api";
import { AppShell } from "./app-shell";
import { DataTable } from "./data-table";

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function money(v: unknown) {
  return `GHS ${Number(v ?? 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(d?: string | Date | null) {
  if (!d) return "â€”";
  return new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    SUBMITTED: "bg-blue-100 text-blue-700",
    APPROVED: "bg-green-100 text-green-700",
    REJECTED: "bg-red-100 text-red-700",
    CANCELLED: "bg-red-100 text-red-700",
    CONVERTED_TO_PO: "bg-purple-100 text-purple-700",
    PENDING_APPROVAL: "bg-yellow-100 text-yellow-800",
    SENT_TO_SUPPLIER: "bg-indigo-100 text-indigo-700",
    PARTIALLY_RECEIVED: "bg-orange-100 text-orange-700",
    FULLY_RECEIVED: "bg-green-100 text-green-700",
    RECEIVED: "bg-blue-100 text-blue-700",
    QUALITY_HOLD: "bg-yellow-100 text-yellow-800",
    QUALITY_PASSED: "bg-green-100 text-green-700",
    QUALITY_FAILED: "bg-red-100 text-red-700",
    POSTED: "bg-gray-800 text-white",
    ACTIVE: "bg-green-100 text-green-700",
    INACTIVE: "bg-gray-100 text-gray-700",
    BLACKLISTED: "bg-red-100 text-red-700",
    UNDER_REVIEW: "bg-yellow-100 text-yellow-800",
    PENDING: "bg-yellow-100 text-yellow-800",
    MATCHED: "bg-blue-100 text-blue-700",
    PAID: "bg-green-100 text-green-700",
    DISPUTED: "bg-red-100 text-red-700",
    OVERDUE: "bg-red-200 text-red-800",
    EXCELLENT: "bg-green-100 text-green-700",
    GOOD: "bg-teal-100 text-teal-700",
    SATISFACTORY: "bg-blue-100 text-blue-700",
    POOR: "bg-orange-100 text-orange-700",
    UNACCEPTABLE: "bg-red-100 text-red-700",
  };
  const c = colours[status] ?? "bg-gray-100 text-gray-700";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${c}`}>{status.replace(/_/g, " ")}</span>;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-ink/60">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink/50">{sub}</p>}
    </div>
  );
}

// â”€â”€â”€ Nav â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const procurementNav = [
  { href: "/procurement", label: "Dashboard" },
  { href: "/procurement/suppliers", label: "Suppliers" },
  { href: "/procurement/supplier-categories", label: "Categories" },
  { href: "/procurement/purchase-requests", label: "Purchase Requests" },
  { href: "/procurement/purchase-orders", label: "Purchase Orders" },
  { href: "/procurement/grns", label: "Goods Received" },
  { href: "/procurement/invoices", label: "Invoices" },
  { href: "/procurement/payments", label: "Payments" },
  { href: "/procurement/performance", label: "Performance" },
  { href: "/procurement/price-history", label: "Price History" },
];

function ProcurementNav() {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {procurementNav.map((n) => (
        <Link key={n.href} href={n.href} className="rounded-full border border-line bg-white px-4 py-1.5 text-xs font-medium hover:bg-field">
          {n.label}
        </Link>
      ))}
    </div>
  );
}

// â”€â”€â”€ Options hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ProcurementOptions = {
  branches: { id: string; name: string; code: string }[];
  warehouses: { id: string; name: string; code: string }[];
  suppliers: { id: string; name: string; code: string }[];
  supplierCategories: { id: string; name: string; code: string }[];
  bankAccounts: { id: string; accountName: string; bankName: string }[];
};

function useProcurementOptions() {
  const [opts, setOpts] = useState<ProcurementOptions>({ branches: [], warehouses: [], suppliers: [], supplierCategories: [], bankAccounts: [] });
  useEffect(() => {
    apiFetch<ApiEnvelope<ProcurementOptions>>("/procurement/options").then((r) => setOpts(r.data)).catch(() => undefined);
  }, []);
  return opts;
}

// â”€â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type DashData = {
  activeSuppliers: number;
  pendingPRs: number;
  pendingPOs: number;
  pendingQualityGRNs: number;
  openInvoiceCount: number;
  openInvoiceBalance: number;
  recentPOs: Array<{ id: string; reference: string; status: string; totalAmount: number; orderDate: string; supplier: { name: string } }>;
  recentGRNs: Array<{ id: string; reference: string; status: string; receivedDate: string; supplier: { name: string }; warehouse: { name: string } }>;
};

export function ProcurementDashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  useEffect(() => {
    apiFetch<ApiEnvelope<DashData>>("/procurement/dashboard").then((r) => setData(r.data)).catch(() => undefined);
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Procurement</h1>
            <p className="mt-0.5 text-sm text-ink/60">Supplier & purchasing management</p>
          </div>
          <Link href="/procurement/purchase-requests/create" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            + New Purchase Request
          </Link>
        </div>

        <ProcurementNav />

        {data ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Active Suppliers" value={data.activeSuppliers} />
              <StatCard label="Pending PRs" value={data.pendingPRs} sub="awaiting approval" />
              <StatCard label="Pending POs" value={data.pendingPOs} sub="awaiting approval" />
              <StatCard label="Quality Hold GRNs" value={data.pendingQualityGRNs} />
              <StatCard label="Open Invoices" value={data.openInvoiceCount} />
              <StatCard label="Payables Due" value={money(data.openInvoiceBalance)} />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-line bg-white p-5">
                <h2 className="mb-4 text-sm font-semibold">Recent Purchase Orders</h2>
                <DataTable
                  columns={[
                    { key: "reference", label: "Reference" },
                    { key: "supplier", label: "Supplier", render: (r) => r.supplier?.name ?? "â€”" },
                    { key: "totalAmount", label: "Total", render: (r) => money(r.totalAmount) },
                    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
                  ]}
                  rows={data.recentPOs as Record<string, any>[]}
                  empty="No purchase orders yet"
                />
              </div>
              <div className="rounded-lg border border-line bg-white p-5">
                <h2 className="mb-4 text-sm font-semibold">Recent GRNs</h2>
                <DataTable
                  columns={[
                    { key: "reference", label: "Reference" },
                    { key: "supplier", label: "Supplier", render: (r) => r.supplier?.name ?? "â€”" },
                    { key: "receivedDate", label: "Date", render: (r) => fmt(r.receivedDate as string) },
                    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
                  ]}
                  rows={data.recentGRNs as Record<string, any>[]}
                  empty="No GRNs yet"
                />
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink/60">Loading dashboard...</p>
        )}
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Suppliers List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Supplier = { id: string; code: string; name: string; contactPerson?: string; phone?: string; email?: string; status: string; rating?: number; category?: { name: string } };

export function SuppliersPage() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    apiFetch<ApiEnvelope<Supplier[]>>(`/procurement/suppliers${q}`).then((r) => setRows(r.data)).catch(() => undefined);
  }, [search]);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Suppliers</h1>
          <Link href="/procurement/suppliers/create" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            + Add Supplier
          </Link>
        </div>
        <ProcurementNav />
        <div className="flex gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search suppliers..." className="w-64 rounded-md border border-line px-3 py-2 text-sm" />
        </div>
        <DataTable
          columns={[
            { key: "code", label: "Code" },
            { key: "name", label: "Name", render: (r) => <Link href={`/procurement/suppliers/${r.id}`} className="font-medium text-brand hover:underline">{r.name as string}</Link> },
            { key: "category", label: "Category", render: (r) => r.category?.name ?? "â€”" },
            { key: "contactPerson", label: "Contact" },
            { key: "phone", label: "Phone" },
            { key: "rating", label: "Rating", render: (r) => r.rating ? `${(Number(r.rating) * 100).toFixed(0)}%` : "â€”" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No suppliers found"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Create Supplier â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function CreateSupplierPage() {
  const router = useRouter();
  const opts = useProcurementOptions();
  const [form, setForm] = useState({ code: "", name: "", categoryId: "", contactPerson: "", phone: "", email: "", address: "", taxId: "", bankName: "", bankAccount: "", paymentTermsDays: "", leadTimeDays: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/suppliers", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          paymentTermsDays: form.paymentTermsDays ? Number(form.paymentTermsDays) : undefined,
          leadTimeDays: form.leadTimeDays ? Number(form.leadTimeDays) : undefined,
          categoryId: form.categoryId || undefined,
        }),
      });
      router.push("/procurement/suppliers");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create supplier");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/procurement/suppliers" className="text-sm text-ink/60 hover:text-ink">â† Suppliers</Link>
          <h1 className="text-xl font-bold">Add Supplier</h1>
        </div>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-line bg-white p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Code *</label>
              <input required value={form.code} onChange={f("code")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Name *</label>
              <input required value={form.name} onChange={f("name")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Category</label>
            <select value={form.categoryId} onChange={f("categoryId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
              <option value="">â€” None â€”</option>
              {opts.supplierCategories.map((c) => <option key={c.id} value={c.id}>{c.code} â€” {c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Contact Person</label>
              <input value={form.contactPerson} onChange={f("contactPerson")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Phone</label>
              <input value={form.phone} onChange={f("phone")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Email</label>
            <input type="email" value={form.email} onChange={f("email")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Address</label>
            <textarea value={form.address} onChange={f("address")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Tax ID</label>
              <input value={form.taxId} onChange={f("taxId")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Payment Terms (days)</label>
              <input type="number" min={0} value={form.paymentTermsDays} onChange={f("paymentTermsDays")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Bank Name</label>
              <input value={form.bankName} onChange={f("bankName")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Bank Account</label>
              <input value={form.bankAccount} onChange={f("bankAccount")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Notes</label>
            <textarea value={form.notes} onChange={f("notes")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving..." : "Create Supplier"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Supplier Categories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type SupplierCategory = { id: string; code: string; name: string; description?: string; isActive: boolean; _count: { suppliers: number } };

export function SupplierCategoriesPage() {
  const [rows, setRows] = useState<SupplierCategory[]>([]);
  const [form, setForm] = useState({ code: "", name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    apiFetch<ApiEnvelope<SupplierCategory[]>>("/procurement/supplier-categories").then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/supplier-categories", { method: "POST", body: JSON.stringify(form) });
      setForm({ code: "", name: "", description: "" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-xl font-bold">Supplier Categories</h1>
        <ProcurementNav />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold">Add Category</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">{error}</div>}
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Code *</label>
                <input required value={form.code} onChange={f("code")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Name *</label>
                <input required value={form.name} onChange={f("name")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Description</label>
                <textarea value={form.description} onChange={f("description")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <button type="submit" disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? "Saving..." : "Add Category"}
              </button>
            </form>
          </div>
          <div className="lg:col-span-2">
            <DataTable
              columns={[
                { key: "code", label: "Code" },
                { key: "name", label: "Name" },
                { key: "description", label: "Description" },
                { key: "_count", label: "Suppliers", render: (r) => r._count?.suppliers ?? 0 },
                { key: "isActive", label: "Active", render: (r) => r.isActive ? "Yes" : "No" },
              ]}
              rows={rows as Record<string, any>[]}
              empty="No categories yet"
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Purchase Requests List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type PurchaseRequest = { id: string; reference: string; title: string; status: string; totalEstimate: number; createdAt: string; requestedBy: { fullName: string }; branch?: { name: string }; _count: { items: number } };

export function PurchaseRequestsPage() {
  const [rows, setRows] = useState<PurchaseRequest[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const q = status ? `?status=${status}` : "";
    apiFetch<ApiEnvelope<PurchaseRequest[]>>(`/procurement/purchase-requests${q}`).then((r) => setRows(r.data)).catch(() => undefined);
  }, [status]);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Purchase Requests</h1>
          <Link href="/procurement/purchase-requests/create" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            + New Request
          </Link>
        </div>
        <ProcurementNav />
        <div className="flex gap-3">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            {["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CONVERTED_TO_PO", "CANCELLED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <DataTable
          columns={[
            { key: "reference", label: "Reference", render: (r) => <Link href={`/procurement/purchase-requests/${r.id}`} className="font-medium text-brand hover:underline">{r.reference as string}</Link> },
            { key: "title", label: "Title" },
            { key: "requestedBy", label: "Requested By", render: (r) => r.requestedBy?.fullName ?? "â€”" },
            { key: "branch", label: "Branch", render: (r) => r.branch?.name ?? "â€”" },
            { key: "_count", label: "Items", render: (r) => r._count?.items ?? 0 },
            { key: "totalEstimate", label: "Estimate", render: (r) => money(r.totalEstimate) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            { key: "createdAt", label: "Date", render: (r) => fmt(r.createdAt as string) },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No purchase requests yet"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Create Purchase Request â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type PRItem = { productName: string; quantity: string; uomCode: string; estimatedUnitCost: string; description: string };

export function CreatePurchaseRequestPage() {
  const router = useRouter();
  const opts = useProcurementOptions();
  const [form, setForm] = useState({ title: "", branchId: "", requiredDate: "", notes: "" });
  const [items, setItems] = useState<PRItem[]>([{ productName: "", quantity: "", uomCode: "", estimatedUnitCost: "", description: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  function updateItem(idx: number, k: string, v: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { productName: "", quantity: "", uomCode: "", estimatedUnitCost: "", description: "" }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/purchase-requests", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          branchId: form.branchId || undefined,
          requiredDate: form.requiredDate || undefined,
          items: items.map((it, i) => ({
            productName: it.productName,
            quantity: Number(it.quantity),
            uomCode: it.uomCode || undefined,
            estimatedUnitCost: it.estimatedUnitCost ? Number(it.estimatedUnitCost) : undefined,
            description: it.description || undefined,
            sequence: i + 1,
          })),
        }),
      });
      router.push("/procurement/purchase-requests");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create request");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/procurement/purchase-requests" className="text-sm text-ink/60 hover:text-ink">â† Purchase Requests</Link>
          <h1 className="text-xl font-bold">New Purchase Request</h1>
        </div>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-lg border border-line bg-white p-5 space-y-4">
            <h2 className="font-semibold">Request Details</h2>
            <div>
              <label className="mb-1 block text-xs font-medium">Title *</label>
              <input required value={form.title} onChange={f("title")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium">Branch</label>
                <select value={form.branchId} onChange={f("branchId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” None â€”</option>
                  {opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Required Date</label>
                <input type="date" value={form.requiredDate} onChange={f("requiredDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Notes</label>
              <textarea value={form.notes} onChange={f("notes")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Items</h2>
              <button type="button" onClick={addItem} className="rounded-md border border-brand px-3 py-1 text-xs font-semibold text-brand hover:bg-brand/5">+ Add Item</button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 rounded-md bg-field p-3">
                <div className="col-span-4">
                  <label className="mb-0.5 block text-xs">Product/Item *</label>
                  <input required value={item.productName} onChange={(e) => updateItem(idx, "productName", e.target.value)} placeholder="Item name" className="w-full rounded border border-line px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="mb-0.5 block text-xs">Qty *</label>
                  <input required type="number" min={0.0001} step={0.0001} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="w-full rounded border border-line px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="mb-0.5 block text-xs">UOM</label>
                  <input value={item.uomCode} onChange={(e) => updateItem(idx, "uomCode", e.target.value)} placeholder="KG, PCS..." className="w-full rounded border border-line px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="mb-0.5 block text-xs">Est. Cost</label>
                  <input type="number" min={0} step={0.01} value={item.estimatedUnitCost} onChange={(e) => updateItem(idx, "estimatedUnitCost", e.target.value)} className="w-full rounded border border-line px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-1 flex items-end justify-center pb-1">
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)} className="text-xs text-red-500 hover:text-red-700">âœ•</button>
                  )}
                </div>
              </div>
            ))}
            <p className="text-right text-xs text-ink/60">
              Total Estimate: <strong>{money(items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.estimatedUnitCost) || 0), 0))}</strong>
            </p>
          </div>

          <button type="submit" disabled={saving} className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Submitting..." : "Create Request"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Purchase Orders List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type PurchaseOrder = { id: string; reference: string; status: string; totalAmount: number; orderDate: string; supplier: { name: string }; _count: { items: number; grnRecords: number } };

export function PurchaseOrdersPage() {
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const q = status ? `?status=${status}` : "";
    apiFetch<ApiEnvelope<PurchaseOrder[]>>(`/procurement/purchase-orders${q}`).then((r) => setRows(r.data)).catch(() => undefined);
  }, [status]);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Purchase Orders</h1>
          <Link href="/procurement/purchase-orders/create" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            + New PO
          </Link>
        </div>
        <ProcurementNav />
        <div className="flex gap-3">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            {["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "CANCELLED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <DataTable
          columns={[
            { key: "reference", label: "Reference", render: (r) => <Link href={`/procurement/purchase-orders/${r.id}`} className="font-medium text-brand hover:underline">{r.reference as string}</Link> },
            { key: "supplier", label: "Supplier", render: (r) => r.supplier?.name ?? "â€”" },
            { key: "totalAmount", label: "Total", render: (r) => money(r.totalAmount) },
            { key: "_count", label: "Items", render: (r) => r._count?.items ?? 0 },
            { key: "grnRecords", label: "GRNs", render: (r) => r._count?.grnRecords ?? 0 },
            { key: "orderDate", label: "Order Date", render: (r) => fmt(r.orderDate as string) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No purchase orders yet"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Create Purchase Order â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type POItem = { productName: string; quantity: string; unitCost: string; uomCode: string; description: string };

export function CreatePurchaseOrderPage() {
  const router = useRouter();
  const opts = useProcurementOptions();
  const [form, setForm] = useState({ supplierId: "", purchaseRequestId: "", expectedDelivery: "", deliveryAddress: "", paymentTermsDays: "", notes: "" });
  const [items, setItems] = useState<POItem[]>([{ productName: "", quantity: "", unitCost: "", uomCode: "", description: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  function updateItem(idx: number, k: string, v: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));
  }

  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplierId) { setError("Supplier is required"); return; }
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          supplierId: form.supplierId,
          purchaseRequestId: form.purchaseRequestId || undefined,
          expectedDelivery: form.expectedDelivery || undefined,
          paymentTermsDays: form.paymentTermsDays ? Number(form.paymentTermsDays) : undefined,
          items: items.map((it, i) => ({
            productName: it.productName,
            quantity: Number(it.quantity),
            unitCost: Number(it.unitCost),
            uomCode: it.uomCode || undefined,
            description: it.description || undefined,
            sequence: i + 1,
          })),
        }),
      });
      router.push("/procurement/purchase-orders");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create PO");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/procurement/purchase-orders" className="text-sm text-ink/60 hover:text-ink">â† Purchase Orders</Link>
          <h1 className="text-xl font-bold">New Purchase Order</h1>
        </div>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-lg border border-line bg-white p-5 space-y-4">
            <h2 className="font-semibold">Order Details</h2>
            <div>
              <label className="mb-1 block text-xs font-medium">Supplier *</label>
              <select required value={form.supplierId} onChange={f("supplierId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                <option value="">â€” Select Supplier â€”</option>
                {opts.suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} â€” {s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium">Expected Delivery</label>
                <input type="date" value={form.expectedDelivery} onChange={f("expectedDelivery")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Payment Terms (days)</label>
                <input type="number" min={0} value={form.paymentTermsDays} onChange={f("paymentTermsDays")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Delivery Address</label>
              <textarea value={form.deliveryAddress} onChange={f("deliveryAddress")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Line Items</h2>
              <button type="button" onClick={() => setItems((p) => [...p, { productName: "", quantity: "", unitCost: "", uomCode: "", description: "" }])} className="rounded-md border border-brand px-3 py-1 text-xs font-semibold text-brand hover:bg-brand/5">
                + Add Line
              </button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 rounded-md bg-field p-3">
                <div className="col-span-4">
                  <label className="mb-0.5 block text-xs">Item *</label>
                  <input required value={item.productName} onChange={(e) => updateItem(idx, "productName", e.target.value)} className="w-full rounded border border-line px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="mb-0.5 block text-xs">Qty *</label>
                  <input required type="number" min={0.0001} step={0.0001} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="w-full rounded border border-line px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="mb-0.5 block text-xs">Unit Cost *</label>
                  <input required type="number" min={0} step={0.01} value={item.unitCost} onChange={(e) => updateItem(idx, "unitCost", e.target.value)} className="w-full rounded border border-line px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="mb-0.5 block text-xs">Total</label>
                  <p className="pt-1.5 text-sm font-medium">{money((Number(item.quantity) || 0) * (Number(item.unitCost) || 0))}</p>
                </div>
                <div className="col-span-1 flex items-end justify-center pb-1">
                  {items.length > 1 && <button type="button" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} className="text-xs text-red-500">âœ•</button>}
                </div>
              </div>
            ))}
            <p className="text-right text-sm font-semibold">Total: {money(subtotal)}</p>
          </div>

          <button type="submit" disabled={saving} className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Creating..." : "Create Purchase Order"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ GRNs List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type GRN = { id: string; reference: string; status: string; receivedDate: string; supplier: { name: string }; purchaseOrder: { reference: string }; warehouse: { name: string }; _count: { items: number } };

export function GRNsPage() {
  const [rows, setRows] = useState<GRN[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const q = status ? `?status=${status}` : "";
    apiFetch<ApiEnvelope<GRN[]>>(`/procurement/grns${q}`).then((r) => setRows(r.data)).catch(() => undefined);
  }, [status]);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Goods Received Notes</h1>
          <Link href="/procurement/grns/create" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            + Receive Goods
          </Link>
        </div>
        <ProcurementNav />
        <div className="flex gap-3">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            {["DRAFT", "RECEIVED", "QUALITY_HOLD", "QUALITY_PASSED", "QUALITY_FAILED", "POSTED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <DataTable
          columns={[
            { key: "reference", label: "Reference", render: (r) => <Link href={`/procurement/grns/${r.id}`} className="font-medium text-brand hover:underline">{r.reference as string}</Link> },
            { key: "purchaseOrder", label: "PO Ref", render: (r) => r.purchaseOrder?.reference ?? "â€”" },
            { key: "supplier", label: "Supplier", render: (r) => r.supplier?.name ?? "â€”" },
            { key: "warehouse", label: "Warehouse", render: (r) => r.warehouse?.name ?? "â€”" },
            { key: "_count", label: "Items", render: (r) => r._count?.items ?? 0 },
            { key: "receivedDate", label: "Received", render: (r) => fmt(r.receivedDate as string) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No GRNs yet"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Create GRN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type GRNItemForm = { productName: string; orderedQty: string; receivedQty: string; unitCost: string; uomCode: string; batchNumber: string };

export function CreateGRNPage() {
  const router = useRouter();
  const opts = useProcurementOptions();
  const [form, setForm] = useState({ purchaseOrderId: "", warehouseId: "", branchId: "", receivedDate: "", deliveryNoteRef: "", notes: "" });
  const [items, setItems] = useState<GRNItemForm[]>([{ productName: "", orderedQty: "", receivedQty: "", unitCost: "", uomCode: "", batchNumber: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));
  function updateItem(idx: number, k: string, v: string) { setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [k]: v } : it))); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.purchaseOrderId || !form.warehouseId) { setError("Purchase Order and Warehouse are required"); return; }
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/grns", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          branchId: form.branchId || undefined,
          receivedDate: form.receivedDate || undefined,
          items: items.map((it, i) => ({
            productName: it.productName,
            orderedQty: Number(it.orderedQty),
            receivedQty: Number(it.receivedQty),
            unitCost: Number(it.unitCost),
            uomCode: it.uomCode || undefined,
            batchNumber: it.batchNumber || undefined,
            sequence: i + 1,
          })),
        }),
      });
      router.push("/procurement/grns");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create GRN");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/procurement/grns" className="text-sm text-ink/60 hover:text-ink">â† GRNs</Link>
          <h1 className="text-xl font-bold">Receive Goods</h1>
        </div>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-lg border border-line bg-white p-5 space-y-4">
            <h2 className="font-semibold">Receipt Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium">Purchase Order *</label>
                <input required value={form.purchaseOrderId} onChange={f("purchaseOrderId")} placeholder="PO UUID" className="w-full rounded-md border border-line px-3 py-2 text-sm font-mono text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Warehouse *</label>
                <select required value={form.warehouseId} onChange={f("warehouseId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” Select Warehouse â€”</option>
                  {opts.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium">Received Date</label>
                <input type="date" value={form.receivedDate} onChange={f("receivedDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Delivery Note Ref</label>
                <input value={form.deliveryNoteRef} onChange={f("deliveryNoteRef")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Items Received</h2>
              <button type="button" onClick={() => setItems((p) => [...p, { productName: "", orderedQty: "", receivedQty: "", unitCost: "", uomCode: "", batchNumber: "" }])} className="rounded-md border border-brand px-3 py-1 text-xs font-semibold text-brand">
                + Add Item
              </button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="rounded-md bg-field p-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-3">
                    <label className="mb-0.5 block text-xs">Item Name *</label>
                    <input required value={item.productName} onChange={(e) => updateItem(idx, "productName", e.target.value)} className="w-full rounded border border-line px-2 py-1.5 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  <div className="col-span-2">
                    <label className="mb-0.5 block text-xs">Ordered Qty *</label>
                    <input required type="number" min={0} step={0.0001} value={item.orderedQty} onChange={(e) => updateItem(idx, "orderedQty", e.target.value)} className="w-full rounded border border-line px-2 py-1.5 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-0.5 block text-xs">Received Qty *</label>
                    <input required type="number" min={0} step={0.0001} value={item.receivedQty} onChange={(e) => updateItem(idx, "receivedQty", e.target.value)} className="w-full rounded border border-line px-2 py-1.5 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-0.5 block text-xs">Unit Cost *</label>
                    <input required type="number" min={0} step={0.01} value={item.unitCost} onChange={(e) => updateItem(idx, "unitCost", e.target.value)} className="w-full rounded border border-line px-2 py-1.5 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-0.5 block text-xs">UOM</label>
                    <input value={item.uomCode} onChange={(e) => updateItem(idx, "uomCode", e.target.value)} className="w-full rounded border border-line px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs">Batch Number</label>
                    <input value={item.batchNumber} onChange={(e) => updateItem(idx, "batchNumber", e.target.value)} className="w-full rounded border border-line px-2 py-1.5 text-sm" />
                  </div>
                  <div className="flex items-end pb-1">
                    {items.length > 1 && <button type="button" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} className="text-xs text-red-500">Remove</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="submit" disabled={saving} className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving..." : "Record GRN"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Supplier Invoices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type SupplierInvoice = { id: string; reference: string; invoiceNumber: string; status: string; totalAmount: number; balanceDue: number; invoiceDate: string; dueDate?: string; supplier: { name: string } };

export function SupplierInvoicesPage() {
  const [rows, setRows] = useState<SupplierInvoice[]>([]);
  const [status, setStatus] = useState("");
  const opts = useProcurementOptions();
  const [form, setForm] = useState({ supplierId: "", invoiceNumber: "", invoiceDate: "", dueDate: "", subtotal: "", taxAmount: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  function load() {
    const q = status ? `?status=${status}` : "";
    apiFetch<ApiEnvelope<SupplierInvoice[]>>(`/procurement/invoices${q}`).then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, [status]);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/invoices", {
        method: "POST",
        body: JSON.stringify({ ...form, subtotal: Number(form.subtotal), taxAmount: form.taxAmount ? Number(form.taxAmount) : 0, dueDate: form.dueDate || undefined }),
      });
      setShowForm(false);
      setForm({ supplierId: "", invoiceNumber: "", invoiceDate: "", dueDate: "", subtotal: "", taxAmount: "", notes: "" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Supplier Invoices</h1>
          <button onClick={() => setShowForm((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            {showForm ? "Cancel" : "+ Add Invoice"}
          </button>
        </div>
        <ProcurementNav />
        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">New Invoice</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium">Supplier *</label>
                <select required value={form.supplierId} onChange={f("supplierId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” Select â€”</option>
                  {opts.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Invoice Number *</label>
                <input required value={form.invoiceNumber} onChange={f("invoiceNumber")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Invoice Date *</label>
                <input required type="date" value={form.invoiceDate} onChange={f("invoiceDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Due Date</label>
                <input type="date" value={form.dueDate} onChange={f("dueDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Subtotal *</label>
                <input required type="number" min={0} step={0.01} value={form.subtotal} onChange={f("subtotal")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Tax Amount</label>
                <input type="number" min={0} step={0.01} value={form.taxAmount} onChange={f("taxAmount")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <button type="submit" disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {saving ? "Saving..." : "Save Invoice"}
                </button>
              </div>
            </form>
          </div>
        )}
        <div className="flex gap-3">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            {["PENDING", "MATCHED", "APPROVED", "PAID", "DISPUTED", "OVERDUE"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <DataTable
          columns={[
            { key: "reference", label: "Ref" },
            { key: "invoiceNumber", label: "Invoice No." },
            { key: "supplier", label: "Supplier", render: (r) => r.supplier?.name ?? "â€”" },
            { key: "invoiceDate", label: "Date", render: (r) => fmt(r.invoiceDate as string) },
            { key: "dueDate", label: "Due", render: (r) => fmt(r.dueDate as string) },
            { key: "totalAmount", label: "Total", render: (r) => money(r.totalAmount) },
            { key: "balanceDue", label: "Balance", render: (r) => money(r.balanceDue) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No invoices yet"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Procurement Payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ProcurementPayment = { id: string; reference: string; amount: number; paymentDate: string; paymentMethod: string; description: string; supplier: { name: string }; invoice?: { invoiceNumber: string } };

export function ProcurementPaymentsPage() {
  const [rows, setRows] = useState<ProcurementPayment[]>([]);
  const opts = useProcurementOptions();
  const [form, setForm] = useState({ supplierId: "", invoiceId: "", amount: "", paymentDate: "", paymentMethod: "BANK_TRANSFER", bankAccountId: "", description: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<ProcurementPayment[]>>("/procurement/payments").then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/payments", {
        method: "POST",
        body: JSON.stringify({ ...form, amount: Number(form.amount), invoiceId: form.invoiceId || undefined, bankAccountId: form.bankAccountId || undefined }),
      });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Supplier Payments</h1>
          <button onClick={() => setShowForm((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            {showForm ? "Cancel" : "+ Record Payment"}
          </button>
        </div>
        <ProcurementNav />
        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">Record Payment</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium">Supplier *</label>
                <select required value={form.supplierId} onChange={f("supplierId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” Select â€”</option>
                  {opts.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Amount *</label>
                <input required type="number" min={0.01} step={0.01} value={form.amount} onChange={f("amount")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Payment Date *</label>
                <input required type="date" value={form.paymentDate} onChange={f("paymentDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Payment Method *</label>
                <select required value={form.paymentMethod} onChange={f("paymentMethod")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  {["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "OTHER"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium">Description *</label>
                <input required value={form.description} onChange={f("description")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Bank Account</label>
                <select value={form.bankAccountId} onChange={f("bankAccountId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” None â€”</option>
                  {opts.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.accountName} ({b.bankName})</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {saving ? "Saving..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        )}
        <DataTable
          columns={[
            { key: "reference", label: "Reference" },
            { key: "supplier", label: "Supplier", render: (r) => r.supplier?.name ?? "â€”" },
            { key: "invoice", label: "Invoice", render: (r) => r.invoice?.invoiceNumber ?? "â€”" },
            { key: "amount", label: "Amount", render: (r) => money(r.amount) },
            { key: "paymentMethod", label: "Method", render: (r) => (r.paymentMethod as string).replace(/_/g, " ") },
            { key: "description", label: "Description" },
            { key: "paymentDate", label: "Date", render: (r) => fmt(r.paymentDate as string) },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No payments recorded"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Supplier Performance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type PerformanceRecord = { id: string; period: string; rating: string; qualityScore: number; onTimeDelivery: boolean; totalOrders: number; lateDeliveries: number; notes?: string; supplier: { name: string; code: string } };

export function SupplierPerformancePage() {
  const [rows, setRows] = useState<PerformanceRecord[]>([]);
  const opts = useProcurementOptions();
  const [form, setForm] = useState({ supplierId: "", period: "", rating: "GOOD", onTimeDelivery: true, qualityScore: "80", priceCompetitiveness: "", responsiveness: "", totalOrders: "", lateDeliveries: "", rejectedItems: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<PerformanceRecord[]>>("/procurement/performance").then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/performance", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          qualityScore: Number(form.qualityScore),
          priceCompetitiveness: form.priceCompetitiveness ? Number(form.priceCompetitiveness) : undefined,
          responsiveness: form.responsiveness ? Number(form.responsiveness) : undefined,
          totalOrders: form.totalOrders ? Number(form.totalOrders) : undefined,
          lateDeliveries: form.lateDeliveries ? Number(form.lateDeliveries) : undefined,
          rejectedItems: form.rejectedItems ? Number(form.rejectedItems) : undefined,
        }),
      });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Supplier Performance</h1>
          <button onClick={() => setShowForm((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            {showForm ? "Cancel" : "+ Add Record"}
          </button>
        </div>
        <ProcurementNav />
        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">Performance Record</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium">Supplier *</label>
                <select required value={form.supplierId} onChange={f("supplierId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” Select â€”</option>
                  {opts.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Period (e.g. 2025-Q1) *</label>
                <input required value={form.period} onChange={f("period")} placeholder="2025-Q1" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Rating *</label>
                <select required value={form.rating} onChange={f("rating")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  {["EXCELLENT", "GOOD", "SATISFACTORY", "POOR", "UNACCEPTABLE"].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Quality Score (0-100) *</label>
                <input required type="number" min={0} max={100} value={form.qualityScore} onChange={f("qualityScore")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Total Orders</label>
                <input type="number" min={0} value={form.totalOrders} onChange={f("totalOrders")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Late Deliveries</label>
                <input type="number" min={0} value={form.lateDeliveries} onChange={f("lateDeliveries")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="onTime" checked={!!form.onTimeDelivery} onChange={f("onTimeDelivery")} />
                <label htmlFor="onTime" className="text-sm">On-time delivery</label>
              </div>
              <div className="col-span-2">
                <button type="submit" disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {saving ? "Saving..." : "Save Record"}
                </button>
              </div>
            </form>
          </div>
        )}
        <DataTable
          columns={[
            { key: "supplier", label: "Supplier", render: (r) => r.supplier?.name ?? "â€”" },
            { key: "period", label: "Period" },
            { key: "rating", label: "Rating", render: (r) => <StatusBadge status={r.rating as string} /> },
            { key: "qualityScore", label: "Quality Score", render: (r) => `${r.qualityScore}%` },
            { key: "onTimeDelivery", label: "On Time", render: (r) => (r.onTimeDelivery ? "Yes" : "No") },
            { key: "totalOrders", label: "Orders" },
            { key: "lateDeliveries", label: "Late" },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No performance records yet"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Price History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type PriceHistoryRow = { id: string; productName: string; unitPrice: number; currency: string; effectiveDate: string; notes?: string; supplier: { name: string; code: string } };

export function PriceHistoryPage() {
  const [rows, setRows] = useState<PriceHistoryRow[]>([]);
  const opts = useProcurementOptions();
  const [form, setForm] = useState({ supplierId: "", productName: "", unitPrice: "", currency: "GHS", effectiveDate: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<PriceHistoryRow[]>>("/procurement/price-history").then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/price-history", {
        method: "POST",
        body: JSON.stringify({ ...form, unitPrice: Number(form.unitPrice) }),
      });
      setShowForm(false);
      setForm({ supplierId: "", productName: "", unitPrice: "", currency: "GHS", effectiveDate: "", notes: "" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Price History</h1>
          <button onClick={() => setShowForm((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            {showForm ? "Cancel" : "+ Add Price"}
          </button>
        </div>
        <ProcurementNav />
        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">Record Price</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium">Supplier *</label>
                <select required value={form.supplierId} onChange={f("supplierId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” Select â€”</option>
                  {opts.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Product / Item *</label>
                <input required value={form.productName} onChange={f("productName")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Unit Price *</label>
                <input required type="number" min={0} step={0.01} value={form.unitPrice} onChange={f("unitPrice")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Effective Date *</label>
                <input required type="date" value={form.effectiveDate} onChange={f("effectiveDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <button type="submit" disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {saving ? "Saving..." : "Save Price"}
                </button>
              </div>
            </form>
          </div>
        )}
        <DataTable
          columns={[
            { key: "supplier", label: "Supplier", render: (r) => r.supplier?.name ?? "â€”" },
            { key: "productName", label: "Product" },
            { key: "unitPrice", label: "Unit Price", render: (r) => money(r.unitPrice) },
            { key: "currency", label: "Currency" },
            { key: "effectiveDate", label: "Effective Date", render: (r) => fmt(r.effectiveDate as string) },
            { key: "notes", label: "Notes" },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No price history yet"
        />
      </div>
    </AppShell>
  );
}


