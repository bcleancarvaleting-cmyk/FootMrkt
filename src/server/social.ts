import type { CardCategory } from "@/generated/prisma/client";
import type { CardView } from "@/lib/view";
import { db } from "./db";
import { dropBoard } from "./player-drops";
import { performanceTable } from "./top-performers";
import { CARD_INCLUDE, type CardWithTemplate, enrichCards } from "./views";

/**
 * Social content studio: promotional posters built from the real card designs. Every poster only
 * shows finishes a player can actually come in — a Rainbow for anyone, Ruby and Diamond only for
 * Gold players — so nothing advertised is impossible to pull.
 */
export type Finish = "RUBY" | "DIAMOND" | "RAINBOW";
const OF: Record<Finish, number> = { RUBY: 10, DIAMOND: 5, RAINBOW: 1 };

/** Finishes a player in this tier can really come in, rarest last. */
export function possibleFinishes(category: CardCategory): Finish[] {
  return category === "GOLD" ? ["RUBY", "DIAMOND", "RAINBOW"] : ["RAINBOW"];
}

/** Card faces for players (from their current tier's design), optionally in a finish. */
export async function posterCards(playerIds: string[], finish: Finish | null = null): Promise<CardView[]> {
  const templates = await db.cardTemplate.findMany({ where: { playerId: { in: playerIds }, edition: "STANDARD", active: true }, include: CARD_INCLUDE.template.include });
  const faces: CardWithTemplate[] = playerIds.flatMap((playerId) => {
    const template = templates.find((t) => t.playerId === playerId);
    if (!template) return [];
    return [{ id: `poster-${playerId}`, templateId: template.id, template, serial: 0, supplyState: "AVAILABLE", tradeStatus: "TRADEABLE", ownerId: null, lock: "NONE", lockRef: null, releaseId: null, recycledCount: 0, packable: true, loanGameweeks: null, finish: null, mintedAt: new Date(0), updatedAt: new Date(0) }];
  });
  const views = await enrichCards(faces);
  return views.map((v) => {
    const f = finish && possibleFinishes(v.category).includes(finish) ? finish : null;
    return { ...v, finish: f ? { kind: f, serial: 1, of: OF[f] } : null, acquired: null, pointsForYou: null, stamps: 0 };
  });
}

/** A club's best players by market value. */
export async function clubTopPlayers(clubCode: string, take = 3) {
  const club = await db.club.findUnique({ where: { code: clubCode }, include: { league: true } });
  if (!club) return null;
  const players = await db.player.findMany({
    where: { clubId: club.id, active: true, templates: { some: { edition: "STANDARD", active: true } } },
    orderBy: [{ marketValueGbp: { sort: "desc", nulls: "last" } }, { displayName: "asc" }],
    take,
    select: { id: true, displayName: true, templates: { where: { edition: "STANDARD", active: true }, select: { category: true } } },
  });
  return { club, players: players.map((p) => ({ id: p.id, name: p.displayName, category: p.templates[0]?.category ?? "BRONZE" })) };
}

export async function clubsForPicker() {
  return db.club.findMany({ orderBy: [{ league: { tier: "asc" } }, { name: "asc" }], select: { code: true, name: true, league: { select: { name: true } } } });
}

/** This week's top performers as cards (for the 'Top performers' poster). */
export async function weeklyTopCards(take = 5) {
  const rows = (await performanceTable({ window: "last" })).slice(0, take);
  const cards = await posterCards(rows.map((r) => r.playerId));
  return rows.map((r) => ({ row: r, card: cards.find((c) => c.playerId === r.playerId) ?? null }));
}

/** Live or next drop for the 'Drop alert' poster. */
export async function featuredDrop() {
  const board = await dropBoard();
  return board.live[0] ?? board.upcoming[0] ?? null;
}

/** Most recent Rainbow pull for the 'Rainbow pulled' poster. */
export async function latestRainbow() {
  const f = await db.cardFinish.findFirst({ where: { kind: "RAINBOW" }, orderBy: { createdAt: "desc" }, include: { card: { include: { ...CARD_INCLUDE, owner: { select: { displayName: true, clubName: true } } } } } });
  if (!f) return null;
  const [view] = await enrichCards([f.card]);
  return { card: { ...view, acquired: null, pointsForYou: null }, manager: f.card.owner?.displayName ?? "A manager", clubName: f.card.owner?.clubName ?? null, at: f.createdAt };
}

