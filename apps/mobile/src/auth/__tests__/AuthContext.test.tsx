import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "../AuthContext";
import { ApiError } from "../../api/client";

jest.mock("../../api/client", () => ({
  getAccessToken: jest.fn(),
  apiFetch: jest.fn(),
  clearSession: jest.fn().mockResolvedValue(undefined),
  login: jest.fn(),
  logout: jest.fn().mockResolvedValue(undefined),
  // Mobile app update (2026-08-16): the cold-launch auth-ready gate (S-03)
  // added an unconditional markAuthReady() call in restoreSession(), right
  // after getAccessToken() and before the try block that would otherwise
  // catch it. This mock never accounted for it — calling undefined() threw
  // synchronously, aborting restoreSession() before setLoading(false) ran,
  // so `loading` never flipped and every waitFor(() => !loading) timed out.
  markAuthReady: jest.fn(),
  // AuthContext.tsx's restoreSession() does `err instanceof ApiError` in
  // its catch block — this mock never provided it either (masked until the
  // markAuthReady fix above let execution actually reach that line), so
  // `err instanceof undefined` threw a TypeError instead of the 401 branch
  // ever running. Real class, not a mock, same as client.test.ts's own
  // convention — instanceof needs the genuine constructor.
  ApiError: jest.requireActual("../../api/client").ApiError,
}));

import { apiFetch, clearSession, getAccessToken, login as apiLogin } from "../../api/client";

const mockGetAccessToken = getAccessToken as jest.Mock;
const mockApiFetch = apiFetch as jest.Mock;
const mockClearSession = clearSession as jest.Mock;
const mockApiLogin = apiLogin as jest.Mock;

const mockUser = {
  id: "u1",
  companyId: "c1",
  email: "admin@jokas.local",
  fullName: "Admin",
  roles: ["ADMIN"],
  permissions: ["ALL"],
  branchIds: [],
  farmIds: [],
  warehouseIds: [],
  productionSiteIds: [],
  hasGlobalAccess: true,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AuthProvider — restoreSession", () => {
  it("restores user when a valid token is stored", async () => {
    mockGetAccessToken.mockResolvedValueOnce("valid-token");
    mockApiFetch.mockResolvedValueOnce({ data: mockUser });

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(mockUser);
  });

  it("stays null when no token is stored", async () => {
    mockGetAccessToken.mockResolvedValueOnce(null);

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("clears session and sets user to null when /auth/me returns 401", async () => {
    // Must be a genuine ApiError with status 401 — restoreSession()'s catch
    // branch only clears the session on `err instanceof ApiError && err.status
    // === 401`; a plain Error falls through to the retry-with-delay path
    // instead (3 attempts, 3s apart) and never calls clearSession at all.
    mockGetAccessToken.mockResolvedValueOnce("expired-token");
    mockApiFetch.mockRejectedValueOnce(new ApiError(401, "Unauthorized"));

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(mockClearSession).toHaveBeenCalled();
  });
});

describe("AuthProvider — login", () => {
  it("sets user state after a successful login", async () => {
    mockGetAccessToken.mockResolvedValueOnce(null);
    mockApiLogin.mockResolvedValueOnce(mockUser);

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login("admin@jokas.local", "Password1");
    });

    expect(result.current.user).toEqual(mockUser);
  });

  it("propagates errors from the API so the screen can show them", async () => {
    mockGetAccessToken.mockResolvedValueOnce(null);
    mockApiLogin.mockRejectedValueOnce(new Error("Invalid credentials"));

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => { await result.current.login("bad@jokas.local", "wrong"); })
    ).rejects.toThrow("Invalid credentials");
  });
});

describe("AuthProvider — logout", () => {
  it("clears the user state on logout", async () => {
    mockGetAccessToken.mockResolvedValueOnce("valid-token");
    mockApiFetch.mockResolvedValueOnce({ data: mockUser });

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(mockUser));

    await act(async () => { await result.current.logout(); });
    expect(result.current.user).toBeNull();
  });
});
