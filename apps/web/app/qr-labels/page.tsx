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
      <div className="space-y-5">
        <section className="rounded-md border border-line bg-white p-5 shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand">
                <QrCode className="h-4 w-4" />
                Traceability
              </div>
              <h1 className="text-2xl font-bold">QR & Barcode Labels</h1>
              <p className="mt-1 max-w-2xl text-sm text-ink/60">
                Generate printable scan labels for production batches, inventory batches, warehouse items, sales documents, and procurement records.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-sm text-ink/70">
              <ScanLine className="h-4 w-4 text-brand" />
              Scans are permission checked
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[280px_1fr]">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink/65">Record type</span>
              <select
                value={entityType}
                onChange={(event) => setEntityType(event.target.value as QrEntityType)}
                className="min-h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand"
              >
                {QR_ENTITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink/65">Record ID</span>
              <input
                value={entityId}
                onChange={(event) => setEntityId(event.target.value)}
                placeholder="Paste the ERP record UUID"
                className="min-h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand"
              />
            </label>
          </div>
        </section>

        <QrLabelCard entityType={entityType} entityId={entityId} />
      </div>
    </AppShell>
  );
}
