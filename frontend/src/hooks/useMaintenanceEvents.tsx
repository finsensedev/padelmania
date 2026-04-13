import { useContext, useEffect } from 'react';
import { SocketContext } from 'src/contexts/SocketProvider';
import useNotification from 'src/hooks/useNotification';
import { useActivityFeed } from 'src/contexts/useActivityFeed';

/**
 * Hook to listen for maintenance websocket events and surface toasts.
 */
export function useMaintenanceEvents() {
  const { socket } = useContext(SocketContext);
  const { toaster } = useNotification();
  const { push } = useActivityFeed();

  useEffect(()=>{
    if(!socket) return;
    const handleCreated = (p: { maintenanceId?:string; courtId:string; start:string; end:string; cancelledCount:number }) => {
      if(import.meta.env.DEV) console.debug('[ActivityFeed] maintenance:created event', p);
      const start = new Date(p.start); const end = new Date(p.end);
      const idFrag = p.maintenanceId ? `#${p.maintenanceId.slice(0,8)} ` : '';
      const msg = `${idFrag}Maintenance (${start.toISOString().substring(11,16)}-${end.toISOString().substring(11,16)}) – ${p.cancelledCount} booking(s)`;
      toaster(msg, { variant: p.cancelledCount ? 'warning':'info' });
      push({ type:'MAINTENANCE_CREATED', message: msg, at: new Date().toISOString(), meta: p as unknown as Record<string,unknown> });
    };
    const handleCancellations = (p: { maintenanceId?:string; courtId:string; start:string; end:string; bookings: Array<{ bookingId:string; bookingCode:string; userEmail?:string; phone?:string; paymentRef?:string|null; previousStatus?:string; amount?:unknown }> }) => {
      if(import.meta.env.DEV) console.debug('[ActivityFeed] maintenance:cancellations event', p);
      if(!p.bookings?.length) return;
      const codes = p.bookings.slice(0,5).map(b=>b.bookingCode).join(', ');
      const more = p.bookings.length>5 ? ` +${p.bookings.length-5} more` : '';
      const msg = `${p.bookings.length} booking(s) cancelled (maintenance) ${codes}${more}`;
      toaster(msg, { variant:'warning' });
      push({ type:'MAINTENANCE_CASCADES', message: msg, at: new Date().toISOString(), meta: p as unknown as Record<string,unknown> });
    };
    socket.on('maintenance:created', handleCreated);
    socket.on('maintenance:cancellations', handleCancellations);
    return ()=>{
      socket.off('maintenance:created', handleCreated);
      socket.off('maintenance:cancellations', handleCancellations);
    };
  },[socket,toaster,push]);
}

export default useMaintenanceEvents;
