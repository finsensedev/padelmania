import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../../config/db";
import {
  validateSlotConfig,
  clearConfigCache,
  getBookingSlotConfig,
} from "../../utils/booking-config";
import {
  clearOperatingHoursCache,
  DEFAULT_OPERATING_HOURS,
  getOperatingHoursConfig,
  validateOperatingHoursConfig,
} from "../../utils/operating-hours";

export class SystemConfigController {
  /**
   * Get booking slot durations configuration
   * GET /admin/system-config/booking-slots
   */
  static async getBookingSlots(req: Request, res: Response) {
    try {
      const config = await getBookingSlotConfig();

      return res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      console.error("Error fetching booking slot config:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch booking slot configuration",
      });
    }
  }

  /**
   * Update booking slot durations configuration
   * PUT /admin/system-config/booking-slots
   */
  static async updateBookingSlots(req: Request, res: Response) {
    try {
      const { allowedDurations, defaultDuration, minDuration, maxDuration } =
        req.body;

      // Build config object
      const config: any = {};
      if (allowedDurations !== undefined)
        config.allowedDurations = allowedDurations;
      if (defaultDuration !== undefined)
        config.defaultDuration = defaultDuration;
      if (minDuration !== undefined) config.minDuration = minDuration;
      if (maxDuration !== undefined) config.maxDuration = maxDuration;

      // Validate configuration
      const validation = validateSlotConfig(config);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Invalid configuration",
          errors: validation.errors,
        });
      }

      // Check if setting exists
      const existing = await prisma.systemSetting.findUnique({
        where: { key: "BOOKING_SLOT_DURATIONS" },
      });

      let updated;
      if (existing) {
        // Merge with existing config
        const currentConfig = (existing.value as any) || {};
        const mergedConfig = { ...currentConfig, ...config };

        updated = await prisma.systemSetting.update({
          where: { key: "BOOKING_SLOT_DURATIONS" },
          data: {
            value: mergedConfig,
            updatedAt: new Date(),
          },
        });
      } else {
        // Create new setting
        updated = await prisma.systemSetting.create({
          data: {
            key: "BOOKING_SLOT_DURATIONS",
            value: config,
            type: "json",
            category: "BOOKING",
            description: "Configurable booking slot duration options",
            isPublic: true,
          },
        });
      }

      // Clear cache so next request gets fresh data
      clearConfigCache();

      return res.json({
        success: true,
        data: updated.value,
        message: "Booking slot configuration updated successfully",
      });
    } catch (error) {
      console.error("Error updating booking slot config:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update booking slot configuration",
      });
    }
  }

  /**
   * Reset booking slot configuration to defaults
   * POST /admin/system-config/booking-slots/reset
   */
  static async resetBookingSlots(req: Request, res: Response) {
    try {
      const defaultConfig = {
        allowedDurations: [60, 120, 180],
        defaultDuration: 60,
        minDuration: 60,
        maxDuration: 180,
      };

      const existing = await prisma.systemSetting.findUnique({
        where: { key: "BOOKING_SLOT_DURATIONS" },
      });

      let updated;
      if (existing) {
        updated = await prisma.systemSetting.update({
          where: { key: "BOOKING_SLOT_DURATIONS" },
          data: {
            value: defaultConfig,
            updatedAt: new Date(),
          },
        });
      } else {
        updated = await prisma.systemSetting.create({
          data: {
            key: "BOOKING_SLOT_DURATIONS",
            value: defaultConfig,
            type: "json",
            category: "BOOKING",
            description: "Configurable booking slot duration options",
            isPublic: true,
          },
        });
      }

      clearConfigCache();

      return res.json({
        success: true,
        data: updated.value,
        message: "Booking slot configuration reset to defaults",
      });
    } catch (error) {
      console.error("Error resetting booking slot config:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to reset booking slot configuration",
      });
    }
  }

  /**
   * Get facility operating hours configuration
   * GET /admin/system-config/operating-hours
   */
  static async getOperatingHours(req: Request, res: Response) {
    try {
      const config = await getOperatingHoursConfig();

      return res.json({ success: true, data: config });
    } catch (error) {
      console.error("Error fetching operating hours config:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch operating hours configuration",
      });
    }
  }

  /**
   * Update facility operating hours configuration
   * PUT /admin/system-config/operating-hours
   */
  static async updateOperatingHours(req: Request, res: Response) {
    try {
      const payload = req.body;
      const validation = validateOperatingHoursConfig(payload);

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Invalid configuration",
          errors: validation.errors,
        });
      }

      const existing = await prisma.systemSetting.findUnique({
        where: { key: "FACILITY_OPERATING_HOURS" },
      });

      const data = {
        key: "FACILITY_OPERATING_HOURS",
        value: payload as unknown as Prisma.InputJsonValue,
        type: "json",
        category: "OPERATIONS",
        description: "Facility operating hours (per day)",
        isPublic: true,
      } as const;

      const updated = existing
        ? await prisma.systemSetting.update({ where: { key: data.key }, data })
        : await prisma.systemSetting.create({ data });

      clearOperatingHoursCache();

      return res.json({
        success: true,
        data: updated.value,
        message: "Operating hours updated successfully",
      });
    } catch (error) {
      console.error("Error updating operating hours config:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update operating hours configuration",
      });
    }
  }

  /**
   * Reset facility operating hours configuration to defaults
   * POST /admin/system-config/operating-hours/reset
   */
  static async resetOperatingHours(req: Request, res: Response) {
    try {
      const existing = await prisma.systemSetting.findUnique({
        where: { key: "FACILITY_OPERATING_HOURS" },
      });

      const data = {
        key: "FACILITY_OPERATING_HOURS",
        value: DEFAULT_OPERATING_HOURS as unknown as Prisma.InputJsonValue,
        type: "json",
        category: "OPERATIONS",
        description: "Facility operating hours (per day)",
        isPublic: true,
      } as const;

      const saved = existing
        ? await prisma.systemSetting.update({ where: { key: data.key }, data })
        : await prisma.systemSetting.create({ data });

      clearOperatingHoursCache();

      return res.json({
        success: true,
        data: saved.value,
        message: "Operating hours reset to defaults",
      });
    } catch (error) {
      console.error("Error resetting operating hours config:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to reset operating hours configuration",
      });
    }
  }
}
