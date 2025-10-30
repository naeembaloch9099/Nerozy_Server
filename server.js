/* eslint-env node */
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";

// load .env for local dev
dotenv.config();

const app = express();

// Configure CORS. Allow origins from environment variable or sensible defaults.
// If you need to allow multiple origins, set CORS_ORIGINS in the environment
// as a comma separated list, e.g.:
// CORS_ORIGINS="http://localhost:5173,https://nerozy.vercel.app"
const corsOriginsEnv = process.env.CORS_ORIGINS || "";
const defaultAllowed = ["http://localhost:5173", "https://nerozy.vercel.app"];
const allowedOrigins = corsOriginsEnv
  ? corsOriginsEnv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : defaultAllowed;

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow non-browser requests like curl/postman (no origin)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      console.warn("Blocked CORS request from origin:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

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
import inventoryTestRoutes from "./Routes/inventory-test.js";
import categoryRoutes from "./Routes/categories.js";

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/debug", debugRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/inventory-test", inventoryTestRoutes);

// Categories
app.use("/api/categories", categoryRoutes);

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
