import bcrypt from "bcryptjs";
import User from "../Model/User.js";

export async function createAdminIfMissing() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = process.env.ADMIN_PASS;
  const adminName = process.env.ADMIN_NAME || "Admin";

  if (!adminEmail || !adminPass) {
    console.log(
      "ADMIN_EMAIL or ADMIN_PASS not set; skipping admin auto-create"
    );
    return;
  }

  try {
    const existing = await User.findOne({ email: adminEmail });
    if (existing) {
      let changed = false;
      if (!existing.isAdmin) {
        existing.isAdmin = true;
        changed = true;
      }
      if (!existing.passwordHash) {
        existing.passwordHash = await bcrypt.hash(adminPass, 10);
        changed = true;
      }
      if (!existing.isVerified) {
        existing.isVerified = true;
        changed = true;
      }
      if (changed) await existing.save();
      console.log(`Admin user ensured: ${adminEmail}`);
      return;
    }

    const passwordHash = await bcrypt.hash(adminPass, 10);
    const u = new User({
      name: adminName,
      email: adminEmail,
      passwordHash,
      isAdmin: true,
      isVerified: true,
    });
    await u.save();
    console.log(`Created admin user: ${adminEmail}`);
  } catch (err) {
    console.error(
      "Failed to ensure admin user:",
      err && err.message ? err.message : err
    );
  }
}
