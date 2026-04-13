import { Router } from "express";
import authRoutes from "./auth";
import courtRoutes from "./court";
import bookingRoutes from "./booking";
import userRoutes from "./user";
import dashboardRoutes from "./dashboard";
import customerRoutes from "./customer.routes";
import meRoutes from "./me";
import loyaltyRoutes from "./loyalty";
import auditRoutes from "./audit";
import paymentRoutes from "./payment";
import financeOfficerRoutes from "./finance-officer";
import voucherRoutes from "./voucher";
import giftcardRoutes from "./giftcard";
import systemConfigRoutes from "./admin/system-config";
import referralRoutes from "./referral";
import loyaltyConfigRoutes from "./manager/loyalty-config.routes";

import ballTypeRoutes from "./ball-type.routes";
import adminBallTypeRoutes from "./admin/ballTypes";
import shopRoutes from "./shop.routes";
import publicRoutes from "./public.routes";
import equipmentRentalRoutes from "./equipment-rental.routes";
import rateLimitMiddleware from "../middleware/rateLimit.middleware";

const router = Router();

router.get("/health", rateLimitMiddleware, (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Public routes
router.use("/public", publicRoutes);

router.use("/auth", authRoutes);

// Protected routes
router.use("/bookings", bookingRoutes);
router.use("/users", userRoutes);

router.use("/court", courtRoutes);
router.use("/courts", courtRoutes);
router.use("/booking", bookingRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/customer", customerRoutes);
router.use("/user", meRoutes);
router.use("/loyalty", loyaltyRoutes);
router.use("/audit-logs", auditRoutes);
router.use("/payments", paymentRoutes);
router.use("/finance-officer", financeOfficerRoutes);
router.use("/vouchers", voucherRoutes);
router.use("/giftcards", giftcardRoutes);
router.use("/admin/system-config", systemConfigRoutes);
router.use("/admin", adminBallTypeRoutes); // Admin ball types CRUD
router.use("/referral", referralRoutes);
router.use("/manager/loyalty-config", loyaltyConfigRoutes);
router.use("/shop", shopRoutes); // Shop management routes
router.use("/equipment-rentals", equipmentRentalRoutes); // Standalone equipment rentals

router.use(ballTypeRoutes); // Public ball types endpoint
// router.use("/payments", paymentRoutes);
// router.use("/staff", staffRoutes);

// API info
router.get("/", (req, res) => {
  res.json({
    name: "Tudor Padel API",
    version: "1.0.0",
    status: "active",
    timestamp: new Date().toISOString(),
  });
});

export default router;
