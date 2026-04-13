/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import {
  Shield,
  Users,
  Lock,
  ChevronRight,
  Search,
  Settings,
  UserPlus,
  Check,
  X,
} from "lucide-react";
import { rolesService } from "src/services/roles.service";
import useNotification from "src/hooks/useNotification";
import useTwoFASession from "src/hooks/useTwoFASession";
import { usePermissions } from "src/hooks/usePermissions";

function AdminRolesPage() {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<
    "overview" | "permissions" | "users"
  >("overview");
  const { toaster } = useNotification();
  const { obtainSession, getSessionInfo } = useTwoFASession();
  const { has, loading: permissionLoading } = usePermissions();
  const canManageRoles = has("roles.manage") || has("permissions.manage");
  // central helper obtaining / reusing session for each secured scope
  const obtain2FASession = async (
    _roleId: string,
    scope: "permissions" | "users" | "updatePermissions"
  ) => obtainSession(scope);

  const queryClient = useQueryClient();

  // Fetch roles
  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ["roles"],
    // Bind/wrap to preserve `this` in service methods
    queryFn: () => rolesService.getRoles(),
    enabled: !permissionLoading && canManageRoles,
  });

  // Fetch selected role details
  const { data: roleDetails } = useQuery({
    queryKey: ["role", selectedRole],
    queryFn: () => rolesService.getRole(selectedRole!),
    enabled: !!selectedRole && !permissionLoading && canManageRoles,
  });

  // Enriched role (with permissions/users after 2FA). We'll manually set it when we do secondary fetch.
  const [enrichedRole, setEnrichedRole] = useState<any | null>(null);

  // Helper to perform enrichment when switching to sensitive tabs.
  const enrichRoleWith2FA = async (tab: "permissions" | "users") => {
    if (!selectedRole || !canManageRoles) return false;
    const session = await obtain2FASession(selectedRole, tab);
    if (!session) return false;
    try {
      const enriched = await rolesService.getRole(selectedRole, {
        twoFactorSession: session,
      });
      setEnrichedRole(enriched);
      return true;
    } catch {
      toaster("Failed to load sensitive role data", { variant: "error" });
      return false;
    }
  };

  // Permissions catalogue (lazy: only after 2FA success). We'll store 2FA code separately per slice.
  const [permissionsData, setPermissionsData] = useState<any | null>(null);
  const [permissionsLoadedSlice, setPermissionsLoadedSlice] = useState<
    number | null
  >(null);

  const loadPermissionsCatalogue = async () => {
    if (!canManageRoles) return;
    const nowSlice = Math.floor(Date.now() / 1000 / 30);
    if (permissionsData && permissionsLoadedSlice === nowSlice) return; // already loaded this slice
    const session = await obtain2FASession(selectedRole!, "permissions");
    if (!session) return;
    try {
      const data = await rolesService.getAllPermissions({
        twoFactorSession: session,
      });
      setPermissionsData(data);
      setPermissionsLoadedSlice(nowSlice);
    } catch {
      toaster("Failed to load permissions catalogue", { variant: "error" });
    }
  };

  // Update role permissions mutation
  const updatePermissionsMutation = useMutation({
    mutationFn: ({
      roleId,
      permissions,
      twoFactorSession,
    }: {
      roleId: string;
      permissions: string[];
      twoFactorSession?: string;
    }) =>
      rolesService.updateRolePermissions(roleId, permissions, {
        twoFactorSession,
      }),
    onSuccess: () => {
      toaster("Permissions updated successfully", { variant: "success" });
      queryClient.invalidateQueries(["role", selectedRole]);
    },
    onError: () => {
      toaster("Failed to update permissions", { variant: "error" });
    },
  });

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      SUPER_ADMIN: "bg-destructive/10 text-destructive border-destructive/20",
      ADMIN: "bg-primary/10 text-primary border-primary/20",
      MANAGER: "bg-accent/10 text-accent-foreground border-accent/20",
      FINANCE_OFFICER:
        "bg-secondary/80 text-secondary-foreground border-secondary",
      BOOKING_OFFICER: "bg-muted text-muted-foreground border-border",
      CUSTOMER: "bg-card text-card-foreground border-border",
    };
    return colors[role] || "bg-muted text-muted-foreground border-border";
  };

  const handlePermissionToggle = async (permission: string) => {
    if (!canManageRoles) {
      toaster("You don't have permission to modify roles", {
        variant: "error",
      });
      return;
    }
    if (!roleDetails || roleDetails.isSystem) {
      toaster("System roles cannot be modified", { variant: "error" });
      return;
    }

    const current = (
      enrichedRole?.permissions ||
      roleDetails.permissions ||
      []
    ).slice();
    const willEnable = !current.includes(permission);
    const nextPermissions = willEnable
      ? [...current, permission]
      : current.filter((p: string) => p !== permission);

    const attempt = async (): Promise<boolean> => {
      const session = await obtain2FASession(
        roleDetails.id,
        "updatePermissions"
      );
      if (!session) return false;
      try {
        await updatePermissionsMutation.mutateAsync({
          roleId: roleDetails.id,
          permissions: nextPermissions,
          twoFactorSession: session,
        });
        // On success fetch fresh enriched role (with same 2FA session if still valid) for accurate state
        try {
          const enriched = await rolesService.getRole(roleDetails.id, {
            twoFactorSession: session,
          });
          setEnrichedRole(enriched);
        } catch {
          /* ignore */
        }
        return true;
      } catch (e: any) {
        if (
          e?.response?.data?.error === "TWO_FACTOR_INVALID" ||
          e?.response?.data?.error === "TWO_FACTOR_REQUIRED"
        ) {
          return false;
        }
        throw e;
      }
    };

    let success = await attempt();
    if (!success) success = await attempt();
    if (!success) {
      toaster("Permission update failed after 2FA attempts", {
        variant: "error",
      });
    }
  };

  const handleAssignUsers = () => {
    if (!selectedRole) return;
    if (!canManageRoles) {
      toaster("You don't have permission to assign users to roles", {
        variant: "error",
      });
      return;
    }

    // This would open a modal to select users to assign
    toaster("User assignment feature coming soon", { variant: "info" });
  };

  if (permissionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center text-muted-foreground text-sm">
          Checking role permissions...
        </div>
      </div>
    );
  }

  if (!canManageRoles) {
    return (
      <div className="p-6 space-y-6 bg-background min-h-screen">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-card-foreground">
            Roles & Permissions
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            You don't have access to manage roles or permissions. Reach out to a
            super admin if you need this capability.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-foreground">
            Roles & Permissions
          </h1>
          <p className="text-muted-foreground">
            Manage user roles and their associated permissions
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roles List */}
        <div className="lg:col-span-1 lg:sticky top-6 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
          <div className="bg-card rounded-lg border border-border shadow-sm">
            <div className="p-4 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search roles..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-2 w-full border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground placeholder:text-muted-foreground text-sm"
                />
              </div>
            </div>
            <div className="divide-y divide-border">
              {rolesLoading ? (
                <div className="p-4 text-center text-muted-foreground">
                  Loading roles...
                </div>
              ) : (
                (Array.isArray(roles) ? roles : [])
                  ?.filter((role) =>
                    role.name.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((role) => (
                    <button
                      key={role.id}
                      onClick={() => {
                        setSelectedRole(role.id);
                        setActiveTab("overview");
                      }}
                      className={`w-full p-4 text-left transition-all duration-150 ${
                        selectedRole === role.id
                          ? "bg-primary/5 border-l-4 border-primary shadow-sm ring-1 ring-primary/20"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <Shield className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-medium text-card-foreground">
                              {role.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className={`px-2 py-0.5 text-xs rounded-full border ${getRoleBadgeColor(
                                  role.id
                                )}`}
                              >
                                {role.id}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {role.userCount || 0} users
                              </span>
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>

        {/* Role Details */}
        <div className="lg:col-span-2">
          {selectedRole && roleDetails ? (
            <div className="bg-card rounded-lg border border-border shadow-sm">
              {/* Role Header */}
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Shield className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-card-foreground">
                        {roleDetails.name}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {roleDetails.description}
                      </p>
                    </div>
                  </div>
                  {/* 2FA session indicator (permissions scope shown if exists) */}
                  {(() => {
                    const info = getSessionInfo?.("permissions");
                    if (!info) return null;
                    const remaining = Math.max(0, info.exp * 1000 - Date.now());
                    const seconds = Math.floor(remaining / 1000);
                    return (
                      <span className="px-3 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                        2FA Active {seconds}s
                      </span>
                    );
                  })()}
                  {roleDetails.isSystem && (
                    <span className="px-3 py-1 text-xs rounded-full bg-muted text-muted-foreground border border-border">
                      System Role
                    </span>
                  )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1">
                  {["overview", "permissions", "users"].map((tab) => (
                    <button
                      key={tab}
                      onClick={async () => {
                        if (tab === "permissions") {
                          const ok = await enrichRoleWith2FA("permissions");
                          if (!ok) return;
                          await loadPermissionsCatalogue();
                        } else if (tab === "users") {
                          const ok = await enrichRoleWith2FA("users");
                          if (!ok) return;
                        }
                        setActiveTab(tab as any);
                      }}
                      className={`px-4 py-2 text-sm font-medium capitalize rounded-lg transition-colors ${
                        activeTab === tab
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-card-foreground hover:bg-muted"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-muted/30 p-4 rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground font-medium">
                            Total Users
                          </span>
                        </div>
                        <p className="text-2xl font-bold text-card-foreground">
                          {roleDetails.userCount || 0}
                        </p>
                      </div>
                      <div className="bg-muted/30 p-4 rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <Lock className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground font-medium">
                            Permissions
                          </span>
                        </div>
                        <p className="text-2xl font-bold text-card-foreground">
                          {
                            (
                              enrichedRole?.permissions ||
                              roleDetails.permissions ||
                              []
                            ).length
                          }
                        </p>
                      </div>
                      <div className="bg-muted/30 p-4 rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <Settings className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground font-medium">
                            Priority
                          </span>
                        </div>
                        <p className="text-2xl font-bold text-card-foreground">
                          {roleDetails.priority}
                        </p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-card-foreground mb-3">
                        Role Information
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            Role ID
                          </span>
                          <span className="text-sm text-card-foreground font-mono">
                            {roleDetails.id}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            Type
                          </span>
                          <span className="text-sm text-card-foreground">
                            {roleDetails.isSystem
                              ? "System Role"
                              : "Custom Role"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            Status
                          </span>
                          <span className="text-sm text-primary">Active</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "permissions" && (
                  <div className="space-y-6">
                    {roleDetails.isSystem && (
                      <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
                        <p className="text-sm text-accent-foreground">
                          System roles have predefined permissions that cannot
                          be modified.
                        </p>
                      </div>
                    )}

                    {permissionsData?.grouped &&
                      Object.entries(permissionsData.grouped).map((entry) => {
                        const [category, perms] = entry as [string, any[]];
                        return (
                          <div key={category}>
                            <h3 className="text-sm font-semibold text-card-foreground mb-3">
                              {category}
                            </h3>
                            <div className="space-y-2">
                              {perms.map((permission: any) => {
                                const isEnabled = (
                                  enrichedRole?.permissions ||
                                  roleDetails.permissions ||
                                  []
                                ).includes(permission.code);
                                return (
                                  <div
                                    key={permission.code}
                                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                          isEnabled
                                            ? "bg-primary/10 text-primary"
                                            : "bg-muted text-muted-foreground"
                                        }`}
                                      >
                                        {isEnabled ? (
                                          <Check className="w-4 h-4" />
                                        ) : (
                                          <X className="w-4 h-4" />
                                        )}
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium text-card-foreground">
                                          {permission.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {permission.code}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() =>
                                        handlePermissionToggle(permission.code)
                                      }
                                      disabled={roleDetails.isSystem}
                                      className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                                        isEnabled
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-muted text-muted-foreground"
                                      } ${
                                        roleDetails.isSystem
                                          ? "opacity-50 cursor-not-allowed"
                                          : "hover:opacity-80"
                                      }`}
                                    >
                                      {isEnabled ? "Enabled" : "Disabled"}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {activeTab === "users" && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-semibold text-card-foreground">
                        Users with this role
                      </h3>
                      <button
                        onClick={handleAssignUsers}
                        className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Assign Users
                      </button>
                    </div>

                    {(enrichedRole?.users || roleDetails.users)?.length > 0 ? (
                      <div className="space-y-2">
                        {(enrichedRole?.users || roleDetails.users)?.map(
                          (user: any) => (
                            <div
                              key={user.id}
                              className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                  <Users className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-card-foreground">
                                    {user.firstName} {user.lastName}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {user.email}
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`px-2 py-1 text-xs rounded-full ${
                                  user.isActive
                                    ? "bg-primary/10 text-primary border border-primary/20"
                                    : "bg-muted text-muted-foreground border border-border"
                                }`}
                              >
                                {user.isActive ? "Active" : "Inactive"}
                              </span>
                            </div>
                          )
                        )}
                        {(enrichedRole?.userCount ??
                          roleDetails.userCount ??
                          0) > 10 && (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            Showing 10 of{" "}
                            {enrichedRole?.userCount ?? roleDetails.userCount}{" "}
                            users
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                          <Users className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          No users assigned to this role
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border shadow-sm p-12">
              <div className="text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-card-foreground mb-2">
                  Select a Role
                </h3>
                <p className="text-sm text-muted-foreground">
                  Choose a role from the list to view and manage its details
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminRolesPage;
