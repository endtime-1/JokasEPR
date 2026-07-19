"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Plus, ShieldCheck } from "lucide-react";
import { SoyaProcessingShell } from "./soya-processing-shell";
import { DataTable } from "./data-table";
import { FormField } from "./form-field";
import { ApiEnvelope, apiFetch, downloadReport } from "../lib/api";

type Option = {
  id: string;
  branchId?: string;
  productionSiteId?: string;
  code?: string;
  sku?: string;
  name?: string;
  type?: string;
  receiptNumber?: string;
  batchNumber?: string;
  supplierName?: string;
};

type SoyaOptions = {
  productionSites: Option[];
  warehouses: Option[];
  products: Option[];
  intakes: Option[];
  batches: Option[];
};

const inputClass = "min-h-11 rounded-md border border-line px-3";
const today = () => new Date().toISOString().slice(0, 10);

function useSoyaOptions() {
  const [options, setOptions] = useState<SoyaOptions>({ productionSites: [], warehouses: [], products: [], intakes: [], batches: [] });
  useEffect(() => {
    apiFetch<ApiEnvelope<SoyaOptions>>("/soya-processing/options")
      .then((response) => setOptions(response.data ?? { productionSites: [], warehouses: [], products: [], intakes: [], batches: [] }))
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
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/soya-processing/intakes">Intakes</Link>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/soya-processing/batches">Batches</Link>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/soya-processing/quality-control">QC</Link>
      </div>
    </div>
  );
}

function number(value: unknown) {
  return Number(value ?? 0).toLocaleString("en-GH", { maximumFractionDigits: 2 });
}

function money(value: unknown) {
  return `GHS ${number(value)}`;
}

function products(options: SoyaOptions, matcher: (option: Option) => boolean) {
  return options.products.filter(matcher);
}

function productBySku(options: SoyaOptions, sku: string) {
  return options.products.find((product) => product.sku === sku)?.id ?? "";
}

export function SoyaIntakesPage({ create = false }: { create?: boolean }) {
  const options = useSoyaOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ productionSiteId: "", warehouseId: "", productId: "", receiptNumber: "", supplierName: "", quantityKg: "", unitCost: "", moisturePercent: "", qualityStatus: "APPROVED", receivedAt: today() });
  const beanProducts = products(options, (product) => product.sku?.includes("SOYA-BEANS") ?? false);

  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/intakes");
    setRows(response.data ?? []);
  }
  useEffect(() => { load().catch(() => undefined); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/soya-processing/intakes", { method: "POST", body: JSON.stringify({ ...form, productionSiteId: form.productionSiteId || options.productionSites[0]?.id, warehouseId: form.warehouseId || options.warehouses[0]?.id, productId: form.productId || beanProducts[0]?.id, quantityKg: Number(form.quantityKg), unitCost: Number(form.unitCost), moisturePercent: Number(form.moisturePercent || 0), receivedAt: form.receivedAt }) });
    await load();
  }

  return (
    <SoyaProcessingShell>
      <PageHeader title={create ? "Create Soya Bean Intake" : "Soya Bean Intakes"} subtitle="Record supplier, received quantity, cost, moisture, and intake quality status." />
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
          <SelectField label="Production site" value={form.productionSiteId || options.productionSites[0]?.id || ""} options={options.productionSites} onChange={(value) => setForm({ ...form, productionSiteId: value })} />
          <SelectField label="Warehouse" value={form.warehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
          <SelectField label="Bean product" value={form.productId || beanProducts[0]?.id || ""} options={beanProducts} onChange={(value) => setForm({ ...form, productId: value })} />
          <FormField label="Receipt number"><input className={inputClass} value={form.receiptNumber} onChange={(event) => setForm({ ...form, receiptNumber: event.target.value })} required /></FormField>
          <FormField label="Supplier"><input className={inputClass} value={form.supplierName} onChange={(event) => setForm({ ...form, supplierName: event.target.value })} required /></FormField>
          <FormField label="Quantity kg"><input className={inputClass} type="number" value={form.quantityKg} onChange={(event) => setForm({ ...form, quantityKg: event.target.value })} required /></FormField>
          <FormField label="Unit cost"><input className={inputClass} type="number" value={form.unitCost} onChange={(event) => setForm({ ...form, unitCost: event.target.value })} required /></FormField>
          <FormField label="Moisture %"><input className={inputClass} type="number" value={form.moisturePercent} onChange={(event) => setForm({ ...form, moisturePercent: event.target.value })} /></FormField>
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4"><Plus aria-hidden className="h-4 w-4" /> Save intake</button>
        </form>
      ) : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/soya-processing/intakes/create"><Plus aria-hidden className="h-4 w-4" /> Create intake</Link>}
      <SimpleRowsTable rows={rows} />
    </SoyaProcessingShell>
  );
}

