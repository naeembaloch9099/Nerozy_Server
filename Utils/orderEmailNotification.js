import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Use the same transporter setup as the existing mailer
const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE || "gmail",
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASS,
  },
});

// Generate beautiful HTML email template for order confirmation
function generateOrderEmailHTML(order, customerEmail) {
  const orderDate = new Date(order.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const itemsHTML = (order.items || [])
    .map(
      (item) => `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px 0; color: #333;">${item.name || "Product"}</td>
      <td style="padding: 12px 0; text-align: center; color: #666;">${
        item.quantity || 1
      }</td>
      <td style="padding: 12px 0; text-align: right; color: #333; font-weight: 600;">PKR ${(
        (item.price || 0) * (item.quantity || 1)
      ).toFixed(2)}</td>
    </tr>
  `
    )
    .join("");

  const shippingAddress = order.shippingAddress || {};
  const recipientName =
    shippingAddress.fullName || shippingAddress.recipient || "Customer";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Confirmation - Nerozy</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 300; letter-spacing: 1px;">NEROZY</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Thank you for your purchase!</p>
        </div>

        <!-- Order Confirmation -->
        <div style="padding: 40px 30px;">
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="display: inline-block; background: #e8f5e8; color: #2d6a2d; padding: 12px 24px; border-radius: 25px; font-weight: 600; margin-bottom: 20px;">
              ✅ Order Confirmed
            </div>
            <h2 style="color: #333; margin: 0; font-size: 24px; font-weight: 400;">Order #${
              order.orderNumber
            }</h2>
            <p style="color: #666; margin: 8px 0 0 0; font-size: 14px;">${orderDate}</p>
          </div>

          <!-- Order Details -->
          <div style="background: #f8f9fa; border-radius: 12px; padding: 30px; margin-bottom: 30px;">
            <h3 style="color: #333; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">Order Summary</h3>
            
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 2px solid #ddd;">
                  <th style="text-align: left; padding: 12px 0; color: #555; font-weight: 600; font-size: 14px;">Item</th>
                  <th style="text-align: center; padding: 12px 0; color: #555; font-weight: 600; font-size: 14px;">Qty</th>
                  <th style="text-align: right; padding: 12px 0; color: #555; font-weight: 600; font-size: 14px;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHTML}
              </tbody>
            </table>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #667eea;">
              <div style="text-align: right;">
                <span style="font-size: 18px; font-weight: 700; color: #333;">Total: PKR ${(
                  order.total || 0
                ).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <!-- Shipping Information -->
          ${
            recipientName && recipientName !== "Customer"
              ? `
          <div style="background: #f8f9fa; border-radius: 12px; padding: 30px; margin-bottom: 30px;">
            <h3 style="color: #333; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">🚚 Shipping Address</h3>
            <div style="color: #555; line-height: 1.6;">
              <div style="font-weight: 600; color: #333; margin-bottom: 8px;">${
                shippingAddress.fullName || shippingAddress.recipient
              }</div>
              <div>${shippingAddress.address || ""}</div>
              <div>${shippingAddress.city || ""} ${
                  shippingAddress.postal || ""
                }</div>
              <div>${shippingAddress.country || ""}</div>
              ${
                shippingAddress.phone
                  ? `<div style="margin-top: 8px;">📞 ${shippingAddress.phone}</div>`
                  : ""
              }
              ${
                shippingAddress.email
                  ? `<div>📧 ${shippingAddress.email}</div>`
                  : ""
              }
            </div>
          </div>
          `
              : ""
          }

          <!-- Next Steps -->
          <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 12px; padding: 30px; color: white; text-align: center;">
            <h3 style="margin: 0 0 15px 0; font-size: 20px; font-weight: 600;">What's Next?</h3>
            <p style="margin: 0 0 20px 0; opacity: 0.9; line-height: 1.6;">
              We'll send you a shipping confirmation email with tracking information once your order is on its way.
              Your order will be processed within 1-2 business days.
            </p>
            <div style="background: rgba(255,255,255,0.2); border-radius: 8px; padding: 15px; margin-top: 20px;">
              <p style="margin: 0; font-size: 14px; opacity: 0.9;">
                Questions? Contact us at <strong>support@nerozy.com</strong>
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; margin-top: 40px; padding-top: 30px; border-top: 1px solid #eee;">
            <p style="color: #888; font-size: 14px; margin: 0;">
              Thank you for choosing Nerozy! We appreciate your business.
            </p>
            <div style="margin-top: 20px;">
              <a href="#" style="color: #667eea; text-decoration: none; margin: 0 10px; font-size: 14px;">Track Order</a>
              <span style="color: #ddd;">|</span>
              <a href="#" style="color: #667eea; text-decoration: none; margin: 0 10px; font-size: 14px;">Contact Support</a>
              <span style="color: #ddd;">|</span>
              <a href="#" style="color: #667eea; text-decoration: none; margin: 0 10px; font-size: 14px;">Return Policy</a>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate status update email template
function generateStatusUpdateEmailHTML(
  order,
  customerEmail,
  oldStatus,
  newStatus
) {
  const orderDate = new Date(order.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const statusMessages = {
    pending: {
      title: "Order Received",
      message: "We've received your order and it's being processed.",
      icon: "⏳",
      color: "#f59e0b",
      gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    },
    confirmed: {
      title: "Order Confirmed",
      message:
        "Great news! Your order has been confirmed and will be prepared for shipment soon.",
      icon: "✅",
      color: "#10b981",
      gradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    },
    shipped: {
      title: "Order Shipped",
      message:
        "Great news! Your order is on its way to you. You'll receive it soon!",
      icon: "🚚",
      color: "#8b5cf6",
      gradient: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
    },
    delivered: {
      title: "Order Delivered",
      message:
        "Your order has been successfully delivered! We hope you enjoy your purchase.",
      icon: "🎉",
      color: "#10b981",
      gradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    },
    canceled: {
      title: "Order Cancelled",
      message:
        "Your order has been cancelled as requested. If this was a mistake or you have any questions, please contact our support team.",
      icon: "❌",
      color: "#ef4444",
      gradient: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    },
  };

  const statusInfo = statusMessages[newStatus] || statusMessages.pending;
  const isCancelled = newStatus === "canceled";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${statusInfo.title} - Nerozy</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f3f4f6;">
      <div style="padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); overflow: hidden;">
          
          <!-- Header -->
          <div style="background: ${
            statusInfo.gradient
          }; padding: 50px 30px; text-align: center; color: white;">
            <div style="font-size: 64px; margin-bottom: 20px; animation: bounce 1s;">${
              statusInfo.icon
            }</div>
            <h1 style="margin: 0 0 12px 0; font-size: 32px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">${
              statusInfo.title
            }</h1>
            <p style="margin: 0; font-size: 16px; opacity: 0.95;">Order #${
              order.orderNumber
            }</p>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <!-- Message -->
            <div style="text-align: center; margin-bottom: 35px;">
              <p style="font-size: 18px; color: #333; margin: 0 0 16px 0; line-height: 1.7;">${
                statusInfo.message
              }</p>
              <p style="font-size: 14px; color: #666; margin: 0;">Order placed on ${orderDate}</p>
            </div>

            ${
              !isCancelled
                ? `
            <!-- Status Progress -->
            <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px;">
              <h3 style="margin: 0 0 24px 0; font-size: 16px; color: #333; font-weight: 600; text-align: center;">📋 Order Progress</h3>
              <div style="position: relative;">
                ${["pending", "confirmed", "shipped", "delivered"]
                  .map((status, index) => {
                    const currentIndex = [
                      "pending",
                      "confirmed",
                      "shipped",
                      "delivered",
                    ].indexOf(newStatus);
                    const isCompleted = index <= currentIndex;
                    const isCurrent = status === newStatus;
                    const statusLabels = {
                      pending: "Pending",
                      confirmed: "Confirmed",
                      shipped: "Shipped",
                      delivered: "Delivered",
                    };
                    return `
                    <div style="display: flex; align-items: center; margin-bottom: ${
                      index < 3 ? "16px" : "0"
                    };">
                      <div style="width: 40px; height: 40px; border-radius: 50%; background: ${
                        isCompleted ? statusInfo.gradient : "#e5e7eb"
                      }; display: flex; align-items: center; justify-content: center; box-shadow: ${
                      isCurrent ? "0 4px 12px rgba(102, 126, 234, 0.4)" : "none"
                    }; flex-shrink: 0;">
                        ${
                          isCompleted
                            ? '<div style="color: white; font-size: 20px; font-weight: bold;">✓</div>'
                            : `<div style="color: #9ca3af; font-size: 14px; font-weight: 600;">${
                                index + 1
                              }</div>`
                        }
                      </div>
                      <div style="flex: 1; margin-left: 16px;">
                        <div style="color: ${
                          isCompleted ? "#333" : "#9ca3af"
                        }; font-weight: ${
                      isCurrent ? "700" : "500"
                    }; font-size: ${isCurrent ? "16px" : "14px"};">${
                      statusLabels[status]
                    }</div>
                        ${
                          isCurrent
                            ? `<div style="color: ${statusInfo.color}; font-size: 12px; margin-top: 2px;">Current Status</div>`
                            : ""
                        }
                      </div>
                    </div>
                  `;
                  })
                  .join("")}
              </div>
            </div>
            `
                : `
            <!-- Cancellation Notice -->
            <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-left: 4px solid #ef4444; padding: 24px; border-radius: 8px; margin-bottom: 30px;">
              <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #991b1b; font-weight: 600;">📢 Cancellation Details</h3>
              <p style="margin: 0; color: #7f1d1d; line-height: 1.6; font-size: 14px;">
                ${
                  order.total
                    ? "Any payment made will be refunded within 5-7 business days."
                    : "No charges were applied to this order."
                }
              </p>
              <p style="margin: 12px 0 0 0; color: #7f1d1d; line-height: 1.6; font-size: 14px;">
                If you have any questions or concerns, please don't hesitate to contact our support team at <strong>support@nerozy.com</strong>
              </p>
            </div>
            `
            }

            <!-- Order Summary -->
            <div style="border: 2px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 30px;">
              <h3 style="margin: 0 0 20px 0; font-size: 16px; color: #333; font-weight: 600;">🛍️ Order Summary</h3>
              
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="border-bottom: 2px solid #f3f4f6;">
                    <th style="text-align: left; padding: 12px 0; color: #666; font-weight: 600; font-size: 13px; text-transform: uppercase;">Item</th>
                    <th style="text-align: center; padding: 12px 0; color: #666; font-weight: 600; font-size: 13px; text-transform: uppercase;">Qty</th>
                    <th style="text-align: right; padding: 12px 0; color: #666; font-weight: 600; font-size: 13px; text-transform: uppercase;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${(order.items || [])
                    .map(
                      (item) => `
                    <tr style="border-bottom: 1px solid #f3f4f6;">
                      <td style="padding: 14px 0; color: #333; font-size: 14px;">${
                        item.name || "Product"
                      }</td>
                      <td style="padding: 14px 0; text-align: center; color: #666; font-size: 14px;">${
                        item.quantity || 1
                      }</td>
                      <td style="padding: 14px 0; text-align: right; color: #333; font-weight: 600; font-size: 14px;">PKR ${(
                        (item.price || 0) * (item.quantity || 1)
                      ).toFixed(2)}</td>
                    </tr>
                  `
                    )
                    .join("")}
                  <tr style="border-top: 2px solid #667eea;">
                    <td colspan="2" style="padding: 18px 0; color: #333; font-weight: 700; font-size: 16px;">Total Amount</td>
                    <td style="padding: 18px 0; text-align: right; color: #667eea; font-weight: 700; font-size: 20px;">PKR ${(
                      order.total || 0
                    ).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Shipping Address -->
            ${
              order.shippingAddress
                ? `
            <div style="border: 2px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 30px;">
              <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #333; font-weight: 600;">📦 Shipping Address</h3>
              <div style="color: #666; font-size: 14px; line-height: 1.8;">
                <div style="font-weight: 700; color: #333; margin-bottom: 8px; font-size: 15px;">${
                  order.shippingAddress.fullName ||
                  order.shippingAddress.recipient ||
                  "Customer"
                }</div>
                <div>${order.shippingAddress.address || "N/A"}</div>
                <div>${order.shippingAddress.city || "N/A"}, ${
                    order.shippingAddress.postal || "N/A"
                  }</div>
                <div>${order.shippingAddress.country || "N/A"}</div>
                ${
                  order.shippingAddress.phone
                    ? `<div style="margin-top: 8px;">📞 ${order.shippingAddress.phone}</div>`
                    : ""
                }
                ${
                  order.shippingAddress.email
                    ? `<div>📧 ${order.shippingAddress.email}</div>`
                    : ""
                }
              </div>
            </div>
            `
                : ""
            }

            <!-- Support Section -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 30px; text-align: center; color: white; margin-bottom: 20px;">
              <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">Need Help?</h3>
              <p style="margin: 0 0 20px 0; opacity: 0.95; line-height: 1.6; font-size: 14px;">
                Our customer support team is here to help with any questions or concerns.
              </p>
              <div style="background: rgba(255,255,255,0.2); border-radius: 8px; padding: 16px;">
                <div style="margin-bottom: 8px; font-size: 14px;">📧 support@nerozy.com</div>
                <div style="font-size: 14px;">📞 +92 300 1234567</div>
              </div>
            </div>

            <!-- Footer -->
            <div style="text-align: center; padding-top: 20px; border-top: 2px solid #f3f4f6;">
              <p style="color: #888; font-size: 13px; margin: 0 0 8px 0;">
                Thank you for shopping with <strong style="color: #667eea;">NEROZY</strong>
              </p>
              <p style="color: #aaa; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} Nerozy. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Send order confirmation email
export async function sendOrderConfirmationEmail(order, customerEmail) {
  const sendEmailsEnv =
    String(process.env.SEND_EMAILS || "false").toLowerCase() === "true";

  if (!sendEmailsEnv) {
    console.log(
      "SEND_EMAILS is false; skipping order confirmation email (dev mode)"
    );
    console.log("Order details would be sent to:", customerEmail);
    console.log("Order:", order.orderNumber);
    return { accepted: [customerEmail], info: "dev-sent" };
  }

  if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASS) {
    console.error(
      "SMTP credentials not configured for order confirmation emails"
    );
    throw new Error("Email service not configured");
  }

  try {
    const htmlContent = generateOrderEmailHTML(order, customerEmail);

    const info = await transporter.sendMail({
      from: `${process.env.FROM_NAME || "Nerozy"} <${process.env.SMTP_EMAIL}>`,
      to: customerEmail,
      subject: `Order Confirmation #${order.orderNumber} - Thank you for your purchase!`,
      html: htmlContent,
    });

    console.log(
      "Order confirmation email sent successfully to:",
      customerEmail
    );
    return info;
  } catch (error) {
    console.error("Failed to send order confirmation email:", error.message);
    throw new Error(
      `Failed to send order confirmation email: ${error.message}`
    );
  }
}

