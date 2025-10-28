import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true, default: 0 },
    images: [String],
    qty: { type: Number, default: 0 },
    sku: { type: String },
    sizes: [Number],
    colors: [String],
    category: { type: String },
    metadata: { type: Object },
  },
  { timestamps: true }
);

export default mongoose.models.Product ||
  mongoose.model("Product", productSchema);
