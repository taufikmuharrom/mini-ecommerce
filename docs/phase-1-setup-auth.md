# Phase 1 — Setup Auth, Database, dan Halaman Dasar

## Overview Flow

1. Install dependencies (`better-auth`, `zod`, `dotenv`, `tsx`)
2. Setup `.env` (DATABASE_URL dari Neon, BETTER_AUTH_SECRET, dll)
3. Setup Drizzle ORM + Neon (client, config, schema awal)
4. Setup Better Auth (server instance, catch-all handler)
5. Generate schema tabel auth & migrate ke database
6. Buat auth client di frontend
7. Seed akun admin
8. Test endpoint via curl
9. Setup UI: layout, navbar, login, register, profile, admin
10. Setup middleware proteksi route

---

## Step 1 — Install Dependencies

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm add better-auth zod dotenv
pnpm add -D tsx
```

- `better-auth` → auth engine (hash password, session cookie, endpoint `/api/auth/*`)
- `zod` → validasi schema runtime
- `dotenv` → baca `.env` saat script standalone
- `tsx` → run file TypeScript langsung tanpa compile

---

## Step 2 — Environment Variables

### Buat file `.env` di root project

File `.env` menyimpan konfigurasi rahasia yang tidak boleh di-commit ke GitHub.

```env
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=<generate dengan openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=password123
```

### Penjelasan tiap variable

| Variable             | Dari mana                                               | Kegunaan                                                                |
| -------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`       | Dashboard Neon → tab "Connect" → copy connection string | Koneksi ke PostgreSQL                                                   |
| `BETTER_AUTH_SECRET` | Generate sendiri: `openssl rand -base64 32`             | Sign & encrypt session token (lihat penjelasan di `@docs/knowledge.md`) |
| `BETTER_AUTH_URL`    | URL aplikasi saat dev                                   | Base URL Better Auth                                                    |
| `ADMIN_EMAIL`        | Bebas, yang penting ingat                               | Email akun admin yang dibuat via seed                                   |
| `ADMIN_PASSWORD`     | Bebas, yang penting kuat                                | Password akun admin                                                     |

### Penting: `.env` harus di `.gitignore`

Cek file `.gitignore` di root, pastikan ada baris:

```
.env
```

Kalau belum ada, tambahkan. Ini mencegah secret (password database, auth secret, admin password) ke-commit ke GitHub.

### Generate `BETTER_AUTH_SECRET`

```bash
openssl rand -base64 32
```

Output-nya string panjang random, paste ke `.env`. Secret ini minimal 32 karakter dan harus benar-benar random — jangan pakai nama project atau tanggal lahir.

### Dapatkan `DATABASE_URL` dari Neon

1. Login ke https://neon.tech
2. Pilih project/database
3. Tab **"Connect"** atau **"Connection Details"**
4. Copy connection string (format: `postgresql://user:password@host/dbname?sslmode=require`)
5. Paste ke `.env`

---

## Step 3 — Drizzle ORM + Neon

### File 1: `server/database/index.ts`

```ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle({ client: sql, schema });
```

> Gunakan `neon-http` untuk query via HTTP ke endpoint Neon. Direkomendasikan untuk serverless/edge. Jika butuh transaction interaktif, ganti ke `neon-serverless`.

### File 2: `server/database/schema.ts`

Sengaja kosong dulu:

```ts
export {};
```

Nanti diisi otomatis oleh Better Auth CLI di Step 5.

### File 3: `drizzle.config.ts` (di root)

File ini dibuat manual. Drizzle Kit membutuhkan file ini untuk mengetahui lokasi schema, folder migration, dan koneksi database.

```ts
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

> `process.env.DATABASE_URL!` menggunakan `!` (non-null assertion) karena tipe TypeScript `process.env.X` adalah `string | undefined`, sedangkan fungsi `neon()` memerlukan `string`. Tanda `!` menegaskan bahwa variabel tersebut pasti ada.

### Test koneksi:

```bash
pnpm exec drizzle-kit studio
```

Kalau muncul link tanpa error → koneksi sukses.

---

## Step 4 — Better Auth Server Instance

### File: `server/utils/auth.ts`

```ts
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
        input: false, // mencegah user set role sendiri via register
      },
    },
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});
```

---

## Step 5 — API Catch-all Handler

### File: `server/api/auth/[...all].ts`

```ts
import { auth } from "~~/server/utils/auth";

export default defineEventHandler((event) => {
  return auth.handler(toWebRequest(event));
});
```

> `~~/` (double tilde) wajib! Di Nuxt 4, `~` = `app/`, `~~` = root project. `server/` ada di root, jadi import dari `server/api/` ke `server/utils/` butuh `~~/`.

---

## Step 5.5 — Tambahkan Script di `package.json`

### Edit `package.json` — Bagian `"scripts"`

Tambahkan baris-baris ini di dalam objek `"scripts"` (setelah script bawaan Nuxt):

```json
{
  "scripts": {
    "build": "nuxt build",
    "dev": "nuxt dev",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare",
    "lint": "eslint .",
    "typecheck": "nuxt typecheck",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx server/database/seed.ts"
  }
}
```

### Penjelasan Tiap Script Baru

| Script             | Command Asli                  | Kegunaan                                          |
| ------------------ | ----------------------------- | ------------------------------------------------- |
| `pnpm db:generate` | `drizzle-kit generate`        | Generate file SQL migration dari perubahan schema |
| `pnpm db:migrate`  | `drizzle-kit migrate`         | Jalankan migration ke database                    |
| `pnpm db:studio`   | `drizzle-kit studio`          | Buka GUI database di browser                      |
| `pnpm db:seed`     | `tsx server/database/seed.ts` | Jalankan seed admin                               |

> `pnpm dlx @better-auth/cli generate` tidak masuk script karena CLI ini di-download on-the-fly. Jika ingin dimasukkan ke script, install CLI secara lokal terlebih dahulu.

---

## Step 6 — Generate Schema & Migrate

### 6.1 Generate schema dari Better Auth:

**Jalankan dari root project** (folder `mini-ecommerce/`), bukan dari dalam folder `server/`:

```bash
pnpm dlx @better-auth/cli generate --config server/utils/auth.ts --output server/database/schema.ts
```

> Perintah ini menimpa file `server/database/schema.ts` yang sudah dibuat di Step 3.

### 6.2 Generate & jalankan migration:

```bash
pnpm db:generate
pnpm db:migrate
```

> Kalau belum bikin script di Step 5.5, pakai command manual: `pnpm exec drizzle-kit generate` lalu `pnpm exec drizzle-kit migrate`

Cek ke Neon dashboard / Drizzle Studio — tabel auth harus sudah muncul.

---

## Step 7 — Auth Client (Frontend)

### File: `lib/auth-client.ts`

```ts
import { createAuthClient } from "better-auth/vue";

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
});
```

> `better-auth/vue` menyediakan `useSession()` yang reaktif — navbar auto-update kalau login/logout.

---

## Step 8 — Seed Admin

### File: `server/database/seed.ts`

```ts
import "dotenv/config";
import { auth } from "../utils/auth";
import { db } from "./index";
import { user } from "./schema";
import { eq } from "drizzle-orm";

async function seedAdmin() {
  // Cek apakah admin sudah ada
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, process.env.ADMIN_EMAIL!));
  if (existing.length > 0) {
    console.log("Admin already exists.");
    process.exit(0);
  }

  // Buat user
  await auth.api.signUpEmail({
    body: {
      name: "Admin",
      email: process.env.ADMIN_EMAIL!,
      password: process.env.ADMIN_PASSWORD!,
    },
  });

  // Update role jadi admin
  await db
    .update(user)
    .set({ role: "admin" })
    .where(eq(user.email, process.env.ADMIN_EMAIL!));

  console.log("Admin created:", process.env.ADMIN_EMAIL);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

### Jalankan:

```bash
pnpm db:seed
```

> Kalau belum bikin script di Step 5.5, pakai command manual: `pnpm exec tsx server/database/seed.ts`
>
> Seed hanya perlu dijalankan **sekali** di awal. Kalau dijalankan lagi, script akan detect "admin already exists" dan exit.

---

## Step 9 — Test Endpoint Auth

Sebelum bikin halaman frontend, pastikan endpoint jalan:

```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","password":"password123"}'
```

Response berhasil → JSON data user. Cek juga tabel `user` di Drizzle Studio.

---

## Step 10 — UI dengan Nuxt UI Components

### Komponen Nuxt UI yang Dipakai

| Komponen     | Dari                         | Fungsi                                          |
| ------------ | ---------------------------- | ----------------------------------------------- |
| `UApp`       | `app.vue`                    | Root wrapper, provides global config            |
| `UHeader`    | `app.vue`                    | Navbar/header responsif                         |
| `UMain`      | `app.vue`                    | Konten utama layout                             |
| `UContainer` | `app.vue`                    | Center & constrain width konten                 |
| `UFooter`    | `app.vue`                    | Footer                                          |
| `UAuthForm`  | `login.vue` / `register.vue` | Form auth built-in (fields, validation, submit) |
| `UPageCard`  | `login.vue` / `register.vue` | Card wrapper untuk centering form               |
| `UCard`      | `profile.vue`                | Card untuk display info                         |
| `UBadge`     | `profile.vue`                | Badge untuk role                                |

### Struktur Folder UI (Final)

```
app/
├── app.vue              # UApp + UHeader + UMain + UContainer + UFooter
├── pages/
│   ├── index.vue        # Home
│   ├── login.vue        # UAuthForm + UPageCard
│   ├── register.vue     # UAuthForm + UPageCard
│   ├── profile/
│   │   └── index.vue    # UCard + UBadge (protected)
│   └── admin/
│       └── index.vue    # Admin dashboard (protected)
└── middleware/
    ├── auth.ts          # Cek login
    └── auth-admin.ts    # Cek login + role admin
```

> **Tidak perlu `layouts/default.vue` atau `components/AppNavbar.vue`** — semua layout di-handle oleh `UHeader`/`UFooter` langsung di `app.vue`.

---

### File 1: `app/app.vue`

```vue
<script setup>
import { authClient } from "~~/lib/auth-client";

useHead({
  meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
  link: [{ rel: "icon", href: "/favicon.ico" }],
  htmlAttrs: {
    lang: "en",
  },
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
        <NuxtPage />
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
  </UApp>
</template>
```

### Penjelasan `app.vue`

| Bagian         | Fungsi                                                                            |
| -------------- | --------------------------------------------------------------------------------- |
| `UApp`         | Root wrapper dari Nuxt UI. Provides global config, toast, tooltip, modal provider |
| `UHeader`      | Komponen header responsif. Punya slot `#title` (logo), `#right` (aksi)            |
| `UMain`        | Wrapper konten utama. Otomatis padding dan spacing                                |
| `UContainer`   | Center & constrain width konten (max-width via CSS variable)                      |
| `USeparator`   | Garis pemisah visual antara main dan footer                                       |
| `UFooter`      | Footer responsif. Slot `#left`, `#right`                                          |
| `session.data` | Dari `authClient.useSession()`. Reaktif — auto-update kalau login/logout          |

> `UHeader` ditempatkan langsung di `app.vue` karena project ini hanya memiliki 1 layout. Jika nanti butuh layout berbeda, pindahkan ke `layouts/`.

---

### File 2: `app/pages/login.vue`

```vue
<script setup lang="ts">
import { z } from "zod";
import { authClient } from "~~/lib/auth-client";
import type { FormSubmitEvent, AuthFormField } from "@nuxt/ui";

const errorMsg = ref("");
const loading = ref(false);

const fields: AuthFormField[] = [
  {
    name: "email",
    type: "email",
    label: "Email",
    placeholder: "Enter your email",
    required: true,
  },
  {
    name: "password",
    type: "password",
    label: "Password",
    placeholder: "Enter your password",
    required: true,
  },
];

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

type Schema = z.output<typeof schema>;

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true;
  errorMsg.value = "";

  const { error } = await authClient.signIn.email({
    email: event.data.email,
    password: event.data.password,
  });

  loading.value = false;

  if (error) {
    errorMsg.value = error.message ?? "Login failed";
    return;
  }

  navigateTo("/");
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 py-10">
    <UPageCard class="w-full max-w-md">
      <UAuthForm
        :schema="schema"
        :fields="fields"
        title="Login"
        description="Enter your credentials to access your account."
        icon="i-lucide-lock"
        :submit="{ label: 'Login', loading: loading, block: true }"
        @submit="onSubmit"
      >
        <template #footer>
          <p class="text-sm text-center text-muted">
            Belum punya akun?
            <NuxtLink to="/register" class="text-primary font-medium"
              >Register</NuxtLink
            >
          </p>
        </template>
      </UAuthForm>
      <p v-if="errorMsg" class="text-red-500 text-sm text-center mt-4">
        {{ errorMsg }}
      </p>
    </UPageCard>
  </div>
</template>
```

### Penjelasan `login.vue`

| Bagian         | Fungsi                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------- |
| `UAuthForm`    | Form auth built-in dari Nuxt UI. Handle field rendering, state, submit button                |
| `fields`       | Array konfigurasi field (email, password). `AuthFormField[]` type dari `@nuxt/ui`            |
| `schema`       | Zod schema untuk validasi runtime. `email` harus valid format, `password` tidak boleh kosong |
| `onSubmit`     | Handler saat form valid. Panggil `authClient.signIn.email()` → kirim ke `/api/auth/sign-in`  |
| `UPageCard`    | Card wrapper dengan max-width dan centering                                                  |
| `#footer` slot | Custom footer form untuk link ke halaman Register                                            |

**Flow Login:**

1. User isi email + password → klik Login
2. `UAuthForm` validasi dulu pakai Zod schema
3. Kalau valid, trigger `@submit` → panggil `onSubmit`
4. `authClient.signIn.email()` kirim ke Better Auth endpoint
5. Kalau sukses, server set cookie session → navbar re-render
6. `navigateTo("/")` redirect ke home

---

### File 3: `app/pages/register.vue`

```vue
<script setup lang="ts">
import { z } from "zod";
import { authClient } from "~~/lib/auth-client";
import type { FormSubmitEvent, AuthFormField } from "@nuxt/ui";

const errorMsg = ref("");
const loading = ref(false);

const fields: AuthFormField[] = [
  {
    name: "name",
    type: "text",
    label: "Name",
    placeholder: "Enter your name",
    required: true,
  },
  {
    name: "email",
    type: "email",
    label: "Email",
    placeholder: "Enter your email",
    required: true,
  },
  {
    name: "password",
    type: "password",
    label: "Password",
    placeholder: "Enter your password",
    required: true,
  },
];

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

type Schema = z.output<typeof schema>;

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true;
  errorMsg.value = "";

  const { error } = await authClient.signUp.email({
    name: event.data.name,
    email: event.data.email,
    password: event.data.password,
  });

  loading.value = false;

  if (error) {
    errorMsg.value = error.message ?? "Registration failed";
    return;
  }

  navigateTo("/");
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 py-10">
    <UPageCard class="w-full max-w-md">
      <UAuthForm
        :schema="schema"
        :fields="fields"
        title="Register"
        description="Create a new account to get started."
        icon="i-lucide-user-plus"
        :submit="{ label: 'Register', loading: loading, block: true }"
        @submit="onSubmit"
      >
        <template #footer>
          <p class="text-sm text-center text-muted">
            Sudah punya akun?
            <NuxtLink to="/login" class="text-primary font-medium"
              >Login</NuxtLink
            >
          </p>
        </template>
      </UAuthForm>
      <p v-if="errorMsg" class="text-red-500 text-sm text-center mt-4">
        {{ errorMsg }}
      </p>
    </UPageCard>
  </div>
</template>
```

### Penjelasan `register.vue`

Sama struktur dengan `login.vue`, bedanya:

| Perbedaan   | Login                       | Register                    |
| ----------- | --------------------------- | --------------------------- |
| Fields      | 2 (email, password)         | 3 (name, email, password)   |
| Title       | "Login"                     | "Register"                  |
| API         | `authClient.signIn.email()` | `authClient.signUp.email()` |
| Footer link | ke `/register`              | ke `/login`                 |
| Icon        | `i-lucide-lock`             | `i-lucide-user-plus`        |

**Flow Register:**

1. User isi name + email + password → klik Register
2. `UAuthForm` validasi pakai Zod (name tidak boleh kosong, email valid, password tidak kosong)
3. `authClient.signUp.email()` kirim ke `/api/auth/sign-up`
4. Server bikin user dengan `role: "user"` (default dari `additionalFields`)
5. Kalau sukses, auto-login → set cookie session → navbar re-render
6. Redirect ke home

---

### File 4: `app/pages/profile/index.vue`

```vue
<script setup lang="ts">
import { authClient } from "~~/lib/auth-client";

definePageMeta({ middleware: "auth" });

const session = authClient.useSession();
</script>

<template>
  <div class="py-6">
    <h1 class="text-2xl font-bold">Profile</h1>
    <UCard class="mt-4">
      <template #header>
        <h2 class="text-lg font-semibold">User Info</h2>
      </template>
      <div v-if="session.data" class="space-y-2">
        <p><strong>Name:</strong> {{ session.data.user.name }}</p>
        <p><strong>Email:</strong> {{ session.data.user.email }}</p>
        <p>
          <strong>Role:</strong>
          <UBadge
            :label="session.data.user.role"
            :color="session.data.user.role === 'admin' ? 'error' : 'primary'"
          />
        </p>
      </div>
    </UCard>
  </div>
</template>
```

### Penjelasan `profile/index.vue`

| Bagian                                   | Fungsi                                                          |
| ---------------------------------------- | --------------------------------------------------------------- |
| `definePageMeta({ middleware: "auth" })` | Proteksi route. Kalau belum login → redirect ke `/login`        |
| `UCard`                                  | Card komponen dari Nuxt UI. Slot `#header` untuk judul card     |
| `session.data`                           | Data user dari `useSession()` — name, email, role               |
| `UBadge`                                 | Badge komponen. Color "error" untuk admin, "primary" untuk user |

> `UCard` digunakan agar tampilan lebih terstruktur dengan border, padding, shadow, dan slot header.

---

### File 5: `app/pages/admin/index.vue`

```vue
<script setup lang="ts">
definePageMeta({ middleware: "auth-admin" });
</script>

<template>
  <div class="py-6">
    <h1 class="text-2xl font-bold">Admin Dashboard</h1>
    <p class="text-muted mt-2">Hanya admin yang bisa akses halaman ini.</p>
  </div>
</template>
```

### Penjelasan `admin/index.vue`

| Bagian                                         | Fungsi                                                 |
| ---------------------------------------------- | ------------------------------------------------------ |
| `definePageMeta({ middleware: "auth-admin" })` | Proteksi double: (1) harus login, (2) harus role admin |
| `text-muted`                                   | Kelas utility dari Nuxt UI untuk text gray             |

**Behavior Middleware `auth-admin`:**

1. Cek session — kalau tidak ada → redirect `/login`
2. Cek `session.data.user.role` — kalau bukan `"admin"` → redirect `/`

User biasa yang coba akses `/admin` akan di-kick ke home. Hanya admin (dari seed) yang bisa masuk.

---

## Step 11 — Middleware Proteksi Route

### `app/middleware/auth.ts`

```ts
import { authClient } from "~~/lib/auth-client";

export default defineNuxtRouteMiddleware(async () => {
  const session = await authClient.getSession();
  if (!session.data) return navigateTo("/login");
});
```

### `app/middleware/auth-admin.ts`

```ts
import { authClient } from "~~/lib/auth-client";

export default defineNuxtRouteMiddleware(async () => {
  const session = await authClient.getSession();
  if (!session.data) return navigateTo("/login");
  if (session.data.user.role !== "admin") return navigateTo("/");
});
```

### Pakai di Page:

```ts
definePageMeta({ middleware: "auth" }); // profile
definePageMeta({ middleware: "auth-admin" }); // admin
```

### Alias Import Penting

- `~` / `@` → `app/`
- `~~` / `@@` → root project

Karena `server/` dan `lib/` ada di luar `app/`, import dari `app/pages/*.vue` ke sana **wajib pakai `~~/`**.

---

## Troubleshooting

| Error                                     | Penyebab                                   | Fix                                              |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `BETTER_AUTH_SECRET is not defined`       | `.env` tidak kebaca / server belum restart | Restart `pnpm dev`, pastikan `.env` di root      |
| `schema.ts` tetap kosong setelah generate | Step 4 belum lengkap                       | Pastikan `server/utils/auth.ts` sudah lengkap    |
| Tabel `user` tidak ada                    | Lupa `generate` + `migrate`                | Jalankan kedua command                           |
| Seed gagal: `ADMIN_EMAIL undefined`       | `.env` tidak kebaca script standalone      | Pastikan `import "dotenv/config"` di `seed.ts`   |
| `~~/server/...` module not found          | Pakai `~/` bukan `~~/`                     | Ganti ke `~~/` untuk import ke root-level folder |
| Navbar tidak reaktif                      | Pakai `getSession()` di komponen           | Ganti ke `useSession()` untuk UI                 |
| Redirect loop                             | Middleware jalan sebelum session resolve   | Pastikan `await` session                         |
| `session.data.user.role` undefined        | `role` belum di `additionalFields`         | Tambahkan di config Better Auth (Step 4)         |
