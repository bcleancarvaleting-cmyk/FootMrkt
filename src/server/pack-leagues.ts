import type { PackConfig } from "@/domain/packs/config";
import { PACK_LEAGUES, leaguesInPack, tierOf, type LeagueStock } from "@/domain/packs/pack-leagues";
export { PACK_LEAGUES, leaguesInPack, type LeagueStock };
import { FOOTBALL_PACKS } from "@/config/packs";
import { db } from "./db";

export interface PackLeague {
  code: string;
  name: string;
  logoUrl: string | null;
}

/** The league logos to print on each England pack (only leagues the pack really holds). */
export async function packLeagueBadges(codes: string[]): Promise<Record<string, PackLeague[]>> {
  const wanted = codes.filter((c) => tierOf(c) && FOOTBALL_PACKS.find((p) => p.code === c)?.region === "England");
  if (!wanted.length) return {};
  const [stock, leagues] = await Promise.all([
    db.$queryRaw<LeagueStock[]>`
      SELECT DISTINCT l.code, t.category::text AS category, l."isTopFlight", l.tier, l.country
      FROM "CardInstance" ci
      JOIN "CardTemplate" t ON t.id = ci."templateId"
      JOIN "Player" p ON p.id = t."playerId"
      JOIN "Club" c ON c.id = p."clubId"
      JOIN "League" l ON l.id = c."leagueId"
      WHERE ci."supplyState" IN ('AVAILABLE', 'RECIRCULATING') AND ci.packable
        AND t.edition = 'STANDARD' AND t.active AND p.active`,
    db.league.findMany({ orderBy: { tier: "asc" }, select: { code: true, name: true, logoUrl: true } }),
  ]);
  const out: Record<string, PackLeague[]> = {};
  for (const code of wanted) {
    const sku = FOOTBALL_PACKS.find((p) => p.code === code)!;
    const holds = leaguesInPack(sku.config as PackConfig, stock);
    const want = PACK_LEAGUES[tierOf(code)!];
    out[code] = leagues.filter((l) => want.includes(l.code) && holds.has(l.code));
  }
  return out;
}
