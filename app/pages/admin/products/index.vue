<script setup lang="ts">
import * as z from "zod";

definePageMeta({
  layout: "admin",
  middleware: "auth-admin",
});

interface ProductTypeRef {
  id: string;
  name: string;
  slug: string;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  stock: number;
  imageUrl?: string;
  productType?: ProductTypeRef | null;
}

const NO_CATEGORY_VALUE = "__none__";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.number().min(0, "Price must be a positive number"),
  stock: z.number().min(0, "Stock must be a positive number"),
  description: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  productTypeId: z
    .union([z.string().uuid(), z.literal(NO_CATEGORY_VALUE)])
    .optional(),
});

type Schema = z.output<typeof schema>;

const isModalOpen = ref(false);
const editingId = ref<string | null>(null);
const uploadingImage = ref(false);

const state = reactive<Schema>({
  name: "",
  price: 0,
  stock: 0,
  description: "",
  imageUrl: "",
  productTypeId: NO_CATEGORY_VALUE,
});

const toast = useToast();
const { data: products, refresh } = await useFetch("/api/products", {
  query: { limit: 100 },
});
const { data: categories } = await useFetch("/api/product-types");

const productTypeItems = computed(() => [
  { label: "No Category", value: NO_CATEGORY_VALUE },
  ...(categories.value?.data || []).map((c: ProductTypeRef) => ({
    label: c.name,
    value: c.id,
  })),
]);

function resetForm() {
  editingId.value = null;
  state.name = "";
  state.price = 0;
  state.stock = 0;
  state.description = "";
  state.imageUrl = "";
  state.productTypeId = NO_CATEGORY_VALUE;
}

function openCreateModal() {
  resetForm();
  isModalOpen.value = true;
}

function editProduct(product: Product) {
  editingId.value = product.id;
  state.name = product.name;
  state.price = product.price;
  state.stock = product.stock;
  state.description = product.description || "";
  state.imageUrl = product.imageUrl || "";
  state.productTypeId = product.productType?.id ?? NO_CATEGORY_VALUE;
  isModalOpen.value = true;
}

async function onImageSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  uploadingImage.value = true;

  try {
    const formData = new FormData();
    formData.append("image", file);

    const { url } = await $fetch("/api/upload/image", {
      method: "POST",
      body: formData,
    });

    state.imageUrl = url;
    toast.add({ title: "Image uploaded", color: "success" });
  } catch (err: any) {
    toast.add({
      title: err?.data?.statusMessage || "Image upload failed",
      color: "error",
    });
  } finally {
    uploadingImage.value = false;
  }
}

async function onSubmit() {
  const body = { ...state };

  if (body.productTypeId === NO_CATEGORY_VALUE) {
    body.productTypeId = undefined;
  }

  try {
    if (editingId.value) {
      await $fetch(`/api/products/${editingId.value}`, {
        method: "PUT",
        body,
      });
      toast.add({ title: "Product updated", color: "success" });
    } else {
      await $fetch("/api/products", {
        method: "POST",
        body,
      });
      toast.add({ title: "Product created", color: "success" });
    }

    isModalOpen.value = false;
    resetForm();
    refresh();
  } catch (err: any) {
    toast.add({
      title: err?.data?.statusMessage || "Failed to save product",
      color: "error",
    });
  }
}

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
      <UButton label="Add Product" @click="openCreateModal" />
    </div>

    <UTable
      :data="products?.data || []"
      :columns="[
        { accessorKey: 'name', header: 'Name' },
        { accessorKey: 'price', header: 'Price' },
        { accessorKey: 'stock', header: 'Stock' },
        { accessorKey: 'actions', header: 'Actions' },
      ]"
    >
      <template #price-cell="{ row }">
        Rp {{ (row as any).getValue("price").toLocaleString("id-ID") }}
      </template>

      <template #actions-cell="{ row }">
        <div class="flex gap-2">
          <UButton
            icon="i-lucide-pencil"
            variant="ghost"
            @click="editProduct((row as any).original as Product)"
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

    <UModal
      v-model:open="isModalOpen"
      :title="editingId ? 'Edit Product' : 'Add Product'"
      :description="
        editingId
          ? 'Update the product details below.'
          : 'Fill in the details to create a new product.'
      "
    >
      <template #body>
        <UForm
          :schema="schema"
          :state="state"
          class="space-y-4 w-full"
          @submit="onSubmit"
        >
          <UFormField label="Name" name="name">
            <UInput v-model="state.name" class="w-full" />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Price" name="price">
              <UInputNumber
                v-model="state.price"
                :min="0"
                :increment="false"
                :decrement="false"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Stock" name="stock">
              <UInputNumber v-model="state.stock" :min="0" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="Description" name="description">
            <UTextarea v-model="state.description" class="w-full" />
          </UFormField>

          <UFormField label="Product Image" name="imageUrl">
            <div class="space-y-2 w-full">
              <UInput
                type="file"
                accept="image/*"
                :disabled="uploadingImage"
                @change="onImageSelect"
              />

              <UInput
                v-model="state.imageUrl"
                placeholder="Image URL will appear here after upload"
                class="w-full"
                disabled
              />

              <img
                v-if="state.imageUrl"
                :src="state.imageUrl"
                alt="Preview"
                class="w-32 h-32 object-cover rounded-md border"
              />
            </div>
          </UFormField>

          <UFormField label="Category" name="productTypeId">
            <USelect
              v-model="state.productTypeId"
              :items="productTypeItems"
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-4">
            <UButton
              label="Cancel"
              variant="ghost"
              @click="
                () => {
                  isModalOpen = false;
                  resetForm();
                }
              "
            />
            <UButton type="submit" :label="editingId ? 'Update' : 'Save'" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
