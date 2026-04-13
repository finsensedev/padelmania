import { lazy } from "react";
import { Route, Routes } from "react-router-dom";

import AdminRoutes from "./layout/AdminRoutes";
import BookingOfficerRoutes from "./layout/BookingOfficerRoutes";
import CustomerRoutes from "./layout/CustomerRoutes";
import FinanceOfficerRoutes from "./layout/FinanceOfficerRoutes";
import ManagerRoutes from "./layout/ManagerRoutes";
import PrivateRoutes from "./layout/PrivateRoutes";
import PublicRoutes from "./layout/PublicRoutes";

import NotFoundPage from "./pages/NotFound";
import Unauthorized from "./pages/Unauthorized";

// Public Pages
const CommingSoon = lazy(() => import("./pages/public/CommingSoon"));
const TermsAndConditions = lazy(
  () => import("./pages/public/TermsAndConditions"),
);
const ForgotPassword = lazy(() => import("./pages/public/ForgotPassword"));
const Login = lazy(() => import("./pages/public/Login"));
const Register = lazy(() => import("./pages/public/Register"));
const ResetPassword = lazy(() => import("./pages/public/ResetPassword"));
const VerifyEmail = lazy(() => import("./pages/public/VerifyEmail"));

// Admin Pages
const AdminAuditLogs = lazy(
  () => import("./pages/private/admin/AdminAuditLogs"),
);
const AdminBookingCalendar = lazy(
  () => import("./pages/private/admin/AdminBookingCalendar"),
);
const AdminBookingCancellations = lazy(
  () => import("./pages/private/admin/AdminBookingCancellations"),
);
const AdminBookingManagement = lazy(
  () => import("./pages/private/admin/AdminBookingManagement"),
);
const AdminCourtAvailability = lazy(
  () => import("./pages/private/admin/AdminCourtAvailability"),
);
const AdminCourtMaintenance = lazy(
  () => import("./pages/private/admin/AdminCourtMaintenance"),
);
const AdminCourtManagement = lazy(
  () => import("./pages/private/admin/AdminCourtManagement"),
);
const AdminCourtPricing = lazy(
  () => import("./pages/private/admin/AdminCourtPricing"),
);
const AdminBallTypes = lazy(
  () => import("./pages/private/admin/AdminBallTypes"),
);
const AdminCustomersPage = lazy(
  () => import("./pages/private/admin/AdminCustomersPage"),
);
const AdminDashboard = lazy(
  () => import("./pages/private/admin/AdminDashboard"),
);
const AdminProfile = lazy(() => import("./pages/private/admin/AdminProfile"));
const AdminVoucherManagement = lazy(
  () => import("./pages/private/admin/AdminVoucherManagement"),
);
const AdminGiftCardManagement = lazy(
  () => import("./pages/private/admin/AdminGiftCardManagement.tsx"),
);
const BookingAnalytics = lazy(
  () => import("./pages/private/admin/reports/BookingAnalytics"),
);
const CourtPerformance = lazy(
  () => import("./pages/private/admin/reports/CourtPerformance"),
);
const CustomerAnalytics = lazy(
  () => import("./pages/private/admin/reports/CustomerAnalytics"),
);
const PaymentsRefundsPage = lazy(
  () => import("./pages/private/admin/PaymentsRefunds"),
);
const PaymentsTransactionsPage = lazy(
  () => import("./pages/private/admin/PaymentsTransactions"),
);
const ReportsOverview = lazy(
  () => import("./pages/private/admin/reports/ReportsOverview"),
);
const RevenueReport = lazy(
  () => import("./pages/private/admin/reports/RevenueReport"),
);

// Admin Components
import UserManagement from "./components/admin/UserManagement";

// Customer Pages
const BookCourt = lazy(() => import("./pages/private/customer/BookCourt"));
const CustomerDashboard = lazy(
  () => import("./components/customer/CustomerDashboard"),
);
const LoyaltyPoints = lazy(
  () => import("./pages/private/customer/LoyaltyPoints"),
);
const MyBookings = lazy(() => import("./pages/private/customer/MyBookings"));
const Profile = lazy(() => import("./pages/private/customer/Profile"));
const GiftCardsPage = lazy(() => import("./pages/private/customer/GiftCards"));
// const RentEquipment = lazy(
//   () => import("./pages/private/customer/RentEquipment"),
// );
// const CustomerShop = lazy(() => import("./pages/private/customer/Shop"));

