import { useContext } from "react";
import { ManagerDashboardContext } from "../contexts/internal/ManagerDashboardContext";

export function useManagerDashboard() {
  const context = useContext(ManagerDashboardContext);
  if (!context) {
    throw new Error(
      "useManagerDashboard must be used within ManagerDashboardProvider"
    );
  }
  return context;
}
