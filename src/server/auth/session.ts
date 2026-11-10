import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { touchUser } from "../stats";
import { createSession, destroySession, userForSessionToken } from "./accounts";

const COOKIE = "collectr_session";

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const user = await userForSessionToken(token);
  if (!user) return null;
  await touchUser(user.id, user.lastSeenAt);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    foundingNumber: user.foundingNumber,
    emailVerified: !!user.emailVerifiedAt,
    emailVerificationToken: user.emailVerificationToken,
    createdAt: user.createdAt,
  };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export async function startSession(userId: string) {
  const { token, expiresAt } = await createSession(userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await destroySession(token);
  jar.delete(COOKIE);
}
