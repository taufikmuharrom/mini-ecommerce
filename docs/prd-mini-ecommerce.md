# PRD — Mini E-Commerce

## 1. Overview

Aplikasi e-commerce dengan fitur auth, katalog produk, cart, order, dan dashboard admin.

**Status Implementasi:** Project dalam tahap awal. Dependencies utama sudah terinstal, tetapi hanya placeholder page yang tersedia. Logic backend, database schema, API endpoint, auth flow, dan state management belum diimplementasikan.

---

## 2. Tech Stack

| Layer     | Teknologi                                        | Status               |
| --------- | ------------------------------------------------ | -------------------- |
| Framework | Nuxt 4 (Fullstack — `pages/` + `server/api/`)    | Terinstal, pages stub |
| Bahasa    | TypeScript                                       | Aktif                |
| UI        | Nuxt UI + Tailwind CSS                           | Aktif                |
| ORM       | Drizzle ORM                                      | Terinstal, belum ada schema |
| Database  | PostgreSQL (Neon)                                | Terinstal (`@neondatabase/serverless`), belum dikonfigurasi |
| Auth      | Better Auth (email/password, session via cookie) | Terinstal, belum di-setup |
| Validasi  | Zod                                              | Terinstal, belum digunakan |
| Deploy    | Railway                                          | Planned              |

---

## 3. Roles & Access (Planned)

| Role    | Sumber                                               | Akses                                                |
| ------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `admin` | Email cocok dengan `ADMIN_EMAIL` di `.env` saat seed | Full CRUD product & product_type, kelola semua order |
| `user`  | Default saat register                                | Browse produk, cart, checkout, lihat order sendiri   |

Kolom `role` (enum: `admin` \| `user`) ditambahkan sebagai extra field pada tabel `user` bawaan Better Auth.

Route `/admin/*` diproteksi via `definePageMeta({ middleware: 'auth-admin' })`. Endpoint admin diproteksi via server middleware yang mengecek session + role.

> **Catatan:** Belum ada middleware auth, schema database, maupun seed data yang diimplementasikan.

---

## 4. Pages (Current Implementation)

Berikut daftar page yang **sudah ada file-nya** di `app/pages/`. Saat ini semua masih berupa placeholder / stub.

### 4.1 Layout Global (`app/layouts/default.vue`)

- Masih placeholder (`<div>HEADER</div>`).
- Belum ada navbar, cart badge, auth dropdown, maupun logo link.

### 4.2 Home (`app/pages/index.vue`) → Route `/`

- Placeholder konten: `<div>HOME</div>`.
- Belum ada search box, filter kategori, pagination, maupun grid product card.

### 4.3 Product List (`app/pages/product/index.vue`) → Route `/product`

- Placeholder konten: `<div>PRODUCT LIST</div>`.
- Page ini ada di kode, tetapi belum disebutkan di PRD awal.
- Belum ada list produk, filter, atau pagination.

### 4.4 Product Detail (`app/pages/product/[id].vue`) → Route `/product/:id`

- Placeholder konten: `<div>PRODUCT DETAILS</div>`.
- **Perubahan dari PRD awal:** Parameter route adalah `[id]`, bukan `[slug]`.
- Belum ada gambar, deskripsi, stok, input qty, maupun tombol Add to Cart.

### 4.5 Admin Dashboard (`app/pages/admin/index.vue`) → Route `/admin`

- Placeholder konten: `<div>ADMIN</div>`.
- Belum ada proteksi middleware, product management, product type management, maupun order management.

### 4.6 Profile User (`app/pages/profile/index.vue`) → Route `/profile`

- Placeholder konten: `<div>PROFILE</div>`.
- Belum ada info user maupun order history.

### 4.7 Halaman yang Belum Dibuat (Planned)

| Page               | Route yang direncanakan | Keterangan                          |
| ------------------ | ----------------------- | ----------------------------------- |
| Cart Page          | `/cart`                 | Belum ada file `app/pages/cart/...` |
| Login              | `/login`                | Belum ada file                      |
| Register           | `/register`             | Belum ada file                      |

---

## 5. App Configuration

- **`app/app.vue`:** Masih menggunakan title dan description bawaan starter template (`Nuxt Starter Template`). Belum di-update ke branding mini-ecommerce.
- **`app/app.config.ts`:** Warna primary di-set ke `green`, neutral ke `slate`.
- **`nuxt.config.ts`:** Standar dengan module `@nuxt/eslint` dan `@nuxt/ui`. Route `/` di-prerender.

---

