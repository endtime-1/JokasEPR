"use client";

import { useState } from "react";
import { Download, Printer, QrCode, ScanBarcode } from "lucide-react";
import { ApiEnvelope, apiFetch, getAccessToken } from "../lib/api";

export type QrEntityType =
  | "FEED_PRODUCTION_BATCH"
  | "SOYA_PROCESSING_BATCH"
  | "STOCK_BATCH"
  | "FLOCK_BATCH"
  | "WAREHOUSE_ITEM"
  | "SALES_INVOICE"
  | "DELIVERY_NOTE"
  | "PURCHASE_ORDER"
  | "GOODS_RECEIVED_NOTE";

type QrLabel = {
  id: string;
  entityType: QrEntityType;
  entityId: string;
  label: string;
  payload: string;
  barcodeValue: string;
  status: string;
  qrSvg: string;
  barcodeSvg: string;
  details: Record<string, unknown>;
};

export const QR_ENTITY_OPTIONS: { value: QrEntityType; label: string }[] = [
  { value: "FEED_PRODUCTION_BATCH", label: "Feed production batch" },
  { value: "SOYA_PROCESSING_BATCH", label: "Soya processing batch" },
  { value: "STOCK_BATCH", label: "Inventory stock batch" },
  { value: "FLOCK_BATCH", label: "Poultry flock batch" },
  { value: "WAREHOUSE_ITEM", label: "Warehouse item" },
  { value: "SALES_INVOICE", label: "Sales invoice" },
  { value: "DELIVERY_NOTE", label: "Delivery note" },
  { value: "PURCHASE_ORDER", label: "Purchase order" },
  { value: "GOODS_RECEIVED_NOTE", label: "Goods received note" }
];

function detailValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  return String(value);
}

function svgDataUrl(svg: string) {
  try {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  } catch {
    return "";
  }
}

export function QrLabelCard({ entityType, entityId }: { entityType: QrEntityType; entityId: string }) {
  const [label, setLabel] = useState<QrLabel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    if (!entityId.trim()) {
      setError("Enter a record ID first.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<ApiEnvelope<QrLabel>>(`/qr/${entityType}/${entityId.trim()}`);
      setLabel(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate QR label.");
    } finally {
      setLoading(false);
    }
  }

  async function printLabel() {
    if (!label) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
    const response = await fetch(`${apiBase}/qr/${label.entityType}/${label.entityId}/label.svg`, {
      headers: { authorization: `Bearer ${getAccessToken() ?? ""}` }
    });
    const svgText = await response.text();
    const safeDataUrl = svgDataUrl(svgText);
    const printWindow = window.open("", "_blank", "width=760,height=520");
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>QR Label ${label.label}</title></head><body style="margin:24px"><img src="${safeDataUrl}" alt="QR label" /><script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
  }

  function downloadSvg() {
    if (!label) return;
    const blob = new Blob([label.qrSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${label.entityType}-${label.label}.svg`.replace(/[^A-Za-z0-9._-]/g, "-");
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">QR / Barcode Label</h2>
          <p className="text-sm text-ink/55">Generate a secure scan label for supported ERP records.</p>
        </div>
        <button onClick={generate} disabled={loading} className="app-button-primary">
          <QrCode className="h-4 w-4" />
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {label && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[220px_1fr]">
          <div className="rounded-md border border-line bg-white p-4">
            <div className="mx-auto h-[180px] w-[180px]">
              {label.qrSvg && (
                <img src={svgDataUrl(label.qrSvg)} alt="QR code" className="h-full w-full object-contain" />
              )}
            </div>
            <div className="mt-4">
              {label.barcodeSvg && (
                <img src={svgDataUrl(label.barcodeSvg)} alt="Barcode" className="w-full object-contain" />
              )}
            </div>
            <p className="mt-2 break-all text-center text-xs font-semibold text-ink/70">{label.barcodeValue}</p>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink/45">{label.entityType.replace(/_/g, " ")}</p>
                <h3 className="text-xl font-bold">{label.label}</h3>
                <p className="break-all text-xs text-ink/45">{label.payload}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={printLabel} className="app-button-secondary">
                  <Printer className="h-4 w-4" />
                  Print
                </button>
                <button onClick={downloadSvg} className="app-button-secondary">
                  <Download className="h-4 w-4" />
                  QR SVG
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {Object.entries(label.details).map(([key, value]) => (
                <div key={key} className="rounded-md border border-line bg-field/40 px-3 py-2">
                  <p className="text-[11px] uppercase text-ink/45">{key.replace(/([A-Z])/g, " $1")}</p>
                  <p className="truncate text-sm font-semibold">{detailValue(value)}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-sm text-ink/70">
              <ScanBarcode className="h-4 w-4 text-brand" />
              Mobile users scan this code to view details based on their role and assigned location.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
