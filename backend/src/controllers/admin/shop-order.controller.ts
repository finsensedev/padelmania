import { Request, Response } from "express";
import { shopOrderService } from "../../services/shop-order.service";
import { MpesaService } from "../../services/mpesa.service";
import prisma from "../../config/db";

const mpesaService = new MpesaService();

export class ShopOrderController {
  /**
   * Create a new shop order and initiate payment
   * POST /api/shop/orders
   */
  async createOrder(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { productId, variantId, quantity, phoneNumber } = req.body;

      if (!productId || !quantity || !phoneNumber) {
        return res.status(400).json({
          message: "Missing required fields: productId, quantity, phoneNumber",
        });
      }

      if (quantity <= 0) {
        return res.status(400).json({ message: "Quantity must be greater than 0" });
      }

      // Get product to calculate amount
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          variants: variantId ? { where: { id: variantId } } : false,
        },
      });

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (!product.isActive) {
        return res.status(400).json({ message: "Product is not available" });
      }

      // Round price to integer for M-Pesa compatibility
      let price = Math.round(Number(product.salePrice || product.basePrice));
      let stockQuantity = product.stockQuantity;
      let productName = product.name;

      if (variantId) {
        const variant = product.variants?.[0];
        if (!variant) {
          return res.status(404).json({ message: "Product variant not found" });
        }
        if (!variant.isActive) {
          return res.status(400).json({ message: "Product variant is not available" });
        }
        price = Math.round(Number(variant.salePrice || variant.price || price));
        stockQuantity = variant.stockQuantity;
        productName = `${product.name} - ${variant.name}`;
      }

      if (stockQuantity < quantity) {
        return res.status(400).json({
          message: `Insufficient stock. Only ${stockQuantity} available`,
        });
      }

      // Ensure totalAmount is an integer for M-Pesa
      const totalAmount = Math.round(price * quantity);

      // Initiate M-Pesa STK Push
      const stkResponse = await MpesaService.initiateStkPush({
        amount: totalAmount,
        phoneNumber,
        accountReference: `SHOP${Date.now()}`.substring(0, 12),
        description: `${productName}`.substring(0, 30),
        userId,
        context: "SHOP_PURCHASE",
        paymentMetadata: {
          productId,
          variantId,
          productName,
          quantity,
        },
      });

      // Get CheckoutRequestID from payment metadata
      const payment = await prisma.payment.findUnique({
        where: { id: stkResponse.paymentId },
        select: { transactionId: true, metadata: true },
      });

      const transactionId = payment?.transactionId;
      const checkoutRequestID = (payment?.metadata as any)?.CheckoutRequestID;

      if (!transactionId) {
        return res.status(500).json({
          message: "Failed to initiate payment - no transaction ID",
        });
      }

      // Create order with pending payment
      const order = await shopOrderService.createOrder({
        userId,
        productId,
        variantId,
        quantity,
        phoneNumber,
        transactionId,
      });

      return res.status(201).json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        checkoutRequestID,
        message: stkResponse.CustomerMessage || "Payment initiated. Please complete on your phone.",
      });
    } catch (error: any) {
      console.error("Error creating shop order:", error);
      return res.status(500).json({
        message: error.message || "Failed to create order",
      });
    }
  }

  /**
   * Get order by ID
   * GET /api/shop/orders/:id
   */
  async getOrder(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const order = await shopOrderService.getOrderById(id);

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only allow customer to view their own orders (or admin/manager)
      const userRole = req.user?.role;
      const isAdminOrManager = ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(userRole || "");
      
      if (order.userId !== userId && !isAdminOrManager) {
        return res.status(403).json({ message: "Access denied" });
      }

      return res.status(200).json(order);
    } catch (error: any) {
      console.error("Error fetching order:", error);
      return res.status(500).json({
        message: error.message || "Failed to fetch order",
      });
    }
  }

  /**
   * Get customer's orders
   * GET /api/shop/orders
   */
  async getCustomerOrders(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await shopOrderService.getCustomerOrders(userId, page, limit);

      return res.status(200).json(result);
    } catch (error: any) {
      console.error("Error fetching customer orders:", error);
      return res.status(500).json({
        message: error.message || "Failed to fetch orders",
      });
    }
  }
}

export const shopOrderController = new ShopOrderController();
