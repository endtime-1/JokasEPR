"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Download, PackagePlus, Plus, Upload } from "lucide-react";
import { FormField } from "../form-field";
import { Badge, Modal, Spinner } from "../ui";
import { downloadText, errMsg, finGet, finSend, today, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { Pager, usePaged } from "./fin-banking-parts";
import { FinItem, cedi, qty } from "./fin-pos-api";
import { useSalesLookups } from "./fin-sales-api";
import { control } from "./fin-sales-parts";
import { useFinHeader } from "./fin-shell";

const HEADER: [string, string] = ["Items", "Products and services, stock on hand and its value"];

// ─── Items ───────────────────────────────────────────────────────────────────

export function FinItemsPage() {
  useFinHeader(...HEADER);
  const canCreate = useFinPermission("fin.items.create");
  const canPost = useFinPermission("fin.items.post");
  const canImport = useFinPermission("fin.items.import");
  const [search, setSearch] = useState("");
  const [typed, setTyped] = useState("");
  const [low, setLow] = useState(false);
  const [showOff, setShowOff] = useState(false);
  const list = usePaged<FinItem>(`/items?search=${encodeURIComponent(search)}&lowStock=${low}&activeOnly=${!showOff}`);
  const [editing, setEditing] = useState<FinItem | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<FinItem | null>(null);
  const [importing, setImporting] = useState(false);
  const totals = (list.meta.totals ?? {}) as { items?: number; stockValue?: string };
  useEffect(() => { const t = setTimeout(() => { list.setPage(() => 1); setSearch(typed); }, 250); return () => clearTimeout(t); }, [typed]);

  async function exportCsv() {
    try {
      const r = await finGet<{ csv: string }>("/items/export");
      downloadText(`items-${today()}.csv`, r.data.csv);
    } catch { /* shown by the list */ }
  }

  return (
    <FinGuard permission="fin.items.view">
      <div className="space-y-4">
        <ErrorNote message={list.error} />
        <div className="flex flex-wrap items-center gap-3">
          <input className="app-control w-full sm:w-72" placeholder="Search name, SKU or barcode" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Search items" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={low} onChange={(e) => { list.setPage(() => 1); setLow(e.target.checked); }} /> Low stock only</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Show switched-off</label>
          <span className="text-sm text-ink/55">{totals.items ?? 0} items · stock worth <b className="tabular-nums text-ink">{cedi(totals.stockValue ?? "0")}</b></span>
          <div className="flex-1" />
          <Link href="/fin/items/valuation" className="text-sm font-semibold text-brand hover:underline">Stock valuation</Link>
          <button className="app-button-secondary" onClick={exportCsv}><Download className="h-4 w-4" aria-hidden /> Export</button>
          {canImport && <button className="app-button-secondary" onClick={() => setImporting(true)}><Upload className="h-4 w-4" aria-hidden /> Import</button>}
          {canCreate && <button className="app-button-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden /> Add item</button>}
        </div>
        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Item</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">In stock</th><th className="px-4 py-3 text-right">Avg cost</th><th className="px-4 py-3 text-right">Value</th><th className="w-44" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.rows.map((i) => (
                <tr key={i.id} className={i.isActive ? "" : "opacity-55"}>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold">{i.sku}</td>
                  <td className="px-4 py-2.5">{i.name}{i.barcode && <span className="block text-xs text-ink/45">{i.barcode}</span>}{!i.isActive && <Badge variant="neutral" className="ml-2">Off</Badge>}{i.kind === "SERVICE" && <Badge variant="info" className="ml-2">Service</Badge>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{cedi(i.sellPrice)}<span className="block text-[10px] text-ink/40">{i.priceIncludesTax ? "incl. tax" : "+ tax"}</span></td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${i.lowStock ? "font-semibold text-red-600" : ""}`}>{i.trackStock ? `${qty(i.qtyOnHand)} ${i.unit}` : "—"}{i.lowStock && <span className="block text-[10px]">low</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{i.trackStock ? cedi(i.avgCost) : ""}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{i.trackStock ? cedi(i.stockValue) : ""}</td>
                  <td className="px-2 text-right text-xs font-semibold">
                    {canPost && i.trackStock && i.isActive && <button className="mr-3 text-brand hover:underline" onClick={() => setAdjusting(i)}>Adjust stock</button>}
                    {canCreate && <button className="text-brand hover:underline" onClick={() => setEditing(i)}>Edit</button>}
                  </td>
                </tr>
              ))}
              {list.loading && list.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center"><Spinner /></td></tr>}
              {!list.loading && list.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-ink/50">No items yet. Add one, or import a CSV with opening stock.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={list.page} pages={list.pages} setPage={list.setPage} />
        <ItemModal item={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); list.refresh(); }} />
        <AdjustModal item={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); list.refresh(); }} />
        <ImportModal open={importing} onClose={() => setImporting(false)} onDone={() => { setImporting(false); list.refresh(); }} />
      </div>
    </FinGuard>
  );
}

function ItemModal({ item, onClose, onDone }: { item: FinItem | "new" | null; onClose: () => void; onDone: () => void }) {
  const { income, taxCodes } = useSalesLookups();
  const isNew = item === "new";
  const [f, setF] = useState({ sku: "", name: "", barcode: "", kind: "GOODS", unit: "each", category: "", sellPrice: "", priceIncludesTax: true, taxCodeId: "", incomeAccountId: "", trackStock: true, reorderLevel: "", notes: "", openQty: "", openCost: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!item) return;
    setError("");
    if (item === "new") setF({ sku: "", name: "", barcode: "", kind: "GOODS", unit: "each", category: "", sellPrice: "", priceIncludesTax: true, taxCodeId: "", incomeAccountId: "", trackStock: true, reorderLevel: "", notes: "", openQty: "", openCost: "" });
    else setF({ sku: item.sku, name: item.name, barcode: item.barcode ?? "", kind: item.kind, unit: item.unit, category: item.category ?? "", sellPrice: item.sellPrice, priceIncludesTax: item.priceIncludesTax, taxCodeId: item.taxCodeId ?? "", incomeAccountId: item.incomeAccountId ?? "", trackStock: item.trackStock, reorderLevel: Number(item.reorderLevel) ? item.reorderLevel : "", notes: item.notes ?? "", openQty: "", openCost: "" });
  }, [item]);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const body = {
        name: f.name.trim(), barcode: f.barcode.trim() || null, unit: f.unit.trim() || "each", category: f.category.trim() || null, sellPrice: f.sellPrice.trim() || "0", priceIncludesTax: f.priceIncludesTax,
        taxCodeId: f.taxCodeId || null, incomeAccountId: f.incomeAccountId || null, trackStock: f.kind === "SERVICE" ? false : f.trackStock, reorderLevel: f.reorderLevel.trim() || "0", notes: f.notes.trim() || null
      };
      if (isNew) await finSend("POST", "/items", { ...body, sku: f.sku.trim(), kind: f.kind, ...(f.openQty.trim() ? { openingStock: { quantity: f.openQty.trim(), unitCost: f.openCost.trim() || "0" } } : {}) });
      else await finSend("PATCH", `/items/${(item as FinItem).id}`, body);
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not save the item."));
    } finally {
      setBusy(false);
    }
  }
  async function toggle() {
    if (!item || item === "new") return;
    setBusy(true);
    try { await finSend("PATCH", `/items/${item.id}`, { isActive: !item.isActive }); onDone(); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }
  const service = f.kind === "SERVICE";
  return (
    <Modal open={item !== null} onClose={onClose} title={isNew ? "Add an item" : `Edit ${f.sku}`} size="lg">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="SKU" required><input className={control} value={f.sku} onChange={(e) => set("sku", e.target.value)} disabled={!isNew} maxLength={60} required /></FormField>
          <div className="sm:col-span-2"><FormField label="Name" required><input className={control} value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={200} required /></FormField></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <FormField label="Kind"><select className={control} value={f.kind} onChange={(e) => set("kind", e.target.value)} disabled={!isNew}><option value="GOODS">Goods</option><option value="SERVICE">Service</option></select></FormField>
          <FormField label="Unit"><input className={control} value={f.unit} onChange={(e) => set("unit", e.target.value)} maxLength={20} placeholder="bag, kg, tray" /></FormField>
          <FormField label="Barcode"><input className={control} value={f.barcode} onChange={(e) => set("barcode", e.target.value)} maxLength={80} /></FormField>
          <FormField label="Category"><input className={control} value={f.category} onChange={(e) => set("category", e.target.value)} maxLength={80} /></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <FormField label="Selling price"><input className={`${control} text-right tabular-nums`} inputMode="decimal" value={f.sellPrice} onChange={(e) => set("sellPrice", e.target.value)} /></FormField>
          <FormField label="Price includes tax?"><select className={control} value={f.priceIncludesTax ? "yes" : "no"} onChange={(e) => set("priceIncludesTax", e.target.value === "yes")}><option value="yes">Yes (shelf price)</option><option value="no">No, add tax on top</option></select></FormField>
          <FormField label="Tax code"><select className={control} value={f.taxCodeId} onChange={(e) => set("taxCodeId", e.target.value)}><option value="">No tax</option>{taxCodes.filter((t) => Number(t.currentRate) > 0).map((t) => <option key={t.id} value={t.id}>{t.code} {Number(t.currentRate)}%</option>)}</select></FormField>
          <FormField label="Income account"><select className={control} value={f.incomeAccountId} onChange={(e) => set("incomeAccountId", e.target.value)}><option value="">Default sales</option>{income.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></FormField>
        </div>
        {!service && (
          <div className="grid gap-4 sm:grid-cols-4">
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={f.trackStock} onChange={(e) => set("trackStock", e.target.checked)} disabled={!isNew} /> Track stock</label>
            <FormField label="Reorder level" hint="Flag as low at or below this"><input className={`${control} text-right tabular-nums`} inputMode="decimal" value={f.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value)} /></FormField>
            {isNew && f.trackStock && <FormField label="Opening quantity"><input className={`${control} text-right tabular-nums`} inputMode="decimal" value={f.openQty} onChange={(e) => set("openQty", e.target.value)} /></FormField>}
            {isNew && f.trackStock && <FormField label="Cost per unit"><input className={`${control} text-right tabular-nums`} inputMode="decimal" value={f.openCost} onChange={(e) => set("openCost", e.target.value)} /></FormField>}
          </div>
        )}
        <ErrorNote message={error} />
        <div className="flex items-center justify-between gap-2">
          <div>{!isNew && item && <button type="button" className="text-sm font-semibold text-ink/60 hover:underline" onClick={toggle} disabled={busy}>{item.isActive ? "Switch off" : "Switch on"}</button>}</div>
          <div className="flex gap-2">
            <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="app-button-primary" disabled={busy || !f.name.trim() || (isNew && !f.sku.trim())}>{busy ? <Spinner size="xs" /> : null} Save</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function AdjustModal({ item, onClose, onDone }: { item: FinItem | null; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"count" | "change">("count");
  const [value, setValue] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setMode("count"); setValue(""); setCost(""); setReason(""); setDate(today()); setError(""); }, [item]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!item) return;
    setBusy(true); setError("");
    try {
      await finSend("POST", "/items/adjust", { itemId: item.id, date, reason: reason.trim(), ...(mode === "count" ? { newQuantity: value.trim() } : { quantityChange: value.trim() }), ...(cost.trim() ? { unitCost: cost.trim() } : {}) });
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not adjust the stock."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={item !== null} onClose={onClose} title={`Adjust stock: ${item?.name ?? ""}`} size="md">
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-sm text-ink/65">Now in stock: <b>{item ? `${qty(item.qtyOnHand)} ${item.unit}` : ""}</b>. The difference is posted to the books as a stock gain or loss.</p>
        <div className="flex gap-2 text-sm">
          <button type="button" className={`rounded-lg px-3 py-1.5 ${mode === "count" ? "bg-brand text-white" : "bg-field"}`} onClick={() => setMode("count")}>I counted it</button>
          <button type="button" className={`rounded-lg px-3 py-1.5 ${mode === "change" ? "bg-brand text-white" : "bg-field"}`} onClick={() => setMode("change")}>Add or remove</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={mode === "count" ? "Counted quantity" : "Change (minus to remove)"} required><input className={`${control} text-right tabular-nums`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required /></FormField>
          <FormField label="Cost per unit" hint="Only needed to add stock to an empty item"><input className={`${control} text-right tabular-nums`} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></FormField>
          <FormField label="Date"><input type="date" className={control} value={date} onChange={(e) => setDate(e.target.value)} required /></FormField>
        </div>
        <FormField label="Reason" required><input className={control} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={300} placeholder="Stock count, damaged, found…" required /></FormField>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={busy || !value.trim() || reason.trim().length < 3}>{busy ? <Spinner size="xs" /> : <PackagePlus className="h-4 w-4" aria-hidden />} Adjust</button>
        </div>
      </form>
    </Modal>
  );
}

type Preview = { total: number; toCreate: number; toUpdate: number; errors: number; plans: { line: number; sku: string; name: string; action: "create" | "update" | "error"; messages: string[]; warnings: string[] }[] };

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState(today());
  const [skip, setSkip] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setCsv(""); setName(""); setPreview(null); setResult(""); setError(""); setSkip(false); setDate(today()); } }, [open]);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setPreview(null); setResult("");
    const text = await file.text();
    setCsv(text); setName(file.name);
    try { setPreview((await finSend<Preview>("POST", "/items/import/preview", { csv: text })).data); } catch (err) { setError(errMsg(err, "Could not read that file.")); }
  }
  async function commit() {
    setBusy(true); setError("");
    try {
      const r = await finSend<{ created: number; updated: number; skipped: number; openingValue: string }>("POST", "/items/import", { csv, openingDate: date, skipBadRows: skip });
      setResult(`${r.data.created} created, ${r.data.updated} updated, ${r.data.skipped} skipped. Opening stock worth ${cedi(r.data.openingValue)} was booked.`);
      setPreview(null);
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not import."));
    } finally {
      setBusy(false);
    }
  }
  async function template() {
    try { downloadText("items-template.csv", (await finGet<{ csv: string }>("/items/import/template")).data.csv); } catch (err) { setError(errMsg(err)); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Import items from a CSV" size="lg">
      <div className="grid gap-4">
        <p className="text-sm text-ink/65">One row per item. Columns: sku, name, barcode, type (goods or service), unit, category, price, price_includes_tax, tax_code, track_stock, reorder_level, opening_qty, opening_unit_cost. Existing SKUs are updated (their stock is never changed). <button type="button" className="font-semibold text-brand hover:underline" onClick={template}>Download a template</button></p>
        <input type="file" accept=".csv,.txt" onChange={pick} aria-label="CSV file" className="text-sm" />
        <ErrorNote message={error} />
        {result && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{result}</p>}
        {preview && (
          <>
            <p className="text-sm"><b>{name}</b>: {preview.toCreate} new, {preview.toUpdate} to update, <b className={preview.errors ? "text-red-600" : ""}>{preview.errors} with problems</b>.</p>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
              <table className="w-full text-xs"><tbody className="divide-y divide-line">
                {preview.plans.filter((p) => p.action === "error" || p.warnings.length).slice(0, 40).map((p) => <tr key={p.line}><td className="px-2 py-1 font-mono">line {p.line}</td><td className="px-2 py-1">{p.sku}</td><td className={`px-2 py-1 ${p.action === "error" ? "text-red-600" : "text-amber-700"}`}>{[...p.messages, ...p.warnings].join(" ")}</td></tr>)}
                {preview.errors === 0 && !preview.plans.some((p) => p.warnings.length) && <tr><td className="px-2 py-3 text-center text-ink/50">Every row looks fine.</td></tr>}
              </tbody></table>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Book opening stock on"><input type="date" className={control} value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
              {preview.errors > 0 && <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Skip the rows with problems</label>}
            </div>
            <div className="flex justify-end gap-2"><button className="app-button-secondary" onClick={onClose}>Cancel</button><button className="app-button-primary" disabled={busy || (preview.errors > 0 && !skip) || preview.total === preview.errors} onClick={commit}>{busy ? <Spinner size="xs" /> : null} Import</button></div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── Stock valuation ─────────────────────────────────────────────────────────

type Valuation = { asOf: string; rows: { id: string; sku: string; name: string; unit: string; category: string | null; isActive: boolean; quantity: string; value: string; avgCost: string }[]; totalValue: string; ledgerInventoryBalance: string; difference: string };

export function FinStockValuationPage() {
  useFinHeader(...HEADER);
  const [asOf, setAsOf] = useState(today());
  const [zero, setZero] = useState(false);
  const [data, setData] = useState<Valuation | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    finGet<Valuation>(`/items/valuation?asOf=${asOf}&includeZero=${zero}`).then((r) => { setData(r.data); setError(""); }).catch((e) => setError(errMsg(e, "Could not load the valuation.")));
  }, [asOf, zero]);
  const exportCsv = () => data && downloadText(`stock-valuation-${data.asOf}.csv`, ["SKU,Item,Unit,Quantity,Average cost,Value", ...data.rows.map((r) => [r.sku, `"${r.name.replace(/"/g, '""')}"`, r.unit, r.quantity, r.avgCost, r.value].join(","))].join("\r\n"));
  return (
    <FinGuard permission="fin.items.view">
      <div className="space-y-4">
        <ErrorNote message={error} />
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/fin/items" className="text-sm font-semibold text-brand hover:underline">← Items</Link>
          <FormField label="As at"><input type="date" className="app-control" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></FormField>
          <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={zero} onChange={(e) => setZero(e.target.checked)} /> Include items with no stock</label>
          <div className="flex-1" />
          <button className="app-button-secondary mt-5" onClick={exportCsv} disabled={!data}><Download className="h-4 w-4" aria-hidden /> Export</button>
        </div>
        {!data && !error && <div className="py-10 text-center"><Spinner /></div>}
        {data && (
          <>
            <div className="app-card overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Item</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3 text-right">Average cost</th><th className="px-4 py-3 text-right">Value</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {data.rows.map((r) => <tr key={r.id}><td className="px-4 py-2.5 font-mono text-xs">{r.sku}</td><td className="px-4 py-2.5">{r.name}</td><td className="px-4 py-2.5 text-right tabular-nums">{qty(r.quantity)} {r.unit}</td><td className="px-4 py-2.5 text-right tabular-nums">{cedi(r.avgCost)}</td><td className="px-4 py-2.5 text-right tabular-nums">{cedi(r.value)}</td></tr>)}
                  {data.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/50">No stock on this date.</td></tr>}
                </tbody>
                <tfoot className="border-t-2 border-line font-bold"><tr><td className="px-4 py-3" colSpan={4}>Total stock value</td><td className="px-4 py-3 text-right tabular-nums">{cedi(data.totalValue)}</td></tr></tfoot>
              </table>
            </div>
            <div className="app-card max-w-md space-y-1 p-4 text-sm">
              <div className="flex justify-between"><span className="text-ink/65">Stock value (from the items)</span><span className="tabular-nums">{cedi(data.totalValue)}</span></div>
              <div className="flex justify-between"><span className="text-ink/65">Inventory in the ledger</span><span className="tabular-nums">{cedi(data.ledgerInventoryBalance)}</span></div>
              <div className={`flex justify-between border-t border-line pt-1 font-bold ${Number(data.difference) === 0 ? "text-emerald-700" : "text-amber-700"}`}><span>Difference</span><span className="tabular-nums">{cedi(data.difference)}</span></div>
              {Number(data.difference) !== 0 && <p className="pt-1 text-xs text-ink/55">A difference means inventory was booked in the ledger without an item (for example a manual journal).</p>}
            </div>
          </>
        )}
      </div>
    </FinGuard>
  );
}
