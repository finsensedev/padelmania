import { Prisma } from "@prisma/client";
import prisma from "../config/db";
import { sendShopOrderConfirmationEmail } from "../utils/email.util";
import { emitProductStockUpdated, emitProductRemoved, emitShopOrderUpdate } from "../utils/ws-bus";
import { InventoryService } from "./inventory.service";

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

export const shopOrderService = {
  async createOrder(data: {
    userId: string;
    productId: string;
    variantId?: string;
    quantity: number;
    phoneNumber: string;
    transactionId: string; // Using transactionId instead of checkoutRequestID
  }) {
    const { userId, productId, variantId, quantity, phoneNumber, transactionId } = data;

    // Get product details
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        images: {
          where: { isPrimary: true },
          take: 1,
        },
        category: true,
        variants: variantId ? { where: { id: variantId } } : false,
      },
    });

    if (!product) {
      throw new Error("Product not found");
    }

    if (!product.isActive) {
      throw new Error("Product is not available");
    }

    // Round prices to integers for M-Pesa compatibility
    let price = Math.round(Number(product.salePrice || product.basePrice));
    let stockQuantity = product.stockQuantity;
    let variantName = null;
    let sku = product.sku;

    if (variantId) {
      const variant = product.variants?.[0];
      if (!variant) {
        throw new Error("Product variant not found");
      }
      if (!variant.isActive) {
        throw new Error("Product variant is not available");
      }
      price = Math.round(Number(variant.salePrice || variant.price || price));
      stockQuantity = variant.stockQuantity;
      variantName = variant.name;
      sku = variant.sku || sku;
    }

    if (stockQuantity < quantity) {
      throw new Error(`Insufficient stock. Only ${stockQuantity} available`);
    }

    // Ensure amounts are integers
    const subtotal = Math.round(price * quantity);
    const totalAmount = subtotal;

    // Create order in transaction
    const order = await prisma.$transaction(async (tx) => {
      const orderNumber = generateOrderNumber();
      const primaryImage = product.images.find(img => img.isPrimary) || product.images[0];
      
      // Create order
      const newOrder = await tx.shopOrder.create({
        data: {
          userId,
          orderNumber,
          subtotal: new Prisma.Decimal(subtotal),
          totalAmount: new Prisma.Decimal(totalAmount),
          status: "PENDING",
          paymentStatus: "PENDING",
          items: {
            create: {
              productId,
              variantId,
              productName: product.name,
              variantName,
              productImage: primaryImage?.imageUrl || null,
              sku: sku || null,
              quantity,
              unitPrice: new Prisma.Decimal(price),
              subtotal: new Prisma.Decimal(subtotal),
              total: new Prisma.Decimal(subtotal),
            },
          },
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: true,
                  category: true,
                },
              },
            },
          },
          user: true,
        },
      });

      // Create payment record
      await tx.shopOrderPayment.create({
        data: {
          orderId: newOrder.id,
          amount: new Prisma.Decimal(totalAmount),
          phoneNumber,
          transactionId,
          status: "PENDING",
          method: "MPESA",
          provider: "MPESA",
        },
      });

      // DO NOT deduct stock here - wait for payment confirmation
      // Stock will be deducted in updateOrderPaymentStatus when payment is COMPLETED

      return newOrder;
    });

    return order;
  },

  async updateOrderPaymentStatus(
    transactionId: string,
    status: "COMPLETED" | "FAILED" | "CANCELLED",
    mpesaReceiptNumber?: string
  ) {
    const payment = await prisma.shopOrderPayment.findFirst({
      where: { transactionId },
      include: {
        order: {
          include: {
            user: true,
            items: {
              include: {
                product: {
                  include: {
                    images: true,
                    category: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new Error("Payment not found");
    }

    await prisma.$transaction(async (tx) => {
      // Update payment
      await tx.shopOrderPayment.update({
        where: { id: payment.id },
        data: {
          status,
          mpesaReceiptNumber,
          paidAt: status === "COMPLETED" ? new Date() : undefined,
        },
      });

      // Update order status and payment status
      const updatedOrder = await tx.shopOrder.update({
        where: { id: payment.orderId },
        data: {
          status: status === "COMPLETED" ? "CONFIRMED" : "CANCELLED",
          paymentStatus: status,
          paidAt: status === "COMPLETED" ? new Date() : undefined,
        },
      });

      // Get order items
      const orderItems = await tx.shopOrderItem.findMany({
        where: { orderId: payment.orderId },
      });

      // If payment is COMPLETED, NOW deduct stock
      if (status === "COMPLETED") {
        for (const item of orderItems) {
          // Get current product stock
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });

          if (!product) {
            throw new Error(`Product ${item.productId} not found`);
          }

          // Deduct stock
          const updatedProduct = await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: {
                decrement: item.quantity,
              },
            },
          });

          // Create inventory log for sale
          await tx.inventoryLog.create({
            data: {
              productId: item.productId,
              changeType: "SALE",
              quantityBefore: product.stockQuantity,
              quantityChange: -item.quantity,
              quantityAfter: product.stockQuantity - item.quantity,
              referenceType: "SHOP_ORDER",
              referenceId: payment.orderId,
              reason: `Sold via shop order ${updatedOrder.orderNumber} - Payment confirmed`,
            },
          });

          // Emit socket event for real-time stock update
          emitProductStockUpdated({
            productId: item.productId,
            newStock: updatedProduct.stockQuantity,
            productName: item.productName,
          });

          // If product is out of stock, emit removal event
          if (updatedProduct.stockQuantity === 0) {
            emitProductRemoved({
              productId: item.productId,
              productName: item.productName,
            });
          }

          // Check stock level and send email if low (async)
          InventoryService.checkProductStockLevel(item.productId).catch((error: unknown) => {
            console.error('Error checking product stock level:', error);
          });
        }
      } else if (status === "FAILED" || status === "CANCELLED") {
        // If payment failed/cancelled, create inventory log for tracking (no stock change)
        for (const item of orderItems) {
          await tx.inventoryLog.create({
            data: {
              productId: item.productId,
              changeType: "SALE",
              quantityBefore: 0, // No stock was held
              quantityChange: 0, // No actual change
              quantityAfter: 0,  // No stock affected
              referenceType: "SHOP_ORDER",
              referenceId: payment.orderId,
              reason: `Payment ${status.toLowerCase()} for shop order ${updatedOrder.orderNumber} - No stock deducted`,
            },
          });
        }
      }
    });

    // Get the updated order
    const updatedOrder = await prisma.shopOrder.findUnique({
      where: { id: payment.orderId },
      include: {
        user: true,
        items: true,
        payment: true,
      },
    });

    // Emit WebSocket event for real-time UI update
    if (updatedOrder) {
      emitShopOrderUpdate(updatedOrder.userId, {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        status: updatedOrder.status,
        paymentStatus: updatedOrder.paymentStatus,
        message: status === "COMPLETED" 
          ? "Payment successful! Your order is confirmed." 
          : status === "FAILED"
          ? "Payment failed. Please try again."
          : "Payment cancelled.",
      });
    }

    // Send confirmation email if completed
    if (status === "COMPLETED") {
      const order = await prisma.shopOrder.findUnique({
        where: { id: payment.orderId },
        include: {
          user: true,
          items: {
            include: {
              product: {
                include: {
                  images: true,
                  category: true,
                },
              },
            },
          },
        },
      });
      
      if (order && order.user.email) {
        await sendShopOrderConfirmationEmail(order as any);
      }
    }

    // Return the updated order
    return updatedOrder;
  },

  async getOrderById(orderId: string) {
    return prisma.shopOrder.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: true,
                category: true,
              },
            },
          },
        },
        payment: true,
        user: true,
      },
    });
  },

  async getCustomerOrders(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.shopOrder.findMany({
        where: { userId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: {
                    where: { isPrimary: true },
                    take: 1,
                  },
                },
              },
            },
          },
          payment: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.shopOrder.count({ where: { userId } }),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  },
};
