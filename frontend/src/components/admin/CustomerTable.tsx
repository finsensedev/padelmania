// components/admin/CustomerTable.tsx
import { useState } from "react";
import {
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Mail,
  Phone,
  Award,
  CreditCard,
  Calendar,
  Star,
} from "lucide-react";
import { format } from "date-fns";
import type { User } from "src/types/user.types";
import useModal from "src/hooks/useModal";
import UserModal from "src/components/admin/modals/UserModal";
import UserModalDetails from "src/components/admin/UserModalDetails";

interface CustomerTableProps {
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
}

export default function CustomerTable({
  users,
  loading,
  selectedUsers,
  onSelectionChange,
  onDeleteUser,
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
}: CustomerTableProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const { pushModal, popModal } = useModal();

  const openEditCustomerModal = (user: User) => {
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

  const openCustomerDetailsModal = (user: User) => {
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
      onSelectionChange(users.map((user) => user.id));
    }
  };

  const handleSelectUser = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      onSelectionChange(selectedUsers.filter((id) => id !== userId));
    } else {
      onSelectionChange([...selectedUsers, userId]);
    }
  };

  const getMembershipBadgeColor = (tier?: string) => {
    switch (tier) {
      case "PLATINUM":
        return "bg-accent/20 text-accent-foreground border border-accent/30 shadow-sm";
      case "GOLD":
        return "bg-warning/20 text-warning-foreground border border-warning/30 shadow-sm";
      case "SILVER":
        return "bg-muted text-muted-foreground border border-border shadow-sm";
      case "BRONZE":
        return "bg-destructive/20 text-destructive border border-destructive/30 shadow-sm";
      default:
        return "bg-muted/50 text-muted-foreground border border-border";
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-8">
        <div className="animate-pulse space-y-3 sm:space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted/50 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="p-8 sm:p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center ring-2 ring-primary/20">
          <Award className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          No customers found
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          There are no customers matching your current filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-muted/50 border-b-2 border-border">
          <tr>
            <th className="p-3 sm:p-4 text-left">
              <input
                type="checkbox"
                checked={selectedUsers.length === users.length}
                onChange={handleSelectAll}
                className="rounded border-input text-primary focus:ring-ring h-4 w-4"
              />
            </th>
            <th className="p-3 sm:p-4 text-left text-xs sm:text-sm font-semibold text-foreground uppercase tracking-wide">
              Customer
            </th>
            <th className="p-3 sm:p-4 text-left text-xs sm:text-sm font-semibold text-foreground uppercase tracking-wide">
              Contact
            </th>
            <th className="p-3 sm:p-4 text-left text-xs sm:text-sm font-semibold text-foreground uppercase tracking-wide">
              Membership
            </th>
            <th className="p-3 sm:p-4 text-left text-xs sm:text-sm font-semibold text-foreground uppercase tracking-wide">
              Activity
            </th>
            <th className="p-3 sm:p-4 text-left text-xs sm:text-sm font-semibold text-foreground uppercase tracking-wide">
              Spending
            </th>
            <th className="p-3 sm:p-4 text-left text-xs sm:text-sm font-semibold text-foreground uppercase tracking-wide">
              Status
            </th>
            <th className="p-3 sm:p-4 text-left text-xs sm:text-sm font-semibold text-foreground uppercase tracking-wide">
              Joined
            </th>
            <th className="p-3 sm:p-4 text-right text-xs sm:text-sm font-semibold text-foreground uppercase tracking-wide">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => (
            <tr
              key={user.id}
              className={`border-b border-border hover:bg-primary/5 transition-all ${
                selectedUsers.includes(user.id)
                  ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                  : index % 2 === 0
                  ? "bg-background"
                  : "bg-muted/10"
              }`}
            >
              <td className="p-3 sm:p-4">
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(user.id)}
                  onChange={() => handleSelectUser(user.id)}
                  className="rounded border-input text-primary focus:ring-ring h-4 w-4"
                />
              </td>

              {/* Customer Info */}
              <td className="p-3 sm:p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-full flex items-center justify-center ring-2 ring-primary/20">
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={`${user.firstName} ${user.lastName}`}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-primary">
                        {user.firstName[0]}
                        {user.lastName[0]}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ID: {user.id.slice(-8)}
                    </p>
                  </div>
                </div>
              </td>

              {/* Contact */}
              <td className="p-3 sm:p-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center space-x-1.5 text-xs sm:text-sm">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-foreground truncate break-all">
                      {user.email}
                    </span>
                    {user.emailVerified && (
                      <span
                        className="w-2 h-2 bg-success rounded-full flex-shrink-0"
                        title="Email verified"
                      />
                    )}
                  </div>
                  {user.phone && (
                    <div className="flex items-center space-x-1.5 text-xs sm:text-sm">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-foreground break-all">
                        {user.phone}
                      </span>
                      {user.phoneVerified && (
                        <span
                          className="w-2 h-2 bg-success rounded-full flex-shrink-0"
                          title="Phone verified"
                        />
                      )}
                    </div>
                  )}
                </div>
              </td>

              {/* Membership */}
              <td className="p-3 sm:p-4">
                <div className="space-y-2">
                  {user.membershipTier ? (
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold ${getMembershipBadgeColor(
                          user.membershipTier
                        )}`}
                      >
                        {user.membershipTier === "PLATINUM" && "💎 "}
                        {user.membershipTier === "GOLD" && "🥇 "}
                        {user.membershipTier === "SILVER" && "🥈 "}
                        {user.membershipTier === "BRONZE" && "🥉 "}
                        {user.membershipTier}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs sm:text-sm text-muted-foreground italic">
                      No membership
                    </span>
                  )}

                  {user.loyaltyPoints !== undefined &&
                    user.loyaltyPoints > 0 && (
                      <div className="flex items-center space-x-1 text-xs sm:text-sm">
                        <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-warning fill-warning" />
                        <span className="text-foreground font-medium">
                          {user.loyaltyPoints} pts
                        </span>
                      </div>
                    )}
                </div>
              </td>

              {/* Activity */}
              <td className="p-3 sm:p-4">
                <div className="space-y-1.5 text-xs sm:text-sm">
                  {user.totalBookings !== undefined && (
                    <div className="flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-info" />
                      <span className="text-foreground font-medium">
                        {user.totalBookings} bookings
                      </span>
                    </div>
                  )}
                  {user.totalOrders !== undefined && (
                    <div className="flex items-center space-x-1.5">
                      <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
                      <span className="text-foreground font-medium">
                        {user.totalOrders} orders
                      </span>
                    </div>
                  )}
                  {user.lastLogin && (
                    <div className="text-[10px] sm:text-xs text-muted-foreground">
                      Last: {format(new Date(user.lastLogin), "MMM dd, yyyy")}
                    </div>
                  )}
                </div>
              </td>

              {/* Spending */}
              <td className="p-3 sm:p-4">
                <div className="text-xs sm:text-sm">
                  {user.totalSpent !== undefined ? (
                    <div className="font-semibold text-primary">
                      KES {user.totalSpent.toLocaleString()}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic text-xs">
                      No data
                    </span>
                  )}
                </div>
              </td>

              {/* Status */}
              <td className="p-3 sm:p-4">
                <div className="flex flex-col gap-1.5">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold w-fit shadow-sm ${
                      user.isActive
                        ? "bg-success/10 text-success-foreground border border-success/20"
                        : "bg-destructive/10 text-destructive border border-destructive/20"
                    }`}
                  >
                    {user.isActive ? "Active" : "○ Inactive"}
                  </span>
                  {user.emailVerified && user.phoneVerified && (
                    <span className="text-[10px] text-success-foreground font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-success rounded-full" />
                      Verified
                    </span>
                  )}
                </div>
              </td>

              {/* Joined */}
              <td className="p-3 sm:p-4">
                <div className="text-xs sm:text-sm text-foreground font-medium">
                  {format(new Date(user.createdAt), "MMM dd, yyyy")}
                </div>
              </td>

              {/* Actions */}
              <td className="p-3 sm:p-4 text-right">
                <div className="relative inline-block">
                  <button
                    onClick={() =>
                      setOpenDropdown(openDropdown === user.id ? null : user.id)
                    }
                    className="p-1.5 sm:p-2 hover:bg-muted rounded-lg transition-colors"
                  >
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </button>
                  {openDropdown === user.id && (
                    <div className="absolute right-0 mt-2 w-48 bg-popover border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                      <button
                        onClick={() => {
                          openCustomerDetailsModal(user);
                          setOpenDropdown(null);
                        }}
                        className="flex items-center space-x-2 w-full px-4 py-2.5 text-sm text-popover-foreground hover:bg-muted/80 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        <span>View Details</span>
                      </button>
                      <button
                        onClick={() => {
                          openEditCustomerModal(user);
                          setOpenDropdown(null);
                        }}
                        className="flex items-center space-x-2 w-full px-4 py-2.5 text-sm text-popover-foreground hover:bg-muted/80 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                        <span>Edit Customer</span>
                      </button>
                      <div className="border-t border-border" />
                      <button
                        onClick={() => {
                          onDeleteUser(user.id);
                          setOpenDropdown(null);
                        }}
                        className="flex items-center space-x-2 w-full px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete Customer</span>
                      </button>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 border-t-2 border-border bg-muted/30">
        <div className="flex items-center space-x-2 text-xs sm:text-sm">
          <span className="text-muted-foreground font-medium">Show</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-2 py-1 border border-input rounded-lg bg-background text-foreground font-medium shadow-sm hover:border-primary/30 transition-colors cursor-pointer"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-muted-foreground font-medium hidden sm:inline">
            customers per page
          </span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1.5 text-xs sm:text-sm font-medium border border-input rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            Previous
          </button>

          {[...Array(Math.min(5, totalPages))].map((_, i) => {
            const pageNumber = Math.max(1, currentPage - 2) + i;
            if (pageNumber > totalPages) return null;

            return (
              <button
                key={pageNumber}
                onClick={() => onPageChange(pageNumber)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium border border-input rounded-lg transition-all shadow-sm ${
                  currentPage === pageNumber
                    ? "bg-primary text-primary-foreground border-primary shadow-md"
                    : "hover:bg-muted hover:border-primary/30"
                }`}
              >
                {pageNumber}
              </button>
            );
          })}

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 text-xs sm:text-sm font-medium border border-input rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
