import { Router } from "express";
import PaymentController from "../controllers/payment.controller";
import B2CController from "../controllers/b2c.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { requireTwoFactorStrict } from "../middleware/twofa.middleware";
import { verifyMpesaCallback } from "../middleware/mpesa-callback.middleware";

const router = Router();

router.post("/stk-push", authenticate, PaymentController.initiateStkPush);

router.post(
  "/stk-callback",
  verifyMpesaCallback,
  PaymentController.stkCallback
);

// B2C refund callback routes
router.post("/mpesa/b2c/result", verifyMpesaCallback, B2CController.result);
router.post("/mpesa/b2c/timeout", verifyMpesaCallback, B2CController.timeout);

router.get(
  "/",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "FINANCE_OFFICER", "MANAGER"),
  PaymentController.listPayments
);

router.get(
  "/mpesa/query/:checkoutRequestId",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN", "FINANCE_OFFICER", "MANAGER"),
  PaymentController.queryMpesaStatus
);
router.get("/:id/status", authenticate, PaymentController.getPaymentStatus);
router.get("/:id", authenticate, PaymentController.getPayment);
router.get(
  "/by-booking/:bookingId",
  authenticate,
  PaymentController.getPaymentByBooking
);

router.post(
  "/:id/refund",
  authenticate,
  // Finance Officer now also allowed to initiate refunds
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER", "FINANCE_OFFICER"),
  requireTwoFactorStrict,
  PaymentController.refundPayment
);

export default router;
