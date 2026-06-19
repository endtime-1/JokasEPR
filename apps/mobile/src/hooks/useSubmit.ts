import { useCallback, useState } from "react";
import * as Crypto from "expo-crypto";
import { queueSubmission } from "../db/database";
import { apiFetch } from "../api/client";
import { useNetwork } from "./useNetwork";
import { useSync } from "./useSync";

type Options = {
  module: string;
  endpoint: string;
  method?: string;
  onSuccess?: () => void;
  onError?: (msg: string) => void;
};

export function useSubmit({ module, endpoint, method = "POST", onSuccess, onError }: Options) {
  const { online } = useNetwork();
  const { refreshCount } = useSync();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = useCallback(async (payload: Record<string, unknown>) => {
    setLoading(true);
    setError("");

    const localId = await Crypto.randomUUID();

    if (!online) {
      // Queue for later sync
      await queueSubmission(localId, module, endpoint, payload, method);
      await refreshCount();
      setLoading(false);
      onSuccess?.();
      return;
    }

    try {
      await apiFetch(`${endpoint}?idempotencyKey=${localId}`, {
        method,
        body: JSON.stringify({ ...payload, _offlineId: localId })
      });
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      // Fall back to offline queue on network error
      await queueSubmission(localId, module, endpoint, payload, method);
      await refreshCount();
      onSuccess?.(); // treat as saved offline
    } finally {
      setLoading(false);
    }
  }, [online, module, endpoint, method, onSuccess, onError, refreshCount]);

  return { submit, loading, error };
}
