import express from "express";
import {
  signup,
  login,
  verifyOtp,
  requestOtp,
  me,
} from "../Controller/authController.js";
import { requireAuth } from "../Middleware/authMiddleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/verify-otp", verifyOtp);
router.post("/request-otp", requestOtp);

// Return current authenticated user (requires Bearer token)
router.get("/me", requireAuth, me);

export default router;
