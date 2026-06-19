import { Alert } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { LoginScreen } from "../LoginScreen";

// Passthrough wrapper — no React import needed in factory
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
}));

jest.mock("../../auth/AuthContext", () => ({
  useAuth: jest.fn(),
}));

import { useAuth } from "../../auth/AuthContext";
const mockUseAuth = useAuth as jest.Mock;

const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ login: jest.fn() });
});

describe("LoginScreen — validation", () => {
  it("shows an error when email is empty and form is submitted", async () => {
    const { getByText } = render(<LoginScreen />);
    fireEvent.press(getByText("Sign in"));
    await waitFor(() => {
      expect(getByText("Email is required")).toBeTruthy();
    });
  });

  it("shows an error for an invalid email format", async () => {
    const { getByText, getByPlaceholderText } = render(<LoginScreen />);
    fireEvent.changeText(getByPlaceholderText("you@company.com"), "not-an-email");
    fireEvent.press(getByText("Sign in"));
    await waitFor(() => {
      expect(getByText("Invalid email address")).toBeTruthy();
    });
  });

  it("shows an error when password is empty", async () => {
    const { getByText, getByPlaceholderText } = render(<LoginScreen />);
    fireEvent.changeText(getByPlaceholderText("you@company.com"), "admin@jokas.local");
    fireEvent.press(getByText("Sign in"));
    await waitFor(() => {
      expect(getByText("Password is required")).toBeTruthy();
    });
  });

  it("shows an error when password is too short", async () => {
    const { getByText, getByPlaceholderText } = render(<LoginScreen />);
    fireEvent.changeText(getByPlaceholderText("you@company.com"), "admin@jokas.local");
    fireEvent.changeText(getByPlaceholderText("••••••••"), "abc");
    fireEvent.press(getByText("Sign in"));
    await waitFor(() => {
      expect(getByText("Password too short")).toBeTruthy();
    });
  });
});

describe("LoginScreen — submission", () => {
  it("calls login with trimmed, lowercased email on valid input", async () => {
    const loginFn = jest.fn().mockResolvedValueOnce(undefined);
    mockUseAuth.mockReturnValue({ login: loginFn });

    const { getByText, getByPlaceholderText } = render(<LoginScreen />);
    fireEvent.changeText(getByPlaceholderText("you@company.com"), "  Admin@Jokas.LOCAL  ");
    fireEvent.changeText(getByPlaceholderText("••••••••"), "Password1");

    await act(async () => {
      fireEvent.press(getByText("Sign in"));
    });

    expect(loginFn).toHaveBeenCalledWith("admin@jokas.local", "Password1");
  });

  it("shows an Alert when login throws an error", async () => {
    const loginFn = jest.fn().mockRejectedValueOnce(new Error("Invalid credentials"));
    mockUseAuth.mockReturnValue({ login: loginFn });

    const { getByText, getByPlaceholderText } = render(<LoginScreen />);
    fireEvent.changeText(getByPlaceholderText("you@company.com"), "admin@jokas.local");
    fireEvent.changeText(getByPlaceholderText("••••••••"), "WrongPassword");

    await act(async () => {
      fireEvent.press(getByText("Sign in"));
    });

    expect(alertSpy).toHaveBeenCalledWith("Sign-in failed", "Invalid credentials");
  });
});
