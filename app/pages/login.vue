<script setup lang="ts">
import { z } from "zod";
import { authClient } from "~~/lib/auth-client";
import type { FormSubmitEvent, AuthFormField } from "@nuxt/ui";

const errorMsg = ref("");
const loading = ref(false);

const fields: AuthFormField[] = [
  {
    name: "email",
    type: "email",
    label: "Email",
    placeholder: "Enter your email",
    required: true,
  },
  {
    name: "password",
    type: "password",
    label: "Password",
    placeholder: "Enter your password",
    required: true,
  },
];

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

type Schema = z.output<typeof schema>;

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true;
  errorMsg.value = "";

  const { error } = await authClient.signIn.email({
    email: event.data.email,
    password: event.data.password,
  });

  loading.value = false;

  if (error) {
    errorMsg.value = error.message ?? "Login failed";
    return;
  }

  const { data: sessionData } = await authClient.getSession();
  navigateTo(sessionData?.user.role === "admin" ? "/admin" : "/profile");
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 py-10">
    <UPageCard class="w-full max-w-md">
      <UAuthForm
        :schema="schema"
        :fields="fields"
        title="Login"
        description="Enter your credentials to access your account."
        icon="i-lucide-lock"
        :submit="{ label: 'Login', loading: loading, block: true }"
        @submit="onSubmit"
      >
        <template #footer>
          <p class="text-sm text-center text-muted">
            Belum punya akun?
            <NuxtLink to="/register" class="text-primary font-medium"
              >Register</NuxtLink
            >
          </p>
        </template>
      </UAuthForm>
      <p v-if="errorMsg" class="text-red-500 text-sm text-center mt-4">
        {{ errorMsg }}
      </p>
    </UPageCard>
  </div>
</template>
