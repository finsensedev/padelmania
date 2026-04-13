import { Router } from "express";
import { PublicPricingController } from "../controllers/public/pricing.controller";
import rateLimitMiddleware from "../middleware/rateLimit.middleware";

const router = Router();

router.get(
  "/pricing",
  rateLimitMiddleware,
  PublicPricingController.getAllCourtsPricing
);

router.get(
  "/pricing/:id",
  rateLimitMiddleware,
  PublicPricingController.getCourtPricing
);

export default router;
