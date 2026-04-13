import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import { motion } from "framer-motion";
import {
  Download,
  Calendar as CalendarIcon,
  DollarSign,
  BarChart2,
  Loader2,
  Wrench,
  EyeOff,
  Eye,
  Layers,
  X,
  Gift,
} from "lucide-react";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { Badge } from "src/components/ui/badge";
import bookingService from "src/services/booking.service";
import type {
  BookingRecord,
  BookingPriceBreakdownEquipment,
  BookingPriceBreakdownHourly,
} from "src/services/booking.service";
import { useWithTwoFAExport } from "src/utils/withTwoFAExport";
import useTwoFAPrompt from "src/hooks/useTwoFAPrompt";
import { authService } from "src/services/authService";
import useNotification from "src/hooks/useNotification";
import { differenceInMinutes, format } from "date-fns";
import useModal from "src/hooks/useModal";
import { FaInfoCircle } from "react-icons/fa";

// Helper to derive maintenance related display metadata from a booking record
function deriveMaintenanceMeta(b: BookingRecord) {
  const isMaintenanceCancellation =
    b.status === "CANCELLED" && b.cancellationReason === "MAINTENANCE";
  if (!isMaintenanceCancellation) return { isMaintenance: false as const };
  const stacked = !!b.previousStatus;
  const tooltip = stacked
    ? `Cancelled for maintenance (was ${b.previousStatus})`
    : "Cancelled for maintenance";
  const subtitle = stacked ? `Was ${b.previousStatus}` : undefined;
  return { isMaintenance: true as const, tooltip, subtitle, stacked };
}

interface RangeState {
  anchor: Date;
}
function calcDayRange(anchor: Date) {
  const a = new Date(anchor);
  a.setHours(0, 0, 0, 0);
  return { start: a, end: new Date(a.getTime() + 86400000) };
}

const HOUR_IN_MS = 60 * 60 * 1000;

