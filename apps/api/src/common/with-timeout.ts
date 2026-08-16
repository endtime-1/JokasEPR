// Medium (DB stability audit, 2026-08-16): Prisma has no built-in per-query
// timeout for standalone (non-transaction) queries — transactionOptions.timeout
// only bounds $transaction() callbacks (see prisma.service.ts's own comment).
// This races a promise against a timer so a caller waiting on it fails fast
// with a clear error instead of hanging indefinitely during a slow-DB period.
// Note: this does not cancel the underlying query — MySQL keeps running it
// until it naturally completes or its own connection times out — it only
// stops the caller from waiting on it forever.
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = "Operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
