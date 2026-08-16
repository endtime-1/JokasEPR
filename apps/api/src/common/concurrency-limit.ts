// DB stability audit (2026-08-16), High: the executive dashboard fires
// ~46 concurrent queries against a 10-connection pool on a single page
// load (computeMetricValues() x2 + liveCharts() + alerts()) — two users
// loading the dashboard together can queue past the pool's timeout and
// starve unrelated requests too, with no concurrency guard beyond generic
// per-IP rate limiting. This is a minimal, dependency-free "at most N
// in flight" limiter (no queue-length cap — callers are internal and
// bounded by the caller's own array size, not user input).
export interface ConcurrencyLimiter {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export function createLimiter(maxConcurrent: number): ConcurrencyLimiter {
  let active = 0;
  const queue: Array<() => void> = [];

  function next() {
    if (active >= maxConcurrent) return;
    const dequeued = queue.shift();
    if (!dequeued) return;
    active++;
    dequeued();
  }

  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const attempt = () => {
          fn().then(resolve, reject).finally(() => {
            active--;
            next();
          });
        };
        queue.push(attempt);
        next();
      });
    }
  };
}
