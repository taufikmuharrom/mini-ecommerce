import "dotenv/config";
import { scrypt } from "node:crypto";
import { db } from "../database/index";
import { user, account } from "../database/schema";
import { eq, and } from "drizzle-orm";

const SCRYPT_CONFIG = {
  N: 16384,
  r: 16,
  p: 1,
  dkLen: 64,
  maxmem: 128 * 16384 * 16 * 2,
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    scrypt(
      password.normalize("NFKC"),
      salt,
      SCRYPT_CONFIG.dkLen,
      {
        N: SCRYPT_CONFIG.N,
        r: SCRYPT_CONFIG.r,
        p: SCRYPT_CONFIG.p,
        maxmem: SCRYPT_CONFIG.maxmem,
      },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(`${salt}:${derivedKey.toString("hex")}`);
      }
    );
  });
}

async function resetAdminPassword() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error("Error: ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
    process.exit(1);
  }

  // Cari user admin
  const existingUsers = await db
    .select()
    .from(user)
    .where(eq(user.email, adminEmail));

  if (existingUsers.length === 0) {
    console.error("Admin user not found:", adminEmail);
    process.exit(1);
  }

  const adminUser = existingUsers[0];
  if (!adminUser) {
    console.error("Admin user not found:", adminEmail);
    process.exit(1);
  }

  // Hash password baru
  const hashedPassword = await hashPassword(adminPassword);

  // Update password di tabel account (provider credential)
  const updated = await db
    .update(account)
    .set({ password: hashedPassword })
    .where(
      and(
        eq(account.userId, adminUser.id),
        eq(account.providerId, "credential")
      )
    )
    .returning();

  if (updated.length === 0) {
    console.error("Credential account not found for admin. Run seed first?");
    process.exit(1);
  }

  console.log("Admin password reset successfully:", adminEmail);
  process.exit(0);
}

resetAdminPassword().catch((err) => {
  console.error("Reset password failed:", err);
  process.exit(1);
});
