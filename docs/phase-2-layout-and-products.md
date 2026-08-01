# Phase 2 — Layout Admin/User & Fitur Product

> Tujuan sesi ini:
>
> 1. Memisahkan layout **user** (header + konten publik) dan layout **admin** (sidebar full).
> 2. Membuat fitur **Product** dan **Product Detail** end-to-end: database → API → auth → UI.
> 3. Memahami konsep **Public API** vs **Private API** dan bagaimana melindungi endpoint.
> 4. Menyiapkan seed data agar halaman user & admin langsung punya data untuk ditampilkan.

---

## 0. Mindset: Alur Membangun Satu Fitur

Setiap fitur di project ini dibangun dengan urutan yang sama. Jangan loncat-loncat.

```
Design Database  →  Generate Migration  →  Buat API  →  Amankan API  →  Buat UI
```

Kenapa urutannya begini?

1. **Database** adalah sumber kebenaran. Tanpa schema, tidak ada yang bisa disimpan/ditampilkan.
2. **Migration** memastikan schema di lokal dan di production (Neon) sama.
3. **API** adalah jembatan antara database dan UI. UI tidak boleh langsung query DB dari browser.
4. **Auth** dipasang di API supaya data sensitif tidak bisa diakses sembarang orang.
5. **UI** dibuat terakhir karena UI hanya mengonsumsi API yang sudah aman.

---

## 1. Public API vs Private API

| Jenis           | Siapa yang akses                                 | Contoh endpoint                                  | Perlindungan               |
| --------------- | ------------------------------------------------ | ------------------------------------------------ | -------------------------- |
| **Public API**  | Siapa saja, termasuk pengunjung yang belum login | `GET /api/products`, `GET /api/products/:slug`   | Tidak perlu auth           |
| **Private API** | User yang sudah login                            | `GET /api/cart`, `POST /api/checkout`            | Wajib session              |
| **Admin API**   | User dengan role `admin`                         | `POST /api/products`, `DELETE /api/products/:id` | Wajib session + role admin |

### 1.1 Perbedaan di level code

Perbedaan utama hanya di **satu baris di awal handler**.

**Public API** — tidak pernah memanggil auth guard:

```ts
export default defineEventHandler(async (event) => {
  // Tidak ada pemeriksaan session
  const products = await db.select().from(productList);
  return { data: products };
});
```

**Private API** — wajib login:

```ts
export default defineEventHandler(async (event) => {
  const session = await requireSession(event); // ← login required
  const cart = await getCart(session.user.id);
  return { data: cart };
});
```

**Admin API** — wajib login dan role admin:

```ts
export default defineEventHandler(async (event) => {
  await requireAdmin(event); // ← admin required
  const products = await db.select().from(productList);
  return { data: products };
});
```

### 1.2 Jawaban singkat untuk pertanyaan: "Public API cukup hapus requireAdmin saja?"

**Ya, kurang lebih begitu.** Untuk menjadikan endpoint public, kamu cukup:

1. **Tidak memanggil** `requireSession` atau `requireAdmin`.
2. **Tidak membaca** data milik user tertentu (tidak pakai `session.user.id`).
3. **Hanya membaca** data yang memang boleh dilihat siapa saja.

Jadi public API bukan berarti "hapus semua validasi", tapi "tidak ada validasi identitas user".

### 1.3 Kenapa proteksi harus di server?

- **Server layer** adalah garis pertahanan utama. Middleware di frontend bisa diakali, tapi server tidak bisa bohong.
- `definePageMeta({ middleware: 'auth-admin' })` hanya menyembunyikan halaman di browser. Itu UX, bukan keamanan.
- Endpoint `POST /api/products` tanpa `requireAdmin` bisa dipanggil langsung via curl/Postman meskipun halaman admin tidak bisa dibuka.

---

## 2. Database Design — Product & Product Type

### 2.1 Kenapa butuh dua tabel?

- `product_type` = kategori produk (misal: Electronics, Fashion, Food).
- `product_list` = daftar produk yang dijual.

Memisahkan kategori ke tabel sendiri membuatnya bisa dikelola sendiri (CRUD kategori) dan memudahkan filter produk.

### 2.2 Schema (Drizzle ORM)

Buka `server/database/schema.ts`.

Tambahkan import `integer`:

```ts
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  integer,
} from "drizzle-orm/pg-core";
```

Tambahkan tabel baru di bawah tabel Better Auth:

```ts
export const productType = pgTable("product_type", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const productList = pgTable("product_list", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  price: integer("price").notNull(),
  stock: integer("stock").notNull().default(0),
  imageUrl: text("image_url"),
  productTypeId: text("product_type_id").references(() => productType.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
```

### 2.3 Penjelasan kolom penting

| Kolom           | Tipe          | Fungsi                                                                           |
| --------------- | ------------- | -------------------------------------------------------------------------------- |
| `id`            | `text` UUID   | Primary key. Gunakan `crypto.randomUUID()` supaya aman untuk public URL.         |
| `slug`          | `text` unique | Untuk URL yang SEO-friendly: `/product/nike-air-max`.                            |
| `price`         | `integer`     | Simpan dalam satuan terkecil (rupiah tanpa koma), misal `Rp 150.000` = `150000`. |
| `stock`         | `integer`     | Jumlah stok tersedia. Nanti bisa dipakai untuk disable tombol beli.              |
| `imageUrl`      | `text`        | URL gambar produk. Bisa dari Unsplash, Cloudinary, atau upload sendiri.          |
| `productTypeId` | `text` FK     | Relasi ke `product_type.id`. `                                                   |

### 2.4 Relasi (Relations)

Tambahkan relasi agar Drizzle bisa melakukan query join dengan lebih mudah:

```ts
export const productTypeRelations = relations(productType, ({ many }) => ({
  products: many(productList),
}));

