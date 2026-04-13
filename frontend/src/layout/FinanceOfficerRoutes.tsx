import { useSelector } from "react-redux";
import { Navigate, Outlet } from "react-router-dom";
import type { RootState } from "src/redux/store";
import { usePermissions } from "src/hooks/usePermissions";
// Removed AdminHeader for a cleaner FO layout without top-right dropdown
import FinanceOfficerSidebar from "src/components/finance-officer/FinanceOfficerSidebar";

import { Suspense } from "react";
import OutletSettingUp from "src/skeletons/OutletSettingUp";

export default function FinanceOfficerRoutes() {
  const { user } = useSelector((state: RootState) => state.userState);
  const { loading } = usePermissions();

  // Allow SUPER_ADMIN to impersonate / view as well
  if (!user || !["FINANCE_OFFICER", "SUPER_ADMIN"].includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Optional: path-based micro guards (future expansion)
  if (loading) return null;

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* Sidebar - Hidden on mobile, visible on md+ */}
      <FinanceOfficerSidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 w-full md:w-auto">
        <main className="flex-1 overflow-y-auto bg-muted/30">
          <Suspense fallback={<OutletSettingUp />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
