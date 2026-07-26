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
            :label="session.data.user?.role"
            :color="session.data.user?.role === 'admin' ? 'error' : 'primary'"
          />
        </p>
      </div>
    </UCard>
  </div>
</template>
