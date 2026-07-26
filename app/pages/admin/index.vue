<script setup lang="ts">
definePageMeta({ middleware: "auth-admin" });
</script>

<template>
  <div class="py-6">
    <h1 class="text-2xl font-bold">Admin Dashboard</h1>
    <p class="text-muted mt-2">Hanya admin yang bisa akses halaman ini.</p>
  </div>
</template>
