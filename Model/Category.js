import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: false, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("Category", CategorySchema);
