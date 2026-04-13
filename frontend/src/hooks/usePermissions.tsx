import { createContext, useContext } from "react";
import type { PermissionContextType } from "src/contexts/PermissionProvider";

export const PermissionContext = createContext<
  PermissionContextType | undefined
>(undefined);

export const usePermissions = () => {
  const ctx = useContext(PermissionContext);
  if (!ctx)
    throw new Error("usePermissions must be used within PermissionProvider");
  return ctx;
};
