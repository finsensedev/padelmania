import { Router } from "express";
import { CustomerDashboardController } from "../controllers/customer/dashboard.controller";
import { LoyaltyController } from "../controllers/customer/loyalty.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();

// All routes require authentication and CUSTOMER role
router.use(authenticate);
router.use(authorize("CUSTOMER", "ADMIN", "SUPER_ADMIN"));

// Dashboard routes
router.get("/stats", CustomerDashboardController.getStats);
router.get(
  "/bookings/upcoming",
  CustomerDashboardController.getUpcomingBookings
);
router.get("/activity/recent", CustomerDashboardController.getRecentActivity);
router.get(
  "/notifications/unread-count",
  CustomerDashboardController.getNotificationCount
);

// Loyalty routes
router.get("/loyalty/info", LoyaltyController.getLoyaltyInfo);
router.get("/loyalty/history", LoyaltyController.getPointsHistory);

export default router;
