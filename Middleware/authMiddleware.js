import jwt from "jsonwebtoken";
import User from "../Model/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "please-change-this";

// Hardcoded admin credentials (same as frontend)
const ADMIN_EMAIL = "balochfaheem462@gmail.com";

export async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer "))
    return res.status(401).json({ error: "Unauthorized" });
  const token = auth.split(" ")[1];

  // Check if it's an admin token (base64 encoded from frontend)
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    if (decoded.includes(ADMIN_EMAIL)) {
      // This is an admin token from frontend
      // Find the admin user in database
      const adminUser = await User.findOne({ email: ADMIN_EMAIL }).select(
        "-passwordHash -otp"
      );
      if (adminUser && adminUser.isAdmin) {
        req.user = adminUser;
        return next();
      }
    }
  } catch (e) {
    // Not a base64 token, continue to JWT verification
  }

  // Try JWT verification for regular users
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(payload.sub).select("-passwordHash -otp");
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin)
    return res.status(403).json({ error: "Forbidden" });
  next();
}
