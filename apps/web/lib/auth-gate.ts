// auth-gate coordinates auth-context with apiFetch so they never race on token refresh.
//
// The AppShell renders {children} even while auth is loading, which means page
// components mount and call apiFetch() concurrently with auth-context's session check.
// If the access token is expired, both independently call the refresh endpoint with the
// same old token — the API rotates tokens on each use, so the second caller always gets
// a "token already revoked" 401 and ends up kicking the user to login.
//
// Solution: apiFetch awaits authReady before making its first request. Auth-context
// calls signalAuthReady() when its session check is done (success or failure). By the
// time page components' calls land, the refresh is already done and the new token is set.
let _resolve: (() => void) | null = null;

export const authReady: Promise<void> = new Promise<void>(res => {
  _resolve = res;
  // Safety valve: unblock after 15 seconds even if auth-context crashes or hangs
  setTimeout(res, 15000);
});

export function signalAuthReady(): void {
  _resolve?.();
}
