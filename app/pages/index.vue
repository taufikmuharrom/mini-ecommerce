<script setup lang="ts">
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
  productType?: ProductTypeRef;
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

const ALL_CATEGORIES_VALUE = "all";

const page = ref(Number(route.query.page) || 1);
const search = ref(String(route.query.q || ""));
const selectedCategory = ref(
  String(route.query.category || ALL_CATEGORIES_VALUE),
);

const { data: categories } =
  await useFetch<ProductTypeApiResponse>("/api/product-types");

const apiCategory = computed(() =>
  selectedCategory.value === ALL_CATEGORIES_VALUE
    ? undefined
    : selectedCategory.value,
);

const { data, pending } = await useFetch<ProductListApiResponse>(
  "/api/products",
  {
    query: {
      page,
      q: search,
      category: apiCategory,
      limit: 12,
    },
  },
);

const featuredProduct = computed(() => data.value?.data?.[0]);

function applyFilter() {
  page.value = 1;
  router.push({
    query: {
      page: page.value,
      q: search.value || undefined,
      category: apiCategory.value,
    },
  });
}
</script>

<template>
  <div class="py-8 space-y-10">
    <!-- Hero -->
    <section
      v-if="featuredProduct"
      class="relative rounded-2xl overflow-hidden bg-muted"
    >
      <div class="grid md:grid-cols-2 gap-6 p-8">
        <img
          :src="
            featuredProduct.imageUrl ||
            'https://placehold.co/600x400?text=No+Image'
          "
          alt=""
          class="w-full h-64 object-cover rounded-xl"
        />

        <div class="flex flex-col justify-center space-y-4">
          <UBadge
            v-if="featuredProduct.productType"
            :label="featuredProduct.productType.name"
            class="w-fit"
          />
          <h1 class="text-4xl font-bold">{{ featuredProduct.name }}</h1>
          <p class="text-muted line-clamp-3">
            {{ featuredProduct.description }}
          </p>
          <UButton
            :to="`/product/${featuredProduct.slug}`"
            label="View Product"
            class="w-fit"
          />
        </div>
      </div>
    </section>

    <!-- Search & Filter -->
    <section class="flex flex-col sm:flex-row gap-4">
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
          { label: 'All Categories', value: ALL_CATEGORIES_VALUE },
          ...(categories?.data || []).map((c) => ({
            label: c.name,
            value: c.slug,
          })),
        ]"
        class="sm:w-48"
        @change="applyFilter"
      />
      <UButton label="Search" @click="applyFilter" />
    </section>

    <!-- Product List -->
    <section>
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
            />
            <h2
              class="font-semibold group-hover:text-primary transition-colors"
            >
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
    </section>

    <!-- Pagination -->
    <section v-if="data?.meta?.totalPages && data.meta.totalPages > 1">
      <div class="flex justify-center gap-2">
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
    </section>
  </div>
</template>