export const productListRelations = relations(productList, ({ one }) => ({
  productType: one(productType, {
    fields: [productList.productTypeId],
    references: [productType.id],
  }),
}));
```

### 2.5 Generate migration

Setelah schema selesai, jalankan:

```bash
pnpm db:generate
```

Perintah ini akan membuat file SQL baru di `server/database/migrations/`.

Kemudian apply ke database:

```bash
pnpm db:migrate
```

> Tips: selalu cek file `.sql` yang di-generate sebelum di-apply. Pastikan kolom, tipe data, dan foreign key sesuai harapan.

---

## 3. Pisahkan Layout Admin vs User

### 3.1 Cara kerja layout di Nuxt

Nuxt akan otomatis menggunakan layout dari `app/layouts/default.vue` untuk semua page. Kalau mau layout berbeda, gunakan `definePageMeta({ layout: 'admin' })` di page yang bersangkutan.

Struktur yang akan kita buat:

```
app/
├── layouts/
│   ├── default.vue      # Layout user: header + kontainer + footer
│   └── admin.vue        # Layout admin: sidebar full + main content
├── app.vue              # Hanya wrapper UApp + NuxtLayout
```

### 3.2 Ubah `app/app.vue`

Saat ini `app/app.vue` berisi header, main, footer, dan `<NuxtPage />` langsung. Ubah menjadi ringkas seperti ini:

```vue
<script setup>
import { authClient } from "~~/lib/auth-client";

useHead({
  meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
  link: [{ rel: "icon", href: "/favicon.ico" }],
  htmlAttrs: { lang: "en" },
});

useSeoMeta({
  title: "MiniShop",
  description: "A mini e-commerce built with Nuxt 4",
});

const session = authClient.useSession();

async function handleLogout() {
  await authClient.signOut();
  navigateTo("/login");
}
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

> `<UApp>` wajib ada sekali di root karena dia menyediakan theming, toast, dan modal untuk seluruh Nuxt UI.

### 3.3 Layout User — `app/layouts/default.vue`

Pindahkan header, main, dan footer dari `app.vue` ke sini. Semua page user (home, product, product detail, profile, cart) akan otomatis pakai layout ini.

```vue
<script setup>
import { authClient } from "~~/lib/auth-client";

const session = authClient.useSession();

async function handleLogout() {
  await authClient.signOut();
  navigateTo("/login");
}
</script>

<template>
  <div>
    <UHeader>
      <template #title>
        <NuxtLink to="/" class="font-bold text-lg">MiniShop</NuxtLink>
      </template>

      <template #right>
        <UButton icon="i-lucide-shopping-cart" variant="ghost" to="/cart" />

        <template v-if="session.data">
          <UButton
            v-if="session.data.user.role === 'admin'"
            label="Admin"
            to="/admin"
            variant="ghost"
            color="error"
          />
          <UButton label="Profile" to="/profile" variant="ghost" />
          <UButton label="Logout" @click="handleLogout" variant="outline" />
        </template>
        <template v-else>
          <UButton label="Login" to="/login" variant="ghost" />
          <UButton label="Register" to="/register" variant="outline" />
        </template>
      </template>
    </UHeader>

    <UMain>
      <UContainer>
        <slot />
      </UContainer>
    </UMain>

    <USeparator icon="i-simple-icons-nuxtdotjs" />

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          MiniShop &copy; {{ new Date().getFullYear() }}
        </p>
      </template>
    </UFooter>
  </div>
</template>
```

### 3.4 Layout Admin — `app/layouts/admin.vue`

Di Nuxt UI v4 sudah tersedia komponen khusus dashboard: `UDashboardGroup`, `UDashboardSidebar`, `UDashboardPanel`, `UDashboardNavbar`.

Buat layout admin dengan sidebar navigasi:

```vue
<script setup lang="ts">
import { authClient } from "~~/lib/auth-client";

const session = authClient.useSession();

const links = [
  {
    label: "Dashboard",
    icon: "i-lucide-layout-dashboard",
    to: "/admin",
  },
  {
    label: "Products",
    icon: "i-lucide-package",
    to: "/admin/products",
  },
  {
    label: "Product Types",
    icon: "i-lucide-tags",
    to: "/admin/product-types",
  },
];

async function handleLogout() {
  await authClient.signOut();
  navigateTo("/login");
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar>
      <template #header>
        <NuxtLink to="/admin" class="font-bold text-lg"
          >MiniShop Admin</NuxtLink
        >
      </template>

      <UNavigationMenu orientation="vertical" :items="links" />

      <template #footer>
        <div class="space-y-2 p-2">
          <div v-if="session.data" class="text-sm">
            <p class="font-medium">{{ session.data.user.name }}</p>
            <p class="text-muted">{{ session.data.user.email }}</p>
          </div>
          <UButton
            label="Back to Shop"
            icon="i-lucide-arrow-left"
            variant="ghost"
            color="neutral"
            to="/"
            block
          />
          <UButton
            label="Logout"
            icon="i-lucide-log-out"
            color="error"
            variant="ghost"
            block
            @click="handleLogout"
          />
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <UDashboardNavbar title="Admin" />
      <div class="p-6">
        <slot />
      </div>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
```

