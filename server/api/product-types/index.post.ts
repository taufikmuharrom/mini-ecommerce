import { db } from "~~/server/database";
import { productType } from "~~/server/database/schema";
import { requireAdmin } from "~~/server/utils/auth-guard";
import { createUniqueSlug } from "~~/server/utils/slug";
import { eq } from "drizzle-orm";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const body = await readBody(event);
  const parsed = createSchema.parse(body);

  const slug = await createUniqueSlug(parsed.name, async (s) => {
    const [existing] = await db
      .select({ id: productType.id })
      .from(productType)
      .where(eq(productType.slug, s))
      .limit(1);
    return !!existing;
  });

  const [type] = await db
    .insert(productType)
    .values({
      name: parsed.name,
      slug,
    })
    .returning();

  return { data: type };
});
