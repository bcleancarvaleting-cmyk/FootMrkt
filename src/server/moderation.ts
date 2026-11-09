import type { UserRole } from "@/generated/prisma/client";
import { audit } from "./audit";
import { db, withTx } from "./db";
import { DomainError } from "./errors";

/**
 * Chat moderation (product decision 9 Nov 2026): the COLLECTR team (admins) are the moderators.
 * Anyone else becomes a moderator only by invitation from an admin, which they must accept.
 * Admins can revoke at any time. Every step is audited.
 */
export const canModerate = (role: UserRole | string) => role === "ADMIN" || role === "MODERATOR";

async function requireAdminActor(actorId: string) {
  const actor = await db.user.findUnique({ where: { id: actorId } });
  if (!actor || actor.role !== "ADMIN") throw new DomainError("FORBIDDEN", "Only admins can manage moderators.");
  return actor;
}

/** Invite a manager (by manager name or email) to become a moderator. */
export async function inviteModerator(actorId: string, who: string) {
  await requireAdminActor(actorId);
  const q = who.trim();
  if (!q) throw new DomainError("EMPTY", "Enter a manager name or email.");
  const user = await db.user.findFirst({ where: { OR: [{ displayName: { equals: q, mode: "insensitive" } }, { email: q.toLowerCase() }] } });
  if (!user) throw new DomainError("NOT_FOUND", "No manager with that name or email.");
  if (canModerate(user.role)) throw new DomainError("ALREADY", `${user.displayName} can already moderate.`);
  const pending = await db.moderatorInvite.findFirst({ where: { userId: user.id, acceptedAt: null, declinedAt: null, revokedAt: null } });
  if (pending) throw new DomainError("PENDING", `${user.displayName} already has an invitation waiting.`);
  const invite = await db.moderatorInvite.create({ data: { userId: user.id, invitedById: actorId } });
  await audit(db, { actorId, action: "moderator.invite", entityType: "User", entityId: user.id, after: { inviteId: invite.id } });
  return { invite, user };
}

export async function pendingInvite(userId: string) {
  return db.moderatorInvite.findFirst({
    where: { userId, acceptedAt: null, declinedAt: null, revokedAt: null },
    include: { invitedBy: { select: { displayName: true } } },
  });
}

export async function respondToInvite(userId: string, inviteId: string, accept: boolean) {
  return withTx(async (tx) => {
    const invite = await tx.moderatorInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.userId !== userId || invite.acceptedAt || invite.declinedAt || invite.revokedAt) {
      throw new DomainError("NOT_FOUND", "That invitation is no longer open.");
    }
    if (accept) {
      await tx.moderatorInvite.update({ where: { id: inviteId }, data: { acceptedAt: new Date() } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.role === "USER") await tx.user.update({ where: { id: userId }, data: { role: "MODERATOR" } });
    } else {
      await tx.moderatorInvite.update({ where: { id: inviteId }, data: { declinedAt: new Date() } });
    }
    await audit(tx, { actorId: userId, action: accept ? "moderator.accept" : "moderator.decline", entityType: "User", entityId: userId });
  });
}

export async function revokeModerator(actorId: string, userId: string) {
  await requireAdminActor(actorId);
  await withTx(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role === "ADMIN") throw new DomainError("FORBIDDEN", "Admins can't be removed here.");
    await tx.moderatorInvite.updateMany({ where: { userId, revokedAt: null, declinedAt: null }, data: { revokedAt: new Date() } });
    if (user.role === "MODERATOR") await tx.user.update({ where: { id: userId }, data: { role: "USER" } });
    await audit(tx, { actorId, action: "moderator.revoke", entityType: "User", entityId: userId });
  });
}

export async function moderatorRoster() {
  const [mods, invites] = await Promise.all([
    db.user.findMany({ where: { role: { in: ["ADMIN", "MODERATOR"] } }, select: { id: true, displayName: true, role: true }, orderBy: { displayName: "asc" } }),
    db.moderatorInvite.findMany({
      where: { acceptedAt: null, declinedAt: null, revokedAt: null },
      include: { user: { select: { displayName: true } }, invitedBy: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { mods, invites };
}

/** Reports waiting for a moderator. */
export async function reportQueue(limit = 50) {
  return db.chatMessage.findMany({
    where: { removedAt: null, reports: { some: { resolvedAt: null } } },
    include: {
      user: { select: { displayName: true } },
      reports: { where: { resolvedAt: null }, include: { user: { select: { displayName: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Keep a reported message: clears its open reports (and un-hides it). */
export async function keepMessage(actor: { id: string; role: string }, messageId: string) {
  if (!canModerate(actor.role)) throw new DomainError("FORBIDDEN", "Moderators only.");
  const n = await db.chatReport.updateMany({ where: { messageId, resolvedAt: null }, data: { resolvedAt: new Date(), resolvedBy: actor.id } });
  await audit(db, { actorId: actor.id, action: "chat.keep", entityType: "ChatMessage", entityId: messageId, after: { reportsResolved: n.count } });
}
