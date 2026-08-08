import { db } from "~~/server/database";
import { productList } from "~~/server/database/schema";
import { requireAdmin } from "~~/server/utils/auth-guard";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID is required" });
  }

  const [existing] = await db
    .select({ id: productList.id })
    .from(productList)
    .where(eq(productList.id, id))
    .limit(1);

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Product not found" });
  }

  await db.delete(productList).where(eq(productList.id, id));

  return { message: "Product deleted" };
});
