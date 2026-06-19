import * as Network from "expo-network";
import { useCallback, useEffect, useState } from "react";

export function useNetwork() {
  const [online, setOnline] = useState(true);

  const check = useCallback(async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      setOnline(!!state.isConnected && !!state.isInternetReachable);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [check]);

  return { online, recheck: check };
}
