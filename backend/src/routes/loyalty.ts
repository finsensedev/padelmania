import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { LoyaltyController } from "../controllers/customer/loyalty.controller";

const router = Router();

// GET /api/loyalty/config - Get active loyalty configuration
router.get("/config", authenticate, LoyaltyController.getActiveLoyaltyConfig);

// GET /api/loyalty/stats - Get user's loyalty stats
router.get("/stats", authenticate, LoyaltyController.getUserLoyaltyStats);

// GET /api/loyalty/history - Get points history
router.get("/history", authenticate, LoyaltyController.getUserHistoryPoints);

// GET /api/loyalty/rewards - Get available rewards
router.get("/rewards", authenticate, LoyaltyController.getAvailableRewards);

// GET /api/loyalty/achievements - Get user achievements
router.get(
  "/achievements",
  authenticate,
  LoyaltyController.getUserAchievements
);

// POST /api/loyalty/redeem/:rewardId - Redeem a reward
router.post("/redeem/:rewardId", authenticate, LoyaltyController.redeemReward);

// POST /api/loyalty/redeem-gift-card - Redeem points for gift card
router.post("/redeem-gift-card", authenticate, LoyaltyController.redeemPointsForGiftCard);

export default router;
