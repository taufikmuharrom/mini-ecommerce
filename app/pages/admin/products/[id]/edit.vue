<script setup lang="ts">
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
  description?: string;
  price: number;
  stock: number;
  imageUrl?: string;
  productType?: ProductTypeRef;
}

interface ProductApiResponse {
  data: Product;
}

const route = useRoute();
const toast = useToast();
const isEdit = computed(() => route.name !== "admin-products-new");
const productId = route.params.id as string;

const { data: categories } = await useFetch("/api/product-types");
const { data: product } = await useFetch<ProductApiResponse>(
  `/api/products/${productId}`,
  {
    immediate: isEdit.value,
  },
);

const state = reactive({
  name: product.value?.data?.name || "",
  description: product.value?.data?.description || "",
  price: product.value?.data?.price || 0,
  stock: product.value?.data?.stock || 0,
  imageUrl: product.value?.data?.imageUrl || "",
  productTypeId: product.value?.data?.productType?.id || "",
});

const uploadingImage = ref(false);

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

  if (isEdit.value) {
    await $fetch(`/api/products/${productId}`, { method: "PUT", body });
  } else {
    await $fetch("/api/products", { method: "POST", body });
  }

  navigateTo("/admin/products");
}
</script>

<template>
  <UCard class="max-w-2xl">
    <template #header>
      <h1 class="text-xl font-bold">
        {{ isEdit ? "Edit" : "Create" }} Product
      </h1>
    </template>

    <UForm :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="Name" name="name">
        <UInput v-model="state.name" class="w-full" />
      </UFormField>

      <UFormField label="Description" name="description">
        <UTextarea v-model="state.description" class="w-full" />
      </UFormField>

      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Price" name="price">
          <UInputNumber v-model="state.price" :min="0" class="w-full" />
        </UFormField>

        <UFormField label="Stock" name="stock">
          <UInputNumber v-model="state.stock" :min="0" class="w-full" />
        </UFormField>
      </div>

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
          >
        </div>
      </UFormField>

      <UFormField label="Category" name="productTypeId">
        <USelect
          v-model="state.productTypeId"
          :items="[
            { label: 'No Category', value: '' },
            ...(categories?.data || []).map((c) => ({
              label: c.name,
              value: c.id,
            })),
          ]"
          class="w-full"
        />
      </UFormField>

      <div class="flex justify-end gap-2 pt-4">
        <UButton label="Cancel" variant="ghost" to="/admin/products" />
        <UButton type="submit" label="Save" />
      </div>
    </UForm>
  </UCard>
</template>
