import { Router } from "express";
import { body } from "express-validator";
import { AuthController } from "../controllers/auth.controller";
import validateRequest from "../middleware/validation.middleware";
import {
  authenticate,
  optionalAuthenticate,
} from "../middleware/auth.middleware";

const router = Router();

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Invalid email or password"),
    body("password")
      .isString()
      .isLength({ min: 6 })
      .withMessage("Invalid email or password"),
  ],
  validateRequest,
  AuthController.login
);

router.get("/session", authenticate, AuthController.session);

router.post(
  "/register",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isString()
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    body("firstName").notEmpty().withMessage("First name is required"),
    body("lastName").notEmpty().withMessage("Last name is required"),
    body("phone").optional().isMobilePhone("any"),
  ],
  validateRequest,
  AuthController.register
);

router.post("/refresh", AuthController.refreshToken);

router.post("/logout", optionalAuthenticate, AuthController.logout);

router.post(
  "/forgot-password",
  [body("email").isEmail().withMessage("Valid email is required")],
  validateRequest,
  AuthController.forgotPassword
);

router.post(
  "/reset-password",
  [
    body("token").notEmpty().withMessage("Reset token is required"),
    body("newPassword")
      .isString()
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
  ],
  validateRequest,
  AuthController.resetPassword
);

router.get("/verify-email", AuthController.verifyEmail);
router.post(
  "/resend-verification",
  [body("email").isEmail().withMessage("Valid email is required")],
  validateRequest,
  AuthController.resendVerification
);

router.post(
  "/2fa/verify",
  authenticate,
  [body("code").notEmpty().withMessage("Code is required")],
  validateRequest,
  AuthController.verifyTwoFA
);

export default router;
