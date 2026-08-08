import { db } from "~~/server/database";
import { product, productType } from "~~/server/database/schema";
import { ilike, eq, and, count } from "drizzle-orm";
import { z } from "zod";

const querySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(12),
});

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const { q, category, page, limit } = querySchema.parse(query);

  const offset = (page - 1) * limit;

  const conditions = [];
  if (q) conditions.push(ilike(product.name, `%${q}%`));
  if (category) conditions.push(eq(productType.slug, category));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const products = await db
    .select({
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: product.price,
      imageUrl: product.imageUrl,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      productType: {
        id: productType.id,
        name: productType.name,
      },
    })
    .from(product)
    .leftJoin(productType, eq(product.productType, productType.id))
    .where(whereClause)
    .limit(limit)
    .offset(offset)
    .orderBy(product.createdAt);

  const [totalResult] = await db
    .select({ total: count() })
    .from(product)
    .leftJoin(productType, eq(product.productType, productType.id))
    .where(whereClause);

  const total = totalResult?.total ?? 0;

  return {
    data: products,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
});
