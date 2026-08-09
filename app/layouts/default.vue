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

        <ClientOnly>
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
          <template #fallback>
            <UButton label="Login" to="/login" variant="ghost" />
            <UButton label="Register" to="/register" variant="outline" />
          </template>
        </ClientOnly>
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
