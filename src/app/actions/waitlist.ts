"use server";

import { cookies, headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { type ActionResult, attempt } from "./result";

export type WaitlistResult = { position: number | null; total: number | null; shareUrl: string; referrals: number; firstName: string | null; gift: string; again: boolean };

const COOKIE = "mx_waitlist";

/** Join the waitlist from the launch page. Remembers the visitor's place in a cookie. */
export async function joinWaitlistAction(_: ActionResult<WaitlistResult> | null, f: FormData): Promise<ActionResult<WaitlistResult>> {
  const h = await headers();
  const xff = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const ip = h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? xff[xff.length - 1] ?? "local";
  if (!rateLimit(`waitlist:${ip}`, { capacity: 6, perMinute: 2 })) return { ok: false, error: "Too many sign-ups from this connection. Please wait a minute." };
  // Bots fill every field; people never see this one.
  if (String(f.get("website") ?? "")) return { ok: false, error: "Please try again." };
  const s = (k: string) => String(f.get(k) ?? "").trim() || undefined;
  return attempt(async () => {
    const w = await import("@/server/waitlist");
    const { entry, created } = await w.joinWaitlist({
      email: String(f.get("email") ?? ""),
      firstName: s("firstName"),
      clubCode: s("clubCode"),
      over18: (f.get("over18") === "on") as true,
      marketingOptIn: f.get("marketingOptIn") === "on",
      ref: s("ref"),
      utmSource: s("utm_source"),
      utmMedium: s("utm_medium"),
      utmCampaign: s("utm_campaign"),
      referrerHost: s("referrerHost"),
    });
    const [status, gift] = await Promise.all([w.waitlistStatus(entry.id), w.launchGiftName()]);
    if (created && status?.position) {
      const { sendEmail } = await import("@/server/email/send");
      const unsub = w.waitlistUnsubUrl(entry.id);
      await sendEmail(
        "waitlistJoined",
        { email: entry.email },
        { name: entry.firstName ?? "there", position: status.position, total: status.total ?? status.position, shareUrl: status.shareUrl, gift, perFriend: w.PLACES_PER_FRIEND, unsubscribeUrl: unsub },
        `waitlist-joined:${entry.id}`,
        { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      );
    }
    (await cookies()).set(COOKIE, entry.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 365 * 86_400, path: "/" });
    return { position: status?.position ?? null, total: status?.total ?? null, shareUrl: status?.shareUrl ?? "", referrals: status?.referrals ?? 0, firstName: entry.firstName, gift, again: !created };
  });
}
