import express from "express";
import Category from "../Model/Category.js";
import { requireAuth, requireAdmin } from "../Middleware/authMiddleware.js";

const router = express.Router();

// List categories (public)
router.get("/", async (req, res) => {
  try {
    const cats = await Category.find({}).sort({ name: 1 });
    res.json(cats);
  } catch (err) {
    console.error("GET /api/categories failed", err);
    res.status(500).json({ error: "Could not fetch categories" });
  }
});

// Create category (admin)
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name required" });

    // upsert-like behavior: if exists, return existing
    let existing = await Category.findOne({ name });
    if (existing) return res.json(existing);

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const cat = await Category.create({ name, slug });
    res.status(201).json(cat);
  } catch (err) {
    console.error("POST /api/categories failed", err);
    res.status(500).json({ error: "Could not create category" });
  }
});

// Delete category (admin)
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const cat = await Category.findByIdAndDelete(id);
    if (!cat) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/categories/:id failed", err);
    res.status(500).json({ error: "Could not delete category" });
  }
});

export default router;
