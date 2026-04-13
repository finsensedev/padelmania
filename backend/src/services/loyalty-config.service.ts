import prisma from "../config/db";

/**
 * Get the active loyalty configuration
 */
export async function getActiveLoyaltyConfig() {
  const config = await prisma.loyaltyConfig.findFirst({
    where: { isActive: true },
  });

  if (!config) {
    // Return default configuration if none exists
    return {
      id: "default",
      pointsPerCurrency: 1,
      currencyUnit: 100,
      registrationBonusPoints: 40,
      referralBonusPoints: 20,
      minimumRedeemablePoints: 100,
      pointsToGiftCardRatio: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  return config;
}

/**
 * Get loyalty configuration by ID
 */
export async function getLoyaltyConfigById(id: string) {
  return await prisma.loyaltyConfig.findUnique({
    where: { id },
  });
}

/**
 * Get all loyalty configurations
 */
export async function getAllLoyaltyConfigs() {
  return await prisma.loyaltyConfig.findMany({
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Create a new loyalty configuration
 */
export async function createLoyaltyConfig(data: {
  pointsPerCurrency: number;
  currencyUnit: number;
  registrationBonusPoints: number;
  referralBonusPoints: number;
  minimumRedeemablePoints: number;
  pointsToGiftCardRatio: number;
  isActive?: boolean;
}) {
  // If this config should be active, deactivate all others
  if (data.isActive) {
    await prisma.loyaltyConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
  }

  return await prisma.loyaltyConfig.create({
    data,
  });
}

/**
 * Update loyalty configuration
 */
export async function updateLoyaltyConfig(
  id: string,
  data: {
    pointsPerCurrency?: number;
    currencyUnit?: number;
    registrationBonusPoints?: number;
    referralBonusPoints?: number;
    minimumRedeemablePoints?: number;
    pointsToGiftCardRatio?: number;
    isActive?: boolean;
  }
) {
  // Handle the virtual "default" configuration
  if (id === "default") {
    // Create a new configuration based on default values + updates
    const defaultValues = {
      pointsPerCurrency: 1,
      currencyUnit: 100,
      registrationBonusPoints: 40,
      referralBonusPoints: 20,
      minimumRedeemablePoints: 100,
      pointsToGiftCardRatio: 1,
      isActive: true,
    };

    const newConfigData = {
      ...defaultValues,
      ...data,
    };

    // If this config should be active (which default is), deactivate others
    if (newConfigData.isActive) {
      await prisma.loyaltyConfig.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

    return await prisma.loyaltyConfig.create({
      data: newConfigData,
    });
  }

  // If this config should be active, deactivate all others
  if (data.isActive) {
    await prisma.loyaltyConfig.updateMany({
      where: { isActive: true, id: { not: id } },
      data: { isActive: false },
    });
  }

  return await prisma.loyaltyConfig.update({
    where: { id },
    data,
  });
}

/**
 * Delete loyalty configuration
 */
export async function deleteLoyaltyConfig(id: string) {
  const config = await prisma.loyaltyConfig.findUnique({
    where: { id },
  });

  if (config?.isActive) {
    throw new Error("Cannot delete the active loyalty configuration");
  }

  return await prisma.loyaltyConfig.delete({
    where: { id },
  });
}

/**
 * Activate a specific loyalty configuration
 */
export async function activateLoyaltyConfig(id: string) {
  // Deactivate all others
  await prisma.loyaltyConfig.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  // Activate the specified one
  return await prisma.loyaltyConfig.update({
    where: { id },
    data: { isActive: true },
  });
}

/**
 * Calculate points earned from spending amount
 */
export async function calculatePointsFromSpending(
  amountSpent: number
): Promise<number> {
  const config = await getActiveLoyaltyConfig();
  return Math.floor(
    (amountSpent / config.currencyUnit) * config.pointsPerCurrency
  );
}

/**
 * Calculate gift card value from points
 */
export async function calculateGiftCardValue(points: number): Promise<number> {
  const config = await getActiveLoyaltyConfig();
  return points * config.pointsToGiftCardRatio;
}

/**
 * Check if points are redeemable
 */
export async function canRedeemPoints(points: number): Promise<boolean> {
  const config = await getActiveLoyaltyConfig();
  return points >= config.minimumRedeemablePoints;
}
