import { Request, Response } from "express";
import { PointType, Prisma, PrismaClient } from "@prisma/client";
import { calculatePointsFromAmount, calculateTierFromPoints, getTierProgress, TIER_THRESHOLDS } from "../../utils/loyalty";
import { addDays, addMonths } from "date-fns";

const prisma = new PrismaClient();

export class LoyaltyController {
  static async getLoyaltyInfo(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          loyaltyPoints: true,
          membershipCard: true,
        },
      });

      // Calculate lifetime points to determine tier
      const loyaltyEarningTypes: PointType[] = [
        PointType.EARNED,
        PointType.BONUS,
      ];

      const [totalEarned, totalAdjustments] = await Promise.all([
        prisma.loyaltyPoint.aggregate({
          where: { userId, type: { in: loyaltyEarningTypes } },
          _sum: { points: true },
        }),
        prisma.loyaltyPoint.aggregate({
          where: { userId, type: PointType.ADJUSTMENT },
          _sum: { points: true },
        }),
      ]);

      const lifetimePoints = (totalEarned._sum?.points ?? 0) + (totalAdjustments._sum?.points ?? 0);
      const currentPoints = user?.loyaltyPoints || 0;

      // Calculate tier based on lifetime points
      const tierInfo = getTierProgress(lifetimePoints);
      const calculatedTier = calculateTierFromPoints(lifetimePoints);

      // Auto-update membership card tier if needed
      if (user?.membershipCard && user.membershipCard.tier !== calculatedTier) {
        await prisma.membershipCard.update({
          where: { userId },
          data: { tier: calculatedTier },
        });
      }

      // Get tier benefits
      const benefits = {
        BRONZE: [
          "Earn 1 point for every KES 100 spent",
          "Access to standard courts",
        ],
        SILVER: [
          "Earn 1.5 points for every KES 100 spent",
          "10% discount on court bookings",
          "Priority booking access",
          "Free guest pass once a month",
        ],
        GOLD: [
          "Earn 2 points for every KES 100 spent",
          "15% discount on court bookings",
          "Access to premium courts",
          "Free equipment rental",
          "Exclusive tournament invitations",
        ],
        PLATINUM: [
          "Earn 3 points for every KES 100 spent",
          "20% discount on court bookings",
          "VIP lounge access",
          "Personal coach sessions",
          "Free guest passes",
          "Priority customer support",
        ],
        VIP: [
          "Earn 5 points for every KES 100 spent",
          "25% discount on court bookings",
          "Exclusive VIP lounge access",
          "Personal dedicated coach",
          "Unlimited guest passes",
          "24/7 priority customer support",
          "Exclusive VIP events and tournaments",
        ],
      };

      res.json({
        success: true,
        data: {
          tier: calculatedTier,
          points: currentPoints,
          lifetimePoints,
          nextTier: tierInfo.nextTier,
          pointsToNextTier: tierInfo.pointsToNextTier,
          tierProgress: tierInfo.tierProgress,
          benefits: benefits[calculatedTier as keyof typeof benefits],
          expiringPoints: 0, // TODO: Implement point expiry
          expiryDate: null,
        },
      });
    } catch (error) {
      console.error("Get loyalty info error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch loyalty information",
      });
    }
  }

  static async getPointsHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      const history = await prisma.loyaltyPoint.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      const formattedHistory = history.map((entry) => ({
        id: entry.id,
        type: entry.type,
        points: entry.points,
        description: entry.description,
        createdAt: entry.createdAt,
        referenceId: entry.referenceId,
      }));

      res.json({
        success: true,
        data: formattedHistory,
      });
    } catch (error) {
      console.error("Get points history error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch points history",
      });
    }
  }

  static async getUserLoyaltyStats(req: Request, res: Response) {
    try {
      const userId = req.user!.id;

      // Get user with membership
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { membershipCard: true },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const loyaltyEarningTypes: PointType[] = [
        PointType.EARNED,
        PointType.BONUS,
      ];

      const now = new Date();

      const [totalEarned, totalAdjustments, totalRedeemed, totalExpired] = await Promise.all([
        prisma.loyaltyPoint.aggregate({
          where: { userId, type: { in: loyaltyEarningTypes } },
          _sum: { points: true },
        }),
        prisma.loyaltyPoint.aggregate({
          where: { userId, type: PointType.ADJUSTMENT },
          _sum: { points: true },
        }),
        prisma.loyaltyPoint.aggregate({
          where: { userId, type: PointType.REDEEMED },
          _sum: { points: true },
        }),
        prisma.loyaltyPoint.aggregate({
          where: { userId, type: PointType.EXPIRED },
          _sum: { points: true },
        }),
      ]);

      const availablePoints = user.loyaltyPoints || 0;
      // Lifetime points includes earned, bonus, and adjustments (which can be negative for deductions)
      const lifetimePoints = (totalEarned._sum?.points ?? 0) + (totalAdjustments._sum?.points ?? 0);
      const expiringSoonAggregate = await prisma.loyaltyPoint.aggregate({
        where: {
          userId,
          type: { in: [PointType.EARNED, PointType.BONUS] },
          points: { gt: 0 },
          expiresAt: {
            gte: now,
            lte: addDays(now, 30),
          },
        },
        _sum: { points: true },
      });
      const expiringSoon = expiringSoonAggregate._sum?.points ?? 0;

      // Find the earliest expiry date from active points for countdown timer
      const earliestExpiringPoint = await prisma.loyaltyPoint.findFirst({
        where: {
          userId,
          type: { in: [PointType.EARNED, PointType.BONUS] },
          points: { gt: 0 },
          expiresAt: { gte: now },
        },
        orderBy: { expiresAt: 'asc' },
        select: { expiresAt: true },
      });

      // Calculate tier based on lifetime points and auto-update if needed
      const calculatedTier = calculateTierFromPoints(lifetimePoints);
      
      // Auto-update membership card tier if it doesn't match calculated tier
      if (user.membershipCard && user.membershipCard.tier !== calculatedTier) {
        await prisma.membershipCard.update({
          where: { userId },
          data: { tier: calculatedTier },
        });
      }

      const tierInfo = getTierProgress(lifetimePoints);

      return res.json({
        data: {
          totalPoints: availablePoints,
          availablePoints,
          pendingPoints: 0, // Points are awarded immediately, no pending status
          expiringSoon,
          earliestExpiryDate: earliestExpiringPoint?.expiresAt?.toISOString() || null,
          lifetimePoints,
          currentTier: calculatedTier,
          nextTier: tierInfo.nextTier,
          pointsToNextTier: tierInfo.pointsToNextTier,
          tierProgress: tierInfo.tierProgress,
        },
      });
    } catch (error) {
      console.error("Error fetching loyalty stats:", error);
      return res.status(500).json({ message: "Failed to fetch loyalty stats" });
    }
  }

  static async getActiveLoyaltyConfig(req: Request, res: Response) {
    try {
      const { getActiveLoyaltyConfig } = await import("../../services/loyalty-config.service");
      const config = await getActiveLoyaltyConfig();
      
      return res.json({
        data: config,
      });
    } catch (error) {
      console.error("Error fetching loyalty config:", error);
      return res.status(500).json({ message: "Failed to fetch loyalty configuration" });
    }
  }

  static async getUserHistoryPoints(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { type, limit = 50, offset = 0 } = req.query;

      const where: any = { userId };
      if (type) {
        where.type = type as string;
      }

      const transactions = await prisma.loyaltyPoint.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Number(limit),
        skip: Number(offset),
      });

      // Calculate running balance
      let runningBalance = await prisma.user
        .findUnique({
          where: { id: userId },
          select: { loyaltyPoints: true },
        })
        .then((u) => u?.loyaltyPoints || 0);

      const transactionsWithBalance = transactions.map((t, index) => {
        if (index > 0) {
          const prevTransaction = transactions[index - 1];
          runningBalance -= prevTransaction.points;
        }
        return { ...t, balance: runningBalance };
      });

      return res.json({ data: transactionsWithBalance });
    } catch (error) {
      console.error("Error fetching loyalty history:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch loyalty history" });
    }
  }

  static async getAvailableRewards(req: Request, res: Response) {
    try {
      // Mock rewards data - replace with actual database model
      const rewards = [
        {
          id: "1",
          name: "Free Court Hour",
          description: "Get 1 hour of court time free",
          pointsCost: 2000,
          category: "Courts",
          available: true,
        },
        {
          id: "2",
          name: "20% Discount",
          description: "20% off your next booking",
          pointsCost: 1000,
          category: "Discounts",
          available: true,
        },
        {
          id: "3",
          name: "Premium Racket Rental",
          description: "Free premium racket for your next game",
          pointsCost: 500,
          category: "Equipment",
          available: true,
        },
        {
          id: "4",
          name: "Clubhouse Voucher",
          description: "KES 500 clubhouse credit",
          pointsCost: 750,
          category: "Clubhouse",
          available: true,
        },
      ];

      return res.json({ data: rewards });
    } catch (error) {
      console.error("Error fetching rewards:", error);
      return res.status(500).json({ message: "Failed to fetch rewards" });
    }
  }

  static async getUserAchievements(req: Request, res: Response) {
    try {
      const userId = req.user!.id;

      // Calculate achievements based on user activity
      const [bookingCount, totalSpent] = await Promise.all([
        prisma.booking.count({ where: { userId, status: "COMPLETED" } }),
        prisma.booking.aggregate({
          where: { userId, status: "COMPLETED" },
          _sum: { totalAmount: true },
        }),
      ]);

      const totalSpentAmount = Number(totalSpent._sum.totalAmount ?? 0);

      const achievements = [
        {
          id: "1",
          name: "First Timer",
          description: "Complete your first booking",
          icon: "🎯",
          earned: bookingCount > 0,
          earnedAt: bookingCount > 0 ? new Date().toISOString() : null,
          points: 100,
        },
        {
          id: "2",
          name: "Regular Player",
          description: "Book 10 court sessions",
          icon: "🏆",
          earned: bookingCount >= 10,
          earnedAt: bookingCount >= 10 ? new Date().toISOString() : null,
          points: 500,
          progress: Math.min(bookingCount, 10),
          target: 10,
        },
        {
          id: "3",
          name: "Big Spender",
          description: "Spend over KES 10,000",
          icon: "💰",
          earned: totalSpentAmount >= 10000,
          earnedAt: totalSpentAmount >= 10000 ? new Date().toISOString() : null,
          points: 1000,
          progress: Math.min(totalSpentAmount, 10000),
          target: 10000,
        },
      ];

      return res.json({ data: achievements });
    } catch (error) {
      console.error("Error fetching achievements:", error);
      return res.status(500).json({ message: "Failed to fetch achievements" });
    }
  }

  static async redeemReward(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { rewardId } = req.params;

      // Mock reward redemption - implement actual logic
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check points balance (mock cost of 1000 points)
      const rewardCost = 1000;
      if (user.loyaltyPoints < rewardCost) {
        return res.status(400).json({ message: "Insufficient points" });
      }

      // Deduct points
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { loyaltyPoints: { decrement: rewardCost } },
        }),
        prisma.loyaltyPoint.create({
          data: {
            userId,
            points: -rewardCost,
            type: "REDEEMED",
            description: "Reward redemption",
            referenceId: rewardId,
          },
        }),
      ]);

      return res.json({
        message: "Reward redeemed successfully",
        data: { pointsDeducted: rewardCost },
      });
    } catch (error) {
      console.error("Error redeeming reward:", error);
      return res.status(500).json({ message: "Failed to redeem reward" });
    }
  }

  /**
   * Redeem loyalty points for a gift card
   */
  static async redeemPointsForGiftCard(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { pointsToRedeem } = req.body;

      if (!pointsToRedeem || pointsToRedeem <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid points amount",
        });
      }

      // Get loyalty configuration
      const { getActiveLoyaltyConfig, calculateGiftCardValue, canRedeemPoints } = await import("../../services/loyalty-config.service");
      const loyaltyConfig = await getActiveLoyaltyConfig();

      // Check if points meet minimum requirement
      if (!(await canRedeemPoints(pointsToRedeem))) {
        return res.status(400).json({
          success: false,
          message: `Minimum ${loyaltyConfig.minimumRedeemablePoints} points required for redemption`,
        });
      }

      // Get user's current points
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          loyaltyPoints: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (user.loyaltyPoints < pointsToRedeem) {
        return res.status(400).json({
          success: false,
          message: "Insufficient loyalty points",
        });
      }

      // Calculate gift card value
      const giftCardValue = await calculateGiftCardValue(pointsToRedeem);

      // Generate gift card code
      const crypto = require("crypto");
      const giftCardCode = `GC-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

      // Create gift card and deduct points in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Deduct loyalty points
        await tx.user.update({
          where: { id: userId },
          data: { loyaltyPoints: { decrement: pointsToRedeem } },
        });

        // Create loyalty point redemption record
        await tx.loyaltyPoint.create({
          data: {
            userId,
            points: -pointsToRedeem,
            type: "REDEEMED",
            description: `Redeemed ${pointsToRedeem} points for ${giftCardValue} KES gift card`,
            referenceId: giftCardCode,
          },
        });

        // Create gift card
        const giftCard = await tx.giftCard.create({
          data: {
            code: giftCardCode,
            amount: giftCardValue,
            balance: giftCardValue,
            status: "ISSUED",
            isActive: true,
            purchasedByUserId: userId,
            expiresAt: addMonths(new Date(), 6), // 6 months expiry
          },
        });

        // Create gift card ledger entry
        await tx.giftCardLedger.create({
          data: {
            giftCardId: giftCard.id,
            type: "CREDIT",
            amount: giftCardValue,
            balanceAfter: giftCardValue,
            performedByUserId: userId,
            note: `Points redemption - ${pointsToRedeem} points redeemed for gift card`,
          },
        });

        return giftCard;
      });

      // Send email notification
      try {
        const { sendMail, buildLoyaltyRedemptionEmail } = await import("../../utils/mailer");
        const emailContent = buildLoyaltyRedemptionEmail({
          firstName: user.firstName || undefined,
          pointsRedeemed: pointsToRedeem,
          giftCardCode: result.code,
          giftCardAmount: Number(result.amount),
          remainingPoints: user.loyaltyPoints - pointsToRedeem,
          expiresAt: result.expiresAt?.toISOString() || null,
        });

        await sendMail({
          to: user.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });
      } catch (emailError) {
        console.error("Failed to send redemption email:", emailError);
        // Don't fail the entire request if email fails
      }

      return res.json({
        success: true,
        message: "Points redeemed successfully",
        data: {
          giftCard: {
            code: result.code,
            value: Number(result.amount),
            expiresAt: result.expiresAt,
          },
          pointsRedeemed: pointsToRedeem,
          remainingPoints: user.loyaltyPoints - pointsToRedeem,
        },
      });
    } catch (error) {
      console.error("Error redeeming points for gift card:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to redeem points",
      });
    }
  }
}
