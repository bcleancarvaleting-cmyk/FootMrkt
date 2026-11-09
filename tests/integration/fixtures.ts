import type { CardCategory, Position } from "@/generated/prisma/client";
import { FOOTBALL_PACKS } from "@/config/packs";
import { registerUser } from "@/server/auth/accounts";
import { db } from "@/server/db";
import { executeRelease, scheduleRelease } from "@/server/supply";

/** Wipe the dedicated test database (guarded in setup.ts to *_test databases only). */
export async function resetDb() {
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

const SQUAD: Array<[Position, number]> = [["GK", 2], ["DEF", 5], ["MID", 5], ["ATT", 4]];

/**
 * Small deterministic world: 2 leagues × 2 clubs × 16 players. In each club, players cycle
 * through BRONZE / SILVER / GOLD so every position has every category.
 */
export async function buildWorld(opts: { perTemplate?: Record<CardCategory, number> } = {}) {
  const sport = await db.sport.create({ data: { code: "football", name: "Football" } });
  for (const p of FOOTBALL_PACKS) {
    await db.packSku.create({
      data: { sportId: sport.id, code: p.code, version: p.version, name: p.name, kind: p.kind, priceMinor: p.priceMinor, config: p.config },
    });
  }
  const cats: CardCategory[] = ["BRONZE", "SILVER", "GOLD"];
  let n = 0;
  for (const [li, lg] of [
    { code: "T1", tier: 1, top: true },
    { code: "T2", tier: 2, top: false },
  ].entries()) {
    const league = await db.league.create({
      data: { sportId: sport.id, code: lg.code, name: lg.code, country: "ENG", tier: lg.tier, isTopFlight: lg.top },
    });
    for (let c = 0; c < 2; c++) {
      const club = await db.club.create({
        data: { leagueId: league.id, code: `C${li}${c}`, name: `Club ${li}${c}`, shortName: `C${li}${c}`, simStrength: 50 },
      });
      for (const [position, count] of SQUAD) {
        for (let i = 0; i < count; i++) {
          n++;
          const player = await db.player.create({
            data: {
              sportId: sport.id,
              clubId: club.id,
              firstName: "P",
              lastName: `${n}`,
              displayName: `P${n}`,
              position,
              nationality: "ENG",
              providerRefs: { sim: `sim-pl-${n}` },
            },
          });
          await db.cardTemplate.create({ data: { playerId: player.id, category: cats[i % 3], maxSupply: 20 } });
        }
      }
    }
  }
  const release = await scheduleRelease(sport.id, new Date(), { perTemplate: opts.perTemplate ?? { BRONZE: 3, SILVER: 3, GOLD: 3 }, overrides: {} }, null);
  await executeRelease(release.id, null);
  return sport;
}

let userSeq = 0;
export async function makeUser(name?: string) {
  userSeq++;
  const displayName = name ?? `manager${userSeq}`;
  const r = await registerUser({ email: `${displayName}@test.dev`, password: "correct-horse-battery", displayName });
  return { userId: r.user.id, starterEntitlementId: r.starterEntitlementId };
}
