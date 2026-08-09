# Phase 3 — Cart & Order

> Tujuan sesi ini:
>
> 1. Membuat fitur **Cart** end-to-end: user bisa menambahkan produk ke keranjang, mengubah jumlah, menghapus item, dan melihat keranjang.
> 2. Membuat fitur **Checkout & Order** end-to-end: dari keranjang menjadi order dengan status history.
> 3. Membuat fitur **Admin Order Management**: admin melihat semua order dan mengubah statusnya.
> 4. Memahami **state machine** status order agar transisi status tidak sembarangan.

---

## 0. Mindset: Alur End-to-End

Phase 3 menggabungkan tiga perspektif berbeda dalam satu flow:

```
User (browser)
  ├── Lihat produk → Add to Cart
  ├── Buka Cart → Checkout
  ├── Lihat Order History
  └── Konfirmasi: Diterima / Tidak diterima

Admin (dashboard)
  ├── Lihat semua order
  ├── Update status: diproses → dikirim
  └── Update status: refund (dengan catatan) / gagal dikirim
```

**Flow resmi:**

```
Add to Cart → View Cart → Checkout → Order Pending
                              ↓
                    Admin: Processing
                              ↓
              Admin: Shipped  or  Refund (with note)
                              ↓
              User: Received (delivered)  or  Not received (delivery failed)
```

Semua perubahan status wajib tercatat di tabel `order_status_history` supaya ada audit trail.

---

## 1. Database Design

### 1.1 Tabel baru yang dibutuhkan

| Tabel | Fungsi |
| ----- | ------ |
| `cart` | Satu row per user yang sedang login. |
| `cart_item` | Item produk di dalam cart, menyimpan quantity dan harga snapshot sementara. |
| `order` | Header order: user, total, status, alamat pengiriman, dll. |
| `order_item` | Detail produk dalam satu order (price snapshot, quantity). |
| `order_status_history` | Riwayat perubahan status order beserta catatan. |

### 1.2 Schema lengkap

Buka `server/database/schema.ts`. Pastikan tabel `product` sudah punya kolom `stock` (untuk validasi stok saat checkout). Kalau belum, tambahkan:

```ts
export const product = pgTable("product", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  slug: text("slug").notNull().unique(),
  price: integer("price").notNull(),
  stock: integer("stock").notNull().default(0),   // ← tambahkan kalau belum ada
  imageUrl: text("image_url"),
  productType: text("product_type").references(() => productType.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp("deleted_at"),
});
```

Tambahkan tabel cart, cart_item, order, order_item, dan order_status_history:

```ts
export const cart = pgTable("cart", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const cartItem = pgTable("cart_item", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  cartId: text("cart_id")
    .notNull()
    .references(() => cart.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => product.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  priceAtAdd: integer("price_at_add").notNull(), // snapshot harga saat dimasukkan ke cart
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, (table) => [
  index("cart_item_cart_id_idx").on(table.cartId),
  index("cart_item_product_id_idx").on(table.productId),
]);

export const order = pgTable("order", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orderNumber: text("order_number").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  total: integer("total").notNull(),
  shippingAddress: text("shipping_address").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, (table) => [
  index("order_user_id_idx").on(table.userId),
  index("order_status_idx").on(table.status),
]);

export const orderItem = pgTable("order_item", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orderId: text("order_id")
    .notNull()
    .references(() => order.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => product.id, { onDelete: "cascade" }),
  name: text("name").notNull(),           // snapshot nama produk
  price: integer("price").notNull(),      // snapshot harga satuan
  quantity: integer("quantity").notNull(),
  subtotal: integer("subtotal").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("order_item_order_id_idx").on(table.orderId),
]);

export const orderStatusHistory = pgTable("order_status_history", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orderId: text("order_id")
    .notNull()
    .references(() => order.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  note: text("note"),
  createdBy: text("created_by"), // user id atau "system"
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("order_status_history_order_id_idx").on(table.orderId),
]);
```

### 1.3 Relasi

```ts
export const cartRelations = relations(cart, ({ one, many }) => ({
  user: one(user, { fields: [cart.userId], references: [user.id] }),
  items: many(cartItem),
}));

export const cartItemRelations = relations(cartItem, ({ one }) => ({
  cart: one(cart, { fields: [cartItem.cartId], references: [cart.id] }),
  product: one(product, {
    fields: [cartItem.productId],
    references: [product.id],
  }),
}));

export const orderRelations = relations(order, ({ one, many }) => ({
  user: one(user, { fields: [order.userId], references: [user.id] }),
  items: many(orderItem),
  statusHistory: many(orderStatusHistory),
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(order, { fields: [orderItem.orderId], references: [order.id] }),
  product: one(product, {
    fields: [orderItem.productId],
    references: [product.id],
  }),
}));

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(order, {
    fields: [orderStatusHistory.orderId],
    references: [order.id],
  }),
}));
```

### 1.4 Status order yang diizinkan

