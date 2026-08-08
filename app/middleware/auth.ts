import { authClient } from "~~/lib/auth-client";

export default defineNuxtRouteMiddleware(async () => {
  const headers = import.meta.server ? useRequestHeaders(["cookie"]) : undefined;
  const session = await authClient.getSession({
    fetchOptions: headers ? { headers } : undefined,
  });
  if (!session.data) return navigateTo("/login");
});
