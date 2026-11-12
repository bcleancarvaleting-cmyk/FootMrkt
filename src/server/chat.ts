import { CHAT_ROOMS, CHAT_RULES, type ChatRoomId } from "@/config/chat";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "./audit";
import { db } from "./db";
import { DomainError, isUniqueViolation } from "./errors";
import { canModerate } from "./moderation";

export interface ChatMessageView {
  id: string;
  room: string;
  userId: string;
  displayName: string;
  foundingNumber: number | null;
  isMod: boolean;
  /** The MATCHX team (admins): shown with the X logo. */
  house?: boolean;
  body: string | null; // null when removed / hidden
  createdAt: string;
  removed: boolean;
}

export function isRoom(id: string): id is ChatRoomId {
  return CHAT_ROOMS.some((r) => r.id === id);
}

const LINK = /(https?:\/\/|www\.)|\b[a-z0-9-]+\.(com|net|org|io|co|uk|gg|xyz|tv|me|link|app)\b/i;

export function cleanBody(raw: string): string {
  const body = raw.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").replace(/\s+\n/g, "\n").trim();
  if (!body) throw new DomainError("EMPTY", "Type a message first.");
  if (body.length > CHAT_RULES.maxLength) throw new DomainError("TOO_LONG", `Keep messages under ${CHAT_RULES.maxLength} characters.`);
  if (CHAT_RULES.blockLinks && LINK.test(body)) throw new DomainError("NO_LINKS", "Links aren't allowed in chat — it helps keep everyone safe from scams.");
  return body;
}

export async function listMessages(room: ChatRoomId, opts: { after?: Date; limit?: number } = {}): Promise<ChatMessageView[]> {
  const rows = await db.chatMessage.findMany({
    where: { room, ...(opts.after ? { createdAt: { gt: opts.after } } : {}) },
    include: { user: { select: { displayName: true, role: true, foundingNumber: true } }, _count: { select: { reports: { where: { resolvedAt: null } } } } },
    orderBy: { createdAt: opts.after ? "asc" : "desc" },
    take: opts.limit ?? 60,
  });
  const ordered = opts.after ? rows : rows.reverse();
  return ordered.map((m) => {
    const hidden = !!m.removedAt || m._count.reports >= CHAT_RULES.autoHideReports;
    return {
      id: m.id,
      room: m.room,
      userId: m.userId,
      displayName: m.user.displayName,
      foundingNumber: m.user.foundingNumber,
      isMod: canModerate(m.user.role),
      house: m.user.role === "ADMIN",
      body: hidden ? null : m.body,
      createdAt: m.createdAt.toISOString(),
      removed: hidden,
    };
  });
}

export async function postMessage(userId: string, room: string, raw: string) {
  if (!isRoom(room)) throw new DomainError("NO_ROOM", "That chat room doesn't exist.");
  const body = cleanBody(raw);
  if (!rateLimit(`chat:${userId}`, { capacity: CHAT_RULES.burst, perMinute: CHAT_RULES.perMinute })) {
    throw new DomainError("SLOW_DOWN", "You're sending messages quickly — wait a few seconds.");
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.status !== "ACTIVE") throw new DomainError("MUTED", "Your account can't post in chat right now.");
  return db.chatMessage.create({ data: { room, userId, body } });
}

export async function reportMessage(userId: string, messageId: string, reason?: string) {
  const msg = await db.chatMessage.findUnique({ where: { id: messageId } });
  if (!msg) throw new DomainError("NOT_FOUND", "Message not found.");
  if (msg.userId === userId) throw new DomainError("OWN_MESSAGE", "You can't report your own message.");
  try {
    await db.chatReport.create({ data: { messageId, userId, reason: reason?.slice(0, 200) } });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e; // already reported by this user
  }
}

/** Moderators remove any message; authors can remove their own. Audited for moderators. */
export async function removeMessage(actor: { id: string; role: string }, messageId: string) {
  const msg = await db.chatMessage.findUnique({ where: { id: messageId } });
  if (!msg) throw new DomainError("NOT_FOUND", "Message not found.");
  const isMod = canModerate(actor.role);
  if (!isMod && msg.userId !== actor.id) throw new DomainError("FORBIDDEN", "You can only remove your own messages.");
  await db.chatMessage.update({ where: { id: messageId }, data: { removedAt: new Date(), removedBy: actor.id } });
  if (isMod && msg.userId !== actor.id) {
    await audit(db, { actorId: actor.id, action: "chat.remove", entityType: "ChatMessage", entityId: messageId, before: { body: msg.body, userId: msg.userId } });
  }
}