```ts
export const ORDER_STATUSES = [
  "pending",         // order baru dibuat, menunggu admin
  "processing",      // admin mulai memproses
  "shipped",         // admin mengirim barang
  "delivered",       // user konfirmasi diterima
  "delivery_failed", // user konfirmasi tidak diterima / gagal dikirim
  "refunded",        // admin memutuskan refund (dengan catatan)
  "cancelled",       // user/admin membatalkan sebelum dikirim
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
```

Simpan konstanta ini di tempat yang bisa diakses server dan client, misal `app/types/order.ts` dan `server/types/order.ts`, atau sekadar duplikat kecil supaya tidak saling bergantung.

---

## 2. State Machine Status Order

Status order tidak boleh berubah sembarangan. Berikut transisi yang valid:

```
pending ──► processing ──► shipped ──► delivered
   │            │            │
   │            ▼            ▼
   │         refunded   delivery_failed
   │            │            │
   │            └────► (bisa kembali ke refunded)
   ▼
cancelled
```

| Dari status | Bisa ke status | Siapa yang boleh | Catatan |
| ----------- | -------------- | ---------------- | ------- |
| `pending` | `processing`, `cancelled` | Admin / User | Admin mulai proses, atau user batalkan. |
| `processing` | `shipped`, `refunded` | Admin | Refund wajib disertai `note`. |
| `shipped` | `delivered`, `delivery_failed` | User | User konfirmasi setelah menerima/tidak. |
| `delivery_failed` | `refunded` | Admin | Admin refund karena pengiriman gagal. |
| `delivered` | - | - | Final state. |
| `refunded` | - | - | Final state. |

Semua perubahan status wajib dicatat di `order_status_history`.

---

## 3. Cart API (User Only)

Setiap endpoint cart wajib login (`requireSession`). Satu user punya satu cart.

### 3.1 Get cart

File: `server/api/cart/index.get.ts`

```ts
import { db } from "~~/server/database";
import { cart, cartItem, product, productType } from "~~/server/database/schema";
import { requireSession } from "~~/server/utils/auth-guard";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await requireSession(event);

  const [existingCart] = await db
    .select()
    .from(cart)
    .where(eq(cart.userId, session.user.id))
    .limit(1);

  if (!existingCart) {
    return { data: { items: [], total: 0 } };
  }

  const items = await db
    .select({
      cartItemId: cartItem.id,
      quantity: cartItem.quantity,
      priceAtAdd: cartItem.priceAtAdd,
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        imageUrl: product.imageUrl,
        stock: product.stock,
        productType: {
          id: productType.id,
          name: productType.name,
        },
      },
    })
    .from(cartItem)
    .where(eq(cartItem.cartId, existingCart.id))
    .leftJoin(product, eq(cartItem.productId, product.id))
    .leftJoin(productType, eq(product.productType, productType.id));

  const total = items.reduce(
    (sum, item) => sum + item.priceAtAdd * item.quantity,
    0,
  );

  return { data: { items, total } };
});
```

### 3.2 Add to cart

File: `server/api/cart/index.post.ts`

```ts
import { db } from "~~/server/database";
import { cart, cartItem, product } from "~~/server/database/schema";
import { requireSession } from "~~/server/utils/auth-guard";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const addSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
});

export default defineEventHandler(async (event) => {
  const session = await requireSession(event);
  const body = addSchema.parse(await readBody(event));

  const [existingProduct] = await db
    .select({ id: product.id, price: product.price, stock: product.stock })
    .from(product)
    .where(eq(product.id, body.productId))
    .limit(1);

  if (!existingProduct) {
    throw createError({ statusCode: 404, statusMessage: "Product not found" });
  }

  if (existingProduct.stock < body.quantity) {
    throw createError({ statusCode: 400, statusMessage: "Insufficient stock" });
  }

  let [existingCart] = await db
    .select()
    .from(cart)
    .where(eq(cart.userId, session.user.id))
    .limit(1);

  if (!existingCart) {
    [existingCart] = await db
      .insert(cart)
      .values({ userId: session.user.id })
      .returning();
  }

  const [existingItem] = await db
    .select()
    .from(cartItem)
    .where(
      and(eq(cartItem.cartId, existingCart.id), eq(cartItem.productId, body.productId)),
    )
    .limit(1);

  if (existingItem) {
    const newQuantity = existingItem.quantity + body.quantity;
    if (existingProduct.stock < newQuantity) {
      throw createError({ statusCode: 400, statusMessage: "Insufficient stock" });
    }

    await db
      .update(cartItem)
      .set({ quantity: newQuantity })
      .where(eq(cartItem.id, existingItem.id));
  } else {
    await db.insert(cartItem).values({
      cartId: existingCart.id,
      productId: body.productId,
      quantity: body.quantity,
      priceAtAdd: existingProduct.price,
    });
  }

  return { message: "Product added to cart" };
});
```

### 3.3 Update cart item quantity

File: `server/api/cart/[itemId].put.ts`

