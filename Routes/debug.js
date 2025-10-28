import express from "express";
import transporter, { sendOtpEmail } from "../Utils/mailer.js";

const router = express.Router();

router.get("/ping", (req, res) => res.json({ ok: true, ts: Date.now() }));

// Try to send a test OTP email. Body: { to: string }
router.post("/send-test-email", async (req, res) => {
  const to = (req.body && req.body.to) || process.env.SMTP_EMAIL;
  if (!to) return res.status(400).json({ error: "Missing 'to' address" });

  try {
    const result = await sendOtpEmail(to, "Dev Test", "123456");
    return res.json({ ok: true, result });
  } catch (err) {
    return res
      .status(500)
      .json({ error: err && err.message ? err.message : String(err) });
  }
});

export default router;
