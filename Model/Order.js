import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.Mixed, // Allow ObjectId or null/string
    ref: "Product",
    required: false,
  },
  name: { type: String }, // Store product name directly
  price: Number,
  quantity: Number,
});

const shippingAddressSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  address: { type: String, required: true },
  city: { type: String, required: true },
  postal: { type: String, required: true },
  country: { type: String, required: true },
});

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    orderNumber: { type: String },
    items: [orderItemSchema],
    total: Number,
    status: { type: String, default: "pending" },
    trackingNumber: { type: String },
    shippingAddress: shippingAddressSchema,
    paymentInfo: { type: Object },
    emailSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Order || mongoose.model("Order", orderSchema);