export function SoyaBatchesPage({ create = false }: { create?: boolean }) {
  const options = useSoyaOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ productionSiteId: "", rawWarehouseId: "", oilWarehouseId: "", cakeWarehouseId: "", intakeId: "", beansUsedKg: "", oilProducedLitres: "", cakeProducedKg: "", wasteKg: "", laborCost: "", packagingCost: "", overheadCost: "", expectedOilSalesValue: "", expectedCakeSalesValue: "", processingDate: today() });

  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/batches");
    setRows(response.data ?? []);
  }
  useEffect(() => { load().catch(() => undefined); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/soya-processing/batches", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        productionSiteId: form.productionSiteId || options.productionSites[0]?.id,
        rawWarehouseId: form.rawWarehouseId || options.warehouses[0]?.id,
        oilWarehouseId: form.oilWarehouseId || options.warehouses[0]?.id,
        cakeWarehouseId: form.cakeWarehouseId || options.warehouses[0]?.id,
        intakeId: form.intakeId || undefined,
        beanProductId: productBySku(options, "SOYA-BEANS-RAW"),
        oilProductId: productBySku(options, "SOYA-OIL"),
        cakeProductId: productBySku(options, "SOYA-CAKE"),
        beansUsedKg: Number(form.beansUsedKg),
        oilProducedLitres: Number(form.oilProducedLitres),
        cakeProducedKg: Number(form.cakeProducedKg),
        wasteKg: Number(form.wasteKg || 0),
        laborCost: Number(form.laborCost || 0),
        packagingCost: Number(form.packagingCost || 0),
        overheadCost: Number(form.overheadCost || 0),
        expectedOilSalesValue: Number(form.expectedOilSalesValue || 0),
        expectedCakeSalesValue: Number(form.expectedCakeSalesValue || 0)
      })
    });
    await load();
  }

  return (
    <SoyaProcessingShell>
      <PageHeader title={create ? "Create Processing Batch" : "Soya Processing Batches"} subtitle="Post soya processing batches and calculate oil yield, cake yield, loss, costs, and profitability." />
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
          <SelectField label="Production site" value={form.productionSiteId || options.productionSites[0]?.id || ""} options={options.productionSites} onChange={(value) => setForm({ ...form, productionSiteId: value })} />
          <SelectField label="Raw warehouse" value={form.rawWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, rawWarehouseId: value })} />
          <SelectField label="Oil warehouse" value={form.oilWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, oilWarehouseId: value })} />
          <SelectField label="Cake warehouse" value={form.cakeWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, cakeWarehouseId: value })} />
          <SelectField label="Intake" value={form.intakeId || ""} options={options.intakes.map((item) => ({ ...item, name: item.receiptNumber }))} onChange={(value) => setForm({ ...form, intakeId: value })} />
          {[
            ["beansUsedKg", "Beans used kg"],
            ["oilProducedLitres", "Oil produced L"],
            ["cakeProducedKg", "Cake produced kg"],
            ["wasteKg", "Waste kg"],
            ["laborCost", "Labor cost"],
            ["packagingCost", "Packaging cost"],
            ["overheadCost", "Overhead cost"],
            ["expectedOilSalesValue", "Oil sales value"],
            ["expectedCakeSalesValue", "Cake sales value"]
          ].map(([key, label]) => <FormField key={key} label={label}><input className={inputClass} type="number" value={form[key as keyof typeof form]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></FormField>)}
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4"><Plus aria-hidden className="h-4 w-4" /> Save batch</button>
        </form>
      ) : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/soya-processing/batches/create"><Plus aria-hidden className="h-4 w-4" /> Create batch</Link>}
      <SimpleRowsTable rows={rows} />
    </SoyaProcessingShell>
  );
}

export function SoyaQualityPage() {
  const options = useSoyaOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ productionBatchId: "", moisturePercent: "", oilPurityPercent: "", cakeProteinPercent: "", status: "APPROVED", notes: "" });
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/quality-checks");
    setRows(response.data ?? []);
  }
  useEffect(() => { load().catch(() => undefined); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/soya-processing/quality-checks", { method: "POST", body: JSON.stringify({ productionBatchId: form.productionBatchId || options.batches[0]?.id, moisturePercent: Number(form.moisturePercent || 0), oilPurityPercent: Number(form.oilPurityPercent || 0), cakeProteinPercent: Number(form.cakeProteinPercent || 0), status: form.status, notes: form.notes }) });
    await load();
  }
  return (
    <SoyaProcessingShell>
      <PageHeader title="Soya Quality Control" subtitle="Approve soya oil purity, cake protein, moisture, and batch quality status." />
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-5">
        <SelectField label="Batch" value={form.productionBatchId || options.batches[0]?.id || ""} options={options.batches.map((batch) => ({ ...batch, name: batch.batchNumber }))} onChange={(value) => setForm({ ...form, productionBatchId: value })} />
        <FormField label="Moisture %"><input className={inputClass} type="number" value={form.moisturePercent} onChange={(event) => setForm({ ...form, moisturePercent: event.target.value })} /></FormField>
        <FormField label="Oil purity %"><input className={inputClass} type="number" value={form.oilPurityPercent} onChange={(event) => setForm({ ...form, oilPurityPercent: event.target.value })} /></FormField>
        <FormField label="Cake protein %"><input className={inputClass} type="number" value={form.cakeProteinPercent} onChange={(event) => setForm({ ...form, cakeProteinPercent: event.target.value })} /></FormField>
        <FormField label="Status"><select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>APPROVED</option><option>ACCEPTED</option><option>REJECTED</option><option>PENDING</option></select></FormField>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-5"><ShieldCheck aria-hidden className="h-4 w-4" /> Save quality check</button>
      </form>
      <SimpleRowsTable rows={rows} />
    </SoyaProcessingShell>
  );
}

