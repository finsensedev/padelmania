import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { requireTwoFactor } from "../middleware/twofa.middleware";
import { GiftCardController } from "../controllers/giftcard.controller";
import { AdminGiftCardController } from "../controllers/admin/giftcard.controller";

const router = Router();

router.get(
  "/",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  AdminGiftCardController.list
);
router.post(
  "/",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  requireTwoFactor,
  AdminGiftCardController.issue
);
router.post(
  "/:id/adjust",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  requireTwoFactor,
  AdminGiftCardController.adjust
);
router.post(
  "/:id/revoke",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  requireTwoFactor,
  AdminGiftCardController.revoke
);
router.get(
  "/:id/ledger",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  AdminGiftCardController.ledger
);

router.post("/purchase", authenticate, GiftCardController.purchase);
router.post("/redeem", authenticate, GiftCardController.redeem);
router.get("/me", authenticate, GiftCardController.listMine);
router.post("/quote", authenticate, GiftCardController.quote);

export default router;
