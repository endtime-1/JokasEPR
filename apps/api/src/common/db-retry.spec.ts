import { withDbRetry } from "./db-retry";

function prismaError(code: string) {
  const err = new Error(`Prisma error ${code}`) as Error & { code: string };
  err.code = code;
  return err;
}

describe("withDbRetry", () => {
  it("returns the result on first success without retrying", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    await expect(withDbRetry(fn, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a P2034 deadlock/write-conflict error and succeeds on a later attempt", async () => {
    const fn = jest.fn().mockRejectedValueOnce(prismaError("P2034")).mockResolvedValueOnce("ok");
    await expect(withDbRetry(fn, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries P1001 (connection never established) by default — nothing ran", async () => {
    const fn = jest.fn().mockRejectedValueOnce(prismaError("P1001")).mockResolvedValueOnce("ok");
    await expect(withDbRetry(fn, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry ambiguous connection drops (P1008/P1017) by default — a committed tx would double-apply", async () => {
    for (const code of ["P1008", "P1017"]) {
      const fn = jest.fn().mockRejectedValue(prismaError(code));
      await expect(withDbRetry(fn, { baseDelayMs: 1 })).rejects.toThrow(`Prisma error ${code}`);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it("retries P1008/P1017 only when the caller opts in via retryConnectionErrors", async () => {
    for (const code of ["P1008", "P1017"]) {
      const fn = jest.fn().mockRejectedValueOnce(prismaError(code)).mockResolvedValueOnce("ok");
      await expect(withDbRetry(fn, { baseDelayMs: 1, retryConnectionErrors: true })).resolves.toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    }
  });

  it("gives up after the configured attempt count and throws the last error", async () => {
    const fn = jest.fn().mockRejectedValue(prismaError("P2034"));
    await expect(withDbRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow("Prisma error P2034");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable error (e.g. a business-rule BadRequestException-style error)", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("Insufficient stock"));
    await expect(withDbRetry(fn, { baseDelayMs: 1 })).rejects.toThrow("Insufficient stock");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry a unique-constraint violation (P2002) — that's a real conflict, not a transient one", async () => {
    const fn = jest.fn().mockRejectedValue(prismaError("P2002"));
    await expect(withDbRetry(fn, { baseDelayMs: 1 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
