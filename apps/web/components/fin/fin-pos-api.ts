"use client";

/** Shapes returned by /fin/items and /fin/pos (see presentItem and presentSale in the API). */

export type FinItem = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  kind: "GOODS" | "SERVICE";
  unit: string;
  category: string | null;
  sellPrice: string;
  priceIncludesTax: boolean;
  taxCodeId: string | null;
  incomeAccountId: string | null;
  cogsAccountId: string | null;
  inventoryAccountId: string | null;
  trackStock: boolean;
  reorderLevel: string;
  qtyOnHand: string;
  stockValue: string;
  avgCost: string;
  lowStock: boolean;
  isActive: boolean;
  notes: string | null;
  externalRef: string | null;
};

export type SaleLine = {
  id: string;
  lineNo: number;
  itemId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxRatePercent: string;
  lineNet: string;
  lineTax: string;
  lineTotal: string;
  isCharge: boolean;
  refundedQuantity: string;
  refundableQuantity: string;
};

export type Sale = {
  id: string;
  number: string;
  sessionId: string;
  cashierName: string;
  contactId: string | null;
  customerName: string | null;
  saleDate: string;
  createdAt: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  tendered: string;
  changeGiven: string;
  refundedTotal: string;
  status: "COMPLETE" | "PART_REFUNDED" | "REFUNDED";
  lines: SaleLine[];
  payments: { method: Method; amount: string; tendered: string; reference: string | null }[];
  refunds: { id: string; number: string; date: string; reason: string; total: string; restock: boolean; cashierName: string; payments: { method: Method; amount: string }[] }[];
};

export type Method = "CASH" | "MOMO" | "CARD";
export const METHOD_LABEL: Record<Method, string> = { CASH: "Cash", MOMO: "MoMo", CARD: "Card" };

export type PosSession = {
  id: string;
  number: string;
  registerId: string;
  registerName: string;
  cashierId: string;
  cashierName: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  expectedCash: string | null;
  countedCash: string | null;
  variance: string | null;
  closeNote: string | null;
  totals: { sales: number; salesTotal: string; refunds: number; refundsTotal: string; cash: string; momo: string; card: string };
};

export type Register = { id: string; name: string; cashAccountId: string; cashAccountName: string; isActive: boolean; openSession: { id: string; number: string; cashierName: string; openedAt: string } | null };

export type PosSettings = {
  momoPaymentAccountId: string | null;
  cardPaymentAccountId: string | null;
  floatSourceAccountId: string | null;
  maxDiscountPercent: string;
  refundApprovalAbove: string | null;
  receiptHeader: string | null;
  receiptFooter: string | null;
};

export type Receipt = {
  business: { businessName: string; tin: string | null; addressLine1: string | null; addressLine2: string | null; city: string | null; region: string | null; phone: string | null; currency: string };
  header: string | null;
  footer: string | null;
  sale: Sale;
};

export type Quote = {
  lines: { itemId: string | null; description: string; quantity: string; unitPrice: string; discount: string; net: string; tax: string; total: string }[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  warnings: string[];
};

export const cedi = (s: string | number | null | undefined) => (s === null || s === undefined || s === "" ? "" : Number(s).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const qty = (s: string | number) => Number(s).toLocaleString("en-GH", { maximumFractionDigits: 3 });

/** A random key the till makes when a sale starts: pressing Pay twice, or a retry after a bad connection, can never make two sales. */
export function newKey(): string {
  try {
    return `pos-${crypto.randomUUID()}`;
  } catch {
    return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}
