"use client";

import { useEffect } from "react";

export function ChunkErrorHandler() {
  useEffect(() => {
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const name = event.reason?.name ?? "";
      const msg = String(event.reason?.message ?? "");
      if (name === "ChunkLoadError" || msg.includes("Loading chunk") || msg.includes("Failed to fetch dynamically imported module")) {
        window.location.reload();
      }
    }
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, []);

  return null;
}
