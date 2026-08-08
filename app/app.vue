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
          <UButton label="Logout" variant="outline" @click="handleLogout" />
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