// Send order status update email
export async function sendOrderStatusUpdateEmail(
  order,
  customerEmail,
  oldStatus,
  newStatus
) {
  const sendEmailsEnv =
    String(process.env.SEND_EMAILS || "false").toLowerCase() === "true";

  if (!sendEmailsEnv) {
    console.log(
      `SEND_EMAILS is false; skipping order status update email (dev mode)`
    );
    console.log(
      `Order ${order.orderNumber} status changed from ${oldStatus} to ${newStatus}`
    );
    console.log("Email would be sent to:", customerEmail);
    return { accepted: [customerEmail], info: "dev-sent" };
  }

  if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASS) {
    console.error(
      "SMTP credentials not configured for order status update emails"
    );
    throw new Error("Email service not configured");
  }

  try {
    const htmlContent = generateStatusUpdateEmailHTML(
      order,
      customerEmail,
      oldStatus,
      newStatus
    );

    const statusTitles = {
      pending: "Order Received",
      confirmed: "Order Confirmed",
      shipped: "Order Shipped",
      delivered: "Order Delivered",
      canceled: "Order Cancelled",
    };

    const subjectTitle = statusTitles[newStatus] || "Order Update";

    const info = await transporter.sendMail({
      from: `${process.env.FROM_NAME || "Nerozy"} <${process.env.SMTP_EMAIL}>`,
      to: customerEmail,
      subject: `${subjectTitle} #${order.orderNumber} - Status Update`,
      html: htmlContent,
    });

    console.log(
      `Order status update email sent successfully to: ${customerEmail} (${oldStatus} → ${newStatus})`
    );
    return info;
  } catch (error) {
    console.error("Failed to send order status update email:", error.message);
    throw new Error(
      `Failed to send order status update email: ${error.message}`
    );
  }
}
