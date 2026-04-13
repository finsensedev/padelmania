// src/config/routes.config.ts
import type { UserRole } from "src/types/user.types";

interface RoutePermissions {
  public: string[];
  CUSTOMER: string[];
  STAFF?: string[]; // deprecated legacy staff bucket (removed)
  MANAGER: string[];
  ADMIN: string[];
  SUPER_ADMIN: string[];
  BOOKING_OFFICER?: string[];
  FINANCE_OFFICER?: string[];
}

export const ROUTE_PERMISSIONS: RoutePermissions = {
  // Public routes
  public: [
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/courts",
    "/menu",
    "/about",
    "/contact",
  ],
  CUSTOMER: [
    "/customer",
    "/customer/book-court",
    "/customer/bookings",
    "/customer/restaurant",
    "/customer/cart",
    "/customer/checkout",
    "/customer/orders",
    "/customer/profile",
    "/customer/loyalty",
    "/customer/membership",
  ],

  // Legacy STAFF / KITCHEN_STAFF removed

  MANAGER: [
    "/manager",
    "/manager/bookings",
    "/manager/courts",
    "/manager/transactions",
    "/manager/reports",
    "/manager/users",
    "/manager/loyalty-configuration",
    "/manager/settings",
    "/manager/vouchers",
    "/manager/gift-cards",
  ],

  ADMIN: [
    // Admin routes
    "/admin",
    "/admin/users",
    "/admin/courts",
    "/admin/bookings",
    "/admin/menu",
    "/admin/payments",
    "/admin/payments/gift-cards",
    "/admin/reports",
    "/admin/settings",
    "/admin/audit-logs",
    // Plus all lower-level routes (spread from above)
    "/manager",
    "/manager/staff",
    "/manager/scheduling",
    "/manager/performance",
    "/manager/leaves",
    // legacy staff & kitchen routes removed
  ],

  SUPER_ADMIN: [
    // Super admin can access everything
    "/superadmin",
    "/superadmin/system",
    "/superadmin/database",
    "/superadmin/api",
    "/superadmin/security",
    "/admin",
    "/admin/users",
    "/admin/courts",
    "/admin/bookings",
    "/admin/menu",
    "/admin/payments",
    "/admin/payments/gift-cards",
    "/admin/reports",
    "/admin/settings",
    "/admin/audit-logs",
    "/manager",
    "/manager/staff",
    "/manager/scheduling",
    "/manager/performance",
    "/manager/leaves",
    // legacy staff & kitchen routes removed
  ],
  BOOKING_OFFICER: [
    "/booking-officer",
    "/booking-officer/bookings",
    "/booking-officer/availability",
    "/booking-officer/create",
  ],

  FINANCE_OFFICER: [
    "/finance-officer",
    "/finance-officer/dashboard",
    "/finance-officer/bookings",
    "/finance-officer/transactions",
    "/finance-officer/reconciliation",
    "/finance-officer/refunds",
    "/finance-officer/reports",
    "/finance-officer/analytics",
  ],
};

// Base path per role to use for default redirects
export const ROLE_BASE_PATH: Record<UserRole, string> = {
  CUSTOMER: "/customer",
  BOOKING_OFFICER: "/booking-officer",
  FINANCE_OFFICER: "/finance-officer",

  MANAGER: "/manager",
  ADMIN: "/admin",
  SUPER_ADMIN: "/admin",
};
