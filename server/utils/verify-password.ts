import { db } from "../database";
import { user, account } from "../database/schema";
import { eq, and } from "drizzle-orm";
import { verifyPassword } from "@better-auth/utils/password";

/**
 * Verifikasi password user secara manual via Drizzle ORM
 *
 * Alur:
 * 1. Cari user berdasarkan email
 * 2. Ambil record account dengan provider "credential" milik user tersebut
 * 3. Bandingkan password input dengan hash menggunakan scrypt (Better Auth default)
 */
export async function verifyUserPassword(email: string, plainPassword: string) {
  // 1. Query user by email
  const foundUser = await db.query.user.findFirst({
    where: eq(user.email, email),
  });

  if (!foundUser) {
    return { success: false, error: "User tidak ditemukan" as const };
  }

  // 2. Query account record untuk email/password login
  const credentialAccount = await db.query.account.findFirst({
    where: and(
      eq(account.userId, foundUser.id),
      eq(account.providerId, "credential")
    ),
  });

  if (!credentialAccount?.password) {
    return { success: false, error: "Password tidak tersedia (mungkin login via OAuth)" as const };
  }

  // 3. Verifikasi hash menggunakan utilitas internal Better Auth
  // Format hash Better Auth: "salt:hex_key" (scrypt)
  const isValid = await verifyPassword(credentialAccount.password, plainPassword);

  if (!isValid) {
    return { success: false, error: "Password salah" as const };
  }

  return { success: true, user: foundUser };
}
