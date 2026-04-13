/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery } from "react-query";
import {
  Users,
  Calendar,
  CreditCard,
  Activity,
  ShoppingBag,
  Clock,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  RefreshCw,
} from "lucide-react";
import { FaMoneyBillWave } from "react-icons/fa";

import { format } from "date-fns";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { dashboardService } from "src/services/dashboard.service";
import useNotification from "src/hooks/useNotification";
import { usePermissions } from "src/hooks/usePermissions";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { toaster } = useNotification();
  const [selectedPeriod, setSelectedPeriod] = useState<
    "day" | "week" | "month" | "custom"
  >("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [isRefreshing, setIsRefreshing] = useState(false);

  const { role, has, loading: permissionsLoading } = usePermissions();
  const isSuperAdmin = role === "SUPER_ADMIN";
  const canViewCoreStats = isSuperAdmin || has("dashboard.view");

  // Fetch dashboard data with real API calls
  const {
    data: stats,
    isLoading: statsLoading,
    isFetching: statsFetching,
    refetch: refetchStats,
  } = useQuery(["dashboard-stats"], () => dashboardService.getStats(), {
    enabled: canViewCoreStats,
    refetchInterval: canViewCoreStats ? 60000 : false, // Refresh every minute
    onError: () => {
      toaster("Failed to load dashboard statistics", { variant: "error" });
    },
  });

  const isCustomValid =
    selectedPeriod !== "custom" ||
    (!!customFrom && !!customTo && customFrom <= customTo);

  const { data: revenueChart, refetch: refetchRevenue } = useQuery(
    ["revenue-chart", selectedPeriod, customFrom, customTo],
    () => {
      let days: number;
      if (selectedPeriod === "custom" && customFrom && customTo) {
        days = Math.max(
          Math.ceil(
            (new Date(customTo).getTime() - new Date(customFrom).getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1,
          1,
        );
      } else {
        days =
          selectedPeriod === "day" ? 7 : selectedPeriod === "week" ? 30 : 90;
      }
      return dashboardService.getRevenueChart(days);
    },
    {
      enabled: isSuperAdmin && isCustomValid,
      onError: () => {
        toaster("Failed to load revenue chart", { variant: "error" });
      },
    },
  );

  const { data: hourlyBookings, refetch: refetchHourly } = useQuery(
    ["hourly-bookings"],
    () => dashboardService.getHourlyBookings(),
    {
      enabled: isSuperAdmin,
      onError: () => {
        toaster("Failed to load hourly bookings", { variant: "error" });
      },
    },
  );

  const { data: courtUtilization, refetch: refetchCourts } = useQuery(
    ["court-utilization"],
    () => dashboardService.getCourtUtilization(),
    {
      enabled: isSuperAdmin,
      onError: () => {
        toaster("Failed to load court utilization", { variant: "error" });
      },
    },
  );

  const { data: recentActivities, refetch: refetchActivities } = useQuery(
    ["recent-activities"],
    () => dashboardService.getRecentActivities(),
    {
      enabled: isSuperAdmin,
      refetchInterval: isSuperAdmin ? 30000 : false, // Refresh every 30 seconds
      onError: () => {
        toaster("Failed to load recent activities", { variant: "error" });
      },
    },
  );

  const { data: topCustomersResponse, refetch: refetchCustomers } = useQuery(
    ["top-customers"],
    () => dashboardService.getTopCustomers(),
    {
      enabled: isSuperAdmin,
      onError: () => {
        toaster("Failed to load top customers", { variant: "error" });
      },
    },
  );

  const topCustomers = topCustomersResponse?.data;

  // // Update clock
  // useEffect(() => {
  //   const timer = setInterval(() => {
  //     setCurrentTime(new Date());
  //   }, 1000);
  //   return () => clearInterval(timer);
  // }, []);

  // Manual refresh function
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const refreshers: Array<Promise<unknown>> = [];
      if (canViewCoreStats) refreshers.push(refetchStats());
      if (isSuperAdmin) {
        refreshers.push(
          refetchRevenue(),
          refetchHourly(),
          refetchCourts(),
          refetchActivities(),
          refetchCustomers(),
        );
      }

      if (refreshers.length) {
        await Promise.all(refreshers);
      }
      toaster("Dashboard refreshed successfully", { variant: "success" });
    } catch (error) {
      console.error(error);
      toaster("Failed to refresh dashboard", { variant: "error" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString()}`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "booking":
        return <Calendar className="w-4 h-4" />;
      case "payment":
        return <CreditCard className="w-4 h-4" />;
      case "order":
        return <ShoppingBag className="w-4 h-4" />;
      case "customer":
        return <Users className="w-4 h-4" />;
      case "staff":
        return <Clock className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const isLoading =
    permissionsLoading ||
    statsLoading ||
    statsFetching ||
    (canViewCoreStats && !stats);

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 bg-background min-h-screen">
        {/* Header Skeleton */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 md:gap-4">
          <div className="space-y-2">
            <div className="h-7 md:h-9 w-48 md:w-64 bg-muted rounded-lg animate-pulse"></div>
            <div className="h-4 md:h-5 w-60 md:w-80 bg-muted rounded-lg animate-pulse"></div>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <div className="h-8 md:h-10 w-8 md:w-10 bg-muted rounded-lg animate-pulse"></div>
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-8 md:h-10 w-20 md:w-24 bg-muted rounded-lg animate-pulse"
                ></div>
              ))}
            </div>
          </div>
        </div>

        {/* Key Metrics Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm"
            >
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-muted rounded-lg animate-pulse"></div>
                <div className="h-5 md:h-6 w-14 md:w-16 bg-muted rounded-lg animate-pulse"></div>
              </div>
              <div className="h-7 md:h-8 w-28 md:w-32 bg-muted rounded-lg animate-pulse mb-2"></div>
              <div className="h-3 md:h-4 w-20 md:w-24 bg-muted rounded-lg animate-pulse"></div>
              <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-border">
                <div className="flex justify-between">
                  <div className="h-3 md:h-4 w-16 md:w-20 bg-muted rounded-lg animate-pulse"></div>
                  <div className="h-3 md:h-4 w-12 md:w-16 bg-muted rounded-lg animate-pulse"></div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Section Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Large Chart Skeleton */}
          <div className="lg:col-span-2 bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm">
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <div className="space-y-2">
                <div className="h-5 md:h-6 w-28 md:w-32 bg-muted rounded-lg animate-pulse"></div>
                <div className="h-3 md:h-4 w-40 md:w-48 bg-muted rounded-lg animate-pulse"></div>
              </div>
              <div className="h-3 md:h-4 w-20 md:w-24 bg-muted rounded-lg animate-pulse"></div>
            </div>
            <div className="h-[200px] md:h-[300px] bg-muted rounded-lg animate-pulse"></div>
          </div>

          {/* Side Panel Skeleton */}
          <div className="bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm">
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <div className="space-y-2">
                <div className="h-5 md:h-6 w-28 md:w-32 bg-muted rounded-lg animate-pulse"></div>
                <div className="h-3 md:h-4 w-32 md:w-40 bg-muted rounded-lg animate-pulse"></div>
              </div>
            </div>
            <div className="space-y-3 md:space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="h-3 md:h-4 w-16 md:w-20 bg-muted rounded-lg animate-pulse"></div>
                    <div className="h-3 md:h-4 w-10 md:w-12 bg-muted rounded-lg animate-pulse"></div>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Section Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Large Chart Skeleton */}
          <div className="lg:col-span-2 bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm">
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <div className="space-y-2">
                <div className="h-5 md:h-6 w-28 md:w-32 bg-muted rounded-lg animate-pulse"></div>
                <div className="h-3 md:h-4 w-40 md:w-48 bg-muted rounded-lg animate-pulse"></div>
              </div>
            </div>
            <div className="h-[200px] md:h-[250px] bg-muted rounded-lg animate-pulse"></div>
          </div>

          {/* Activity List Skeleton */}
          <div className="bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm">
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <div className="h-5 md:h-6 w-28 md:w-32 bg-muted rounded-lg animate-pulse"></div>
            </div>
            <div className="space-y-3 md:space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-start gap-2 md:gap-3">
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-muted rounded-lg animate-pulse flex-shrink-0"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-3 md:h-4 w-full bg-muted rounded-lg animate-pulse"></div>
                    <div className="h-2 md:h-3 w-3/4 bg-muted rounded-lg animate-pulse"></div>
                    <div className="h-2 md:h-3 w-14 md:w-16 bg-muted rounded-lg animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Table Skeleton */}
        <div className="bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 md:mb-6 gap-3 sm:gap-0">
            <div className="space-y-2">
              <div className="h-5 md:h-6 w-28 md:w-32 bg-muted rounded-lg animate-pulse"></div>
              <div className="h-3 md:h-4 w-40 md:w-48 bg-muted rounded-lg animate-pulse"></div>
            </div>
            <div className="h-3 md:h-4 w-16 md:w-20 bg-muted rounded-lg animate-pulse"></div>
          </div>
          <div className="space-y-2 md:space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-2 md:gap-4">
                <div className="w-7 h-7 md:w-8 md:h-8 bg-muted rounded-full animate-pulse flex-shrink-0"></div>
                <div className="flex-1 h-3 md:h-4 bg-muted rounded-lg animate-pulse"></div>
                <div className="w-12 md:w-16 h-3 md:h-4 bg-muted rounded-lg animate-pulse"></div>
                <div className="w-16 md:w-24 h-3 md:h-4 bg-muted rounded-lg animate-pulse"></div>
                <div className="w-16 md:w-20 h-5 md:h-6 bg-muted rounded-full animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!canViewCoreStats) {
    const quickActions = [
      {
        title: "Manage Users",
        description:
          "Review staff and customer records and invite new team members when needed.",
        action: () => navigate("/admin/users"),
        icon: <Users className="w-5 h-5 text-primary" />,
      },
      {
        title: "Customer Directory",
        description:
          "Browse customer profiles, loyalty tiers, and usage history in one place.",
        action: () => navigate("/admin/users/customers"),
        icon: <Calendar className="w-5 h-5 text-primary" />,
      },
      {
        title: "Need deeper insights?",
        description:
          "Ask a super admin for exported reports or an analytics walkthrough when required.",
        action: () => navigate("/admin/settings"),
        icon: <Target className="w-5 h-5 text-primary" />,
      },
    ];

    return (
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-card-foreground">
            Dashboard overview (limited)
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            You're signed in as an administrator. Operational analytics,
            revenue, and booking trend visualisations are reserved for super
            admins. You can still access everyday tools below or request a
            report from a super admin when needed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {quickActions.map((item) => (
            <button
              key={item.title}
              onClick={item.action}
              className="text-left bg-card border border-border rounded-xl p-5 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-primary/10 rounded-lg">{item.icon}</div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-card-foreground">
                {item.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {item.description}
              </p>
            </button>
          ))}
        </div>

        <div className="bg-muted/40 border border-dashed border-border rounded-xl p-6">
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Want full analytics?
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Full revenue, booking, and performance dashboards require elevated
            privileges. Reach out to a super admin to request temporary access
            or a scheduled performance briefing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Dashboard Overview
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Real-time insights into Padel Mania operations
          </p>
        </div>

        {/* Actions - Stack on mobile */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 sm:p-2.5 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50 self-start sm:self-auto"
            title="Refresh Dashboard"
          >
            <RefreshCw
              className={`w-5 h-5 text-muted-foreground ${
                isRefreshing ? "animate-spin" : ""
              }`}
            />
          </button>

          {/* Period Selector - Horizontal scroll on mobile */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {["day", "week", "month", "custom"].map((period) => (
              <button
                key={period}
                onClick={() => {
                  setSelectedPeriod(period as any);
                  if (period === "custom" && !customFrom) {
                    const now = new Date();
                    setCustomFrom(
                      new Date(now.getFullYear(), now.getMonth(), 1)
                        .toISOString()
                        .slice(0, 10),
                    );
                    setCustomTo(now.toISOString().slice(0, 10));
                  }
                }}
                className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  selectedPeriod === period
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card text-card-foreground hover:bg-muted border border-border"
                }`}
              >
                {period === "custom"
                  ? "Custom"
                  : `This ${period.charAt(0).toUpperCase() + period.slice(1)}`}
              </button>
            ))}
          </div>

          {/* Custom date range inputs */}
          {selectedPeriod === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                className={`px-2 py-1.5 text-sm border rounded-lg bg-card ${
                  !customFrom ? "border-destructive" : "border-border"
                }`}
                value={customFrom}
                max={customTo || new Date().toISOString().slice(0, 10)}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  if (customTo && e.target.value > customTo)
                    setCustomTo(e.target.value);
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
                  setCustomTo(e.target.value);
                  if (customFrom && e.target.value < customFrom)
                    setCustomFrom(e.target.value);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-3 md:gap-4">
        {/* Revenue Card */}
        <div className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-green-500 to-green-600 text-white p-4 md:p-6 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="p-2.5 bg-white/20 rounded-lg">
                <FaMoneyBillWave className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <span
                className={`text-xs md:text-sm font-semibold flex items-center gap-1 px-2 py-1 rounded-full bg-white/20 text-white`}
              >
                {Number(stats?.revenue.growth) > 0 ? (
                  <ArrowUpRight className="w-3 h-3 md:w-4 md:h-4" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 md:w-4 md:h-4" />
                )}
                {Math.abs(Number(stats?.revenue.growth) || 0)}%
              </span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">
              {formatCurrency(stats?.revenue.today || 0)}
            </p>
            <p className="text-xs md:text-sm text-white/90 mt-1 font-medium">
              Today's Revenue
            </p>
            <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-white/30">
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-white/90 font-medium">This Week</span>
                <span className="font-bold text-white truncate ml-2">
                  {formatCurrency(stats?.revenue.thisWeek || 0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bookings Card */}
        <div className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white p-4 md:p-6 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="p-2.5 bg-white/20 rounded-lg">
                <Calendar className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <span className="text-xs md:text-sm font-semibold px-2 py-1 bg-white/20 text-white rounded-full">
                {stats?.bookings.occupancyRate}% full
              </span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">
              {stats?.bookings.today}
            </p>
            <p className="text-xs md:text-sm text-white/90 mt-1 font-medium">
              Today's Bookings
            </p>
            <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-white/30">
              <div className="flex gap-3 md:gap-4 text-xs md:text-sm">
                <div className="flex items-center gap-1.5 bg-white/10 px-2 py-1 rounded-full">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                  <span className="text-white/90 font-medium">Confirmed</span>
                  <span className="font-bold text-white">
                    {stats?.bookings.confirmed}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-white/10 px-2 py-1 rounded-full">
                  <div className="w-2 h-2 bg-white/70 rounded-full"></div>
                  <span className="text-white/90 font-medium">Pending</span>
                  <span className="font-bold text-white">
                    {stats?.bookings.pending}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Customers Card */}
        <div className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white p-4 md:p-6 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="p-2.5 bg-white/20 rounded-lg">
                <Users className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <span
                className={`text-xs md:text-sm font-semibold flex items-center gap-1 px-2 py-1 rounded-full bg-white/20 text-white`}
              >
                {Number(stats?.customers.growthRate) > 0 ? (
                  <ArrowUpRight className="w-3 h-3 md:w-4 md:h-4" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 md:w-4 md:h-4" />
                )}
                {Math.abs(Number(stats?.customers.growthRate) || 0)}%
              </span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-white">
              {stats?.customers.total}
            </p>
            <p className="text-xs md:text-sm text-white/90 mt-1 font-medium">
              Total Customers
            </p>
            <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-white/30">
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-white/90 font-medium">New Today</span>
                <span className="font-bold text-white bg-white/10 px-2 py-0.5 rounded-full">
                  +{stats?.customers.new}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Orders Card (removed with restaurant module) */}
        {stats?.orders && (
          <div className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-orange-500 to-orange-600 text-white p-4 md:p-6 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <div className="p-2.5 bg-white/20 rounded-lg">
                  <ShoppingBag className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs md:text-sm font-semibold px-2 py-1 bg-white/20 text-white rounded-full">
                    {stats?.orders?.pending} pending
                  </span>
                </div>
              </div>
              <p className="text-2xl md:text-3xl font-bold text-white">
                {stats?.orders?.today}
              </p>
              <p className="text-xs md:text-sm text-white/90 mt-1 font-medium">
                Restaurant Orders
              </p>
              <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-white/30">
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-white/90 font-medium">
                    Order Revenue
                  </span>
                  <span className="font-bold text-white truncate ml-2">
                    {formatCurrency(stats?.orders?.revenue || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Revenue Trend Chart */}
        <div className="lg:col-span-2 bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 md:mb-6">
            <div>
              <h3 className="text-base md:text-lg font-semibold text-card-foreground">
                Revenue Trend
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Last{" "}
                {selectedPeriod === "day"
                  ? "7 days"
                  : selectedPeriod === "week"
                    ? "30 days"
                    : selectedPeriod === "custom" && customFrom && customTo
                      ? `${customFrom} – ${customTo}`
                      : "90 days"}{" "}
                performance
              </p>
            </div>
            <button
              onClick={() => navigate("/admin/reports/revenue")}
              className="text-xs md:text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1 self-start sm:self-auto transition-colors"
            >
              View Details
              <ChevronRight className="w-3 h-3 md:w-4 md:h-4" />
            </button>
          </div>
          <div className="w-full overflow-x-auto">
            <ResponsiveContainer width="100%" height={250} minWidth={300}>
              <AreaChart data={revenueChart || []}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-chart-1)"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-chart-1)"
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-muted-foreground)"
                  opacity={0.2}
                />
                <XAxis
                  dataKey="date"
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border)" }}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border)" }}
                  tickFormatter={(value) => `${value / 1000}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                  labelStyle={{
                    color: "var(--color-popover-foreground)",
                    fontWeight: 600,
                  }}
                  itemStyle={{
                    color: "var(--color-chart-1)",
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-chart-1)"
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Court Utilization */}
        <div className="bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <div>
              <h3 className="text-base md:text-lg font-semibold text-card-foreground">
                Court Utilization
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Today's performance
              </p>
            </div>
            <Target className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
          </div>
          <div className="space-y-3 md:space-y-4">
            {courtUtilization?.map((court) => (
              <div key={court.name}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-card-foreground">
                    {court.name}
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">
                    {court.value}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-2.5 rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${court.value}%`,
                      backgroundColor: court.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 md:mt-6 pt-3 md:pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs md:text-sm font-medium text-muted-foreground">
                Average Utilization
              </span>
              <span className="text-lg md:text-xl font-bold text-primary">
                {Math.round(
                  (courtUtilization?.reduce((acc, c) => acc + c.value, 0) ||
                    0) / (courtUtilization?.length || 1),
                )}
                %
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Hourly Bookings */}
        <div className="lg:col-span-2 bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <div>
              <h3 className="text-base md:text-lg font-semibold text-card-foreground">
                Bookings by Hour
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Today's booking distribution
              </p>
            </div>
            <Clock className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
          </div>
          <div className="w-full overflow-x-auto">
            <ResponsiveContainer width="100%" height={200} minWidth={300}>
              <BarChart data={hourlyBookings || []}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-muted-foreground)"
                  opacity={0.2}
                />
                <XAxis
                  dataKey="hour"
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border)" }}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border)" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                  labelStyle={{
                    color: "var(--color-popover-foreground)",
                    fontWeight: 600,
                  }}
                  itemStyle={{
                    color: "var(--color-chart-2)",
                  }}
                  cursor={{ fill: "var(--color-muted)", opacity: 0.2 }}
                />
                <Bar
                  dataKey="bookings"
                  fill="var(--color-chart-2)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activities */}
        <div className="bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h3 className="text-base md:text-lg font-semibold text-card-foreground">
              Recent Activity
            </h3>
            <Activity className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
          </div>
          <div className="space-y-3 md:space-y-4 max-h-[250px] md:max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent pr-2">
            {recentActivities?.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-all hover:shadow-sm"
              >
                <div className="p-2 bg-muted rounded-lg flex-shrink-0">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm font-semibold text-card-foreground truncate">
                    {activity.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {activity.description}
                  </p>
                  <p className="text-[10px] md:text-xs text-muted-foreground/60 mt-1 font-medium">
                    {format(activity.time, "HH:mm")}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate("/admin/courts")}
            className="w-full mt-3 md:mt-4 pt-3 md:pt-4 border-t border-border text-xs md:text-sm text-primary hover:text-primary/80 font-medium transition-colors"
          >
            View All Activity →
          </button>
        </div>
      </div>

      {/* Top Customers Table */}
      <div className="bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 md:mb-6 gap-3 sm:gap-0">
          <div>
            <h3 className="text-base md:text-lg font-semibold text-card-foreground">
              Top Customers
            </h3>
            <p className="text-xs md:text-sm text-muted-foreground">
              Most active customers this month
            </p>
          </div>
          <button
            onClick={() => navigate("/admin/users/customers")}
            className="text-xs md:text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
          >
            View All
            <ChevronRight className="w-3 h-3 md:w-4 md:h-4" />
          </button>
        </div>
        <div className="overflow-x-auto -mx-4 md:mx-0 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="text-left py-3 md:py-3.5 px-3 md:px-4 text-xs md:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Customer
                </th>
                <th className="text-left py-3 md:py-3.5 px-3 md:px-4 text-xs md:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Bookings
                </th>
                <th className="text-left py-3 md:py-3.5 px-3 md:px-4 text-xs md:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Total Spent
                </th>
                <th className="text-left py-3 md:py-3.5 px-3 md:px-4 text-xs md:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Loyalty Tier
                </th>
              </tr>
            </thead>
            <tbody>
              {topCustomers?.map((customer, index) => (
                <tr
                  key={index}
                  className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                >
                  <td className="py-3 md:py-3.5 px-3 md:px-4">
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="w-8 h-8 md:w-9 md:h-9 bg-primary/10 ring-1 ring-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-xs md:text-sm font-semibold text-primary">
                          {customer.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </span>
                      </div>
                      <span className="text-xs md:text-sm font-semibold text-card-foreground truncate">
                        {customer.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 md:py-3.5 px-3 md:px-4 text-xs md:text-sm font-medium text-card-foreground">
                    {customer.bookings}
                  </td>
                  <td className="py-3 md:py-3.5 px-3 md:px-4 text-xs md:text-sm font-semibold text-primary whitespace-nowrap">
                    {formatCurrency(customer.spent)}
                  </td>
                  <td className="py-3 md:py-3.5 px-3 md:px-4">
                    <span
                      className={`inline-flex items-center px-2 md:px-2.5 py-1 md:py-1.5 rounded-full text-[10px] md:text-xs font-semibold ${
                        customer.loyalty === "GOLD" ||
                        customer.loyalty === "Gold"
                          ? "bg-warning/10 text-warning ring-1 ring-warning/20"
                          : customer.loyalty === "SILVER" ||
                              customer.loyalty === "Silver"
                            ? "bg-muted text-muted-foreground ring-1 ring-border"
                            : customer.loyalty === "PLATINUM" ||
                                customer.loyalty === "Platinum"
                              ? "bg-accent/10 text-accent ring-1 ring-accent/20"
                              : "bg-destructive/10 text-destructive ring-1 ring-destructive/20"
                      }`}
                    >
                      {customer.loyalty}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
