"use client";

import { useEffect, useState } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    const name = error?.name ?? "";
    const msg = error?.message ?? "";
    const stale =
      name === "ChunkLoadError" ||
      msg.includes("Loading chunk") ||
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("Importing a module script failed") ||
      msg.includes("Unexpected token '<'");
    if (!stale) return;

    // Bounded retries so a genuinely broken server bundle can't spin the
    // browser forever.
    let n = 0;
    try { n = Number(sessionStorage.getItem("jokas_chunk_reloads") ?? "0") || 0; } catch { /* noop */ }
    if (n >= 2) { setGaveUp(true); return; }
    try { sessionStorage.setItem("jokas_chunk_reloads", String(n + 1)); } catch { /* noop */ }
    const u = new URL(window.location.href);
    u.searchParams.set("_r", Date.now().toString(36));
    window.location.replace(u.toString());
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f0f2f5" }}>
        <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
          <div style={{ textAlign: "center", padding: "2rem", maxWidth: 440 }}>
            <p style={{ color: "#f58220", fontWeight: 700, marginBottom: 8 }}>
              {gaveUp ? "The app was updated" : "Something went wrong"}
            </p>
            <p style={{ color: "#666", fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
              {gaveUp
                ? "Your browser is holding an old version. Do a hard refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac)."
                : error?.message ?? "An unexpected error occurred."}
            </p>
            <button
              onClick={() => {
                if (gaveUp) {
                  try { sessionStorage.removeItem("jokas_chunk_reloads"); } catch { /* noop */ }
                  window.location.reload();
                } else {
                  reset();
                }
              }}
              style={{ background: "#f58220", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 600, cursor: "pointer" }}
            >
              {gaveUp ? "Reload" : "Try again"}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
