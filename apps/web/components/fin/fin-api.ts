"use client";

import { useAuth } from "../auth-context";
import { apiFetch } from "../../lib/api";

/** Finance v2 ("fin") client helpers. Everything here talks to /fin/* only. */

export type Envelope<T> = { data: T; meta?: { total?: number; page?: number; take?: number } };

export function finGet<T>(path: string) {
  return apiFetch<Envelope<T>>(`/fin${path}`);
}

export function finSend<T>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown) {
  return apiFetch<Envelope<T>>(`/fin${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

/** true when the signed-in user holds the finance permission (owner-level roles hold all of them). */
export function useFinPermission(permission: string): boolean {
  const { profile } = useAuth();
  if (!profile) return false;
  return profile.hasGlobalAccess || profile.permissions.includes(permission);
}

export function hasFinPermission(profile: { hasGlobalAccess: boolean; permissions: string[] } | null, permission: string) {
  return !!profile && (profile.hasGlobalAccess || profile.permissions.includes(permission));
}

const nf = new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1,234.50: amounts as plain numbers with 2 decimals. */
export function amount(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : nf.format(n);
}

/** Blank for zero: keeps ledgers readable. */
export function amountOrBlank(n: number | null | undefined): string {
  return !n ? "" : nf.format(n);
}

export function errMsg(e: unknown, fallback = "Something went wrong."): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TYPE_LABEL: Record<AccountType, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  REVENUE: "Revenue",
  EXPENSE: "Expenses"
};

export type FinAccount = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  isPostable: boolean;
  isActive: boolean;
  systemRole: string | null;
  description: string | null;
  externalRef: string | null;
  hasPostings: boolean;
};

export type FinRole = { role: string; label: string; type: AccountType; account: { id: string; code: string; name: string } | null };

export type JournalLine = {
  id: string;
  lineNo: number;
  accountId: string;
  description: string | null;
  debit: string;
  credit: string;
  account: { id: string; code: string; name: string; type: AccountType };
};

export type JournalEntry = {
  id: string;
  reference: string;
  entryDate: string;
  description: string;
  type: "STANDARD" | "OPENING" | "ADJUSTMENT" | "CLOSING" | "REVERSAL";
  status: "DRAFT" | "POSTED" | "REVERSED";
  totalDebit: string;
  totalCredit: string;
  notes: string | null;
  reversalOf: string | null;
  reversedById: string | null;
  postedAt: string | null;
  lines?: JournalLine[];
};

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Saves text as a file in the browser (CSV exports and templates). */
export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type FinContact = {
  id: string;
  code: string;
  name: string;
  isCustomer: boolean;
  isSupplier: boolean;
  isActive: boolean;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  tin: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  paymentTermsDays: number;
  creditLimit: string | null;
  currency: string;
  notes: string | null;
  externalRef: string | null;
};
