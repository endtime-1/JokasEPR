import { renderHook, act } from "@testing-library/react-native";
import { useSubmit } from "../useSubmit";
import { useNetwork } from "../useNetwork";
import { apiFetch, ApiError } from "../../api/client";
import { queueSubmission } from "../../db/database";

jest.mock("../useNetwork", () => ({
  useNetwork: jest.fn(() => ({ online: true, recheck: jest.fn() })),
}));

jest.mock("../useSync", () => ({
  useSync: jest.fn(() => ({
    refreshCount: jest.fn().mockResolvedValue(undefined),
    pending: 0,
    syncing: false,
    lastSyncAt: null,
    lastResult: null,
    sync: jest.fn(),
    online: true,
  })),
}));

jest.mock("../../db/database", () => ({
  queueSubmission: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../api/client", () => ({
  apiFetch: jest.fn(),
  // Real class, not a mock — useSubmit's catch branch checks `instanceof
  // ApiError` and reads `.status`, so tests need the genuine class to
  // exercise that logic instead of always falling through the "not an
  // ApiError" path regardless of what's being tested.
  ApiError: jest.requireActual("../../api/client").ApiError,
}));

const mockApiFetch = apiFetch as jest.Mock;
const mockQueueSubmission = queueSubmission as jest.Mock;

const mockUseNetwork = useNetwork as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseNetwork.mockReturnValue({ online: true, recheck: jest.fn() });
});

describe("useSubmit", () => {
  it("calls the API with idempotency key when online", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true });
    const onSuccess = jest.fn();

    const { result } = await renderHook(() =>
      useSubmit({ module: "livestock", endpoint: "/livestock/batches", onSuccess })
    );

    await act(async () => {
      await result.current.submit({ name: "Batch A" });
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/livestock/batches?idempotencyKey="),
      expect.objectContaining({ method: "POST" })
    );
    expect(onSuccess).toHaveBeenCalledWith(false);
    expect(mockQueueSubmission).not.toHaveBeenCalled();
  });

  it("queues to SQLite and calls onSuccess when offline", async () => {
    mockUseNetwork.mockReturnValue({ online: false, recheck: jest.fn() });
    const onSuccess = jest.fn();

    const { result } = await renderHook(() =>
      useSubmit({ module: "livestock", endpoint: "/livestock/batches", onSuccess })
    );

    await act(async () => {
      await result.current.submit({ name: "Batch B" });
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockQueueSubmission).toHaveBeenCalledWith(
      expect.any(String),
      "livestock",
      "/livestock/batches",
      { name: "Batch B" },
      "POST"
    );
    expect(onSuccess).toHaveBeenCalledWith(true);
  });

  it("falls back to the offline queue on a network/timeout failure (ApiError status 0) — C6", async () => {
    // This is what apiFetch() actually throws for a timeout or a dropped
    // connection (client.ts always uses status 0 for "no real server
    // response") — a plain Error here would pass regardless of whether the
    // real bug (checking `instanceof ApiError` with no status check) was
    // present, since a plain Error also isn't an ApiError. Using the real
    // ApiError class with status 0 is what actually exercises the fix.
    mockApiFetch.mockRejectedValueOnce(new ApiError(0, "Request timed out — check your connection and try again."));
    const onSuccess = jest.fn();

    const { result } = await renderHook(() =>
      useSubmit({ module: "livestock", endpoint: "/livestock/batches", onSuccess })
    );

    await act(async () => {
      await result.current.submit({ name: "Batch C" });
    });

    expect(mockQueueSubmission).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(true);
  });

  it("does NOT queue a genuine server rejection (ApiError status 400) — shows the error instead — C6", async () => {
    // The bug this guards against: apiFetch wraps every failure — real
    // 4xx/5xx included — in ApiError, so `instanceof ApiError` alone can
    // never distinguish "the server rejected this" from "the request never
    // reached the server." A validation failure must not silently queue
    // itself for endless retry against a server that will keep rejecting it.
    mockApiFetch.mockRejectedValueOnce(new ApiError(400, JSON.stringify({ message: "Quantity must be at least 1" })));
    const onSuccess = jest.fn();
    const onError = jest.fn();

    const { result } = await renderHook(() =>
      useSubmit({ module: "livestock", endpoint: "/livestock/batches", onSuccess, onError })
    );

    await act(async () => {
      await result.current.submit({ name: "Batch D" });
    });

    expect(mockQueueSubmission).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Quantity must be at least 1");
  });

  it("ignores a second concurrent submit() call instead of sending two requests (H-MOB-6)", async () => {
    // The real bug: `loading` is React state, so the button doesn't visually
    // disable until the NEXT render — a double-tap firing both calls before
    // that render leaves a window where two submissions would previously
    // both go through with two different fresh idempotency keys, meaning the
    // server's own dedup couldn't catch it either. The guard check happens
    // synchronously at the very top of submit() (before its first await), so
    // firing both calls back-to-back in the same tick — exactly what a
    // double-tap does — is enough to exercise it; no manual timing control
    // over when apiFetch itself resolves is needed.
    mockApiFetch.mockResolvedValue({ ok: true });
    const onSuccess = jest.fn();

    const { result } = await renderHook(() =>
      useSubmit({ module: "livestock", endpoint: "/livestock/batches", onSuccess })
    );

    await act(async () => {
      const firstCall = result.current.submit({ name: "Batch A" });
      const secondCall = result.current.submit({ name: "Batch A" });
      await Promise.all([firstCall, secondCall]);
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("allows a genuinely new submit() after the previous one finished", async () => {
    mockApiFetch.mockResolvedValue({ ok: true });
    const onSuccess = jest.fn();

    const { result } = await renderHook(() =>
      useSubmit({ module: "livestock", endpoint: "/livestock/batches", onSuccess })
    );

    await act(async () => { await result.current.submit({ name: "Batch A" }); });
    await act(async () => { await result.current.submit({ name: "Batch B" }); });

    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledTimes(2);
  });

  it("loading is false before and after a successful submit", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true });

    const { result } = await renderHook(() =>
      useSubmit({ module: "livestock", endpoint: "/livestock/batches" })
    );

    expect(result.current.loading).toBe(false);

    await act(async () => {
      await result.current.submit({ x: 1 });
    });

    expect(result.current.loading).toBe(false);
    expect(mockApiFetch).toHaveBeenCalled();
  });
});
