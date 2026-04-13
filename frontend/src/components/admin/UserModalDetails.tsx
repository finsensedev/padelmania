import { useState } from "react";
import {
  X,
  User as UserIcon,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  Award,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import type { User } from "src/types/user.types";
import { userService } from "src/services/user.service";
import useNotification from "src/hooks/useNotification";

interface UserModalDetailsProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export default function UserModalDetails({
  isOpen,
  onClose,
  user,
}: UserModalDetailsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toaster } = useNotification();

  if (!isOpen || !user) return null;

  const handleSendVerification = async () => {
    setIsLoading(true);
    try {
      await userService.sendVerificationEmail(user.id);
      toaster("Verification email sent");
    } catch (error) {
      console.error(error);
      toaster("Failed to send verification email", { variant: "error" });
    } finally {
      setIsLoading(false);
    }
  };

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

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="bg-card rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-border shadow-lg"
    >
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-card-foreground">
            User Details
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={`${user.firstName} ${user.lastName}`}
              className="w-16 h-16 rounded-full"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <UserIcon className="w-8 h-8 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-card-foreground">
              {user.firstName} {user.lastName}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`px-2 py-1 text-xs rounded-full border font-medium ${getRoleBadgeColor(
                  user.role
                )}`}
              >
                {user.role.replace("_", " ")}
              </span>
              {user.isActive ? (
                <span className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                  Active
                </span>
              ) : (
                <span className="px-2 py-1 text-xs rounded-full bg-destructive/10 text-destructive border border-destructive/20 font-medium">
                  Inactive
                </span>
              )}
              {user.membershipTier && (
                <span className="px-2 py-1 text-xs rounded-full bg-accent/10 text-accent-foreground border border-accent/20 font-medium">
                  {user.membershipTier}
                </span>
              )}
            </div>
          </div>
        </div>

        {!user.emailVerified && (
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={handleSendVerification}
              disabled={isLoading}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors flex items-center gap-1 text-card-foreground disabled:opacity-50"
            >
              <Mail className="w-3.5 h-3.5" />
              Send Verification
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          {/* Contact Information */}
          <div>
            <h4 className="text-sm font-semibold text-card-foreground mb-3">
              Contact Information
            </h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-card-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.emailVerified ? (
                      <span className="flex items-center gap-1 text-primary">
                        <CheckCircle className="w-3 h-3" />
                        Verified
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-destructive">
                        <XCircle className="w-3 h-3" />
                        Not verified
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {user.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-card-foreground">{user.phone}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.phoneVerified ? (
                        <span className="flex items-center gap-1 text-primary">
                          <CheckCircle className="w-3 h-3" />
                          Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-destructive">
                          <XCircle className="w-3 h-3" />
                          Not verified
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-card-foreground mb-3">
              Account Details
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">User ID</span>
                <span className="text-sm text-card-foreground font-mono">
                  {user.id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Created</span>
                <span className="text-sm text-card-foreground">
                  {format(new Date(user.createdAt), "MMM dd, yyyy HH:mm")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Last Updated
                </span>
                <span className="text-sm text-card-foreground">
                  {format(new Date(user.updatedAt), "MMM dd, yyyy HH:mm")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Last Login
                </span>
                <span className="text-sm text-card-foreground">
                  {user.lastLogin
                    ? format(new Date(user.lastLogin), "MMM dd, yyyy HH:mm")
                    : "Never"}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-card-foreground mb-3">
              Activity & Engagement
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-muted/30 p-4 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">
                    Total Bookings
                  </span>
                </div>
                <p className="text-xl font-semibold text-card-foreground">
                  {user.totalBookings || 0}
                </p>
              </div>
              <div className="bg-muted/30 p-4 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">
                    Total Spent
                  </span>
                </div>
                <p className="text-xl font-semibold text-card-foreground">
                  KES {user.totalSpent?.toLocaleString() || 0}
                </p>
              </div>
              <div className="bg-muted/30 p-4 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">
                    Loyalty Points
                  </span>
                </div>
                <p className="text-xl font-semibold text-card-foreground">
                  {user.loyaltyPoints || 0}
                </p>
              </div>
            </div>
          </div>

          {user.staff && (
            <div>
              <h4 className="text-sm font-semibold text-card-foreground mb-3">
                Staff Information
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Employee ID
                  </span>
                  <span className="text-sm text-card-foreground">
                    {user.staff.employeeId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Department
                  </span>
                  <span className="text-sm text-card-foreground">
                    {typeof user.staff.department === "string"
                      ? user.staff.department
                      : user.staff.department?.name || "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Position
                  </span>
                  <span className="text-sm text-card-foreground">
                    {user.staff.position}
                  </span>
                </div>
                {user.staff.hireDate && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Hire Date
                    </span>
                    <span className="text-sm text-card-foreground">
                      {format(new Date(user.staff.hireDate), "MMM dd, yyyy")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
