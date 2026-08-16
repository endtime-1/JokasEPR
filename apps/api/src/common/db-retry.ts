import { Logger } from "@nestjs/common";

const logger = new Logger("DbRetry");

// Prisma P2034: "Transaction failed due to a write conflict or a deadlock.
// Please retry your transaction" — Prisma's own docs say this is meant to be
// retried by the caller, not surfaced as a hard failure. P1001/P1008/P1017
// are connection-level errors (can't reach the DB, timed out, closed) —
// transient blips on this shared-hosting MySQL instance, not a real failure
// of the operation itself.
const RETRYABLE_PRISMA_CODES = new Set(["P2034", "P1001", "P1008", "P1017"]);

export interface DbRetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Base delay before the first retry, doubled each subsequent attempt. Default 100ms. */
  baseDelayMs?: number;
  /** Included in the warn log so a retried operation is identifiable in production logs. */
  label?: string;
}

function isRetryable(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  return typeof code === "string" && RETRYABLE_PRISMA_CODES.has(code);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// DB stability audit (2026-08-16), High: nothing in this app retried a
// transient DB failure anywhere — a deadlock or connection reset surfaced
// immediately as a raw, untranslated 500 to whichever request lost, with no
// automatic recovery. This is the shared wrapper that fixes that. Applied
// first to the write paths confirmed to have an opposite-lock-order deadlock
// risk between module groups (StockBatch vs. InventoryItem) — this turns
// that risk from "hard failure" into "transparent retry" without changing
// any business logic. Exponential backoff with jitter so a burst of
// concurrent retries doesn't itself become a thundering herd.
export async function withDbRetry<T>(fn: () => Promise<T>, opts: DbRetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 100;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !isRetryable(err)) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5);
      const code = (err as { code?: string } | undefined)?.code;
      logger.warn(
        `${opts.label ?? "DB operation"} failed with retryable error ${code} (attempt ${attempt}/${attempts}), retrying in ${Math.round(delay)}ms`
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}
