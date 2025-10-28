import mongoose from "mongoose";

const pendingUserSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: { type: String, required: true, index: true, unique: true },
    passwordHash: { type: String },
    otp: {
      code: String,
      expiresAt: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.models.PendingUser ||
  mongoose.model("PendingUser", pendingUserSchema);
