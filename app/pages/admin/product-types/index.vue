<script setup lang="ts">
definePageMeta({
  layout: "admin",
  middleware: "auth-admin",
});

const toast = useToast();
const editingId = ref<string | null>(null);

const { data, refresh } = await useFetch("/api/product-types");

const state = reactive({
  name: "",
});

async function onSubmit() {
  if (editingId.value) {
    await $fetch(`/api/product-types/${editingId.value}`, {
      method: "PUT",
      body: { name: state.name },
    });
    toast.add({ title: "Product type updated", color: "success" });
  } else {
    await $fetch("/api/product-types", {
      method: "POST",
      body: { name: state.name },
    });
    toast.add({ title: "Product type created", color: "success" });
  }

  state.name = "";
  editingId.value = null;
  refresh();
}

function editType(type: { id: string; name: string }) {
  editingId.value = type.id;
  state.name = type.name;
}

function cancelEdit() {
  editingId.value = null;
  state.name = "";
}

async function deleteType(id: string) {
  if (!confirm("Are you sure?")) return;

  await $fetch(`/api/product-types/${id}`, { method: "DELETE" });
  toast.add({ title: "Product type deleted", color: "success" });
  refresh();
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Product Types</h1>

    <UCard class="max-w-2xl">
      <UForm :state="state" class="flex gap-4 items-end" @submit="onSubmit">
        <UFormField
          :label="editingId ? 'Edit Name' : 'New Type Name'"
          name="name"
          class="flex-1"
        >
          <UInput v-model="state.name" class="w-full" />
        </UFormField>

        <div class="flex gap-2">
          <UButton
            v-if="editingId"
            label="Cancel"
            variant="ghost"
            @click="cancelEdit"
          />
          <UButton type="submit" :label="editingId ? 'Update' : 'Add'" />
        </div>
      </UForm>
    </UCard>

    <UTable
      :data="data?.data || []"
      :columns="[
        { accessorKey: 'name', header: 'Name' },
        { accessorKey: 'slug', header: 'Slug' },
        { accessorKey: 'actions', header: 'Actions' },
      ]"
    >
      <template #actions-cell="{ row }">
        <div class="flex gap-2">
          <UButton
            icon="i-lucide-pencil"
            variant="ghost"
            @click="editType((row as any).original as { id: string; name: string })"
          />
          <UButton
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            @click="deleteType((row as any).original.id)"
          />
        </div>
      </template>
    </UTable>
  </div>
</template>
