import { useQuery } from "react-query";
import { dashboardService } from "src/services/dashboard.service";
import KPIStat from "src/components/ui/KPIStat";
import useNotification from "src/hooks/useNotification";
import { useState } from "react";
import TimeRangePicker, {
  type TimeRangeValue,
  isCustomRangeValid,
} from "src/components/ui/TimeRangePicker";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function CourtPerformance() {
  const { toaster } = useNotification();
  const [range, setRange] = useState<TimeRangeValue>({ range: "month" });
  // reuse existing utilization endpoint (basic) & KPIs for overall utilization
  const validRange = isCustomRangeValid(range);

  const { data: utilData, isLoading } = useQuery(
    ["court-utilization", range],
    () => dashboardService.getCourtUtilization(),
    {
      enabled: validRange,
      onError: () =>
        toaster("Failed to load court utilization", { variant: "error" }),
    },
  );
  const { data: kpis } = useQuery(
    ["kpis", range],
    () => dashboardService.getKPIs(range),
    {
      enabled: validRange,
      onError: () => toaster("Failed to load KPIs", { variant: "error" }),
    },
  );

  type UtilRow = { courtName?: string; utilization?: number };
  const utilization: UtilRow[] = Array.isArray(utilData)
    ? (utilData as unknown as UtilRow[])
    : [];

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Court Performance</h1>
          <p className="text-muted-foreground text-sm">
            Utilization trends, hours per court & peak hour detection.
          </p>
        </div>
        <TimeRangePicker value={range} onChange={setRange} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPIStat
          label="Utilization"
          value={kpis?.courts.utilizationPct}
          suffix="%"
          loading={isLoading}
          variant="teal"
        />
        <KPIStat
          label="Avg Hours/Court"
          value={kpis?.courts.avgHoursPerCourt?.toFixed?.(1)}
          loading={isLoading}
          variant="purple"
        />
        <KPIStat
          label="Peak Hour"
          value={kpis?.courts.peakHour || "—"}
          loading={isLoading}
          variant="blue"
        />
        <KPIStat
          label="Courts Tracked"
          value={utilization.length}
          loading={isLoading}
          variant="indigo"
        />
      </div>
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-2">
          Per-Court Utilization (approx)
        </h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={utilization}>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border/40"
              />
              <XAxis dataKey="courtName" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="utilization" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
