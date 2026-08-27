"use client";

import { useRef } from "react";

/**
 * Guards against out-of-order network responses. A load() that re-fires on
 * a filter change (status, date range, search text, etc.) can have an
 * older, slower request resolve AFTER a newer one — silently overwriting
 * correct, just-shown data with stale data if nothing checks which request
 * is actually the latest. (First found and fixed in poultry-pages.tsx and
 * feed-production-pages.tsx; generalized here after the same race turned
 * up independently in Finance, Procurement, Sales, Inventory, HR, Quality,
 * and QuickBooks.)
 *
 * Usage:
 *   const latestRequest = useLatestRequest();
 *   async function load() {
 *     const key = `${status}|${startDate}|${endDate}`;
 *     latestRequest.start(key);
 *     const res = await apiFetch(...);
 *     if (!latestRequest.isCurrent(key)) return; // a newer request has since started
 *     setRows(res.data ?? []);
 *   }
 */
export function useLatestRequest() {
  const ref = useRef<string>("");
  return {
    start: (key: string) => { ref.current = key; },
    isCurrent: (key: string) => ref.current === key,
  };
}
