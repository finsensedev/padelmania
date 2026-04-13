import { useContext, useMemo, useState } from "react";
import { useQuery } from "react-query";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  CreditCard,
} from "lucide-react";
import useNotification from "src/hooks/useNotification";
import { financeOfficerService } from "src/services/financeOfficer.service";
import { SocketContext } from "src/contexts/SocketProvider";
import { useNavigate } from "react-router-dom";

import RangeSelect from "src/components/ui/RangeSelect";
import {
  type ExtendedRange,
  type CustomDateBounds,
  getExtendedRangeBounds,
  isRangeValid,
} from "src/utils/rangeUtils";

// Using return type inline from service for data typing

export default function FinanceOfficerDashboard() {
  useNotification();
  const { socket } = useContext(SocketContext);
  const navigator = useNavigate();

  const [range, setRange] = useState<ExtendedRange>("MONTH");
  const [customDates, setCustomDates] = useState<CustomDateBounds>({
    customFrom: "",
    customTo: "",
  });
  const { data, refetch } = useQuery({
    queryKey: ["fo-dashboard-stats", range, customDates],
    queryFn: () =>
      financeOfficerService.getDashboardStats(
        getExtendedRangeBounds(range, customDates),
      ),
    enabled: isRangeValid(range, customDates),
    refetchOnWindowFocus: false,
  });

  // Live updates
  useMemo(() => {
    if (!socket) return;
    const handler = () => refetch();
    socket.on("payments:update", handler);
    socket.on("admin:analytics:update", handler);
    return () => {
      socket.off("payments:update", handler);
      socket.off("admin:analytics:update", handler);
    };
  }, [socket, refetch]);

  // Refresh button removed per requirement

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return "bg-primary text-white";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-destructive text-white";
      case "cancelled":
        return "bg-muted text-muted-foreground border border-border";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 bg-background min-h-screen">
      {/* Header */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Finance Dashboard
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Overview of financial metrics and recent activities
          </p>
        </div>
        <RangeSelect
          value={range}
          onChange={setRange}
          customDates={customDates}
          onCustomDatesChange={setCustomDates}
          triggerClassName="w-full sm:w-36"
        />
      </motion.div>

      {/* Stats Cards */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-white">
                Total Revenue
              </CardTitle>
              <DollarSign className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-2xl md:text-3xl font-bold text-white">
                KSh {(data?.revenue.thisMonth ?? 0).toLocaleString()}
              </div>
              <p className={`text-xs flex items-center mt-1 text-white/90`}>
                {(data?.revenue.growth ?? 0) >= 0 ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1" />
                )}
                {Math.abs(data?.revenue.growth ?? 0)}% from last month
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-white">
                Transactions
              </CardTitle>
              <CreditCard className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-2xl md:text-3xl font-bold text-white">
                {(data?.transactions.total ?? 0).toLocaleString()}
              </div>
              <p className={`text-xs flex items-center mt-1 text-white/90`}>
                {(data?.transactions.total ?? 0) >=
                (data?.transactions.failed ?? 0) ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1" />
                )}
                {/* Placeholder trend since backend doesn't provide */}
                0% from last month
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-white">
                Today's Bookings
              </CardTitle>
              <Calendar className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-2xl md:text-3xl font-bold text-white">
                {data?.transactions.successful ?? 0}
              </div>
              <p className="text-xs text-white/90 mt-1">
                Active bookings today
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-white">
                Active Users
              </CardTitle>
              <Users className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-2xl md:text-3xl font-bold text-white">
                {(data?.activeCustomers ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-white/90 mt-1">
                Registered and verified customers
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Action Cards removed per requirement: no pending concepts shown on dashboard */}

      {/* Recent Transactions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.5 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>
              Latest financial transactions requiring attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 md:space-y-4">
              {data?.recentTransactions?.map((transaction, index) => (
                <motion.div
                  key={transaction.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm md:text-base truncate">
                        {transaction.customerName}
                      </p>
                      <p className="text-xs md:text-sm text-muted-foreground">
                        {transaction.method}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 pl-5 sm:pl-0">
                    <div className="text-left sm:text-right">
                      <p className="font-medium text-sm md:text-base">
                        KSh {transaction.amount.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(transaction.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className={getStatusColor(transaction.status)}>
                      {transaction.status}
                    </Badge>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => navigator("/finance-officer/transactions")}
              >
                View All Transactions
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
