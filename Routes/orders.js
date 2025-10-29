import express from "express";
import Order from "../Model/Order.js";
import { requireAuth, requireAdmin } from "../Middleware/authMiddleware.js";
import {
  sendOrderConfirmationEmail,
  sendOrderStatusUpdateEmail,
} from "../Utils/orderEmailNotification.js";
import {
  checkStockAvailability,
  deductStock,
  restoreStock,
} from "../Utils/inventoryManager.js";

const router = express.Router();

// Health check endpoint
router.get("/health", async (req, res) => {
  try {
    // Test database connection by counting orders
    const orderCount = await Order.countDocuments();
    res.json({
      success: true,
      message: "Orders service is healthy",
      database: "connected",
      totalOrders: orderCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({
      success: false,
      message: "Orders service is unhealthy",
      database: "disconnected",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Test database connection and order creation
router.post("/test", async (req, res) => {
  try {
    console.log("Testing order creation...");

    const testOrder = new Order({
      orderNumber: `TEST-${Date.now()}`,
      items: [
        {
          product: null,
          price: 2999,
          quantity: 1,
        },
      ],
      total: 2999,
      status: "pending",
      shippingAddress: {
        recipient: "Test User",
        address: "123 Test Street",
        city: "Test City",
        postal: "12345",
        country: "US",
        email: "test@example.com",
      },
      paymentInfo: {
        method: "test",
      },
    });

    const savedOrder = await testOrder.save();
    console.log("Test order saved successfully:", savedOrder._id);

    res.json({
      success: true,
      message: "Order saved to database successfully",
      orderId: savedOrder._id,
      orderNumber: savedOrder.orderNumber,
    });
  } catch (error) {
    console.error("Database test failed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: "Failed to save order to database",
    });
  }
});

// Create order (public). Supports guest checkout; if user is authenticated, associate the order.
router.post("/", async (req, res) => {
  try {
    console.log(
      "Creating new order with data:",
      JSON.stringify(req.body, null, 2)
    );

    const { items, shippingAddress, paymentInfo } = req.body || {};

    // Check stock availability using inventory manager
    const stockCheck = await checkStockAvailability(items || []);

    if (!stockCheck.success) {
      return res.status(400).json({
        success: false,
        error: "Insufficient stock",
        details: stockCheck.errors,
        stockInfo: stockCheck.stockInfo,
      });
    }

    // Log warnings if any
    if (stockCheck.warnings.length > 0) {
      console.warn("⚠️ Low stock warnings:", stockCheck.warnings);
    }

    const total = (items || []).reduce(
      (s, it) => s + (it.price || 0) * (it.quantity || 1),
      0
    );
    const userId = req.user ? req.user._id : undefined;

    // Generate a simple order number if not provided
    const orderNumber =
      (req.body && req.body.orderNumber) ||
      `ORD-${Math.floor(100000 + Math.random() * 900000)}`;

    console.log("Attempting to create order:", { orderNumber, total, userId });

    const order = new Order({
      user: userId,
      orderNumber,
      items,
      total,
      shippingAddress,
      paymentInfo,
      status: "pending", // Explicitly set status
    });

    const savedOrder = await order.save();
    console.log("Order saved successfully:", savedOrder._id);

    // Deduct stock using inventory manager
    const stockResult = await deductStock(items || []);
    if (stockResult.failed.length > 0) {
      console.warn(
        "⚠️ Some products failed to update stock:",
        stockResult.failed
      );
    }
    if (stockResult.updated.some((item) => item.isLowStock)) {
      console.warn(
        "⚠️ Low stock after order:",
        stockResult.updated.filter((item) => item.isLowStock)
      );
    }

    // Send order confirmation email if email is provided
    const customerEmail = shippingAddress?.email;
    if (customerEmail && customerEmail.includes("@")) {
      try {
        await sendOrderConfirmationEmail(savedOrder, customerEmail);
        console.log(`Order confirmation email sent to: ${customerEmail}`);
      } catch (emailError) {
        console.error("Email notification failed:", emailError.message);
        // Don't fail the order creation if email fails
      }
      // Mark order as emailSent if we attempted to send
      try {
        savedOrder.emailSent = true;
        await savedOrder.save();
      } catch (err) {
        console.debug(
          "Failed to update order.emailSent",
          err && err.message ? err.message : err
        );
      }
    }

    res.json({
      success: true,
      order: savedOrder,
      message: "Order created successfully",
    });
  } catch (error) {
    console.error("Order creation failed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: "Failed to create order",
    });
  }
});

// Get all orders (for testing - no auth required)
router.get("/all", async (req, res) => {
  try {
    const orders = await Order.find().limit(50).sort({ createdAt: -1 });
    res.json({
      success: true,
      count: orders.length,
      orders: orders,
    });
  } catch (error) {
    console.error("Failed to retrieve orders:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get user's orders
router.get("/my", requireAuth, async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).populate(
    "items.product"
  );
  res.json(orders);
});

// Admin: get analytics data
router.get("/analytics/stats", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { period = "30days" } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let startDate;

    switch (period) {
      case "7days":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30days":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90days":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "12months":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case "all":
        startDate = new Date(0);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get all orders in the period
    const orders = await Order.find({
      createdAt: { $gte: startDate },
    }).populate("items.product");

    // Calculate total revenue
    const totalRevenue = orders.reduce(
      (sum, order) => sum + (order.total || 0),
      0
    );

    // Calculate average order value
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

    // Count orders by status
    const statusCounts = orders.reduce((acc, order) => {
      const status = order.status || "pending";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    // Category distribution
    const categoryData = {};
    orders.forEach((order) => {
      (order.items || []).forEach((item) => {
        if (item.product && item.product.category) {
          const cat = item.product.category;
          categoryData[cat] = (categoryData[cat] || 0) + item.quantity;
        }
      });
    });

    // Daily/Weekly sales data for charts
    const salesByDate = {};
    orders.forEach((order) => {
      const date = new Date(order.createdAt).toISOString().split("T")[0];
      if (!salesByDate[date]) {
        salesByDate[date] = { revenue: 0, orders: 0 };
      }
      salesByDate[date].revenue += order.total || 0;
      salesByDate[date].orders += 1;
    });

    // Top selling products
    const productSales = {};
    orders.forEach((order) => {
      (order.items || []).forEach((item) => {
        if (item.product) {
          const productId = item.product._id || item.product.id;
          const productName =
            item.product.title || item.product.name || "Unknown";

          if (!productSales[productId]) {
            productSales[productId] = {
              name: productName,
              quantity: 0,
              revenue: 0,
            };
          }
          productSales[productId].quantity += item.quantity || 0;
          productSales[productId].revenue +=
            (item.price || 0) * (item.quantity || 0);
        }
      });
    });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    res.json({
      success: true,
      period,
      startDate,
      endDate: now,
      analytics: {
        totalOrders: orders.length,
        totalRevenue,
        avgOrderValue,
        statusCounts,
        categoryData,
        salesByDate,
        topProducts,
      },
    });
  } catch (error) {
    console.error("Failed to get analytics:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Admin: list all orders
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const orders = await Order.find().populate("user items.product").limit(500);
  res.json(orders);
});

// Admin: get specific order by ID
router.get("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "user items.product"
    );
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// Admin: update order status
router.put("/:id/status", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};

    // Get the current order to check the old status
    const currentOrder = await Order.findById(req.params.id).populate(
      "items.product"
    );
    if (!currentOrder)
      return res.status(404).json({ error: "Order not found" });

    const oldStatus = currentOrder.status;

    // If changing to canceled, restore stock
    if (
      status === "canceled" &&
      oldStatus !== "canceled" &&
      currentOrder.items
    ) {
      console.log(
        `♻️ Restoring stock for canceled order ${currentOrder.orderNumber}`
      );
      const restoreResult = await restoreStock(currentOrder.items);
      if (restoreResult.success) {
        console.log(
          `✅ Stock restored for ${restoreResult.restored.length} products`
        );
      } else {
        console.warn(
          "⚠️ Some products failed to restore:",
          restoreResult.failed
        );
      }
    }

    // Update the order status
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate("items.product");

    // Send status update email if status changed and customer email is available
    if (oldStatus !== status && currentOrder.shippingAddress?.email) {
      try {
        await sendOrderStatusUpdateEmail(
          order,
          currentOrder.shippingAddress.email,
          oldStatus,
          status
        );
        console.log(
          `Status update email sent for order ${order.orderNumber}: ${oldStatus} → ${status}`
        );
      } catch (emailError) {
        console.error(
          "Failed to send status update email:",
          emailError.message
        );
        // Don't fail the status update if email fails
      }
    }

    res.json(order);
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

// Public webhook for automated status updates (e.g., from shipping providers)
router.post("/webhook/status-update", async (req, res) => {
  try {
    const { orderNumber, status, trackingNumber, webhookSecret } =
      req.body || {};

    // Verify webhook secret (optional security measure)
    const expectedSecret = process.env.ORDER_WEBHOOK_SECRET;
    if (expectedSecret && webhookSecret !== expectedSecret) {
      return res.status(401).json({ error: "Invalid webhook secret" });
    }

    if (!orderNumber || !status) {
      return res
        .status(400)
        .json({ error: "orderNumber and status are required" });
    }

    // Find order by order number
    const currentOrder = await Order.findOne({ orderNumber }).populate(
      "items.product"
    );
    if (!currentOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    const oldStatus = currentOrder.status;

    // Update order with new status and tracking number if provided
    const updateData = { status };
    if (trackingNumber) {
      updateData.trackingNumber = trackingNumber;
    }

    const order = await Order.findByIdAndUpdate(currentOrder._id, updateData, {
      new: true,
    }).populate("items.product");

    // Send status update email if status changed and customer email is available
    if (oldStatus !== status && currentOrder.shippingAddress?.email) {
      try {
        await sendOrderStatusUpdateEmail(
          order,
          currentOrder.shippingAddress.email,
          oldStatus,
          status
        );
        console.log(
          `Automated status update email sent for order ${order.orderNumber}: ${oldStatus} → ${status}`
        );
      } catch (emailError) {
        console.error(
          "Failed to send automated status update email:",
          emailError.message
        );
        // Don't fail the status update if email fails
      }
    }

    res.json({
      success: true,
      order: {
        orderNumber: order.orderNumber,
        oldStatus,
        newStatus: status,
        emailSent: !!currentOrder.shippingAddress?.email,
      },
    });
  } catch (error) {
    console.error("Error in webhook status update:", error);
    res
      .status(500)
      .json({ error: "Failed to update order status via webhook" });
  }
});

export default router;
