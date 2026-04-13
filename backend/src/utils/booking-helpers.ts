/**
 * Booking-related helper utilities
 */

/**
 * Convert technical cancellation/refund reasons to user-friendly messages
 *
 * @param technicalReason - Internal reason code (e.g., "ADMIN_REFUND", "MAINTENANCE")
 * @param fallback - Fallback message if no reason provided
 * @returns User-friendly message suitable for customer emails
 *
 * @example
 * getUserFriendlyReason("ADMIN_REFUND")
 * // Returns: "Refund processed by our team"
 *
 * getUserFriendlyReason("MAINTENANCE_CANCELLATION")
 * // Returns: "Court maintenance scheduled"
 *
 * getUserFriendlyReason(null, "Your booking has been cancelled")
 * // Returns: "Your booking has been cancelled"
 */
export function getUserFriendlyReason(
  technicalReason?: string | null,
  fallback: string = "Your booking has been updated"
): string {
  if (!technicalReason) {
    return fallback;
  }

  // Map technical codes to user-friendly messages
  const reasonMap: Record<string, string> = {
    // Admin/System actions
    ADMIN_REFUND: "Refund processed by our team",
    ADMIN_CANCELLATION: "Cancelled by our team",
    SYSTEM_ERROR: "Technical issue - apologies for the inconvenience",
    SYSTEM_CANCELLATION: "System cancellation",

    // Maintenance related
    MAINTENANCE: "Court maintenance scheduled",
    MAINTENANCE_CANCELLATION: "Court maintenance scheduled",

    // Customer actions
    CUSTOMER_REQUEST: "Cancelled at your request",
    CUSTOMER_CANCELLATION: "Cancelled at your request",

    // Payment issues
    PAYMENT_ERROR: "Payment processing issue",
    PAYMENT_FAILED: "Payment could not be processed",
    DUPLICATE_BOOKING: "Duplicate booking detected",
    INSUFFICIENT_FUNDS: "Payment issue",

    // Court/Facility issues
    COURT_UNAVAILABLE: "Court became unavailable",
    FACILITY_CLOSURE: "Facility temporarily closed",
    EMERGENCY: "Unforeseen circumstances",
    WEATHER: "Adverse weather conditions",
    EQUIPMENT_FAILURE: "Equipment maintenance required",

    // Booking conflicts
    DOUBLE_BOOKING: "Scheduling conflict detected",
    TIME_CONFLICT: "Scheduling conflict",

    // Policy violations
    NO_SHOW: "Missed booking - no show",
    LATE_CANCELLATION: "Late cancellation",
    POLICY_VIOLATION: "Booking policy issue",

    // Other
    RESCHEDULED: "Booking rescheduled",
    FORCE_MAJEURE: "Circumstances beyond our control",
  };

  // Return mapped message if exists
  if (reasonMap[technicalReason]) {
    return reasonMap[technicalReason];
  }

  // Otherwise, try to make the technical reason more readable
  // Convert SNAKE_CASE to Title Case
  return technicalReason
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Get user-friendly booking status text
 *
 * @param status - Technical booking status
 * @returns User-friendly status text
 */
export function getUserFriendlyStatus(status: string): string {
  const statusMap: Record<string, string> = {
    PENDING: "Pending",
    CONFIRMED: "Confirmed",
    CHECKED_IN: "Checked In",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    REFUNDED: "Refunded",
    NO_SHOW: "Missed",
    MAINTENANCE: "Under Maintenance",
  };

  return statusMap[status] || status;
}

/**
 * Get appropriate icon/emoji for cancellation reason
 *
 * @param reason - Technical reason code
 * @returns Emoji that represents the reason
 */
export function getReasonEmoji(reason?: string | null): string {
  if (!reason) return "ℹ️";

  const emojiMap: Record<string, string> = {
    MAINTENANCE: "🔧",
    MAINTENANCE_CANCELLATION: "🔧",
    ADMIN_REFUND: "💰",
    CUSTOMER_REQUEST: "👤",
    WEATHER: "🌧️",
    EMERGENCY: "⚠️",
    PAYMENT_ERROR: "💳",
    COURT_UNAVAILABLE: "🚫",
    RESCHEDULED: "📅",
  };

  return emojiMap[reason] || "ℹ️";
}
