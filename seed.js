import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./Model/User.js";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!mongoUri) {
  console.error(
    "MONGODB_URI not set. Please set it in .env before running the seed script."
  );
  process.exit(1);
}

async function run() {
  await mongoose.connect(mongoUri, { autoIndex: true });
  console.log("Connected to MongoDB for seeding");

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = process.env.ADMIN_PASS;
  const adminName = process.env.ADMIN_NAME || "Admin";

  if (!adminEmail || !adminPass) {
    console.error(
      "ADMIN_EMAIL and ADMIN_PASS must be set in .env to create an admin user."
    );
    process.exit(1);
  }

  const existing = await User.findOne({ email: adminEmail });
  if (existing) {
    existing.isAdmin = true;
    if (!existing.passwordHash)
      existing.passwordHash = await bcrypt.hash(adminPass, 10);
    await existing.save();
    console.log("Updated existing user to admin:", adminEmail);
  } else {
    const passwordHash = await bcrypt.hash(adminPass, 10);
    const u = new User({
      name: adminName,
      email: adminEmail,
      passwordHash,
      isAdmin: true,
      isVerified: true,
    });
    await u.save();
    console.log("Created admin user:", adminEmail);
  }

  await mongoose.disconnect();
  console.log("Seeding complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