```ts
import { db } from "~~/server/database";
import { cart, cartItem, product } from "~~/server/database/schema";
import { requireSession } from "~~/server/utils/auth-guard";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const updateSchema = z.object({
  quantity: z.number().int().min(1),
});

export default defineEventHandler(async (event) => {
  const session = await requireSession(event);
  const itemId = getRouterParam(event, "itemId");
  if (!itemId) throw createError({ statusCode: 400, statusMessage: "Item ID required" });

  const { quantity } = updateSchema.parse(await readBody(event));

  const [existingCart] = await db
    .select()
    .from(cart)
    .where(eq(cart.userId, session.user.id))
    .limit(1);

  if (!existingCart) {
    throw createError({ statusCode: 404, statusMessage: "Cart not found" });
  }

  const [item] = await db
    .select()
    .from(cartItem)
    .where(and(eq(cartItem.id, itemId), eq(cartItem.cartId, existingCart.id)))
    .limit(1);

  if (!item) {
    throw createError({ statusCode: 404, statusMessage: "Cart item not found" });
  }

  const [existingProduct] = await db
    .select({ stock: product.stock })
    .from(product)
    .where(eq(product.id, item.productId))
    .limit(1);

  if (!existingProduct || existingProduct.stock < quantity) {
    throw createError({ statusCode: 400, statusMessage: "Insufficient stock" });
  }

  await db.update(cartItem).set({ quantity }).where(eq(cartItem.id, itemId));

  return { message: "Cart item updated" };
});
```

### 3.4 Remove cart item

File: `server/api/cart/[itemId].delete.ts`

```ts
import { db } from "~~/server/database";
import { cart, cartItem } from "~~/server/database/schema";
import { requireSession } from "~~/server/utils/auth-guard";
import { eq, and } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await requireSession(event);
  const itemId = getRouterParam(event, "itemId");
  if (!itemId) throw createError({ statusCode: 400, statusMessage: "Item ID required" });

  const [existingCart] = await db
    .select()
    .from(cart)
    .where(eq(cart.userId, session.user.id))
    .limit(1);

  if (!existingCart) {
    throw createError({ statusCode: 404, statusMessage: "Cart not found" });
  }

  const [item] = await db
    .select()
    .from(cartItem)
    .where(and(eq(cartItem.id, itemId), eq(cartItem.cartId, existingCart.id)))
    .limit(1);

  if (!item) {
    throw createError({ statusCode: 404, statusMessage: "Cart item not found" });
  }

  await db.delete(cartItem).where(eq(cartItem.id, itemId));

  return { message: "Cart item removed" };
});
```

---

## 4. Checkout & Order API (User)

### 4.1 Checkout dari cart

File: `server/api/checkout.post.ts`

```ts
import { db } from "~~/server/database";
import {
  cart,
  cartItem,
  product,
  order,
  orderItem,
  orderStatusHistory,
} from "~~/server/database/schema";
import { requireSession } from "~~/server/utils/auth-guard";
import { eq } from "drizzle-orm";
import { z } from "zod";

const checkoutSchema = z.object({
  shippingAddress: z.string().min(1, "Shipping address is required"),
  note: z.string().optional(),
});

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

export default defineEventHandler(async (event) => {
  const session = await requireSession(event);
  const { shippingAddress, note } = checkoutSchema.parse(await readBody(event));

  const [existingCart] = await db
    .select()
    .from(cart)
    .where(eq(cart.userId, session.user.id))
    .limit(1);

  if (!existingCart) {
    throw createError({ statusCode: 400, statusMessage: "Cart is empty" });
  }

  const items = await db
    .select({
      cartItemId: cartItem.id,
      productId: cartItem.productId,
      quantity: cartItem.quantity,
      priceAtAdd: cartItem.priceAtAdd,
    })
    .from(cartItem)
    .where(eq(cartItem.cartId, existingCart.id));

  if (items.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "Cart is empty" });
  }

  // Validasi stok untuk setiap item
  for (const item of items) {
    const [existingProduct] = await db
      .select({ stock: product.stock, name: product.name })
      .from(product)
      .where(eq(product.id, item.productId))
      .limit(1);

    if (!existingProduct) {
      throw createError({
        statusCode: 400,
        statusMessage: `Product not found for cart item`,
      });
    }

    if (existingProduct.stock < item.quantity) {
      throw createError({
        statusCode: 400,
        statusMessage: `Insufficient stock for ${existingProduct.name}`,
      });
    }
  }

  const total = items.reduce(
    (sum, item) => sum + item.priceAtAdd * item.quantity,
    0,
  );

  const [newOrder] = await db
    .insert(order)
    .values({
      orderNumber: generateOrderNumber(),
      userId: session.user.id,
      status: "pending",
      total,
      shippingAddress,
      note: note || null,
    })
    .returning();

  for (const item of items) {
    await db.insert(orderItem).values({
      orderId: newOrder.id,
      productId: item.productId,
      name: "", // akan diisi setelah query product di bawah
      price: item.priceAtAdd,
      quantity: item.quantity,
      subtotal: item.priceAtAdd * item.quantity,
    });

    // Kurangi stok produk
    await db
      .update(product)
      .set({ stock: sql`${product.stock} - ${item.quantity}` })
      .where(eq(product.id, item.productId));
  }

  // Snapshot nama produk ke order_item
  const orderItems = await db
    .select({
      id: orderItem.id,
      productName: product.name,
    })
    .from(orderItem)
    .leftJoin(product, eq(orderItem.productId, product.id))
    .where(eq(orderItem.orderId, newOrder.id));

  for (const oi of orderItems) {
    await db
      .update(orderItem)
      .set({ name: oi.productName || "Unknown product" })
      .where(eq(orderItem.id, oi.id));
  }

  await db.insert(orderStatusHistory).values({
    orderId: newOrder.id,
    status: "pending",
    note: "Order created from cart",
    createdBy: session.user.id,
  });

  // Kosongkan cart
  await db.delete(cartItem).where(eq(cartItem.cartId, existingCart.id));
  await db.delete(cart).where(eq(cart.id, existingCart.id));

  return { data: newOrder };
});
```

