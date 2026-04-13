import { Router, Request, Response } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import prisma from "../config/db";
import { generateRentalCode } from "../utils/helpers";

const router = Router();

// ============================================================================
// GET /equipment-rentals/available — list equipment available for standalone rental
// ============================================================================
router.get("/available", async (_req: Request, res: Response) => {
  try {
    const equipment = await prisma.equipment.findMany({
      where: { isActive: true },
      orderBy: [{ type: "asc" }, { rentalPrice: "asc" }],
      select: {
        id: true,
        name: true,
        type: true,
        brand: true,
        rentalPrice: true,
        totalQuantity: true,
        availableQty: true,
        condition: true,
      },
    });

    return res.json({
      success: true,
      data: equipment.map((e) => ({
        ...e,
        rentalPrice: Number(e.rentalPrice),
        inStock: e.availableQty > 0,
      })),
    });
  } catch (error) {
    console.error("Error fetching available equipment:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch available equipment",
    });
  }
});

// ============================================================================
// POST /equipment-rentals/standalone — initiate standalone equipment rental
// ============================================================================
router.post(
  "/standalone",
  authenticate,
  authorize("CUSTOMER", "ADMIN", "SUPER_ADMIN", "BOOKING_OFFICER"),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const {
        phoneNumber,
        items, // Array<{ equipmentId: string; quantity: number }>
      } = req.body;

      // --- Validation ---
      if (!phoneNumber || !phoneNumber.trim()) {
        return res.status(400).json({
          success: false,
          message: "Phone number is required for M-Pesa payment.",
        });
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one equipment item is required.",
        });
      }

      if (items.length > 10) {
        return res.status(400).json({
          success: false,
          message: "Maximum 10 distinct equipment items per rental.",
        });
      }

      // Validate each item
      for (const item of items) {
        if (!item.equipmentId || !item.quantity) {
          return res.status(400).json({
            success: false,
            message: "Each item must have equipmentId and quantity.",
          });
        }
        const qty = Number(item.quantity);
        if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
          return res.status(400).json({
            success: false,
            message: "Item quantity must be a whole number between 1 and 10.",
          });
        }
      }

      // Fetch equipment records
      const equipmentIds = items.map((i: any) => i.equipmentId);
      const equipmentRecords = await prisma.equipment.findMany({
        where: { id: { in: equipmentIds }, isActive: true },
      });

      if (equipmentRecords.length !== equipmentIds.length) {
        return res.status(400).json({
          success: false,
          message:
            "One or more selected equipment items are unavailable or inactive.",
        });
      }

      // Check stock
      const equipmentMap = new Map(equipmentRecords.map((e) => [e.id, e]));
      const lineItems: Array<{
        equipmentId: string;
        name: string;
        type: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
      }> = [];

      for (const item of items) {
        const eq = equipmentMap.get(item.equipmentId);
        if (!eq) continue;
        const qty = Number(item.quantity);
        if (eq.availableQty < qty) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for "${eq.name}". Available: ${eq.availableQty}, Requested: ${qty}`,
          });
        }
        const unitPrice = Number(eq.rentalPrice);
        lineItems.push({
          equipmentId: eq.id,
          name: eq.name,
          type: eq.type,
          quantity: qty,
          unitPrice,
          subtotal: qty * unitPrice,
        });
      }

      const totalAmount = lineItems.reduce((s, l) => s + l.subtotal, 0);
      if (totalAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid total amount.",
        });
      }

      const rentalCode = generateRentalCode();

      // --- Initiate M-Pesa STK push via the existing payment flow ---
      // We use context = "STANDALONE_RENTAL" so the callback handler knows
      // to create EquipmentRental records (not a court booking).
      const MpesaService = (await import("../services/mpesa.service")).default;
      const normalizedPhone = MpesaService.normalizePhone(phoneNumber);

      // Save phone to user profile if missing
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { phone: true },
        });
        if (!user?.phone) {
          await prisma.user.update({
            where: { id: userId },
            data: { phone: normalizedPhone },
          });
        }
      } catch (_e) {
        /* best effort */
      }

      const result = await MpesaService.initiateStkPush({
        phoneNumber: normalizedPhone,
        amount: totalAmount,
        accountReference: rentalCode.substring(0, 12),
        description: `Equipment rental ${rentalCode}`,
        userId,
        context: "STANDALONE_RENTAL",
        paymentMetadata: {
          standaloneRental: {
            rentalCode,
            userId,
            items: lineItems,
            totalAmount,
            type: "STANDALONE_RENTAL",
          },
        },
      });

      // Persist rental metadata on the created payment
      try {
        const paymentId = (result as any)?.paymentId;
        if (paymentId) {
          const existing = await prisma.payment.findUnique({
            where: { id: paymentId },
            select: { metadata: true },
          });
          await prisma.payment.update({
            where: { id: paymentId },
            data: {
              metadata: {
                ...((existing?.metadata as any) || {}),
                context: "STANDALONE_RENTAL",
                standaloneRental: {
                  rentalCode,
                  userId,
                  items: lineItems,
                  totalAmount,
                  type: "STANDALONE_RENTAL",
                },
              } as any,
            },
          });
        }
      } catch (e) {
        console.warn("Failed to persist standalone rental metadata", e);
      }

      return res.status(200).json({
        success: true,
        message: "Payment initiated. Check your phone for the M-Pesa prompt.",
        data: {
          paymentId: (result as any)?.paymentId,
          rentalCode,
          totalAmount,
          items: lineItems,
          CustomerMessage:
            (result as any)?.CustomerMessage ||
            "STK push sent. Please check your phone.",
        },
      });
    } catch (error: any) {
      console.error("Standalone equipment rental error:", error);
      return res.status(500).json({
        success: false,
        message:
          error?.message || "Failed to initiate rental. Please try again.",
      });
    }
  },
);

// ============================================================================
// GET /equipment-rentals/my-rentals — customer's standalone rentals
// ============================================================================
router.get("/my-rentals", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const rentals = await prisma.equipmentRental.findMany({
      where: {
        userId,
        bookingId: null, // standalone only
      },
      include: {
        equipment: {
          select: {
            id: true,
            name: true,
            type: true,
            brand: true,
            rentalPrice: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      data: rentals.map((r) => ({
        id: r.id,
        rentalCode: r.rentalCode,
        quantity: r.quantity,
        price: Number(r.price),
        total: r.quantity * Number(r.price),
        status: r.status,
        equipment: {
          ...r.equipment,
          rentalPrice: Number(r.equipment.rentalPrice),
        },
        createdAt: r.createdAt,
        returnedAt: r.returnedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching my rentals:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch your equipment rentals",
    });
  }
});

export default router;
