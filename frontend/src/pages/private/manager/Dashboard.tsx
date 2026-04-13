import { useContext, useMemo, useState } from "react";
import { useQuery } from "react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "src/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import {
  DollarSign,
  Users,
  Calendar as CalendarIcon,
  Activity,
  Target,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  X,
  Loader2,
} from "lucide-react";

import { cn } from "src/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import useNotification from "src/hooks/useNotification";
import {
  dashboardService,
  type ManagerPeriodSummary,
} from "src/services/dashboard.service";
import { SocketContext } from "src/contexts/SocketProvider";
import type { DashboardRange } from "src/contexts/internal/ManagerDashboardContext";
import { useManagerDashboard } from "src/hooks/useManagerDashboard";
import { Calendar } from "src/components/ui/calender";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "src/components/ui/popover";

// Skeleton Components for individual loading states
const StatCardSkeleton = ({ index }: { index: number }) => (
  <motion.div
    className="relative overflow-hidden bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, delay: index * 0.1 }}
  >
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    <div className="flex items-center justify-between mb-3 md:mb-4">
      <div className="w-10 h-10 md:w-12 md:h-12 bg-muted/60 rounded-xl animate-pulse" />
      <div className="h-5 md:h-6 w-16 md:w-20 bg-muted/60 rounded-full animate-pulse" />
    </div>
    <div className="h-8 md:h-10 w-32 md:w-40 bg-muted/60 rounded-lg animate-pulse mb-2" />
    <div className="h-4 md:h-5 w-24 md:w-28 bg-muted/40 rounded-md animate-pulse" />
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex justify-between">
        <div className="h-4 w-20 bg-muted/40 rounded-md animate-pulse" />
        <div className="h-4 w-16 bg-muted/40 rounded-md animate-pulse" />
      </div>
    </div>
  </motion.div>
);

const ChartSkeleton = () => (
  <div className="relative h-[250px] bg-muted/20 rounded-xl overflow-hidden">
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-muted-foreground/50 animate-spin" />
        <span className="text-sm text-muted-foreground/70">
          Loading chart data...
        </span>
      </div>
    </div>
    {/* Fake chart lines */}
    <div className="absolute bottom-8 left-12 right-4 h-px bg-border/30" />
    <div className="absolute bottom-8 left-12 w-px h-[180px] bg-border/30" />
  </div>
);

const ActivitySkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-start gap-3 p-2">
        <div className="w-9 h-9 md:w-10 md:h-10 bg-muted/60 rounded-xl animate-pulse flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-4/5 bg-muted/60 rounded-md animate-pulse" />
          <div className="h-3 w-3/5 bg-muted/40 rounded-md animate-pulse" />
          <div className="h-3 w-12 bg-muted/30 rounded-md animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const TableRowSkeleton = () => (
  <tr className="border-b border-border">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <td key={i} className="px-4 py-3">
        <div
          className={`h-5 bg-muted/50 rounded-md animate-pulse ${
            i === 1 ? "w-32" : i === 4 ? "w-20" : "w-16"
          }`}
        />
      </td>
    ))}
  </tr>
);

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function ManagerDashboard() {
  const { toaster } = useNotification();
  const { socket } = useContext(SocketContext);
  const navigate = useNavigate();

  const {
    range,
    setRange,
    selectedCourt,
    customFrom,
    customTo,
    setCustomFrom,
    setCustomTo,
  } = useManagerDashboard();

  const [date, setDate] = useState<Date | undefined>(undefined);
  const [limit, setLimit] = useState<string>("5");
  const [page, setPage] = useState<number>(1);

  const isCustomValid =
    range === "CUSTOM"
      ? !!(customFrom && customTo && customFrom <= customTo)
      : true;

  const {
    data: stats,
    refetch: refetchStats,
    isLoading: statsLoading,
  } = useQuery({
    queryKey: [
      "manager-dashboard-stats",
      range,
      selectedCourt,
      date,
      customFrom,
      customTo,
    ],
    queryFn: () => {
      const court = selectedCourt === "all" ? undefined : selectedCourt;
      if (range === "CUSTOM") {
        return dashboardService.getStats(
          court,
          "CUSTOM",
          undefined,
          customFrom,
          customTo,
        );
      }
      return dashboardService.getStats(court, range, date);
    },
    enabled: isCustomValid,
    refetchOnWindowFocus: false,
    refetchInterval: 60000,
    onError: () => {
      toaster("Failed to load dashboard statistics", { variant: "error" });
    },
  });

  const { data: topCustomersResponse, isLoading: customersLoading } = useQuery({
    queryKey: ["manager-top-customers", limit, page],
    queryFn: () => {
      const limitVal = limit === "all" ? 10 : parseInt(limit);
      return dashboardService.getTopCustomers(limitVal, page);
    },
    keepPreviousData: true,
  });

  const topCustomers = topCustomersResponse?.data;
  const meta = topCustomersResponse?.meta;

  const period: ManagerPeriodSummary | undefined = stats?.periodSummary;

  const {
    data: revenueChart,
    refetch: refetchRevenue,
    isLoading: revenueLoading,
  } = useQuery({
    queryKey: [
      "manager-revenue-chart",
      range,
      selectedCourt,
      customFrom,
      customTo,
    ],
    queryFn: () => {
      let days: number;
      if (range === "CUSTOM" && customFrom && customTo) {
        const diff = Math.ceil(
          (new Date(customTo).getTime() - new Date(customFrom).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        days = Math.max(diff + 1, 1);
      } else {
        days =
          range === "DAY"
            ? 7
            : range === "WEEK"
              ? 30
              : range === "MONTH"
                ? 90
                : 365;
      }
      const court = selectedCourt === "all" ? undefined : selectedCourt;
      return dashboardService.getRevenueChart(days, court);
    },
    enabled: isCustomValid,
    onError: () => {
      toaster("Failed to load revenue chart", { variant: "error" });
    },
  });

  const { refetch: refetchCourts } = useQuery({
    queryKey: ["manager-court-utilization", selectedCourt],
    queryFn: () => {
      const court = selectedCourt === "all" ? undefined : selectedCourt;
      return dashboardService.getCourtUtilization(court);
    },
    onError: () => {
      toaster("Failed to load court utilization", { variant: "error" });
    },
  });

  const {
    data: recentActivities,
    refetch: refetchActivities,
    isLoading: activitiesLoading,
  } = useQuery({
    queryKey: ["manager-recent-activities", selectedCourt],
    queryFn: () => {
      const court = selectedCourt === "all" ? undefined : selectedCourt;
      return dashboardService.getRecentActivities(court);
    },
    refetchInterval: 30000,
    onError: () => {
      toaster("Failed to load recent activities", { variant: "error" });
    },
  });

  useMemo(() => {
    if (!socket) return;

    const handlePaymentUpdate = () => {
      refetchStats();
      refetchRevenue();
    };
    const handleAnalyticsUpdate = () => {
      refetchStats();
      refetchRevenue();
      refetchActivities();
    };
    const handleBookingUpdate = () => {
      refetchStats();
      refetchCourts();
      refetchActivities();
    };

    socket.on("payments:update", handlePaymentUpdate);
    socket.on("admin:analytics:payment", handleAnalyticsUpdate);
    socket.on("admin:analytics:booking", handleAnalyticsUpdate);
    socket.on("bookings:update", handleBookingUpdate);
    socket.on("court:availability:updated", handleBookingUpdate);

    return () => {
      socket.off("payments:update", handlePaymentUpdate);
      socket.off("admin:analytics:payment", handleAnalyticsUpdate);
      socket.off("admin:analytics:booking", handleAnalyticsUpdate);
      socket.off("bookings:update", handleBookingUpdate);
      socket.off("court:availability:updated", handleBookingUpdate);
    };
  }, [socket, refetchStats, refetchRevenue, refetchCourts, refetchActivities]);

  const formatCurrency = (amount: number) => `KSh ${amount.toLocaleString()}`;
  const periodLabel = (r: DashboardRange) =>
    date
      ? format(date, "MMM d, yyyy")
      : r === "DAY"
        ? "Today"
        : r === "WEEK"
          ? "This Week"
          : r === "MONTH"
            ? "This Month"
            : r === "YEAR"
              ? "This Year"
              : `${customFrom} – ${customTo}`;

  const getButtonLabel = (r: DashboardRange) =>
    r === "DAY"
      ? "Today"
      : r === "WEEK"
        ? "This Week"
        : r === "MONTH"
          ? "This Month"
          : r === "YEAR"
            ? "This Year"
            : "Custom";

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "booking":
        return <CalendarIcon className="w-4 h-4" />;
      case "payment":
        return <DollarSign className="w-4 h-4" />;
      case "customer":
        return <Users className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Manager Dashboard
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Real-time operational performance and insights
          </p>
        </div>

        {/* Filters - Stack on mobile */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Date Picker */}
          <div className="flex items-center gap-2">
            {date && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDate(undefined)}
                title="Clear date"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-[240px] justify-start text-left font-normal",
                    !date && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Period Selector - Horizontal scroll on mobile */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {(
              ["DAY", "WEEK", "MONTH", "YEAR", "CUSTOM"] as DashboardRange[]
            ).map((r) => (
              <motion.button
                key={r}
                onClick={() => {
                  setRange(r);
                  if (r !== "CUSTOM") setDate(undefined);
                }}
                className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  !date && range === r
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card text-card-foreground hover:bg-muted border border-border"
                }`}
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.02 }}
              >
                {getButtonLabel(r)}
              </motion.button>
            ))}
          </div>

          {/* Custom Date Range Inputs */}
          {range === "CUSTOM" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                className={`px-2 py-1.5 text-sm border rounded-lg bg-card ${
                  !customFrom ? "border-destructive" : "border-border"
                }`}
                value={customFrom}
                max={customTo || new Date().toISOString().slice(0, 10)}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomFrom(v);
                  if (customTo && v > customTo) setCustomTo(v);
                }}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                className={`px-2 py-1.5 text-sm border rounded-lg bg-card ${
                  !customTo ? "border-destructive" : "border-border"
                }`}
                value={customTo}
                min={customFrom || undefined}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomTo(v);
                  if (customFrom && v < customFrom) setCustomFrom(v);
                }}
              />
            </div>
          )}
        </div>
      </motion.div>

      {/* Key Metrics Cards */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {statsLoading ? (
          // Enhanced loading skeletons for stats cards
          <>
            {[1, 2, 3, 4].map((i) => (
              <StatCardSkeleton key={i} index={i} />
            ))}
          </>
        ) : (
          <>
            {/* Revenue Card */}
            <motion.div
              className="group relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-emerald-500 via-green-500 to-green-600 text-white shadow-lg hover:shadow-2xl rounded-2xl cursor-pointer"
              variants={itemVariants}
              whileHover={{ y: -6, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Decorative background elements */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform duration-500" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-12 -translate-x-12 group-hover:scale-150 transition-transform duration-500" />

              <div className="relative z-10 p-4 md:p-6">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl group-hover:bg-white/30 transition-colors">
                    <DollarSign className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  </div>
                  {(() => {
                    const growthStr = stats?.revenue.growth ?? "0.0";
                    const growthNum = parseFloat(growthStr);
                    const positive = growthNum >= 0;
                    return (
                      <motion.span
                        className={cn(
                          "text-xs md:text-sm font-semibold flex items-center gap-1 px-2.5 py-1 rounded-full",
                          positive
                            ? "bg-white/20 text-white"
                            : "bg-red-400/30 text-white",
                        )}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", delay: 0.2 }}
                      >
                        {positive ? (
                          <ArrowUpRight className="w-3 h-3 md:w-4 md:h-4" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3 md:w-4 md:h-4" />
                        )}
                        {`${growthNum > 0 ? "+" : ""}${growthNum.toFixed(1)}%`}
                      </motion.span>
                    );
                  })()}
                </div>
                <motion.p
                  className="text-2xl md:text-3xl font-bold text-white tracking-tight"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  {formatCurrency(period?.revenue.total || 0)}
                </motion.p>
                <p className="text-xs md:text-sm text-white/80 mt-1 font-medium">
                  {periodLabel(range)} Revenue
                </p>
                <div className="mt-4 pt-4 border-t border-white/20">
                  <div className="flex justify-between text-xs md:text-sm">
                    <span className="text-white/70">Period</span>
                    <span className="font-medium text-white truncate ml-2">
                      {period
                        ? `${format(new Date(period.from), "d MMM")} - ${format(
                            new Date(period.to),
                            "d MMM",
                          )}`
                        : ""}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Bookings Card */}
            <motion.div
              className="group relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-blue-500 via-cyan-500 to-cyan-600 text-white shadow-lg hover:shadow-2xl rounded-2xl cursor-pointer"
              variants={itemVariants}
              whileHover={{ y: -6, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Decorative background elements */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform duration-500" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-12 -translate-x-12 group-hover:scale-150 transition-transform duration-500" />

              <div className="relative z-10 p-4 md:p-6">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl group-hover:bg-white/30 transition-colors">
                    <CalendarIcon className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  </div>
                  <motion.span
                    className="text-xs md:text-sm font-semibold bg-white/20 px-2.5 py-1 rounded-full"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.3 }}
                  >
                    {(
                      ((period?.bookings.confirmed || 0) /
                        (period?.bookings.total || 1)) *
                      100
                    ).toFixed(0)}
                    % confirmed
                  </motion.span>
                </div>
                <motion.p
                  className="text-2xl md:text-3xl font-bold text-white tracking-tight"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  {period?.bookings.total || 0}
                </motion.p>
                <p className="text-xs md:text-sm text-white/80 mt-1 font-medium">
                  {periodLabel(range)} Bookings
                </p>
                <div className="mt-4 pt-4 border-t border-white/20">
                  <div className="flex gap-3 md:gap-4 text-xs md:text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse"></div>
                      <span className="text-white/70">Confirmed</span>
                      <span className="font-semibold text-white">
                        {period?.bookings.confirmed || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Utilization Card */}
            <motion.div
              className="group relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-amber-500 via-orange-500 to-orange-600 text-white shadow-lg hover:shadow-2xl rounded-2xl cursor-pointer"
              variants={itemVariants}
              whileHover={{ y: -6, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Decorative background elements */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform duration-500" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-12 -translate-x-12 group-hover:scale-150 transition-transform duration-500" />

              <div className="relative z-10 p-4 md:p-6">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl group-hover:bg-white/30 transition-colors">
                    <Target className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  </div>
                  <motion.span
                    className={cn(
                      "text-xs md:text-sm font-semibold px-2.5 py-1 rounded-full",
                      (period?.courts.utilizationPct || 0) > 75
                        ? "bg-emerald-400/30 text-white"
                        : (period?.courts.utilizationPct || 0) > 50
                          ? "bg-yellow-400/30 text-white"
                          : "bg-white/20 text-white",
                    )}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.4 }}
                  >
                    {(period?.courts.utilizationPct || 0) > 75
                      ? "High"
                      : (period?.courts.utilizationPct || 0) > 50
                        ? "Medium"
                        : "Low"}
                  </motion.span>
                </div>
                <motion.p
                  className="text-2xl md:text-3xl font-bold text-white tracking-tight"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  {period?.courts.utilizationPct?.toFixed(1) || "0.0"}%
                </motion.p>
                <p className="text-xs md:text-sm text-white/80 mt-1 font-medium">
                  {periodLabel(range)} Utilization
                </p>
                <div className="mt-4 pt-4 border-t border-white/20">
                  <div className="flex justify-between text-xs md:text-sm gap-2">
                    <span className="text-white/70 truncate">
                      {selectedCourt === "all"
                        ? "All Courts"
                        : `Court ${selectedCourt}`}
                    </span>
                    <span className="font-medium text-white whitespace-nowrap">
                      {periodLabel(range)} Period
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Customers Card */}
            <motion.div
              className="group relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-violet-500 via-purple-500 to-purple-600 text-white shadow-lg hover:shadow-2xl rounded-2xl cursor-pointer"
              variants={itemVariants}
              whileHover={{ y: -6, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Decorative background elements */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform duration-500" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-12 -translate-x-12 group-hover:scale-150 transition-transform duration-500" />

              <div className="relative z-10 p-4 md:p-6">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl group-hover:bg-white/30 transition-colors">
                    <Users className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  </div>
                  <motion.span
                    className="text-xs md:text-sm font-semibold bg-emerald-400/30 px-2.5 py-1 rounded-full flex items-center gap-1"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.5 }}
                  >
                    <ArrowUpRight className="w-3 h-3 md:w-4 md:h-4" />+
                    {period?.customers.newVerified || 0} new
                  </motion.span>
                </div>
                <motion.p
                  className="text-2xl md:text-3xl font-bold text-white tracking-tight"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                >
                  {period?.customers.activeVerified || 0}
                </motion.p>
                <p className="text-xs md:text-sm text-white/80 mt-1 font-medium">
                  {periodLabel(range)} Active Customers
                </p>
                <div className="mt-4 pt-4 border-t border-white/20">
                  <div className="flex justify-between text-xs md:text-sm">
                    <span className="text-white/70">Total Verified</span>
                    <span className="font-semibold text-white">
                      {period?.customers.verifiedTotal || 0}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </motion.div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Revenue Trend Chart */}
        <motion.div
          className="lg:col-span-2 bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 md:mb-6">
            <div>
              <h3 className="text-base md:text-lg font-semibold text-card-foreground">
                Revenue Trend
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                {periodLabel(range)} trend (
                {selectedCourt === "all"
                  ? "All courts"
                  : `Court ${selectedCourt}`}
                )
              </p>
            </div>
            <motion.button
              onClick={() => navigate("/manager/reports")}
              className="text-xs md:text-sm text-primary hover:text-primary/80 flex items-center gap-1 self-start sm:self-auto"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              View Details
              <ChevronRight className="w-3 h-3 md:w-4 md:h-4" />
            </motion.button>
          </div>
          <div className="w-full overflow-x-auto">
            {revenueLoading ? (
              <ChartSkeleton />
            ) : (
              <ResponsiveContainer width="100%" height={250} minWidth={300}>
                <AreaChart data={revenueChart || []}>
                  <defs>
                    <linearGradient
                      id="colorRevenue"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--color-primary)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-primary)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                  />
                  <XAxis
                    dataKey="date"
                    stroke="var(--color-muted-foreground)"
                    fontSize={12}
                  />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={12}
                    tickFormatter={(value) => `${value / 1000}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-background)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--color-primary)"
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          className="bg-card p-4 flex flex-col md:p-6 rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow duration-300"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.6 }}
        >
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <div>
              <h3 className="text-base md:text-lg font-semibold text-card-foreground flex items-center gap-2">
                <div className="p-1.5 bg-primary/10 rounded-lg">
                  <Activity className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                </div>
                Recent Activity
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Latest operations
              </p>
            </div>
            {activitiesLoading && (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            )}
          </div>
          <div
            className={cn(
              "flex-1 max-h-[220px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent pr-2",
              activitiesLoading ? "" : "space-y-2",
            )}
          >
            <AnimatePresence mode="wait">
              {activitiesLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <ActivitySkeleton />
                </motion.div>
              ) : recentActivities && recentActivities.length > 0 ? (
                <motion.div
                  key="activities"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-2 "
                >
                  {recentActivities.slice(0, 8).map((activity, index) => (
                    <motion.div
                      key={activity.id}
                      className="flex items-start gap-3 p-2.5 rounded-xl"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                    >
                      <div
                        className={cn(
                          "p-2 rounded-xl flex-shrink-0 transition-colors",
                          activity.type === "payment"
                            ? "bg-emerald-100 text-primary "
                            : activity.type === "booking"
                              ? "bg-blue-100 text-primary "
                              : activity.type === "customer"
                                ? "bg-purple-100 text-primary "
                                : "bg-muted text-muted-foreground",
                        )}
                      >
                        {getActivityIcon(activity.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs md:text-sm font-medium truncate text-card-foreground group-hover:text-primary transition-colors">
                          {activity.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {activity.description}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1 font-medium">
                          {format(activity.time, "HH:mm")}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center flex-1 flex flex-col items-center justify-center text-muted-foreground py-8"
                >
                  <div className="p-4 bg-muted/50 rounded-full mb-3">
                    <Activity className="w-8 h-8 opacity-50" />
                  </div>
                  <p className="text-sm font-medium">No recent activities</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Activities will appear here
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-4 group hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={() => navigate("/manager/bookings")}
          >
            View All Activity
            <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
          </Button>
        </motion.div>
      </div>

      {/* Top Customers Section */}
      <motion.div
        className="mt-6 bg-card p-4 md:p-6 rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow duration-300"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.7 }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-semibold text-card-foreground">
                Top Customers
              </h3>
              <p className="text-xs text-muted-foreground">
                Based on total bookings and spending
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {customersLoading && (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            )}
            <Select
              value={limit}
              onValueChange={(val) => {
                setLimit(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="Limit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="15">Top 15</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <AnimatePresence mode="wait">
            {customersLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
                    <tr>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Bookings</th>
                      <th className="px-4 py-3">Total Spent</th>
                      <th className="px-4 py-3">Loyalty Tier</th>
                      <th className="px-4 py-3">Current Points</th>
                      <th className="px-4 py-3">Points to Next Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <TableRowSkeleton key={i} />
                    ))}
                  </tbody>
                </table>
              </motion.div>
            ) : (
              <motion.table
                key="table"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full text-sm text-left"
              >
                <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
                  <tr>
                    <th className="px-4 py-3.5 font-semibold">Customer</th>
                    <th className="px-4 py-3.5 font-semibold">Bookings</th>
                    <th className="px-4 py-3.5 font-semibold">Total Spent</th>
                    <th className="px-4 py-3.5 font-semibold">Loyalty Tier</th>
                    <th className="px-4 py-3.5 font-semibold">
                      Current Points
                    </th>
                    <th className="px-4 py-3.5 font-semibold">
                      Points to Next Tier
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {topCustomers?.map((customer, index) => (
                    <motion.tr
                      key={index}
                      className="hover:bg-muted/30 transition-colors group "
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-card-foreground">
                            {customer.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-medium">{customer.bookings}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-primary">
                          {formatCurrency(customer.spent)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1",
                            customer.loyalty === "PLATINUM"
                              ? "bg-gradient-to-r from-purple-100 to-violet-100 text-purple-700"
                              : customer.loyalty === "GOLD"
                                ? "bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-700 "
                                : customer.loyalty === "SILVER"
                                  ? "bg-gradient-to-r from-gray-100 to-slate-100 text-gray-700 "
                                  : customer.loyalty === "BRONZE"
                                    ? " bg-stone-300 text-yellow-700 "
                                    : customer.loyalty === "Staff"
                                      ? "bg-gradient-to-r from-blue-100 to-sky-100 text-blue-700 "
                                      : "bg-slate-100 text-slate-700 ",
                          )}
                        >
                          {customer.loyalty === "PLATINUM"}
                          {customer.loyalty === "GOLD"}
                          {customer.loyalty === "SILVER"}
                          {customer.loyalty}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-medium">
                        {customer.loyalty === "Staff"
                          ? "-"
                          : (customer.currentPoints?.toLocaleString() ?? 0)}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {customer.loyalty === "Staff" ? (
                          <span className="text-xs text-muted-foreground/50">
                            -
                          </span>
                        ) : customer.nextTierName === "Max Tier" ? (
                          <span className="text-xs font-semibold text-primary flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            Max Tier Reached
                          </span>
                        ) : customer.pointsToNextTier !== null &&
                          customer.pointsToNextTier !== undefined ? (
                          <span className="text-xs">
                            <span className="font-medium">
                              {customer.pointsToNextTier}
                            </span>{" "}
                            to {customer.nextTierName}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">
                            -
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                  {!topCustomers?.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <div className="p-4 bg-muted/50 rounded-full">
                            <Users className="w-8 h-8 text-muted-foreground/50" />
                          </div>
                          <p className="font-medium text-muted-foreground">
                            No customer data available
                          </p>
                          <p className="text-xs text-muted-foreground/70">
                            Customer data will appear once bookings are made
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </motion.table>
            )}
          </AnimatePresence>
        </div>
        {!customersLoading &&
          limit === "all" &&
          meta &&
          meta.totalPages > 1 && (
            <motion.div
              className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-border"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p className="text-sm text-muted-foreground">
                Showing page{" "}
                <span className="font-medium text-foreground">{page}</span> of{" "}
                <span className="font-medium text-foreground">
                  {meta.totalPages}
                </span>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-8"
                >
                  <ChevronRight className="w-4 h-4 rotate-180 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(meta.totalPages, p + 1))
                  }
                  disabled={page === meta.totalPages}
                  className="h-8"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </motion.div>
          )}
      </motion.div>
    </div>
  );
}
