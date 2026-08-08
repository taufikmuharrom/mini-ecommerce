import { db } from "~~/server/database";
import { productType } from "~~/server/database/schema";
import { requireAdmin } from "~~/server/utils/auth-guard";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID is required" });
  }

  const [existing] = await db
    .select({ id: productType.id })
    .from(productType)
    .where(eq(productType.id, id))
    .limit(1);

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Product type not found" });
  }

  await db.delete(productType).where(eq(productType.id, id));

  return { message: "Product type deleted" };
});
