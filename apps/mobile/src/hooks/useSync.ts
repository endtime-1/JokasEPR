import { useCallback, useEffect, useState } from "react";
import { countFailed, countPending } from "../db/sync";
import { runSync, type SyncResult } from "../db/sync";
import { useNetwork } from "./useNetwork";

export type SyncState = {
  pending: number;
  // M5: distinct from `pending` — records that hit the 5-attempt retry
  // ceiling. Previously invisible outside the Sync Status screen; exposed
  // here so SyncBanner can surface it instead of silently going quiet.
  failed: number;
  syncing: boolean;
  lastSyncAt: Date | null;
  lastResult: SyncResult | null;
  sync: () => Promise<void>;
  refreshCount: () => Promise<void>;
  online: boolean;
};

export function useSync(): SyncState {
  const { online } = useNetwork();
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const refreshCount = useCallback(async () => {
    const [count, failedCount] = await Promise.all([countPending(), countFailed()]);
    setPending(count);
    setFailed(failedCount);
  }, []);

  const sync = useCallback(async () => {
    if (!online || syncing) return;
    setSyncing(true);
    try {
      const result = await runSync();
      setLastSyncAt(new Date());
      setLastResult(result);
    } finally {
      setSyncing(false);
      await refreshCount();
    }
  }, [online, syncing, refreshCount]);

  // Refresh count on mount and when online status changes
  useEffect(() => { refreshCount(); }, [refreshCount]);

  // Auto-sync when coming online
  useEffect(() => {
    if (online) sync();
  }, [online, sync]);

  // Periodic sync every 2 minutes
  useEffect(() => {
    const interval = setInterval(() => { if (online) sync(); }, 120000);
    return () => clearInterval(interval);
  }, [online, sync]);

  return { pending, failed, syncing, lastSyncAt, lastResult, sync, online, refreshCount };
}
