import { createContext } from "react";
import type { Range } from "src/utils/dateRange";

export type DashboardRange = Range | "CUSTOM";

export interface ManagerDashboardContextType {
  range: DashboardRange;
  setRange: (range: DashboardRange) => void;
  selectedCourt: string;
  setSelectedCourt: (court: string) => void;
  customFrom: string; // YYYY-MM-DD
  customTo: string; // YYYY-MM-DD
  setCustomFrom: (d: string) => void;
  setCustomTo: (d: string) => void;
}

export const ManagerDashboardContext = createContext<
  ManagerDashboardContextType | undefined
>(undefined);
