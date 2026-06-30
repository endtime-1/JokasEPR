import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as Crypto from "expo-crypto";
import { queueSubmission } from "../db/database";
import { apiFetch, ApiError } from "../api/client";
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
        body: JSON.stringify(payload)
      });
      onSuccess?.();
    } catch (err) {
      if (err instanceof ApiError) {
        // Real server rejection (4xx/5xx) — show the error, do NOT queue
        let msg = "Submission failed. Please check your input and try again.";
        try {
          const body = JSON.parse(err.message) as Record<string, unknown>;
          if (Array.isArray(body.message)) msg = (body.message as string[]).join(", ");
          else if (typeof body.message === "string") msg = body.message;
        } catch { msg = err.message; }
        setError(msg);
        onError?.(msg);
        Alert.alert("Error", msg);
        return;
      }
      // Network / timeout error — queue for offline sync
      await queueSubmission(localId, module, endpoint, payload, method);
      await refreshCount();
      onSuccess?.();
    } finally {
      setLoading(false);
    }
  }, [online, module, endpoint, method, onSuccess, onError, refreshCount]);

  return { submit, loading, error };
}