> Tambahkan import `sql` dari `drizzle-orm` untuk decrement stok:
> `import { eq, sql } from "drizzle-orm";`

### 4.2 Get order history user

File: `server/api/orders/index.get.ts`

```ts
import { db } from "~~/server/database";
import { order } from "~~/server/database/schema";
import { requireSession } from "~~/server/utils/auth-guard";
import { eq, desc } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await requireSession(event);

  const orders = await db
    .select()
    .from(order)
    .where(eq(order.userId, session.user.id))
    .orderBy(desc(order.createdAt));

  return { data: orders };
});
```

### 4.3 Get order detail user

File: `server/api/orders/[id].get.ts`

```ts
import { db } from "~~/server/database";
import {
  order,
  orderItem,
  orderStatusHistory,
  product,
} from "~~/server/database/schema";
import { requireSession } from "~~/server/utils/auth-guard";
import { eq, and, desc } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "Order ID required" });

  const [existingOrder] = await db
    .select()
    .from(order)
    .where(and(eq(order.id, id), eq(order.userId, session.user.id)))
    .limit(1);

  if (!existingOrder) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  const items = await db
    .select({
      id: orderItem.id,
      name: orderItem.name,
      price: orderItem.price,
      quantity: orderItem.quantity,
      subtotal: orderItem.subtotal,
      product: {
        id: product.id,
        slug: product.slug,
        imageUrl: product.imageUrl,
      },
    })
    .from(orderItem)
    .where(eq(orderItem.orderId, id))
    .leftJoin(product, eq(orderItem.productId, product.id));

  const history = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, id))
    .orderBy(desc(orderStatusHistory.createdAt));

  return { data: { ...existingOrder, items, history } };
});
```

### 4.4 User: konfirmasi diterima

File: `server/api/orders/[id]/receive.post.ts`

```ts
import { db } from "~~/server/database";
import { order, orderStatusHistory } from "~~/server/database/schema";
import { requireSession } from "~~/server/utils/auth-guard";
import { eq, and, inArray } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "Order ID required" });

  const [existingOrder] = await db
    .select()
    .from(order)
    .where(and(eq(order.id, id), eq(order.userId, session.user.id)))
    .limit(1);

  if (!existingOrder) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  if (existingOrder.status !== "shipped") {
    throw createError({
      statusCode: 400,
      statusMessage: "Order can only be marked as received when shipped",
    });
  }

  await db
    .update(order)
    .set({ status: "delivered" })
    .where(eq(order.id, id));

  await db.insert(orderStatusHistory).values({
    orderId: id,
    status: "delivered",
    note: "User confirmed order received",
    createdBy: session.user.id,
  });

  return { message: "Order marked as delivered" };
});
```

### 4.5 User: konfirmasi tidak diterima / gagal dikirim

File: `server/api/orders/[id]/reject.post.ts`

```ts
import { db } from "~~/server/database";
import { order, orderStatusHistory } from "~~/server/database/schema";
import { requireSession } from "~~/server/utils/auth-guard";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const rejectSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
});

export default defineEventHandler(async (event) => {
  const session = await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "Order ID required" });

  const { reason } = rejectSchema.parse(await readBody(event));

  const [existingOrder] = await db
    .select()
    .from(order)
    .where(and(eq(order.id, id), eq(order.userId, session.user.id)))
    .limit(1);

  if (!existingOrder) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  if (existingOrder.status !== "shipped") {
    throw createError({
      statusCode: 400,
      statusMessage: "Order can only be rejected when shipped",
    });
  }

  await db
    .update(order)
    .set({ status: "delivery_failed" })
    .where(eq(order.id, id));

  await db.insert(orderStatusHistory).values({
    orderId: id,
    status: "delivery_failed",
    note: `User rejected delivery: ${reason}`,
    createdBy: session.user.id,
  });

  return { message: "Order marked as delivery failed" };
});
```

---

## 5. Admin Order Management API

Semua endpoint admin wajib `requireAdmin`.

### 5.1 List semua order

File: `server/api/admin/orders/index.get.ts`

