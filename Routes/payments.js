import express from "express";
import Stripe from "stripe";
import Order from "../Model/Order.js";
import { requireAuth } from "../Middleware/authMiddleware.js";
import { sendOrderConfirmationEmail } from "../Utils/orderEmailNotification.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create Stripe Checkout Session
router.post("/create-checkout-session", async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "No items provided" });
    }

    // Calculate total and create line items for Stripe
    const lineItems = items.map((item) => ({
      price_data: {
        currency: "pkr",
        product_data: {
          name: item.name,
          description: `Size: ${item.size || "N/A"}, Color: ${
            item.color || "N/A"
          }`,
          // Skip images to avoid URL length issues with base64 data
          // Stripe has a 2048 character limit for image URLs
        },
        unit_amount: Math.round((item.price || 0) * 100), // Convert to cents
      },
      quantity: item.quantity || 1,
    }));

    // Get the origin with fallback for local development
    const origin = req.headers.origin || "http://localhost:5173";
    console.log("Using origin for Stripe URLs:", origin);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
      customer_email: shippingAddress.email, // Pre-fill customer email
      metadata: {
        shippingAddress: JSON.stringify(shippingAddress),
        userId: req.user?._id?.toString() || "guest",
        // Store items with product IDs in metadata (Stripe has 500 char limit per field)
        items: JSON.stringify(
          items.map((item) => ({
            product: item.product || item.id || null,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            size: item.size,
            color: item.color,
          }))
        ),
      },
      // Removed shipping_address_collection - we already collected this on our checkout page
      // The address will be stored in metadata and used to create the order
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("Stripe checkout session creation failed:", error);
    console.error("Error details:", error.message);
    console.error("Error type:", error.type);
    console.error("Error code:", error.code);
    res.status(500).json({
      error: "Failed to create checkout session",
      details: error.message,
      type: error.type,
      code: error.code,
    });
  }
});

// Stripe Webhook - Handle successful payments
router.post("/webhook", async (req, res) => {
  console.log("🔔 Stripe webhook received!");
  console.log("Headers:", req.headers);
  console.log("Body type:", typeof req.body);
  console.log("Body length:", req.body ? req.body.length : "no body");

  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (endpointSecret) {
      console.log("Using webhook secret for verification");
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      console.log("No webhook secret - parsing JSON directly");
      event = JSON.parse(req.body);
    }
    console.log("Webhook event type:", event.type);
    console.log("Webhook event id:", event.id);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed":
      console.log("💳 Processing checkout.session.completed event");
      const session = event.data.object;
      console.log("Session ID:", session.id);
      console.log("Payment status:", session.payment_status);
      console.log("Amount total:", session.amount_total);

      try {
        // Retrieve the session with line items
        const sessionWithItems = await stripe.checkout.sessions.retrieve(
          session.id,
          { expand: ["line_items"] }
        );

        // Create order in database
        const shippingAddress = JSON.parse(
          session.metadata.shippingAddress || "{}"
        );
        const userId =
          session.metadata.userId !== "guest" ? session.metadata.userId : null;

        // Get items from metadata (includes product IDs)
        let orderItems = [];
        try {
          const itemsFromMetadata = JSON.parse(session.metadata.items || "[]");
          if (itemsFromMetadata && itemsFromMetadata.length > 0) {
            orderItems = itemsFromMetadata;
            console.log("Using items from metadata with product IDs");
          }
        } catch (e) {
          console.warn("Failed to parse items from metadata:", e);
        }

        // Fallback to line items if metadata items not available
        if (orderItems.length === 0) {
          const sessionWithItems = await stripe.checkout.sessions.retrieve(
            session.id,
            { expand: ["line_items"] }
          );
          orderItems = sessionWithItems.line_items.data.map((item) => ({
            product: null,
            price: item.price.unit_amount / 100,
            quantity: item.quantity,
            name: item.description || item.price?.product?.name || "Product",
          }));
          console.log("Using fallback line items (no product IDs)");
        }

        // Get customer email from session or metadata
        const customerEmail =
          session.customer_details?.email ||
          shippingAddress?.email ||
          session.customer_email;

        const order = new Order({
          user: userId,
          orderNumber: `ORD-${Math.floor(100000 + Math.random() * 900000)}`,
          items: orderItems,
          total: session.amount_total / 100,
          status: "confirmed", // Stripe payment confirmed
          shippingAddress: {
            // Use the address from metadata that was collected on our checkout page
            fullName:
              shippingAddress.fullName ||
              session.customer_details?.name ||
              "Customer",
            email: customerEmail || "noemail@provided.com",
            phone:
              shippingAddress.phone || session.customer_details?.phone || "",
            address: shippingAddress.address || "Address not provided",
            city: shippingAddress.city || "City",
            postal: shippingAddress.postal || "00000",
            country: shippingAddress.country || "PK",
          },
          paymentInfo: {
            method: "stripe",
            sessionId: session.id,
            paymentStatus: session.payment_status,
            paymentIntentId: session.payment_intent,
          },
        });

        const savedOrder = await order.save();
        console.log(
          `✅ Order created from Stripe payment: ${savedOrder.orderNumber} (ID: ${savedOrder._id})`
        );

        // Deduct stock from products
        const Product = (await import("../Model/Product.js")).default;
        for (const item of orderItems) {
          if (item.product) {
            try {
              const updatedProduct = await Product.findByIdAndUpdate(
                item.product,
                { $inc: { qty: -item.quantity } },
                { new: true }
              );
              if (updatedProduct) {
                console.log(
                  `📦 Stock updated for ${updatedProduct.name}: -${item.quantity} (remaining: ${updatedProduct.qty})`
                );
              }
            } catch (stockError) {
              console.error(
                `❌ Failed to update stock for product ${item.product}:`,
                stockError
              );
            }
          }
        }

        // Send order confirmation email
        if (
          customerEmail &&
          customerEmail.includes("@") &&
          customerEmail !== "noemail@provided.com"
        ) {
          try {
            await sendOrderConfirmationEmail(savedOrder, customerEmail);
            savedOrder.emailSent = true;
            await savedOrder.save();
            console.log(
              `📧 Order confirmation email sent to: ${customerEmail}`
            );
          } catch (emailError) {
            console.error("❌ Email notification failed:", emailError.message);
            // Don't fail the webhook processing if email fails
          }
        } else {
          console.warn(
            "⚠️ No valid customer email found for order:",
            savedOrder.orderNumber
          );
        }
      } catch (error) {
        console.error("Failed to create order from Stripe webhook:", error);
      }
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Get payment session details with line items expanded
router.get("/session/:sessionId", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(
      req.params.sessionId,
      { expand: ["line_items", "line_items.data.price.product"] }
    );
    res.json(session);
  } catch (error) {
    console.error("Failed to retrieve session:", error);
    res.status(404).json({ error: "Session not found" });
  }
});

