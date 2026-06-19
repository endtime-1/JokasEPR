import { renderHook, act } from "@testing-library/react-native";
import { useSubmit } from "../useSubmit";
import { apiFetch } from "../../api/client";
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
}));

const mockApiFetch = apiFetch as jest.Mock;
const mockQueueSubmission = queueSubmission as jest.Mock;

const { useNetwork } = require("../useNetwork") as { useNetwork: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  useNetwork.mockReturnValue({ online: true, recheck: jest.fn() });
});

describe("useSubmit", () => {
  it("calls the API with idempotency key when online", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true });
    const onSuccess = jest.fn();

    const { result } = renderHook(() =>
      useSubmit({ module: "livestock", endpoint: "/livestock/batches", onSuccess })
    );

    await act(async () => {
      await result.current.submit({ name: "Batch A" });
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/livestock/batches?idempotencyKey="),
      expect.objectContaining({ method: "POST" })
    );
    expect(onSuccess).toHaveBeenCalled();
    expect(mockQueueSubmission).not.toHaveBeenCalled();
  });

  it("queues to SQLite and calls onSuccess when offline", async () => {
    useNetwork.mockReturnValue({ online: false, recheck: jest.fn() });
    const onSuccess = jest.fn();

    const { result } = renderHook(() =>
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
    expect(onSuccess).toHaveBeenCalled();
  });

  it("falls back to the offline queue when the API call throws", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Network timeout"));
    const onSuccess = jest.fn();

    const { result } = renderHook(() =>
      useSubmit({ module: "livestock", endpoint: "/livestock/batches", onSuccess })
    );

    await act(async () => {
      await result.current.submit({ name: "Batch C" });
    });

    expect(mockQueueSubmission).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  it("sets loading to true during the call and false after", async () => {
    let resolveFetch!: () => void;
    mockApiFetch.mockReturnValueOnce(
      new Promise<void>((r) => { resolveFetch = r; })
    );

    const { result } = renderHook(() =>
      useSubmit({ module: "livestock", endpoint: "/livestock/batches" })
    );

    let submitPromise: Promise<void>;
    act(() => {
      submitPromise = result.current.submit({ x: 1 });
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch();
      await submitPromise;
    });

    expect(result.current.loading).toBe(false);
  });
});
