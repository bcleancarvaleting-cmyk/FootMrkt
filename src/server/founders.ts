import { audit } from "./audit";
import { withTx } from "./db";

/**
 * Founding members: everyone who joins while the FOUNDING_SIGNUPS flag is on gets a permanent
 * number and a badge next to their name. Founders-only freerolls use it.
 */
export async function backfillFoundingMembers(adminId: string) {
  return withTx(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242)`;
    const top = await tx.user.aggregate({ _max: { foundingNumber: true } });
    let n = top._max.foundingNumber ?? 0;
    const users = await tx.user.findMany({ where: { foundingNumber: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
    for (const u of users) await tx.user.update({ where: { id: u.id }, data: { foundingNumber: ++n } });
    await audit(tx, { actorId: adminId, action: "founding.backfill", entityType: "User", after: { added: users.length } });
    return users.length;
  });
}
