import { useState } from "react";
import { useQuery } from "react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Users as UsersIcon,
  MoreVertical,
  AlertTriangle,
  CheckSquare,
  X,
  UserCheck,
  UserX,
  Trash2,
  Power,
  PowerOff,
  Download,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Badge } from "src/components/ui/badge";
import { Checkbox } from "src/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "src/components/ui/alert-dialog";
import useNotification from "src/hooks/useNotification";
import useModal from "src/hooks/useModal";
import { userService } from "src/services/user.service";
import { useWithTwoFAExport } from "src/utils/withTwoFAExport";
import type {
  UserRole,
  BulkAction,
  GetUsersParams,
} from "src/types/user.types";

// We will reuse GetUsersParams; extra transient fields (verified) are already part of UserFilters

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive?: boolean;
  createdAt?: string;
  phone?: string;
  emailVerified?: boolean;
  lastLogin?: string;
}

export default function ManagerUsers() {
  const { toaster } = useNotification();
  const { pushModal } = useModal();
  const [searchTerm, setSearchTerm] = useState("");
  // statusFilter values: ALL | VERIFIED | PENDING | INACTIVE
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: [
      "manager-users",
      searchTerm,
      statusFilter,
      roleFilter,
      currentPage,
      pageSize,
    ],
    queryFn: async () => {
      // Map UI status to backend params
      // Backend understands: ACTIVE, INACTIVE, PENDING (custom we added), plus verified filter
      let backendStatus: string | undefined = undefined;
      let verifiedParam: string | undefined = undefined;

      switch (statusFilter) {
        case "VERIFIED":
          backendStatus = "ACTIVE"; // ensure active users
          verifiedParam = "VERIFIED"; // emailVerified = true
          break;
        case "PENDING":
          backendStatus = "PENDING"; // maps to isActive true & emailVerified false server-side
          break;
        case "INACTIVE":
          backendStatus = "INACTIVE"; // isActive false
          break;
        default:
          backendStatus = undefined; // ALL
      }

      const params: GetUsersParams = {
        page: currentPage,
        limit: pageSize,
        search: searchTerm || undefined,
        // Cast to string to allow extended backend values like PENDING while maintaining type safety downstream
        status: backendStatus as unknown as GetUsersParams["status"],
        verified: verifiedParam as unknown as GetUsersParams["verified"],
        role: roleFilter === "ALL" ? undefined : (roleFilter as UserRole),
      };

      const resp = await userService.getUsers(params);

      interface UsersResp {
        users?: UserRow[];
        total?: number;
        pagination?: { pages: number };
      }
      const response = resp as UsersResp;
      const list: UserRow[] = response.users || [];

      // Filter out admin roles for manager view
      const sanitized = list.filter(
        (u) => !["ADMIN", "SUPER_ADMIN"].includes(u.role)
      );

      return {
        users: sanitized,
        total: response.total || 0, // Keep the original total from backend
        pagination: response.pagination || { pages: 1 },
      };
    },
    keepPreviousData: true,
  });

  const with2FA = useWithTwoFAExport();

  // Selection handlers
  const handleSelectUser = (userId: string, checked: boolean) => {
    const newSelection = new Set(selectedUsers);
    if (checked) {
      newSelection.add(userId);
    } else {
      newSelection.delete(userId);
    }
    setSelectedUsers(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedUsers.size === (data?.users?.length || 0)) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(data?.users?.map((user) => user.id) || []));
    }
  };

  const clearSelection = () => {
    setSelectedUsers(new Set());
  };

  // Bulk actions
  const handleBulkAction = async (action: BulkAction) => {
    const userIds = Array.from(selectedUsers);
    if (userIds.length === 0) {
      toaster("No users selected", { variant: "error" });
      return;
    }

    await with2FA(
      async (sessionToken) => {
        try {
          switch (action) {
            case "activate":
              await userService.bulkUpdate(
                { userIds, action: "activate" },
                { twoFactorCode: sessionToken }
              );
              toaster(`${userIds.length} users activated`, {
                variant: "success",
              });
              break;
            case "deactivate":
              await userService.bulkUpdate(
                { userIds, action: "deactivate" },
                { twoFactorCode: sessionToken }
              );
              toaster(`${userIds.length} users deactivated`, {
                variant: "success",
              });
              break;
            case "softDelete":
              await userService.bulkUpdate(
                { userIds, action: "softDelete" },
                { twoFactorCode: sessionToken }
              );
              toaster(`${userIds.length} users soft deleted`, {
                variant: "success",
              });
              break;
          }
          clearSelection();
          refetch();
        } catch {
          toaster(`Failed to ${action} users`, { variant: "error" });
        }
      },
      {
        cacheKey: `bulk-${action}-${userIds.join(",")}`,
        useResultCache: false,
      }
    );
  };

  const handleToggleActive = async (user: UserRow) => {
    await with2FA(
      async (sessionToken) => {
        try {
          await userService.setActive(user.id, !user.isActive, {
            twoFactorCode: sessionToken,
          });
          toaster(`User ${user.isActive ? "deactivated" : "activated"}`, {
            variant: "success",
          });
          refetch();
        } catch {
          toaster(
            `Failed to ${user.isActive ? "deactivate" : "activate"} user`,
            { variant: "error" }
          );
        }
      },
      {
        cacheKey: `toggle-user-${user.id}`,
        useResultCache: false,
      }
    );
  };

  const handleDeleteUser = async (user: UserRow) => {
    await with2FA(
      async (sessionToken) => {
        try {
          await userService.deleteUser(user.id, {
            twoFactorCode: sessionToken,
          });
          toaster("User soft deleted successfully", { variant: "success" });
          refetch();
        } catch {
          toaster("Failed to soft delete user", { variant: "error" });
        }
      },
      {
        cacheKey: `delete-user-${user.id}`,
        useResultCache: false,
      }
    );
  };

  const getStatusBadge = (user: UserRow) => {
    if (!user.isActive) {
      return (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-destructive/10 text-destructive border border-destructive/20">
          Inactive
        </span>
      );
    }

    if (user.emailVerified) {
      return (
        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-500/10 text-green-800 dark:text-green-400 border border-green-400 dark:border-green-500/20">
          Verified
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-100 dark:bg-yellow-500/10 text-yellow-800 dark:text-yellow-400 border border-yellow-400 dark:border-yellow-500/20">
        Pending
      </span>
    );
  };
  const getRoleColor = (role: string) => {
    switch (role) {
      case "MANAGER":
        return "bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-400 border-blue-400 dark:border-blue-500/20";
      case "BOOKING_OFFICER":
        return "bg-purple-100 dark:bg-purple-500/10 text-purple-800 dark:text-purple-400 border-purple-400 dark:border-purple-500/20";
      case "FINANCE_OFFICER":
        return "bg-orange-100 dark:bg-orange-500/10 text-orange-800 dark:text-orange-400 border-orange-400 dark:border-orange-500/20";
      case "CUSTOMER":
        return "bg-green-100 dark:bg-green-500/10 text-green-800 dark:text-green-400 border-green-400 dark:border-green-500/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleExport = async () => {
    await with2FA(
      async (sessionToken) => {
        setIsExporting(true);
        try {
          // Map UI status to backend params (same as query)
          let backendStatus: string | undefined = undefined;
          let verifiedParam: string | undefined = undefined;

          switch (statusFilter) {
            case "VERIFIED":
              backendStatus = "ACTIVE";
              verifiedParam = "VERIFIED";
              break;
            case "PENDING":
              backendStatus = "PENDING";
              break;
            case "INACTIVE":
              backendStatus = "INACTIVE";
              break;
            default:
              backendStatus = undefined;
          }

          const filters = {
            search: searchTerm || undefined,
            status: backendStatus as "ACTIVE" | "INACTIVE" | undefined,
            verified: verifiedParam as "VERIFIED" | "UNVERIFIED" | undefined,
            role: roleFilter === "ALL" ? undefined : (roleFilter as UserRole),
          };

          const blob = await userService.exportUsers(filters, "csv", {
            twoFactorCode: sessionToken,
          });

          // Create download link
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `users-export-${
            new Date().toISOString().split("T")[0]
          }.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);

          toaster("Users exported successfully", { variant: "success" });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to export users";
          toaster(errorMessage, { variant: "error" });
        } finally {
          setIsExporting(false);
        }
      },
      {
        cacheKey: "export-users",
        useResultCache: false,
      }
    );
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-4 md:p-6">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            User Management
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            View and manage system users and their permissions
          </p>
        </div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            variant="outline"
            className="flex items-center gap-2"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {isExporting ? "Exporting..." : "Export CSV"}
            </span>
          </Button>
        </motion.div>
      </motion.div>

      {/* Top Row: Stats Card and Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6">
        {/* Stats Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow p-6 rounded-xl h-full">
            <div className="relative z-10">
              <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="text-sm font-medium text-white drop-shadow-sm">
                  Total Users
                </div>
                <UsersIcon className="h-4 w-4 text-white drop-shadow-sm" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white drop-shadow-md">
                  {data?.total || 0}
                </div>
                <p className="text-xs text-white/95 drop-shadow-sm">
                  Excluding admin users
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="sm:col-span-2 lg:col-span-1"
        >
          <Card className="h-full shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                Search
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or phone..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Status Filter */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Card className="h-full shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="focus:ring-2 focus:ring-primary/20">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="VERIFIED">Verified</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </motion.div>

        {/* Role Filter */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <Card className="h-full shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <UsersIcon className="h-4 w-4 text-primary" />
                Role
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={roleFilter}
                onValueChange={(value) => {
                  setRoleFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="focus:ring-2 focus:ring-primary/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Roles</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="BOOKING_OFFICER">
                    Booking Officer
                  </SelectItem>
                  <SelectItem value="FINANCE_OFFICER">
                    Finance Officer
                  </SelectItem>
                  <SelectItem value="CUSTOMER">Customer</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedUsers.size > 0 && (
          <motion.div
            className="p-3 md:p-4 bg-primary/10 border border-primary/30 rounded-lg shadow-md"
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {selectedUsers.size} user{selectedUsers.size !== 1 ? "s" : ""}{" "}
                  selected
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    onClick={() => handleBulkAction("activate")}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 font-medium"
                  >
                    <UserCheck className="w-3 h-3 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Activate</span>
                  </Button>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    onClick={() => handleBulkAction("deactivate")}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 font-medium"
                  >
                    <UserX className="w-3 h-3 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Deactivate</span>
                  </Button>
                </motion.div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1.5 font-medium border-destructive/50 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                        <span className="hidden sm:inline">Delete</span>
                      </Button>
                    </motion.div>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                        Soft Delete Selected Users
                      </AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <p>
                          Are you sure you want to soft delete{" "}
                          {selectedUsers.size} user
                          {selectedUsers.size !== 1 ? "s" : ""}?
                        </p>
                        <p className="text-xs text-muted-foreground">
                          This will mark the user
                          {selectedUsers.size !== 1 ? "s" : ""} as deleted but
                          preserve the data in the system. This action requires
                          2FA verification to proceed.
                        </p>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleBulkAction("softDelete")}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Soft Delete Users
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    onClick={clearSelection}
                    variant="ghost"
                    size="sm"
                    className="hover:bg-destructive/10"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Users Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.5 }}
      >
        <Card className="overflow-hidden shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl font-semibold">
              Users
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0 md:p-6">
            {isFetching ? (
              <div className="flex justify-center py-12">
                <motion.div
                  className="rounded-full h-10 w-10 border-4 border-primary"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              </div>
            ) : (
              <>
                {/* Mobile/Tablet: Horizontal scroll wrapper */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={
                              (data?.users?.length ?? 0) > 0 &&
                              selectedUsers.size === (data?.users?.length ?? 0)
                            }
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead className="min-w-[200px]">User</TableHead>
                        <TableHead className="min-w-[120px]">Role</TableHead>
                        <TableHead className="min-w-[100px]">Status</TableHead>
                        <TableHead className="min-w-[120px]">Created</TableHead>
                        <TableHead className="text-right min-w-[80px]">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.users?.map((user: UserRow, index: number) => (
                        <motion.tr
                          key={user.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2, delay: index * 0.05 }}
                          className="transition-colors hover:bg-muted/50"
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedUsers.has(user.id)}
                              onCheckedChange={(checked) =>
                                handleSelectUser(user.id, checked as boolean)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-semibold text-sm md:text-base">
                                {user.firstName} {user.lastName}
                              </p>
                              <p className="text-xs md:text-sm text-muted-foreground truncate max-w-[200px]">
                                {user.email}
                              </p>
                              {user.phone && (
                                <p className="text-xs text-muted-foreground font-medium">
                                  {user.phone}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`${getRoleColor(
                                user.role
                              )} text-xs font-medium whitespace-nowrap border`}
                            >
                              {user.role.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(user)}</TableCell>
                          <TableCell className="text-xs md:text-sm whitespace-nowrap">
                            {formatDate(user.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <motion.div
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  pushModal(
                                    <UserActionsModal
                                      user={user}
                                      onToggleActive={handleToggleActive}
                                      onDelete={handleDeleteUser}
                                    />
                                  )
                                }
                                className="h-8 w-8 p-0"
                                title="User actions"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </motion.div>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4 px-4 md:px-0">
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * pageSize + 1} to{" "}
                    {Math.min(currentPage * pageSize, data?.total || 0)} of{" "}
                    {data?.total || 0} users
                  </p>
                  <div className="flex items-center gap-2">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCurrentPage((p) => Math.max(1, p - 1))
                        }
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                    </motion.div>
                    <span className="text-xs md:text-sm whitespace-nowrap">
                      Page {currentPage} of {data?.pagination?.pages || 1}
                    </span>
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => p + 1)}
                        disabled={currentPage >= (data?.pagination?.pages || 1)}
                      >
                        Next
                      </Button>
                    </motion.div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

interface UserActionsModalProps {
  user: UserRow;
  onToggleActive: (user: UserRow) => Promise<void>;
  onDelete: (user: UserRow) => Promise<void>;
}

const UserActionsModal = ({
  user,
  onToggleActive,
  onDelete,
}: UserActionsModalProps) => {
  const { popModal } = useModal();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleToggle = async () => {
    popModal();
    await onToggleActive(user);
  };

  const handleDelete = async () => {
    // Don't pop the modal yet - 2FA modal will stack on top
    await onDelete(user);
    // After 2FA and deletion complete, pop this modal
    popModal();
  };

  if (showDeleteConfirm) {
    return (
      <motion.div
        onClick={(event) => event.stopPropagation()}
        className="bg-card m-0 sm:m-3 w-full max-w-md rounded-none sm:rounded-xl border-0 sm:border border-border shadow-lg"
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 sm:px-6 py-4 sm:py-5">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-semibold text-card-foreground">
                Soft Delete User
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => popModal()}
            className="rounded-md border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-card-foreground">
              Are you sure you want to soft delete{" "}
              <span className="font-semibold">
                {user.firstName} {user.lastName}
              </span>
              ?
            </p>
            <p className="text-xs text-muted-foreground">
              This will mark the user as deleted but preserve the data in the
              system. This action requires 2FA verification to proceed.
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              Soft Delete User
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      onClick={(event) => event.stopPropagation()}
      className="bg-card m-0 sm:m-3 w-full max-w-sm rounded-none sm:rounded-xl border-0 sm:border border-border shadow-lg"
      role="dialog"
      aria-modal="true"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 sm:px-6 py-4 sm:py-5">
        <div className="space-y-1 flex-1">
          <h2 className="text-lg font-semibold text-card-foreground">
            User Actions
          </h2>
          <p className="text-sm text-muted-foreground">
            {user.firstName} {user.lastName}
          </p>
        </div>
        <button
          type="button"
          onClick={() => popModal()}
          className="rounded-md border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-2">
        <Button
          variant="outline"
          onClick={handleToggle}
          className="w-full justify-start gap-2 h-auto py-3"
        >
          {user.isActive ?? true ? (
            <>
              <PowerOff className="w-4 h-4" />
              <span>Deactivate User</span>
            </>
          ) : (
            <>
              <Power className="w-4 h-4" />
              <span>Activate User</span>
            </>
          )}
        </Button>

        <Button
          variant="outline"
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full justify-start gap-2 h-auto py-3 text-destructive hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900"
        >
          <Trash2 className="w-4 h-4" />
          <span>Delete User</span>
        </Button>
      </div>
    </motion.div>
  );
};
