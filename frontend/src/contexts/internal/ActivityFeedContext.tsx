import { createContext } from 'react';
export interface ActivityItem {
  id: string;
  type: 'BOOKING_CANCELLED' | 'MAINTENANCE_CREATED' | 'MAINTENANCE_CASCADES' | 'USER_VERIFIED' | 'MAINTENANCE_EMAIL';
  message: string;
  at: string;
  meta?: Record<string, unknown>;
}
export interface ActivityFeedContextShape {
  items: ActivityItem[];
  push: (item: Omit<ActivityItem,'id'>) => void;
  clear: ()=>void;
  unseen: number;
  markAllSeen: () => void;
}
export const ActivityFeedContext = createContext<ActivityFeedContextShape | undefined>(undefined);
