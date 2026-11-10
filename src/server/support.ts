import { z } from "zod";
import { audit } from "./audit";
import { db } from "./db";
import { sendEmail } from "./email/send";
import { reportError } from "./monitoring";

export const SUPPORT_CATEGORIES = [
  ["ACCOUNT", "My account or logging in"],
  ["PAYMENT", "A payment or my wallet"],
  ["CARDS", "Packs, cards or transfers"],
  ["MATCHES", "Matches, points or prizes"],
  ["SAFER_PLAY", "Safer play — I need help or a break"],
  ["BUG", "Something's broken"],
  ["OTHER", "Something else"],
] as const;

const TicketSchema = z.object({
  email: z.string().trim().email("Enter an email address we can reply to"),
  category: z.enum(SUPPORT_CATEGORIES.map(([c]) => c) as [string, ...string[]]),
  message: z.string().trim().min(10, "Tell us a bit more (at least 10 characters)").max(4000),
  pagePath: z.string().max(300).optional(),
});

export async function createTicket(userId: string | null, input: z.input<typeof TicketSchema>) {
  const data = TicketSchema.parse(input);
  const user = userId ? await db.user.findUnique({ where: { id: userId }, select: { email: true, displayName: true } }) : null;
  const t = await db.supportTicket.create({ data: { ...data, email: user?.email ?? data.email, userId } });
  const ref = t.id.slice(0, 6).toUpperCase();
  await sendEmail("supportReceived", { userId: userId ?? undefined, email: t.email }, { name: user?.displayName ?? "there", ref });
  // Safer-play requests shouldn't wait for someone to open the inbox.
  if (data.category === "SAFER_PLAY") await reportError("Safer play request", new Error(`Support ticket ${ref} needs a reply`), { from: t.email });
  return { ref };
}

export async function resolveTicket(adminId: string, id: string, note: string | null) {
  await db.supportTicket.update({ where: { id }, data: { status: "RESOLVED", adminNote: note, resolvedBy: adminId, resolvedAt: new Date() } });
  await audit(db, { actorId: adminId, action: "support.resolve", entityType: "SupportTicket", entityId: id, after: { note } });
}
