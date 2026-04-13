import prisma from "../config/db";
import {
  BookingPriceBreakdown,
  AppliedPricingRule,
  HourlyPriceBreakdown,
  EquipmentBreakdown,
} from "../types/booking.types";

interface CalculatePriceBreakdownParams {
  courtId: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  equipmentRentals?: Array<{
    type: string;
    name: string;
    quantity: number;
    pricePerUnit: number;
  }>;
  baseHourlyRate: number;
}

/**
 * Calculate detailed price breakdown for a booking
 * This should be called during booking creation to store the breakdown
 */
export async function calculatePriceBreakdown(
  params: CalculatePriceBreakdownParams
): Promise<BookingPriceBreakdown> {
  const {
    courtId,
    startTime,
    endTime,
    durationMinutes,
    equipmentRentals = [],
    baseHourlyRate,
  } = params;

  const durationHours = Math.ceil(durationMinutes / 60);
  const appliedRules: AppliedPricingRule[] = [];
  const hourlyBreakdown: HourlyPriceBreakdown[] = [];
  let courtSubtotal = 0;

  // Calculate cost for each hour (or partial hour)
  for (let i = 0; i < durationHours; i++) {
    const currentSlotStart = new Date(startTime.getTime() + i * 60 * 60 * 1000);
    const dayOfWeek = currentSlotStart.getDay();
    const timeString = currentSlotStart.toTimeString().slice(0, 5);

    // Fetch applicable pricing rules for this hour - fetch all active rules and filter manually
    // to handle midnight wraparound (00:00 should be treated as 24:00 for comparison)
    const allRules = await prisma.pricingRule.findMany({
      where: {
        isActive: true,
        OR: [{ courtId: courtId }, { courtId: null }],
        AND: [
          {
            OR: [
              { dayOfWeek: { isEmpty: true } },
              { dayOfWeek: { has: dayOfWeek } },
            ],
          },
          {
            OR: [{ validFrom: null }, { validFrom: { lte: currentSlotStart } }],
          },
          {
            OR: [
              { validUntil: null },
              { validUntil: { gte: currentSlotStart } },
            ],
          },
        ],
      },
      orderBy: { priority: "desc" },
    });

    // Filter rules manually to handle midnight wraparound
    const rules = allRules.filter((rule) => {
      // If no time restriction, rule applies
      if (!rule.startTime && !rule.endTime) return true;
      if (!rule.startTime || !rule.endTime) return false;

      const ruleStart = rule.startTime;
      const ruleEnd = rule.endTime;

      // Handle midnight wraparound: if endTime is "00:00", treat it as "24:00"
      if (ruleEnd === "00:00") {
        // Rule spans across midnight (e.g., 22:00 - 00:00)
        // Time matches if: time >= startTime OR time < 00:00
        return timeString >= ruleStart || timeString < "00:00";
      } else if (ruleStart > ruleEnd) {
        // Rule wraps around midnight (e.g., 23:00 - 02:00)
        return timeString >= ruleStart || timeString <= ruleEnd;
      } else {
        // Normal case: rule doesn't wrap around midnight
        return timeString >= ruleStart && timeString <= ruleEnd;
      }
    });

    let hourlyPrice = baseHourlyRate;
    const baseRate = baseHourlyRate;

    // Apply the highest priority rule (if any)
    if (rules.length > 0) {
      const rule = rules[0];

      switch (rule.pricingType) {
        case "FIXED":
          hourlyPrice = Number(rule.priceValue);
          break;
        case "PERCENTAGE":
          hourlyPrice = hourlyPrice * (1 - Number(rule.priceValue) / 100);
          break;
        case "MULTIPLIER":
          hourlyPrice = hourlyPrice * Number(rule.priceValue);
          break;
        case "ADDITION":
          hourlyPrice = hourlyPrice + Number(rule.priceValue);
          break;
      }

      // Record the applied rule
      appliedRules.push({
        ruleId: rule.id,
        name: rule.name || "Unnamed Rule",
        type: rule.pricingType as any,
        value: Number(rule.priceValue),
        hourIndex: i,
        priority: rule.priority,
      });
    }

    // Pro-rate the last hour if it's partial
    const isLastHour = i === durationHours - 1;
    const remainingMinutes = durationMinutes - i * 60;
    const minutesInThisSlot =
      isLastHour && remainingMinutes < 60 ? remainingMinutes : 60;
    const proRatedPrice = (hourlyPrice / 60) * minutesInThisSlot;

    // Record hourly breakdown
    hourlyBreakdown.push({
      hour: i,
      startTime: currentSlotStart.toISOString(),
      baseRate,
      finalRate: hourlyPrice,
      amount: proRatedPrice,
      durationMinutes: minutesInThisSlot,
      dayOfWeek,
      isPeakTime: rules.length > 0,
    });

    courtSubtotal += proRatedPrice;
  }

  // Calculate equipment subtotal (equipment is priced per hour)
  const equipment: EquipmentBreakdown[] = equipmentRentals.map((rental) => ({
    type: rental.type,
    name: rental.name,
    quantity: rental.quantity,
    pricePerUnit: rental.pricePerUnit,
    subtotal: rental.quantity * rental.pricePerUnit * durationHours,
  }));

  const equipmentSubtotal = equipment.reduce(
    (sum, item) => sum + item.subtotal,
    0
  );

  const totalAmount = courtSubtotal + equipmentSubtotal;

  return {
    courtSubtotal,
    equipmentSubtotal,
    appliedRules,
    hourlyBreakdown,
    equipment,
    totalAmount,
    currency: "KES",
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Compare two price breakdowns to see if court costs match
 * Used during reschedule to ensure same pricing
 */
export function priceBreakdownsMatch(
  breakdown1: BookingPriceBreakdown,
  breakdown2: BookingPriceBreakdown,
  tolerance: number = 1
): { matches: boolean; difference: number; message?: string } {
  const diff = Math.abs(breakdown1.courtSubtotal - breakdown2.courtSubtotal);
  const matches = diff <= tolerance;

  if (!matches) {
    const avgRate1 =
      breakdown1.courtSubtotal / breakdown1.hourlyBreakdown.length;
    const avgRate2 =
      breakdown2.courtSubtotal / breakdown2.hourlyBreakdown.length;

    return {
      matches: false,
      difference: diff,
      message: `Price mismatch: The selected time slots cost an average of ${Math.round(
        avgRate2
      )} KES/hour (${Math.round(
        breakdown2.courtSubtotal
      )} KES total), but your original booking was ${Math.round(
        avgRate1
      )} KES/hour (${Math.round(
        breakdown1.courtSubtotal
      )} KES total). You can only reschedule to slots with the same court price.`,
    };
  }

  return { matches: true, difference: diff };
}
