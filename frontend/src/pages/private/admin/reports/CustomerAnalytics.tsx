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
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

export default function CustomerAnalytics() {
  const { toaster } = useNotification();
  const [range, setRange] = useState<TimeRangeValue>({ range: "year" });
  const { data, isLoading } = useQuery(
    ["customer-cohorts", range],
    () => dashboardService.getCustomerCohorts(range),
    {
      enabled: isCustomRangeValid(range),
      onError: () =>
        toaster("Failed to load customer cohorts", { variant: "error" }),
    },
  );

  const cohorts = data?.cohorts || [];
  const dist = data?.distribution?.lifetimeBookings || [];
  const lv = data?.distribution?.lifetimeValue;

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Customer Analytics</h1>
          <p className="text-muted-foreground text-sm">
            Cohorts, retention activity & lifetime value distribution.
          </p>
        </div>
        <TimeRangePicker value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPIStat
          label="P50 LTV"
          value={lv?.p50}
          prefix="KES "
          loading={isLoading}
          variant="purple"
        />
        <KPIStat
          label="P75 LTV"
          value={lv?.p75}
          prefix="KES "
          loading={isLoading}
          variant="teal"
        />
        <KPIStat
          label="P90 LTV"
          value={lv?.p90}
          prefix="KES "
          loading={isLoading}
          variant="green"
        />
        <KPIStat
          label="Max LTV"
          value={lv?.max}
          prefix="KES "
          loading={isLoading}
          variant="orange"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Cohort New vs Active</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cohorts}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border/40"
                />
                <XAxis dataKey="cohortMonth" />
                <YAxis />
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
        <div className="bg-card border border-border rounded-lg p-4 overflow-auto">
          <h2 className="text-lg font-semibold mb-2">
            Lifetime Bookings Distribution
          </h2>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Bucket</th>
                <th className="py-2 pr-4">Users</th>
              </tr>
            </thead>
            <tbody>
              {dist.map((b: { bucket: string; count: number }) => (
                <tr key={b.bucket} className="border-t border-border/50">
                  <td className="py-1.5 pr-4">{b.bucket}</td>
                  <td className="py-1.5 pr-4">{b.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-card border border-border rounded-lg p-4 overflow-auto">
        <h2 className="text-lg font-semibold mb-2">
          Top Customers (Net Spend)
        </h2>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Net Spend</th>
            </tr>
          </thead>
          <tbody>
            {(data?.topCustomers || []).map((c) => (
              <tr
                key={c.userId || c.name}
                className="border-t border-border/50"
              >
                <td className="py-1.5 pr-4">{c.name}</td>
                <td className="py-1.5 pr-4">
                  KES {c.netSpend.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
