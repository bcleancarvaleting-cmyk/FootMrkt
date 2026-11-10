import { db } from "../db";
import { EMAILS, type EmailTemplate } from "./templates";

/**
 * Transactional email. Every email is written to the EmailLog outbox first, then sent through
 * Resend when RESEND_API_KEY is set (otherwise it's logged only and visible in Admin → Emails).
 * Never throws: an email problem must never break a purchase, entry or sign-up. Optional
 * dedupeKey stops repeats (e.g. one results email per match per manager).
 */
export async function sendEmail<T extends EmailTemplate>(
  template: T,
  to: { userId?: string; email: string },
  data: Parameters<(typeof EMAILS)[T]>[0],
  dedupeKey?: string,
) {
  try {
    const { subject, html, text } = (EMAILS[template] as (d: typeof data) => { subject: string; html: string; text: string })(data);
    if (dedupeKey && (await db.emailLog.findUnique({ where: { dedupeKey } }))) return;
    const log = await db.emailLog.create({ data: { userId: to.userId, to: to.email, template, subject, dedupeKey } });
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      await db.emailLog.update({ where: { id: log.id }, data: { status: "LOGGED" } });
      return;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "MATCHX <hello@matchx.app>", to: [to.email], subject, html, text }),
    });
    await db.emailLog.update({ where: { id: log.id }, data: res.ok ? { status: "SENT", sentAt: new Date() } : { status: "FAILED", error: `${res.status} ${(await res.text()).slice(0, 300)}` } });
  } catch (e) {
    console.error("email failed", template, e);
  }
}

/** Send to a user by id (looks up their address). */
export async function emailUser<T extends EmailTemplate>(userId: string, template: T, data: Omit<Parameters<(typeof EMAILS)[T]>[0], "name">, dedupeKey?: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { email: true, displayName: true, status: true } }).catch(() => null);
  if (!u || u.status !== "ACTIVE") return;
  await sendEmail(template, { userId, email: u.email }, { ...data, name: u.displayName } as Parameters<(typeof EMAILS)[T]>[0], dedupeKey);
}
