/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useActivityFeed } from './useActivityFeed';

interface CategoryCounts {
  verifiedUsers: number;
  maintenanceImpacts: number; // MAINTENANCE_CASCADES
  maintenanceEmails: number;  // MAINTENANCE_EMAIL
}

interface NotificationCenterShape {
  counts: CategoryCounts;
  reset: (category?: keyof CategoryCounts) => void;
}

const NotificationCenterContext = createContext<NotificationCenterShape | undefined>(undefined);

export function NotificationCenterProvider({ children }: { children: ReactNode }){
  const { items } = useActivityFeed();
  const [counts,setCounts] = useState<CategoryCounts>({ verifiedUsers:0, maintenanceImpacts:0, maintenanceEmails:0 });
  const lastIdRef = useRef<string | null>(null);

  // Increment counters only for newly added items (activity feed prepends)
  useEffect(()=>{
    if(items.length===0) return;
    const newest = items[0];
    if (lastIdRef.current === newest.id) return; // nothing new since last check
    lastIdRef.current = newest.id;
    if(newest.type==='USER_VERIFIED') setCounts(c=> ({ ...c, verifiedUsers: c.verifiedUsers + 1 }));
    else if(newest.type==='MAINTENANCE_CASCADES') setCounts(c=> ({ ...c, maintenanceImpacts: c.maintenanceImpacts + 1 }));
    else if(newest.type==='MAINTENANCE_EMAIL') setCounts(c=> ({ ...c, maintenanceEmails: c.maintenanceEmails + 1 }));
  },[items]);

  const reset = (category?: keyof CategoryCounts) => {
    if(!category) return setCounts({ verifiedUsers:0, maintenanceImpacts:0, maintenanceEmails:0 });
    setCounts(c=> ({ ...c, [category]: 0 } as CategoryCounts));
  };

  const value = useMemo(()=> ({ counts, reset }), [counts]);
  return <NotificationCenterContext.Provider value={value}>{children}</NotificationCenterContext.Provider>;
}

export function useNotificationCenter(){
  const ctx = useContext(NotificationCenterContext);
  if(!ctx) throw new Error('useNotificationCenter must be used within NotificationCenterProvider');
  return ctx;
}

export default NotificationCenterContext;