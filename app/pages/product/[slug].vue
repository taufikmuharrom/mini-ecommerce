<script setup lang="ts">
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
const slug = route.params.slug as string;

const { data: response } = await useFetch<ProductApiResponse>(
  `/api/products/${slug}`,
);
const product = computed(() => response.value?.data);

const qty = ref(1);

useSeoMeta({
  title: product.value?.name
    ? `${product.value.name} | MiniShop`
    : "Product | MiniShop",
  description: product.value?.description || "",
});

function addToCart() {
  // Skeleton: fitur cart akan dibuat di phase 3
  alert(`Added ${qty.value} of ${product.value?.name} to cart`);
}
</script>

<template>
  <div v-if="product" class="py-8">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <img
        :src="product.imageUrl || 'https://placehold.co/600x400?text=No+Image'"
        alt=""
        class="w-full rounded-lg object-cover"
      >

      <div class="space-y-4">
        <UBadge
          v-if="product.productType"
          :label="product.productType.name"
          color="primary"
        />
        <h1 class="text-3xl font-bold">{{ product.name }}</h1>
        <p class="text-2xl font-semibold">
          Rp {{ product.price.toLocaleString("id-ID") }}
        </p>
        <p class="text-muted">{{ product.description }}</p>

        <div class="flex items-center gap-4">
          <UInputNumber v-model="qty" :min="1" :max="product.stock" />
          <UButton
            label="Add to Cart"
            icon="i-lucide-shopping-cart"
            :disabled="product.stock < 1"
            @click="addToCart"
          />
        </div>

        <p class="text-sm text-muted">Stock: {{ product.stock }}</p>
      </div>
    </div>
  </div>

  <div v-else class="py-10 text-center text-muted">Product not found.</div>
</template>
