import { Router } from "express";
import { SystemConfigController } from "../../controllers/admin/system-config.controller";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { requireTwoFactor } from "../../middleware/twofa.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Public read-only endpoint - all authenticated users can read config
router.get("/booking-slots", SystemConfigController.getBookingSlots);
router.get("/operating-hours", SystemConfigController.getOperatingHours);

// Protected write endpoints - only MANAGER/SUPER_ADMIN can modify, with 2FA required
router.put(
  "/booking-slots",
  authorize("MANAGER", "SUPER_ADMIN"),
  requireTwoFactor,
  SystemConfigController.updateBookingSlots
);
router.post(
  "/booking-slots/reset",
  authorize("MANAGER", "SUPER_ADMIN"),
  requireTwoFactor,
  SystemConfigController.resetBookingSlots
);
router.put(
  "/operating-hours",
  authorize("MANAGER", "SUPER_ADMIN"),
  requireTwoFactor,
  SystemConfigController.updateOperatingHours
);
router.post(
  "/operating-hours/reset",
  authorize("MANAGER", "SUPER_ADMIN"),
  requireTwoFactor,
  SystemConfigController.resetOperatingHours
);

export default router;
