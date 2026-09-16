/* ============================================
   CID Aprueba — Sidebar activity badges
   ============================================ */
import { createContext, useContext, useEffect, useState } from 'react';
import * as API from '../api.js';
import { useAuth } from './AuthContext.jsx';

const POLL_INTERVAL = 60000;
const BadgeContext = createContext(0);

export function BadgeProvider({ children }) {
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user || !API.getToken()) {
      setPendingCount(0);
      return;
    }
    let cancelled = false;
    const update = async () => {
      try {
        const result = await API.getPending(1, 100);
        if (!cancelled) setPendingCount((result.data.items || []).length);
      } catch (_err) {
        // Badges are non-critical; fail silently
      }
    };
    update();
    const timer = setInterval(update, POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user]);

  return <BadgeContext.Provider value={pendingCount}>{children}</BadgeContext.Provider>;
}

export function useBadgeCount() {
  return useContext(BadgeContext);
}
