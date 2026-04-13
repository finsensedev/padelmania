import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  useContext,
} from "react";
import { useQuery } from "react-query";
import { useSelector } from "react-redux";
import type { RootState } from "src/redux/store";
import { SocketContext } from "./SocketProvider";
import api from "src/utils/api";
import {
  ActivityFeedContext,
  type ActivityItem,
} from "./internal/ActivityFeedContext";

// ActivityFeedProvider: stores a capped list (50) of recent real-time events for quick in-app visibility.
export const ActivityFeedProvider = ({ children }: { children: ReactNode }) => {
  // Derive 'today' key in Africa/Nairobi (fixed business TZ) for per-day persistence
  const TZ = "Africa/Nairobi";
  const dateKey = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()); // YYYY-MM-DD
  const [dayKey, setDayKey] = useState<string>(dateKey());
  const storageKey = (k: string) => `tp_activity_${k}`;
  const [items, setItems] = useState<ActivityItem[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey(dateKey()));
      if (raw) {
        const parsed: ActivityItem[] = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      /* ignore */
    }
    return [];
  });
  const [lastSeenAt, setLastSeenAt] = useState<number>(Date.now());
  const counter = useRef(0);
  // Recompute counter from loaded items (so IDs continue monotonic)
  useEffect(() => {
    if (items.length)
      counter.current = Math.max(...items.map((i) => Number(i.id) || 0));
  }, [items]);

  // Persist whenever items change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(dayKey), JSON.stringify(items));
    } catch {
      /* storage quota ignore */
    }
  }, [items, dayKey]);

  // Midnight rollover (check every minute) based on business TZ
  useEffect(() => {
    const interval = setInterval(() => {
      const current = dateKey();
      if (current !== dayKey) {
        setDayKey(current);
        try {
          const raw = localStorage.getItem(storageKey(current));
          const parsed: ActivityItem[] = raw ? JSON.parse(raw) : [];
          setItems(Array.isArray(parsed) ? parsed : []);
          counter.current = parsed.length
            ? Math.max(...parsed.map((i) => Number(i.id) || 0))
            : 0;
          setLastSeenAt(Date.now());
        } catch {
          setItems([]);
          counter.current = 0;
          setLastSeenAt(Date.now());
        }
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [dayKey]);
  const dayKeyRef = useRef(dayKey);
  useEffect(() => {
    dayKeyRef.current = dayKey;
  }, [dayKey]);
  const push = useCallback((item: Omit<ActivityItem, "id">) => {
    counter.current += 1;
    setItems((prev) => {
      const next = [{ id: String(counter.current), ...item }, ...prev];
      if (import.meta.env.DEV) {
        console.debug("[ActivityFeed] push", {
          dayKey: dayKeyRef.current,
          added: next[0],
          total: next.length,
        });
      }
      return next.slice(0, 50);
    });
  }, []);
  const clear = useCallback(() => setItems([]), []);
  const markAllSeen = useCallback(() => setLastSeenAt(Date.now()), []);
  const unseen = items.filter(
    (i) => new Date(i.at).getTime() > lastSeenAt
  ).length;
  const { isConnected } = useContext(SocketContext);
  const { sessionActive, expiresAt } = useSelector(
    (state: RootState) => state.userSession
  );
  const isAuthenticated =
    sessionActive && (!expiresAt || expiresAt > Date.now());

  // Reset in-memory feed when the user logs out to avoid leaking prior data between sessions
  useEffect(() => {
    if (isAuthenticated) return;
    setItems([]);
    counter.current = 0;
    setLastSeenAt(Date.now());
  }, [isAuthenticated]);

  const shouldHydrate = isConnected && isAuthenticated && items.length === 0;

  useQuery<Omit<ActivityItem, "id">[], Error>(
    ["activity-feed", dayKey],
    async () => {
      const res = await api.get("/dashboard/recent-activities", {
        params: { limit: 20 },
      });
      const acts = Array.isArray(res.data) ? res.data : res.data?.data;
      if (!Array.isArray(acts) || acts.length === 0) return [];
      return acts
        .map((a: unknown) => {
          const obj = a as Record<string, unknown>;
          const rawType = typeof obj.type === "string" ? obj.type : "";
          const mappedType = mapBackendType(rawType);
          if (!mappedType) return null;
          return {
            type: mappedType,
            message: (obj.title || obj.description || rawType || "") as string,
            at: obj.time
              ? typeof obj.time === "string"
                ? obj.time
                : new Date(String(obj.time)).toISOString()
              : new Date().toISOString(),
            meta: obj,
          } as Omit<ActivityItem, "id">;
        })
        .filter(Boolean) as Array<Omit<ActivityItem, "id">>;
    },
    {
      enabled: shouldHydrate,
      staleTime: 60_000,
      onSuccess: (records) => {
        if (!records.length) return;
        setItems((prev) => {
          if (prev.length > 0) return prev;
          const next = records.slice(0, 50).map((item, idx) => ({
            id: String(counter.current + idx + 1),
            ...item,
          }));
          counter.current += next.length;
          if (import.meta.env.DEV)
            console.debug("[ActivityFeed] hydrated", next.length, "records");
          return next;
        });
      },
      onError: (error) => {
        if (import.meta.env.DEV)
          console.debug("[ActivityFeed] hydrate failed", error);
      },
    }
  );
  function mapBackendType(t: string): ActivityItem["type"] | null {
    if (t === "maintenance_created") return "MAINTENANCE_CREATED";
    if (t === "maintenance_cascade" || t === "maintenance_cancel")
      return "MAINTENANCE_CASCADES";
    if (t === "user_verified") return "USER_VERIFIED";
    if (t === "maintenance_email") return "MAINTENANCE_EMAIL";
    if (t === "booking_cancelled") return "BOOKING_CANCELLED";
    return null;
  }
  return (
    <ActivityFeedContext.Provider
      value={{ items, push, clear, unseen, markAllSeen }}
    >
      {children}
    </ActivityFeedContext.Provider>
  );
};
