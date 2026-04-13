// pages/admin/UserManagement.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import {
  Search,
  UserPlus,
  Download,
  Shield,
  Calendar,
  Users,
  UserCheck,
} from "lucide-react";
import { format } from "date-fns";
import type {
  BulkAction,
  BulkUpdateInput,
  UserFilters as IUserFilters,
} from "src/types/user.types";
import { userService } from "src/services/user.service";
import useNotification from "src/hooks/useNotification";
import BulkActions from "./BulkActions";
import UserFilters from "./UserFilters";
import UserTable from "./UserTable";
import UserModal from "./modals/UserModal";
import useModal from "src/hooks/useModal";
import useTwoFAPrompt from "src/hooks/useTwoFAPrompt";
import { usePermissions } from "src/hooks/usePermissions";

export default function UserManagement() {
  const { pushModal, popModal } = useModal();
  const twoFAPrompt = useTwoFAPrompt();
  const { role } = usePermissions();
  const isSuperAdmin = role === "SUPER_ADMIN";
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState<IUserFilters>({
    role: "ALL",
    status: "ALL",
    verified: "ALL",
    membershipTier: "ALL",
    vip: "ALL",
    tag: "",
  });
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Fetch users
  const { data, isLoading } = useQuery({
    queryKey: ["users", searchTerm, filters, currentPage, pageSize],
    queryFn: () =>
      userService.getUsers({
        search: searchTerm,
        ...filters,
        page: currentPage,
        limit: pageSize,
      }),
  });

  const { toaster } = useNotification();
  const refreshUsers = () => {
    queryClient.invalidateQueries(["users"]);
  };
  // Delete user mutation
  type DeletePayload = { id: string; twoFactorCode?: string };
  const deleteMutation = useMutation({
    mutationFn: async (payload: DeletePayload) =>
      userService.deleteUser(payload.id, {
        twoFactorCode: payload.twoFactorCode,
      }),
    onSuccess: () => {
      toaster("User deleted successfully");
      queryClient.invalidateQueries(["users"]);
      setSelectedUsers([]);
    },
    onError: async (error: unknown, variables) => {
      const err = error as {
        response?: { status?: number; data?: { message?: string } };
        message?: string;
      };
      const msg: string =
        err?.response?.data?.message || err?.message || "Failed to delete user";
      if (
        /two[- ]?factor|2fa/i.test(msg) ||
        /code is required/i.test(msg) ||
        err?.response?.status === 400 ||
        err?.response?.status === 401 ||
        err?.response?.status === 403
      ) {
        const code = await twoFAPrompt({
          title: "Authorize Deletion",
          description:
            "Enter your 6-digit 2FA code to authorize deleting this user.",
          submitLabel: "Authorize",
        });
        if (!code) {
          toaster("Deletion cancelled: 2FA code required", {
            variant: "error",
          });
          return;
        }
        try {
          await userService.deleteUser(variables.id, { twoFactorCode: code });
          toaster("User deleted successfully");
          queryClient.invalidateQueries(["users"]);
          setSelectedUsers([]);
          return;
        } catch (retryErr: unknown) {
          const r = retryErr as {
            response?: { data?: { message?: string } };
            message?: string;
          };
          const retryMsg =
            r?.response?.data?.message || r?.message || "Failed to delete user";
          toaster(retryMsg, { variant: "error" });
          return;
        }
      }
      toaster(msg, { variant: "error" });
    },
  });

  // Bulk update mutation
  type BulkPayload = { data: BulkUpdateInput; twoFactorCode?: string };
  const bulkUpdateMutation = useMutation({
    mutationFn: async (payload: BulkPayload) =>
      userService.bulkUpdate(payload.data, {
        twoFactorCode: payload.twoFactorCode,
      }),
    onSuccess: (result) => {
      const count = result.success || result.updatedCount || 0;
      toaster(`${count} users updated successfully`, { variant: "success" });
      queryClient.invalidateQueries(["users"]);
      setSelectedUsers([]);
    },
    onError: () => {
      toaster("Failed to update users", { variant: "error" });
    },
  });

  const handleCreateUser = () => {
    let modalId = "";
    const handleClose = () => popModal(modalId);
    modalId = pushModal(
      <UserModal
        isOpen={true}
        onClose={handleClose}
        user={null}
        onSuccess={() => {
          queryClient.invalidateQueries(["users"]);
          handleClose();
        }}
      />
    );
  };

  // Viewing user details handled inside UserTable via pushModal

  const handleDeleteUser = (userId: string) => {
    if (confirm("Are you sure you want to delete this user?")) {
      deleteMutation.mutate({ id: userId });
    }
  };

  const handleExport = async () => {
    try {
      const blob = await userService.exportUsers(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `users-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      toaster("Users exported successfully");
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error && error.message.includes("Too many export")
          ? "Too many export requests. Please try again in a bit."
          : "Failed to export users";
      toaster(message, { variant: "error" });
    }
  };

  const stats = data?.stats || {
    total: 0,
    active: 0,
    verified: 0,
    newThisMonth: 0,
  };

  const totalPages =
    data?.totalPages || Math.ceil((data?.total || 0) / pageSize) || 1;

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      {/* Header */}
      <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            User Management
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage all users and their permissions across the platform
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            onClick={handleExport}
            className="px-3 sm:px-4 py-2.5 sm:py-2 border border-border rounded-lg flex items-center justify-center gap-2 hover:bg-muted transition-colors text-foreground text-sm sm:text-base font-medium"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          <button
            onClick={handleCreateUser}
            className="px-3 sm:px-4 py-2.5 sm:py-2 bg-primary text-primary-foreground rounded-lg flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors font-medium text-sm sm:text-base"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-card p-4 sm:p-6 rounded-lg border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1 min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                Total Users
              </p>
              <p className="text-xl sm:text-2xl font-bold text-card-foreground truncate">
                {stats.total}
              </p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>
          </div>
        </div>
        <div className="bg-card p-4 sm:p-6 rounded-lg border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1 min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                Active Users
              </p>
              <p className="text-xl sm:text-2xl font-bold text-card-foreground truncate">
                {stats.active}
              </p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
              <UserCheck className="w-5 h-5 sm:w-6 sm:h-6 text-accent-foreground" />
            </div>
          </div>
        </div>
        <div className="bg-card p-4 sm:p-6 rounded-lg border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1 min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                Verified Users
              </p>
              <p className="text-xl sm:text-2xl font-bold text-card-foreground truncate">
                {stats.verified}
              </p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-secondary/80 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-secondary-foreground" />
            </div>
          </div>
        </div>
        <div className="bg-card p-4 sm:p-6 rounded-lg border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1 min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                New This Month
              </p>
              <p className="text-xl sm:text-2xl font-bold text-card-foreground truncate">
                {stats.newThisMonth}
              </p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-muted rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-card rounded-lg border border-border shadow-sm">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col space-y-4 lg:space-y-0 lg:flex-row lg:gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search users by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 sm:pl-10 pr-4 py-3 sm:py-2.5 w-full border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground placeholder:text-muted-foreground text-sm sm:text-base"
              />
            </div>
            <div className="w-full lg:w-auto">
              <UserFilters filters={filters} onFiltersChange={setFilters} />
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedUsers.length > 0 && (
            <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-border">
              <BulkActions
                selectedCount={selectedUsers.length}
                onBulkUpdate={(action: BulkAction, value?: unknown) => {
                  const data: BulkUpdateInput = {
                    userIds: selectedUsers,
                    action,
                    value,
                  } as BulkUpdateInput;
                  if (action === "softDelete") {
                    (async () => {
                      const code = await twoFAPrompt({
                        title: "Authorize Bulk Delete",
                        description: `Enter your 6-digit 2FA code to authorize soft-deleting ${selectedUsers.length} user(s).`,
                        submitLabel: "Authorize",
                      });
                      if (!code) return;
                      bulkUpdateMutation.mutate({ data, twoFactorCode: code });
                    })();
                  } else {
                    bulkUpdateMutation.mutate({ data });
                  }
                }}
                onClearSelection={() => setSelectedUsers([])}
              />
            </div>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-card rounded-lg border border-border shadow-sm">
        <UserTable
          users={data?.users || []}
          loading={isLoading}
          selectedUsers={selectedUsers}
          onSelectionChange={setSelectedUsers}
          onDeleteUser={handleDeleteUser}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          onRefresh={refreshUsers}
          showFinancialMetrics={isSuperAdmin}
        />
      </div>
    </div>
  );
}
