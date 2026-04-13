import { sendMail } from "./mailer";
import { Decimal } from "@prisma/client/runtime/library";

interface ShopOrderWithDetails {
  id: string;
  orderNumber: string;
  userId: string;
  totalAmount: Decimal | number;
  createdAt: Date;
  status: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  items: Array<{
    id: string;
    productName: string;
    productImage: string | null;
    quantity: number;
    unitPrice: Decimal | number;
    total: Decimal | number;
    product?: {
      id: string;
      name: string;
      brand: string | null;
      description: string | null;
      images: Array<{
        imageUrl: string;
        isPrimary: boolean;
      }>;
      category: {
        name: string;
      } | null;
    };
  }>;
}

export async function sendShopOrderConfirmationEmail(order: ShopOrderWithDetails) {
  if (!order.user.email) {
    console.warn(`No email address for user ${order.user.id}`);
    return;
  }

  const emailHtml = buildShopOrderConfirmationEmail(order);
  
  try {
    await sendMail({
      to: order.user.email,
      subject: `Order Confirmation #${order.orderNumber} - Padel Mania Shop`,
      html: emailHtml,
    });
    console.log(`✅ Shop order confirmation email sent to ${order.user.email}`);
  } catch (error) {
    console.error("Failed to send shop order confirmation email:", error);
    throw error;
  }
}