// Booking Officer Pages
const BookingOfficerAvailability = lazy(
  () => import("./pages/private/booking-officer/BookingOfficerAvailability"),
);
const BookingOfficerBookings = lazy(
  () => import("./pages/private/booking-officer/BookingOfficerBookings"),
);
const BookingOfficerCreateBooking = lazy(
  () => import("./pages/private/booking-officer/BookingOfficerCreateBooking"),
);
const BookingOfficerDashboard = lazy(
  () => import("./pages/private/booking-officer/BookingOfficerDashboard"),
);

// Finance Officer Pages
const FinanceOfficerDashboard = lazy(
  () => import("./pages/private/finance-officer/FinanceOfficerDashboard"),
);
const FinanceOfficerBookings = lazy(
  () => import("./pages/private/finance-officer/FinanceOfficerBookings"),
);
const FinanceOfficerTransactions = lazy(
  () => import("./pages/private/finance-officer/FinanceOfficerTransactions"),
);
const FinanceOfficerRefunds = lazy(
  () => import("./pages/private/finance-officer/FinanceOfficerRefunds"),
);
const FinanceOfficerReports = lazy(
  () => import("./pages/private/finance-officer/FinanceOfficerReports"),
);
const FinanceOfficerAnalytics = lazy(
  () => import("./pages/private/finance-officer/FinanceOfficerAnalytics"),
);
const FinanceOfficerSecurity = lazy(
  () => import("./pages/private/finance-officer/FinanceOfficerSecurity"),
);

