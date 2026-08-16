import { withTimeout, TimeoutError } from "./with-timeout";

describe("withTimeout", () => {
  it("resolves with the underlying value when it settles before the timeout", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
  });

  it("rejects with the underlying error when it rejects before the timeout", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000)).rejects.toThrow("boom");
  });

  it("rejects with a TimeoutError once the deadline passes without the promise settling", async () => {
    const never = new Promise(() => undefined);
    await expect(withTimeout(never, 10, "Slow query")).rejects.toThrow(TimeoutError);
    await expect(withTimeout(never, 10, "Slow query")).rejects.toThrow("Slow query timed out after 10ms");
  });
});
