import { Request, Response } from "express";
import * as loyaltyConfigService from "../../services/loyalty-config.service";

export class LoyaltyConfigController {
  /**
   * Get the active loyalty configuration
   */
  static async getActiveConfig(req: Request, res: Response) {
    try {
      const config = await loyaltyConfigService.getActiveLoyaltyConfig();
      
      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      console.error("Get active loyalty config error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch loyalty configuration",
      });
    }
  }

  /**
   * Get all loyalty configurations
   */
  static async getAllConfigs(req: Request, res: Response) {
    try {
      const configs = await loyaltyConfigService.getAllLoyaltyConfigs();
      
      res.json({
        success: true,
        data: configs,
      });
    } catch (error) {
      console.error("Get all loyalty configs error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch loyalty configurations",
      });
    }
  }

  /**
   * Get loyalty configuration by ID
   */
  static async getConfigById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const config = await loyaltyConfigService.getLoyaltyConfigById(id);
      
      if (!config) {
        return res.status(404).json({
          success: false,
          message: "Loyalty configuration not found",
        });
      }

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      console.error("Get loyalty config by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch loyalty configuration",
      });
    }
  }

  /**
   * Create a new loyalty configuration
   */
  static async createConfig(req: Request, res: Response) {
    try {
      const {
        pointsPerCurrency,
        currencyUnit,
        registrationBonusPoints,
        referralBonusPoints,
        minimumRedeemablePoints,
        pointsToGiftCardRatio,
        isActive,
      } = req.body;

      // Validate required fields
      if (
        pointsPerCurrency === undefined ||
        currencyUnit === undefined ||
        registrationBonusPoints === undefined ||
        referralBonusPoints === undefined ||
        minimumRedeemablePoints === undefined ||
        pointsToGiftCardRatio === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: "All configuration fields are required",
        });
      }

      // Validate positive numbers
      if (
        pointsPerCurrency < 0 ||
        currencyUnit <= 0 ||
        registrationBonusPoints < 0 ||
        referralBonusPoints < 0 ||
        minimumRedeemablePoints < 0 ||
        pointsToGiftCardRatio <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "All values must be positive numbers (currencyUnit and pointsToGiftCardRatio must be greater than 0)",
        });
      }

      const config = await loyaltyConfigService.createLoyaltyConfig({
        pointsPerCurrency,
        currencyUnit,
        registrationBonusPoints,
        referralBonusPoints,
        minimumRedeemablePoints,
        pointsToGiftCardRatio,
        isActive: isActive ?? false,
      });

      res.status(201).json({
        success: true,
        message: "Loyalty configuration created successfully",
        data: config,
      });
    } catch (error) {
      console.error("Create loyalty config error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create loyalty configuration",
      });
    }
  }

  /**
   * Update loyalty configuration
   */
  static async updateConfig(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        pointsPerCurrency,
        currencyUnit,
        registrationBonusPoints,
        referralBonusPoints,
        minimumRedeemablePoints,
        pointsToGiftCardRatio,
        isActive,
      } = req.body;

      // Validate positive numbers if provided
      if (
        (pointsPerCurrency !== undefined && pointsPerCurrency < 0) ||
        (currencyUnit !== undefined && currencyUnit <= 0) ||
        (registrationBonusPoints !== undefined && registrationBonusPoints < 0) ||
        (referralBonusPoints !== undefined && referralBonusPoints < 0) ||
        (minimumRedeemablePoints !== undefined && minimumRedeemablePoints < 0) ||
        (pointsToGiftCardRatio !== undefined && pointsToGiftCardRatio <= 0)
      ) {
        return res.status(400).json({
          success: false,
          message: "All values must be positive numbers (currencyUnit and pointsToGiftCardRatio must be greater than 0)",
        });
      }

      const config = await loyaltyConfigService.updateLoyaltyConfig(id, {
        pointsPerCurrency,
        currencyUnit,
        registrationBonusPoints,
        referralBonusPoints,
        minimumRedeemablePoints,
        pointsToGiftCardRatio,
        isActive,
      });

      res.json({
        success: true,
        message: "Loyalty configuration updated successfully",
        data: config,
      });
    } catch (error) {
      console.error("Update loyalty config error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update loyalty configuration",
      });
    }
  }

  /**
   * Delete loyalty configuration
   */
  static async deleteConfig(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      await loyaltyConfigService.deleteLoyaltyConfig(id);

      res.json({
        success: true,
        message: "Loyalty configuration deleted successfully",
      });
    } catch (error: any) {
      console.error("Delete loyalty config error:", error);
      
      if (error.message === "Cannot delete the active loyalty configuration") {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to delete loyalty configuration",
      });
    }
  }

  /**
   * Activate a loyalty configuration
   */
  static async activateConfig(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const config = await loyaltyConfigService.activateLoyaltyConfig(id);

      res.json({
        success: true,
        message: "Loyalty configuration activated successfully",
        data: config,
      });
    } catch (error) {
      console.error("Activate loyalty config error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to activate loyalty configuration",
      });
    }
  }
}