### 3.5 Terapkan layout admin di page admin

Semua page di bawah `app/pages/admin/` harus pakai layout admin. Tambahkan di setiap file:

```vue
<script setup>
definePageMeta({
  layout: "admin",
  middleware: "auth-admin",
});
</script>
```

Contoh untuk `app/pages/admin/index.vue`:

```vue
<script setup>
definePageMeta({
  layout: "admin",
  middleware: "auth-admin",
});
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold">Admin Dashboard</h1>
    <p class="text-muted mt-2">Selamat datang di panel admin.</p>
  </div>
</template>
```

---

## 4. Auth Guard di Server

Sebelum membuat API product, buat dulu helper yang menangani session di server. Helper ini akan dipakai berulang kali.

### 4.1 File baru: `server/utils/auth-guard.ts`

```ts
import { auth } from "./auth";
import type { H3Event } from "h3";

export interface UserWithRole {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  image?: string | null;
}

export interface SessionWithRole {
  session: {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
  };
  user: UserWithRole;
}

export async function getSession(
  event: H3Event,
): Promise<SessionWithRole | null> {
  try {
    const session = await auth.api.getSession({ headers: event.headers });
    return session as SessionWithRole;
  } catch {
    return null;
  }
}

export async function requireSession(event: H3Event) {
  const session = await getSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
  return session;
}

export async function requireAdmin(event: H3Event) {
  const session = await requireSession(event);
  if (session.user.role !== "admin") {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  return session;
}
```

### 4.2 Penjelasan: Buat Apa & Dipakai Dimana

**Buat apa?**

Auth guard adalah helper di **layer server** yang memastikan endpoint API tidak bisa diakses sembarangan. Ada tiga level perlindungan:

| Fungsi           | Apa yang dilakukan                              | Gunanya untuk siapa                      |
| ---------------- | ----------------------------------------------- | ---------------------------------------- |
| `getSession`     | Membaca cookie/session dari request             | Mendapatkan data user yang sedang login  |
| `requireSession` | Memastikan user sudah login                     | Melindungi endpoint private (cart, checkout, profile) |
| `requireAdmin`   | Memastikan user sudah login **dan** role admin  | Melindungi endpoint admin (CRUD product, product type, order management) |

Kenapa harus dipisah jadi 3 fungsi?
- `getSession` bersifat **pasif** — cuma membaca. Kalau tidak login, return `null`. Dipakai kalau endpoint bisa diakses publik tapi butuh tahu siapa yang akses (misal: cek apakah user sudah login di header).
- `requireSession` bersifat **aktif** — langsung lempar error `401` kalau tidak login. Dipakai di endpoint yang wajib login.
- `requireAdmin` bersifat **aktif + spesifik** — lempar error `403` kalau bukan admin. Dipakai di endpoint yang hanya boleh diakses admin.

**Dipakai dimana?**

Auth guard dipakai di **setiap API endpoint yang tidak public** di folder `server/api/`:

1. **Private API (user biasa)** — endpoint yang hanya boleh diakses user yang sudah login:
   - `GET /api/cart` — ambil cart milik user yang login
   - `POST /api/checkout` — proses checkout
   - `GET /api/orders` — lihat order history
   - Di setiap handler-nya: `const session = await requireSession(event)`

2. **Admin API** — endpoint yang hanya boleh diakses role `admin`:
   - `POST /api/products` — tambah produk baru
   - `PUT /api/products/:id` — edit produk
   - `DELETE /api/products/:id` — hapus produk
   - `POST /api/product-types` — tambah kategori
   - Di setiap handler-nya: `await requireAdmin(event)`

3. **Public API** — tidak pakai auth guard sama sekali:
   - `GET /api/products` — list produk (siapa saja boleh lihat)
   - `GET /api/products/:slug` — detail produk
   - `GET /api/product-types` — daftar kategori untuk filter

> **Penting:** Auth guard di server ini adalah **garis pertahanan utama**. Meskipun halaman admin sudah diproteksi dengan middleware frontend (`middleware: 'auth-admin'`), proteksi server wajib tetap ada karena API bisa dipanggil langsung via curl/Postman tanpa melalui UI.

**HTTP Status yang dikembalikan:**
- `401 Unauthorized` = belum login (bukan user).
- `403 Forbidden` = sudah login tapi tidak punya izin (bukan admin).

---

## 5. Public API — Product List & Product Detail

Public API boleh diakses siapa saja. Kita buat dua endpoint:

- `GET /api/products` — list produk dengan filter & pagination.
- `GET /api/products/:slug` — detail produk.

### 5.1 Helper slug

Sebelum masuk API, kita butuh fungsi untuk mengubah nama produk menjadi slug URL.

Buat file `server/utils/slug.ts`:

```ts
export function generateSlug(input: string): string {
  return input
    .toLowerCase() // Semua huruf jadi kecil
    .trim() // Hapus spasi di awal/akhir
    .replace(/[^\w\s-]/g, "") // Hapus karakter selain huruf, angka, spasi, dan strip
    .replace(/\s+/g, "-"); // Ganti spasi dengan strip
}

export async function createUniqueSlug(
  input: string,
  existsFn: (slug: string) => Promise<boolean>,
): Promise<string> {
  let slug = generateSlug(input);
  let counter = 1;

  // Kalau slug sudah dipakai, tambahkan angka suffix: nama-produk-1, nama-produk-2, ...
  while (await existsFn(slug)) {
    slug = `${generateSlug(input)}-${counter}`;
    counter++;
  }

  return slug;
}
```

