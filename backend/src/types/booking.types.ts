/**
 * Detailed cost breakdown for a booking
 * Stored in the Booking.priceBreakdown JSON column
 */
export interface BookingPriceBreakdown {
  /** Base court rental cost (sum of all hourly rates) */
  courtSubtotal: number;

  /** Total equipment rental cost */
  equipmentSubtotal: number;

  /** Pricing rules that were applied during calculation */
  appliedRules: AppliedPricingRule[];

  /** Breakdown of cost per hour */
  hourlyBreakdown: HourlyPriceBreakdown[];

  /** Detailed equipment rental information */
  equipment: EquipmentBreakdown[];

  /** Final total amount (should match Booking.totalAmount) */
  totalAmount: number;

  /** Currency code (e.g., "KES") */
  currency: string;

  /** ISO timestamp when this breakdown was calculated */
  calculatedAt: string;
}

/**
 * A pricing rule that was applied to a specific hour
 */
export interface AppliedPricingRule {
  /** ID of the pricing rule */
  ruleId: string;

  /** Name/description of the rule */
  name: string;

  /** Type of pricing adjustment */
  type: "FIXED" | "PERCENTAGE" | "MULTIPLIER" | "ADDITION";

  /** The value of the adjustment */
  value: number;

  /** Which hour (0-based index) this rule was applied to */
  hourIndex: number;

  /** Priority of the rule (higher = more important) */
  priority: number;
}

/**
 * Cost breakdown for a single hour of booking
 */
export interface HourlyPriceBreakdown {
  /** Hour index (0-based, e.g., 0 for first hour) */
  hour: number;

  /** Start time of this hour slot (ISO string) */
  startTime: string;

  /** Base hourly rate before any rules */
  baseRate: number;

  /** Final rate after applying pricing rules */
  finalRate: number;

  /** Actual amount charged for this slot (pro-rated if partial hour) */
  amount: number;

  /** Duration of this slot in minutes (usually 60, but may be less for last slot) */
  durationMinutes: number;

  /** Day of week (0 = Sunday, 6 = Saturday) */
  dayOfWeek: number;

  /** Whether this hour falls in peak time */
  isPeakTime?: boolean;
}

/**
 * Equipment rental breakdown
 */
export interface EquipmentBreakdown {
  /** Equipment type (e.g., "RACKET", "BALL") */
  type: string;

  /** Equipment name/model */
  name: string;

  /** Quantity rented */
  quantity: number;

  /** Price per unit */
  pricePerUnit: number;

  /** Subtotal for this equipment (quantity * pricePerUnit) */
  subtotal: number;
}

/**
 * Helper function to validate price breakdown structure
 */
export function isValidPriceBreakdown(
  breakdown: any
): breakdown is BookingPriceBreakdown {
  return (
    breakdown &&
    typeof breakdown === "object" &&
    typeof breakdown.courtSubtotal === "number" &&
    typeof breakdown.equipmentSubtotal === "number" &&
    typeof breakdown.totalAmount === "number" &&
    typeof breakdown.currency === "string" &&
    typeof breakdown.calculatedAt === "string" &&
    Array.isArray(breakdown.appliedRules) &&
    Array.isArray(breakdown.hourlyBreakdown) &&
    Array.isArray(breakdown.equipment)
  );
}

/**
 * Helper to get court subtotal from breakdown or fallback
 */
export function getCourtSubtotal(
  priceBreakdown: any,
  fallback: number
): number {
  if (
    isValidPriceBreakdown(priceBreakdown) &&
    typeof priceBreakdown.courtSubtotal === "number"
  ) {
    return priceBreakdown.courtSubtotal;
  }
  return fallback;
}

/**
 * Helper to get equipment subtotal from breakdown or fallback
 */
export function getEquipmentSubtotal(
  priceBreakdown: any,
  fallback: number
): number {
  if (
    isValidPriceBreakdown(priceBreakdown) &&
    typeof priceBreakdown.equipmentSubtotal === "number"
  ) {
    return priceBreakdown.equipmentSubtotal;
  }
  return fallback;
}
