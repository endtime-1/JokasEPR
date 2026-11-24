"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { InventoryShell } from "./inventory-shell";
import { ApiEnvelope, apiFetch, downloadRowsAsCsv } from "../lib/api";

// Stock ledger, warehouse first: open a store, see every product in it with its
// balance, pick a product to read how it came in, how it went out and the
// balance left after every line - then go back and pick the next product.

type StockItem = { productId: string; sku: string; name: string; uom: string; qty: number };
type CardLine = {
  date: string; type: string; label: string; direction: "IN" | "OUT"; in: number; out: number; balance: number;
  referenceType: string | null; referenceId: string | null; reference: string | null; party: string | null;
  notes: string | null; lots: string[]; by: string | null; infoOnly: boolean;
};
type CardResponse = {
  product: { id: string; sku: string; name: string; uom: string };
  warehouse: { id: string; name: string };
  summary: { onHand: number; broughtForward: number; opening: number; totalIn: number; totalOut: number; closing: number; hasUnexplained: boolean };
  lines: CardLine[];
};
type WarehouseOption = { id: string; code?: string; name: string };

const KG_PER_BAG = 50;
const inputClass = "min-h-10 rounded-md border border-line bg-white px-3 text-sm";

// The ledger for ONE store. Used as the "Product ledger" tab on a warehouse page and by the Stock ledger page.
export function WarehouseStockLedger({ warehouseId }: { warehouseId: string }) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [unit, setUnit] = useState<"bags" | "kg">("bags");
  const [newestFirst, setNewestFirst] = useState(true);
  const [data, setData] = useState<CardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Every product held in this store, with its balance now
  useEffect(() => {
    let cancelled = false;
    setItems([]); setData(null); setProductId(""); setError(""); setItemsLoading(true);
    if (!warehouseId) { setItemsLoading(false); return; }
    apiFetch<ApiEnvelope<Record<string, any>[]>>(`/inventory/items?warehouseId=${warehouseId}`)
      .then((r) => {
        if (cancelled) return;
        const list: StockItem[] = (r.data ?? [])
          .map((i) => ({
            productId: String(i.productId), sku: String(i.product?.sku ?? ""), name: String(i.product?.name ?? "Product"),
            uom: String(i.product?.uom?.symbol ?? i.product?.uom?.name ?? "kg"), qty: Number(i.quantityOnHand ?? 0),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setItems(list);
        setProductId((list.find((x) => x.qty > 0) ?? list[0])?.productId ?? "");
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message ?? "Failed to load the products in this store."); })
      .finally(() => { if (!cancelled) setItemsLoading(false); });
    return () => { cancelled = true; };
  }, [warehouseId]);

  const product = items.find((p) => p.productId === productId);
  const isKg = (product?.uom ?? "kg").toLowerCase() === "kg";
  const asBags = isKg && unit === "bags";
  const unitLabel = asBags ? "bags" : isKg ? "kg" : (product?.uom ?? "");

  // The ledger of the chosen product
  useEffect(() => {
    if (!productId || !warehouseId) return;
    let cancelled = false;
    setLoading(true); setError("");
    const params = new URLSearchParams({ productId, warehouseId });
    if (from) params.set("startDate", from);
    if (to) params.set("endDate", to);
    apiFetch<ApiEnvelope<CardResponse>>(`/inventory/stock-card?${params}`)
      .then((r) => { if (!cancelled) setData(r.data ?? null); })
      .catch((err: any) => { if (!cancelled) { setData(null); setError(err?.message ?? "Failed to load the ledger."); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId, warehouseId, from, to]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((p) => `${p.sku} ${p.name}`.toLowerCase().includes(q)) : items;
  }, [items, search]);

  const inSync = !!data && data.product.id === productId && data.warehouse.id === warehouseId;
  const fmt = (v: number, kgBased = true) => {
    const x = kgBased && asBags ? v / KG_PER_BAG : v;
    return (Math.round(x * 100) / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 });
  };
  const num = (v: number) => fmt(v);
  const cell = (v: number) => (v ? num(v) : "");
  const itemQty = (p: StockItem) => ((p.uom.toLowerCase() === "kg" && unit === "bags") ? `${fmt(p.qty)} bags` : `${fmt(p.qty, false)} ${p.uom}`);

  function downloadCsv() {
    if (!inSync || !data) return;
    const rows = data.lines.map((l) => ({
      date: l.date.slice(0, 10), what: l.label, reference: l.reference ?? "", details: [l.party, l.notes].filter(Boolean).join(" · "),
      lots: l.lots.join("; "), in: asBags ? l.in / KG_PER_BAG : l.in, out: asBags ? l.out / KG_PER_BAG : l.out,
      balance: asBags ? l.balance / KG_PER_BAG : l.balance, by: l.by ?? "",
    }));
    const slug = `${data.warehouse.name}-${data.product.name}`.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
    downloadRowsAsCsv(`stock-ledger-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, [
      { key: "date", label: "Date recorded" }, { key: "what", label: "What happened" }, { key: "reference", label: "Reference" },
      { key: "details", label: "Details" }, { key: "lots", label: "Lot" },
      { key: "in", label: `In (${unitLabel})` }, { key: "out", label: `Out (${unitLabel})` }, { key: "balance", label: `Balance (${unitLabel})` }, { key: "by", label: "By" },
    ], rows);
  }

  const s = data?.summary;

  // The line that carries stock forward from before the period (or before the records began).
  const openingRow = s && s.opening !== 0 ? (
    <tr className="border-t border-line bg-ink/[0.03] [&>td]:px-3 [&>td]:py-2">
      <td className="text-ink/50">{from || ""}</td>
      <td className="font-semibold">{from ? "Balance at start of period" : "Balance brought forward"}</td>
      <td></td>
      <td className="text-ink/60">{!from && s.hasUnexplained ? "Not explained by stock records" : ""}</td>
      <td></td>
      <td></td>
      <td className="text-right font-semibold">{num(s.opening)}</td>
    </tr>
  ) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* Products in this store */}
      <aside className="min-w-0">
        <input className={`${inputClass} mb-2 w-full`} placeholder="Find a product…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-[70vh] overflow-auto rounded-md border border-line bg-white">
          {itemsLoading && <p className="px-3 py-3 text-xs text-ink/50">Loading products…</p>}
          {!itemsLoading && !filtered.length && <p className="px-3 py-3 text-xs text-ink/50">{items.length ? "No product matches." : "No products in this store."}</p>}
          {filtered.map((p) => (
            <button
              key={p.productId}
              type="button"
              onClick={() => setProductId(p.productId)}
              className={`flex w-full items-center justify-between gap-2 border-b border-line/60 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-field ${p.productId === productId ? "bg-brand/10" : ""}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{p.name}</span>
                {p.sku && <span className="block truncate text-[10px] text-ink/50">{p.sku}</span>}
              </span>
              <span className={`shrink-0 tabular-nums ${p.qty > 0 ? "font-semibold" : "text-ink/40"}`}>{itemQty(p)}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* The chosen product's ledger */}
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="mr-auto min-w-0">
            <div className="text-[10px] font-semibold uppercase text-ink/50">Ledger</div>
            <div className="truncate text-lg font-semibold">{product ? product.name : "Choose a product"}</div>
          </div>
          <label className="text-xs">
            <span className="mb-0.5 block text-[10px] font-semibold uppercase text-ink/50">From</span>
            <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-[10px] font-semibold uppercase text-ink/50">To</span>
            <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {(from || to) && <button type="button" className="min-h-10 rounded-md border border-line px-3 text-xs font-semibold hover:bg-field" onClick={() => { setFrom(""); setTo(""); }}>Clear dates</button>}
          <div className="flex rounded-md border border-line text-xs">
            {(["bags", "kg"] as const).map((u) => (
              <button key={u} type="button" onClick={() => setUnit(u)} className={`min-h-10 px-3 ${unit === u ? "bg-brand text-white" : "text-ink/60 hover:bg-field"}`}>
                {u === "bags" ? "Bags (50 kg)" : "kg"}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setNewestFirst((v) => !v)} className="min-h-10 rounded-md border border-line px-3 text-xs font-semibold hover:bg-field" title="Switch the order of the lines">
            {newestFirst ? "Newest first ↓" : "Oldest first ↑"}
          </button>
          <button type="button" onClick={downloadCsv} disabled={!inSync || !data?.lines.length} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-line px-3 text-xs font-semibold hover:bg-field disabled:opacity-40">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>

        {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {!productId && !itemsLoading && !error && <p className="text-sm text-ink/60">Choose a product on the left to see its ledger.</p>}
        {loading && productId && <p className="mb-2 text-xs text-ink/50">Loading the ledger…</p>}

        {inSync && s && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label={from ? "Balance at start" : "Balance brought forward"} value={`${num(s.opening)} ${unitLabel}`} />
              <Kpi label="Total in" value={`${num(s.totalIn)} ${unitLabel}`} tone="in" />
              <Kpi label="Total out" value={`${num(s.totalOut)} ${unitLabel}`} tone="out" />
              <Kpi label={to ? "Balance at end" : "Balance now"} value={`${num(s.closing)} ${unitLabel}`} strong />
            </div>

            {s.hasUnexplained && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span className="font-semibold">{num(Math.abs(s.broughtForward))} {unitLabel} {s.broughtForward > 0 ? "more" : "less"} than the records explain.</span>{" "}
                {s.broughtForward > 0
                  ? "That stock was in the store before these records began, or was added without a stock record (for example a count correction)."
                  : "Stock was removed without a matching stock record."}{" "}
                It is shown as the opening line so the balance always ends on the stock the store holds now.
              </div>
            )}

            {data.lines.length === 0 && !s.hasUnexplained ? (
              <p className="text-sm text-ink/60">No stock movements for this product in this store{from || to ? " in the chosen dates" : ""}.</p>
            ) : (
              <div className="max-h-[65vh] overflow-auto rounded-md border border-line">
                <table className="w-full text-left text-xs tabular-nums">
                  <thead>
                    <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-field [&>th]:shadow-[0_1px_0_0_rgba(0,0,0,0.08)] [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold [&>th]:uppercase [&>th]:text-[10px] [&>th]:text-ink/60">
                      <th>Date recorded</th>
                      <th>What happened</th>
                      <th>Reference</th>
                      <th>Details</th>
                      <th className="text-right">In ({unitLabel})</th>
                      <th className="text-right">Out ({unitLabel})</th>
                      <th className="text-right">Balance ({unitLabel})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!newestFirst && openingRow}
                    {(newestFirst ? [...data.lines].reverse() : data.lines).map((l, i) => (
                      <tr key={i} className={`border-t border-line [&>td]:px-3 [&>td]:py-2 ${l.infoOnly ? "text-ink/40 italic" : ""}`}>
                        <td className="whitespace-nowrap">{new Date(l.date).toLocaleDateString("en-GB")}</td>
                        <td>{l.label}{l.infoOnly && <span className="ml-1 text-[10px]">(record only, no stock change)</span>}</td>
                        <td className="whitespace-nowrap">{l.reference ?? ""}</td>
                        <td className="max-w-[22rem] truncate" title={[l.party, l.notes, l.lots.length ? `Lot ${l.lots.join(", ")}` : ""].filter(Boolean).join(" · ")}>
                          {l.party ? <span className="font-medium">{l.party}</span> : null}
                          {l.party && l.notes ? " · " : ""}
                          <span className="text-ink/60">{l.notes ?? ""}</span>
                        </td>
                        <td className="text-right text-emerald-700">{cell(l.in)}</td>
                        <td className="text-right text-red-600">{cell(l.out)}</td>
                        <td className="text-right font-semibold">{num(l.balance)}</td>
                      </tr>
                    ))}
                    {newestFirst && openingRow}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[10px] text-ink/40">
              In = stock added (receipts, production, returns, adjustments up). Out = stock removed (sales, use in production, feed given to birds, transfers out, adjustments down, waste). Sales and production that used several stock lots show as one line. The last balance is the stock this store holds now.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

// Stand-alone page: pick a store, then work through its products.
export function StockLedgerPage() {
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<ApiEnvelope<{ warehouses: WarehouseOption[] }>>("/inventory/options")
      .then((r) => {
        const list = r.data?.warehouses ?? [];
        setWarehouses(list);
        let wanted = "";
        try { wanted = new URLSearchParams(window.location.search).get("warehouseId") ?? ""; } catch { /* no query string */ }
        setWarehouseId(list.some((w) => w.id === wanted) ? wanted : list[0]?.id ?? "");
      })
      .catch((err: any) => setError(err?.message ?? "Failed to load the stores."));
  }, []);

  return (
    <InventoryShell>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Stock Ledger</h2>
          <p className="text-sm text-ink/65">Open a store, then go through its products one by one: how each came in, how it went out, and the balance left after every line.</p>
        </div>
        <label className="text-xs">
          <span className="mb-0.5 block text-[10px] font-semibold uppercase text-ink/50">Store</span>
          <select className={`${inputClass} w-64`} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
      </div>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {warehouseId && <WarehouseStockLedger warehouseId={warehouseId} />}
    </InventoryShell>
  );
}

function Kpi({ label, value, tone, strong }: { label: string; value: string; tone?: "in" | "out"; strong?: boolean }) {
  const color = tone === "in" ? "text-emerald-700" : tone === "out" ? "text-red-600" : "";
  return (
    <div className="app-card px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">{label}</div>
      <div className={`mt-1 text-lg ${strong ? "font-bold" : "font-semibold"} ${color}`}>{value}</div>
    </div>
  );
}
