"use client";

import { useEffect, useState } from "react";
import { isStaleBuildError, recoverFromStaleBuild } from "../components/chunk-error-handler";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [staleGaveUp, setStaleGaveUp] = useState(false);

  useEffect(() => {
    if (isStaleBuildError(error?.name ?? "", error?.message ?? "")) {
      if (recoverFromStaleBuild() === "givingup") setStaleGaveUp(true);
    }
  }, [error]);

  if (staleGaveUp) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: 440 }}>
          <p style={{ color: "#f58220", fontWeight: 700, marginBottom: 8 }}>The app was updated</p>
          <p style={{ color: "#666", fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
            Your browser is holding an old version and reloading didn&rsquo;t clear it. Do a hard refresh:
            press <b>Ctrl</b>+<b>Shift</b>+<b>R</b> (or <b>Cmd</b>+<b>Shift</b>+<b>R</b> on Mac).
          </p>
          <button
            onClick={() => {
              try { sessionStorage.removeItem("jokas_chunk_reloads"); } catch { /* noop */ }
              window.location.reload();
            }}
            style={{ background: "#f58220", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 600, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
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
  );
}
