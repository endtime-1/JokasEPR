"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "../ui";
import { FinAccount } from "./fin-api";
import { CalcLine, calcDoc, fmtPesewas } from "./fin-sales-calc";
import { ContactLite, DisplayStatus, SalesLine, STATUS_LABEL, STATUS_VARIANT, TaxCodeLite, useCustomerSearch } from "./fin-sales-api";

export const control = "app-control w-full";

const TABS = [
  { href: "/fin/sales/invoices", label: "Invoices" },
  { href: "/fin/sales/quotes", label: "Quotes" },
  { href: "/fin/sales/receipts", label: "Receipts" },
  { href: "/fin/sales/deposits", label: "Deposits" },
  { href: "/fin/sales/credit-notes", label: "Credit notes" },
  { href: "/fin/sales/recurring", label: "Recurring" },
  { href: "/fin/sales/statements", label: "Statements" },
  { href: "/fin/sales/incoming", label: "From other modules" }
];

/** The strip of links across the top of every sales screen. */
export function SalesTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1 print:hidden" aria-label="Sales sections">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link key={t.href} href={t.href} className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${active ? "bg-brand text-white" : "text-ink/65 hover:bg-field hover:text-ink"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function StatusPill({ status }: { status: DisplayStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

export const money = (s: string | number | null | undefined) =>
  s === null || s === undefined || s === "" ? "" : Number(s).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A search box plus a drop-down of matching customers. */
export function ContactSelect({ value, onChange, selected, disabled }: { value: string; onChange: (id: string, c?: ContactLite) => void; selected?: ContactLite; disabled?: boolean }) {
  const [search, setSearch] = useState("");
  const rows = useCustomerSearch(search);
  const options = useMemo(() => {
    const list: ContactLite[] = rows.map((r) => ({ id: r.id, code: r.code, name: r.name }));
    if (selected && !list.some((r) => r.id === selected.id)) list.unshift(selected);
    return list;
  }, [rows, selected]);
  return (
    <div className="grid gap-1.5">
      {!disabled && <input className="app-control w-full" placeholder="Search customers by name, code or phone" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search customers" />}
      <select className={control} value={value} onChange={(e) => onChange(e.target.value, options.find((o) => o.id === e.target.value))} disabled={disabled} required aria-label="Customer">
        <option value="">Choose a customer…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.code} · {o.name}</option>
        ))}
      </select>
    </div>
  );
}

export const emptyLine = (isCharge = false): SalesLine => ({ description: "", quantity: "1", unitPrice: "", discountPercent: "", taxCodeId: null, accountId: null, isCharge });

