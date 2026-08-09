# Phase 4 — Integrasi Payment Gateway (Midtrans)

> Tujuan sesi ini:
>
> 1. Menambahkan alur pembayaran ke dalam order flow menggunakan **Midtrans Snap**.
> 2. Membuat tabel `payment_transaction` untuk menyimpan data transaksi Midtrans.
> 3. Memperluas state machine order dengan status pembayaran: `awaiting_payment`, `paid`, `payment_failed`.
> 4. Mengimplementasikan webhook handler notifikasi dari Midtrans.
> 5. Mengamankan endpoint pembayaran agar hanya user pemilik order yang bisa membayar.

---

## 0. Mindset: Alur End-to-End dengan Pembayaran

Setelah Phase 4, flow order menjadi:

```
User (browser)
  ├── Lihat produk → Add to Cart
  ├── Buka Cart → Checkout
  │                 ↓
  │       Order dibuat: awaiting_payment
  │                 ↓
  │       Midtrans Snap popup/redirect
  │                 ↓
  │       User membayar
  │                 ↓
  │       Webhook Midtrans → status paid
  │                 ↓
  ├── Lihat Order History
  └── Konfirmasi: Diterima / Tidak diterima

Admin (dashboard)
  ├── Lihat order yang sudah paid
  ├── Update status: diproses → dikirim
  └── Update status: refund (dengan catatan) / gagal dikirim
```

**Flow resmi:**

```
Add to Cart → View Cart → Checkout → awaiting_payment
                              ↓
                    Midtrans: pending / paid / failed
                              ↓
                         paid → pending (menunggu admin)
                              ↓
                    Admin: processing
                              ↓
              Admin: shipped  or  Refund (with note)
                              ↓
      User: Received (delivered)  or  Not received (delivery_failed)
```

---

## 1. Instalasi Dependency

Install official Midtrans Node.js client:

```bash
pnpm add midtrans-client
```

---

## 2. Environment Variables

Tambahkan ke `.env` dan `.env.example`:

```env
# Midtrans
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxx
MIDTRANS_IS_PRODUCTION=false
```

> `MIDTRANS_SERVER_KEY` bersifat rahasia dan hanya boleh dipakai di server.
> `MIDTRANS_CLIENT_KEY` boleh diekspos ke client untuk inisialisasi Snap popup.

---

## 3. Database Design

### 3.1 Perubahan tabel `order`

Ubah default status dan daftar status yang diizinkan:

```ts
export const ORDER_STATUSES = [
  "awaiting_payment",  // order baru, menunggu pembayaran
  "paid",              // pembayaran berhasil dari Midtrans
  "payment_failed",    // pembayaran gagal / batal / kadaluarsa
  "pending",           // sudah dibayar, menunggu admin proses
  "processing",        // admin mulai memproses
  "shipped",           // admin mengirim barang
  "delivered",         // user konfirmasi diterima
  "delivery_failed",   // user konfirmasi tidak diterima
  "refunded",          // admin memutuskan refund
  "cancelled",         // user/admin membatalkan sebelum dikirim
] as const;
```

Ubah default status di tabel `order`:

```ts
export const order = pgTable("order", {
  // ... kolom lain
  status: text("status").notNull().default("awaiting_payment"),
  // ...
});
```

### 3.2 Tabel baru: `payment_transaction`

```ts
export const paymentTransaction = pgTable("payment_transaction", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orderId: text("order_id")
    .notNull()
    .references(() => order.id, { onDelete: "cascade" })
    .unique(),
  midtransOrderId: text("midtrans_order_id").notNull().unique(),
  midtransTransactionId: text("midtrans_transaction_id"),
  paymentType: text("payment_type"),
  grossAmount: integer("gross_amount").notNull(),
  status: text("status").notNull().default("pending"),
  settlementTime: timestamp("settlement_time"),
  expiryTime: timestamp("expiry_time"),
  rawResponse: text("raw_response"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, (table) => [
  index("payment_transaction_order_id_idx").on(table.orderId),
  index("payment_transaction_midtrans_order_id_idx").on(table.midtransOrderId),
]);
```

> `raw_response` menyimpan JSON string response notifikasi Midtrans untuk keperluan audit/debugging.

### 3.3 Relasi

Tambahkan relasi dari `order` ke `paymentTransaction`:

```ts
export const orderRelations = relations(order, ({ one, many }) => ({
  user: one(user, { fields: [order.userId], references: [user.id] }),
  items: many(orderItem),
  statusHistory: many(orderStatusHistory),
  payment: one(paymentTransaction, {
    fields: [order.id],
    references: [paymentTransaction.orderId],
  }),
}));

export const paymentTransactionRelations = relations(paymentTransaction, ({ one }) => ({
  order: one(order, {
    fields: [paymentTransaction.orderId],
    references: [order.id],
  }),
}));
```

---

## 4. State Machine Status Order (Diperbarui)

```
awaiting_payment ──► pending ──► processing ──► shipped ──► delivered
       │               │            │            │
       │               │            ▼            ▼
       │               │         refunded   delivery_failed
       │               │            │            │
       │               │            └────► (final)
       │               ▼
       │           cancelled
       ▼
  payment_failed
```

| Dari status | Bisa ke status | Siapa yang boleh | Catatan |
| ----------- | -------------- | ---------------- | ------- |
| `awaiting_payment` | `paid`, `payment_failed`, `cancelled` | System / User | Berubah otomatis lewat webhook Midtrans atau user cancel sebelum bayar. |
| `paid` | `pending` | System | Langsung otomatis setelah Midtrans konfirmasi pembayaran. |
| `pending` | `processing`, `cancelled` | Admin / User | Admin mulai proses, atau user/admin batalkan sebelum dikirim. |
| `processing` | `shipped`, `refunded` | Admin | Refund wajib disertai `note`. |
| `shipped` | `delivered`, `delivery_failed` | User | User konfirmasi setelah menerima/tidak. |
| `delivery_failed` | `refunded` | Admin | Admin refund karena pengiriman gagal. |
| `payment_failed` | - | - | Final state; user bisa checkout ulang. |
| `delivered` | - | - | Final state. |
| `refunded` | - | - | Final state. |
| `cancelled` | - | - | Final state. |

---

## 5. Server Utility: Midtrans Client

File: `server/utils/midtrans.ts`

```ts
import midtransClient from "midtrans-client";

export function createSnapClient() {
  const isProduction = useRuntimeConfig().midtransIsProduction === "true";
  const serverKey = useRuntimeConfig().midtransServerKey;
  const clientKey = useRuntimeConfig().midtransClientKey;

  if (!serverKey || !clientKey) {
    throw createError({
      statusCode: 500,
      statusMessage: "Midtrans credentials not configured",
    });
  }

  return new midtransClient.Snap({
    isProduction,
    serverKey,
    clientKey,
  });
}
```

### 5.1 Runtime config

Tambahkan ke `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  // ...
  runtimeConfig: {
    midtransServerKey: process.env.MIDTRANS_SERVER_KEY,
    midtransClientKey: process.env.MIDTRANS_CLIENT_KEY,
    midtransIsProduction: process.env.MIDTRANS_IS_PRODUCTION || "false",
    public: {
      midtransClientKey: process.env.MIDTRANS_CLIENT_KEY,
      midtransIsProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
    },
  },
});
```

---

## 6. Checkout API (Dimodifikasi)

File: `server/api/checkout.post.ts`

Setelah checkout, buat:
1. Order dengan status `awaiting_payment`.
2. Payment transaction record.
3. Snap token dari Midtrans.
4. Kembalikan token ke client.

