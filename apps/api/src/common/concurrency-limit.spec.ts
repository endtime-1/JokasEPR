import { createLimiter } from "./concurrency-limit";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createLimiter", () => {
  it("runs all tasks and resolves with their results, order preserved", async () => {
    const limiter = createLimiter(3);
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => limiter.run(() => Promise.resolve(n * 10))));
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it("never allows more than maxConcurrent tasks in flight at once", async () => {
    const limiter = createLimiter(2);
    let active = 0;
    let peak = 0;
    const gates = Array.from({ length: 6 }, () => deferred<void>());

    const runs = gates.map((gate, i) =>
      limiter.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await gate.promise;
        active--;
        return i;
      })
    );

    // Let the first wave (up to the limit) actually start.
    await new Promise((r) => setImmediate(r));
    expect(peak).toBe(2);

    // Release them one at a time — peak must never exceed 2 even as later
    // tasks are admitted to fill the freed slot.
    for (const gate of gates) {
      gate.resolve();
      await new Promise((r) => setImmediate(r));
    }

    await Promise.all(runs);
    expect(peak).toBe(2);
  });

  it("propagates a rejection without blocking the remaining queued tasks", async () => {
    const limiter = createLimiter(1);
    const results = await Promise.allSettled([
      limiter.run(() => Promise.reject(new Error("boom"))),
      limiter.run(() => Promise.resolve("ok"))
    ]);
    expect(results[0].status).toBe("rejected");
    expect(results[1]).toEqual({ status: "fulfilled", value: "ok" });
  });
});
