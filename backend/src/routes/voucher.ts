import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { requireTwoFactor } from "../middleware/twofa.middleware";
import { VoucherController } from "../controllers/admin/voucher.controller";

const router = Router();

// Admin and Manager management
router.get(
  "/",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  VoucherController.list
);
router.post(
  "/",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  requireTwoFactor,
  VoucherController.create
);
router.put(
  "/:id",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  requireTwoFactor,
  VoucherController.update
);
router.patch(
  "/:id",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  requireTwoFactor,
  VoucherController.update
);
router.patch(
  "/:id/disable",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  requireTwoFactor,
  VoucherController.disable
);
router.post(
  "/:id/disable",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  requireTwoFactor,
  VoucherController.disable
);

// Public validate (requires auth to associate user limits)
router.post("/validate", authenticate, VoucherController.validate);

export default router;
