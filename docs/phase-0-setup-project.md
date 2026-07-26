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
