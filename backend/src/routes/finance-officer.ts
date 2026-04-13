import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { requireTwoFactorStrict } from "../middleware/twofa.middleware";
import FinanceOfficerController from "../controllers/finance-officer.controller";

const router = Router();

// Dashboard Statistics
router.get(
  "/dashboard/stats",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getDashboardStats
);

// User Management (Read-only)
router.get(
  "/users",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getUsers
);

router.get(
  "/users/:id",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getUserById
);

router.post(
  "/users/export",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.exportUsers
);

// Bookings Management
router.get(
  "/bookings",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getBookings
);

router.get(
  "/bookings/:date",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getBookingsByDate
);

// Transactions Management
router.get(
  "/transactions",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getTransactions
);

router.get(
  "/transactions/:id",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getTransactionById
);

router.post(
  "/transactions/export",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  requireTwoFactorStrict,
  FinanceOfficerController.exportTransactions
);

// Bookings Export
router.post(
  "/bookings/export",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  requireTwoFactorStrict,
  FinanceOfficerController.exportBookings
);

// Refunds Management
router.get(
  "/refunds/pending",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getPendingRefunds
);

router.get(
  "/refunds",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getRefunds
);

router.post(
  "/refunds/:refundId/approve",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  requireTwoFactorStrict,
  FinanceOfficerController.approveRefund
);

router.post(
  "/refunds/:refundId/reject",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  requireTwoFactorStrict,
  FinanceOfficerController.rejectRefund
);

router.post(
  "/refunds/:refundId/process",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  requireTwoFactorStrict,
  FinanceOfficerController.processRefund
);

// Refunds Export
router.post(
  "/refunds/export",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  requireTwoFactorStrict,
  FinanceOfficerController.exportRefunds
);

// Reports Generation
// Reports metrics: allow MANAGER to view financial summaries
router.get(
  "/reports/metrics",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getReportMetrics
);
// Templates list (read-only)
router.get(
  "/reports/templates",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getReportTemplates
);

// Report generation - Managers can generate reports (they supervise Finance Officers)
router.post(
  "/reports/generate",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  requireTwoFactorStrict,
  FinanceOfficerController.generateReport
);

router.get(
  "/reports/:reportId",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getReport
);

// Direct download - Managers can download (with 2FA)
router.get(
  "/reports/:reportId/download",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  requireTwoFactorStrict,
  FinanceOfficerController.downloadReport
);

router.get(
  "/reports",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getReports
);

// Financial Analytics
router.get(
  "/analytics/revenue",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getRevenueAnalytics
);

router.get(
  "/analytics/transactions",
  authenticate,
  authorize("FINANCE_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  FinanceOfficerController.getTransactionAnalytics
);

export default router;
