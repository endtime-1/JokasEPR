import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("jokas_offline.db");
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS pending_submissions (
      id          TEXT PRIMARY KEY,
      module      TEXT NOT NULL,
      endpoint    TEXT NOT NULL,
      method      TEXT NOT NULL DEFAULT 'POST',
      payload     TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      synced      INTEGER NOT NULL DEFAULT 0,
      sync_error  TEXT,
      attempts    INTEGER NOT NULL DEFAULT 0,
      record_id   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_pending_unsynced ON pending_submissions (synced, created_at);

    CREATE TABLE IF NOT EXISTS lookup_cache (
      key        TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      cached_at  TEXT NOT NULL
    );
  `);
  // Add record_id column if it doesn't exist (for existing DBs)
  await db.execAsync(`ALTER TABLE pending_submissions ADD COLUMN record_id TEXT`).catch(() => undefined);
  return db;
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ── Payload encryption ─────────────────────────────────────────────────────
// Offline submission payloads contain business data (stock transfers, production
// orders, etc.). We obfuscate them with a per-install XOR key stored in
// SecureStore (iOS Keychain / Android Keystore) so SQLite files pulled from
// rooted devices don't expose plaintext JSON.
//
// NOTE: XOR with a fixed key is not AES-grade encryption. It prevents trivial
// plaintext inspection but not determined cryptanalysis. Proper SQLCipher
// encryption requires a custom native Expo build (out of managed workflow scope).

const PAYLOAD_KEY_STORE = "jokas.payloadKey";
const ENC_PREFIX        = "enc1:";

async function getPayloadKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(PAYLOAD_KEY_STORE);
  if (!key) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    key = Array.from({ length: 64 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    await SecureStore.setItemAsync(PAYLOAD_KEY_STORE, key);
  }
  return key;
}

export async function encryptPayload(data: string): Promise<string> {
  try {
    const key   = await getPayloadKey();
    const bytes = Array.from({ length: data.length }, (_, i) => data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    return ENC_PREFIX + btoa(String.fromCharCode(...bytes));
  } catch {
    return data; // fallback to plaintext if SecureStore unavailable
  }
}

export async function decryptPayload(data: string): Promise<string> {
  if (!data.startsWith(ENC_PREFIX)) return data; // legacy plaintext rows
  try {
    const key   = await getPayloadKey();
    const bytes = Array.from(atob(data.slice(ENC_PREFIX.length)), (c) => c.charCodeAt(0));
    return bytes.map((b, i) => String.fromCharCode(b ^ key.charCodeAt(i % key.length))).join("");
  } catch {
    return data;
  }
}

export async function getCachedLookup<T>(key: string): Promise<{ data: T; stale: boolean } | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ data: string; cached_at: string }>(
    "SELECT data, cached_at FROM lookup_cache WHERE key = ?",
    key
  );
  if (!row) return null;
  try {
    const age = Date.now() - new Date(row.cached_at).getTime();
    return { data: JSON.parse(row.data) as T, stale: age > CACHE_TTL_MS };
  } catch {
    // Corrupted cache entry — evict it and return null so a fresh fetch runs
    await database.runAsync("DELETE FROM lookup_cache WHERE key = ?", key);
    return null;
  }
}

export async function setCachedLookup(key: string, data: unknown): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    "INSERT OR REPLACE INTO lookup_cache (key, data, cached_at) VALUES (?, ?, ?)",
    key,
    JSON.stringify(data),
    new Date().toISOString()
  );
}

export async function clearLookupCache(): Promise<void> {
  const database = await getDb();
  await database.runAsync("DELETE FROM lookup_cache");
}

export async function queueSubmission(
  id: string,
  module: string,
  endpoint: string,
  payload: Record<string, unknown>,
  method = "POST"
): Promise<void> {
  const database  = await getDb();
  const encrypted = await encryptPayload(JSON.stringify(payload));
  await database.runAsync(
    "INSERT OR IGNORE INTO pending_submissions (id, module, endpoint, method, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    id, module, endpoint, method, encrypted, new Date().toISOString()
  );
}

export type PendingSubmission = {
  id: string;
  module: string;
  endpoint: string;
  method: string;
  payload: string;
  created_at: string;
  synced: number;
  sync_error: string | null;
  attempts: number;
  record_id: string | null;
};

export async function getPendingSubmissions(): Promise<PendingSubmission[]> {
  const database = await getDb();
  // Fetch unsynced that haven't exceeded retry limit
  return database.getAllAsync<PendingSubmission>(
    "SELECT * FROM pending_submissions WHERE synced = 0 AND attempts < 5 ORDER BY created_at ASC LIMIT 50"
  );
}

export async function markSynced(id: string, recordId?: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    "UPDATE pending_submissions SET synced = 1, record_id = ?, sync_error = NULL WHERE id = ?",
    recordId ?? null,
    id
  );
}

export async function markSyncError(id: string, error: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    "UPDATE pending_submissions SET sync_error = ?, attempts = attempts + 1 WHERE id = ?",
    error,
    id
  );
}

export async function markRetry(id: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    "UPDATE pending_submissions SET attempts = 0, sync_error = NULL WHERE id = ?",
    id
  );
}

export async function countPending(): Promise<number> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM pending_submissions WHERE synced = 0 AND attempts < 5"
  );
  return row?.count ?? 0;
}

export async function getAllSubmissions(): Promise<PendingSubmission[]> {
  const database = await getDb();
  return database.getAllAsync<PendingSubmission>(
    "SELECT * FROM pending_submissions ORDER BY created_at DESC LIMIT 100"
  );
}

export async function getRetryableSubmissions(): Promise<PendingSubmission[]> {
  const database = await getDb();
  return database.getAllAsync<PendingSubmission>(
    "SELECT * FROM pending_submissions WHERE synced = 0 AND attempts >= 5 ORDER BY created_at DESC LIMIT 50"
  );
}
