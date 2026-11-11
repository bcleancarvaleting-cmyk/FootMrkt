import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nameKey } from "@/providers/football/api-football";
import { SPORTMONKS_LEAGUES, type SmType, positionOf, smGet } from "@/providers/football/sportmonks";
import { sportmonksSeasonId } from "./live-data";
import type { DataLeague, WorldData } from "./seed-world";

/**
 * The 92 clubs and their current squads from Sportmonks, in the shape the game is set up from,
 * with Sportmonks ids so live stats link automatically. Club colours and kits come from the
 * development data file where the club matches by name (Sportmonks has no kit colours).
 * About 100 API calls.
 */
const LEAGUES = [
  { code: "EPL", name: "Premier League", tier: 1, isTopFlight: true },
  { code: "CHA", name: "Championship", tier: 2, isTopFlight: false },
  { code: "LG1", name: "League One", tier: 3, isTopFlight: false },
  { code: "LG2", name: "League Two", tier: 4, isTopFlight: false },
];

type OldClub = { name: string; short: string; article: string; primaryColour: string; secondaryColour: string; kit: Record<string, unknown> };
const clubKey = (s: string) => nameKey(s).replace(/\b(fc|afc|football club|the)\b/g, "").replace(/\s+/g, " ").trim();

interface SquadRow {
  player_id: number;
  jersey_number?: number | null;
  position_id?: number | null;
  position?: SmType | null;
  player?: {
    display_name?: string | null;
    common_name?: string | null;
    name?: string | null;
    position_id?: number | null;
    nationality?: { fifa_name?: string | null; iso3?: string | null; name?: string | null } | null;
  } | null;
}

function knownClubs(): OldClub[] {
  try {
    const file = join(process.cwd(), "prisma", "data", "football-2026-27.json");
    return (JSON.parse(readFileSync(file, "utf8")) as { leagues: Array<{ clubs: OldClub[] }> }).leagues.flatMap((l) => l.clubs);
  } catch {
    return [];
  }
}

export async function buildSportmonksData(log: (m: string) => void = () => {}): Promise<WorldData & { source: string; generatedAt: string }> {
  const oldClubs = knownClubs();
  const usedShort = new Set<string>();
  const generatedAt = new Date().toISOString();
  const leagues: DataLeague[] = [];
  for (const lg of LEAGUES) {
    const leagueId = SPORTMONKS_LEAGUES[lg.code];
    const seasonId = await sportmonksSeasonId(leagueId);
    const teams = await smGet<{ id: number; name: string; short_code?: string | null }>(`/teams/seasons/${seasonId}`);
    const clubs = [];
    for (const t of teams) {
      const prev = oldClubs.find((c) => clubKey(c.name) === clubKey(t.name)) ?? oldClubs.find((c) => clubKey(t.name).startsWith(clubKey(c.name)) || clubKey(c.name).startsWith(clubKey(t.name)));
      let short = (prev?.short ?? t.short_code ?? t.name.replace(/[^A-Za-z]/g, "").slice(0, 3)).toUpperCase().slice(0, 3);
      for (let n = 2; usedShort.has(short); n++) short = `${short.slice(0, 2)}${n}`;
      usedShort.add(short);
      const squad = await smGet<SquadRow>(`/squads/seasons/${seasonId}/teams/${t.id}`, { include: "player.nationality;position" });
      const players = squad
        .map((r) => {
          const position = positionOf({ position_id: r.position_id ?? r.player?.position_id, position: r.position });
          const name = r.player?.display_name ?? r.player?.common_name ?? r.player?.name;
          if (!position || !name) return null;
          const nat = r.player?.nationality;
          return { name, position, nationality: (nat?.fifa_name ?? nat?.iso3 ?? nat?.name ?? "").slice(0, 3).toUpperCase(), squadNumber: r.jersey_number ?? null, onLoan: false, smId: r.player_id };
        })
        .filter((p): p is NonNullable<typeof p> => !!p);
      clubs.push({
        name: t.name,
        short,
        smId: t.id,
        article: prev?.article ?? "",
        primaryColour: prev?.primaryColour ?? "#2a2f38",
        secondaryColour: prev?.secondaryColour ?? "#ffffff",
        kit: prev?.kit ?? {},
        revision: generatedAt,
        players,
      });
      if (!prev) log(`  ${t.name}: no club colours on file yet (generic colours used)`);
    }
    leagues.push({ ...lg, clubs });
    log(`${lg.name}: ${clubs.length} clubs, ${clubs.reduce((n, c) => n + c.players.length, 0)} players`);
  }
  return { season: "2026-27", source: "Sportmonks Football API v3", generatedAt, leagues };
}
