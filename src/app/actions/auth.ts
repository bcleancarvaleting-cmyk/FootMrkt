"use server";

import { cookies, headers } from "next/headers";
import { sendEmail } from "@/server/email/send";
import { APP_URL } from "@/server/email/templates";
import { redirect } from "next/navigation";
import { authenticate, registerUser } from "@/server/auth/accounts";
import { readPendingLogin, requestPasswordReset, resetPassword, signPendingLogin, verifySecondFactor } from "@/server/auth/security";
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
      clubName: String(form.get("clubName") ?? "").trim() || undefined,
    }),
  );
  if (!res.ok) return res;
  await startSession(res.data.user.id);
  await sendEmail("welcome", { userId: res.data.user.id, email: res.data.user.email }, { name: res.data.user.displayName, verifyUrl: `${APP_URL}/verify?token=${res.data.emailVerificationToken}` }, `welcome:${res.data.user.id}`);
  // Step 1: design the club crest, then on to the Starter Pack.
  redirect(`/account/club/crest?welcome=1`);
}

export async function loginAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "");
  if (!rateLimit(await clientKey(`login:${email.toLowerCase()}`), { capacity: 8, perMinute: 4 })) {
    return { ok: false, error: "Too many attempts. Please wait a minute and try again." };
  }
  const res = await attempt(() => authenticate(email, String(form.get("password") ?? "")));
  if (!res.ok) return res;
  const next = safeNext(form.get("next"));
  if (res.data.totpEnabledAt) {
    // Password OK — now the code from their authenticator app.
    (await cookies()).set(PENDING_COOKIE, signPendingLogin(res.data.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
    redirect(`/login/verify?next=${encodeURIComponent(next)}`);
  }
  await startSession(res.data.id);
  redirect(next);
}

const PENDING_COOKIE = "mx_2fa";
const safeNext = (v: FormDataEntryValue | null) => {
  const n = String(v ?? "/");
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
};

export async function verifyLoginCodeAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const jar = await cookies();
  const userId = readPendingLogin(jar.get(PENDING_COOKIE)?.value);
  if (!userId) return { ok: false, error: "That took too long — please log in again." };
  if (!rateLimit(`2fa:${userId}`, { capacity: 6, perMinute: 3 })) return { ok: false, error: "Too many tries. Please wait a minute." };
  if (!(await verifySecondFactor(userId, String(form.get("code") ?? "")))) return { ok: false, error: "That code isn't right. Use the newest code from your app, or one of your backup codes." };
  jar.delete(PENDING_COOKIE);
  await startSession(userId);
  redirect(safeNext(form.get("next")));
}

export async function forgotPasswordAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim();
  if (!rateLimit(await clientKey(`forgot:${email.toLowerCase()}`), { capacity: 3, perMinute: 1 })) return { ok: false, error: "Please wait a minute before asking again." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "Enter the email address you signed up with." };
  await requestPasswordReset(email);
  return { ok: true, data: undefined, message: "If that email has an account, a reset link is on its way. Check your inbox (and spam)." };
}

export async function resetPasswordAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const pw = String(form.get("password") ?? "");
  if (pw !== String(form.get("confirm") ?? "")) return { ok: false, error: "The two passwords don't match." };
  const res = await attempt(() => resetPassword(String(form.get("token") ?? ""), pw));
  if (!res.ok) return res;
  redirect("/login?reset=1");
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}