/** Recent Ruby / Diamond / Rainbow pulls (for 'Found!' posts), newest first. */
export async function recentFinds(kind?: Finish, take = 20) {
  const rows = await db.cardFinish.findMany({
    where: kind ? { kind } : {},
    orderBy: { createdAt: "desc" },
    take,
    include: { card: { include: { ...CARD_INCLUDE, owner: { select: { displayName: true, clubName: true } } } } },
  });
  const views = await enrichCards(rows.map((r) => r.card));
  return rows.map((r, i) => ({
    id: r.id,
    kind: r.kind as Finish,
    at: r.createdAt,
    manager: r.card.owner?.displayName ?? "A manager",
    clubName: r.card.owner?.clubName ?? null,
    card: { ...views[i], acquired: null, pointsForYou: null, stamps: 0 },
  }));
}

/** Every player at a club (by squad number) — for the club Rainbow wall and the 'every player' set. */
export async function clubAllPlayers(clubCode: string) {
  const club = await db.club.findUnique({ where: { code: clubCode } });
  if (!club) return null;
  const players = await db.player.findMany({
    where: { clubId: club.id, active: true, templates: { some: { edition: "STANDARD", active: true } } },
    orderBy: [{ squadNumber: { sort: "asc", nulls: "last" } }, { displayName: "asc" }],
    select: { id: true, displayName: true },
  });
  return { club, players };
}

/** How many Rainbows have been found out of how many exist. */
export async function rainbowCount() {
  const [found, total] = await Promise.all([
    db.cardFinish.count({ where: { kind: "RAINBOW" } }),
    db.player.count({ where: { active: true, templates: { some: { edition: "STANDARD", active: true } } } }),
  ]);
  return { found, total };
}

export async function leaguesForPicker() {
  return db.league.findMany({ orderBy: { tier: "asc" }, select: { code: true, name: true } });
}

/** A small seeded shuffle, so the same seed always gives the same poster. */
function seeded<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const next = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A league's stars: the most valuable player at every club, in a mix of finishes. Gold players are
 * spread across Ruby, Diamond and Rainbow; anyone else can only be shown as their Rainbow.
 */
export async function leagueStars(leagueCode: string, seed = "1") {
  const league = await db.league.findUnique({ where: { code: leagueCode } });
  if (!league) return null;
  const clubs = await db.club.findMany({
    where: { leagueId: league.id },
    select: {
      players: {
        where: { active: true, templates: { some: { edition: "STANDARD", active: true } } },
        orderBy: [{ marketValueGbp: { sort: "desc", nulls: "last" } }, { displayName: "asc" }],
        take: 1,
        select: { id: true, marketValueGbp: true },
      },
    },
  });
  const stars = clubs.flatMap((c) => c.players).sort((a, b) => Number(b.marketValueGbp ?? 0) - Number(a.marketValueGbp ?? 0));
  const base = await posterCards(stars.map((s) => s.id));
  const golds = base.filter((c) => c.category === "GOLD");
  const pattern: Finish[] = ["RUBY", "DIAMOND", "RAINBOW"];
  const mix = seeded(golds.map((_, i) => pattern[i % 3]), `${leagueCode}:${seed}`);
  const finishFor = new Map(golds.map((c, i) => [c.playerId, mix[i]]));
  const cards = base.map((c) => {
    const f: Finish = finishFor.get(c.playerId) ?? "RAINBOW";
    return { ...c, finish: { kind: f, serial: 1, of: OF[f] } };
  });
  return { league, cards, golds: golds.length };
}

/** Pulls waiting for a "Found!" post decision, newest first. */
export async function socialQueue(take = 10) {
  const [rows, count] = await Promise.all([
    db.cardFinish.findMany({
      where: { socialStatus: null },
      orderBy: [{ kind: "desc" }, { createdAt: "desc" }],
      take,
      include: { player: { select: { displayName: true } }, card: { select: { owner: { select: { displayName: true } } } } },
    }),
    db.cardFinish.count({ where: { socialStatus: null } }),
  ]);
  return { count, items: rows.map((r) => ({ id: r.id, kind: r.kind as Finish, player: r.player.displayName, manager: r.card.owner?.displayName ?? "A manager", at: r.createdAt })) };
}

export async function markFind(id: string, status: "POSTED" | "SKIPPED") {
  await db.cardFinish.update({ where: { id }, data: { socialStatus: status, socialAt: new Date() } });
}
