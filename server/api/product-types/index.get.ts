import { db } from "~~/server/database";
import { productType } from "~~/server/database/schema";

export default defineEventHandler(async () => {
  const types = await db.select().from(productType);
  return { data: types };
});
