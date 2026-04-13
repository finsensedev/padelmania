// components/admin/users/UserTable.tsx
import { useState } from "react";
import { MoreVertical, Edit, Trash2, Eye, Mail, Phone } from "lucide-react";
import { format } from "date-fns";
import type { User } from "src/types/user.types";
import useModal from "src/hooks/useModal";
import UserModal from "src/components/admin/modals/UserModal";
import UserModalDetails from "src/components/admin/UserModalDetails";
import { userService } from "src/services/user.service";
import useNotification from "src/hooks/useNotification";
import useTwoFAPrompt from "src/hooks/useTwoFAPrompt";

interface UserTableProps {
  users: User[];
  loading: boolean;
  selectedUsers: string[];
  onSelectionChange: (users: string[]) => void;
  onDeleteUser: (userId: string) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  onRefresh?: () => void;
  showFinancialMetrics?: boolean;
}

export default function UserTable({
  users,
  loading,
  selectedUsers,
  onSelectionChange,
  onDeleteUser,
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onRefresh,
  showFinancialMetrics = true,
}: UserTableProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const { pushModal, popModal } = useModal();
  const { toaster } = useNotification();
  const twoFAPrompt = useTwoFAPrompt();

  const openEditUserModal = (user: User) => {
    let modalId = "";
    const handleClose = () => popModal(modalId);
    modalId = pushModal(
      <UserModal
        isOpen={true}
        onClose={handleClose}
        user={user}
        onSuccess={handleClose}
      />
    );
  };

  const openViewUserModal = (user: User) => {
    let modalId = "";
    const handleClose = () => popModal(modalId);
    modalId = pushModal(
      <UserModalDetails isOpen={true} onClose={handleClose} user={user} />
    );
  };

  const handleSelectAll = () => {
    if (selectedUsers.length === users.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(users.map((u) => u.id));
    }
  };

  const handleSelectUser = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      onSelectionChange(selectedUsers.filter((id) => id !== userId));
    } else {
      onSelectionChange([...selectedUsers, userId]);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      SUPER_ADMIN:
        "bg-destructive/10 text-destructive border border-destructive/20 shadow-sm",
      ADMIN: "bg-primary/10 text-primary border border-primary/20 shadow-sm",
      MANAGER:
        "bg-accent/10 text-white-foreground border border-accent/20 shadow-sm",
      FINANCE_OFFICER: "bg-info/10 text-inputborder border-info/20 shadow-sm",
      BOOKING_OFFICER:
        "bg-secondary/50 text-secondary-foreground border border-secondary shadow-sm",
      CUSTOMER:
        "bg-muted/50 text-secondary-foreground border border-border shadow-sm",
    };
    return (
      colors[role] ||
      "bg-muted text-muted-foreground border border-border shadow-sm"
    );
  };

  const getStatusBadge = (user: User) => {
    if (!user.isActive) {
      return (
        <span className="px-2 w-max py-1 text-xs rounded-full bg-destructive/10 text-destructive border border-destructive/20 shadow-sm">
          Inactive
        </span>
      );
    }

    if (user.emailVerified) {
      return (
        <span className="px-2 w-max py-1 text-xs rounded-full bg-success/10 text-primary border border-primary/40 shadow-sm">
          Verified
        </span>
      );
    }
    return (
      <span className="px-2 w-max py-1 text-xs rounded-full bg-warning/80 text-black border border-accent/20 shadow-sm">
        Pending
      </span>
    );
  };

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border p-4 sm:p-8 shadow-sm">
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted/50 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
      {/* Mobile Card Layout */}
      <div className="block md:hidden">
        <div className="p-3 sm:p-4 space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className={`p-3 sm:p-4 rounded-lg border transition-all ${
                selectedUsers.includes(user.id)
                  ? "bg-primary/5 border-primary/20 ring-2 ring-primary/30 shadow-md"
                  : "bg-card border-border hover:border-primary/30 hover:shadow-md"
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(user.id)}
                    onChange={() => handleSelectUser(user.id)}
                    className="rounded border-input text-primary focus:ring-ring mt-1 flex-shrink-0 h-4 w-4"
                  />
                  <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      {user.avatar ? (
                        <img
                          className="h-10 w-10 sm:h-12 sm:w-12 rounded-full ring-2 ring-border"
                          src={user.avatar}
                          alt=""
                        />
                      ) : (
                        <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-primary/20">
                          <span className="text-primary font-semibold text-xs sm:text-sm">
                            {user.firstName[0]}
                            {user.lastName[0]}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {user.firstName} {user.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate break-all">{user.email}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mobile Actions Dropdown */}
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() =>
                      setOpenDropdown(openDropdown === user.id ? null : user.id)
                    }
                    className="p-1.5 sm:p-2 hover:bg-muted rounded-lg transition-colors"
                  >
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </button>
                  {openDropdown === user.id && (
                    <div className="absolute right-0 mt-2 w-48 bg-popover rounded-lg shadow-xl border border-border z-20 overflow-hidden">
                      <button
                        onClick={async () => {
                          try {
                            const makeActive = !user.isActive;
                            const requires2FA = true;
                            let code: string | undefined = undefined;
                            if (requires2FA) {
                              code = await twoFAPrompt({
                                title: makeActive
                                  ? "Authorize Activation"
                                  : "Authorize Deactivation",
                                description: `Enter your 6-digit 2FA code to ${
                                  makeActive ? "activate" : "deactivate"
                                } this user.`,
                                submitLabel: "Authorize",
                              });
                              if (!code) {
                                setOpenDropdown(null);
                                return;
                              }
                            }
                            await userService.setActive(user.id, makeActive, {
                              twoFactorCode: code,
                            });
                            toaster(
                              `User ${
                                makeActive ? "activated" : "deactivated"
                              } successfully`,
                              { variant: "success" }
                            );
                            setOpenDropdown(null);
                            if (typeof onRefresh === "function") {
                              onRefresh();
                            }
                          } catch (err: unknown) {
                            let msg = "Failed to update user status";
                            if (err instanceof Error) {
                              msg = err.message;
                            } else if (
                              typeof err === "object" &&
                              err !== null &&
                              "response" in err
                            ) {
                              const resp = (
                                err as {
                                  response?: {
                                    data?: { message?: string };
                                    statusText?: string;
                                  };
                                }
                              ).response;
                              msg =
                                resp?.data?.message || resp?.statusText || msg;
                            }
                            toaster(msg, { variant: "error" });
                          }
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-popover-foreground hover:bg-muted/80 transition-colors font-medium"
                      >
                        {user.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => {
                          openViewUserModal(user);
                          setOpenDropdown(null);
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-popover-foreground hover:bg-muted/80 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        View Details
                      </button>
                      <button
                        onClick={() => {
                          openEditUserModal(user);
                          setOpenDropdown(null);
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-popover-foreground hover:bg-muted/80 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          onDeleteUser(user.id);
                          setOpenDropdown(null);
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors border-t border-border"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Content */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span
                    className={`px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs rounded-full font-medium ${getRoleBadgeColor(
                      user.role
                    )}`}
                  >
                    {user.role.replace("_", " ")}
                  </span>
                  {(user.isVIP ?? false) && (
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-warning/20 text-warning-foreground border border-warning/30 shadow-sm font-medium">
                      ⭐ VIP
                    </span>
                  )}
                  {getStatusBadge(user)}
                  {user.deactivatedAt && (
                    <span className="px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs rounded-full bg-muted text-muted-foreground border border-border shadow-sm">
                      Deactivated
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs bg-muted/30 rounded-lg p-2 sm:p-3">
                  <div>
                    <span className="text-muted-foreground text-[10px] sm:text-xs">
                      Reg. Number:
                    </span>
                    <div className="font-medium text-foreground break-words">
                      {user.registrationNumber || "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] sm:text-xs">
                      Joined:
                    </span>
                    <div className="font-medium text-foreground">
                      {format(new Date(user.createdAt), "MMM dd, yyyy")}
                    </div>
                  </div>
                  {showFinancialMetrics && (
                    <div>
                      <span className="text-muted-foreground text-[10px] sm:text-xs">
                        Bookings:
                      </span>
                      <div className="font-semibold text-foreground">
                        {user.totalBookings || 0}
                      </div>
                    </div>
                  )}
                  {showFinancialMetrics && (
                    <div>
                      <span className="text-muted-foreground text-[10px] sm:text-xs">
                        Total Spent:
                      </span>
                      <div className="font-semibold text-primary text-xs sm:text-sm">
                        KES {user.totalSpent?.toLocaleString() || 0}
                      </div>
                    </div>
                  )}
                </div>

                {user.phone && (
                  <div className="pt-1">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3 flex-shrink-0" />
                      <span className="break-all">{user.phone}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop Table Layout */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 lg:px-6 py-3 text-left">
                <input
                  type="checkbox"
                  checked={
                    selectedUsers.length === users.length && users.length > 0
                  }
                  onChange={handleSelectAll}
                  className="rounded border-input text-primary focus:ring-ring"
                />
              </th>
              <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                User
              </th>
              <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Role
              </th>
              <th className="hidden lg:table-cell px-4 lg:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Reg. Number
              </th>
              <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="hidden lg:table-cell px-4 lg:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Joined
              </th>
              {showFinancialMetrics && (
                <th className="hidden lg:table-cell px-4 lg:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Bookings
                </th>
              )}
              {showFinancialMetrics && (
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Total Spent
                </th>
              )}
              <th className="relative px-4 lg:px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {users.map((user) => (
              <tr
                key={user.id}
                className={`transition-colors ${
                  selectedUsers.includes(user.id)
                    ? "bg-primary/5 ring-1 ring-primary/20"
                    : "hover:bg-muted/30"
                }`}
              >
                <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(user.id)}
                    onChange={() => handleSelectUser(user.id)}
                    className="rounded border-input text-primary focus:ring-ring"
                  />
                </td>
                <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div
                      className={`flex-shrink-0 h-10 w-10 ${
                        selectedUsers.includes(user.id)
                          ? "ring-2 ring-primary/50 rounded-full"
                          : ""
                      }`}
                    >
                      {user.avatar ? (
                        <img
                          className="h-10 w-10 rounded-full ring-2 ring-border"
                          src={user.avatar}
                          alt=""
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-primary/20">
                          <span className="text-primary font-semibold text-sm">
                            {user.firstName[0]}
                            {user.lastName[0]}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="ml-4 min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {user.firstName} {user.lastName}
                      </div>
                      <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
                        <Mail className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate break-all">{user.email}</span>
                      </div>
                      {user.phone && (
                        <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
                          <Phone className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate break-all">
                            {user.phone}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-col gap-1.5">
                    <span
                      className={`px-2 py-1 text-xs w-max rounded-full font-medium ${getRoleBadgeColor(
                        user.role
                      )}`}
                    >
                      {user.role.replace("_", " ")}
                    </span>
                    {(user.isVIP ?? false) && (
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-warning/20 text-warning-foreground border border-warning/30 shadow-sm w-fit font-medium">
                        ⭐ VIP
                      </span>
                    )}
                  </div>
                </td>
                <td className="hidden lg:table-cell px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                  {user.registrationNumber || "-"}
                </td>
                <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                  <div className="flex flex-col gap-1.5">
                    {getStatusBadge(user)}
                    {user.deactivatedAt && (
                      <span className="px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground border border-border shadow-sm w-fit">
                        Deactivated
                      </span>
                    )}
                  </div>
                </td>
                <td className="hidden lg:table-cell px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                  {format(new Date(user.createdAt), "MMM dd, yyyy")}
                </td>
                {showFinancialMetrics && (
                  <td className="hidden lg:table-cell px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {user.totalBookings || 0}
                  </td>
                )}
                {showFinancialMetrics && (
                  <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    KES {user.totalSpent?.toLocaleString() || 0}
                  </td>
                )}
                <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="relative inline-block text-left">
                    <button
                      onClick={() =>
                        setOpenDropdown(
                          openDropdown === user.id ? null : user.id
                        )
                      }
                      className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                      <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    </button>
                    {openDropdown === user.id && (
                      <div className="absolute right-0 mt-2 w-48 bg-popover rounded-lg shadow-xl border border-border z-20 overflow-hidden">
                        <button
                          onClick={async () => {
                            try {
                              const makeActive = !user.isActive;
                              const requires2FA = true;
                              let code: string | undefined = undefined;
                              if (requires2FA) {
                                code = await twoFAPrompt({
                                  title: makeActive
                                    ? "Authorize Activation"
                                    : "Authorize Deactivation",
                                  description: `Enter your 6-digit 2FA code to ${
                                    makeActive ? "activate" : "deactivate"
                                  } this user.`,
                                  submitLabel: "Authorize",
                                });
                                if (!code) {
                                  setOpenDropdown(null);
                                  return;
                                }
                              }
                              await userService.setActive(user.id, makeActive, {
                                twoFactorCode: code,
                              });
                              toaster(
                                `User ${
                                  makeActive ? "activated" : "deactivated"
                                } successfully`,
                                { variant: "success" }
                              );
                              setOpenDropdown(null);
                              if (typeof onRefresh === "function") {
                                onRefresh();
                              }
                            } catch (err: unknown) {
                              let msg = "Failed to update user status";
                              if (err instanceof Error) {
                                msg = err.message;
                              } else if (
                                typeof err === "object" &&
                                err !== null &&
                                "response" in err
                              ) {
                                const resp = (
                                  err as {
                                    response?: {
                                      data?: { message?: string };
                                      statusText?: string;
                                    };
                                  }
                                ).response;
                                msg =
                                  resp?.data?.message ||
                                  resp?.statusText ||
                                  msg;
                              }
                              toaster(msg, { variant: "error" });
                            }
                          }}
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-popover-foreground hover:bg-muted/80 transition-colors font-medium"
                        >
                          {user.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => {
                            openViewUserModal(user);
                            setOpenDropdown(null);
                          }}
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-popover-foreground hover:bg-muted/80 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          View Details
                        </button>
                        <button
                          onClick={() => {
                            openEditUserModal(user);
                            setOpenDropdown(null);
                          }}
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-popover-foreground hover:bg-muted/80 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            onDeleteUser(user.id);
                            setOpenDropdown(null);
                          }}
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors border-t border-border"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-muted/30 px-3 sm:px-4 py-3 flex items-center justify-between border-t border-border">
        <div className="flex-1 flex justify-between sm:hidden">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="relative inline-flex items-center px-3 py-2 border border-border text-xs sm:text-sm font-medium rounded-md text-muted-foreground bg-card hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Previous
          </button>
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="ml-3 relative inline-flex items-center px-3 py-2 border border-border text-xs sm:text-sm font-medium rounded-md text-muted-foreground bg-card hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Next
          </button>
        </div>
        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Showing{" "}
              <span className="font-medium">
                {(currentPage - 1) * pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-medium">
                {Math.min(currentPage * pageSize, users.length)}
              </span>{" "}
              of <span className="font-medium">{users.length}</span> results
            </p>
          </div>
          <div>
            <nav
              className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
              aria-label="Pagination"
            >
              <button
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              >
                Previous
              </button>
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => onPageChange(i + 1)}
                  className={`relative inline-flex items-center px-4 py-2 border border-border text-sm font-medium transition-colors ${
                    currentPage === i + 1
                      ? "z-10 bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() =>
                  onPageChange(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              >
                Next
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