```ts
import { db } from "~~/server/database";
import { order, user } from "~~/server/database/schema";
import { requireAdmin } from "~~/server/utils/auth-guard";
import { desc } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const orders = await db
    .select({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.total,
      shippingAddress: order.shippingAddress,
      note: order.note,
      createdAt: order.createdAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    })
    .from(order)
    .leftJoin(user, eq(order.userId, user.id))
    .orderBy(desc(order.createdAt));

  return { data: orders };
});
```

### 5.2 Detail order admin

File: `server/api/admin/orders/[id].get.ts`

```ts
import { db } from "~~/server/database";
import {
  order,
  orderItem,
  orderStatusHistory,
  user,
  product,
} from "~~/server/database/schema";
import { requireAdmin } from "~~/server/utils/auth-guard";
import { eq, desc } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "Order ID required" });

  const [existingOrder] = await db
    .select()
    .from(order)
    .where(eq(order.id, id))
    .limit(1);

  if (!existingOrder) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  const [orderUser] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, existingOrder.userId))
    .limit(1);

  const items = await db
    .select({
      id: orderItem.id,
      name: orderItem.name,
      price: orderItem.price,
      quantity: orderItem.quantity,
      subtotal: orderItem.subtotal,
      product: {
        id: product.id,
        slug: product.slug,
        imageUrl: product.imageUrl,
      },
    })
    .from(orderItem)
    .where(eq(orderItem.orderId, id))
    .leftJoin(product, eq(orderItem.productId, product.id));

  const history = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, id))
    .orderBy(desc(orderStatusHistory.createdAt));

  return { data: { ...existingOrder, user: orderUser, items, history } };
});
```

### 5.3 Update status order

File: `server/api/admin/orders/[id]/status.put.ts`

```ts
import { db } from "~~/server/database";
import {
  order,
  orderItem,
  product,
  orderStatusHistory,
} from "~~/server/database/schema";
import { requireAdmin } from "~~/server/utils/auth-guard";
import { eq } from "drizzle-orm";
import { z } from "zod";

const statusSchema = z.object({
  status: z.enum(["processing", "shipped", "refunded", "cancelled"]),
  note: z.string().optional(),
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "refunded"],
  shipped: [], // user yang mengubah
  delivery_failed: ["refunded"],
  delivered: [],
  refunded: [],
  cancelled: [],
};

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "Order ID required" });

  const body = statusSchema.parse(await readBody(event));

  const [existingOrder] = await db
    .select()
    .from(order)
    .where(eq(order.id, id))
    .limit(1);

  if (!existingOrder) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  const allowed = VALID_TRANSITIONS[existingOrder.status] || [];
  if (!allowed.includes(body.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot change status from ${existingOrder.status} to ${body.status}`,
    });
  }

  if (body.status === "refunded" && (!body.note || body.note.trim() === "")) {
    throw createError({
      statusCode: 400,
      statusMessage: "Refund requires a note",
    });
  }

  // Kalau refund, kembalikan stok
  if (body.status === "refunded") {
    const items = await db
      .select({ productId: orderItem.productId, quantity: orderItem.quantity })
      .from(orderItem)
      .where(eq(orderItem.orderId, id));

    for (const item of items) {
      await db
        .update(product)
        .set({ stock: sql`${product.stock} + ${item.quantity}` })
        .where(eq(product.id, item.productId));
    }
  }

  await db
    .update(order)
    .set({ status: body.status })
    .where(eq(order.id, id));

  await db.insert(orderStatusHistory).values({
    orderId: id,
    status: body.status,
    note: body.note || `Status updated to ${body.status}`,
    createdBy: session.user.id,
  });

  return { message: `Order status updated to ${body.status}` };
});
```

> Jangan lupa import `sql` dari `drizzle-orm` untuk restore stok.

---

## 6. UI User

### 6.1 Product detail — tombol Add to Cart

Ubah `app/pages/product/[slug].vue` agar Add to Cart memanggil API cart:

```vue
<script setup lang="ts">
const route = useRoute();
const toast = useToast();
const slug = route.params.slug as string;

const { data: response } = await useFetch(`/api/products/${slug}`);
const product = computed(() => response.value?.data);

const qty = ref(1);
const adding = ref(false);

async function addToCart() {
  if (!product.value) return;
  adding.value = true;

  try {
    await $fetch("/api/cart", {
      method: "POST",
      body: {
        productId: product.value.id,
        quantity: qty.value,
      },
    });

    toast.add({ title: "Added to cart", color: "success" });
  } catch (err: any) {
    toast.add({
      title: err?.data?.statusMessage || "Failed to add to cart",
      color: "error",
    });
  } finally {
    adding.value = false;
  }
}
</script>
```

### 6.2 Cart page

File: `app/pages/cart/index.vue`

```vue
<script setup lang="ts">
const toast = useToast();
const router = useRouter();

const { data: cartResponse, refresh } = await useFetch("/api/cart");
const cartData = computed(() => cartResponse.value?.data);

const address = ref("");
const checkingOut = ref(false);

async function updateQuantity(itemId: string, quantity: number) {
  if (quantity < 1) return;
  await $fetch(`/api/cart/${itemId}`, { method: "PUT", body: { quantity } });
  refresh();
}