Kenapa dibuat di `server/utils/`? Karena akan dipakai oleh beberapa endpoint admin (create & update product).

---

### 5.2 Endpoint list produk

File: `server/api/products/index.get.ts`

```ts
import { db } from "~~/server/database";
import { productList, productType } from "~~/server/database/schema";
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
  if (q) conditions.push(ilike(productList.name, `%${q}%`));
  if (category) conditions.push(eq(productType.slug, category));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const products = await db
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
    .where(whereClause)
    .limit(limit)
    .offset(offset)
    .orderBy(productList.createdAt);

  const [totalResult] = await db
    .select({ total: count() })
    .from(productList)
    .leftJoin(productType, eq(productList.productTypeId, productType.id))
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
```

#### Penjelasan baris per baris

**Import dan schema validasi**

```ts
import { ilike, eq, and, count } from "drizzle-orm";
import { z } from "zod";
```

- `ilike` = case-insensitive LIKE untuk search.
- `eq` = equals, untuk filter kategori.
- `and` = menggabungkan beberapa kondisi WHERE.
- `count` = menghitung total row.
- `z` = Zod untuk validasi query parameter.

**Schema query**

```ts
const querySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(12),
});
```

- `z.coerce.number()` = otomatis mengubah string `"2"` dari URL menjadi number `2`.
- `.default(1)` dan `.default(12)` = kalau parameter tidak dikirim, pakai nilai default.
- `.max(100)` = membatasi jumlah item per halaman supaya tidak ada yang minta 10.000 produk sekaligus.

**Handler public**

```ts
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const { q, category, page, limit } = querySchema.parse(query);
```

- `getQuery(event)` = mengambil semua query string dari URL, misal `?q=nike&page=2`.
- `querySchema.parse(query)` = memastikan query valid. Kalau tidak valid, Zod akan otomatis lempar error 400.

> **Perhatikan: di sini tidak ada `requireSession` atau `requireAdmin`.** Itulah yang membuat endpoint ini public.

**Pagination offset**

```ts
const offset = (page - 1) * limit;
```

- Halaman 1 → offset 0
- Halaman 2 → offset 12 (kalau limit 12)

**Filter dinamis**

```ts
const conditions = [];
if (q) conditions.push(ilike(productList.name, `%${q}%`));
if (category) conditions.push(eq(productType.slug, category));

const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
```

- Kita hanya menambahkan kondisi ke array kalau parameter ada.
- Kalau tidak ada filter sama sekali, `whereClause` jadi `undefined` dan query mengembalikan semua produk.

**Query produk**

```ts
const products = await db
  .select({ ... })
  .from(productList)
  .leftJoin(productType, eq(productList.productTypeId, productType.id))
  .where(whereClause)
  .limit(limit)
  .offset(offset)
  .orderBy(productList.createdAt);
```

- `.select({ ... })` = kita pilih kolom apa saja yang dikembalikan, termasuk data kategori dalam bentuk nested object.
- `.leftJoin(...)` = menggabungkan tabel `product_list` dengan `product_type`. `leftJoin` dipakai karena ada produk yang mungkin belum punya kategori.
- `.where(whereClause)` = menerapkan filter.
- `.limit(limit).offset(offset)` = pagination.
- `.orderBy(productList.createdAt)` = urutan produk terbaru di bawah/atas (default ascending).

**Query total count**

```ts
const [totalResult] = await db
  .select({ total: count() })
  .from(productList)
  .leftJoin(productType, eq(productList.productTypeId, productType.id))
  .where(whereClause);
```

- Count dihitung dengan WHERE yang sama supaya total halaman sesuai dengan filter aktif.
- Hasilnya array dengan satu object, makanya di-destructure dengan `[totalResult]`.

**Response**

```ts
return {
  data: products,
  meta: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  },
};
```

- Response dibungkus object dengan `data` dan `meta`. Ini memudahkan UI untuk menampilkan list dan pagination.

---

### 5.3 Endpoint detail produk

File: `server/api/products/[slug].get.ts`

```ts
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
```

#### Penjelasan detail

**Ambil parameter dari URL**

```ts
const slug = getRouterParam(event, "slug");
```

- Nama file `[slug].get.ts` membuat route parameter bernama `slug`.
- `getRouterParam` mengambil nilai dari URL, misal `/api/products/nike-air-max` → `slug = "nike-air-max"`.

**Validasi parameter**

```ts
if (!slug) {
  throw createError({ statusCode: 400, statusMessage: "Slug is required" });
}
```

- Kalau slug kosong atau tidak ada, lempar error 400 Bad Request.
- `createError` adalah helper bawaan H3/Nuxt untuk membuat HTTP error.

**Query single product**

```ts
const [product] = await db
  .select({ ... })
  .from(productList)
  .leftJoin(productType, eq(productList.productTypeId, productType.id))
  .where(eq(productList.slug, slug))
  .limit(1);
```

- `.where(eq(productList.slug, slug))` = filter berdasarkan slug, bukan id.
- `.limit(1)` = karena slug unique, hasilnya maksimal 1.
- `[product]` = destructuring pertama dari array hasil query.

