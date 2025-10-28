import express from "express";
import Product from "../Model/Product.js";
import { requireAuth, requireAdmin } from "../Middleware/authMiddleware.js";

const router = express.Router();

// Public: list products
router.get("/", async (req, res) => {
  const products = await Product.find().limit(200);
  res.json(products);
});

// Public: get single product
router.get("/:id", async (req, res) => {
  const p = await Product.findById(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

// Admin: create product
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const body = req.body || {};
  const p = new Product(body);
  await p.save();
  res.json(p);
});

// Admin: update
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const p = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

// Admin: delete
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