async function removeItem(itemId: string) {
  await $fetch(`/api/cart/${itemId}`, { method: "DELETE" });
  toast.add({ title: "Item removed", color: "success" });
  refresh();
}

async function checkout() {
  if (!address.value.trim()) {
    toast.add({ title: "Shipping address is required", color: "error" });
    return;
  }

  checkingOut.value = true;

  try {
    const { data } = await $fetch("/api/checkout", {
      method: "POST",
      body: { shippingAddress: address.value },
    });

    toast.add({ title: "Order placed", color: "success" });
    router.push(`/orders/${data.id}`);
  } catch (err: any) {
    toast.add({
      title: err?.data?.statusMessage || "Checkout failed",
      color: "error",
    });
  } finally {
    checkingOut.value = false;
  }
}
</script>

<template>
  <div class="py-8 space-y-6">
    <h1 class="text-2xl font-bold">Cart</h1>

    <div v-if="!cartData?.items?.length" class="text-muted">
      Your cart is empty.
    </div>

    <div v-else class="space-y-4">
      <UCard v-for="item in cartData.items" :key="item.cartItemId">
        <div class="flex items-center gap-4">
          <img
            :src="item.product.imageUrl || 'https://placehold.co/100x100'"
            alt=""
            class="w-20 h-20 object-cover rounded-md"
          />

          <div class="flex-1">
            <NuxtLink
              :to="`/product/${item.product.slug}`"
              class="font-semibold hover:text-primary"
            >
              {{ item.product.name }}
            </NuxtLink>
            <p class="text-sm text-muted">
              Rp {{ item.priceAtAdd.toLocaleString("id-ID") }} x {{ item.quantity }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <UInputNumber
              :model-value="item.quantity"
              :min="1"
              :max="item.product.stock"
              @update:model-value="(v) => updateQuantity(item.cartItemId, v)"
            />
            <UButton
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              @click="removeItem(item.cartItemId)"
            />
          </div>
        </div>
      </UCard>

      <div class="flex justify-between items-center pt-4">
        <p class="text-xl font-bold">
          Total: Rp {{ cartData.total.toLocaleString("id-ID") }}
        </p>
      </div>

      <UFormField label="Shipping Address" class="w-full">
        <UTextarea v-model="address" class="w-full" />
      </UFormField>

      <UButton
        label="Checkout"
        block
        :loading="checkingOut"
        @click="checkout"
      />
    </div>
  </div>
</template>
```

### 6.3 Order detail user (dengan tombol receive / reject)

File: `app/pages/orders/[id].vue`

```vue
<script setup lang="ts">
const route = useRoute();
const toast = useToast();
const id = route.params.id as string;

const { data: response, refresh } = await useFetch(`/api/orders/${id}`);
const order = computed(() => response.value?.data);

const rejectReason = ref("");

async function markReceived() {
  try {
    await $fetch(`/api/orders/${id}/receive`, { method: "POST" });
    toast.add({ title: "Order received", color: "success" });
    refresh();
  } catch (err: any) {
    toast.add({
      title: err?.data?.statusMessage || "Failed to confirm",
      color: "error",
    });
  }
}

async function markRejected() {
  if (!rejectReason.value.trim()) {
    toast.add({ title: "Reason is required", color: "error" });
    return;
  }

  try {
    await $fetch(`/api/orders/${id}/reject`, {
      method: "POST",
      body: { reason: rejectReason.value },
    });
    toast.add({ title: "Delivery marked as failed", color: "success" });
    refresh();
  } catch (err: any) {
    toast.add({
      title: err?.data?.statusMessage || "Failed to reject",
      color: "error",
    });
  }
}
</script>

<template>
  <div v-if="order" class="py-8 space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Order #{{ order.orderNumber }}</h1>
      <UBadge :label="order.status" color="primary" />
    </div>

    <UCard>
      <p><strong>Shipping Address:</strong> {{ order.shippingAddress }}</p>
      <p><strong>Total:</strong> Rp {{ order.total.toLocaleString("id-ID") }}</p>
      <p v-if="order.note"><strong>Note:</strong> {{ order.note }}</p>
    </UCard>

    <div class="space-y-2">
      <h2 class="font-semibold">Items</h2>
      <div
        v-for="item in order.items"
        :key="item.id"
        class="flex items-center gap-4 border rounded-md p-3"
      >
        <img
          :src="item.product?.imageUrl || 'https://placehold.co/80x80'"
          alt=""
          class="w-16 h-16 object-cover rounded"
        />
        <div>
          <p class="font-medium">{{ item.name }}</p>
          <p class="text-sm text-muted">
            {{ item.quantity }} x Rp {{ item.price.toLocaleString("id-ID") }}
          </p>
        </div>
      </div>
    </div>

    <!-- Tombol aksi user -->
    <div v-if="order.status === 'shipped'" class="space-y-4 border rounded-md p-4">
      <p class="text-sm text-muted">
        Barang sudah dikirim. Konfirmasi apakah sudah diterima.
      </p>

      <div class="flex gap-2">
        <UButton label="Received" color="success" @click="markReceived" />
      </div>

      <UDivider label="or" />

      <UFormField label="Reason for not received">
        <UTextarea v-model="rejectReason" class="w-full" />
      </UFormField>
      <UButton label="Not Received" color="error" @click="markRejected" />
    </div>

    <div class="space-y-2">
      <h2 class="font-semibold">Status History</h2>
      <div
        v-for="h in order.history"
        :key="h.id"
        class="text-sm border-l-2 pl-3 py-1"
      >
        <p class="font-medium">{{ h.status }}</p>
        <p class="text-muted">{{ h.note }}</p>
        <p class="text-xs text-muted">{{ new Date(h.createdAt).toLocaleString() }}</p>
      </div>
    </div>
  </div>
</template>
```

---

## 7. UI Admin Order Management

### 7.1 Admin order list

File: `app/pages/admin/orders/index.vue`

```vue
<script setup lang="ts">
definePageMeta({
  layout: "admin",
  middleware: "auth-admin",
});

const { data, refresh } = await useFetch("/api/admin/orders");
const orders = computed(() => data.value?.data || []);
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Orders</h1>

    <UTable
      :rows="orders"
      :columns="[
        { key: 'orderNumber', label: 'Order' },
        { key: 'user.name', label: 'Customer' },
        { key: 'status', label: 'Status' },
        { key: 'total', label: 'Total' },
        { key: 'actions', label: 'Actions' },
      ]"
    >
      <template #total-data="{ row }">
        Rp {{ row.total.toLocaleString("id-ID") }}
      </template>

      <template #actions-data="{ row }">
        <UButton
          icon="i-lucide-eye"
          variant="ghost"
          :to="`/admin/orders/${row.id}`"
        />
      </template>
    </UTable>
  </div>
