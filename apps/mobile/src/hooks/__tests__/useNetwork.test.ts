import { renderHook, act, waitFor } from "@testing-library/react-native";
import NetInfo from "@react-native-community/netinfo";
import { useNetwork } from "../useNetwork";

const mockNetInfo = NetInfo as unknown as {
  fetch: jest.Mock;
  addEventListener: jest.Mock;
  __setOnline: (v: boolean) => void;
  __reset: () => void;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNetInfo.__reset();
});

describe("useNetwork", () => {
  it("reports online when connected and reachable", async () => {
    mockNetInfo.__setOnline(true);
    const { result } = await renderHook(() => useNetwork());
    await waitFor(() => {
      expect(result.current.online).toBe(true);
    });
  });

  it("reports offline when isConnected is false", async () => {
    mockNetInfo.__setOnline(false);
    const { result } = await renderHook(() => useNetwork());
    await waitFor(() => {
      expect(result.current.online).toBe(false);
    });
  });

  it("reacts to a connectivity change event without needing recheck()", async () => {
    mockNetInfo.__setOnline(true);
    const { result } = await renderHook(() => useNetwork());
    await waitFor(() => expect(result.current.online).toBe(true));

    await act(async () => {
      mockNetInfo.__setOnline(false);
    });
    await waitFor(() => expect(result.current.online).toBe(false));
  });

  it("re-checks when recheck() is called", async () => {
    mockNetInfo.__setOnline(true);
    const { result } = await renderHook(() => useNetwork());
    await waitFor(() => expect(result.current.online).toBe(true));

    mockNetInfo.__setOnline(false);
    await act(async () => {
      await result.current.recheck();
    });
    expect(result.current.online).toBe(false);
  });

  it("defaults to offline when recheck()'s fetch throws", async () => {
    mockNetInfo.__setOnline(true);
    const { result } = await renderHook(() => useNetwork());
    await waitFor(() => expect(result.current.online).toBe(true));

    mockNetInfo.fetch.mockRejectedValueOnce(new Error("No network module"));
    await act(async () => {
      await result.current.recheck();
    });
    expect(result.current.online).toBe(false);
  });
});
