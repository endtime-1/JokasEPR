import { useCallback, useEffect, useRef, useState } from "react";
import { getCachedLookup, setCachedLookup } from "../db/database";
import { useNetwork } from "./useNetwork";

type LookupState<T> = {
  data: T | null;
  loading: boolean;
  fromCache: boolean;
  error: string | null;
};

/**
 * Fetches data from the API and caches it in SQLite so it remains available
 * when the device is offline. On next mount it serves from cache immediately,
 * then refreshes in the background when online.
 *
 * @param key     Stable cache key, e.g. "farms" or `flockBatches:${farmId}`
 * @param fetcher Async function that returns the data to cache
 * @param skip    Set true to skip fetching (e.g. when a dependent ID is not yet chosen)
 */
export function useLookup<T>(
  key: string,
  fetcher: () => Promise<T>,
  skip = false
): LookupState<T> {
  const { online } = useNetwork();
  const [state, setState] = useState<LookupState<T>>({
    data: null,
    loading: !skip,
    fromCache: false,
    error: null
  });

  // Track the current key so stale responses from a previous key are ignored
  const keyRef = useRef(key);
  // Store fetcher in a ref so inline arrow functions don't trigger re-renders
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    if (skip) {
      setState({ data: null, loading: false, fromCache: false, error: null });
      return;
    }

    keyRef.current = key;

    // 1. Serve from cache immediately (fast, no spinner)
    const cached = await getCachedLookup<T>(key);
    if (cached && keyRef.current === key) {
      setState({ data: cached.data, loading: online, fromCache: true, error: null });
      if (!online) return; // offline — use cache as-is
    } else if (!online) {
      // No cache and offline
      setState({ data: null, loading: false, fromCache: false, error: "No data available offline" });
      return;
    } else {
      setState((prev) => ({ ...prev, loading: true, error: null }));
    }

    // 2. Fetch fresh data in background (or foreground if no cache)
    try {
      const fresh = await fetcherRef.current();
      if (keyRef.current !== key) return; // key changed while fetching — discard
      await setCachedLookup(key, fresh);
      setState({ data: fresh, loading: false, fromCache: false, error: null });
    } catch (err) {
      if (keyRef.current !== key) return;
      const msg = err instanceof Error ? err.message : "Failed to load";
      setState((prev) => ({
        data: prev.data, // keep stale cache if available
        loading: false,
        fromCache: prev.fromCache,
        error: prev.data ? null : msg // suppress error if we have cached data
      }));
    }
  }, [key, online, skip]); // fetcher removed — accessed via ref to avoid re-render loop

  useEffect(() => {
    load();
  }, [load]);

  return state;
}
