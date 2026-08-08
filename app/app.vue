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
