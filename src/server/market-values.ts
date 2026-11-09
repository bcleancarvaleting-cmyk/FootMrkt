import { tierForValue } from "@/config/tiers";
import { type ParseResult, matchPastedValues } from "@/domain/market-values";
import { db } from "./db";
import { activeTier, applyMarketValues } from "./tiering";

export interface ValuePreviewRow {
  playerId: string;
  name: string;
  club: string | null;
  league: string | null;
  valueGbp: number;
  from: string | null;
  to: string;
}

/** Match pasted text against the catalogue and show what each player's tier would become. */
export async function previewPastedValues(text: string): Promise<{ rows: ValuePreviewRow[]; unmatched: ParseResult["unmatched"] }> {
  const players = await db.player.findMany({ where: { active: true }, include: { club: { include: { league: true } } } });
  const parsed = matchPastedValues(
    text.slice(0, 500_000),
    players.map((p) => ({ id: p.id, fullName: `${p.firstName} ${p.lastName}`.trim(), clubName: p.club?.name ?? null })),
  );
  const byId = new Map(players.map((p) => [p.id, p]));
  const rows: ValuePreviewRow[] = [];
  for (const m of parsed.matched) {
    const p = byId.get(m.playerId)!;
    rows.push({
      playerId: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      club: p.club?.name ?? null,
      league: p.club?.league.name ?? null,
      valueGbp: m.valueGbp,
      from: await activeTier(p.id),
      to: tierForValue(m.valueGbp),
    });
  }
  return { rows, unmatched: parsed.unmatched };
}

export async function applyPastedValues(text: string, source: string, actorId: string) {
  const { rows } = await previewPastedValues(text);
  return applyMarketValues(
    rows.map((r) => ({ playerId: r.playerId, valueGbp: r.valueGbp, source: source.slice(0, 120) || "manual paste", at: new Date() })),
    actorId,
  );
}
