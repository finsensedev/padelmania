import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "src/redux/store";
import { PermissionContext, usePermissions } from "src/hooks/usePermissions";

export type PermissionContextType = {
  role?: string;
  permissions: Set<string>;
  loading: boolean;
  has: (code: string) => boolean;
};

// Manual role-based permission mapping
const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ["*"], // All permissions
  ADMIN: [
    "users.read",
    "users.create",
    "users.update",
    "dashboard.view",
    "settings.view",
  ],
  MANAGER: [
    "bookings.read",
    "bookings.create",
    "bookings.update",
    "bookings.delete",
    "courts.read",
    "courts.create",
    "courts.update",
    "courts.delete",
    "payments.read",
    "payments.refund",
    "reports.view",
    "users.read",
    "users.create",
    "users.update",
    "users.delete",
    "dashboard.view",
    "settings.view",
    "audit.view",
  ],
  FINANCE_OFFICER: [
    "payments.read",
    "payments.refund",
    "bookings.read",
    "reports.view",
    "dashboard.view",
  ],
  BOOKING_OFFICER: [
    "bookings.read",
    "bookings.create",
    "bookings.update",
    "courts.read",
  ],
  CUSTOMER: [],
};

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useSelector((state: RootState) => state.userState);
  const role = user?.role;

  const perms = useMemo(() => {
    if (!role) return new Set<string>();
    const rolePerms = ROLE_PERMISSIONS[role] || [];
    return new Set(rolePerms);
  }, [role]);

  const value = useMemo<PermissionContextType>(
    () => ({
      role,
      permissions: perms,
      loading: false,
      has: (code: string) =>
        role === "SUPER_ADMIN" || perms.has("*") || perms.has(code),
    }),
    [perms, role]
  );

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};

export const RequirePermission: React.FC<{
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ permission, children, fallback = null }) => {
  const { has, loading } = usePermissions();
  if (loading) return null;
  return has(permission) ? <>{children}</> : <>{fallback}</>;
};
