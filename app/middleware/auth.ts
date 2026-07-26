import { authClient } from "~~/lib/auth-client";

export default defineNuxtRouteMiddleware(async () => {
  const session = await authClient.getSession();
  if (!session.data) return navigateTo("/login");
});