// Manager Pages
const ManagerBookings = lazy(() => import("./pages/private/manager/Bookings"));
const ManagerCourts = lazy(() => import("./pages/private/manager/Courts"));
const ManagerDashboard = lazy(
  () => import("./pages/private/manager/Dashboard"),
);
const ManagerCalendar = lazy(() => import("./pages/private/manager/Calendar"));
const ManagerAvailability = lazy(
  () => import("./pages/private/manager/AvailabilitySlots.tsx"),
);
const ManagerReports = lazy(() => import("./pages/private/manager/Reports"));
const ManagerSettings = lazy(() => import("./pages/private/manager/Settings"));
const LoyaltyConfiguration = lazy(
  () => import("./pages/private/manager/LoyaltyConfiguration"),
);
const BookingSettings = lazy(
  () => import("./pages/private/manager/BookingSettings"),
);
const ManagerTransactions = lazy(
  () => import("./pages/private/manager/ManagerTransactions"),
);
const ManagerUsers = lazy(() => import("./pages/private/manager/Users"));
// const CategoryManagement = lazy(
//   () => import("./pages/private/manager/shop/CategoryManagement")
// );
// const ProductManagement = lazy(
//   () => import("./pages/private/manager/shop/ProductManagement")
// );
// const InventoryManagement = lazy(
//   () => import("./pages/private/manager/shop/InventoryManagement")
// );
// const ProductForm = lazy(
//   () => import("./pages/private/manager/shop/ProductForm")
// );

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route element={<PublicRoutes />}>
        <Route index element={<CommingSoon />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/forgot" element={<ForgotPassword />} />{" "}
        {/* backward compatibility */}
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
      </Route>

      {/* Private Routes */}
      <Route element={<PrivateRoutes />}>
        {/* Customer Routes */}
        <Route path="/customer" element={<CustomerRoutes />}>
          <Route index element={<CustomerDashboard />} />
          <Route path="book-court" element={<BookCourt />} />
          <Route path="bookings" element={<MyBookings />} />
          {/* <Route path="rent-equipment" element={<RentEquipment />} /> */}
          {/* <Route path="shop" element={<CustomerShop />} /> */}
          <Route path="loyalty" element={<LoyaltyPoints />} />
          <Route path="gift-cards" element={<GiftCardsPage />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin" element={<AdminRoutes />}>
          <Route index element={<AdminDashboard />} />
          <Route path="users">
            <Route index element={<UserManagement />} />
            <Route path="customers" element={<AdminCustomersPage />} />
          </Route>
          <Route path="courts">
            <Route index element={<AdminCourtManagement />} />
            <Route path="availability" element={<AdminCourtAvailability />} />
            <Route path="maintenance" element={<AdminCourtMaintenance />} />
            <Route path="pricing" element={<AdminCourtPricing />} />
          </Route>
          <Route path="equipment">
            <Route path="ball-types" element={<AdminBallTypes />} />
          </Route>
          <Route path="bookings">
            <Route index element={<AdminBookingManagement />} />
            <Route path="calendar" element={<AdminBookingCalendar />} />
            <Route
              path="cancellations"
              element={<AdminBookingCancellations />}
            />
          </Route>
          <Route path="payments">
            <Route index element={<PaymentsTransactionsPage />} />
            <Route path="refunds" element={<PaymentsRefundsPage />} />
            <Route path="vouchers" element={<AdminVoucherManagement />} />
            <Route path="gift-cards" element={<AdminGiftCardManagement />} />
          </Route>
          <Route path="reports">
            <Route index element={<ReportsOverview />} />
            <Route path="revenue" element={<RevenueReport />} />
            <Route path="bookings" element={<BookingAnalytics />} />
            <Route path="customers" element={<CustomerAnalytics />} />
            <Route path="courts" element={<CourtPerformance />} />
          </Route>
          <Route path="audit-logs" element={<AdminAuditLogs />} />
          <Route path="settings" element={<AdminProfile />} />
          <Route path="*" element={<NotFoundPage isPublicRoute />} />
        </Route>

        {/* Manager Routes */}
        <Route path="/manager" element={<ManagerRoutes />}>
          <Route index element={<ManagerDashboard />} />
          <Route path="users" element={<ManagerUsers />} />
          <Route path="calendar" element={<ManagerCalendar />} />
          <Route path="bookings" element={<ManagerBookings />} />
          <Route path="availability" element={<ManagerAvailability />} />
          <Route path="courts" element={<ManagerCourts />} />
          <Route path="transactions" element={<ManagerTransactions />} />
          <Route path="reports" element={<ManagerReports />} />
          <Route
            path="loyalty-configuration"
            element={<LoyaltyConfiguration />}
          />
          <Route path="settings" element={<ManagerSettings />} />
          <Route path="booking-settings" element={<BookingSettings />} />
          <Route path="vouchers" element={<AdminVoucherManagement />} />
          <Route path="gift-cards" element={<AdminGiftCardManagement />} />

          {/* Shop Management Routes */}
          {/* <Route path="shop/categories" element={<CategoryManagement />} />
          <Route path="shop/products" element={<ProductManagement />} />
          <Route path="shop/products/new" element={<ProductForm />} />
          <Route path="shop/products/:id" element={<ProductForm />} />
          <Route path="shop/inventory" element={<InventoryManagement />} /> */}
        </Route>

        {/* Booking Officer Routes */}
        <Route path="/booking-officer" element={<BookingOfficerRoutes />}>
          <Route index element={<BookingOfficerDashboard />} />
          <Route path="bookings" element={<BookingOfficerBookings />} />
          <Route path="availability" element={<BookingOfficerAvailability />} />
          <Route path="create" element={<BookingOfficerCreateBooking />} />
        </Route>

        {/* Finance Officer Routes */}
        <Route path="/finance-officer" element={<FinanceOfficerRoutes />}>
          <Route index element={<FinanceOfficerDashboard />} />
          <Route path="bookings" element={<FinanceOfficerBookings />} />
          <Route path="transactions" element={<FinanceOfficerTransactions />} />
          <Route path="refunds" element={<FinanceOfficerRefunds />} />
          <Route path="reports" element={<FinanceOfficerReports />} />
          <Route path="analytics" element={<FinanceOfficerAnalytics />} />
          <Route path="security" element={<FinanceOfficerSecurity />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Error / Access Routes */}
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Catch all for public 404 */}
      <Route path="*" element={<NotFoundPage isPublicRoute />} />
    </Routes>
  );
}

export default App;
