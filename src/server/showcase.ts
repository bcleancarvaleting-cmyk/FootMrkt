import type { CardView } from "@/lib/view";
import { db } from "./db";
import { cardViews } from "./views";

/**
 * Cards of the game's best-known players for the front page and heroes: the No. 1 copy of each,
 * famous names first (in this order), then the most valuable top-flight players to fill.
 */
export const STAR_NAMES = [
  "Erling Haaland", "Mohamed Salah", "Bukayo Saka", "Cole Palmer", "Alexander Isak", "Florian Wirtz", "Declan Rice", "Bruno Fernandes",
  "Virgil van Dijk", "Martin Ødegaard", "Phil Foden", "Ollie Watkins", "Anthony Gordon", "Jarrod Bowen", "Morgan Rogers", "Bryan Mbeumo",
];

export async function starCards(category: "GOLD" | "SILVER" | "BRONZE", n: number, skip: string[] = []): Promise<CardView[]> {
  const named = await cardViews({ serial: 1, finish: null, template: { category, edition: "STANDARD", player: { displayName: { in: STAR_NAMES } } } }, undefined, 40);
  const ordered = named.filter((c) => !skip.includes(c.playerId)).sort((a, b) => STAR_NAMES.indexOf(a.name) - STAR_NAMES.indexOf(b.name));
  if (ordered.length >= n) return ordered.slice(0, n);
  // Fill with the most valuable top-flight players.
  const vals = await db.mPValuation.findMany({
    where: { category, player: { active: true, club: { league: { isTopFlight: true } } } },
    orderBy: { valueMp: "desc" },
    take: 80,
    select: { playerId: true },
  });
  const have = new Set([...ordered.map((c) => c.playerId), ...skip]);
  const ids = [...new Set(vals.map((v) => v.playerId))].filter((id) => !have.has(id)).slice(0, n - ordered.length);
  const fill = ids.length ? await cardViews({ serial: 1, finish: null, template: { category, edition: "STANDARD", playerId: { in: ids } } }, undefined, ids.length) : [];
  return [...ordered, ...fill.sort((a, b) => ids.indexOf(a.playerId) - ids.indexOf(b.playerId))].slice(0, n);
}
