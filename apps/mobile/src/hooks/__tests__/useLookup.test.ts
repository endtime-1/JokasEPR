import { renderHook, waitFor } from "@testing-library/react-native";
import { useLookup } from "../useLookup";
import { getCachedLookup, setCachedLookup } from "../../db/database";
import { useNetwork } from "../useNetwork";

jest.mock("../../db/database", () => ({
  getCachedLookup: jest.fn(),
  setCachedLookup: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../useNetwork", () => ({
  useNetwork: jest.fn().mockReturnValue({ online: true, recheck: jest.fn() }),
}));

const mockGetCached = getCachedLookup as jest.Mock;
const mockSetCached = setCachedLookup as jest.Mock;
const mockUseNetwork = useNetwork as jest.Mock;

const FARMS = [{ id: "f1", name: "Farm A" }];
const FRESH  = [{ id: "f1", name: "Farm A (fresh)" }];

beforeEach(() => {
  jest.clearAllMocks();
  mockSetCached.mockResolvedValue(undefined);
});

describe("useLookup", () => {
  it("returns null data without calling fetcher when skip=true", async () => {
    mockUseNetwork.mockReturnValue({ online: true });
    const fetcher = jest.fn();

    const { result } = await renderHook(() => useLookup("farms", fetcher, true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fetches from API when online and no cache", async () => {
    mockUseNetwork.mockReturnValue({ online: true });
    mockGetCached.mockResolvedValue(null);
    const fetcher = jest.fn().mockResolvedValue(FARMS);

    const { result } = await renderHook(() => useLookup("farms", fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(FARMS);
    expect(result.current.fromCache).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockSetCached).toHaveBeenCalledWith("farms", FARMS);
  });

  it("serves cache immediately, then updates with fresh API data when online", async () => {
    mockUseNetwork.mockReturnValue({ online: true });
    mockGetCached.mockResolvedValue({ data: FARMS, stale: true });
    const fetcher = jest.fn().mockResolvedValue(FRESH);

    const { result } = await renderHook(() => useLookup("farms", fetcher));
    await waitFor(() => {
      expect(result.current.data).toEqual(FRESH);
      expect(result.current.loading).toBe(false);
    });

    expect(mockSetCached).toHaveBeenCalledWith("farms", FRESH);
  });

  it("serves cached data and no error when offline", async () => {
    mockUseNetwork.mockReturnValue({ online: false });
    mockGetCached.mockResolvedValue({ data: FARMS, stale: true });
    const fetcher = jest.fn();

    const { result } = await renderHook(() => useLookup("farms", fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(FARMS);
    expect(result.current.fromCache).toBe(true);
    expect(result.current.error).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("exposes error when offline with no cache", async () => {
    mockUseNetwork.mockReturnValue({ online: false });
    mockGetCached.mockResolvedValue(null);
    const fetcher = jest.fn();

    const { result } = await renderHook(() => useLookup("farms", fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("No data available offline");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps stale cache and suppresses error when online fetch fails but cache exists", async () => {
    mockUseNetwork.mockReturnValue({ online: true });
    mockGetCached.mockResolvedValue({ data: FARMS, stale: false });
    const fetcher = jest.fn().mockRejectedValue(new Error("Network timeout"));

    const { result } = await renderHook(() => useLookup("farms", fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(FARMS);
    expect(result.current.error).toBeNull();
  });

  it("exposes error when online fetch fails and there is no cache", async () => {
    mockUseNetwork.mockReturnValue({ online: true });
    mockGetCached.mockResolvedValue(null);
    const fetcher = jest.fn().mockRejectedValue(new Error("Server error"));

    const { result } = await renderHook(() => useLookup("farms", fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("Server error");
  });
});
