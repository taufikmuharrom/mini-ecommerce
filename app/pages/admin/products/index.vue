<script setup lang="ts">
definePageMeta({
  layout: "admin",
  middleware: "auth-admin",
});

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

const toast = useToast();
const { data, refresh } = await useFetch("/api/products", {
  query: { limit: 100 },
});

async function deleteProduct(id: string) {
  if (!confirm("Are you sure?")) return;

  await $fetch(`/api/products/${id}`, { method: "DELETE" });
  toast.add({ title: "Product deleted", color: "success" });
  refresh();
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Products</h1>
      <UButton label="Add Product" to="/admin/products/new" />
    </div>

    <UTable
      :data="data?.data || []"
      :columns="[
        { accessorKey: 'name', header: 'Name' },
        { accessorKey: 'price', header: 'Price' },
        { accessorKey: 'stock', header: 'Stock' },
        { accessorKey: 'actions', header: 'Actions' },
      ]"
    >
      <template #price-cell="{ row }">
        Rp {{ (row as any).getValue('price').toLocaleString('id-ID') }}
      </template>

      <template #actions-cell="{ row }">
        <div class="flex gap-2">
          <UButton
            icon="i-lucide-pencil"
            variant="ghost"
            :to="`/admin/products/${(row as any).original.id}/edit`"
          />
          <UButton
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            @click="deleteProduct((row as any).original.id)"
          />
        </div>
      </template>
    </UTable>
  </div>
</template>