const toFiniteNumber = (value: unknown): number | undefined => {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const formatCurrencyKES = (value?: number | null) => {
  const num = toFiniteNumber(value);
  return num != null ? `KSh ${num.toLocaleString()}` : "—";
};

export default function ManagerBookings() {
  const { toaster } = useNotification();
  const { pushModal } = useModal();
  const [range, setRange] = useState<RangeState>({ anchor: new Date() });
  const twoFA = useWithTwoFAExport();
  const { start } = useMemo(() => calcDayRange(range.anchor), [range]);
  const queryClient = useQueryClient();
  const summaryQuery = useQuery(
    ["mgr-bookings-summary", "DAY", start.toISOString()],
    () =>
      bookingService.managerSummary({
        period: "DAY",
        date: format(range.anchor, "yyyy-MM-dd"),
      })
  );
  const listQuery = useQuery(
    ["mgr-bookings-list", "DAY", start.toISOString()],
    () =>
      bookingService.managerList({
        period: "DAY",
        date: format(range.anchor, "yyyy-MM-dd"),
      })
  );
  const [hideMaintenance, setHideMaintenance] = useState(false);
  const label = useMemo(() => format(range.anchor, "PPP"), [range]);
  const prompt2FA = useTwoFAPrompt();

  // Helper to get 2FA session with custom prompt (using HTTP instead of WebSocket)
  const obtainGiftCardSession = async (
    bookingAmount: number
  ): Promise<string | undefined> => {
    const code = await prompt2FA({
      title: "Add Account Credit",
      description: `Add KSh ${bookingAmount.toLocaleString()} to customer's account balance. The booking will be cancelled (slot reopened for others) and the full amount will be credited to their account (no expiry, ready to use immediately).`,
      submitLabel: "Add Credit & Cancel Booking",
    });

    if (!code) return undefined;

    interface VerifyResp {
      ok: boolean;
      error?: string;
      sessionToken?: string;
      exp?: number;
      slice?: number;
    }

    try {
      const httpResp = await authService.verifyTwoFA(code);
      const resp = httpResp as unknown as VerifyResp;

      if (!resp.ok) {
        toaster("2FA verification failed", { variant: "error" });
        return undefined;
      }

      if (!resp.sessionToken) {
        toaster("Malformed 2FA session response", { variant: "error" });
        return undefined;
      }

      return resp.sessionToken;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      const errMsg = err.response?.data?.error;

      if (errMsg === "Invalid code") {
        toaster("Invalid 2FA code", { variant: "error" });
      } else if (errMsg === "Code required") {
        toaster("Code required", { variant: "error" });
      } else if (errMsg === "2FA not enabled") {
        toaster("2FA not enabled for this account", { variant: "error" });
      } else if (errMsg === "Unauthenticated") {
        toaster("Authentication required for 2FA", { variant: "error" });
      } else {
        toaster("2FA verification failed", { variant: "error" });
      }
      return undefined;
    }
  };

  const giftCardMutation = useMutation(
    async ({ id, session }: { id: string; session: string }) => {
      return bookingService.generateGiftCardForBooking(id, session);
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries({
          predicate: (q) => {
            const key = q.queryKey as unknown;
            if (!Array.isArray(key) || key.length === 0) return false;
            const root = String(key[0]);
            return root.startsWith("mgr-bookings");
          },
        });
        toaster(
          `Account credited: KSh ${data.giftCard.amount.toLocaleString()} added to customer's balance`,
          { variant: "success" }
        );
      },
      onError: (e: unknown) => {
        console.error(e);
        const errorMsg =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (e as any)?.response?.data?.message || "Failed to add account credit";
        toaster(errorMsg, { variant: "error" });
      },
    }
  );
  const handleExport = async () => {
    await twoFA(async (sessionToken) => {
      const blob = await bookingService.exportManager(
        { period: "DAY", date: format(range.anchor, "yyyy-MM-dd") },
        sessionToken
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bookings_day_${format(range.anchor, "yyyyMMdd")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toaster("Export generated", { variant: "success" });
    });
  };
  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Bookings Management
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            View and manage court bookings for {label}
          </p>
        </div>

        {/* Actions - Stack on mobile */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 md:gap-3">
          {/* Date Picker Group */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground whitespace-nowrap">
              <CalendarIcon className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Selected Date:</span>
            </div>
            <Input
              type="date"
              className="flex-1 sm:w-40 h-9 md:h-10 text-sm"
              value={format(range.anchor, "yyyy-MM-dd")}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                const parts = val.split("-");
                const d = new Date(
                  Number(parts[0]),
                  Number(parts[1]) - 1,
                  Number(parts[2])
                );
                setRange({ anchor: d });
              }}
            />
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRange({ anchor: new Date() })}
                className="hover:bg-muted whitespace-nowrap"
              >
                Today
              </Button>
            </motion.div>
          </div>

          {/* Toggle Buttons */}
          <div className="flex gap-2">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 sm:flex-none"
            >
              <Button
                variant={hideMaintenance ? "default" : "outline"}
                size="sm"
                onClick={() => setHideMaintenance((h) => !h)}
                className="flex items-center justify-center gap-1 md:gap-2 w-full"
                title={
                  hideMaintenance
                    ? "Show maintenance entries"
                    : "Hide maintenance entries"
                }
              >
                {hideMaintenance ? (
                  <Eye className="w-3 h-3 md:w-4 md:h-4" />
                ) : (
                  <EyeOff className="w-3 h-3 md:w-4 md:h-4" />
                )}
                <span className="text-xs md:text-sm">
                  {hideMaintenance ? "Show" : "Hide"} Maint.
                </span>
              </Button>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 sm:flex-none"
            >
              <Button
                size="sm"
                onClick={handleExport}
                disabled={summaryQuery.isLoading || listQuery.isLoading}
                className="flex items-center justify-center gap-1 md:gap-2 w-full"
              >
                <Download className="w-3 h-3 md:w-4 md:h-4" />
                <span className="text-xs md:text-sm">Export</span>
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.div>
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {/* Bookings Card */}
        <motion.div
          className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow p-4 md:p-6 rounded-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          whileHover={{ y: -4 }}
        >
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="p-2 bg-white/20 rounded-lg">
                <CalendarIcon className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <span className="text-xs md:text-sm font-medium text-white/90">
                {(summaryQuery.data?.totalBookings || 0) > 0
                  ? "Active"
                  : "No bookings"}
              </span>
            </div>
            <p className="text-xl md:text-2xl font-bold text-white">
              {summaryQuery.data?.totalBookings ?? 0}
            </p>
            <p className="text-xs md:text-sm text-white/80 mt-1">
              Total Bookings
            </p>
            <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-white/20">
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-white/80">Selected Date</span>
                <span className="font-medium text-white">
                  {format(range.anchor, "MMM d")}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Revenue Card */}
        <motion.div
          className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg hover:shadow-xl transition-shadow p-4 md:p-6 rounded-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          whileHover={{ y: -4 }}
        >
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="p-2 bg-white/20 rounded-lg">
                <DollarSign className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <span className="text-xs md:text-sm font-medium text-white/90">
                Confirmed
              </span>
            </div>
            <p className="text-xl md:text-2xl font-bold text-white">
              KSh {(summaryQuery.data?.revenue || 0).toLocaleString()}
            </p>
            <p className="text-xs md:text-sm text-white/80 mt-1">
              Total Revenue
            </p>
            <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-white/20">
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-white/80">Status</span>
                <span className="font-medium text-white truncate ml-2">
                  Confirmed payments
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Average Value Card */}
        <motion.div
          className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg hover:shadow-xl transition-shadow p-4 md:p-6 rounded-xl sm:col-span-2 lg:col-span-1"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          whileHover={{ y: -4 }}
        >
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="p-2 bg-white/20 rounded-lg">
                <BarChart2 className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <span className="text-xs md:text-sm font-medium text-white/90">
                Per booking
              </span>
            </div>
            <p className="text-xl md:text-2xl font-bold text-white">
              KSh{" "}
              {Math.round(
                summaryQuery.data?.averageBookingValue || 0
              ).toLocaleString()}
            </p>
            <p className="text-xs md:text-sm text-white/80 mt-1">
              Average Value
            </p>
            <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-white/20">
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-white/80">Metric</span>
                <span className="font-medium text-white truncate ml-2">
                  Revenue/Bookings
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
      {/* Bookings Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-card-foreground">
                Bookings List
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Detailed view of all bookings for {label}
              </p>
            </div>
            {!hideMaintenance && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wrench className="w-4 h-4" />
                Maintenance entries visible
              </div>
            )}
          </div>
        </div>
        <div className="p-6">
          {listQuery.isLoading ? (
            <div className="space-y-3 md:space-y-4">
              <motion.div
                className="flex items-center gap-2 mb-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="w-4 h-4 bg-muted rounded animate-pulse"></div>
                <div className="w-32 h-4 bg-muted rounded animate-pulse"></div>
              </motion.div>
              {[1, 2, 3, 4, 5].map((i) => (
                <motion.div
                  key={i}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 md:p-4 border border-border rounded-lg"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                >
                  <div className="w-20 h-4 bg-muted rounded animate-pulse"></div>
                  <div className="w-24 h-4 bg-muted rounded animate-pulse"></div>
                  <div className="w-32 h-4 bg-muted rounded animate-pulse"></div>
                  <div className="w-16 h-4 bg-muted rounded animate-pulse"></div>
                  <div className="w-32 h-4 bg-muted rounded animate-pulse"></div>
                  <div className="w-20 h-4 bg-muted rounded animate-pulse"></div>
                  <div className="w-24 h-4 bg-muted rounded animate-pulse"></div>
                  <div className="w-16 h-4 bg-muted rounded animate-pulse"></div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="font-semibold text-card-foreground min-w-[100px]">
                      Code
                    </TableHead>
                    <TableHead className="font-semibold text-card-foreground min-w-[110px]">
                      Date
                    </TableHead>
                    <TableHead className="font-semibold text-card-foreground min-w-[140px]">
                      Time
                    </TableHead>
                    <TableHead className="font-semibold text-card-foreground min-w-[100px]">
                      Court
                    </TableHead>
                    <TableHead className="font-semibold text-card-foreground min-w-[150px]">
                      Customer
                    </TableHead>
                    <TableHead className="font-semibold text-card-foreground min-w-[120px]">
                      Status
                    </TableHead>
                    <TableHead className="font-semibold text-card-foreground text-right min-w-[110px]">
                      Amount
                    </TableHead>
                    <TableHead className="font-semibold text-card-foreground text-right min-w-[100px]">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data && listQuery.data.length > 0 ? (
                    listQuery.data
                      .filter((b: BookingRecord) => {
                        const meta = deriveMaintenanceMeta(b);
                        return hideMaintenance ? !meta.isMaintenance : true;
                      })
                      .map((b: BookingRecord) => {
                        const s = new Date(b.startTime);
                        const e = new Date(b.endTime);
                        const customer = b.user
                          ? `${b.user.firstName} ${b.user.lastName}`
                          : "—";
                        const maintenanceMeta = deriveMaintenanceMeta(b);
                        const displayStatus = maintenanceMeta.isMaintenance
                          ? "Maintenance"
                          : b.status;
                        const rowIndex = listQuery.data.indexOf(b);
                        const parsedPaymentAmount =
                          b.payment?.amount != null
                            ? Number(b.payment.amount)
                            : undefined;
                        const paymentAmount =
                          typeof parsedPaymentAmount === "number" &&
                          Number.isFinite(parsedPaymentAmount)
                            ? parsedPaymentAmount
                            : undefined;
                        const parsedBookingAmount =
                          b.totalAmount != null
                            ? Number(b.totalAmount)
                            : undefined;
                        const bookingAmount =
                          typeof parsedBookingAmount === "number" &&
                          Number.isFinite(parsedBookingAmount)
                            ? parsedBookingAmount
                            : undefined;
                        const displayAmount = paymentAmount ?? bookingAmount;
                        const rawRefundAmount =
                          b.payment?.refundAmount != null
                            ? Number(b.payment.refundAmount)
                            : b.refundInfo?.amount != null
                            ? Number(b.refundInfo.amount)
                            : undefined;
                        const refundAmount =
                          typeof rawRefundAmount === "number" &&
                          Number.isFinite(rawRefundAmount)
                            ? rawRefundAmount
                            : undefined;
                        const showBookingAmountHint =
                          paymentAmount !== undefined &&
                          bookingAmount !== undefined &&
                          paymentAmount !== bookingAmount;
                        const displayAmountText =
                          displayAmount !== undefined
                            ? displayAmount.toLocaleString()
                            : null;
                        const refundAmountText =
                          refundAmount !== undefined
                            ? refundAmount.toLocaleString()
                            : null;
                        const bookingAmountText =
                          bookingAmount !== undefined
                            ? bookingAmount.toLocaleString()
                            : null;
                        return (
                          <motion.tr
                            key={b.id}
                            className="border-border hover:bg-muted/50 transition-colors border-b"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{
                              duration: 0.3,
                              delay: rowIndex * 0.03,
                            }}
                          >
                            <TableCell className="font-medium text-card-foreground">
                              {b.bookingCode}
                            </TableCell>
                            <TableCell className="text-card-foreground">
                              {format(s, "yyyy-MM-dd")}
                            </TableCell>
                            <TableCell className="text-card-foreground">
                              {format(s, "HH:mm")} - {format(e, "HH:mm")}
                            </TableCell>
                            <TableCell className="text-card-foreground">
                              {b.court?.name}
                            </TableCell>
                            <TableCell className="text-card-foreground">
                              {customer}
                            </TableCell>
                            <TableCell className="align-top">
                              {b.giftCardGenerated ? (
                                <Badge className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100">
                                  <Gift className="w-3 h-3" />
                                  GIFTED
                                </Badge>
                              ) : maintenanceMeta.isMaintenance ? (
                                <div
                                  className="flex flex-col gap-1"
                                  title={maintenanceMeta.tooltip}
                                >
                                  <div className="flex items-center gap-1">
                                    <Badge
                                      variant="secondary"
                                      className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300"
                                    >
                                      <Wrench className="w-3 h-3" />
                                      Maint.
                                    </Badge>
                                    {maintenanceMeta.stacked && (
                                      <Badge
                                        variant="outline"
                                        className="flex items-center gap-1 px-1 py-0.5 text-[10px]"
                                      >
                                        <Layers className="w-3 h-3" />
                                        {b.previousStatus}
                                      </Badge>
                                    )}
                                  </div>
                                  {maintenanceMeta.subtitle && (
                                    <span className="text-[10px] leading-tight text-muted-foreground">
                                      {maintenanceMeta.subtitle}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <Badge
                                  variant={
                                    b.status === "CONFIRMED"
                                      ? "default"
                                      : b.status === "PENDING"
                                      ? "secondary"
                                      : "destructive"
                                  }
                                  className="capitalize"
                                >
                                  {displayStatus.toLowerCase()}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-card-foreground">
                              <div className="flex flex-col items-end leading-tight">
                                {displayAmountText ? (
                                  <span className="font-medium">
                                    KSh {displayAmountText}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                )}
                                {refundAmountText ? (
                                  <span className="text-xs text-muted-foreground">
                                    Refunded KSh {refundAmountText}
                                  </span>
                                ) : null}
                                {showBookingAmountHint && bookingAmountText ? (
                                  <span className="text-xs text-muted-foreground">
                                    Booking total KSh {bookingAmountText}
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {/* Details Button */}
                                <motion.div
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                >
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      pushModal(
                                        <CourtDetailsModal booking={b} />
                                      )
                                    }
                                    className="h-8 w-8 p-0"
                                    title="View details"
                                  >
                                    <FaInfoCircle className="h-4 w-4" />
                                  </Button>
                                </motion.div>

                                {/* Gift Card Button - show for future bookings that haven't been gifted yet */}
                                {s.getTime() > Date.now() &&
                                !b.giftCardGenerated &&
                                b.status !== "COMPLETED" ? (
                                  <motion.div
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                  >
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={giftCardMutation.isLoading}
                                      onClick={async () => {
                                        if (giftCardMutation.isLoading) return;
                                        const session =
                                          await obtainGiftCardSession(
                                            Number(b.totalAmount)
                                          );
                                        if (!session) return;
                                        giftCardMutation.mutate({
                                          id: b.id,
                                          session,
                                        });
                                      }}
                                      className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                      title="Add credit to customer's account"
                                    >
                                      {giftCardMutation.isLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Gift className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </motion.div>
                                ) : null}
                              </div>
                            </TableCell>
                          </motion.tr>
                        );
                      })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <CalendarIcon className="w-8 h-8 opacity-50" />
                          <p className="text-sm">
                            No bookings found for {label}
                          </p>
                          <p className="text-xs">
                            Try selecting a different date
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CourtDetailsModalProps {
  booking: BookingRecord;
}

