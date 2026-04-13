import { useContext, useEffect, useState } from "react";
import { useQuery } from "react-query";
import { motion } from "framer-motion";
import {
  Download,
  DollarSign,
  CheckCircle2,
  RefreshCw,
  Eye,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
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
// Removed approve/reject modals and alert components as statuses collapsed
import useNotification from "src/hooks/useNotification";
import { financeOfficerService } from "src/services/financeOfficer.service";
import { downloadBlob, defaultCsvName } from "src/utils/download";
import { useWithTwoFAExport } from "src/utils/withTwoFAExport";
import { SocketContext } from "src/contexts/SocketProvider";
import RangeSelect from "src/components/ui/RangeSelect";
import {
  type ExtendedRange,
  type CustomDateBounds,
  getExtendedRangeBounds,
} from "src/utils/rangeUtils";
import useModal from "src/hooks/useModal";
import RefundDetailsModal from "src/components/finance-officer/RefundDetailsModal";

interface RefundRequest {
  id: string;
  refundReference: string;
  originalTransactionId: string;
  bookingReference?: string;
  orderReference?: string;
  customerName: string;
  customerEmail: string;
  originalAmount: number;
  refundAmount: number;
  refundReason: string;
  paymentMethod: "MPESA" | "CARD" | "BANK_TRANSFER" | "CASH";
  status: "PROCESSING" | "COMPLETED"; // collapsed statuses
  requestedAt: string;
  requestedBy: string;
  processedAt?: string;
  completedAt?: string;
  rejectionReason?: string;
  refundMethod?: "ORIGINAL" | "MPESA" | "BANK_TRANSFER";
  bankDetails?: {
    accountName: string;
    accountNumber: string;
    bankName: string;
  };
  mpesaPhone?: string;
  notes?: string;
}

export default function FinanceOfficerRefunds() {
  const { toaster } = useNotification();
  const with2FA = useWithTwoFAExport();
  const { socket } = useContext(SocketContext);
  const [statusFilter, setStatusFilter] = useState("PROCESSING");
  const [range, setRange] = useState<ExtendedRange>("MONTH");
  const [customDates, setCustomDates] = useState<CustomDateBounds>({
    customFrom: "",
    customTo: "",
  });
  const { pushModal } = useModal();

  const { data, isLoading } = useQuery({
    queryKey: ["finance-refunds", statusFilter, range, customDates],
    queryFn: async () => {
      const resp = await financeOfficerService.getRefunds({
        page: 1,
        limit: 50,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        ...getExtendedRangeBounds(range, customDates),
      });
      type FoRefundPayment = {
        id: string;
        amount: number | string;
        refundAmount?: number | string | null;
        status: string;
        method: "MPESA" | "CARD" | "BANK_TRANSFER" | "CASH";
        createdAt: string;
        updatedAt: string;
        refundedAt?: string | null;
        transactionId?: string | null;
        providerRef?: string | null;
        metadata?: {
          refundPending?: boolean;
          refundApproved?: boolean;
          refundRejected?: boolean;
          refundRequestedAmount?: number | string;
          refundInitiatedAt?: string;
          refundApprovedAt?: string;
          refundApprovedBy?: string;
          refundRejectionReason?: string;
        } | null;
        booking?: {
          bookingCode?: string | null;
          user?: {
            firstName?: string;
            lastName?: string;
            email?: string;
          } | null;
        } | null;
      };
      const payments = (resp.refunds || []) as FoRefundPayment[];
      const mapped: RefundRequest[] = payments.map((p) => {
        const meta = p.metadata || {};
        const status: RefundRequest["status"] = p.refundedAt
          ? "COMPLETED"
          : "PROCESSING";
        return {
          id: p.id,
          refundReference: p.providerRef || p.transactionId || p.id,
          originalTransactionId: p.transactionId || p.id,
          bookingReference: p.booking?.bookingCode || undefined,
          customerName: p.booking?.user
            ? `${p.booking.user.firstName || ""} ${
                p.booking.user.lastName || ""
              }`.trim()
            : "",
          customerEmail: p.booking?.user?.email || "",
          originalAmount: Number(p.amount || 0),
          refundAmount: Number(
            (p.refundAmount ?? meta.refundRequestedAmount) || 0,
          ),
          refundReason: meta.refundRejectionReason || "",
          paymentMethod: p.method,
          status,
          requestedAt: meta.refundInitiatedAt || p.updatedAt || p.createdAt,
          requestedBy: "System",
          completedAt: p.refundedAt || undefined,
        } as RefundRequest;
      });
      // Simplified stats: processing count, completed count, total refunded amount
      const stats = mapped.reduce(
        (acc, r) => {
          if (r.status === "PROCESSING") acc.processing += 1;
          if (r.status === "COMPLETED") {
            acc.completed += 1;
            acc.totalRefunded += Number(r.refundAmount || 0);
          }
          return acc;
        },
        { processing: 0, completed: 0, totalRefunded: 0 },
      );
      return {
        refunds: mapped,
        total: resp.pagination?.total || mapped.length,
        stats,
      };
    },
    keepPreviousData: true,
  });

  useEffect(() => {
    if (!socket) return;
    const handler = () => {};
    socket.on("payments:update", handler);
    return () => {
      socket.off("payments:update", handler);
    };
  }, [socket]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-100 text-green-800";
      case "PROCESSING":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case "MPESA":
        return "bg-green-100 text-green-800";
      case "CARD":
        return "bg-blue-100 text-blue-800";
      case "BANK_TRANSFER":
        return "bg-purple-100 text-purple-800";
      case "CASH":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 min-h-screen">
      {/* Header with period + status selector + export */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Refund Management
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Monitor and review refund processing
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <RangeSelect
            value={range}
            onChange={setRange}
            customDates={customDates}
            onCustomDatesChange={setCustomDates}
            triggerClassName="w-full sm:w-32"
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v)}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PROCESSING">Processing</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="ALL">All</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={async () => {
              await with2FA(
                async (sessionToken) => {
                  try {
                    const effectiveStatus = [
                      "PROCESSING",
                      "COMPLETED",
                    ].includes(statusFilter)
                      ? statusFilter
                      : undefined;
                    const blob = await financeOfficerService.exportRefunds({
                      status: effectiveStatus,
                      ...getExtendedRangeBounds(range, customDates),
                      sessionToken,
                    });
                    downloadBlob(blob, defaultCsvName("refunds"));
                    toaster("Refunds exported", { variant: "success" });
                  } catch {
                    toaster("Failed to export refunds", { variant: "error" });
                  }
                },
                {
                  cacheKey: `refunds-${range}-${statusFilter}`,
                  useResultCache: true,
                },
              );
            }}
            className="w-full sm:w-auto"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Refunds
          </Button>
        </div>
      </motion.div>

      {/* Simplified Stats Cards */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          whileHover={{ y: -4 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-white">
                Processing
              </CardTitle>
              <RefreshCw className="h-4 w-4 text-white/80" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-xl md:text-2xl font-bold text-white">
                {data?.stats?.processing || 0}
              </div>
              <p className="text-xs text-white/80">Currently in progress</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          whileHover={{ y: -4 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-white">
                Completed
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-white/80" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-xl md:text-2xl font-bold text-white">
                {data?.stats?.completed || 0}
              </div>
              <p className="text-xs text-white/80">Successfully refunded</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          whileHover={{ y: -4 }}
          className="sm:col-span-2 lg:col-span-1"
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-white">
                Total Refunded
              </CardTitle>
              <DollarSign className="h-4 w-4 text-white/80" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-xl md:text-2xl font-bold text-white">
                KSh {data?.stats?.totalRefunded?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-white/80">Amount completed</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Filters removed as per simplification */}

      {/* Refunds Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">
              Refund Requests
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Customer refund requests requiring review and processing
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Original Amount</TableHead>
                    <TableHead>Refund Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.refunds?.map((refund: RefundRequest) => (
                    <TableRow key={refund.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {refund.refundReference}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {refund.bookingReference || refund.orderReference}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{refund.customerName}</p>
                          <p className="text-sm text-muted-foreground">
                            {refund.customerEmail}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        KSh {refund.originalAmount.toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium text-red-600">
                        KSh {refund.refundAmount.toLocaleString()}
                        {refund.refundAmount < refund.originalAmount && (
                          <p className="text-xs text-muted-foreground">
                            Partial refund
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{refund.refundReason}</p>
                        {refund.rejectionReason && (
                          <p className="text-xs text-red-600 mt-1">
                            Rejected: {refund.rejectionReason}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={getMethodColor(refund.paymentMethod)}>
                          {refund.paymentMethod.replace("_", " ")}
                        </Badge>
                        {refund.refundMethod &&
                          refund.refundMethod !== "ORIGINAL" && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Via {refund.refundMethod.replace("_", " ")}
                            </p>
                          )}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(refund.status)}>
                          {refund.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>
                          <p>{formatDateTime(refund.requestedAt)}</p>
                          <p className="text-xs text-muted-foreground">
                            By {refund.requestedBy}
                          </p>
                          {refund.completedAt && (
                            <p className="text-xs text-green-600">
                              Completed: {formatDateTime(refund.completedAt)}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            pushModal(<RefundDetailsModal refund={refund} />)
                          }
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
