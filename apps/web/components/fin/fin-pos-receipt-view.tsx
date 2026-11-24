"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Printer, FileText } from "lucide-react";
import { apiFetchResponse } from "../../lib/api";
import { Modal, Spinner } from "../ui";
import { errMsg, finGet } from "./fin-api";
import { ErrorNote } from "./fin-common";
import { METHOD_LABEL, Receipt, cedi, qty } from "./fin-pos-api";

/** An 80 mm till receipt. Printing shows ONLY this block (see the print rules below), laid out for a thermal roll. */
export function ReceiptView({ r }: { r: Receipt }) {
  const s = r.sale;
  const b = r.business;
  const addr = [b.addressLine1, b.addressLine2, [b.city, b.region].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  return (
    <>
      <style>{`
        .pos-receipt { width: 80mm; max-width: 100%; margin: 0 auto; background: #fff; color: #111; font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 12px; line-height: 1.35; padding: 8px 10px; }
        .pos-receipt .row { display: flex; justify-content: space-between; gap: 8px; }
        .pos-receipt .rule { border-top: 1px dashed #444; margin: 6px 0; }
        .pos-receipt .c { text-align: center; }
        @media print {
          body * { visibility: hidden !important; }
          .pos-receipt, .pos-receipt * { visibility: visible !important; }
          .pos-receipt { position: fixed; left: 0; top: 0; width: 80mm; padding: 0 2mm; }
          @page { size: 80mm auto; margin: 3mm; }
        }
      `}</style>
      <div className="pos-receipt" data-testid="pos-receipt">
        <p className="c" style={{ fontWeight: 700, fontSize: 14 }}>{b.businessName}</p>
        {addr && <p className="c" style={{ fontSize: 10 }}>{addr}</p>}
        <p className="c" style={{ fontSize: 10 }}>{[b.phone, b.tin ? `TIN ${b.tin}` : ""].filter(Boolean).join("  ·  ")}</p>
        {r.header && <p className="c" style={{ fontSize: 11, marginTop: 4 }}>{r.header}</p>}
        <div className="rule" />
        <div className="row"><b>{s.number}</b><span>{s.saleDate}</span></div>
        <div className="row" style={{ fontSize: 10 }}><span>Cashier: {s.cashierName}</span><span>{new Date(s.createdAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}</span></div>
        {s.customerName && <div style={{ fontSize: 10 }}>Customer: {s.customerName}</div>}
        <div className="rule" />
        {s.lines.map((l) => (
          <div key={l.id} style={{ marginBottom: 3 }}>
            <div>{l.description}</div>
            <div className="row" style={{ fontSize: 11 }}><span>{qty(l.quantity)} x {cedi(l.unitPrice)}{Number(l.discountAmount) > 0 ? `  (-${cedi(l.discountAmount)})` : ""}</span><span>{cedi(l.lineTotal)}</span></div>
          </div>
        ))}
        <div className="rule" />
        {Number(s.discountTotal) > 0 && <div className="row"><span>Discounts</span><span>-{cedi(s.discountTotal)}</span></div>}
        {Number(s.taxTotal) > 0 && (<><div className="row"><span>Subtotal (before tax)</span><span>{cedi(s.subtotal)}</span></div><div className="row"><span>Tax included</span><span>{cedi(s.taxTotal)}</span></div></>)}
        <div className="row" style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}><span>TOTAL {b.currency}</span><span>{cedi(s.total)}</span></div>
        <div style={{ marginTop: 4 }}>
          {s.payments.map((p, i) => <div key={i} className="row"><span>{METHOD_LABEL[p.method]}{p.reference ? ` (${p.reference})` : ""}</span><span>{cedi(p.method === "CASH" ? p.tendered : p.amount)}</span></div>)}
          {Number(s.changeGiven) > 0 && <div className="row" style={{ fontWeight: 700 }}><span>Change</span><span>{cedi(s.changeGiven)}</span></div>}
        </div>
        {s.refunds.length > 0 && (<><div className="rule" />{s.refunds.map((f) => <div key={f.id} className="row"><span>Refund {f.number}</span><span>-{cedi(f.total)}</span></div>)}</>)}
        <div className="rule" />
        <p className="c">{r.footer || "Thank you for shopping with us!"}</p>
      </div>
    </>
  );
}

/** The receipt on screen, with Print, PDF and WhatsApp. */
export function ReceiptModal({ saleId, onClose, onNewSale }: { saleId: string | null; onClose: () => void; onNewSale?: () => void }) {
  const [r, setR] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [needPhone, setNeedPhone] = useState(false);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    setR(null); setError(""); setNeedPhone(false); setPhone("");
    if (saleId) finGet<Receipt>(`/pos/sales/${saleId}/receipt`).then((x) => setR(x.data)).catch((e) => setError(errMsg(e, "Could not load the receipt.")));
  }, [saleId]);

  async function pdf() {
    if (!saleId) return;
    setBusy("pdf"); setError("");
    try {
      const res = await apiFetchResponse(`/fin/pos/sales/${saleId}/pdf`);
      window.open(URL.createObjectURL(await res.blob()), "_blank");
    } catch (e) {
      setError(errMsg(e, "Could not make the PDF."));
    } finally {
      setBusy("");
    }
  }
  async function whatsapp(withPhone?: string) {
    if (!saleId) return;
    setBusy("wa"); setError("");
    try {
      const x = await finGet<{ phone: string | null; whatsappUrl: string }>(`/pos/sales/${saleId}/share${withPhone ? `?phone=${encodeURIComponent(withPhone)}` : ""}`);
      if (!x.data.phone) { setNeedPhone(true); return; }
      window.open(x.data.whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(errMsg(e, "Could not prepare the WhatsApp message."));
    } finally {
      setBusy("");
    }
  }

  return (
    <Modal open={saleId !== null} onClose={onClose} title={r ? `Receipt ${r.sale.number}` : "Receipt"} size="md">
      <div className="grid gap-4">
        <ErrorNote message={error} />
        {!r && !error && <div className="py-10 text-center"><Spinner /></div>}
        {r && <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-line bg-field p-3"><ReceiptView r={r} /></div>}
        {needPhone && (
          <div className="flex gap-2">
            <input className="app-control w-full" inputMode="tel" placeholder="Customer's WhatsApp number, e.g. 0244123456" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="WhatsApp number" />
            <button className="app-button-primary" disabled={phone.replace(/\D/g, "").length < 9} onClick={() => void whatsapp(phone)}>Open</button>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 print:hidden">
          <button className="app-button-secondary" onClick={() => window.print()} disabled={!r}><Printer className="h-4 w-4" aria-hidden /> Print</button>
          <button className="app-button-secondary" onClick={pdf} disabled={!r || busy === "pdf"}><FileText className="h-4 w-4" aria-hidden /> PDF</button>
          <button className="app-button-secondary" onClick={() => void whatsapp()} disabled={!r || busy === "wa"}><MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp</button>
          {onNewSale && <button className="app-button-primary" onClick={onNewSale}>New sale</button>}
        </div>
      </div>
    </Modal>
  );
}
