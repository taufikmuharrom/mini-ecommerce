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
  slug: string;
}

interface ProductListApiResponse {
  data: Product[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface ProductTypeApiResponse {
  data: ProductTypeRef[];
}

const route = useRoute();
const router = useRouter();

const page = ref(Number(route.query.page) || 1);
const search = ref(String(route.query.q || ""));
const selectedCategory = ref(String(route.query.category || ""));

const { data, refresh, pending } = await useFetch<ProductListApiResponse>(
  "/api/products",
  {
    query: {
      page,
      q: search,
      category: selectedCategory,
      limit: 12,
    },
  },
);

const { data: categories } = await useFetch<ProductTypeApiResponse>(
  "/api/product-types",
);

function applyFilter() {
  page.value = 1;
  router.push({
    query: {
      page: page.value,
      q: search.value || undefined,
      category: selectedCategory.value || undefined,
    },
  });
}
</script>

<template>
  <div class="py-8 space-y-6">
    <h1 class="text-2xl font-bold">Products</h1>

    <!-- Filter -->
    <div class="flex flex-col sm:flex-row gap-4">
      <UInput
        v-model="search"
        placeholder="Search product..."
        icon="i-lucide-search"
        class="sm:w-64"
        @keyup.enter="applyFilter"
      />
      <USelect
        v-model="selectedCategory"
        :items="[
          { label: 'All Categories', value: '' },
          ...(categories?.data || []).map((c) => ({
            label: c.name,
            value: c.slug,
          })),
        ]"
        class="sm:w-48"
        @change="applyFilter"
      />
      <UButton label="Search" @click="applyFilter" />
    </div>

    <!-- Grid -->
    <div v-if="pending" class="text-center py-10">Loading...</div>

    <div
      v-else-if="data?.data?.length"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
    >
      <NuxtLink
        v-for="product in data.data"
        :key="product.id"
        :to="`/product/${product.slug}`"
        class="group"
      >
        <UCard>
          <img
            :src="
              product.imageUrl || 'https://placehold.co/400x300?text=No+Image'
            "
            alt=""
            class="w-full h-48 object-cover rounded-md mb-4"
          >
          <h2 class="font-semibold group-hover:text-primary transition-colors">
            {{ product.name }}
          </h2>
          <p class="text-sm text-muted line-clamp-2">
            {{ product.description }}
          </p>
          <p class="font-bold mt-2">
            Rp {{ product.price.toLocaleString("id-ID") }}
          </p>
        </UCard>
      </NuxtLink>
    </div>

    <div v-else class="text-center py-10 text-muted">No products found.</div>

    <!-- Pagination -->
    <div v-if="data?.meta?.totalPages && data.meta.totalPages > 1">
      <div class="flex justify-center gap-2 pt-6">
        <UButton
          label="Previous"
          variant="ghost"
          :disabled="page <= 1"
          @click="
            page--;
            applyFilter();
          "
        />
        <span class="self-center text-sm text-muted">
          Page {{ page }} of {{ data.meta.totalPages }}
        </span>
        <UButton
          label="Next"
          variant="ghost"
          :disabled="page >= data.meta.totalPages"
          @click="
            page++;
            applyFilter();
          "
        />
      </div>
    </div>
  </div>
</template>
