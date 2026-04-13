import { Router } from "express";
import { BallTypeController } from "../controllers/admin/ball-type.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();

// Public route - Get active ball types (for customer booking)
router.get("/ball-types", BallTypeController.getActiveBallTypes);

// Admin/Manager routes - Ball type management
router.get(
  "/admin/ball-types",
  authenticate,
  authorize("SUPER_ADMIN", "MANAGER"),
  BallTypeController.getAllBallTypes
);

router.get(
  "/admin/ball-types/:id",
  authenticate,
  authorize("SUPER_ADMIN", "MANAGER"),
  BallTypeController.getBallTypeById
);

router.post(
  "/admin/ball-types",
  authenticate,
  authorize("SUPER_ADMIN", "MANAGER"),
  BallTypeController.createBallType
);

router.put(
  "/admin/ball-types/:id",
  authenticate,
  authorize("SUPER_ADMIN", "MANAGER"),
  BallTypeController.updateBallType
);

router.delete(
  "/admin/ball-types/:id",
  authenticate,
  authorize("SUPER_ADMIN", "MANAGER"),
  BallTypeController.deleteBallType
);

router.patch(
  "/admin/ball-types/:id/stock",
  authenticate,
  authorize("SUPER_ADMIN", "MANAGER"),
  BallTypeController.updateBallTypeStock
);

export default router;
