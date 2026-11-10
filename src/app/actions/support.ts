"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser, requireAdmin } from "@/server/auth/session";
import { createTicket, resolveTicket } from "@/server/support";
import { type ActionResult, attempt } from "./result";

export async function supportAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!rateLimit(`support:${user?.id ?? ip}`, { capacity: 3, perMinute: 1 })) return { ok: false, error: "Please wait a minute before sending another message." };
  const res = await attempt(() =>
    createTicket(user?.id ?? null, {
      email: String(f.get("email") ?? user?.email ?? ""),
      category: String(f.get("category") ?? "OTHER"),
      message: String(f.get("message") ?? ""),
      pagePath: String(f.get("from") ?? "") || undefined,
    }),
  );
  if (!res.ok) return res;
  return { ok: true, data: undefined, message: `Thanks — we've got it (ref ${res.data.ref}). We'll reply by email, usually within a day.` };
}

export async function resolveTicketAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => resolveTicket(admin.id, String(f.get("id")), String(f.get("note") ?? "").trim() || null), "Marked as resolved");
  revalidatePath("/admin/support");
  return res;
}
