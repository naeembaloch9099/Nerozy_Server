import { Resend } from "resend";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Ensure environment variables are loaded. First try default, then try server/.env relative to this file.
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localEnvPath = path.join(__dirname, "..", ".env");
if (
  !process.env.SMTP_EMAIL &&
  !process.env.SENDGRID_API_KEY &&
  !process.env.RESEND_API_KEY
) {
  dotenv.config({ path: localEnvPath });
}

// Debugging info to help locate which .env is loaded
console.log("mailer startup cwd:", process.cwd());
console.log("mailer file dirname:", __dirname);

// Check if using Resend (HTTP API), SendGrid, or SMTP (in priority order)
const useResend = !!process.env.RESEND_API_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail =
  process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

// Initialize Resend client if API key is available
let resendClient = null;
if (useResend) {
  resendClient = new Resend(resendApiKey);
  console.log("Using Resend HTTP API for email delivery (Railway-compatible)");
}

const useSendGrid = !useResend && !!process.env.SENDGRID_API_KEY;
const sendGridApiKey = process.env.SENDGRID_API_KEY;
const sendGridFromEmail =
  process.env.SENDGRID_FROM_EMAIL ||
  process.env.FROM_NAME ||
  "noreply@baloch-tradition.com";

// Build transport options for SMTP fallback (nodemailer)
const smtpService = process.env.SMTP_SERVICE || "";
const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = String(process.env.SMTP_SECURE || "false") === "true";
const smtpUser = process.env.SMTP_EMAIL;
const smtpPass = process.env.SMTP_PASS;

let transporter = null;
let transportOptions = {};

