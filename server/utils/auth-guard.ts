import { auth } from "./auth";
import type { H3Event } from "h3";

export interface UserWithRole {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  image?: string | null;
}

export interface SessionWithRole {
  session: {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
  };
  user: UserWithRole;
}

export async function getSession(
  event: H3Event,
): Promise<SessionWithRole | null> {
  try {
    const session = await auth.api.getSession({ headers: event.headers });
    return session as SessionWithRole;
  } catch {
    return null;
  }
}

export async function requireSession(event: H3Event) {
  const session = await getSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
  return session;
}

export async function requireAdmin(event: H3Event) {
  const session = await requireSession(event);
  if (session.user.role !== "admin") {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  return session;
}
