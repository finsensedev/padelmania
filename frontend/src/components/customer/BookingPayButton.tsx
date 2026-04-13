import React, { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";
import { useQueryClient } from "react-query";
import paymentService from "src/services/payment.service";
import bookingService from "src/services/booking.service";
import { usePaymentPolling } from "src/hooks/usePaymentPolling";
import useNotification from "src/hooks/useNotification";
import type { BookingRecord } from "src/services/booking.service";

interface BookingPayButtonProps {
  bookingId: string;
  amount: number;
  phoneNumber: string;
  onPaid?: (booking: BookingRecord) => void;
}

const BookingPayButton: React.FC<BookingPayButtonProps> = ({
  bookingId,
  amount,
  phoneNumber,
  onPaid,
}) => {
  const [loading, setLoading] = useState(false);
  const [initiated, setInitiated] = useState(false);
  const [paid, setPaid] = useState(false);
  const queryClient = useQueryClient();
  const { toaster } = useNotification();
  const { start, status } = usePaymentPolling({
    bookingId,
    timeoutMs: 60_000,
    onSuccess: (bk) => {
      toaster("Payment confirmed", { variant: "success" });
      setPaid(true);
      onPaid?.(bk);
    },
    onFailure: async () => {
      setPaid(false);
      try {
        const payment = await paymentService.getPaymentByBooking(bookingId);
        const reason = payment?.failureReason || payment?.metadata?.ResultDesc;
        toaster(reason || "Payment failed, cancelled, or timed out", {
          variant: "error",
        });
      } catch {
        toaster("Payment failed, cancelled, or timed out", {
          variant: "error",
        });
      }
      // Proactively cancel the booking to release the held slot, then refresh availability
      try {
        await bookingService.cancel(bookingId);
      } catch {
        // ignore errors (booking may already be cancelled by backend callback)
      } finally {
        queryClient.invalidateQueries({ queryKey: ["availability"] });
      }
    },
  });

  // Pre-check payment status in case it's already paid
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const payment = await paymentService.getPaymentByBooking(bookingId);
        if (mounted && payment?.status === "COMPLETED") {
          setPaid(true);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [bookingId]);

  const handleClick = async () => {
    if (paid) return; // no action if already paid
    try {
      setLoading(true);
      const res = await paymentService.initiateStkPush({
        phoneNumber,
        amount,
        bookingId,
      });
      setInitiated(true);
      toaster(res.CustomerMessage || "STK push sent. Check your phone.", {
        variant: "info",
      });
      start();
    } catch (e: unknown) {
      interface AxiosLikeError {
        response?: { data?: { message?: string } };
      }
      const maybe = e as AxiosLikeError;
      const msg =
        maybe?.response?.data?.message || "Failed to initiate payment";
      toaster(msg, { variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading || status === "polling" || paid}
      className={`px-4 py-2 rounded text-white text-sm disabled:opacity-80 ${
        paid
          ? "bg-emerald-600 cursor-default"
          : "bg-emerald-600 hover:bg-emerald-700"
      }`}
    >
      {paid ? (
        <span className="inline-flex items-center">
          <CheckCircle className="mr-2 h-4 w-4" /> Paid
        </span>
      ) : loading ? (
        "Processing..."
      ) : status === "polling" ? (
        "Waiting Confirmation"
      ) : initiated ? (
        "Retry Payment"
      ) : (
        (() => {
          const formatted = new Intl.NumberFormat("en-KE", {
            style: "currency",
            currency: "KES",
            currencyDisplay: "code",
            maximumFractionDigits: 0,
          })
            .format(amount)
            .replace(/^KSh\s?/, "KES ");
          return `Pay ${formatted}`;
        })()
      )}
    </button>
  );
};

export default BookingPayButton;
