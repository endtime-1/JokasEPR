"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const name = error?.name ?? "";
    const msg = error?.message ?? "";
    if (
      name === "ChunkLoadError" ||
      msg.includes("Loading chunk") ||
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("Unexpected token '<'")
    ) {
      window.location.reload();
    }
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f0f2f5" }}>
        <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
          <div style={{ textAlign: "center", padding: "2rem", maxWidth: 400 }}>
            <p style={{ color: "#f58220", fontWeight: 700, marginBottom: 8 }}>Something went wrong</p>
            <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>{error?.message ?? "An unexpected error occurred."}</p>
            <button
              onClick={() => reset()}
              style={{ background: "#f58220", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 600, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
