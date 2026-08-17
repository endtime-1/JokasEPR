import { apiFetch, ApiError } from "../api/client";
import { countFailed, countPending, decryptPayload, getPendingSubmissions, markSyncError, markSynced, type PendingSubmission } from "./database";

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
  //
  // Mobile parity audit (2026-08-17): a corrupted/undecryptable row used to
  // just return null here and get silently dropped from `items`. On a
  // normal batch response that was recoverable — the result-application
  // loop below iterates the full `pending` list, so a row missing from the
  // response fell into the "no result" branch and still got marked failed
  // with an (honest-enough, if generic) message. But if the /sync/batch
  // call itself THREW, the catch block only iterated `items` — a corrupted
  // row present in `pending` but never in `items` was skipped entirely,
  // its attempts counter never incremented, invisible to both pending and
  // failed counts, silently retried-and-skipped forever. Marking it failed
  // immediately, with the real reason, closes that gap and gives the user
  // an honest error instead of "No result returned from server."
  const itemsOrNull = await Promise.all(pending.map(async (row) => {
    let rawPayload: Record<string, unknown>;
    try {
      const decrypted = await decryptPayload(row.payload);
      rawPayload = JSON.parse(decrypted) as Record<string, unknown>;
    } catch {
      await markSyncError(row.id, "Saved record could not be read (corrupted or undecryptable) — contact support if this repeats.");
      return null;
    }
    const { _offlineId, ...cleanPayload } = rawPayload;
    return { localId: row.id, endpoint: row.endpoint, method: row.method, module: row.module, payload: cleanPayload };
  }));
  const items: BatchSyncItem[] = itemsOrNull.filter((item): item is BatchSyncItem => item !== null);

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
      // Mobile parity audit (2026-08-17): this string-matched the error
      // message, which never matches apiFetch's actual timeout message
      // ("Request timed out — check your connection and try again.", no
      // "Network"/"fetch" substring) — only its "Network error..." message
      // for a hard connection failure did. Timeouts are the dominant
      // failure mode on weak field signal, so this was skipping the
      // 0/1s/2s backoff and burning a lifetime attempt on the very first
      // try. ApiError.status === 0 is the same "no real server response"
      // signal client.ts and useSubmit.ts's C6 fix already use — checking
      // that directly instead of guessing from message text.
      const isNetworkError = err instanceof ApiError && err.status === 0;
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

export { countPending, countFailed };
