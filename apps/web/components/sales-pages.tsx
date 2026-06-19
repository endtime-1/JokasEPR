"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Plus, Save, Send } from "lucide-react";
import { AppShell } from "./app-shell";
import { DataTable } from "./data-table";
import { FormField } from "./form-field";
import { ApiEnvelope, apiFetch, downloadReport } from "../lib/api";

type Option = {
  id: string;
  code?: string;
  sku?: string;
  name?: string;
  invoiceNumber?: string;
  balanceDue?: string | number;
  customerId?: string;
  product?: { sku: string; name: string };
  customerGroup?: { code: string; name: string };
};

type SalesOptions = {
  branches: Option[];
  warehouses: Option[];
  products: Option[];
  customerGroups: Option[];
  customers: Option[];
  priceLists: Option[];
  invoices: Option[];
};

const inputClass = "min-h-11 rounded-md border border-line px-3";

function useSalesOptions() {
  const [options, setOptions] = useState<SalesOptions>({ branches: [], warehouses: [], products: [], customerGroups: [], customers: [], priceLists: [], invoices: [] });
  useEffect(() => {
    apiFetch<ApiEnvelope<SalesOptions>>("/sales/options")
      .then((response) => setOptions(response.data))
      .catch(() => undefined);
  }, []);
  return options;
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-ink/65">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/sales/customers">Customers</Link>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/sales/orders">Orders</Link>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/sales/invoices">Invoices</Link>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/sales/reports">Reports</Link>
      </div>
    </div>
  );
}

