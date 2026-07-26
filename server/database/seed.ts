import "dotenv/config";
import { auth } from "../utils/auth";
import { db } from "./index";
import { user } from "./schema";
import { eq } from "drizzle-orm";

async function seedAdmin() {
  // Cek apakah admin sudah ada
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, process.env.ADMIN_EMAIL!));
  if (existing.length > 0) {
    console.log("Admin already exists.");
    process.exit(0);
  }

  // Buat user
  await auth.api.signUpEmail({
    body: {
      name: "Admin",
      email: process.env.ADMIN_EMAIL!,
      password: process.env.ADMIN_PASSWORD!,
    },
  });

  // Update role jadi admin
  await db
    .update(user)
    .set({ role: "admin" })
    .where(eq(user.email, process.env.ADMIN_EMAIL!));

  console.log("Admin created:", process.env.ADMIN_EMAIL);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
