import { renderHook, act, waitFor } from "@testing-library/react-native";
import * as Network from "expo-network";
import { useNetwork } from "../useNetwork";

const mockNetwork = Network as unknown as {
  getNetworkStateAsync: jest.Mock;
  __setOnline: (v: boolean) => void;
  __reset: () => void;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNetwork.__reset();
});

describe("useNetwork", () => {
  it("reports online when connected and reachable", async () => {
    mockNetwork.__setOnline(true);
    const { result } = renderHook(() => useNetwork());
    await waitFor(() => {
      expect(result.current.online).toBe(true);
    });
  });

  it("reports offline when isConnected is false", async () => {
    mockNetwork.__setOnline(false);
    const { result } = renderHook(() => useNetwork());
    await waitFor(() => {
      expect(result.current.online).toBe(false);
    });
  });

  it("re-checks when recheck() is called", async () => {
    mockNetwork.__setOnline(true);
    const { result } = renderHook(() => useNetwork());
    await waitFor(() => expect(result.current.online).toBe(true));

    mockNetwork.__setOnline(false);
    await act(async () => {
      await result.current.recheck();
    });
    expect(result.current.online).toBe(false);
  });

  it("defaults to offline when getNetworkStateAsync throws", async () => {
    mockNetwork.getNetworkStateAsync.mockRejectedValueOnce(new Error("No network module"));
    const { result } = renderHook(() => useNetwork());
    await waitFor(() => {
      expect(result.current.online).toBe(false);
    });
  });
});