</template>
```

### 7.2 Admin order detail + update status

File: `app/pages/admin/orders/[id].vue`

```vue
<script setup lang="ts">
definePageMeta({
  layout: "admin",
  middleware: "auth-admin",
});

const route = useRoute();
const toast = useToast();
const id = route.params.id as string;

const { data: response, refresh } = await useFetch(`/api/admin/orders/${id}`);
const order = computed(() => response.value?.data);

const selectedStatus = ref(order.value?.status || "");
const statusNote = ref("");
const updating = ref(false);

watch(
  () => order.value?.status,
  (status) => {
    selectedStatus.value = status || "";
  },
);

const availableStatuses = [
  { label: "Pending", value: "pending" },
  { label: "Processing", value: "processing" },
  { label: "Shipped", value: "shipped" },
  { label: "Refunded", value: "refunded" },
  { label: "Cancelled", value: "cancelled" },
];

async function updateStatus() {
  if (!selectedStatus.value) return;

  updating.value = true;

  try {
    await $fetch(`/api/admin/orders/${id}/status`, {
      method: "PUT",
      body: {
        status: selectedStatus.value,
        note: statusNote.value,
      },
    });

    toast.add({ title: "Status updated", color: "success" });
    statusNote.value = "";
    refresh();
  } catch (err: any) {
    toast.add({
      title: err?.data?.statusMessage || "Failed to update status",
      color: "error",
    });
  } finally {
    updating.value = false;
  }
}
</script>

<template>
  <div v-if="order" class="space-y-6">
    <h1 class="text-2xl font-bold">Order #{{ order.orderNumber }}</h1>

    <UCard class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-sm text-muted">Customer</p>
          <p class="font-medium">{{ order.user?.name }} ({{ order.user?.email }})</p>
        </div>
        <div>
          <p class="text-sm text-muted">Status</p>
          <UBadge :label="order.status" />
        </div>
        <div>
          <p class="text-sm text-muted">Total</p>
          <p class="font-medium">Rp {{ order.total.toLocaleString("id-ID") }}</p>
        </div>
        <div>
          <p class="text-sm text-muted">Shipping Address</p>
          <p class="font-medium">{{ order.shippingAddress }}</p>
        </div>
      </div>
    </UCard>

    <!-- Update status admin -->
    <UCard>
      <template #header>
        <h2 class="font-semibold">Update Status</h2>
      </template>

      <div class="space-y-4">
        <UFormField label="New Status">
          <USelect v-model="selectedStatus" :items="availableStatuses" class="w-full" />
        </UFormField>

        <UFormField label="Note">
          <UTextarea
            v-model="statusNote"
            placeholder="Required for refund; optional for others"
            class="w-full"
          />
        </UFormField>

        <UButton
          label="Update Status"
          :loading="updating"
          @click="updateStatus"
        />
      </div>
    </UCard>

    <!-- Items -->
    <div class="space-y-2">
      <h2 class="font-semibold">Items</h2>
      <div
        v-for="item in order.items"
        :key="item.id"
        class="flex items-center gap-4 border rounded-md p-3"
      >
        <img
          :src="item.product?.imageUrl || 'https://placehold.co/80x80'"
          alt=""
          class="w-16 h-16 object-cover rounded"
        />
        <div>
          <p class="font-medium">{{ item.name }}</p>
          <p class="text-sm text-muted">
            {{ item.quantity }} x Rp {{ item.price.toLocaleString("id-ID") }}
          </p>
        </div>
      </div>
    </div>

    <!-- Status history -->
    <div class="space-y-2">
      <h2 class="font-semibold">Status History</h2>
      <div
        v-for="h in order.history"
        :key="h.id"
        class="text-sm border-l-2 pl-3 py-1"
      >
        <p class="font-medium">{{ h.status }}</p>
        <p class="text-muted">{{ h.note }}</p>
        <p class="text-xs text-muted">{{ new Date(h.createdAt).toLocaleString() }}</p>
      </div>
    </div>
  </div>
