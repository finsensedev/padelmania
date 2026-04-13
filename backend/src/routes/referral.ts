import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { ReferralController } from "../controllers/referral.controller";

const router = Router();

// Get user's referral code
router.get("/code", authenticate, ReferralController.getReferralCode);

// Get user's referral statistics
router.get("/stats", authenticate, ReferralController.getReferralStats);

// Get user's referral history
router.get("/history", authenticate, ReferralController.getReferralHistory);

// Validate a referral code (public endpoint)
router.get("/validate/:code", ReferralController.validateCode);

export default router;
