import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useState } from "react";

export function useNetwork() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // Event-driven: fires immediately with the current state, then again on
    // every real connectivity change (WiFi toggle, airplane mode, carrier
    // handoff) — no fixed-interval polling burning battery in the background.
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected && !!state.isInternetReachable);
    });
    return () => unsubscribe();
  }, []);

  const recheck = useCallback(async () => {
    try {
      const state = await NetInfo.fetch();
      setOnline(!!state.isConnected && !!state.isInternetReachable);
    } catch {
      setOnline(false);
    }
  }, []);

  return { online, recheck };
}
