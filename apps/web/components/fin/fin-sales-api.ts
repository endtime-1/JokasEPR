"use client";

import { useEffect, useState } from "react";
import { FinAccount, FinContact, finGet } from "./fin-api";

export type DisplayStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  VOID: "Void"
};

export const STATUS_VARIANT: Record<DisplayStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  SENT: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "danger",
  VOID: "neutral"
};

export type SalesLine = {
  id?: string;
  lineNo?: number;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxCodeId: string | null;
  taxRatePercent?: string;
  accountId: string | null;
  isCharge: boolean;
  lineNet?: string;
  lineTax?: string;
  lineTotal?: string;
};

export type ContactLite = { id: string; code: string; name: string };

export type Invoice = {
  id: string;
  number: string | null;
  contactId: string;
  quoteId: string | null;
  recurringId: string | null;
  issueDate: string;
  dueDate: string;
  status: "DRAFT" | "SENT" | "VOID";
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  displayStatus: DisplayStatus;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  paidAmount: string;
  creditedAmount: string;
  balanceDue: string;
  notes: string | null;
  terms: string | null;
  voidReason: string | null;
  linkEnabled: boolean;
  contact?: FinContact | ContactLite;
  lines?: SalesLine[];
  allocations?: { id: string; amount: string; receipt: { id: string; number: string; receiptDate: string; status: string; method: string } }[];
  applications?: { id: string; amount: string; appliedDate: string; deposit: { id: string; number: string } }[];
  creditNotes?: { id: string; number: string; creditDate: string; total: string; status: string }[];
};

export type Quote = {
  id: string;
  number: string | null;
  contactId: string;
  issueDate: string;
  validUntil: string | null;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  notes: string | null;
  terms: string | null;
  invoiceId: string | null;
  contact?: FinContact | ContactLite;
  lines?: SalesLine[];
};

export type TaxCodeLite = { id: string; code: string; name: string; appliesTo: "SALES" | "PURCHASES" | "BOTH"; isActive: boolean; currentRate: string | null };

export type Totals = Record<string, string>;

export function useCustomerSearch(search: string) {
  const [rows, setRows] = useState<FinContact[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams({ type: "customer", activeOnly: "true", take: "100" });
      if (search.trim()) q.set("search", search.trim());
      finGet<FinContact[]>(`/contacts?${q.toString()}`).then((r) => setRows(r.data)).catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  return rows;
}

/** Accounts and tax codes the sales editors need. */
export function useSalesLookups() {
  const [income, setIncome] = useState<FinAccount[]>([]);
  const [money, setMoney] = useState<FinAccount[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCodeLite[]>([]);
  useEffect(() => {
    finGet<FinAccount[]>("/accounting/accounts")
      .then((r) => {
        setIncome(r.data.filter((a) => a.type === "REVENUE" && a.isPostable && a.isActive));
        setMoney(r.data.filter((a) => a.type === "ASSET" && a.isPostable && a.isActive && a.systemRole !== "receivable" && !(a.systemRole ?? "").startsWith("inventory")));
      })
      .catch(() => undefined);
    finGet<TaxCodeLite[]>("/tax-codes")
      .then((r) => setTaxCodes(r.data.filter((t) => t.isActive && t.appliesTo !== "PURCHASES")))
      .catch(() => undefined);
  }, []);
  return { income, money, taxCodes };
}

export function salesGet<T>(path: string) {
  return finGet<T>(`/sales${path}`);
}