// Get order created for a given Stripe session id (if webhook has processed it)
router.get("/order/:sessionId", async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const order = await Order.findOne({
      "paymentInfo.sessionId": sessionId,
    }).populate("items.product");
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (error) {
    console.error("Failed to find order by sessionId:", error);
    res.status(500).json({ error: "Failed to query order" });
  }
});

// Test endpoint to simulate webhook for local development
router.post("/test-webhook", async (req, res) => {
  console.log("🧪 Test webhook called");

  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  try {
    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });

    console.log("Retrieved session:", session.id);
    console.log("Payment status:", session.payment_status);

    if (session.payment_status === "paid") {
      // Simulate the webhook processing
      const shippingAddress = JSON.parse(
        session.metadata.shippingAddress || "{}"
      );
      const userId =
        session.metadata.userId !== "guest" ? session.metadata.userId : null;

      const order = new Order({
        user: userId,
        orderNumber: `ORD-${Math.floor(100000 + Math.random() * 900000)}`,
        items: session.line_items.data.map((item) => ({
          product: null,
          price: item.price.unit_amount / 100,
          quantity: item.quantity,
          name: item.description,
        })),
        total: session.amount_total / 100,
        status: "confirmed",
        shippingAddress: {
          ...shippingAddress,
          fullName: session.shipping?.name || shippingAddress.fullName,
          address: session.shipping?.address?.line1 || shippingAddress.address,
          city: session.shipping?.address?.city || shippingAddress.city,
          postal:
            session.shipping?.address?.postal_code || shippingAddress.postal,
          country:
            session.shipping?.address?.country || shippingAddress.country,
        },
        paymentInfo: {
          method: "stripe",
          sessionId: session.id,
          paymentStatus: session.payment_status,
          paymentIntentId: session.payment_intent,
        },
      });

      const savedOrder = await order.save();
      console.log(
        `✅ Test order created: ${savedOrder.orderNumber} (ID: ${savedOrder._id})`
      );

      // Send confirmation email
      const customerEmail =
        shippingAddress?.email || session.customer_details?.email;
      if (customerEmail && customerEmail.includes("@")) {
        try {
          await sendOrderConfirmationEmail(savedOrder, customerEmail);
          console.log(`📧 Confirmation email sent to: ${customerEmail}`);

          savedOrder.emailSent = true;
          await savedOrder.save();
        } catch (emailError) {
          console.error("Email notification failed:", emailError.message);
        }
      }

      res.json({
        success: true,
        message: "Order created successfully from test webhook",
        order: {
          id: savedOrder._id,
          orderNumber: savedOrder.orderNumber,
          total: savedOrder.total,
          status: savedOrder.status,
          emailSent: savedOrder.emailSent,
        },
      });
    } else {
      res.status(400).json({
        error: "Payment not completed",
        paymentStatus: session.payment_status,
      });
    }
  } catch (error) {
    console.error("Test webhook error:", error);
    res.status(500).json({
      error: "Failed to process test webhook",
      details: error.message,
    });
  }
});

export default router;
