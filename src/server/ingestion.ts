import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { FootballDataProvider, ProviderMessage } from "@/providers/football/types";
import { db } from "./db";

/**
 * Idempotent ingestion of provider messages (spec §6.4, §13, §15).
 *
 * 1. The raw message is stored once in ProviderEvent, keyed by (provider, providerEventId).
 *    A replay of the same id is a no-op.
 * 2. PLAYER_STATS become a PlayerMatchStat revision. Only the highest revision is current, so a
 *    correction replaces — never adds to — the previous line, and stale/out-of-order revisions
 *    are recorded but ignored.
 */
export interface IngestReport {
  received: number;
  duplicates: number;
  applied: number;
  stale: number;
  unknown: number;
}

export async function ingestMessages(provider: FootballDataProvider, messages: ProviderMessage[]): Promise<IngestReport> {
  const report: IngestReport = { received: messages.length, duplicates: 0, applied: 0, stale: 0, unknown: 0 };
  if (!messages.length) return report;

  const fixtureIds = [...new Set(messages.map((m) => m.providerFixtureId))];
  const fixtures = await db.fixture.findMany({ where: { provider: provider.name, providerFixtureId: { in: fixtureIds } } });
  const fixtureByRef = new Map(fixtures.map((f) => [f.providerFixtureId, f]));
  const playerRefs = [...new Set(messages.map((m) => m.playerRef).filter((r): r is string => !!r))];
  const players = playerRefs.length
    ? await db.$queryRaw<Array<{ id: string; ref: string }>>`
        SELECT id, "providerRefs"->>${provider.name} AS ref FROM "Player"
        WHERE "providerRefs"->>${provider.name} = ANY(${playerRefs}::text[])`
    : [];
  const playerByRef = new Map(players.map((p) => [p.ref, p.id]));

  for (const msg of messages) {
    const payloadHash = createHash("sha256").update(JSON.stringify(msg.payload)).digest("hex");
    const outcome = await db.$transaction(async (tx) => {
      const inserted = await tx.providerEvent.createMany({
        data: [
          {
            provider: provider.name,
            providerEventId: msg.providerEventId,
            kind: msg.kind,
            payload: msg as unknown as Prisma.InputJsonValue,
            payloadHash,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return "duplicate" as const;

      const fixture = fixtureByRef.get(msg.providerFixtureId);
      if (!fixture) return "unknown" as const;

      if (msg.kind === "FIXTURE_RESULT") {
        const r = provider.normaliseFixture(msg.payload);
        const terminal = r.status === "FINISHED" || r.status === "POSTPONED" || r.status === "ABANDONED";
        await tx.fixture.update({
          where: { id: fixture.id },
          data: { status: r.status, homeGoals: r.homeGoals, awayGoals: r.awayGoals, finalisedAt: terminal ? new Date() : null },
        });
      } else {
        const playerId = msg.playerRef ? playerByRef.get(msg.playerRef) : undefined;
        if (!playerId) return "unknown" as const;
        const current = await tx.playerMatchStat.findFirst({
          where: { fixtureId: fixture.id, playerId, isCurrent: true },
        });
        if (current && current.revision >= msg.revision) return "stale" as const;
        if (current) await tx.playerMatchStat.update({ where: { id: current.id }, data: { isCurrent: false } });
        await tx.playerMatchStat.create({
          data: {
            fixtureId: fixture.id,
            playerId,
            revision: msg.revision,
            isCurrent: true,
            stats: provider.normaliseStats(msg.payload) as unknown as Prisma.InputJsonValue,
            sourceEventId: msg.providerEventId,
          },
        });
      }
      await tx.providerEvent.update({
        where: { provider_providerEventId: { provider: provider.name, providerEventId: msg.providerEventId } },
        data: { processedAt: new Date() },
      });
      return "applied" as const;
    });
    if (outcome === "duplicate") report.duplicates++;
    else if (outcome === "unknown") report.unknown++;
    else if (outcome === "stale") report.stale++;
    else report.applied++;
  }
  return report;
}
