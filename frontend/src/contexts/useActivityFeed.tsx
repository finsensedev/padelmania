import { useContext } from 'react';
import { ActivityFeedContext } from './internal/ActivityFeedContext';

export function useActivityFeed(){
  const ctx = useContext(ActivityFeedContext);
  if(!ctx) throw new Error('useActivityFeed must be used within ActivityFeedProvider');
  return ctx;
}
