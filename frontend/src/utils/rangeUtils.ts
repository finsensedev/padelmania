import { getRangeBounds, type Range } from "src/utils/dateRange";

export type ExtendedRange = "DAY" | "WEEK" | "MONTH" | "YEAR" | "CUSTOM";

export interface CustomDateBounds {
  customFrom: string; // YYYY-MM-DD
  customTo: string;
}

/**
 * Returns true when the current selection represents a valid / queryable range.
 * Use this to gate `useQuery({ enabled })`.
 */
export function isRangeValid(
  range: ExtendedRange,
  dates: CustomDateBounds,
): boolean {
  if (range !== "CUSTOM") return true;
  return !!(
    dates.customFrom &&
    dates.customTo &&
    dates.customFrom <= dates.customTo
  );
}

/**
 * Converts an ExtendedRange + optional custom dates into startDate/endDate ISO strings,
 * compatible with `getRangeBounds` output shape.
 */
export function getExtendedRangeBounds(
  range: ExtendedRange,
  dates: CustomDateBounds,
): { startDate: string; endDate: string } {
  if (range === "CUSTOM" && dates.customFrom && dates.customTo) {
    const start = new Date(dates.customFrom);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dates.customTo);
    end.setHours(23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  // Delegate to the original getRangeBounds for preset ranges
  return getRangeBounds(range as Range);
}
