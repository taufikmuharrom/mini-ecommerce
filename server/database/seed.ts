import "dotenv/config";
import { auth } from "../utils/auth";
import { db } from "./index";
import { user, productType, productList } from "./schema";
import { eq } from "drizzle-orm";

async function seedAdmin() {
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, process.env.ADMIN_EMAIL!));
  if (existing.length === 0) {
    await auth.api.signUpEmail({
      body: {
        name: "Admin",
        email: process.env.ADMIN_EMAIL!,
        password: process.env.ADMIN_PASSWORD!,
      },
    });
    await db
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.email, process.env.ADMIN_EMAIL!));
    console.log("Admin created:", process.env.ADMIN_EMAIL);
  }
}

async function seedProducts() {
  const existingTypes = await db.select().from(productType);
  if (existingTypes.length > 0) {
    console.log("Product types already seeded.");
    return;
  }

  const [electronics] = await db
    .insert(productType)
    .values({ name: "Electronics", slug: "electronics" })
    .returning();

  if (!electronics) {
    throw new Error("Failed to create Electronics product type");
  }

  const [fashion] = await db
    .insert(productType)
    .values({ name: "Fashion", slug: "fashion" })
    .returning();

  if (!fashion) {
    throw new Error("Failed to create Fashion product type");
  }

  await db.insert(productList).values([
    {
      name: "Wireless Headphones",
      slug: "wireless-headphones",
      description: "Noise cancelling over-ear headphones.",
      price: 899000,
      stock: 20,
      imageUrl:
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600",
      productTypeId: electronics.id,
    },
    {
      name: "Running Shoes",
      slug: "running-shoes",
      description: "Lightweight running shoes for daily training.",
      price: 1200000,
      stock: 15,
      imageUrl:
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600",
      productTypeId: fashion.id,
    },
  ]);

  console.log("Products seeded.");
}

async function main() {
  await seedAdmin();
  await seedProducts();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