```ts
import { db } from "~~/server/database";
import {
  cart,
  cartItem,
  product,
  order,
  orderItem,
  orderStatusHistory,
  paymentTransaction,
} from "~~/server/database/schema";
import { requireSession } from "~~/server/utils/auth-guard";
import { createSnapClient } from "~~/server/utils/midtrans";
import { eq, sql } from "drizzle-orm";
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

  // Validasi stok
  for (const item of items) {
    const [existingProduct] = await db
      .select({ stock: product.stock, name: product.name })
      .from(product)
      .where(eq(product.id, item.productId))
      .limit(1);

    if (!existingProduct) {
      throw createError({
        statusCode: 400,
        statusMessage: "Product not found for cart item",
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

  const orderNumber = generateOrderNumber();
  const midtransOrderId = `${orderNumber}-${Date.now()}`;

  const [newOrder] = await db
    .insert(order)
    .values({
      orderNumber,
      userId: session.user.id,
      status: "awaiting_payment",
      total,
      shippingAddress,
      note: note || null,
    })
    .returning();

  for (const item of items) {
    const [existingProduct] = await db
      .select({ name: product.name })
      .from(product)
      .where(eq(product.id, item.productId))
      .limit(1);

    await db.insert(orderItem).values({
      orderId: newOrder.id,
      productId: item.productId,
      name: existingProduct?.name || "Unknown product",
      price: item.priceAtAdd,
      quantity: item.quantity,
      subtotal: item.priceAtAdd * item.quantity,
    });

    // Kurangi stok saat checkout
    await db
      .update(product)
      .set({ stock: sql`${product.stock} - ${item.quantity}` })
      .where(eq(product.id, item.productId));
  }

  await db.insert(orderStatusHistory).values({
    orderId: newOrder.id,
    status: "awaiting_payment",
    note: "Order created, waiting for payment",
    createdBy: session.user.id,
  });

  await db.insert(paymentTransaction).values({
    orderId: newOrder.id,
    midtransOrderId,
    grossAmount: total,
    status: "pending",
  });

  // Buat Snap token
  const snap = createSnapClient();
  const parameter = {
    transaction_details: {
      order_id: midtransOrderId,
      gross_amount: total,
    },
    credit_card: {
      secure: true,
    },
    customer_details: {
      first_name: session.user.name,
      email: session.user.email,
    },
  };

  const snapResponse = await snap.createTransaction(parameter);

  // Update payment transaction dengan token/redirect url
  await db
    .update(paymentTransaction)
    .set({
      rawResponse: JSON.stringify(snapResponse),
    })
    .where(eq(paymentTransaction.orderId, newOrder.id));

  // Kosongkan cart
  await db.delete(cartItem).where(eq(cartItem.cartId, existingCart.id));
  await db.delete(cart).where(eq(cart.id, existingCart.id));

  return {
    data: {
      order: newOrder,
      token: snapResponse.token,
      redirectUrl: snapResponse.redirect_url,
    },
  };
});
```

---

## 7. Webhook Notifikasi Midtrans

File: `server/api/payments/midtrans/notification.post.ts`

Endpoint ini menerima notifikasi dari Midtrans. Tidak memerlukan autentikasi karena Midtrans mengirimkan request-nya sendiri.

```ts
import { db } from "~~/server/database";
import {
  order,
  orderItem,
  orderStatusHistory,
  paymentTransaction,
  product,
} from "~~/server/database/schema";
import { createSnapClient } from "~~/server/utils/midtrans";
import { eq, sql } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const snap = createSnapClient();

  // Verifikasi notifikasi ke Midtrans
  let statusResponse;
  try {
    statusResponse = await snap.transaction.notification(body);
  } catch (err) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid notification",
    });
  }

  const midtransOrderId = statusResponse.order_id;
  const transactionStatus = statusResponse.transaction_status;
  const fraudStatus = statusResponse.fraud_status;

  const [payment] = await db
    .select({
      id: paymentTransaction.id,
      orderId: paymentTransaction.orderId,
    })
    .from(paymentTransaction)
    .where(eq(paymentTransaction.midtransOrderId, midtransOrderId))
    .limit(1);

  if (!payment) {
    throw createError({
      statusCode: 404,
      statusMessage: "Payment transaction not found",
    });
  }

  const [existingOrder] = await db
    .select({ id: order.id, status: order.status })
    .from(order)
    .where(eq(order.id, payment.orderId))
    .limit(1);

  if (!existingOrder) {
    throw createError({
      statusCode: 404,
      statusMessage: "Order not found",
    });
  }

  let newOrderStatus: string | null = null;
  let newPaymentStatus: string | null = null;
  let note = "";

  if (transactionStatus === "capture") {
    if (fraudStatus === "challenge") {
      newPaymentStatus = "challenge";
      note = "Payment challenged by fraud detection";
    } else if (fraudStatus === "accept") {
      newPaymentStatus = "settlement";
      newOrderStatus = "paid";
      note = "Payment captured and accepted";
    }
  } else if (transactionStatus === "settlement") {
    newPaymentStatus = "settlement";
    newOrderStatus = "paid";
    note = "Payment settled";
  } else if (transactionStatus === "pending") {
    newPaymentStatus = "pending";
    note = "Waiting for payment";
  } else if (transactionStatus === "deny") {
    newPaymentStatus = "deny";
    note = "Payment denied";
  } else if (transactionStatus === "cancel" || transactionStatus === "expire") {
    newPaymentStatus = transactionStatus;
    newOrderStatus = "payment_failed";
    note = `Payment ${transactionStatus}`;
  }

  // Update payment transaction
  await db
    .update(paymentTransaction)
    .set({
      midtransTransactionId: statusResponse.transaction_id || paymentTransaction.midtransTransactionId,
      paymentType: statusResponse.payment_type || paymentTransaction.paymentType,
      status: newPaymentStatus || paymentTransaction.status,
      settlementTime: statusResponse.settlement_time
        ? new Date(statusResponse.settlement_time)
        : paymentTransaction.settlementTime,
      rawResponse: JSON.stringify(statusResponse),
    })
    .where(eq(paymentTransaction.id, payment.id));

  // Update order status dan catat history
  if (newOrderStatus && existingOrder.status !== newOrderStatus) {
    await db
      .update(order)
      .set({ status: newOrderStatus })
      .where(eq(order.id, existingOrder.id));

    await db.insert(orderStatusHistory).values({
      orderId: existingOrder.id,
      status: newOrderStatus,
      note,
      createdBy: "system",
    });

    // Jika payment_failed, kembalikan stok
    if (newOrderStatus === "payment_failed") {
      const items = await db
        .select({ productId: orderItem.productId, quantity: orderItem.quantity })
        .from(orderItem)
        .where(eq(orderItem.orderId, existingOrder.id));

      for (const item of items) {
        await db
          .update(product)
          .set({ stock: sql`${product.stock} + ${item.quantity}` })
          .where(eq(product.id, item.productId));
      }
    }
  }

  return { message: "Notification processed" };
});
```

