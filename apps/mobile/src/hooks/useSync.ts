import { useCallback, useEffect, useState } from "react";
import { countPending } from "../db/sync";
import { runSync, type SyncResult } from "../db/sync";
import { useNetwork } from "./useNetwork";

export type SyncState = {
  pending: number;
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
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const refreshCount = useCallback(async () => {
    const count = await countPending();
    setPending(count);
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
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic sync every 2 minutes
  useEffect(() => {
    const interval = setInterval(() => { if (online) sync(); }, 120000);
    return () => clearInterval(interval);
  }, [online, sync]);

  return { pending, syncing, lastSyncAt, lastResult, sync, online, refreshCount };
}
