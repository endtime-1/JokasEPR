"use client";

import { useParams } from "next/navigation";
import { FinInvoiceDetailPage } from "./fin-sales-invoice-pages";
import { FinQuoteDetailPage } from "./fin-sales-quote-pages";

// Thin wrappers so the app/ route files stay one line each.
export function InvoiceDetailRoute() {
  const params = useParams<{ id: string }>();
  return <FinInvoiceDetailPage id={params.id} />;
}

export function QuoteDetailRoute() {
  const params = useParams<{ id: string }>();
  return <FinQuoteDetailPage id={params.id} />;
}
