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
