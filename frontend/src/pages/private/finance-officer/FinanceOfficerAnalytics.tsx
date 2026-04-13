import { useContext, useEffect, useState } from "react";
import { useQuery } from "react-query";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";

import { TrendingUp, BarChart3, RefreshCw } from "lucide-react";
import { financeOfficerService } from "src/services/financeOfficer.service";
import { SocketContext } from "src/contexts/SocketProvider";
import useNotification from "src/hooks/useNotification";
import RangeSelect from "src/components/ui/RangeSelect";
import {
  type ExtendedRange,
  type CustomDateBounds,
  getExtendedRangeBounds,
  isRangeValid,
} from "src/utils/rangeUtils";

export default function FinanceOfficerAnalytics() {
  const { toaster } = useNotification();
  const { socket } = useContext(SocketContext);
  const [range, setRange] = useState<ExtendedRange>("MONTH");
  const [customDates, setCustomDates] = useState<CustomDateBounds>({
    customFrom: "",
    customTo: "",
  });

  const {
    data: revenue,
    refetch: refetchRevenue,
    isFetching: fetchingRevenue,
  } = useQuery({
    queryKey: ["fo-analytics-revenue", range, customDates],
    queryFn: () =>
      financeOfficerService.getRevenueAnalytics({
        ...getExtendedRangeBounds(range, customDates),
        groupBy: "day",
      }),
    enabled: isRangeValid(range, customDates),
    keepPreviousData: true,
  });

  const {
    data: txn,
    refetch: refetchTxn,
    isFetching: fetchingTxn,
  } = useQuery({
    queryKey: ["fo-analytics-transactions", range, customDates],
    queryFn: () =>
      financeOfficerService.getTransactionAnalytics({
        ...getExtendedRangeBounds(range, customDates),
      }),
    enabled: isRangeValid(range, customDates),
    keepPreviousData: true,
  });

  // Reconciliation analytics removed

  useEffect(() => {
    if (!socket) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handler = (..._args: unknown[]) => {
      refetchRevenue();
      refetchTxn();
    };
    socket.on("payments:update", handler);
    socket.on("admin:analytics:update", handler);
    return () => {
      socket.off("payments:update", handler);
      socket.off("admin:analytics:update", handler);
    };
  }, [socket, refetchRevenue, refetchTxn]);

  const refreshAll = async () => {
    try {
      await Promise.all([refetchRevenue(), refetchTxn()]);
      toaster("Analytics refreshed", { variant: "success" });
    } catch {
      toaster("Failed to refresh analytics", { variant: "error" });
    }
  };

  // Calculate accurate metrics from API response
  type RevenueDataPoint = {
    period: string;
    revenue: number;
    transactions: number;
    methods: Record<string, number>;
  };

  const revenueData = (revenue?.data as RevenueDataPoint[]) || [];

  // Sum all revenue from the data points
  const totalRevenue = revenueData.reduce(
    (sum, point) => sum + Number(point.revenue || 0),
    0,
  );

  // Get transaction metrics from API response
  const totalTransactions = Number(txn?.summary?.totalTransactions || 0);
  const averageTransactionValue = Number(txn?.summary?.averageAmount || 0);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 bg-background min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Financial Analytics
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Trends and breakdowns for revenue and transactions
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <RangeSelect
            value={range}
            onChange={setRange}
            customDates={customDates}
            onCustomDatesChange={setCustomDates}
            triggerClassName="w-full sm:w-36"
          />
          <Button
            variant="outline"
            onClick={refreshAll}
            className="w-full sm:w-auto"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${
                fetchingRevenue || fetchingTxn ? "animate-spin" : ""
              }`}
            />
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* Date range card removed; period selector in header controls queries */}

      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          whileHover={{ y: -4 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="relative z-10">
              <CardTitle className="text-xs md:text-sm text-white">
                Total Revenue
              </CardTitle>
              <CardDescription className="text-xs text-white/80">
                Sum over period
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-xl md:text-2xl font-bold text-white">
                KSh {Number(totalRevenue).toLocaleString()}
              </div>
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
            <CardHeader className="relative z-10">
              <CardTitle className="text-xs md:text-sm text-white">
                Total Transactions
              </CardTitle>
              <CardDescription className="text-xs text-white/80">
                Count over period
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-xl md:text-2xl font-bold text-white">
                {Number(totalTransactions).toLocaleString()}
              </div>
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
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="relative z-10">
              <CardTitle className="text-xs md:text-sm text-white">
                Avg Transaction Value
              </CardTitle>
              <CardDescription className="text-xs text-white/80">
                Average per transaction
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-xl md:text-2xl font-bold text-white">
                KSh{" "}
                {averageTransactionValue.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                <TrendingUp className="w-4 h-4" /> Revenue trend
              </CardTitle>
              <CardDescription className="text-xs">
                Grouped by day
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xs md:text-sm text-muted-foreground">
                {revenueData.length} data points
              </div>
              {/* Hook up chart library here if available */}
            </CardContent>
          </Card>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                <BarChart3 className="w-4 h-4" /> Status breakdown
              </CardTitle>
              <CardDescription className="text-xs">
                Success vs failed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xs md:text-sm text-muted-foreground">
                Completed: {txn?.breakdowns?.byStatus?.COMPLETED || 0} • Failed:{" "}
                {txn?.breakdowns?.byStatus?.FAILED || 0}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
