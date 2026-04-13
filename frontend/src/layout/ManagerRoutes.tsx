import { useSelector } from "react-redux";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { RootState } from "src/redux/store";
import { usePermissions } from "src/hooks/usePermissions";
import ManagerSidebar from "src/pages/private/manager/components/ManagerSidebar";
import ManagerHeader from "src/components/manager/ManagerHeader";
import { ROUTE_PERMISSIONS } from "src/config/routes.config";
import SettingUp from "src/skeletons/settingUp";
import { ManagerDashboardProvider } from "src/contexts/ManagerDashboardContext";
import { ActivityFeedProvider } from "src/contexts/ActivityFeedProvider";
import { NotificationCenterProvider } from "src/contexts/NotificationCenterContext";
import useUserVerificationEvents from "src/hooks/useUserVerificationEvents";
import useMaintenanceEmailEvents from "src/hooks/useMaintenanceEmailEvents";
import useMaintenanceEvents from "src/hooks/useMaintenanceEvents";
import { SocketEffectsActivator } from "src/contexts/SocketProvider";
import { Suspense } from "react";
import AdminOutletSettingUp from "src/skeletons/AdminOutletSettingUp";

// Page-level permission guard mapping (granular). These permissions currently
// don't exist on the backend. We keep the structure for future expansion but
// make the enforcement tolerant so managers are not incorrectly blocked.
const PAGE_GUARDS: Array<{ prefix: string; perm: string }> = [
  { prefix: "/manager/bookings", perm: "bookings.read" },
  { prefix: "/manager/courts", perm: "courts.read" },
  { prefix: "/manager/transactions", perm: "payments.read" },
  { prefix: "/manager/reports", perm: "reports.view" },
  { prefix: "/manager/users", perm: "users.read" },
  { prefix: "/manager/loyalty-configuration", perm: "settings.view" },
  { prefix: "/manager/settings", perm: "settings.view" },
  { prefix: "/manager/vouchers", perm: "payments.read" },
  { prefix: "/manager/gift-cards", perm: "payments.read" },
];

export default function ManagerRoutes() {
  const { user } = useSelector((s: RootState) => s.userState);
  const { has, loading, permissions } = usePermissions();
  const location = useLocation();

  // Role check first
  if (user?.role !== "MANAGER") {
    return <Navigate to="/unauthorized" replace />;
  }

  const path = location.pathname;
  const managerAllowed = ROUTE_PERMISSIONS.MANAGER || [];
  const isWithinManagerScope = managerAllowed.some(
    (r) => path === r || path.startsWith(r + "/")
  );
  if (!isWithinManagerScope) {
    return <Navigate to="/manager" replace />; // fallback to base dashboard
  }

  // Only enforce granular permission if we actually got some permissions from backend (avoid false negative when permissions set empty or backend not yet populated)
  const guard = PAGE_GUARDS.find((g) => path.startsWith(g.prefix));
  if (guard) {
    if (loading) {
      return (
        <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
          <SettingUp />
        </div>
      );
    }
    // If permissions set is non-empty and user lacks specific perm AND user is not elevated
    if (permissions.size > 0 && !has(guard.perm)) {
      // allow viewing dashboard but not restricted page
      return <Navigate to="/manager" replace />;
    }
  }

  return (
    <ActivityFeedProvider>
      <NotificationCenterProvider>
        <ManagerDashboardProvider>
          <SocketEffectsActivator />
          <EventHooks />
          <div className="flex h-screen bg-background overflow-hidden">
            {/* Sidebar - Hidden on mobile, visible on md+ */}
            <ManagerSidebar />

            {/* Main content area */}
            <div className="flex-1 flex flex-col min-w-0 w-full md:w-auto">
              <ManagerHeader />
              <main className="flex-1 overflow-y-auto ">
                <Suspense fallback={<AdminOutletSettingUp />}>
                  <Outlet />
                </Suspense>
              </main>
            </div>
          </div>
        </ManagerDashboardProvider>
      </NotificationCenterProvider>
    </ActivityFeedProvider>
  );
}

function EventHooks() {
  useUserVerificationEvents();
  useMaintenanceEmailEvents();
  useMaintenanceEvents();
  return null;
}
