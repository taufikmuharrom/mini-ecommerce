import { db } from "~~/server/database";
import { productType } from "~~/server/database/schema";
import { requireAdmin } from "~~/server/utils/auth-guard";
import { createUniqueSlug } from "~~/server/utils/slug";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
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
    .from(productType)
    .where(eq(productType.id, id))
    .limit(1);

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Product type not found" });
  }

  let slug = existing.slug;
  if (parsed.name && parsed.name !== existing.name) {
    slug = await createUniqueSlug(parsed.name, async (s) => {
      const [dup] = await db
        .select({ id: productType.id })
        .from(productType)
        .where(and(eq(productType.slug, s), ne(productType.id, id)))
        .limit(1);
      return !!dup;
    });
  }

  const [updated] = await db
    .update(productType)
    .set({
      name: parsed.name,
      slug,
    })
    .where(eq(productType.id, id))
    .returning();

  return { data: updated };
});