export function SoyaStockPage({ type }: { type: "oil" | "cake" }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>(`/soya-processing/${type}-stock`)
      .then((response) => setRows(response.data ?? []))
      .catch(() => undefined);
  }, [type]);
  return (
    <SoyaProcessingShell>
      <PageHeader title={type === "oil" ? "Soya Oil Stock" : "Soya Cake Stock"} subtitle="Production output stock by warehouse, batch, unit cost, and quantity." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90" href="/soya-processing/batches/create">
          <Plus aria-hidden className="h-4 w-4" /> Record new processing batch
        </Link>
        <p className="text-sm text-ink/55">
          {type === "oil" ? "Oil" : "Cake"} stock is added automatically when you post a soya processing batch.
        </p>
      </div>
      <SimpleRowsTable rows={rows} />
    </SoyaProcessingShell>
  );
}

export function SoyaTransferPage() {
  const options = useSoyaOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ productionBatchId: "", fromWarehouseId: "", toWarehouseId: "", toProductionSiteId: "", outputType: "CAKE", productId: "", quantity: "", notes: "" });
  const outputProducts = useMemo(() => products(options, (product) => ["SOYA-OIL", "SOYA-CAKE"].includes(product.sku ?? "")), [options]);
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/transfers");
    setRows(response.data ?? []);
  }
  useEffect(() => { load().catch(() => undefined); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/soya-processing/transfers", { method: "POST", body: JSON.stringify({ ...form, productionBatchId: form.productionBatchId || options.batches[0]?.id, fromWarehouseId: form.fromWarehouseId || options.warehouses[0]?.id, toWarehouseId: form.toWarehouseId || options.warehouses[0]?.id, toProductionSiteId: form.toProductionSiteId || undefined, productId: form.productId || outputProducts[0]?.id, quantity: Number(form.quantity) }) });
    await load();
  }
  return (
    <SoyaProcessingShell>
      <PageHeader title="Soya Internal Transfer" subtitle="Transfer soya cake to feed production inventory or move oil and cake between warehouses." />
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-5">
        <SelectField label="Batch" value={form.productionBatchId || options.batches[0]?.id || ""} options={options.batches.map((batch) => ({ ...batch, name: batch.batchNumber }))} onChange={(value) => setForm({ ...form, productionBatchId: value })} />
        <SelectField label="From warehouse" value={form.fromWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, fromWarehouseId: value })} />
        <SelectField label="To warehouse" value={form.toWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, toWarehouseId: value })} />
        <SelectField label="Product" value={form.productId || outputProducts[0]?.id || ""} options={outputProducts} onChange={(value) => setForm({ ...form, productId: value })} />
        <FormField label="Output type"><select className={inputClass} value={form.outputType} onChange={(event) => setForm({ ...form, outputType: event.target.value })}><option>CAKE</option><option>OIL</option></select></FormField>
        <FormField label="Quantity"><input className={inputClass} type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required /></FormField>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-5">Create transfer</button>
      </form>
      <SimpleRowsTable rows={rows} />
    </SoyaProcessingShell>
  );
}

export function SoyaReportsPage() {
  return (
    <SoyaProcessingShell>
      <PageHeader title="Soya Production Reports" subtitle="Export soya profitability, yield, loss, cost, quality, stock, transfer, and sales reports." />
      <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" onClick={() => downloadReport("/soya-processing/reports/summary.csv", "soya-processing-summary.csv")}>
        <Download aria-hidden className="h-4 w-4" /> Download soya profitability CSV
      </button>
    </SoyaProcessingShell>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return (
    <FormField label={label}>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.code ?? option.sku ?? option.receiptNumber ?? option.batchNumber ?? ""} {option.name ?? option.supplierName ?? ""}</option>)}
      </select>
    </FormField>
  );
}

function SimpleRowsTable({ rows }: { rows: Record<string, unknown>[] }) {
  const keys = Object.keys(rows[0] ?? {}).filter((key) => !["id", "companyId", "branchId", "deletedAt", "updatedAt"].includes(key)).slice(0, 8);
  return <DataTable rows={rows} empty="No records found" columns={keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, unknown>) => typeof row[key] === "object" && row[key] !== null ? JSON.stringify(row[key]).slice(0, 80) : String(row[key] ?? "-").slice(0, 90) }))} />;
}

