import { calculatePointsFromSpending } from "../services/loyalty-config.service";
import { MembershipTier } from "@prisma/client";

const LOYALTY_POINT_EXCHANGE_RATE = 100; // KES required to earn a single loyalty point (deprecated, kept for backwards compatibility)

const sanitizeAmount = (amount: number): number => {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return amount;
};

/**
 * Calculate points from amount using the active loyalty configuration
 * @param amount - The amount spent in KES
 * @returns Promise<number> - The number of loyalty points earned
 */
export const calculatePointsFromAmount = async (amount: number): Promise<number> => {
  const normalized = sanitizeAmount(amount);
  if (normalized <= 0) {
    return 0;
  }
  return await calculatePointsFromSpending(normalized);
};

/**
 * Tier thresholds based on lifetime points earned
 * Each tier requires 1000 points more than the previous
 */
export const TIER_THRESHOLDS = {
  BRONZE: 0,
  SILVER: 1000,
  GOLD: 2000,
  PLATINUM: 3000,
  VIP: 4000,
} as const;

/**
 * Calculate the appropriate tier based on lifetime points
 * @param lifetimePoints - Total points earned throughout user's lifetime
 * @returns MembershipTier - The tier the user should be in
 */
export const calculateTierFromPoints = (lifetimePoints: number): MembershipTier => {
  if (lifetimePoints >= TIER_THRESHOLDS.VIP) {
    return MembershipTier.VIP;
  } else if (lifetimePoints >= TIER_THRESHOLDS.PLATINUM) {
    return MembershipTier.PLATINUM;
  } else if (lifetimePoints >= TIER_THRESHOLDS.GOLD) {
    return MembershipTier.GOLD;
  } else if (lifetimePoints >= TIER_THRESHOLDS.SILVER) {
    return MembershipTier.SILVER;
  }
  return MembershipTier.BRONZE;
};

/**
 * Get tier progression information
 * @param lifetimePoints - Total points earned throughout user's lifetime
 * @returns Object with current tier, next tier, points needed, and progress percentage
 */
export const getTierProgress = (lifetimePoints: number) => {
  const currentTier = calculateTierFromPoints(lifetimePoints);
  const tiers = Object.keys(TIER_THRESHOLDS) as MembershipTier[];
  const currentTierIndex = tiers.indexOf(currentTier);
  const nextTier = currentTierIndex < tiers.length - 1 ? tiers[currentTierIndex + 1] : currentTier;
  
  const currentThreshold = TIER_THRESHOLDS[currentTier];
  const nextThreshold = TIER_THRESHOLDS[nextTier as keyof typeof TIER_THRESHOLDS];
  
  const pointsToNextTier = Math.max(0, nextThreshold - lifetimePoints);
  const tierProgress = currentTier === MembershipTier.VIP
    ? 100
    : ((lifetimePoints - currentThreshold) / Math.max(1, nextThreshold - currentThreshold)) * 100;
  
  return {
    currentTier,
    nextTier,
    pointsToNextTier,
    tierProgress: Math.min(100, Math.max(0, tierProgress)),
  };
};

export { LOYALTY_POINT_EXCHANGE_RATE };
