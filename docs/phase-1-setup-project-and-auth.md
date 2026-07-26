# Phase 1 — Setup Project, Auth Foundation

> Dokumen ini bukan pembagian per pertemuan. Ikuti step-by-step, kalau di tengah waktu habis, lanjut di sesi berikutnya dari step terakhir yang dikerjain.

---

## Step 1 — Setup Project & Library

### 1.1 Prasyarat

- Node.js versi 24 LTS ke atas (`node -v` untuk cek)
- Package manager: **pnpm**. Bukan berarti `npm` tidak bisa dipakai sama sekali (`nuxi init` tetap menawarkan pilihan npm/pnpm/yarn/bun), tapi tim Nuxt sendiri pakai & merekomendasikan pnpm, dan dokumentasi resmi Nuxt UI juga default ke tab pnpm. Kalau belum ada: `npm install -g pnpm@latest`
- Git sudah terinstall & dikonfigurasi (`git config --global user.name` / `user.email`)
- Akun Neon (https://neon.tech) untuk PostgreSQL — gratis untuk tier development

### 1.2 Buat Project Nuxt

```bash
pnpm create nuxt@latest mini-ecommerce
```

```bash
Templates loaded (Pilih ui – Starter with Nuxt UI.)

|  Which template would you like to use?
│  ○ content – Starter for a content-driven website.
│  ○ minimal – Minimal starter with a single app.vue.
│  ○ module – Starter to create your first Nuxt module.
│  ● ui – Starter with Nuxt UI.
│  ○ v5-nightly – Minimal setup for Nuxt 5 Nightly
│  ↑/↓ to navigate • Enter: confirm


|  Initialize git repository? Pilih yes
│  ● Yes / ○ No
└

Would you like to browse and install modules? Pilih No
│  ○ Yes / ● No
```

```bash
cd mini-ecommerce
pnpm run dev -o atau pnpm dev -o
```

auto open `http://localhost:3000` di browser.

### 1.4 Install Drizzle ORM + Driver Neon

```bash
pnpm add drizzle-orm @neondatabase/serverless
pnpm add -D drizzle-kit
```

- `@neondatabase/serverless` → driver Neon (query via HTTP, dipakai bareng `drizzle-orm/neon-http`)
- `drizzle-orm` → query builder & schema definition
- `drizzle-kit` → CLI untuk generate & jalankan migration (dev dependency, tidak perlu di production)

> Kalau nanti butuh session/interactive transaction (`BEGIN...COMMIT`), driver `neon-http` tidak mendukungnya secara native — pakai varian `drizzle-orm/neon-serverless` (WebSocket-based) untuk itu. Untuk Phase 1 & kebutuhan checkout sederhana di phase berikutnya, `neon-http` sudah cukup.

### 1.5 Install Better Auth & Zod

```bash
pnpm add better-auth zod
```

### 1.6 Environment Variables

Buat file `.env` di root:

```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
BETTER_AUTH_SECRET=generate-random-string-panjang
BETTER_AUTH_URL=http://localhost:3000
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=password-awal-untuk-akun-admin
```

`DATABASE_URL` didapat dari dashboard Neon (connection string). `ADMIN_EMAIL` dan `ADMIN_PASSWORD` dipakai oleh seed script untuk membuat akun admin pertama kali (dibahas di Step 5.7) — bukan cuma penanda email mana yang "boleh" jadi admin, karena akun itu sendiri harus benar-benar dibuat lewat proses sign up. `BETTER_AUTH_SECRET` bisa generate pakai:

```bash
openssl rand -base64 32
```

Tambahkan `.env` ke `.gitignore` (biasanya sudah otomatis ada dari template Nuxt, tapi cek ulang).

### 1.7 Struktur Folder yang Akan Dipakai

Nuxt 4 memisahkan kode aplikasi (client-side: pages, components, layouts, middleware, app.vue) ke dalam folder `app/`, sementara `server/` dan file-file di root (config, `lib/`) tetap di luar `app/`:

```
mini-ecommerce/
├── nuxt.config.ts
├── drizzle.config.ts
├── .env
├── app/
│   ├── app.vue
│   ├── assets/
│   │   └── css/
│   │       └── main.css
│   ├── components/
│   │   └── AppNavbar.vue
│   ├── layouts/
│   │   └── default.vue
│   ├── middleware/
│   │   ├── auth.ts
│   │   └── auth-admin.ts
│   └── pages/
│       ├── index.vue
│       ├── register.vue
│       ├── login.vue
│       ├── admin/
│       │   └── index.vue
│       └── profile/
│           └── index.vue
├── server/
│   ├── api/
│   │   └── auth/
│   │       └── [...all].ts
│   ├── database/
│   │   ├── schema.ts
│   │   ├── index.ts
│   │   └── seed.ts
│   └── utils/
│       └── auth.ts
└── lib/
    └── auth-client.ts
```

**Soal alias `~` dan `~~`:** di Nuxt 4, `~` (dan `@`) menunjuk ke `srcDir` yaitu `app/`, sedangkan `~~` (dan `@@`) menunjuk ke root project. Karena `server/` dan `lib/` ada **di luar** `app/`, import dari dalam `app/pages/*.vue` atau `server/api/*.ts` ke folder-folder itu **wajib pakai `~~/`**, bukan `~/`. Ini beda dari kebiasaan lama di Nuxt 3 di mana `~/server/...` masih jalan karena dulu root == srcDir. Semua contoh import di step-step berikutnya sudah disesuaikan.

### Kemungkinan Error & Fix

| Error                                           | Penyebab                                                                     | Fix                                                                                                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `command not found: pnpm`                       | pnpm belum terinstall                                                        | `npm install -g pnpm@latest` (Node.js tetap wajib jadi runtime dasarnya)                                                                                     |
| Port 3000 sudah dipakai                         | Ada proses lain jalan di port itu                                            | `pnpm dev -- --port 3001`, atau matikan proses lama                                                                                                          |
| Tailwind class tidak berefek sama sekali        | `main.css` tidak ter-import di `nuxt.config.ts`, atau salah urutan `@import` | Pastikan `css: ['~/assets/css/main.css']` ada (Nuxt otomatis resolve ke `app/assets/css/main.css`) dan `@import "tailwindcss"` di baris paling atas file CSS |
| `Module not found: better-auth` setelah install | Cache pnpm korup / install terputus                                          | Hapus `node_modules` + `pnpm-lock.yaml`, `pnpm install` ulang                                                                                                |

---

## Step 2 — Halaman Dasar: Home (Navbar), Admin Dashboard (kosong), Profile (kosong)

### 2.1 Konsep: File-based Routing di Nuxt

Nuxt otomatis generate route dari struktur folder di `pages/`. Tidak perlu setup router manual seperti di Vue Router murni.

| File                      | Route      |
| ------------------------- | ---------- |
| `pages/index.vue`         | `/`        |
| `pages/admin/index.vue`   | `/admin`   |
| `pages/profile/index.vue` | `/profile` |

### 2.2 Layout

> Path lengkap semua file di Step 2 ini ada di dalam `app/` (mis. `app/layouts/default.vue`, `app/components/AppNavbar.vue`, `app/pages/index.vue`) — komentar path di tiap code block ditulis relatif terhadap `app/` untuk ringkas, sesuai konvensi Nuxt.

`layouts/default.vue` adalah "bungkus" yang otomatis dipakai semua halaman kecuali didefinisikan lain. Navbar ditaruh di sini supaya tidak perlu diulang-ulang di tiap page.

```vue
<!-- app/layouts/default.vue -->
<template>
  <div>
    <AppNavbar />
    <main class="max-w-6xl mx-auto px-4 py-6">
      <slot />
    </main>
  </div>
</template>
```

`<slot />` adalah tempat konten dari masing-masing `pages/*.vue` di-render.

### 2.3 Navbar Component

```vue
<!-- app/components/AppNavbar.vue -->
<template>
  <header class="border-b border-gray-200 dark:border-gray-800">
    <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
      <NuxtLink to="/" class="font-bold text-lg">MiniShop</NuxtLink>

      <div class="flex items-center gap-4">
        <UButton icon="i-lucide-shopping-cart" variant="ghost" to="/cart" />
        <UButton label="Login" to="/login" variant="outline" />
      </div>
    </div>
  </header>
</template>
```

Untuk Phase 1, bagian cart & login masih dummy link — belum ada logic apapun. Fokus dulu ke struktur.

### 2.4 Halaman Kosong

```vue
<!-- app/pages/index.vue -->
<template>
  <div>
    <h1 class="text-2xl font-bold">Home</h1>
  </div>
</template>
```

```vue
<!-- app/pages/admin/index.vue -->
<template>
  <div>
    <h1 class="text-2xl font-bold">Admin Dashboard</h1>
  </div>
</template>
```

```vue
<!-- app/pages/profile/index.vue -->
<template>
  <div>
    <h1 class="text-2xl font-bold">Profile</h1>
  </div>
</template>
```

Komponen di folder `components/` **otomatis ter-registrasi global** oleh Nuxt (auto-import) — tidak perlu `import AppNavbar from '...'` manual di tiap file.

### Kemungkinan Error & Fix

| Error                                  | Penyebab                                                                                                                  | Fix                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Navbar tidak muncul di semua halaman   | Layout custom di-set di page tapi bukan `default`                                                                         | Pastikan tidak ada `definePageMeta({ layout: false })` tanpa sengaja                            |
| `AppNavbar` dianggap tidak terdefinisi | Nama file component tidak PascalCase atau ada typo                                                                        | Nama file harus `AppNavbar.vue`, dipanggil sebagai `<AppNavbar />`                              |
| Halaman `/admin` 404                   | Folder `admin` tidak punya `index.vue` di dalamnya                                                                        | Pastikan path persis `pages/admin/index.vue`                                                    |
| Hydration mismatch warning di console  | Ada konten yang beda antara server-render dan client (misal pakai `Math.random()` atau `Date.now()` langsung di template) | Hindari nilai random/waktu langsung di template saat SSR, pakai `ClientOnly` kalau memang perlu |

---

## Step 3 — Jenis Database & Kenapa Pakai SQL

### 3.1 SQL vs NoSQL, Singkatnya

|                       | SQL (Relational)                                                                | NoSQL                                                                       |
| --------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Struktur data         | Tabel dengan kolom & tipe data tetap (schema fixed)                             | Dokumen/koleksi bebas struktur (schema flexible)                            |
| Relasi antar data     | Native — pakai foreign key, JOIN                                                | Biasanya di-handle manual di level aplikasi, atau data di-duplikasi (embed) |
| Konsistensi transaksi | Kuat (ACID) — cocok kalau ada operasi yang harus "semua-atau-tidak-sama-sekali" | Umumnya lebih longgar (eventual consistency), tergantung engine             |
| Contoh                | PostgreSQL, MySQL                                                               | MongoDB, Firestore                                                          |

### 3.2 Kenapa E-Commerce Pakai SQL

E-commerce punya banyak **relasi antar entitas** yang harus konsisten: satu user punya banyak order, satu order punya banyak item, satu item merujuk ke satu produk. Kalau produk dihapus tapi masih direferensikan di order lama, itu masalah integritas data — SQL punya foreign key constraint yang bisa mencegah/mengatur ini secara native di level database, bukan cuma di level kode aplikasi.

Selain itu, proses **checkout** butuh transaction: kurangi stok + buat order + buat order_item harus terjadi bersamaan — kalau salah satu gagal, semua harus di-rollback. Ini kasus yang SQL tangani dengan baik lewat `BEGIN...COMMIT/ROLLBACK`.

---

## Step 4 — Setup Koneksi Database (Neon + Drizzle)

Ini fondasi yang harus siap **sebelum** Better Auth di-setup — Better Auth tidak menyediakan database sendiri, dia numpang ke koneksi Drizzle yang kita siapkan di sini.

### 4.1 Drizzle Client

File ini bakal dipakai bareng — bukan cuma Better Auth, tapi nanti juga oleh semua query produk/order/cart di phase berikutnya.

```ts
// server/database/index.ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle({ client: sql, schema });
```

Bedanya dengan pola lama (`drizzle-orm/postgres-js` + package `postgres`): driver `neon-http` query lewat HTTP ke endpoint Neon, bukan koneksi TCP biasa — ini yang direkomendasikan resmi oleh Neon & Drizzle untuk pemakaian di serverless/edge, dan juga yang dipakai konsisten di semua contoh dokumentasi terbaru mereka.

```ts
// server/database/schema.ts
// Sengaja dikosongkan dulu — akan diisi otomatis oleh Better Auth CLI di Step 5.4
export {};
```

### 4.2 Config Drizzle Kit

File ini dibutuhkan oleh `drizzle-kit` (CLI) untuk tahu di mana schema-nya dan ke database mana harus konek — dipakai nanti pas generate & migrate.

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./server/database/schema.ts",
  out: "./server/database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### 4.3 Tes Koneksi

Sebelum lanjut ke Better Auth, pastikan koneksi ke Neon beneran nyambung. Cara paling gampang: buka Drizzle Studio (GUI browser untuk lihat isi database):

```bash
pnpm exec drizzle-kit studio
```

Kalau berhasil, akan muncul link (biasanya `https://local.drizzle.studio`) yang bisa dibuka di browser — walau isinya masih kosong (karena schema belum ada tabel), yang penting **tidak ada error koneksi**.

### Kemungkinan Error & Fix

| Error                                            | Penyebab                                                                                                           | Fix                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `Cannot find module './schema'` saat import `db` | `server/database/schema.ts` belum dibuat                                                                           | Pastikan file `schema.ts` ada, minimal isi `export {}` dulu                                                           |
| `drizzle-kit: command not found`                 | `drizzle-kit` belum terinstall atau terinstall global padahal harusnya lokal                                       | `pnpm add -D drizzle-kit`, jalankan lewat `pnpm exec drizzle-kit ...` bukan global                                    |
| Koneksi ke Neon gagal saat `drizzle-kit studio`  | Connection string salah format/kadaluarsa                                                                          | Copy ulang connection string persis dari dashboard Neon (tab "Connect")                                               |
| `neon(...)` error "fetch failed" / no response   | Memakai driver `neon-http` untuk operasi yang butuh session/transaction interaktif, yang tidak didukung driver ini | Untuk kebutuhan transaction interaktif, ganti ke `drizzle-orm/neon-serverless` (WebSocket) — bukan masalah di Phase 1 |
| `DATABASE_URL is not defined`                    | `.env` tidak terbaca oleh `drizzle.config.ts`                                                                      | Pastikan menjalankan command dari root project (folder yang ada `.env`-nya), bukan dari subfolder                     |

---

## Step 5 — Setup Better Auth

### 5.1 Konsep Dasar Better Auth

Better Auth adalah library auth untuk TypeScript yang menangani: hashing password, generate & validasi session token, simpan session di cookie httpOnly, dan expose endpoint siap pakai (`/api/auth/sign-in`, `/api/auth/sign-up`, dll) tanpa kita bikin manual satu-satu.

Koneksi database (Step 4) sudah siap, jadi sekarang tinggal 3 bagian:

1. **Server instance** — konfigurasi utama Better Auth (secret, provider, adapter ke `db` yang sudah dibuat)
2. **API handler** — route yang meneruskan request ke Better Auth
3. **Client instance** — dipakai di frontend untuk manggil `signIn`, `signUp`, `signOut`, dan baca session aktif

### 5.2 Server Instance

```ts
// server/utils/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../database";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false, // user tidak bisa set role sendiri lewat form register
      },
    },
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});
```

Penjelasan tiap bagian:

- `drizzleAdapter(db, ...)` → memberitahu Better Auth "simpan semua data auth (user, session, account) lewat instance Drizzle `db` yang sudah dibuat di Step 4, ke database Postgres"
- `emailAndPassword.enabled: true` → mengaktifkan metode login email+password (bukan cuma OAuth)
- `user.additionalFields.role` → menambahkan kolom `role` ke tabel `user` bawaan Better Auth. `input: false` artinya kolom ini **tidak bisa diisi lewat body request sign up** (mencegah orang daftar sambil ngirim `role: "admin"` manual lewat Postman)
- `trustedOrigins` → daftar domain yang boleh mengakses endpoint auth ini; wajib diisi domain production nanti supaya tidak kena error CORS/untrusted origin saat deploy
- `secret` → dipakai untuk sign token session, wajib rahasia dan panjang

### 5.3 API Handler (Catch-all Route)

```ts
// server/api/auth/[...all].ts
import { auth } from "~~/server/utils/auth";

export default defineEventHandler((event) => {
  return auth.handler(toWebRequest(event));
});
```

Perhatikan alias-nya `~~/server/...` (double tilde), bukan `~/server/...`. Di Nuxt 4, `~` menunjuk ke `app/` (srcDir), sedangkan `server/` ada di root project — jadi butuh `~~` yang menunjuk ke root. Kalau tetap pakai `~/server/...`, akan muncul error module not found.

`[...all].ts` adalah **catch-all route** di Nuxt — satu file ini menangani semua path di bawah `/api/auth/*` (misal `/api/auth/sign-in`, `/api/auth/sign-up`, `/api/auth/sign-out`, `/api/auth/session`). Better Auth sendiri yang mem-branch logic-nya berdasarkan path, kita tinggal serahkan request mentah ke `auth.handler()`.

### 5.4 Generate Schema & Migration

Sekarang, generate schema tabel yang dibutuhkan Better Auth (`user`, `session`, `account`, `verification`) ke file `schema.ts` yang tadi masih kosong (Step 4.1):

```bash
pnpm dlx @better-auth/cli generate
```

CLI ini akan baca config di `server/utils/auth.ts`, lalu menulis definisi tabel Drizzle ke `server/database/schema.ts` (termasuk kolom `role` tambahan yang barusan didefinisikan). Cek file itu setelah command jalan — harusnya sudah terisi `pgTable(...)` untuk tiap tabel. Kalau CLI sampai tidak nemu file config-nya, jalankan dengan flag eksplisit: `pnpm dlx @better-auth/cli generate --config server/utils/auth.ts`.

Setelah schema terisi, generate file migration SQL, lalu jalankan ke database:

```bash
pnpm exec drizzle-kit generate
pnpm exec drizzle-kit migrate
```

Cek ke dashboard Neon (atau `pnpm exec drizzle-kit studio` dari Step 4.3) — tabel `user`, `session`, `account`, `verification` harus sudah muncul.

### 5.5 Client Instance

```ts
// lib/auth-client.ts
import { createAuthClient } from "better-auth/vue";

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
});
```

`better-auth/vue` menyediakan composable reaktif (`useSession`) yang otomatis update kalau status login berubah — penting supaya navbar bisa re-render tanpa reload manual.

Catatan: `baseURL` di atas opsional kalau client & server jalan di origin yang sama (kasus normal untuk Phase 1 ini, karena `authClient` dipanggil dari dalam app Nuxt yang sama) — Better Auth bisa auto-detect base URL dari current origin. Tetap eksplisit di sini supaya jelas dan aman kalau nanti ada perbedaan port/domain saat deploy.

### 5.6 Tes Instalasi

Sebelum lanjut bikin halaman Register/Login (Step 7), pastikan instalasi sudah benar dengan tes langsung ke endpoint:

```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

Kalau berhasil, response berupa JSON berisi data user yang baru dibuat, dan baris baru muncul di tabel `user` (cek lewat Neon dashboard atau `pnpm exec drizzle-kit studio`).

### 5.7 Seed Akun Admin

Akun admin **tidak dibuat lewat halaman Register** biasa (Register di frontend selalu bikin role `user`, sesuai `input: false` di Step 5.2). Akun admin dibuat sekali lewat script seed, memakai `ADMIN_EMAIL` dan `ADMIN_PASSWORD` dari `.env`.

```ts
// server/database/seed.ts
import { auth } from "../utils/auth";

async function seedAdmin() {
  await auth.api.signUpEmail({
    body: {
      name: "Admin",
      email: process.env.ADMIN_EMAIL!,
      password: process.env.ADMIN_PASSWORD!,
    },
  });

  // update role jadi admin setelah user terbuat
  // (lihat catatan role di bawah)

  console.log("Admin account created:", process.env.ADMIN_EMAIL);
}

seedAdmin();
```

Script ini butuh `tsx` untuk menjalankan file TypeScript langsung (belum di-install di step sebelumnya):

```bash
pnpm add -D tsx
```

Jalankan sekali di awal:

```bash
pnpm exec tsx server/database/seed.ts
```

Catatan soal `role`: `auth.api.signUpEmail` membuat user dengan role default (`user`), jadi setelah baris di atas jalan, perlu update manual kolom `role` jadi `admin` untuk baris user dengan email yang sama dengan `ADMIN_EMAIL` — bisa lewat query Drizzle langsung di script yang sama, atau manual sekali lewat Drizzle Studio (`pnpm exec drizzle-kit studio`) untuk Phase 1 ini. Otomatisasi penuh (misal hook `after: signUp` yang auto-detect `ADMIN_EMAIL`) bisa ditambahkan belakangan.

### Kemungkinan Error & Fix

| Error                                                                   | Penyebab                                                                                              | Fix                                                                                                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET is not defined`                                     | `.env` tidak terbaca / server belum di-restart setelah edit `.env`                                    | Restart `pnpm dev`, pastikan file bernama persis `.env` di root                                                                                 |
| `CORS error` / `Invalid origin` saat call dari client                   | `baseURL` di client instance tidak sama dengan URL aplikasi, atau domain belum masuk `trustedOrigins` | Samakan `BETTER_AUTH_URL` dan `baseURL` client, pastikan domain yang dipakai ada di `trustedOrigins` (Step 5.2)                                 |
| Endpoint `/api/auth/sign-up` return 404                                 | File catch-all salah nama/lokasi                                                                      | Harus persis `server/api/auth/[...all].ts`                                                                                                      |
| `@better-auth/cli generate` error `Cannot find auth config`             | CLI tidak menemukan file `server/utils/auth.ts`                                                       | Pastikan path dan nama file persis `server/utils/auth.ts`, jalankan dari root project, atau tambahkan `--config server/utils/auth.ts` eksplisit |
| `schema.ts` tetap kosong setelah generate                               | Command dijalankan sebelum server instance (`auth.ts`) selesai dikonfigurasi                          | Pastikan Step 5.2 (server instance) sudah lengkap dulu, baru jalankan ulang generate                                                            |
| Tabel `user`/`session` belum ada saat sign up / tes curl                | Migration belum dijalankan setelah generate schema                                                    | Jalankan `pnpm exec drizzle-kit generate` lalu `pnpm exec drizzle-kit migrate` (Step 5.4) sebelum test auth                                     |
| Password tidak ke-hash / tersimpan plain text                           | `emailAndPassword.enabled` tidak diaktifkan, jadi Better Auth mengira mau pakai provider lain         | Pastikan konfigurasi `emailAndPassword: { enabled: true }` ada                                                                                  |
| Tes `curl` sign-up dapat response kosong / connection refused           | Server dev belum jalan (`pnpm dev`), atau salah port                                                  | Pastikan `pnpm dev` jalan di terminal terpisah sebelum jalankan curl                                                                            |
| Seed admin gagal: `ADMIN_EMAIL is undefined`                            | Script seed dijalankan tanpa env ter-load (`.env` tidak otomatis kebaca di skrip standalone)          | Jalankan dengan `dotenv` di-load duluan, atau pakai `node --env-file=.env` / package seperti `dotenv-cli`                                       |
| Login sebagai admin tapi tetap dianggap role `user`                     | Lupa update kolom `role` manual setelah seed jalan (lihat catatan di 5.7)                             | Cek langsung di Drizzle Studio, pastikan baris user dengan `ADMIN_EMAIL` sudah `role = 'admin'`                                                 |
| Seed dijalankan berkali-kali menghasilkan error "email sudah terdaftar" | Script seed tidak mengecek apakah admin sudah ada sebelum sign up                                     | Tambahkan pengecekan (`select` dulu ke tabel `user` by email) sebelum panggil `signUpEmail`, atau cukup jalankan seed sekali saja               |

---

## Step 6 — Desain Database untuk Auth (Konsep Relasi)

### 6.1 Tabel yang Terlibat (dari Better Auth)

```
user (1) ────< (banyak) session
user (1) ────< (banyak) account
```

### 6.2 Konsep One-to-Many & Many-to-One

**One-to-many** dan **many-to-one** itu **relasi yang sama, cuma dilihat dari sisi berbeda**:

- Dari sisi `user`: **satu** user bisa punya **banyak** session (login dari HP, laptop, browser beda-beda — tiap login = 1 baris session baru). Ini disebut **one-to-many** (1 user → banyak session).
- Dari sisi `session`: **banyak** baris session merujuk ke **satu** user yang sama. Ini disebut **many-to-one** (banyak session → 1 user).

Relasi ini diwujudkan lewat **foreign key**: kolom `session.userId` menyimpan `id` milik baris tertentu di tabel `user`.

```ts
// server/database/schema.ts (contoh potongan untuk session)
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});
```

`.references(() => user.id)` inilah yang membentuk foreign key — database akan menolak insert session dengan `userId` yang tidak ada di tabel `user`.

Kenapa ini penting dipahami sekarang: pola yang **persis sama** akan dipakai lagi nanti di:

- `product.product_type_id` → many-to-one ke `product_type`
- `order_item.order_id` → many-to-one ke `order`
- `cart_item.product_id` → many-to-one ke `product`

Jadi konsep di auth ini adalah fondasi buat semua relasi lain di database e-commerce.

### 6.3 Kapan Perlu Generate + Migrate Ulang

Migration untuk tabel auth sudah dijalankan di Step 5.4. Yang perlu diingat ke depannya: **setiap kali `schema.ts` berubah** (nambah tabel baru seperti `product`, `order`, dst di phase berikutnya, atau nambah kolom baru), urutan yang harus diulang selalu sama:

```bash
pnpm exec drizzle-kit generate   # bikin file SQL migration baru berdasarkan perbedaan schema
pnpm exec drizzle-kit migrate    # jalankan file SQL itu ke database
```

Melewatkan salah satu langkah ini adalah sumber error paling umum ("column does not exist", dsb) sepanjang project.

### Kemungkinan Error & Fix

| Error                                                           | Penyebab                                       | Fix                                                                                            |
| --------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `relation "user" does not exist` saat sign up                   | Migration belum jalan / gagal (lihat Step 5.4) | Cek output `drizzle-kit migrate`, pastikan tidak ada error, cek tabel muncul di Neon dashboard |
| `foreign key constraint violation`                              | Insert session dengan `userId` yang tidak ada  | Pastikan urutan insert: user harus sudah ada duluan sebelum insert session/account             |
| Schema TypeScript vs DB tidak sinkron (`column does not exist`) | Edit schema tapi lupa generate+migrate ulang   | Selalu `generate` → `migrate` tiap kali `schema.ts` diubah                                     |

---

## Step 7 — Implementasi Auth di Frontend

### 7.1 Halaman Register

```vue
<!-- app/pages/register.vue -->
<script setup lang="ts">
import { authClient } from "~~/lib/auth-client";

const name = ref("");
const email = ref("");
const password = ref("");
const errorMsg = ref("");
const loading = ref(false);

async function handleRegister() {
  loading.value = true;
  errorMsg.value = "";

  const { error } = await authClient.signUp.email({
    name: name.value,
    email: email.value,
    password: password.value,
  });

  loading.value = false;

  if (error) {
    errorMsg.value = error.message ?? "Registrasi gagal";
    return;
  }

  navigateTo("/");
}
</script>

<template>
  <div class="max-w-sm mx-auto mt-10 space-y-4">
    <h1 class="text-xl font-bold">Register</h1>
    <UInput v-model="name" placeholder="Nama" />
    <UInput v-model="email" placeholder="Email" type="email" />
    <UInput v-model="password" placeholder="Password" type="password" />
    <p v-if="errorMsg" class="text-red-500 text-sm">{{ errorMsg }}</p>
    <UButton :loading="loading" @click="handleRegister" block>Register</UButton>
  </div>
</template>
```

### 7.2 Halaman Login

```vue
<!-- app/pages/login.vue -->
<script setup lang="ts">
import { authClient } from "~~/lib/auth-client";

const email = ref("");
const password = ref("");
const errorMsg = ref("");
const loading = ref(false);

async function handleLogin() {
  loading.value = true;
  errorMsg.value = "";

  const { error } = await authClient.signIn.email({
    email: email.value,
    password: password.value,
  });

  loading.value = false;

  if (error) {
    errorMsg.value = error.message ?? "Login gagal";
    return;
  }

  navigateTo("/");
}
</script>

<template>
  <div class="max-w-sm mx-auto mt-10 space-y-4">
    <h1 class="text-xl font-bold">Login</h1>
    <UInput v-model="email" placeholder="Email" type="email" />
    <UInput v-model="password" placeholder="Password" type="password" />
    <p v-if="errorMsg" class="text-red-500 text-sm">{{ errorMsg }}</p>
    <UButton :loading="loading" @click="handleLogin" block>Login</UButton>
  </div>
</template>
```

### 7.3 Baca Session di Navbar (Reaktif)

```vue
<!-- app/components/AppNavbar.vue -->
<script setup lang="ts">
import { authClient } from "~~/lib/auth-client";

const session = authClient.useSession();

async function handleLogout() {
  await authClient.signOut();
  navigateTo("/login");
}
</script>

<template>
  <header class="border-b border-gray-200 dark:border-gray-800">
    <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
      <NuxtLink to="/" class="font-bold text-lg">MiniShop</NuxtLink>

      <div class="flex items-center gap-4">
        <UButton icon="i-lucide-shopping-cart" variant="ghost" to="/cart" />

        <template v-if="session.data">
          <UButton label="Profile" to="/profile" variant="ghost" />
          <UButton label="Logout" @click="handleLogout" variant="outline" />
        </template>
        <template v-else>
          <UButton label="Login" to="/login" variant="outline" />
        </template>
      </div>
    </div>
  </header>
</template>
```

`authClient.useSession()` adalah composable reaktif — begitu `signIn`/`signOut` dipanggil di mana pun dalam aplikasi, `session.data` otomatis update dan navbar re-render sendiri.

### 7.4 Middleware Proteksi Route

```ts
// app/middleware/auth.ts
import { authClient } from "~~/lib/auth-client";

export default defineNuxtRouteMiddleware(async (to) => {
  const session = await authClient.getSession();

  if (!session.data) {
    return navigateTo("/login");
  }
});
```

```ts
// app/middleware/auth-admin.ts
import { authClient } from "~~/lib/auth-client";

export default defineNuxtRouteMiddleware(async (to) => {
  const session = await authClient.getSession();

  if (!session.data) {
    return navigateTo("/login");
  }

  if (session.data.user.role !== "admin") {
    return navigateTo("/");
  }
});
```

(Dokumen versi sebelumnya melewatkan baris `import { authClient } from ...` di kedua middleware ini — tanpa itu, `authClient` akan dianggap undefined saat middleware dijalankan.)

Pakai di halaman yang butuh proteksi:

```ts
// app/pages/profile/index.vue
definePageMeta({ middleware: "auth" });
```

```ts
// app/pages/admin/index.vue
definePageMeta({ middleware: "auth-admin" });
```

### Kemungkinan Error & Fix

| Error                                                    | Penyebab                                                                                  | Fix                                                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Setelah login, navbar tidak berubah tanpa refresh manual | Pakai `authClient.getSession()` (sekali panggil) bukan `useSession()` (reaktif) di navbar | Ganti ke `useSession()` untuk komponen yang perlu reaktif                                                                     |
| Redirect loop antara `/login` dan halaman protected      | Middleware jalan sebelum session ke-resolve, atau logic kondisi kebalik                   | Pastikan `await` session sebelum cek, dan tidak ada middleware yang saling redirect balik ke halaman yang sama-sama protected |
| `session.data.user.role` undefined                       | Kolom `role` belum ditambahkan sebagai additional field di config Better Auth             | Tambahkan `user: { additionalFields: { role: { type: 'string', defaultValue: 'user' } } }` di server instance (Step 5.2)      |
| Cookie session tidak kebawa saat refresh page            | `baseURL` beda domain/port antara client & server config                                  | Samakan persis `BETTER_AUTH_URL` di server dan `baseURL` di client                                                            |

---

## Step 8 — Validasi dengan Zod

### 8.1 Konsep

Zod adalah library untuk mendefinisikan **schema** (bentuk data yang valid) dan memvalidasi data terhadap schema itu saat runtime — bukan cuma type checking di compile-time seperti TypeScript biasa.

Kenapa perlu, padahal sudah pakai TypeScript? Karena **TypeScript type hilang saat runtime** (di-compile ke JS biasa). Data yang masuk dari request HTTP (body JSON dari client) itu **tidak melewati compiler TypeScript** — bisa jadi apa saja, termasuk data yang salah bentuk atau berbahaya. Zod mengecek data itu **saat aplikasi benar-benar berjalan**, bukan cuma pas nulis kode.

### 8.2 Kenapa Validasi Harus di Dua Sisi (Client & Server)

- **Client-side**: supaya user dapat feedback instan (misal "email tidak valid") tanpa nunggu roundtrip ke server — pengalaman pakai lebih enak.
- **Server-side**: **wajib**, karena client bisa saja di-bypass (request langsung lewat Postman/curl tanpa lewat form). Validasi client itu untuk UX, validasi server itu untuk keamanan & integritas data. **Jangan pernah percaya data dari client** tanpa validasi ulang di server.

### 8.3 Contoh Schema

```ts
// server/utils/validation/auth.schema.ts
import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter"),
});

export const loginSchema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
```

`z.infer<typeof registerSchema>` otomatis menghasilkan TypeScript type dari schema Zod — jadi definisi bentuk data cukup ditulis sekali (di Zod), lalu dipakai baik untuk validasi runtime maupun type-checking di compile-time.

### 8.4 Pakai di Server API (contoh endpoint custom di luar Better Auth)

```ts
// server/api/example.ts
import { registerSchema } from "~~/server/utils/validation/auth.schema";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const result = registerSchema.safeParse(body);

  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: result.error.issues[0].message,
    });
  }

  const data = result.data; // sudah pasti sesuai tipe RegisterInput
  // lanjut proses...
});
```

`safeParse` dipakai (bukan `parse`) supaya error tidak melempar exception mentah — hasilnya berupa objek `{ success, data }` atau `{ success: false, error }` yang bisa ditangani dengan rapi.

### 8.5 Pakai di Frontend (Opsional, untuk UX)

```vue
<script setup lang="ts">
import { registerSchema } from "~~/server/utils/validation/auth.schema";

function validateForm() {
  const result = registerSchema.safeParse({
    name: name.value,
    email: email.value,
    password: password.value,
  });

  if (!result.success) {
    errorMsg.value = result.error.issues[0].message;
    return false;
  }
  return true;
}
</script>
```

Untuk Phase 1 ini, validasi manual seperti di atas cukup. Nanti di phase CRUD produk, pola yang sama dipakai untuk validasi body request create/update produk.

### Kemungkinan Error & Fix

| Error                                                | Penyebab                                                                          | Fix                                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `result.error.issues` undefined                      | Pakai `parse()` bukan `safeParse()`, jadi error langsung throw dan bentuknya beda | Konsisten pakai `safeParse` untuk endpoint yang butuh custom error handling                                                                      |
| Type dari `z.infer` tidak update setelah edit schema | Cache TypeScript server di editor belum refresh                                   | Restart TS server di VS Code (`Cmd/Ctrl+Shift+P` → "Restart TS Server")                                                                          |
| Validasi client lolos tapi server tetap reject       | Schema di client dan server tidak sinkron (misal minimal karakter beda)           | Definisikan schema di **satu tempat** (`server/utils/validation/`) dan import dari situ baik di server maupun client — jangan duplikasi definisi |

---

## Ringkasan Checklist Phase 1

- [ ] Project Nuxt jalan, Tailwind & Nuxt UI ke-render
- [ ] Halaman Home (dengan navbar), Admin (kosong), Profile (kosong) bisa diakses
- [ ] Koneksi ke Neon berhasil (Step 4.3, `drizzle-kit studio` tidak error)
- [ ] Better Auth ter-setup, tabel `user`/`session`/`account` ada di database
- [ ] Tes `curl` sign-up berhasil (Step 5.6) sebelum lanjut bikin halaman frontend
- [ ] Akun admin sudah di-seed (`ADMIN_EMAIL` + `ADMIN_PASSWORD`), role sudah `admin` di database
- [ ] Register & Login berfungsi end-to-end, session tersimpan di cookie
- [ ] Navbar berubah reaktif sesuai status login
- [ ] Middleware `auth` dan `auth-admin` berhasil memproteksi route
- [ ] Validasi Zod jalan di minimal satu endpoint (register/login)
