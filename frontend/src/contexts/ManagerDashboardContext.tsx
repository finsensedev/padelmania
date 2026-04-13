import { useState, type ReactNode } from "react";
import {
  ManagerDashboardContext,
  type DashboardRange,
} from "./internal/ManagerDashboardContext";

/** YYYY-MM-DD for a Date */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ManagerDashboardProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [range, setRange] = useState<DashboardRange>("WEEK");
  const [selectedCourt, setSelectedCourt] = useState<string>("all");

  // Default custom range: 1st of current month → today
  const now = new Date();
  const [customFrom, setCustomFrom] = useState<string>(
    fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [customTo, setCustomTo] = useState<string>(fmtDate(now));

  return (
    <ManagerDashboardContext.Provider
      value={{
        range,
        setRange,
        selectedCourt,
        setSelectedCourt,
        customFrom,
        customTo,
        setCustomFrom,
        setCustomTo,
      }}
    >
      {children}
    </ManagerDashboardContext.Provider>
  );
}
