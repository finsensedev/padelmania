// components/admin/StaffTable.tsx
import { useState } from "react";
import {
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Mail,
  Phone,
  Clock,
  Calendar,
  Shield,
  MapPin,
  User as UserIcon,
} from "lucide-react";
import { format } from "date-fns";
import type { User } from "src/types/user.types";
import useModal from "src/hooks/useModal";
import UserModal from "src/components/admin/modals/UserModal";
import UserModalDetails from "src/components/admin/UserModalDetails";

interface StaffTableProps {
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

export default function StaffTable({
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
}: StaffTableProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const { pushModal, popModal } = useModal();

  const openEditStaffModal = (user: User) => {
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

  const openStaffDetailsModal = (user: User) => {
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

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "MANAGER":
        return "bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100";
      case "STAFF":
        return "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100";
      case "ADMIN":
        return "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100";
    }
  };

  const formatRole = (role: string) => {
    switch (role) {
      case "MANAGER":
        return "Manager";
      case "STAFF":
        return "Staff";
      case "ADMIN":
        return "Admin";
      default:
        return role;
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
          <UserIcon className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          No staff found
        </h3>
        <p className="text-muted-foreground mb-4">
          There are no staff members matching your current filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="p-3 text-left">
              <input
                type="checkbox"
                checked={selectedUsers.length === users.length}
                onChange={handleSelectAll}
                className="rounded border-border"
              />
            </th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">
              Staff Member
            </th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">
              Contact
            </th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">
              Role & Department
            </th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">
              Schedule
            </th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">
              Performance
            </th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">
              Status
            </th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">
              Hired
            </th>
            <th className="p-3 text-right text-sm font-medium text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => (
            <tr
              key={user.id}
              className={`border-b border-border hover:bg-muted/30 transition-colors ${
                index % 2 === 0 ? "bg-background" : "bg-muted/10"
              }`}
            >
              <td className="p-3">
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(user.id)}
                  onChange={() => handleSelectUser(user.id)}
                  className="rounded border-border"
                />
              </td>

              {/* Staff Info */}
              <td className="p-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={`${user.firstName} ${user.lastName}`}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-medium text-primary">
                        {user.firstName[0]}
                        {user.lastName[0]}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      ID: {user.id.slice(-8)}
                    </p>
                  </div>
                </div>
              </td>

              {/* Contact */}
              <td className="p-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-1 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{user.email}</span>
                    {user.emailVerified && (
                      <span
                        className="w-2 h-2 bg-green-500 rounded-full"
                        title="Email verified"
                      />
                    )}
                  </div>
                  {user.phone && (
                    <div className="flex items-center space-x-1 text-sm">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{user.phone}</span>
                      {user.phoneVerified && (
                        <span
                          className="w-2 h-2 bg-green-500 rounded-full"
                          title="Phone verified"
                        />
                      )}
                    </div>
                  )}
                </div>
              </td>

              {/* Role & Department */}
              <td className="p-3">
                <div className="space-y-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(
                      user.role
                    )}`}
                  >
                    {formatRole(user.role)}
                  </span>

                  {user.staff?.department && (
                    <div className="flex items-center space-x-1 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">
                        {String(user.staff.department)}
                      </span>
                    </div>
                  )}

                  {user.staff?.position && (
                    <div className="text-xs text-muted-foreground">
                      {user.staff.position}
                    </div>
                  )}
                </div>
              </td>

              {/* Schedule */}
              <td className="p-3">
                <div className="space-y-1 text-sm">
                  <div className="flex items-center space-x-1">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">9:00 AM - 5:00 PM</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">Mon-Fri</span>
                  </div>
                  {user.lastLogin && (
                    <div className="text-xs text-muted-foreground">
                      Last: {format(new Date(user.lastLogin), "MMM dd, HH:mm")}
                    </div>
                  )}
                </div>
              </td>

              {/* Performance */}
              <td className="p-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-green-500 h-1.5 rounded-full"
                        style={{
                          width: `${Math.floor(Math.random() * 40) + 60}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {Math.floor(Math.random() * 40) + 60}%
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {Math.floor(Math.random() * 10) + 20} tasks completed
                  </div>
                </div>
              </td>

              {/* Status */}
              <td className="p-3">
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.isActive
                        ? "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"
                        : "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100"
                    }`}
                  >
                    {user.isActive ? "Active" : "Inactive"}
                  </span>
                  <div className="flex space-x-1">
                    {user.emailVerified && user.phoneVerified && (
                      <Shield className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                </div>
              </td>

              {/* Hired */}
              <td className="p-3">
                <div className="text-sm text-foreground">
                  {format(new Date(user.createdAt), "MMM dd, yyyy")}
                </div>
              </td>

              {/* Actions */}
              <td className="p-3 text-right">
                <div className="relative">
                  <button
                    onClick={() =>
                      setOpenDropdown(openDropdown === user.id ? null : user.id)
                    }
                    className="p-1 hover:bg-muted rounded-lg"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {openDropdown === user.id && (
                    <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-lg shadow-lg z-10">
                      <div className="py-1">
                        <button
                          onClick={() => {
                            openStaffDetailsModal(user);
                            setOpenDropdown(null);
                          }}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-foreground hover:bg-muted"
                        >
                          <Eye className="w-4 h-4" />
                          <span>View Details</span>
                        </button>
                        <button
                          onClick={() => {
                            openEditStaffModal(user);
                            setOpenDropdown(null);
                          }}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-foreground hover:bg-muted"
                        >
                          <Edit className="w-4 h-4" />
                          <span>Edit Staff</span>
                        </button>
                        <div className="border-t border-border my-1" />
                        <button
                          onClick={() => {
                            onDeleteUser(user.id);
                            setOpenDropdown(null);
                          }}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-destructive hover:bg-muted"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete Staff</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="flex items-center justify-between p-4 border-t border-border bg-muted/20">
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">Show</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-2 py-1 border border-input rounded bg-background text-foreground"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-sm text-muted-foreground">staff per page</span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 text-sm border border-input rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
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
                className={`px-3 py-1 text-sm border border-input rounded hover:bg-muted ${
                  currentPage === pageNumber
                    ? "bg-primary text-primary-foreground"
                    : ""
                }`}
              >
                {pageNumber}
              </button>
            );
          })}

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 text-sm border border-input rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
