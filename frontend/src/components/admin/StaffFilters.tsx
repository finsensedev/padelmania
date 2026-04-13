// components/admin/StaffFilters.tsx
import type { UserFilters } from "src/types/user.types";

interface StaffFiltersProps {
  filters: UserFilters;
  onFiltersChange: (filters: UserFilters) => void;
}

export default function StaffFilters({
  filters,
  onFiltersChange,
}: StaffFiltersProps) {
  const updateFilter = (
    key: keyof UserFilters,
    value: string | boolean | undefined
  ) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Department Filter */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Department
          </label>
          <select
            value={filters.department || ""}
            onChange={(e) =>
              updateFilter("department", e.target.value || undefined)
            }
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring"
          >
            <option value="">All Departments</option>
            <option value="FRONT_DESK">Front Desk</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="MANAGEMENT">Management</option>
            <option value="SECURITY">Security</option>
            <option value="CLEANING">Cleaning</option>
          </select>
        </div>

        {/* Position Filter */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Position
          </label>
          <input
            type="text"
            value={filters.position || ""}
            onChange={(e) =>
              updateFilter("position", e.target.value || undefined)
            }
            placeholder="e.g. Supervisor, Coordinator"
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Verification Status Filter */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Verification Status
          </label>
          <select
            value={filters.verified || "ALL"}
            onChange={(e) =>
              updateFilter(
                "verified",
                e.target.value as UserFilters["verified"]
              )
            }
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring"
          >
            <option value="ALL">All Verification</option>
            <option value="VERIFIED">Fully Verified</option>
            <option value="UNVERIFIED">Unverified</option>
          </select>
        </div>

        {/* Hire Date Range */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Hired From
          </label>
          <input
            type="date"
            value={
              filters.createdFrom
                ? new Date(filters.createdFrom).toISOString().split("T")[0]
                : ""
            }
            onChange={(e) =>
              updateFilter("createdFrom", e.target.value || undefined)
            }
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Last Login Filter */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Last Login From
          </label>
          <input
            type="date"
            value={
              filters.lastLoginFrom
                ? new Date(filters.lastLoginFrom).toISOString().split("T")[0]
                : ""
            }
            onChange={(e) =>
              updateFilter("lastLoginFrom", e.target.value || undefined)
            }
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Last Login To
          </label>
          <input
            type="date"
            value={
              filters.lastLoginTo
                ? new Date(filters.lastLoginTo).toISOString().split("T")[0]
                : ""
            }
            onChange={(e) =>
              updateFilter("lastLoginTo", e.target.value || undefined)
            }
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Clear Filters Button */}
        <div className="flex items-end">
          <button
            onClick={() =>
              onFiltersChange({
                role: "ALL",
                status: "ALL",
                verified: "ALL",
                department: "",
                position: "",
              })
            }
            className="w-full px-4 py-2 text-sm border border-input rounded-lg hover:bg-muted transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </div>
    </div>
  );
}
