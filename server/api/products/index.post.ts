import { db } from "~~/server/database";
import { productList, productType } from "~~/server/database/schema";
import { requireAdmin } from "~~/server/utils/auth-guard";
import { createUniqueSlug } from "~~/server/utils/slug";
import { eq } from "drizzle-orm";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.number().int().min(0, "Price must be positive"),
  stock: z.number().int().min(0, "Stock must be positive").default(0),
  imageUrl: z.string().url().optional().or(z.literal("")),
  productTypeId: z.string().uuid().optional(),
});

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const body = await readBody(event);
  const parsed = createSchema.parse(body);

  if (parsed.productTypeId) {
    const [existingType] = await db
      .select({ id: productType.id })
      .from(productType)
      .where(eq(productType.id, parsed.productTypeId))
      .limit(1);

    if (!existingType) {
      throw createError({
        statusCode: 400,
        statusMessage: "Product type not found",
      });
    }
  }

  const slug = await createUniqueSlug(parsed.name, async (s) => {
    const [existing] = await db
      .select({ id: productList.id })
      .from(productList)
      .where(eq(productList.slug, s))
      .limit(1);
    return !!existing;
  });

  const [product] = await db
    .insert(productList)
    .values({
      name: parsed.name,
      slug,
      description: parsed.description,
      price: parsed.price,
      stock: parsed.stock,
      imageUrl: parsed.imageUrl || null,
      productTypeId: parsed.productTypeId || null,
    })
    .returning();

  return { data: product };
});
