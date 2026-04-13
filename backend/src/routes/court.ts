import { Router, Request, Response, NextFunction } from "express";
import { body } from "express-validator";
import { CourtController } from "../controllers/admin/court.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import validateRequest from "../middleware/validation.middleware";
import { PricingController } from "../controllers/admin/pricing.controller";
import { requireTwoFactor } from "../middleware/twofa.middleware";

const router = Router();

// Pricing routes (mounted before param routes to avoid conflicts)
router.get(
  "/pricing/rules",
  authenticate,
  authorize("SUPER_ADMIN"),
  PricingController.getPricingRules
);
router.post(
  "/pricing/rules",
  authenticate,
  authorize("SUPER_ADMIN"),
  PricingController.createPricingRule
);
router.put(
  "/pricing/rules/:id",
  authenticate,
  authorize("SUPER_ADMIN"),
  PricingController.updatePricingRule
);
router.delete(
  "/pricing/rules/:id",
  authenticate,
  authorize("SUPER_ADMIN"),
  PricingController.deletePricingRule
);
router.post(
  "/pricing/bulk-update",
  authenticate,
  authorize("SUPER_ADMIN"),
  PricingController.bulkUpdatePrices
);
router.get(
  "/pricing/history",
  authenticate,
  authorize("SUPER_ADMIN"),
  PricingController.getPricingHistory
);
router.post(
  "/pricing/calculate",
  authenticate,
  PricingController.calculatePrice
);

// Public routes (fix the middleware chain)
router.get(
  "/",
  authenticate,
  authorize("CUSTOMER", "BOOKING_OFFICER", "ADMIN", "SUPER_ADMIN", "MANAGER"),
  CourtController.listCourts
);
router.get(
  "/:id/equipment-unit-price",
  authenticate,
  authorize("CUSTOMER", "BOOKING_OFFICER", "ADMIN", "SUPER_ADMIN", "MANAGER"),
  PricingController.getEquipmentUnitPrice
);
router.get(
  "/:id",
  authenticate,
  authorize("CUSTOMER", "BOOKING_OFFICER", "ADMIN", "SUPER_ADMIN", "MANAGER"),
  CourtController.getCourt
);
router.get(
  "/:id/availability",
  authenticate,
  authorize("CUSTOMER", "BOOKING_OFFICER", "ADMIN", "SUPER_ADMIN", "MANAGER"),
  CourtController.getCourtAvailability
);
router.get(
  "/:id/day-stats",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  CourtController.getCourtDayStats
);

// Admin routes
router.post(
  "/",
  authenticate,
  authorize("SUPER_ADMIN"),
  [
    body("name").notEmpty().withMessage("Court name is required"),
    // Remove type and surface validation - let the controller handle defaults
  ],
  validateRequest,
  CourtController.createCourt
);

router.put(
  "/:id",
  authenticate,
  authorize("SUPER_ADMIN"),
  requireTwoFactor,
  CourtController.updateCourt
);

router.patch(
  "/:id/maintenance",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  [body("maintenanceMode").isBoolean(), body("reason").optional().isString()],
  validateRequest,
  CourtController.toggleCourt // Changed from toggleMaintenance to toggleCourt
);

// Dedicated maintenance blackout window creation (separate from toggle)
router.post(
  "/:id/maintenance",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  [
    body("startTime").notEmpty().withMessage("startTime required"),
    body("endTime").notEmpty().withMessage("endTime required"),
  ],
  validateRequest,
  // Skip 2FA for dryRun=1 previews; enforce for commit
  (req: Request, res: Response, next: NextFunction) => {
    const isDry = ["1", "true", "yes"].includes(
      String(req.query.dryRun || req.query.preview || "").toLowerCase()
    );
    if (isDry) {
      return CourtController.createMaintenance(req, res);
    }

    next();
  },
  requireTwoFactor,
  // After 2FA, execute (controller will treat no-dryRun as commit)
  CourtController.createMaintenance
);

router.delete(
  "/:id",
  authenticate,
  authorize("SUPER_ADMIN"),
  CourtController.deleteCourt
);

router.patch(
  "/:id/toggle",
  authenticate,
  authorize("SUPER_ADMIN"),
  requireTwoFactor,
  CourtController.toggleCourt
);

// Court-scoped blackouts (add authentication)
router.get(
  "/:id/blackouts",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  CourtController.listCourtBlackouts
);
router.post(
  "/:id/blackouts",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  requireTwoFactor,
  CourtController.createCourtBlackout
);
router.delete(
  "/:id/blackouts/:bookingId",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  requireTwoFactor,
  CourtController.cancelCourtBlackout
);

// Maintenance/reschedule helpers
router.get(
  "/:id/conflicts",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN"),
  CourtController.getConflictingBookings
);
router.post(
  "/bookings/:id/reassign",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN"),
  CourtController.reassignBooking
);

export default router;