// Only configure nodemailer if NOT using Resend HTTP API
if (!useResend) {
  if (useSendGrid) {
    // SendGrid configuration
    transportOptions = {
      host: "smtp.sendgrid.net",
      port: 587,
      secure: false,
      auth: {
        user: "apikey",
        pass: sendGridApiKey,
      },
    };
    console.log("Using SendGrid for email delivery");
  } else if (smtpService) {
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

  transporter = nodemailer.createTransport(transportOptions);
}

// Track verification state and respect SEND_EMAILS env var
let transporterVerified = useResend ? true : false; // Resend HTTP API doesn't need verification
const sendEmailsEnv =
  String(process.env.SEND_EMAILS || "false").toLowerCase() === "true";

// Log email service config for debugging (do not print secrets)
console.log("Email config:", {
  useResend,
  useSendGrid,
  service: useResend
    ? "Resend HTTP API"
    : useSendGrid
      ? "SendGrid"
      : smtpService || "SMTP",
  hasCredentials: useResend
    ? !!resendApiKey
    : useSendGrid
      ? !!sendGridApiKey
      : !!smtpPass,
  sendEmails: sendEmailsEnv,
});

// Only verify SMTP transporter if SEND_EMAILS is enabled and not using Resend
if (sendEmailsEnv && !useResend && transporter) {
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
} else if (useResend) {
  console.log("Resend HTTP API ready (no SMTP verification needed)");
} else {
  console.log("SEND_EMAILS is false — skipping SMTP verification (dev mode)");
}

export async function sendOtpEmail(
  to,
  name,
  code,
  subject = "Your verification code"
) {
  const isPasswordReset = subject.toLowerCase().includes("reset");

  const html = isPasswordReset
    ? `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#333">
        <h2>Password Reset Request</h2>
        <p>Hi ${name || "there"},</p>
        <p>You requested to reset your password. Your reset code is:</p>
        <p style="font-size:24px;font-weight:700;color:#667eea">${code}</p>
        <p>This code expires in 30 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      </div>`
    : `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#333">
        <h2>Verify your email</h2>
        <p>Hi ${name || "there"},</p>
        <p>Your verification code is:</p>
        <p style="font-size:24px;font-weight:700">${code}</p>
        <p>This code expires in 10 minutes.</p>
      </div>`;

  // If SEND_EMAILS is not enabled, skip actual send and return dev info
  if (!sendEmailsEnv) {
    console.log(
      "SEND_EMAILS is false; skipping actual email send (dev mode). Code:",
      code
    );
    return { accepted: [to], info: "dev-sent", devOtp: code };
  }

  // Use Resend HTTP API if available
  if (useResend && resendClient) {
    try {
      // In Resend testing mode, we can only send to the account owner's email
      // Check if we're in testing mode (using onboarding@resend.dev)
      // Set RESEND_BYPASS_TEST_MODE=true in Railway to send to actual recipients (requires verified domain)
      const bypassTestMode =
        String(process.env.RESEND_BYPASS_TEST_MODE || "false").toLowerCase() ===
        "true";
      const isResendTestingMode =
        !bypassTestMode && resendFromEmail === "onboarding@resend.dev";
      const testEmail =
        process.env.RESEND_TEST_EMAIL || "studentcui2@gmail.com";

      // In testing mode, send to test email but include actual recipient in HTML
      const actualRecipient = to;
      const emailRecipient = isResendTestingMode ? testEmail : to;

      // Add notice to HTML if in testing mode
      let finalHtml = html;
      if (isResendTestingMode && emailRecipient !== actualRecipient) {
        finalHtml = `
          <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin-bottom:20px;border-radius:6px;">
            <p style="margin:0;color:#856404;font-size:14px;">
              <strong>⚠️ Testing Mode:</strong> This email was intended for <strong>${actualRecipient}</strong> but sent to your test email because Resend requires domain verification to send to other recipients.
            </p>
          </div>
          ${html}
        `;
      }

      const { data, error } = await resendClient.emails.send({
        from: `${process.env.FROM_NAME || "Baloch Tradition"} <${resendFromEmail}>`,
        to: [emailRecipient],
        subject: subject,
        html: finalHtml,
      });

      if (error) {
        console.error("Resend API error:", error);
        throw new Error(error.message || "Failed to send email via Resend");
      }

      console.log(
        `Email sent successfully via Resend HTTP API to: ${emailRecipient}${isResendTestingMode && emailRecipient !== actualRecipient ? ` (intended for ${actualRecipient})` : ""}`
      );
      return { accepted: [emailRecipient], messageId: data.id, info: data };
    } catch (err) {
      console.error(
        "Failed to send email via Resend",
        err && err.message ? err.message : err
      );
      throw new Error((err && err.message) || "Failed to send email");
    }
  }

  // Fallback to SMTP (nodemailer) for SendGrid or regular SMTP
  if (!transporterVerified) {
    const msg =
      "SMTP transporter not verified. Check SMTP credentials (use a Gmail App Password if using Gmail) or set SEND_EMAILS=false to skip sending in development.";
    console.error(msg);
    throw new Error(msg);
  }

  try {
    const fromEmail = useSendGrid ? sendGridFromEmail : smtpUser;
    const info = await transporter.sendMail({
      from: `${process.env.FROM_NAME || "Baloch Tradition"} <${fromEmail}>`,
      to,
      subject: subject,
      html,
    });
    return info;
  } catch (err) {
    // rethrow with clearer message
    console.error(
      "Failed to send email",
      err && err.message ? err.message : err
    );
    throw new Error((err && err.message) || "Failed to send email");
  }
}
export async function sendPasswordResetEmail(to, name, resetToken, resetUrl) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9fafb">
      <div style="background:#fff;border-radius:12px;padding:30px;box-shadow:0 4px 12px rgba(0,0,0,0.1)">
        <div style="text-align:center;margin-bottom:30px">
          <h1 style="color:#667eea;margin:0;font-size:28px">🔒 Password Reset</h1>
        </div>
        
        <p style="color:#374151;font-size:16px;line-height:1.6">Hi <strong>${
          name || "there"
        }</strong>,</p>
        
        <p style="color:#374151;font-size:16px;line-height:1.6">
          You requested to reset your password for your Baloch Tradition account. Click the button below to reset your password:
        </p>
        
        <div style="text-align:center;margin:30px 0">
          <a href="${resetUrl}" 
             style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
                    color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;
                    font-weight:600;font-size:16px;box-shadow:0 4px 12px rgba(102,126,234,0.4)">
            Reset Password
          </a>
        </div>
        
        <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:15px;border-radius:6px;margin:20px 0">
          <p style="margin:0;color:#92400e;font-size:14px">
            <strong>Your Reset Code:</strong> <span style="font-size:20px;font-weight:700;letter-spacing:2px">${resetToken}</span>
          </p>
          <p style="margin:8px 0 0 0;color:#92400e;font-size:13px">
            You can also manually enter this code on the reset page.
          </p>
        </div>
        
        <p style="color:#6b7280;font-size:14px;line-height:1.6;margin-top:20px">
          This link will expire in <strong>30 minutes</strong> for security reasons.
        </p>
        
        <p style="color:#6b7280;font-size:14px;line-height:1.6">
          If you didn't request this password reset, please ignore this email or contact support if you have concerns.
        </p>
        
        <div style="border-top:1px solid #e5e7eb;margin-top:30px;padding-top:20px">
          <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:0">
            Best regards,<br>
            <strong>Baloch Tradition Team</strong>
          </p>
        </div>
      </div>
    </div>
  `;

  // If SEND_EMAILS is not enabled, skip actual send and return dev info
  if (!sendEmailsEnv) {
    console.log("SEND_EMAILS is false; skipping actual email send (dev mode).");
    console.log("Reset URL:", resetUrl);
    console.log("Reset Token:", resetToken);
    return {
      accepted: [to],
      info: "dev-sent",
      devResetToken: resetToken,
      devResetUrl: resetUrl,
    };
  }

  // Use Resend HTTP API if available
  if (useResend && resendClient) {
    try {
      // In Resend testing mode, we can only send to the account owner's email
      // Set RESEND_BYPASS_TEST_MODE=true in Railway to send to actual recipients (requires verified domain)
      const bypassTestMode =
        String(process.env.RESEND_BYPASS_TEST_MODE || "false").toLowerCase() ===
        "true";
      const isResendTestingMode =
        !bypassTestMode && resendFromEmail === "onboarding@resend.dev";
      const testEmail =
        process.env.RESEND_TEST_EMAIL || "studentcui2@gmail.com";

      // In testing mode, send to test email but include actual recipient in HTML
      const actualRecipient = to;
      const emailRecipient = isResendTestingMode ? testEmail : to;

      // Add notice to HTML if in testing mode
      let finalHtml = html;
      if (isResendTestingMode && emailRecipient !== actualRecipient) {
        finalHtml = `
          <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin-bottom:20px;border-radius:6px;">
            <p style="margin:0;color:#856404;font-size:14px;">
              <strong>⚠️ Testing Mode:</strong> This email was intended for <strong>${actualRecipient}</strong> but sent to your test email because Resend requires domain verification to send to other recipients.
            </p>
          </div>
          ${html}
        `;
      }

      const { data, error } = await resendClient.emails.send({
        from: `${process.env.FROM_NAME || "Baloch Tradition"} <${resendFromEmail}>`,
        to: [emailRecipient],
        subject: "🔐 Reset Your Password - Baloch Tradition",
        html: finalHtml,
      });

      if (error) {
        console.error("Resend API error:", error);
        throw new Error(
          error.message || "Failed to send password reset email via Resend"
        );
      }

      console.log(
        `Password reset email sent successfully via Resend HTTP API to: ${emailRecipient}${isResendTestingMode && emailRecipient !== actualRecipient ? ` (intended for ${actualRecipient})` : ""}`
      );
      return { accepted: [emailRecipient], messageId: data.id, info: data };
    } catch (err) {
      console.error(
        "Failed to send password reset email via Resend",
        err && err.message ? err.message : err
      );
      throw new Error(
        (err && err.message) || "Failed to send password reset email"
      );
    }
  }

  // Fallback to SMTP (nodemailer) for SendGrid or regular SMTP
  if (!transporterVerified) {
    const msg =
      "SMTP transporter not verified. Check SMTP credentials (use a Gmail App Password if using Gmail) or set SEND_EMAILS=false to skip sending in development.";
    console.error(msg);
    throw new Error(msg);
  }

  try {
    const fromEmail = useSendGrid ? sendGridFromEmail : smtpUser;
    const info = await transporter.sendMail({
      from: `${process.env.FROM_NAME || "Baloch Tradition"} <${fromEmail}>`,
      to,
      subject: "🔐 Reset Your Password - Baloch Tradition",
      html,
    });
    console.log("Password reset email sent successfully to:", to);
    return info;
  } catch (err) {
    console.error(
      "Failed to send password reset email",
      err && err.message ? err.message : err
    );
    throw new Error((err && err.message) || "Failed to send email");
  }
}

export default transporter;
