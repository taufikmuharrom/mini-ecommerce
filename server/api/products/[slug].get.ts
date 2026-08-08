import { db } from "~~/server/database";
import { productList, productType } from "~~/server/database/schema";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug");

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: "Slug is required" });
  }

  const [product] = await db
    .select({
      id: productList.id,
      name: productList.name,
      slug: productList.slug,
      description: productList.description,
      price: productList.price,
      stock: productList.stock,
      imageUrl: productList.imageUrl,
      createdAt: productList.createdAt,
      updatedAt: productList.updatedAt,
      productType: {
        id: productType.id,
        name: productType.name,
        slug: productType.slug,
      },
    })
    .from(productList)
    .leftJoin(productType, eq(productList.productTypeId, productType.id))
    .where(eq(productList.slug, slug))
    .limit(1);

  if (!product) {
    throw createError({ statusCode: 404, statusMessage: "Product not found" });
  }

  return { data: product };
});