/** The editable table of lines, with totals that update as you type. */
export function LineEditor({ lines, onChange, income, taxCodes, disabled }: { lines: SalesLine[]; onChange: (l: SalesLine[]) => void; income: FinAccount[]; taxCodes: TaxCodeLite[]; disabled?: boolean }) {
  const rateOf = (id: string | null) => taxCodes.find((t) => t.id === id)?.currentRate ?? "0";
  const calc = useMemo(
    () => calcDoc(lines.map((l): CalcLine => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent, taxRatePercent: l.taxRatePercent && disabled ? l.taxRatePercent : rateOf(l.taxCodeId) }))),
    [lines, taxCodes, disabled]
  );
  const set = (i: number, patch: Partial<SalesLine>) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-3">
      <div className="app-card overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-3 py-3">Description</th>
              <th className="w-20 px-2 py-3 text-right">Qty</th>
              <th className="w-28 px-2 py-3 text-right">Price</th>
              <th className="w-20 px-2 py-3 text-right">Disc %</th>
              <th className="w-32 px-2 py-3">Tax</th>
              <th className="w-40 px-2 py-3">Income account</th>
              <th className="w-28 px-3 py-3 text-right">Amount</th>
              {!disabled && <th className="w-10" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l, i) => (
              <tr key={l.id ?? `n${i}`} className="align-top">
                <td className="px-3 py-2">
                  {disabled ? (
                    <span>{l.description}{l.isCharge && <span className="ml-1.5 text-xs text-ink/45">(charge)</span>}</span>
                  ) : (
                    <>
                      <input className="app-control w-full" value={l.description} onChange={(e) => set(i, { description: e.target.value })} maxLength={300} placeholder={l.isCharge ? "Delivery, service charge…" : "What you are selling"} aria-label="Description" />
                      <label className="mt-1 flex items-center gap-1.5 text-xs text-ink/50"><input type="checkbox" checked={l.isCharge} onChange={(e) => set(i, { isCharge: e.target.checked })} /> Extra charge (delivery, service)</label>
                    </>
                  )}
                </td>
                <td className="px-2 py-2 text-right">{disabled ? Number(l.quantity) : <input className="app-control w-full text-right tabular-nums" inputMode="decimal" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} aria-label="Quantity" />}</td>
                <td className="px-2 py-2 text-right">{disabled ? money(l.unitPrice) : <input className="app-control w-full text-right tabular-nums" inputMode="decimal" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} aria-label="Unit price" />}</td>
                <td className="px-2 py-2 text-right">{disabled ? (Number(l.discountPercent) ? Number(l.discountPercent) : "") : <input className="app-control w-full text-right tabular-nums" inputMode="decimal" value={l.discountPercent} onChange={(e) => set(i, { discountPercent: e.target.value })} aria-label="Discount percent" />}</td>
                <td className="px-2 py-2">
                  {disabled ? (
                    Number(l.taxRatePercent) ? `${Number(l.taxRatePercent)}%` : ""
                  ) : (
                    <select className="app-control w-full" value={l.taxCodeId ?? ""} onChange={(e) => set(i, { taxCodeId: e.target.value || null })} aria-label="Tax">
                      <option value="">No tax</option>
                      {taxCodes.filter((t) => Number(t.currentRate) > 0 || t.id === l.taxCodeId).map((t) => <option key={t.id} value={t.id}>{t.code} {Number(t.currentRate)}%</option>)}
                    </select>
                  )}
                </td>
                <td className="px-2 py-2">
                  {disabled ? (
                    income.find((a) => a.id === l.accountId)?.name ?? ""
                  ) : (
                    <select className="app-control w-full" value={l.accountId ?? ""} onChange={(e) => set(i, { accountId: e.target.value || null })} aria-label="Income account">
                      <option value="">Default sales</option>
                      {income.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                    </select>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{calc.rows[i]?.valid ? fmtPesewas(calc.rows[i].total) : disabled ? money(l.lineTotal) : ""}</td>
                {!disabled && (
                  <td className="px-1 py-2">
                    <button type="button" className="rounded-md p-1.5 text-ink/40 hover:bg-field hover:text-red-600" disabled={lines.length <= 1} onClick={() => onChange(lines.filter((_, idx) => idx !== i))} aria-label="Remove line">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="app-button-secondary" onClick={() => onChange([...lines, emptyLine()])}><Plus className="h-4 w-4" aria-hidden /> Add line</button>
          <button type="button" className="app-button-secondary" onClick={() => onChange([...lines, emptyLine(true)])}><Plus className="h-4 w-4" aria-hidden /> Add a charge</button>
        </div>
      )}
      <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between"><span className="text-ink/60">Subtotal</span><span className="tabular-nums">{fmtPesewas(calc.subtotal)}</span></div>
        {calc.discountTotal > 0 && <div className="flex justify-between"><span className="text-ink/60">Discount</span><span className="tabular-nums">- {fmtPesewas(calc.discountTotal)}</span></div>}
        {calc.taxTotal > 0 && <div className="flex justify-between"><span className="text-ink/60">Tax</span><span className="tabular-nums">{fmtPesewas(calc.taxTotal)}</span></div>}
        <div className="flex justify-between border-t border-line pt-1.5 text-base font-bold"><span>Total</span><span className="tabular-nums">{fmtPesewas(calc.total)}</span></div>
        {!calc.valid && !disabled && <p className="text-xs text-amber-700">Fill in a quantity and price on every line.</p>}
      </div>
    </div>
  );
}

/** Lines in the shape the API wants. */
export function toApiLines(lines: SalesLine[]) {
  return lines.map((l) => ({
    description: l.description.trim(),
    quantity: l.quantity.trim(),
    unitPrice: l.unitPrice.trim(),
    discountPercent: l.discountPercent.trim() || "0",
    taxCodeId: l.taxCodeId,
    accountId: l.accountId,
    isCharge: l.isCharge
  }));
}

export function fromApiLines(lines: SalesLine[] | undefined): SalesLine[] {
  if (!lines?.length) return [emptyLine()];
  return lines.map((l) => ({
    id: l.id,
    description: l.description,
    quantity: String(Number(l.quantity)),
    unitPrice: l.unitPrice,
    discountPercent: Number(l.discountPercent) ? String(Number(l.discountPercent)) : "",
    taxCodeId: l.taxCodeId,
    taxRatePercent: l.taxRatePercent,
    accountId: l.accountId,
    isCharge: l.isCharge,
    lineNet: l.lineNet,
    lineTax: l.lineTax,
    lineTotal: l.lineTotal
  }));
}
