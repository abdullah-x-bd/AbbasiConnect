import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

// Poll only while the screen is mounted and the app is active. The current
// gateway broadcasts globally, so mobile polling avoids opening an unfiltered
// stream for every signed-in member.
export function useRefresh(load: () => Promise<void>, dependencies: unknown[] = [], ms = 12000) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, dependencies);
  useEffect(() => {
    let live = true;
    void refresh();
    const interval = setInterval(() => { if (live && AppState.currentState === "active") void refresh(); }, ms);
    const subscription = AppState.addEventListener("change", state => { if (live && state === "active") void refresh(); });
    return () => { live = false; clearInterval(interval); subscription.remove(); };
  }, [refresh, ms]);
  return { refresh, refreshing };
}
