/* eslint-disable @typescript-eslint/no-explicit-any */
// components/admin/users/BulkActions.tsx
import { useState } from "react";
import {
  CheckSquare,
  X,
  UserCheck,
  UserX,
  Shield,
  Mail,
  Trash2,
} from "lucide-react";
import { type BulkAction } from "src/types/user.types";

interface BulkActionsProps {
  selectedCount: number;
  onBulkUpdate: (action: BulkAction, value?: any) => void;
  onClearSelection: () => void;
}

export default function BulkActions({
  selectedCount,
  onBulkUpdate,
  onClearSelection,
}: BulkActionsProps) {
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState("CUSTOMER");

  const handleRoleChange = () => {
    onBulkUpdate("setRole", selectedRole);
    setShowRoleModal(false);
  };

  const handleAction = (action: BulkAction, value?: any) => {
    onBulkUpdate(action, value);
  };

  return (
    <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {selectedCount} user{selectedCount !== 1 ? "s" : ""} selected
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAction("activate")}
            className="px-3 py-1.5 text-sm bg-card border border-border rounded-lg hover:bg-muted transition-colors flex items-center gap-1 text-foreground"
          >
            <UserCheck className="w-4 h-4" />
            Activate
          </button>
          <button
            onClick={() => handleAction("deactivate")}
            className="px-3 py-1.5 text-sm bg-card border border-border rounded-lg hover:bg-muted transition-colors flex items-center gap-1 text-foreground"
          >
            <UserX className="w-4 h-4" />
            Deactivate
          </button>
          <button
            onClick={() => setShowRoleModal(true)}
            className="px-3 py-1.5 text-sm bg-card border border-border rounded-lg hover:bg-muted transition-colors flex items-center gap-1 text-foreground"
          >
            <Shield className="w-4 h-4" />
            Change Role
          </button>
          <button
            onClick={() => handleAction("sendEmail")}
            className="px-3 py-1.5 text-sm bg-card border border-border rounded-lg hover:bg-muted transition-colors flex items-center gap-1 text-foreground"
          >
            <Mail className="w-4 h-4" />
            Send Email
          </button>
          <button
            onClick={() => {
              if (
                confirm(
                  `This will soft-delete ${selectedCount} user(s). Continue?`
                )
              ) {
                handleAction("softDelete");
              }
            }}
            className="px-3 py-1.5 text-sm bg-card border border-destructive/50 text-destructive rounded-lg hover:bg-destructive/10 transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-4 h-4" />
            Soft Delete
          </button>
          <button
            onClick={onClearSelection}
            className="p-1.5 hover:bg-primary/10 rounded transition-colors"
          >
            <X className="w-4 h-4 text-primary" />
          </button>
        </div>
      </div>

      {/* Role Change Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-96 border border-border shadow-lg">
            <h3 className="text-lg font-semibold mb-4 text-card-foreground">
              Change User Role
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Select a new role for the selected {selectedCount} user(s)
            </p>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-lg mb-4 bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent"
            >
              <option value="CUSTOMER">Customer</option>
              <option value="STAFF">Staff</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRoleModal(false)}
                className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleRoleChange}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                Change Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
