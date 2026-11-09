import type { Prisma } from "@/generated/prisma/client";
import type { Db, Tx } from "./db";

export interface AuditEntry {
  actorId: string | null; // null = system job
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

/** Append-only admin/system audit log (spec §12). Call inside the same transaction as the change. */
export async function audit(tx: Tx | Db, e: AuditEntry) {
  await tx.adminAuditLog.create({
    data: {
      actorId: e.actorId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      before: json(e.before),
      after: json(e.after),
    },
  });
}
