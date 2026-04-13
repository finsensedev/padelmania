import crypto from "crypto";
import prisma from "../config/db";
import { addDays, addMonths } from "date-fns";
import { getActiveLoyaltyConfig } from "./loyalty-config.service";

/**
 * Generate a unique referral code for a user
 */
export async function generateReferralCode(userId: string): Promise<string> {
  // Generate a unique 8-character alphanumeric code
  const generateCode = () => {
    return crypto
      .randomBytes(4)
      .toString("hex")
      .toUpperCase()
      .substring(0, 8);
  };

  let referralCode = generateCode();
  let attempts = 0;
  const maxAttempts = 10;

  // Ensure uniqueness
  while (attempts < maxAttempts) {
    const existing = await prisma.user.findUnique({
      where: { referralCode },
    });

    if (!existing) {
      // Update user with referral code
      await prisma.user.update({
        where: { id: userId },
        data: { referralCode },
      });
      return referralCode;
    }

    referralCode = generateCode();
    attempts++;
  }

  throw new Error("Failed to generate unique referral code");
}

/**
 * Get user's referral code (generate if doesn't exist)
 */
export async function getUserReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.referralCode) {
    return user.referralCode;
  }

  // Generate new code if user doesn't have one
  return await generateReferralCode(userId);
}

/**
 * Get referral statistics for a user
 */
export async function getReferralStats(userId: string) {
  const [totalReferrals, pendingReferrals, completedReferrals, totalPointsEarned] =
    await Promise.all([
      // Total referrals made
      prisma.referral.count({
        where: { referrerId: userId },
      }),
      // Pending referrals (user registered but hasn't completed booking)
      prisma.referral.count({
        where: {
          referrerId: userId,
          status: "PENDING",
        },
      }),
      // Completed referrals (user completed first booking)
      prisma.referral.count({
        where: {
          referrerId: userId,
          status: "COMPLETED",
        },
      }),
      // Total points earned from referrals
      prisma.referral.aggregate({
        where: {
          referrerId: userId,
          status: "COMPLETED",
        },
        _sum: {
          pointsAwarded: true,
        },
      }),
    ]);

  return {
    totalReferrals,
    pendingReferrals,
    completedReferrals,
    totalPointsEarned: totalPointsEarned._sum.pointsAwarded || 0,
  };
}

/**
 * Get referral history for a user
 */
export async function getReferralHistory(userId: string) {
  const referrals = await prisma.referral.findMany({
    where: { referrerId: userId },
    include: {
      referredUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return referrals.map((referral) => ({
    id: referral.id,
    status: referral.status,
    pointsAwarded: referral.pointsAwarded,
    completedAt: referral.completedAt,
    createdAt: referral.createdAt,
    referredUser: referral.referredUser
      ? {
          id: referral.referredUser.id,
          name: `${referral.referredUser.firstName} ${referral.referredUser.lastName}`,
          email: referral.referredUser.email,
          joinedAt: referral.referredUser.createdAt,
        }
      : null,
  }));
}

/**
 * Create a pending referral when a new user signs up with a referral code
 */
export async function createPendingReferral(
  referralCode: string,
  referredUserId: string
): Promise<void> {
  // Find the referrer by their referral code
  const referrer = await prisma.user.findUnique({
    where: { referralCode },
    select: { id: true },
  });

  if (!referrer) {
    throw new Error("Invalid referral code");
  }

  // Can't refer yourself
  if (referrer.id === referredUserId) {
    throw new Error("Cannot use your own referral code");
  }

  // Check if this user was already referred
  const existingReferral = await prisma.referral.findFirst({
    where: { referredUserId },
  });

  if (existingReferral) {
    throw new Error("User has already been referred");
  }

  // Create pending referral
  await prisma.$transaction([
    prisma.referral.create({
      data: {
        referrerId: referrer.id,
        referredUserId,
        referralCode,
        status: "PENDING",
      },
    }),
    // Update the referred user to track who referred them
    prisma.user.update({
      where: { id: referredUserId },
      data: { referredByUserId: referrer.id },
    }),
  ]);
}

/**
 * Award referral points when referred user completes their first booking
 */
export async function awardReferralPoints(
  referredUserId: string
): Promise<boolean> {
  // Find pending referral for this user
  const referral = await prisma.referral.findFirst({
    where: {
      referredUserId,
      status: "PENDING",
    },
    include: {
      referrer: {
        select: {
          id: true,
          firstName: true,
          email: true,
        },
      },
      referredUser: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (!referral) {
    // No pending referral found
    return false;
  }

  // Check if referred user has a confirmed or completed booking
  const completedBooking = await prisma.booking.findFirst({
    where: {
      userId: referredUserId,
      status: {
        in: ["CONFIRMED", "COMPLETED"],
      },
    },
  });

  if (!completedBooking) {
    // User hasn't completed a booking yet
    return false;
  }

  // Get referral points from config
  const loyaltyConfig = await getActiveLoyaltyConfig();
  const REFERRAL_POINTS = loyaltyConfig.referralBonusPoints;

  // Award points to referrer
  await prisma.$transaction([
    // Update referral status
    prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: "COMPLETED",
        pointsAwarded: REFERRAL_POINTS,
        completedAt: new Date(),
      },
    }),
    // Award loyalty points to referrer
    prisma.user.update({
      where: { id: referral.referrerId },
      data: {
        loyaltyPoints: { increment: REFERRAL_POINTS },
      },
    }),
    // Create loyalty point record
    prisma.loyaltyPoint.create({
      data: {
        userId: referral.referrerId,
        points: REFERRAL_POINTS,
        type: "BONUS",
        description: `Referral bonus - ${referral.referredUser?.firstName} ${referral.referredUser?.lastName} completed their first booking`,
        referenceId: referral.id,
        expiresAt: addMonths(new Date(), 6),
      },
    }),
  ]);

  return true;
}

/**
 * Validate a referral code
 */
export async function validateReferralCode(
  referralCode: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { referralCode },
    select: { id: true, isActive: true, isDeleted: true },
  });

  return !!(user && user.isActive && !user.isDeleted);
}
