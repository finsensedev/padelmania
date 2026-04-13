import { useSelector } from "react-redux";
import { Navigate, Outlet } from "react-router-dom";
import type { RootState } from "src/redux/store";
import { usePermissions } from "src/hooks/usePermissions";
import AdminHeader from "src/components/admin/AdminHeader"; // reuse header styling
import BookingOfficerSidebar from "src/components/booking-officer/BookingOfficerSidebar"; // minimal sidebar
import { Suspense } from "react";
import AdminOutletSettingUp from "src/skeletons/AdminOutletSettingUp";

export default function BookingOfficerRoutes() {
  const { user } = useSelector((state: RootState) => state.userState);
  const { loading } = usePermissions();

  // Allow SUPER_ADMIN to impersonate / view as well
  if (!user || !["BOOKING_OFFICER", "SUPER_ADMIN"].includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Optional: path-based micro guards (future expansion)
  if (loading) return null;

  return (
    <div className="flex h-[100dvh] overflow-auto">
      <BookingOfficerSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader title="Padel Mania" subtitle="Booking Officer Portal" />
        <main className="flex-1 overflow-y-auto">
          <Suspense
            fallback={
              <div className="h-[100dvh] w-full flex items-center justify-center ">
                <AdminOutletSettingUp />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
