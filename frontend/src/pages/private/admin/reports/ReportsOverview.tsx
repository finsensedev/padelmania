import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "react-query";
import useNotification from "src/hooks/useNotification";
import { dashboardService } from "src/services/dashboard.service";
import TimeRangePicker, {
  type TimeRangeValue,
  isCustomRangeValid,
} from "src/components/ui/TimeRangePicker";
import KPIStat from "src/components/ui/KPIStat";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
} from "recharts";

const COLORS = ["#2563eb", "#16a34a", "#dc2626", "#f59e0b", "#6b7280"];

const tiles = [
  {
    title: "Revenue",
    description: "Advanced revenue, refunds & performance metrics",
    to: "/admin/reports/revenue",
  },
  {
    title: "Bookings",
    description: "Funnel, conversion and lifecycle analytics",
    to: "/admin/reports/bookings",
  },
  {
    title: "Customers",
    description: "Cohorts, retention & lifetime value",
    to: "/admin/reports/customers",
  },
  {
    title: "Courts",
    description: "Utilization & operational performance",
    to: "/admin/reports/courts",
  },
];

export default function ReportsOverview() {
  const { toaster } = useNotification();
  const [range, setRange] = useState<TimeRangeValue>({
    range: "month",
    compare: true,
  });

  const validRange = isCustomRangeValid(range);

  const { data: kpis, isLoading: kpisLoading } = useQuery(
    ["kpis", range],
    () => dashboardService.getKPIs(range),
    {
      enabled: validRange,
      onError: () => toaster("Failed to load KPIs", { variant: "error" }),
      staleTime: 30_000,
    },
  );

  const { data: revenue } = useQuery(
    ["revenue-advanced-mini", range],
    () => dashboardService.getRevenueAdvanced(range),
    {
      enabled: validRange,
      onError: () =>
        toaster("Failed to load revenue trend", { variant: "error" }),
      staleTime: 30_000,
    },
  );

  const { data: funnel } = useQuery(
    ["booking-funnel-mini", range],
    () => dashboardService.getBookingFunnel(range),
    {
      enabled: validRange,
      onError: () =>
        toaster("Failed to load booking funnel", { variant: "error" }),
      staleTime: 30_000,
    },
  );

  const { data: cohorts } = useQuery(
    ["customer-cohorts-mini", range],
    () => dashboardService.getCustomerCohorts(range),
    {
      enabled: validRange,
      onError: () =>
        toaster("Failed to load customer cohorts", { variant: "error" }),
      staleTime: 30_000,
    },
  );

  const { data: utilization } = useQuery(
    ["court-utilization-mini"],
    () => dashboardService.getCourtUtilization(),
    {
      onError: () =>
        toaster("Failed to load court utilization", { variant: "error" }),
      staleTime: 60_000,
    },
  );

  const pieData = Object.entries(funnel?.counts || {}).map(([name, value]) => ({
    name,
    value: value as number,
  }));

  const cohortSeries = cohorts?.cohorts || [];

  const utilData = Array.isArray(utilization) ? utilization : [];

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground mt-1">
            High-level insights at a glance. Use quick links to deep dive.
          </p>
        </div>
        <TimeRangePicker value={range} onChange={setRange} allowCompare />
      </div>

      {/* Top KPIs - Organized by category: Financial → Customer → Operations */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        {/* Financial Metrics */}
        <KPIStat
          label="Gross Revenue"
          value={kpis?.revenue.gross}
          prefix="KES "
          loading={kpisLoading}
          deltaPct={kpis?.revenue.growthPct ?? null}
          variant="green"
          helpText="Total revenue from completed payments"
        />
        <KPIStat
          label="Net Revenue"
          value={kpis?.revenue.net}
          prefix="KES "
          loading={kpisLoading}
          variant="teal"
          helpText={
            kpis?.revenue.refunds
              ? `Gross minus KES ${kpis.revenue.refunds.toLocaleString()} in refunds`
              : "Gross revenue minus refunds"
          }
        />
        <KPIStat
          label="Avg Booking Value"
          value={kpis?.bookings.avgBookingValue}
          prefix="KES "
          loading={kpisLoading}
          variant="orange"
          helpText="Average revenue per confirmed booking"
        />

        {/* Customer Metrics */}
        <KPIStat
          label="Customer Retention"
          value={kpis?.customers.retentionPct}
          suffix="%"
          loading={kpisLoading}
          variant="blue"
          helpText="% of last period's customers who returned this period"
        />
        <KPIStat
          label="Conversion Rate"
          value={kpis?.bookings.conversionPct}
          suffix="%"
          loading={kpisLoading}
          variant="purple"
          helpText="% of bookings that were confirmed or completed"
        />

        {/* Operations Metrics */}
        <KPIStat
          label="Court Utilization"
          value={kpis?.courts.utilizationPct}
          suffix="%"
          loading={kpisLoading}
          variant="indigo"
          helpText="% of available court time that was booked"
        />
      </div>

      {/* Mini charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Revenue Trend</h2>
            <span className="text-xs text-muted-foreground">Gross vs Net</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenue?.series || []}>
                <defs>
                  <linearGradient id="grossMini" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient id="netMini" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--accent))"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--accent))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border/40"
                />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="gross"
                  stroke="hsl(var(--primary))"
                  fillOpacity={1}
                  fill="url(#grossMini)"
                />
                <Area
                  type="monotone"
                  dataKey="net"
                  stroke="hsl(var(--accent))"
                  fillOpacity={1}
                  fill="url(#netMini)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Booking Funnel</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={110}
                  label
                >
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Cohorts: New vs Active</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cohortSeries}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border/40"
                />
                <XAxis dataKey="cohortMonth" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line dataKey="newCustomers" type="monotone" stroke="#2563eb" />
                <Line
                  dataKey="activeCustomers"
                  type="monotone"
                  stroke="#16a34a"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Per-Court Utilization</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={(
                  utilData as Array<{ name: string; value: number }>
                ).slice(0, 8)}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border/40"
                />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Quick links to deep dive pages */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Deep Dives</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {tiles.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="group rounded-lg border border-border p-4 bg-card hover:shadow-md transition-shadow flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold group-hover:text-primary">
                  {t.title}
                </h3>
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                  View
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-snug flex-1">
                {t.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
