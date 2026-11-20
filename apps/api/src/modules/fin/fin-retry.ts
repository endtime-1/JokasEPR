/**
 * Retries a whole database transaction when MySQL picks it as a deadlock victim. Prisma reports that as
 * P2034 for its own queries, or as a raw-query failure carrying MySQL error 1213 / "Deadlock found" for raw SQL.
 * Either way the transaction was rolled back, so running it again from the start is safe.
 */
export function isDeadlock(err: unknown): boolean {
  const e = err as { code?: string; message?: string; meta?: { code?: string | number; message?: string } } | undefined;
  if (!e) return false;
  if (e.code === "P2034") return true;
  const text = `${e.message ?? ""} ${e.meta?.message ?? ""}`;
  return String(e.meta?.code) === "1213" || /deadlock found/i.test(text) || /1213/.test(text);
}

export async function retryOnDeadlock<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isDeadlock(err) || i === attempts - 1) throw err;
      // Small randomised back-off so the colliding transactions do not retry in lock-step.
      await new Promise((r) => setTimeout(r, 25 * (i + 1) + Math.floor(Math.random() * 40)));
    }
  }
  throw last;
}
