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
  // `queued` is true when the submission was written to the local offline
  // queue instead of reaching the server — either because the device was
  // offline, or a network/timeout failure fell back to queueing (see the C6
  // note below). Callers use this to show "saved on this device, will sync
  // later" instead of implying the record already reached the server.
  onSuccess?: (queued: boolean) => void;
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
      onSuccess?.(true);
      return;
    }

    try {
      await apiFetch(`${endpoint}?idempotencyKey=${localId}`, {
        method,
        body: JSON.stringify(payload)
      });
      onSuccess?.(false);
    } catch (err) {
      // C6: apiFetch() wraps every failure mode — a real 4xx/5xx from the
      // server, a request timeout, a mid-flight connection drop, a malformed
      // response — in this same ApiError class, so `err instanceof ApiError`
      // was always true and the "queue for offline sync" branch below could
      // never run. A worker on weak signal whose request timed out saw a
      // generic failure alert, and the record was never written to SQLite or
      // synced — silently lost. ApiError.status === 0 is exactly how
      // client.ts already marks "no real server response" (timeout, network
      // drop, malformed body) as opposed to a genuine HTTP status code —
      // branch on that instead of the error's type.
      if (err instanceof ApiError && err.status !== 0) {
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
      // Network / timeout error (status 0, or a non-ApiError failure) — queue for offline sync
      await queueSubmission(localId, module, endpoint, payload, method);
      await refreshCount();
      onSuccess?.(true);
    } finally {
      setLoading(false);
    }
  }, [online, module, endpoint, method, onSuccess, onError, refreshCount]);

  return { submit, loading, error };
}
