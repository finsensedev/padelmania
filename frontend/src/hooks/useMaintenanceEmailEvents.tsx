import { useContext, useEffect } from 'react';
import { SocketContext } from 'src/contexts/SocketProvider';
import { useActivityFeed } from 'src/contexts/useActivityFeed';
import useNotification from 'src/hooks/useNotification';

// Listens for maintenance:emailSummary events indicating summary email dispatch.
export function useMaintenanceEmailEvents(){
  const { socket } = useContext(SocketContext);
  const { push } = useActivityFeed();
  const { toaster } = useNotification();
  useEffect(()=>{
    if(!socket) return;
    const handler = (p: { maintenanceId?:string; courtId:string; start:string; end:string; cancelled:number; paid:number; potentialRefund:number }) => {
      if(import.meta.env.DEV) console.debug('[ActivityFeed] maintenance:emailSummary event', p);
      const msg = `Maintenance email: ${p.cancelled} cancelled / ${p.paid} paid (KSh ${p.potentialRefund})`;
      push({ type:'MAINTENANCE_EMAIL', message: msg, at: new Date().toISOString(), meta: { ...p } });
      toaster(msg, { variant: p.paid ? 'info':'default'});
    };
    socket.on('maintenance:emailSummary', handler);
    return ()=>{ socket.off('maintenance:emailSummary', handler); };
  },[socket,push,toaster]);
}

export default useMaintenanceEmailEvents;
