/**
 * ManagerTransactions (Mirrors FinanceOfficerTransactions UI & functionality)
 * Requirements:
 * - Single date filter (no period/week/month)
 * - Status filter: All | Failed | Refunded (Completed shown when All selected)
 * - Stats cards: Total Volume, Completed, Failed, Refunds (amount)
 * - Table columns: Reference, Customer, Amount, Method, Type, Status, Date
 * - Export (2FA protected) limited to selected date
 * - No refund actions/modals for manager in this mirrored view
 */
import { useState, useMemo, useEffect, useContext } from "react";
import { useQuery } from "react-query";
import {
  DollarSign,
  TrendingUp,
  RefreshCw,
  CreditCard,
  Download,
  RotateCcw,
  Clock,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Badge } from "src/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import useNotification from "src/hooks/useNotification";
import paymentService from "src/services/payment.service";
import { financeOfficerService } from "src/services/financeOfficer.service";
import { downloadBlob, defaultCsvName } from "src/utils/download";
import { useWithTwoFAExport } from "src/utils/withTwoFAExport";
import useTwoFASession from "src/hooks/useTwoFASession";
import { computeSlotRefundState, formatRemaining } from "src/utils/refundSlot";
import { SocketContext } from "src/contexts/SocketProvider";
import { motion } from "framer-motion";

interface ManagerTxnFilters {
  status?: string;
  search?: string;
}
interface Row {
  id: string;
  reference: string;
  user: { name?: string; email?: string } | null;
  amount: number;
  method: string; // retained in data but removed from table UI
  provider?: string; // needed to filter M-Pesa transactions for revenue
  status: string;
  type: string;
  description?: string;
  createdAt: string;
  refundedAt?: string;
  providerRef?: string;
  bookingCode?: string;
  slotStart?: string;
  slotEnd?: string;
}

