import { useContext, useEffect } from 'react';
import { SocketContext } from 'src/contexts/SocketProvider';
import useNotification from 'src/hooks/useNotification';
import { useActivityFeed } from 'src/contexts/useActivityFeed';

interface BookingCancelledEvent {
  bookingId: string;
  bookingCode?: string;
  courtId: string;
  actorId: string;
  actorRole: string;
  actorEmail?: string;
  reason?: string;
  at: string; // ISO
  amount?: number;
}

export default function useBookingCancellationEvents() {
  const { socket } = useContext(SocketContext);
  const { toaster } = useNotification();
  const { push } = useActivityFeed();

  useEffect(()=>{
    if(!socket) return;
    const handler = (evt: BookingCancelledEvent) => {
      const when = new Date(evt.at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      const base = `Booking ${evt.bookingCode || evt.bookingId} cancelled`;
      const detail = evt.reason ? `Reason: ${evt.reason}` : undefined;
      const msg = `${base} • ${when}${detail?` • ${detail}`:''}`;
      toaster(msg, { variant:'warning' });
      push({ type:'BOOKING_CANCELLED', message: msg, at: evt.at, meta: evt as unknown as Record<string, unknown> });
    };
    socket.on('booking:cancelled', handler);
    return ()=>{ socket.off('booking:cancelled', handler); };
  },[socket,toaster,push]);
}