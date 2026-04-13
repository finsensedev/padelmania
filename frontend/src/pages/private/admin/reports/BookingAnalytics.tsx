import { useState } from "react";
import { useQuery } from "react-query";
import { dashboardService } from "src/services/dashboard.service";
import TimeRangePicker, {
  type TimeRangeValue,
  isCustomRangeValid,
} from "src/components/ui/TimeRangePicker";
import KPIStat from "src/components/ui/KPIStat";
import useNotification from "src/hooks/useNotification";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#2563eb", "#16a34a", "#dc2626", "#f59e0b", "#6b7280"];

export default function BookingAnalytics() {
  const { toaster } = useNotification();
  const [range, setRange] = useState<TimeRangeValue>({ range: "month" });
  const { data, isLoading } = useQuery(
    ["booking-funnel", range],
    () => dashboardService.getBookingFunnel(range),
    {
      enabled: isCustomRangeValid(range),
      onError: () =>
        toaster("Failed to load booking funnel", { variant: "error" }),
    },
  );

  const counts = data?.counts || {};
  const pieData = Object.entries(counts).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Booking Funnel</h1>
          <p className="text-muted-foreground text-sm">
            Track conversion across booking lifecycle and identify friction
            points.
          </p>
        </div>
        <TimeRangePicker value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPIStat
          label="Confirmed Rate"
          value={data?.rates.confirmRate}
          suffix="%"
          loading={isLoading}
          variant="green"
        />
        <KPIStat
          label="Completion Rate"
          value={data?.rates.completionRate}
          suffix="%"
          loading={isLoading}
          variant="blue"
        />
        <KPIStat
          label="Cancellation Rate"
          value={data?.rates.cancellationRate}
          suffix="%"
          loading={isLoading}
          invertTrend
          variant="orange"
        />
        <KPIStat
          label="Refund Rate"
          value={data?.rates.refundRate}
          suffix="%"
          loading={isLoading}
          invertTrend
          variant="purple"
        />
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-2">Lifecycle Distribution</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                outerRadius={130}
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

      <div className="bg-card border border-border rounded-lg p-4 overflow-auto">
        <h2 className="text-lg font-semibold mb-3">Raw Counts</h2>
        <table className="text-sm">
          <tbody>
            {Object.entries(counts).map(([k, v]) => (
              <tr key={k} className="border-t border-border/50">
                <td className="py-1.5 pr-6 font-medium capitalize">
                  {k.replace(/_/g, " ")}
                </td>
                <td className="py-1.5">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
