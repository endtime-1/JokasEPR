import { fireEvent, render } from "@testing-library/react-native";
import { SyncBanner } from "../SyncBanner";

jest.mock("../../hooks/useSync", () => ({
  useSync: jest.fn(),
}));

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { useSync } from "../../hooks/useSync";
const mockUseSync = useSync as jest.Mock;

function state(overrides: Partial<ReturnType<typeof useSync>> = {}) {
  return {
    pending: 0,
    failed: 0,
    syncing: false,
    lastSyncAt: null,
    lastResult: null,
    sync: jest.fn(),
    refreshCount: jest.fn(),
    online: true,
    ...overrides,
  };
}

describe("SyncBanner — surfaces permanently-failed records instead of going silent (M5)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders nothing when there is nothing pending or failed and the device is online", async () => {
    mockUseSync.mockReturnValue(state());
    const { queryByText, toJSON } = await render(<SyncBanner />);
    expect(toJSON()).toBeNull();
    expect(queryByText(/failed/)).toBeNull();
  });

  it("stays visible and calls out failed records even when pending is 0 and online — the exact bug this fixes", async () => {
    // Previously `pending === 0 && online` hid the banner entirely, so a
    // record stuck at the retry ceiling was invisible outside Sync Status.
    mockUseSync.mockReturnValue(state({ pending: 0, failed: 2, online: true }));
    const { getByText } = await render(<SyncBanner />);
    expect(getByText(/2 failed — needs attention/)).toBeTruthy();
  });

  it("shows both pending and failed counts together", async () => {
    mockUseSync.mockReturnValue(state({ pending: 3, failed: 1, online: true }));
    const { getByText } = await render(<SyncBanner />);
    expect(getByText(/3 records pending sync/)).toBeTruthy();
    expect(getByText(/1 failed — needs attention/)).toBeTruthy();
  });

  it("shows the ordinary pending message when there are no failures", async () => {
    mockUseSync.mockReturnValue(state({ pending: 4, failed: 0, online: true }));
    const { getByText, queryByText } = await render(<SyncBanner />);
    expect(getByText("4 records pending sync")).toBeTruthy();
    expect(queryByText(/failed/)).toBeNull();
  });

  it("navigates to Sync Status when tapped with failed-only records (no pending) — previously had no tap target at all", async () => {
    mockUseSync.mockReturnValue(state({ pending: 0, failed: 2, online: true }));
    const { getByText } = await render(<SyncBanner />);
    fireEvent.press(getByText(/2 failed — needs attention/));
    expect(mockNavigate).toHaveBeenCalledWith("SyncStatus");
  });

  it("navigates to Sync Status when tapped with failures while offline too", async () => {
    mockUseSync.mockReturnValue(state({ pending: 1, failed: 1, online: false }));
    const { getByText } = await render(<SyncBanner />);
    fireEvent.press(getByText("Review"));
    expect(mockNavigate).toHaveBeenCalledWith("SyncStatus");
  });
});
