# PRD — Mini E-Commerce

## 1. Overview

Aplikasi e-commerce dengan fitur auth, katalog produk, cart, order, dan dashboard admin.

## 2. Tech Stack

| Layer     | Teknologi                                        |
| --------- | ------------------------------------------------ |
| Framework | Nuxt 4 (Fullstack — `pages/` + `server/api/`)    |
| Bahasa    | TypeScript                                       |
| UI        | Nuxt UI + Tailwind CSS                           |
| ORM       | Drizzle ORM                                      |
| Database  | PostgreSQL (Neon)                                |
| Auth      | Better Auth (email/password, session via cookie) |
| Validasi  | Zod                                              |
| Deploy    | Railway                                          |

---

## 3. Roles & Access

| Role    | Sumber                                               | Akses                                                |
| ------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `admin` | Email cocok dengan `ADMIN_EMAIL` di `.env` saat seed | Full CRUD product & product_type, kelola semua order |
| `user`  | Default saat register                                | Browse produk, cart, checkout, lihat order sendiri   |

Kolom `role` (enum: `admin` \| `user`) ditambahkan sebagai extra field pada tabel `user` bawaan Better Auth.

Route `/admin/*` diproteksi via `definePageMeta({ middleware: 'auth-admin' })`. Endpoint admin diproteksi via server middleware yang mengecek session + role.

---

## 4. Pages & Features

### 4.1 Navbar (global)

- Logo → link ke Home
- Icon Cart dengan badge jumlah item (dari Pinia cart store)
- Belum login: tombol **Login** dan **Register**
- Sudah login: dropdown avatar berisi **Profile**, **Order History**, **Logout** (tambahan **Admin Dashboard** kalau role admin)

### 4.2 Home (`/`)

- Search box produk → query param `q`
- Filter kategori → query param `category`
- Pagination → query param `page`, `limit`; response menyertakan `meta: { total, page, totalPages }`
- Grid product card: gambar, nama, harga, kategori — klik card → Product Detail

### 4.3 Product Detail (`/product/[slug]`)

- Gambar, nama, deskripsi, harga, stok, kategori
- Input qty + tombol **Add to Cart**
- Tombol disabled dan label "Stok Habis" ketika `stock <= 0`

### 4.4 Cart Page (`/cart`)

- List item: nama produk, harga, qty (editable), subtotal per item
- Tombol hapus per item
- Total harga keseluruhan
- Tombol **Checkout** → membentuk `order` + `order_item` dari isi cart, cart dikosongkan setelahnya

### 4.5 Admin Dashboard (`/admin`)

- **Product Management**: list (tabel + pagination), create, edit, delete produk
- **Product Type Management**: CRUD kategori produk
- **Order Management**: list semua order, detail order (buyer + item), update status order

### 4.6 Profile User (`/profile`)

- Info user: nama, email
- **Order History**: list order milik user yang login, klik → detail order (item, status, total)

---

## 5. Database Design

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

## 6. API Endpoints

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

## 7. Out of Scope

- Payment gateway & webhook
- Notifikasi realtime (WebSocket)
- Chatbot AI/CS
- Multi-alamat pengiriman
- Diskon/voucher/promo
- Review & rating produk
- Email Notification
