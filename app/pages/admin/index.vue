<script setup>
definePageMeta({
  layout: "admin",
  middleware: "auth-admin",
});
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold">Admin Dashboard</h1>
    <p class="text-muted mt-2">Selamat datang di panel admin.</p>
  </div>
</template>
