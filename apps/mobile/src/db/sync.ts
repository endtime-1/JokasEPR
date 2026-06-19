import { apiFetch } from "../api/client";
import { countPending, getPendingSubmissions, markSyncError, markSynced, type PendingSubmission } from "./database";

export type SyncResult = { synced: number; failed: number; duplicates: number };

type BatchSyncItem = {
  localId: string;
  endpoint: string;
  method: string;
  module: string;
  payload: Record<string, unknown>;
};

type BatchSyncItemResult = {
  localId: string;
  status: "synced" | "duplicate" | "failed";
  recordId?: string;
  error?: string;
};

type BatchSyncResponse = {
  data: {
    results: BatchSyncItemResult[];
    synced: number;
    duplicates: number;
    failed: number;
  };
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exponential backoff: attempt 1→0ms, 2→1s, 3→2s, 4→4s
function backoffMs(attempt: number) {
  return attempt <= 1 ? 0 : Math.min(1000 * Math.pow(2, attempt - 2), 8000);
}

export async function runSync(): Promise<SyncResult> {
  const pending = await getPendingSubmissions();
  if (pending.length === 0) return { synced: 0, failed: 0, duplicates: 0 };

  // Build batch payload — strip internal _offlineId from payload before sending
  const items: BatchSyncItem[] = pending.map((row) => {
    const rawPayload = JSON.parse(row.payload) as Record<string, unknown>;
    const { _offlineId, ...cleanPayload } = rawPayload;
    return {
      localId: row.id,
      endpoint: row.endpoint,
      method: row.method,
      module: row.module,
      payload: cleanPayload
    };
  });

  // Attempt batch sync with retry on network error
  let batchResult: BatchSyncResponse | null = null;
  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    attempt++;
    const delay = backoffMs(attempt);
    if (delay > 0) await sleep(delay);

    try {
      batchResult = await apiFetch<BatchSyncResponse>("/sync/batch", {
        method: "POST",
        body: JSON.stringify({ records: items })
      });
      break; // Success — exit retry loop
    } catch (err) {
      const isNetworkError = err instanceof Error && (err.message.includes("Network") || err.message.includes("fetch"));
      if (!isNetworkError || attempt >= maxAttempts) {
        // Non-network error or max retries — mark all as failed
        const msg = err instanceof Error ? err.message : "Sync failed";
        for (const item of items) {
          await markSyncError(item.localId, msg);
        }
        return { synced: 0, failed: items.length, duplicates: 0 };
      }
    }
  }

  if (!batchResult) {
    return { synced: 0, failed: items.length, duplicates: 0 };
  }

  // Apply per-record results from the batch response
  const byLocalId = new Map<string, BatchSyncItemResult>(
    batchResult.data.results.map((r) => [r.localId, r])
  );

  for (const row of pending) {
    const result = byLocalId.get(row.id);
    if (!result) {
      await markSyncError(row.id, "No result returned from server");
      continue;
    }

    if (result.status === "synced") {
      await markSynced(row.id, result.recordId);
    } else if (result.status === "duplicate") {
      // Server already has this record — mark as synced locally
      await markSynced(row.id, result.recordId);
    } else {
      await markSyncError(row.id, result.error ?? "Server rejected the record");
    }
  }

  return {
    synced: batchResult.data.synced + batchResult.data.duplicates,
    failed: batchResult.data.failed,
    duplicates: batchResult.data.duplicates
  };
}

export { countPending };
