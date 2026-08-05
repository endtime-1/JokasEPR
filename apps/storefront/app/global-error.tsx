"use client";

import { useEffect } from "react";

// Next.js only invokes this when an error escapes the root layout itself
// (error.tsx can't catch that — it's rendered inside the layout it's meant to
// replace). Without this file, a root-layout render error shows the default
// unstyled Next.js error screen instead of the storefront's own recovery UI.
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
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#faf8f4" }}>
        <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
          <div style={{ textAlign: "center", padding: "2rem", maxWidth: 400 }}>
            <p style={{ color: "#78716c", fontWeight: 700, marginBottom: 8 }}>Something went wrong</p>
            <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={() => reset()}
              style={{ background: "#78716c", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 600, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
