"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, QrCode, ScanLine } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { QrEntityType, QrLabelCard, QR_ENTITY_OPTIONS } from "../../components/qr-label-card";

const RECORD_SOURCES: { type: QrEntityType; href: string; hint: string }[] = [
  { type: "STOCK_BATCH",           href: "/inventory/stock-batches",           hint: "Find batch IDs in Inventory → Stock Batches" },
  { type: "WAREHOUSE_ITEM",        href: "/inventory",                          hint: "Find item IDs in Inventory → Warehouse Items" },
  { type: "FEED_PRODUCTION_BATCH", href: "/feed-production",                   hint: "Find batch IDs in Feed Production → Batches" },
  { type: "SOYA_PROCESSING_BATCH", href: "/soya-processing",                   hint: "Find batch IDs in Soya Processing → Batches" },
  { type: "FLOCK_BATCH",           href: "/poultry",                           hint: "Find batch IDs in Poultry → Flock Batches" },
  { type: "SALES_INVOICE",         href: "/sales/invoices",                    hint: "Find invoice IDs in Sales → Invoices" },
  { type: "DELIVERY_NOTE",         href: "/sales/deliveries",                  hint: "Find note IDs in Sales → Delivery Notes" },
  { type: "PURCHASE_ORDER",        href: "/procurement/purchase-orders",       hint: "Find order IDs in Procurement → Purchase Orders" },
  { type: "GOODS_RECEIVED_NOTE",   href: "/procurement/goods-received-notes",  hint: "Find GRN IDs in Procurement → Goods Received" },
];

export default function QrLabelsPage() {
  const [entityType, setEntityType] = useState<QrEntityType>("STOCK_BATCH");
  const [entityId, setEntityId] = useState("");

  const source = RECORD_SOURCES.find((s) => s.type === entityType);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Hero */}
        <div className="overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
            <div>
              <p className="app-kicker flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                Operations · Traceability
              </p>
              <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-ink">
                QR &amp; Barcode Labels
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/55">
                Generate printable QR and barcode scan labels for production batches, inventory,
                warehouse items, sales, and procurement records.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-brand/20 bg-brand/5 px-3.5 py-2.5 text-sm font-semibold text-brand">
              <ScanLine className="h-4 w-4" aria-hidden />
              Permission-checked · Mobile-ready
            </div>
          </div>

          {/* How-to strip */}
          <div className="border-t border-line/60 bg-gradient-to-r from-brand/5 to-field/40 px-6 py-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40 mb-2">How to generate a label</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-ink/60">
              <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">1</span> Select the record type below</span>
              <ChevronRight className="h-3.5 w-3.5 text-ink/25 hidden sm:block" />
              <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">2</span> Open the record in that module, copy its ID</span>
              <ChevronRight className="h-3.5 w-3.5 text-ink/25 hidden sm:block" />
              <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">3</span> Paste the ID below and click Generate</span>
            </div>
          </div>

          {/* Selector row */}
          <div className="border-t border-line/60 bg-field/40 px-6 py-4">
            <div className="grid gap-3 md:grid-cols-[280px_1fr_auto]">
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Record type</p>
                <select
                  value={entityType}
                  onChange={(event) => { setEntityType(event.target.value as QrEntityType); setEntityId(""); }}
                  className="min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                >
                  {QR_ENTITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Record ID (UUID)</p>
                <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
                  <QrCode className="h-4 w-4 shrink-0 text-ink/30" aria-hidden />
                  <input
                    value={entityId}
                    onChange={(event) => setEntityId(event.target.value)}
                    placeholder="Paste the ERP record UUID here"
                    className="min-h-10 flex-1 bg-transparent text-sm text-ink outline-none"
                  />
                </div>
              </div>
              {source && (
                <div className="flex flex-col justify-end">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Find IDs</p>
                  <Link
                    href={source.href}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-brand transition hover:bg-field"
                  >
                    <ChevronRight className="h-4 w-4" />
                    Browse records
                  </Link>
                </div>
              )}
            </div>
            {source && (
              <p className="mt-2 text-xs text-ink/45">
                <span className="font-semibold">Tip:</span> {source.hint}. Open a record, copy the ID from the URL or detail page, then paste it above.
              </p>
            )}
          </div>
        </div>

        <QrLabelCard entityType={entityType} entityId={entityId} />
      </div>
    </AppShell>
  );
}
