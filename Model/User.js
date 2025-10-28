import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
  code: String,
  expiresAt: Date,
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String },
    isAdmin: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    otp: otpSchema,
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", userSchema);