export default function ManagerTransactions() {
  const { toaster } = useNotification();
  const today = new Date().toISOString().slice(0, 10);
  const [specificDate, setSpecificDate] = useState<string>(today);
  const [filters, setFilters] = useState<ManagerTxnFilters>({
    status: "ALL",
    search: "",
  });
  const [searchInput, setSearchInput] = useState("");
  // Debounce search input -> filters.search
  useEffect(() => {
    const t = setTimeout(
      () => setFilters((f) => ({ ...f, search: searchInput.trim() })),
      400
    );
    return () => clearTimeout(t);
  }, [searchInput]);
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const { socket } = useContext(SocketContext);
  const with2FA = useWithTwoFAExport();
  const { obtainSession } = useTwoFASession();
  const [refundingIds, setRefundingIds] = useState<Record<string, boolean>>({});
  const handleRefund = async (paymentId: string) => {
    if (refundingIds[paymentId]) return;
    setRefundingIds((r) => ({ ...r, [paymentId]: true }));
    try {
      const sessionToken = await obtainSession("refunds");
      if (!sessionToken) {
        setRefundingIds((r) => {
          const clone: Record<string, boolean> = { ...r };
          delete clone[paymentId];
          return clone;
        });
        return;
      }
      const resp = await paymentService.refundPayment(paymentId, {
        sessionToken,
      });
      toaster(resp?.message || "Refund initiated", { variant: "success" });
      refetch();
    } catch (rawErr: unknown) {
      const err = rawErr as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      toaster(err?.response?.data?.message || err?.message || "Refund failed", {
        variant: "error",
      });
    } finally {
      setRefundingIds((r) => {
        const clone: Record<string, boolean> = { ...r };
        delete clone[paymentId];
        return clone;
      });
    }
  };

  const queryParams = useMemo(() => {
    const dt = new Date(specificDate || today);
    const s = new Date(dt);
    s.setHours(0, 0, 0, 0);
    const e = new Date(dt);
    e.setHours(23, 59, 59, 999);
    return {
      page,
      limit: pageSize,
      status:
        filters.status && filters.status !== "ALL" ? filters.status : undefined,
      search: filters.search || undefined,
      from: s.toISOString(),
      to: e.toISOString(),
    } as const;
  }, [specificDate, today, page, pageSize, filters.status, filters.search]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      "manager-transactions",
      queryParams.page,
      queryParams.limit,
      queryParams.status,
      queryParams.search,
      queryParams.from,
      queryParams.to,
    ],
    queryFn: async () => {
      interface RawPayment {
        id: string;
        transactionId?: string;
        providerRef?: string;
        amount?: number | string;
        status: string;
        method: string;
        provider?: string;
        createdAt: string;
        user?: { name?: string; email?: string } | null;
        booking?: {
          code?: string;
          startTime?: string;
          endTime?: string;
          court?: { name?: string };
        };
        refundedAt?: string | null;
      }
      interface Resp {
        data: RawPayment[];
        meta?: {
          total?: number;
          page?: number;
          limit?: number;
          totalPages?: number;
        };
      }
      // Removed mergeBookingDate to prevent duplicate appearance on booking day and payment day
      const resp: Resp = await paymentService.listTransactions({
        page: queryParams.page,
        limit: queryParams.limit,
        status: queryParams.status,
        search: queryParams.search,
        from: queryParams.from,
        to: queryParams.to,
      });
      const rows: Row[] = (resp.data || []).map((p) => ({
        id: p.id,
        reference: p.transactionId || p.providerRef || p.id,
        user: p.user || null,
        amount: Number(p.amount || 0),
        method: p.method,
        provider: p.provider,
        status: p.status,
        type: p.booking ? "BOOKING" : "PAYMENT",
        description: p.booking
          ? `Booking ${p.booking.code || ""}`.trim()
          : "Payment",
        createdAt: p.createdAt,
        refundedAt: p.refundedAt || undefined,
        providerRef: p.providerRef,
        bookingCode: p.booking?.code,
        slotStart: p.booking?.startTime,
        slotEnd: p.booking?.endTime,
      }));
      // Client-side fallback filter if backend search is partial
      const filtered = filters.search
        ? rows.filter((r) => {
            const q = filters.search!.toLowerCase();
            return (
              r.id.toLowerCase().includes(q) ||
              r.reference.toLowerCase().includes(q) ||
              (r.providerRef || "").toLowerCase().includes(q) ||
              (r.bookingCode || "").toLowerCase().includes(q) ||
              (r.user?.name || "").toLowerCase().includes(q) ||
              (r.user?.email || "").toLowerCase().includes(q)
            );
          })
        : rows;
      // CRITICAL FIX: Only count M-Pesa transactions as revenue
      // Excludes vouchers/gift cards which are not actual monetary revenue
      const stats = rows.reduce(
        (acc, r) => {
          const amt = Number(r.amount) || 0;
          if (r.status === "COMPLETED") {
            // Only count M-Pesa payments as revenue
            if (r.method === "MPESA" && r.provider === "MPESA") {
              acc.revenueCollected += amt;
            }
            acc.successfulTransactions += 1;
          }
          if (r.status === "FAILED") acc.failedTransactions += 1;
          if (r.status === "REFUNDED" || r.status === "PARTIALLY_REFUNDED") {
            // Only count M-Pesa refunds
            if (r.method === "MPESA" && r.provider === "MPESA") {
              acc.totalRefunds += amt;
            }
          }
          return acc;
        },
        {
          revenueCollected: 0,
          successfulTransactions: 0,
          failedTransactions: 0,
          totalRefunds: 0,
        }
      );
      return {
        rows: filtered,
        total: resp.meta?.total || filtered.length,
        totalPages: resp.meta?.totalPages || 1,
        stats,
      };
    },
    keepPreviousData: true,
  });

  useEffect(() => {
    if (!socket) return;
    const handler = () => refetch();
    socket.on("payments:update", handler);
    return () => {
      socket.off("payments:update", handler);
    };
  }, [socket, refetch]);
  useEffect(() => {
    setPage(1);
  }, [filters, specificDate]);

  const handleExport = async () => {
    await with2FA(
      async (sessionToken) => {
        try {
          const dt = new Date(specificDate || today);
          const s = new Date(dt);
          s.setHours(0, 0, 0, 0);
          const e = new Date(dt);
          e.setHours(23, 59, 59, 999);
          const blob = await financeOfficerService.exportTransactions({
            status: filters.status !== "ALL" ? filters.status : undefined,
            startDate: s.toISOString(),
            endDate: e.toISOString(),
            sessionToken,
          });
          downloadBlob(blob, defaultCsvName("manager-transactions"));
          toaster("Transactions exported", { variant: "success" });
        } catch {
          toaster("Failed to export transactions", { variant: "error" });
        }
      },
      {
        cacheKey: `mgr-transactions-${specificDate || "none"}-${
          filters.status
        }`,
        useResultCache: true,
      }
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-100 text-green-800";
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "FAILED":
        return "bg-red-100 text-red-800";
      case "REFUNDED":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  const getTypeColor = (type: string) => {
    switch (type) {
      case "BOOKING":
        return "bg-blue-100 text-blue-800";
      case "ORDER":
        return "bg-orange-100 text-orange-800";
      case "MEMBERSHIP":
        return "bg-purple-100 text-purple-800";
      case "REFUND":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-3 md:p-6">
      <motion.div
        className="flex flex-col gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Transactions
            </h1>
            <p className="text-muted-foreground text-xs md:text-sm">
              Monitor all financial transactions and payments
            </p>
          </div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button onClick={handleExport} className="w-full lg:w-auto">
              <Download className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Export</span>
              <span className="sm:hidden">Export</span>
            </Button>
          </motion.div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
          <Select
            value={filters.status || "ALL"}
            onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          >
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="REFUNDED">Refunded</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Search transactions..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            className="flex-1 text-sm"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">
              Date:
            </label>
            <Input
              type="date"
              value={specificDate}
              onChange={(e) => setSpecificDate(e.target.value)}
              className="w-auto text-sm"
            />
          </div>
        </div>
      </motion.div>
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          whileHover={{ y: -4 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="pb-2 sm:pb-3 relative z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-sm font-medium text-white/80">
                  Revenue
                </CardTitle>
                <DollarSign className="h-4 w-4 text-white/80 flex-shrink-0" />
              </div>
            </CardHeader>
            <CardContent className="pt-0 relative z-10">
              <p className="text-xl sm:text-2xl font-bold">
                KSh {data?.stats?.revenueCollected?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-white/80 mt-1">M-Pesa only</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          whileHover={{ y: -4 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="pb-2 sm:pb-3 relative z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-sm font-medium text-white/80">
                  Completed
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-white/80 flex-shrink-0" />
              </div>
            </CardHeader>
            <CardContent className="pt-0 relative z-10">
              <p className="text-xl sm:text-2xl font-bold">
                {data?.stats?.successfulTransactions || 0}
              </p>
              <p className="text-xs text-white/80 mt-1">Transactions</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          whileHover={{ y: -4 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="pb-2 sm:pb-3 relative z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-sm font-medium text-white/80">
                  Failed
                </CardTitle>
                <CreditCard className="h-4 w-4 text-white/80 flex-shrink-0" />
              </div>
            </CardHeader>
            <CardContent className="pt-0 relative z-10">
              <p className="text-xl sm:text-2xl font-bold">
                {data?.stats?.failedTransactions || 0}
              </p>
              <p className="text-xs text-white/80 mt-1">Transactions</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          whileHover={{ y: -4 }}
          className="col-span-2 lg:col-span-1"
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="pb-2 sm:pb-3 relative z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-sm font-medium text-white/80">
                  Refunds
                </CardTitle>
                <RefreshCw className="h-4 w-4 text-white/80 flex-shrink-0" />
              </div>
            </CardHeader>
            <CardContent className="pt-0 relative z-10">
              <p className="text-xl sm:text-2xl font-bold">
                KSh {data?.stats?.totalRefunds?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-white/80 mt-1">Total refunded</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        <Card className="border-border shadow-sm">
          <CardHeader className="border-b border-border bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg md:text-xl">
                  Recent Transactions
                </CardTitle>
                <CardDescription className="text-xs md:text-sm mt-1">
                  All financial transactions and payment details
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <motion.div
                className="flex justify-center py-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </motion.div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-b border-border bg-muted/20">
                        <TableHead className="min-w-[150px] font-semibold">
                          Reference
                        </TableHead>
                        <TableHead className="min-w-[150px] font-semibold">
                          Customer
                        </TableHead>
                        <TableHead className="min-w-[100px] font-semibold">
                          Amount
                        </TableHead>
                        <TableHead className="min-w-[100px] font-semibold">
                          Type
                        </TableHead>
                        <TableHead className="min-w-[120px] font-semibold">
                          Slot
                        </TableHead>
                        <TableHead className="min-w-[100px] font-semibold">
                          Status
                        </TableHead>
                        <TableHead className="min-w-[150px] font-semibold">
                          Date
                        </TableHead>
                        <TableHead className="min-w-[120px] font-semibold">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.rows?.map((r, index) => (
                        <motion.tr
                          key={r.id}
                          className="border-b border-border hover:bg-muted/50 transition-all duration-200 cursor-pointer"
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.03 }}
                          whileHover={{ backgroundColor: "rgba(0,0,0,0.02)" }}
                        >
                          <TableCell className="py-4">
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">
                                {r.reference}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {r.description}
                              </p>
                              {r.providerRef && (
                                <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                                  Code: {r.providerRef}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">
                                {r.user?.name || "-"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {r.user?.email || ""}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <p
                              className={`font-semibold text-base ${
                                r.amount < 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-green-600 dark:text-green-400"
                              }`}
                            >
                              {r.amount < 0 ? "-" : ""}KSh{" "}
                              {Math.abs(r.amount).toLocaleString()}
                            </p>
                          </TableCell>
                          <TableCell className="py-4">
                            <Badge
                              className={`${getTypeColor(r.type)} font-medium`}
                            >
                              {r.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-4">
                            {r.type === "BOOKING" &&
                            r.slotStart &&
                            r.slotEnd ? (
                              <SlotCell
                                slotStart={r.slotStart}
                                slotEnd={r.slotEnd}
                                createdAt={r.createdAt}
                              />
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell className="py-4">
                            <Badge
                              className={`${getStatusColor(
                                r.status
                              )} font-medium`}
                            >
                              {r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm py-4">
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">
                                {formatDateTime(r.createdAt)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            {r.status === "COMPLETED" &&
                              (() => {
                                // Use the scheduled slot end (booking endTime), not payment createdAt
                                const state = computeSlotRefundState(r.slotEnd);
                                const disabled =
                                  !!refundingIds[r.id] || state.ended;
                                return (
                                  <motion.div
                                    whileHover={{ scale: disabled ? 1 : 1.05 }}
                                    whileTap={{ scale: disabled ? 1 : 0.95 }}
                                  >
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        !disabled && handleRefund(r.id)
                                      }
                                      disabled={disabled}
                                      className={`border-primary hover:bg-primary/10 text-primary text-xs font-medium transition-all ${
                                        state.ended
                                          ? "opacity-50 cursor-not-allowed"
                                          : state.soon
                                          ? "ring-2 ring-amber-400 shadow-sm"
                                          : ""
                                      }`}
                                      title={
                                        state.ended
                                          ? `Slot ended${
                                              state.graceMinutes
                                                ? ` (grace ${state.graceMinutes}m passed)`
                                                : ""
                                            } - refund disabled`
                                          : state.soon
                                          ? `Refund window closing in ${formatRemaining(
                                              state.remainingMs
                                            )}`
                                          : "Initiate refund"
                                      }
                                    >
                                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                      <span className="hidden sm:inline">
                                        {refundingIds[r.id]
                                          ? "Processing..."
                                          : "Refund"}
                                      </span>
                                    </Button>
                                  </motion.div>
                                );
                              })()}
                            {r.status === "PROCESSING" && (
                              <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                                Refunding...
                              </span>
                            )}
                            {r.status === "REFUNDED" && (
                              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                Refunded
                              </span>
                            )}
                          </TableCell>
                        </motion.tr>
                      ))}
                      {data?.rows?.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-12">
                            <div className="flex flex-col items-center gap-3">
                              <CreditCard className="h-12 w-12 text-muted-foreground/50" />
                              <p className="text-muted-foreground text-sm">
                                No transactions found for the selected filters
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <motion.div
                  className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-border bg-muted/20"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                >
                  <p className="text-xs md:text-sm text-muted-foreground font-medium">
                    Showing {(page - 1) * pageSize + 1} to{" "}
                    {Math.min(page * pageSize, data?.total || 0)} of{" "}
                    {data?.total || 0} transactions
                  </p>
                  <div className="flex items-center gap-2">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="font-medium"
                      >
                        <span className="hidden sm:inline">Previous</span>
                        <span className="sm:hidden">Prev</span>
                      </Button>
                    </motion.div>
                    <span className="text-xs md:text-sm whitespace-nowrap font-medium px-2">
                      Page {page} of {data?.totalPages || 1}
                    </span>
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={page >= (data?.totalPages || 1)}
                        className="font-medium"
                      >
                        Next
                      </Button>
                    </motion.div>
                  </div>
                </motion.div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// Local component for slot display with countdown / expired / soon states
function SlotCell({
  slotStart,
  slotEnd,
  createdAt,
}: {
  slotStart: string;
  slotEnd: string;
  createdAt?: string;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000); // update every 15s
    return () => clearInterval(id);
  }, []);
  const state = computeSlotRefundState(slotEnd, { now });
  const timeRange = `${new Date(slotStart).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })} - ${new Date(slotEnd).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
  const createdDay = createdAt
    ? new Date(createdAt).toISOString().slice(0, 10)
    : undefined;
  const bookingDay = new Date(slotStart).toISOString().slice(0, 10);
  const showFutureIndicator =
    createdDay &&
    bookingDay &&
    bookingDay !== createdDay &&
    now < new Date(slotEnd).getTime();
  return (
    <div className="flex flex-col gap-0.5">
      <span>{timeRange}</span>
      {showFutureIndicator && (
        <span
          className="flex items-center gap-1 text-[10px] text-sky-600/80 dark:text-sky-400/80"
          title={`Plays on ${bookingDay}`}
        >
          <Clock className="w-3 h-3" /> Plays: {bookingDay}
        </span>
      )}
      {state.ended ? (
        <span className="text-[10px] text-red-600 font-semibold">Expired</span>
      ) : state.soon ? (
        <span className="text-[10px] text-amber-600">
          Ends in {formatRemaining(state.remainingMs)}
        </span>
      ) : null}
    </div>
  );
}
