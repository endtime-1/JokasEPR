"use client";

import { useEffect } from "react";

/**
 * Self-heal for the "disappearing content" bug (see app-shell.tsx's
 * onApiUnavailable comment): when a Hostinger cold-start/hibernation hits
 * while a page is loading, its data-fetch can fail with nothing to retry
 * it later. app-shell polls in the background and fires a global
 * "api:recovered" event once the API responds again — this hook re-runs
 * `reload` when that happens, but only when `shouldReload` is true, so a
 * page that already has data isn't disrupted by a needless background
 * re-fetch. Mirrors the api:recovered listener pattern already used
 * throughout poultry-pages.tsx (PoultryHousesPage, FlockBatchesPage,
 * PoultryRecordPage, usePoultryOptions, etc.) — this hook exists so every
 * other page module doesn't have to hand-write the same four lines.
 */
export function useApiRecovery(shouldReload: boolean, reload: () => void) {
  useEffect(() => {
    function onRecovered() {
      if (shouldReload) reload();
    }
    window.addEventListener("api:recovered", onRecovered);
    return () => window.removeEventListener("api:recovered", onRecovered);
  }, [shouldReload]);
}
