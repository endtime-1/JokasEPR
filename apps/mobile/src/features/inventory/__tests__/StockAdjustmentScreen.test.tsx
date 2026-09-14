import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { StockAdjustmentScreen } from "../StockAdjustmentScreen";

// Matches LoginScreen.test.tsx's convention — under full-suite parallel load
// these full-tree (ScreenWrapper + SyncBanner + Modal) renders can exceed the
// 5000ms default even though each finishes in ~1-2s in isolation.
jest.setTimeout(30000);

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: jest.fn(), setOptions: jest.fn() }),
}));

jest.mock("../../../hooks/useSync", () => ({
  useSync: jest.fn(() => ({ pending: 0, failed: 0, syncing: false, online: true, refreshCount: jest.fn() })),
}));

const mockSubmit = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../hooks/useSubmit", () => ({
  useSubmit: jest.fn(() => ({ submit: mockSubmit, loading: false })),
}));

const OPTS = {
  warehouses: [{ id: "wh-feed", name: "Jokas Feed Store" }],
  items: [
    {
      id: "item-mash",
      warehouseId: "wh-feed",
      quantityOnHand: 500,
      product: { id: "prod-mash", name: "Layer Mash", sku: "L001" },
      warehouse: { name: "Jokas Feed Store" },
    },
  ],
};
jest.mock("../../../hooks/useLookup", () => ({
  useLookup: jest.fn(() => ({ data: OPTS, loading: false, fromCache: false, error: null })),
}));

jest.mock("../../../api/endpoints", () => ({
  fetchInventoryOptions: jest.fn(),
}));

async function fillStockItem(getByText: any) {
  await act(async () => {
    fireEvent.press(getByText("Select warehouse…"));
  });
  await act(async () => {
    fireEvent.press(getByText("Jokas Feed Store"));
  });
  await act(async () => {
    fireEvent.press(getByText("Select item…"));
  });
  await act(async () => {
    fireEvent.press(getByText(/Layer Mash/));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSubmit.mockResolvedValue(undefined);
});

describe("StockAdjustmentScreen — validation", () => {
  it("blocks submission and shows every required-field error when the form is empty", async () => {
    const { getByText } = await render(<StockAdjustmentScreen />);
    await act(async () => {
      fireEvent.press(getByText("Submit Adjustment"));
    });
    expect(getByText("Select a warehouse")).toBeTruthy();
    expect(getByText("Select a stock item")).toBeTruthy();
    expect(getByText("Select an adjustment type")).toBeTruthy();
    expect(getByText("Enter a valid quantity")).toBeTruthy();
    expect(getByText("Enter a reason for this adjustment")).toBeTruthy();
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});

describe("StockAdjustmentScreen — direction/quantity sign", () => {
  it("submits a positive quantity for an add-type adjustment (Found / Surplus)", async () => {
    const { getByText, getByPlaceholderText } = await render(<StockAdjustmentScreen />);
    await fillStockItem(getByText);

    await act(async () => {
      fireEvent.press(getByText("Select type…"));
    });
    await act(async () => {
      fireEvent.press(getByText("Found / Surplus"));
    });
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("0"), "25");
    });
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("Explain why this adjustment is needed…"), "Counted extra bags on the shelf");
    });
    await act(async () => {
      fireEvent.press(getByText("Submit Adjustment"));
    });

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: "wh-feed",
        productId: "prod-mash",
        adjustmentType: "FOUND_STOCK",
        quantity: 25,
        reason: "Counted extra bags on the shelf",
      })
    );
  });

  it("flips the sign to negative when the adjustment type defaults to remove (Damaged)", async () => {
    const { getByText, getByPlaceholderText } = await render(<StockAdjustmentScreen />);
    await fillStockItem(getByText);

    await act(async () => {
      fireEvent.press(getByText("Select type…"));
    });
    await act(async () => {
      fireEvent.press(getByText("Damaged"));
    });
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("0"), "10");
    });
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("Explain why this adjustment is needed…"), "Bags torn open by rodents");
    });
    await act(async () => {
      fireEvent.press(getByText("Submit Adjustment"));
    });

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ adjustmentType: "DAMAGE", quantity: -10 })
    );
  });

  it("lets the user override the default direction, flipping the submitted sign", async () => {
    const { getByText, getByPlaceholderText } = await render(<StockAdjustmentScreen />);
    await fillStockItem(getByText);

    await act(async () => {
      fireEvent.press(getByText("Select type…"));
    });
    await act(async () => {
      // Found / Surplus defaults to "add" ...
      fireEvent.press(getByText("Found / Surplus"));
    });
    await act(async () => {
      // ...but the user manually flips it to "remove".
      fireEvent.press(getByText("－  Remove from Stock"));
    });
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("0"), "5");
    });
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("Explain why this adjustment is needed…"), "Manual override test");
    });
    await act(async () => {
      fireEvent.press(getByText("Submit Adjustment"));
    });

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ adjustmentType: "FOUND_STOCK", quantity: -5 })
    );
  });
});
