import { useState } from "react";
import { useQuery } from "react-query";
import { dashboardService } from "src/services/dashboard.service";
import TimeRangePicker, {
  type TimeRangeValue,
  isCustomRangeValid,
} from "src/components/ui/TimeRangePicker";
import KPIStat from "src/components/ui/KPIStat";
import useNotification from "src/hooks/useNotification";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";

export default function RevenueReport() {
  const { toaster } = useNotification();
  const [range, setRange] = useState<TimeRangeValue>({
    range: "month",
    compare: true,
  });

  const { data, isLoading } = useQuery(
    ["revenue-advanced", range],
    () => dashboardService.getRevenueAdvanced(range),
    {
      enabled: isCustomRangeValid(range),
      onError: () =>
        toaster("Failed to load revenue analytics", { variant: "error" }),
    },
  );

  const { data: refunds } = useQuery(
    ["refunds", range],
    () => dashboardService.getRefunds(range),
    {
      enabled: isCustomRangeValid(range),
      onError: () => toaster("Failed to load refunds", { variant: "error" }),
    },
  );

  const fmt = (v?: number) => (v ?? 0).toLocaleString();

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Revenue Analytics</h1>
          <p className="text-muted-foreground text-sm">
            Gross vs net revenue, refund impact & booking value trends.
          </p>
        </div>
        <TimeRangePicker value={range} onChange={setRange} allowCompare />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPIStat
          label="Gross Revenue"
          value={data?.aggregates.gross}
          prefix="KES "
          loading={isLoading}
          deltaPct={
            data?.previous
              ? ((data.aggregates.gross -
                  (data.previous.aggregates.gross || 0)) /
                  (data.previous.aggregates.gross || 1)) *
                100
              : null
          }
          variant="green"
        />
        <KPIStat
          label="Net Revenue"
          value={data?.aggregates.net}
          prefix="KES "
          loading={isLoading}
          variant="teal"
        />
        <KPIStat
          label="Refunds"
          value={data?.aggregates.refunds}
          prefix="KES "
          loading={isLoading}
          invertTrend
          deltaPct={data?.aggregates.refundRatePct}
          helpText="Refund rate%"
          variant="orange"
        />
        <KPIStat
          label="Avg Booking Value"
          value={
            data?.aggregates.gross && data?.aggregates.gross > 0
              ? Math.round(
                  (data.aggregates.gross /
                    (data.aggregates.net
                      ? data.aggregates.net
                      : data.aggregates.gross)) *
                    100,
                ) / 100
              : null
          }
          prefix="KES "
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-card border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Revenue Trend</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.series || []}>
                <defs>
                  <linearGradient id="gross" x1="0" y1="0" x2="0" y2="1">
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
                  <linearGradient id="net" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#gross)"
                />
                <Area
                  type="monotone"
                  dataKey="net"
                  stroke="hsl(var(--accent))"
                  fillOpacity={1}
                  fill="url(#net)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Refunds Distribution</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={refunds?.refunds || []}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border/40"
                />
                <XAxis dataKey="bookingCode" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="amount"
                  name="Refunded"
                  fill="hsl(var(--destructive))"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 overflow-auto">
        <h2 className="text-lg font-semibold mb-3">Series Data</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Gross</th>
              <th className="py-2 pr-4">Net</th>
              <th className="py-2 pr-4">Refunds</th>
              <th className="py-2 pr-4">Bookings</th>
              <th className="py-2 pr-4">Avg Value</th>
            </tr>
          </thead>
          <tbody>
            {(data?.series || []).map((row) => (
              <tr key={row.date} className="border-t border-border/50">
                <td className="py-1.5 pr-4 font-mono">{row.date}</td>
                <td className="py-1.5 pr-4">{fmt(row.gross)}</td>
                <td className="py-1.5 pr-4">{fmt(row.net)}</td>
                <td className="py-1.5 pr-4">{fmt(row.refunds)}</td>
                <td className="py-1.5 pr-4">{fmt(row.bookings)}</td>
                <td className="py-1.5 pr-4">{fmt(row.avgBookingValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
