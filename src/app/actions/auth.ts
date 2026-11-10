"use server";

import { headers } from "next/headers";
import { sendEmail } from "@/server/email/send";
import { APP_URL } from "@/server/email/templates";
import { redirect } from "next/navigation";
import { authenticate, registerUser } from "@/server/auth/accounts";
import { endSession, startSession } from "@/server/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { type ActionResult, attempt } from "./result";

async function clientKey(prefix: string) {
  const h = await headers();
  return `${prefix}:${h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"}`;
}

export async function registerAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  if (!rateLimit(await clientKey("register"), { capacity: 5, perMinute: 1 })) {
    return { ok: false, error: "Too many sign-ups from this connection. Please wait a minute." };
  }
  if (form.get("terms") !== "on") return { ok: false, error: "Please accept the terms of use to continue." };
  const res = await attempt(() =>
    registerUser({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      displayName: String(form.get("displayName") ?? ""),
      ref: String(form.get("ref") ?? "") || undefined,
      favouriteClub: String(form.get("favouriteClub") ?? "") || undefined,
    }),
  );
  if (!res.ok) return res;
  await startSession(res.data.user.id);
  await sendEmail("welcome", { userId: res.data.user.id, email: res.data.user.email }, { name: res.data.user.displayName, verifyUrl: `${APP_URL}/verify?token=${res.data.emailVerificationToken}` }, `welcome:${res.data.user.id}`);
  redirect(`/packs?welcome=1`);
}

export async function loginAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "");
  if (!rateLimit(await clientKey(`login:${email.toLowerCase()}`), { capacity: 8, perMinute: 4 })) {
    return { ok: false, error: "Too many attempts. Please wait a minute and try again." };
  }
  const res = await attempt(() => authenticate(email, String(form.get("password") ?? "")));
  if (!res.ok) return res;
  await startSession(res.data.id);
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}