> Jangan lupa import `sql` dari `drizzle-orm` dan `orderItem`, `product` dari schema.

---

## 8. Check Payment Status API

File: `server/api/orders/[id]/payment.get.ts`

User bisa mengecek status pembayaran order miliknya.

```ts
import { db } from "~~/server/database";
import { order, paymentTransaction } from "~~/server/database/schema";
import { requireSession } from "~~/server/utils/auth-guard";
import { eq, and } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "Order ID required" });

  const [existingOrder] = await db
    .select({ id: order.id })
    .from(order)
    .where(and(eq(order.id, id), eq(order.userId, session.user.id)))
    .limit(1);

  if (!existingOrder) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }

  const [payment] = await db
    .select()
    .from(paymentTransaction)
    .where(eq(paymentTransaction.orderId, id))
    .limit(1);

  if (!payment) {
    throw createError({ statusCode: 404, statusMessage: "Payment not found" });
  }

  return { data: payment };
});
```

---

## 9. Batalkan Order Sebelum Dibayar

File: `server/api/orders/[id]/cancel.post.ts`

User bisa membatalkan order yang masih `awaiting_payment`.

```ts
import { db } from "~~/server/database";
import { order, orderItem, orderStatusHistory, product } from "~~/server/database/schema";
import { requireSession } from "~~/server/utils/auth-guard";
import { eq, and, sql } from "drizzle-orm";

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

  if (!["awaiting_payment", "pending"].includes(existingOrder.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Order cannot be cancelled at this stage",
    });
  }

  // Kembalikan stok
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

  await db.update(order).set({ status: "cancelled" }).where(eq(order.id, id));

  await db.insert(orderStatusHistory).values({
    orderId: id,
    status: "cancelled",
    note: "User cancelled the order",
    createdBy: session.user.id,
  });

  return { message: "Order cancelled" };
});
```

---

## 10. Modifikasi Admin Update Status

File: `server/api/admin/orders/[id]/status.put.ts`

Perbarui `VALID_TRANSITIONS` agar admin tidak bisa mengubah status yang terkait pembayaran:

```ts
const VALID_TRANSITIONS: Record<string, string[]> = {
  awaiting_payment: [], // hanya system/user cancel
  paid: [],             // hanya system
  payment_failed: [],   // final
  pending: ["processing", "cancelled"],
  processing: ["shipped", "refunded"],
  shipped: [],          // user yang mengubah
  delivery_failed: ["refunded"],
  delivered: [],
  refunded: [],
  cancelled: [],
};
```

Admin hanya boleh mengelola order yang sudah `pending` ke atas. Order `awaiting_payment` atau `payment_failed` tidak perlu diolah admin.

---

## 11. Modifikasi Order Detail User

File: `server/api/orders/[id].get.ts`

Tambahkan informasi payment ke response:

```ts
const payment = await db
  .select()
  .from(paymentTransaction)
  .where(eq(paymentTransaction.orderId, id))
  .limit(1);

return { data: { ...existingOrder, items, history, payment: payment[0] || null } };
```

---

## 12. UI: Checkout dengan Snap

### 12.1 Load Midtrans Snap SDK

