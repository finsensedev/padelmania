import { useContext, useEffect } from 'react';
import { SocketContext } from 'src/contexts/SocketProvider';
import { useActivityFeed } from 'src/contexts/useActivityFeed';
import useNotification from 'src/hooks/useNotification';

// Listens for user:verified events (newly verified customers) and pushes to activity feed.
export function useUserVerificationEvents(){
  const { socket } = useContext(SocketContext);
  const { push } = useActivityFeed();
  const { toaster } = useNotification();
  useEffect(()=>{
    if(!socket) return;
    const handler = (p: { userId:string; email:string; at:string }) => {
      if(import.meta.env.DEV) console.debug('[ActivityFeed] user:verified event', p);
      const msg = `User verified: ${p.email}`;
      push({ type:'USER_VERIFIED', message: msg, at: p.at, meta: { ...p } });
      toaster(msg, { variant:'success' });
    };
    socket.on('user:verified', handler);
    return ()=>{ socket.off('user:verified', handler); };
  },[socket,push,toaster]);
}

export default useUserVerificationEvents;
