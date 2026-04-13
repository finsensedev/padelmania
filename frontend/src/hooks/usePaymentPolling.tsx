import { useCallback, useEffect, useRef, useState } from "react";
import paymentService from "src/services/payment.service";
import type { BookingRecord } from "src/services/booking.service";

export interface PaymentPollingOptions {
  bookingId: string;
  intervalMs?: number;
  maxAttempts?: number;
  timeoutMs?: number; // hard cap on total polling duration
  onSuccess?: (booking: BookingRecord) => void;
  onFailure?: (booking: BookingRecord) => void;
  stopStatuses?: string[]; // Additional statuses that should stop polling
}

export function usePaymentPolling(options: PaymentPollingOptions) {
  const {
    bookingId,
    intervalMs = 4000,
    maxAttempts = 30,
    timeoutMs,
    onSuccess,
    onFailure,
    stopStatuses = [],
  } = options;
  const [attempts, setAttempts] = useState(0);
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [status, setStatus] = useState<"idle" | "polling" | "stopped">("idle");
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const poll = useCallback(async () => {
    try {
      // Enforce timeout before making the network call
      if (
        timeoutMs &&
        startedAtRef.current &&
        Date.now() - startedAtRef.current >= timeoutMs
      ) {
        clearTimer();
        setStatus("stopped");
        // call failure without arg; consumer can handle as timeout
        onFailure?.(booking as BookingRecord);
        return;
      }

      const data = await paymentService.getBookingStatus(bookingId);
      setBooking(data);
      const bookingStatus = data.status;
      // Optionally read payment status if backend includes it in response shape
      const paymentStatus: string | undefined =
        typeof (data as unknown) === "object" && data && "payment" in data
          ? ((data as unknown as { payment?: { status?: string } }).payment
              ?.status as string | undefined)
          : undefined;

      // Success conditions: booking confirmed/completed OR payment completed
      if (
        bookingStatus === "CONFIRMED" ||
        bookingStatus === "COMPLETED" ||
        paymentStatus === "COMPLETED"
      ) {
        clearTimer();
        setStatus("stopped");
        onSuccess?.(data);
        return;
      }
      // Failure/cancellation conditions: booking cancelled OR payment failed OR external stop statuses
      if (
        bookingStatus === "CANCELLED" ||
        paymentStatus === "FAILED" ||
        stopStatuses.includes(bookingStatus)
      ) {
        clearTimer();
        setStatus("stopped");
        onFailure?.(data);
        return;
      }
      if (attempts + 1 >= maxAttempts) {
        clearTimer();
        setStatus("stopped");
        return;
      }
      setAttempts((a) => a + 1);
      timerRef.current = window.setTimeout(poll, intervalMs);
    } catch {
      clearTimer();
      setStatus("stopped");
    }
  }, [
    bookingId,
    booking,
    attempts,
    intervalMs,
    maxAttempts,
    timeoutMs,
    onFailure,
    onSuccess,
    stopStatuses,
  ]);

  const start = useCallback(() => {
    if (status === "polling") return;
    setAttempts(0);
    setStatus("polling");
    startedAtRef.current = Date.now();
    poll();
  }, [poll, status]);

  const stop = useCallback(() => {
    clearTimer();
    setStatus("stopped");
  }, []);

  useEffect(() => {
    return () => clearTimer();
  }, []);

  return { start, stop, status, attempts, booking };
}

export default usePaymentPolling;