</template>
```

---

## 8. Alur Status End-to-End (Studi Kasus)

### Kasus 1: Order sukses

1. User checkout → order status `pending`.
2. Admin buka halaman admin order → klik **Processing**.
3. Admin siapkan barang → klik **Shipped**.
4. User menerima barang → di halaman order detail klik **Received**.
5. Status final: `delivered`.

### Kasus 2: Refund sebelum dikirim

1. User checkout → `pending`.
2. Admin mulai proses → `processing`.
3. Admin menemukan stok rusak → update status **Refunded** dengan catatan "Stok rusak, dana dikembalikan".
4. Status final: `refunded`. Stok dikembalikan.

### Kasus 3: Gagal dikirim

1. User checkout → `pending`.
2. Admin proses → `processing`.
3. Admin kirim → `shipped`.
4. User tidak menerima barang → klik **Not Received** dengan alasan "Alamat tidak ditemukan".
5. Status: `delivery_failed`.
6. Admin memutuskan refund → update status **Refunded** dengan catatan "Pengiriman gagal, refund dana".
7. Status final: `refunded`. Stok dikembalikan.

---

## 9. Catatan Penting

### 9.1 Stok

- Stok dikurangi saat **checkout berhasil**.
- Stok dikembalikan saat **refund** atau **cancelled**.
- Jangan kurangi stok saat add to cart, karena cart bukan komitmen pembelian.

### 9.2 Price snapshot

- `order_item.price` menyimpan harga saat checkout. Harga produk bisa berubah di masa depan, tapi order harus tetap menampilkan harga yang dibayar user.

### 9.3 Keamanan

- Semua endpoint cart dan order user wajib `requireSession`.
- Semua endpoint admin wajib `requireAdmin`.
- User hanya boleh membaca/mengubah order miliknya sendiri (`eq(order.userId, session.user.id)`).
- State machine status di server wajib divalidasi; jangan andalkan UI.

### 9.4 Transaksi

- Checkout mengubah banyak tabel sekaligus: insert order, insert order items, kurangi stok, insert history, hapus cart.
- Di production, sebaiknya bungkus dalam satu transaksi database. Dengan driver Neon HTTP, transaksi mungkin terbatas; pertimbangkan pakai driver `neon` pooling atau `@neondatabase/serverless` transaction mode jika diperlukan.

---

## 10. Generate Migration & Seed

Setelah schema selesai:

```bash
pnpm db:generate
pnpm db:migrate
```

Tambahkan seed order contoh di `server/database/seed.ts` kalau ingin langsung punya data order untuk testing.

---

## 11. Test Scenario

| No | Skenario | Yang diharapkan |
| -- | -------- | --------------- |
| 1 | User login → Add product ke cart | Cart berisi produk dengan quantity benar. |
| 2 | User ubah quantity di cart | Total cart terupdate. |
| 3 | User checkout dengan stok cukup | Order `pending` tercipta, cart kosong, stok berkurang. |
| 4 | User checkout dengan stok tidak cukup | Error 400 "Insufficient stock". |
| 5 | Admin ubah status `pending` → `processing` | Berhasil, history tercatat. |
| 6 | Admin ubah `processing` → `refunded` tanpa catatan | Error 400 "Refund requires a note". |
| 7 | Admin ubah `shipped` → `refunded` | Error 400, karena transisi tidak valid. |
| 8 | User konfirmasi `Received` saat `shipped` | Status menjadi `delivered`. |
| 9 | User konfirmasi `Not Received` saat `shipped` | Status menjadi `delivery_failed`. |
| 10 | Admin refund setelah `delivery_failed` | Status `refunded`, stok kembali. |
| 11 | User biasa akses `/api/admin/orders` | Error 403 Forbidden. |
| 12 | User A akses order milik User B | Error 404 Not Found. |

---

## 12. Ringkasan

- Cart = keranjang sementara user, tidak mengurangi stok.
- Checkout = mengubah cart menjadi order, mengurangi stok, mencatat history.
- Order punya state machine yang ketat; setiap perubahan status wajib tercatat.
- Admin mengelola status dari `pending` → `processing` → `shipped` / `refunded`.
- User mengonfirmasi penerimaan: `delivered` atau `delivery_failed`.
- Refund wajib disertai catatan dan mengembalikan stok.

---

## Next Steps (Phase 4 — Optional)

- Notifikasi email/SMS saat status order berubah.
- Fitur review & rating produk setelah order `delivered`.
- Admin dashboard dengan ringkasan penjualan.