**Handle product tidak ditemukan**

```ts
if (!product) {
  throw createError({ statusCode: 404, statusMessage: "Product not found" });
}
```

- Kalau query tidak menemukan data, lempar error 404 Not Found.

---

### 5.4 Public API vs Private API

| Aspek                  | Public API                   | Admin API                                   |
| ---------------------- | ---------------------------- | ------------------------------------------- |
| Auth guard             | Tidak dipanggil              | `await requireAdmin(event)`                 |
| Siapa akses            | Semua orang                  | Hanya admin                                 |
| Operasi                | Biasanya hanya READ (GET)    | CREATE/UPDATE/DELETE (POST/PUT/DELETE)      |
| Data yang dikembalikan | Hanya data yang boleh publik | Bisa lebih lengkap, termasuk internal field |

Jadi kalau kamu sudah punya endpoint admin, cara menjadikannya public bukan dengan "menghapus" requireAdmin lalu membiarkan semua operasi bebas. Tapi:

1. Buat endpoint terpisah khusus read-only.
2. Pastikan tidak ada `requireSession` atau `requireAdmin`.
3. Pastikan query hanya mengembalikan data yang boleh dilihat publik.

### 5.5 Catatan penting Public API

- `leftJoin` dipakai karena ada produk yang mungkin belum punya kategori.
- Response selalu dibungkus object `{ data: ..., meta: ... }` supaya konsisten dan mudah diextend.
- `q` untuk search, `category` untuk filter, `page` & `limit` untuk pagination.
- Public API tetap bisa di-DDoS. Untuk production pertimbangkan rate limiting di layer server/deployment.

---

## 6. Private Admin API — CRUD Product

Endpoint admin wajib diproteksi. Setiap handler dimulai dengan `await requireAdmin(event)`.

Perbedaan utama dengan public API hanya di **baris pertama handler**.

---

### 6.1 Create product

File: `server/api/products/index.post.ts`

```ts
import { db } from "~~/server/database";
import { productList, productType } from "~~/server/database/schema";
import { requireAdmin } from "~~/server/utils/auth-guard";
import { createUniqueSlug } from "~~/server/utils/slug";
import { eq } from "drizzle-orm";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.number().int().min(0, "Price must be positive"),
  stock: z.number().int().min(0, "Stock must be positive").default(0),
  imageUrl: z.string().url().optional().or(z.literal("")),
  productTypeId: z.string().uuid().optional(),
});

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const body = await readBody(event);
  const parsed = createSchema.parse(body);

  if (parsed.productTypeId) {
    const [existingType] = await db
      .select({ id: productType.id })
      .from(productType)
      .where(eq(productType.id, parsed.productTypeId))
      .limit(1);

    if (!existingType) {
      throw createError({
        statusCode: 400,
        statusMessage: "Product type not found",
      });
    }
  }

  const slug = await createUniqueSlug(parsed.name, async (s) => {
    const [existing] = await db
      .select({ id: productList.id })
      .from(productList)
      .where(eq(productList.slug, s))
      .limit(1);
    return !!existing;
  });

  const [product] = await db
    .insert(productList)
    .values({
      name: parsed.name,
      slug,
      description: parsed.description,
      price: parsed.price,
      stock: parsed.stock,
      imageUrl: parsed.imageUrl || null,
      productTypeId: parsed.productTypeId || null,
    })
    .returning();

  return { data: product };
});
```

#### Penjelasan detail

**Schema validasi body**

```ts
const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.number().int().min(0, "Price must be positive"),
  stock: z.number().int().min(0, "Stock must be positive").default(0),
  imageUrl: z.string().url().optional().or(z.literal("")),
  productTypeId: z.string().uuid().optional(),
});
```

- `name` wajib string tidak kosong.
- `price` dan `stock` harus integer ≥ 0.
- `imageUrl` boleh kosong string atau URL valid.
- `productTypeId` harus format UUID kalau dikirim.
- Kalau ada field yang tidak valid, Zod otomatis reject dengan status 400.

**Proteksi admin**

```ts
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
```

- Baris pertama selalu memeriksa session dan role.
- Kalau tidak login → 401.
- Kalau login tapi bukan admin → 403.
- Kalau bukan admin, semua kode di bawahnya tidak akan dieksekusi.

**Baca body request**

```ts
const body = await readBody(event);
const parsed = createSchema.parse(body);
```

- `readBody(event)` = mengambil JSON dari request body.
- `createSchema.parse(body)` = memastikan body sesuai schema.

**Validasi product type**

```ts
if (parsed.productTypeId) {
  const [existingType] = await db
    .select({ id: productType.id })
    .from(productType)
    .where(eq(productType.id, parsed.productTypeId))
    .limit(1);

  if (!existingType) {
    throw createError({
      statusCode: 400,
      statusMessage: "Product type not found",
    });
  }
}
```

- Sebelum insert, pastikan `productTypeId` yang dikirim benar-benar ada di tabel `product_type`.
- Ini mencegah foreign key error yang tidak jelas dan memberikan pesan error yang bersih.

**Generate slug unik**

```ts
const slug = await createUniqueSlug(parsed.name, async (s) => {
  const [existing] = await db
    .select({ id: productList.id })
    .from(productList)
    .where(eq(productList.slug, s))
    .limit(1);
  return !!existing;
});
```