File: `app/plugins/midtrans.client.ts`

```ts
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();

  useHead({
    script: [
      {
        src: config.public.midtransIsProduction
          ? "https://app.midtrans.com/snap/snap.js"
          : "https://app.sandbox.midtrans.com/snap/snap.js",
        "data-client-key": config.public.midtransClientKey,
        defer: true,
      },
    ],
  });
});
```

### 12.2 Modifikasi Cart Page Checkout

File: `app/pages/cart/index.vue`

Setelah checkout berhasil, buka Snap popup menggunakan token yang dikembalikan:

```ts
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

    if (window.snap) {
      window.snap.pay(data.token, {
        onSuccess: function (result) {
          toast.add({ title: "Payment successful", color: "success" });
          router.push(`/orders/${data.order.id}`);
        },
        onPending: function (result) {
          toast.add({ title: "Waiting for payment", color: "warning" });
          router.push(`/orders/${data.order.id}`);
        },
        onError: function (result) {
          toast.add({ title: "Payment failed", color: "error" });
          router.push(`/orders/${data.order.id}`);
        },
        onClose: function () {
          toast.add({ title: "Payment popup closed", color: "warning" });
          router.push(`/orders/${data.order.id}`);
        },
      });
    } else {
      // Fallback: redirect ke Midtrans redirect_url
      window.location.href = data.redirectUrl;
    }
  } catch (err: any) {
    toast.add({
      title: err?.data?.statusMessage || "Checkout failed",
      color: "error",
    });
  } finally {
    checkingOut.value = false;
  }
}
```

Tambahkan type global untuk `window.snap` di `app/types/midtrans.d.ts`:

```ts
declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        options: {
          onSuccess?: (result: unknown) => void;
          onPending?: (result: unknown) => void;
          onError?: (result: unknown) => void;
          onClose?: () => void;
        },
      ) => void;
    };
  }
}

export {};
```

### 12.3 Modifikasi Order Detail User

File: `app/pages/orders/[id].vue`

Tampilkan status pembayaran dan tombol bayar ulang/cancel:

```vue
<script setup lang="ts">
const route = useRoute();
const toast = useToast();
const id = route.params.id as string;

const { data: response, refresh } = await useFetch(`/api/orders/${id}`);
const order = computed(() => response.value?.data);

const cancelling = ref(false);

async function cancelOrder() {
  cancelling.value = true;
  try {
    await $fetch(`/api/orders/${id}/cancel`, { method: "POST" });
    toast.add({ title: "Order cancelled", color: "success" });
    refresh();
  } catch (err: any) {
    toast.add({
      title: err?.data?.statusMessage || "Failed to cancel order",
      color: "error",
    });
  } finally {
    cancelling.value = false;
  }
}

async function retryPayment() {
  if (!order.value?.payment?.token) {
    toast.add({ title: "Payment token not available", color: "error" });
    return;
  }

  if (window.snap) {
    window.snap.pay(order.value.payment.token, {
      onSuccess: () => { refresh(); },
      onPending: () => { refresh(); },
      onError: () => { refresh(); },
      onClose: () => { refresh(); },
    });
  }
}
</script>

<template>
  <div v-if="order" class="py-8 space-y-6">
    <!-- ... existing order info ... -->

    <!-- Payment info -->
    <UCard v-if="order.payment">
      <p><strong>Payment Status:</strong> {{ order.payment.status }}</p>
      <p><strong>Payment Type:</strong> {{ order.payment.paymentType || "-" }}</p>
    </UCard>

    <!-- Aksi user -->
    <div v-if="order.status === 'awaiting_payment'" class="space-y-4 border rounded-md p-4">
      <p class="text-sm text-muted">Menunggu pembayaran.</p>
      <div class="flex gap-2">
        <UButton label="Pay Now" color="primary" @click="retryPayment" />
        <UButton label="Cancel Order" color="error" variant="ghost" :loading="cancelling" @click="cancelOrder" />
      </div>
    </div>

    <!-- Tombol receive/reject tetap sama untuk status shipped -->
    <!-- ... -->
  </div>
</template>
```

---

## 13. UI Admin Order Management

### 13.1 Filter order yang perlu ditangani admin

File: `app/pages/admin/orders/index.vue`

Admin sebaiknya melihat order dengan status `pending`, `processing`, `shipped`, `delivery_failed`, `refunded`, `cancelled`. Order `awaiting_payment` atau `payment_failed` bisa ditampilkan tapi tidak perlu aksi admin.

