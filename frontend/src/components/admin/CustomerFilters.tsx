// components/admin/CustomerFilters.tsx
import type { UserFilters, MembershipTier } from "src/types/user.types";

interface CustomerFiltersProps {
  filters: UserFilters;
  onFiltersChange: (filters: UserFilters) => void;
}

export default function CustomerFilters({
  filters,
  onFiltersChange,
}: CustomerFiltersProps) {
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
    <div className="flex flex-wrap gap-3">
      {/* Membership Tier Filter */}
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">Membership</label>
        <select
          value={filters.membershipTier || "ALL"}
          onChange={(e) =>
            updateFilter(
              "membershipTier",
              e.target.value as MembershipTier | "ALL" | "NONE"
            )
          }
          className="px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring"
        >
          <option value="ALL">All Memberships</option>
          <option value="PLATINUM">Platinum</option>
          <option value="GOLD">Gold</option>
          <option value="SILVER">Silver</option>
          <option value="BRONZE">Bronze</option>
          <option value="NONE">No Membership</option>
        </select>
      </div>

      {/* Status Filter */}
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">Status</label>
        <select
          value={filters.status || "ALL"}
          onChange={(e) =>
            updateFilter("status", e.target.value as UserFilters["status"])
          }
          className="px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring"
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>

      {/* Verification Filter */}
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">
          Verification
        </label>
        <select
          value={filters.verified || "ALL"}
          onChange={(e) =>
            updateFilter("verified", e.target.value as UserFilters["verified"])
          }
          className="px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring"
        >
          <option value="ALL">All Verification</option>
          <option value="VERIFIED">Verified</option>
          <option value="UNVERIFIED">Unverified</option>
        </select>
      </div>

      {/* Has Bookings Filter */}
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">Bookings</label>
        <select
          value={
            filters.hasBookings === undefined
              ? "ALL"
              : filters.hasBookings
              ? "YES"
              : "NO"
          }
          onChange={(e) => {
            const value = e.target.value;
            updateFilter(
              "hasBookings",
              value === "ALL" ? undefined : value === "YES"
            );
          }}
          className="px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring"
        >
          <option value="ALL">All</option>
          <option value="YES">Has Bookings</option>
          <option value="NO">No Bookings</option>
        </select>
      </div>

      {/* Has Orders Filter */}
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">Orders</label>
        <select
          value={
            filters.hasOrders === undefined
              ? "ALL"
              : filters.hasOrders
              ? "YES"
              : "NO"
          }
          onChange={(e) => {
            const value = e.target.value;
            updateFilter(
              "hasOrders",
              value === "ALL" ? undefined : value === "YES"
            );
          }}
          className="px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-ring"
        >
          <option value="ALL">All</option>
          <option value="YES">Has Orders</option>
          <option value="NO">No Orders</option>
        </select>
      </div>
    </div>
  );
}
