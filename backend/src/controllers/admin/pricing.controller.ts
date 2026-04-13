import { Request, Response } from "express";
import { PrismaClient, PricingRule } from "@prisma/client";
import { validationResult } from "express-validator";
import { PricingCacheService } from "../../services/pricing-cache.service";

const prisma = new PrismaClient();

export class PricingController {
  private static filterRulesByTime(
    rules: PricingRule[],
    timeString: string
  ): PricingRule[] {
    return rules.filter((rule) => {
      if (!rule.startTime && !rule.endTime) return true;
      if (!rule.startTime || !rule.endTime) return false;

      const ruleStart = rule.startTime;
      const ruleEnd = rule.endTime;

      if (ruleEnd === "00:00") {
        return timeString >= ruleStart || timeString < "00:00";
      }

      if (ruleStart > ruleEnd) {
        return timeString >= ruleStart || timeString <= ruleEnd;
      }

      return timeString >= ruleStart && timeString <= ruleEnd;
    });
  }

  private static adjustUnitPrice(
    base: number,
    type?: string | null,
    value?: unknown
  ): number {
    if (!type || value === null || value === undefined) return base;

    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) return base;

    switch (type) {
      case "FIXED":
        return numericValue;
      case "PERCENTAGE":
        return base * (1 - numericValue / 100);
      case "MULTIPLIER":
        return base * numericValue;
      case "ADDITION":
        return base + numericValue;
      default:
        return base;
    }
  }

  // Get all pricing rules
  static async getPricingRules(req: Request, res: Response) {
    try {
      const { courtId, isActive } = req.query;

      const where: any = {};
      // When filtering by courtId, include rules specific to that court OR rules that apply to all courts (courtId = null)
      if (courtId) {
        where.OR = [{ courtId: courtId }, { courtId: null }];
      }
      if (isActive !== undefined) where.isActive = isActive === "true";

      const rules = await prisma.pricingRule.findMany({
        where,
        include: {
          court: true,
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      });

      res.json({
        success: true,
        data: rules,
      });
    } catch (error) {
      console.error("Get pricing rules error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch pricing rules",
      });
    }
  }

  // Create pricing rule
  static async createPricingRule(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const {
        name,
        description,
        courtId,
        dayOfWeek,
        startTime,
        endTime,
        pricingType,
        priceValue,
        racketPricingType,
        racketPriceValue,
        ballsPricingType,
        ballsPriceValue,
        priority,
        isActive,
        isPeak,
        validFrom,
        validUntil,
        membershipTiers,
      } = req.body;

      const rule = await prisma.pricingRule.create({
        data: {
          name,
          description,
          courtId: courtId || null,
          dayOfWeek: dayOfWeek || [],
          startTime,
          endTime,
          pricingType,
          priceValue,
          racketPricingType: racketPricingType || null,
          racketPriceValue: racketPriceValue ?? null,
          ballsPricingType: ballsPricingType || null,
          ballsPriceValue: ballsPriceValue ?? null,
          priority: priority || 0,
          isActive: isActive !== false,
          isPeak: isPeak || false,
          validFrom: validFrom ? new Date(validFrom) : null,
          validUntil: validUntil ? new Date(validUntil) : null,
          membershipTiers: membershipTiers || [],
        },
        include: {
          court: true,
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: (req as any).user?.id,
          action: "CREATE",
          entity: "PricingRule",
          entityId: rule.id,
          newData: rule,
        },
      });

      // Clear pricing cache to ensure new rule is used immediately
      PricingCacheService.clearCache();

      res.status(201).json({
        success: true,
        data: rule,
      });
    } catch (error) {
      console.error("Create pricing rule error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create pricing rule",
      });
    }
  }

  // Update pricing rule
  static async updatePricingRule(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        description,
        courtId,
        dayOfWeek,
        startTime,
        endTime,
        pricingType,
        priceValue,
        racketPricingType,
        racketPriceValue,
        ballsPricingType,
        ballsPriceValue,
        priority,
        isActive,
        isPeak,
        validFrom,
        validUntil,
        membershipTiers,
      } = req.body;

      const existingRule = await prisma.pricingRule.findUnique({
        where: { id },
      });

      if (!existingRule) {
        return res.status(404).json({
          success: false,
          message: "Pricing rule not found",
        });
      }

      // Build update data object with only the fields that can be updated
      const updateData: any = {};

      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (courtId !== undefined)
        updateData.courtId = courtId === "" ? null : courtId;
      if (dayOfWeek !== undefined) updateData.dayOfWeek = dayOfWeek || [];
      if (startTime !== undefined) updateData.startTime = startTime || null;
      if (endTime !== undefined) updateData.endTime = endTime || null;
      if (pricingType !== undefined) updateData.pricingType = pricingType;
      if (priceValue !== undefined) updateData.priceValue = priceValue;
      if (racketPricingType !== undefined)
        updateData.racketPricingType = racketPricingType || null;
      if (racketPriceValue !== undefined)
        updateData.racketPriceValue = racketPriceValue ?? null;
      if (ballsPricingType !== undefined)
        updateData.ballsPricingType = ballsPricingType || null;
      if (ballsPriceValue !== undefined)
        updateData.ballsPriceValue = ballsPriceValue ?? null;
      if (priority !== undefined) updateData.priority = priority;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (isPeak !== undefined) updateData.isPeak = isPeak;
      if (validFrom !== undefined)
        updateData.validFrom = validFrom ? new Date(validFrom) : null;
      if (validUntil !== undefined)
        updateData.validUntil = validUntil ? new Date(validUntil) : null;
      if (membershipTiers !== undefined)
        updateData.membershipTiers = membershipTiers || [];

      const updatedRule = await prisma.pricingRule.update({
        where: { id },
        data: updateData,
        include: {
          court: true,
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: (req as any).user?.id,
          action: "UPDATE",
          entity: "PricingRule",
          entityId: id,
          oldData: existingRule,
          newData: updatedRule,
        },
      });

      // Clear pricing cache
      PricingCacheService.clearCache();

      res.json({
        success: true,
        data: updatedRule,
      });
    } catch (error) {
      console.error("Update pricing rule error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update pricing rule",
      });
    }
  }

  // Delete pricing rule
  static async deletePricingRule(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const rule = await prisma.pricingRule.findUnique({
        where: { id },
      });

      if (!rule) {
        return res.status(404).json({
          success: false,
          message: "Pricing rule not found",
        });
      }

      await prisma.pricingRule.delete({
        where: { id },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: (req as any).user?.id,
          action: "DELETE",
          entity: "PricingRule",
          entityId: id,
          oldData: rule,
        },
      });

      // Clear pricing cache
      PricingCacheService.clearCache();

      res.json({
        success: true,
        message: "Pricing rule deleted successfully",
      });
    } catch (error) {
      console.error("Delete pricing rule error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete pricing rule",
      });
    }
  }

  // Bulk update court prices
  static async bulkUpdatePrices(req: Request, res: Response) {
    try {
      const { courtIds, updateType, value, priceTypes } = req.body;

      if (!courtIds?.length || !priceTypes?.length) {
        return res.status(400).json({
          success: false,
          message: "Court IDs and price types are required",
        });
      }

      const courts = await prisma.court.findMany({
        where: { id: { in: courtIds } },
      });

      const updates = [];
      for (const court of courts) {
        const updateData: any = {};

        for (const priceType of priceTypes) {
          let fieldName = "";
          let currentValue = 0;

          switch (priceType) {
            case "base":
              fieldName = "baseHourlyRate";
              currentValue = Number(court.baseHourlyRate);
              break;
            case "peak":
              fieldName = "peakHourlyRate";
              currentValue = Number(court.peakHourlyRate);
              break;
            case "weekend":
              fieldName = "weekendRate";
              currentValue = Number(court.weekendRate);
              break;
          }

          if (fieldName) {
            if (updateType === "PERCENTAGE") {
              updateData[fieldName] = currentValue * (1 + value / 100);
            } else {
              updateData[fieldName] = currentValue + value;
            }
          }
        }

        updates.push(
          prisma.court.update({
            where: { id: court.id },
            data: updateData,
          })
        );
      }

      await prisma.$transaction(updates);

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: (req as any).user?.id,
          action: "BULK_UPDATE_PRICES",
          entity: "Court",
          entityId: courtIds.join(","),
          newData: { updateType, value, priceTypes },
        },
      });

      res.json({
        success: true,
        message: `Updated prices for ${courtIds.length} courts`,
      });
    } catch (error) {
      console.error("Bulk update prices error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update prices",
      });
    }
  }

  // Get pricing history
  static async getPricingHistory(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const history = await prisma.auditLog.findMany({
        where: {
          OR: [
            { entity: "PricingRule" },
            { entity: "Court", action: "BULK_UPDATE_PRICES" },
          ],
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      });

      const total = await prisma.auditLog.count({
        where: {
          OR: [
            { entity: "PricingRule" },
            { entity: "Court", action: "BULK_UPDATE_PRICES" },
          ],
        },
      });

      res.json({
        success: true,
        data: history,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Get pricing history error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch pricing history",
      });
    }
  }

  static async getEquipmentUnitPrice(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { date, time } = req.query;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Court ID is required",
        });
      }

      if (typeof date !== "string" || typeof time !== "string") {
        return res.status(400).json({
          success: false,
          message: "date and time query parameters are required",
        });
      }

      const dateString = date.trim();
      const timeString = time.trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format. Use YYYY-MM-DD",
        });
      }

      if (!/^\d{2}:\d{2}$/.test(timeString)) {
        return res.status(400).json({
          success: false,
          message: "Invalid time format. Use HH:mm",
        });
      }

      const reference = new Date(`${dateString}T${timeString}:00`);
      if (Number.isNaN(reference.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date or time provided",
        });
      }

      const court = await prisma.court.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!court) {
        return res.status(404).json({
          success: false,
          message: "Court not found",
        });
      }

      const dayOfWeek = reference.getDay();

      const allRules = await prisma.pricingRule.findMany({
        where: {
          isActive: true,
          OR: [{ courtId: id }, { courtId: null }],
          AND: [
            {
              OR: [
                { dayOfWeek: { isEmpty: true } },
                { dayOfWeek: { has: dayOfWeek } },
              ],
            },
          ],
        },
        orderBy: { priority: "desc" },
      });

      const rules = PricingController.filterRulesByTime(allRules, timeString);
      const appliedRule = rules[0] || null;

      const [racketEquipment, activeBallEquipments] = await Promise.all([
        prisma.equipment.findFirst({
          where: { type: "RACKET" },
          orderBy: { createdAt: "asc" },
        }),
        prisma.equipment.findMany({
          where: { type: "BALLS", isActive: true },
          orderBy: [{ rentalPrice: "asc" }, { name: "asc" }],
        }),
      ]);

      let ballEquipments = activeBallEquipments;

      if (ballEquipments.length === 0) {
        const fallbackBall = await prisma.equipment.findFirst({
          where: { type: "BALLS" },
          orderBy: { createdAt: "asc" },
        });

        if (fallbackBall) {
          ballEquipments = [fallbackBall];
        }
      }

      const racketUnitBase = racketEquipment
        ? Number(racketEquipment.rentalPrice)
        : 300;

      const racketUnitPrice = PricingController.adjustUnitPrice(
        racketUnitBase,
        appliedRule?.racketPricingType,
        appliedRule?.racketPriceValue
      );

      const ballOptions = ballEquipments.map((equipment) => {
        const base = Number(equipment.rentalPrice) || 1000;
        // Skip FIXED pricing rules for individual ball options to preserve price differences
        const finalPrice =
          appliedRule?.ballsPricingType &&
          appliedRule.ballsPricingType !== "FIXED"
            ? PricingController.adjustUnitPrice(
                base,
                appliedRule.ballsPricingType,
                appliedRule.ballsPriceValue
              )
            : base;

        return {
          id: equipment.id,
          name: equipment.name,
          brand: equipment.brand,
          unitBase: base,
          unitFinal: finalPrice,
          isActive: equipment.isActive,
          availableQty: equipment.availableQty,
        };
      });

      if (ballOptions.length === 0) {
        // Skip FIXED pricing rules for default ball option
        const defaultFinal =
          appliedRule?.ballsPricingType &&
          appliedRule.ballsPricingType !== "FIXED"
            ? PricingController.adjustUnitPrice(
                1000,
                appliedRule.ballsPricingType,
                appliedRule.ballsPriceValue
              )
            : 1000;

        ballOptions.push({
          id: "default-balls",
          name: "Standard Balls",
          brand: "Generic",
          unitBase: 1000,
          unitFinal: defaultFinal,
          isActive: true,
          availableQty: 999,
        });
      }

      const ballsUnitBase = ballOptions[0].unitBase;
      const ballsUnitPrice = ballOptions[0].unitFinal;

      res.json({
        success: true,
        racketUnitPrice,
        ballsUnitPrice,
        racketUnitBase,
        ballsUnitBase,
        ballOptions,
        appliedRule: appliedRule
          ? {
              id: appliedRule.id,
              name: appliedRule.name,
              priority: appliedRule.priority,
              racketPricingType: appliedRule.racketPricingType,
              ballsPricingType: appliedRule.ballsPricingType,
            }
          : null,
      });
    } catch (error) {
      console.error("Get equipment unit price error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch equipment pricing",
      });
    }
  }

  // Calculate dynamic price
  static async calculatePrice(req: Request, res: Response) {
    try {
      const { courtId, startTime, endTime, userId } = req.body;

      if (!courtId || !startTime || !endTime) {
        return res.status(400).json({
          success: false,
          message: "Court ID, start time, and end time are required",
        });
      }

      const court = await prisma.court.findUnique({
        where: { id: courtId },
      });

      if (!court) {
        return res.status(404).json({
          success: false,
          message: "Court not found",
        });
      }

      const bookingDate = new Date(startTime);
      const dayOfWeek = bookingDate.getDay();
      const timeString = bookingDate.toTimeString().slice(0, 5);

      // Get user's membership tier if userId provided
      let membershipTier = null;
      if (userId) {
        const membership = await prisma.membershipCard.findUnique({
          where: { userId },
        });
        membershipTier = membership?.tier;
      }

      // Find applicable pricing rules - fetch all active rules and filter manually
      // to handle midnight wraparound (00:00 should be treated as 24:00 for comparison)
      const allRules = await prisma.pricingRule.findMany({
        where: {
          isActive: true,
          OR: [
            { courtId: courtId },
            { courtId: null }, // Rules that apply to all courts
          ],
          AND: [
            {
              OR: [
                { dayOfWeek: { isEmpty: true } },
                { dayOfWeek: { has: dayOfWeek } },
              ],
            },
            {
              OR: [
                { membershipTiers: { isEmpty: true } },
                membershipTier
                  ? { membershipTiers: { has: membershipTier } }
                  : {},
              ],
            },
          ],
        },
        orderBy: { priority: "desc" },
      });

      // Filter rules manually to handle midnight wraparound
      const rules = PricingController.filterRulesByTime(allRules, timeString);
      const topRule = rules[0] || null;

      console.log("Pricing calculation debug:", {
        timeString,
        dayOfWeek,
        courtId,
        allRulesCount: allRules.length,
        filteredRulesCount: rules.length,
        topRule: topRule
          ? {
              id: topRule.id,
              name: topRule.name,
              startTime: topRule.startTime,
              endTime: topRule.endTime,
              racketPricingType: topRule.racketPricingType,
              racketPriceValue: topRule.racketPriceValue,
              ballsPricingType: topRule.ballsPricingType,
              ballsPriceValue: topRule.ballsPriceValue,
            }
          : null,
      });

      // Start with base price
      let finalPrice = Number(court.baseHourlyRate);

      // Apply the highest priority rule
      if (topRule) {
        switch (topRule.pricingType) {
          case "FIXED":
            finalPrice = Number(topRule.priceValue);
            break;
          case "PERCENTAGE":
            finalPrice = finalPrice * (1 - Number(topRule.priceValue) / 100);
            break;
          case "MULTIPLIER":
            finalPrice = finalPrice * Number(topRule.priceValue);
            break;
          case "ADDITION":
            finalPrice = finalPrice + Number(topRule.priceValue);
            break;
        }
      }

      // Calculate duration in hours
      const duration =
        (new Date(endTime).getTime() - new Date(startTime).getTime()) /
        (1000 * 60 * 60);
      const totalPrice = finalPrice * duration;

      // Compute a racket unit price suggestion based on the same rule set
      // Base equipment rental from Equipment default (RACKET), fallback 300 if none
      let racketUnitBase = 300; // sensible default
      try {
        const racketEquipment = await prisma.equipment.findFirst({
          where: { type: "RACKET" },
          orderBy: { createdAt: "asc" },
        });
        if (racketEquipment)
          racketUnitBase = Number(racketEquipment.rentalPrice);
      } catch (e) {
        // noop, keep default
      }

      const racketUnitFinal = topRule
        ? PricingController.adjustUnitPrice(
            racketUnitBase,
            topRule.racketPricingType,
            topRule.racketPriceValue
          )
        : racketUnitBase;

      // Compute balls unit price suggestion based on the same rule set
      // Base equipment rental from Equipment default (BALLS), fallback 1000 if none
      let ballEquipments = await prisma.equipment.findMany({
        where: { type: "BALLS", isActive: true },
        orderBy: [{ rentalPrice: "asc" }, { name: "asc" }],
      });

      if (ballEquipments.length === 0) {
        const fallbackBall = await prisma.equipment.findFirst({
          where: { type: "BALLS" },
          orderBy: { createdAt: "asc" },
        });

        if (fallbackBall) {
          ballEquipments = [fallbackBall];
        }
      }

      const ballOptions = ballEquipments.map((equipment) => {
        const base = Number(equipment.rentalPrice) || 1000;

        // For ball options, don't apply FIXED pricing rules to preserve price differences
        // Only apply percentage, multiplier, or addition adjustments
        let finalPrice = base;
        if (
          topRule &&
          topRule.ballsPricingType &&
          topRule.ballsPricingType !== "FIXED"
        ) {
          finalPrice = PricingController.adjustUnitPrice(
            base,
            topRule.ballsPricingType,
            topRule.ballsPriceValue
          );
        }

        return {
          id: equipment.id,
          name: equipment.name,
          brand: equipment.brand,
          unitBase: base,
          unitFinal: finalPrice,
          isActive: equipment.isActive,
          availableQty: equipment.availableQty,
        };
      });

      if (ballOptions.length === 0) {
        const fallbackFinal = topRule
          ? PricingController.adjustUnitPrice(
              1000,
              topRule.ballsPricingType,
              topRule.ballsPriceValue
            )
          : 1000;

        ballOptions.push({
          id: "default-balls",
          name: "Standard Balls",
          brand: "Generic",
          unitBase: 1000,
          unitFinal: fallbackFinal,
          isActive: true,
          availableQty: 999,
        });
      }

      const ballsUnitBase = ballOptions[0].unitBase;
      const ballsUnitFinal = ballOptions[0].unitFinal;

      res.json({
        success: true,
        data: {
          basePrice: Number(court.baseHourlyRate),
          hourlyRate: finalPrice,
          duration,
          totalPrice,
          appliedRule: topRule || null,
          racketUnitBase,
          racketUnitFinal,
          ballsUnitBase,
          ballsUnitFinal,
          ballOptions,
        },
      });
    } catch (error) {
      console.error("Calculate price error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to calculate price",
      });
    }
  }
}
