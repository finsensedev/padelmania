import { Request, Response } from "express";
import {
  getUserReferralCode,
  getReferralStats,
  getReferralHistory,
  validateReferralCode,
} from "../services/referral.service";

export class ReferralController {
  /**
   * GET /api/referral/code
   * Get user's referral code (generates one if doesn't exist)
   */
  static async getReferralCode(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const referralCode = await getUserReferralCode(userId);

      const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:5173";
      const referralLink = `${appBaseUrl}/?ref=${referralCode}`;

      return res.json({
        success: true,
        data: {
          referralCode,
          referralLink,
        },
      });
    } catch (error) {
      console.error("Get referral code error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get referral code",
      });
    }
  }

  /**
   * GET /api/referral/stats
   * Get user's referral statistics
   */
  static async getReferralStats(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const stats = await getReferralStats(userId);

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Get referral stats error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get referral statistics",
      });
    }
  }

  /**
   * GET /api/referral/history
   * Get user's referral history
   */
  static async getReferralHistory(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const history = await getReferralHistory(userId);

      return res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      console.error("Get referral history error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get referral history",
      });
    }
  }

  /**
   * GET /api/referral/validate/:code
   * Validate a referral code
   */
  static async validateCode(req: Request, res: Response) {
    try {
      const { code } = req.params;
      const isValid = await validateReferralCode(code);

      return res.json({
        success: true,
        data: { isValid },
      });
    } catch (error) {
      console.error("Validate referral code error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to validate referral code",
      });
    }
  }
}
