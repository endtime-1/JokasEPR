import * as SecureStore from "expo-secure-store";
import {
  ApiError,
  apiFetch,
  clearSession,
  getAccessToken,
  login,
  logout,
  setSession,
} from "../client";

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const ss = SecureStore as unknown as {
  __reset: () => void;
  __set: (k: string, v: string) => void;
};

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

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

beforeEach(() => {
  jest.clearAllMocks();
  ss.__reset();
});

describe("apiFetch", () => {
  it("returns parsed JSON on a successful response", async () => {
    mockFetch.mockResolvedValueOnce(res({ data: { id: "1" } }));
    const result = await apiFetch<{ data: { id: string } }>("/test");
    expect(result).toEqual({ data: { id: "1" } });
  });

  it("includes Bearer token from secure store", async () => {
    await setSession("my-access-token", "my-refresh-token");
    mockFetch.mockResolvedValueOnce(res({ ok: true }));
    await apiFetch("/test");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer my-access-token",
        }),
      })
    );
  });

  it("omits Authorization header when no token is stored", async () => {
    mockFetch.mockResolvedValueOnce(res({ ok: true }));
    await apiFetch("/test");
    const callArgs = mockFetch.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(callArgs.headers).not.toHaveProperty("authorization");
  });

  it("retries once after a 401 when refresh succeeds", async () => {
    await setSession("stale-token", "valid-refresh");
    mockFetch
      .mockResolvedValueOnce(res(null, 401))
      .mockResolvedValueOnce(res({ data: { accessToken: "new-access", refreshToken: "new-refresh" } }))
      .mockResolvedValueOnce(res({ data: "ok" }));

    const result = await apiFetch<{ data: string }>("/test");
    expect(result).toEqual({ data: "ok" });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws ApiError with status 401 when refresh token is missing", async () => {
    mockFetch.mockResolvedValueOnce(res("Unauthorized", 401));
    await expect(apiFetch("/test")).rejects.toThrow(ApiError);
  });

  it("throws ApiError with the correct status code on non-2xx", async () => {
    mockFetch.mockResolvedValueOnce(res("Not Found", 404));
    const err = await apiFetch("/test").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
  });
});

describe("login", () => {
  it("stores tokens and returns the user on success", async () => {
    mockFetch.mockResolvedValueOnce(
      res({ data: { accessToken: "acc", refreshToken: "ref", user: mockUser } })
    );
    const user = await login("admin@jokas.local", "password");
    expect(user).toEqual(mockUser);
    expect(await getAccessToken()).toBe("acc");
  });
});

describe("logout", () => {
  it("clears stored tokens after calling the API", async () => {
    await setSession("acc", "ref");
    mockFetch.mockResolvedValueOnce(res({ ok: true }));
    await logout();
    expect(await getAccessToken()).toBeNull();
  });

  it("still clears tokens when the logout API call throws", async () => {
    await setSession("acc", "ref");
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    await logout();
    expect(await getAccessToken()).toBeNull();
  });
});

describe("setSession / clearSession", () => {
  it("round-trips tokens through secure store", async () => {
    await setSession("tok-a", "tok-r");
    expect(await getAccessToken()).toBe("tok-a");
  });

  it("clears both tokens", async () => {
    await setSession("tok-a", "tok-r");
    await clearSession();
    expect(await getAccessToken()).toBeNull();
  });
});