- Fungsi `createUniqueSlug` menerima callback yang mengecek apakah slug sudah ada.
- `!!existing` = mengubah object menjadi boolean. Kalau `existing` ada → `true`.

**Insert ke database**

```ts
const [product] = await db
  .insert(productList)
  .values({
    name: parsed.name,
    slug,
    description: parsed.description,
    price: parsed.price,
    stock: parsed.stock,
    imageUrl: parsed.imageUrl || null,
    productTypeId: parsed.productTypeId || null,
  })
  .returning();
```

- `.values({ ... })` = data yang mau diinsert.
- `imageUrl || null` = kalau kosong string, simpan sebagai NULL.
- `productTypeId || null` = kalau tidak dikirim, simpan sebagai NULL.
- `.returning()` = mengembalikan row yang baru saja diinsert.

---

### 6.2 Update product

File: `server/api/products/[id].put.ts`

```ts
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
```

#### Penjelasan detail

**Update schema pakai `.optional()`**

```ts
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  ...
});
```

- Semua field bersifat opsional. UI boleh kirim hanya field yang diubah.
- Kalau field tidak dikirim, nilainya `undefined` dan tidak akan mengoverwrite data lama.

**Cari produk yang mau diupdate**

```ts
const [existing] = await db
  .select()
  .from(productList)
  .where(eq(productList.id, id))
  .limit(1);

if (!existing) {
  throw createError({ statusCode: 404, statusMessage: "Product not found" });
}
```

- Pastikan ID produk benar-benar ada sebelum update.
- Kalau tidak ada, lempar 404.

**Slug unik dengan pengecualian produk sendiri**

```ts
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
```

- Slug baru hanya digenerate kalau `name` berubah.
- Saat cek duplikat, produk yang sedang diupdate (`ne(productList.id, id)`) dikecualikan. Kalau tidak, slug lama milik produk ini sendiri bisa dianggap duplikat.
- `and(...)` = kedua kondisi harus terpenuhi: slug sama **DAN** id-nya beda.

**Update hanya field yang dikirim**

```ts
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
```

- Drizzle akan mengabaikan field `undefined` saat update.
- `imageUrl === "" ? null : parsed.imageUrl` = kalau user menghapus URL, simpan NULL.

---

### 6.3 Delete product

File: `server/api/products/[id].delete.ts`

```ts
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
```

#### Penjelasan detail

- Sama seperti update, pertama cek produk ada atau tidak.
- Kalau tidak ada, 404.
- Kalau ada, jalankan `db.delete()`.
- Response hanya pesan sukses, tidak perlu mengembalikan data yang dihapus.

> **Catatan:** Di production, pertimbangkan soft delete (tambah kolom `deletedAt`) kalau produk sudah pernah masuk order. Kalau hard delete, data order history bisa kehilangan referensi produk.

### 6.4 API Product Type (admin)

Untuk dropdown kategori di form product dan untuk filter di user, kita butuh endpoint product type. Minimal:

- `GET /api/product-types` — public, untuk filter user.
- `POST /api/product-types` — admin create.
- `PUT /api/product-types/:id` — admin update.
- `DELETE /api/product-types/:id` — admin delete.

Strukturnya mirip CRUD product, hanya saja tabelnya `productType`. Bisa dibuat di folder `server/api/product-types/`.

---

## 7. UI User — Product List & Product Detail

### 7.1 Ubah route detail dari `[id]` ke `[slug]`

PRD awal menggunakan `slug`. Agar URL lebih SEO-friendly, ubah:

- `app/pages/product/[id].vue` → `app/pages/product/[slug].vue`

Dengan begini, URL akan menjadi `/product/nike-air-max`.

### 7.2 Product list — `app/pages/product/index.vue`

```vue
<script setup lang="ts">
const route = useRoute();
const router = useRouter();

const page = ref(Number(route.query.page) || 1);
const search = ref(String(route.query.q || ""));
const selectedCategory = ref(String(route.query.category || ""));

const { data, refresh, pending } = await useFetch("/api/products", {
  query: {
    page,
    q: search,
    category: selectedCategory,
    limit: 12,
  },
});

const { data: categories } = await useFetch("/api/product-types");

function applyFilter() {
  page.value = 1;
  router.push({
    query: {
      page: page.value,
      q: search.value || undefined,
      category: selectedCategory.value || undefined,
    },
  });
}
</script>

<template>
  <div class="py-8 space-y-6">
    <h1 class="text-2xl font-bold">Products</h1>

    <!-- Filter -->
    <div class="flex flex-col sm:flex-row gap-4">
      <UInput
        v-model="search"
        placeholder="Search product..."
        icon="i-lucide-search"
        class="sm:w-64"
        @keyup.enter="applyFilter"
      />
      <USelect
        v-model="selectedCategory"
        :items="[
          { label: 'All Categories', value: '' },
          ...(categories?.data || []).map((c) => ({
            label: c.name,
            value: c.slug,
          })),
        ]"
        class="sm:w-48"
        @change="applyFilter"
      />
      <UButton label="Search" @click="applyFilter" />
    </div>

    <!-- Grid -->
    <div v-if="pending" class="text-center py-10">Loading...</div>

    <div
      v-else-if="data?.data?.length"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
    >
      <NuxtLink
        v-for="product in data.data"
        :key="product.id"
        :to="`/product/${product.slug}`"
        class="group"
      >
        <UCard>
          <img
            :src="
              product.imageUrl || 'https://placehold.co/400x300?text=No+Image'
            "
            alt=""
            class="w-full h-48 object-cover rounded-md mb-4"
          />
          <h2 class="font-semibold group-hover:text-primary transition-colors">
            {{ product.name }}
          </h2>
          <p class="text-sm text-muted line-clamp-2">
            {{ product.description }}
          </p>
          <p class="font-bold mt-2">
            Rp {{ product.price.toLocaleString("id-ID") }}
          </p>
        </UCard>
      </NuxtLink>
    </div>

    <div v-else class="text-center py-10 text-muted">No products found.</div>

    <!-- Pagination -->
    <div
      v-if="data?.meta?.totalPages > 1"
      class="flex justify-center gap-2 pt-6"
    >
      <UButton
        label="Previous"
        variant="ghost"
        :disabled="page <= 1"
        @click="
          page--;
          applyFilter();
        "
      />
      <span class="self-center text-sm text-muted">
        Page {{ page }} of {{ data.meta.totalPages }}
      </span>
      <UButton
        label="Next"
        variant="ghost"
        :disabled="page >= data.meta.totalPages"
        @click="
          page++;
          applyFilter();
        "
      />
    </div>
  </div>
</template>
```

