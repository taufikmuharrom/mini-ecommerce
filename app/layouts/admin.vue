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
