// pages/admin/AdminCustomersPage.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import {
  Search,
  UserPlus,
  Download,
  Users,
  TrendingUp,
  Calendar,
  Award,
  CreditCard,
  Filter,
  Star,
} from "lucide-react";
import { format } from "date-fns";
import type { UserFilters as IUserFilters } from "src/types/user.types";
import { userService } from "src/services/user.service";
import useNotification from "src/hooks/useNotification";
import BulkActions from "src/components/admin/BulkActions";
import CustomerTable from "src/components/admin/CustomerTable";
import UserModal from "src/components/admin/modals/UserModal";
import useModal from "src/hooks/useModal";

export default function AdminCustomersPage() {
  const { pushModal, popModal } = useModal();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState<IUserFilters>({
    role: "CUSTOMER", // Fixed to customers only
    status: "ALL",
    verified: "ALL",
    membershipTier: "ALL",
  });
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Fetch customers (users with role CUSTOMER)
  const { data, isLoading } = useQuery({
    queryKey: ["customers", searchTerm, filters, currentPage, pageSize],
    queryFn: () =>
      userService.getUsers({
        search: searchTerm,
        ...filters,
        page: currentPage,
        limit: pageSize,
      }),
  });

  const { toaster } = useNotification();

  // Delete customer mutation
  const deleteMutation = useMutation({
    mutationFn: userService.deleteUser,
    onSuccess: () => {
      toaster("Customer deleted successfully");
      queryClient.invalidateQueries(["customers"]);
      setSelectedUsers([]);
    },
    onError: () => {
      toaster("Failed to delete customer");
    },
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: userService.bulkUpdate,
    onSuccess: (result) => {
      const count = result.success || result.updatedCount || 0;
      toaster(`${count} customers updated successfully`, {
        variant: "success",
      });
      queryClient.invalidateQueries(["customers"]);
      setSelectedUsers([]);
    },
    onError: () => {
      toaster("Failed to update customers", { variant: "error" });
    },
  });

  const handleCreateCustomer = () => {
    let modalId = "";
    const handleClose = () => popModal(modalId);
    modalId = pushModal(
      <UserModal
        isOpen={true}
        onClose={handleClose}
        user={null}
        onSuccess={() => {
          queryClient.invalidateQueries(["customers"]);
          handleClose();
        }}
      />
    );
  };

  const handleDeleteCustomer = (userId: string) => {
    if (confirm("Are you sure you want to delete this customer?")) {
      deleteMutation.mutate(userId);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await userService.exportUsers(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `customers-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      toaster("Customers exported successfully");
    } catch (error) {
      console.error(error);
      toaster("Failed to export customers");
    }
  };

  // Customer-specific stats from backend (these are calculated across ALL customers, not just current page)
  const customerStats = {
    total: data?.stats?.total || 0,
    active: data?.stats?.active || 0,
    verified: data?.stats?.verified || 0,
    newThisMonth: data?.stats?.newThisMonth || 0,
    // Backend-calculated metrics for ALL customers matching the filter
    averageSpent: data?.stats?.averageSpent || 0,
    totalSpent: data?.stats?.totalSpent || 0,
    totalBookings: data?.stats?.totalBookings || 0,
    totalLoyaltyPoints: data?.stats?.totalLoyaltyPoints || 0,
    premiumMembers: data?.stats?.premiumMembers || 0,
  };

  const totalPages =
    data?.totalPages || Math.ceil((data?.total || 0) / pageSize) || 1;

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Customer Management
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage customers, memberships, and loyalty programs
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={handleExport}
            className="px-4 py-2 border border-border rounded-lg flex items-center justify-center gap-2 hover:bg-muted hover:border-primary/30 transition-all text-foreground text-sm shadow-sm font-medium"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={handleCreateCustomer}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg flex items-center justify-center gap-2 hover:bg-primary/90 transition-all font-semibold text-sm shadow-md hover:shadow-lg"
          >
            <UserPlus className="w-4 h-4" />
            Add Customer
          </button>
        </div>
      </div>

      {/* Customer Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-card p-3 sm:p-4 rounded-lg border border-border border-l-4 border-l-primary shadow-md hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Total Customers
              </p>
              <p className="text-lg sm:text-2xl font-bold text-foreground">
                {customerStats.total.toLocaleString()}
              </p>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary/10 rounded-xl flex items-center justify-center ring-2 ring-primary/20">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
          </div>
          <div className="mt-2 text-[10px] sm:text-xs text-primary/80 font-medium">
            +{customerStats.newThisMonth} this month
          </div>
        </div>

        <div className="bg-card p-3 sm:p-4 rounded-lg border border-border border-l-4 border-l-success shadow-md hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Active Now
              </p>
              <p className="text-lg sm:text-2xl font-bold text-foreground">
                {customerStats.active.toLocaleString()}
              </p>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-success/10 rounded-xl flex items-center justify-center ring-2 ring-success/20">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-success-foreground" />
            </div>
          </div>
          <div className="mt-2 text-[10px] sm:text-xs text-success-foreground font-semibold">
            {(
              (customerStats.active / (customerStats.total || 1)) *
              100
            ).toFixed(1)}
            % active
          </div>
        </div>

        <div className="bg-card p-3 sm:p-4 rounded-lg border border-border border-l-4 border-l-warning shadow-md hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Premium Members
              </p>
              <p className="text-lg sm:text-2xl font-bold text-foreground">
                {customerStats.premiumMembers}
              </p>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-warning/10 rounded-xl flex items-center justify-center ring-2 ring-warning/20">
              <Award className="w-4 h-4 sm:w-5 sm:h-5 text-warning-foreground" />
            </div>
          </div>
          <div className="mt-2 text-[10px] sm:text-xs text-warning-foreground font-semibold">
            {(
              (customerStats.premiumMembers / (customerStats.total || 1)) *
              100
            ).toFixed(1)}
            % premium
          </div>
        </div>

        <div className="bg-card p-3 sm:p-4 rounded-lg border border-border border-l-4 border-l-info shadow-md hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Avg. Spending
              </p>
              <p className="text-base sm:text-2xl font-bold text-foreground">
                KES {Math.round(customerStats.averageSpent).toLocaleString()}
              </p>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-info/10 rounded-xl flex items-center justify-center ring-2 ring-info/20">
              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
            </div>
          </div>
          <div className="mt-2 text-[10px] sm:text-xs text-muted-foreground font-medium">
            Per customer
          </div>
        </div>

        <div className="bg-card p-3 sm:p-4 rounded-lg border border-border border-l-4 border-l-accent shadow-md hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Loyalty Points
              </p>
              <p className="text-lg sm:text-2xl font-bold text-foreground">
                {customerStats.totalLoyaltyPoints.toLocaleString()}
              </p>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-warning/10 rounded-xl flex items-center justify-center ring-2 ring-warning/20">
              <Star className="w-4 h-4 sm:w-5 sm:h-5 text-warning-foreground" />
            </div>
          </div>
          <div className="mt-2 text-[10px] sm:text-xs text-muted-foreground font-medium">
            Total accumulated
          </div>
        </div>

        <div className="bg-card p-3 sm:p-4 rounded-lg border border-border border-l-4 border-l-primary shadow-md hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                New This Month
              </p>
              <p className="text-lg sm:text-2xl font-bold text-foreground">
                {customerStats.newThisMonth}
              </p>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary/10 rounded-xl flex items-center justify-center ring-2 ring-primary/20">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
          </div>
          <div className="mt-2 text-[10px] sm:text-xs text-muted-foreground font-medium">
            Growth:{" "}
            {customerStats.total > 0
              ? (
                  (customerStats.newThisMonth / customerStats.total) *
                  100
                ).toFixed(1)
              : "0"}
            %
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-card rounded-lg border border-border shadow-md">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row gap-3 sm:gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search customers by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 sm:pl-10 pr-4 py-2 sm:py-2.5 w-full border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground placeholder:text-muted-foreground text-sm shadow-sm"
              />
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-2">
              <select
                value={filters.membershipTier || "ALL"}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    membershipTier: e.target
                      .value as IUserFilters["membershipTier"],
                  })
                }
                className="px-2 sm:px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs sm:text-sm font-medium shadow-sm hover:border-primary/30 transition-colors cursor-pointer"
              >
                <option value="ALL">All Memberships</option>
                <option value="BRONZE">🥉 Bronze</option>
                <option value="SILVER">🥈 Silver</option>
                <option value="GOLD">🥇 Gold</option>
                <option value="PLATINUM">💎 Platinum</option>
                <option value="NONE">No Membership</option>
              </select>

              <select
                value={filters.status || "ALL"}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    status: e.target.value as IUserFilters["status"],
                  })
                }
                className="px-2 sm:px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs sm:text-sm font-medium shadow-sm hover:border-primary/30 transition-colors cursor-pointer"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">✓ Active</option>
                <option value="INACTIVE">○ Inactive</option>
                <option value="SUSPENDED">⊘ Suspended</option>
              </select>

              <select
                value={filters.verified || "ALL"}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    verified: e.target.value as IUserFilters["verified"],
                  })
                }
                className="px-2 sm:px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs sm:text-sm font-medium shadow-sm hover:border-primary/30 transition-colors cursor-pointer"
              >
                <option value="ALL">All Verification</option>
                <option value="VERIFIED">✓ Verified</option>
                <option value="UNVERIFIED">○ Unverified</option>
              </select>

              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`px-2 sm:px-3 py-2 border rounded-lg flex items-center gap-2 transition-all text-xs sm:text-sm font-medium shadow-sm ${
                  showAdvancedFilters
                    ? "bg-primary text-primary-foreground border-primary shadow-md"
                    : "border-input bg-background text-foreground hover:bg-muted hover:border-primary/30"
                }`}
              >
                <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Advanced</span>
              </button>
            </div>
          </div>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border bg-muted/30 rounded-lg p-3 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-foreground mb-1.5">
                    Min Total Spent
                  </label>
                  <input
                    type="number"
                    value={filters.minSpent || ""}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        minSpent: Number(e.target.value) || undefined,
                      })
                    }
                    placeholder="0"
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm shadow-sm focus:ring-2 focus:ring-ring focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-foreground mb-1.5">
                    Max Total Spent
                  </label>
                  <input
                    type="number"
                    value={filters.maxSpent || ""}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        maxSpent: Number(e.target.value) || undefined,
                      })
                    }
                    placeholder="No limit"
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm shadow-sm focus:ring-2 focus:ring-ring focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-foreground mb-1.5">
                    Min Loyalty Points
                  </label>
                  <input
                    type="number"
                    value={filters.minPoints || ""}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        minPoints: Number(e.target.value) || undefined,
                      })
                    }
                    placeholder="0"
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm shadow-sm focus:ring-2 focus:ring-ring focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-foreground mb-1.5">
                    Registration Date
                  </label>
                  <input
                    type="date"
                    value={
                      filters.createdFrom
                        ? format(new Date(filters.createdFrom), "yyyy-MM-dd")
                        : ""
                    }
                    onChange={(e) =>
                      setFilters({ ...filters, createdFrom: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm shadow-sm focus:ring-2 focus:ring-ring focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mt-3 sm:mt-4 flex gap-2">
                <button
                  onClick={() =>
                    setFilters({
                      role: "CUSTOMER",
                      status: "ALL",
                      verified: "ALL",
                      membershipTier: "ALL",
                    })
                  }
                  className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border border-input rounded-lg hover:bg-muted hover:border-destructive/30 transition-all shadow-sm"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}

          {/* Bulk Actions */}
          {selectedUsers.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border bg-primary/5 rounded-lg p-4">
              <BulkActions
                selectedCount={selectedUsers.length}
                onBulkUpdate={(action, value) => {
                  bulkUpdateMutation.mutate({
                    userIds: selectedUsers,
                    action,
                    value,
                  });
                }}
                onClearSelection={() => setSelectedUsers([])}
              />
            </div>
          )}
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-card rounded-lg border border-border shadow-md overflow-hidden">
        <CustomerTable
          users={data?.users || []}
          loading={isLoading}
          selectedUsers={selectedUsers}
          onSelectionChange={setSelectedUsers}
          onDeleteUser={handleDeleteCustomer}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
