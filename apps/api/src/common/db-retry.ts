import { Logger } from "@nestjs/common";

const logger = new Logger("DbRetry");

// Codes that are ALWAYS safe to retry, because the operation provably did not
// commit:
//   P2034 — "write conflict or deadlock, please retry"; Prisma rolls the whole
//           transaction back before throwing, so a retry starts from scratch.
//   P1001 — "can't reach the database server"; the connection was never
//           established, so nothing ran.
const TRANSACTION_SAFE_CODES = new Set(["P2034", "P1001"]);

// Connection-level codes whose outcome is AMBIGUOUS when they interrupt a
// transaction: the COMMIT may already have reached the server before the socket
// dropped (P1017) or the client gave up waiting (P1008). Retrying a non-
// idempotent write transaction on these can double-apply it (double stock
// consumption, duplicate ledger entries). Only retried when the caller
// explicitly opts in via { retryConnectionErrors: true } — for read-only work
// or operations that are idempotent by construction.
const CONNECTION_CODES = new Set(["P1008", "P1017"]);

export interface DbRetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Base delay before the first retry, doubled each subsequent attempt. Default 100ms. */
  baseDelayMs?: number;
  /** Included in the warn log so a retried operation is identifiable in production logs. */
  label?: string;
  /**
   * Also retry ambiguous connection drops (P1008 timeout, P1017 server closed
   * the connection). UNSAFE for a non-idempotent write transaction — a COMMIT
   * that landed server-side before the socket dropped would be applied twice.
   * Leave false (the default) for anything wrapping this.prisma.$transaction.
   */
  retryConnectionErrors?: boolean;
}

function isRetryable(err: unknown, allowConnectionErrors: boolean): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  if (typeof code !== "string") return false;
  if (TRANSACTION_SAFE_CODES.has(code)) return true;
  return allowConnectionErrors && CONNECTION_CODES.has(code);
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
  const allowConnectionErrors = opts.retryConnectionErrors ?? false;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !isRetryable(err, allowConnectionErrors)) throw err;
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