const CourtDetailsModal = ({ booking }: CourtDetailsModalProps) => {
  const { popModal } = useModal();

  const startDateRaw = new Date(booking.startTime);
  const startDate = Number.isNaN(startDateRaw.getTime()) ? null : startDateRaw;
  const endDateRaw = new Date(booking.endTime);
  const endDate = Number.isNaN(endDateRaw.getTime()) ? null : endDateRaw;
  const priceBreakdown = booking.priceBreakdown ?? null;

  const slotCount = (() => {
    if (booking.duration && booking.duration > 0) {
      return Math.max(1, Math.ceil(booking.duration / 60));
    }
    if (startDate && endDate) {
      const minutes = Math.max(0, differenceInMinutes(endDate, startDate));
      return Math.max(1, Math.ceil(minutes / 60));
    }
    return 1;
  })();

  const fallbackCourtSubtotal =
    toFiniteNumber(priceBreakdown?.courtSubtotal) ??
    toFiniteNumber(booking.pricing?.courtSubtotal);

  // Calculate the actual total minutes for accurate rate calculation
  const totalActualMinutes = (() => {
    if (booking.duration && booking.duration > 0) {
      return booking.duration;
    }
    if (startDate && endDate) {
      return Math.max(0, differenceInMinutes(endDate, startDate));
    }
    return slotCount * 60; // fallback
  })();

  // Calculate effective hourly rate: (total cost / total minutes) * 60
  const fallbackRate =
    totalActualMinutes > 0 && fallbackCourtSubtotal != null
      ? (fallbackCourtSubtotal / totalActualMinutes) * 60
      : toFiniteNumber(booking.pricing?.pricePerHour) ?? undefined;

  const fallbackHourlyBreakdown: BookingPriceBreakdownHourly[] = Array.from(
    { length: slotCount },
    (_, i) => {
      const slotStart = startDate
        ? new Date(startDate.getTime() + i * HOUR_IN_MS)
        : null;

      // Calculate duration for this slot
      const isLastSlot = i === slotCount - 1;
      let durationMins = 60;
      if (isLastSlot && startDate && endDate) {
        const totalMinutes = differenceInMinutes(endDate, startDate);
        const remainingMinutes = totalMinutes - i * 60;
        durationMins =
          remainingMinutes > 0 && remainingMinutes < 60 ? remainingMinutes : 60;
      }

      // Pro-rate the amount for partial hours
      const hourlyRate = fallbackRate ?? 0;
      const slotAmount = (hourlyRate / 60) * durationMins;

      return {
        hour: i,
        startTime: slotStart ? slotStart.toISOString() : undefined,
        finalRate: hourlyRate,
        baseRate: hourlyRate,
        amount: slotAmount,
        durationMinutes: durationMins,
        isPeakTime: false,
      };
    }
  );

  const rawHourlyBreakdown: BookingPriceBreakdownHourly[] =
    priceBreakdown?.hourlyBreakdown && priceBreakdown.hourlyBreakdown.length
      ? priceBreakdown.hourlyBreakdown.map((slot, index) => ({
          hour: slot.hour ?? index,
          startTime: slot.startTime,
          finalRate:
            toFiniteNumber(slot.finalRate) ??
            toFiniteNumber(slot.baseRate) ??
            0,
          baseRate: toFiniteNumber(slot.baseRate),
          amount: toFiniteNumber(slot.amount),
          durationMinutes: toFiniteNumber(slot.durationMinutes),
          isPeakTime: !!slot.isPeakTime,
        }))
      : fallbackHourlyBreakdown;

  const hourlyBreakdown: BookingPriceBreakdownHourly[] = rawHourlyBreakdown.map(
    (slot, index) => {
      const rate =
        toFiniteNumber(slot.finalRate) ?? toFiniteNumber(slot.baseRate) ?? 0;
      let duration = toFiniteNumber(slot.durationMinutes);

      // Derive slot start time using stored value or computed fallback, mirroring table logic
      const slotStart = (() => {
        if (slot.startTime) {
          const parsed = new Date(slot.startTime);
          if (!Number.isNaN(parsed.getTime())) {
            return parsed;
          }
        }
        if (!startDate) return null;
        return new Date(
          startDate.getTime() + (slot.hour ?? index) * HOUR_IN_MS
        );
      })();

      const slotEnd = (() => {
        if (slotStart == null) return null;
        if (index === rawHourlyBreakdown.length - 1) {
          if (endDate) return endDate;
          return new Date(slotStart.getTime() + HOUR_IN_MS);
        }
        const next = rawHourlyBreakdown[index + 1];
        if (next?.startTime) {
          const parsed = new Date(next.startTime);
          if (!Number.isNaN(parsed.getTime())) {
            return parsed;
          }
        }
        return new Date(slotStart.getTime() + HOUR_IN_MS);
      })();

      if ((duration == null || duration <= 0) && slotStart && slotEnd) {
        const diff = Math.max(0, differenceInMinutes(slotEnd, slotStart));
        duration = diff > 0 ? diff : 60;
      }

      if (duration == null || duration <= 0) {
        duration = 60;
      }

      const amount = (rate / 60) * duration;

      return {
        ...slot,
        durationMinutes: duration,
        amount,
      };
    }
  );

  // Calculate actual duration in hours (can be fractional for partial hours)
  const durationInHours = totalActualMinutes / 60;

  const equipmentBreakdown: BookingPriceBreakdownEquipment[] = (() => {
    if (priceBreakdown?.equipment && priceBreakdown.equipment.length > 0) {
      return priceBreakdown.equipment.map((item) => ({
        type: item.type,
        name: item.name || "Equipment",
        quantity: toFiniteNumber(item.quantity) ?? 0,
        pricePerUnit: toFiniteNumber(item.pricePerUnit),
        subtotal:
          toFiniteNumber(item.subtotal) ??
          (toFiniteNumber(item.pricePerUnit) ?? 0) *
            (toFiniteNumber(item.quantity) ?? 0),
      }));
    }
    if (booking.pricing?.equipment && booking.pricing.equipment.length > 0) {
      return booking.pricing.equipment.map((item) => {
        const qty = toFiniteNumber(item.quantity) ?? 0;
        const pricePerUnit = toFiniteNumber(item.pricePerUnit) ?? 0;
        const isHourly = item.type === "RACKET";

        // Use provided subtotal if available, otherwise calculate with actual duration
        const subtotal =
          toFiniteNumber(item.subtotal) ??
          (isHourly
            ? pricePerUnit * qty * durationInHours
            : pricePerUnit * qty);

        return {
          type: item.type,
          name: item.name || "Equipment",
          quantity: qty,
          pricePerUnit,
          subtotal,
        };
      });
    }
    if (booking.equipmentRentals && booking.equipmentRentals.length > 0) {
      return booking.equipmentRentals.map((rental) => {
        const qty = toFiniteNumber(rental.quantity) ?? 0;
        const pricePerUnit = toFiniteNumber(rental.price) ?? 0;
        const isHourly = rental.equipment?.type === "RACKET";
        const subtotal = isHourly
          ? qty * pricePerUnit * durationInHours
          : qty * pricePerUnit;
        return {
          type: rental.equipment?.type,
          name: rental.equipment?.name || "Equipment",
          quantity: qty,
          pricePerUnit,
          subtotal,
        };
      });
    }
    if (booking.rackets && booking.rackets.quantity) {
      const qty = toFiniteNumber(booking.rackets.quantity) ?? 0;
      const amount = toFiniteNumber(booking.rackets.amount) ?? 0;
      const perUnit =
        qty > 0 && durationInHours > 0 ? amount / qty / durationInHours : 0;
      return [
        {
          type: "RACKET",
          name: "Racket rental",
          quantity: qty,
          pricePerUnit: perUnit,
          subtotal: amount,
        },
      ];
    }
    return [] as BookingPriceBreakdownEquipment[];
  })();

  const courtSubtotal = (() => {
    const value = toFiniteNumber(priceBreakdown?.courtSubtotal);
    if (value != null) return value;
    return hourlyBreakdown.reduce(
      (sum, slot) =>
        sum +
        (toFiniteNumber(slot.amount) ?? toFiniteNumber(slot.finalRate) ?? 0),
      0
    );
  })();

  const equipmentSubtotal = (() => {
    // First try to calculate from actual equipment breakdown (most accurate)
    const calculatedFromBreakdown = equipmentBreakdown.reduce(
      (sum, item) =>
        sum +
        (toFiniteNumber(item.subtotal) ??
          (toFiniteNumber(item.pricePerUnit) ?? 0) *
            (toFiniteNumber(item.quantity) ?? 0)),
      0
    );

    // If we have equipment items, use the calculated value
    if (equipmentBreakdown.length > 0) {
      return calculatedFromBreakdown;
    }

    // Otherwise fall back to pricing object or priceBreakdown
    const pricingValue = toFiniteNumber(booking.pricing?.equipmentSubtotal);
    if (pricingValue != null) return pricingValue;

    const breakdownValue = toFiniteNumber(priceBreakdown?.equipmentSubtotal);
    if (breakdownValue != null) return breakdownValue;

    return 0;
  })();

  // Calculate gross total before discounts
  const grossTotal = courtSubtotal + equipmentSubtotal;

  const voucherDiscount = toFiniteNumber(booking.pricing?.voucherDiscount);
  const giftCardApplied = toFiniteNumber(booking.pricing?.giftCardApplied);
  const discountTotal = (voucherDiscount ?? 0) + (giftCardApplied ?? 0);

  // Net total is gross minus all discounts
  // Note: payment.amount represents the ORIGINAL booking amount (gross), not what customer paid
  const netTotal = Math.max(0, grossTotal - discountTotal);

  const paymentAmount = toFiniteNumber(booking.payment?.amount);
  const refundAmount =
    toFiniteNumber(booking.payment?.refundAmount) ??
    toFiniteNumber(booking.refundInfo?.amount);

  const customerName = booking.user
    ? `${booking.user.firstName} ${booking.user.lastName}`.trim()
    : "Guest booking";
  const timeRange =
    startDate && endDate
      ? `${format(startDate, "HH:mm")} - ${format(endDate, "HH:mm")}`
      : "—";
  const dateLabel = startDate ? format(startDate, "PPP") : "—";
  const maintenanceMeta = deriveMaintenanceMeta(booking);

  const statusBadge = booking.giftCardGenerated ? (
    <Badge className="flex items-center gap-1 bg-emerald-100 text-emerald-900 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-100">
      <Gift className="w-3 h-3" /> GIFTED
    </Badge>
  ) : maintenanceMeta.isMaintenance ? (
    <div className="flex items-center gap-2" title={maintenanceMeta.tooltip}>
      <Badge className="flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-200">
        <Wrench className="w-3 h-3" /> Maint.
      </Badge>
      {maintenanceMeta.stacked && (
        <Badge
          variant="outline"
          className="text-[10px] uppercase tracking-wide"
        >
          {booking.previousStatus}
        </Badge>
      )}
    </div>
  ) : (
    <Badge
      variant={
        booking.status === "CONFIRMED"
          ? "default"
          : booking.status === "PENDING"
          ? "secondary"
          : "outline"
      }
      className="capitalize"
    >
      {booking.status.toLowerCase()}
    </Badge>
  );

  return (
    <motion.div
      onClick={(event) => event.stopPropagation()}
      className="bg-card m-0 sm:m-3 w-full max-w-3xl rounded-none sm:rounded-xl border-0 sm:border border-border shadow-lg max-h-[100vh] sm:max-h-[90vh] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`booking-${booking.id}-title`}
    >
      <div className="flex items-start justify-between gap-3 sm:gap-4 border-b border-border px-4 sm:px-6 py-4 sm:py-5 sticky top-0 bg-card z-10">
        <div className="space-y-1 flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Booking
          </p>
          <h2
            id={`booking-${booking.id}-title`}
            className="text-lg sm:text-xl font-semibold text-card-foreground"
          >
            {booking.bookingCode}
          </h2>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
            <span>{dateLabel}</span>
            <span className="hidden sm:inline">·</span>
            <span>{timeRange}</span>
            <span className="hidden sm:inline">·</span>
            <span className="truncate">{booking.court?.name ?? "—"}</span>
          </div>
        </div>
        <div className="flex items-start gap-2 sm:gap-3 flex-shrink-0">
          {statusBadge}
          <button
            type="button"
            onClick={() => popModal()}
            className="rounded-md border border-transparent p-1.5 sm:p-2 text-muted-foreground transition-colors hover:border-border hover:bg-muted"
            aria-label="Close booking details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-4 sm:pt-5 space-y-4 sm:space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-card-foreground">
            Booking Overview
          </h3>
          <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Customer
              </p>
              <p className="text-sm font-medium text-card-foreground">
                {customerName || "—"}
              </p>
              {booking.user?.email && (
                <p className="text-xs text-muted-foreground">
                  {booking.user.email}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Payment
              </p>
              <p className="text-sm font-medium text-card-foreground">
                {paymentAmount != null
                  ? formatCurrencyKES(paymentAmount)
                  : "Pending"}
              </p>
              {booking.payment?.status && (
                <p className="text-xs text-muted-foreground">
                  Status: {booking.payment.status.toLowerCase()}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-card-foreground">
              Hourly Court Breakdown
            </h3>
            <span className="text-xs text-muted-foreground">
              {(() => {
                // Calculate actual duration
                if (booking.duration && booking.duration > 0) {
                  const mins = booking.duration;
                  const hours = Math.floor(mins / 60);
                  const remainingMins = mins % 60;
                  if (hours === 0) return `${mins} min`;
                  if (remainingMins === 0)
                    return `${hours} hour${hours === 1 ? "" : "s"}`;
                  return `${hours}h ${remainingMins}m`;
                }
                if (startDate && endDate) {
                  const mins = Math.max(
                    0,
                    differenceInMinutes(endDate, startDate)
                  );
                  const hours = Math.floor(mins / 60);
                  const remainingMins = mins % 60;
                  if (hours === 0) return `${mins} min`;
                  if (remainingMins === 0)
                    return `${hours} hour${hours === 1 ? "" : "s"}`;
                  return `${hours}h ${remainingMins}m`;
                }
                return `${slotCount} hour${slotCount === 1 ? "" : "s"}`;
              })()}
            </span>
          </div>
          {hourlyBreakdown.length ? (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <div className="overflow-hidden rounded-none sm:rounded-lg border-y sm:border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-1/3 text-xs font-semibold uppercase text-muted-foreground">
                          Time
                        </TableHead>
                        <TableHead className="w-1/3 text-xs font-semibold uppercase text-muted-foreground">
                          Rate
                        </TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase text-muted-foreground">
                          Total
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hourlyBreakdown.map((slot, index) => {
                        const parsedStart = slot.startTime
                          ? new Date(slot.startTime)
                          : null;
                        const slotStart =
                          parsedStart && !Number.isNaN(parsedStart.getTime())
                            ? parsedStart
                            : startDate
                            ? new Date(
                                startDate.getTime() +
                                  (slot.hour ?? index) * HOUR_IN_MS
                              )
                            : null;
                        const slotEnd = (() => {
                          if (index === hourlyBreakdown.length - 1) {
                            return (
                              endDate ??
                              (slotStart
                                ? new Date(slotStart.getTime() + HOUR_IN_MS)
                                : null)
                            );
                          }
                          const next = hourlyBreakdown[index + 1];
                          if (next?.startTime) {
                            const parsed = new Date(next.startTime);
                            if (!Number.isNaN(parsed.getTime())) {
                              return parsed;
                            }
                          }
                          return slotStart
                            ? new Date(slotStart.getTime() + HOUR_IN_MS)
                            : null;
                        })();
                        const rate = toFiniteNumber(slot.finalRate) ?? 0;

                        // Get duration in minutes for this slot
                        const durationMins = slot.durationMinutes ?? 60;

                        // Use the amount field if available (pro-rated), otherwise calculate it
                        const slotAmount =
                          toFiniteNumber(slot.amount) ??
                          (rate / 60) * durationMins;

                        const key =
                          slot.startTime || `${slot.hour ?? index}-${index}`;
                        return (
                          <TableRow key={key} className="hover:bg-muted/40">
                            <TableCell className="text-sm font-medium text-card-foreground">
                              {slotStart && slotEnd
                                ? `${format(slotStart, "HH:mm")} - ${format(
                                    slotEnd,
                                    "HH:mm"
                                  )}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatCurrencyKES(rate)}
                              {durationMins < 60 && (
                                <span className="text-xs ml-1">
                                  ({durationMins}m)
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium text-card-foreground">
                              {formatCurrencyKES(slotAmount)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No hourly breakdown available.
            </p>
          )}
        </section>

        <section className="space-y-2 sm:space-y-3">
          <h3 className="text-sm font-semibold text-card-foreground">
            Equipment &amp; Add-ons
          </h3>
          {equipmentBreakdown.length ? (
            <div className="space-y-2">
              {equipmentBreakdown.map((item, index) => {
                const unitLabel =
                  item.type === "RACKET" ? "per racket / hour" : "per unit";
                const quantityLabel =
                  item.type === "RACKET"
                    ? `${item.quantity} racket${item.quantity === 1 ? "" : "s"}`
                    : `${item.quantity} unit${item.quantity === 1 ? "" : "s"}`;

                // For rackets, show actual duration in minutes
                const durationLabel =
                  item.type === "RACKET"
                    ? `${quantityLabel} (${totalActualMinutes} min)`
                    : quantityLabel;

                return (
                  <div
                    key={`${item.name}-${index}`}
                    className="rounded-lg border border-border p-2.5 sm:p-3"
                  >
                    <div className="flex items-center justify-between gap-2 sm:gap-3">
                      <span className="text-sm font-medium text-card-foreground">
                        {item.name}
                      </span>
                      <span className="text-sm font-semibold text-card-foreground whitespace-nowrap">
                        {formatCurrencyKES(item.subtotal)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-muted-foreground">
                      {item.pricePerUnit != null && (
                        <span>
                          {formatCurrencyKES(item.pricePerUnit)} {unitLabel}
                        </span>
                      )}
                      <span>{durationLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No equipment rentals recorded for this booking.
            </p>
          )}
        </section>

        <section className="space-y-2 sm:space-y-3">
          <h3 className="text-sm font-semibold text-card-foreground">
            Pricing Summary
          </h3>
          <div className="space-y-2 rounded-lg border border-border p-3 sm:p-4 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>
                Court (
                {(() => {
                  // Calculate actual duration for display
                  if (booking.duration && booking.duration > 0) {
                    const mins = booking.duration;
                    const hours = Math.floor(mins / 60);
                    const remainingMins = mins % 60;
                    if (hours === 0) return `${mins} min`;
                    if (remainingMins === 0)
                      return `${hours} hour${hours === 1 ? "" : "s"}`;
                    return `${hours}h ${remainingMins}m`;
                  }
                  if (startDate && endDate) {
                    const mins = Math.max(
                      0,
                      differenceInMinutes(endDate, startDate)
                    );
                    const hours = Math.floor(mins / 60);
                    const remainingMins = mins % 60;
                    if (hours === 0) return `${mins} min`;
                    if (remainingMins === 0)
                      return `${hours} hour${hours === 1 ? "" : "s"}`;
                    return `${hours}h ${remainingMins}m`;
                  }
                  return `${slotCount} hour${slotCount === 1 ? "" : "s"}`;
                })()}
                )
              </span>
              <span className="font-medium text-card-foreground">
                {formatCurrencyKES(courtSubtotal)}
              </span>
            </div>
            {equipmentBreakdown.length > 0 && (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Equipment</span>
                <span className="font-medium text-card-foreground">
                  {formatCurrencyKES(equipmentSubtotal)}
                </span>
              </div>
            )}
            <div className="border-t border-border" />
            <div className="flex items-center justify-between font-medium text-card-foreground">
              <span>Subtotal</span>
              <span>{formatCurrencyKES(grossTotal)}</span>
            </div>
            {voucherDiscount != null && voucherDiscount > 0 ? (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Voucher applied</span>
                <span>-{formatCurrencyKES(voucherDiscount)}</span>
              </div>
            ) : null}
            {giftCardApplied != null && giftCardApplied > 0 ? (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Gift card applied</span>
                <span>-{formatCurrencyKES(giftCardApplied)}</span>
              </div>
            ) : null}
            <div className="border-t border-border" />
            <div className="flex items-center justify-between text-base font-semibold text-card-foreground">
              <span>Total</span>
              <span>{formatCurrencyKES(netTotal)}</span>
            </div>
            {refundAmount ? (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Refunded</span>
                <span>-{formatCurrencyKES(refundAmount)}</span>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </motion.div>
  );
};
