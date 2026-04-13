import { useContext, useMemo, useState } from "react";
import { useQuery } from "react-query";
import { motion } from "framer-motion";
import { CreditCard, Download, RotateCcw } from "lucide-react";
import {
  Card,
  CardContent,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "src/components/ui/alert-dialog";
import useNotification from "src/hooks/useNotification";
import paymentService from "src/services/payment.service";
import { useWithTwoFAExport } from "src/utils/withTwoFAExport";
import { downloadBlob, defaultCsvName } from "src/utils/download";
import { SocketContext } from "src/contexts/SocketProvider";
import RangeSelect from "src/components/ui/RangeSelect";
import {
  type ExtendedRange,
  type CustomDateBounds,
  getExtendedRangeBounds,
} from "src/utils/rangeUtils";

interface Transaction {
  id: string;
  bookingId?: string;
  amount: number;
  status: string;
  method?: string;
  createdAt?: string;
  customerName?: string;
}

interface TransactionFilters {
  status?: string;
}

export default function ManagerTransactions() {
  const { toaster } = useNotification();
  const [range, setRange] = useState<ExtendedRange>("DAY");
  const [customDates, setCustomDates] = useState<CustomDateBounds>({
    customFrom: "",
    customTo: "",
  });
  const [specificDate, setSpecificDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState<TransactionFilters>({ status: "ALL" });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  const { socket } = useContext(SocketContext);
  const { data, isFetching, refetch } = useQuery({
    queryKey: [
      "manager-transactions",
      range,
      customDates,
      specificDate,
      searchTerm,
      filters.status,
      currentPage,
      pageSize,
    ],
    queryFn: async () => {
      const params: Record<string, string | number> = {};

      if (specificDate) {
        params.from = specificDate;
        params.to = specificDate;
      } else {
        const { startDate, endDate } = getExtendedRangeBounds(
          range,
          customDates,
        );
        params.from = startDate.split("T")[0];
        params.to = endDate.split("T")[0];
      }

      if (searchTerm) params.search = searchTerm;
      if (filters.status && filters.status !== "ALL")
        params.status = filters.status;

      const res: unknown = await paymentService.listTransactions(params);
      let transactions: Transaction[] = [];

      if (Array.isArray(res)) {
        transactions = res as Transaction[];
      } else if (
        res &&
        typeof res === "object" &&
        "data" in (res as Record<string, unknown>)
      ) {
        const maybe = (res as { data?: unknown }).data;
        if (Array.isArray(maybe)) transactions = maybe as Transaction[];
      }

      // Apply client-side pagination and search
      const filteredTransactions = transactions.filter((t) => {
        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          const matches =
            t.id.toLowerCase().includes(q) ||
            (t.bookingId || "").toLowerCase().includes(q) ||
            (t.customerName || "").toLowerCase().includes(q);
          if (!matches) return false;
        }
        return true;
      });

      const total = filteredTransactions.length;
      const startIndex = (currentPage - 1) * pageSize;
      const paginatedTransactions = filteredTransactions.slice(
        startIndex,
        startIndex + pageSize,
      );

      // Calculate stats
      const totalRevenue = paginatedTransactions
        .filter((t) => t.status === "COMPLETED" || t.status === "SUCCESS")
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      return {
        transactions: paginatedTransactions,
        total,
        pagination: { pages: Math.ceil(total / pageSize) },
        stats: {
          totalTransactions: paginatedTransactions.length,
          totalRevenue,
          successfulTransactions: paginatedTransactions.filter(
            (t) => t.status === "COMPLETED" || t.status === "SUCCESS",
          ).length,
          failedTransactions: paginatedTransactions.filter(
            (t) => t.status === "FAILED",
          ).length,
        },
      };
    },
    keepPreviousData: true,
  });

  // Live updates
  useMemo(() => {
    if (!socket) return;
    const handler = () => refetch();
    socket.on("payments:update", handler);
    return () => {
      socket.off("payments:update", handler);
    };
  }, [socket, refetch]);

  const with2FA = useWithTwoFAExport();

  const handleExport = async () => {
    await with2FA(
      async () => {
        try {
          // Create CSV export from current data
          const transactionsToExport = data?.transactions || [];
          const csvContent = [
            [
              "Transaction ID",
              "Booking ID",
              "Customer",
              "Amount",
              "Status",
              "Method",
              "Created At",
            ].join(","),
            ...transactionsToExport.map((t) =>
              [
                t.id,
                t.bookingId || "",
                t.customerName || "N/A",
                t.amount,
                t.status,
                t.method || "M-Pesa",
                t.createdAt ? new Date(t.createdAt).toLocaleString() : "",
              ].join(","),
            ),
          ].join("\n");

          const blob = new Blob([csvContent], {
            type: "text/csv;charset=utf-8;",
          });
          downloadBlob(blob, defaultCsvName("manager-transactions"));
          toaster("Transactions exported", { variant: "success" });
        } catch {
          toaster("Failed to export transactions", { variant: "error" });
        }
      },
      {
        cacheKey: `transactions-${range}-${specificDate || "none"}-${
          filters.status
        }`,
        useResultCache: true,
      },
    );
  };

  const handleRefund = async (transaction: Transaction) => {
    try {
      await paymentService.refundPayment(transaction.id, {
        reason: "Manager refund",
      });
      toaster("Payment refunded successfully", { variant: "success" });
      refetch();
    } catch {
      toaster("Failed to refund payment", { variant: "error" });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
      case "SUCCESS":
        return "bg-green-100 text-green-800";
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "PROCESSING":
        return "bg-blue-100 text-blue-800";
      case "FAILED":
        return "bg-red-100 text-red-800";
      case "CANCELLED":
        return "bg-gray-100 text-gray-800";
      case "REFUNDED":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Transaction Management
          </h1>
          <p className="text-muted-foreground">
            Monitor and manage payment transactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RangeSelect
            value={range}
            onChange={setRange}
            customDates={customDates}
            onCustomDatesChange={setCustomDates}
            triggerClassName="w-36"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Status:</label>
            <Select
              value={filters.status || "ALL"}
              onValueChange={(value) => {
                setFilters((prev) => ({ ...prev, status: value }));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="SUCCESS">Success</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Date:</label>
            <Input
              type="date"
              value={specificDate}
              onChange={(e) => {
                setSpecificDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-auto"
            />
          </div>
          <Button onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <motion.div
          className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow p-6 rounded-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="relative z-10">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="text-sm font-medium text-white">
                Total Transactions
              </div>
              <CreditCard className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">
                {data?.stats?.totalTransactions || 0}
              </div>
              <p className="text-xs text-white/80">In current view</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg hover:shadow-xl transition-shadow p-6 rounded-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="relative z-10">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="text-sm font-medium text-white">
                Total Revenue
              </div>
              <CreditCard className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">
                KSh {data?.stats?.totalRevenue?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-white/80">Successful payments</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg hover:shadow-xl transition-shadow p-6 rounded-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <div className="relative z-10">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="text-sm font-medium text-white">Successful</div>
              <CreditCard className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">
                {data?.stats?.successfulTransactions || 0}
              </div>
              <p className="text-xs text-white/80">Completed transactions</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg hover:shadow-xl transition-shadow p-6 rounded-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <div className="relative z-10">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="text-sm font-medium text-white">Failed</div>
              <CreditCard className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">
                {data?.stats?.failedTransactions || 0}
              </div>
              <p className="text-xs text-white/80">Failed transactions</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Search by transaction ID, booking ID, or customer..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="flex-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {isFetching ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Booking ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.transactions?.map((transaction: Transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>
                        <p className="font-mono text-sm">{transaction.id}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-mono text-sm">
                          {transaction.bookingId || "N/A"}
                        </p>
                      </TableCell>
                      <TableCell className="font-medium">
                        KSh {transaction.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(transaction.status)}>
                          {transaction.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{transaction.method || "M-Pesa"}</TableCell>
                      <TableCell className="text-sm">
                        {formatDateTime(transaction.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {(transaction.status === "COMPLETED" ||
                          transaction.status === "SUCCESS") && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <RotateCcw className="w-4 h-4 mr-1" />
                                Refund
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Refund Transaction
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to refund this
                                  transaction? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRefund(transaction)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Process Refund
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * pageSize + 1} to{" "}
                  {Math.min(currentPage * pageSize, data?.total || 0)} of{" "}
                  {data?.total || 0} transactions
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {currentPage} of {data?.pagination?.pages || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => p + 1)}
                    disabled={currentPage >= (data?.pagination?.pages || 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
