import api from "../utils/api";

export interface LoyaltyConfig {
  id: string;
  pointsPerCurrency: number;
  currencyUnit: number;
  registrationBonusPoints: number;
  referralBonusPoints: number;
  minimumRedeemablePoints: number;
  pointsToGiftCardRatio: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLoyaltyConfigData {
  pointsPerCurrency: number;
  currencyUnit: number;
  registrationBonusPoints: number;
  referralBonusPoints: number;
  minimumRedeemablePoints: number;
  pointsToGiftCardRatio: number;
  isActive?: boolean;
}

export interface UpdateLoyaltyConfigData extends Partial<CreateLoyaltyConfigData> {}

/**
 * Get the active loyalty configuration
 * Uses different endpoints based on context (manager vs customer)
 */
export const getActiveLoyaltyConfig = async (): Promise<LoyaltyConfig> => {
  // Try customer endpoint first, fallback to manager endpoint
  try {
    const response = await api.get("/loyalty/config");
    return response.data.data;
  } catch (error) {
    // Fallback to manager endpoint if customer endpoint fails
    const response = await api.get("/manager/loyalty-config/active");
    return response.data.data;
  }
};

/**
 * Get all loyalty configurations
 */
export const getAllLoyaltyConfigs = async (): Promise<LoyaltyConfig[]> => {
  const response = await api.get("/manager/loyalty-config");
  return response.data.data;
};

/**
 * Get loyalty configuration by ID
 */
export const getLoyaltyConfigById = async (id: string): Promise<LoyaltyConfig> => {
  const response = await api.get(`/manager/loyalty-config/${id}`);
  return response.data.data;
};

/**
 * Create a new loyalty configuration
 */
export const createLoyaltyConfig = async (
  data: CreateLoyaltyConfigData,
  sessionToken?: string
): Promise<LoyaltyConfig> => {
  const headers = sessionToken ? { "X-2FA-Session": sessionToken } : {};
  const response = await api.post("/manager/loyalty-config", data, { headers });
  return response.data.data;
};

/**
 * Update loyalty configuration
 */
export const updateLoyaltyConfig = async (
  id: string,
  data: UpdateLoyaltyConfigData,
  sessionToken?: string
): Promise<LoyaltyConfig> => {
  const headers = sessionToken ? { "X-2FA-Session": sessionToken } : {};
  const response = await api.put(`/manager/loyalty-config/${id}`, data, { headers });
  return response.data.data;
};

/**
 * Delete loyalty configuration
 */
export const deleteLoyaltyConfig = async (
  id: string,
  sessionToken?: string
): Promise<void> => {
  const headers = sessionToken ? { "X-2FA-Session": sessionToken } : {};
  await api.delete(`/manager/loyalty-config/${id}`, { headers });
};

/**
 * Activate a loyalty configuration
 */
export const activateLoyaltyConfig = async (
  id: string,
  sessionToken?: string
): Promise<LoyaltyConfig> => {
  const headers = sessionToken ? { "X-2FA-Session": sessionToken } : {};
  const response = await api.patch(`/manager/loyalty-config/${id}/activate`, {}, { headers });
  return response.data.data;
};

/**
 * Redeem loyalty points for a gift card
 */
export const redeemPointsForGiftCard = async (pointsToRedeem: number) => {
  const response = await api.post("/loyalty/redeem-gift-card", { pointsToRedeem });
  return response.data;
};