## 6. Database Design (Planned — Belum Diimplementasikan)

> **Status:** Tidak ada file schema maupun migration. Folder `server/` belum ada.

### Tabel Better Auth

```
user
├── id            (pk)
├── name
├── email         (unique)
├── emailVerified
├── image
├── role          (enum: 'admin' | 'user', default 'user')
├── createdAt
└── updatedAt

session
├── id
├── userId       (fk → user.id)
├── expiresAt
└── token

account
├── id
├── userId       (fk → user.id)
├── providerId
└── password / provider fields

verification
├── id
├── identifier
├── value
└── expiresAt
```

### Tabel Domain

```
product_type
├── id           (pk)
├── name
├── slug         (unique)
└── created_at

product_list
├── id               (pk)
├── name
├── slug             (unique)
├── description
├── price            (integer)
├── stock            (integer)
├── image_url
├── product_type_id  (fk → product_type.id)
├── created_at
└── updated_at

cart
├── id           (pk)
├── user_id      (fk → user.id, unique)
├── created_at
└── updated_at

cart_item
├── id               (pk)
├── cart_id          (fk → cart.id)
├── product_id       (fk → product_list.id)
├── qty
├── price_snapshot
└── created_at

order
├── id                (pk)
├── user_id           (fk → user.id)
├── status            (enum: pending | processing | shipped | completed | cancelled)
├── total             (integer)
├── shipping_address  (text)
├── created_at
└── updated_at

order_item
├── id                        (pk)
├── order_id                  (fk → order.id)
├── product_id                (fk → product_list.id)
├── product_name_snapshot
├── qty
├── price_snapshot
└── created_at
```

---

## 7. API Endpoints (Planned — Belum Diimplementasikan)

> **Status:** Folder `server/api/` belum ada. Tidak ada endpoint yang tersedia.

| Method | Endpoint                       | Auth       | Keterangan                              |
| ------ | ------------------------------ | ---------- | --------------------------------------- |
| POST   | `/api/auth/**`                 | -          | Ditangani Better Auth handler           |
| GET    | `/api/products`                | Public     | Query: `q`, `category`, `page`, `limit` |
| GET    | `/api/products/:slug`          | Public     | Detail produk                           |
| POST   | `/api/products`                | Admin      | Create produk                           |
| PUT    | `/api/products/:id`            | Admin      | Update produk                           |
| DELETE | `/api/products/:id`            | Admin      | Delete produk                           |
| GET    | `/api/product-types`           | Public     | List kategori                           |
| POST   | `/api/product-types`           | Admin      | Create kategori                         |
| PUT    | `/api/product-types/:id`       | Admin      | Update kategori                         |
| DELETE | `/api/product-types/:id`       | Admin      | Delete kategori                         |
| GET    | `/api/cart`                    | User       | Ambil cart aktif                        |
| POST   | `/api/cart/items`              | User       | Tambah item ke cart                     |
| PUT    | `/api/cart/items/:id`          | User       | Update qty item                         |
| DELETE | `/api/cart/items/:id`          | User       | Hapus item dari cart                    |
| POST   | `/api/checkout`                | User       | Buat order dari cart, kosongkan cart    |
| GET    | `/api/orders`                  | User       | Order history milik sendiri             |
| GET    | `/api/orders/:id`              | User/Admin | Detail order                            |
| GET    | `/api/admin/orders`            | Admin      | List semua order                        |
| PUT    | `/api/admin/orders/:id/status` | Admin      | Update status order                     |

---

## 8. Out of Scope

- Payment gateway & webhook
- Notifikasi realtime (WebSocket)
- Chatbot AI/CS
- Multi-alamat pengiriman
- Diskon/voucher/promo
- Review & rating produk
- Email Notification

---

## 9. Next Steps / Todo

1. **Setup Database & ORM:** Buat folder `server/db/` dengan schema Drizzle dan koneksi Neon.
2. **Setup Better Auth:** Konfigurasi auth handler di `server/api/auth/[...all].ts`, update `nuxt.config.ts` dengan auth client.
3. **Buat Middleware:** `auth` dan `auth-admin` untuk proteksi route.
4. **Implementasi API:** Semua endpoint di bagian 7.
5. **Implementasi Pages:**
   - Ganti placeholder di page existing dengan komponen sesungguhnya.
   - Buat page `/cart`, `/login`, `/register`.
6. **Update Layout & App Config:** Navbar global, cart badge, auth dropdown, title/description app.
7. **Seeding:** Script seed untuk `product_type`, `product_list`, dan admin user.