Tambahkan badge/filter status di tabel.

### 13.2 Detail order admin

File: `app/pages/admin/orders/[id].vue`

Tampilkan informasi pembayaran:

```vue
<UCard>
  <p><strong>Payment Status:</strong> {{ order.payment?.status }}</p>
  <p><strong>Midtrans Order ID:</strong> {{ order.payment?.midtransOrderId }}</p>
  <p><strong>Payment Type:</strong> {{ order.payment?.paymentType || "-" }}</p>
</UCard>
```

Tombol update status hanya muncul untuk status yang boleh diubah admin (`pending`, `processing`, `delivery_failed`).

---

## 14. Midtrans Dashboard Configuration

### 14.1 Environment

Midtrans menyediakan dua environment:
- **Sandbox**: `https://app.sandbox.midtrans.com` (untuk development/testing).
- **Production**: `https://app.midtrans.com` (untuk live).

Pastikan `MIDTRANS_IS_PRODUCTION` di `.env` di-set sesuai environment.

### 14.2 Notification URL

Di dashboard Midtrans, set **Settings → Notification URL** ke:

```
https://<your-domain>/api/payments/midtrans/notification
```

Untuk development lokal, gunakan tunneling seperti **ngrok** atau **cloudflared**:

```bash
npx ngrok http 3000
```

Lalu copy URL ngrok ke dashboard Midtrans.

### 14.3 Server Key & Client Key

- Masuk ke Midtrans Dashboard → Settings → Access Keys.
- Copy **Server Key** ke `MIDTRANS_SERVER_KEY`.
- Copy **Client Key** ke `MIDTRANS_CLIENT_KEY`.

---

## 15. Keamanan

1. **Verifikasi notifikasi**: Selalu panggil `snap.transaction.notification(body)` untuk memverifikasi signature notifikasi dari Midtrans. Jangan percaya langsung body request.
2. **Server key secrecy**: Jangan pernah expose `MIDTRANS_SERVER_KEY` ke client. Hanya `MIDTRANS_CLIENT_KEY` yang boleh public.
3. **Idempotency**: Proses notifikasi dengan idempoten. Jika notifikasi sama diterima dua kali, status tidak boleh berubah bolak-balik (terutama stok).
4. **Ownership**: User hanya boleh melihat/membatalkan order miliknya sendiri.
5. **Status transition**: Semua perubahan status (termasuk dari webhook) tetap wajib melewati state machine.

---

## 16. Test Scenario

| No | Skenario | Yang diharapkan |
| -- | -------- | --------------- |
| 1 | User checkout | Order `awaiting_payment`, payment transaction `pending`, stok berkurang. |
| 2 | User klik Pay Now / checkout | Snap popup muncul dengan token dari Midtrans. |
| 3 | Midtrans kirim notifikasi `settlement` | Order berubah jadi `paid`, history tercatat. |
| 4 | Midtrans kirim notifikasi `expire` | Order berubah jadi `payment_failed`, stok kembali. |
| 5 | User cancel order `awaiting_payment` | Order `cancelled`, stok kembali. |
| 6 | Admin ubah status `paid` → `processing` | Error 400, admin tidak boleh ubah `paid`. |
| 7 | Admin ubah `pending` → `processing` | Berhasil. |
| 8 | User akses payment order orang lain | Error 404. |
| 9 | Notifikasi Midtrans dengan signature invalid | Error 400. |
| 10 | User konfirmasi `Received` saat `shipped` | Status menjadi `delivered`. |

---

## 17. Ringkasan

- Pembayaran menggunakan **Midtrans Snap** dengan popup/redirect.
- Order baru dibuat dengan status `awaiting_payment`.
- Status pembayaran di-update otomatis melalui **webhook notifikasi Midtrans**.
- Setelah `paid`, order otomatis berubah ke `pending` dan masuk ke antrian admin.
- Tabel `payment_transaction` menyimpan seluruh metadata pembayaran untuk audit.
- Stok dikurangi saat checkout; dikembalikan saat `payment_failed`, `cancelled`, atau `refunded`.
- Semua perubahan status tetap tercatat di `order_status_history`.

---

## Next Steps (Phase 5 — Optional)

- Notifikasi email setelah pembayaran berhasil / order dikirim.
- Fitur review & rating produk setelah order `delivered`.
- Admin dashboard dengan ringkasan penjualan dan pembayaran.
- Retry payment untuk order `awaiting_payment` dengan token baru (bukan token lama).
