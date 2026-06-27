"use client";

import { useState } from "react";
import { QrCode, ScanLine } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { QrEntityType, QrLabelCard, QR_ENTITY_OPTIONS } from "../../components/qr-label-card";

export default function QrLabelsPage() {
  const [entityType, setEntityType] = useState<QrEntityType>("STOCK_BATCH");
  const [entityId, setEntityId] = useState("");

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Premium hero header */}
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
                Generate printable scan labels for production batches, inventory batches, warehouse items,
                sales documents, and procurement records.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-brand/20 bg-brand/5 px-3.5 py-2.5 text-sm font-semibold text-brand">
              <ScanLine className="h-4 w-4" aria-hidden />
              Permission-checked scans
            </div>
          </div>

          {/* Selector row */}
          <div className="border-t border-line/60 bg-field/40 px-6 py-4">
            <div className="grid gap-3 md:grid-cols-[300px_1fr]">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink/45">
                  Record type
                </span>
                <select
                  value={entityType}
                  onChange={(event) => setEntityType(event.target.value as QrEntityType)}
                  className="min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                >
                  {QR_ENTITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink/45">
                  Record ID
                </span>
                <div className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 shrink-0 text-ink/30" aria-hidden />
                  <input
                    value={entityId}
                    onChange={(event) => setEntityId(event.target.value)}
                    placeholder="Paste the ERP record UUID"
                    className="min-h-10 flex-1 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                  />
                </div>
              </label>
            </div>
          </div>
        </div>

        <QrLabelCard entityType={entityType} entityId={entityId} />
      </div>
    </AppShell>
  );
}
