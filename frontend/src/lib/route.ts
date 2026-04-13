import { ROUTE_PERMISSIONS, ROLE_BASE_PATH } from "src/config/routes.config";
import type { UserRole } from "src/types/user.types";

export function resolvePostLoginPath(
  role: UserRole,
  desiredPath?: string | null
): string {
  const base = ROLE_BASE_PATH[role] ?? "/customer";
  if (!desiredPath) return base;

  const allowed = ROUTE_PERMISSIONS[role] ?? [];

  const isAllowed = allowed.some((route) => desiredPath.startsWith(route));
  return isAllowed ? desiredPath : base;
}
