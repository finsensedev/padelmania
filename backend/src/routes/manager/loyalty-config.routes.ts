import { Router } from "express";
import { LoyaltyConfigController } from "../../controllers/manager/loyalty-config.controller";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { requireTwoFactor } from "../../middleware/twofa.middleware";

const router = Router();

// All routes require authentication and manager/admin role
router.use(authenticate);
router.use(authorize("MANAGER", "ADMIN"));

// Get active configuration (no 2FA required for reading)
router.get("/active", LoyaltyConfigController.getActiveConfig);

// Get all configurations (no 2FA required for reading)
router.get("/", LoyaltyConfigController.getAllConfigs);

// Get configuration by ID (no 2FA required for reading)
router.get("/:id", LoyaltyConfigController.getConfigById);

// Create new configuration (requires 2FA)
router.post("/", requireTwoFactor, LoyaltyConfigController.createConfig);

// Update configuration (requires 2FA)
router.put("/:id", requireTwoFactor, LoyaltyConfigController.updateConfig);

// Delete configuration (requires 2FA)
router.delete("/:id", requireTwoFactor, LoyaltyConfigController.deleteConfig);

// Activate configuration (requires 2FA)
router.patch("/:id/activate", requireTwoFactor, LoyaltyConfigController.activateConfig);

export default router;