### 7.3 Product detail — `app/pages/product/[slug].vue`

```vue
<script setup lang="ts">
const route = useRoute();
const slug = route.params.slug as string;

const { data: response } = await useFetch(`/api/products/${slug}`);
const product = computed(() => response.value?.data);

const qty = ref(1);

function addToCart() {
  // Sementara alert saja; cart akan dibuat di phase berikutnya.
  alert(`Added ${qty.value} of ${product.value?.name} to cart`);
}
</script>

<template>
  <div v-if="product" class="py-8">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <img
        :src="product.imageUrl || 'https://placehold.co/600x400?text=No+Image'"
        alt=""
        class="w-full rounded-lg object-cover"
      />

      <div class="space-y-4">
        <UBadge
          v-if="product.productType"
          :label="product.productType.name"
          color="primary"
        />
        <h1 class="text-3xl font-bold">{{ product.name }}</h1>
        <p class="text-2xl font-semibold">
          Rp {{ product.price.toLocaleString("id-ID") }}
        </p>
        <p class="text-muted">{{ product.description }}</p>

        <div class="flex items-center gap-4">
          <UInputNumber v-model="qty" :min="1" :max="product.stock" />
          <UButton
            label="Add to Cart"
            icon="i-lucide-shopping-cart"
            :disabled="product.stock < 1"
            @click="addToCart"
          />
        </div>

        <p class="text-sm text-muted">Stock: {{ product.stock }}</p>
      </div>
    </div>
  </div>

  <div v-else class="py-10 text-center text-muted">Product not found.</div>
</template>
```

---

## 8. UI Admin — Product Management

### 8.1 Halaman admin product list

File baru: `app/pages/admin/products/index.vue`

```vue
<script setup lang="ts">
definePageMeta({
  layout: "admin",
  middleware: "auth-admin",
});

const toast = useToast();
const { data, refresh } = await useFetch("/api/products", {
  query: { limit: 100 },
});

async function deleteProduct(id: string) {
  if (!confirm("Are you sure?")) return;

  await $fetch(`/api/products/${id}`, { method: "DELETE" });
  toast.add({ title: "Product deleted", color: "success" });
  refresh();
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Products</h1>
      <UButton label="Add Product" to="/admin/products/new" />
    </div>

    <UTable
      :rows="data?.data || []"
      :columns="[
        { key: 'name', label: 'Name' },
        { key: 'price', label: 'Price' },
        { key: 'stock', label: 'Stock' },
        { key: 'actions', label: 'Actions' },
      ]"
    >
      <template #price-data="{ row }">
        Rp {{ row.price.toLocaleString("id-ID") }}
      </template>

      <template #actions-data="{ row }">
        <div class="flex gap-2">
          <UButton
            icon="i-lucide-pencil"
            variant="ghost"
            :to="`/admin/products/${row.id}/edit`"
          />
          <UButton
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            @click="deleteProduct(row.id)"
          />
        </div>
      </template>
    </UTable>
  </div>
</template>
```

### 8.2 Halaman create/edit product

File baru:

- `app/pages/admin/products/new.vue`
- `app/pages/admin/products/[id]/edit.vue`

Gunakan `UForm`, `UInput`, `UInputNumber`, `UTextarea`, `USelect`, dan `UButton` dari Nuxt UI.

Flow form:

1. Ambil daftar product type dari `GET /api/product-types`.
2. Saat submit, kirim ke `POST /api/products` atau `PUT /api/products/:id`.
3. Setelah sukses, `navigateTo('/admin/products')`.

Contoh form skeleton:

```vue
<script setup lang="ts">
definePageMeta({
  layout: "admin",
  middleware: "auth-admin",
});

const route = useRoute();
const isEdit = computed(() => route.name !== "admin-products-new");
const productId = route.params.id as string;

const { data: categories } = await useFetch("/api/product-types");
const { data: product } = await useFetch(`/api/products/${productId}`, {
  immediate: isEdit.value,
});

const state = reactive({
  name: product.value?.data?.name || "",
  description: product.value?.data?.description || "",
  price: product.value?.data?.price || 0,
  stock: product.value?.data?.stock || 0,
  imageUrl: product.value?.data?.imageUrl || "",
  productTypeId: product.value?.data?.productType?.id || "",
});

async function onSubmit() {
  const body = { ...state };

  if (isEdit.value) {
    await $fetch(`/api/products/${productId}`, { method: "PUT", body });
  } else {
    await $fetch("/api/products", { method: "POST", body });
  }

  navigateTo("/admin/products");
}
</script>

<template>
  <UCard class="max-w-2xl">
    <template #header>
      <h1 class="text-xl font-bold">
        {{ isEdit ? "Edit" : "Create" }} Product
      </h1>
    </template>

    <UForm :state="state" @submit="onSubmit" class="space-y-4">
      <UFormField label="Name" name="name">
        <UInput v-model="state.name" class="w-full" />
      </UFormField>

      <UFormField label="Description" name="description">
        <UTextarea v-model="state.description" class="w-full" />
      </UFormField>

      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Price" name="price">
          <UInputNumber v-model="state.price" :min="0" class="w-full" />
        </UFormField>

        <UFormField label="Stock" name="stock">
          <UInputNumber v-model="state.stock" :min="0" class="w-full" />
        </UFormField>
      </div>

      <UFormField label="Image URL" name="imageUrl">
        <UInput v-model="state.imageUrl" class="w-full" />
      </UFormField>

      <UFormField label="Category" name="productTypeId">
        <USelect
          v-model="state.productTypeId"
          :items="[
            { label: 'No Category', value: '' },
            ...(categories?.data || []).map((c) => ({
              label: c.name,
              value: c.id,
            })),
          ]"
          class="w-full"
        />
      </UFormField>

      <div class="flex justify-end gap-2 pt-4">
        <UButton label="Cancel" variant="ghost" to="/admin/products" />
        <UButton type="submit" label="Save" />
      </div>
    </UForm>
  </UCard>
</template>
```

---

## 9. Seed Data

Agar halaman user dan admin langsung terisi, tambahkan seed product di `server/database/seed.ts`.

```ts
import "dotenv/config";
import { auth } from "../utils/auth";
import { db } from "./index";
import { user, productType, productList } from "./schema";
import { eq } from "drizzle-orm";

async function seedAdmin() {
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, process.env.ADMIN_EMAIL!));
  if (existing.length === 0) {
    await auth.api.signUpEmail({
      body: {
        name: "Admin",
        email: process.env.ADMIN_EMAIL!,
        password: process.env.ADMIN_PASSWORD!,
      },
    });
    await db
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.email, process.env.ADMIN_EMAIL!));
    console.log("Admin created:", process.env.ADMIN_EMAIL);
  }
}

async function seedProducts() {
  const existingTypes = await db.select().from(productType);
  if (existingTypes.length > 0) {
    console.log("Product types already seeded.");
    return;
  }

  const [electronics] = await db
    .insert(productType)
    .values({ name: "Electronics", slug: "electronics" })
    .returning();

  const [fashion] = await db
    .insert(productType)
    .values({ name: "Fashion", slug: "fashion" })
    .returning();

  await db.insert(productList).values([
    {
      name: "Wireless Headphones",
      slug: "wireless-headphones",
      description: "Noise cancelling over-ear headphones.",
      price: 899000,
      stock: 20,
      imageUrl:
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600",
      productTypeId: electronics.id,
    },
    {
      name: "Running Shoes",
      slug: "running-shoes",
      description: "Lightweight running shoes for daily training.",
      price: 1200000,
      stock: 15,
      imageUrl:
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600",
      productTypeId: fashion.id,
    },
  ]);

  console.log("Products seeded.");
}

async function main() {
  await seedAdmin();
  await seedProducts();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

Jalankan:

```bash
pnpm db:seed
```

---

## 10. Periksa & Test

Setelah semua selesai, jalankan perintah berikut:

```bash
# 1. Typecheck
pnpm typecheck

# 2. Linter
pnpm lint

# 3. Jalankan dev server
pnpm dev
```

### Skenario test manual

1. Buka `/product` → harus tampil list produk (public API).
2. Klik salah satu produk → masuk ke `/product/:slug` → detail produk muncul.
3. Coba akses `/admin/products` tanpa login → diarahkan ke `/login`.
4. Login sebagai admin → masuk ke `/admin/products` → bisa create, edit, delete.
5. Login sebagai user biasa → coba akses `POST /api/products` via curl/Postman → harus dapat `403`.

---

## 11. Ringkasan Konsep yang Harus Diingat

- **Database dulu** → baru migration → baru API → baru UI.
- **Public API** tidak pakai auth; **Private API** wajib `requireSession`; **Admin API** wajib `requireAdmin`.
- **Server adalah sumber kebenaran untuk keamanan.** Middleware frontend hanya untuk UX.
- Gunakan `slug` untuk URL user, `id` untuk operasi admin/API internal.
- Response API selalu dibungkus object `{ data, meta }` supaya konsisten.
- Layout Nuxt: `default.vue` untuk user, `admin.vue` untuk admin, diatur via `definePageMeta({ layout: 'admin' })`.

---

## Next Steps (Phase 3)

- Fitur **Cart**: tabel `cart` & `cart_item`, API user-only, UI cart page.
- Fitur **Checkout/Order**: tabel `order` & `order_item`, flow checkout, order history.
- Fitur **Admin Order Management**: list semua order, update status order.
