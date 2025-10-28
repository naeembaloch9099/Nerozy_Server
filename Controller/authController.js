import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../Model/User.js";
import PendingUser from "../Model/PendingUser.js";
import { sendOtpEmail } from "../Utils/mailer.js";

const JWT_SECRET = process.env.JWT_SECRET || "please-change-this";
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function signup(req, res) {
  const { name, email, password } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email required" });
  // If a real user already exists, block signup
  const existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ error: "Email already in use" });

  // Hash password now and store in PendingUser until OTP verified
  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;

  const otpCode = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Upsert a pending user record for this email
  const pending = await PendingUser.findOneAndUpdate(
    { email },
    {
      name,
      email,
      passwordHash,
      otp: { code: otpCode, expiresAt },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Optionally send email. Only send when SEND_EMAILS=true. In development we may return the OTP in the response
  const sendEmails =
    String(process.env.SEND_EMAILS || "false").toLowerCase() === "true";
  if (sendEmails) {
    try {
      await sendOtpEmail(email, name, otpCode);
    } catch (err) {
      console.error("Failed to send OTP email", err);
    }
  }

  const resp = { ok: true, message: "OTP stored" };
  // For developer convenience only: expose OTP when emails are disabled and not in production
  if (
    !sendEmails &&
    String(process.env.NODE_ENV || "development") !== "production"
  ) {
    resp.devOtp = otpCode;
  }

  res.json(resp);
}

export async function requestOtp(req, res) {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email required" });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: "User not found" });

  const otpCode = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  user.otp = { code: otpCode, expiresAt };
  await user.save();

  const sendEmails =
    String(process.env.SEND_EMAILS || "false").toLowerCase() === "true";
  if (sendEmails) {
    try {
      await sendOtpEmail(email, user.name, otpCode);
    } catch (err) {
      console.error("Failed to send OTP email", err);
    }
  }

  const resp = { ok: true, message: "OTP stored" };
  if (
    !sendEmails &&
    String(process.env.NODE_ENV || "development") !== "production"
  ) {
    resp.devOtp = otpCode;
  }
  res.json(resp);
}

export async function verifyOtp(req, res) {
  const { email, code } = req.body || {};
  if (!email || !code)
    return res.status(400).json({ error: "Email and code required" });
  // First, check if a pending signup exists with this email
  const pending = await PendingUser.findOne({ email });
  if (pending) {
    if (!pending.otp || !pending.otp.code)
      return res.status(400).json({ error: "No OTP requested" });
    if (pending.otp.expiresAt < new Date())
      return res.status(400).json({ error: "OTP expired" });
    if (pending.otp.code !== code)
      return res.status(400).json({ error: "Invalid OTP" });

    // Create real user and remove pending record
    const newUser = new User({
      name: pending.name,
      email: pending.email,
      passwordHash: pending.passwordHash,
      isVerified: true,
    });
    await newUser.save();
    await PendingUser.deleteOne({ _id: pending._id });

    const token = jwt.sign(
      { sub: newUser._id, email: newUser.email, isAdmin: newUser.isAdmin },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
    return res.json({
      ok: true,
      token,
      user: { id: newUser._id, email: newUser.email, name: newUser.name },
    });
  }

  // Otherwise check existing user OTP flow (for login/requestOtp)
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (!user.otp || !user.otp.code)
    return res.status(400).json({ error: "No OTP requested" });
  if (user.otp.expiresAt < new Date())
    return res.status(400).json({ error: "OTP expired" });
  if (user.otp.code !== code)
    return res.status(400).json({ error: "Invalid OTP" });

  user.isVerified = true;
  user.otp = undefined;
  await user.save();

  const token = jwt.sign(
    { sub: user._id, email: user.email, isAdmin: user.isAdmin },
    JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );

  res.json({
    ok: true,
    token,
    user: { id: user._id, email: user.email, name: user.name },
  });
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email required" });

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const ADMIN_PASS = process.env.ADMIN_PASS;
  // Hardcoded admin shortcut: if credentials match env vars, ensure admin user exists and return token
  if (
    ADMIN_EMAIL &&
    ADMIN_PASS &&
    email === ADMIN_EMAIL &&
    password === ADMIN_PASS
  ) {
    let admin = await User.findOne({ email: ADMIN_EMAIL });
    const passHash = await bcrypt.hash(ADMIN_PASS, 10);
    if (!admin) {
      admin = new User({
        name: process.env.ADMIN_NAME || "Admin",
        email: ADMIN_EMAIL,
        passwordHash: passHash,
        isAdmin: true,
        isVerified: true,
      });
      await admin.save();
    } else {
      let changed = false;
      if (!admin.isAdmin) {
        admin.isAdmin = true;
        changed = true;
      }
      if (!admin.passwordHash) {
        admin.passwordHash = passHash;
        changed = true;
      }
      if (!admin.isVerified) {
        admin.isVerified = true;
        changed = true;
      }
      if (changed) await admin.save();
    }
    const token = jwt.sign(
      { sub: admin._id, email: admin.email, isAdmin: true },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
    return res.json({ ok: true, token });
  }

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (password) {
    if (!user.passwordHash)
      return res
        .status(400)
        .json({ error: "Password login not available for this account" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { sub: user._id, email: user.email, isAdmin: user.isAdmin },
      JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      }
    );
    return res.json({ ok: true, token });
  }

  // If no password, request OTP flow
  const otpCode = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  user.otp = { code: otpCode, expiresAt };
  await user.save();
  const sendEmails =
    String(process.env.SEND_EMAILS || "false").toLowerCase() === "true";
  if (sendEmails) {
    try {
      await sendOtpEmail(email, user.name, otpCode);
    } catch (err) {
      console.error("Failed to send OTP email", err);
    }
  }

  const resp = { ok: true, message: "OTP stored" };
  if (
    !sendEmails &&
    String(process.env.NODE_ENV || "development") !== "production"
  ) {
    resp.devOtp = otpCode;
  }
  res.json(resp);
}

export async function me(req, res) {
  // requireAuth middleware sets req.user
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const u = req.user.toObject ? req.user.toObject() : req.user;
  // remove sensitive fields
  delete u.passwordHash;
  delete u.otp;
  res.json({
    ok: true,
    user: {
      id: u._id || u.id,
      email: u.email,
      name: u.name,
      isAdmin: u.isAdmin,
    },
  });
}
