"use client";

import { useEffect } from "react";

// A stale build error — a route chunk that 404s (the browser is holding an old
// chunk manifest, or a deploy is mid-flight) surfaces as ChunkLoadError, a
// dynamic-import failure, or "Unexpected token '<'" (the server returned an
// HTML 404 page where JS was expected).
export function isStaleBuildError(name: string, msg: string): boolean {
  return (
    name === "ChunkLoadError" ||
    msg.includes("Loading chunk") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Unexpected token '<'")
  );
}

const KEY = "jokas_chunk_reloads";
const MAX = 2;

// Reload once (twice at most) to pick up the current build, bypassing the HTTP
// cache. If it's still broken after that, the server itself is serving a
// broken bundle — stop looping and let the user see a real message.
export function recoverFromStaleBuild(): "reloading" | "givingup" {
  let count = 0;
  try {
    count = Number(sessionStorage.getItem(KEY) ?? "0") || 0;
  } catch {
    /* private mode / disabled storage — fall through, we just can't rate-limit */
  }
  if (count >= MAX) return "givingup";
  try {
    sessionStorage.setItem(KEY, String(count + 1));
  } catch {
    /* noop */
  }
  const u = new URL(window.location.href);
  // cache-bust so the reload can't be served the same stale document
  u.searchParams.set("_r", Date.now().toString(36));
  window.location.replace(u.toString());
  return "reloading";
}

// Clear the counter once a page has actually rendered fine for a moment, so a
// genuinely stale chunk weeks later still gets its retries.
export function markBuildHealthy(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

export function ChunkErrorHandler() {
  useEffect(() => {
    const healthy = setTimeout(markBuildHealthy, 4000);

    function handle(name: string, msg: string) {
      if (!isStaleBuildError(name, msg)) return;
      if (recoverFromStaleBuild() === "givingup") {
        // eslint-disable-next-line no-console
        console.error("Stale build: reloads exhausted — the server may be serving a broken bundle.");
      }
    }
    function onRejection(e: PromiseRejectionEvent) {
      handle(String(e.reason?.name ?? ""), String(e.reason?.message ?? ""));
    }
    function onError(e: ErrorEvent) {
      handle(String((e.error as Error | undefined)?.name ?? ""), String(e.message ?? ""));
    }
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      clearTimeout(healthy);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