function buildShopOrderConfirmationEmail(order: ShopOrderWithDetails): string {
  const customerName = `${order.user.firstName} ${order.user.lastName}`;
  const orderDate = new Date(order.createdAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const orderTime = new Date(order.createdAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const itemsHtml = order.items
    .map((item) => {
      const imageUrl = item.productImage || 
        (item.product?.images.find((img) => img.isPrimary)?.imageUrl) || 
        (item.product?.images[0]?.imageUrl) || 
        "";
      const brand = item.product?.brand ? `${item.product.brand} - ` : "";
      const productName = item.productName;
      const categoryName = item.product?.category?.name || "";

      return `
        <tr>
          <td style="padding: 16px; border-bottom: 1px solid #e5e7eb;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="100" valign="top">
                  ${imageUrl ? `<img 
                    src="${imageUrl}" 
                    alt="${productName}"
                    style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; display: block;"
                  />` : ''}
                </td>
                <td style="padding-left: 16px;" valign="top">
                  <div style="font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 4px;">
                    ${brand}${productName}
                  </div>
                  ${categoryName ? `<div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">${categoryName}</div>` : ""}
                  <div style="font-size: 14px; color: #374151;">
                    Quantity: ${item.quantity} × KSh ${Number(item.unitPrice).toLocaleString()}
                  </div>
                  <div style="font-size: 16px; font-weight: 600; color: #16a34a; margin-top: 8px;">
                    KSh ${Number(item.total).toLocaleString()}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Confirmation</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f9fafb; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table cellpadding="0" cellspacing="0" border="0" width="600" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                    🎾 Order Confirmed!
                  </h1>
                  <p style="margin: 8px 0 0 0; color: #e0e7ff; font-size: 16px;">
                    Thank you for your purchase
                  </p>
                </td>
              </tr>

              <!-- Success Message -->
              <tr>
                <td style="padding: 32px; text-align: center; border-bottom: 1px solid #e5e7eb;">
                  <div style="display: inline-block; background-color: #dcfce7; border-radius: 50%; width: 64px; height: 64px; line-height: 64px; margin-bottom: 16px;">
                    <span style="font-size: 32px;">✓</span>
                  </div>
                  <h2 style="margin: 0 0 8px 0; color: #111827; font-size: 22px; font-weight: 600;">
                    Hi ${customerName}!
                  </h2>
                  <p style="margin: 0; color: #6b7280; font-size: 16px;">
                    Your order has been received and is being processed
                  </p>
                </td>
              </tr>

              <!-- Order Details -->
              <tr>
                <td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td style="padding-bottom: 8px;">
                        <span style="font-size: 14px; color: #6b7280;">Order Number:</span>
                      </td>
                      <td align="right" style="padding-bottom: 8px;">
                        <span style="font-size: 14px; font-weight: 600; color: #111827;">${order.orderNumber}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-bottom: 8px;">
                        <span style="font-size: 14px; color: #6b7280;">Order Date:</span>
                      </td>
                      <td align="right" style="padding-bottom: 8px;">
                        <span style="font-size: 14px; color: #111827;">${orderDate}</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <span style="font-size: 14px; color: #6b7280;">Order Time:</span>
                      </td>
                      <td align="right">
                        <span style="font-size: 14px; color: #111827;">${orderTime}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Order Items -->
              <tr>
                <td style="padding: 24px 32px 0 32px;">
                  <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 18px; font-weight: 600;">
                    Order Items
                  </h3>
                </td>
              </tr>
              <tr>
                <td style="padding: 0;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    ${itemsHtml}
                  </table>
                </td>
              </tr>

              <!-- Total -->
              <tr>
                <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 12px 12px;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td>
                        <span style="font-size: 18px; font-weight: 700; color: #111827;">Total Amount:</span>
                      </td>
                      <td align="right">
                        <span style="font-size: 24px; font-weight: 700; color: #16a34a;">
                          KSh ${order.totalAmount.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  </table>
                  <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px;">
                      ✨ Items will be available for pickup at Padel Mania
                    </p>
                    <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 14px;">
                      📧 Questions? Reply to this email or visit our shop
                    </p>
                  </div>
                </td>
              </tr>

            </table>

            <!-- Footer -->
            <table cellpadding="0" cellspacing="0" border="0" width="600" style="margin-top: 24px;">
              <tr>
                <td style="text-align: center; padding: 0 20px;">
                  <p style="margin: 0; color: #9ca3af; font-size: 14px;">
                    © ${new Date().getFullYear()} Padel Mania. All rights reserved.
                  </p>
                  <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 12px;">
                    This email was sent because you made a purchase on our platform.
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

interface LowStockProduct {
  id: string;
  name: string;
  sku: string | null;
  stockQuantity: number;
  lowStockThreshold: number;
  category?: {
    name: string;
  } | null;
}

export async function sendLowStockAlert(
  managerEmail: string,
  products: LowStockProduct[]
) {
  if (!managerEmail) {
    console.warn('No manager email provided for low stock alert');
    return;
  }

  const outOfStock = products.filter(p => p.stockQuantity === 0);
  const criticalStock = products.filter(p => p.stockQuantity > 0 && p.stockQuantity <= 2);
  
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Low Stock Alert</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0; padding: 20px 0;">
        <tr>
          <td align="center">

            <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                    ⚠️ Low Stock Alert
                  </h1>
                  <p style="margin: 10px 0 0 0; color: #fecaca; font-size: 16px;">
                    Immediate attention required
                  </p>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 40px 30px;">
                  
                  <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                    Hello Manager,
                  </p>

                  <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                    The following products require immediate restocking:
                  </p>

                  ${outOfStock.length > 0 ? `
                  <!-- Out of Stock -->
                  <div style="margin-bottom: 30px;">
                    <h2 style="margin: 0 0 15px 0; color: #dc2626; font-size: 18px; font-weight: 600; border-bottom: 2px solid #dc2626; padding-bottom: 8px;">
                      🔴 Out of Stock (${outOfStock.length})
                    </h2>
                    ${outOfStock.map(product => `
                      <div style="margin: 12px 0; padding: 15px; background-color: #fef2f2; border-left: 4px solid #dc2626; border-radius: 4px;">
                        <p style="margin: 0 0 5px 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                          ${product.name}
                        </p>
                        ${product.sku ? `<p style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;">SKU: ${product.sku}</p>` : ''}
                        ${product.category ? `<p style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;">Category: ${product.category.name}</p>` : ''}
                        <p style="margin: 5px 0 0 0; color: #dc2626; font-size: 14px; font-weight: 600;">
                          Stock: 0 units
                        </p>
                      </div>
                    `).join('')}
                  </div>
                  ` : ''}

                  ${criticalStock.length > 0 ? `
                  <!-- Critical Stock -->
                  <div style="margin-bottom: 30px;">
                    <h2 style="margin: 0 0 15px 0; color: #f59e0b; font-size: 18px; font-weight: 600; border-bottom: 2px solid #f59e0b; padding-bottom: 8px;">
                      🟡 Critical Stock Level (${criticalStock.length})
                    </h2>
                    ${criticalStock.map(product => `
                      <div style="margin: 12px 0; padding: 15px; background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px;">
                        <p style="margin: 0 0 5px 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                          ${product.name}
                        </p>
                        ${product.sku ? `<p style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;">SKU: ${product.sku}</p>` : ''}
                        ${product.category ? `<p style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;">Category: ${product.category.name}</p>` : ''}
                        <p style="margin: 5px 0 0 0; color: #f59e0b; font-size: 14px; font-weight: 600;">
                          Stock: ${product.stockQuantity} ${product.stockQuantity === 1 ? 'unit' : 'units'} remaining
                        </p>
                      </div>
                    `).join('')}
                  </div>
                  ` : ''}

                  <!-- Action Required -->
                  <div style="margin: 30px 0; padding: 20px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
                    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; font-weight: 600;">
                      📦 Action Required
                    </p>
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      Please restock these products as soon as possible to avoid lost sales.<br>
                      Login to your manager dashboard to update inventory.
                    </p>
                  </div>

                  <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                    Best regards,<br>
                    <strong>Padel Mania Inventory System</strong>
                  </p>

                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0; color: #6b7280; font-size: 14px;">
                    Padel Mania Shop - Inventory Management
                  </p>
                  <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 12px;">
                    This is an automated alert from your inventory management system.
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  try {
    await sendMail({
      to: managerEmail,
      subject: `⚠️ Low Stock Alert - ${outOfStock.length + criticalStock.length} Products Need Restocking`,
      html: emailHtml,
    });
    console.log(`Low stock alert sent to ${managerEmail}`);
  } catch (error) {
    console.error('Error sending low stock alert:', error);
    throw error;
  }
}
