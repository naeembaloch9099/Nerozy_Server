/* eslint-env node */
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";

// load .env for local dev
dotenv.config();

const app = express();

// Configure CORS to allow requests from any origin (for cross-device access)
app.use(cors({
  origin: '*', // Allow all origins (for development and cross-device access)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Stripe webhook needs raw body, so we handle it before JSON parsing
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

// Increase JSON and urlencoded body size limits to accept base64 image uploads from admin UI
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

const port = process.env.PORT || 4242;

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!mongoUri) {
  console.error(
    "MONGODB_URI not set. Please add it to your environment (see server/.env.example)."
  );
}

mongoose.set("strictQuery", false);
mongoose
  .connect(mongoUri, { autoIndex: true })
  .then(async () => {
    console.log("Connected to MongoDB");
    try {
      if (
        String(process.env.AUTO_CREATE_ADMIN || "false").toLowerCase() ===
        "true"
      ) {
        const { createAdminIfMissing } = await import("./Utils/adminSeed.js");
        await createAdminIfMissing();
      }
    } catch (err) {
      console.error(
        "Admin auto-create failed:",
        err && err.message ? err.message : err
      );
    }
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message || err);
    process.exit(1);
  });

// Routes (will create these files under server/Routes)
import authRoutes from "./Routes/auth.js";
import productRoutes from "./Routes/products.js";
import orderRoutes from "./Routes/orders.js";
import debugRoutes from "./Routes/debug.js";
import paymentRoutes from "./Routes/payments.js";

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/debug", debugRoutes);
app.use("/api/payments", paymentRoutes);

// Legacy route for backward compatibility
app.use("/create-checkout-session", paymentRoutes);

app.get("/", (req, res) =>
  res.json({ ok: true, env: process.env.NODE_ENV || "development" })
);

// Serve a simple message at /health for readiness probes
app.get("/health", (req, res) => res.sendStatus(200));

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Backend server listening on http://localhost:${port}`);
  console.log(`Network: http://192.168.2.118:${port}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down server...");
  server.close();
  await mongoose.disconnect();
  process.exit(0);
});
