import { db } from "~~/server/database";
import { productList, productType } from "~~/server/database/schema";
import { requireAdmin } from "~~/server/utils/auth-guard";
import { createUniqueSlug } from "~~/server/utils/slug";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.number().int().min(0).optional(),
  stock: z.number().int().min(0).optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  productTypeId: z.string().uuid().optional().nullable(),
});

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID is required" });
  }

  const body = await readBody(event);
  const parsed = updateSchema.parse(body);

  const [existing] = await db
    .select()
    .from(productList)
    .where(eq(productList.id, id))
    .limit(1);

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Product not found" });
  }

  if (parsed.productTypeId) {
    const [type] = await db
      .select({ id: productType.id })
      .from(productType)
      .where(eq(productType.id, parsed.productTypeId))
      .limit(1);

    if (!type) {
      throw createError({
        statusCode: 400,
        statusMessage: "Product type not found",
      });
    }
  }

  let slug = existing.slug;
  if (parsed.name && parsed.name !== existing.name) {
    slug = await createUniqueSlug(parsed.name, async (s) => {
      const [dup] = await db
        .select({ id: productList.id })
        .from(productList)
        .where(and(eq(productList.slug, s), ne(productList.id, id)))
        .limit(1);
      return !!dup;
    });
  }

  const [updated] = await db
    .update(productList)
    .set({
      name: parsed.name,
      slug,
      description: parsed.description,
      price: parsed.price,
      stock: parsed.stock,
      imageUrl: parsed.imageUrl === "" ? null : parsed.imageUrl,
      productTypeId: parsed.productTypeId,
    })
    .where(eq(productList.id, id))
    .returning();

  return { data: updated };
});
