import { Alert } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { LoginScreen } from "../LoginScreen";

jest.setTimeout(30000);

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
}));

jest.mock("../../auth/AuthContext", () => ({
  useAuth: jest.fn(),
}));

import { useAuth } from "../../auth/AuthContext";
const mockUseAuth = useAuth as jest.Mock;

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ login: jest.fn() });
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  alertSpy?.mockRestore();
});

describe("LoginScreen — validation", () => {
  it("shows an error when email is empty and form is submitted", async () => {
    const { getByText } = await render(<LoginScreen />);
    await act(async () => {
      fireEvent.press(getByText("Sign in"));
    });
    await waitFor(() => expect(getByText(/Email is required/)).toBeTruthy());
  });

  it("shows an error for an invalid email format", async () => {
    const { getByText, getByPlaceholderText } = await render(<LoginScreen />);
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("you@company.com"), "not-an-email");
    });
    await act(async () => {
      fireEvent.press(getByText("Sign in"));
    });
    await waitFor(() => expect(getByText(/Invalid email address/)).toBeTruthy());
  });

  it("shows an error when password is empty", async () => {
    const { getByText, getByPlaceholderText } = await render(<LoginScreen />);
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("you@company.com"), "admin@jokas.local");
    });
    await act(async () => {
      fireEvent.press(getByText("Sign in"));
    });
    await waitFor(() => expect(getByText(/Password is required/)).toBeTruthy());
  });

  it("shows an error when password is too short", async () => {
    const { getByText, getByPlaceholderText } = await render(<LoginScreen />);
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("you@company.com"), "admin@jokas.local");
    });
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("••••••••"), "abc");
    });
    await act(async () => {
      fireEvent.press(getByText("Sign in"));
    });
    await waitFor(() => expect(getByText(/Password too short/)).toBeTruthy());
  });
});

describe("LoginScreen — submission", () => {
  it("calls login with trimmed, lowercased email on valid input", async () => {
    const loginFn = jest.fn().mockResolvedValueOnce(undefined);
    mockUseAuth.mockReturnValue({ login: loginFn });

    const { getByText, getByPlaceholderText } = await render(<LoginScreen />);
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("you@company.com"), "  Admin@Jokas.LOCAL  ");
    });
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("••••••••"), "Password1");
    });
    await act(async () => {
      fireEvent.press(getByText("Sign in"));
    });

    await waitFor(() => expect(loginFn).toHaveBeenCalledWith("admin@jokas.local", "Password1"));
  });

  it("shows an Alert when login throws an error", async () => {
    const loginFn = jest.fn().mockRejectedValueOnce(new Error("Invalid credentials"));
    mockUseAuth.mockReturnValue({ login: loginFn });

    const { getByText, getByPlaceholderText } = await render(<LoginScreen />);
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("you@company.com"), "admin@jokas.local");
    });
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("••••••••"), "WrongPassword");
    });
    await act(async () => {
      fireEvent.press(getByText("Sign in"));
    });

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Sign-in failed", "Invalid credentials")
    );
  });
});
