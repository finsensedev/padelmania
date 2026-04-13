import { useState } from "react";
import { Filter, X, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import type { UserFilters } from "src/types/user.types";

interface UserFiltersProps {
  filters: UserFilters;
  onFiltersChange: (filters: UserFilters) => void;
}

export default function UserFilters({
  filters,
  onFiltersChange,
}: UserFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<UserFilters>(filters);

  const handleApply = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleReset = () => {
    const resetFilters: UserFilters = {
      role: "ALL",
      status: "ALL",
      verified: "ALL",
      membershipTier: "ALL",
      vip: "ALL",
      tag: "",
    };
    setLocalFilters(resetFilters);
    onFiltersChange(resetFilters);
  };

  const activeFiltersCount = Object.values(filters).filter(
    (value) => value && value !== "ALL"
  ).length;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2.5 border border-border rounded-lg flex items-center gap-2 hover:bg-muted transition-colors text-foreground"
      >
        <Filter className="w-4 h-4" />
        <span>Filters</span>
        {activeFiltersCount > 0 && (
          <span className="ml-1 px-2 py-0.5 bg-primary text-primary-foreground text-xs rounded-full font-medium">
            {activeFiltersCount}
          </span>
        )}
        <ChevronDown className="w-4 h-4 ml-2" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-96 bg-card rounded-lg shadow-xl border border-border z-50">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-card-foreground">
                  Filter Users
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-muted rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
              {/* Role Filter */}
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  User Role
                </label>
                <select
                  value={localFilters.role}
                  onChange={(e) =>
                    setLocalFilters({
                      ...localFilters,
                      role: e.target.value as UserFilters["role"],
                    })
                  }
                  className="w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
                >
                  <option value="ALL">All Roles</option>
                  <option value="CUSTOMER">Customer</option>
                  <option value="ADMIN">Admin</option>
                  <option value="MANAGER">Manager</option>
                  <option value="FINANCE_OFFICER">Finance Officer</option>
                  <option value="BOOKING_OFFICER">Booking Officer</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Admin</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  Account Status
                </label>
                <select
                  value={localFilters.status}
                  onChange={(e) =>
                    setLocalFilters({
                      ...localFilters,
                      status: e.target.value as UserFilters["status"],
                    })
                  }
                  className="w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
                >
                  <option value="ALL">All Status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>

              {/* Verification Filter */}
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  Verification Status
                </label>
                <select
                  value={localFilters.verified}
                  onChange={(e) =>
                    setLocalFilters({
                      ...localFilters,
                      verified: e.target.value as UserFilters["verified"],
                    })
                  }
                  className="w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
                >
                  <option value="ALL">All</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="UNVERIFIED">Unverified</option>
                </select>
              </div>

              {/* Membership Tier Filter */}
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  Membership Tier
                </label>
                <select
                  value={localFilters.membershipTier}
                  onChange={(e) =>
                    setLocalFilters({
                      ...localFilters,
                      membershipTier: e.target
                        .value as UserFilters["membershipTier"],
                    })
                  }
                  className="w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
                >
                  <option value="ALL">All Tiers</option>
                  <option value="BRONZE">Bronze</option>
                  <option value="SILVER">Silver</option>
                  <option value="GOLD">Gold</option>
                  <option value="PLATINUM">Platinum</option>
                </select>
              </div>

              {/* VIP Filter */}
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  VIP Status
                </label>
                {(() => {
                  const vipValue =
                    localFilters.vip === true
                      ? "VIP"
                      : localFilters.vip === false
                      ? "NON_VIP"
                      : (localFilters.vip as "ALL" | "VIP" | "NON_VIP") ??
                        "ALL";
                  return (
                    <select
                      value={vipValue}
                      onChange={(e) =>
                        setLocalFilters({
                          ...localFilters,
                          vip: e.target.value as "ALL" | "VIP" | "NON_VIP",
                        })
                      }
                      className="w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
                    >
                      <option value="ALL">All</option>
                      <option value="VIP">VIP only</option>
                      <option value="NON_VIP">Non-VIP</option>
                    </select>
                  );
                })()}
              </div>

              {/* Tag Filter */}
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  Tag contains
                </label>
                <input
                  type="text"
                  value={localFilters.tag || ""}
                  onChange={(e) =>
                    setLocalFilters({ ...localFilters, tag: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
                  placeholder="e.g. corporate"
                />
              </div>

              {/* Date Range Filter */}
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  Registration Date
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={
                      localFilters.createdFrom
                        ? format(localFilters.createdFrom, "yyyy-MM-dd")
                        : ""
                    }
                    onChange={(e) =>
                      setLocalFilters({
                        ...localFilters,
                        createdFrom: e.target.value
                          ? new Date(e.target.value)
                          : undefined,
                      })
                    }
                    className="px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
                    placeholder="From"
                  />
                  <input
                    type="date"
                    value={
                      localFilters.createdTo
                        ? format(localFilters.createdTo, "yyyy-MM-dd")
                        : ""
                    }
                    onChange={(e) =>
                      setLocalFilters({
                        ...localFilters,
                        createdTo: e.target.value
                          ? new Date(e.target.value)
                          : undefined,
                      })
                    }
                    className="px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
                    placeholder="To"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-border flex gap-3">
              <button
                onClick={handleReset}
                className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors text-foreground"
              >
                Reset
              </button>
              <button
                onClick={handleApply}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
