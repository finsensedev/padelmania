import api from "../utils/api";

// Types
export interface ReferralStats {
  totalReferrals: number;
  pendingReferrals: number;
  completedReferrals: number;
  totalPointsEarned: number;
}

export interface ReferralHistoryItem {
  id: string;
  status: "PENDING" | "COMPLETED" | "EXPIRED" | "CANCELLED";
  pointsAwarded: number;
  completedAt: string | null;
  createdAt: string;
  referredUser: {
    id: string;
    name: string;
    email: string;
    joinedAt: string;
  } | null;
}

export interface ReferralCodeResponse {
  referralCode: string;
  referralLink: string;
}

// Service class
export class ReferralService {
  /**
   * Get user's referral code and link
   */
  async getReferralCode(): Promise<ReferralCodeResponse> {
    const response = await api.get("/referral/code");
    return response.data.data;
  }

  /**
   * Get referral statistics
   */
  async getReferralStats(): Promise<ReferralStats> {
    const response = await api.get("/referral/stats");
    return response.data.data;
  }

  /**
   * Get referral history
   */
  async getReferralHistory(): Promise<ReferralHistoryItem[]> {
    const response = await api.get("/referral/history");
    return response.data.data;
  }

  /**
   * Validate a referral code
   */
  async validateReferralCode(code: string): Promise<boolean> {
    try {
      const response = await api.get(`/referral/validate/${code}`);
      return response.data.data.isValid;
    } catch {
      return false;
    }
  }
}

// Default export instance
const referralService = new ReferralService();
export default referralService;
