import { runSync } from "../sync";
import { getPendingSubmissions, markSynced, markSyncError } from "../database";
import { apiFetch } from "../../api/client";

jest.mock("../database", () => ({
  getPendingSubmissions: jest.fn(),
  markSynced: jest.fn().mockResolvedValue(undefined),
  markSyncError: jest.fn().mockResolvedValue(undefined),
  countPending: jest.fn().mockResolvedValue(0),
}));

jest.mock("../../api/client", () => ({
  apiFetch: jest.fn(),
}));

const mockGetPending = getPendingSubmissions as jest.Mock;
const mockMarkSynced = markSynced as jest.Mock;
const mockMarkSyncError = markSyncError as jest.Mock;
const mockApiFetch = apiFetch as jest.Mock;

const pending1 = {
  id: "local-1",
  module: "livestock",
  endpoint: "/livestock/batches",
  method: "POST",
  payload: JSON.stringify({ name: "Batch A" }),
  created_at: "2026-06-17T00:00:00.000Z",
  synced: 0,
  sync_error: null,
  attempts: 0,
  record_id: null,
};

const pending2 = {
  ...pending1,
  id: "local-2",
  payload: JSON.stringify({ name: "Batch B", _offlineId: "local-2" }),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("runSync", () => {
  it("returns zero counts and skips API call when the queue is empty", async () => {
    mockGetPending.mockResolvedValueOnce([]);
    const result = await runSync();
    expect(result).toEqual({ synced: 0, failed: 0, duplicates: 0 });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("strips _offlineId from payload before sending", async () => {
    mockGetPending.mockResolvedValueOnce([pending2]);
    mockApiFetch.mockResolvedValueOnce({
      data: { results: [{ localId: "local-2", status: "synced", recordId: "srv-2" }], synced: 1, duplicates: 0, failed: 0 },
    });
    await runSync();
    const body = JSON.parse((mockApiFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.records[0].payload).not.toHaveProperty("_offlineId");
    expect(body.records[0].payload).toHaveProperty("name", "Batch B");
  });

  it("marks records as synced on a successful batch response", async () => {
    mockGetPending.mockResolvedValueOnce([pending1]);
    mockApiFetch.mockResolvedValueOnce({
      data: {
        results: [{ localId: "local-1", status: "synced", recordId: "server-1" }],
        synced: 1,
        duplicates: 0,
        failed: 0,
      },
    });
    const result = await runSync();
    expect(result).toEqual({ synced: 1, failed: 0, duplicates: 0 });
    expect(mockMarkSynced).toHaveBeenCalledWith("local-1", "server-1");
    expect(mockMarkSyncError).not.toHaveBeenCalled();
  });

  it("treats duplicate status as synced locally", async () => {
    mockGetPending.mockResolvedValueOnce([pending1]);
    mockApiFetch.mockResolvedValueOnce({
      data: {
        results: [{ localId: "local-1", status: "duplicate", recordId: "server-1" }],
        synced: 0,
        duplicates: 1,
        failed: 0,
      },
    });
    const result = await runSync();
    expect(result.synced).toBe(1);
    expect(mockMarkSynced).toHaveBeenCalledWith("local-1", "server-1");
  });

  it("marks records as error on a failed batch item", async () => {
    mockGetPending.mockResolvedValueOnce([pending1]);
    mockApiFetch.mockResolvedValueOnce({
      data: {
        results: [{ localId: "local-1", status: "failed", error: "Validation failed" }],
        synced: 0,
        duplicates: 0,
        failed: 1,
      },
    });
    const result = await runSync();
    expect(result).toEqual({ synced: 0, failed: 1, duplicates: 0 });
    expect(mockMarkSyncError).toHaveBeenCalledWith("local-1", "Validation failed");
  });

  it("retries up to 3 times on a network error then marks all as failed", async () => {
    jest.useFakeTimers();
    mockGetPending.mockResolvedValueOnce([pending1]);
    const networkErr = new Error("Network request failed");
    mockApiFetch.mockRejectedValue(networkErr);

    const syncPromise = runSync();
    await jest.runAllTimersAsync();
    const result = await syncPromise;

    expect(mockApiFetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ synced: 0, failed: 1, duplicates: 0 });
    expect(mockMarkSyncError).toHaveBeenCalledWith("local-1", networkErr.message);
    jest.useRealTimers();
  });

  it("does not retry on non-network errors", async () => {
    mockGetPending.mockResolvedValueOnce([pending1]);
    mockApiFetch.mockRejectedValueOnce(new Error("401 Unauthorized"));

    const result = await runSync();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ synced: 0, failed: 1, duplicates: 0 });
  });
});
