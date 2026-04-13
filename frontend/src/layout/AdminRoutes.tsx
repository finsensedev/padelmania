// layout/AdminRoutes.tsx
import { useSelector } from "react-redux";
import { Navigate, Outlet } from "react-router-dom";
import AdminHeader from "src/components/admin/AdminHeader";
import AdminSidebar from "src/components/admin/AdminSidebar";
import type { RootState } from "src/redux/store";
import { useLocation } from "react-router-dom";
import { usePermissions } from "src/hooks/usePermissions";
import { Suspense } from "react";
import AdminOutletSettingUp from "src/skeletons/AdminOutletSettingUp";

export default function AdminRoutes() {
  const { user } = useSelector((state: RootState) => state.userState);
  const { has, loading } = usePermissions();
  const location = useLocation();
  const role = user?.role;

  // Check if user has admin privileges (including Managers)
  if (!["ADMIN", "SUPER_ADMIN", "MANAGER"].includes(user?.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  const adminRestrictedPrefixes = [
    "/admin/courts",
    "/admin/bookings",
    "/admin/payments",
    "/admin/reports",
  ];

  if (role === "ADMIN") {
    const isRestricted = adminRestrictedPrefixes.some((prefix) =>
      location.pathname.startsWith(prefix)
    );
    if (isRestricted) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  // Page-level RBAC: simple mapping from path prefixes to required permissions
  const guards: Array<{ prefix: string; perm: string }> = [
    { prefix: "/admin/users", perm: "users.read" },
    { prefix: "/admin/courts", perm: "courts.read" },
    { prefix: "/admin/bookings", perm: "bookings.read" },
    { prefix: "/admin/payments/refunds", perm: "payments.refund" },
    { prefix: "/admin/payments", perm: "payments.read" },
    { prefix: "/admin/reports", perm: "reports.view" },
    { prefix: "/admin/audit-logs", perm: "audit.view" },
    { prefix: "/admin/settings", perm: "settings.view" },
  ];

  const required = guards.find((g) => location.pathname.startsWith(g.prefix));
  // Avoid redirecting while permissions are still loading (initial page refresh)
  if (required) {
    if (loading) return null; // or a small loader/skeleton
    if (!has(required.perm)) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader />
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={<AdminOutletSettingUp />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
