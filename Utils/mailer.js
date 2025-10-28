import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Ensure environment variables are loaded. First try default, then try server/.env relative to this file.
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localEnvPath = path.join(__dirname, "..", ".env");
if (!process.env.SMTP_EMAIL) {
  dotenv.config({ path: localEnvPath });
}

// Debugging info to help locate which .env is loaded
console.log("mailer startup cwd:", process.cwd());
console.log("mailer file dirname:", __dirname);

// Build transport options supporting both explicit host/port and named services (e.g. 'gmail')
const smtpService = process.env.SMTP_SERVICE || "";
const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = String(process.env.SMTP_SECURE || "false") === "true";
const smtpUser = process.env.SMTP_EMAIL;
const smtpPass = process.env.SMTP_PASS;

let transportOptions = {};
if (smtpService) {
  transportOptions.service = smtpService;
  transportOptions.auth = { user: smtpUser, pass: smtpPass };
} else {
  transportOptions = {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
  };
}

// allow skipping TLS verification in some dev environments (not recommended for production)
if (
  String(process.env.SMTP_SKIP_TLS_VERIFY || "false").toLowerCase() === "true"
) {
  transportOptions.tls = { rejectUnauthorized: false };
}

const transporter = nodemailer.createTransport(transportOptions);

// Track verification state and respect SEND_EMAILS env var
let transporterVerified = false;
const sendEmailsEnv =
  String(process.env.SEND_EMAILS || "false").toLowerCase() === "true";

// Log SMTP env state for debugging (do not print secrets)
console.log("SMTP config:", {
  smtpService: smtpService || null,
  smtpHost,
  smtpPort,
  smtpSecure,
  smtpUser: smtpUser ? smtpUser : "<missing>",
  hasPassword: !!smtpPass,
  sendEmails: sendEmailsEnv,
});

// Only verify transporter if SEND_EMAILS is enabled. This avoids noisy verification errors in dev when sending is disabled.
if (sendEmailsEnv) {
  transporter
    .verify()
    .then(() => {
      transporterVerified = true;
      console.log("SMTP transporter ready");
    })
    .catch((err) => {
      transporterVerified = false;
      console.warn(
        "SMTP transporter verification failed:",
        err && err.message ? err.message : err
      );
      if (String(process.env.SMTP_SERVICE || "").toLowerCase() === "gmail") {
        console.warn(
          "If you are using Gmail, create an App Password and set it as SMTP_PASS in server/.env, and ensure SEND_EMAILS=true. See: https://support.google.com/accounts/answer/185833"
        );
      }
      console.warn(
        "To disable sending emails during development, set SEND_EMAILS=false in server/.env and restart the server."
      );
    });
} else {
  console.log("SEND_EMAILS is false — skipping SMTP verification (dev mode)");
}

export async function sendOtpEmail(to, name, code) {
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#333"><h2>Verify your email</h2><p>Hi ${
    name || "there"
  },</p><p>Your verification code is:</p><p style="font-size:24px;font-weight:700">${code}</p><p>This code expires in 10 minutes.</p></div>`;

  // If SEND_EMAILS is not enabled, skip actual send and return dev info
  if (!sendEmailsEnv) {
    console.log(
      "SEND_EMAILS is false; skipping actual email send (dev mode). OTP:",
      code
    );
    return { accepted: [to], info: "dev-sent", devOtp: code };
  }

  if (!transporterVerified) {
    const msg =
      "SMTP transporter not verified. Check SMTP credentials (use a Gmail App Password if using Gmail) or set SEND_EMAILS=false to skip sending in development.";
    console.error(msg);
    throw new Error(msg);
  }

  try {
    const info = await transporter.sendMail({
      from: `${process.env.FROM_NAME || "Nerozy"} <${smtpUser}>`,
      to,
      subject: "Your verification code",
      html,
    });
    return info;
  } catch (err) {
    // rethrow with clearer message
    console.error(
      "Failed to send OTP email",
      err && err.message ? err.message : err
    );
    throw new Error((err && err.message) || "Failed to send email");
  }
}

export default transporter;
