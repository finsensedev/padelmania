// pages/admin/AdminStaffPage.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import {
  Search,
  UserPlus,
  Download,
  Users,
  UserCheck,
  Clock,
  AlertCircle,
  Filter,
  Building,
  Award,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import type { UserFilters as IUserFilters } from "src/types/user.types";
import { userService } from "src/services/user.service";
import useNotification from "src/hooks/useNotification";
import BulkActions from "src/components/admin/BulkActions";
import UserModal from "src/components/admin/modals/UserModal";
import useModal from "src/hooks/useModal";
import StaffTable from "../../../components/admin/StaffTable";
import StaffFilters from "../../../components/admin/StaffFilters";

export default function AdminStaffPage() {
  const { pushModal, popModal } = useModal();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState<IUserFilters>({
    role: "ALL", // Show all staff-like roles by default
    status: "ALL",
    verified: "ALL",
    department: "",
    position: "",
  });
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Fetch staff (users with staff roles)
  const { data, isLoading } = useQuery({
    queryKey: ["staff", searchTerm, filters, currentPage, pageSize],
    queryFn: () =>
      userService.getUsers({
        search: searchTerm,
        ...filters,
        role: filters.role,
        page: currentPage,
        limit: pageSize,
      }),
  });

  const { toaster } = useNotification();

  // Delete staff mutation
  const deleteMutation = useMutation({
    mutationFn: userService.deleteUser,
    onSuccess: () => {
      toaster("Staff member deleted successfully");
      queryClient.invalidateQueries(["staff"]);
      setSelectedUsers([]);
    },
    onError: () => {
      toaster("Failed to delete staff member");
    },
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: userService.bulkUpdate,
    onSuccess: (result) => {
      const count = result.success || result.updatedCount || 0;
      toaster(`${count} staff members updated successfully`, {
        variant: "success",
      });
      queryClient.invalidateQueries(["staff"]);
      setSelectedUsers([]);
    },
    onError: () => {
      toaster("Failed to update staff members", { variant: "error" });
    },
  });

  const handleCreateStaff = () => {
    let modalId = "";
    const handleClose = () => popModal(modalId);
    modalId = pushModal(
      <UserModal
        isOpen={true}
        onClose={handleClose}
        user={null}
        onSuccess={() => {
          queryClient.invalidateQueries(["staff"]);
          handleClose();
        }}
      />
    );
  };

  const handleDeleteStaff = (userId: string) => {
    if (confirm("Are you sure you want to delete this staff member?")) {
      deleteMutation.mutate(userId);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await userService.exportUsers(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `staff-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      toaster("Staff exported successfully");
    } catch (error) {
      console.error(error);
      toaster("Failed to export staff");
    }
  };

  // Staff-specific stats
  const stats = data?.stats || {
    total: 0,
    active: 0,
    verified: 0,
    newThisMonth: 0,
  };

  // Calculate additional staff metrics
  const staffStats = {
    ...stats,
    totalStaff: (data?.users || []).length,
    activeStaff: (data?.users || []).filter((user) => user.isActive).length,
    managers: (data?.users || []).filter((user) => user.role === "MANAGER")
      .length,
    finance: (data?.users || []).filter(
      (user) => user.role === "FINANCE_OFFICER"
    ).length,
    booking: (data?.users || []).filter(
      (user) => user.role === "BOOKING_OFFICER"
    ).length,
    admins: (data?.users || []).filter((user) => user.role === "ADMIN").length,
    onDuty: Math.floor(Math.random() * (data?.users?.length || 0) * 0.7), // Mock data - replace with real attendance
    pendingLeaves: Math.floor(Math.random() * 5) + 1, // Mock data - replace with real leave requests
  };

  const totalPages =
    data?.totalPages || Math.ceil((data?.total || 0) / pageSize) || 1;

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-foreground">
            Staff Management
          </h1>
          <p className="text-muted-foreground">
            Manage staff members, departments, schedules, and performance
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleExport}
            className="px-4 py-2 border border-border rounded-lg flex items-center justify-center gap-2 hover:bg-muted transition-colors text-foreground"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={handleCreateStaff}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors font-medium"
          >
            <UserPlus className="w-4 h-4" />
            Add Staff
          </button>
        </div>
      </div>

      {/* Staff Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Total Staff
              </p>
              <p className="text-xl font-bold text-card-foreground">
                {staffStats.totalStaff.toLocaleString()}
              </p>
            </div>
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            +{staffStats.newThisMonth} this month
          </div>
        </div>

        <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Active Staff
              </p>
              <p className="text-xl font-bold text-card-foreground">
                {staffStats.activeStaff.toLocaleString()}
              </p>
            </div>
            <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <div className="mt-2 text-xs text-green-600">
            {staffStats.totalStaff > 0
              ? (
                  (staffStats.activeStaff / staffStats.totalStaff) *
                  100
                ).toFixed(1)
              : "0"}
            % active rate
          </div>
        </div>

        <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                On Duty Now
              </p>
              <p className="text-xl font-bold text-card-foreground">
                {staffStats.onDuty}
              </p>
            </div>
            <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="mt-2 text-xs text-blue-600">
            {staffStats.totalStaff > 0
              ? ((staffStats.onDuty / staffStats.totalStaff) * 100).toFixed(1)
              : "0"}
            % attendance
          </div>
        </div>

        <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Managers
              </p>
              <p className="text-xl font-bold text-card-foreground">
                {staffStats.managers}
              </p>
            </div>
            <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <Award className="w-4 h-4 text-purple-600" />
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Leadership team
          </div>
        </div>

        <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Finance Officers
              </p>
              <p className="text-xl font-bold text-card-foreground">
                {staffStats.finance}
              </p>
            </div>
            <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center">
              <Building className="w-4 h-4 text-orange-600" />
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Payments team
          </div>
        </div>

        <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Booking Officers
              </p>
              <p className="text-xl font-bold text-card-foreground">
                {staffStats.booking}
              </p>
            </div>
            <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Booking operations
          </div>
        </div>

        <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Pending Leaves
              </p>
              <p className="text-xl font-bold text-card-foreground">
                {staffStats.pendingLeaves}
              </p>
            </div>
            <div className="w-8 h-8 bg-yellow-500/10 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
            </div>
          </div>
          <div className="mt-2 text-xs text-yellow-600">Needs approval</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-card rounded-lg border border-border shadow-sm">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search staff by name, email, department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-2">
              <select
                value={filters.role || "STAFF"}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    role: e.target.value as IUserFilters["role"],
                  })
                }
                className="px-3 py-2 border border-input rounded-lg bg-background text-foreground"
              >
                <option value="ADMIN">Admin</option>
                <option value="MANAGER">Manager</option>
                <option value="FINANCE_OFFICER">Finance Officer</option>
                <option value="BOOKING_OFFICER">Booking Officer</option>
                <option value="MANAGER">Managers</option>
                <option value="ALL">All Staff</option>
              </select>

              <select
                value={filters.status || "ALL"}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    status: e.target.value as IUserFilters["status"],
                  })
                }
                className="px-3 py-2 border border-input rounded-lg bg-background text-foreground"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="SUSPENDED">Suspended</option>
              </select>

              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`px-3 py-2 border rounded-lg flex items-center gap-2 transition-colors ${
                  showAdvancedFilters
                    ? "bg-primary text-primary-foreground"
                    : "border-input bg-background text-foreground hover:bg-muted"
                }`}
              >
                <Filter className="w-4 h-4" />
                Advanced
              </button>
            </div>
          </div>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="mt-4 pt-4 border-t border-border">
              <StaffFilters filters={filters} onFiltersChange={setFilters} />
            </div>
          )}

          {/* Bulk Actions */}
          {selectedUsers.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
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

      {/* Staff Table */}
      <div className="bg-card rounded-lg border border-border shadow-sm">
        <StaffTable
          users={data?.users || []}
          loading={isLoading}
          selectedUsers={selectedUsers}
          onSelectionChange={setSelectedUsers}
          onDeleteUser={handleDeleteStaff}
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
