import { Request, Response } from "express";
import prisma from "../../config/db";
import { PricingCacheService } from "../../services/pricing-cache.service";
import {
  getOperatingHoursConfig,
  type OperatingHoursConfig,
} from "../../utils/operating-hours";
import { format, startOfDay, addMonths, addMinutes } from "date-fns";

type TimeSlotPricing = {
  time: string;
  hour: number;
  minutes: number;
  rate: number; // Rate per 30-minute slot
  hourlyRate: number; // Rate per hour (for display)
  isPeak: boolean;
  appliedRule: string;
  isNextDay?: boolean;
};

type CourtPricingSummary = {
  id: string;
  name: string;
  surface: string;
  location: string;
  isActive: boolean;
};

type PricingDisplayData = {
  court: CourtPricingSummary;
  date: string;
  dayOfWeek: string;
  operatingHours: {
    openTime: string;
    closeTime: string;
    isClosed: boolean;
    timezone: string;
  };
  timeSlots: TimeSlotPricing[];
  summary: {
    lowestRate: number;
    highestRate: number;
    peakHours: string[];
    offPeakHours: string[];
  };
};

export class PublicPricingController {
  /**
   * Get public pricing display for a court on a specific date
   * Similar to availability but without booking data - just pricing info
   */
  static async getCourtPricing(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { date } = req.query;

      // Default to today if no date provided
      const dateString = (date as string) || format(new Date(), "yyyy-MM-dd");

      // Parse the date string as local date
      const [year, month, dayOfMonth] = dateString.split("-").map(Number);
      const selectedDate = new Date(year, month - 1, dayOfMonth, 0, 0, 0, 0);
      const today = startOfDay(new Date());
      const maxDate = startOfDay(addMonths(today, 1));

      // Limit to 1 month in advance
      if (selectedDate > maxDate) {
        return res.status(400).json({
          success: false,
          message: "Pricing can only be viewed up to 1 month in advance",
        });
      }

      // Get operating hours
      const operatingHours: OperatingHoursConfig =
        await getOperatingHoursConfig();
      const dayConfig = operatingHours.days.find(
        (d) => d.dayOfWeek === selectedDate.getDay()
      );

      if (!dayConfig) {
        return res.status(500).json({
          success: false,
          message: "Operating hours not configured",
        });
      }

      // Get court info
      const court = await prisma.court.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          surface: true,
          location: true,
          isActive: true,
        },
      });

      if (!court) {
        return res.status(404).json({
          success: false,
          message: "Court not found",
        });
      }

      if (!court.isActive) {
        return res.status(400).json({
          success: false,
          message: "Court is not active",
        });
      }

      const dayOfWeekNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const dayOfWeekName = dayOfWeekNames[selectedDate.getDay()];

      // If closed, return early with empty slots
      if (dayConfig.isClosed) {
        return res.json({
          success: true,
          data: {
            court,
            date: format(selectedDate, "yyyy-MM-dd"),
            dayOfWeek: dayOfWeekName,
            operatingHours: {
              openTime: dayConfig.openTime,
              closeTime: dayConfig.closeTime,
              isClosed: true,
              timezone: operatingHours.timezone,
            },
            timeSlots: [],
            summary: {
              lowestRate: 0,
              highestRate: 0,
              peakHours: [],
              offPeakHours: [],
            },
          },
        });
      }

      // Parse operating hours
      const parseMinutes = (value: string): number => {
        const [h, m] = value.split(":").map(Number);
        return h * 60 + m;
      };

      const openMinutes = parseMinutes(dayConfig.openTime);
      const rawCloseMinutes = parseMinutes(dayConfig.closeTime);
      const closeMinutes =
        rawCloseMinutes <= openMinutes
          ? rawCloseMinutes + 24 * 60
          : rawCloseMinutes;
      const windowStart = openMinutes;
      const windowEnd = closeMinutes;
      const wrapsPastMidnight = rawCloseMinutes <= openMinutes;

      // Fetch pricing rules
      const dayOfWeek = selectedDate.getDay();
      const pricingRules = await PricingCacheService.getActivePricingRules(
        id,
        selectedDate
      );

      // Separate global and court-specific rules
      const globalRules = pricingRules.filter((rule) => !rule.courtId);
      const courtSpecificRules = pricingRules.filter(
        (rule) => rule.courtId === id
      );

      // Helper function to check if a pricing rule applies to a specific day/hour
      const appliesTo = (
        rule: any,
        dayOfWeek: number,
        hour: number
      ): boolean => {
        // Check day of week
        if (rule.dayOfWeek && rule.dayOfWeek.length > 0) {
          if (!rule.dayOfWeek.includes(dayOfWeek)) {
            return false;
          }
        }

        // Check time constraints
        if (rule.startTime && rule.endTime) {
          const [startHour, startMin = 0] = rule.startTime
            .split(":")
            .map(Number);
          const [endHour, endMin = 0] = rule.endTime.split(":").map(Number);

          const currentMinutes = hour * 60;
          const startMinutes = startHour * 60 + startMin;
          let endMinutes = endHour * 60 + endMin;

          // If end time is 00:00, treat it as 24:00 (end of day)
          if (endMinutes === 0) {
            endMinutes = 24 * 60;
          }

          if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
            return false;
          }
        }

        return true;
      };

      // Helper function to apply pricing rule to a base rate
      const applyPricingRule = (baseRate: number, rule: any): number => {
        const priceValue = Number(rule.priceValue);

        switch (rule.pricingType) {
          case "FIXED":
            return priceValue;
          case "PERCENTAGE":
            return baseRate * (1 - priceValue / 100);
          case "MULTIPLIER":
            return baseRate * priceValue;
          case "ADDITION":
            return baseRate + priceValue;
          default:
            return baseRate;
        }
      };

      // Generate time slots
      const timeSlots: TimeSlotPricing[] = [];
      const peakHours: string[] = [];
      const offPeakHours: string[] = [];

      for (let minute = windowStart; minute < windowEnd; minute += 30) {
        const slotStart = addMinutes(selectedDate, minute);
        const timeString = format(slotStart, "HH:mm");
        const hour = slotStart.getHours();
        const minutes = slotStart.getMinutes();

        // Calculate price based on pricing rules
        let rate = 3000; // Default base rate
        let appliedRule = "Default Rate";
        let isPeak = false;

        // Sort rules by priority and specificity
        const sortedRules = [...courtSpecificRules, ...globalRules].sort(
          (a, b) => {
            if (a.courtId && !b.courtId) return -1;
            if (!a.courtId && b.courtId) return 1;
            return Number(b.priority) - Number(a.priority);
          }
        );

        // Apply the first matching rule
        for (const rule of sortedRules) {
          if (appliesTo(rule, dayOfWeek, hour)) {
            if (rule.pricingType === "FIXED") {
              rate = Number(rule.priceValue);
            } else {
              rate = applyPricingRule(rate, rule);
            }
            appliedRule = rule.name;
            isPeak = rule.isPeak || false;
            break;
          }
        }

        // Rate is hourly, so slot rate is half
        const slotRate = Math.round(rate / 2);
        const isNextDay = slotStart.getDate() !== selectedDate.getDate();

        timeSlots.push({
          time: timeString,
          hour,
          minutes,
          rate: slotRate,
          hourlyRate: rate,
          isPeak,
          appliedRule,
          isNextDay,
        });

        // Track peak/off-peak hours
        const timeLabel = format(slotStart, "h:mm a");
        if (isPeak) {
          if (!peakHours.includes(timeLabel)) {
            peakHours.push(timeLabel);
          }
        } else {
          if (!offPeakHours.includes(timeLabel)) {
            offPeakHours.push(timeLabel);
          }
        }
      }

      // Sort slots properly for wrap-midnight scenarios
      timeSlots.sort((a, b) => {
        const normalize = (slot: TimeSlotPricing) => {
          const base = slot.hour * 60 + (slot.minutes || 0);
          if (wrapsPastMidnight && base < openMinutes) {
            return base + 24 * 60;
          }
          return base;
        };
        return normalize(a) - normalize(b);
      });

      // Calculate summary
      const rates = timeSlots.map((s) => s.hourlyRate);
      const lowestRate = Math.min(...rates);
      const highestRate = Math.max(...rates);

      return res.json({
        success: true,
        data: {
          court,
          date: format(selectedDate, "yyyy-MM-dd"),
          dayOfWeek: dayOfWeekName,
          operatingHours: {
            openTime: dayConfig.openTime,
            closeTime: dayConfig.closeTime,
            isClosed: false,
            timezone: operatingHours.timezone,
          },
          timeSlots,
          summary: {
            lowestRate,
            highestRate,
            peakHours,
            offPeakHours,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching public court pricing:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch pricing",
      });
    }
  }

  /**
   * Get all courts with their pricing summary for the homepage
   */
  static async getAllCourtsPricing(req: Request, res: Response) {
    try {
      const { date } = req.query;

      // Default to today if no date provided
      const dateString = (date as string) || format(new Date(), "yyyy-MM-dd");

      // Parse the date string
      const [year, month, dayOfMonth] = dateString.split("-").map(Number);
      const selectedDate = new Date(year, month - 1, dayOfMonth, 0, 0, 0, 0);
      const today = startOfDay(new Date());
      const maxDate = startOfDay(addMonths(today, 1));

      // Limit to 1 month in advance
      if (selectedDate > maxDate) {
        return res.status(400).json({
          success: false,
          message: "Pricing can only be viewed up to 1 month in advance",
        });
      }

      // Get operating hours
      const operatingHours: OperatingHoursConfig =
        await getOperatingHoursConfig();
      const dayConfig = operatingHours.days.find(
        (d) => d.dayOfWeek === selectedDate.getDay()
      );

      if (!dayConfig) {
        return res.status(500).json({
          success: false,
          message: "Operating hours not configured",
        });
      }

      // Get all active courts
      const courts = await prisma.court.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          surface: true,
          location: true,
          isActive: true,
        },
        orderBy: { displayOrder: "asc" },
      });

      const dayOfWeekNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const dayOfWeekName = dayOfWeekNames[selectedDate.getDay()];

      // If closed, return courts with no pricing info
      if (dayConfig.isClosed) {
        return res.json({
          success: true,
          data: {
            date: format(selectedDate, "yyyy-MM-dd"),
            dayOfWeek: dayOfWeekName,
            operatingHours: {
              openTime: dayConfig.openTime,
              closeTime: dayConfig.closeTime,
              isClosed: true,
              timezone: operatingHours.timezone,
            },
            courts: courts.map((court) => ({
              ...court,
              lowestRate: 0,
              highestRate: 0,
              hasPeakHours: false,
            })),
            pricingSummary: {
              lowestRate: 0,
              highestRate: 0,
              peakTimeRanges: [],
              offPeakTimeRanges: [],
            },
          },
        });
      }

      // Parse operating hours
      const parseMinutes = (value: string): number => {
        const [h, m] = value.split(":").map(Number);
        return h * 60 + m;
      };

      const openMinutes = parseMinutes(dayConfig.openTime);
      const rawCloseMinutes = parseMinutes(dayConfig.closeTime);
      const closeMinutes =
        rawCloseMinutes <= openMinutes
          ? rawCloseMinutes + 24 * 60
          : rawCloseMinutes;
      const windowStart = openMinutes;
      const windowEnd = closeMinutes;

      // Fetch all pricing rules for the date
      const dayOfWeek = selectedDate.getDay();
      const pricingRules = await PricingCacheService.getActivePricingRules(
        undefined,
        selectedDate
      );

      // Helper function to check if a pricing rule applies
      const appliesTo = (
        rule: any,
        courtId: string,
        dayOfWeek: number,
        hour: number
      ): boolean => {
        // Check court specificity
        if (rule.courtId && rule.courtId !== courtId) {
          return false;
        }

        // Check day of week
        if (rule.dayOfWeek && rule.dayOfWeek.length > 0) {
          if (!rule.dayOfWeek.includes(dayOfWeek)) {
            return false;
          }
        }

        // Check time constraints
        if (rule.startTime && rule.endTime) {
          const [startHour, startMin = 0] = rule.startTime
            .split(":")
            .map(Number);
          const [endHour, endMin = 0] = rule.endTime.split(":").map(Number);

          const currentMinutes = hour * 60;
          const startMinutes = startHour * 60 + startMin;
          let endMinutes = endHour * 60 + endMin;

          if (endMinutes === 0) {
            endMinutes = 24 * 60;
          }

          if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
            return false;
          }
        }

        return true;
      };

      // Helper to apply pricing rule
      const applyPricingRule = (baseRate: number, rule: any): number => {
        const priceValue = Number(rule.priceValue);
        switch (rule.pricingType) {
          case "FIXED":
            return priceValue;
          case "PERCENTAGE":
            return baseRate * (1 - priceValue / 100);
          case "MULTIPLIER":
            return baseRate * priceValue;
          case "ADDITION":
            return baseRate + priceValue;
          default:
            return baseRate;
        }
      };

      // Calculate pricing for each court
      let globalLowest = Infinity;
      let globalHighest = 0;
      const peakTimeRanges: string[] = [];
      const offPeakTimeRanges: string[] = [];
      const seenPeakRanges = new Set<string>();
      const seenOffPeakRanges = new Set<string>();

      const courtsWithPricing = courts.map((court) => {
        let lowestRate = Infinity;
        let highestRate = 0;
        let hasPeakHours = false;

        // Check each time slot
        for (let minute = windowStart; minute < windowEnd; minute += 30) {
          const slotStart = addMinutes(selectedDate, minute);
          const hour = slotStart.getHours();

          let rate = 3000; // Default base rate
          let isPeak = false;

          // Sort and apply rules
          const sortedRules = pricingRules
            .filter((rule) => !rule.courtId || rule.courtId === court.id)
            .sort((a, b) => {
              if (a.courtId && !b.courtId) return -1;
              if (!a.courtId && b.courtId) return 1;
              return Number(b.priority) - Number(a.priority);
            });

          for (const rule of sortedRules) {
            if (appliesTo(rule, court.id, dayOfWeek, hour)) {
              if (rule.pricingType === "FIXED") {
                rate = Number(rule.priceValue);
              } else {
                rate = applyPricingRule(rate, rule);
              }
              isPeak = rule.isPeak || false;

              // Track time ranges for peak/off-peak
              const timeLabel =
                rule.startTime && rule.endTime
                  ? `${rule.startTime} - ${rule.endTime}`
                  : "All Day";

              if (isPeak && !seenPeakRanges.has(timeLabel)) {
                seenPeakRanges.add(timeLabel);
                peakTimeRanges.push(timeLabel);
              } else if (!isPeak && !seenOffPeakRanges.has(timeLabel)) {
                seenOffPeakRanges.add(timeLabel);
                offPeakTimeRanges.push(timeLabel);
              }

              break;
            }
          }

          if (rate < lowestRate) lowestRate = rate;
          if (rate > highestRate) highestRate = rate;
          if (isPeak) hasPeakHours = true;

          // Update global min/max
          if (rate < globalLowest) globalLowest = rate;
          if (rate > globalHighest) globalHighest = rate;
        }

        // Handle case where no slots were generated
        if (lowestRate === Infinity) lowestRate = 0;
        if (highestRate === 0) highestRate = 0;

        return {
          ...court,
          lowestRate,
          highestRate,
          hasPeakHours,
        };
      });

      // Handle global defaults
      if (globalLowest === Infinity) globalLowest = 0;

      return res.json({
        success: true,
        data: {
          date: format(selectedDate, "yyyy-MM-dd"),
          dayOfWeek: dayOfWeekName,
          operatingHours: {
            openTime: dayConfig.openTime,
            closeTime: dayConfig.closeTime,
            isClosed: false,
            timezone: operatingHours.timezone,
          },
          courts: courtsWithPricing,
          pricingSummary: {
            lowestRate: globalLowest,
            highestRate: globalHighest,
            peakTimeRanges,
            offPeakTimeRanges,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching all courts pricing:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch pricing",
      });
    }
  }
}