function money(value: unknown) {
  return `GHS ${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function number(value: unknown) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function SalesDashboardPage() {
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>>>("/sales/dashboard")
      .then((response) => setDashboard(response.data))
      .catch(() => undefined);
  }, []);
  const cards: Array<[string, unknown, "money" | "number"]> = [
    ["Sales value", dashboard?.salesValue, "money"],
    ["Collections", dashboard?.paidValue, "money"],
    ["Outstanding debt", dashboard?.outstandingDebt, "money"],
    ["Returns", dashboard?.returnValue, "money"],
    ["Pending stock release", dashboard?.pendingStockApprovals, "number"],
    ["Fulfilled orders", dashboard?.fulfilledOrders, "number"]
  ];
  return (
    <AppShell>
      <PageHeader title="Sales Dashboard" subtitle="Customer sales, stock release, invoices, payments, returns, and debtor exposure." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value, type]) => (
          <article key={label} className="rounded-md border border-line bg-white p-4 shadow-panel">
            <p className="text-sm text-ink/65">{label}</p>
            <strong className="mt-3 block text-2xl font-semibold">{type === "money" ? money(value) : number(value)}</strong>
          </article>
        ))}
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <div>
          <h3 className="mb-3 text-lg font-semibold">Recent orders</h3>
          <SimpleRowsTable rows={(dashboard?.recentOrders as Record<string, unknown>[]) ?? []} />
        </div>
        <div>
          <h3 className="mb-3 text-lg font-semibold">Top products</h3>
          <SimpleRowsTable rows={(dashboard?.topProducts as Record<string, unknown>[]) ?? []} />
        </div>
      </section>
    </AppShell>
  );
}

export function CustomersPage({ create = false }: { create?: boolean }) {
  const options = useSalesOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ branchId: "", customerGroupId: "", code: "", name: "", phone: "", email: "", address: "", creditLimit: "" });
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/sales/customers");
    setRows(response.data);
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/sales/customers", {
      method: "POST",
      body: JSON.stringify({ ...form, branchId: form.branchId || options.branches[0]?.id, customerGroupId: form.customerGroupId || options.customerGroups[0]?.id || undefined, creditLimit: Number(form.creditLimit || 0) })
    });
    setForm({ branchId: "", customerGroupId: "", code: "", name: "", phone: "", email: "", address: "", creditLimit: "" });
    await load();
  }
  return (
    <AppShell>
      <PageHeader title={create ? "Create Customer" : "Customer List"} subtitle="Customer registration, categories, credit limits, and account status." />
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-3">
          <SelectField label="Branch" value={form.branchId || options.branches[0]?.id || ""} options={options.branches} onChange={(value) => setForm({ ...form, branchId: value })} />
          <SelectField label="Customer group" value={form.customerGroupId || options.customerGroups[0]?.id || ""} options={options.customerGroups} onChange={(value) => setForm({ ...form, customerGroupId: value })} />
          <TextField label="Code" value={form.code} onChange={(value) => setForm({ ...form, code: value })} required />
          <TextField label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
          <TextField label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <TextField label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <TextField label="Address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
          <TextField label="Credit limit" type="number" value={form.creditLimit} onChange={(value) => setForm({ ...form, creditLimit: value })} />
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-3"><Save aria-hidden className="h-4 w-4" /> Save customer</button>
        </form>
      ) : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/sales/customers/create"><Plus aria-hidden className="h-4 w-4" /> Create customer</Link>}
      <SimpleRowsTable rows={rows} />
    </AppShell>
  );
}

export function CustomerDetailsPage({ id }: { id: string }) {
  const [customer, setCustomer] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>>>(`/sales/customers/${id}`)
      .then((response) => setCustomer(response.data))
      .catch(() => undefined);
  }, [id]);
  return (
    <AppShell>
      <PageHeader title={String(customer?.name ?? "Customer Details")} subtitle="Orders, invoices, payments, credit exposure, and account statement history." />
      <section className="grid gap-6 xl:grid-cols-2">
        <SimpleRowsTable rows={(customer?.salesOrders as Record<string, unknown>[]) ?? []} />
        <SimpleRowsTable rows={(customer?.statements as Record<string, unknown>[]) ?? []} />
      </section>
    </AppShell>
  );
}

export function OrdersPage({ create = false }: { create?: boolean }) {
  const options = useSalesOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ customerId: "", warehouseId: "", productId: "", quantity: "", unitPrice: "", discountAmount: "", notes: "" });
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/sales/orders");
    setRows(response.data);
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/sales/orders", {
      method: "POST",
      body: JSON.stringify({
        customerId: form.customerId || options.customers[0]?.id,
        warehouseId: form.warehouseId || options.warehouses[0]?.id,
        discountAmount: Number(form.discountAmount || 0),
        notes: form.notes,
        items: [{ productId: form.productId || options.products[0]?.id, quantity: Number(form.quantity), unitPrice: Number(form.unitPrice), discountAmount: 0 }]
      })
    });
    setForm({ ...form, quantity: "", unitPrice: "", discountAmount: "", notes: "" });
    await load();
  }
  async function approve(id: string) {
    await apiFetch(`/sales/orders/${id}/approve-stock-release`, { method: "PATCH" });
    await load();
  }
  return (
    <AppShell>
      <PageHeader title={create ? "Create Sales Order" : "Sales Orders"} subtitle="Sales orders reserve commercial intent; storekeepers approve stock release before invoice and delivery note posting." />
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
          <SelectField label="Customer" value={form.customerId || options.customers[0]?.id || ""} options={options.customers} onChange={(value) => setForm({ ...form, customerId: value })} />
          <SelectField label="Warehouse" value={form.warehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
          <SelectField label="Product" value={form.productId || options.products[0]?.id || ""} options={options.products} onChange={(value) => setForm({ ...form, productId: value })} />
          <TextField label="Quantity" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} required />
          <TextField label="Unit price" type="number" value={form.unitPrice} onChange={(value) => setForm({ ...form, unitPrice: value })} required />
          <TextField label="Order discount" type="number" value={form.discountAmount} onChange={(value) => setForm({ ...form, discountAmount: value })} />
          <TextField label="Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4"><Send aria-hidden className="h-4 w-4" /> Submit order</button>
        </form>
      ) : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/sales/orders/create"><Plus aria-hidden className="h-4 w-4" /> Create order</Link>}
      {create ? null : <OrdersTable rows={rows} onApprove={approve} />}
    </AppShell>
  );
}

export function PaymentsPage() {
  const options = useSalesOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ customerId: "", invoiceId: "", amount: "", method: "BANK_TRANSFER", reference: "" });
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/sales/payments");
    setRows(response.data);
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/sales/payments", { method: "POST", body: JSON.stringify({ ...form, customerId: form.customerId || options.customers[0]?.id, invoiceId: form.invoiceId || undefined, amount: Number(form.amount) }) });
    setForm({ ...form, amount: "", reference: "" });
    await load();
  }
  return (
    <AppShell>
      <PageHeader title="Payments" subtitle="Accountant-controlled payment posting with receipt generation and customer debt reduction." />
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-5">
        <SelectField label="Customer" value={form.customerId || options.customers[0]?.id || ""} options={options.customers} onChange={(value) => setForm({ ...form, customerId: value })} />
        <SelectField label="Invoice" value={form.invoiceId || ""} options={options.invoices} onChange={(value) => setForm({ ...form, invoiceId: value })} />
        <TextField label="Amount" type="number" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} required />
        <FormField label="Method"><select className={inputClass} value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}><option>CASH</option><option>BANK_TRANSFER</option><option>MOBILE_MONEY</option><option>CHEQUE</option><option>CREDIT_NOTE</option></select></FormField>
        <TextField label="Reference" value={form.reference} onChange={(value) => setForm({ ...form, reference: value })} />
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-5">Record payment</button>
      </form>
      <SimpleRowsTable rows={rows} />
    </AppShell>
  );
}

export function ReturnsPage() {
  const options = useSalesOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ customerId: "", warehouseId: "", productId: "", quantity: "", unitPrice: "", reason: "" });
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/sales/returns");
    setRows(response.data);
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/sales/returns", { method: "POST", body: JSON.stringify({ ...form, customerId: form.customerId || options.customers[0]?.id, warehouseId: form.warehouseId || options.warehouses[0]?.id, productId: form.productId || options.products[0]?.id, quantity: Number(form.quantity), unitPrice: Number(form.unitPrice), status: "POSTED" }) });
    setForm({ ...form, quantity: "", unitPrice: "", reason: "" });
    await load();
  }
  return (
    <AppShell>
      <PageHeader title="Sales Returns" subtitle="Returned stock is posted back to inventory and credited to the customer statement." />
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-3">
        <SelectField label="Customer" value={form.customerId || options.customers[0]?.id || ""} options={options.customers} onChange={(value) => setForm({ ...form, customerId: value })} />
        <SelectField label="Warehouse" value={form.warehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
        <SelectField label="Product" value={form.productId || options.products[0]?.id || ""} options={options.products} onChange={(value) => setForm({ ...form, productId: value })} />
        <TextField label="Quantity" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} required />
        <TextField label="Unit price" type="number" value={form.unitPrice} onChange={(value) => setForm({ ...form, unitPrice: value })} required />
        <TextField label="Reason" value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} required />
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-3">Post return</button>
      </form>
      <SimpleRowsTable rows={rows} />
    </AppShell>
  );
}

export function SalesListPage({ title, endpoint, subtitle }: { title: string; endpoint: string; subtitle: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>(endpoint)
      .then((response) => setRows(response.data))
      .catch(() => undefined);
  }, [endpoint]);
  return (
    <AppShell>
      <PageHeader title={title} subtitle={subtitle} />
      <SimpleRowsTable rows={rows} />
    </AppShell>
  );
}

export function SalesReportsPage() {
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>>>("/sales/reports")
      .then((response) => setReport(response.data))
      .catch(() => undefined);
  }, []);
  return (
    <AppShell>
      <PageHeader title="Sales Reports" subtitle="Sales by product, customer, location, and salesperson performance." />
      <button className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" onClick={() => downloadReport("/sales/reports/summary.csv", "sales-summary.csv")}>
        <Download aria-hidden className="h-4 w-4" /> Download sales CSV
      </button>
      <section className="grid gap-6 xl:grid-cols-2">
        <ReportBlock title="By product" rows={(report?.byProduct as Record<string, unknown>[]) ?? []} />
        <ReportBlock title="By customer" rows={(report?.byCustomer as Record<string, unknown>[]) ?? []} />
        <ReportBlock title="By location" rows={(report?.byLocation as Record<string, unknown>[]) ?? []} />
        <ReportBlock title="Salesperson" rows={(report?.salesperson as Record<string, unknown>[]) ?? []} />
      </section>
    </AppShell>
  );
}

function ReportBlock({ title, rows }: { title: string; rows: Record<string, unknown>[] }) {
  return (
    <div>
      <h3 className="mb-3 text-lg font-semibold">{title}</h3>
      <SimpleRowsTable rows={rows} />
    </div>
  );
}

function OrdersTable({ rows, onApprove }: { rows: Record<string, unknown>[]; onApprove: (id: string) => void }) {
  return (
    <DataTable
      rows={rows}
      empty="No sales orders found"
      columns={[
        { key: "orderNumber", label: "Order", render: (row) => String(row.orderNumber ?? "-") },
        { key: "customer", label: "Customer", render: (row) => String((row.customer as Option | undefined)?.name ?? "-") },
        { key: "status", label: "Status", render: (row) => String(row.status ?? "-") },
        { key: "totalAmount", label: "Total", render: (row) => money(row.totalAmount) },
        { key: "balanceDue", label: "Balance", render: (row) => money(row.balanceDue) },
        { key: "actions", label: "Actions", render: (row) => row.status === "PENDING_STOCK_APPROVAL" ? <button className="rounded-md border border-line px-3 py-2 text-xs font-semibold hover:bg-field" onClick={() => onApprove(String(row.id))}>Approve stock</button> : "-" }
      ]}
    />
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return (
    <FormField label={label}>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.code ?? option.sku ?? option.invoiceNumber ?? option.product?.sku ?? ""} {option.name ?? option.product?.name ?? option.customerGroup?.name ?? ""}{option.balanceDue ? ` - ${money(option.balanceDue)}` : ""}</option>)}
      </select>
    </FormField>
  );
}

function TextField({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <FormField label={label}>
      <input className={inputClass} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </FormField>
  );
}

function SimpleRowsTable({ rows }: { rows: Record<string, unknown>[] }) {
  const keys = Object.keys(rows[0] ?? {}).filter((key) => !["id", "companyId", "branchId", "deletedAt", "updatedAt"].includes(key)).slice(0, 8);
  return <DataTable rows={rows} empty="No records found" columns={keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, unknown>) => typeof row[key] === "object" && row[key] !== null ? JSON.stringify(row[key]).slice(0, 80) : String(row[key] ?? "-").slice(0, 90) }))} />;
}

