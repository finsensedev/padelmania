import { useContext, useEffect, useRef } from "react";
import { SocketContext } from "src/contexts/SocketProvider";

// Very lightweight real-time updater hook.
// Consumers pass a mapping of event => handler; we auto subscribe to admin:analytics:* namespace events.

// Use unknown to avoid eslint any rule; consumer can refine.
type Handler = (payload: unknown) => void;

export interface AdminAnalyticsHandlers {
  onBookingCreated?: Handler;
  onBookingUpdated?: Handler;
  onPaymentUpdated?: Handler;
  // future additions
}

export function useAdminAnalyticsStream(handlers: AdminAnalyticsHandlers) {
  const { socket } = useContext(SocketContext);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!socket) return;

    const bookingCreated = (p: unknown) =>
      handlersRef.current.onBookingCreated?.(p);
    const bookingUpdated = (p: unknown) =>
      handlersRef.current.onBookingUpdated?.(p);
    const paymentUpdated = (p: unknown) =>
      handlersRef.current.onPaymentUpdated?.(p);

    socket.on("admin:analytics:booking.created", bookingCreated);
    socket.on("admin:analytics:booking.updated", bookingUpdated);
    socket.on("admin:analytics:payment.updated", paymentUpdated);

    return () => {
      socket.off("admin:analytics:booking.created", bookingCreated);
      socket.off("admin:analytics:booking.updated", bookingUpdated);
      socket.off("admin:analytics:payment.updated", paymentUpdated);
    };
  }, [socket]);
}

export default useAdminAnalyticsStream;
